# CLAUDE.md — Project Context

## What this is

**Swadesi** — a new application (product definition coming; the owner will explain the
features). Single repo holding both backend and frontend, modeled on the Chhaon project
(`~/chhaon/Chhaon-app`) and the Smart Gurukul infra.

## Layout & stack

| Part | Where | Stack |
|---|---|---|
| Backend API | `backend/` | Spring Boot 3.4, Java 21, Maven; package `org.smartgurukul.swadesi` |
| Frontend | `frontend/` | Vite + React + TypeScript (web view, like Chhaon's `web/`) |
| DB | Supabase Postgres | Flyway owns the schema (`backend/src/main/resources/db/migration`), `ddl-auto=validate` |
| Hosting | AWS EC2 free/small tier, ap-south-1 | systemd + nginx; see `deploy/aws/INFRA.md` |

## Conventions (carried over from Chhaon)

- Secrets only via env vars / `/etc/swadesi/backend.env`; never committed. `.env*` is gitignored.
- Hibernate never writes DDL; every schema change is a new Flyway migration `V<n>__<name>.sql`.
- Security is deny-by-default: only `/actuator/health`, `/actuator/info` and `/api/public/**`
  are open (see `SecurityConfig`). JWT auth to be wired when the product is defined.
- Tests run on in-memory H2 (Postgres mode), no local DB needed:
  `cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk mvn test`
- On this Mac, `java` is not on PATH — always prefix Maven with
  `JAVA_HOME=/opt/homebrew/opt/openjdk`.

## Status

Scaffold only: backend boots with a public ping + health endpoint and a placeholder
V1 migration; frontend is the stock Vite template. Supabase project EXISTS (ref
`zdbuvvcuaqcukqrkcppn`); credentials live in `backend/.env.local` (gitignored) — load with
`set -a; source backend/.env.local; set +a`. Flyway V1 has been applied to it. Note: the
direct `db.*.supabase.co` host is IPv6-only; from IPv4-only networks (e.g. EC2 free tier)
use the session pooler URL instead (`aws-0-ap-south-1.pooler.supabase.com`, user
`postgres.zdbuvvcuaqcukqrkcppn`).

AWS is LIVE: account `084375553369` (laptop profile `swadesi`), region ap-south-1, instance
`i-05becbc2e9f0e97c1`, Elastic IP `15.207.151.132`, deploy bucket
`swadesi-deploys-084375553369`. Backend deployed and healthy at
`http://15.207.151.132/actuator/health`. Full table in `deploy/aws/INFRA.md`. Deploys go
through `deploy/aws/send-ssm-deploy.sh` (S3 + SSM swap with rollback); GitHub Actions
workflows exist but repo secrets are not yet set. Product requirements not yet written.
