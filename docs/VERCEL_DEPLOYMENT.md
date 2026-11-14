# Deploy Vaedoc Authorise to Vercel

Target frontend: `https://authorise.vaedoc.com`. Deploy **two Vercel projects from the same GitHub repository**, using `frontend` and `backend` as their respective root directories. Your self-hosted FastAPI server is not involved.

## 1. Database choice

**Selected for this deployment: Neon PostgreSQL Free.** Provision a dedicated `vaedoc-authorise` database/project. Select the Free plan explicitly; do not enable a paid upgrade or paid add-ons. Connect it only to the FastAPI backend project. Keep production and development/preview data separate; do not attach the production database to all environments by default.

Preferred setup: use Vercel Marketplace's Neon integration once the Vercel account and backend project are linked. Verify the provisioned environment variable names: the Python backend requires `DATABASE_URL`. The value should be Neon's pooled PostgreSQL URL. `postgresql://` is accepted and normalised to the installed psycopg driver, so an integration-issued URL does not need manual credential editing. Keep any direct connection URL available only to trusted migration administration if required.

After provisioned environment keys are verified, run the existing migration command against this new database, create the initial administrator, and test authenticated request persistence. Until those steps pass, database setup is pending rather than complete. No MySQL migration or copy of existing Vaedoc data is required.

**Your existing MySQL database is suitable** if it is reachable from Vercel, supports TLS with a valid certificate, and has sufficient connection capacity. Prefer a dedicated `vaedoc_authorise` database and restricted runtime account. Keep unrelated Vaedoc databases inaccessible to this account. Do not open MySQL unrestricted to the internet just to make connectivity work. Coordinate network access with your hosting provider; Vercel outbound networking requirements depend on its configuration.

**Free alternative: Neon PostgreSQL.** Its current pricing page lists a free tier; check the current limits at https://neon.com/pricing before provisioning. Use the provided pooled PostgreSQL connection endpoint and keep backend/database regions close. Choose a paid/appropriate service level and data arrangements when piloting with real patient information. Free storage does not make hosting, AI or email free.

The backend supports both dialects through DATABASE_URL. No change to frontend code is needed. It uses SQLAlchemy NullPool, closes each request's connection, and enforces verified TLS for production connections. Serverless concurrency can still exhaust database connection limits; configure provider pooling or conservative backend concurrency and monitor it.

Examples (URL-encode reserved characters in usernames/passwords):

```text
mysql+pymysql://USER:PASSWORD@HOST:3306/vaedoc_authorise
postgresql+psycopg://USER:PASSWORD@POOLED_HOST/DBNAME
```

For an organisation-specific CA, configure `DB_CA_CERT_PEM`. MySQL and PostgreSQL production TLS verification uses trusted CA certificates. If using a private PostgreSQL CA, set the appropriate PostgreSQL connection CA configuration in the database adapter before deployment; the current PostgreSQL adapter uses the public certifi bundle.

Never put these values in Git or a NEXT_PUBLIC_ environment variable.

## 2. Migrate and create your first administrator

Before serving traffic, use a trusted terminal with network access to the selected database. Install `backend/requirements.txt` in a virtual environment. Set:

```text
ENVIRONMENT=production
APP_URL=https://authorise.vaedoc.com
DATABASE_URL=<your database connection URL>
DB_REQUIRE_TLS=true
```

Then run from the repository root:

```bash
.venv/bin/python backend/manage.py migrate
.venv/bin/python backend/manage.py create-admin --email YOUR_EMAIL --name 'Your Name' --workspace 'Your Hospital'
```

The command prompts for the password privately. There is no default administrator password or public bootstrap endpoint. Migration credentials need schema-change permission; application credentials should be restricted to the application's tables. Run migrations deliberately once per release; do not automatically run them against production from every preview build. Never run downgrade casually against a live database.

For staff password recovery, an authorised operator can use `backend/manage.py reset-password --email STAFF_EMAIL`. The new password is prompted privately, existing sessions are revoked, and an audit entry is created. Self-service recovery and MFA are follow-on work.

## 3. Deploy the API project

In Vercel, import `ochukoefebale/vaedoc-authorise`:

| Setting | Value |
|---|---|
| Project name | `vaedoc-authorise-api` (suggested) |
| Root directory | `backend` |
| Framework | FastAPI |
| Python | Compatible with `backend/pyproject.toml`; tested on 3.12 |
| Environment | ENVIRONMENT, APP_URL, DATABASE_URL, optional DB_CA_CERT_PEM |

`backend/main.py` exports the FastAPI app. Keep its assigned Vercel URL after deployment. Check `/api/health`; it reports application status, not database readiness. A successful signed-in request after migration establishes database readiness.

Use the production database only for the production environment. Previews should use a separate database/branch and their own exact APP_URL, or remain unconfigured. Production APP_URL rejects login from an unrelated preview origin by design.

If your API project has Vercel Deployment Protection, its server-to-server calls need an appropriate provider-issued automation bypass secret. Configure that secret in the frontend's `API_PROTECTION_BYPASS_SECRET`; it is server-only and is not a replacement for application authentication. Consult your account's deployment protection settings. Do not put the value in browser code.

## 4. Deploy the frontend project

Import the same repository a second time:

| Setting | Value |
|---|---|
| Project name | `vaedoc-authorise-web` (suggested) |
| Root directory | `frontend` |
| Framework | Next.js |
| Install | `npm ci` |
| Build | `npm run build` |
| API_BASE_URL | API project's HTTPS origin, without `/api` |

The frontend's `/api/*` handlers forward requests to the fixed backend origin, forward authentication cookies and CSRF headers, and relay Set-Cookie headers. Browsers do not need to know the backend's URL. Production requires HTTPS to the backend. Do not add permissive CORS as a substitute for configuring this proxy correctly.

Attach `authorise.vaedoc.com` to the frontend project. **Use the exact DNS record Vercel returns for that project/domain.** Do not guess a CNAME target. Once DNS and TLS are verified, visit the domain and sign in with the administrator account created in step 2. An automatically assigned frontend vercel.app URL will not pass the production origin check unless you deliberately set APP_URL to that exact origin for initial testing.

## 5. Invite staff

Open Staff accounts → enter the intended recipient email → choose officer or viewer → generate invitation. The application does not send email; copy and share the one-time link with that recipient through your authorised channel. It expires after 48 hours. Generating another link for the same email revokes earlier unused links. The recipient uses their invited email and creates a password of at least 12 characters. Public signup is unavailable.

Use synthetic data initially. Staff in the same workspace share requests. Viewer accounts cannot create, submit, verify or invite. Staff deactivation immediately revokes existing sessions. First-administrator creation is an offline operation.

## 6. Check before calling the deployment complete

- Custom domain has valid HTTPS and matches APP_URL.
- API health responds, login succeeds, and a staff session survives refresh.
- Synthetic requests persist across sessions and appear to staff in the same hospital.
- One-time invitation succeeds, reuse fails, and revoked links cannot create accounts.
- Viewer mutations are blocked by the backend, not just hidden in the interface.
- A mixed decision preserves each service's outcome.
- A failed simulated callback can be retried without changing its event ID.
- Logs, Git history and browser bundles contain no connection strings or credentials.
- Preview deployments cannot connect to the production database inadvertently.

## 7. Costs and remaining production integrations

Vercel's published Hobby rules restrict that plan to non-commercial personal use. This is a Vaedoc product, so select an eligible commercial plan and review pricing before deployment; no paid plan is purchased by this source preparation.

This release remains a synthetic-data demonstration. Hosting it independently does not enable live insurer email, live AI, attachments or external EMR calls. Those need implementation, provider accounts, durable work handling and separate live-use validation. Do not rely on in-process background tasks for durable email sends or callbacks. A later queue/scheduled job design must be selected for Vercel's execution model.

## Official references

Verified 14 November 2026:

- FastAPI on Vercel: https://vercel.com/docs/frameworks/backend/fastapi
- Monorepo projects: https://vercel.com/docs/monorepos
- Domain configuration: https://vercel.com/docs/domains/working-with-domains/add-a-domain
- Commercial use rules: https://vercel.com/docs/limits/fair-use-guidelines
- Neon pricing: https://neon.com/pricing
