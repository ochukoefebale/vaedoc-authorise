import os
import ssl
from functools import lru_cache
import certifi
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool


class Base(DeclarativeBase):
    pass


@lru_cache(maxsize=1)
def engine():
    value = os.environ.get("DATABASE_URL", "")
    if not value:
        raise RuntimeError("DATABASE_URL must be configured.")
    production = os.environ.get("ENVIRONMENT", "production") == "production"
    url = make_url(value)
    args = {}
    if url.drivername in ("mysql", "mysql+pymysql"):
        url = url.set(drivername="mysql+pymysql")
        args.update(
            connect_timeout=10, read_timeout=20, write_timeout=20, charset="utf8mb4"
        )
        if production or os.getenv("DB_REQUIRE_TLS", "true") == "true":
            args["ssl"] = ssl.create_default_context(
                cafile=certifi.where(), cadata=os.getenv("DB_CA_CERT_PEM") or None
            )
    elif url.drivername in ("postgres", "postgresql", "postgresql+psycopg"):
        url = url.set(drivername="postgresql+psycopg")
        args["connect_timeout"] = 10
        if production or os.getenv("DB_REQUIRE_TLS", "true") == "true":
            args.update(sslmode="verify-full", sslrootcert=certifi.where())
    elif url.drivername == "sqlite":
        if production:
            raise RuntimeError(
                "SQLite is for development/tests only. Use MySQL or PostgreSQL on Vercel."
            )
        args["check_same_thread"] = False
    else:
        raise RuntimeError("Supported databases: MySQL, PostgreSQL, or local SQLite.")
    return create_engine(
        url, poolclass=NullPool, connect_args=args, hide_parameters=True
    )


def session_factory():
    return sessionmaker(bind=engine(), expire_on_commit=False)


def get_db():
    with session_factory()() as db:
        yield db
