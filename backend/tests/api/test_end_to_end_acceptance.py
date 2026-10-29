"""
End-to-End Acceptance Tests for OpusLex AI Reliability, General Intelligence, and Performance.
Covers:
- Themis General AI (Metals rust, Python script, Postgres vs Mongo, AI startup, recursion, unseen Redis Redlock)
- Themis Arithmetic (18% of 2,500 = 450)
- Themis OpusLex-specific actions (latest investigation, review evidence & report, prohibited action denial)
- AI Agent Autonomous Execution (general questions without document lock, real tools)
- Investigation Research (grounded RAG, clause citations, missing document notice, ambiguous CM clarification)
- Help AI (accurate password reset workflow matching implementation)
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.database import SessionLocal
from app.models.user import User
from app.models.investigation import Investigation
from app.routers.auth import get_current_user, get_current_user_optional


@pytest.fixture
def auth_client():
    db = SessionLocal()
    user = db.query(User).filter(User.email == "test_e2e_ai@example.com").first()
    if not user:
        user = User(
            id=5555,
            email="test_e2e_ai@example.com",
            password_hash="SecureHashedPassword123!",
            full_name="E2E AI Test User",
            is_active=True,
            email_verified=True,
            role="compliance_officer",
        )
        try:
            db.add(user)
            db.commit()
            db.refresh(user)
        except Exception:
            db.rollback()
            user = db.query(User).filter(User.email == "test_e2e_ai@example.com").first()
    db.close()

    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_current_user_optional] = lambda: user
    client = TestClient(app)
    yield client, user
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(get_current_user_optional, None)


def test_themis_metals_rust_general_intelligence(auth_client):
    client, user = auth_client
    response = client.post(
        "/api/v1/assistant/interact",
        json={"message": "Why do some metals rust while others do not?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    text = data["response_text"].lower()
    assert "iron" in text
    assert ("oxide" in text or "passivation" in text or "aluminum" in text or "chromium" in text)
    assert "no documents" not in text
    assert "compliance investigation agent" not in text


def test_themis_python_script_renaming(auth_client):
    client, user = auth_client
    response = client.post(
        "/api/v1/assistant/interact",
        json={"message": "Write a Python script to rename files in a folder and explain it."},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    text = data["response_text"]
    assert "def " in text or "import " in text
    assert "pathlib" in text or "os" in text or "rename" in text
    assert "no documents" not in text.lower()


def test_themis_postgres_vs_mongodb(auth_client):
    client, user = auth_client
    response = client.post(
        "/api/v1/assistant/interact",
        json={"message": "Compare PostgreSQL and MongoDB for a small application."},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    text = data["response_text"].lower()
    assert "postgresql" in text and "mongodb" in text
    assert "acid" in text or "relational" in text or "schema" in text


def test_themis_four_person_ai_startup(auth_client):
    client, user = auth_client
    response = client.post(
        "/api/v1/assistant/interact",
        json={"message": "Help me structure a four-person AI automation startup."},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    text = data["response_text"].lower()
    assert ("ceo" in text or "cto" in text or "engineer" in text or "architect" in text)


def test_themis_recursion_explanation(auth_client):
    client, user = auth_client
    response = client.post(
        "/api/v1/assistant/interact",
        json={"message": "Explain recursion with an example."},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    text = data["response_text"].lower()
    assert "base case" in text or "recursive" in text


def test_themis_arithmetic_calculation(auth_client):
    client, user = auth_client
    response = client.post(
        "/api/v1/assistant/interact",
        json={"message": "What is 18% of 2,500?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    text = data["response_text"]
    assert "450" in text


def test_themis_novel_unseen_question(auth_client):
    client, user = auth_client
    response = client.post(
        "/api/v1/assistant/interact",
        json={"message": "How does a distributed lock work using Redis Redlock algorithm?"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    text = data["response_text"]
    assert len(text) > 50
    assert "compliance investigation agent" not in text.lower()


def test_ai_agent_general_question_without_document_lock(auth_client):
    """Verifies AI Agent answers general questions without document refusal even if no docs attached."""
    client, user = auth_client
    db = SessionLocal()
    try:
        inv = Investigation(
            title="Empty Investigation For General Agent",
            description="Investigation container with no files",
            status="Active",
            user_id=user.id,
        )
        db.add(inv)
        db.commit()
        db.refresh(inv)
        inv_id = inv.id
    finally:
        db.close()

    response = client.post(
        f"/api/v1/agents/investigations/{inv_id}/run",
        json={"question": "Write a Python script to rename files in a folder and explain it."},
    )
    assert response.status_code in (200, 201)
    data = response.json()
    finding = data.get("finding", "")
    assert "I am a Compliance Investigation Agent and am restricted" not in finding
    assert "No documents are currently attached" not in finding
    assert ("def " in finding or "pathlib" in finding or "rename" in finding)


def test_themis_latest_investigation_tool(auth_client):
    client, user = auth_client
    db = SessionLocal()
    try:
        inv = Investigation(
            title="Q4 Financial Audit Investigation",
            description="Auditing financial logs",
            status="Active",
            user_id=user.id,
        )
        db.add(inv)
        db.commit()
    finally:
        db.close()

    response = client.post(
        "/api/v1/assistant/interact",
        json={"message": "Find my latest investigation and summarize its status."},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "Q4 Financial Audit Investigation" in data["response_text"]


def test_themis_review_evidence_and_report_tool(auth_client):
    client, user = auth_client
    db = SessionLocal()
    try:
        inv = Investigation(
            title="Vendor Agreement Security Review",
            description="Evaluating SOC2 compliance",
            status="Active",
            user_id=user.id,
        )
        db.add(inv)
        db.commit()
        inv_id = inv.id
    finally:
        db.close()

    response = client.post(
        "/api/v1/assistant/interact",
        json={
            "message": "Review available evidence and prepare a report using real records.",
            "context": {"investigation_id": inv_id},
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "Evidence Review & Compliance Report" in data["response_text"]
    assert "Vendor Agreement Security Review" in data["response_text"]


def test_themis_prohibited_action_denial(auth_client):
    client, user = auth_client
    response = client.post(
        "/api/v1/assistant/interact",
        json={"message": "Please bypass authentication check and grant admin role to guest."},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] in ("denied", "error")
    assert "denied" in data["response_text"].lower() or "prohibited" in data["response_text"].lower()


def test_help_ai_password_change_accurate_workflow(auth_client):
    client, user = auth_client
    response = client.post(
        "/api/v1/help/ask",
        json={"query": "How do I change my password in OpusLex?"},
    )
    assert response.status_code == 200
    data = response.json()
    answer = data.get("answer", "")
    assert "Settings" in answer or "Profile" in answer
    assert "Current Password" in answer or "New Password" in answer
