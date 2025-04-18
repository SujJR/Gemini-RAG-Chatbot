#!/bin/bash

# Start the FastAPI server in the background
echo "Starting FastAPI server..."
cd backend
source ./venv/bin/activate
python3 -m pip install -r requirements.txt
python -m uvicorn app_fastapi:app --host 0.0.0.0 --port 5000 --reload &
FASTAPI_PID=$!

# Wait a moment for the server to start
sleep 2

# Start the Next.js frontend
echo "Starting Next.js frontend..."
cd ../frontend
npm run dev

# When the frontend process is killed, also kill the FastAPI server
kill $FASTAPI_PID 