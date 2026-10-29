import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Sparkles, FileText, CheckCircle, AlertTriangle, AlertCircle, Play, FileQuestion, BookOpen } from "lucide-react";

const API = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

type AgentEvidence = {
    claim: string;
    source_document: string;
    source_section_or_chunk: string;
    supporting_text: string;
};

type AgentConflict = {
    description: string;
    documents: string[];
    relationship: string;
};

type AgentEvidenceGap = {
    description: string;
    why_it_matters: string;
};

type AgentRequirement = {
    requirement: string;
    source_document: string;
    source_section_or_chunk: string;
};

type AgentAction = {
    action: string;
    rationale: string;
};

type AgentCitation = {
    source_document: string;
    source_section_or_chunk: string;
};

type AgentRun = {
    id: number;
    investigation_id: number;
    user_id: number;
    question: string;
    status: string;
    finding: string | null;
    evidence: AgentEvidence[];
    conflicts: AgentConflict[];
    evidence_gaps: AgentEvidenceGap[];
    applicable_requirements: AgentRequirement[];
    suggested_actions: AgentAction[];
    citations: AgentCitation[];
    created_at: string;
};

type Investigation = {
    id: number;
    title: string;
    description: string | null;
    status: string;
};

export default function Agents() {
    const { t } = useTranslation();
    const [investigations, setInvestigations] = useState<Investigation[]>([]);
    const [selectedInvestigation, setSelectedInvestigation] = useState<Investigation | null>(null);
    const [documentsCount, setDocumentsCount] = useState<number | null>(null);
    const [runs, setRuns] = useState<AgentRun[]>([]);
    const [selectedRun, setSelectedRun] = useState<AgentRun | null>(null);
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    
    const [question, setQuestion] = useState("");
    const [isRunning, setIsRunning] = useState(false);
    
    useEffect(() => {
        const fetchInvestigations = async () => {
            try {
                const token = localStorage.getItem("access_token");
                if (!token) return;
                const res = await fetch(`${API}/api/v1/investigations/`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!res.ok) throw new Error("Failed to load investigations");
                const data = await res.json();
                setInvestigations(data);
                if (data.length > 0) {
                    setSelectedInvestigation(data[0]);
                }
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        fetchInvestigations();
    }, []);

    useEffect(() => {
        if (!selectedInvestigation) return;
        
        const fetchDocsAndRuns = async () => {
            const token = localStorage.getItem("access_token");
            if (!token) return;
            
            try {
                const docsRes = await fetch(`${API}/api/v1/investigations/${selectedInvestigation.id}/documents`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (docsRes.ok) {
                    const docs = await docsRes.json();
                    setDocumentsCount(docs.length);
                }
                
                const runsRes = await fetch(`${API}/api/v1/agents/runs?investigation_id=${selectedInvestigation.id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (runsRes.ok) {
                    const runsData = await runsRes.json();
                    setRuns(runsData);
                }
            } catch (err) {
                console.error(err);
            }
        };
        fetchDocsAndRuns();
    }, [selectedInvestigation]);

    const handleRunAgent = async () => {
        if (!selectedInvestigation) return;
        if (!question.trim()) return;
        
        setIsRunning(true);
        setError("");
        const token = localStorage.getItem("access_token");
        try {
            const res = await fetch(`${API}/api/v1/agents/investigations/${selectedInvestigation.id}/run`, {
                method: "POST",
                headers: { 
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}` 
                },
                body: JSON.stringify({ question })
            });
            
            if (!res.ok) {
                const errData = await res.json();
                const errMessage = typeof errData.detail === 'string' ? errData.detail : (Array.isArray(errData.detail) ? errData.detail[0]?.msg : "Failed to run agent");
                throw new Error(errMessage || "Failed to run agent");
            }
            
            const newRun = await res.json();
            setRuns([newRun, ...runs]);
            setSelectedRun(newRun);
            setQuestion("");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsRunning(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-full items-center justify-center p-8">
                <p className="text-sm text-neutral-500">Loading workspace...</p>
            </div>
        );
    }

    return (
        <div className="flex h-[calc(100vh-4rem)]">
            <div className="w-1/3 flex flex-col border-r border-neutral-200 bg-neutral-50 overflow-y-auto">
                <div className="p-4 border-b border-neutral-200 bg-white">
                    <h2 className="text-sm font-semibold mb-2">{t("agents.scopeLabel", "Investigation Context")}</h2>
                    <select
                        className="w-full text-sm border border-neutral-300 rounded-md p-2 outline-none"
                        value={selectedInvestigation?.id || ""}
                        onChange={(e) => {
                            const inv = investigations.find(i => i.id === Number(e.target.value));
                            if (inv) setSelectedInvestigation(inv);
                            setSelectedRun(null);
                        }}
                    >
                        <option value="" disabled>{t("research.selectInvestigation", "Select an investigation")}</option>
                        {investigations.map(inv => (
                            <option key={inv.id} value={inv.id}>{inv.title}</option>
                        ))}
                    </select>
                    
                    {selectedInvestigation && documentsCount !== null && (
                        <div className="mt-3 flex flex-col gap-1">
                            <span className="text-xs text-neutral-500 flex items-center gap-1">
                                <FileText size={12} /> {documentsCount} attached document{documentsCount !== 1 ? 's' : ''}
                            </span>
                            {documentsCount === 0 && (
                                <span className="text-xs text-amber-600 flex items-center gap-1 bg-amber-50 p-1.5 rounded mt-1">
                                    <AlertTriangle size={12} /> No documents. Execution requires evidence context.
                                </span>
                            )}
                        </div>
                    )}
                </div>
                
                <div className="flex-1 overflow-y-auto p-4">
                    <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">{t("agents.executionTrace", "Agent Runs History")}</h2>
                    {runs.length === 0 ? (
                        <p className="text-xs text-neutral-400">{t("investigations.details.noEvidence", "No agent runs in this investigation.")}</p>
                    ) : (
                        <div className="space-y-2">
                            {runs.map(run => (
                                <button
                                    key={run.id}
                                    onClick={() => setSelectedRun(run)}
                                    className={`w-full text-left p-3 rounded-xl border text-sm transition ${
                                        selectedRun?.id === run.id ? "bg-white border-neutral-300 shadow-sm" : "bg-transparent border-transparent hover:bg-neutral-100"
                                    }`}
                                >
                                    <div className="flex items-center gap-2 mb-1">
                                        <Sparkles size={14} className={run.status === 'completed' ? "text-emerald-500" : run.status === 'failed' ? "text-red-500" : "text-amber-500"} />
                                        <span className="font-medium truncate flex-1 text-neutral-800">{run.question}</span>
                                    </div>
                                    <div className="text-xs text-neutral-400 flex items-center justify-between mt-2">
                                        <span className="capitalize">{run.status}</span>
                                        <span>{new Date(run.created_at).toLocaleDateString()}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            
            <div className="flex-1 flex flex-col bg-white overflow-hidden">
                <div className="border-b border-neutral-100 p-6 bg-neutral-50/50">
                    <div className="mb-4">
                        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
                            <Sparkles size={18} className="text-neutral-700" /> {t("agents.title", "AI Agent Execution")}
                        </h2>
                        <p className="text-xs text-neutral-500 mt-1">
                            {t("agents.subtitle", "Run a targeted compliance analysis scoped exclusively to the documents in your selected investigation.")}
                        </p>
                    </div>
                    
                    <div className="relative">
                        <textarea
                            className="w-full text-sm border border-neutral-300 rounded-xl p-4 pb-12 outline-none focus:border-neutral-900 transition-colors resize-none shadow-sm"
                            rows={3}
                            placeholder={t("agents.taskPlaceholder", "Ask a compliance question, e.g., 'What are the breach notification requirements under GDPR?'")}
                            value={question}
                            onChange={(e) => setQuestion(e.target.value)}
                            disabled={isRunning || !selectedInvestigation || documentsCount === 0}
                        />
                        <button
                            onClick={handleRunAgent}
                            disabled={isRunning || !selectedInvestigation || !question.trim() || documentsCount === 0}
                            className={`absolute bottom-3 right-3 flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                isRunning || !selectedInvestigation || !question.trim() || documentsCount === 0
                                    ? "bg-neutral-100 text-neutral-400 cursor-not-allowed"
                                    : "bg-[#FBC648] text-neutral-900 hover:bg-[#FBC648]/90 shadow-sm"
                            }`}
                        >
                            {isRunning ? (
                                <>
                                    <div className="h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                                    {t("agents.statusRunning", "Analyzing...")}
                                </>
                            ) : (
                                <>
                                    <Play size={12} />
                                    {t("agents.runAgent", "Run Agent")}
                                </>
                            )}
                        </button>
                    </div>
                    {error && (
                        <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
                            <AlertCircle size={12} /> {error}
                        </p>
                    )}
                </div>
                
                <div className="flex-1 overflow-y-auto p-6">
                    {selectedRun ? (
                        <div className="space-y-6 max-w-3xl mx-auto pb-12">
                            {selectedRun.question && !/no (query( echo)?|echo)|do not (include|echo) (the )?query|only conflict/i.test(selectedRun.question) && (
                                <div className="mb-8">
                                    <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-widest mb-2">Query</h3>
                                    <p className="text-lg font-medium text-neutral-900 leading-relaxed">{selectedRun.question}</p>
                                </div>
                            )}
                            
                            {selectedRun.status === "failed" ? (
                                <div className="bg-red-50 text-red-700 p-4 rounded-xl border border-red-100 flex gap-3">
                                    <AlertCircle className="shrink-0 mt-0.5" size={16} />
                                    <div>
                                        <h4 className="text-sm font-semibold mb-1">Execution Failed</h4>
                                        <p className="text-sm opacity-90">{selectedRun.finding || "An unexpected error occurred during execution."}</p>
                                    </div>
                                </div>
                            ) : selectedRun.status === "pending" ? (
                                <div className="flex flex-col items-center justify-center p-12 text-neutral-400 gap-4">
                                    <div className="h-8 w-8 rounded-full border-4 border-neutral-200 border-t-neutral-400 animate-spin" />
                                    <p className="text-sm">{t("research.comparison.comparing", "Agent is analyzing documents...")}</p>
                                </div>
                            ) : (
                                <>
                                    {selectedRun.finding && (
                                        !/do not include (an? )?executive summary|without (an? )?executive summary|no executive summary|only conflict/i.test(selectedRun.question || "") ||
                                        /limitation|insufficient|cannot answer|not establish/i.test(selectedRun.finding) ||
                                        (selectedRun.conflicts.length === 0 && selectedRun.evidence.length === 0 && selectedRun.applicable_requirements.length === 0)
                                    ) && (
                                        <div className="prose prose-sm prose-neutral max-w-none">
                                            <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-widest mb-3">
                                                {/limitation|insufficient|cannot answer|not establish/i.test(selectedRun.finding)
                                                    ? "Evidence Limitation"
                                                    : /executive summary/i.test(selectedRun.question || "")
                                                    ? "Executive Summary"
                                                    : "Finding"}
                                            </h3>
                                            <div className="bg-neutral-50 rounded-xl p-5 border border-neutral-100 leading-relaxed text-sm whitespace-pre-wrap">
                                                {selectedRun.finding}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {selectedRun.applicable_requirements && selectedRun.applicable_requirements.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <CheckCircle size={14} /> {t("compliance.title", "Applicable Requirements")}
                                            </h3>
                                            <div className="space-y-3">
                                                {selectedRun.applicable_requirements.map((req, i) => (
                                                    <div key={i} className="bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
                                                        <p className="text-sm font-medium text-neutral-900 mb-2">{req.requirement}</p>
                                                        <div className="flex items-center gap-2 text-xs text-neutral-500">
                                                            <BookOpen size={12} />
                                                            <span>{req.source_document}</span>
                                                            {req.source_section_or_chunk && <span>• {req.source_section_or_chunk}</span>}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {selectedRun.evidence && selectedRun.evidence.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <FileText size={14} /> {t("investigations.details.evidence", "Supporting Evidence")}
                                            </h3>
                                            <div className="space-y-3">
                                                {selectedRun.evidence.map((ev, i) => (
                                                    <div key={i} className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-sm">
                                                        <div className="p-4 border-b border-neutral-100">
                                                            <p className="text-sm font-medium text-neutral-900">{ev.claim}</p>
                                                        </div>
                                                        <div className="p-4 bg-neutral-50">
                                                            <p className="text-xs italic text-neutral-600 mb-2">"{ev.supporting_text}"</p>
                                                            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-500">
                                                                <BookOpen size={10} />
                                                                <span>{ev.source_document}</span>
                                                                {ev.source_section_or_chunk && <span>• {ev.source_section_or_chunk}</span>}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {selectedRun.conflicts && selectedRun.conflicts.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-medium text-amber-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <AlertTriangle size={14} /> {t("research.comparison.materialConflicts", "Identified Conflicts")}
                                            </h3>
                                            <div className="space-y-3">
                                                {selectedRun.conflicts.map((conflict, i) => (
                                                    <div key={i} className="bg-amber-50 rounded-xl border border-amber-200 p-4">
                                                        <p className="text-sm font-medium text-amber-900 mb-2">{conflict.description}</p>
                                                        <p className="text-xs text-amber-700 mb-2">{conflict.relationship}</p>
                                                        <div className="flex flex-wrap gap-2">
                                                            {conflict.documents.map((doc, j) => (
                                                                <span key={j} className="px-2 py-1 bg-amber-100 text-amber-800 rounded text-xs font-medium">{doc}</span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {selectedRun.evidence_gaps && selectedRun.evidence_gaps.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <FileQuestion size={14} /> {t("research.comparison.gaps", "Evidence Gaps")}
                                            </h3>
                                            <div className="space-y-3">
                                                {selectedRun.evidence_gaps.map((gap, i) => (
                                                    <div key={i} className="bg-neutral-50 rounded-xl border border-neutral-200 p-4 border-l-4 border-l-neutral-400">
                                                        <p className="text-sm font-medium text-neutral-900 mb-1">{gap.description}</p>
                                                        <p className="text-xs text-neutral-600">Why it matters: {gap.why_it_matters}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {selectedRun.suggested_actions && selectedRun.suggested_actions.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <Play size={14} /> {t("research.comparison.actions", "Suggested Actions")}
                                            </h3>
                                            <div className="space-y-3">
                                                {selectedRun.suggested_actions.map((action, i) => (
                                                    <div key={i} className="flex gap-4 items-start bg-white rounded-xl border border-neutral-200 p-4 shadow-sm">
                                                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-white text-xs font-bold">
                                                            {i + 1}
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-medium text-neutral-900 mb-1">{action.action}</p>
                                                            <p className="text-xs text-neutral-500">{action.rationale}</p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {selectedRun.citations && selectedRun.citations.length > 0 && (
                                        <div>
                                            <h3 className="text-sm font-medium text-neutral-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                                                <BookOpen size={14} /> {t("research.sourcesTitle", "Citations")}
                                            </h3>
                                            <div className="space-y-2">
                                                {selectedRun.citations.map((cit, i) => (
                                                    <div key={i} className="flex items-center gap-2 text-xs text-neutral-600 bg-neutral-50 rounded-lg p-2.5 border border-neutral-100">
                                                        <BookOpen size={12} className="text-neutral-400 shrink-0" />
                                                        <span className="font-medium text-neutral-800">{cit.source_document}</span>
                                                        {cit.source_section_or_chunk && <span>• {cit.source_section_or_chunk}</span>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {selectedRun.status === "completed" && (!selectedRun.evidence?.length && !selectedRun.finding && !selectedRun.conflicts?.length) && (
                                        <div className="bg-amber-50 text-amber-800 p-6 rounded-xl border border-amber-200 text-center">
                                            <AlertTriangle size={24} className="mx-auto mb-2 opacity-50" />
                                            <h4 className="text-sm font-medium mb-1">Insufficient Evidence</h4>
                                            <p className="text-xs opacity-80">The agent could not formulate a finding based on the attached documents.</p>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-neutral-400">
                            <Sparkles size={32} className="opacity-20 mb-4" />
                            <p className="text-sm">{t("research.empty.desc", "Select a past run from history or enter a new query above to begin.")}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
