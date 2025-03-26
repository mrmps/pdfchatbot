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
import time
import traceback
import asyncio
from concurrent.futures import ThreadPoolExecutor

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
    """Uploads, embeds, and inserts PDF chunks with optimized batching for large files."""
    print("Starting PDF upload process...")
    try:
        # First, read the raw body to avoid connection issues with large form data
        body = await request.body()
        content_type = request.headers.get("content-type", "")
        
        # Check if this is a multipart form
        if "multipart/form-data" in content_type:
            print("Processing multipart form data...")
            form_data = await request.form()
            user_id = form_data.get('userId')
            parsed_data_str = form_data.get('parsedData')
        else:
            # Handle JSON body as an alternative
            print("Processing JSON body...")
            body_json = await request.json()
            user_id = body_json.get('userId')
            parsed_data_str = body_json.get('parsedData')
            
        if not user_id or not parsed_data_str:
            print(f"Missing required data: userId={bool(user_id)}, parsedData={bool(parsed_data_str)}")
            raise HTTPException(status_code=422, detail="Missing userId or parsedData")

        print(f"Received data for user_id: {user_id}")
        print(f"parsedData length: {len(parsed_data_str)} characters")

        print("Parsing JSON data...")
        parsed_data = json.loads(parsed_data_str) if isinstance(parsed_data_str, str) else parsed_data_str
        documents = parsed_data.get('documents', [])
        print(f"Found {len(documents)} documents in parsed data")
        if not documents: 
            return {"message": "No documents provided."}

        # Get the current max ID to avoid duplicates
        try:
            max_id_result = table.query(query="select max(id) as max_id from pdf_chunks")
            next_id = 1
            if max_id_result is not None and len(max_id_result) > 0 and max_id_result[0].get('max_id') is not None:
                next_id = int(max_id_result[0]['max_id']) + 1
            print(f"Starting with ID: {next_id}")
        except Exception as e:
            print(f"Could not get max ID, using default: {e}")
            next_id = 1
            
        # Process each document separately
        total_chunks_processed = 0
        total_chunks_inserted = 0
        all_results = []
        
        for doc_index, document in enumerate(documents):
            try:
                doc_start_time = time.time()
                filename = document.get('filename', f"document_{doc_index}")
                chunks = document.get('chunks', [])
                
                print(f"Processing document {doc_index+1}/{len(documents)}: {filename} with {len(chunks)} chunks")
                
                if not chunks:
                    print(f"  No chunks in document {filename}, skipping")
                    all_results.append({
                        "success": False,
                        "pdf_name": filename,
                        "error": "No chunks provided"
                    })
                    continue
                
                # Generate a unique ID for this PDF
                pdf_id = str(uuid.uuid4())
                
                # 1. Prepare all texts and corresponding metadata
                print(f"  Preparing texts for document {doc_index+1}: {filename}")
                texts_to_embed = []
                metadata_list = []
                current_id = next_id
                
                for i, chunk_text in enumerate(chunks):
                    if chunk_text and chunk_text.strip():  
                        # Truncate very long chunks to prevent excessive data sizes
                        clean_text = chunk_text.strip()
                        if len(clean_text) > 10000:  # 10KB max per chunk
                            clean_text = clean_text[:10000] + "... [truncated]"
                            print(f"    Truncated chunk {i} (too long)")
                            
                        texts_to_embed.append(clean_text)
                        metadata_list.append({
                            "id": current_id,
                            "user_id": user_id,
                            "pdf_id": pdf_id,
                            "pdf_name": filename
                        })
                        current_id += 1
                
                if not texts_to_embed:
                    print(f"  No valid text chunks in document {filename}, skipping")
                    all_results.append({
                        "success": False,
                        "pdf_name": filename,
                        "error": "No valid text chunks could be extracted"
                    })
                    continue
                
                # 2. Generate embeddings in batches
                print(f"  Generating embeddings for {len(texts_to_embed)} chunks")
                embedding_start_time = time.time()
                all_embeddings = []
                
                # Process in batches with retry logic
                for i in range(0, len(texts_to_embed), OPENAI_BATCH_LIMIT):
                    batch_texts = texts_to_embed[i:min(i + OPENAI_BATCH_LIMIT, len(texts_to_embed))]
                    batch_num = i // OPENAI_BATCH_LIMIT + 1
                    total_batches = (len(texts_to_embed) + OPENAI_BATCH_LIMIT - 1) // OPENAI_BATCH_LIMIT
                    
                    print(f"    Embedding batch {batch_num}/{total_batches} ({len(batch_texts)} chunks)")
                    
                    # Add retry logic
                    max_retries = 3
                    retry_delay = 2  # seconds
                    batch_embeddings = None
                    
                    for attempt in range(max_retries):
                        try:
                            batch_embeddings = get_embeddings_batch(
                                batch_texts, dimensions=OPENAI_EMBEDDING_DIMENSIONS
                            )
                            break  # Success, exit retry loop
                        except Exception as e:
                            print(f"    Error on attempt {attempt+1}/{max_retries}: {e}")
                            if attempt < max_retries - 1:
                                wait_time = retry_delay * (2 ** attempt)
                                print(f"    Waiting {wait_time}s before retry...")
                                time.sleep(wait_time)
                            else:
                                print("    All retries failed, trying individual embeddings")
                                # Individual fallback mode
                                batch_embeddings = []
                                for j, text in enumerate(batch_texts):
                                    try:
                                        embedding = embed_single_text(text)
                                        batch_embeddings.append(embedding)
                                    except Exception as e2:
                                        print(f"      Failed to embed item {j+1}: {e2}")
                                        batch_embeddings.append([0.0] * OPENAI_EMBEDDING_DIMENSIONS)
                    
                    if batch_embeddings:
                        all_embeddings.extend(batch_embeddings)
                
                embedding_time = time.time() - embedding_start_time
                print(f"  Embedding completed in {embedding_time:.2f}s ({len(texts_to_embed) / embedding_time:.2f} chunks/sec)")
                
                # 3. Prepare data rows for insertion
                print(f"  Preparing rows for insertion")
                data_rows = []
                for i in range(min(len(texts_to_embed), len(all_embeddings))):
                    data_rows.append({
                        **metadata_list[i],
                        "chunk_text": texts_to_embed[i],
                        "embeddings": all_embeddings[i]
                    })
                
                # 4. Insert into KDB.AI in small batches
                if data_rows:
                    print(f"  Inserting {len(data_rows)} rows for document: {filename}")
                    
                    # Calculate optimal batch size
                    if data_rows:
                        # Serialize one row to estimate size
                        sample_row = data_rows[0]
                        serialized_sample = json.dumps(sample_row)
                        bytes_per_row = len(serialized_sample)
                        
                        # Calculate optimal batch size (aim for 5MB max per batch)
                        max_batch_bytes = 5 * 1024 * 1024  # 5MB
                        optimal_batch_size = max(1, min(KDBAI_INSERT_BATCH_SIZE, max_batch_bytes // bytes_per_row))
                        
                        print(f"    Estimated size per row: {bytes_per_row / 1024:.2f}KB")
                        print(f"    Using dynamic batch size: {optimal_batch_size} rows")
                    else:
                        optimal_batch_size = KDBAI_INSERT_BATCH_SIZE
                    
                    insertion_start_time = time.time()
                    successful_inserts = 0
                    
                    for i in range(0, len(data_rows), optimal_batch_size):
                        batch = data_rows[i:i + optimal_batch_size]
                        batch_num = i // optimal_batch_size + 1
                        total_batches = (len(data_rows) + optimal_batch_size - 1) // optimal_batch_size
                        
                        # Double-check batch size
                        batch_serialized = json.dumps(batch)
                        batch_size_mb = len(batch_serialized) / (1024 * 1024)
                        
                        print(f"    Inserting batch {batch_num}/{total_batches} with {len(batch)} rows ({batch_size_mb:.2f}MB)")
                        
                        # If batch is still too large, reduce further
                        if batch_size_mb > 8:  # Safety margin below 10MB
                            print(f"    Batch too large ({batch_size_mb:.2f}MB), reducing further...")
                            
                            # Insert one by one as last resort
                            for single_row in batch:
                                try:
                                    table.insert([single_row])  # Must be a list
                                    successful_inserts += 1
                                except Exception as e:
                                    print(f"      Failed to insert row: {e}")
                        else:
                            # Insert normal sized batch with retry
                            max_retries = 3
                            for attempt in range(max_retries):
                                try:
                                    table.insert(batch)
                                    successful_inserts += len(batch)
                                    break  # Success, exit retry loop
                                except Exception as e:
                                    print(f"    Error inserting batch {batch_num} (attempt {attempt+1}/{max_retries}): {e}")
                                    if "maximum serialized size" in str(e).lower():
                                        print("    Batch too large, switching to individual row insertion")
                                        
                                        # Try inserting one by one
                                        sub_successful = 0
                                        for single_row in batch:
                                            try:
                                                table.insert([single_row])  # Must be a list
                                                sub_successful += 1
                                            except Exception as sub_e:
                                                print(f"      Failed to insert row: {sub_e}")
                                        
                                        successful_inserts += sub_successful
                                        print(f"      Successfully inserted {sub_successful}/{len(batch)} individual rows")
                                        break  # Exit retry loop after individual processing
                                    
                                    elif attempt < max_retries - 1:
                                        wait_time = retry_delay * (2 ** attempt)
                                        print(f"    Waiting {wait_time}s before retry...")
                                        time.sleep(wait_time)
                                    else:
                                        print(f"    Failed to insert batch {batch_num} after {max_retries} attempts")
                    
                    insertion_time = time.time() - insertion_start_time
                    doc_total_time = time.time() - doc_start_time
                    
                    print(f"  Document {doc_index+1}/{len(documents)} completed:")
                    print(f"    Total time: {doc_total_time:.2f}s")
                    print(f"    Embedding time: {embedding_time:.2f}s")
                    print(f"    Insertion time: {insertion_time:.2f}s")
                    print(f"    Chunks inserted: {successful_inserts}/{len(data_rows)}")
                    
                    # Update next_id for the next document
                    next_id = current_id
                    
                    # Update counters
                    total_chunks_processed += len(texts_to_embed)
                    total_chunks_inserted += successful_inserts
                    
                    # Add success result
                    all_results.append({
                        "success": successful_inserts > 0,
                        "pdf_id": pdf_id,
                        "pdf_name": filename,
                        "chunks_processed": len(texts_to_embed),
                        "chunks_inserted": successful_inserts,
                        "processing_time": {
                            "total_seconds": round(doc_total_time, 2),
                            "embedding_seconds": round(embedding_time, 2),
                            "insertion_seconds": round(insertion_time, 2)
                        }
                    })
            
            except Exception as doc_error:
                print(f"Error processing document {doc_index+1}: {str(doc_error)}")
                all_results.append({
                    "success": False,
                    "pdf_name": document.get('filename', f"document_{doc_index}"),
                    "error": str(doc_error)
                })
        
        # 5. Return the combined results
        success = any(result['success'] for result in all_results)
        
        return {
            "success": success,
            "documents_processed": len(all_results),
            "total_chunks_processed": total_chunks_processed,
            "total_chunks_inserted": total_chunks_inserted,
            "results": all_results
        }

    except json.JSONDecodeError as e:
        print(f"JSON decode error: {e}")
        raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")
    except Exception as e:
        print(f"Upload Error: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

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