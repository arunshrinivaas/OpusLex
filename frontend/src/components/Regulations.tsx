import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Gavel, Search, Plus, X, ChevronDown, ChevronUp } from "lucide-react"

const API = "http://127.0.0.1:8000"

type Regulation = {
    id: number
    title: string
    issuing_authority: string
    jurisdiction: string
    description: string | null
    status: string
    effective_date: string | null
    created_at: string | null
}

type LoadState = "loading" | "empty" | "error" | "ok"

const STATUS_OPTIONS = ["Active", "Inactive", "Repealed", "Draft"]

function statusBadge(status: string, t: any) {
    let colorClass = "status-progress"
    let statusLabel = status
    if (status === "Active") {
        colorClass = "status-compliant"
        statusLabel = t("investigations.statuses.active", "Active")
    } else if (status === "Inactive") {
        colorClass = "status-progress"
        statusLabel = t("common.waived", "Inactive")
    } else if (status === "Repealed") {
        colorClass = "status-non-compliant"
        statusLabel = t("investigations.statuses.closed", "Repealed")
    } else if (status === "Draft") {
        colorClass = "status-risk"
        statusLabel = t("common.inProgress", "Draft")
    }

    return (
        <div className="status-dot-wrapper" title={status}>
            <div className="status-dot-container">
                <div className={`status-dot ${colorClass}`} />
                <span className="status-label">{statusLabel}</span>
            </div>
        </div>
    )
}

function CreateRegulationModal({
    onClose,
    onCreated,
}: {
    onClose: () => void
    onCreated: () => void
}) {
    const { t } = useTranslation()
    const [form, setForm] = useState({
        title: "",
        issuing_authority: "",
        jurisdiction: "",
        description: "",
        status: "Active",
        effective_date: "",
    })
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState("")

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)
        setError("")
        try {
            const token = localStorage.getItem("access_token")
            const body: Record<string, unknown> = {
                title: form.title,
                issuing_authority: form.issuing_authority,
                jurisdiction: form.jurisdiction,
                status: form.status,
                description: form.description || null,
                effective_date: form.effective_date || null,
            }
            const res = await fetch(`${API}/api/v1/regulations/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data?.detail ?? "Failed to create regulation")
            }
            onCreated()
            onClose()
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Unknown error")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
            <div className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl">
                <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
                    <h2 className="text-sm font-semibold text-neutral-900">{t("regulations.addRegulation", "Add Regulation")}</h2>
                    <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100">
                        <X size={14} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4 p-5">
                    {error && (
                        <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
                    )}
                    <div>
                        <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 mb-1">
                            {t("compliance.fieldTitle", "Title *")}
                        </label>
                        <input
                            required
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-400"
                            placeholder="e.g. GDPR, HIPAA"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 mb-1">
                                {t("regulations.columns.authority", "Issuing Authority")} *
                            </label>
                            <input
                                required
                                value={form.issuing_authority}
                                onChange={(e) => setForm({ ...form, issuing_authority: e.target.value })}
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-400"
                                placeholder="e.g. EU Parliament"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 mb-1">
                                {t("regulations.columns.jurisdiction", "Jurisdiction")} *
                            </label>
                            <input
                                required
                                value={form.jurisdiction}
                                onChange={(e) => setForm({ ...form, jurisdiction: e.target.value })}
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-400"
                                placeholder="e.g. European Union"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 mb-1">
                                {t("compliance.fieldStatus", "Status")}
                            </label>
                            <select
                                value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-400"
                            >
                                {STATUS_OPTIONS.map((s) => (
                                    <option key={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 mb-1">
                                {t("regulations.columns.effectiveDate", "Effective Date")}
                            </label>
                            <input
                                type="date"
                                value={form.effective_date}
                                onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-400"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 mb-1">
                            {t("compliance.fieldDescription", "Description")}
                        </label>
                        <textarea
                            rows={3}
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-400 resize-none"
                            placeholder="Optional summary of this regulation"
                        />
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t border-neutral-100 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-lg px-3 py-1.5 text-xs text-neutral-500 hover:bg-neutral-50"
                        >
                            {t("common.cancel", "Cancel")}
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="rounded-lg bg-neutral-900 px-4 py-1.5 text-xs text-white disabled:opacity-50 hover:bg-neutral-700"
                        >
                            {saving ? t("common.saving", "Saving…") : t("regulations.addRegulation", "Add Regulation")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

function RegulationCard({ regulation }: { regulation: Regulation }) {
    const { t } = useTranslation()
    const [expanded, setExpanded] = useState(false)

    return (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="group flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-neutral-50"
            >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                    <Gavel size={14} className="text-neutral-500" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-neutral-900 truncate">{regulation.title}</p>
                        </div>
                        <div className="flex items-start justify-end gap-1 shrink-0">
                            {statusBadge(regulation.status, t)}
                        </div>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-neutral-400 flex-wrap">
                        <span>{regulation.issuing_authority}</span>
                        <span>·</span>
                        <span>{regulation.jurisdiction}</span>
                        {regulation.effective_date && (
                            <>
                                <span>·</span>
                                <span>{t("regulations.columns.effectiveDate", "Effective Date")}: {new Date(regulation.effective_date).toLocaleDateString()}</span>
                            </>
                        )}
                    </div>
                </div>
                {expanded ? (
                    <ChevronUp size={14} className="shrink-0 text-neutral-300 mt-1" />
                ) : (
                    <ChevronDown size={14} className="shrink-0 text-neutral-300 mt-1" />
                )}
            </button>
            {expanded && regulation.description && (
                <div className="border-t border-neutral-100 bg-neutral-50/50 px-5 py-3">
                    <p className="text-xs text-neutral-600 leading-relaxed">{regulation.description}</p>
                </div>
            )}
        </div>
    )
}

function Regulations() {
    const { t } = useTranslation()
    const [regulations, setRegulations] = useState<Regulation[]>([])
    const [total, setTotal] = useState(0)
    const [loadState, setLoadState] = useState<LoadState>("loading")
    const [error, setError] = useState("")
    const [search, setSearch] = useState("")
    const [jurisdictionFilter, setJurisdictionFilter] = useState("")
    const [statusFilter, setStatusFilter] = useState("")
    const [showCreate, setShowCreate] = useState(false)

    const fetchRegulations = async () => {
        setLoadState("loading")
        setError("")
        try {
            const token = localStorage.getItem("access_token")
            const params = new URLSearchParams()
            if (search) params.set("search", search)
            if (jurisdictionFilter) params.set("jurisdiction", jurisdictionFilter)
            if (statusFilter) params.set("status", statusFilter)
            params.set("limit", "100")

            const res = await fetch(`${API}/api/v1/regulations/?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            })

            if (!res.ok) {
                throw new Error(`Server responded ${res.status}`)
            }

            const data = await res.json()
            const items: Regulation[] = data.items ?? []
            setRegulations(items)
            setTotal(data.total ?? items.length)
            setLoadState(items.length === 0 ? "empty" : "ok")
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load regulations")
            setLoadState("error")
        }
    }

    useEffect(() => {
        fetchRegulations()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, jurisdictionFilter, statusFilter])

    return (
        <div className="flex h-full w-full flex-col bg-white">
            {showCreate && (
                <CreateRegulationModal
                    onClose={() => setShowCreate(false)}
                    onCreated={fetchRegulations}
                />
            )}

            <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-6 py-4">
                <div>
                    <h1 className="text-xl font-semibold text-neutral-900">{t("regulations.title", "Regulations Library")}</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        {t("regulations.subtitle", "Browse and manage global regulatory frameworks and statutory mandates.")}
                        {loadState === "ok" && (
                            <span className="ml-1 text-neutral-400">({total} {t("compliance.total", "Total").toLowerCase()})</span>
                        )}
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-2 text-xs font-medium text-white hover:bg-neutral-700"
                >
                    <Plus size={12} />
                    {t("regulations.addRegulation", "Add Regulation")}
                </button>
            </header>

            {/* Filters */}
            <div className="flex shrink-0 items-center gap-3 border-b border-neutral-100 px-6 py-3">
                <div className="search-pill flex flex-1 items-center gap-2 px-3 py-2">
                    <Search size={12} className="text-neutral-400" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="flex-1 bg-transparent text-xs outline-none placeholder:text-neutral-400"
                        placeholder={t("regulations.searchPlaceholder", "Search regulations…")}
                    />
                    {search && (
                        <button onClick={() => setSearch("")}>
                            <X size={10} className="text-neutral-400" />
                        </button>
                    )}
                </div>
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="rounded-lg border border-neutral-200 bg-white px-2 py-2 text-xs text-neutral-600 outline-none"
                >
                    <option value="">{t("common.allStatuses", "All statuses")}</option>
                    {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                            {s}
                        </option>
                    ))}
                </select>
                <input
                    value={jurisdictionFilter}
                    onChange={(e) => setJurisdictionFilter(e.target.value)}
                    className="rounded-lg border border-neutral-200 px-2 py-2 text-xs text-neutral-600 outline-none placeholder:text-neutral-400 w-36"
                    placeholder={`${t("regulations.columns.jurisdiction", "Jurisdiction")}…`}
                />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {loadState === "loading" && (
                    <div className="flex h-full items-center justify-center text-sm text-neutral-400">
                        {t("common.loading", "Loading regulations…")}
                    </div>
                )}

                {loadState === "error" && (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                        <Gavel size={36} className="mb-3 text-neutral-200" />
                        <p className="text-sm font-medium text-neutral-700">{t("common.error", "Something went wrong.")}</p>
                        <p className="mt-1 text-xs text-neutral-400">{error}</p>
                        <button
                            onClick={fetchRegulations}
                            className="mt-4 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
                        >
                            {t("common.retry", "Retry")}
                        </button>
                    </div>
                )}

                {loadState === "empty" && (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                        <Gavel size={36} className="mb-3 text-neutral-200" />
                        <h3 className="text-sm font-medium text-neutral-700">
                            {search || statusFilter || jurisdictionFilter
                                ? t("compliance.emptyFilterTitle", "No obligations match your filters")
                                : t("compliance.emptyTitle", "No regulations yet")}
                        </h3>
                        <p className="mt-1 text-xs text-neutral-400">
                            {search || statusFilter || jurisdictionFilter
                                ? t("compliance.emptyDesc", "Try adjusting your search or filters.")
                                : t("compliance.emptyDesc", "Add your first regulation to start tracking compliance obligations.")}
                        </p>
                        {!search && !statusFilter && !jurisdictionFilter && (
                            <button
                                onClick={() => setShowCreate(true)}
                                className="mt-4 flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700"
                            >
                                <Plus size={12} />
                                {t("regulations.addRegulation", "Add Regulation")}
                            </button>
                        )}
                    </div>
                )}

                {loadState === "ok" && (
                    <div className="mx-auto max-w-4xl space-y-3">
                        {regulations.map((r) => (
                            <RegulationCard key={r.id} regulation={r} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default Regulations