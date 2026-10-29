from datetime import datetime

from pydantic import BaseModel


class ResearchQueryCreate(BaseModel):
    question: str
    status: str = "Pending"
    answer: str | None = None
    sources: list | None = None


class ResearchQueryResponse(BaseModel):
    id: int
    user_id: int | None = None
    question: str
    status: str = "completed"
    answer: str | None = None
    sources: list | None = None
    query_type: str | None = "general"
    used_rag: bool = False
    investigation_id: int | None = None
    created_at: datetime | None = None

    def __await__(self):
        async def _resolve():
            return self
        return _resolve().__await__()