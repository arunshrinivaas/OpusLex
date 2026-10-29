"""
Intent Classification, Deterministic Arithmetic Evaluation, and Ambiguity Detection Service.

Provides centralized query understanding across General AI, Research,
Investigation RAG, and Themis Assistant.
"""

from __future__ import annotations

import re
from typing import Any


def evaluate_arithmetic_query(query: str) -> tuple[bool, str | None, float | int | None]:
    """
    Evaluates arithmetic questions deterministically.
    Supports percentages (e.g. 'What is 18% of 2,500?') and basic expressions.
    Returns: (is_arithmetic, explanation_text, numeric_result)
    """
    cleaned = query.strip()
    
    # 1. Percentage patterns: e.g. "What is 18% of 2,500?" or "18% of 2500"
    pct_match = re.search(
        r"(?:what\s+is\s+|calculate\s+)?([\d\.]+)\s*%\s*(?:of)\s*([\d\.,]+)",
        cleaned,
        re.IGNORECASE,
    )
    if pct_match:
        try:
            pct_val = float(pct_match.group(1))
            num_str = pct_match.group(2).replace(",", "")
            num_val = float(num_str)
            result = (pct_val / 100.0) * num_val
            # Clean integer format if whole number
            formatted_res = int(result) if result.is_integer() else round(result, 4)
            formatted_num = int(num_val) if num_val.is_integer() else num_val
            explanation = (
                f"{pct_val:g}% of {formatted_num:,} is {formatted_res:,}. "
                f"Calculation: ({formatted_num:,} × {pct_val:g} / 100 = {formatted_res:,})."
            )
            return True, explanation, formatted_res
        except Exception:
            pass

    # 2. Simple arithmetic operations: e.g. "What is 25 * 40?" or "calculate 1200 + 350"
    math_match = re.search(
        r"^(?:what\s+is\s+|calculate\s+)?([\d\.,\s\+\-\*\/\(\)]+)$",
        cleaned,
        re.IGNORECASE,
    )
    if math_match:
        expr = math_match.group(1).replace(",", "").strip()
        # Security: only allow basic numbers and math operators
        if re.match(r"^[\d\s\+\-\*\/\(\)\.]+$", expr) and any(op in expr for op in "+-*/"):
            try:
                # Safe evaluation of basic arithmetic
                result = eval(expr, {"__builtins__": {}}, {})
                if isinstance(result, (int, float)):
                    formatted_res = int(result) if isinstance(result, float) and result.is_integer() else result
                    return True, f"The result of {expr} is {formatted_res}.", formatted_res
            except Exception:
                pass

    return False, None, None


def extract_clause_or_section(query: str) -> str | None:
    """Extracts clause or section identifier from query (e.g. 'clause 8.2', 'section 4.1')."""
    match = re.search(
        r"\b(?:clause|section|article|paragraph)\s*([0-9]+(?:\.[0-9]+)*)\b",
        query,
        re.IGNORECASE,
    )
    if match:
        return match.group(0).strip()
    return None


def extract_identity_or_name_query(query: str) -> tuple[bool, str]:
    """
    Detects if the query asks for the identity, name, role, or capabilities of the AI assistant or agent.
    Returns: (is_identity, target_entity: 'themis' | 'agent' | 'opuslex')
    """
    lower = query.lower().strip()
    # Inquiries about assistant or agent's name or identity
    if re.search(r"\b(what('s| is| are)|who('s| is| are))\s+(?:the\s+)?(?:ai\s+)?(?:assistant('s)?|agent('s)?|bot('s)?)(?:\s+name)?\b", lower):
        return True, "assistant_name"
    # Direct questions to the model: "what are you", "who are you", "what is your name", "what is your identity", "how can you help me inside opuslex"
    if (
        re.search(r"\b(what('s| is)|who('s| is))\s+your\s+(?:name|identity|role|purpose|system\s+purpose)\b", lower)
        or re.search(r"\bwho\s+are\s+you\b", lower)
        or re.search(r"\bwhat\s+are\s+you\b", lower)
        or re.search(r"\bwhat\s+are\s+you\s+called\b", lower)
        or re.search(r"\bwhat\s+(?:should|can|do)\s+i\s+call\s+you\b", lower)
        or re.search(r"\bintroduce\s+yourself\b", lower)
        or re.search(r"\bmay\s+i\s+know\s+your\s+name\b", lower)
        or re.search(r"\bwhat\s+is\s+your\s+(?:role|identity|purpose)\b", lower)
        or re.search(r"\bwhat\s+is\s+your\s+identity\s+and\s+(?:system\s+)?purpose\b", lower)
    ):
        return True, "themis"
    if re.search(r"\b(who|what)\s+is\s+themis\b", lower):
        return True, "themis"
    if (
        re.search(r"\bwhat\s+can\s+you\s+do\b", lower)
        or re.search(r"\bwhat\s+are\s+your\s+capabilities\b", lower)
        or re.search(r"\bhow\s+can\s+you\s+help\s+(?:me\s+)?(?:inside\s+opuslex\b|with\b|\b)?", lower)
        or re.search(r"\bwhat\s+can\s+you\s+help\s+(?:me\s+)?with\b", lower)
    ):
        return True, "themis"
    return False, ""


def is_broad_document_query(query: str) -> bool:
    """
    Detects inquiries asking what the available documents say or requesting a broad summary of documents,
    as opposed to specific clause lookups or asking how to upload documents.
    E.g. "What do the documents say?", "What is in my documents?", "Summarize the documents".
    """
    lower = query.lower().strip()
    # Explicit upload instructions are not broad document content questions
    if any(w in lower for w in ["upload", "how to", "how do i", "how can i", "attach", "add document"]):
        return False

    broad_patterns = [
        r"\bwhat\s+do\s+(?:the|my|all|our|these)?\s*documents?\s+say\b",
        r"\bwhat\s+does\s+(?:the|my|all|our|these)?\s*documents?\s+say\b",
        r"\bwhat\s+is\s+(?:in|inside)\s+(?:the|my|all|our|these)?\s*documents?\b",
        r"\bsummarize\s+(?:the|my|all|our|these)?\s*documents?\b",
        r"\boverview\s+of\s+(?:the|my|all|our|these)?\s*documents?\b",
        r"\bwhat\s+(?:information|content)\s+is\s+in\s+(?:the|my|all|our|these)?\s*documents?\b",
        r"\btell\s+me\s+about\s+(?:the|my|all|our|these)?\s*documents?\b",
    ]
    return any(re.search(pat, lower) for pat in broad_patterns)


def classify_password_query(query: str) -> str | None:
    """
    Distinguishes between:
    - 'policy': questions asking about password characteristics, requirements, strength, rules, standards,
                e.g. 'What does a strong password look like for OpusLex?', 'password requirements', 'rules for password'
    - 'change': questions asking how to change, reset, update, or navigate to password settings,
                e.g. 'How do I change my password?', 'where to change password', 'reset password'
    Returns: 'policy' | 'change' | None
    """
    lower = query.lower().strip()
    if "password" not in lower:
        return None

    policy_patterns = [
        r"\b(strong|good|secure|valid|proper)\s+password\b",
        r"\bpassword\s+(?:requirements?|rules?|criteria|standards?|policy|length|strength|format)\b",
        r"\bwhat\s+(?:does\s+a\s+strong|is\s+a\s+strong|makes\s+a\s+strong)\s+password\b",
        r"\bwhat\s+(?:are\s+the|is\s+the)\s+(?:requirements?|rules?|criteria)\s+for\s+(?:a\s+)?password\b",
        r"\bhow\s+strong\b",
        r"\bpassword\s+(?:look\s+like|must\s+be|should\s+be)\b",
        r"\bminimum\s+(?:length|characters?)\b",
    ]
    if any(re.search(pat, lower) for pat in policy_patterns):
        return "policy"

    change_patterns = [
        r"\b(change|reset|update|modify|edit)\s+(?:my\s+)?password\b",
        r"\bhow\s+(?:do|can|to)\s+(?:i\s+)?(?:change|reset|update)\s+password\b",
        r"\bwhere\s+(?:can|do|to)\s+(?:i\s+)?(?:change|reset|update)\s+password\b",
    ]
    if any(re.search(pat, lower) for pat in change_patterns):
        return "change"

    return "policy" if any(w in lower for w in ["what", "how", "rule", "strong"]) else "change"


def extract_document_mention(query: str) -> str | None:
    """
    Extracts explicit document names, file extensions, or document type keywords.
    E.g. 'agreement.pdf', 'uploaded agreement', 'vendor agreement', 'policy.pdf'.
    """
    # 1. Filename pattern
    fn_match = re.search(r"\b([a-zA-Z0-9_\-]+\.(?:pdf|docx|txt|doc|csv))\b", query, re.IGNORECASE)
    if fn_match:
        return fn_match.group(1).strip()

    # If it's a broad document query (e.g. "What do the documents say?"), don't treat it as an explicit single-document mention
    if is_broad_document_query(query):
        return None

    # 2. Document references with demonstratives or specific document types
    doc_type_patterns = [
        r"\b(?:this|the|that|our)\s+(?:uploaded\s+|attached\s+|relevant\s+)?(agreement|contract|nda|policy|standard|procedure)\b",
        r"\b(?:uploaded|attached)\s+(agreement|contract|nda|policy|standard|procedure)\b",
        r"\b(vendor\s+agreement|employment\s+agreement|confidentiality\s+agreement|master\s+services\s+agreement)\b",
        r"\b(privacy\s+policy|security\s+policy|retention\s+policy|compliance\s+policy)\b",
        r"\b(?:this|that)\s+(document|file)\b",
    ]
    for pattern in doc_type_patterns:
        match = re.search(pattern, query, re.IGNORECASE)
        if match:
            return match.group(1).strip() if match.lastindex and match.lastindex >= 1 else match.group(0).strip()

    return None


def check_unresolved_ambiguity(
    query: str,
    context_text: str = "",
    investigation_title: str = "",
    attached_docs: list[dict] | None = None,
) -> tuple[bool, str | None]:
    """
    Checks for ambiguous queries with unresolved acronyms or references
    such as 'What does CM say about these establishments?'.
    Returns: (is_ambiguous, clarification_prompt)
    """
    lower_q = query.lower()
    
    # Check for pattern: 2-3 uppercase letters as subject + ambiguous target
    acronym_match = re.search(r"\b([A-Z]{2,4})\b", query)
    has_ambiguous_target = bool(
        re.search(r"\b(these\s+(?:establishments|entities|organizations|parties|cases|matters)|this\s+establishment)\b", lower_q)
    )

    if acronym_match and has_ambiguous_target:
        acronym = acronym_match.group(1)
        # Verify if acronym or target is defined anywhere in the available context
        combined_context = f"{investigation_title} {context_text}".lower()
        if attached_docs:
            for d in attached_docs:
                combined_context += f" {d.get('title', '')} {d.get('filename', '')}".lower()

        if acronym.lower() not in combined_context:
            clarification = (
                f"Could you please clarify what '{acronym}' stands for and which specific "
                f"establishments you are inquiring about? Neither '{acronym}' nor these establishments "
                f"could be identified in the current investigation documents or context."
            )
            return True, clarification

    return False, None


def classify_query(
    query: str,
    investigation_id: int | None = None,
    context_text: str = "",
    investigation_title: str = "",
    attached_docs: list[dict] | None = None,
) -> dict[str, Any]:
    """
    Central classifier returning the query classification and metadata.
    Distinguishes calculations, ambiguities, identity, document overview, password policy vs change,
    document/compliance RAG, product guidance, and general open-domain knowledge.
    """
    # 1. Arithmetic check
    is_arithmetic, calc_exp, calc_res = evaluate_arithmetic_query(query)
    if is_arithmetic:
        return {
            "intent": "calculation",
            "calculation_explanation": calc_exp,
            "calculation_result": calc_res,
            "document_mention": None,
            "clause_mention": None,
            "is_ambiguous": False,
            "clarification_prompt": None,
        }

    # 2. Ambiguity check
    is_ambiguous, clarification = check_unresolved_ambiguity(
        query=query,
        context_text=context_text,
        investigation_title=investigation_title,
        attached_docs=attached_docs,
    )
    if is_ambiguous:
        return {
            "intent": "ambiguous",
            "calculation_explanation": None,
            "calculation_result": None,
            "document_mention": extract_document_mention(query),
            "clause_mention": extract_clause_or_section(query),
            "is_ambiguous": True,
            "clarification_prompt": clarification,
        }

    # 3. Identity and capabilities inquiry check
    is_id, target_entity = extract_identity_or_name_query(query)
    if is_id:
        return {
            "intent": "identity",
            "target_entity": target_entity,
            "calculation_explanation": None,
            "calculation_result": None,
            "document_mention": None,
            "clause_mention": None,
            "is_ambiguous": False,
            "clarification_prompt": None,
        }

    # 4. Password inquiries (distinguish characteristics/requirements from change instructions)
    pwd_type = classify_password_query(query)
    if pwd_type:
        return {
            "intent": "help_password_policy" if pwd_type == "policy" else "help_password_change",
            "password_query_type": pwd_type,
            "calculation_explanation": None,
            "calculation_result": None,
            "document_mention": None,
            "clause_mention": None,
            "is_ambiguous": False,
            "clarification_prompt": None,
        }

    # 5. Broad document overview inquiry
    if is_broad_document_query(query):
        return {
            "intent": "document_overview",
            "calculation_explanation": None,
            "calculation_result": None,
            "document_mention": None,
            "clause_mention": None,
            "is_ambiguous": False,
            "clarification_prompt": None,
        }

    clause_mention = extract_clause_or_section(query)
    doc_mention = extract_document_mention(query)
    lower_q = query.lower().strip()

    # 6. Explicit Document, Clause, or Investigation scope
    # Only classify as document_rag if there is an explicit doc/clause mention or document-specific keywords
    has_inv_keywords = (
        investigation_id is not None
        and any(w in lower_q for w in ["evidence", "finding", "allegation", "case", "subject", "matter", "agreement", "contract", "clause", "policy", "witness", "record"])
    )
    if doc_mention or clause_mention or has_inv_keywords:
        return {
            "intent": "document_rag",
            "calculation_explanation": None,
            "calculation_result": None,
            "document_mention": doc_mention,
            "clause_mention": clause_mention,
            "is_ambiguous": False,
            "clarification_prompt": None,
        }

    # 7. Internal Corporate Compliance / Policy / Audit Queries
    internal_compliance_patterns = [
        r"\b(?:our|company|internal|organization(?:'s)?)\s+(?:\w+\s+)?(?:compliance|policy|policies|audit|controls?|regulations?)\b",
        r"\b(?:audit\s+finding|compliance\s+status|evidence\s+gap)\b",
        r"\b(?:data\s+retention\s+schedule|aml\s+policy|travel\s+policy|remote\s+work\s+policy)\b",
    ]
    if any(re.search(pat, lower_q) for pat in internal_compliance_patterns):
        return {
            "intent": "document_rag",
            "calculation_explanation": None,
            "calculation_result": None,
            "document_mention": None,
            "clause_mention": None,
            "is_ambiguous": False,
            "clarification_prompt": None,
        }

    # 8. Product Help / Navigation Queries (How to use OpusLex, Settings, etc.)
    from app.services.help_knowledge import is_faq_suggestion_intent
    if is_faq_suggestion_intent(query) or (
        ("how do i" in lower_q or "how to" in lower_q or "where is" in lower_q or "where can i" in lower_q)
        and any(w in lower_q for w in ["settings", "policy", "investigation", "report", "opuslex", "profile", "preference", "account", "upload"])
    ):
        return {
            "intent": "help_faq",
            "calculation_explanation": None,
            "calculation_result": None,
            "document_mention": None,
            "clause_mention": None,
            "is_ambiguous": False,
            "clarification_prompt": None,
        }

    # 9. Default: General Knowledge, Reasoning, Coding, Science, Creative, Planning
    return {
        "intent": "general_knowledge",
        "calculation_explanation": None,
        "calculation_result": None,
        "document_mention": None,
        "clause_mention": None,
        "is_ambiguous": False,
        "clarification_prompt": None,
    }

