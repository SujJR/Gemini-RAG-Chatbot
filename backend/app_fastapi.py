import os
import time
import uuid
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Union
from dotenv import load_dotenv
import google.generativeai as genai
import uvicorn
import asyncio

# RAG imports
from rag.document import extract_text_from_pdf, split_text
from rag.faiss_store import FAISSVectorStore
from rag.chroma_store import ChromaVectorStore
from rag.utils import save_uploaded_file, format_results
from langchain_google_genai import GoogleGenerativeAIEmbeddings

# Load environment variables
load_dotenv()

app = FastAPI(title="Gemini Chatbot API", description="Async RPC API for Gemini RAG Chatbot")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure the Gemini API
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# Initialize the model for chat
model = genai.GenerativeModel('gemini-1.5-flash')
chat_session = model.start_chat(history=[])

# Initialize embedding model with Gemini
embedding_model = GoogleGenerativeAIEmbeddings(
    model="models/embedding-001",
    google_api_key=os.getenv("GEMINI_API_KEY")
)

# Initialize vector stores
faiss_store = FAISSVectorStore(embedding_model)
chroma_store = ChromaVectorStore(embedding_model)

# Try to import and initialize other vector stores
try:
    from rag.weaviate_store import WeaviateVectorStore
    weaviate_store = WeaviateVectorStore(embedding_model)
    weaviate_available = True
    print("✅ Weaviate successfully initialized")
except ImportError as e:
    print(f"❌ Weaviate import failed: {e}")
    weaviate_available = False
    weaviate_store = None

try:
    from rag.mongo_store import MongoVectorStore
    mongo_store = MongoVectorStore(embedding_model)
    mongo_available = mongo_store.initialized
    print("✅ MongoDB successfully initialized" if mongo_available else "❌ MongoDB initialization failed")
except ImportError as e:
    print(f"❌ MongoDB import failed: {e}")
    mongo_available = False
    mongo_store = None

try:
    from rag.pgvector_store import PGVectorStore
    pgvector_store = PGVectorStore(embedding_model)
    pgvector_available = pgvector_store.initialized
    print("✅ pgvector successfully initialized" if pgvector_available else "❌ pgvector initialization failed")
except ImportError as e:
    print(f"❌ pgvector import failed: {e}")
    pgvector_available = False
    pgvector_store = None

try:
    from rag.milvus_store import MilvusVectorStore
    milvus_store = MilvusVectorStore(embedding_model)
    milvus_available = milvus_store.initialized
    print("✅ Milvus successfully initialized" if milvus_available else "❌ Milvus initialization failed")
except ImportError as e:
    print(f"❌ Milvus import failed: {e}")
    milvus_available = False
    milvus_store = None

# In-memory storage for upload status
# In a production app, this would be a database
upload_status = {}

# Define Pydantic models for request/response validation
class ChatRequest(BaseModel):
    message: str

class ChatResponse(BaseModel):
    success: bool
    response: Optional[str] = None
    error: Optional[str] = None

class RagRequest(BaseModel):
    query: str
    db_type: str = "faiss"
    compare_all: bool = False

class DocumentResult(BaseModel):
    content: str
    metadata: Dict[str, Any]

class DatabaseResult(BaseModel):
    name: str
    query_time: Optional[float] = None
    retrieved_docs: Optional[List[DocumentResult]] = None
    error: Optional[str] = None

class RagResponse(BaseModel):
    success: bool
    query: str
    db_type: str
    query_time: Optional[float] = None
    rag_response: Optional[str] = None
    retrieved_docs: Optional[List[DocumentResult]] = None
    message: Optional[str] = None
    compare_all: Optional[bool] = None
    results: Optional[Dict[str, DatabaseResult]] = None
    best_db: Optional[str] = None

class AvailableDBsResponse(BaseModel):
    success: bool
    available_databases: List[str]

# RPC Endpoints
@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Handle chat messages asynchronously"""
    if not request.message:
        return ChatResponse(success=False, error="No message provided")
    
    try:
        # Use asyncio to avoid blocking during the model call
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None, lambda: chat_session.send_message(request.message)
        )
        return ChatResponse(success=True, response=response.text)
    except Exception as e:
        print(f"Error in chat: {str(e)}")
        return ChatResponse(success=False, error=str(e))

@app.post("/api/upload")
async def upload(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
):
    """
    Handle document upload, process text, and index in all vector stores asynchronously.
    Returns performance metrics for each database.
    """
    if not file.filename:
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "No file selected"}
        )
        
    if not file.filename.lower().endswith('.pdf'):
        return JSONResponse(
            status_code=400,
            content={"success": False, "message": "Only PDF files are supported"}
        )
    
    try:
        # Save the uploaded file
        file_path = await save_uploaded_file_async(file)
        
        # Extract text from PDF
        text = await extract_text_from_pdf_async(file_path)
        
        if not text or len(text) < 10:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Could not extract text from the PDF file"}
            )
            
        # Split text into chunks
        document_chunks = split_text(text)
        
        if not document_chunks or len(document_chunks) == 0:
            return JSONResponse(
                status_code=400,
                content={"success": False, "message": "Failed to process document into chunks"}
            )
            
        # Initialize timing dictionary
        indexing_times = {
            "faiss": 0,
            "chroma": 0,
            "weaviate": -1,
            "mongo": -1,
            "pgvector": -1,
            "milvus": -1
        }
        
        # Generate a unique ID for this upload
        upload_id = str(uuid.uuid4())
        
        # Store initial upload status
        upload_status[upload_id] = {
            "success": True,
            "message": "Document processing started in background",
            "upload_id": upload_id,
            "indexing_complete": False,
            "document": {
                "filename": file.filename,
                "chunk_count": len(document_chunks),
                "indexing_times": indexing_times,
                "available_dbs": {
                    "faiss": True,
                    "chroma": True,
                    "weaviate": weaviate_available,
                    "mongo": mongo_available,
                    "pgvector": pgvector_available,
                    "milvus": milvus_available
                }
            }
        }
        
        # Background task to index documents in all stores
        background_tasks.add_task(
            index_documents_in_background,
            document_chunks,
            upload_id
        )
        
        # Return immediate success response with upload ID
        return JSONResponse(
            content=upload_status[upload_id]
        )
    
    except Exception as e:
        print(f"Error processing document: {str(e)}")
        return JSONResponse(
            status_code=500,
            content={"success": False, "message": f"Error: {str(e)}"}
        )

@app.get("/api/upload/status/{upload_id}")
async def get_upload_status(upload_id: str):
    """
    Get the status of an ongoing upload/indexing operation
    """
    if upload_id not in upload_status:
        raise HTTPException(status_code=404, detail="Upload ID not found")
    
    return JSONResponse(content=upload_status[upload_id])

@app.post("/api/rag", response_model=RagResponse)
async def rag_query(request: RagRequest):
    """
    Process a RAG query using the selected vector database or all databases for comparison
    """
    if not request.query:
        return RagResponse(success=False, query="", db_type="", message="No query provided")
    
    try:
        # If compare_all is True, query all available databases and return all results
        if request.compare_all:
            # Get list of available databases
            available_dbs = ["faiss", "chroma"]
            if weaviate_available:
                available_dbs.append("weaviate")
            if mongo_available:
                available_dbs.append("mongo")
            if pgvector_available:
                available_dbs.append("pgvector")
            if milvus_available:
                available_dbs.append("milvus")
            
            # Query each database concurrently using asyncio.gather
            tasks = []
            for db in available_dbs:
                tasks.append(query_database(db, request.query))
            
            db_results = await asyncio.gather(*tasks)
            
            # Process results into a dictionary
            results = {}
            for i, db in enumerate(available_dbs):
                query_time, retrieved_docs = db_results[i]
                results[db] = DatabaseResult(
                    name=db,
                    query_time=query_time,
                    retrieved_docs=retrieved_docs
                )
            
            # Find best (fastest) database
            best_db = min(
                [(db, results[db].query_time) for db in results if results[db].query_time is not None],
                key=lambda x: x[1],
                default=("none", None)
            )[0]
            
            # Generate RAG response using the best database's results
            rag_response = ""
            if best_db != "none" and results[best_db].retrieved_docs:
                context = " ".join([doc.content for doc in results[best_db].retrieved_docs])
                prompt = f"Based on the following information, please answer the query: {request.query}\n\nInformation:\n{context}"
                
                loop = asyncio.get_event_loop()
                response = await loop.run_in_executor(
                    None, lambda: model.generate_content(prompt)
                )
                rag_response = response.text
            
            return RagResponse(
                success=True,
                query=request.query,
                db_type="all",
                compare_all=True,
                results=results,
                best_db=best_db,
                rag_response=rag_response
            )
        
        # Otherwise, query just the selected database
        else:
            query_time, retrieved_docs = await query_database(request.db_type, request.query)
            
            if not retrieved_docs:
                return RagResponse(
                    success=True,
                    query=request.query,
                    db_type=request.db_type,
                    query_time=query_time,
                    rag_response="No relevant documents found.",
                    retrieved_docs=[]
                )
            
            # Generate RAG response using the retrieved documents
            context = " ".join([doc.content for doc in retrieved_docs])
            prompt = f"Based on the following information, please answer the query: {request.query}\n\nInformation:\n{context}"
            
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None, lambda: model.generate_content(prompt)
            )
            
            return RagResponse(
                success=True,
                query=request.query,
                db_type=request.db_type,
                query_time=query_time,
                rag_response=response.text,
                retrieved_docs=retrieved_docs
            )
    
    except Exception as e:
        print(f"Error in RAG query: {str(e)}")
        return RagResponse(
            success=False,
            query=request.query,
            db_type=request.db_type,
            message=f"Error: {str(e)}"
        )

@app.get("/api/available-dbs", response_model=AvailableDBsResponse)
async def available_dbs():
    """
    Returns a list of available vector databases
    """
    available = ["faiss", "chroma"]
    
    if weaviate_available:
        available.append("weaviate")
    if mongo_available:
        available.append("mongo")
    if pgvector_available:
        available.append("pgvector")
    if milvus_available:
        available.append("milvus")
    
    return AvailableDBsResponse(success=True, available_databases=available)

@app.get("/api/test")
async def test():
    """
    Simple endpoint to check if the API is running
    """
    return {"message": "API is running!"}

# Helper functions
async def save_uploaded_file_async(file: UploadFile) -> str:
    """Save an uploaded file asynchronously"""
    # Convert synchronous save_uploaded_file to async
    content = await file.read()
    # Create the uploads directory if it doesn't exist
    os.makedirs("uploads", exist_ok=True)
    file_path = f"uploads/{file.filename}"
    
    with open(file_path, "wb") as f:
        f.write(content)
    
    return file_path

async def extract_text_from_pdf_async(file_path: str) -> str:
    """Extract text from PDF asynchronously"""
    # Run CPU-bound task in a thread pool
    loop = asyncio.get_event_loop()
    text = await loop.run_in_executor(None, extract_text_from_pdf, file_path)
    return text

async def index_documents_in_background(document_chunks, upload_id):
    """Background task to index documents in all vector stores"""
    # Get the indexing_times dict from upload status
    indexing_times = upload_status[upload_id]["document"]["indexing_times"]
    
    # FAISS
    start_time = time.time()
    await asyncio.to_thread(faiss_store.add_documents, document_chunks)
    indexing_times["faiss"] = time.time() - start_time
    
    # ChromaDB
    start_time = time.time()
    await asyncio.to_thread(chroma_store.add_documents, document_chunks)
    indexing_times["chroma"] = time.time() - start_time
    
    # Weaviate (if available)
    if weaviate_available and weaviate_store:
        start_time = time.time()
        await asyncio.to_thread(weaviate_store.add_documents, document_chunks)
        indexing_times["weaviate"] = time.time() - start_time
    
    # MongoDB (if available)
    if mongo_available and mongo_store:
        try:
            start_time = time.time()
            await asyncio.to_thread(mongo_store.add_documents, document_chunks)
            indexing_times["mongo"] = time.time() - start_time
        except Exception as e:
            print(f"Error indexing in MongoDB: {str(e)}")
    
    # pgvector (if available)
    if pgvector_available and pgvector_store:
        try:
            start_time = time.time()
            await asyncio.to_thread(pgvector_store.add_documents, document_chunks)
            indexing_times["pgvector"] = time.time() - start_time
        except Exception as e:
            print(f"Error indexing in pgvector: {str(e)}")
    
    # Milvus (if available)
    if milvus_available and milvus_store:
        try:
            start_time = time.time()
            await asyncio.to_thread(milvus_store.add_documents, document_chunks)
            indexing_times["milvus"] = time.time() - start_time
        except Exception as e:
            print(f"Error indexing in Milvus: {str(e)}")
    
    # Mark indexing as complete
    upload_status[upload_id]["indexing_complete"] = True

async def query_database(db_type: str, query: str):
    """Query a specific database asynchronously"""
    try:
        if db_type == 'faiss':
            store = faiss_store
        elif db_type == 'chroma':
            store = chroma_store
        elif db_type == 'weaviate' and weaviate_available:
            store = weaviate_store
        elif db_type == 'mongo' and mongo_available:
            store = mongo_store
        elif db_type == 'pgvector' and pgvector_available:
            store = pgvector_store
        elif db_type == 'milvus' and milvus_available:
            store = milvus_store
        else:
            return 0, []
        
        # Run query in a thread pool
        loop = asyncio.get_event_loop()
        query_time, results = await loop.run_in_executor(None, store.query, query)
        
        # Convert results to Pydantic models
        document_results = [
            DocumentResult(content=doc.page_content, metadata=doc.metadata)
            for doc in results
        ]
        
        return query_time, document_results
    
    except Exception as e:
        print(f"Error querying {db_type}: {str(e)}")
        return 0, []

if __name__ == "__main__":
    uvicorn.run("app_fastapi:app", host="0.0.0.0", port=5000, reload=True) 