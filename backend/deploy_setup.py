"""Explicit deployment setup, using the hosting environment's database config."""

import os
from pathlib import Path
from alembic import command
from alembic.config import Config
from authorise.bootstrap import initialise_admin

if __name__ == "__main__":
    if os.environ.get("VERCEL_ENV") != "production":
        print("Database setup skipped outside production.")
    else:
        command.upgrade(Config(str(Path(__file__).parent / "alembic.ini")), "head")
        email = os.environ.get("AUTHORISE_BOOTSTRAP_EMAIL")
        token_hash = os.environ.get("AUTHORISE_BOOTSTRAP_TOKEN_HASH")
        if email and token_hash:
            print(initialise_admin(email, token_hash))
        elif email or token_hash:
            raise RuntimeError("Initial administrator configuration is incomplete.")
        print("Production database setup completed.")
