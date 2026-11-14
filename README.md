# Swadesi

Monorepo: Java Spring Boot backend + React (Vite + TypeScript) frontend.

| Part | Where | Stack |
|---|---|---|
| Backend API | `backend/` | Spring Boot 3.4, Java 21, Maven, Flyway, Supabase Postgres |
| Frontend | `frontend/` | Vite + React + TypeScript |
| Infra notes | `deploy/aws/` | Supabase DB + AWS EC2 free tier (ap-south-1) |

## Run locally

Backend (uses local Postgres defaults, or export `SPRING_DATASOURCE_*` for Supabase):

```bash
cd backend
JAVA_HOME=/opt/homebrew/opt/openjdk mvn spring-boot:run
# health: http://localhost:8080/actuator/health
# public ping: http://localhost:8080/api/public/ping
```

Tests: `JAVA_HOME=/opt/homebrew/opt/openjdk mvn test` (in-memory H2, no DB needed).

Frontend:

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```
