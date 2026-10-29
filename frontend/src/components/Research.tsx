import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
    ArrowUp,
    FileText,
    FolderLock,
    Paperclip,
    Search,
    Share2,
    Sparkles,
    Square,
    Trash2,
    X,
} from "lucide-react"
import { MarkdownRenderer } from "./common/MarkdownRenderer"
import { normalizeApiError, safeString } from "../utils/errorUtils"

const API = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "")

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ResearchQuery = {
    id: number
    question: string
    status: string
    answer?: string
    sources?: RagSource[]
    created_at: string | null
}

type RagSource = {
    document_id: number
    document_title: string
    filename: string
    chunk: number
    distance: number
}

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
}

type Investigation = {
    id: number
    title: string
    description: string | null
    status: string
}

// ---------------------------------------------------------------------------
// Attach document to investigation modal
// ---------------------------------------------------------------------------

function AttachModal({
    documents,
    onClose,
}: {
    documents: Document[]
    onClose: () => void
}) {
    const { t } = useTranslation()
    const [investigations, setInvestigations] = useState<Investigation[]>([])
    const [selectedDoc, setSelectedDoc] = useState<number | "">("")
    const [selectedInv, setSelectedInv] = useState<number | "">("")
    const [saving, setSaving] = useState(false)
    const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
    const [loadingInvs, setLoadingInvs] = useState(true)

    useEffect(() => {
        const fetch_ = async () => {
            const token = localStorage.getItem("access_token")
            try {
                const res = await fetch(`${API}/api/v1/investigations/`, {
                    headers: { Authorization: `Bearer ${token}` },
                })
                if (res.ok) setInvestigations(await res.json())
            } finally {
                setLoadingInvs(false)
            }
        }
        fetch_()
    }, [])

    const handleAttach = async () => {
        if (!selectedDoc || !selectedInv) return
        setSaving(true)
        setResult(null)
        const token = localStorage.getItem("access_token")
        try {
            const res = await fetch(
                `${API}/api/v1/investigations/${selectedInv}/documents/${selectedDoc}`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` },
                }
            )
            if (res.status === 409) {
                setResult({ ok: false, msg: "Document is already attached to this investigation." })
            } else if (!res.ok) {
                const d = await res.json().catch(() => ({}))
                setResult({ ok: false, msg: d?.detail ?? "Failed to attach document." })
            } else {
                const docTitle = documents.find((d) => d.id === selectedDoc)?.title ?? ""
                const invTitle = investigations.find((i) => i.id === selectedInv)?.title ?? ""
                setResult({
                    ok: true,
                    msg: `"${docTitle}" attached to "${invTitle}".`,
                })
            }
        } catch {
            setResult({ ok: false, msg: "Unable to connect to the server." })
        } finally {
            setSaving(false)
        }
    }

    const readyDocs = documents.filter((d) => d.processing_status === "Ready")
    const activeInvs = investigations.filter((i) => i.status === "Active")

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
            <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
                    <div className="flex items-center gap-2">
                        <Paperclip size={14} className="text-neutral-500" />
                        <h2 className="text-sm font-semibold text-neutral-900">{t("investigations.details.uploadDocument", "Attach Document to Investigation")}</h2>
                    </div>
                    <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100">
                        <X size={14} />
                    </button>
                </div>

                <div className="space-y-4 p-5">
                    {result && (
                        <div
                            className={`rounded-lg px-3 py-2 text-xs ${
                                result.ok
                                    ? "bg-green-50 text-green-700"
                                    : "bg-red-50 text-red-600"
                            }`}
                        >
                            {result.msg}
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 mb-1">
                            {t("investigations.columns.documents", "Document")}
                        </label>
                        {readyDocs.length === 0 ? (
                            <p className="text-xs text-neutral-400">
                                {t("investigations.details.noDocuments", "No ready documents in your repository. Upload and process a document first.")}
                            </p>
                        ) : (
                            <select
                                value={selectedDoc}
                                onChange={(e) => setSelectedDoc(Number(e.target.value) || "")}
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-400"
                            >
                                <option value="">{t("research.comparison.selectBase", "Select a document…")}</option>
                                {readyDocs.map((d) => (
                                    <option key={d.id} value={d.id}>
                                        {d.title}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 mb-1">
                            {t("nav.investigations", "Investigation")}
                        </label>
                        {loadingInvs ? (
                            <p className="text-xs text-neutral-400">{t("common.loading", "Loading investigations…")}</p>
                        ) : activeInvs.length === 0 ? (
                            <p className="text-xs text-neutral-400">
                                {t("investigations.empty.desc", "No active investigations. Create one in the Investigations workspace first.")}
                            </p>
                        ) : (
                            <select
                                value={selectedInv}
                                onChange={(e) => setSelectedInv(Number(e.target.value) || "")}
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-400"
                            >
                                <option value="">{t("research.selectInvestigation", "Select an investigation…")}</option>
                                {activeInvs.map((i) => (
                                    <option key={i.id} value={i.id}>
                                        {i.title}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-neutral-100 px-5 py-4">
                    <button
                        onClick={onClose}
                        className="rounded-lg px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
                    >
                        {t("common.close", "Close")}
                    </button>
                    <button
                        onClick={handleAttach}
                        disabled={!selectedDoc || !selectedInv || saving}
                        className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs text-white disabled:opacity-40 hover:bg-neutral-700"
                    >
                        {saving ? t("common.saving", "Attaching…") : t("common.add", "Attach")}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Share answer to investigation modal
// ---------------------------------------------------------------------------

function ShareToInvestigationModal({
    question,
    answer,
    onClose,
}: {
    question: string
    answer: string
    onClose: () => void
}) {
    const { t } = useTranslation()
    const [investigations, setInvestigations] = useState<Investigation[]>([])
    const [selectedInv, setSelectedInv] = useState<number | "">("")
    const [saving, setSaving] = useState(false)
    const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null)
    const [loadingInvs, setLoadingInvs] = useState(true)

    useEffect(() => {
        const fetch_ = async () => {
            const token = localStorage.getItem("access_token")
            try {
                const res = await fetch(`${API}/api/v1/investigations/`, {
                    headers: { Authorization: `Bearer ${token}` },
                })
                if (res.ok) setInvestigations(await res.json())
            } finally {
                setLoadingInvs(false)
            }
        }
        fetch_()
    }, [])

    const handleShare = async () => {
        if (!selectedInv) return
        setSaving(true)
        setResult(null)
        const token = localStorage.getItem("access_token")
        try {
            const res = await fetch(
                `${API}/api/v1/investigations/${selectedInv}/queries`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ question, answer }),
                }
            )
            if (!res.ok) {
                const d = await res.json().catch(() => ({}))
                setResult({ ok: false, msg: d?.detail ?? "Failed to share to investigation." })
            } else {
                const invTitle = investigations.find((i) => i.id === selectedInv)?.title ?? ""
                setResult({
                    ok: true,
                    msg: `Research added to investigation "${invTitle}".`,
                })
            }
        } catch {
            setResult({ ok: false, msg: "Unable to connect to the server." })
        } finally {
            setSaving(false)
        }
    }

    const activeInvs = investigations.filter((i) => i.status === "Active")

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
            <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
                    <div className="flex items-center gap-2">
                        <Share2 size={14} className="text-neutral-500" />
                        <h2 className="text-sm font-semibold text-neutral-900">{t("nav.investigations", "Share to Investigation")}</h2>
                    </div>
                    <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100">
                        <X size={14} />
                    </button>
                </div>

                <div className="space-y-4 p-5">
                    {result && (
                        <div
                            className={`rounded-lg px-3 py-2 text-xs ${
                                result.ok
                                    ? "bg-green-50 text-green-700"
                                    : "bg-red-50 text-red-600"
                            }`}
                        >
                            {result.msg}
                        </div>
                    )}

                    <div className="rounded-lg border border-neutral-100 bg-neutral-50 p-3">
                        <p className="text-xs font-medium text-neutral-500 mb-1">{t("research.tabs.general", "Question being shared")}</p>
                        <p className="text-xs text-neutral-700 line-clamp-3">{question}</p>
                    </div>

                    <div>
                        <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 mb-1">
                            {t("nav.investigations", "Destination Investigation")}
                        </label>
                        {loadingInvs ? (
                            <p className="text-xs text-neutral-400">{t("common.loading", "Loading investigations…")}</p>
                        ) : activeInvs.length === 0 ? (
                            <p className="text-xs text-neutral-400">
                                {t("investigations.empty.desc", "No active investigations. Create one in the Investigations workspace first.")}
                            </p>
                        ) : (
                            <select
                                value={selectedInv}
                                onChange={(e) => setSelectedInv(Number(e.target.value) || "")}
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-400"
                            >
                                <option value="">{t("research.selectInvestigation", "Select an investigation…")}</option>
                                {activeInvs.map((i) => (
                                    <option key={i.id} value={i.id}>
                                        {i.title}
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>

                    <p className="text-xs text-neutral-400 leading-relaxed">
                        The question and answer will be saved as a query record inside the selected investigation.
                        Your research remains private in this workspace until you share it.
                    </p>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-neutral-100 px-5 py-4">
                    <button
                        onClick={onClose}
                        className="rounded-lg px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
                    >
                        {t("common.close", "Close")}
                    </button>
                    <button
                        onClick={handleShare}
                        disabled={!selectedInv || saving || result?.ok === true}
                        className="rounded-full bg-neutral-900 px-4 py-1.5 text-xs text-white disabled:opacity-40 hover:bg-neutral-700"
                    >
                        {saving ? t("common.saving", "Sharing…") : t("common.save", "Share")}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Main Research component
// ---------------------------------------------------------------------------

function Research() {
    const { t } = useTranslation()
    const [queries, setQueries] = useState<ResearchQuery[]>([])
    const [documents, setDocuments] = useState<Document[]>([])
    const [question, setQuestion] = useState("")
    const [answer, setAnswer] = useState("")
    const [sources, setSources] = useState<RagSource[]>([])
    const [ragLoading, setRagLoading] = useState(false)
    const [message, setMessage] = useState("")
    const [wsLoading, setWsLoading] = useState(true)
    const [showAttach, setShowAttach] = useState(false)
    const [showShare, setShowShare] = useState(false)
    const [showHeaderShare, setShowHeaderShare] = useState(false)
    const [deletingId, setDeletingId] = useState<number | null>(null)
    const abortControllerRef = useRef<AbortController | null>(null)

    // Track the question that produced the current answer, for sharing
    const lastQuestion = useRef("")

    // Load pending question from investigations
    useEffect(() => {
        const pendingQ = localStorage.getItem('pending_research_question')
        const pendingA = localStorage.getItem('pending_research_answer')
        if (pendingQ) {
            setQuestion(pendingQ)
            setAnswer(pendingA || "")
            lastQuestion.current = pendingQ
            localStorage.removeItem('pending_research_question')
            localStorage.removeItem('pending_research_answer')
        }
    }, [])

    // Load workspace on mount
    useEffect(() => {
        const token = localStorage.getItem("access_token")
        if (!token) {
            setMessage("Authentication required")
            setWsLoading(false)
            return
        }

        const loadWorkspace = async () => {
            try {
                const [researchResponse, documentsResponse] = await Promise.all([
                    fetch(`${API}/api/v1/research/sessions`, {
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                    fetch(`${API}/api/v1/documents/`, {
                        headers: { Authorization: `Bearer ${token}` },
                    }),
                ])

                if (researchResponse.ok) {
                    const researchData = await researchResponse.json()
                    setQueries(Array.isArray(researchData) ? researchData : (researchData.items || []))
                }

                if (documentsResponse.ok) {
                    const documentsData = await documentsResponse.json()
                    setDocuments(documentsData.items || [])
                }
            } catch {
                setMessage("Unable to connect to the backend")
            } finally {
                setWsLoading(false)
            }
        }

        loadWorkspace()
    }, [])

    const handleStopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort()
            abortControllerRef.current = null
        }
        setRagLoading(false)
    }

    // Submit RAG query with streaming
    const askRag = async () => {
        if (!question.trim() || ragLoading) return

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
        lastQuestion.current = currentQuestion

        const abortController = new AbortController()
        abortControllerRef.current = abortController

        let streamSucceeded = false
        let fullAnswer = ""
        let finalSources: RagSource[] = []

        try {
            // 1. Attempt streaming from /api/v1/rag/stream
            const streamResponse = await fetch(`${API}/api/v1/rag/stream`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ question: currentQuestion, limit: 5 }),
                signal: abortController.signal,
            })

            if (streamResponse.ok && streamResponse.body) {
                streamSucceeded = true
                const reader = streamResponse.body.getReader()
                const decoder = new TextDecoder("utf-8")
                let buffer = ""

                while (true) {
                    const { done, value } = await reader.read()
                    if (done) break

                    buffer += decoder.decode(value, { stream: true })
                    const lines = buffer.split("\n")
                    buffer = lines.pop() || ""

                    let currentEvent = "message"
                    for (const line of lines) {
                        const trimmed = line.trim()
                        if (trimmed.startsWith("event:")) {
                            currentEvent = trimmed.slice(6).trim()
                        } else if (trimmed.startsWith("data:")) {
                            const dataStr = trimmed.slice(5).trim()
                            try {
                                const parsed = JSON.parse(dataStr)
                                if (currentEvent === "delta") {
                                    const delta = parsed.delta || ""
                                    if (delta) {
                                        fullAnswer += delta
                                        setAnswer(fullAnswer)
                                    }
                                } else if (currentEvent === "sources") {
                                    finalSources = parsed.sources || []
                                    setSources(finalSources)
                                } else if (currentEvent === "done") {
                                    if (parsed.answer) fullAnswer = parsed.answer
                                    if (parsed.sources) finalSources = parsed.sources
                                    setAnswer(fullAnswer)
                                    setSources(finalSources)
                                } else if (currentEvent === "error") {
                                    const errMsg = parsed.error || "Streaming error occurred."
                                    fullAnswer = `Error: ${errMsg}`
                                    setAnswer(fullAnswer)
                                }
                            } catch {
                                // Ignore parsing errors on keep-alives
                            }
                        }
                    }
                }

                // Persist completed session to history
                if (fullAnswer) {
                    try {
                        const saveResponse = await fetch(`${API}/api/v1/research/sessions`, {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${token}`,
                            },
                            body: JSON.stringify({
                                question: currentQuestion,
                                status: "Completed",
                                answer: fullAnswer,
                                sources: finalSources,
                            }),
                        })
                        if (saveResponse.ok) {
                            const savedQuery = await saveResponse.json()
                            setQueries((current) => [savedQuery, ...current])
                        }
                    } catch {
                        // Non-fatal
                    }
                }
                setQuestion("")
            }
        } catch (streamErr: any) {
            if (streamErr.name === "AbortError") {
                setAnswer((prev) => prev ? `${prev}\n\n*(Research stopped by user)*` : "*(Research stopped by user)*")
                setRagLoading(false)
                return
            }
        }

        // 2. Fallback to /api/v1/rag/ask if streaming failed
        if (!streamSucceeded) {
            try {
                const response = await fetch(`${API}/api/v1/rag/ask`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ question: currentQuestion, limit: 5 }),
                    signal: abortController.signal,
                })

                const data = await response.json()

                if (!response.ok) {
                    const normalizedErr = normalizeApiError(data.detail || data.error, "Unable to get an answer")
                    setAnswer(normalizedErr)
                    setRagLoading(false)
                    return
                }

                const ans = typeof data.answer === "string" ? data.answer : safeString(data.answer)
                setAnswer(ans)
                setSources(data.sources || [])

                const saveResponse = await fetch(`${API}/api/v1/research/sessions`, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({
                        question: currentQuestion,
                        status: "Completed",
                        answer: data.answer || "",
                        sources: data.sources || []
                    }),
                })

                if (saveResponse.ok) {
                    const savedQuery = await saveResponse.json()
                    setQueries((current) => [savedQuery, ...current])
                }

                setQuestion("")
            } catch (err: any) {
                if (err.name !== "AbortError") {
                    setAnswer("Unable to connect to the backend")
                }
            }
        }

        setRagLoading(false)
        abortControllerRef.current = null
    }


    // Delete a history entry
    const deleteSession = async (id: number) => {
        const token = localStorage.getItem("access_token")
        setDeletingId(id)
        try {
            await fetch(`${API}/api/v1/research/sessions/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            })
            setQueries((prev) => prev.filter((q) => q.id !== id))
        } finally {
            setDeletingId(null)
        }
    }

    const hasAnswer = !!answer

    return (
        <div className="grid gap-4 grid-cols-[minmax(0,1fr)_300px]">
            {/* --------------------------------------------------------- */}
            {/* Modals                                                      */}
            {/* --------------------------------------------------------- */}
            {showAttach && (
                <AttachModal documents={documents} onClose={() => setShowAttach(false)} />
            )}
            {showShare && hasAnswer && (
                <ShareToInvestigationModal
                    question={lastQuestion.current}
                    answer={answer}
                    onClose={() => setShowShare(false)}
                />
            )}
            {showHeaderShare && (
                <ShareToInvestigationModal
                    question={lastQuestion.current || "(No recent answer)"}
                    answer={answer || "(No recent answer)"}
                    onClose={() => setShowHeaderShare(false)}
                />
            )}

            {/* --------------------------------------------------------- */}
            {/* MAIN PANEL                                                  */}
            {/* --------------------------------------------------------- */}
            <section className="min-w-0">
                <div className="mb-4 flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <FolderLock size={15} className="text-neutral-500" />
                            <span className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-400">
                                {t("dashboard.activeWorkspace", "Private Workspace")}
                            </span>
                        </div>
                        <h1 className="mt-2 text-xl font-semibold tracking-tight">{t("research.title", "Research Desk")}</h1>
                        <p className="mt-1 text-sm text-neutral-500">
                            {t("research.subtitle", "Explore regulations, documents and compliance questions privately before sharing your work.")}
                        </p>
                    </div>

                    <button
                        onClick={() => setShowHeaderShare(true)}
                        disabled={!hasAnswer}
                        title={hasAnswer ? t("research.tabs.investigation", "Share the current answer to an investigation") : t("research.empty.desc", "Ask a question first to share its answer")}
                        className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <Share2 size={13} />
                        {t("nav.investigations", "Share to Investigation")}
                    </button>
                </div>

                {/* AI RESEARCH COMPOSER */}
                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                    <div className="flex gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white">
                            <Sparkles size={14} />
                        </div>

                        <div className="min-w-0 flex-1">
                            <textarea
                                value={question}
                                onChange={(e) => setQuestion(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !e.shiftKey) {
                                        e.preventDefault()
                                        askRag()
                                    }
                                }}
                                placeholder={t("research.inputPlaceholder", "Ask a legal or compliance question, analyze your documents, or explore a regulation…")}
                                rows={4}
                                className="w-full resize-none bg-transparent text-sm leading-5 outline-none placeholder:text-neutral-400"
                                disabled={ragLoading}
                            />

                            <div className="flex items-center justify-between border-t border-neutral-100 pt-3">
                                <div className="flex items-center gap-2">
                                    {/* ATTACH — opens modal to attach a document to an investigation */}
                                    <button
                                        onClick={() => setShowAttach(true)}
                                        title="Attach a repository document to an investigation"
                                        className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
                                    >
                                        <Paperclip size={12} />
                                        {t("investigations.details.uploadDocument", "Attach")}
                                    </button>

                                    {/* SEARCH — focuses and clears the textarea to start a new query */}
                                    <button
                                        onClick={() => {
                                            setQuestion("")
                                            setAnswer("")
                                            setSources([])
                                            setMessage("")
                                            const ta = document.querySelector("textarea")
                                            ta?.focus()
                                        }}
                                        title="Clear current question and start a new search"
                                        className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
                                    >
                                        <Search size={12} />
                                        {t("common.search", "New Search")}
                                    </button>

                                    {/* DEEP RESEARCH — requires an investigation, not available globally */}
                                    <button
                                        disabled
                                        title="Deep Research runs a multi-step AI agent against a specific investigation. Open an investigation and use the Agent tab there."
                                        className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-400 cursor-not-allowed opacity-50"
                                    >
                                        {t("agents.title", "Deep Research")}
                                    </button>
                                </div>

                                {ragLoading ? (
                                    <button
                                        onClick={handleStopGeneration}
                                        title="Stop research"
                                        className="flex h-8 items-center gap-1 px-3 rounded-full bg-red-500 text-white text-xs font-medium cursor-pointer shadow-sm hover:bg-red-600 transition-all"
                                    >
                                        <Square size={11} className="fill-current" />
                                        <span>{t("research.stopButton", "Stop")}</span>
                                    </button>
                                ) : (
                                    <button
                                        onClick={askRag}
                                        disabled={!question.trim()}
                                        className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FBC648] text-neutral-900 disabled:cursor-not-allowed disabled:opacity-30 hover:bg-[#F0BD44] transition-all cursor-pointer"
                                    >
                                        <ArrowUp size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* In-progress state */}
                {ragLoading && (
                    <div className="mt-3 flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-3">
                        <Sparkles size={13} className="animate-pulse text-neutral-500" />
                        <span className="text-sm text-neutral-400">
                            {t("research.comparison.comparing", "Searching your document repository…")}
                        </span>
                    </div>
                )}

                {/* Error / info message */}
                {message && !ragLoading && (
                    <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
                        {message}
                    </p>
                )}

                {/* AI ANSWER */}
                {(hasAnswer || (ragLoading && answer)) && (
                    <article className="mt-3 rounded-xl border border-neutral-200 bg-white p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Sparkles size={14} className={ragLoading ? "animate-pulse text-amber-500" : "text-neutral-700"} />
                                <span className="text-sm font-semibold">{t("research.title", "Research Assistant")}</span>
                                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                                    {t("dashboard.activeWorkspace", "Private")}
                                </span>
                                {ragLoading && (
                                    <span className="text-xs text-amber-600 animate-pulse font-medium">
                                        {t("common.loading", "Generating...")}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div className="mt-4 text-sm leading-6 text-neutral-700">
                            <MarkdownRenderer content={safeString(answer)} />
                        </div>

                        {sources.length > 0 && (
                            <div className="mt-5 border-t border-neutral-100 pt-4">
                                <div className="mb-3 flex items-center justify-between">
                                    <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">
                                        {t("investigations.details.evidence", "Evidence")}
                                    </h2>
                                    <span className="text-xs text-neutral-400">
                                        {sources.length} {t("research.sourcesTitle", "sources")}
                                    </span>
                                </div>

                                <div className="space-y-2">
                                    {sources.map((source, index) => (
                                        <div
                                            key={`${source.document_id}-${source.chunk}-${index}`}
                                            className="flex items-center gap-3 rounded-lg border border-neutral-100 bg-neutral-50 p-3"
                                        >
                                            <FileText size={14} className="shrink-0 text-neutral-500" />
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-xs font-medium">
                                                    {safeString(source.document_title, "Untitled Document")}
                                                </p>
                                                <p className="mt-0.5 text-xs text-neutral-400">
                                                    {safeString(source.filename)} · Chunk {source.chunk}
                                                </p>
                                            </div>
                                            <span className="text-xs text-neutral-400">
                                                {typeof source.distance === "number" ? source.distance.toFixed(3) : safeString(source.distance)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="mt-4 flex justify-end border-t border-neutral-100 pt-3">
                            <button
                                onClick={() => setShowShare(true)}
                                className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
                            >
                                <Share2 size={12} />
                                {t("nav.investigations", "Share to Investigation")}
                            </button>
                        </div>
                    </article>
                )}

                {/* PRIVATE RESEARCH HISTORY */}
                <div className="mt-5">
                    <div className="mb-3 flex items-center justify-between">
                        <div>
                            <h2 className="text-sm font-semibold">{t("research.tabs.general", "Private Research")}</h2>
                            <p className="mt-1 text-xs text-neutral-400">
                                {t("research.subtitle", "Your previous research sessions")}
                            </p>
                        </div>
                        <span className="text-xs text-neutral-400">
                            {wsLoading ? "…" : `${queries.length} sessions`}
                        </span>
                    </div>

                    <div className="space-y-2">
                        {wsLoading ? (
                            <div className="rounded-xl border border-dashed border-neutral-200 bg-white p-6 text-center">
                                <p className="text-sm text-neutral-400">{t("common.loading", "Loading history…")}</p>
                            </div>
                        ) : queries.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-neutral-200 bg-white p-6 text-center">
                                <p className="text-sm text-neutral-400">
                                    {t("research.empty.desc", "No private research sessions yet. Ask a question above to get started.")}
                                </p>
                            </div>
                        ) : (
                            queries.map((query) => (
                                <div
                                    key={query.id}
                                    className="group rounded-xl border border-neutral-200 bg-white p-4"
                                >
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <p
                                                className="text-sm font-medium cursor-pointer hover:text-neutral-600"
                                                onClick={() => {
                                                    setQuestion(query.question)
                                                    if (query.answer) setAnswer(query.answer)
                                                    if (query.sources) setSources(query.sources)
                                                }}
                                                title="Click to view this session"
                                            >
                                                {query.question}
                                            </p>
                                            <p className="mt-2 text-xs text-neutral-400">
                                                {query.created_at
                                                    ? new Date(query.created_at).toLocaleString()
                                                    : "No timestamp"}
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            <span
                                                className={`rounded-full px-2 py-1 text-xs ${
                                                    query.status === "Completed"
                                                        ? "bg-green-50 text-green-600"
                                                        : "bg-neutral-100 text-neutral-500"
                                                }`}
                                            >
                                                {query.status}
                                            </span>
                                            <button
                                                onClick={() => deleteSession(query.id)}
                                                disabled={deletingId === query.id}
                                                title="Remove from history"
                                                className="rounded p-1 text-neutral-300 hover:bg-neutral-100 hover:text-red-400 opacity-0 group-hover:opacity-100 disabled:opacity-30 transition-opacity"
                                            >
                                                <Trash2 size={11} />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </section>

            {/* --------------------------------------------------------- */}
            {/* PRIVATE CONTEXT PANEL (right sidebar)                       */}
            {/* --------------------------------------------------------- */}
            <aside className="min-w-0">
                <div className="sticky top-4">
                    <div className="mb-3">
                        <h2 className="text-sm font-semibold">{t("research.scope", "Private Context")}</h2>
                        <p className="mt-1 text-xs text-neutral-400">
                            {t("research.scopeAll", "Documents available to your research")}
                        </p>
                    </div>

                    <div className="rounded-xl border border-neutral-200 bg-white">
                        <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-3">
                            <span className="text-xs font-medium">{t("investigations.columns.documents", "Documents")}</span>
                            <span className="text-xs text-neutral-400">
                                {wsLoading ? "…" : documents.length}
                            </span>
                        </div>

                        <div className="divide-y divide-neutral-100 max-h-[60vh] overflow-y-auto">
                            {wsLoading ? (
                                <div className="p-4 text-center">
                                    <p className="text-xs text-neutral-400">{t("common.loading", "Loading…")}</p>
                                </div>
                            ) : documents.length === 0 ? (
                                <div className="p-5 text-center">
                                    <p className="text-xs text-neutral-400">
                                        {t("investigations.details.noDocuments", "No documents available. Upload documents in the Investigations workspace.")}
                                    </p>
                                </div>
                            ) : (
                                documents.map((document) => (
                                    <div key={document.id} className="p-3">
                                        <div className="flex gap-2.5">
                                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-neutral-100">
                                                <FileText size={13} className="text-neutral-500" />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="truncate text-xs font-medium">
                                                    {document.title}
                                                </p>
                                                <p className="mt-1 text-xs text-neutral-400">
                                                    {document.document_type} · {document.jurisdiction}
                                                </p>
                                                <div className="mt-2 flex items-center gap-2">
                                                    <span
                                                        className={`rounded-full px-2 py-0.5 text-xs ${
                                                            document.processing_status === "Ready"
                                                                ? "bg-green-50 text-green-600"
                                                                : document.processing_status === "Processing"
                                                                ? "bg-amber-50 text-amber-600"
                                                                : "bg-neutral-50 text-neutral-400"
                                                        }`}
                                                    >
                                                        {document.processing_status}
                                                    </span>
                                                    {document.chunks > 0 && (
                                                        <span className="text-xs text-neutral-400">
                                                            {document.embedded_chunks}/{document.chunks} chunks
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <div className="mt-3 rounded-xl border border-neutral-200 bg-white p-3">
                        <p className="text-xs font-medium">{t("settings.tabs.workspace", "Workspace visibility")}</p>
                        <p className="mt-1.5 text-xs leading-4 text-neutral-400">
                            {t("research.empty.desc", "Your research remains private until you explicitly share it with an investigation.")}
                        </p>
                    </div>

                    {/* Deep research callout */}
                    <div className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                        <p className="text-xs font-medium text-neutral-700">{t("agents.title", "Deep Research")}</p>
                        <p className="mt-1.5 text-xs leading-4 text-neutral-400">
                            {t("agents.subtitle", "Multi-step AI agent analysis is available inside an Investigation.")}
                        </p>
                    </div>
                </div>
            </aside>
        </div>
    )
}

export default Research
