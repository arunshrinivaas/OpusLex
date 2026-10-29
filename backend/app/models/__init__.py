# Import all mapped models here so SQLAlchemy can resolve string-based
# relationship() targets (e.g. "Document", "Investigation") at runtime.
# Order: InvestigationDocument first (no string relationships), then the
# two endpoint classes that reference each other via secondary join.
from app.models.investigation_document import InvestigationDocument  # noqa: F401
from app.models.document import Document  # noqa: F401
from app.models.investigation import Investigation  # noqa: F401
from app.models.agent_run import AgentRun  # noqa: F401
from app.models.knowledge_post import KnowledgePost  # noqa: F401
from app.models.investigation_comment import InvestigationComment  # noqa: F401
from app.models.integration import Integration  # noqa: F401
from app.models.investigation_collaborator import InvestigationCollaborator
from app.models.investigation_presence import InvestigationPresence
from app.models.assistant import (  # noqa: F401
    AssistantPreference,
    AssistantAuditLog,
    AssistantActionToken,
    AssistantConversation,
    AssistantMessage,
)
