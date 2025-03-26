from fastapi import FastAPI, UploadFile, File, HTTPException, Form, Request, Query
from fastapi.middleware.cors import CORSMiddleware
import os
import kdbai_client as kdbai
from langchain_text_splitters import RecursiveCharacterTextSplitter
import pandas as pd
import time
from fastapi import FastAPI, UploadFile, File, HTTPException
import pandas as pd
import time
from contextlib import asynccontextmanager
import openai
from dotenv import load_dotenv
import os
import tempfile
import uuid
import PyPDF2  # Using PyPDF2 instead of PyMuPDF

# Load environment variables from .env file
load_dotenv()

# Move the lifespan function definition before the app initialization
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan event handler to initialize the KDB.AI table."""
    global table
    try:
        table = database.table(KDBAI_TABLE_NAME)
        print(f"Table '{KDBAI_TABLE_NAME}' already exists")
    except kdbai.KDBAIException:
        print(f"Table '{KDBAI_TABLE_NAME}' does not exist, creating it now.")
        schema = [
            {"name": "id", "type": "int32"},
            {"name": "user_id", "type": "str"},
            {"name": "pdf_id", "type": "str"},
            {"name": "pdf_name", "type": "str"},
            {"name": "chunk_text", "type": "str"},
            {"name": "embeddings", "type": "float64s"}
        ]
        indexes = [
            {
                "name": "vectorIndex",
                "type": "flat",
                "params": {"dims": 1536, "metric": "L2"},
                "column": "embeddings"
            }
        ]
        table = database.create_table(KDBAI_TABLE_NAME, schema=schema, indexes=indexes)
        print(f"Table '{KDBAI_TABLE_NAME}' created successfully")
    yield
    # Cleanup code (if any) goes here

# Then initialize the app
app = FastAPI(docs_url="/api/py/docs", openapi_url="/api/py/openapi.json", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://pdfchatbot.vercel.app"],  # Your Next.js frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# KDB.AI and OpenAI credentials (use environment variables or prompt if not set)
KDBAI_ENDPOINT = os.environ.get("KDBAI_ENDPOINT")
if not KDBAI_ENDPOINT:
    raise HTTPException(status_code=500, detail="KDBAI_ENDPOINT not set")

KDBAI_API_KEY = os.environ.get("KDBAI_API_KEY")
if not KDBAI_API_KEY:
    raise HTTPException(status_code=500, detail="KDBAI_API_KEY not set")

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
if not OPENAI_API_KEY:
    raise HTTPException(status_code=500, detail="OPENAI_API_KEY not set")

# Set OpenAI API key
openai.api_key = OPENAI_API_KEY

# Initialize KDB.AI session and database
session = kdbai.Session(endpoint=KDBAI_ENDPOINT, api_key=KDBAI_API_KEY)
database = session.database("default")
table = None
KDBAI_TABLE_NAME = "pdf_chunks"

# Root endpoint to confirm API is working
@app.get("/api/py")
def read_root():
    return {"status": "ok", "message": "PDF Chat API is running"}

def get_embeddings(texts, model="text-embedding-3-small"):
    """Get embeddings for a list of texts using OpenAI API directly."""
    if not texts:
        return []
    
    response = openai.embeddings.create(
        input=texts,
        model=model
    )
    
    # Extract embeddings from response
    embeddings = [item.embedding for item in response.data]
    return embeddings

def embed_single_text(text, model="text-embedding-3-small"):
    """Get embedding for a single text using OpenAI API directly."""
    response = openai.embeddings.create(
        input=[text],
        model=model
    )
    return response.data[0].embedding

def split_text_content(content: str, chunk_size: int = 2200, chunk_overlap: int = 200) -> list[str]:
    """Split text into chunks using RecursiveCharacterTextSplitter."""
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        separators=["\n\n", "\n", " "]
    )
    return text_splitter.split_text(content)

# Endpoints
@app.post("/api/py/create_table")
def create_table():
    """Create the KDB.AI table (drops existing table if it exists)."""
    global table
    try:
        database.table(KDBAI_TABLE_NAME).drop()
        print(f"Existing table '{KDBAI_TABLE_NAME}' dropped")
    except kdbai.KDBAIException:
        pass

    schema = [
        {"name": "id", "type": "int32"},
        {"name": "user_id", "type": "str"},
        {"name": "pdf_id", "type": "str"},
        {"name": "pdf_name", "type": "str"},
        {"name": "chunk_text", "type": "str"},
        {"name": "embeddings", "type": "float64s"}
    ]
    indexes = [
        {
            "name": "vectorIndex",
            "type": "flat",
            "params": {"dims": 1536, "metric": "L2"},
            "column": "embeddings"
        }
    ]
    table = database.create_table(KDBAI_TABLE_NAME, schema=schema, indexes=indexes)
    return {"message": f"Table '{KDBAI_TABLE_NAME}' created successfully"}

@app.post("/api/py/upload_pdf")
async def upload_pdf(files: list[UploadFile] = File(...), user_id: str = Form(...)):
    """Upload multiple PDF files, parse them using PyPDF2, and store chunks in KDB.AI."""
    results = []
    
    for file in files:
        try:
            # Create a temporary file to save the uploaded PDF
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as temp_file:
                temp_file_path = temp_file.name
                # Write the uploaded file content to the temporary file
                content = await file.read()
                temp_file.write(content)
            
            print(f"Processing file: {file.filename}")
            
            # Generate a unique ID for this PDF
            pdf_id = str(uuid.uuid4())
            
            try:
                # Parse the PDF using PyPDF2
                text_content = ""
                page_texts = []
                
                # Open the PDF with PyPDF2
                with open(temp_file_path, 'rb') as pdf_file:
                    pdf_reader = PyPDF2.PdfReader(pdf_file)
                    
                    # Extract text from each page
                    for page_num in range(len(pdf_reader.pages)):
                        page = pdf_reader.pages[page_num]
                        page_text = page.extract_text()
                        if page_text and page_text.strip():
                            page_texts.append((page_num + 1, page_text))
                            text_content += f"--- Page {page_num + 1} ---\n{page_text}\n\n"
                
                # If text content is empty, raise an exception
                if not text_content.strip():
                    raise ValueError("No text content could be extracted from the PDF")
                
                # Get the next available ID
                try:
                    max_id_result = table.query("select max(id) as max_id from pdf_chunks")
                    next_id = 1
                    if max_id_result is not None and not max_id_result.empty and not pd.isna(max_id_result["max_id"].iloc[0]):
                        next_id = int(max_id_result["max_id"].iloc[0]) + 1
                except Exception as e:
                    print(f"Error getting max ID: {str(e)}")
                    next_id = 1
                
                # Process each page and create chunks
                data_list = []
                chunk_id = 0
                
                for page_num, page_text in page_texts:
                    # Split the page text into chunks
                    page_chunks = split_text_content(page_text)
                    
                    # Process each chunk
                    for chunk in page_chunks:
                        if chunk.strip():  # Skip empty chunks
                            # Get embedding for this chunk
                            chunk_embedding = embed_single_text(chunk)
                            
                            # Add to data list
                            data_list.append({
                                "id": next_id + chunk_id,
                                "user_id": user_id,
                                "pdf_id": pdf_id,
                                "pdf_name": file.filename,
                                "chunk_text": chunk,
                                "embeddings": chunk_embedding
                            })
                            chunk_id += 1
                
                # Create a DataFrame for batch insertion
                if data_list:
                    data = pd.DataFrame(data_list)
                    # Insert the data into KDB.AI
                    table.insert(data)
                    print(f"Inserted {len(data_list)} chunks for {file.filename}")
                    
                    results.append({
                        "success": True,
                        "pdf_id": pdf_id,
                        "pdf_name": file.filename,
                        "chunks": len(data_list)
                    })
                else:
                    # Handle case where no chunks were created
                    results.append({
                        "success": False,
                        "pdf_name": file.filename,
                        "error": "No valid text chunks could be extracted from the PDF"
                    })
                
            except Exception as e:
                print(f"Error while parsing the file '{temp_file_path}': {str(e)}")
                # Return a more informative error message
                results.append({
                    "success": False,
                    "pdf_name": file.filename,
                    "error": f"Failed to process PDF: {str(e)}"
                })
                
            finally:
                # Clean up the temporary file
                try:
                    os.unlink(temp_file_path)
                except Exception as e:
                    print(f"Error removing temporary file: {str(e)}")
                    
        except Exception as e:
            print(f"Upload error for {file.filename}: {str(e)}")
            results.append({
                "success": False,
                "pdf_name": file.filename,
                "error": f"Error uploading PDF: {str(e)}"
            })
    
    # Check if any files were processed successfully
    if any(result["success"] for result in results):
        return {
            "success": True,
            "results": results
        }
    else:
        return {
            "success": False,
            "results": results,
            "error": "Failed to process all PDFs"
        }

@app.get("/api/py/search")
async def search(user_id: str, query: str, pdf_id: list[str] = Query(None), search_mode: str = "unified", limit: int = 5):
    """
    Search across user's PDFs with flexible search modes.
    
    search_mode options:
    - "unified": One search across all specified PDFs (or all user PDFs if none specified)
    - "individual": Separate searches for each PDF, returning top results from each
    """
    try:
        # Print debug information
        print(f"Search request: user_id={user_id}, query={query}, pdf_id={pdf_id}, search_mode={search_mode}, limit={limit}")
        
        if not user_id or not query:
            raise HTTPException(status_code=422, detail="Missing required parameters: user_id and query")
        
        # Generate query embedding using OpenAI API directly
        query_embedding = embed_single_text(query)
        
        # Handle different search modes
        if search_mode == "individual" and pdf_id:
            # Individual searches for each PDF
            all_results = []
            pdf_ids = pdf_id if isinstance(pdf_id, list) else [pdf_id]
            
            for pid in pdf_ids:
                filter_list = [["=", "user_id", user_id], ["=", "pdf_id", pid]]
                print(f"Individual search with filter: {filter_list}")
                
                # Perform similarity search for this PDF ID
                results = table.search(
                    vectors={"vectorIndex": [query_embedding]},
                    n=limit,
                    filter=filter_list
                )
                
                # Process results for this PDF ID
                if results and len(results) > 0 and not results[0].empty:
                    pdf_results = [
                        {
                            "pdf_id": row["pdf_id"],
                            "pdf_name": row["pdf_name"],
                            "chunk_text": row["chunk_text"],
                            "chunk_index": row.get("chunk_index", 0),  # Include chunk index if available
                            "distance": row["__nn_distance"]
                        }
                        for _, row in results[0].iterrows()
                    ]
                    all_results.extend(pdf_results)
            
            # Sort combined results by distance (relevance)
            all_results.sort(key=lambda x: x["distance"])
            
            # Limit the total number of results
            all_results = all_results[:limit]
            
            return {"results": all_results}
        
        else:  # Unified search (default)
            # Construct filter for all specified PDFs or all user PDFs
            filter_list = [["=", "user_id", user_id]]
            if pdf_id:
                if isinstance(pdf_id, list) and len(pdf_id) > 1:
                    pdf_filter = ["or"]
                    for pid in pdf_id:
                        pdf_filter.append(["=", "pdf_id", pid])
                    filter_list.append(pdf_filter)
                elif isinstance(pdf_id, list):
                    filter_list.append(["=", "pdf_id", pdf_id[0]])
                else:
                    filter_list.append(["=", "pdf_id", pdf_id])
            
            print(f"Unified search with filter: {filter_list}")
            
            # Perform unified search
            results = table.search(
                vectors={"vectorIndex": [query_embedding]},
                n=limit,
                filter=filter_list
            )
            
            # Process results
            if results and len(results) > 0 and not results[0].empty:
                response = [
                    {
                        "pdf_id": row["pdf_id"],
                        "pdf_name": row["pdf_name"],
                        "chunk_text": row["chunk_text"],
                        "chunk_index": row.get("chunk_index", 0),  # Include chunk index if available
                        "distance": row["__nn_distance"]
                    }
                    for _, row in results[0].iterrows()
                ]
                return {"results": response}
            
            return {"results": []}
            
    except Exception as e:
        print(f"Search error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error during search: {str(e)}")
    
@app.get("/api/py/list_pdf_names")
def list_pdf_names(user_id: str):
    """List all unique PDF names and IDs uploaded by a specific user."""
    try:
        # Query all rows for the user
        results = table.query(filter=[["=", "user_id", user_id]])
        
        # Check if results exist and extract unique PDF names and IDs
        if results is not None and not results.empty:
            pdf_data = results[["pdf_id", "pdf_name"]].drop_duplicates().to_dict('records')
            return {"pdfs": pdf_data}
        
        return {"pdfs": []}
    except Exception as e:
        print(f"Error listing PDF names: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error listing PDF names: {str(e)}")

@app.get("/api/py/get_chunks_by_pdf_ids")
def get_chunks_by_pdf_ids(
    pdf_ids: list[str] = Query(None, description="List of PDF IDs to retrieve chunks for"),
    limit: int = 10000
):
    """Get all chunks for a list of PDF IDs"""
    try:     
        if not pdf_ids:
            print("No PDF IDs provided, returning empty result")
            return {"chunks": []}
        
        # Construct a proper filter for the PDF IDs - KDB.AI expects each filter to be a list
        if len(pdf_ids) == 1:
            # If there's only one PDF ID, use a simple equality filter as a list
            filter_list = [["=", "pdf_id", pdf_ids[0]]]
        else:
            # For multiple PDF IDs, use multiple equality filters with OR
            or_filter = ["or"]
            for pdf_id in pdf_ids:
                or_filter.append(["=", "pdf_id", pdf_id])
            filter_list = [or_filter]
        
        print(f"Query filter: {filter_list}")
        
        # Query chunks
        results = table.query(
            filter=filter_list,
            limit=limit
        )
        
        print(f"Query returned {len(results) if results is not None and not results.empty else 0} results")
        
        # Check if results exist
        if results is None or results.empty:
            return {"chunks": []}
        
        # Convert results to a list of dictionaries
        chunks = []
        for _, row in results.iterrows():
            chunks.append({
                "id": int(row["id"]),
                "pdf_id": str(row["pdf_id"]),
                "pdf_name": str(row["pdf_name"]),
                "chunk_text": str(row["chunk_text"])
            })
        
        return {"chunks": chunks}
    except Exception as e:
        print(f"Error retrieving chunks: {str(e)}")
        # Include the traceback for better debugging
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error retrieving chunks: {str(e)}")

# Run the app (for local development)
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, loop="asyncio")  # Use standard asyncio instead of uvloop