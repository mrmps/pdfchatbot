from fastapi import FastAPI,HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
import os
import kdbai_client as kdbai
import pandas as pd
from fastapi import FastAPI, HTTPException
import pandas as pd
from contextlib import asynccontextmanager
import openai
from dotenv import load_dotenv
import os
import uuid
import json
import time

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
    allow_origins=["http://localhost:3000", "https://chatpdfkdbai.vercel.app/"],  # Your Next.js frontend URL
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

def batch_embed_texts(texts, batch_size=100, model="text-embedding-3-small"):
    """Process a large list of texts in batches for more efficient embedding."""
    all_embeddings = []
    
    # Process in batches
    for i in range(0, len(texts), batch_size):
        batch = texts[i:min(i + batch_size, len(texts))]
        try:
            batch_embeddings = get_embeddings(batch, model)
            all_embeddings.extend(batch_embeddings)
            print(f"Embedded batch {i//batch_size + 1}/{(len(texts) + batch_size - 1)//batch_size} ({len(batch)} chunks)")
        except Exception as e:
            print(f"Error embedding batch {i//batch_size + 1}: {str(e)}")
            # If batch fails, try one by one as fallback
            for text in batch:
                try:
                    embedding = embed_single_text(text, model)
                    all_embeddings.append(embedding)
                except Exception as e:
                    print(f"Error embedding text: {str(e)}")
                    # Add a zero vector as placeholder to maintain alignment
                    all_embeddings.append([0.0] * 1536)
    
    return all_embeddings

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
async def upload_pdf(request: Request):
    """Upload pre-parsed PDF chunks from the frontend and store them in KDB.AI."""
    try:
        # Parse the form data
        try:
            form_data = await request.form()
            user_id = form_data.get('userId')
            parsed_data_str = form_data.get('parsedData')
            
            if not user_id:
                user_id = form_data.get('user_id')  # Fallback to alternative name
                
            if not user_id:
                raise HTTPException(status_code=422, detail="Missing required parameter: userId")
            
            if not parsed_data_str:
                raise HTTPException(status_code=422, detail="Missing required parameter: parsedData")
        except Exception as e:
            print(f"Error parsing form data: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Invalid form data: {str(e)}")
        
        # Parse the JSON string with parsed data
        try:
            parsed_data = json.loads(parsed_data_str)
            documents = parsed_data.get('documents', [])
        except json.JSONDecodeError as e:
            print(f"JSON decode error: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Invalid JSON in parsedData: {str(e)}")
        
        if not documents:
            raise HTTPException(status_code=400, detail="No document chunks provided")
        
        results = []
        
        # Get the next available ID
        try:
            max_id_query = "select max(id) as max_id from pdf_chunks"
            max_id_result = table.query(max_id_query)
            next_id = 1
            if max_id_result is not None and not max_id_result.empty and not pd.isna(max_id_result["max_id"].iloc[0]):
                next_id = int(max_id_result["max_id"].iloc[0]) + 1
            print(f"Starting with ID: {next_id}")
        except Exception as e:
            print(f"Error getting max ID: {str(e)}")
            next_id = 1
        
        # Collect all chunks from all documents first
        all_texts = []
        document_info = []
        chunk_counter = 0
        
        # First pass: collect all valid chunks and document info
        for doc_index, document in enumerate(documents):
            filename = document.get('filename', f"document_{doc_index}")
            chunks = document.get('chunks', [])
            
            if not chunks:
                results.append({
                    "success": False,
                    "pdf_name": filename,
                    "error": "No chunks provided"
                })
                continue
            
            # Generate a unique ID for this PDF
            pdf_id = str(uuid.uuid4())
            
            valid_chunks = []
            for chunk_text in chunks:
                if chunk_text and chunk_text.strip():  # Skip empty chunks
                    all_texts.append(chunk_text)
                    valid_chunks.append(chunk_text)
            
            # Store document info for later reference
            document_info.append({
                "pdf_id": pdf_id,
                "pdf_name": filename,
                "chunks": valid_chunks,
                "start_index": chunk_counter
            })
            
            chunk_counter += len(valid_chunks)
            
            if valid_chunks:
                print(f"Collected {len(valid_chunks)} valid chunks from {filename}")
            else:
                results.append({
                    "success": False,
                    "pdf_name": filename,
                    "error": "No valid text chunks could be extracted"
                })
        
        total_chunks = len(all_texts)
        if total_chunks == 0:
            return {
                "success": False,
                "error": "No valid chunks found in any document"
            }
        
        print(f"Beginning batch embedding of {total_chunks} total chunks")
        
        # Second pass: batch embed all texts
        start_time = time.time()
        all_embeddings = batch_embed_texts(all_texts, batch_size=100)
        embedding_time = time.time() - start_time
        print(f"Embedding completed in {embedding_time:.2f} seconds ({total_chunks / embedding_time:.2f} chunks/sec)")
        
        # Third pass: create data frames and insert into database
        all_data_rows = []
        insertion_time = 0  # Define with default value to avoid reference errors
        
        for doc in document_info:
            pdf_id = doc["pdf_id"]
            filename = doc["pdf_name"]
            chunks = doc["chunks"]
            start_index = doc["start_index"]
            
            if not chunks:
                continue
                
            # Prepare all rows for this document
            for i, chunk_text in enumerate(chunks):
                embedding_index = start_index + i
                if embedding_index < len(all_embeddings):
                    embedding = all_embeddings[embedding_index]
                    all_data_rows.append({
                        "id": next_id + embedding_index,
                        "user_id": user_id,
                        "pdf_id": pdf_id,
                        "pdf_name": filename,
                        "chunk_text": chunk_text,
                        "embeddings": embedding
                    })
            
            # Add success result
            results.append({
                "success": True,
                "pdf_id": pdf_id,
                "pdf_name": filename,
                "chunks": len(chunks)
            })
        
        # Create a single DataFrame with all data
        if all_data_rows:
            print(f"Preparing to insert {len(all_data_rows)} rows into database")
            all_data_df = pd.DataFrame(all_data_rows)
            
            # Use larger batch size for more efficient inserts
            batch_size = 1000
            
            # Insert in batches
            start_time = time.time()
            for i in range(0, len(all_data_rows), batch_size):
                batch = all_data_df.iloc[i:i+batch_size]
                table.insert(batch)
                print(f"Inserted batch {i//batch_size + 1}/{(len(all_data_rows) + batch_size - 1)//batch_size}, rows {i} to {min(i+batch_size-1, len(all_data_rows)-1)}")
            
            insertion_time = time.time() - start_time
            print(f"Database insertion completed in {insertion_time:.2f} seconds ({len(all_data_rows) / insertion_time:.2f} rows/sec)")
        
        print(f"Total chunks inserted: {len(all_data_rows)}")
        
        # Check if any files were processed successfully
        if any(result["success"] for result in results):
            return {
                "success": True,
                "results": results,
                "total_chunks": len(all_data_rows),
                "processing_time": {
                    "embedding_seconds": round(embedding_time, 2),
                    "insertion_seconds": round(insertion_time, 2)
                }
            }
        else:
            raise HTTPException(
                status_code=500, 
                detail={
                    "success": False,
                    "results": results,
                    "error": "Failed to process all PDFs"
                }
            )
    except HTTPException:
        raise
    except Exception as e:
        print(f"Upload error: {str(e)}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500, 
            detail=f"Error processing PDFs: {str(e)}"
        )

@app.get("/api/py/search")
async def search(user_id: str, query: str, pdf_id: list[str] = Query(None), search_mode: str = "unified", limit: int = 20):
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