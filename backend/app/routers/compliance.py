from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.compliance import Compliance
from app.routers.auth import require_roles
from app.schemas.compliance import ComplianceCreate

router = APIRouter(prefix="/api/v1/compliance", tags=["Compliance"])


@router.get("/overview")
def get_compliance_overview(db: Session = Depends(get_db)):
    """Return high-level compliance KPIs for the dashboard."""
    total = db.query(func.count(Compliance.id)).scalar() or 0
    compliant = (
        db.query(func.count(Compliance.id))
        .filter(Compliance.status == "Compliant")
        .scalar()
        or 0
    )
    non_compliant = (
        db.query(func.count(Compliance.id))
        .filter(Compliance.status == "Non-Compliant")
        .scalar()
        or 0
    )
    in_progress = (
        db.query(func.count(Compliance.id))
        .filter(Compliance.status == "In Progress")
        .scalar()
        or 0
    )
    high_risk = (
        db.query(func.count(Compliance.id))
        .filter(Compliance.risk_level == "High")
        .scalar()
        or 0
    )

    score = round((compliant / total) * 100) if total else 0

    return {
        "total_obligations": total,
        "compliant": compliant,
        "non_compliant": non_compliant,
        "in_progress": in_progress,
        "high_risk_items": high_risk,
        "compliance_score": score,
    }


@router.get("/")
def get_compliance(
    search: str | None = Query(None),
    status: str | None = Query(None),
    risk_level: str | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Compliance)
    if search:
        query = query.filter(Compliance.title.ilike(f"%{search}%"))
    if status:
        query = query.filter(Compliance.status == status)
    if risk_level:
        query = query.filter(Compliance.risk_level == risk_level)

    total = query.count()
    items = query.offset(offset).limit(limit).all()
    return {"total": total, "items": items}


@router.post("/", status_code=201)
def create_compliance(
    compliance: ComplianceCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "compliance_officer", "risk_analyst")),
):
    db_compliance = Compliance(
        title=compliance.title,
        regulation=compliance.regulation,
        description=compliance.description,
        department=compliance.department,
        status=compliance.status,
        risk_level=compliance.risk_level,
        due_date=compliance.due_date,
    )
    db.add(db_compliance)
    db.commit()
    db.refresh(db_compliance)
    return db_compliance
