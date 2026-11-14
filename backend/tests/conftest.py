import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pytest
from fastapi.testclient import TestClient
from authorise.database import Base, engine, session_factory
from authorise.models import Workspace, User
from authorise.main import app
from authorise.security import passwords

PASSWORD = "Test password 12345!"


@pytest.fixture
def context(tmp_path, monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "test")
    monkeypatch.setenv("APP_URL", "http://testserver")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///" + str(tmp_path / "test.db"))
    engine.cache_clear()
    Base.metadata.create_all(engine())
    with session_factory()() as db:
        db.add_all(
            [
                Workspace(id="hospital-a", name="Hospital A"),
                Workspace(id="hospital-b", name="Hospital B"),
            ]
        )
        db.flush()
        for id, email, role, ws in [
            ("admin", "admin@example.com", "admin", "hospital-a"),
            ("officer", "officer@example.com", "officer", "hospital-a"),
            ("viewer", "viewer@example.com", "viewer", "hospital-a"),
            ("other", "other@example.com", "admin", "hospital-b"),
        ]:
            db.add(
                User(
                    id=id,
                    email=email,
                    name=id.title(),
                    role=role,
                    workspace_id=ws,
                    active=True,
                    password_hash=passwords.hash(PASSWORD),
                )
            )
        db.commit()
    clients = []

    def client(email="admin@example.com"):
        c = TestClient(app)
        clients.append(c)
        c.headers["Origin"] = "http://testserver"
        result = c.post("/api/auth/login", json={"email": email, "password": PASSWORD})
        assert result.status_code == 200, result.text
        c.headers["X-CSRF-Token"] = result.json()["csrf_token"]
        return c

    yield client
    for c in clients:
        c.close()
    engine().dispose()
    engine.cache_clear()


@pytest.fixture
def encounter():
    return {
        "synthetic": True,
        "patient": "Synthetic Patient",
        "insurer": "Demo Health",
        "member": "DEMO-1",
        "encounter": "DEMO-ENC-1",
        "historyText": "Documented synthetic symptoms.",
        "examination": "Documented synthetic findings.",
        "diagnosis": "Synthetic working diagnosis",
        "items": [
            {
                "name": "Investigation A",
                "quantity": 1,
                "indication": "Clinician-documented indication.",
            },
            {
                "name": "Therapy sessions",
                "quantity": 4,
                "indication": "Documented functional limitation.",
            },
        ],
    }
