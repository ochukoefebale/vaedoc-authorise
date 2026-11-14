# Vaedoc Authorise

A hospital managed care authorisation workspace. This independently deployable release uses a standard **Next.js frontend** and **FastAPI backend**, supports **MySQL and PostgreSQL**, and implements **invitation-only staff accounts**.

The clinical workflow is a supervised demonstration: synthetic records, source-based request templates, simulated insurer replies, item-level staff verification and simulated EMR callback acknowledgement/retry. Live AI, external email and EMR integration remain outside this release. Do not enter real patient information yet.

## Deployment

See [the Vercel deployment guide](docs/VERCEL_DEPLOYMENT.md). Deploy two Vercel projects from this repository:

| Project | Root directory | Framework |
|---|---|---|
| `vaedoc-authorise-api` | `backend` | FastAPI |
| `vaedoc-authorise-web` | `frontend` | Next.js |

Attach `authorise.vaedoc.com` to the frontend. A same-origin server-side proxy forwards `/api/*` to the backend. This requires no beta multi-service setting and does not use your self-hosted FastAPI server.

## Staff access

There is no public signup and no built-in default password. The first administrator is created using `backend/manage.py create-admin`. Administrators generate 48-hour, one-time, email-bound invitation links for officers or viewers. Links are shown once for manual sharing; the app sends no invitations automatically. Deactivating staff revokes their sessions. Each account belongs to one hospital workspace; staff in that hospital share its request queue.

Passwords use Argon2. Session tokens are stored as hashes; production cookies use Secure, HttpOnly and SameSite=Lax. Mutations require a matching origin and CSRF token. Login throttling is database-backed across serverless instances. Administrative and workflow actions create audit entries. These controls are a starting point, not a production clinical security certification.

## Local development

Use Python 3.12+ and Node 22+ (tested with Python 3.12 and Node 24).

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.lock
export ENVIRONMENT=development
export APP_URL=http://localhost:3000
export DATABASE_URL=sqlite:////absolute/path/to/local.db
.venv/bin/python backend/manage.py migrate
.venv/bin/python backend/manage.py create-admin --email you@example.com --name 'Your Name' --workspace 'Your Hospital'
.venv/bin/uvicorn authorise.main:app --app-dir backend --port 8011
```

In a second terminal:

```bash
cd frontend
npm ci
API_BASE_URL=http://localhost:8011 npm run dev
```

Use localhost consistently: the browser origin must exactly match APP_URL. SQLite is local/test-only and rejected when ENVIRONMENT=production. Do not place production credentials in development environments. Environment example files contain names and placeholders only.

## Verification

```bash
.venv/bin/pytest backend/tests -q
cd frontend
npm run typecheck
npm run build
```

An additional same-origin frontend-to-backend HTTP integration check is available in `scripts/check_proxy.py`; it starts isolated temporary local processes and data. It does not test browser layout.

The SQLAlchemy schema has been tested locally using SQLite and compiled for MySQL/PostgreSQL. A remote database connection and a hosted Vercel deployment must still be tested after credentials and account access are configured.

## Implemented workflow

- Manual synthetic request intake and a JSON EMR sandbox.
- Hospital-specific request queue, search, filters and exports.
- Encounter deduplication with immutable intake fingerprints.
- Source-based drafting, editing and explicit staff submission review.
- Simulated approvals, mixed decisions, clarification queries and denials.
- Per-service codes, approved quantities, reasons and conditions.
- Verified decision versions and simulated delivery failure/retry.
- Optimistic locking, request history with staff actor identity and separate audit records.

## Production follow-on

Add a privacy/security review, MFA, real email and AI adapters, evaluated reply extraction, attachments and retention rules, signed external EMR endpoints, durable background job execution, provider reconciliation and operational alerting before handling patient data. Do not use in-process FastAPI BackgroundTasks as the sole durable mechanism for clinical authorisation submissions.
