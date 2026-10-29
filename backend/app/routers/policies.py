from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.policy import Policy
from app.routers.auth import get_current_user, require_roles
from app.schemas.policy import PolicyCreate, PolicyUpdate

router = APIRouter(prefix="/api/v1/policies", tags=["Policies"])


@router.get("/")
def get_policies(
    search: str | None = Query(None),
    status: str | None = Query(None),
    department: str | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Policy)
    if search:
        query = query.filter(Policy.title.ilike(f"%{search}%"))
    if status:
        query = query.filter(Policy.status == status)
    if department:
        query = query.filter(Policy.department.ilike(f"%{department}%"))

    total = query.count()
    policies = query.offset(offset).limit(limit).all()
    return {"total": total, "items": policies}


@router.get("/{policy_id}")
def get_policy(policy_id: int, db: Session = Depends(get_db)):
    policy = db.query(Policy).filter(Policy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy


@router.post("/", status_code=201)
def create_policy(
    policy: PolicyCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "compliance_officer", "legal_analyst")),
):
    db_policy = Policy(
        title=policy.title,
        department=policy.department,
        description=policy.description,
        status=policy.status,
        version=policy.version,
        effective_date=policy.effective_date,
    )
    db.add(db_policy)
    db.commit()
    db.refresh(db_policy)
    return db_policy


@router.patch("/{policy_id}")
def update_policy(
    policy_id: int,
    policy: PolicyUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "compliance_officer", "legal_analyst")),
):
    db_policy = db.query(Policy).filter(Policy.id == policy_id).first()
    if not db_policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    update_data = policy.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(db_policy, field, value)

    db.commit()
    db.refresh(db_policy)
    return db_policy


@router.delete("/{policy_id}", status_code=204)
def delete_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "compliance_officer")),
):
    db_policy = db.query(Policy).filter(Policy.id == policy_id).first()
    if not db_policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    db.delete(db_policy)
    db.commit()
