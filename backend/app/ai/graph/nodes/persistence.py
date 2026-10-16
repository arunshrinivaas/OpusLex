"""
Persistence Node for OpusLex Multi-Agent Compliance Workflow.

Persists final agent results, metrics, and lifecycle status to the
AgentRun database record. Guarantees that failed runs are recorded
and never remain stuck in 'pending'.
"""

import logging
import time
from typing import Any

from langchain_core.runnables import RunnableConfig

from app.ai.graph.state import AgentWorkflowState
from app.models.agent_run import AgentRun

logger = logging.getLogger(__name__)


async def persistence_node(
    state: AgentWorkflowState, config: RunnableConfig
) -> dict[str, Any]:
    start_time = time.perf_counter()
    agent_run_id = state.get("agent_run_id")
    status = state.get("status", "completed")
    cfg = config.get("configurable", {}) if config else {}
    db = cfg.get("db")
    agent_run = cfg.get("agent_run")

    if db is not None:
        try:
            if agent_run is None and agent_run_id:
                agent_run = db.query(AgentRun).filter(AgentRun.id == agent_run_id).first()
            if agent_run:
                agent_run.status = status
                if status == "completed":
                    agent_run.finding = state.get("finding")
                    agent_run.evidence = state.get("evidence", [])
                    agent_run.conflicts = state.get("conflicts", [])
                    agent_run.evidence_gaps = state.get("evidence_gaps", [])
                    agent_run.applicable_requirements = state.get(
                        "applicable_requirements", []
                    )
                    agent_run.suggested_actions = state.get("suggested_actions", [])
                    agent_run.citations = state.get("citations", [])
                    agent_run.risk_score = state.get("risk_score")
                    agent_run.risk_level = state.get("risk_level")
                else:
                    # Failed run handling
                    agent_run.finding = (
                        state.get("error_message")
                        or state.get("finding")
                        or "Agent execution failed."
                    )
                    agent_run.evidence = []
                    agent_run.conflicts = []
                    agent_run.evidence_gaps = []
                    agent_run.applicable_requirements = []
                    agent_run.suggested_actions = []
                    agent_run.citations = []

                if hasattr(db, "commit"):
                    db.commit()
                if hasattr(db, "refresh"):
                    try:
                        db.refresh(agent_run)
                    except Exception:
                        pass
                logger.info(
                    f"[GRAPH:persistence] Successfully updated AgentRun(id={agent_run_id}, status={status})"
                )
        except Exception as exc:
            if hasattr(db, "rollback"):
                db.rollback()
            logger.error(
                f"[GRAPH:persistence] Failed to update AgentRun(id={agent_run_id}): {exc}"
            )
            return {
                "status": "failed",
                "error_message": f"Database persistence error: {str(exc)}",
                "node_timings": {"persistence": (time.perf_counter() - start_time) * 1000},
            }

    elapsed_ms = (time.perf_counter() - start_time) * 1000
    return {
        "status": status,
        "node_timings": {"persistence": elapsed_ms},
    }
