import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
    Activity,
    ArrowUp,
    CheckCircle2,
    ChevronRight,
    FileText,
    Eye,
    Trash2,
    X,
    MessageCircle,
    MoreHorizontal,
    Paperclip,
    Upload,
    HardDrive,
    Cloud,
    Search,
    ShieldAlert,
    Sparkles,
    Users,
} from "lucide-react"
import { normalizeApiError, safeString } from "../utils/errorUtils"

type Document = {
    id: number
    title: string
    filename: string
    document_type: string
    jurisdiction: string
    description: string | null
    user_id: number
    uploaded_at: string | null
    chunks: number
    embedded_chunks: number
    processing_status: string
    file_hash?: string
}

type RagSource = {
    document_id: number
    document_title: string
    filename: string
    chunk: number
    distance: number
}

type ComparisonSource = {
    document_id: number
    document_title: string
    filename: string
    chunk: number
    distance: number
}

type ComparisonResult = {
    investigation_id: number
    question: string
    // Ordered list of all compared documents with their deterministic labels (A, B, C…)
    documents: Array<{ label: string; id: number; title: string; filename: string; jurisdiction: string }>
    comparison: string
    // Keyed by "document_a", "document_b", "document_c", … matching the label
    sources: Record<string, ComparisonSource[]>
}

type Investigation = {
    id: number
    title: string
    description: string | null
    status: string
    user_id: number
    review_status: string | null
    reviewer_id: number | null
    reviewed_at: string | null
}

type InvestigationQuery = {
    id: number
    investigation_id: number
    question: string
    answer: string | null
    created_at: string
}

type CommentData = {
    id: number
    investigation_id: number
    user_id: number
    text: string
    created_at: string
}

type AgentEvidence = {
    claim?: string
    source_document?: string
    source_section_or_chunk?: string
    supporting_text?: string
    // Legacy fallbacks:
    document_id?: number
    document_title?: string
    filename?: string
    text_snippet?: string
}

type AgentConflict = {
    description?: string
    documents?: string[]
    relationship?: string
    // Legacy fallback:
    conflicting_documents?: string[]
}

type AgentEvidenceGap = {
    description?: string
    why_it_matters?: string
    // Legacy fallback:
    missing_information?: string
    impact_on_investigation?: string
}

type AgentRequirement = {
    requirement?: string
    source_document?: string
    source_section_or_chunk?: string
}

type AgentAction = {
    action?: string
    rationale?: string
    // Legacy fallback:
    reason?: string
}

type AgentCitation = {
    source_document?: string
    source_section_or_chunk?: string
    // Legacy fallback:
    document_id?: number
    chunk?: number
    text?: string
}

type AgentRunResponse = {
    id: number
    investigation_id: number
    user_id: number
    question: string
    status: string
    finding: string
    evidence: AgentEvidence[]
    conflicts: AgentConflict[]
    evidence_gaps: AgentEvidenceGap[]
    applicable_requirements: AgentRequirement[]
    suggested_actions: AgentAction[]
    citations: AgentCitation[]
    risk_score: number | null
    risk_level: string | null
    created_at: string
}


function Investigations() {
    const { t } = useTranslation()
    const [investigations, setInvestigations] = useState<Investigation[]>([])
    const [selectedInvestigation, setSelectedInvestigation] =
        useState<Investigation | null>(null)

    const [loadingInvestigations, setLoadingInvestigations] = useState(true)
    const [investigationMessage, setInvestigationMessage] = useState("")

    const [investigationDocuments, setInvestigationDocuments] = useState<Document[]>([])
    const [loadingInvestigationDocuments, setLoadingInvestigationDocuments] = useState(false)
    const [availableDocuments, setAvailableDocuments] = useState<Document[]>([])
    const [showAttachmentMenu, setShowAttachmentMenu] = useState(false)
    const [attachingDocumentId, setAttachingDocumentId] = useState<number | null>(null)
    const [uploadingDocument, setUploadingDocument] = useState(false)
    const [message, setMessage] = useState("")

    const [newTitle, setNewTitle] = useState("")
    const [newDescription, setNewDescription] = useState("")
    const [creatingInvestigation, setCreatingInvestigation] = useState(false)

    const [question, setQuestion] = useState("")
    const [answer, setAnswer] = useState("")
    const [sources, setSources] = useState<RagSource[]>([])
    const [ragLoading, setRagLoading] = useState(false)
    const [researchHistory, setResearchHistory] = useState<InvestigationQuery[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [deletingDocumentId, setDeletingDocumentId] = useState<number | null>(null)
    const [detachingDocumentId, setDetachingDocumentId] = useState<number | null>(null)
    const [previewDocument, setPreviewDocument] = useState<Document | null>(null)
    const [previewUrl, setPreviewUrl] = useState<string | null>(null)
    const [previewLoading, setPreviewLoading] = useState(false)

    const [duplicateMessage, setDuplicateMessage] = useState(false)
    const [duplicateToastClosing, setDuplicateToastClosing] = useState(false)

    const [expandedHistoryId, setExpandedHistoryId] = useState<number | null>(null)

    const [shareModalOpen, setShareModalOpen] = useState(false)
    const [shareTitle, setShareTitle] = useState("")
    const [shareContent, setShareContent] = useState("")
    const [shareSource, setShareSource] = useState("")
    const [sharingKnowledge, setSharingKnowledge] = useState(false)
    // ---------------------------------------------------------
    // Comments state
    // ---------------------------------------------------------
    const [comments, setComments] = useState<CommentData[]>([])
    const [loadingComments, setLoadingComments] = useState(false)
    const [newCommentText, setNewCommentText] = useState("")
    const [submittingComment, setSubmittingComment] = useState(false)
    // ---------------------------------------------------------
    // Agent state
    // ---------------------------------------------------------
    const [agentQuestion, setAgentQuestion] = useState("")
    const [agentLoading, setAgentLoading] = useState(false)
    const [agentRuns, setAgentRuns] = useState<AgentRunResponse[]>([])
    const [loadingAgentRuns, setLoadingAgentRuns] = useState(false)
    const [agentRunsError, setAgentRunsError] = useState("")
    const [agentError, setAgentError] = useState("")
    const [expandedAgentRunId, setExpandedAgentRunId] = useState<number | null>(null)

    // ---------------------------------------------------------
    // Regulatory Comparison state
    // ---------------------------------------------------------
    const [compareQuestion, setCompareQuestion] = useState("")
    const [compareLoading, setCompareLoading] = useState(false)
    const [compareResult, setCompareResult] = useState<ComparisonResult | null>(null)
    const [compareError, setCompareError] = useState("")

    // ---------------------------------------------------------
    // Lifecycle state
    // ---------------------------------------------------------
    const [editInvestigationId, setEditInvestigationId] = useState<number | null>(null)
    const [editInvestigationTitle, setEditInvestigationTitle] = useState("")
    const [editInvestigationDescription, setEditInvestigationDescription] = useState("")
    const [editingInvestigation, setEditingInvestigation] = useState(false)

    // Review Modal State
    const [reviewModalOpen, setReviewModalOpen] = useState(false)
    const [reviewDecision, setReviewDecision] = useState<"Approved" | "Rejected" | null>(null)
    const [reviewReason, setReviewReason] = useState("")
    const [submittingReview, setSubmittingReview] = useState(false)
    const [reviewError, setReviewError] = useState("")

    const [archivingInvestigation, setArchivingInvestigation] = useState(false)

    const [deleteInvestigationId, setDeleteInvestigationId] = useState<number | null>(null)
    const [deletingInvestigation, setDeletingInvestigation] = useState(false)

    // ---------------------------------------------------------
    // Collaboration state
    // ---------------------------------------------------------
    const [collaborators, setCollaborators] = useState<{id: number, user_id: number, role: string, initials: string, email: string}[]>([])
    const [addingCollaborator, setAddingCollaborator] = useState(false)
    const [newCollabUserId, setNewCollabUserId] = useState("")

    const [livePresence, setLivePresence] = useState<{user_id: number, initials: string, is_current_user?: boolean}[]>([])

    const [showArchives, setShowArchives] = useState(false)

    const [activeMenuId, setActiveMenuId] = useState<string | number | null>(null)



    const submitComment = async () => {
        if (!newCommentText.trim() || !selectedInvestigation || submittingComment) return

        const token = localStorage.getItem("access_token")

        if (!token) {
            return
        }

        setSubmittingComment(true)

        try {
            const response = await fetch(
                `http://127.0.0.1:8000/api/v1/investigations/${selectedInvestigation.id}/comments`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        text: newCommentText.trim()
                    }),
                }
            )

            if (!response.ok) {
                return
            }

            const newComment = await response.json()
            setComments((prev) => [...prev, newComment])
            setNewCommentText("")
        } catch {
            // Error handled implicitly
        } finally {
            setSubmittingComment(false)
        }
    }

    const runAgent = async () => {
        if (!agentQuestion.trim() || !selectedInvestigation) return

        setAgentLoading(true)
        setAgentError("")

        try {
            const token = localStorage.getItem("access_token")
            const response = await fetch(
                `http://127.0.0.1:8000/api/v1/agents/investigations/${selectedInvestigation.id}/run`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ question: agentQuestion }),
                }
            )

            if (!response.ok) {
                const errData = await response.json().catch(() => null)
                throw new Error(normalizeApiError(errData, "Failed to run agent"))
            }

            const data: AgentRunResponse = await response.json()
            setAgentRuns((prev) => [data, ...prev])
            setAgentQuestion("")
            setExpandedAgentRunId(data.id)
        } catch (err: any) {
            setAgentError(err.message || "Failed to run agent")
        } finally {
            setAgentLoading(false)
        }
    }

    const refreshAvailableDocuments = async () => {
        const token = localStorage.getItem("access_token")
        if (!token) return

        try {
            const response = await fetch(
                "http://127.0.0.1:8000/api/v1/documents/",
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            )

            if (!response.ok) return

            const data = await response.json()
            setAvailableDocuments(data.items || [])
        } catch {
            // Keep current UI state if refresh fails.
        }
    }

    const refreshInvestigationDocuments = async (investigationId?: number) => {
        const id = investigationId ?? selectedInvestigation?.id
        const token = localStorage.getItem("access_token")

        if (!id || !token) {
            setInvestigationDocuments([])
            return
        }

        try {
            const response = await fetch(
                `http://127.0.0.1:8000/api/v1/investigations/${id}/documents`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            )

            if (!response.ok) return

            const data = await response.json()
            setInvestigationDocuments(data)
        } catch {
            // Keep current UI state if refresh fails.
        }
    }

    useEffect(() => {
        const token = localStorage.getItem("access_token")

        if (!token) {
            setInvestigationMessage("Authentication required")
            setLoadingInvestigations(false)
            return
        }

        const loadInvestigations = async () => {
            try {
                const response = await fetch(
                    "http://127.0.0.1:8000/api/v1/investigations/",
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                )

                const data = await response.json()

                if (!response.ok) {
                    setInvestigationMessage(
                        data.detail || "Unable to load investigations"
                    )
                    return
                }

                setInvestigations(data)

                if (data.length > 0) {
                    setSelectedInvestigation(data[0])
                }
            } catch {
                setInvestigationMessage("Unable to connect to the backend")
            } finally {
                setLoadingInvestigations(false)
            }
        }

        const loadAvailableDocuments = async () => {
            try {
                const response = await fetch(
                    "http://127.0.0.1:8000/api/v1/documents/",
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                )

                const data = await response.json()

                if (response.ok) {
                    setAvailableDocuments(data.items || [])
                }
            } catch {
                // Keep the investigation usable if document loading fails.
            }
        }

        loadInvestigations()
        loadAvailableDocuments()
    }, [])

    useEffect(() => {
        const loadInvestigationDocuments = async () => {
            if (!selectedInvestigation) {
                setInvestigationDocuments([])
                return
            }

            const token = localStorage.getItem("access_token")

            if (!token) {
                setInvestigationDocuments([])
                return
            }

            setLoadingInvestigationDocuments(true)

            try {
                const response = await fetch(
                    `http://127.0.0.1:8000/api/v1/investigations/${selectedInvestigation.id}/documents`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                )

                const data = await response.json()

                if (!response.ok) {
                    setInvestigationDocuments([])
                    return
                }

                setInvestigationDocuments(data)
            } catch {
                setInvestigationDocuments([])
            } finally {
                setLoadingInvestigationDocuments(false)
            }
        }

        loadInvestigationDocuments()
    }, [selectedInvestigation])

    const fetchCollaborators = async () => {
        if (!selectedInvestigation) return
        try {
            const token = localStorage.getItem("access_token")
            const res = await fetch(`http://127.0.0.1:8000/api/v1/investigations/${selectedInvestigation.id}/collaborators`, {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                setCollaborators(data)
            }
        } catch (e) {
            console.error(e)
        }
    }

    const handleAddCollaborator = async () => {
        if (!newCollabUserId.trim() || !selectedInvestigation || addingCollaborator) return
        setAddingCollaborator(true)
        try {
            const token = localStorage.getItem("access_token")
            const res = await fetch(`http://127.0.0.1:8000/api/v1/investigations/${selectedInvestigation.id}/collaborators`, {
                method: "POST",
                headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                body: JSON.stringify({ user_id: parseInt(newCollabUserId), role: "Collaborator" })
            })
            if (res.ok) {
                setNewCollabUserId('')
                fetchCollaborators()
            } else {
                const data = await res.json()
                alert(data.detail || "Failed to add collaborator")
            }
        } catch (e) {
            console.error(e)
            alert("Error adding collaborator")
        } finally {
            setAddingCollaborator(false)
        }
    }

    const handleRemoveCollaborator = async (collabId: number) => {
        if (!selectedInvestigation) return
        try {
            const token = localStorage.getItem("access_token")
            const res = await fetch(`http://127.0.0.1:8000/api/v1/investigations/${selectedInvestigation.id}/collaborators/${collabId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                fetchCollaborators()
            } else {
                const data = await res.json()
                alert(data.detail || "Failed to remove collaborator")
            }
        } catch (e) {
            console.error(e)
            alert("Error removing collaborator")
        }
    }

    useEffect(() => {
        const handleClickOutside = () => {
            if (activeMenuId !== null) setActiveMenuId(null)
        }
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && activeMenuId !== null) setActiveMenuId(null)
        }
        document.addEventListener('click', handleClickOutside)
        document.addEventListener('keydown', handleKeyDown)
        return () => {
            document.removeEventListener('click', handleClickOutside)
            document.removeEventListener('keydown', handleKeyDown)
        }
    }, [activeMenuId])

    useEffect(() => {
        if (selectedInvestigation) {
            fetchCollaborators()
        } else {
            setCollaborators([])
        }
    }, [selectedInvestigation])

    useEffect(() => {
        let presenceInterval: number | null = null

        const fetchPresence = async () => {
            if (!selectedInvestigation) return
            try {
                const token = localStorage.getItem("access_token")
                const res = await fetch(`http://127.0.0.1:8000/api/v1/investigations/${selectedInvestigation.id}/presence`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                if (res.ok) {
                    const data = await res.json()
                    setLivePresence(data)
                } else {
                    setLivePresence([])
                }
            } catch (e) {
                console.error(e)
                setLivePresence([])
            }
        }

        if (selectedInvestigation) {
            fetchPresence()
            presenceInterval = setInterval(fetchPresence, 15000)
        } else {
            setLivePresence([])
        }

        return () => {
            if (presenceInterval) clearInterval(presenceInterval)
        }
    }, [selectedInvestigation])

    useEffect(() => {
        const loadResearchHistory = async () => {
            if (!selectedInvestigation) {
                setResearchHistory([])
                setLoadingHistory(false)
                return
            }

            const token = localStorage.getItem("access_token")

            if (!token) {
                setResearchHistory([])
                setLoadingHistory(false)
                return
            }

            setLoadingHistory(true)

            try {
                const response = await fetch(
                    `http://127.0.0.1:8000/api/v1/investigations/${selectedInvestigation.id}/queries`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                )

                const data = await response.json()

                if (!response.ok) {
                    setResearchHistory([])
                    return
                }

                setResearchHistory(data)
            } catch {
                setResearchHistory([])
            } finally {
                setLoadingHistory(false)
            }
        }

        const loadComments = async () => {
            if (!selectedInvestigation) {
                setComments([])
                setLoadingComments(false)
                return
            }

            const token = localStorage.getItem("access_token")

            if (!token) {
                setComments([])
                setLoadingComments(false)
                return
            }

            setLoadingComments(true)

            try {
                const response = await fetch(
                    `http://127.0.0.1:8000/api/v1/investigations/${selectedInvestigation.id}/comments`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                )

                const data = await response.json()

                if (!response.ok) {
                    setComments([])
                    return
                }

                setComments(data)
            } catch {
                setComments([])
            } finally {
                setLoadingComments(false)
            }
        }

        const loadAgentRuns = async () => {
            if (!selectedInvestigation) {
                setAgentRuns([])
                setLoadingAgentRuns(false)
                return
            }

            const token = localStorage.getItem("access_token")
            if (!token) {
                setAgentRuns([])
                setLoadingAgentRuns(false)
                return
            }

            setLoadingAgentRuns(true)
            setAgentRunsError("")

            try {
                const response = await fetch(
                    `http://127.0.0.1:8000/api/v1/agents/runs?investigation_id=${selectedInvestigation.id}`,
                    {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                    }
                )

                if (!response.ok) {
                    const errData = await response.json().catch(() => null)
                    setAgentRunsError(normalizeApiError(errData, "Failed to load agent history"))
                    setAgentRuns([])
                    return
                }

                const data = await response.json()
                if (Array.isArray(data)) {
                    setAgentRuns(data)
                } else {
                    setAgentRuns([])
                }
            } catch (err: any) {
                setAgentRunsError(err.message || "Network error loading agent history")
                setAgentRuns([])
            } finally {
                setLoadingAgentRuns(false)
            }
        }

        loadResearchHistory()
        loadComments()
        loadAgentRuns()
    }, [selectedInvestigation])

    const createInvestigation = async () => {
        if (!newTitle.trim()) return

        const token = localStorage.getItem("access_token")

        if (!token) {
            setInvestigationMessage("Authentication required")
            return
        }

        setCreatingInvestigation(true)
        setInvestigationMessage("")

        try {
            const response = await fetch(
                "http://127.0.0.1:8000/api/v1/investigations/",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        title: newTitle.trim(),
                        description: newDescription.trim() || null,
                    }),
                }
            )

            const data = await response.json()

            if (!response.ok) {
                setInvestigationMessage(
                    data.detail || "Unable to create investigation"
                )
                return
            }

            setInvestigations((current) => [data, ...current])
            setSelectedInvestigation(data)
            setNewTitle("")
            setNewDescription("")
            setShowAttachmentMenu(true)
        } catch {
            setInvestigationMessage("Unable to connect to the backend")
        } finally {
            setCreatingInvestigation(false)
        }
    }

    const updateInvestigation = async () => {
        if (!editInvestigationId || !editInvestigationTitle.trim()) return

        const token = localStorage.getItem("access_token")
        if (!token) return

        setEditingInvestigation(true)

        try {
            const response = await fetch(
                `http://127.0.0.1:8000/api/v1/investigations/${editInvestigationId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        title: editInvestigationTitle.trim(),
                        description: editInvestigationDescription.trim() || null,
                    }),
                }
            )

            const data = await response.json()

            if (response.ok) {
                setInvestigations((current) =>
                    current.map((inv) => (inv.id === editInvestigationId ? data : inv))
                )
                if (selectedInvestigation?.id === editInvestigationId) {
                    setSelectedInvestigation(data)
                }
                setEditInvestigationId(null)
            }
        } catch {
            // keep state
        } finally {
            setEditingInvestigation(false)
        }
    }

    const updateInvestigationStatus = async (id: number, status: "Active" | "Archived") => {
        const token = localStorage.getItem("access_token")
        if (!token) return

        setArchivingInvestigation(true)

        try {
            const response = await fetch(
                `http://127.0.0.1:8000/api/v1/investigations/${id}/status`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ status }),
                }
            )

            const data = await response.json()

            if (response.ok) {
                setInvestigations((current) =>
                    current.map((inv) => (inv.id === id ? data : inv))
                )
                if (selectedInvestigation?.id === id) {
                    setSelectedInvestigation(data)
                }
            }
        } catch {
            // keep state
        } finally {
            setArchivingInvestigation(false)
        }
    }

    const deleteInvestigation = async () => {
        if (!deleteInvestigationId) return

        const token = localStorage.getItem("access_token")
        if (!token) return

        setDeletingInvestigation(true)

        try {
            const response = await fetch(
                `http://127.0.0.1:8000/api/v1/investigations/${deleteInvestigationId}`,
                {
                    method: "DELETE",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            )

            if (response.ok || response.status === 204) {
                setInvestigations((current) =>
                    current.filter((inv) => inv.id !== deleteInvestigationId)
                )
                if (selectedInvestigation?.id === deleteInvestigationId) {
                    setSelectedInvestigation(null)
                    setInvestigationDocuments([])
                    setResearchHistory([])
                    setAgentRuns([])
                }
                setDeleteInvestigationId(null)
            }
        } catch {
            // keep state
        } finally {
            setDeletingInvestigation(false)
        }
    }

    const uploadAndAttachDocument = async (file: File) => {
        if (!selectedInvestigation) {
            setMessage("Select or create an investigation before adding a new document.")
            return
        }

        const token = localStorage.getItem("access_token")

        if (!token) {
            setMessage("Authentication required")
            return
        }

        setUploadingDocument(true)
        setMessage("")

        try {
            const formData = new FormData()
            formData.append("file", file)

            const uploadResponse = await fetch(
                "http://127.0.0.1:8000/api/v1/documents/upload",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                    body: formData,
                }
            )

            const uploadData = await uploadResponse.json()

            if (!uploadResponse.ok) {
                setMessage(
                    uploadData.detail ||
                    uploadData.error ||
                    "Unable to upload document."
                )
                return
            }

            const documentId = Number(uploadData.document_id ?? uploadData.document?.id ?? uploadData.item?.id ?? uploadData.id)

            if (!documentId) {
                setMessage("Document uploaded, but the backend did not return a document ID.")
                return
            }

            // The backend prevents duplicate files in the library.
            // A duplicate upload is automatically skipped.
            await refreshAvailableDocuments()

            if (uploadData.duplicate === true) {
                setDuplicateToastClosing(false)
                setDuplicateMessage(true)

                window.setTimeout(() => {
                    setDuplicateToastClosing(true)
                }, 1200)

                window.setTimeout(() => {
                    setDuplicateMessage(false)
                    setDuplicateToastClosing(false)
                }, 1500)

                return
            }

            const attachResponse = await fetch(
                `http://127.0.0.1:8000/api/v1/investigations/${selectedInvestigation.id}/documents/${documentId}`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            )

            const attachData = await attachResponse.json()

            if (!attachResponse.ok) {
                setMessage(
                    attachData.detail ||
                    "Document uploaded, but could not be attached to this investigation."
                )
                return
            }

            await refreshAvailableDocuments()
            await refreshInvestigationDocuments(selectedInvestigation.id)

            setShowAttachmentMenu(true)
            setMessage(
                uploadData.duplicate
                    ? `${file.name} was already in the document library and is now attached.`
                    : `${file.name} added to this investigation.`
            )
        } catch {
            setMessage("Unable to connect to the backend.")
        } finally {
            setUploadingDocument(false)
        }
    }

    const openDeviceFilePicker = () => {
        document.getElementById("investigation-document-file-input")?.click()
    }

    const attachDocument = async (documentId: number) => {
        if (!selectedInvestigation) {
            setMessage("Select an investigation before attaching a document.")
            return
        }

        const token = localStorage.getItem("access_token")

        if (!token) {
            setMessage("Authentication required")
            return
        }

        // Prevent a second click while the request is in flight.
        if (attachingDocumentId === documentId) return

        setAttachingDocumentId(documentId)
        setMessage("")

        try {
            const response = await fetch(
                `http://127.0.0.1:8000/api/v1/investigations/${selectedInvestigation.id}/documents/${documentId}`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            )

            const raw = await response.text()
            let data: any = {}

            if (raw) {
                try {
                    data = JSON.parse(raw)
                } catch {
                    data = {}
                }
            }

            if (!response.ok) {
                if (response.status === 409) {
                    await refreshInvestigationDocuments(selectedInvestigation.id)
                    setMessage("This document is already attached to this investigation.")
                } else {
                    setMessage(
                        data.detail ||
                        `Unable to attach document (HTTP ${response.status}).`
                    )
                }
                return
            }

            // Update the investigation immediately from the API response so the
            // document appears without requiring a page refresh.
            if (data && data.id) {
                setInvestigationDocuments((current) => {
                    if (current.some((document) => document.id === data.id)) {
                        return current
                    }
                    return [data, ...current]
                })
            }

            await Promise.all([
                refreshInvestigationDocuments(selectedInvestigation.id),
                refreshAvailableDocuments(),
            ])

            setMessage("Document added to this investigation.")
            setShowAttachmentMenu(true)
        } catch (error) {
            console.error("attachDocument failed", error)
            setMessage("Unable to connect to the backend while attaching the document.")
        } finally {
            setAttachingDocumentId(null)
        }
    }

    const detachDocument = async (documentId: number) => {
        if (!selectedInvestigation) return

        const token = localStorage.getItem("access_token")
        if (!token) {
            setMessage("Authentication required")
            return
        }

        if (!window.confirm("Remove this document from the investigation? The document will remain in the library.")) {
            return
        }

        setDetachingDocumentId(documentId)
        setMessage("")

        try {
            const response = await fetch(
                `http://127.0.0.1:8000/api/v1/investigations/${selectedInvestigation.id}/documents/${documentId}`,
                {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                }
            )

            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                setMessage(data.detail || "Unable to remove document from the investigation.")
                return
            }

            await refreshInvestigationDocuments(selectedInvestigation.id)
            await refreshAvailableDocuments()
            setMessage("Document removed from the investigation. It remains in the library.")
        } catch {
            setMessage("Unable to connect to the backend.")
        } finally {
            setDetachingDocumentId(null)
        }
    }

    const deleteLibraryDocument = async (documentId: number) => {
        const token = localStorage.getItem("access_token")
        if (!token) {
            setMessage("Authentication required")
            return
        }

        if (!window.confirm("Permanently delete this document from the library? It will also be removed from investigations that use it.")) {
            return
        }

        setDeletingDocumentId(documentId)
        setMessage("")

        try {
            const response = await fetch(
                `http://127.0.0.1:8000/api/v1/documents/${documentId}`,
                {
                    method: "DELETE",
                    headers: { Authorization: `Bearer ${token}` },
                }
            )

            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                setMessage(data.detail || "Unable to delete document from the library.")
                return
            }

            setAvailableDocuments((current) =>
                current.filter((document) => document.id !== documentId)
            )
            setInvestigationDocuments((current) =>
                current.filter((document) => document.id !== documentId)
            )
            await refreshAvailableDocuments()
            await refreshInvestigationDocuments(selectedInvestigation?.id)
            setMessage("Document permanently removed from the library.")
        } catch {
            setMessage("Unable to connect to the backend.")
        } finally {
            setDeletingDocumentId(null)
        }
    }

    const previewDocumentFile = async (document: Document) => {
        console.log("PREVIEW CLICKED", document.id, document.filename)

        const token = localStorage.getItem("access_token")
        if (!token) {
            setMessage("Authentication required")
            return
        }

        console.log("SETTING PREVIEW DOCUMENT")

        if (previewUrl) {
            URL.revokeObjectURL(previewUrl)
            setPreviewUrl(null)
        }

        setPreviewDocument(document)
        setPreviewLoading(true)

        try {
            console.log("FETCHING PREVIEW")

            const response = await fetch(
                `http://127.0.0.1:8000/api/v1/documents/${document.id}/preview`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            )

            console.log("PREVIEW RESPONSE", response.status)

            if (!response.ok) {
                const data = await response.json().catch(() => ({}))
                console.log("PREVIEW ERROR", data)

                setMessage(data.detail || "Unable to preview this document.")
                setPreviewDocument(null)
                return
            }

            const blob = await response.blob()

            console.log("PREVIEW BLOB", blob.type, blob.size)

            const url = URL.createObjectURL(blob)

            console.log("SETTING PREVIEW URL", url)

            setPreviewUrl(url)
        } catch (error) {
            console.error("PREVIEW FETCH FAILED", error)

            setMessage("Unable to connect to the backend.")
            setPreviewDocument(null)
        } finally {
            console.log("PREVIEW FINISHED")
            setPreviewLoading(false)
        }
    }

    const closePreview = () => {
        console.log("!!! CLOSE PREVIEW CALLED !!!")

        if (previewUrl) URL.revokeObjectURL(previewUrl)
        setPreviewUrl(null)
        setPreviewDocument(null)
        setPreviewLoading(false)
    }

    const libraryDocuments = Array.from(
        new Map(
            availableDocuments.map((document) => [
                document.file_hash || `id:${document.id}`,
                document,
            ])
        ).values()
    )

    const handleReviewSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedInvestigation || !reviewDecision) return

        setSubmittingReview(true)
        setReviewError("")
        try {
            const token = localStorage.getItem("token")
            const response = await fetch(`/api/v1/investigations/${selectedInvestigation.id}/review`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    review_status: reviewDecision,
                    reason: reviewReason,
                }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.detail || "Failed to submit review")
            }

            const updatedInv = await response.json()

            setInvestigations((prev) =>
                prev.map((inv) =>
                    inv.id === updatedInv.id ? updatedInv : inv
                )
            )
            setSelectedInvestigation(updatedInv)

            setReviewModalOpen(false)
        } catch (error: any) {
            setReviewError(error.message || "An unexpected error occurred.")
        } finally {
            setSubmittingReview(false)
        }
    }

    const runComparison = async () => {
        if (!selectedInvestigation) {
            setCompareError("Please select an investigation first.")
            return
        }

        if (!compareQuestion.trim()) {
            setCompareError("Please enter a comparison question or topic.")
            return
        }

        const token = localStorage.getItem("access_token")
        if (!token) {
            setCompareError("Authentication required")
            return
        }

        setCompareLoading(true)
        setCompareResult(null)
        setCompareError("")

        try {
            const response = await fetch(
                `http://127.0.0.1:8000/api/v1/investigations/${selectedInvestigation.id}/compare`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        question: compareQuestion.trim(),
                        limit: 5,
                    }),
                }
            )

            const data = await response.json()

            if (!response.ok) {
                setCompareError(
                    data.detail ||
                    data.error ||
                    `Comparison failed (HTTP ${response.status})`
                )
                return
            }

            console.log("[DIAG:COMPARE_FRONTEND_INPUT]")
            console.log("  data.documents:", data.documents)
            console.log("  sources keys:", data.sources ? Object.keys(data.sources) : [])
            console.log("  comparison length:", data.comparison?.length)
            if (data.documents) {
                data.documents.forEach((d: any) => {
                    console.log(`  appears filename ${d.filename}:`, data.comparison?.includes(d.filename))
                })
            }

            // Extract the labels actually present in the comparison text
            const textLabels = data.comparison
                ? [...new Set([...data.comparison.matchAll(/Document ([A-Z])/g)].map(m => m[1]))]
                : [];
            console.log("[DIAG:FRONTEND_RESPONSE] exact labels detected from the text:", textLabels);

            const sections = data.comparison ? data.comparison.split("─────────────────────────────────────────────────────") : [];
            const docSection = sections[1] || "";
            const numSections = docSection ? [...docSection.matchAll(/Document [A-Z] —/g)].length : 0;
            console.log("[DIAG:FRONTEND_RESPONSE] number of comparison sections parsed/rendered:", numSections);

            setCompareResult(data)
        } catch {
            setCompareError("Unable to connect to the backend.")
        } finally {
            setCompareLoading(false)
        }
    }

    const askInvestigation = async () => {
        if (!question.trim()) return

        if (!selectedInvestigation) {
            setAnswer("Please select or create an investigation first.")
            return
        }

        const token = localStorage.getItem("access_token")

        if (!token) {
            setAnswer("Authentication required")
            return
        }

        setRagLoading(true)
        setAnswer("")
        setSources([])
        setMessage("")

        const currentQuestion = question.trim()

        try {
            const ragResponse = await fetch(
                "http://127.0.0.1:8000/api/v1/rag/ask",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        question: currentQuestion,
                        limit: 5,
                        investigation_id: selectedInvestigation.id,
                    }),
                }
            )

            const ragData = await ragResponse.json()

            if (!ragResponse.ok) {
                const normalizedErr = normalizeApiError(
                    ragData.detail || ragData.error,
                    "Unable to get an investigation answer"
                )
                setAnswer(normalizedErr)
                return
            }

            const generatedAnswer = typeof ragData.answer === "string" ? ragData.answer : safeString(ragData.answer)

            setAnswer(generatedAnswer)
            setSources(ragData.sources || [])

            const saveResponse = await fetch(
                `http://127.0.0.1:8000/api/v1/investigations/${selectedInvestigation.id}/queries`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        question: currentQuestion,
                        answer: generatedAnswer,
                    }),
                }
            )

            const saveData = await saveResponse.json()

            if (!saveResponse.ok) {
                setMessage(
                    saveData.detail ||
                    "The answer was generated but could not be saved to the investigation."
                )
                return
            }

            setQuestion("")

            setResearchHistory((current) => [
                {
                    ...saveData,
                    created_at: saveData.created_at,
                },
                ...current,
            ])
        } catch {
            setAnswer("Unable to connect to the backend")
        } finally {
            setRagLoading(false)
        }
    }

    const investigation = selectedInvestigation
    const activeInvestigations = investigations.filter((inv) => inv.status !== "Archived")
    const archivedInvestigations = investigations.filter((inv) => inv.status === "Archived")
    return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="min-w-0">
                <div className="rounded-xl border border-neutral-200 bg-white">
                    <div className="border-b border-neutral-100 p-4">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className="rounded-full bg-neutral-100 px-2 py-1 text-xs font-medium uppercase tracking-[0.08em] text-neutral-500">
                                        {t("nav.investigations", "Investigation")}
                                    </span>

                                    <span className="flex items-center gap-1 text-xs text-neutral-400">
                                        <span className="h-1.5 w-1.5 rounded-full bg-neutral-700" />
                                        {investigation?.status || t("investigations.empty.title", "No investigation")}
                                    </span>
                                </div>

                                <h1 className="mt-3 text-lg font-semibold tracking-tight">
                                    {investigation?.title ||
                                        t("investigations.details.noDocuments", "No investigation selected")}
                                </h1>

                                <p className="mt-1.5 max-w-2xl text-xs leading-5 text-neutral-500">
                                    {investigation?.description ||
                                        t("investigations.empty.desc", "Create an investigation to begin a persistent research workspace.")}
                                </p>
                            </div>

                            <div className="relative">
                                <button 
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        setActiveMenuId(activeMenuId === 'main' ? null : 'main')
                                    }}
                                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-400 hover:bg-neutral-50"
                                >
                                    <MoreHorizontal size={14} />
                                </button>
                                {activeMenuId === 'main' && selectedInvestigation && (
                                    <div className="absolute right-0 z-10 mt-1 w-32 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setActiveMenuId(null)
                                                setEditInvestigationId(selectedInvestigation.id)
                                                setEditInvestigationTitle(selectedInvestigation.title)
                                                setEditInvestigationDescription(selectedInvestigation.description || "")
                                            }}
                                            className="block w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                                        >
                                            {t("common.save", "Edit")}
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setActiveMenuId(null)
                                                updateInvestigationStatus(
                                                    selectedInvestigation.id,
                                                    selectedInvestigation.status === "Archived" ? "Active" : "Archived"
                                                )
                                            }}
                                            className="block w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                                        >
                                            {selectedInvestigation.status === "Archived" ? t("common.retry", "Restore") : t("investigations.statuses.archived", "Archive")}
                                        </button>
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setActiveMenuId(null)
                                                setDeleteInvestigationId(selectedInvestigation.id)
                                            }}
                                            className="block w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                                        >
                                            {t("common.delete", "Delete")}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
                            <div className="relative flex items-center gap-2 cursor-pointer" onClick={(e) => { e.stopPropagation(); setActiveMenuId(activeMenuId === 'presence' ? null : 'presence') }}>
                                <div className="flex -space-x-1.5">
                                    {livePresence.slice(0, 3).map((v, i) => (
                                        <div key={i} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-white text-[10px] font-medium ${v.is_current_user ? 'bg-blue-100 text-blue-700' : 'bg-neutral-200 text-neutral-700'}`}>
                                            {v.initials}
                                        </div>
                                    ))}
                                    {livePresence.length > 3 && (
                                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-white bg-neutral-100 text-[10px] font-medium text-neutral-500">
                                            +{livePresence.length - 3}
                                        </div>
                                    )}
                                </div>

                                <span className="text-xs text-neutral-400 hover:text-neutral-600">
                                    {livePresence.length} {livePresence.length === 1 ? 'person' : 'people'} viewing
                                </span>

                                {activeMenuId === 'presence' && (
                                    <div className="absolute left-0 top-full mt-2 z-10 w-48 rounded-md border border-neutral-200 bg-white shadow-lg p-2">
                                        <h4 className="text-xs font-semibold text-neutral-700 mb-2">Live Viewers</h4>
                                        <div className="space-y-2">
                                            {livePresence.length > 0 ? livePresence.map((v, i) => (
                                                <div key={i} className="flex items-center gap-2">
                                                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-medium ${v.is_current_user ? 'bg-blue-100 text-blue-700' : 'bg-neutral-200 text-neutral-700'}`}>
                                                        {v.initials}
                                                    </div>
                                                    <span className="text-xs text-neutral-600 truncate flex-1">User {v.user_id}</span>
                                                    {v.is_current_user && <span className="text-[10px] text-blue-500">(You)</span>}
                                                </div>
                                            )) : (
                                                <div className="text-xs text-neutral-500">No one else is viewing</div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                <span className="mx-1 text-neutral-200">•</span>

                                <span className="flex items-center gap-1.5 text-xs text-neutral-400">
                                    <Activity size={11} />
                                    Live workspace
                                </span>
                            </div>

                            <span className="text-xs text-neutral-400">
                                {investigation
                                    ? `Investigation #${String(
                                        investigation.id
                                    ).padStart(3, "0")}`
                                    : "No investigation"}
                            </span>
                        </div>
                    </div>
                </div>

                <section className="mt-4 rounded-xl border border-neutral-200 bg-white">
                    <SectionHeader
                        icon={<Search size={14} />}
                        title={t("investigations.title", "Investigations")}
                        detail={t("investigations.subtitle", "Persistent investigation workspaces")}
                    />

                    <div className="p-4">
                        {loadingInvestigations ? (
                            <p className="text-xs text-neutral-400">
                                {t("common.loading", "Loading investigations...")}
                            </p>
                        ) : activeInvestigations.length === 0 && archivedInvestigations.length === 0 ? (
                            <div className="space-y-3">
                                <p className="text-xs text-neutral-400">
                                    {t("investigations.empty.title", "No investigations exist yet.")}
                                </p>

                                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                                    <input
                                        value={newTitle}
                                        onChange={(event) =>
                                            setNewTitle(event.target.value)
                                        }
                                        placeholder={t("investigations.modal.fieldTitle", "Investigation title")}
                                        className="w-full bg-transparent text-xs outline-none placeholder:text-neutral-400"
                                    />

                                    <textarea
                                        value={newDescription}
                                        onChange={(event) =>
                                            setNewDescription(event.target.value)
                                        }
                                        placeholder={t("investigations.modal.fieldDesc", "Description (optional)")}
                                        rows={2}
                                        className="mt-2 w-full resize-none border-t border-neutral-200 bg-transparent pt-2 text-xs leading-4 outline-none placeholder:text-neutral-400"
                                    />

                                    <div className="mt-3 flex items-center justify-between gap-3 border-t border-neutral-200 pt-2">
                                        <button
                                            type="button"
                                            onClick={() => setShowAttachmentMenu((current) => !current)}
                                            title="Manage investigation documents"
                                            className={`flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-500 transition hover:bg-neutral-100 ${showAttachmentMenu ? "bg-neutral-100 text-neutral-800" : ""}`}
                                        >
                                            <Paperclip size={13} />
                                        </button>
                                        <button
                                            onClick={createInvestigation}
                                            disabled={creatingInvestigation || !newTitle.trim()}
                                            className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:opacity-30"
                                        >
                                            {creatingInvestigation ? t("common.saving", "Creating...") : t("investigations.modal.submit", "Create investigation")}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {activeInvestigations.map((item) => (
                                    <div key={item.id} className="group relative">
                                        <button
                                            onClick={() => {
                                                setSelectedInvestigation(item)
                                                setQuestion("")
                                                setAnswer("")
                                                setSources([])
                                                setMessage("")
                                                setAgentRuns([])
                                                setAgentQuestion("")
                                                setAgentError("")
                                                setExpandedAgentRunId(null)
                                                setExpandedHistoryId(null)
                                                setActiveMenuId(null)
                                            }}
                                            className={`w-full rounded-lg border p-3 text-left transition ${selectedInvestigation?.id === item.id
                                                    ? "border-neutral-400 bg-neutral-50"
                                                    : "border-neutral-200 hover:bg-neutral-50"
                                                }`}
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="min-w-0 pr-6">
                                                    <p className="truncate text-xs font-medium">
                                                        {item.title}
                                                    </p>

                                                    <p className="mt-1 truncate text-xs text-neutral-400">
                                                        {item.description ||
                                                            "No description"}
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                        <div className="absolute right-2 top-2 hidden group-hover:block">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    setActiveMenuId(activeMenuId === item.id ? null : item.id)
                                                }}
                                                className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                                            >
                                                <MoreHorizontal size={12} />
                                            </button>
                                            {activeMenuId === item.id && (
                                                <div className="absolute right-0 z-10 mt-1 w-32 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setActiveMenuId(null)
                                                            setEditInvestigationId(item.id)
                                                            setEditInvestigationTitle(item.title)
                                                            setEditInvestigationDescription(item.description || "")
                                                        }}
                                                        className="block w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setActiveMenuId(null)
                                                            updateInvestigationStatus(
                                                                item.id,
                                                                item.status === "Archived" ? "Active" : "Archived"
                                                            )
                                                        }}
                                                        disabled={archivingInvestigation}
                                                        className="block w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                                                    >
                                                        {item.status === "Archived" ? "Restore" : "Archive"}
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            setActiveMenuId(null)
                                                            setDeleteInvestigationId(item.id)
                                                        }}
                                                        className="block w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {archivedInvestigations.length > 0 && (
                                    <div className="mt-6 border-t border-neutral-100 pt-4">
                                        <button
                                            onClick={() => setShowArchives(!showArchives)}
                                            className="flex w-full items-center justify-between text-xs font-medium text-neutral-500 hover:text-neutral-700"
                                        >
                                            <span>Archives ({archivedInvestigations.length})</span>
                                            <span>{showArchives ? "Hide" : "Show"}</span>
                                        </button>

                                        {showArchives && (
                                            <div className="mt-3 space-y-2">
                                                {archivedInvestigations.map((item) => (
                                                    <div key={item.id} className="group relative">
                                                        <button
                                                            onClick={() => {
                                                                setSelectedInvestigation(item)
                                                                setQuestion("")
                                                                setAnswer("")
                                                                setSources([])
                                                                setMessage("")
                                                                setAgentRuns([])
                                                                setAgentQuestion("")
                                                                setAgentError("")
                                                                setExpandedAgentRunId(null)
                                                                setExpandedHistoryId(null)
                                                                setActiveMenuId(null)
                                                            }}
                                                            className={`w-full rounded-lg border border-dashed p-3 text-left transition ${selectedInvestigation?.id === item.id
                                                                    ? "border-neutral-400 bg-neutral-50"
                                                                    : "border-neutral-200 hover:bg-neutral-50"
                                                                }`}
                                                        >
                                                            <div className="flex items-center justify-between gap-3 opacity-60">
                                                                <div className="min-w-0 pr-6">
                                                                    <p className="truncate text-xs font-medium">
                                                                        {item.title}
                                                                    </p>

                                                                    <p className="mt-1 truncate text-xs text-neutral-400">
                                                                        {item.description ||
                                                                            "No description"}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </button>
                                                        <div className="absolute right-2 top-2 hidden group-hover:block">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation()
                                                                    setActiveMenuId(activeMenuId === item.id ? null : item.id)
                                                                }}
                                                                className="flex h-6 w-6 items-center justify-center rounded-md bg-white border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                                                            >
                                                                <MoreHorizontal size={12} />
                                                            </button>
                                                            {activeMenuId === item.id && (
                                                                <div className="absolute right-0 z-10 mt-1 w-32 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            setActiveMenuId(null)
                                                                            setEditInvestigationId(item.id)
                                                                            setEditInvestigationTitle(item.title)
                                                                            setEditInvestigationDescription(item.description || "")
                                                                        }}
                                                                        className="block w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                                                                    >
                                                                        Edit
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            setActiveMenuId(null)
                                                                            updateInvestigationStatus(
                                                                                item.id,
                                                                                item.status === "Archived" ? "Active" : "Archived"
                                                                            )
                                                                        }}
                                                                        disabled={archivingInvestigation}
                                                                        className="block w-full px-3 py-1.5 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                                                                    >
                                                                        {item.status === "Archived" ? "Restore" : "Archive"}
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation()
                                                                            setActiveMenuId(null)
                                                                            setDeleteInvestigationId(item.id)
                                                                        }}
                                                                        className="block w-full px-3 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                                                                    >
                                                                        Delete
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="mt-3 border-t border-neutral-100 pt-3">
                                    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                                        <p className="text-xs font-medium">
                                            Create another investigation
                                        </p>

                                        <input
                                            value={newTitle}
                                            onChange={(event) =>
                                                setNewTitle(event.target.value)
                                            }
                                            placeholder="Investigation title"
                                            className="mt-2 w-full bg-transparent text-xs outline-none placeholder:text-neutral-400"
                                        />

                                        <textarea
                                            value={newDescription}
                                            onChange={(event) =>
                                                setNewDescription(
                                                    event.target.value
                                                )
                                            }
                                            placeholder="Description (optional)"
                                            rows={2}
                                            className="mt-2 w-full resize-none border-t border-neutral-200 bg-transparent pt-2 text-xs leading-4 outline-none placeholder:text-neutral-400"
                                        />

                                        {showAttachmentMenu && (
                                            <div className="mt-3 rounded-lg border border-neutral-200 bg-white p-3">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-semibold text-neutral-700">
                                                            Investigation evidence
                                                        </p>
                                                        <p className="mt-0.5 text-xs leading-4 text-neutral-400">
                                                            {selectedInvestigation
                                                                ? `Documents attached to ${selectedInvestigation.title}`
                                                                : "Create the investigation first, then attach evidence."}
                                                        </p>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setShowAttachmentMenu(false)}
                                                        className="shrink-0 text-xs text-neutral-400 hover:text-neutral-700"
                                                    >
                                                        Close
                                                    </button>
                                                </div>

                                                {selectedInvestigation ? (
                                                    <>
                                                        <div className="mt-3">
                                                            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
                                                                Attached documents
                                                            </p>
                                                            {loadingInvestigationDocuments ? (
                                                                <p className="rounded-md bg-neutral-50 p-2 text-xs text-neutral-400">
                                                                    Loading attached documents...
                                                                </p>
                                                            ) : investigationDocuments.length === 0 ? (
                                                                <p className="rounded-md bg-neutral-50 p-2 text-xs text-neutral-400">
                                                                    No documents attached yet.
                                                                </p>
                                                            ) : (
                                                                <div className="space-y-1.5">
                                                                    {investigationDocuments.map((document) => (
                                                                        <div key={document.id} className="flex items-center gap-2 rounded-md border border-neutral-100 bg-neutral-50 p-2">
                                                                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white">
                                                                                <FileText size={12} className="text-neutral-500" />
                                                                            </div>
                                                                            <div className="min-w-0 flex-1">
                                                                                <p className="truncate text-xs font-medium text-neutral-700">
                                                                                    {document.title}
                                                                                </p>
                                                                                <p className="mt-0.5 truncate text-xs text-neutral-400">
                                                                                    {document.filename} · {document.processing_status}
                                                                                </p>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => previewDocumentFile(document)}
                                                                                title="Preview document"
                                                                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-100"
                                                                            >
                                                                                <Eye size={12} />
                                                                            </button>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => detachDocument(document.id)}
                                                                                disabled={detachingDocumentId === document.id}
                                                                                title="Remove from investigation"
                                                                                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-100 disabled:opacity-40"
                                                                            >
                                                                                <Trash2 size={12} />
                                                                            </button>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="mt-3 border-t border-neutral-100 pt-3">
                                                            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-400">
                                                                Add document
                                                            </p>

                                                            <div className="mb-2 grid grid-cols-3 gap-1.5">
                                                                <button
                                                                    type="button"
                                                                    onClick={openDeviceFilePicker}
                                                                    disabled={uploadingDocument}
                                                                    className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white p-2 text-left transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                                                                >
                                                                    <Upload size={12} className="shrink-0 text-neutral-500" />
                                                                    <span className="min-w-0">
                                                                        <span className="block text-xs font-medium text-neutral-700">
                                                                            {uploadingDocument ? "Uploading..." : "From device"}
                                                                        </span>
                                                                        <span className="block text-xs text-neutral-400">
                                                                            PDF, DOCX, TXT
                                                                        </span>
                                                                    </span>
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => setMessage("Google Drive integration requires a connected Drive account.")}
                                                                    className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white p-2 text-left transition hover:bg-neutral-50"
                                                                >
                                                                    <HardDrive size={12} className="shrink-0 text-neutral-500" />
                                                                    <span className="min-w-0">
                                                                        <span className="block text-xs font-medium text-neutral-700">
                                                                            Google Drive
                                                                        </span>
                                                                        <span className="block text-xs text-neutral-400">
                                                                            Connect account
                                                                        </span>
                                                                    </span>
                                                                </button>

                                                                <button
                                                                    type="button"
                                                                    onClick={() => setMessage("Dropbox integration requires a connected Dropbox account.")}
                                                                    className="flex items-center gap-2 rounded-md border border-neutral-200 bg-white p-2 text-left transition hover:bg-neutral-50"
                                                                >
                                                                    <Cloud size={12} className="shrink-0 text-neutral-500" />
                                                                    <span className="min-w-0">
                                                                        <span className="block text-xs font-medium text-neutral-700">
                                                                            Dropbox
                                                                        </span>
                                                                        <span className="block text-xs text-neutral-400">
                                                                            Connect account
                                                                        </span>
                                                                    </span>
                                                                </button>
                                                            </div>

                                                            <input
                                                                id="investigation-document-file-input"
                                                                type="file"
                                                                accept=".pdf,.doc,.docx,.txt,.md"
                                                                className="hidden"
                                                                onChange={(event) => {
                                                                    const file = event.target.files?.[0]
                                                                    event.target.value = ""
                                                                    if (file) {
                                                                        uploadAndAttachDocument(file)
                                                                    }
                                                                }}
                                                            />

                                                            {libraryDocuments.length > 0 && (
                                                                <>
                                                                    <p className="mb-1.5 mt-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
                                                                        From document library
                                                                    </p>
                                                                    <div className="max-h-44 space-y-1.5 overflow-y-auto">
                                                                        {libraryDocuments.map((document) => {
                                                                            const alreadyAttached = investigationDocuments.some((attached) => attached.id === document.id)
                                                                            return (
                                                                                <div key={document.id} className="flex items-center gap-2 rounded-md border border-neutral-100 p-2">
                                                                                    <FileText size={12} className="shrink-0 text-neutral-400" />
                                                                                    <div className="min-w-0 flex-1">
                                                                                        <p className="truncate text-xs font-medium">{document.title}</p>
                                                                                        <p className="mt-0.5 truncate text-xs text-neutral-400">{document.filename}</p>
                                                                                    </div>
                                                                                    <button
                                                                                        type="button"
                                                                                        onClick={() => previewDocumentFile(document)}
                                                                                        title="Preview document"
                                                                                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-100"
                                                                                    >
                                                                                        <Eye size={12} />
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={alreadyAttached || attachingDocumentId === document.id}
                                                                                        onClick={() => attachDocument(document.id)}
                                                                                        title={alreadyAttached ? "Already attached" : "Add to investigation"}
                                                                                        aria-label={alreadyAttached ? "Already attached" : `Add ${document.filename} to investigation`}
                                                                                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-neutral-200 text-neutral-600 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                                                                                    >
                                                                                        {attachingDocumentId === document.id ? "…" : alreadyAttached ? "✓" : "+"}
                                                                                    </button>
                                                                                    <button
                                                                                        type="button"
                                                                                        disabled={deletingDocumentId === document.id}
                                                                                        onClick={() => deleteLibraryDocument(document.id)}
                                                                                        title="Delete from document library"
                                                                                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-100 disabled:opacity-40"
                                                                                    >
                                                                                        <Trash2 size={12} />
                                                                                    </button>
                                                                                </div>
                                                                            )
                                                                        })}
                                                                    </div>
                                                                </>
                                                            )}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <p className="mt-3 rounded-md bg-neutral-50 p-2 text-xs leading-4 text-neutral-400">
                                                        Enter a title and click Create. The new investigation will then be selected and this panel will stay open so you can add documents immediately.
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-neutral-200 pt-2">
                                            <button
                                                type="button"
                                                onClick={() => setShowAttachmentMenu((current) => !current)}
                                                title="Manage investigation documents"
                                                className={`flex h-8 w-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-neutral-500 transition hover:bg-neutral-100 ${showAttachmentMenu ? "bg-neutral-100 text-neutral-800" : ""}`}
                                            >
                                                <Paperclip size={13} />
                                            </button>
                                            <button
                                                onClick={createInvestigation}
                                                disabled={creatingInvestigation || !newTitle.trim()}
                                                className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs text-white disabled:cursor-not-allowed disabled:opacity-30"
                                            >
                                                {creatingInvestigation ? "Creating..." : "Create"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {investigationMessage && (
                            <p className="mt-3 text-xs text-neutral-500">
                                {investigationMessage}
                            </p>
                        )}
                    </div>
                </section>

                <section className="mt-4 rounded-xl border border-neutral-200 bg-white">
                    <SectionHeader
                        icon={<Sparkles size={14} />}
                        title={t("research.tabs.investigation", "Investigation Research")}
                        detail={t("research.subtitle", "Ask questions using the investigation knowledge base")}
                    />

                    <div className="p-4">
                        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                            <div className="flex gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white">
                                    <Sparkles size={14} />
                                </div>

                                <div className="min-w-0 flex-1">
                                    <textarea
                                        value={question}
                                        onChange={(event) =>
                                            setQuestion(event.target.value)
                                        }
                                        onKeyDown={(event) => {
                                            if (
                                                event.key === "Enter" &&
                                                !event.shiftKey
                                            ) {
                                                event.preventDefault()
                                                askInvestigation()
                                            }
                                        }}
                                        rows={3}
                                        placeholder="Ask about the regulations, policies, or evidence in this investigation..."
                                        className="w-full resize-none bg-transparent text-sm leading-5 outline-none placeholder:text-neutral-400"
                                    />

                                    <div className="flex items-center justify-between border-t border-neutral-200 pt-2">
                                        <span className="text-xs text-neutral-400">
                                            {selectedInvestigation
                                                ? `${investigationDocuments.length} document${investigationDocuments.length === 1 ? "" : "s"} in evidence`
                                                : "Select an investigation to begin"}
                                        </span>

                                        <button
                                            onClick={askInvestigation}
                                            disabled={
                                                ragLoading ||
                                                !question.trim() ||
                                                !selectedInvestigation
                                            }
                                            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FBC648] text-neutral-900 disabled:cursor-not-allowed disabled:opacity-30 hover:bg-[#FBC648]/90"
                                        >
                                            {ragLoading ? (
                                                <Sparkles size={12} />
                                            ) : (
                                                <ArrowUp size={13} />
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {answer && (
                            <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-4">
                                <div className="flex items-center gap-2">
                                    <Sparkles size={13} />

                                    <span className="text-xs font-semibold">
                                        Investigation Assistant
                                    </span>

                                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                                        RAG
                                    </span>
                                </div>

                                <div className="mt-3 space-y-2 text-xs leading-5 text-neutral-600">
                                    {safeString(answer).split("\n").map((line, index) => (
                                        <p key={index}>
                                            {line || "\u00A0"}
                                        </p>
                                    ))}
                                </div>

                                {sources.length > 0 && (
                                    <div className="mt-4 border-t border-neutral-100 pt-3">
                                        <div className="mb-2 flex items-center justify-between">
                                            <span className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
                                                Sources
                                            </span>

                                            <span className="text-xs text-neutral-400">
                                                {sources.length} retrieved
                                            </span>
                                        </div>

                                        <div className="space-y-2">
                                            {sources.map((source, index) => (
                                                <div
                                                    key={`${source.document_id}-${source.chunk}-${index}`}
                                                    className="flex items-center gap-2.5 rounded-lg bg-neutral-50 p-2.5"
                                                >
                                                    <FileText
                                                        size={12}
                                                        className="shrink-0 text-neutral-500"
                                                    />

                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-xs font-medium">
                                                            {
                                                                source.document_title
                                                            }
                                                        </p>

                                                        <p className="mt-0.5 text-xs text-neutral-400">
                                                            {source.filename} ·
                                                            Chunk{" "}
                                                            {source.chunk}
                                                        </p>
                                                    </div>

                                                    <span className="text-xs text-neutral-400">
                                                        {source.distance.toFixed(
                                                            3
                                                        )}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="mt-3 border-t border-neutral-100 pt-3">
                                    <p className="text-xs text-neutral-400">
                                        Saved to Investigation #
                                        {selectedInvestigation?.id}
                                    </p>
                                </div>
                            </div>
                        )}

                        {selectedInvestigation && (
                            <div className="mt-5 border-t border-neutral-100 pt-5">
                                <div className="mb-3 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-xs font-semibold">
                                            Research History
                                        </h3>
                                        <p className="mt-1 text-xs text-neutral-400">
                                            Saved questions and answers for this investigation
                                        </p>
                                    </div>

                                    {researchHistory.length > 0 && (
                                        <span className="text-xs text-neutral-400">
                                            {researchHistory.length} saved
                                        </span>
                                    )}
                                </div>

                                {loadingHistory ? (
                                    <div className="rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-5 text-center">
                                        <p className="text-xs text-neutral-400">
                                            Loading research history...
                                        </p>
                                    </div>
                                ) : researchHistory.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-neutral-200 px-4 py-5 text-center">
                                        <p className="text-xs text-neutral-400">
                                            No saved research yet.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        {researchHistory.map((item) => (
                                            <div key={item.id} className="rounded-lg border border-neutral-100 bg-neutral-50 overflow-hidden">
                                                <button
                                                    type="button"
                                                    className="w-full p-3 text-left transition hover:bg-white cursor-pointer block"
                                                    onClick={() => setExpandedHistoryId(expandedHistoryId === item.id ? null : item.id)}
                                                >
                                                    <div className="flex items-start justify-between gap-3">
                                                        <p className="text-xs font-medium leading-4 text-neutral-700">
                                                            {item.question}
                                                        </p>
                                                        <span className="shrink-0 text-xs text-neutral-400">
                                                            {new Date(item.created_at).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    {expandedHistoryId !== item.id && item.answer && (
                                                        <p className="mt-2 line-clamp-2 text-xs leading-4 text-neutral-500">
                                                            {item.answer}
                                                        </p>
                                                    )}
                                                </button>

                                                {expandedHistoryId === item.id && (
                                                    <div className="border-t border-neutral-100 bg-white p-3">
                                                        <div className="flex justify-between items-center mb-3">
                                                            <h4 className="text-xs font-semibold text-neutral-700">Research Result</h4>
                                                            <div className="flex items-center gap-2">
                                                                <button
                                                                    onClick={() => {
                                                                        setShareTitle(`Finding: ${item.question}`)
                                                                        setShareContent(item.answer || "")
                                                                        setShareSource(`Investigation ID: ${selectedInvestigation?.id}`)
                                                                        setShareModalOpen(true)
                                                                    }}
                                                                    className="flex items-center gap-1 text-xs px-2 py-1 bg-white border border-neutral-200 text-neutral-700 rounded-md hover:bg-neutral-50 transition"
                                                                >
                                                                    <Upload size={10} /> Share Finding
                                                                </button>
                                                                <button
                                                                    onClick={() => {
                                                                        localStorage.setItem('pending_research_question', item.question)
                                                                        localStorage.setItem('pending_research_answer', item.answer || "")
                                                                        window.dispatchEvent(new CustomEvent('switch_tab', { detail: 'research' }))
                                                                    }}
                                                                    className="text-xs px-2 py-1 bg-neutral-900 text-white rounded-md hover:bg-neutral-800 transition whitespace-nowrap"
                                                                >
                                                                    Load into Research
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <p className="text-xs leading-5 text-neutral-600 mb-4 whitespace-pre-wrap">
                                                            {item.answer}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </section>

                <section className="mt-4 rounded-xl border border-neutral-200 bg-white">
                    <SectionHeader
                        icon={<ShieldAlert size={14} />}
                        title={t("research.comparison.title", "Regulatory Comparison")}
                        detail={t("research.comparison.subtitle", "Compare all attached investigation documents using AI")}
                    />

                    <div className="p-4 space-y-3">
                        {/* Read-only document context — no dropdowns */}
                        {investigationDocuments.length === 0 ? (
                            <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-5 text-center text-xs text-neutral-400">
                                {t("investigations.details.noDocuments", "No documents are attached to this investigation.")}
                            </p>
                        ) : investigationDocuments.length === 1 ? (
                            <p className="rounded-lg border border-dashed border-neutral-200 px-4 py-5 text-center text-xs text-neutral-400">
                                Attach at least two documents to enable comparison. Currently attached: <span className="font-medium">{investigationDocuments[0].title}</span>.
                            </p>
                        ) : (
                            <>
                                {/* Show which documents will be compared (read-only, deterministic) */}
                                <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
                                        Comparing {investigationDocuments.length} attached documents
                                    </p>
                                    <div className="space-y-1">
                                        {investigationDocuments.map((doc, index) => {
                                            const label = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[index] ?? String(index)
                                            return (
                                                <div key={doc.id} className="flex items-center gap-2">
                                                    <span className="shrink-0 rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-semibold text-neutral-700">
                                                        {label}
                                                    </span>
                                                    <span className="truncate text-xs text-neutral-700">{doc.title}</span>
                                                    <span className="shrink-0 text-xs text-neutral-400">{doc.filename}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Question input */}
                                <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                                    <div className="flex gap-3">
                                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white">
                                            <ShieldAlert size={14} />
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <textarea
                                                id="compare-question"
                                                value={compareQuestion}
                                                onChange={(e) => setCompareQuestion(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === "Enter" && !e.shiftKey) {
                                                        e.preventDefault()
                                                        runComparison()
                                                    }
                                                }}
                                                rows={2}
                                                placeholder={t("research.inputPlaceholder", "e.g. Compare data breach notification requirements, or: Compare these documents.")}
                                                className="w-full resize-none bg-transparent text-sm leading-5 outline-none placeholder:text-neutral-400"
                                            />

                                            <div className="flex items-center justify-between border-t border-neutral-200 pt-2">
                                                <span className="text-xs text-neutral-400">
                                                    Per-document retrieval · investigation-scoped · {investigationDocuments.length} docs
                                                </span>

                                                <button
                                                    id="compare-submit"
                                                    onClick={runComparison}
                                                    disabled={compareLoading || !compareQuestion.trim()}
                                                    className="flex h-7 w-7 items-center justify-center rounded-full bg-[#FBC648] text-neutral-900 disabled:cursor-not-allowed disabled:opacity-30 hover:bg-[#FBC648]/90"
                                                >
                                                    {compareLoading ? (
                                                        <Sparkles size={12} />
                                                    ) : (
                                                        <ArrowUp size={13} />
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {compareError && (
                                    <p className="text-xs text-red-500">{compareError}</p>
                                )}

                                {compareLoading && (
                                    <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-6 text-center">
                                        <Sparkles size={16} className="mx-auto mb-2 animate-pulse text-neutral-400" />
                                        <p className="text-xs text-neutral-400">Comparing {investigationDocuments.length} documents…</p>
                                    </div>
                                )}

                                {/* Comparison result — N documents */}
                                {compareResult && !compareLoading && (
                                    <div className="space-y-3">
                                        {(() => {
                                            console.log("[DIAG:COMPARE_FRONTEND_RENDER]");
                                            console.log("  number of documents:", compareResult.documents.length);
                                            const sections = compareResult.comparison ? compareResult.comparison.split("─────────────────────────────────────────────────────") : [];
                                            const docSection = sections[1] || "";
                                            const numSections = docSection ? [...docSection.matchAll(/Document [A-Z] —/g)].length : 0;
                                            console.log("  number of comparison sections:", numSections);
                                            console.log("  exact labels rendered:", compareResult.documents.map(d => d.label));
                                            return null;
                                        })()}
                                        {/* Document label cards — one per document */}
                                        <div className={`grid gap-3 ${compareResult.documents.length === 2 ? "md:grid-cols-2" : compareResult.documents.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                                            {compareResult.documents.map((doc) => (
                                                <ComparisonCard
                                                    key={doc.id}
                                                    label={`Document ${doc.label}`}
                                                    title={doc.title}
                                                    text={`${doc.filename} · ${doc.jurisdiction}`}
                                                />
                                            ))}
                                        </div>

                                        {/* Comparison text */}
                                        <div className="rounded-xl border border-neutral-200 bg-white p-4">
                                            <div className="flex items-center gap-2 mb-3">
                                                <ShieldAlert size={13} />
                                                <span className="text-xs font-semibold">{t("research.comparison.title", "Comparison Result")}</span>
                                                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">AI · grounded · {compareResult.documents.length} docs</span>
                                            </div>

                                            <div className="space-y-1.5 text-xs leading-5 text-neutral-600">
                                                {compareResult.comparison.split("\n").map((line, i) => (
                                                    <p key={i}>{line || "\u00A0"}</p>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Sources — one column per document, dynamic */}
                                        <div className={`grid gap-3 ${compareResult.documents.length === 2 ? "md:grid-cols-2" : compareResult.documents.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                                            {compareResult.documents.map((doc) => {
                                                const key = `document_${doc.label.toLowerCase()}`
                                                const srcList = compareResult.sources[key] ?? []
                                                return (
                                                    <div key={doc.id} className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                                                        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                                                            Document {doc.label} · {srcList.length} chunk{srcList.length !== 1 ? "s" : ""}
                                                        </p>
                                                        {srcList.length === 0 ? (
                                                            <p className="text-xs text-neutral-400">No relevant chunks found.</p>
                                                        ) : (
                                                            <div className="space-y-1.5">
                                                                {srcList.map((src, i) => (
                                                                    <div key={i} className="flex items-center gap-2 rounded-md bg-white border border-neutral-100 p-2">
                                                                        <FileText size={11} className="shrink-0 text-neutral-400" />
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className="truncate text-xs font-medium">{src.document_title}</p>
                                                                            <p className="text-xs text-neutral-400">Chunk {src.chunk}</p>
                                                                        </div>
                                                                        <span className="text-xs text-neutral-400">{src.distance.toFixed(3)}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </section>

                <section className="mt-4 rounded-xl border border-neutral-200 bg-white">
                    <SectionHeader
                        icon={<MessageCircle size={14} />}
                        title={t("investigations.details.notes", "Discussion")}
                        detail={t("investigations.subtitle", "Human and AI collaboration")}
                    />

                    <div className="divide-y divide-neutral-100">
                        {loadingComments ? (
                            <div className="p-4 text-center text-xs text-neutral-400">{t("common.loading", "Loading comments...")}</div>
                        ) : comments.length === 0 ? (
                            <div className="p-4 text-center text-xs text-neutral-400">{t("investigations.empty.desc", "No comments yet.")}</div>
                        ) : (
                            comments.map((comment) => (
                                <Comment
                                    key={comment.id}
                                    initials={`U${comment.user_id}`}
                                    name={`User ${comment.user_id}`}
                                    role="Investigator"
                                    time={new Date(comment.created_at).toLocaleString()}
                                    text={comment.text}
                                />
                            ))
                        )}
                    </div>

                    <div className="border-t border-neutral-100 p-3">
                        <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
                            <input
                                className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-neutral-400"
                                placeholder={t("investigations.modal.descPlaceholder", "Add a comment to this investigation...")}
                                value={newCommentText}
                                onChange={(e) => setNewCommentText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        submitComment()
                                    }
                                }}
                                disabled={submittingComment}
                            />

                            <button
                                onClick={submitComment}
                                disabled={submittingComment || !newCommentText.trim()}
                                className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-900 text-white disabled:opacity-50"
                            >
                                <ChevronRight size={13} />
                            </button>
                        </div>
                    </div>
                </section>

                <section className="mt-4 rounded-xl border border-neutral-200 bg-white">
                    <SectionHeader
                        icon={<FileText size={14} />}
                        title={t("investigations.details.evidence", "Evidence")}
                        detail={t("investigations.details.documents", "Documents attached to this investigation")}
                    />

                    <div className="divide-y divide-neutral-100">
                        {loadingInvestigationDocuments ? (
                            <div className="p-5 text-center">
                                <p className="text-xs text-neutral-400">
                                    {t("common.loading", "Loading evidence...")}
                                </p>
                            </div>
                        ) : investigationDocuments.length === 0 ? (
                            <div className="p-5 text-center">
                                <FileText
                                    size={18}
                                    className="mx-auto text-neutral-300"
                                />

                                <p className="mt-2 text-xs text-neutral-400">
                                    {t("investigations.details.noDocuments", "No documents are currently available.")}
                                </p>
                            </div>
                        ) : (
                            investigationDocuments.map((document) => (
                                <EvidenceRow
                                    key={document.id}
                                    document={document}
                                    onPreview={previewDocumentFile}
                                    onDetach={detachDocument}
                                    detaching={detachingDocumentId === document.id}
                                />
                            ))
                        )}
                    </div>

                    {message && (
                        <div className="border-t border-neutral-100 px-4 py-3">
                            <p className="text-xs text-neutral-500">
                                {message}
                            </p>
                        </div>
                    )}
                </section>

                <section className="mt-4 rounded-xl border border-neutral-200 bg-white">
                    <SectionHeader
                        icon={<Sparkles size={14} />}
                        title={t("agents.title", "Compliance Investigation Agent")}
                        detail={t("agents.subtitle", "Analyze the evidence attached to this investigation and produce a structured finding.")}
                    />

                    <div className="p-4 space-y-3">
                        <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400 mb-2">
                                {t("agents.scopeLabel", "Investigation Scope")}
                            </p>
                            <p className="text-xs text-neutral-600">
                                The agent will analyze all {investigationDocuments.length} document{investigationDocuments.length !== 1 ? 's' : ''} currently attached to this investigation.
                            </p>
                        </div>

                        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                            <div className="flex gap-3">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white">
                                    <Sparkles size={14} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <textarea
                                        id="agent-question"
                                        value={agentQuestion}
                                        onChange={(e) => setAgentQuestion(e.target.value)}
                                        rows={3}
                                        placeholder={t("agents.taskPlaceholder", "e.g. Determine if our data retention policy complies with GDPR Article 5.")}
                                        className="w-full resize-none bg-transparent text-sm leading-5 outline-none placeholder:text-neutral-400"
                                    />
                                    <div className="flex items-center justify-between border-t border-neutral-200 pt-2">
                                        <span className="text-xs text-neutral-400">
                                            Agent execution may take a few moments
                                        </span>
                                        <button
                                            id="agent-submit"
                                            onClick={runAgent}
                                            disabled={agentLoading || !agentQuestion.trim()}
                                            className="rounded-full bg-[#FBC648] px-4 py-1.5 text-xs font-medium text-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            {agentLoading ? t("agents.statusRunning", "Running...") : t("agents.runAgent", "Run Investigation")}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {agentError && (
                            <p className="text-xs text-red-500">{agentError}</p>
                        )}

                        {agentLoading && (
                            <div className="rounded-xl border border-neutral-100 bg-neutral-50 px-4 py-6 text-center">
                                <Sparkles size={16} className="mx-auto mb-2 animate-pulse text-neutral-400" />
                                <p className="text-xs text-neutral-400">The agent is analyzing documents and preparing a finding...</p>
                            </div>
                        )}

                        {loadingAgentRuns && (
                            <div className="mt-4 rounded-xl border border-neutral-100 bg-neutral-50 px-3 py-4 text-center">
                                <p className="text-xs text-neutral-400 animate-pulse">Loading previous agent runs...</p>
                            </div>
                        )}

                        {agentRunsError && (
                            <div className="mt-3 rounded-lg border border-red-100 bg-red-50 p-2 text-xs text-red-600">
                                {agentRunsError}
                            </div>
                        )}

                        {agentRuns.length > 0 && (
                            <div className="mt-6">
                                <div className="mb-3 flex items-center justify-between">
                                    <h3 className="text-xs font-semibold">{t("agents.executionTrace", "Agent Run History")}</h3>
                                    <span className="text-xs text-neutral-400">{agentRuns.length} run{agentRuns.length !== 1 ? 's' : ''}</span>
                                </div>

                                <div className="flex flex-col gap-3">
                                    {agentRuns.map((run) => (
                                        <div key={run.id} className="rounded-xl border border-neutral-200 overflow-hidden bg-white">
                                            <button
                                                type="button"
                                                className="w-full text-left p-3 bg-neutral-50 border-b border-neutral-100 cursor-pointer hover:bg-neutral-100 transition block"
                                                onClick={() => setExpandedAgentRunId(expandedAgentRunId === run.id ? null : run.id)}
                                            >
                                                <div className="flex justify-between items-start gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-semibold text-neutral-700">{run.question}</p>
                                                        {expandedAgentRunId !== run.id && (
                                                            <p className="mt-1 text-xs text-neutral-500 line-clamp-1">{run.finding}</p>
                                                        )}
                                                    </div>
                                                    <div className="flex flex-col items-end shrink-0">
                                                        <span className="text-xs text-neutral-400">{new Date(run.created_at).toLocaleString()}</span>
                                                        <span className="mt-1 rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-semibold text-neutral-700">{run.status}</span>
                                                    </div>
                                                </div>
                                            </button>

                                            {expandedAgentRunId === run.id && (
                                                <div className="p-4 space-y-5">
                                                    {run.finding && (
                                                        !/do not include (an? )?executive summary|without (an? )?executive summary|no executive summary/i.test(run.question || "") ||
                                                        /limitation|insufficient|cannot answer|not establish/i.test(run.finding) ||
                                                        (run.conflicts.length === 0 && run.evidence.length === 0 && run.applicable_requirements.length === 0)
                                                    ) && (
                                                        <div>
                                                            <h4 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold mb-2">
                                                                {/limitation|insufficient|cannot answer|not establish/i.test(run.finding) ? "Evidence Limitation" : "Finding"}
                                                            </h4>
                                                            <div className="border-t border-neutral-100 pt-2">
                                                                <p className="text-xs leading-5 text-neutral-700 whitespace-pre-wrap">{run.finding}</p>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {run.evidence && run.evidence.length > 0 && (
                                                        <div>
                                                            <h4 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold mb-2">Evidence</h4>
                                                            <div className="grid gap-2 border-t border-neutral-100 pt-2">
                                                                {run.evidence.map((ev, i) => {
                                                                    const title = ev.claim || ev.document_title || ev.source_document || "Evidence Item";
                                                                    const text = ev.supporting_text || ev.text_snippet || "";
                                                                    const source = ev.source_document || ev.filename || "";
                                                                    const section = ev.source_section_or_chunk || "";
                                                                    return (
                                                                        <div key={i} className="rounded-lg border border-neutral-100 bg-neutral-50 p-2.5">
                                                                            <div className="flex items-center gap-2 mb-1.5">
                                                                                <FileText size={11} className="text-neutral-400" />
                                                                                <span className="text-xs font-medium text-neutral-700 truncate">{safeString(title)}</span>
                                                                            </div>
                                                                            {text && <p className="text-xs text-neutral-600 italic">"{safeString(text)}"</p>}
                                                                            {(source || section) && (
                                                                                <p className="mt-1 text-[11px] text-neutral-400">
                                                                                    {source}{section ? ` • ${section}` : ""}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {run.applicable_requirements && run.applicable_requirements.length > 0 && (
                                                        <div>
                                                            <h4 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold mb-2">Applicable Requirements</h4>
                                                            <div className="space-y-1.5 border-t border-neutral-100 pt-2">
                                                                {run.applicable_requirements.map((req, i) => (
                                                                    <div key={i} className="flex gap-2">
                                                                        <CheckCircle2 size={12} className="text-neutral-500 shrink-0 mt-0.5" />
                                                                        <div>
                                                                            <p className="text-xs text-neutral-700">{safeString(req.requirement)}</p>
                                                                            {req.source_document && (
                                                                                <p className="text-xs text-neutral-400">
                                                                                    Source: {safeString(req.source_document)}
                                                                                    {req.source_section_or_chunk ? ` • ${req.source_section_or_chunk}` : ""}
                                                                                </p>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {run.citations && run.citations.length > 0 && (
                                                        <div>
                                                            <h4 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold mb-2">Citations</h4>
                                                            <div className="grid gap-2 border-t border-neutral-100 pt-2">
                                                                {run.citations.map((cit, i) => {
                                                                    const doc = cit.source_document || (cit.document_id ? `Document ID ${cit.document_id}` : "Citation");
                                                                    const section = cit.source_section_or_chunk || (cit.chunk !== undefined ? `Chunk ${cit.chunk}` : "");
                                                                    return (
                                                                        <div key={i} className="rounded-lg border border-neutral-100 bg-neutral-50 p-2.5">
                                                                            <div className="flex items-center gap-2 mb-1">
                                                                                <FileText size={11} className="text-neutral-400" />
                                                                                <span className="text-xs font-medium text-neutral-700 truncate">
                                                                                    {safeString(doc)}{section ? ` (${section})` : ""}
                                                                                </span>
                                                                            </div>
                                                                            {cit.text && <p className="text-xs text-neutral-600 italic">"{safeString(cit.text)}"</p>}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {run.conflicts && run.conflicts.length > 0 && (
                                                        <div>
                                                            <h4 className="text-xs uppercase tracking-wider text-red-400 font-semibold mb-2">Conflicts</h4>
                                                            <div className="space-y-2 border-t border-red-100 pt-2">
                                                                {run.conflicts.map((conf, i) => {
                                                                    const docs = conf.documents || conf.conflicting_documents || [];
                                                                    return (
                                                                        <div key={i} className="rounded-lg border border-red-100 bg-red-50 p-2.5">
                                                                            <div className="flex items-start gap-2">
                                                                                <ShieldAlert size={12} className="text-red-500 shrink-0 mt-0.5" />
                                                                                <div>
                                                                                    <p className="text-xs text-red-700 font-medium">{safeString(conf.description)}</p>
                                                                                    {conf.relationship && <p className="text-xs text-red-600">{safeString(conf.relationship)}</p>}
                                                                                    {Array.isArray(docs) && docs.length > 0 && (
                                                                                        <p className="mt-1 text-xs text-red-500">Between: {docs.map((d) => safeString(d)).join(" and ")}</p>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {run.evidence_gaps && run.evidence_gaps.length > 0 && (
                                                        <div>
                                                            <h4 className="text-xs uppercase tracking-wider text-amber-500 font-semibold mb-2">Evidence Gaps</h4>
                                                            <div className="space-y-2 border-t border-amber-100 pt-2">
                                                                {run.evidence_gaps.map((gap, i) => (
                                                                    <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                                                                        <p className="text-xs text-amber-800 font-medium">{safeString(gap.description || gap.missing_information)}</p>
                                                                        <p className="mt-1 text-xs text-amber-700">Why it matters: {safeString(gap.why_it_matters || gap.impact_on_investigation)}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {run.suggested_actions && run.suggested_actions.length > 0 && (
                                                        <div>
                                                            <h4 className="text-xs uppercase tracking-wider text-neutral-400 font-semibold mb-2">Suggested Actions</h4>
                                                            <div className="space-y-2 border-t border-neutral-100 pt-2">
                                                                {run.suggested_actions.map((act, i) => (
                                                                    <div key={i} className="rounded-lg border border-neutral-200 bg-white p-2.5 flex items-start gap-2">
                                                                        <Activity size={12} className="text-neutral-500 shrink-0 mt-0.5" />
                                                                        <div>
                                                                            <p className="text-xs font-medium text-neutral-800">{safeString(act.action)}</p>
                                                                            <p className="text-xs text-neutral-500">{safeString(act.rationale || act.reason)}</p>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            </section>

            <aside className="min-w-0">
                <div className="sticky top-4 space-y-3">
                    <InsightPanel
                        title="Collaboration"
                        icon={<Users size={13} />}
                    >
                        <div className="space-y-4">
                            <div className="flex flex-col gap-2">
                                <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Members</span>
                                <div className="space-y-2">
                                    {collaborators.map(c => (
                                        <div key={c.id} className="flex items-center justify-between text-sm">
                                            <div className="flex items-center gap-2">
                                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-neutral-200 text-xs font-medium text-neutral-600">
                                                    {c.initials}
                                                </div>
                                                <span className="text-neutral-700">{c.email}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-neutral-500">{c.role}</span>
                                                {c.role !== 'Owner' && (
                                                    <button onClick={() => handleRemoveCollaborator(c.id)} className="text-neutral-500 hover:text-red-400">
                                                        &times;
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-2 flex gap-2">
                                    <input 
                                        type="text" 
                                        placeholder="User ID" 
                                        value={newCollabUserId} 
                                        onChange={(e) => setNewCollabUserId(e.target.value)}
                                        className="h-8 flex-1 rounded-md border border-neutral-200 bg-neutral-50 px-2 text-xs focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                                    />
                                    <button 
                                        onClick={handleAddCollaborator}
                                        disabled={addingCollaborator || !newCollabUserId.trim()}
                                        className="h-8 rounded-md bg-neutral-900 px-3 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                                    >
                                        {addingCollaborator ? 'Adding...' : 'Add'}
                                    </button>
                                </div>
                                <div className="mt-4 flex flex-col gap-2 border-t border-neutral-100 pt-4">
                                    <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Live Presence</span>
                                    <div className="flex flex-wrap gap-1">
                                        {livePresence.length > 0 ? livePresence.map((viewer, i) => (
                                            <div 
                                                key={i} 
                                                className={`inline-block h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium ${viewer.is_current_user ? 'bg-blue-100 text-blue-700' : 'bg-neutral-200 text-neutral-600'}`}
                                                title={`User ${viewer.user_id}`}
                                            >
                                                {viewer.initials}
                                            </div>
                                        )) : (
                                            <span className="text-xs text-neutral-400">No active viewers</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </InsightPanel>
                    <InsightPanel
                        title="Agent Activity"
                        icon={<Sparkles size={13} />}
                    >
                        <div className="space-y-3">
                            {agentRuns.length === 0 ? (
                                <p className="text-xs text-neutral-400">No agent activity yet.</p>
                            ) : (
                                agentRuns.slice(0, 3).map((run) => (
                                    <AgentStatus
                                        key={run.id}
                                        name="Agent Run"
                                        detail={run.status.charAt(0).toUpperCase() + run.status.slice(1)}
                                        active={run.status === "processing" || run.status === "pending"}
                                    />
                                ))
                            )}
                        </div>
                    </InsightPanel>

                    <InsightPanel
                        title="Human Review"
                        icon={<Users size={13} />}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                {selectedInvestigation?.review_status ? (
                                    <>
                                        <p className={`text-xs font-medium ${selectedInvestigation.review_status === 'Approved' ? 'text-green-700' : 'text-red-700'}`}>
                                            {selectedInvestigation.review_status}
                                        </p>
                                        <p className="mt-1 text-xs leading-4 text-neutral-400">
                                            Reviewed on {new Date(selectedInvestigation.reviewed_at!).toLocaleDateString()}
                                            {selectedInvestigation.reviewer_id && ` by User ${selectedInvestigation.reviewer_id}`}
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        <p className="text-xs font-medium">
                                            Review required
                                        </p>
                                        <p className="mt-1 text-xs leading-4 text-neutral-400">
                                            A human decision is required before the
                                            recommendation can be finalized.
                                        </p>
                                    </>
                                )}
                            </div>

                            {!selectedInvestigation?.review_status && (
                                <button
                                    onClick={() => {
                                        setReviewDecision(null)
                                        setReviewReason("")
                                        setReviewError("")
                                        setReviewModalOpen(true)
                                    }}
                                    className="ml-3 shrink-0 rounded-md border border-neutral-200 px-2 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
                                >
                                    Review
                                </button>
                            )}
                        </div>
                    </InsightPanel>

                    <InsightPanel
                        title="Risk Evaluation"
                        icon={<ShieldAlert size={13} />}
                    >
                        {(() => {
                            const latestRun = agentRuns.find(run => run.status === 'completed' && run.risk_score !== null && run.risk_score !== undefined)

                            if (latestRun) {
                                return (
                                    <>
                                        <div className="flex items-end justify-between">
                                            <div>
                                                <p className="text-2xl font-semibold tracking-tight">
                                                    {latestRun.risk_level}
                                                </p>

                                                <p className="mt-1 text-xs text-neutral-400">
                                                    Automated preliminary heuristic based on structured findings
                                                </p>
                                            </div>

                                            <span className="text-xs text-neutral-400">
                                                {latestRun.risk_score} / 100
                                            </span>
                                        </div>

                                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                                            <div className="h-full rounded-full bg-neutral-700" style={{ width: `${latestRun.risk_score}%` }} />
                                        </div>
                                    </>
                                )
                            }

                            return (
                                <>
                                    <div className="flex items-end justify-between">
                                        <div>
                                            <p className="text-2xl font-semibold tracking-tight">
                                                Pending
                                            </p>

                                            <p className="mt-1 text-xs text-neutral-400">
                                                Automated preliminary heuristic based on structured findings
                                            </p>
                                        </div>

                                        <span className="text-xs text-neutral-400">
                                            N/A
                                        </span>
                                    </div>

                                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                                        <div className="h-full w-0 rounded-full bg-neutral-700" />
                                    </div>
                                </>
                            )
                        })()}
                    </InsightPanel>

                    <InsightPanel
                        title="Governance Recommendation"
                        icon={<CheckCircle2 size={13} />}
                    >
                        {(() => {
                            const latestRun = agentRuns.find(run => run.status === 'completed' && run.suggested_actions && run.suggested_actions.length > 0)
                            if (latestRun) {
                                const action = latestRun.suggested_actions[0]
                                return (
                                    <>
                                        <p className="text-xs font-medium leading-5">
                                            {action.action}
                                        </p>
                                        <p className="mt-2 text-xs leading-4 text-neutral-400">
                                            {action.reason}
                                        </p>
                                    </>
                                )
                            }
                            return (
                                <p className="text-xs leading-4 text-neutral-400">
                                    No recommendations yet.
                                </p>
                            )
                        })()}
                    </InsightPanel>

                    <InsightPanel
                        title="Recommendation Trace"
                        icon={<Search size={13} />}
                    >
                        {(() => {
                            const latestRun = agentRuns.find(run => run.status === 'completed')

                            if (!latestRun) {
                                return (
                                    <p className="text-xs leading-4 text-neutral-400">
                                        Awaiting analysis to generate trace.
                                    </p>
                                )
                            }

                            const traceSteps: string[] = ["Analysis initialized"]

                            if (latestRun.applicable_requirements && latestRun.applicable_requirements.length > 0) {
                                traceSteps.push("Regulatory requirements identified")
                            }
                            if (latestRun.evidence && latestRun.evidence.length > 0) {
                                traceSteps.push("Document evidence retrieved")
                            }
                            if (latestRun.conflicts && latestRun.conflicts.length > 0) {
                                traceSteps.push("Policy conflicts detected")
                            }
                            if (latestRun.evidence_gaps && latestRun.evidence_gaps.length > 0) {
                                traceSteps.push("Evidence gaps identified")
                            }
                            if (latestRun.risk_score !== null && latestRun.risk_score !== undefined) {
                                traceSteps.push("Risk evaluation completed")
                            }
                            if (latestRun.suggested_actions && latestRun.suggested_actions.length > 0) {
                                traceSteps.push("Governance recommendations generated")
                            }

                            return (
                                <div className="space-y-2">
                                    {traceSteps.map((step, index) => (
                                        <TraceRow
                                            key={index}
                                            number={String(index + 1).padStart(2, '0')}
                                            text={step}
                                        />
                                    ))}
                                </div>
                            )
                        })()}
                    </InsightPanel>


                </div>
            </aside>

            {/* Review Modal */}
            {reviewModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
                    <div className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-2xl ring-1 ring-neutral-200/50">
                        <div className="border-b border-neutral-100 bg-neutral-50/50 px-5 py-4">
                            <h3 className="text-base font-semibold text-neutral-900">
                                Human Review
                            </h3>
                            <p className="mt-1 text-sm text-neutral-500">
                                Provide a final compliance decision for this investigation.
                            </p>
                        </div>
                        <form onSubmit={handleReviewSubmit} className="p-5">
                            <div className="space-y-4">
                                <div className="flex gap-4">
                                    <label className="flex items-center gap-2 text-sm text-neutral-700">
                                        <input
                                            type="radio"
                                            name="reviewDecision"
                                            value="Approved"
                                            checked={reviewDecision === "Approved"}
                                            onChange={() => setReviewDecision("Approved")}
                                            className="h-4 w-4 border-neutral-300 text-blue-600 focus:ring-blue-600"
                                        />
                                        Approve
                                    </label>
                                    <label className="flex items-center gap-2 text-sm text-neutral-700">
                                        <input
                                            type="radio"
                                            name="reviewDecision"
                                            value="Rejected"
                                            checked={reviewDecision === "Rejected"}
                                            onChange={() => setReviewDecision("Rejected")}
                                            className="h-4 w-4 border-neutral-300 text-blue-600 focus:ring-blue-600"
                                        />
                                        Reject
                                    </label>
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm font-medium text-neutral-700">
                                        Justification (optional)
                                    </label>
                                    <textarea
                                        value={reviewReason}
                                        onChange={(e) => setReviewReason(e.target.value)}
                                        className="h-24 w-full rounded-md border border-neutral-200 p-3 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                                        placeholder="Explain the reasoning behind this decision..."
                                    />
                                </div>
                            </div>

                            {reviewError && (
                                <div className="mt-3 rounded bg-red-50 p-2 text-xs text-red-600">
                                    {reviewError}
                                </div>
                            )}

                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    type="button"
                                    onClick={() => setReviewModalOpen(false)}
                                    className="rounded-md px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
                                    disabled={submittingReview}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={submittingReview || !reviewDecision}
                                    className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
                                >
                                    {submittingReview ? "Submitting..." : "Submit Review"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}


            {previewDocument && (
                <DocumentPreviewModal
                    document={previewDocument}
                    url={previewUrl}
                    loading={previewLoading}
                    onClose={closePreview}
                />
            )}

            {duplicateMessage && (
                <div
                    className={`pointer-events-none fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 transition-all duration-300 ease-out ${duplicateToastClosing
                            ? "translate-y-2 opacity-0"
                            : "translate-y-0 opacity-100"
                        }`}
                    role="status"
                    aria-live="polite"
                >
                    <div className="rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-xs font-medium text-neutral-700 shadow-lg">
                        File already exists
                    </div>
                </div>
            )}

            {editInvestigationId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
                        <h2 className="text-base font-semibold">Edit Investigation</h2>
                        <div className="mt-4 space-y-3">
                            <div>
                                <label className="block text-xs font-medium text-neutral-700">Title</label>
                                <input
                                    value={editInvestigationTitle}
                                    onChange={(e) => setEditInvestigationTitle(e.target.value)}
                                    className="mt-1 w-full rounded-md border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
                                    placeholder="Investigation title"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-700">Description</label>
                                <textarea
                                    value={editInvestigationDescription}
                                    onChange={(e) => setEditInvestigationDescription(e.target.value)}
                                    rows={3}
                                    className="mt-1 w-full resize-none rounded-md border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-neutral-400"
                                    placeholder="Optional description"
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setEditInvestigationId(null)}
                                className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={updateInvestigation}
                                disabled={editingInvestigation || !editInvestigationTitle.trim()}
                                className="rounded-full bg-neutral-900 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                            >
                                {editingInvestigation ? "Saving..." : "Save Changes"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteInvestigationId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
                    <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-2xl">
                        <h2 className="text-base font-semibold text-red-600">Delete Investigation?</h2>
                        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
                            Are you sure you want to delete this investigation? This action cannot be undone. Underlying documents will remain in your workspace.
                        </p>
                        <div className="mt-6 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setDeleteInvestigationId(null)}
                                className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={deleteInvestigation}
                                disabled={deletingInvestigation}
                                className="rounded-md bg-red-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                            >
                                {deletingInvestigation ? "Deleting..." : "Delete Permanently"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {shareModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
                        <div className="mb-6">
                            <h2 className="text-lg font-semibold text-neutral-900">Share to Public Knowledge</h2>
                            <p className="mt-1 text-xs text-neutral-500">Publish this finding for all users in the organization to see.</p>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="mb-1 block text-xs font-medium text-neutral-700">Title <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    value={shareTitle}
                                    onChange={(e) => setShareTitle(e.target.value)}
                                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-400"
                                    placeholder="Enter a descriptive title"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-medium text-neutral-700">Content <span className="text-red-500">*</span></label>
                                <textarea
                                    value={shareContent}
                                    onChange={(e) => setShareContent(e.target.value)}
                                    rows={5}
                                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-400"
                                    placeholder="Detailed finding or insight"
                                />
                            </div>

                            <div>
                                <label className="mb-1 block text-xs font-medium text-neutral-700">Source / Citation</label>
                                <input
                                    type="text"
                                    value={shareSource}
                                    onChange={(e) => setShareSource(e.target.value)}
                                    className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-400"
                                    placeholder="e.g. Document ABC or Agent Analysis"
                                />
                            </div>
                        </div>

                        <div className="mt-8 flex justify-end gap-3">
                            <button
                                onClick={() => setShareModalOpen(false)}
                                className="rounded-lg border border-neutral-200 px-4 py-2 text-xs font-medium text-neutral-600 transition hover:bg-neutral-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={async () => {
                                    if (!shareTitle || !shareContent) return
                                    setSharingKnowledge(true)
                                    try {
                                        const token = localStorage.getItem("access_token")
                                        const res = await fetch("http://127.0.0.1:8000/api/v1/knowledge/", {
                                            method: "POST",
                                            headers: {
                                                "Content-Type": "application/json",
                                                Authorization: `Bearer ${token}`
                                            },
                                            body: JSON.stringify({
                                                title: shareTitle,
                                                content: shareContent,
                                                source_citation: shareSource,
                                                investigation_id: selectedInvestigation?.id
                                            })
                                        })
                                        if (res.ok) {
                                            setMessage("Finding successfully published to Public Knowledge.")
                                            setShareModalOpen(false)
                                        } else {
                                            setMessage("Failed to share finding.")
                                        }
                                    } catch (err) {
                                        console.error(err)
                                    } finally {
                                        setSharingKnowledge(false)
                                    }
                                }}
                                disabled={sharingKnowledge || !shareTitle || !shareContent}
                                className="rounded-full bg-neutral-900 px-4 py-2 text-xs font-medium text-white transition hover:bg-neutral-800 disabled:opacity-50"
                            >
                                {sharingKnowledge ? "Publishing..." : "Publish Finding"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

function DocumentPreviewModal({
    document,
    url,
    loading,
    onClose,
}: {
    document: Document
    url: string | null
    loading: boolean
    onClose: () => void
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
                    <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{document.title}</p>
                        <p className="mt-0.5 truncate text-xs text-neutral-400">{document.filename}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="min-h-0 flex-1 bg-neutral-100">
                    {loading ? (
                        <div className="flex h-full items-center justify-center text-xs text-neutral-400">
                            Loading preview...
                        </div>
                    ) : url ? (
                        <iframe
                            src={url}
                            title={`Preview of ${document.filename}`}
                            className="h-full w-full border-0"
                        />
                    ) : (
                        <div className="flex h-full items-center justify-center p-6 text-center text-xs text-neutral-400">
                            Preview is not available for this document.
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function SectionHeader({
    icon,
    title,
    detail,
}: {
    icon: React.ReactNode
    title: string
    detail: string
}) {
    return (
        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
            <div className="flex items-center gap-2">
                <span className="text-neutral-500">{icon}</span>

                <div>
                    <h2 className="text-sm font-semibold">{title}</h2>

                    <p className="mt-0.5 text-xs text-neutral-400">
                        {detail}
                    </p>
                </div>
            </div>


        </div>
    )
}

function ComparisonCard({
    label,
    title,
    text,
}: {
    label: string
    title: string
    text: string
}) {
    return (
        <div className="rounded-lg border border-neutral-200 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-neutral-400">
                {label}
            </p>

            <p className="mt-2 text-xs font-semibold">{title}</p>

            <p className="mt-2 text-xs leading-4 text-neutral-500">
                {text}
            </p>
        </div>
    )
}

function Comment({
    initials,
    name,
    role,
    time,
    text,
    ai = false,
}: {
    initials: string
    name: string
    role: string
    time: string
    text: string
    ai?: boolean
}) {
    return (
        <div className="flex gap-3 p-4">
            <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${ai
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-600"
                    }`}
            >
                {initials}
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <p className="text-xs font-medium">{name}</p>

                    <span className="text-xs text-neutral-400">
                        {role}
                    </span>

                    <span className="text-xs text-neutral-300">•</span>

                    <span className="text-xs text-neutral-400">
                        {time}
                    </span>
                </div>

                <p className="mt-2 text-xs leading-4 text-neutral-500">
                    {text}
                </p>
            </div>
        </div>
    )
}

function EvidenceRow({
    document,
    onPreview,
    onDetach,
    detaching,
}: {
    document: Document
    onPreview: (document: Document) => void
    onDetach: (documentId: number) => void
    detaching: boolean
}) {
    return (
        <div className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                <FileText size={14} className="text-neutral-500" />
            </div>

            <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">
                    {document.title}
                </p>

                <p className="mt-1 truncate text-xs text-neutral-400">
                    {document.filename} · {document.document_type} ·{" "}
                    {document.jurisdiction}
                </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
                <div className="text-right">
                    <span
                        className={`rounded-full px-2 py-1 text-xs ${document.processing_status === "Ready"
                            ? "bg-neutral-100 text-neutral-600"
                            : "bg-neutral-50 text-neutral-400"
                            }`}
                    >
                        {document.processing_status}
                    </span>

                    {document.chunks > 0 && (
                        <p className="mt-1 text-xs text-neutral-400">
                            {document.embedded_chunks}/{document.chunks} chunks
                        </p>
                    )}
                </div>

                <button
                    type="button"
                    onClick={() => onPreview(document)}
                    title="Preview document"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50"
                >
                    <Eye size={12} />
                </button>

                <button
                    type="button"
                    onClick={() => onDetach(document.id)}
                    disabled={detaching}
                    title="Remove from investigation"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 disabled:opacity-40"
                >
                    <Trash2 size={12} />
                </button>
            </div>
        </div>
    )
}



function InsightPanel({
    title,
    icon,
    children,
}: {
    title: string
    icon: React.ReactNode
    children: React.ReactNode
}) {
    return (
        <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2 border-b border-neutral-100 pb-3">
                <span className="text-neutral-500">{icon}</span>

                <h2 className="text-xs font-semibold">{title}</h2>
            </div>

            {children}
        </div>
    )
}

function AgentStatus({
    name,
    detail,
    active,
}: {
    name: string
    detail: string
    active: boolean
}) {
    return (
        <div className="flex items-center gap-2.5">
            <span
                className={`h-1.5 w-1.5 rounded-full ${active ? "bg-neutral-700" : "bg-neutral-300"
                    }`}
            />

            <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{name}</p>

                <p className="mt-0.5 text-xs text-neutral-400">
                    {detail}
                </p>

            </div>
        </div>
    )
}

function TraceRow({
    number,
    text,
}: {
    number: string
    text: string
}) {
    return (
        <div className="flex items-start gap-2.5">
            <span className="text-xs text-neutral-300">{number}</span>

            <p className="text-xs leading-4 text-neutral-500">{text}</p>
        </div>
    )
}



export default Investigations