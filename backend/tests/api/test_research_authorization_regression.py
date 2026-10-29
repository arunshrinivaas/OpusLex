"""
Regression test suite for Research History Owner Scoping & Cross-User Isolation.

Verifies:
1. User A lists only their own research query sessions.
2. User B cannot view User A's research query sessions (zero cross-user leakage).
3. Null-owner legacy records (user_id IS NULL) are completely shielded from end-users.
4. User B cannot delete User A's research query sessions (HTTP 404).
5. Ordinary users cannot delete null-owner legacy records (HTTP 404).
6. User A can delete their own research query session (HTTP 204).
7. Strict exact-ID cleanup with ownership verification.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.database import SessionLocal
from app.models.research import ResearchQuery
from app.security import create_access_token

USER_A_ID = 864
USER_A_EMAIL = "test_acceptance@opuslex.com"
USER_B_ID = 863
USER_B_EMAIL = "test_optimizer@opuslex.com"


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


@pytest.fixture(scope="module")
def db_session():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module")
def auth_headers_user_a():
    token = create_access_token(
        data={"sub": str(USER_A_ID), "email": USER_A_EMAIL, "role": "compliance_officer"}
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def auth_headers_user_b():
    token = create_access_token(
        data={"sub": str(USER_B_ID), "email": USER_B_EMAIL, "role": "compliance_officer"}
    )
    return {"Authorization": f"Bearer {token}"}


def test_runtime_database_isolation(db_session: Session):
    """Verify runtime database connection is strictly legal_compliance_isolated_test_db without printing credentials."""
    import urllib.parse
    url_str = str(db_session.get_bind().url)
    parsed = urllib.parse.urlparse(url_str)
    db_name = parsed.path.lstrip('/')
    assert db_name == "legal_compliance_isolated_test_db", f"Critical Isolation Failure: Bound to '{db_name}'"
    print(f"\n[RUNTIME DB VERIFICATION] Database name: {db_name}")


def test_research_history_authorization_regression(
    client: TestClient,
    db_session: Session,
    auth_headers_user_a: dict,
    auth_headers_user_b: dict,
):
    tracked_session_ids: list[int] = []

    try:
        # 1. User A creates a research session via API
        q_user_a = "TEST_AUTH_REGRESSION_Q_A"
        create_res = client.post(
            "/api/v1/research/sessions",
            headers=auth_headers_user_a,
            json={
                "question": q_user_a,
                "status": "Completed",
                "answer": "Answer for User A",
                "sources": [],
            },
        )
        assert create_res.status_code == 201
        session_a = create_res.json()
        session_a_id = session_a["id"]
        tracked_session_ids.append(session_a_id)

        # 2. Insert a temporary synthetic null-owner legacy session in isolated DB
        null_session = ResearchQuery(
            user_id=None,
            question="TEST_AUTH_REGRESSION_LEGACY_NULL_Q",
            status="Completed",
            answer="Legacy unowned answer",
            sources=[],
        )
        db_session.add(null_session)
        db_session.commit()
        db_session.refresh(null_session)
        null_session_id = null_session.id
        tracked_session_ids.append(null_session_id)

        # -------------------------------------------------------------
        # CHECK 1: User A lists sessions -> sees session_a, NOT null_session
        # -------------------------------------------------------------
        list_a = client.get("/api/v1/research/sessions", headers=auth_headers_user_a)
        assert list_a.status_code == 200
        items_a = list_a.json()
        ids_a = [s["id"] for s in items_a]
        assert session_a_id in ids_a, "User A must see their own session"
        assert null_session_id not in ids_a, "User A must NOT see null-owner legacy session"

        # -------------------------------------------------------------
        # CHECK 2: User B lists sessions -> sees NEITHER session_a NOR null_session
        # -------------------------------------------------------------
        list_b = client.get("/api/v1/research/sessions", headers=auth_headers_user_b)
        assert list_b.status_code == 200
        items_b = list_b.json()
        ids_b = [s["id"] for s in items_b]
        assert session_a_id not in ids_b, "User B must NOT see User A's session (cross-user leakage)"
        assert null_session_id not in ids_b, "User B must NOT see null-owner legacy session"

        # -------------------------------------------------------------
        # CHECK 3: User B attempts to delete User A's session -> 404 Not Found
        # -------------------------------------------------------------
        del_foreign = client.delete(
            f"/api/v1/research/sessions/{session_a_id}",
            headers=auth_headers_user_b,
        )
        assert del_foreign.status_code == 404, "User B deletion of User A session must return 404"

        # Assert User A's session record is untouched in database
        db_session.expire_all()
        persisted_a = db_session.query(ResearchQuery).filter_by(id=session_a_id).first()
        assert persisted_a is not None, "User A session must remain intact after denied delete"
        assert persisted_a.user_id == USER_A_ID

        # -------------------------------------------------------------
        # CHECK 4: Ordinary users attempt to delete null-owner session -> 404 Not Found
        # -------------------------------------------------------------
        del_null_a = client.delete(
            f"/api/v1/research/sessions/{null_session_id}",
            headers=auth_headers_user_a,
        )
        assert del_null_a.status_code == 404, "User A deletion of null-owner session must return 404"

        del_null_b = client.delete(
            f"/api/v1/research/sessions/{null_session_id}",
            headers=auth_headers_user_b,
        )
        assert del_null_b.status_code == 404, "User B deletion of null-owner session must return 404"

        # Assert null-owner session is still preserved in DB
        db_session.expire_all()
        persisted_null = db_session.query(ResearchQuery).filter_by(id=null_session_id).first()
        assert persisted_null is not None, "Null-owner record must remain preserved after denied deletes"
        assert persisted_null.user_id is None

        # -------------------------------------------------------------
        # CHECK 5: User A deletes their own session -> 204 No Content
        # -------------------------------------------------------------
        del_own = client.delete(
            f"/api/v1/research/sessions/{session_a_id}",
            headers=auth_headers_user_a,
        )
        assert del_own.status_code == 204

        # Verify removal
        db_session.expire_all()
        assert db_session.query(ResearchQuery).filter_by(id=session_a_id).first() is None
        tracked_session_ids.remove(session_a_id)

    finally:
        # Exact-ID teardown with fail-closed ownership verification
        for s_id in list(tracked_session_ids):
            rec = db_session.query(ResearchQuery).filter_by(id=s_id).first()
            if rec is not None:
                assert rec.user_id in (USER_A_ID, None), f"SAFETY ABORT: Record {s_id} owned by foreign user {rec.user_id}"
                db_session.delete(rec)
        db_session.commit()
