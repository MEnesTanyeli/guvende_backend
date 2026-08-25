# Environment Standard

This project follows `software-playbook-v1.3` environment rules.

## Permanent Environments

| Environment | Branch | API URL | Server Path | Compose File |
|---|---|---|---|---|
| Development | `develop` | `https://dev-api.guvende.app` | `/home/enes/apps/guvende_backend_dev` | `docker-compose.dev.yml` |
| Production | `main` | `https://api.guvende.app` | `/home/enes/apps/guvende_backend` | `docker-compose.prod.yml` |

## Rules

- Real `.env` files are never committed.
- Example files may be committed only as `.env*.example`.
- Development and production databases stay separate.
- Code can be merged from `develop` to `main`; environment files are not merged or copied between environments.
- New required environment variables must be added to `.env.dev.example`, `.env.production.example`, and deployment notes.
- `DATABASE_URL` is constructed inside the compose files from the environment-specific PostgreSQL values.
- `JWT_SECRET` must be at least 32 characters.

## Local Database

For the local PostgreSQL-only compose file:

```powershell
Copy-Item .env.local.example .env.local
docker compose --env-file .env.local up -d
```

Use local-only credentials. Do not reuse development or production credentials locally.

## Server Commands

```bash
docker compose --env-file .env.dev -f docker-compose.dev.yml up -d --build backend
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build backend
```
