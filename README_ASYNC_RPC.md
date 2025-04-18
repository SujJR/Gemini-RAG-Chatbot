# Gemini Chatbot with Async RPC

This project has been updated to use Async RPC for communication between the frontend and backend, replacing the previous REST API approach. This implementation uses FastAPI for the backend to provide asynchronous processing capabilities.

## Key Features

- **Async RPC**: Uses FastAPI to provide asynchronous, non-blocking API endpoints
- **Background Processing**: Document indexing happens in the background, letting users continue working while processing completes
- **Real-time Updates**: Status polling for long-running operations like document indexing
- **Concurrent Operations**: Database queries run in parallel for faster comparison

## Implementation Details

### Backend Changes

- Replaced Flask with FastAPI for better async support
- Added background tasks for document processing
- Implemented status tracking and polling for long-running operations
- Added concurrent database querying with asyncio

### Frontend Changes

- Added support for status polling
- Created a toggle to switch between REST and Async RPC modes
- Updated components to work with the new API

## Getting Started

1. Install dependencies for both backend and frontend:

```bash
# Install backend dependencies
cd backend
pip install -r requirements.txt

# Install frontend dependencies
cd ../frontend
npm install
```

2. Start the application:

```bash
# Use the start script to run both backend and frontend
./start.sh
```

Alternatively, you can run the backend and frontend separately:

```bash
# Run the FastAPI backend (from the backend directory)
python -m uvicorn app_fastapi:app --host 0.0.0.0 --port 5000 --reload

# Run the frontend (from the frontend directory)
npm run dev
```

3. Access the application at http://localhost:3000

## API Endpoints

- `/api/chat` - Send a chat message to Gemini
- `/api/upload` - Upload and process a document (async)
- `/api/upload/status/{upload_id}` - Get status of document processing
- `/api/rag` - Perform a RAG query on indexed documents
- `/api/available-dbs` - Get a list of available vector databases
- `/api/test` - Simple test endpoint

## Implementation Notes

### Asynchronous Document Processing

Document processing is split into two phases:
1. File upload and initial processing (synchronous)
2. Database indexing (asynchronous background task)

This approach provides several benefits:
- The user receives immediate feedback after upload
- Processing continues in the background without blocking the web server
- The frontend can poll for status updates
- The user can continue using the application while indexing completes

### Concurrent Database Querying

When comparing database performance, all database queries run concurrently using `asyncio.gather()`. This significantly improves response time when comparing multiple databases.

### Graceful Error Handling

Each vector database is initialized with proper error handling, allowing the application to continue running even if some database types are not available.

## Switching Between REST and Async RPC

The application supports both the original REST API implementation and the new Async RPC implementation. You can switch between them using the toggle button in the UI. 

<br>
<br>

## Screenshots for Async RPC Outcomes:
<br>
<br>
<img width="311" alt="Screenshot 2025-04-18 at 4 04 02 PM" src="https://github.com/user-attachments/assets/0efcb92c-cfef-479b-a769-78d213fcef76" />
<img width="776" alt="Screenshot 2025-04-18 at 4 03 21 PM" src="https://github.com/user-attachments/assets/ad82b0d2-44b7-4be0-9be6-f79e79453071" />
<img width="776" alt="Screenshot 2025-04-18 at 4 03 29 PM" src="https://github.com/user-attachments/assets/d81328e0-ed2e-4d0c-ac52-4410bea5d056" />
<img width="938" alt="Screenshot 2025-04-18 at 4 09 42 PM" src="https://github.com/user-attachments/assets/b3e85f0a-3124-4064-b569-f393769b5c87" />
<img width="938" alt="Screenshot 2025-04-18 at 4 16 29 PM" src="https://github.com/user-attachments/assets/5e90a28c-1980-4fe8-8f2f-7354579f876a" />


