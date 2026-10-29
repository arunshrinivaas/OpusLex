import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { FileText, Search, Plus, X, ChevronDown, ChevronUp, Pencil, Trash2 } from "lucide-react"

const API = "http://127.0.0.1:8000"

type Policy = {
    id: number
    title: string
    department: string
    description: string | null
    status: string
    version: string
    effective_date: string | null
    created_at: string | null
}

type LoadState = "loading" | "empty" | "error" | "ok"

const STATUS_OPTIONS = ["Draft", "Active", "Under Review", "Archived", "Deprecated"]

function statusBadge(status: string, t: any) {
    let colorClass = "status-progress"
    let statusLabel = status
    if (status === "Active") {
        colorClass = "status-compliant"
        statusLabel = t("investigations.statuses.active", "Active")
    } else if (status === "Draft") {
        colorClass = "status-progress"
        statusLabel = t("common.inProgress", "Draft")
    } else if (status === "Under Review") {
        colorClass = "status-progress"
        statusLabel = t("investigations.statuses.review", "Under Review")
    } else if (status === "Deprecated") {
        colorClass = "status-non-compliant"
        statusLabel = t("investigations.statuses.closed", "Deprecated")
    } else if (status === "Archived") {
        colorClass = "status-risk"
        statusLabel = t("investigations.statuses.archived", "Archived")
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

function PolicyFormModal({
    onClose,
    onDone,
    existing,
}: {
    onClose: () => void
    onDone: () => void
    existing?: Policy
}) {
    const { t } = useTranslation()
    const isEdit = !!existing
    const [form, setForm] = useState({
        title: existing?.title ?? "",
        department: existing?.department ?? "",
        description: existing?.description ?? "",
        status: existing?.status ?? "Draft",
        version: existing?.version ?? "1.0",
        effective_date: existing?.effective_date
            ? existing.effective_date.split("T")[0]
            : "",
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
                department: form.department,
                status: form.status,
                version: form.version,
                description: form.description || null,
                effective_date: form.effective_date || null,
            }
            const url = isEdit
                ? `${API}/api/v1/policies/${existing!.id}`
                : `${API}/api/v1/policies/`
            const method = isEdit ? "PATCH" : "POST"

            const res = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data?.detail ?? "Failed to save policy")
            }
            onDone()
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
                    <h2 className="text-sm font-semibold text-neutral-900">
                        {isEdit ? t("policies.createPolicy", "Edit Policy") : t("policies.createPolicy", "New Policy")}
                    </h2>
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
                            placeholder="e.g. Data Retention Policy"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 mb-1">
                                {t("compliance.fieldDepartment", "Department *")}
                            </label>
                            <input
                                required
                                value={form.department}
                                onChange={(e) => setForm({ ...form, department: e.target.value })}
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-400"
                                placeholder="e.g. Legal, IT, HR"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 mb-1">
                                {t("policies.columns.version", "Version")}
                            </label>
                            <input
                                value={form.version}
                                onChange={(e) => setForm({ ...form, version: e.target.value })}
                                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-xs outline-none focus:border-neutral-400"
                                placeholder="1.0"
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
                            placeholder="Optional summary of this policy"
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
                            {saving ? t("common.saving", "Saving…") : isEdit ? t("dashboard.profileModal.save", "Save Changes") : t("policies.createPolicy", "Create Policy")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

function PolicyCard({
    policy,
    onEdit,
    onDeleted,
}: {
    policy: Policy
    onEdit: (p: Policy) => void
    onDeleted: () => void
}) {
    const { t } = useTranslation()
    const [expanded, setExpanded] = useState(false)
    const [deleting, setDeleting] = useState(false)

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm(`Delete policy "${policy.title}"?`)) return
        setDeleting(true)
        try {
            const token = localStorage.getItem("access_token")
            await fetch(`${API}/api/v1/policies/${policy.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
            })
            onDeleted()
        } finally {
            setDeleting(false)
        }
    }

    return (
        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
            <button
                onClick={() => setExpanded(!expanded)}
                className="group flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-neutral-50"
            >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                    <FileText size={14} className="text-neutral-500" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold text-neutral-900 truncate">{policy.title}</p>
                            <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] text-neutral-500 uppercase tracking-wider">
                                v{policy.version}
                            </span>
                        </div>
                        <div className="flex items-start justify-end gap-1 shrink-0">
                            {statusBadge(policy.status, t)}
                        </div>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-neutral-400 flex-wrap">
                        <span>{policy.department}</span>
                        {policy.effective_date && (
                            <>
                                <span>·</span>
                                <span>{t("regulations.columns.effectiveDate", "Effective Date")}: {new Date(policy.effective_date).toLocaleDateString()}</span>
                            </>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                        onClick={() => onEdit(policy)}
                        className="rounded p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                        title={t("settings.storage.documents.title", "Edit")}
                    >
                        <Pencil size={11} />
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="rounded p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                        title={t("common.delete", "Delete")}
                    >
                        <Trash2 size={11} />
                    </button>
                </div>
                {expanded ? (
                    <ChevronUp size={14} className="shrink-0 text-neutral-300 mt-1" />
                ) : (
                    <ChevronDown size={14} className="shrink-0 text-neutral-300 mt-1" />
                )}
            </button>
            {expanded && policy.description && (
                <div className="border-t border-neutral-100 bg-neutral-50/50 px-5 py-3">
                    <p className="text-xs text-neutral-600 leading-relaxed">{policy.description}</p>
                </div>
            )}
        </div>
    )
}

function Policies() {
    const { t } = useTranslation()
    const [policies, setPolicies] = useState<Policy[]>([])
    const [total, setTotal] = useState(0)
    const [loadState, setLoadState] = useState<LoadState>("loading")
    const [error, setError] = useState("")
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState("")
    const [departmentFilter, setDepartmentFilter] = useState("")
    const [showCreate, setShowCreate] = useState(false)
    const [editTarget, setEditTarget] = useState<Policy | null>(null)

    const fetchPolicies = async () => {
        setLoadState("loading")
        setError("")
        try {
            const token = localStorage.getItem("access_token")
            const params = new URLSearchParams()
            if (search) params.set("search", search)
            if (statusFilter) params.set("status", statusFilter)
            if (departmentFilter) params.set("department", departmentFilter)
            params.set("limit", "100")

            const res = await fetch(`${API}/api/v1/policies/?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` },
            })
            if (!res.ok) throw new Error(`Server responded ${res.status}`)

            const data = await res.json()
            const items: Policy[] = data.items ?? []
            setPolicies(items)
            setTotal(data.total ?? items.length)
            setLoadState(items.length === 0 ? "empty" : "ok")
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load policies")
            setLoadState("error")
        }
    }

    useEffect(() => {
        fetchPolicies()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, statusFilter, departmentFilter])

    return (
        <div className="flex h-full w-full flex-col bg-white">
            {showCreate && (
                <PolicyFormModal
                    onClose={() => setShowCreate(false)}
                    onDone={fetchPolicies}
                />
            )}
            {editTarget && (
                <PolicyFormModal
                    existing={editTarget}
                    onClose={() => setEditTarget(null)}
                    onDone={fetchPolicies}
                />
            )}

            <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-6 py-4">
                <div>
                    <h1 className="text-xl font-semibold text-neutral-900">{t("policies.title", "Internal Policies")}</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        {t("policies.subtitle", "Corporate governance policies mapped to external statutory requirements.")}
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
                    {t("policies.createPolicy", "Create Policy")}
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
                        placeholder={t("policies.searchPlaceholder", "Search policies…")}
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
                    value={departmentFilter}
                    onChange={(e) => setDepartmentFilter(e.target.value)}
                    className="rounded-lg border border-neutral-200 px-2 py-2 text-xs text-neutral-600 outline-none placeholder:text-neutral-400 w-32"
                    placeholder={`${t("compliance.fieldDepartment", "Department")}…`}
                />
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
                {loadState === "loading" && (
                    <div className="flex h-full items-center justify-center text-sm text-neutral-400">
                        {t("common.loading", "Loading policies…")}
                    </div>
                )}

                {loadState === "error" && (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                        <FileText size={36} className="mb-3 text-neutral-200" />
                        <p className="text-sm font-medium text-neutral-700">{t("common.error", "Something went wrong.")}</p>
                        <p className="mt-1 text-xs text-neutral-400">{error}</p>
                        <button
                            onClick={fetchPolicies}
                            className="mt-4 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-50"
                        >
                            {t("common.retry", "Retry")}
                        </button>
                    </div>
                )}

                {loadState === "empty" && (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                        <FileText size={36} className="mb-3 text-neutral-200" />
                        <h3 className="text-sm font-medium text-neutral-700">
                            {search || statusFilter || departmentFilter
                                ? t("compliance.emptyFilterTitle", "No obligations match your filters")
                                : t("compliance.emptyTitle", "No policies yet")}
                        </h3>
                        <p className="mt-1 text-xs text-neutral-400">
                            {search || statusFilter || departmentFilter
                                ? t("compliance.emptyDesc", "Try adjusting your search or filters.")
                                : t("compliance.emptyDesc", "Create your first policy to begin tracking organizational obligations.")}
                        </p>
                        {!search && !statusFilter && !departmentFilter && (
                            <button
                                onClick={() => setShowCreate(true)}
                                className="mt-4 flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs text-white hover:bg-neutral-700"
                            >
                                <Plus size={12} />
                                {t("policies.createPolicy", "Create Policy")}
                            </button>
                        )}
                    </div>
                )}

                {loadState === "ok" && (
                    <div className="mx-auto max-w-4xl space-y-3">
                        {policies.map((p) => (
                            <PolicyCard
                                key={p.id}
                                policy={p}
                                onEdit={setEditTarget}
                                onDeleted={fetchPolicies}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default Policies