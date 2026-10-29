import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { Search, Printer, ShieldAlert, CheckCircle2, AlertTriangle, AlertCircle, BarChart2 } from "lucide-react"

export interface FindingResponse {
    id: number
    investigation_id: number
    investigation_title: string
    question: string
    status: string
    finding: string | null
    evidence: any[]
    conflicts: any[]
    evidence_gaps: any[]
    applicable_requirements: any[]
    suggested_actions: any[]
    citations: any[]
    created_at: string
}

export interface GovernanceSummary {
    policies: { total: number; active: number; draft: number }
    regulations: { total: number; active: number }
    compliance: { total: number; compliant: number; non_compliant: number; high_risk: number; score: number }
    investigations: { total: number; active: number }
    findings: { total: number; completed: number; failed: number }
}

export default function Reports() {
    const { t } = useTranslation()
    const [findings, setFindings] = useState<FindingResponse[]>([])
    const [summary, setSummary] = useState<GovernanceSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [searchQuery, setSearchQuery] = useState("")

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true)
            setError("")
            try {
                const token = localStorage.getItem("access_token")
                const [findingsRes, summaryRes] = await Promise.all([
                    fetch(`http://127.0.0.1:8000/api/v1/audit/findings?status=completed&limit=200`, {
                        headers: { Authorization: `Bearer ${token}` }
                    }),
                    fetch(`http://127.0.0.1:8000/api/v1/governance/summary`, {
                        headers: { Authorization: `Bearer ${token}` }
                    })
                ])

                if (!findingsRes.ok || !summaryRes.ok) {
                    throw new Error("Failed to load report data")
                }

                const findingsData = await findingsRes.json()
                const summaryData = await summaryRes.json()

                setFindings(findingsData.items || [])
                setSummary(summaryData)
            } catch (err: any) {
                setError(err.message || "An error occurred")
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [])

    const handlePrint = () => {
        window.print()
    }

    const filteredFindings = findings.filter(f => {
        const query = searchQuery.toLowerCase()
        if (!query) return true
        return (
            (f.investigation_title || "").toLowerCase().includes(query) ||
            (f.question || "").toLowerCase().includes(query) ||
            (f.finding || "").toLowerCase().includes(query) ||
            (f.suggested_actions || []).some((a: any) => (a.action || "").toLowerCase().includes(query))
        )
    })

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-sm text-neutral-500">{t("common.loading", "Loading reports...")}</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex h-full items-center justify-center">
                <p className="text-sm text-red-500">{error}</p>
            </div>
        )
    }

    return (
        <div className="flex h-full flex-col bg-white">
            {/* Header */}
            <header className="print-hide flex shrink-0 items-center justify-between border-b border-neutral-200 px-8 py-5">
                <div>
                    <h1 className="text-xl font-semibold tracking-tight text-neutral-900">{t("reports.title", "Compliance Reports")}</h1>
                    <p className="mt-1 text-sm text-neutral-500">
                        {t("reports.subtitle", "Generate, review, and export formal compliance and audit reports.")}
                    </p>
                </div>
                <button
                    onClick={handlePrint}
                    className="flex items-center gap-2 rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
                >
                    <Printer size={16} />
                    <span>{t("reports.exportPdf", "Print / Save as PDF")}</span>
                </button>
            </header>

            {/* Print Header (Only visible when printing) */}
            <div className="hidden print-block px-8 py-6 border-b border-neutral-200">
                <h1 className="text-2xl font-bold text-neutral-900">{t("reports.title", "Compliance & Governance Report")}</h1>
                <p className="text-sm text-neutral-500 mt-1">Generated on {new Date().toLocaleDateString()}</p>
            </div>

            <div className="flex-1 overflow-y-auto px-8 py-6 print-p-0">
                <div className="mx-auto max-w-5xl space-y-8">
                    
                    {/* Executive KPI Area */}
                    {summary && (
                        <section className="space-y-4">
                            <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
                                <BarChart2 size={18} />
                                {t("governance.title", "Governance & Compliance Metrics")}
                            </h2>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{t("compliance.score", "Compliance Score")}</p>
                                    <p className="mt-2 text-3xl font-semibold text-neutral-900">{summary.compliance.score}%</p>
                                </div>
                                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{t("compliance.highRisk", "High Risk Obligations")}</p>
                                    <p className="mt-2 text-3xl font-semibold text-neutral-900">{summary.compliance.high_risk}</p>
                                </div>
                                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{t("investigations.statuses.active", "Active")} {t("nav.policies", "Policies")}</p>
                                    <p className="mt-2 text-3xl font-semibold text-neutral-900">{summary.policies.active}</p>
                                </div>
                                <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
                                    <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider">{t("agents.statusCompleted", "Completed")} {t("dashboard.stats.recentFindings", "Findings")}</p>
                                    <p className="mt-2 text-3xl font-semibold text-neutral-900">{summary.findings.completed}</p>
                                </div>
                            </div>
                        </section>
                    )}

                    {/* Findings Section */}
                    <section className="space-y-4">
                        <div className="flex items-center justify-between print-hide">
                            <h2 className="text-lg font-semibold text-neutral-900 flex items-center gap-2">
                                <ShieldAlert size={18} />
                                {t("agents.statusCompleted", "Completed")} {t("dashboard.topNav.agents", "Agent")} {t("dashboard.stats.recentFindings", "Findings")}
                            </h2>
                            <div className="relative w-64">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" size={16} />
                                <input
                                    type="text"
                                    placeholder={t("audit.searchPlaceholder", "Search reports...")}
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full rounded-md border border-neutral-300 py-1.5 pl-9 pr-3 text-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900"
                                />
                            </div>
                        </div>

                        {/* Print Only Findings Header */}
                        <h2 className="hidden print-block text-lg font-semibold text-neutral-900 mt-8 mb-4 border-b pb-2">
                            {t("audit.columns.details", "Detailed Findings")}
                        </h2>

                        <div className="space-y-4">
                            {filteredFindings.length === 0 ? (
                                <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center">
                                    <p className="text-sm text-neutral-500">{t("compliance.emptyFilterTitle", "No reports match your search.")}</p>
                                </div>
                            ) : (
                                filteredFindings.map((finding) => (
                                    <div key={finding.id} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm break-inside-avoid">
                                        <div className="mb-4">
                                            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-1">
                                                {finding.investigation_title || `Investigation #${finding.investigation_id}`}
                                            </p>
                                            <h3 className="text-lg font-semibold text-neutral-900 leading-tight">
                                                {finding.question}
                                            </h3>
                                            <p className="mt-1 text-xs text-neutral-400">
                                                {t("agents.statusCompleted", "Completed on")} {new Date(finding.created_at).toLocaleString()}
                                            </p>
                                        </div>

                                        {finding.finding && (
                                            <div className="mb-4">
                                                <p className="text-sm text-neutral-700 leading-relaxed whitespace-pre-wrap">
                                                    {finding.finding}
                                                </p>
                                            </div>
                                        )}

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-neutral-100">
                                            {/* Gaps & Conflicts */}
                                            <div className="space-y-3">
                                                {finding.evidence_gaps && finding.evidence_gaps.length > 0 && (
                                                    <div>
                                                        <p className="text-xs font-semibold text-neutral-900 flex items-center gap-1 mb-1.5">
                                                            <AlertCircle size={14} className="text-amber-500" />
                                                            {t("research.comparison.gaps", "Evidence Gaps")}
                                                        </p>
                                                        <ul className="list-disc pl-4 space-y-1">
                                                            {finding.evidence_gaps.map((gap: any, i: number) => (
                                                                <li key={i} className="text-xs text-neutral-600">{gap.gap}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                {finding.conflicts && finding.conflicts.length > 0 && (
                                                    <div>
                                                        <p className="text-xs font-semibold text-neutral-900 flex items-center gap-1 mb-1.5">
                                                            <AlertTriangle size={14} className="text-red-500" />
                                                            {t("research.comparison.materialConflicts", "Policy Conflicts")}
                                                        </p>
                                                        <ul className="list-disc pl-4 space-y-1">
                                                            {finding.conflicts.map((conflict: any, i: number) => (
                                                                <li key={i} className="text-xs text-neutral-600">{conflict.conflict}</li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}
                                                {(!finding.evidence_gaps?.length && !finding.conflicts?.length) && (
                                                    <p className="text-xs text-neutral-500 italic">No gaps or conflicts detected.</p>
                                                )}
                                            </div>

                                            {/* Recommendations */}
                                            <div>
                                                <p className="text-xs font-semibold text-neutral-900 flex items-center gap-1 mb-1.5">
                                                    <CheckCircle2 size={14} className="text-emerald-500" />
                                                    {t("research.comparison.actions", "Governance Recommendations")}
                                                </p>
                                                {finding.suggested_actions && finding.suggested_actions.length > 0 ? (
                                                    <ul className="space-y-2">
                                                        {finding.suggested_actions.map((action: any, i: number) => (
                                                            <li key={i} className="rounded bg-neutral-50 p-2">
                                                                <p className="text-xs font-medium text-neutral-900">{action.action}</p>
                                                                {action.reason && <p className="text-xs text-neutral-500 mt-0.5">{action.reason}</p>}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                ) : (
                                                    <p className="text-xs text-neutral-500 italic">No specific recommendations.</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{__html: `
                @media print {
                    @page { margin: 1.5cm; size: auto; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: white; }
                    .print-hide { display: none !important; }
                    .print-block { display: block !important; }
                    .print-p-0 { padding: 0 !important; overflow: visible !important; }
                    .break-inside-avoid { break-inside: avoid; page-break-inside: avoid; }
                    * { overflow: visible !important; }
                }
                .print-block { display: none; }
            `}} />
        </div>
    )
}
