import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { SegmentedControl } from "./SegmentedControl"
import {
    AlertTriangle,
    BookOpen,
    CheckCircle,
    FileText,
    Gavel,
    Search,
    ShieldAlert,
    ShieldCheck,
    X,
    XCircle,
} from "lucide-react"

const API = "http://127.0.0.1:8000"

// ---------------------------------------------------------------------------
// Types — mirror governance router responses exactly
// ---------------------------------------------------------------------------

type GovSummary = {
    policies: { total: number; active: number; draft: number }
    regulations: { total: number; active: number }
    compliance: {
        total_obligations: number
        compliant: number
        non_compliant: number
        high_risk: number
        score: number
    }
    investigations: { total: number; active: number }
    findings: { total: number; completed: number; failed: number }
}

type GovPolicy = {
    id: number
    title: string
    department: string
    status: string
    version: string
    effective_date: string | null
    created_at: string | null
}

type GovRegulation = {
    id: number
    title: string
    issuing_authority: string
    jurisdiction: string
    status: string
    effective_date: string | null
    created_at: string | null
}

type GovCompliance = {
    id: number
    title: string
    regulation: string
    department: string
    status: string
    risk_level: string
    due_date: string | null
    created_at: string | null
}

type Tab = "overview" | "policies" | "regulations" | "risk"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(ts: string | null) {
    if (!ts) return "—"
    return new Date(ts).toLocaleDateString(undefined, { dateStyle: "medium" })
}

function policyStatusBadge(status: string, t?: any) {
    const tr = t || ((_k: string, f?: string) => f || _k)
    const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
    if (status === "Active") return <span className={`${base} bg-green-50 text-green-700`}>{tr("investigations.statuses.active", "Active")}</span>
    if (status === "Draft") return <span className={`${base} bg-amber-50 text-amber-700`}>{tr("common.inProgress", "Draft")}</span>
    if (status === "Archived") return <span className={`${base} bg-neutral-100 text-neutral-500`}>{tr("investigations.statuses.archived", "Archived")}</span>
    return <span className={`${base} bg-neutral-100 text-neutral-600`}>{status}</span>
}

function riskBadge(risk: string, t?: any) {
    const tr = t || ((_k: string, f?: string) => f || _k)
    const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
    if (risk === "High") return <span className={`${base} bg-red-50 text-red-700`}><AlertTriangle size={8} className="mr-1" />{tr("common.high", "High")}</span>
    if (risk === "Medium") return <span className={`${base} bg-amber-50 text-amber-700`}>{tr("common.medium", "Medium")}</span>
    return <span className={`${base} bg-green-50 text-green-700`}>{tr("common.low", "Low")}</span>
}

function complianceStatusBadge(status: string, t?: any) {
    const tr = t || ((_k: string, f?: string) => f || _k)
    const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
    if (status === "Compliant") return <span className={`${base} bg-green-50 text-green-700`}><CheckCircle size={8} className="mr-1" />{tr("common.compliant", "Compliant")}</span>
    if (status === "Non-Compliant") return <span className={`${base} bg-red-50 text-red-700`}><XCircle size={8} className="mr-1" />{tr("common.nonCompliant", "Non-Compliant")}</span>
    if (status === "In Progress") return <span className={`${base} bg-blue-50 text-blue-700`}>{tr("common.inProgress", "In Progress")}</span>
    return <span className={`${base} bg-neutral-100 text-neutral-600`}>{status}</span>
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({ summary }: { summary: GovSummary }) {
    const { t } = useTranslation()
    const { policies, regulations, compliance, investigations, findings } = summary

    return (
        <div className="space-y-4">
            {/* Compliance score banner */}
            <div className="rounded-xl border border-neutral-200 bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <h2 className="text-sm font-semibold text-neutral-800">{t("dashboard.stats.complianceScore", "Compliance Score")}</h2>
                        <p className="mt-0.5 text-xs text-neutral-400">
                            {compliance.total_obligations} {t("compliance.title", "Obligations")}
                        </p>
                    </div>
                    <span className="text-3xl font-bold text-neutral-900">
                        {compliance.total_obligations > 0 ? `${compliance.score}%` : "—"}
                    </span>
                </div>
                {compliance.total_obligations > 0 && (
                    <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                        <div
                            className="h-full rounded-full bg-neutral-900 transition-all"
                            style={{ width: `${compliance.score}%` }}
                        />
                    </div>
                )}
                {compliance.total_obligations === 0 && (
                    <p className="text-xs text-neutral-400 mt-2">
                        {t("compliance.emptyDesc", "No compliance obligations tracked yet. Add items in the Compliance workspace.")}
                    </p>
                )}
            </div>

            {/* KPI grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {[
                    {
                        label: t("nav.policies", "Policies"),
                        value: policies.total,
                        sub: `${policies.active} ${t("investigations.statuses.active", "active")}`,
                        icon: <FileText size={13} className="text-neutral-500" />,
                    },
                    {
                        label: t("nav.regulations", "Regulations"),
                        value: regulations.total,
                        sub: `${regulations.active} ${t("investigations.statuses.active", "active")}`,
                        icon: <Gavel size={13} className="text-neutral-500" />,
                    },
                    {
                        label: t("common.nonCompliant", "Non-Compliant"),
                        value: compliance.non_compliant,
                        sub: `${compliance.high_risk} ${t("common.high", "high risk")}`,
                        icon: <ShieldAlert size={13} className="text-red-500" />,
                        warn: compliance.non_compliant > 0,
                    },
                    {
                        label: t("nav.investigations", "Investigations"),
                        value: investigations.active,
                        sub: `${investigations.total} ${t("compliance.total", "total")}`,
                        icon: <BookOpen size={13} className="text-neutral-500" />,
                    },
                    {
                        label: t("dashboard.stats.recentFindings", "Findings"),
                        value: findings.total,
                        sub: `${findings.completed} ${t("agents.statusCompleted", "completed")}`,
                        icon: <ShieldCheck size={13} className="text-neutral-500" />,
                    },
                ].map((kpi) => (
                    <div
                        key={kpi.label}
                        className={`rounded-xl border bg-white p-3 ${kpi.warn ? "border-red-200" : "border-neutral-200"}`}
                    >
                        <div className="flex items-center gap-1.5 mb-1">
                            {kpi.icon}
                            <span className="text-xs font-medium uppercase tracking-wider text-neutral-500">
                                {kpi.label}
                            </span>
                        </div>
                        <p className={`text-xl font-bold ${kpi.warn && kpi.value > 0 ? "text-red-600" : "text-neutral-900"}`}>
                            {kpi.value}
                        </p>
                        <p className="text-xs text-neutral-400 mt-0.5">{kpi.sub}</p>
                    </div>
                ))}
            </div>

            {/* Status breakdown */}
            <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
                        {t("nav.policies", "Policy")} {t("policies.columns.status", "Status")}
                    </h3>
                    {policies.total === 0 ? (
                        <p className="text-xs text-neutral-400">{t("policies.subtitle", "No policies registered. Add policies in the Policies workspace.")}</p>
                    ) : (
                        <div className="space-y-2">
                            {[
                                { label: t("investigations.statuses.active", "Active"), value: policies.active, color: "bg-green-500" },
                                { label: t("common.inProgress", "Draft"), value: policies.draft, color: "bg-amber-400" },
                                { label: t("dashboard.topNav.all", "Other"), value: policies.total - policies.active - policies.draft, color: "bg-neutral-300" },
                            ].filter((r) => r.value > 0).map((row) => (
                                <div key={row.label} className="flex items-center gap-2">
                                    <div className={`h-2 w-2 rounded-full shrink-0 ${row.color}`} />
                                    <span className="text-xs text-neutral-600 flex-1">{row.label}</span>
                                    <span className="text-xs font-medium text-neutral-800">{row.value}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-3">
                        {t("compliance.title", "Compliance Obligations")}
                    </h3>
                    {compliance.total_obligations === 0 ? (
                        <p className="text-xs text-neutral-400">{t("compliance.emptyTitle", "No compliance obligations tracked.")}</p>
                    ) : (
                        <div className="space-y-2">
                            {[
                                { label: t("common.compliant", "Compliant"), value: compliance.compliant, color: "bg-green-500" },
                                { label: t("common.nonCompliant", "Non-Compliant"), value: compliance.non_compliant, color: "bg-red-500" },
                                {
                                    label: t("dashboard.topNav.all", "Other"),
                                    value: compliance.total_obligations - compliance.compliant - compliance.non_compliant,
                                    color: "bg-neutral-300",
                                },
                            ].filter((r) => r.value > 0).map((row) => (
                                <div key={row.label} className="flex items-center gap-2">
                                    <div className={`h-2 w-2 rounded-full shrink-0 ${row.color}`} />
                                    <span className="text-xs text-neutral-600 flex-1">{row.label}</span>
                                    <span className="text-xs font-medium text-neutral-800">{row.value}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Capabilities not available */}
            <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 p-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                    {t("governance.title", "Corporate Governance")} — {t("settings.appearance.theme.comingSoon", "Coming soon")}
                </h3>
                <ul className="space-y-1.5 text-xs text-neutral-400">
                    <li>• <span className="font-medium text-neutral-500">Approval workflows</span> — {t("agents.approvalRequired", "Approval Required")}</li>
                    <li>• <span className="font-medium text-neutral-500">Control framework</span> — {t("governance.subtitle", "Framework oversight")}</li>
                    <li>• <span className="font-medium text-neutral-500">Exception management</span> — {t("audit.title", "Audit & Findings")}</li>
                    <li>• <span className="font-medium text-neutral-500">Role-based review assignments</span> — {t("governance.reviews", "Pending Policy Reviews")}</li>
                </ul>
            </div>
        </div>
    )
}

// ---------------------------------------------------------------------------
// Main Governance component
// ---------------------------------------------------------------------------

function Governance() {
    const { t } = useTranslation()
    const [activeTab, setActiveTab] = useState<Tab>("overview")

    const [summary, setSummary] = useState<GovSummary | null>(null)
    const [summaryLoading, setSummaryLoading] = useState(true)
    const [summaryError, setSummaryError] = useState("")

    // Policies
    const [policies, setPolicies] = useState<GovPolicy[]>([])
    const [policiesTotal, setPoliciesTotal] = useState(0)
    const [policiesLoading, setPoliciesLoading] = useState(false)
    const [policyStatusFilter, setPolicyStatusFilter] = useState("")
    const [policySearch, setPolicySearch] = useState("")

    // Regulations
    const [regulations, setRegulations] = useState<GovRegulation[]>([])
    const [regulationsTotal, setRegulationsTotal] = useState(0)
    const [regulationsLoading, setRegulationsLoading] = useState(false)
    const [regJurisdictionFilter, setRegJurisdictionFilter] = useState("")
    const [regStatusFilter, setRegStatusFilter] = useState("")

    // Risk register
    const [riskItems, setRiskItems] = useState<GovCompliance[]>([])
    const [riskTotal, setRiskTotal] = useState(0)
    const [riskLoading, setRiskLoading] = useState(false)
    const [riskLevelFilter, setRiskLevelFilter] = useState("")
    const [riskStatusFilter, setRiskStatusFilter] = useState("")

    const tok = () => localStorage.getItem("access_token") ?? ""

    // Load summary on mount
    useEffect(() => {
        const load = async () => {
            setSummaryLoading(true)
            setSummaryError("")
            try {
                const res = await fetch(`${API}/api/v1/governance/summary`, {
                    headers: { Authorization: `Bearer ${tok()}` },
                })
                if (!res.ok) { setSummaryError("Failed to load governance summary."); return }
                setSummary(await res.json())
            } catch {
                setSummaryError("Unable to connect to the backend.")
            } finally {
                setSummaryLoading(false)
            }
        }
        load()
    }, [])

    // Load policies
    useEffect(() => {
        if (activeTab !== "policies") return
        const load = async () => {
            setPoliciesLoading(true)
            try {
                const params = new URLSearchParams()
                if (policyStatusFilter) params.set("status", policyStatusFilter)
                const res = await fetch(`${API}/api/v1/governance/policies?${params}`, {
                    headers: { Authorization: `Bearer ${tok()}` },
                })
                if (res.ok) {
                    const d = await res.json()
                    const items: GovPolicy[] = d.items || []
                    const filtered = policySearch
                        ? items.filter((p) => p.title.toLowerCase().includes(policySearch.toLowerCase()) || p.department.toLowerCase().includes(policySearch.toLowerCase()))
                        : items
                    setPolicies(filtered)
                    setPoliciesTotal(d.total || 0)
                }
            } finally {
                setPoliciesLoading(false)
            }
        }
        load()
    }, [activeTab, policyStatusFilter, policySearch])

    // Load regulations
    useEffect(() => {
        if (activeTab !== "regulations") return
        const load = async () => {
            setRegulationsLoading(true)
            try {
                const params = new URLSearchParams()
                if (regStatusFilter) params.set("status", regStatusFilter)
                if (regJurisdictionFilter) params.set("jurisdiction", regJurisdictionFilter)
                const res = await fetch(`${API}/api/v1/governance/regulations?${params}`, {
                    headers: { Authorization: `Bearer ${tok()}` },
                })
                if (res.ok) {
                    const d = await res.json()
                    setRegulations(d.items || [])
                    setRegulationsTotal(d.total || 0)
                }
            } finally {
                setRegulationsLoading(false)
            }
        }
        load()
    }, [activeTab, regStatusFilter, regJurisdictionFilter])

    // Load risk register
    useEffect(() => {
        if (activeTab !== "risk") return
        const load = async () => {
            setRiskLoading(true)
            try {
                const params = new URLSearchParams()
                if (riskLevelFilter) params.set("risk_level", riskLevelFilter)
                if (riskStatusFilter) params.set("status", riskStatusFilter)
                const res = await fetch(`${API}/api/v1/governance/compliance-risk?${params}`, {
                    headers: { Authorization: `Bearer ${tok()}` },
                })
                if (res.ok) {
                    const d = await res.json()
                    setRiskItems(d.items || [])
                    setRiskTotal(d.total || 0)
                }
            } finally {
                setRiskLoading(false)
            }
        }
        load()
    }, [activeTab, riskLevelFilter, riskStatusFilter])

    const tabs: { id: Tab; label: string }[] = [
        { id: "overview", label: t("investigations.details.overview", "Overview") },
        { id: "policies", label: `${t("nav.policies", "Policy")} ${t("investigations.details.timeline", "Register")}` },
        { id: "regulations", label: `${t("nav.regulations", "Regulation")} ${t("investigations.details.timeline", "Register")}` },
        { id: "risk", label: `${t("investigations.columns.risk", "Risk")} ${t("investigations.details.timeline", "Register")}` },
    ]

    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <ShieldCheck size={15} className="text-neutral-500" />
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-400">
                        {t("governance.title", "Governance Layer")}
                    </span>
                </div>
                <h1 className="text-xl font-semibold tracking-tight">{t("nav.governance", "Governance")}</h1>
                <p className="mt-1 text-sm text-neutral-500">
                    {t("governance.subtitle", "Organizational compliance posture derived from policies, regulations, and compliance obligations.")}
                </p>
            </div>

            {/* Tabs */}
            <SegmentedControl
                options={tabs.map(t => ({ value: t.id, label: t.label }))}
                value={activeTab}
                onChange={v => setActiveTab(v as Tab)}
                size="sm"
            />

            {/* ---------------------------------------------------------------- */}
            {/* OVERVIEW TAB                                                      */}
            {/* ---------------------------------------------------------------- */}
            {activeTab === "overview" && (
                summaryLoading ? (
                    <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
                        <p className="text-sm text-neutral-400">{t("common.loading", "Loading governance summary…")}</p>
                    </div>
                ) : summaryError ? (
                    <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
                        <p className="text-sm text-red-500">{summaryError}</p>
                    </div>
                ) : summary ? (
                    <OverviewTab summary={summary} />
                ) : null
            )}

            {/* ---------------------------------------------------------------- */}
            {/* POLICY REGISTER TAB                                              */}
            {/* ---------------------------------------------------------------- */}
            {activeTab === "policies" && (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="search-pill flex items-center gap-1.5 px-2.5 py-1.5">
                            <Search size={12} className="text-neutral-400" />
                            <input
                                value={policySearch}
                                onChange={(e) => setPolicySearch(e.target.value)}
                                placeholder={t("policies.searchPlaceholder", "Search policies…")}
                                className="w-44 bg-transparent text-sm outline-none placeholder:text-neutral-400"
                            />
                            {policySearch && (
                                <button onClick={() => setPolicySearch("")}>
                                    <X size={10} className="text-neutral-400" />
                                </button>
                            )}
                        </div>
                        <select
                            value={policyStatusFilter}
                            onChange={(e) => setPolicyStatusFilter(e.target.value)}
                            className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-700 outline-none"
                        >
                            <option value="">{t("common.allStatuses", "All statuses")}</option>
                            <option value="Active">{t("investigations.statuses.active", "Active")}</option>
                            <option value="Draft">{t("common.inProgress", "Draft")}</option>
                            <option value="Archived">{t("investigations.statuses.archived", "Archived")}</option>
                        </select>
                        <span className="ml-auto text-xs text-neutral-400">
                            {policiesLoading ? t("common.loading", "Loading…") : `${policiesTotal} ${t("nav.policies", "policies")}`}
                        </span>
                    </div>

                    {policiesLoading ? (
                        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
                            <p className="text-sm text-neutral-400">{t("common.loading", "Loading policies…")}</p>
                        </div>
                    ) : policies.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-neutral-200 bg-white p-10 text-center">
                            <FileText size={20} className="mx-auto mb-3 text-neutral-300" />
                            <p className="text-sm font-medium text-neutral-600">{t("policies.subtitle", "No policies found")}</p>
                            <p className="mt-1 text-sm text-neutral-400">
                                {t("policies.subtitle", "Add policies in the Policies workspace. They will appear here automatically.")}
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-100 bg-neutral-50">
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("policies.columns.name", "Policy")}</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("compliance.fieldDepartment", "Department")}</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("policies.columns.status", "Status")}</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("policies.columns.version", "Version")}</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("regulations.columns.effectiveDate", "Effective Date")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                    {policies.map((p) => (
                                         <tr key={p.id} className="hover:bg-neutral-50">
                                            <td className="px-4 py-3 font-medium text-neutral-900">{p.title}</td>
                                            <td className="px-4 py-3 text-neutral-500">{p.department}</td>
                                            <td className="px-4 py-3">{policyStatusBadge(p.status, t)}</td>
                                            <td className="px-4 py-3 text-neutral-500">{p.version}</td>
                                            <td className="px-4 py-3 text-neutral-400">{fmtDate(p.effective_date)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ---------------------------------------------------------------- */}
            {/* REGULATION REGISTER TAB                                          */}
            {/* ---------------------------------------------------------------- */}
            {activeTab === "regulations" && (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={regStatusFilter}
                            onChange={(e) => setRegStatusFilter(e.target.value)}
                            className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-700 outline-none"
                        >
                            <option value="">{t("common.allStatuses", "All statuses")}</option>
                            <option value="Active">{t("investigations.statuses.active", "Active")}</option>
                            <option value="Draft">{t("common.inProgress", "Draft")}</option>
                            <option value="Archived">{t("investigations.statuses.archived", "Archived")}</option>
                        </select>
                        <div className="search-pill flex items-center gap-1.5 px-2.5 py-1.5">
                            <Search size={12} className="text-neutral-400" />
                            <input
                                value={regJurisdictionFilter}
                                onChange={(e) => setRegJurisdictionFilter(e.target.value)}
                                placeholder={t("investigations.filterJurisdiction", "Filter by jurisdiction…")}
                                className="w-44 bg-transparent text-sm outline-none placeholder:text-neutral-400"
                            />
                            {regJurisdictionFilter && (
                                <button onClick={() => setRegJurisdictionFilter("")}>
                                    <X size={10} className="text-neutral-400" />
                                </button>
                            )}
                        </div>
                        <span className="ml-auto text-xs text-neutral-400">
                            {regulationsLoading ? t("common.loading", "Loading…") : `${regulationsTotal} ${t("nav.regulations", "regulations")}`}
                        </span>
                    </div>

                    {regulationsLoading ? (
                        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
                            <p className="text-sm text-neutral-400">{t("common.loading", "Loading regulations…")}</p>
                        </div>
                    ) : regulations.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-neutral-200 bg-white p-10 text-center">
                            <Gavel size={20} className="mx-auto mb-3 text-neutral-300" />
                            <p className="text-sm font-medium text-neutral-600">{t("regulations.subtitle", "No regulations found")}</p>
                            <p className="mt-1 text-sm text-neutral-400">
                                {t("regulations.subtitle", "Add regulations in the Regulations workspace. They will appear here automatically.")}
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-100 bg-neutral-50">
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("regulations.columns.name", "Regulation")}</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("regulations.columns.authority", "Issuing Authority")}</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("regulations.columns.jurisdiction", "Jurisdiction")}</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("regulations.columns.status", "Status")}</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("regulations.columns.effectiveDate", "Effective Date")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                    {regulations.map((r) => (
                                        <tr key={r.id} className="hover:bg-neutral-50">
                                            <td className="px-4 py-3 font-medium text-neutral-900">{r.title}</td>
                                            <td className="px-4 py-3 text-neutral-500">{r.issuing_authority}</td>
                                            <td className="px-4 py-3 text-neutral-500">{r.jurisdiction}</td>
                                            <td className="px-4 py-3">{policyStatusBadge(r.status, t)}</td>
                                            <td className="px-4 py-3 text-neutral-400">{fmtDate(r.effective_date)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ---------------------------------------------------------------- */}
            {/* RISK REGISTER TAB                                                */}
            {/* ---------------------------------------------------------------- */}
            {activeTab === "risk" && (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={riskLevelFilter}
                            onChange={(e) => setRiskLevelFilter(e.target.value)}
                            className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-700 outline-none"
                        >
                            <option value="">{t("common.allRisks", "All risk levels")}</option>
                            <option value="High">{t("common.high", "High")}</option>
                            <option value="Medium">{t("common.medium", "Medium")}</option>
                            <option value="Low">{t("common.low", "Low")}</option>
                        </select>
                        <select
                            value={riskStatusFilter}
                            onChange={(e) => setRiskStatusFilter(e.target.value)}
                            className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-700 outline-none"
                        >
                            <option value="">{t("common.allStatuses", "All statuses")}</option>
                            <option value="Compliant">{t("common.compliant", "Compliant")}</option>
                            <option value="Non-Compliant">{t("common.nonCompliant", "Non-Compliant")}</option>
                            <option value="In Progress">{t("common.inProgress", "In Progress")}</option>
                            <option value="Not Started">{t("common.notStarted", "Not Started")}</option>
                        </select>
                        <span className="ml-auto text-xs text-neutral-400">
                            {riskLoading ? t("common.loading", "Loading…") : `${riskTotal} ${t("compliance.title", "obligations")}`}
                        </span>
                    </div>

                    {riskLoading ? (
                        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
                            <p className="text-sm text-neutral-400">{t("common.loading", "Loading risk register…")}</p>
                        </div>
                    ) : riskItems.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-neutral-200 bg-white p-10 text-center">
                            <ShieldAlert size={20} className="mx-auto mb-3 text-neutral-300" />
                            <p className="text-sm font-medium text-neutral-600">{t("compliance.emptyTitle", "No compliance obligations found")}</p>
                            <p className="mt-1 text-sm text-neutral-400">
                                {t("compliance.emptyDesc", "Add compliance obligations in the Compliance workspace. They will appear here automatically.")}
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-neutral-100 bg-neutral-50">
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("compliance.fieldTitle", "Obligation")}</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("regulations.columns.name", "Regulation")}</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("compliance.fieldDepartment", "Department")}</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("compliance.fieldRisk", "Risk")}</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("compliance.fieldStatus", "Status")}</th>
                                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-400">{t("compliance.fieldDueDate", "Due Date")}</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                    {riskItems.map((c) => (
                                        <tr
                                            key={c.id}
                                            className={`hover:bg-neutral-50 ${c.risk_level === "High" && c.status === "Non-Compliant" ? "bg-red-50/30" : ""}`}
                                        >
                                            <td className="px-4 py-3 font-medium text-neutral-900">{c.title}</td>
                                            <td className="px-4 py-3 text-neutral-500">{c.regulation}</td>
                                            <td className="px-4 py-3 text-neutral-500">{c.department}</td>
                                            <td className="px-4 py-3">{riskBadge(c.risk_level, t)}</td>
                                            <td className="px-4 py-3">{complianceStatusBadge(c.status, t)}</td>
                                            <td className="px-4 py-3 text-neutral-400">{fmtDate(c.due_date)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}

export default Governance
