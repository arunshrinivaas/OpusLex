import uuid
from datetime import timedelta
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.database import SessionLocal
from app.models.user import User
from app.models.compliance import Compliance
from app.models.policy import Policy
from app.models.regulation import Regulation
from app.security import create_access_token, hash_password

PREFIX = "TEST_RBAC_"

ROLES_CONFIG = [
    (9101, "admin", "rbac_admin@opuslex.com"),
    (9102, "compliance_officer", "rbac_compliance@opuslex.com"),
    (9103, "legal_analyst", "rbac_legal@opuslex.com"),
    (9104, "risk_analyst", "rbac_risk@opuslex.com"),
    (9105, "auditor", "rbac_auditor@opuslex.com"),
    (9106, "viewer", "rbac_viewer@opuslex.com"),
]

USER_IDS = [cfg[0] for cfg in ROLES_CONFIG]
USER_EMAILS = [cfg[2] for cfg in ROLES_CONFIG]


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


@pytest.fixture(scope="module", autouse=True)
def setup_rbac_users(db_session: Session):
    # Ensure clean slate before tests
    db_session.query(User).filter(User.id.in_(USER_IDS)).delete(synchronize_session=False)
    db_session.query(User).filter(User.email.in_(USER_EMAILS)).delete(synchronize_session=False)
    db_session.commit()

    created_users = {}
    for uid, role, email in ROLES_CONFIG:
        u = User(
            id=uid,
            email=email,
            full_name=f"RBAC {role.title()}",
            password_hash=hash_password("SecurePassword123!"),
            role=role,
            is_active=True,
            email_verified=True,
        )
        db_session.add(u)
    db_session.commit()

    yield

    # Clean up test users and any test records
    db_session.query(Compliance).filter(Compliance.title.like(f"{PREFIX}%")).delete(synchronize_session=False)
    db_session.query(Policy).filter(Policy.title.like(f"{PREFIX}%")).delete(synchronize_session=False)
    db_session.query(Regulation).filter(Regulation.title.like(f"{PREFIX}%")).delete(synchronize_session=False)
    db_session.query(User).filter(User.id.in_(USER_IDS)).delete(synchronize_session=False)
    db_session.commit()


def get_headers(role: str) -> dict:
    match = next((cfg for cfg in ROLES_CONFIG if cfg[1] == role), None)
    if not match:
        raise ValueError(f"Unknown role {role}")
    uid, _, email = match
    token = create_access_token(
        data={"sub": str(uid), "email": email, "role": role},
        expires_delta=timedelta(minutes=30),
    )
    return {"Authorization": f"Bearer {token}"}


# ============================================================================
# F-01: Compliance Creation RBAC
# Permitted: admin, compliance_officer, risk_analyst
# Forbidden: viewer, legal_analyst, auditor, anonymous
# ============================================================================

def test_compliance_create_anonymous_rejected_and_unmutated(client: TestClient, db_session: Session):
    test_title = f"{PREFIX}Compliance_Anon_{uuid.uuid4().hex[:8]}"
    payload = {
        "title": test_title,
        "regulation": "GDPR Art 30",
        "department": "IT Security",
        "description": "Maintain records of processing activities",
        "status": "Not Started",
        "risk_level": "High",
    }
    resp = client.post("/api/v1/compliance/", json=payload)
    assert resp.status_code == 401

    # Verify no record created in database
    rec = db_session.query(Compliance).filter(Compliance.title == test_title).first()
    assert rec is None


@pytest.mark.parametrize("forbidden_role", ["viewer", "legal_analyst", "auditor"])
def test_compliance_create_forbidden_roles_rejected_and_unmutated(
    client: TestClient, db_session: Session, forbidden_role: str
):
    test_title = f"{PREFIX}Compliance_Forbidden_{forbidden_role}_{uuid.uuid4().hex[:8]}"
    payload = {
        "title": test_title,
        "regulation": "SOX Section 404",
        "department": "Finance",
        "description": "Internal controls assessment",
        "status": "Not Started",
        "risk_level": "High",
    }
    resp = client.post("/api/v1/compliance/", json=payload, headers=get_headers(forbidden_role))
    assert resp.status_code == 403
    assert "Requires role" in resp.json().get("detail", "")

    # Verify no record created in database
    rec = db_session.query(Compliance).filter(Compliance.title == test_title).first()
    assert rec is None


@pytest.mark.parametrize("permitted_role", ["admin", "compliance_officer", "risk_analyst"])
def test_compliance_create_permitted_roles_allowed_and_verified(
    client: TestClient, db_session: Session, permitted_role: str
):
    test_title = f"{PREFIX}Compliance_Permitted_{permitted_role}_{uuid.uuid4().hex[:8]}"
    payload = {
        "title": test_title,
        "regulation": "HIPAA Security Rule",
        "department": "Healthcare Operations",
        "description": "Access control compliance obligation",
        "status": "In Progress",
        "risk_level": "Medium",
    }
    resp = client.post("/api/v1/compliance/", json=payload, headers=get_headers(permitted_role))
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == test_title
    created_id = data["id"]

    # Verify record exists in database
    rec = db_session.query(Compliance).filter(Compliance.id == created_id).first()
    assert rec is not None
    assert rec.title == test_title
    assert rec.regulation == "HIPAA Security Rule"

    # Cleanup
    db_session.delete(rec)
    db_session.commit()


# ============================================================================
# F-02: Policy Creation RBAC
# Permitted: admin, compliance_officer, legal_analyst
# Forbidden: viewer, risk_analyst, auditor, anonymous
# ============================================================================

def test_policy_create_anonymous_rejected_and_unmutated(client: TestClient, db_session: Session):
    test_title = f"{PREFIX}Policy_Anon_{uuid.uuid4().hex[:8]}"
    payload = {
        "title": test_title,
        "department": "Legal",
        "description": "Confidential Information Protection",
        "status": "Draft",
        "version": "1.0",
    }
    resp = client.post("/api/v1/policies/", json=payload)
    assert resp.status_code == 401

    rec = db_session.query(Policy).filter(Policy.title == test_title).first()
    assert rec is None


@pytest.mark.parametrize("forbidden_role", ["viewer", "risk_analyst", "auditor"])
def test_policy_create_forbidden_roles_rejected_and_unmutated(
    client: TestClient, db_session: Session, forbidden_role: str
):
    test_title = f"{PREFIX}Policy_Forbidden_{forbidden_role}_{uuid.uuid4().hex[:8]}"
    payload = {
        "title": test_title,
        "department": "Governance",
        "description": "Data Classification Standard",
        "status": "Draft",
        "version": "1.0",
    }
    resp = client.post("/api/v1/policies/", json=payload, headers=get_headers(forbidden_role))
    assert resp.status_code == 403
    assert "Requires role" in resp.json().get("detail", "")

    rec = db_session.query(Policy).filter(Policy.title == test_title).first()
    assert rec is None


@pytest.mark.parametrize("permitted_role", ["admin", "compliance_officer", "legal_analyst"])
def test_policy_create_permitted_roles_allowed_and_verified(
    client: TestClient, db_session: Session, permitted_role: str
):
    test_title = f"{PREFIX}Policy_Permitted_{permitted_role}_{uuid.uuid4().hex[:8]}"
    payload = {
        "title": test_title,
        "department": "Legal & Risk",
        "description": "Remote Work Security Policy",
        "status": "Active",
        "version": "2.0",
    }
    resp = client.post("/api/v1/policies/", json=payload, headers=get_headers(permitted_role))
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == test_title
    created_id = data["id"]

    rec = db_session.query(Policy).filter(Policy.id == created_id).first()
    assert rec is not None
    assert rec.title == test_title

    # Cleanup
    db_session.delete(rec)
    db_session.commit()


# ============================================================================
# F-02: Policy Update RBAC
# Permitted: admin, compliance_officer, legal_analyst
# Forbidden: viewer, risk_analyst, auditor, anonymous
# ============================================================================

@pytest.fixture
def target_policy(db_session: Session):
    p = Policy(
        title=f"{PREFIX}Policy_Target_{uuid.uuid4().hex[:8]}",
        department="Operations",
        description="Original policy description",
        status="Draft",
        version="1.0",
    )
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)

    yield p

    # Cleanup
    to_del = db_session.query(Policy).filter(Policy.id == p.id).first()
    if to_del:
        db_session.delete(to_del)
        db_session.commit()


def test_policy_update_anonymous_rejected_and_unmutated(
    client: TestClient, db_session: Session, target_policy: Policy
):
    patch_payload = {"description": "Hacked description without authentication"}
    resp = client.patch(f"/api/v1/policies/{target_policy.id}", json=patch_payload)
    assert resp.status_code == 401

    db_session.refresh(target_policy)
    assert target_policy.description == "Original policy description"


@pytest.mark.parametrize("forbidden_role", ["viewer", "risk_analyst", "auditor"])
def test_policy_update_forbidden_roles_rejected_and_unmutated(
    client: TestClient, db_session: Session, target_policy: Policy, forbidden_role: str
):
    patch_payload = {"description": f"Mutated by {forbidden_role}"}
    resp = client.patch(
        f"/api/v1/policies/{target_policy.id}",
        json=patch_payload,
        headers=get_headers(forbidden_role),
    )
    assert resp.status_code == 403
    assert "Requires role" in resp.json().get("detail", "")

    db_session.refresh(target_policy)
    assert target_policy.description == "Original policy description"


@pytest.mark.parametrize("permitted_role", ["legal_analyst", "compliance_officer", "admin"])
def test_policy_update_permitted_roles_allowed_and_verified(
    client: TestClient, db_session: Session, target_policy: Policy, permitted_role: str
):
    new_desc = f"Updated successfully by {permitted_role}"
    patch_payload = {"description": new_desc}
    resp = client.patch(
        f"/api/v1/policies/{target_policy.id}",
        json=patch_payload,
        headers=get_headers(permitted_role),
    )
    assert resp.status_code == 200

    db_session.refresh(target_policy)
    assert target_policy.description == new_desc


# ============================================================================
# F-02: Policy Deletion RBAC
# Permitted: admin, compliance_officer
# Forbidden: legal_analyst (CRITICAL distinction), viewer, risk_analyst, auditor, anonymous
# ============================================================================

def test_policy_delete_anonymous_rejected_and_unmutated(client: TestClient, db_session: Session):
    p = Policy(
        title=f"{PREFIX}Policy_Del_Anon_{uuid.uuid4().hex[:8]}",
        department="HR",
        description="Policy to preserve",
        status="Draft",
        version="1.0",
    )
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)

    resp = client.delete(f"/api/v1/policies/{p.id}")
    assert resp.status_code == 401

    # Record still intact
    rec = db_session.query(Policy).filter(Policy.id == p.id).first()
    assert rec is not None

    # Cleanup
    db_session.delete(rec)
    db_session.commit()


@pytest.mark.parametrize("forbidden_role", ["viewer", "legal_analyst", "risk_analyst", "auditor"])
def test_policy_delete_forbidden_roles_rejected_and_unmutated(
    client: TestClient, db_session: Session, forbidden_role: str
):
    p = Policy(
        title=f"{PREFIX}Policy_Del_Forbid_{forbidden_role}_{uuid.uuid4().hex[:8]}",
        department="HR",
        description="Policy to preserve from unauthorized delete",
        status="Active",
        version="1.0",
    )
    db_session.add(p)
    db_session.commit()
    db_session.refresh(p)

    resp = client.delete(f"/api/v1/policies/{p.id}", headers=get_headers(forbidden_role))
    assert resp.status_code == 403
    assert "Requires role: admin, compliance_officer" in resp.json().get("detail", "")

    # Record still intact
    rec = db_session.query(Policy).filter(Policy.id == p.id).first()
    assert rec is not None

    # Cleanup
    db_session.delete(rec)
    db_session.commit()


@pytest.mark.parametrize("permitted_role", ["compliance_officer", "admin"])
def test_policy_delete_permitted_roles_allowed_and_verified(
    client: TestClient, db_session: Session, permitted_role: str
):
    p = Policy(
        title=f"{PREFIX}Policy_Del_Permit_{permitted_role}_{uuid.uuid4().hex[:8]}",
        department="Audit",
        description="Policy to delete",
        status="Archived",
        version="1.0",
    )
    db_session.add(p)
    db_session.commit()
    pid = p.id

    resp = client.delete(f"/api/v1/policies/{pid}", headers=get_headers(permitted_role))
    assert resp.status_code == 204

    # Record successfully deleted
    rec = db_session.query(Policy).filter(Policy.id == pid).first()
    assert rec is None


# ============================================================================
# F-02: Regulation Creation RBAC
# Permitted: admin, compliance_officer, legal_analyst
# Forbidden: viewer, risk_analyst, auditor, anonymous
# ============================================================================

def test_regulation_create_anonymous_rejected_and_unmutated(client: TestClient, db_session: Session):
    test_title = f"{PREFIX}Reg_Anon_{uuid.uuid4().hex[:8]}"
    payload = {
        "title": test_title,
        "issuing_authority": "Federal Reserve",
        "jurisdiction": "US",
        "description": "Regulation YY Prudential Standards",
        "status": "Active",
    }
    resp = client.post("/api/v1/regulations/", json=payload)
    assert resp.status_code == 401

    rec = db_session.query(Regulation).filter(Regulation.title == test_title).first()
    assert rec is None


@pytest.mark.parametrize("forbidden_role", ["viewer", "risk_analyst", "auditor"])
def test_regulation_create_forbidden_roles_rejected_and_unmutated(
    client: TestClient, db_session: Session, forbidden_role: str
):
    test_title = f"{PREFIX}Reg_Forbidden_{forbidden_role}_{uuid.uuid4().hex[:8]}"
    payload = {
        "title": test_title,
        "issuing_authority": "SEC",
        "jurisdiction": "US",
        "description": "Cybersecurity Risk Management Rule",
        "status": "Active",
    }
    resp = client.post("/api/v1/regulations/", json=payload, headers=get_headers(forbidden_role))
    assert resp.status_code == 403
    assert "Requires role" in resp.json().get("detail", "")

    rec = db_session.query(Regulation).filter(Regulation.title == test_title).first()
    assert rec is None


@pytest.mark.parametrize("permitted_role", ["admin", "compliance_officer", "legal_analyst"])
def test_regulation_create_permitted_roles_allowed_and_verified(
    client: TestClient, db_session: Session, permitted_role: str
):
    test_title = f"{PREFIX}Reg_Permitted_{permitted_role}_{uuid.uuid4().hex[:8]}"
    payload = {
        "title": test_title,
        "issuing_authority": "European Parliament",
        "jurisdiction": "EU",
        "description": "EU AI Act Governance",
        "status": "Active",
    }
    resp = client.post("/api/v1/regulations/", json=payload, headers=get_headers(permitted_role))
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == test_title
    created_id = data["id"]

    rec = db_session.query(Regulation).filter(Regulation.id == created_id).first()
    assert rec is not None
    assert rec.title == test_title

    # Cleanup
    db_session.delete(rec)
    db_session.commit()
