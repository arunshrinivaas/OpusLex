import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ShieldCheck, Search, Plus, X, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react"

const API = "http://127.0.0.1:8000"

type ComplianceItem = {
    id: number
    title: string
    regulation: string
    description: string | null
    department: string
    status: string
    risk_level: string
    due_date: string | null
    created_at: string | null
}

type Overview = {
    total_obligations: number
    compliant: number
    non_compliant: number
    in_progress: number
    high_risk_items: number
    compliance_score: number
}

type LoadState = "loading" | "empty" | "error" | "ok"

const STATUS_OPTIONS = ["Not Started", "In Progress", "Compliant", "Non-Compliant", "Waived"]
const RISK_OPTIONS = ["Low", "Medium", "High", "Critical"]

function statusBadge(status: string) {
    let colorClass = "status-progress"
    if (status === "Compliant") colorClass = "status-compliant"
    if (status === "Non-Compliant") colorClass = "status-non-compliant"
    if (status === "Not Started") colorClass = "status-progress"
    if (status === "Waived") colorClass = "status-risk"

    return (
        <div className="status-dot-wrapper" title={status}>
            <div className="status-dot-container">
                <div className={`status-dot ${colorClass}`} />
                <span className="status-label">{status}</span>
            </div>
        </div>
    )
}

function riskBadge(risk: string) {
    let colorClass = "status-compliant"
    if (risk === "Medium") colorClass = "status-risk"
    if (risk === "High" || risk === "Critical") colorClass = "status-non-compliant"

    return (
        <div className="status-dot-wrapper" title={risk}>
            <div className="status-dot-container">
                <div className={`status-dot ${colorClass}`} />
                <span className="status-label">{risk}</span>
            </div>
        </div>
    )
}

function OverviewBar({ overview }: { overview: Overview }) {
    const { t } = useTranslation()
    const score = overview.compliance_score
    const scoreColor =
        score >= 80 ? "text-green-600 dark:text-green-400" : score >= 50 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 shrink-0 border-b border-neutral-100 dark:border-[#262626] bg-neutral-50/50 dark:bg-[#171717] px-6 py-4 transition-colors">
            <div className="text-center">
                <p className={`text-2xl font-semibold ${scoreColor}`}>{score}%</p>
                <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">{t("compliance.score", "Score")}</p>
            </div>
            <div className="text-center">
                <p className="text-2xl font-semibold text-neutral-900 dark:text-white">{overview.total_obligations}</p>
                <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">{t("compliance.total", "Total")}</p>
            </div>
            <div className="text-center">
                <p className="text-2xl font-semibold text-green-600 dark:text-green-400">{overview.compliant}</p>
                <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">{t("common.compliant", "Compliant")}</p>
            </div>
            <div className="text-center">
                <p className="text-2xl font-semibold text-blue-600 dark:text-blue-400">{overview.in_progress}</p>
                <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">{t("common.inProgress", "In Progress")}</p>
            </div>
            <div className="text-center">
                <p className="text-2xl font-semibold text-red-600 dark:text-red-400">{overview.non_compliant}</p>
                <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">{t("common.nonCompliant", "Non-Compliant")}</p>
            </div>
            <div className="text-center">
                <p className="text-2xl font-semibold text-orange-600 dark:text-orange-400">{overview.high_risk_items}</p>
                <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">{t("compliance.highRisk", "High Risk")}</p>
            </div>
        </div>
    )
}

function CreateComplianceModal({
    onClose,
    onCreated,
}: {
    onClose: () => void
    onCreated: () => void
}) {
    const { t } = useTranslation()
    const [form, setForm] = useState({
        title: "",
        regulation: "",
        department: "",
        description: "",
        status: "Not Started",
        risk_level: "Medium",
        due_date: "",
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
                regulation: form.regulation,
                department: form.department,
                status: form.status,
                risk_level: form.risk_level,
                description: form.description || null,
                due_date: form.due_date || null,
            }
            const res = await fetch(`${API}/api/v1/compliance/`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify(body),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({}))
                throw new Error(data?.detail ?? "Failed to create obligation")
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs">
            <div className="w-full max-w-lg rounded-xl border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#171717] shadow-xl overflow-hidden transition-colors">
                <div className="flex items-center justify-between border-b border-neutral-100 dark:border-[#262626] px-5 py-4">
                    <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">{t("compliance.modalTitle", "Add Compliance Obligation")}</h2>
                    <button onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100 dark:hover:bg-[#262626] transition-colors">
                        <X size={14} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="space-y-4 p-5">
                    {error && (
                        <p className="rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 px-3 py-2 text-xs text-red-600 dark:text-red-400">{error}</p>
                    )}
                    <div>
                        <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">
                            {t("compliance.fieldTitle", "Title *")}
                        </label>
                        <input
                            required
                            value={form.title}
                            onChange={(e) => setForm({ ...form, title: e.target.value })}
                            className="w-full rounded-full border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#212121] px-4 py-2 text-xs text-neutral-900 dark:text-white outline-none focus:border-neutral-400 dark:focus:border-neutral-500"
                            placeholder="e.g. Annual GDPR data audit"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">
                                {t("compliance.fieldRegulation", "Regulation *")}
                            </label>
                            <input
                                required
                                value={form.regulation}
                                onChange={(e) => setForm({ ...form, regulation: e.target.value })}
                                className="w-full rounded-full border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#212121] px-4 py-2 text-xs text-neutral-900 dark:text-white outline-none focus:border-neutral-400 dark:focus:border-neutral-500"
                                placeholder="e.g. GDPR"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">
                                {t("compliance.fieldDepartment", "Department *")}
                            </label>
                            <input
                                required
                                value={form.department}
                                onChange={(e) => setForm({ ...form, department: e.target.value })}
                                className="w-full rounded-full border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#212121] px-4 py-2 text-xs text-neutral-900 dark:text-white outline-none focus:border-neutral-400 dark:focus:border-neutral-500"
                                placeholder="e.g. Legal"
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">
                                {t("compliance.fieldStatus", "Status")}
                            </label>
                            <select
                                value={form.status}
                                onChange={(e) => setForm({ ...form, status: e.target.value })}
                                className="w-full rounded-full border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#212121] px-3 py-2 text-xs text-neutral-900 dark:text-white outline-none focus:border-neutral-400 dark:focus:border-neutral-500"
                            >
                                {STATUS_OPTIONS.map((s) => (
                                    <option key={s} value={s}>{s}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">
                                {t("compliance.fieldRisk", "Risk")}
                            </label>
                            <select
                                value={form.risk_level}
                                onChange={(e) => setForm({ ...form, risk_level: e.target.value })}
                                className="w-full rounded-full border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#212121] px-3 py-2 text-xs text-neutral-900 dark:text-white outline-none focus:border-neutral-400 dark:focus:border-neutral-500"
                            >
                                {RISK_OPTIONS.map((r) => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">
                                {t("compliance.fieldDueDate", "Due Date")}
                            </label>
                            <input
                                type="date"
                                value={form.due_date}
                                onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                                className="w-full rounded-full border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#212121] px-3 py-2 text-xs text-neutral-900 dark:text-white outline-none focus:border-neutral-400 dark:focus:border-neutral-500"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1">
                            {t("compliance.fieldDescription", "Description")}
                        </label>
                        <textarea
                            rows={3}
                            value={form.description}
                            onChange={(e) => setForm({ ...form, description: e.target.value })}
                            className="w-full rounded-2xl border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#212121] px-4 py-2.5 text-xs text-neutral-900 dark:text-white outline-none focus:border-neutral-400 dark:focus:border-neutral-500 resize-none"
                            placeholder="Optional description of this obligation"
                        />
                    </div>
                    <div className="flex items-center justify-end gap-2 border-t border-neutral-100 dark:border-[#262626] pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-full border border-neutral-200 dark:border-[#333333] px-4 py-1.5 text-xs text-neutral-500 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-[#212121] transition-colors"
                        >
                            {t("common.cancel", "Cancel")}
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="rounded-full bg-neutral-900 dark:bg-white px-5 py-1.5 text-xs text-white dark:text-neutral-900 font-medium disabled:opacity-50 hover:bg-neutral-700 dark:hover:bg-neutral-100 transition-colors"
                        >
                            {saving ? t("common.saving", "Saving…") : t("compliance.addObligation", "Add Obligation")}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

function ComplianceCard({ item }: { item: ComplianceItem }) {
    const [expanded, setExpanded] = useState(false)
    const isOverdue =
        item.due_date &&
        item.status !== "Compliant" &&
        new Date(item.due_date) < new Date()

    return (
        <div className="rounded-xl border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#171717] overflow-hidden transition-colors shadow-xs">
            <button
                onClick={() => setExpanded(!expanded)}
                className="group flex w-full items-start gap-3 px-5 py-4 text-left hover:bg-neutral-50 dark:hover:bg-[#212121] transition-colors"
            >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-[#262626]">
                    {isOverdue ? (
                        <AlertTriangle size={14} className="text-red-500 dark:text-red-400" />
                    ) : (
                        <ShieldCheck size={14} className="text-neutral-500 dark:text-neutral-400" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">{item.title}</p>
                        </div>
                        <div className="flex items-start justify-end gap-1 shrink-0">
                            {isOverdue && (
                                <span className="rounded-full border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/40 px-2 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400 mr-1 uppercase tracking-wider">
                                    Overdue
                                </span>
                            )}
                            {statusBadge(item.status)}
                            {riskBadge(item.risk_level)}
                        </div>
                    </div>
                    <div className="mt-1 flex items-center gap-3 text-xs text-neutral-400 dark:text-neutral-500 flex-wrap">
                        <span>{item.regulation}</span>
                        <span>·</span>
                        <span>{item.department}</span>
                        {item.due_date && (
                            <>
                                <span>·</span>
                                <span className={isOverdue ? "text-red-500 dark:text-red-400" : ""}>
                                    Due {new Date(item.due_date).toLocaleDateString()}
                                </span>
                            </>
                        )}
                    </div>
                </div>
                {expanded ? (
                    <ChevronUp size={14} className="shrink-0 text-neutral-300 dark:text-neutral-600 mt-1" />
                ) : (
                    <ChevronDown size={14} className="shrink-0 text-neutral-300 dark:text-neutral-600 mt-1" />
                )}
            </button>
            {expanded && item.description && (
                <div className="border-t border-neutral-100 dark:border-[#262626] bg-neutral-50/50 dark:bg-[#121212] px-5 py-3">
                    <p className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed">{item.description}</p>
                </div>
            )}
        </div>
    )
}

function Compliance() {
    const { t } = useTranslation()
    const [items, setItems] = useState<ComplianceItem[]>([])
    const [overview, setOverview] = useState<Overview | null>(null)
    const [total, setTotal] = useState(0)
    const [loadState, setLoadState] = useState<LoadState>("loading")
    const [error, setError] = useState("")
    const [search, setSearch] = useState("")
    const [statusFilter, setStatusFilter] = useState("")
    const [riskFilter, setRiskFilter] = useState("")
    const [showCreate, setShowCreate] = useState(false)

    const fetchAll = async () => {
        setLoadState("loading")
        setError("")
        try {
            const token = localStorage.getItem("access_token")
            const params = new URLSearchParams()
            if (search) params.set("search", search)
            if (statusFilter) params.set("status", statusFilter)
            if (riskFilter) params.set("risk_level", riskFilter)
            params.set("limit", "100")

            const [itemsRes, overviewRes] = await Promise.all([
                fetch(`${API}/api/v1/compliance/?${params.toString()}`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
                fetch(`${API}/api/v1/compliance/overview`, {
                    headers: { Authorization: `Bearer ${token}` },
                }),
            ])

            if (!itemsRes.ok) throw new Error(`Server responded ${itemsRes.status}`)

            const data = await itemsRes.json()
            const fetched: ComplianceItem[] = data.items ?? []
            setItems(fetched)
            setTotal(data.total ?? fetched.length)
            setLoadState(fetched.length === 0 ? "empty" : "ok")

            if (overviewRes.ok) {
                setOverview(await overviewRes.json())
            }
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to load compliance data")
            setLoadState("error")
        }
    }

    useEffect(() => {
        fetchAll()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search, statusFilter, riskFilter])

    return (
        <div className="flex h-full w-full flex-col bg-white dark:bg-[#0d0d0d] transition-colors">
            {showCreate && (
                <CreateComplianceModal
                    onClose={() => setShowCreate(false)}
                    onCreated={fetchAll}
                />
            )}

            <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#171717] px-6 py-4 transition-colors">
                <div>
                    <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">{t("compliance.title", "Compliance Tracking")}</h1>
                    <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                        {t("compliance.subtitle", "Obligations and their current compliance status.")}
                        {loadState === "ok" && (
                            <span className="ml-1 text-neutral-400 dark:text-neutral-500">({total} total)</span>
                        )}
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="flex items-center gap-1.5 rounded-full bg-neutral-900 dark:bg-white px-4 py-2 text-xs font-semibold text-white dark:text-neutral-900 hover:bg-neutral-700 dark:hover:bg-neutral-100 transition-colors shadow-xs"
                >
                    <Plus size={12} />
                    {t("compliance.addObligation", "Add Obligation")}
                </button>
            </header>

            {/* KPI bar — only shown when there is real data */}
            {overview && overview.total_obligations > 0 && (
                <OverviewBar overview={overview} />
            )}

            {/* Filters */}
            <div className="flex shrink-0 items-center gap-3 border-b border-neutral-100 dark:border-[#262626] bg-white dark:bg-[#171717] px-6 py-3 transition-colors">
                <div className="search-pill flex flex-1 items-center gap-2 px-3 py-2 bg-neutral-50 dark:bg-[#212121] border border-neutral-200 dark:border-[#262626] rounded-full">
                    <Search size={12} className="text-neutral-400" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="flex-1 bg-transparent text-xs text-neutral-900 dark:text-white outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                        placeholder={t("common.searchObligations", "Search obligations…")}
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
                    className="rounded-full border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#212121] px-4 py-2 text-xs text-neutral-600 dark:text-neutral-300 outline-none"
                >
                    <option value="">{t("common.allStatuses", "All statuses")}</option>
                    {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                            {s}
                        </option>
                    ))}
                </select>
                <select
                    value={riskFilter}
                    onChange={(e) => setRiskFilter(e.target.value)}
                    className="rounded-full border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#212121] px-4 py-2 text-xs text-neutral-600 dark:text-neutral-300 outline-none"
                >
                    <option value="">{t("common.allRisks", "All risks")}</option>
                    {RISK_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                            {r}
                        </option>
                    ))}
                </select>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 bg-neutral-50/30 dark:bg-[#0d0d0d]">
                {loadState === "loading" && (
                    <div className="flex h-full items-center justify-center text-sm text-neutral-400">
                        {t("common.loading", "Loading compliance data…")}
                    </div>
                )}

                {loadState === "error" && (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                        <ShieldCheck size={36} className="mb-3 text-neutral-200 dark:text-neutral-700" />
                        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{t("common.error", "Could not load compliance data")}</p>
                        <p className="mt-1 text-xs text-neutral-400">{error}</p>
                        <button
                            onClick={fetchAll}
                            className="mt-4 rounded-full border border-neutral-200 dark:border-[#262626] px-4 py-1.5 text-xs text-neutral-600 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-[#212121] transition-colors"
                        >
                            {t("common.retry", "Retry")}
                        </button>
                    </div>
                )}

                {loadState === "empty" && (
                    <div className="flex h-full flex-col items-center justify-center text-center">
                        <ShieldCheck size={36} className="mb-3 text-neutral-200 dark:text-neutral-700" />
                        <h3 className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                            {search || statusFilter || riskFilter
                                ? t("compliance.emptyFilterTitle", "No obligations match your filters")
                                : t("compliance.emptyTitle", "No compliance obligations yet")}
                        </h3>
                        <p className="mt-1 text-xs text-neutral-400">
                            {search || statusFilter || riskFilter
                                ? "Try adjusting your search or filters."
                                : t("compliance.emptyDesc", "Add compliance obligations to track regulatory requirements and their status.")}
                        </p>
                        {!search && !statusFilter && !riskFilter && (
                            <button
                                onClick={() => setShowCreate(true)}
                                className="mt-4 flex items-center gap-1.5 rounded-full bg-neutral-900 dark:bg-white px-4 py-1.5 text-xs text-white dark:text-neutral-900 font-medium hover:bg-neutral-700 dark:hover:bg-neutral-100 transition-colors shadow-xs"
                            >
                                <Plus size={12} />
                                {t("compliance.addObligation", "Add Obligation")}
                            </button>
                        )}
                    </div>
                )}

                {loadState === "ok" && (
                    <div className="mx-auto max-w-4xl space-y-3">
                        {items.map((item) => (
                            <ComplianceCard key={item.id} item={item} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}

export default Compliance