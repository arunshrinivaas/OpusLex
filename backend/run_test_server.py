"""
Dedicated test server runner for isolated acceptance testing.
Ensures the test instance strictly binds to `legal_compliance_isolated_test_db` on port 8001.
Guards against load_dotenv(override=True) in app.config to guarantee database isolation.
"""
import os
import sys

# 1. Enforce isolated database URL
TEST_DB = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://arun@localhost:5432/legal_compliance_isolated_test_db")
os.environ["DATABASE_URL"] = TEST_DB
os.environ["TEST_DATABASE_URL"] = TEST_DB

# 2. Guard against load_dotenv(override=True) in app.config clobbering DATABASE_URL
import dotenv
orig_load_dotenv = dotenv.load_dotenv
def guarded_load_dotenv(*args, **kwargs):
    # Allow loading other environment variables, but keep DATABASE_URL pinned to isolated DB
    res = orig_load_dotenv(*args, **kwargs)
    os.environ["DATABASE_URL"] = TEST_DB
    os.environ["TEST_DATABASE_URL"] = TEST_DB
    return res
dotenv.load_dotenv = guarded_load_dotenv

# 3. Assert engine binding before server starts
from app.database import engine
if "legal_compliance_isolated_test_db" not in str(engine.url):
    raise RuntimeError(
        f"CRITICAL ISOLATION ABORT: Engine is incorrectly bound to '{engine.url}'. "
        f"Expected 'legal_compliance_isolated_test_db'."
    )

import uvicorn

def main():
    print(f"[TEST SERVER] Binding strictly to {engine.url} on port 8001")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8001, log_level="info")

if __name__ == "__main__":
    main()
