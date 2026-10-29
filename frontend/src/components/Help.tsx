import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Search, HelpCircle, MessageSquare } from "lucide-react"

type HelpTopicId =
    | "getting-started"
    | "investigations"
    | "research"
    | "agents"
    | "documents"
    | "integrations"
    | "governance"
    | "audit"
    | "faq"
    | "shortcuts"

export default function Help() {
    const { t } = useTranslation()
    const [activeTopic, setActiveTopic] = useState<HelpTopicId>("getting-started")
    const [question, setQuestion] = useState("")
    const [answer, setAnswer] = useState<string | null>(null)
    const [loadingAsk, setLoadingAsk] = useState(false)
    const [errorAsk, setErrorAsk] = useState<string | null>(null)

    const helpTopics: { id: HelpTopicId; label: string }[] = [
        { id: "getting-started", label: t("help.categories.gettingStarted", "Getting Started") },
        { id: "investigations", label: t("help.categories.investigations", "Investigations") },
        { id: "research", label: t("help.categories.research", "Research") },
        { id: "agents", label: t("nav.agents", "AI Agents") },
        { id: "documents", label: t("investigations.details.documents", "Documents & Knowledge") },
        { id: "integrations", label: t("nav.integrations", "Integrations") },
        { id: "governance", label: t("nav.governance", "Governance & Compliance") },
        { id: "audit", label: t("nav.audit", "Audit & Findings") },
        { id: "faq", label: "FAQ" },
        { id: "shortcuts", label: t("help.shortcutsTitle", "Keyboard Shortcuts") },
    ]

    const handleAsk = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!question.trim()) return

        setLoadingAsk(true)
        setErrorAsk(null)
        setAnswer(null)

        try {
            const token = localStorage.getItem("access_token")
            const apiBase = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "")
            const res = await fetch(`${apiBase}/api/v1/help/ask`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(token && { Authorization: `Bearer ${token}` }),
                },
                body: JSON.stringify({ query: question }),
            })

            if (!res.ok) {
                const errData = await res.json().catch(() => null)
                if (res.status === 504) {
                    throw new Error("Help AI request timed out. Please try asking again or check the documentation topics.")
                }
                if (res.status === 503) {
                    throw new Error(errData?.detail || "Help AI is temporarily unavailable. Please refer to the Help topics.")
                }
                if (res.status === 404) {
                    throw new Error("Ask OpusLex endpoint is currently unavailable.")
                }
                const msg = errData?.detail ? (typeof errData.detail === "string" ? errData.detail : JSON.stringify(errData.detail)) : "Failed to get answer."
                throw new Error(msg)
            }
            const data = await res.json()
            if (!data.answer || !data.answer.trim()) {
                throw new Error("No answer was returned by the assistant. Please rephrase your question.")
            }
            setAnswer(data.answer)
        } catch (err: any) {
            setErrorAsk(err.message || "An error occurred.")
        } finally {
            setLoadingAsk(false)
        }
    }

    const renderContent = () => {
        switch (activeTopic) {
            case "getting-started":
                return (
                    <div className="space-y-4">
                        <h2 className="text-2xl font-semibold">Getting Started with OpusLex</h2>
                        <p className="text-body text-neutral-600">
                            OpusLex is your dedicated legal and compliance workspace.
                        </p>
                        <ul className="list-disc pl-5 space-y-2 text-body text-neutral-600">
                            <li><strong>Navigate OpusLex:</strong> Use the left sidebar to access your workspaces (Investigations, Research, Agents, etc.) and global search (Cmd+K) at the top to quickly find items.</li>
                            <li><strong>Create an Investigation:</strong> Head to the Investigations tab and click "New Investigation" to start grouping documents, research, and agent findings around a specific topic.</li>
                            <li><strong>Attach Documents:</strong> You can upload documents directly from your device within the Investigations or Research workspaces, or configure Integrations if available.</li>
                            <li><strong>Run Research:</strong> Use the Research workspace for global queries across all your documents and public knowledge, or run scoped research inside an Investigation.</li>
                            <li><strong>Run an Agent:</strong> Navigate to AI Agents to deploy automated compliance analyses. Agents require an active Investigation context to operate securely on scoped evidence.</li>
                            <li><strong>Find Audit/Findings:</strong> The Audit & Findings section tracks all system events and specific compliance gaps identified by AI Agents, providing a clear trail of evidence.</li>
                        </ul>
                    </div>
                )
            case "investigations":
                return (
                    <div className="space-y-4">
                        <h2 className="text-2xl font-semibold">Investigations</h2>
                        <p className="text-body text-neutral-600">
                            Investigations act as secure containers for your legal and compliance workflows.
                        </p>
                        <ul className="list-disc pl-5 space-y-2 text-body text-neutral-600">
                            <li><strong>Creating an Investigation:</strong> Use the "New Investigation" button in the Investigations workspace.</li>
                            <li><strong>Adding/Removing Documents:</strong> Manage evidence inside the investigation's Document tab. Documents added here are scoped specifically to this investigation.</li>
                            <li><strong>Research Workspace:</strong> The investigation-scoped Research tab restricts searches and context to only the documents attached to this investigation.</li>
                            <li><strong>Research History:</strong> All queries and answers generated within an investigation are preserved in its History log.</li>
                            <li><strong>Agent Execution:</strong> AI Agents can be run against an investigation to perform structured tasks (e.g., policy gap analysis) against its evidence.</li>
                            <li><strong>Agent History:</strong> Results from agent runs are permanently stored within the investigation.</li>
                            <li><strong>Regulatory Comparison:</strong> Compare investigation findings against established regulations and internal policies directly within the workspace.</li>
                        </ul>
                    </div>
                )
            case "research":
                return (
                    <div className="space-y-4">
                        <h2 className="text-2xl font-semibold">Research</h2>
                        <p className="text-body text-neutral-600">
                            Research allows you to interrogate your documents using RAG (Retrieval-Augmented Generation).
                        </p>
                        <ul className="list-disc pl-5 space-y-2 text-body text-neutral-600">
                            <li><strong>Global Research:</strong> The primary Research workspace searches across all documents and public knowledge available to your user role.</li>
                            <li><strong>Research History:</strong> Your past research sessions are saved, allowing you to resume complex inquiries.</li>
                            <li><strong>Attaching Research:</strong> You can often link relevant global research findings to a specific investigation.</li>
                            <li><strong>Global vs Scoped:</strong> Global Research accesses everything; Investigation-scoped research only sees documents explicitly attached to that investigation, ensuring strict data compartmentalization.</li>
                        </ul>
                    </div>
                )
            case "agents":
                return (
                    <div className="space-y-4">
                        <h2 className="text-2xl font-semibold">AI Agents</h2>
                        <p className="text-body text-neutral-600">
                            Agents perform structured, multi-step reasoning tasks automatically.
                        </p>
                        <ul className="list-disc pl-5 space-y-2 text-body text-neutral-600">
                            <li><strong>What an Agent Run does:</strong> It executes a predefined workflow (like compliance auditing or contract extraction) across provided evidence, generating structured reports.</li>
                            <li><strong>Investigation requirement:</strong> For security and scoping, agents currently must be run within the context of an active Investigation.</li>
                            <li><strong>Evidence grounding:</strong> Agent conclusions are strictly grounded in the provided document evidence.</li>
                            <li><strong>Structured findings:</strong> Results are presented as structured data, often directly identifying missing clauses or compliance violations.</li>
                            <li><strong>Evidence gaps/conflicts:</strong> Agents are instructed to highlight when evidence is missing or contradictory, rather than guessing.</li>
                            <li><strong>Agent history:</strong> A full log of every agent execution, including its inputs and outputs, is preserved for audit purposes.</li>
                        </ul>
                    </div>
                )
            case "documents":
                return (
                    <div className="space-y-4">
                        <h2 className="text-2xl font-semibold">Documents & Knowledge</h2>
                        <p className="text-body text-neutral-600">
                            Manage the unstructured data that powers your research and agents.
                        </p>
                        <ul className="list-disc pl-5 space-y-2 text-body text-neutral-600">
                            <li><strong>Document Library:</strong> A central view of all files you have uploaded or synced.</li>
                            <li><strong>Public Knowledge:</strong> Documents explicitly marked as public are available to all authorized users in the workspace for shared context.</li>
                            <li><strong>Sharing findings:</strong> Findings can be exported or saved back to the workspace as new knowledge artifacts.</li>
                            <li><strong>Source/citation behavior:</strong> All AI-generated answers and findings include citations pointing back to the exact source documents used to formulate them.</li>
                        </ul>
                    </div>
                )
            case "integrations":
                return (
                    <div className="space-y-4">
                        <h2 className="text-2xl font-semibold">Integrations</h2>
                        <p className="text-body text-neutral-600">
                            Connect external data sources to sync documents automatically.
                        </p>
                        <ul className="list-disc pl-5 space-y-2 text-body text-neutral-600">
                            <li><strong>Google Drive:</strong> Currently <em>Not Configured</em> (requires backend OAuth setup).</li>
                            <li><strong>Dropbox:</strong> Currently <em>Not Configured</em> (requires backend API credentials).</li>
                            <li><strong>Box:</strong> <em>Coming Soon</em> in a future release.</li>
                            <li><strong>Microsoft OneDrive:</strong> <em>Coming Soon</em> in a future release.</li>
                            <li><strong>SharePoint:</strong> <em>Coming Soon</em> in a future release.</li>
                        </ul>
                        <p className="text-sm text-neutral-500 italic">
                            Note: Until OAuth and API credentials are provided by your administrator, these integrations will remain unavailable. You can upload documents directly from your device in the meantime.
                        </p>
                    </div>
                )
            case "governance":
                return (
                    <div className="space-y-4">
                        <h2 className="text-2xl font-semibold">Governance & Compliance</h2>
                        <p className="text-body text-neutral-600">
                            The central hub for tracking corporate policies and external regulations.
                        </p>
                        <ul className="list-disc pl-5 space-y-2 text-body text-neutral-600">
                            <li><strong>Policy Register:</strong> Maintain and track internal corporate policies.</li>
                            <li><strong>Regulation Register:</strong> Track external legal and compliance regulations relevant to your business.</li>
                            <li><strong>Risk Register:</strong> Monitor identified risks (Coming Soon).</li>
                            <li><strong>Governance overview:</strong> A high-level dashboard summarizing the status of your governance landscape.</li>
                        </ul>
                    </div>
                )
            case "audit":
                return (
                    <div className="space-y-4">
                        <h2 className="text-2xl font-semibold">Audit & Findings</h2>
                        <p className="text-body text-neutral-600">
                            Ensure complete accountability and trace the source of all system actions.
                        </p>
                        <ul className="list-disc pl-5 space-y-2 text-body text-neutral-600">
                            <li><strong>Findings:</strong> Review specific compliance gaps or issues identified by users or AI Agents.</li>
                            <li><strong>Audit Trail:</strong> A chronological log of significant events within the workspace (document uploads, policy changes, agent runs).</li>
                            <li><strong>What events are represented:</strong> Changes to investigations, document processing status, and governance updates.</li>
                            <li><strong>Citations:</strong> Findings clearly display the evidence and citations used to reach the conclusion, ensuring transparency.</li>
                        </ul>
                    </div>
                )
            case "faq":
                return (
                    <div className="space-y-4">
                        <h2 className="text-2xl font-semibold">Frequently Asked Questions</h2>
                        <div className="space-y-4">
                            <div>
                                <h3 className="font-medium">Why can't I connect my Google Drive?</h3>
                                <p className="text-body text-neutral-600">Google Drive integration requires a backend OAuth configuration which has not yet been set up by your administrator.</p>
                            </div>
                            <div>
                                <h3 className="font-medium">How do I change my password?</h3>
                                <p className="text-body text-neutral-600">Password management is currently handled externally by your identity provider or is planned for a future release.</p>
                            </div>
                            <div>
                                <h3 className="font-medium">Are my documents used to train AI models?</h3>
                                <p className="text-body text-neutral-600">No. OpusLex ensures your documents are stored securely and are only used as context for your specific queries and agent runs. Data is not shared externally for model training.</p>
                            </div>
                        </div>
                    </div>
                )
            case "shortcuts":
                return (
                    <div className="space-y-4">
                        <h2 className="text-2xl font-semibold">Keyboard Shortcuts</h2>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between py-2 border-b border-neutral-100">
                                <span className="text-body">Global Search</span>
                                <div className="flex gap-1">
                                    <kbd className="px-2 py-1 bg-neutral-100 border border-neutral-200 rounded text-xs font-mono">⌘</kbd>
                                    <kbd className="px-2 py-1 bg-neutral-100 border border-neutral-200 rounded text-xs font-mono">K</kbd>
                                </div>
                            </div>
                            <div className="flex items-center justify-between py-2 border-b border-neutral-100">
                                <span className="text-body">Close Overlays / Modals</span>
                                <kbd className="px-2 py-1 bg-neutral-100 border border-neutral-200 rounded text-xs font-mono">Esc</kbd>
                            </div>
                        </div>
                    </div>
                )
        }
    }

    return (
        <div className="flex h-[calc(100vh-4rem)] max-w-5xl mx-auto py-6">
            {/* Left sidebar navigation using a pill style for vertical layout, similar to settings but cleaner */}
            <div className="w-64 pr-6 border-r border-neutral-200 overflow-y-auto shrink-0 flex flex-col">
                <div className="flex items-center gap-2 mb-6 pl-2">
                    <HelpCircle size={20} className="text-neutral-900" />
                    <h2 className="text-heading font-semibold text-neutral-900">{t("help.title", "Help Center")}</h2>
                </div>
                
                <nav className="flex flex-col gap-1 flex-1">
                    {helpTopics.map(topic => (
                        <button
                            key={topic.id}
                            onClick={() => setActiveTopic(topic.id)}
                            className={`flex items-center px-3 py-2 rounded-lg text-body transition-colors text-left w-full ${
                                activeTopic === topic.id
                                    ? "bg-neutral-100 text-neutral-900 font-medium"
                                    : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                            }`}
                        >
                            {topic.label}
                        </button>
                    ))}
                </nav>
            </div>

            {/* Right content area */}
            <div className="flex-1 pl-10 overflow-y-auto pb-20 flex flex-col">
                <div className="max-w-2xl flex-1">
                    {renderContent()}
                </div>

                {/* Ask OpusLex Section */}
                <div className="mt-12 max-w-2xl border-t border-neutral-200 pt-8">
                    <div className="flex items-center gap-2 mb-2">
                        <MessageSquare size={18} className="text-neutral-900" />
                        <h3 className="text-lg font-semibold text-neutral-900">{t("help.subtitle", "Still need help?")}</h3>
                    </div>
                    <p className="text-body text-neutral-500 mb-4">
                        Ask OpusLex about using the platform.
                    </p>

                    <form onSubmit={handleAsk} className="flex gap-2">
                        <div className="relative flex-1">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                            <input
                                type="text"
                                placeholder={t("help.searchPlaceholder", "How do I create an investigation?")}
                                value={question}
                                onChange={e => setQuestion(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-white border border-neutral-300 rounded-lg focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 text-body transition-shadow"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={!question.trim() || loadingAsk}
                            className="px-4 py-2 bg-[#FBC648] text-neutral-900 rounded-lg font-medium text-sm hover:bg-[#F0BD44] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {loadingAsk ? t("common.loading", "Asking...") : t("research.askButton", "Ask")}
                        </button>
                    </form>

                    {errorAsk && (
                        <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                            {errorAsk}
                        </div>
                    )}

                    {answer && (
                        <div className="mt-4 p-4 bg-neutral-50 border border-neutral-200 rounded-lg">
                            <div className="flex gap-3">
                                <div className="shrink-0 w-6 h-6 rounded bg-neutral-200 flex items-center justify-center">
                                    <SparklesIcon />
                                </div>
                                <div className="text-body text-neutral-800 whitespace-pre-wrap">
                                    {answer}
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

function SparklesIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-700">
            <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
            <path d="M5 3v4"/>
            <path d="M19 17v4"/>
            <path d="M3 5h4"/>
            <path d="M17 19h4"/>
        </svg>
    )
}
