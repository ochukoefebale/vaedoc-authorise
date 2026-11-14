"""Exercise the actual Next.js proxy and FastAPI together using disposable local data."""

import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
import httpx
from authorise.database import Base, engine, session_factory
from authorise.models import Workspace, User
from authorise.security import passwords

web = "http://127.0.0.1:4199"
api = "http://127.0.0.1:8199"
with tempfile.TemporaryDirectory(prefix="authorise-proxy-") as temp:
    os.environ.update(
        ENVIRONMENT="test",
        APP_URL=web,
        DATABASE_URL="sqlite:///" + str(Path(temp) / "proxy.db"),
    )
    engine.cache_clear()
    Base.metadata.create_all(engine())
    with session_factory()() as db:
        db.add(Workspace(id="proxy-hospital", name="Proxy Test Hospital"))
        db.flush()
        db.add(
            User(
                id="proxy-admin",
                workspace_id="proxy-hospital",
                email="proxy@example.com",
                name="Proxy Test Admin",
                role="admin",
                active=True,
                password_hash=passwords.hash("Disposable proxy test password!"),
            )
        )
        db.commit()
    env = {
        **os.environ,
        "API_BASE_URL": api,
        "NEXT_TELEMETRY_DISABLED": "1",
        "NEXT_DIST_DIR": ".next-proxy-test",
    }
    log = open(Path(temp) / "process.log", "w+")
    processes = []
    originals = {
        p: p.read_text() if p.exists() else None
        for p in [ROOT / "frontend/tsconfig.json", ROOT / "frontend/next-env.d.ts"]
    }
    try:
        processes.append(
            subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "uvicorn",
                    "authorise.main:app",
                    "--app-dir",
                    str(ROOT / "backend"),
                    "--port",
                    "8199",
                ],
                cwd=ROOT,
                env=env,
                stdout=log,
                stderr=log,
            )
        )
        processes.append(
            subprocess.Popen(
                [
                    "node",
                    "node_modules/next/dist/bin/next",
                    "dev",
                    "--hostname",
                    "127.0.0.1",
                    "--port",
                    "4199",
                ],
                cwd=ROOT / "frontend",
                env=env,
                stdout=log,
                stderr=log,
            )
        )
        with httpx.Client(base_url=web, trust_env=False, timeout=20) as c:
            deadline = time.monotonic() + 60
            while True:
                try:
                    if c.get("/api/health").status_code == 200:
                        break
                except httpx.HTTPError:
                    pass
                if time.monotonic() > deadline:
                    raise RuntimeError(
                        "Local integration services did not become ready."
                    )
                time.sleep(0.3)
            assert c.get("/api/requests").status_code == 401
            login = c.post(
                "/api/auth/login",
                json={
                    "email": "proxy@example.com",
                    "password": "Disposable proxy test password!",
                },
                headers={"Origin": web},
            )
            assert login.status_code == 200, login.text
            assert "httponly" in login.headers["set-cookie"].lower()
            assert (
                c.get("/api/auth/me").json()["user"]["workspace"]
                == "Proxy Test Hospital"
            )
            headers = {"Origin": web, "X-CSRF-Token": login.json()["csrf_token"]}
            assert (
                c.post(
                    "/api/requests", json={"kind": "seed"}, headers=headers
                ).status_code
                == 200
            )
            assert len(c.get("/api/requests").json()["requests"]) == 7
            invitation = c.post(
                "/api/staff/invitations",
                json={"email": "invited@example.com", "role": "viewer"},
                headers=headers,
            )
            assert invitation.status_code == 200, invitation.text
            assert "#token=" in invitation.json()["url"]
            assert (
                c.post(
                    "/api/requests",
                    json={"kind": "seed"},
                    headers={
                        "Origin": "https://wrong.example",
                        "X-CSRF-Token": headers["X-CSRF-Token"],
                    },
                ).status_code
                == 403
            )
            assert (
                c.post("/api/auth/logout", json={}, headers=headers).status_code == 200
            )
            assert c.get("/api/auth/me").status_code == 401
        print(
            "PASS: Next.js → FastAPI proxy, cookie forwarding, staff login, CSRF, database requests, invitation generation and logout."
        )
    except Exception:
        log.flush()
        log.seek(0)
        print(log.read()[-6000:])
        raise
    finally:
        for p in processes:
            p.terminate()
        for p in processes:
            try:
                p.wait(timeout=8)
            except subprocess.TimeoutExpired:
                p.kill()
                p.wait()
        for path, content in originals.items():
            if content is not None:
                path.write_text(content)
        log.close()
        engine().dispose()
        engine.cache_clear()
