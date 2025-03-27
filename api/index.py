from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional, Any, Dict
import os
import kdbai_client as kdbai
from fastapi import FastAPI, HTTPException
from contextlib import asynccontextmanager
import openai
from dotenv import load_dotenv
import os
import uuid
import json
import traceback
from concurrent.futures import ThreadPoolExecutor
import pandas as pd
import shortuuid

# Load environment variables from .env file
load_dotenv()

EMBEDDING_BATCH_SIZE = 2048  # Based on OpenAI's maximum supported batch size
INSERT_BATCH_SIZE = 500  # Much smaller batch size to stay under KDB.AI's 10MB limit

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

# Initialize the app with extended request limits
app = FastAPI(
    docs_url="/api/py/docs", 
    openapi_url="/api/py/openapi.json", 
    lifespan=lifespan,
    # Increase timeouts for handling large embedding requests
    timeout=300.0,  # 5-minute timeout for request handling
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://chatpdfkdbai.vercel.app", "*"],  # Allow any origin in dev
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
OPENAI_EMBEDDING_MODEL = "text-embedding-3-small"
OPENAI_EMBEDDING_DIMENSIONS = 1536  # Or 512, 256 for efficiency
OPENAI_BATCH_LIMIT = 2048
KDBAI_INSERT_BATCH_SIZE = 100  # Reduced batch size for KDB.AI inserts

def embed_single_text(text: str, model=OPENAI_EMBEDDING_MODEL, dimensions=OPENAI_EMBEDDING_DIMENSIONS) -> List[float]:
    """Get embedding for a single text."""
    try:
        response = openai.embeddings.create(input=[text], model=model, dimensions=dimensions)
        return response.data[0].embedding
    except Exception as e:
        print(f"Error embedding single text: {e}")
        raise # Re-raise for the caller to handle

def get_embeddings_batch(texts: List[str], model=OPENAI_EMBEDDING_MODEL, dimensions=OPENAI_EMBEDDING_DIMENSIONS) -> List[List[float]]:
    """Gets embeddings for a batch of texts (MUST be <= OPENAI_BATCH_LIMIT). Simple split-retry on error."""
    if not texts: return []
    if len(texts) > OPENAI_BATCH_LIMIT:
        raise ValueError(f"Batch size {len(texts)} exceeds OpenAI limit {OPENAI_BATCH_LIMIT}")
    try:
        response = openai.embeddings.create(input=texts, model=model, dimensions=dimensions)
        return [item.embedding for item in response.data]
    except Exception as e:
        print(f"Error embedding batch of {len(texts)}: {e}. Trying split-retry.")
        # Basic retry: if batch fails and size > 1, try splitting in half once.
        if len(texts) > 1:
            mid = len(texts) // 2
            try:
                # Recursive calls, but only one level deep due to the split logic
                first_half = get_embeddings_batch(texts[:mid], model, dimensions)
                second_half = get_embeddings_batch(texts[mid:], model, dimensions)
                return first_half + second_half
            except Exception as inner_e:
                print(f"Split-retry also failed: {inner_e}")
                raise inner_e # Raise error from the split attempt
        raise e 
    
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
    """Uploads, embeds, and inserts PDF chunks using Pandas."""
    try:
        # Add debug logging
        print("Starting PDF upload process...")
        content_type = request.headers.get("content-type", "")
        print(f"Content-Type: {content_type}")

        # Handle multipart form data
        if "multipart/form-data" in content_type:
            print("Processing multipart form data...")
            form = await request.form()
            
            # Extract data from form
            user_id = form.get("userId")
            parsed_data = form.get("parsedData")
            
            if not user_id:
                raise HTTPException(status_code=400, detail="Missing required field: userId")
            if not parsed_data:
                raise HTTPException(status_code=400, detail="Missing required field: parsedData")
            
            # Parse the parsedData string into JSON if needed
            if isinstance(parsed_data, str):
                try:
                    parsed_data = json.loads(parsed_data)
                except json.JSONDecodeError as je:
                    print(f"Error parsing parsedData JSON: {je}")
                    raise HTTPException(
                        status_code=400,
                        detail="Invalid JSON in parsedData field"
                    )
            
            data = {
                "userId": user_id,
                "parsedData": parsed_data
            }
        else:
            # Handle JSON data
            try:
                data = await request.json()
            except json.JSONDecodeError as je:
                body = await request.body()
                print(f"JSON parsing error: {je}")
                print(f"Raw body content: {body.decode()[:200]}...")
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid JSON format: {str(je)}"
                )

        # Extract required fields
        user_id = data.get('userId')
        parsed_data = data.get('parsedData')

        if not user_id:
            raise HTTPException(status_code=400, detail="Missing required field: userId")
        if not parsed_data:
            raise HTTPException(status_code=400, detail="Missing required field: parsedData")

        # Process the documents
        docs = parsed_data.get('documents', [])
        if not docs:
            return {"message": "No documents provided"}

        # Continue with the rest of your existing processing code...
        rows = []
        for doc in docs:
            pdf_id = str(uuid.uuid4())
            rows.extend([
                {
                    "chunk_text": c.strip(),
                    "user_id": user_id,
                    "pdf_id": pdf_id,
                    "pdf_name": doc.get('filename', 'unknown')
                }
                for c in doc.get('chunks', []) if c and c.strip()
            ])
        if not rows: return {"message": "No valid chunks found"} # 8. Handle no chunks

        df = pd.DataFrame(rows) # 9. Create Pandas DataFrame
        
        # 10. Generate embeddings for all chunks at once (assumes function handles batching)
        # Generate embeddings in batches of 2048
        import time
        embedding_start_time = time.time()
        
        batch_size = 2048
        all_embeddings = []
        
        for i in range(0, len(df), batch_size):
            batch_texts = df['chunk_text'].iloc[i:i+batch_size].tolist()
            print(f"Generating embeddings for batch {i//batch_size + 1}/{(len(df) + batch_size - 1)//batch_size} ({len(batch_texts)} texts)")
            
            response = openai.embeddings.create(
                input=batch_texts,
                model=OPENAI_EMBEDDING_MODEL,
                dimensions=OPENAI_EMBEDDING_DIMENSIONS
            )
            
            batch_embeddings = [item.embedding for item in response.data]
            all_embeddings.extend(batch_embeddings)
        
        embedding_end_time = time.time()
        embedding_duration = embedding_end_time - embedding_start_time
        print(f"Embedding completed in {embedding_duration:.2f} seconds")
        
        df['embeddings'] = all_embeddings
        # Add the required 'id' field using shortuuid
        df['id'] = [int(shortuuid.uuid()[:7], 36) for _ in range(len(df))]

        # Insert in batches of 500 rows
        insert_start_time = time.time()
        batch_size = 500
        for i in range(0, len(df), batch_size):
            batch_df = df.iloc[i:i+batch_size]
            table.insert(batch_df)
            print(f"Inserted batch {i//batch_size + 1}/{(len(df) + batch_size - 1)//batch_size} ({len(batch_df)} rows)")
        
        insert_end_time = time.time()
        insert_duration = insert_end_time - insert_start_time
        print(f"KDB.AI insertion completed in {insert_duration:.2f} seconds")
        
        total_duration = embedding_duration + insert_duration
        
        # 12. Return success response with timing information
        return {
            "success": True, 
            "chunks_inserted": len(df),
            "timing": {
                "embedding_seconds": round(embedding_duration, 2),
                "insertion_seconds": round(insert_duration, 2),
                "total_seconds": round(total_duration, 2)
            }
        }
    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid JSON: {str(e)}. Please check the request format."
        )
    except Exception as e:
        print(f"Upload Error: {str(e)}")
        print(f"Full traceback: {traceback.format_exc()}")
        raise HTTPException(
            status_code=500, 
            detail=f"Upload failed: {str(e)}"
        )

def _process_result_row(row: Any) -> Optional[Dict[str, Any]]:
    """
    Processes a single row from KDB.AI search results DataFrame.
    Returns a formatted dictionary (pdf_id, pdf_name, chunk_text, distance)
    or None if processing fails.
    """
    try:
        # Skip string inputs (column names)
        if isinstance(row, str):
            return None
            
        # For DataFrame rows (pandas Series objects)
        chunk_text = str(row["chunk_text"]) if "chunk_text" in row else ""
        if not chunk_text:
            return None
            
        return {
            "pdf_id": str(row["pdf_id"]) if "pdf_id" in row else "",
            "pdf_name": str(row["pdf_name"]) if "pdf_name" in row else "",
            "chunk_text": chunk_text,
            "chunk_index": int(row["chunk_index"]) if "chunk_index" in row else 0,
            "distance": float(row["__nn_distance"]) if "__nn_distance" in row else 0.0,
        }
    except Exception as e:
        print(f"Error processing row: {e}. Row type: {type(row)}")
        return None

def _process_search_results(results, pdf_id=None) -> List[Dict[str, Any]]:
    """
    Process search results from KDB.AI.
    Returns a list of formatted results or an empty list if results are invalid.
    """
    processed_results = []
    
    if results and results[0] is not None and not results[0].empty:
        df_results = results[0]  # Get the DataFrame
        
        # Log info based on whether this is for a specific PDF or all PDFs
        if pdf_id:
            print(f"  Processing DataFrame results for PDF {pdf_id}")
        else:
            print(f"Processing DataFrame with {len(df_results)} rows")
        
        # Process each row in the DataFrame
        for _, row in df_results.iterrows():
            processed = _process_result_row(row)
            if processed:
                processed_results.append(processed)
        
        # Log results count
        if pdf_id:
            print(f"  Found {len(processed_results)} valid results for PDF {pdf_id}")
    elif pdf_id:
        print(f"  No results or empty results for PDF {pdf_id}")
    
    return processed_results

@app.get("/api/py/search")
async def search(
    user_id: str,
    query: str,
    pdf_id: Optional[List[str]] = Query(None),
    search_mode: str = "unified",
    limit: int = 20
):
    """
    Search across user's PDFs with flexible search modes.

    Returns results including pdf_id, pdf_name, chunk_text, and distance.

    search_mode options:
    - "unified": One search across all specified PDFs (or all user PDFs if none specified)
    - "individual": Separate searches for each PDF, returning top results from each
    """
    print(f"Search request: user_id={user_id}, query='{query[:50]}...', pdf_id={pdf_id}, mode={search_mode}, limit={limit}")

    if not user_id or not query:
        raise HTTPException(status_code=422, detail="Missing required parameters: user_id and query")

    try:
        query_embedding = embed_single_text(query)
        vector_index_name = "vectorIndex"
        final_results = []

        # Normalize pdf_id to list format
        pdf_ids_list = pdf_id if isinstance(pdf_id, list) else [pdf_id] if pdf_id else []

        # CASE 1: Individual search mode - search each PDF separately, then combine
        if search_mode == "individual" and pdf_ids_list:
            # Calculate limit per PDF to ensure fair distribution
            limit_per_pdf = max(3, limit // len(pdf_ids_list))
            processed_results = []

            # Search each PDF individually
            for pid in pdf_ids_list:
                filter_list = [["=", "user_id", user_id], ["=", "pdf_id", pid]]
                print(f"Individual search for PDF {pid}...")
                
                results = table.search(
                    vectors={vector_index_name: [query_embedding]},
                    n=limit_per_pdf,
                    filter=filter_list
                )
                
                # Process results for this PDF
                pdf_results = _process_search_results(results, pdf_id=pid)
                processed_results.extend(pdf_results)

            # Sort by distance and limit results
            processed_results.sort(key=lambda x: x["distance"])
            final_results = processed_results[:limit]

        # CASE 2: Unified search mode
        else:
            # CASE 2a: Unified search with exactly one PDF ID
            if pdf_ids_list and len(pdf_ids_list) == 1:
                filter_list = [["=", "user_id", user_id], ["=", "pdf_id", pdf_ids_list[0]]]
                print(f"Unified search with single PDF filter: {filter_list}")
                
                results = table.search(
                    vectors={vector_index_name: [query_embedding]},
                    n=limit,
                    filter=filter_list
                )
                
                final_results = _process_search_results(results)
                
            # CASE 2b: Unified search with multiple PDF IDs
            elif pdf_ids_list and len(pdf_ids_list) > 1:
                print(f"Unified search across multiple PDFs ({len(pdf_ids_list)})")
                results_per_pdf = max(3, limit // len(pdf_ids_list))
                all_results = []
                
                # Search each PDF individually to avoid filter structure issues
                for pid in pdf_ids_list:
                    filter_list = [["=", "user_id", user_id], ["=", "pdf_id", pid]]
                    print(f"  Searching PDF {pid}...")
                    
                    results = table.search(
                        vectors={vector_index_name: [query_embedding]},
                        n=results_per_pdf,
                        filter=filter_list
                    )
                    
                    # Process results for this PDF
                    pdf_results = _process_search_results(results, pdf_id=pid)
                    all_results.extend(pdf_results)
                
                # Sort combined results by distance
                all_results.sort(key=lambda x: x["distance"])
                final_results = all_results[:limit]
                print(f"Combined {len(all_results)} results from multiple PDFs, returning top {len(final_results)}")
                
            # CASE 2c: Unified search across all PDFs
            else:
                filter_list = [["=", "user_id", user_id]]
                print(f"Unified search across all user PDFs: {filter_list}")
                
                results = table.search(
                    vectors={vector_index_name: [query_embedding]},
                    n=limit,
                    filter=filter_list
                )
                
                final_results = _process_search_results(results)
                print(f"Unified search yielded {len(final_results)} valid results.")

        return {"results": final_results}

    except HTTPException:
        raise
    except Exception as e:
        print(f"Search error: {str(e)}")
        traceback.print_exc()  # Print the full traceback for debugging
        detail_msg = f"Search error: {str(e)}"
        raise HTTPException(status_code=500, detail=detail_msg)
    
@app.get("/api/py/list_pdf_names")
def list_pdf_names(user_id: str):
    """List all unique PDF names and IDs uploaded by a specific user."""
    try:
        # Use named parameter 'filter' instead of positional argument
        results = table.query(filter=[["=", "user_id", user_id]])
        
        # Add debug information
        result_type = type(results).__name__
        print(f"Query returned result of type: {result_type}")
        if hasattr(results, 'shape'):
            print(f"DataFrame shape: {results.shape}")
        elif hasattr(results, '__len__'):
            print(f"Result length: {len(results)}")
        
        # Check if results exist and extract unique PDF names and IDs
        if results is not None:
            # Handle DataFrame case - use .empty to check if DataFrame is empty
            if hasattr(results, 'empty'):
                if not results.empty:
                    print(f"Processing DataFrame with {len(results)} rows")
                    # Create a dictionary to track unique PDF IDs
                    unique_pdfs = {}
                    # Iterate through DataFrame rows
                    for _, row in results.iterrows():
                        pdf_id = row["pdf_id"]
                        if pdf_id not in unique_pdfs:
                            unique_pdfs[pdf_id] = {
                                "pdf_id": pdf_id,
                                "pdf_name": row["pdf_name"]
                            }
                    
                    # Convert dictionary values to list
                    pdf_data = list(unique_pdfs.values())
                    return {"pdfs": pdf_data}
            else:
                # Handle list/dict case as before
                if len(results) > 0:
                    print(f"Processing list with {len(results)} items")
                    unique_pdfs = {}
                    for row in results:
                        pdf_id = row["pdf_id"]
                        if pdf_id not in unique_pdfs:
                            unique_pdfs[pdf_id] = {
                                "pdf_id": pdf_id,
                                "pdf_name": row["pdf_name"]
                            }
                    
                    pdf_data = list(unique_pdfs.values())
                    return {"pdfs": pdf_data}
        
        return {"pdfs": []}
    except Exception as e:
        print(f"Error listing PDF names: {str(e)}")
        # Print more detailed traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error listing PDF names: {str(e)}")

@app.get("/api/py/get_chunks_by_pdf_ids")
def get_chunks_by_pdf_ids(
    pdf_ids: list[str] = Query(None, description="List of PDF IDs to retrieve chunks for"),
    limit: int = 20000
):
    """Get all chunks for a list of PDF IDs"""
    try:     
        if not pdf_ids:
            print("No PDF IDs provided, returning empty result")
            return {"chunks": []}
        
        all_chunks = []
        # Process each PDF ID separately to avoid filter structure issues
        for pdf_id in pdf_ids:
            filter_list = [["=", "pdf_id", pdf_id]]
            print(f"Querying chunks for PDF ID: {pdf_id}")
            
            # Use named parameter 'filter' instead of positional argument
            results = table.query(filter=filter_list, limit=limit)
            
            # Handle DataFrame results
            if hasattr(results, 'empty') and not results.empty:
                # Convert DataFrame rows to dictionaries
                for index, row in results.iterrows():
                    all_chunks.append({
                        "id": int(row["id"]),
                        "pdf_id": str(row["pdf_id"]),
                        "pdf_name": str(row["pdf_name"]),
                        "chunk_text": str(row["chunk_text"])
                    })
                print(f"Added {len(results)} chunks from PDF ID {pdf_id}")
            elif not hasattr(results, 'empty') and results is not None and len(results) > 0:
                # Handle list/dict results (fallback)
                for row in results:
                    all_chunks.append({
                        "id": int(row["id"]),
                        "pdf_id": str(row["pdf_id"]),
                        "pdf_name": str(row["pdf_name"]),
                        "chunk_text": str(row["chunk_text"])
                    })
                print(f"Added {len(results)} chunks from PDF ID {pdf_id}")
            else:
                print(f"No chunks found for PDF ID {pdf_id}")
        
        print(f"Retrieved {len(all_chunks)} total chunks for {len(pdf_ids)} PDFs")
        return {"chunks": all_chunks}
    except Exception as e:
        print(f"Error retrieving chunks: {str(e)}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error retrieving chunks: {str(e)}")

# Add a ping endpoint to verify the backend is running
@app.get("/api/py/ping")
async def ping():
    """Simple endpoint to check if the API is running and its configuration."""
    return {
        "status": "ok",
        "message": "FastAPI backend is running",
        "embedding_model": OPENAI_EMBEDDING_MODEL,
        "embedding_dimensions": OPENAI_EMBEDDING_DIMENSIONS,
        "embedding_batch_size": EMBEDDING_BATCH_SIZE,
        "kdbai_insert_batch_size": KDBAI_INSERT_BATCH_SIZE,
        "max_file_size_supported": "30MB"
    }

# Run the app (for local development)
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, loop="asyncio")  # Use standard asyncio instead of uvloop