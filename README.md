This a PoC of a RAG chatbot using Gemini.

Please add your Gemini API key, weaviate API key, Postgres host, user, db_name and password, Mongo use, password and cluster name, and Milvis URL, User and password in the .env file in the backend folder.

To run the frontend:
```
cd frontend
npm install
npm run dev
```

To run backend:
```
cd ../backend
python -m venv venv
source venv/bin/activate (On windows, use: venv\scripts\activate)
pip install -r requirements.txt
python app.py
```

<br />
<br />
Here are some of the screenshots of the outcome.

<br />
<br />

<img width="1465" alt="Screenshot 2025-04-04 at 5 45 52 AM" src="https://github.com/user-attachments/assets/0a1a7dac-bc3f-4211-a94e-9ece6b08616e" />
<img width="1465" alt="Screenshot 2025-04-04 at 5 13 43 AM" src="https://github.com/user-attachments/assets/d4bfd93b-ed6a-4fbc-a24d-b1683ff6d851" />
<img width="206" alt="Screenshot 2025-04-04 at 5 11 50 AM" src="https://github.com/user-attachments/assets/663c7c77-1f1e-4bd2-9008-dc454ccfcd1a" />
<img width="206" alt="Screenshot 2025-04-04 at 5 11 38 AM" src="https://github.com/user-attachments/assets/579010f0-526e-4301-9e31-3b7b73e0dc59" />

