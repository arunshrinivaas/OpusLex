"""
Workflow Assembly and Compilation for OpusLex Multi-Agent Compliance Investigations.

Constructs the LangGraph StateGraph connecting:
  START -> Supervisor -> (Research / Synthesis) -> Analysis -> Verification -> (Research / Synthesis) -> Persistence -> END

Includes in-memory checkpointing via MemorySaver.
Note: In-memory checkpoints do not survive process restarts.
"""

from __future__ import annotations

import logging
from typing import Any

from langgraph.checkpoint.memory import MemorySaver
from langgraph.graph import END, START, StateGraph

from app.ai.graph.edges import conditional_review_edge, supervisor_routing_edge
from app.ai.graph.nodes.analysis import analysis_node
from app.ai.graph.nodes.general import general_node
from app.ai.graph.nodes.persistence import persistence_node
from app.ai.graph.nodes.research import research_node
from app.ai.graph.nodes.supervisor import supervisor_node
from app.ai.graph.nodes.synthesis import synthesis_node
from app.ai.graph.nodes.tool import tool_node
from app.ai.graph.nodes.verification import verification_node
from app.ai.graph.state import AgentWorkflowState

logger = logging.getLogger(__name__)


def create_compliance_graph(checkpointer: Any | None = None):
    """
    Constructs and compiles the multi-agent StateGraph.
    Uses an in-memory checkpointer by default for localized run tracing.
    """
    builder = StateGraph(AgentWorkflowState)

    # 1. Add Agent Nodes
    builder.add_node("supervisor", supervisor_node)
    builder.add_node("general_node", general_node)
    builder.add_node("tool_node", tool_node)
    builder.add_node("research", research_node)
    builder.add_node("analysis", analysis_node)
    builder.add_node("verification", verification_node)
    builder.add_node("synthesis", synthesis_node)
    builder.add_node("persistence", persistence_node)

    # 2. Add Edges
    builder.add_edge(START, "supervisor")

    # Conditional routing from supervisor (general vs tool vs RAG vs synthesis)
    builder.add_conditional_edges(
        "supervisor",
        supervisor_routing_edge,
        {
            "general": "general_node",
            "tool": "tool_node",
            "research": "research",
            "synthesis": "synthesis",
        },
    )

    builder.add_edge("general_node", "persistence")
    builder.add_edge("tool_node", "persistence")

    # Pipeline: Research -> Analysis -> Verification
    builder.add_edge("research", "analysis")
    builder.add_edge("analysis", "verification")

    # Conditional review from verification (bounded retry loop or proceed to synthesis)
    builder.add_conditional_edges(
        "verification",
        conditional_review_edge,
        {
            "research": "research",
            "synthesis": "synthesis",
        },
    )

    # Finalization: Synthesis -> Persistence -> END
    builder.add_edge("synthesis", "persistence")
    builder.add_edge("persistence", END)

    # 3. Checkpointer Configuration
    # Uses MemorySaver: checkpoints in-memory for the current process.
    # Checkpoints do not survive process restarts.
    memory = checkpointer if checkpointer is not None else MemorySaver()
    compiled_graph = builder.compile(checkpointer=memory)

    return compiled_graph


# Pre-compiled singleton workflow
compliance_graph = create_compliance_graph()
