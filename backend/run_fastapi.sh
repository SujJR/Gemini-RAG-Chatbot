#!/bin/bash
# Run the FastAPI server
python -m uvicorn app_fastapi:app --host 0.0.0.0 --port 5000 --reload 