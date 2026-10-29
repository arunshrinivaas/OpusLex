import pytest
from datetime import timedelta
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.main import app
from app.models.user import User
from app.database import SessionLocal
from app.security import create_access_token, hash_password, verify_password

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture
def test_user(db: Session):
    db.query(User).filter(User.id == 8888).delete()
    db.query(User).filter(User.email == "profile_test@opuslex.com").delete()
    db.commit()

    user = User(
        id=8888,
        email="profile_test@opuslex.com",
        full_name="Initial Name",
        password_hash=hash_password("OldPassword123!"),
        role="legal_analyst",
        is_active=True,
        email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    yield user

    user_to_delete = db.query(User).filter(User.id == 8888).first()
    if user_to_delete:
        db.delete(user_to_delete)
    db.commit()

@pytest.fixture
def auth_headers():
    token = create_access_token(
        data={"sub": "8888", "email": "profile_test@opuslex.com", "role": "legal_analyst"},
        expires_delta=timedelta(minutes=30),
    )
    return {"Authorization": f"Bearer {token}"}

def test_profile_update_unauthenticated(client):
    res = client.put("/api/v1/auth/profile", json={"full_name": "New Name"})
    assert res.status_code == 401

def test_profile_update_blank_name_rejected(client, test_user, auth_headers):
    res = client.put("/api/v1/auth/profile", json={"full_name": "   "}, headers=auth_headers)
    assert res.status_code == 400
    assert "cannot be blank" in res.json()["detail"]

def test_profile_update_success(client, test_user, auth_headers, db: Session):
    res = client.put("/api/v1/auth/profile", json={"full_name": "Dr. Themis Vance"}, headers=auth_headers)
    assert res.status_code == 200
    data = res.json()
    assert data["full_name"] == "Dr. Themis Vance"
    assert data["email"] == "profile_test@opuslex.com"

    # Verify in DB
    db.expire_all()
    refreshed = db.query(User).filter(User.id == 8888).first()
    assert refreshed.full_name == "Dr. Themis Vance"

def test_change_password_wrong_current(client, test_user, auth_headers):
    res = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "WrongPassword!", "new_password": "NewSecretPass456!"},
        headers=auth_headers,
    )
    assert res.status_code == 400
    assert "Incorrect current password" in res.json()["detail"]

def test_change_password_same_password_rejected(client, test_user, auth_headers):
    res = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "OldPassword123!", "new_password": "OldPassword123!"},
        headers=auth_headers,
    )
    assert res.status_code == 400
    assert "must be different" in res.json()["detail"]

def test_change_password_short_password_rejected(client, test_user, auth_headers):
    res = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "OldPassword123!", "new_password": "short"},
        headers=auth_headers,
    )
    assert res.status_code == 422

def test_change_password_success(client, test_user, auth_headers, db: Session):
    res = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "OldPassword123!", "new_password": "BrandNewPassword789!"},
        headers=auth_headers,
    )
    assert res.status_code == 200
    assert res.json()["message"] == "Password changed successfully"

    # Verify in DB that hash is updated and verifies
    db.expire_all()
    refreshed = db.query(User).filter(User.id == 8888).first()
    assert verify_password("BrandNewPassword789!", refreshed.password_hash)
    assert not verify_password("OldPassword123!", refreshed.password_hash)
