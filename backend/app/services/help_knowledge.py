"""
OpusLex Product Knowledge Base and Support Assistant.

Provides accurate, evidence-grounded answers about OpusLex features,
workflows, policies, reports, investigations, documents, research,
and compliance analysis without hallucinating or inventing capabilities.
"""

import re
from typing import Optional

# Structured documentation units representing implemented OpusLex capabilities
KNOWLEDGE_TOPICS = [
    {
        "id": "policies",
        "title": "Policies & Governance Register",
        "keywords": [
            "policy", "policies", "policy register", "governance", "draft policy",
            "active policy", "department policy", "internal policy", "corporate policies"
        ],
        "summary": (
            "Policies in OpusLex are tracked within the Governance & Compliance workspace. "
            "You can manage corporate policies across departments with statuses such as 'Draft' and 'Active'.\n\n"
            "Key capabilities:\n"
            "• Policy Register: View, filter, and track internal corporate policies by department and status.\n"
            "• Statuses: Policies begin in Draft and transition to Active once approved.\n"
            "• Governance Summary: The system aggregates metrics showing total, active, and draft policies.\n"
            "• Compliance Auditing: Policies can be evaluated against external regulations and investigation documents."
        ),
    },
    {
        "id": "reports",
        "title": "Compliance & Governance Reports",
        "keywords": [
            "report", "reports", "compliance report", "governance report", "generate report",
            "interpret report", "risk report", "audit report", "compliance score"
        ],
        "summary": (
            "OpusLex provides a centralized Reports section under Compliance & Governance.\n\n"
            "How to generate & interpret reports:\n"
            "1. Access the Reports tab from the top navigation or sidebar.\n"
            "2. Governance Overview: View aggregate metrics including total policies, active regulations, and overall compliance score.\n"
            "3. Findings Log: Review structured findings from completed AI agent runs across all investigations.\n"
            "4. Risk Indicators: Interpret compliance status categorized into Compliant, Non-Compliant, and High Risk.\n"
            "5. Export & Print: Use the Print/Export button to generate a clean, auditable print-ready compliance summary."
        ),
    },
    {
        "id": "investigations",
        "title": "Investigations & Workflow Containers",
        "keywords": [
            "investigation", "investigations", "create investigation", "new investigation",
            "investigation container", "scope", "case", "matter"
        ],
        "summary": (
            "Investigations are secure, isolated containers in OpusLex designed to group documents, "
            "research queries, notes, and AI agent runs around a specific legal or regulatory matter.\n\n"
            "How to work with investigations:\n"
            "1. Navigate to the Investigations tab and click 'New Investigation'.\n"
            "2. Enter a title, description, and target jurisdiction.\n"
            "3. Attach evidence documents directly to the investigation.\n"
            "4. Run scoped research queries and deploy AI Compliance Agents that reason strictly over the attached documents."
        ),
    },
    {
        "id": "documents",
        "title": "Document Upload & Indexing",
        "keywords": [
            "upload document", "upload documents", "how to upload", "how do i upload",
            "attach document", "uploading documents", "upload pdf", "indexing documents",
            "chunking", "process documents"
        ],
        "summary": (
            "OpusLex allows you to upload documents directly from your device into the Document Library "
            "or attach them to specific Investigations.\n\n"
            "Processing & Analysis workflow:\n"
            "1. Upload PDF or text documents via the Documents tab or Investigation documents panel.\n"
            "2. The platform extracts raw text, generates semantic chunks, and creates vector embeddings.\n"
            "3. Once processed, documents become instantly searchable via semantic RAG in the Research workspace and available for AI agent analysis."
        ),
    },
    {
        "id": "research",
        "title": "Research Workspace & Global vs Scoped Search",
        "keywords": [
            "research", "global research", "scoped research", "rag", "search documents",
            "query documents", "citation", "citations"
        ],
        "summary": (
            "The Research workspace provides Retrieval-Augmented Generation (RAG) to query documents.\n\n"
            "Difference between Research and Investigations:\n"
            "• Global Research: Searches across all accessible documents and public knowledge in your workspace.\n"
            "• Investigation-Scoped Research: Confines searches and citations exclusively to documents attached to the selected investigation, guaranteeing strict data isolation.\n"
            "• Evidence Grounding: Answers cite source documents with chunk numbers (e.g., [Source: policy.pdf, Chunk: 1])."
        ),
    },
    {
        "id": "agents",
        "title": "AI Compliance Agents & Findings",
        "keywords": [
            "agent", "agents", "compliance agent", "run agent", "agent run",
            "structured findings", "risk score", "conflicts", "evidence gaps", "remediation"
        ],
        "summary": (
            "The Compliance Investigation Agent performs automated, multi-step analysis on documents attached to an investigation.\n\n"
            "Capabilities:\n"
            "1. Strict Grounding: The agent reasons ONLY from the attached documents and refuses to fabricate outside legal facts.\n"
            "2. Structured Output: Produces evidence quotes, document conflicts, evidence gaps, applicable requirements, and suggested actions.\n"
            "3. Risk Heuristic: Computes a preliminary 0–100 risk score and risk level (Low, Medium, High) based on identified gaps and conflicts.\n"
            "4. Auditability: Every run is permanently logged in the investigation's agent run history."
        ),
    },
    {
        "id": "audit",
        "title": "Audit Trail & System Accountability",
        "keywords": [
            "audit", "audit trail", "findings", "system events", "accountability", "logs"
        ],
        "summary": (
            "The Audit & Findings section provides complete transparency into all workspace activities.\n\n"
            "• Audit Trail: Chronological logging of events including document uploads, policy changes, and agent runs.\n"
            "• Findings: Central review of compliance gaps and risks identified by AI agents, including citations back to original document text."
        ),
    },
    {
        "id": "integrations",
        "title": "Cloud Integrations Status",
        "keywords": [
            "integration", "integrations", "google drive", "dropbox", "box", "onedrive", "sharepoint"
        ],
        "summary": (
            "OpusLex supports external cloud integrations, but they require backend OAuth credentials:\n"
            "• Google Drive & Dropbox: Currently marked 'Not Configured' until credentials are provided by your administrator.\n"
            "• Box, OneDrive, SharePoint: Planned for upcoming releases.\n"
            "• Alternative: You can directly upload documents from your computer at any time."
        ),
    },
    {
        "id": "password_policy",
        "title": "Password Requirements & Strong Password Guidance",
        "keywords": [
            "strong password", "password requirement", "password requirements", "password criteria",
            "password rules", "password length", "password policy", "password strength", "password format",
            "secure password", "good password"
        ],
        "summary": (
            "### OpusLex Password Requirements & Security Best Practices\n\n"
            "**1. Enforced Product Rules:**\n"
            "• **Minimum Length:** OpusLex strictly enforces a minimum of 8 characters for local account passwords (validated via backend schema and API verification).\n"
            "• **Current Password Verification:** When changing a password, the system verifies your existing password before committing changes.\n"
            "• **Uniqueness:** The new password must be distinct from your current password.\n"
            "• **OAuth Single Sign-On:** If you signed in via Google OAuth or Apple Sign-In and do not have a local password, authentication is managed directly by your external identity provider.\n\n"
            "**2. Recommended Security Practices (Distinguished from Enforced Rules):**\n"
            "• **Length & Complexity:** While 8 characters is the enforced minimum, 12 to 16+ characters are strongly recommended for higher entropy against brute-force attacks.\n"
            "• **Character Diversity:** Mix uppercase letters, lowercase letters, numbers, and symbols/special characters (!@#$%^&*).\n"
            "• **Avoid Predictable Patterns:** Do not use dictionary words, sequential characters, or credentials shared with other accounts.\n"
            "• **Two-Factor Authentication (2FA):** Enable TOTP authenticator app verification under Settings > Security for comprehensive account defense."
        ),
    },
    {
        "id": "password_change",
        "title": "Password Change & Account Security Navigation",
        "keywords": [
            "change password", "reset password", "update password", "how to change password",
            "where do i change password", "modify password", "change credentials"
        ],
        "summary": (
            "To change your password in OpusLex:\n"
            "1. Open Settings from the navigation sidebar.\n"
            "2. Select the 'Security' tab.\n"
            "3. Under 'Change Password', enter your Current Password.\n"
            "4. Enter your New Password (minimum 8 characters) and confirm it.\n"
            "5. Click 'Update Password'.\n\n"
            "Note: The backend verifies your current password before updating. If you signed in with Google OAuth or Apple Sign-In and do not have a local password, your credentials are authenticated by your external identity provider."
        ),
    },
]


def find_relevant_product_knowledge(query: str) -> list[dict]:
    """Finds matching product documentation topics ranked by relevance."""
    cleaned = query.strip().lower()
    words = set(re.findall(r"\b\w{3,}\b", cleaned))
    matches = []

    # Stop words that should not trigger general topic matches on their own
    generic_words = {"compliance", "legal", "what", "how", "can", "the", "and", "for", "with", "from", "about"}

    has_report_mention = bool(re.search(r"\breports?\b", cleaned))

    for topic in KNOWLEDGE_TOPICS:
        topic_id = topic.get("id")
        score = 0

        # Topic-specific domain gating:
        # A question without any mention of 'report' or 'reports' should not match the Reports topic
        if topic_id == "reports" and not has_report_mention:
            continue

        # Check explicit keywords
        for kw in topic["keywords"]:
            # Exact phrase match in query
            if re.search(r"\b" + re.escape(kw) + r"\b", cleaned):
                score += 8
            else:
                # Token match for multi-word phrases, excluding generic words
                kw_tokens = [w for w in re.findall(r"\b\w{3,}\b", kw) if w not in generic_words]
                if kw_tokens:
                    matches_in_kw = sum(1 for w in kw_tokens if w in words)
                    if matches_in_kw == len(kw_tokens):
                        score += 6
                    elif matches_in_kw > 0 and len(kw_tokens) > 1:
                        score += 2

        # Check topic title
        title_tokens = [w for w in re.findall(r"\b\w{3,}\b", topic["title"].lower()) if w not in generic_words]
        for w in title_tokens:
            if re.search(r"\b" + re.escape(w) + r"\b", cleaned):
                score += 3

        if score > 0:
            matches.append((score, topic))

    matches.sort(key=lambda x: x[0], reverse=True)
    return [t for _, t in matches]


FAQ_SUGGESTIONS_TEXT = (
    "Here are some common questions you can ask me about OpusLex:\n\n"
    "1. **Policies:** How do I create and manage policies?\n"
    "2. **Reports:** How do I generate and interpret compliance reports?\n"
    "3. **Documents:** How do I upload and analyze documents?\n"
    "4. **Investigations:** How do I create an investigation and run a compliance analysis?\n"
    "5. **Research:** What is the difference between Research and Investigations?\n"
    "6. **AI Agents:** How do I run an AI compliance agent and interpret its findings?\n"
    "7. **Audit & Findings:** Where can I review compliance findings and risk scores?\n\n"
    "Choose a question above or type your own question."
)

_FAQ_INTENT_PATTERNS = [
    r"\bhelp\b.*\bwith\b.*\bfaq\b",
    r"\bshow\b.*\bfaq\b",
    r"\blist\b.*\bfaq\b",
    r"\bview\b.*\bfaq\b",
    r"^faq(s)?$",
    r"\bwhat\b.*\b(can|do)\b.*\byou\b.*\bhelp\b.*\bwith\b",
    r"\bhow\b.*\bcan\b.*\byou\b.*\bhelp\b",
    r"\bsuggest\b.*\b(questions|topics|queries)\b",
    r"\bwhat\b.*\b(should|can)\b.*\bi\b.*\bask\b",
    r"\bsuggested\b.*\bquestions\b",
]


def is_faq_suggestion_intent(query: str) -> bool:
    """Checks whether the user is asking for general FAQ suggestions or a list of questions."""
    cleaned = query.strip().lower()
    for pattern in _FAQ_INTENT_PATTERNS:
        if re.search(pattern, cleaned):
            return True
    return False


def generate_knowledge_answer(query: str) -> str:
    """
    Generates a clear, grounded answer from OpusLex product knowledge.
    Handles single-topic, multi-part, FAQ suggestions, or unrecognized questions safely.
    """
    if is_faq_suggestion_intent(query):
        return FAQ_SUGGESTIONS_TEXT

    # Explicit password disambiguation check
    from app.services.intent_service import classify_password_query
    pwd_type = classify_password_query(query)
    if pwd_type == "policy":
        for t in KNOWLEDGE_TOPICS:
            if t["id"] == "password_policy":
                return t["summary"]
    elif pwd_type == "change":
        for t in KNOWLEDGE_TOPICS:
            if t["id"] == "password_change":
                return t["summary"]

    relevant = find_relevant_product_knowledge(query)

    if not relevant:
        return (
            f"I could not find documented information in OpusLex regarding '{query}'.\n\n"
            "OpusLex specializes in legal and compliance research, investigations, corporate policies, "
            "document analysis, and compliance audit reporting. "
            "Could you clarify which part of OpusLex you would like help with (for example: Policies, Reports, Investigations, Documents, or AI Agents)?"
        )

    cleaned = query.strip().lower()
    # Check if the query genuinely asks a multi-topic question
    is_multi_topic = bool(
        re.search(
            r"\b(and|as well as|both|also|along with|versus|vs|difference between)\b",
            cleaned,
        )
    )

    # Combine topics only when genuinely requested and when distinct topics exist
    if is_multi_topic and len(relevant) >= 2:
        top_two = relevant[:2]
        # Never append Reports to Agents unless 'report' was explicitly requested
        if top_two[0]["id"] == "agents" and top_two[1]["id"] == "reports" and "report" not in cleaned:
            return top_two[0]["summary"]

        return (
            f"### {top_two[0]['title']}\n{top_two[0]['summary']}\n\n"
            f"### {top_two[1]['title']}\n{top_two[1]['summary']}"
        )

    # Single primary topic
    top = relevant[0]
    return top["summary"]
