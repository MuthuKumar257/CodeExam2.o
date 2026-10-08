# CodeExam

CodeExam is a React and Node.js coding assessment platform. The React application
lives in [`frontend/`](./frontend), while the production API and Socket.IO server
lives in [`backend/`](./backend).

## Stack

- React and Vite frontend in [`frontend/`](./frontend)
- JavaScript, Express, and Socket.IO backend in [`backend/`](./backend)
- Supabase PostgreSQL when configured
- Monaco Editor for coding questions

## Local development

Configure the backend in [`backend/.env`](./backend/.env) (or deployment
environment variables) and set `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
and `SUPABASE_JWKS_URL` for a persistent deployment. Keep
`SUPABASE_SECRET_KEY` server-only; only the publishable key may be exposed to the
frontend.

```powershell
cd backend
npm install
npm start
```

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

The API listens on `http://localhost:5000`. The Vite development server proxies
`/api` and Socket.IO traffic to it, so the frontend communicates with the
backend API rather than using Supabase service-role credentials.

## API

All API responses use the shape:

```json
{ "success": true, "data": {} }
```

Errors use an appropriate HTTP status and include `success: false`, `message`,
and `errorCode`. Health is available at
`GET /api/health`. The active assessment WebSocket uses Socket.IO events
`AUTHENTICATE`, `HEARTBEAT`, `SESSION_SYNC`, `TIME_SYNC`, and
`SUBMISSION_STATUS`.

## Production notes

Set a strong, unique `JWT_SECRET` and configure Supabase before deployment.
Code execution is isolated by the backend code-runner service; do not expose
the development fallback storage mode to production traffic. Restrict CORS to
the deployed frontend origin in the deployment environment.

The production database is the existing Supabase project identified by
`SUPABASE_URL`. The backend verifies that connection before listening and does not
run migrations, seeds, resets, cleanup jobs, or table-creation scripts at startup.
Frontend builds and backend restarts only replace application processes; they do
not modify Supabase data. Apply reviewed, additive migrations manually using the
files in [`supabase/migrations/`](./supabase/migrations/), after confirming a
current Supabase backup and the target project.

The included [`docker-compose.yml`](./docker-compose.yml) intentionally does not
define a Postgres service or `DATABASE_URL`; it runs Redis only as an application
dependency and requires the existing Supabase credentials from the deployment
environment.
