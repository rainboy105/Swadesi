# Swadesi infra (mirrors the Chhaon / Smart Gurukul setup)

## Live resources (provisioned 2026-11-14)

| Resource | Value |
|---|---|
| AWS account | `084375553369` (laptop profile `swadesi`) — NOT region-locked |
| Region | `ap-south-1` (Mumbai, same as the Supabase project) |
| EC2 instance | `i-05becbc2e9f0e97c1` (t3.small, Amazon Linux 2023, 16 GB gp3) |
| Elastic IP | `15.207.151.132` — stable across stop/start |
| S3 deploy bucket | `swadesi-deploys-084375553369` (jar key `swadesi-backend.jar`) |
| Instance role | `swadesi-ec2-role` (SSM + s3:GetObject on the bucket) |
| Security group | `sg-0c438245b9f513bd6` (inbound 80, 443 only; no SSH — use SSM) |
| CI user | `swadesi-ci` (s3:PutObject + ssm:SendCommand) — key goes in GitHub `AWS_*` secrets |
| DB connection | Supabase session pooler `aws-0-ap-south-1.pooler.supabase.com:5432`, user `postgres.zdbuvvcuaqcukqrkcppn` (box is IPv4-only) |

Backend is **live**: `http://15.207.151.132/actuator/health` → `{"status":"UP"}`.


- **Database / Auth / Storage:** Supabase (Postgres), Mumbai region preferred. The backend
  connects over JDBC using the session pooler (IPv4) connection string. Flyway in
  `backend/src/main/resources/db/migration` owns the schema; Hibernate only validates.
- **Server:** one AWS EC2 instance, free/small tier, `ap-south-1`. Spring Boot runs as a
  systemd service (`swadesi-backend.service`) behind nginx (TLS via certbot).
- **Frontend:** `frontend/` is a Vite + React static build; host `dist/` on a static host
  (S3+CloudFront, or the same nginx box) and point it at the API.
- **Secrets:** only in `/etc/swadesi/backend.env` on the box (see `backend.env.example`),
  never in the repo.

## One-time account provisioning

With an admin profile configured (`aws configure --profile swadesi`):

```bash
AWS_PROFILE_NAME=swadesi AWS_REGION=<region> bash deploy/aws/launch-account.sh
```

This creates the S3 deploy bucket, instance role (SSM + bucket read), security group
(80/443, no SSH — access is via SSM), a t3.small with Elastic IP, and a scoped `swadesi-ci`
user whose key goes into GitHub secrets. Then run `provision-server.sh` on the box via SSM,
set the GitHub secrets it prints, and pushes to `main` touching `backend/**` auto-deploy
(`.github/workflows/backend-deploy.yml`: build → S3 → SSM swap → health-check → rollback).

**Important:** the EC2 box is IPv4-only; use the Supabase **session pooler** connection
string in `SPRING_DATASOURCE_URL`, not the direct `db.*.supabase.co` host (IPv6-only).

## Deploy (manual, until CI is set up)

```bash
cd backend
JAVA_HOME=/opt/homebrew/opt/openjdk mvn -q package -DskipTests
scp target/swadesi-backend.jar <ec2>:/opt/swadesi/swadesi-backend.jar
ssh <ec2> sudo systemctl restart swadesi-backend
curl -fsS https://<api-domain>/actuator/health
```

For the full reference setup (provisioning script, nginx config, SSM-based deploy from S3,
GitHub Actions workflows), see `~/chhaon/Chhaon-app/api-java/deploy/aws/` and
`~/chhaon/Chhaon-app/.github/workflows/` — copy and rename once the server exists.
