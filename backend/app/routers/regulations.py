from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.regulation import Regulation
from app.routers.auth import get_current_user, require_roles
from app.schemas.regulation import RegulationCreate

router = APIRouter(prefix="/api/v1/regulations", tags=["Regulations"])


@router.get("/")
def get_regulations(
    search: str | None = Query(None),
    jurisdiction: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(100, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    query = db.query(Regulation)
    if search:
        query = query.filter(Regulation.title.ilike(f"%{search}%"))
    if jurisdiction:
        query = query.filter(Regulation.jurisdiction.ilike(f"%{jurisdiction}%"))
    if status:
        query = query.filter(Regulation.status == status)

    total = query.count()
    regulations = query.offset(offset).limit(limit).all()
    return {"total": total, "items": regulations}


@router.get("/{regulation_id}")
def get_regulation(regulation_id: int, db: Session = Depends(get_db)):
    regulation = db.query(Regulation).filter(Regulation.id == regulation_id).first()
    if not regulation:
        raise HTTPException(status_code=404, detail="Regulation not found")
    return regulation


@router.post("/", status_code=201)
def create_regulation(
    regulation: RegulationCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "compliance_officer", "legal_analyst")),
):
    db_regulation = Regulation(
        title=regulation.title,
        issuing_authority=regulation.issuing_authority,
        jurisdiction=regulation.jurisdiction,
        description=regulation.description,
        status=regulation.status,
        effective_date=regulation.effective_date,
    )
    db.add(db_regulation)
    db.commit()
    db.refresh(db_regulation)
    return db_regulation
