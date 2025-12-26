# Todolo Backend

Node.js + Express + MongoDB backend for Todolo chat app.

Features:
- User signup/signin with JWT
- List all users
- Message request system (send/accept/reject)
- Persistent messages for accepted chats and self-chat

Setup:
1. Copy `.env.example` to `.env` and set `MONGO_URL`, `PORT`, and `JWT_SECRET`.
2. Install dependencies:

```bash
npm install
```

3. Run in dev:

```bash
npm run dev
```

API endpoints are under `/api/*` as described in the project requirements.
