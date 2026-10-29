import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { OpusLexBrand } from "./OpusLexBrand"
import { usePreferences, type FontSize, type Density, type LandingSection, type NotificationCategory, type ThemeMode } from "../contexts/PreferencesContext"
import {
    Activity,
    Bell,
    ChevronRight,
    FileText,
    Gavel,
    HelpCircle,
    LayoutDashboard,
    Search,
    ShieldCheck,
    Sparkles,
    Users,
    X,
    BarChart2,
    Copy,
    Check,
    Globe,
} from "lucide-react"


import Research from "./Research"
import Agents from "./Agents"
import Investigations from "./Investigations"
import { Knowledge } from "./Knowledge"
import Regulations from "./Regulations"
import Policies from "./Policies"
import Compliance from "./Compliance"
import Audit from "./Audit"
import Governance from "./Governance"
import Integrations from "./Integrations"
import Help from "./Help"
import Reports from "./Reports"
import LanguageSelector from "./LanguageSelector"
import { LANGUAGES } from "../i18n/languages"
import type { AssistantOrbState } from "./assistant/AssistantOrb"
import AssistantPanel from "./assistant/AssistantPanel"
import AssistantSettingsTab from "./assistant/AssistantSettingsTab"
import { getAssistantShortcuts, isEditableElement } from "../utils/keyboardShortcuts"

type Section =
    | "home"
    | "regulations"
    | "policies"
    | "compliance"
    | "research"
    | "agents"
    | "investigations"
    | "knowledge"
    | "integrations"
    | "audit"
    | "reports"
    | "governance"
    | "settings"
    | "help"

const BASE_NAVIGATION: {
    id: Section
    label: string
    icon: React.ReactNode
}[] = [
    { id: "home", label: "Home", icon: <LayoutDashboard size={15} /> },
    { id: "regulations", label: "Regulations", icon: <Gavel size={15} /> },
    { id: "compliance", label: "Compliance", icon: <ShieldCheck size={15} /> },
    { id: "policies", label: "Policies", icon: <FileText size={15} /> },
    { id: "research", label: "Research", icon: <Search size={15} /> },
    { id: "agents", label: "AI Agents", icon: <Sparkles size={15} /> },
    { id: "investigations", label: "Investigations", icon: <Users size={15} /> },
    { id: "integrations", label: "Integrations", icon: <Activity size={15} /> },
    { id: "audit", label: "Audit & Findings", icon: <ShieldCheck size={15} /> },
    { id: "reports", label: "Reports", icon: <BarChart2 size={15} /> },
    { id: "governance", label: "Governance", icon: <Gavel size={15} /> },
]

type HomeWorkspaceProps = {
    user?: any

    activeSection: Section
    onOpenResearch: () => void
    onOpenInvestigations: () => void
    onOpenAgents: () => void
    onOpenAudit: () => void
}

type OverviewData = {
    metrics: {
        active_investigations: number
        total_documents: number
        total_agent_runs: number
    }
    active_investigations: {
        id: number
        title: string
        description: string | null
        status: string
        updated_at: string
        documents_count: number
        agent_runs_count: number
    }[]
    recent_activity: {
        id: string
        type: string
        title: string
        detail: string
        timestamp: string
    }[]
}

function GlassSelector({ options, value, onChange }: { options: {value: string, label: string, desc?: string}[], value: string, onChange: (v: string) => void }) {
    const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    // bubble tracks hoveredIdx when set, otherwise tracks selected option
    const [bubbleStyle, setBubbleStyle] = useState<{ transform: string; width: string; opacity: number }>({
        transform: 'translateX(0px)',
        width: '0px',
        opacity: 0,
    });

    useEffect(() => {
        if (!containerRef.current) return;
        // Determine which option the bubble should rest on:
        // - If mouse is hovering → follow the hovered option
        // - Otherwise → rest on the currently selected option
        const selectedIdx = options.findIndex(o => o.value === value);
        const targetIdx = hoveredIdx !== null ? hoveredIdx : selectedIdx;

        if (targetIdx === -1) {
            setBubbleStyle(prev => ({ ...prev, opacity: 0 }));
            return;
        }

        const buttons = containerRef.current.querySelectorAll('button');
        const target = buttons[targetIdx] as HTMLButtonElement | undefined;
        if (target) {
            setBubbleStyle({
                transform: `translateX(${target.offsetLeft}px)`,
                width: `${target.offsetWidth}px`,
                // Always visible — on selected when no hover, on hovered when hovering
                opacity: 1,
            });
        }
    }, [hoveredIdx, value, options]);

    // Re-measure on mount so the bubble positions correctly after layout
    useEffect(() => {
        if (!containerRef.current) return;
        const selectedIdx = options.findIndex(o => o.value === value);
        if (selectedIdx === -1) return;
        const buttons = containerRef.current.querySelectorAll('button');
        const target = buttons[selectedIdx] as HTMLButtonElement | undefined;
        if (target) {
            setBubbleStyle({
                transform: `translateX(${target.offsetLeft}px)`,
                width: `${target.offsetWidth}px`,
                opacity: 1,
            });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div
            className="settings-container"
            ref={containerRef}
            onMouseLeave={() => setHoveredIdx(null)}
        >
            <div className="glass-bubble" style={bubbleStyle} />
            {options.map((opt, i) => (
                <button
                    key={opt.value}
                    onClick={() => onChange(opt.value)}
                    onMouseEnter={() => setHoveredIdx(i)}
                    title={opt.desc}
                    className={`settings-pill settings-pill-option flex h-9 items-center justify-center transition-colors ${
                        value === opt.value
                            ? 'settings-pill-active font-semibold'
                            : 'text-neutral-500 hover:text-neutral-900'
                    }`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    )
}

// ── Settings toggle helper ──
function ToggleRow({ label, description, checked, onChange, disabled }: {
    label: string; description?: string; checked: boolean; onChange?: (v: boolean) => void; disabled?: boolean
}) {
    return (
        <div className={`flex items-center justify-between py-3 border-b border-neutral-100 last:border-0 ${disabled ? 'opacity-50' : ''}`}>
            <div>
                <p className="text-body font-medium text-neutral-900">{label}</p>
                {description && <p className="text-caption text-neutral-500 mt-0.5">{description}</p>}
            </div>
            {disabled ? (
                <span className="text-caption px-2 py-1 bg-neutral-100 rounded text-neutral-500">Not available</span>
            ) : (
                <button
                    role="switch"
                    aria-checked={checked}
                    onClick={() => onChange?.(!checked)}
                    className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                        checked ? 'bg-neutral-900' : 'bg-neutral-200'
                    }`}
                >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                        checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
                    }`} />
                </button>
            )}
        </div>
    )
}

function SettingsWorkspace({ user, onRefreshUser }: { user?: any; onRefreshUser?: () => void }) {
    const {
        fontSize, setFontSize,
        density, setDensity,
        landingSection, setLandingSection,
        theme, setTheme, resolvedTheme,
        reduceMotion, setReduceMotion,
        largerTargets, setLargerTargets,
        highContrast, setHighContrast,
        navConfig, setNavConfig,
        notificationPrefs, setNotificationPrefs,
        workspaceName, setWorkspaceName,
    } = usePreferences()
    const { t } = useTranslation()
    const [activeTab, setActiveTab] = useState("appearance")
    const [showPasswordModal, setShowPasswordModal] = useState(false)
    const [currentPassword, setCurrentPassword] = useState("")
    const [newPassword, setNewPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [passwordLoading, setPasswordLoading] = useState(false)
    const [passwordError, setPasswordError] = useState<string | null>(null)
    const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null)

    // Profile state
    const [editFullName, setEditFullName] = useState(user?.full_name || "")
    const [profileLoading, setProfileLoading] = useState(false)
    const [profileSuccess, setProfileSuccess] = useState<string | null>(null)
    const [profileError, setProfileError] = useState<string | null>(null)

    useEffect(() => {
        if (user?.full_name) {
            setEditFullName(user.full_name)
        }
    }, [user?.full_name])

    const handleSaveProfile = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        setProfileError(null)
        setProfileSuccess(null)
        const trimmed = editFullName.trim()
        if (!trimmed) {
            setProfileError("Full Name cannot be empty.")
            return
        }

        const token = localStorage.getItem("access_token") ?? ""
        setProfileLoading(true)
        try {
            const res = await fetch("http://127.0.0.1:8000/api/v1/auth/profile", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ full_name: trimmed })
            })
            const data = await res.json()
            if (!res.ok) {
                setProfileError(data.detail || "Failed to update profile.")
                return
            }
            setProfileSuccess("Profile updated successfully.")
            if (onRefreshUser) {
                onRefreshUser()
            }
            setTimeout(() => setProfileSuccess(null), 3000)
        } catch {
            setProfileError("Network error. Please try again.")
        } finally {
            setProfileLoading(false)
        }
    }

    // 2FA state
    const [mfaEnabled, setMfaEnabled] = useState<boolean>(user?.mfa_enabled ?? false)
    const [showSetup2FAModal, setShowSetup2FAModal] = useState(false)
    const [setupSecret, setSetupSecret] = useState("")
    const [setupUri, setSetupUri] = useState("")
    const [setupCode, setSetupCode] = useState("")
    const [setupLoading, setSetupLoading] = useState(false)
    const [setupSubmitting, setSetupSubmitting] = useState(false)
    const [setupError, setSetupError] = useState<string | null>(null)
    const [setupSuccess, setSetupSuccess] = useState<string | null>(null)
    const [copiedSecret, setCopiedSecret] = useState(false)
    const [copiedUri, setCopiedUri] = useState(false)

    const [showDisable2FAModal, setShowDisable2FAModal] = useState(false)
    const [disablePassword, setDisablePassword] = useState("")
    const [disableCode, setDisableCode] = useState("")
    const [disableLoading, setDisableLoading] = useState(false)
    const [disableError, setDisableError] = useState<string | null>(null)
    const [disableSuccess, setDisableSuccess] = useState<string | null>(null)

    // Workspace state
    const [localWorkspaceName, setLocalWorkspaceName] = useState("")
    const [workspaceNameSuccess, setWorkspaceNameSuccess] = useState(false)
    const [workspaceNameError, setWorkspaceNameError] = useState<string | null>(null)
    const [workspaceMetrics, setWorkspaceMetrics] = useState<any>(null)
    const [metricsLoading, setMetricsLoading] = useState(false)
    const [metricsError, setMetricsError] = useState(false)

    // Phone linking state
    const [showPhoneModal, setShowPhoneModal] = useState(false)
    const [phoneStep, setPhoneStep] = useState<1 | 2>(1)
    const [phoneNumber, setPhoneNumber] = useState("")
    const [phoneCode, setPhoneCode] = useState("")
    const [phoneLoading, setPhoneLoading] = useState(false)
    const [phoneError, setPhoneError] = useState<string | null>(null)
    const [phoneCooldown, setPhoneCooldown] = useState(0)

    // Email verification state
    const [showEmailModal, setShowEmailModal] = useState(false)
    const [emailStep, setEmailStep] = useState<1 | 2>(1)
    const [emailCode, setEmailCode] = useState("")
    const [emailLoading, setEmailLoading] = useState(false)
    const [emailError, setEmailError] = useState<string | null>(null)
    const [emailCooldown, setEmailCooldown] = useState(0)

    // Storage state
    const [storageDocuments, setStorageDocuments] = useState<any[]>([])
    const [storageLoading, setStorageLoading] = useState(false)
    const [storageError, setStorageError] = useState(false)
    const [documentToDelete, setDocumentToDelete] = useState<any | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [deleteError, setDeleteError] = useState<string | null>(null)
    const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null)

    // Data Export state
    const [exportLoading, setExportLoading] = useState(false)
    const [exportError, setExportError] = useState<string | null>(null)
    const [exportSuccess, setExportSuccess] = useState<string | null>(null)

    useEffect(() => {
        if (phoneCooldown > 0) {
            const timer = setTimeout(() => setPhoneCooldown(c => c - 1), 1000)
            return () => clearTimeout(timer)
        }
    }, [phoneCooldown])

    useEffect(() => {
        if (emailCooldown > 0) {
            const timer = setTimeout(() => setEmailCooldown(c => c - 1), 1000)
            return () => clearTimeout(timer)
        }
    }, [emailCooldown])

    const handlePhoneSend = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        setPhoneError(null)

        if (!phoneNumber) {
            setPhoneError("Phone number is required.")
            return
        }

        const token = localStorage.getItem("access_token") ?? ""
        setPhoneLoading(true)

        try {
            const res = await fetch("http://127.0.0.1:8000/api/v1/auth/phone/link/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ phone_number: phoneNumber })
            })
            const data = await res.json()
            if (!res.ok) {
                if (res.status === 409) {
                    setPhoneError("This phone number is already linked to another account.")
                } else if (res.status === 429) {
                    setPhoneError(data.detail || "Too many requests. Please try again later.")
                } else {
                    setPhoneError(data.detail || "Failed to send verification code.")
                }
                return
            }
            setPhoneStep(2)
            setPhoneCooldown(60)
        } catch {
            setPhoneError("Network error. Please try again.")
        } finally {
            setPhoneLoading(false)
        }
    }

    const handlePhoneVerify = async (e: React.FormEvent) => {
        e.preventDefault()
        setPhoneError(null)

        const cleanedCode = phoneCode.trim()
        if (cleanedCode.length !== 6 || !/^\d+$/.test(cleanedCode)) {
            setPhoneError("Please enter a valid 6-digit verification code.")
            return
        }

        const token = localStorage.getItem("access_token") ?? ""
        setPhoneLoading(true)

        try {
            const res = await fetch("http://127.0.0.1:8000/api/v1/auth/phone/link/verify", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ phone_number: phoneNumber, code: cleanedCode })
            })
            const data = await res.json()
            if (!res.ok) {
                if (res.status === 409) {
                    setPhoneError("This phone number is already linked to another account.")
                } else {
                    setPhoneError(data.detail || "Invalid verification code.")
                }
                return
            }

            if (onRefreshUser) {
                onRefreshUser()
            }
            setShowPhoneModal(false)
        } catch {
            setPhoneError("Network error. Please try again.")
        } finally {
            setPhoneLoading(false)
        }
    }

    const handleEmailSend = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        setEmailError(null)

        const token = localStorage.getItem("access_token") ?? ""
        setEmailLoading(true)

        try {
            const res = await fetch("http://127.0.0.1:8000/api/v1/auth/email-otp/verify-account/send", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                }
            })
            const data = await res.json()
            if (!res.ok) {
                if (res.status === 400) {
                    setEmailError(data.detail || "Email cannot be verified.")
                } else if (res.status === 429) {
                    setEmailError(data.detail || "Too many requests. Please try again later.")
                } else {
                    setEmailError(data.detail || "Failed to send verification code.")
                }
                return
            }
            setEmailStep(2)
            setEmailCooldown(60)
        } catch {
            setEmailError("Network error. Please try again.")
        } finally {
            setEmailLoading(false)
        }
    }

    const handleEmailVerify = async (e: React.FormEvent) => {
        e.preventDefault()
        setEmailError(null)

        const cleanedCode = emailCode.trim()
        if (cleanedCode.length !== 6 || !/^\d+$/.test(cleanedCode)) {
            setEmailError("Please enter a valid 6-digit verification code.")
            return
        }

        const token = localStorage.getItem("access_token") ?? ""
        setEmailLoading(true)

        try {
            const res = await fetch("http://127.0.0.1:8000/api/v1/auth/email-otp/verify-account/verify", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ code: cleanedCode })
            })
            const data = await res.json()
            if (!res.ok) {
                setEmailError(data.detail || "Invalid verification code.")
                return
            }

            if (onRefreshUser) {
                onRefreshUser()
            }
            setShowEmailModal(false)
        } catch {
            setEmailError("Network error. Please try again.")
        } finally {
            setEmailLoading(false)
        }
    }

    // Fetch storage documents
    useEffect(() => {
        if (activeTab === "storage") {
            const fetchDocuments = async () => {
                setStorageLoading(true)
                setStorageError(false)
                try {
                    const token = localStorage.getItem("access_token")
                    const res = await fetch("http://127.0.0.1:8000/api/v1/documents/", {
                        headers: { Authorization: `Bearer ${token}` }
                    })
                    if (!res.ok) throw new Error()
                    const data = await res.json()
                    setStorageDocuments(data.items || [])
                } catch {
                    setStorageError(true)
                } finally {
                    setStorageLoading(false)
                }
            }
            fetchDocuments()
        }
    }, [activeTab])

    const handleDeleteDocument = async () => {
        if (!documentToDelete) return
        setDeleteError(null)
        setDeleteSuccess(null)
        setDeleteLoading(true)

        try {
            const token = localStorage.getItem("access_token")
            const res = await fetch(`http://127.0.0.1:8000/api/v1/documents/${documentToDelete.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            })

            if (!res.ok) {
                if (res.status === 401) {
                    setDeleteError("Authentication error. Please log in again.")
                } else if (res.status === 404) {
                    setDeleteError("Document no longer exists.")
                } else {
                    setDeleteError("Failed to delete document.")
                }
                return
            }

            setDeleteSuccess(t("settings.storage.documents.deletedSuccess"))
            setStorageDocuments(prev => prev.filter(d => d.id !== documentToDelete.id))
            setDocumentToDelete(null)

            setTimeout(() => setDeleteSuccess(null), 3000)
        } catch {
            setDeleteError("Network error. Please try again.")
        } finally {
            setDeleteLoading(false)
        }
    }

    const handleExportData = async () => {
        setExportError(null)
        setExportSuccess(null)
        setExportLoading(true)

        try {
            const token = localStorage.getItem("access_token")
            const res = await fetch("http://127.0.0.1:8000/api/v1/data/export", {
                headers: { Authorization: `Bearer ${token}` }
            })

            if (!res.ok) {
                setExportError("Failed to export data. Please try again.")
                return
            }

            const blob = await res.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = `opuslex_export_${new Date().toISOString().split('T')[0]}.json`
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
            document.body.removeChild(a)

            setExportSuccess("Data exported successfully.")
            setTimeout(() => setExportSuccess(null), 3000)
        } catch {
            setExportError("Network error. Please try again.")
        } finally {
            setExportLoading(false)
        }
    }

    // Sync 2FA status
    useEffect(() => {
        const fetchMFAStatus = async () => {
            const token = localStorage.getItem("access_token")
            if (!token) return
            try {
                const res = await fetch("http://127.0.0.1:8000/api/v1/auth/2fa/status", {
                    headers: { Authorization: `Bearer ${token}` }
                })
                if (res.ok) {
                    const data = await res.json()
                    setMfaEnabled(data.mfa_enabled)
                }
            } catch {
                // Ignore sync error
            }
        }
        fetchMFAStatus()
    }, [activeTab])

    useEffect(() => {
        if (activeTab === "workspace") {
            // Workspace Name logic
            const defaultName = user?.full_name ? `${user.full_name}'s Workspace` : "My OpusLex Workspace"
            setLocalWorkspaceName(workspaceName || defaultName)
            if (!workspaceName) {
                setWorkspaceName(defaultName)
            }

            // Fetch usage metrics
            const fetchMetrics = async () => {
                setMetricsLoading(true)
                setMetricsError(false)
                const token = localStorage.getItem("access_token")
                if (!token) {
                    setMetricsLoading(false)
                    return
                }
                try {
                    const res = await fetch("http://127.0.0.1:8000/api/v1/workspace/overview", {
                        headers: { Authorization: `Bearer ${token}` }
                    })
                    if (res.ok) {
                        setWorkspaceMetrics(await res.json())
                    } else {
                        if (res.status === 401) {
                            localStorage.removeItem("access_token")
                        }
                        setMetricsError(true)
                    }
                } catch {
                    setMetricsError(true)
                } finally {
                    setMetricsLoading(false)
                }
            }
            fetchMetrics()
        }
    }, [activeTab, user?.full_name])

    const handleStart2FASetup = async () => {
        setShowSetup2FAModal(true)
        setSetupError(null)
        setSetupSuccess(null)
        setSetupCode("")
        setCopiedSecret(false)
        setCopiedUri(false)
        setSetupLoading(true)

        const token = localStorage.getItem("access_token") ?? ""
        try {
            const res = await fetch("http://127.0.0.1:8000/api/v1/auth/2fa/setup", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                }
            })
            const data = await res.json()
            if (!res.ok) {
                setSetupError(data.detail || "Failed to initiate 2FA setup.")
                return
            }
            setSetupSecret(data.secret)
            setSetupUri(data.provisioning_uri)
        } catch {
            setSetupError("Network error. Please try again.")
        } finally {
            setSetupLoading(false)
        }
    }

    const handleEnable2FA = async (e: React.FormEvent) => {
        e.preventDefault()
        setSetupError(null)
        setSetupSuccess(null)

        const cleanedCode = setupCode.trim()
        if (cleanedCode.length !== 6 || !/^\d+$/.test(cleanedCode)) {
            setSetupError("Please enter a valid 6-digit verification code.")
            return
        }

        const token = localStorage.getItem("access_token") ?? ""
        setSetupSubmitting(true)

        try {
            const res = await fetch("http://127.0.0.1:8000/api/v1/auth/2fa/enable", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ code: cleanedCode })
            })
            const data = await res.json()
            if (!res.ok) {
                setSetupError(data.detail || "Failed to verify 2FA code.")
                return
            }
            setMfaEnabled(true)
            setSetupSuccess("Two-factor authentication enabled successfully.")
            try {
                const storedUser = localStorage.getItem("current_user")
                if (storedUser) {
                    const parsed = JSON.parse(storedUser)
                    parsed.mfa_enabled = true
                    localStorage.setItem("current_user", JSON.stringify(parsed))
                }
            } catch {
                // Ignore localStorage parsing error
            }
        } catch {
            setSetupError("Network error. Please try again.")
        } finally {
            setSetupSubmitting(false)
        }
    }

    const handleDisable2FA = async (e: React.FormEvent) => {
        e.preventDefault()
        setDisableError(null)
        setDisableSuccess(null)

        if (!disablePassword) {
            setDisableError("Current password is required.")
            return
        }
        const cleanedCode = disableCode.trim()
        if (cleanedCode.length !== 6 || !/^\d+$/.test(cleanedCode)) {
            setDisableError("Please enter a valid 6-digit authentication code.")
            return
        }

        const token = localStorage.getItem("access_token") ?? ""
        setDisableLoading(true)

        try {
            const res = await fetch("http://127.0.0.1:8000/api/v1/auth/2fa/disable", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    password: disablePassword,
                    code: cleanedCode
                })
            })
            const data = await res.json()
            if (!res.ok) {
                setDisableError(data.detail || "Failed to disable 2FA.")
                return
            }
            setMfaEnabled(false)
            setDisableSuccess("Two-factor authentication disabled successfully.")
            try {
                const storedUser = localStorage.getItem("current_user")
                if (storedUser) {
                    const parsed = JSON.parse(storedUser)
                    parsed.mfa_enabled = false
                    localStorage.setItem("current_user", JSON.stringify(parsed))
                }
            } catch {
                // Ignore localStorage parsing error
            }
        } catch {
            setDisableError("Network error. Please try again.")
        } finally {
            setDisableLoading(false)
        }
    }

    const handlePasswordChange = async (e: React.FormEvent) => {
        e.preventDefault()
        setPasswordError(null)
        setPasswordSuccess(null)

        if (!currentPassword) {
            setPasswordError("Current password is required.")
            return
        }
        if (newPassword.length < 8) {
            setPasswordError("New password must be at least 8 characters.")
            return
        }
        if (newPassword === currentPassword) {
            setPasswordError("New password must be different from the current password.")
            return
        }
        if (newPassword !== confirmPassword) {
            setPasswordError("New passwords do not match.")
            return
        }

        const token = localStorage.getItem("access_token") ?? ""
        setPasswordLoading(true)

        try {
            const res = await fetch("http://127.0.0.1:8000/api/v1/auth/change-password", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    current_password: currentPassword,
                    new_password: newPassword
                })
            })

            const data = await res.json()

            if (!res.ok) {
                setPasswordError(data.detail || "Failed to change password.")
                return
            }

            setPasswordSuccess("Password changed successfully.")
            setCurrentPassword("")
            setNewPassword("")
            setConfirmPassword("")
        } catch {
            setPasswordError("Network error. Please try again.")
        } finally {
            setPasswordLoading(false)
        }
    }

    const sizes: { value: FontSize; label: string; desc: string }[] = [
        { value: "xs", label: "XS", desc: "Compact" },
        { value: "s",  label: "S",  desc: "Small" },
        { value: "m",  label: "M",  desc: "Default" },
        { value: "l",  label: "L",  desc: "Large" },
        { value: "xl", label: "XL", desc: "Extra Large" },
    ]

    const landingOptions: { value: LandingSection; label: string }[] = [
        { value: "home",            label: t("nav.home") },
        { value: "research",        label: t("nav.research") },
        { value: "investigations",  label: t("nav.investigations") },
        { value: "agents",          label: t("nav.agents") },
        { value: "audit",           label: t("nav.audit") },
        { value: "governance",      label: t("nav.governance") },
    ]

    const densityOptions: { value: Density; label: string; desc: string }[] = [
        { value: "comfortable", label: "Comfortable", desc: "More breathing room" },
        { value: "compact",     label: "Compact",     desc: "Tighter, denser layout" },
    ]

    const themeOptions: { value: ThemeMode; label: string; desc: string }[] = [
        { value: "light", label: t("settings.appearance.theme.light"), desc: t("settings.appearance.theme.lightDesc") },
        { value: "dark",  label: t("settings.appearance.theme.dark"),  desc: t("settings.appearance.theme.darkDesc") },
        { value: "auto",  label: t("settings.appearance.theme.auto"),  desc: t("settings.appearance.theme.autoDesc") },
    ]

    const categories = [
        {
            title: "GENERAL",
            items: [
                { id: "general",       label: "General" },
                { id: "appearance",    label: "Appearance" },
                { id: "accessibility", label: "Accessibility" },
                { id: "language",      label: "Language" },
                { id: "assistant",     label: "AI Assistant" }
            ]
        },
        {
            title: "WORKSPACE",
            items: [
                { id: "workspace",     label: "Workspace" },
                { id: "navigation",    label: "Navigation" },
                { id: "notifications", label: "Notifications" }
            ]
        },
        {
            title: "ACCOUNT",
            items: [
                { id: "profile",  label: "Profile" },
                { id: "security", label: "Security & Login" }
            ]
        },
        {
            title: "DATA & PRIVACY",
            items: [
                { id: "data",    label: "Data Controls" },
                { id: "storage", label: "Storage" },
                { id: "privacy", label: "Privacy" }
            ]
        },
        {
            title: "ADVANCED",
            items: [{ id: "advanced", label: "Advanced" }]
        }
    ]

    const allConfigured = ["appearance", "general", "accessibility", "notifications", "profile", "security", "data", "storage", "language", "privacy", "advanced", "assistant"]

    return (
        <div className="flex h-[calc(100vh-4rem)] max-w-5xl mx-auto py-6">
            {/* Settings Sidebar */}
            <div className="w-60 pr-6 border-r border-neutral-200 overflow-y-auto shrink-0">
                <h2 className="text-heading font-semibold text-neutral-900 mb-6 pl-2">{t("settings.title")}</h2>
                <div className="space-y-5">
                    {categories.map((category) => (
                        <div key={category.title}>
                            <h3 className="px-2 text-caption font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">
                                {category.title}
                            </h3>
                            <nav className="flex flex-col gap-0.5">
                                {category.items.map(item => (
                                    <button
                                        key={item.id}
                                        onClick={() => setActiveTab(item.id)}
                                        className={`flex items-center px-3 py-2 rounded-lg text-body transition-colors text-left w-full ${
                                            activeTab === item.id
                                                ? "bg-neutral-100 text-neutral-900 font-medium"
                                                : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900"
                                        }`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </nav>
                        </div>
                    ))}
                </div>
            </div>

            {/* Settings Content */}
            <div className="flex-1 pl-10 overflow-y-auto">
                <div className="max-w-xl">

                    {/* ── APPEARANCE ── */}
                    {activeTab === "appearance" && (
                        <>
                            <SettingsHeader title={t("settings.appearance.headerTitle")} sub={t("settings.appearance.headerSub")} />
                            <SettingsSection title={t("settings.appearance.fontSize.title")} description={t("settings.appearance.fontSize.description")}>
                                <GlassSelector
                                    options={sizes}
                                    value={fontSize}
                                    onChange={setFontSize as (v: string) => void}
                                />
                                <p className="text-caption text-neutral-400 mt-2">
                                    {t("settings.appearance.fontSize.current")} {sizes.find(s => s.value === fontSize)?.desc}
                                </p>
                            </SettingsSection>

                            <SettingsSection title={t("settings.appearance.density.title")} description={t("settings.appearance.density.description")}>
                                <GlassSelector
                                    options={densityOptions}
                                    value={density}
                                    onChange={setDensity as (v: string) => void}
                                />
                            </SettingsSection>

                            <SettingsSection title={t("settings.appearance.theme.title")} description={t("settings.appearance.theme.description")}>
                                <GlassSelector
                                    options={themeOptions}
                                    value={theme}
                                    onChange={setTheme as (v: string) => void}
                                />
                                <p className="text-caption text-neutral-400 mt-2">
                                    {theme === "auto"
                                        ? `${t("settings.appearance.theme.autoDescription")} (${resolvedTheme === "dark" ? t("settings.appearance.theme.dark") : t("settings.appearance.theme.light")})`
                                        : themeOptions.find(o => o.value === theme)?.desc}
                                </p>
                            </SettingsSection>
                        </>
                    )}

                    {/* ── GENERAL ── */}
                    {activeTab === "general" && (
                        <>
                            <SettingsHeader title={t("settings.general.headerTitle")} sub={t("settings.general.headerSub")} />
                            <SettingsSection title={t("settings.general.landing.title")} description={t("settings.general.landing.description")}>
                                <div className="flex flex-col gap-1.5">
                                    {landingOptions.map((opt) => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setLandingSection(opt.value)}
                                            className={`settings-pill flex items-center justify-between px-4 py-3 ${
                                                landingSection === opt.value
                                                    ? "settings-pill-active"
                                                    : ""
                                            }`}
                                        >
                                            <span>{opt.label}</span>
                                            {landingSection === opt.value && (
                                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                                                </svg>
                                            )}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-caption text-neutral-400 mt-2">{t("settings.general.landing.takesEffect")}</p>
                            </SettingsSection>
                        </>
                    )}

                    {/* ── ACCESSIBILITY ── */}
                    {activeTab === "accessibility" && (
                        <>
                            <SettingsHeader title={t("settings.accessibility.headerTitle")} sub={t("settings.accessibility.headerSub")} />
                            <div className="rounded-xl border border-neutral-200 bg-white px-4">
                                <ToggleRow
                                    label={t("settings.accessibility.reduceMotion.label")}
                                    description={t("settings.accessibility.reduceMotion.description")}
                                    checked={reduceMotion}
                                    onChange={setReduceMotion}
                                />
                                <ToggleRow
                                    label={t("settings.accessibility.largerTargets.label")}
                                    description={t("settings.accessibility.largerTargets.description")}
                                    checked={largerTargets}
                                    onChange={setLargerTargets}
                                />
                                <ToggleRow
                                    label={t("settings.accessibility.highContrast.label")}
                                    description={t("settings.accessibility.highContrast.description")}
                                    checked={highContrast}
                                    onChange={setHighContrast}
                                />
                            </div>
                            <p className="text-caption text-neutral-400 mt-3">
                                {t("settings.accessibility.osPreference")}
                            </p>
                        </>
                    )}

                    {/* ── LANGUAGE ── */}
                    {activeTab === "language" && (
                        <>
                            <SettingsHeader title={t("settings.language.headerTitle")} sub={t("settings.language.headerSub")} />
                            <LanguageSelector />
                        </>
                    )}

                    {/* ── AI ASSISTANT ── */}
                    {activeTab === "assistant" && (
                        <>
                            <SettingsHeader title={t("settings.assistant.headerTitle", "AI Assistant")} sub={t("settings.assistant.headerSub", "Configure AI Assistant voice, shortcuts, and permissions.")} />
                            <AssistantSettingsTab />
                        </>
                    )}

                    {/* ── WORKSPACE ── */}
                    {activeTab === "workspace" && (
                        <>
                            <SettingsHeader title={t("settings.workspace.headerTitle")} sub={t("settings.workspace.headerSub")} />
                            <SettingsSection title={t("settings.workspace.identity.title")} description={t("settings.workspace.identity.description")}>
                                <div className="space-y-4">
                                    <div>
                                        <label htmlFor="workspaceName" className="block text-body font-medium text-neutral-900 mb-1.5">{t("settings.workspace.identity.nameLabel")}</label>
                                        <div className="flex gap-2">
                                            <input
                                                id="workspaceName"
                                                type="text"
                                                maxLength={100}
                                                value={localWorkspaceName}
                                                onChange={(e) => {
                                                    setLocalWorkspaceName(e.target.value)
                                                    setWorkspaceNameSuccess(false)
                                                    setWorkspaceNameError(null)
                                                }}
                                                className="flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-body focus:border-neutral-400 focus:outline-none focus:ring-1 focus:ring-neutral-400"
                                            />
                                            <button
                                                onClick={() => {
                                                    const trimmed = localWorkspaceName.trim()
                                                    if (!trimmed) {
                                                        setWorkspaceNameError(t("settings.workspace.identity.emptyError"))
                                                        return
                                                    }
                                                    setLocalWorkspaceName(trimmed)
                                                    setWorkspaceName(trimmed)
                                                    setWorkspaceNameSuccess(true)
                                                    setTimeout(() => setWorkspaceNameSuccess(false), 2000)
                                                }}
                                                className="rounded-lg bg-neutral-900 px-4 py-2 text-body font-medium text-white transition hover:bg-neutral-800"
                                            >
                                                {workspaceNameSuccess ? t("settings.workspace.identity.saved") : t("settings.workspace.identity.save")}
                                            </button>
                                        </div>
                                        {workspaceNameError && <p className="text-caption text-red-600 mt-1">{workspaceNameError}</p>}
                                    </div>
                                    {user?.role && (
                                        <div className="pt-2 border-t border-neutral-100">
                                            <p className="text-body font-medium text-neutral-900">OpusLex Workspace Account</p>
                                            <p className="text-caption text-neutral-500">Role: {user.role.charAt(0).toUpperCase() + user.role.slice(1)}</p>
                                        </div>
                                    )}
                                </div>
                            </SettingsSection>

                            <SettingsSection title={t("settings.workspace.usage.title")} description={t("settings.workspace.usage.description")}>
                                {metricsLoading ? (
                                    <p className="text-body text-neutral-500">{t("settings.workspace.usage.loading")}</p>
                                ) : metricsError ? (
                                    <p className="text-body text-red-600">{t("settings.workspace.usage.error")}</p>
                                ) : workspaceMetrics ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <div className="rounded-xl border border-neutral-200 bg-white p-3">
                                            <p className="text-caption text-neutral-500">{t("settings.workspace.usage.documents")}</p>
                                            <p className="text-2xl font-semibold text-neutral-900 mt-1">{workspaceMetrics.metrics.total_documents}</p>
                                        </div>
                                        <div className="rounded-xl border border-neutral-200 bg-white p-3">
                                            <p className="text-caption text-neutral-500">{t("settings.workspace.usage.investigations")}</p>
                                            <p className="text-2xl font-semibold text-neutral-900 mt-1">{workspaceMetrics.metrics.active_investigations}</p>
                                        </div>
                                        <div className="rounded-xl border border-neutral-200 bg-white p-3">
                                            <p className="text-caption text-neutral-500">{t("settings.workspace.usage.agentRuns")}</p>
                                            <p className="text-2xl font-semibold text-neutral-900 mt-1">{workspaceMetrics.metrics.total_agent_runs}</p>
                                        </div>
                                    </div>
                                ) : null}
                            </SettingsSection>

                            <SettingsSection title={t("settings.workspace.activeEnv.title")} description={t("settings.workspace.activeEnv.description")}>
                                <p className="text-body text-neutral-600">{t("settings.workspace.activeEnv.defaultLanding")} <button onClick={() => setActiveTab("general")} className="underline font-medium">{t("settings.workspace.activeEnv.generalLink")}</button>.</p>
                            </SettingsSection>
                        </>
                    )}

                    {activeTab === "navigation" && (
                        <>
                            <SettingsHeader title="Navigation" sub="Configure sidebar navigation options." />
                            <div className="rounded-xl border border-neutral-200 bg-white p-2 sm:p-4 space-y-2">
                                {(() => {
                                    let conf = navConfig || BASE_NAVIGATION.map(n => ({ id: n.id, hidden: false }))
                                    const missing = BASE_NAVIGATION.filter(n => !conf.find(c => c.id === n.id))
                                    if (missing.length > 0) {
                                        conf = [...conf, ...missing.map(n => ({ id: n.id, hidden: false }))]
                                    }

                                    return conf.map((itemConfig, index, arr) => {
                                        const navItem = BASE_NAVIGATION.find(n => n.id === itemConfig.id)
                                        if (!navItem) return null
                                        return (
                                            <div key={navItem.id} className={`flex items-center justify-between p-2 sm:p-3 rounded-lg border ${itemConfig.hidden ? 'border-dashed border-neutral-200 opacity-60 bg-neutral-50' : 'border-neutral-200 bg-white'}`}>
                                                <div className="flex items-center gap-3">
                                                    <div className="text-neutral-400">{navItem.icon}</div>
                                                    <span className={`text-body font-medium ${itemConfig.hidden ? 'text-neutral-400' : 'text-neutral-900'}`}>{navItem.label}</span>
                                                </div>
                                                <div className="flex items-center gap-1 sm:gap-2">
                                                    <button
                                                        disabled={index === 0}
                                                        onClick={() => {
                                                            const newArr = [...arr]
                                                            const temp = newArr[index - 1]
                                                            newArr[index - 1] = newArr[index]
                                                            newArr[index] = temp
                                                            setNavConfig(newArr)
                                                        }}
                                                        className="p-1.5 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200 disabled:opacity-30 disabled:hover:bg-neutral-100"
                                                        aria-label={`Move ${navItem.label} up`}
                                                    >
                                                        ↑
                                                    </button>
                                                    <button
                                                        disabled={index === arr.length - 1}
                                                        onClick={() => {
                                                            const newArr = [...arr]
                                                            const temp = newArr[index + 1]
                                                            newArr[index + 1] = newArr[index]
                                                            newArr[index] = temp
                                                            setNavConfig(newArr)
                                                        }}
                                                        className="p-1.5 rounded bg-neutral-100 text-neutral-600 hover:bg-neutral-200 disabled:opacity-30 disabled:hover:bg-neutral-100"
                                                        aria-label={`Move ${navItem.label} down`}
                                                    >
                                                        ↓
                                                    </button>
                                                    {navItem.id !== "home" ? (
                                                        <button
                                                            onClick={() => {
                                                                const newArr = [...arr]
                                                                newArr[index] = { ...newArr[index], hidden: !itemConfig.hidden }
                                                                setNavConfig(newArr)
                                                            }}
                                                            className={`ml-1 sm:ml-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded text-xs font-medium ${itemConfig.hidden ? 'bg-neutral-900 text-white hover:bg-neutral-800' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                                                        >
                                                            {itemConfig.hidden ? 'Show' : 'Hide'}
                                                        </button>
                                                    ) : (
                                                        <span className="ml-1 sm:ml-2 px-2 sm:px-3 py-1 sm:py-1.5 text-xs text-neutral-400 font-medium">Required</span>
                                                    )}
                                                </div>
                                            </div>
                                        )
                                    })
                                })()}
                            </div>
                            {navConfig !== null && (
                                <div className="mt-4 flex justify-end">
                                    <button
                                        onClick={() => setNavConfig(null)}
                                        className="text-sm font-medium text-neutral-500 hover:text-neutral-900 underline"
                                    >
                                        Reset to default navigation
                                    </button>
                                </div>
                            )}
                        </>
                    )}

                    {/* ── NOTIFICATIONS ── */}
                    {activeTab === "notifications" && (
                        <>
                            <SettingsHeader title="Notifications" sub="Manage how you receive updates and alerts." />
                            <div className="rounded-xl border border-neutral-200 bg-white p-4">
                                <p className="text-body text-neutral-500 mb-6">Preferences are saved locally. Automatic email delivery is a pending backend integration.</p>
                                <div className="space-y-6">
                                    {[
                                        { id: "security", label: "Security & Account", desc: "Password changes, logins, and security events." },
                                        { id: "investigation", label: "Investigations", desc: "Updates on your legal and compliance investigations." },
                                        { id: "agent_run", label: "AI Agents", desc: "Alerts when autonomous agents complete their runs." },
                                        { id: "knowledge", label: "Compliance & Knowledge", desc: "New documents, findings, and regulatory updates." }
                                    ].map(({ id, label, desc }) => {
                                        const cat = id as NotificationCategory
                                        const isSecurity = cat === "security"
                                        return (
                                            <div key={id} className="flex flex-col sm:flex-row sm:items-center justify-between py-2 border-b border-neutral-100 last:border-0 gap-4">
                                                <div>
                                                    <h4 className="text-body font-medium text-neutral-900">{label}</h4>
                                                    <p className="text-sm text-neutral-500">{desc}</p>
                                                </div>
                                                <div className="flex items-center gap-6 shrink-0">
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            disabled={isSecurity}
                                                            checked={notificationPrefs[cat].inApp}
                                                            onChange={(e) => setNotificationPrefs({ ...notificationPrefs, [cat]: { ...notificationPrefs[cat], inApp: e.target.checked } })}
                                                            className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                                                        />
                                                        <span className={`text-sm ${isSecurity ? 'text-neutral-400' : 'text-neutral-700'}`}>In-App</span>
                                                    </label>
                                                    <label className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            disabled={isSecurity}
                                                            checked={notificationPrefs[cat].email}
                                                            onChange={(e) => setNotificationPrefs({ ...notificationPrefs, [cat]: { ...notificationPrefs[cat], email: e.target.checked } })}
                                                            className="rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                                                        />
                                                        <span className={`text-sm ${isSecurity ? 'text-neutral-400' : 'text-neutral-700'}`}>Email</span>
                                                    </label>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── PROFILE ── */}
                    {activeTab === "profile" && (
                        <>
                            <SettingsHeader
                                title="Account Profile"
                                sub="Manage your display name and view workspace credentials."
                            />
                            {profileSuccess && (
                                <div className="p-3 mb-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                                    <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                    <span>{profileSuccess}</span>
                                </div>
                            )}
                            {profileError && (
                                <div className="p-3 mb-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-300 flex items-center gap-2">
                                    <X className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0" />
                                    <span>{profileError}</span>
                                </div>
                            )}
                            <form onSubmit={handleSaveProfile} className="space-y-5">
                                <div>
                                    <label htmlFor="profile-fullname-settings" className="block text-label font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1.5">
                                        Full Name / Display Name
                                    </label>
                                    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                                        <input
                                            id="profile-fullname-settings"
                                            type="text"
                                            value={editFullName}
                                            onChange={(e) => setEditFullName(e.target.value)}
                                            placeholder="Enter your full name"
                                            maxLength={255}
                                            required
                                            className="flex-1 rounded-full border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#1a1a1a] px-4 py-2.5 text-body text-neutral-900 dark:text-white focus:border-[#FBC648] focus:outline-none focus:ring-1 focus:ring-[#FBC648] transition-colors"
                                        />
                                        <button
                                            type="submit"
                                            disabled={profileLoading || editFullName.trim() === (user?.full_name || "")}
                                            className="rounded-full bg-neutral-900 dark:bg-white px-5 py-2.5 text-xs font-semibold text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-40 transition-colors shrink-0"
                                        >
                                            {profileLoading ? "Saving..." : "Save Profile"}
                                        </button>
                                    </div>
                                    <p className="text-caption text-neutral-400 dark:text-neutral-500 mt-1.5">
                                        Your display name appears across workspace navigation, audit log attribution, and investigations.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-label font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1.5">
                                        Email Address (Login Identifier)
                                    </label>
                                    <div className="px-4 py-3 bg-neutral-50 dark:bg-[#171717] border border-neutral-200 dark:border-[#262626] rounded-full text-body text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
                                        <span className="font-mono text-xs">{user?.email || "Not available"}</span>
                                        <span className="text-[11px] font-medium text-neutral-400 dark:text-neutral-500 bg-neutral-200 dark:bg-[#262626] px-2.5 py-0.5 rounded-full">
                                            Permanent ID
                                        </span>
                                    </div>
                                    <p className="text-caption text-neutral-400 dark:text-neutral-500 mt-1.5">
                                        The application uses verified email as the stable primary identifier for account uniqueness and session cryptography.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-label font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1.5">
                                        Role & Access Tier
                                    </label>
                                    <div className="px-4 py-3 bg-neutral-50 dark:bg-[#171717] border border-neutral-200 dark:border-[#262626] rounded-full text-body text-neutral-700 dark:text-neutral-300 flex items-center justify-between">
                                        <span className="capitalize font-medium">{user?.role || "Viewer"}</span>
                                        <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
                                            Assigned by Administrator
                                        </span>
                                    </div>
                                </div>
                            </form>
                        </>
                    )}

                    {/* ── SECURITY ── */}
                    {activeTab === "security" && (
                        <>
                            <SettingsHeader title="Security & Login" sub="Manage your account security settings." />
                            <div className="mb-6 rounded-xl border border-neutral-200 bg-white p-4">
                                <div className="flex items-center gap-3 mb-3">
                                    <div className="h-2 w-2 rounded-full bg-green-500" />
                                    <p className="text-body font-medium text-neutral-900">Authenticated</p>
                                </div>
                                <p className="text-secondary text-neutral-500">{user?.email}</p>
                            </div>
                            <div className="space-y-3">
                                <div className="flex items-center justify-between p-4 rounded-xl border border-neutral-200 bg-white">
                                    <div>
                                        <h4 className="text-body font-medium text-neutral-900">Password</h4>
                                        <p className="text-caption text-neutral-500 mt-0.5">Change your account password.</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (!user?.has_password) return;
                                            setShowPasswordModal(true)
                                            setPasswordError(null)
                                            setPasswordSuccess(null)
                                            setCurrentPassword("")
                                            setNewPassword("")
                                            setConfirmPassword("")
                                        }}
                                        className={`rounded-lg px-3.5 py-1.5 text-xs font-medium text-white transition-colors shrink-0 ml-4 ${
                                            user?.has_password ? "bg-neutral-900 hover:bg-neutral-800" : "bg-neutral-400 cursor-not-allowed"
                                        }`}
                                    >
                                        {user?.has_password ? t("security.action.changePassword") : t("security.action.setPassword")}
                                    </button>
                                </div>
                                <div className="flex items-center justify-between p-4 rounded-xl border border-neutral-200 bg-white">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-body font-medium text-neutral-900">Two-Factor Authentication</h4>
                                            {mfaEnabled ? (
                                                <span className="text-[11px] font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                                                    Enabled
                                                </span>
                                            ) : (
                                                <span className="text-[11px] font-medium px-2 py-0.5 bg-neutral-100 text-neutral-600 rounded">
                                                    Not configured
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-caption text-neutral-500 mt-0.5">Add an extra layer of security using an authenticator app.</p>
                                    </div>
                                    {mfaEnabled ? (
                                        <button
                                            onClick={() => {
                                                setShowDisable2FAModal(true)
                                                setDisableError(null)
                                                setDisableSuccess(null)
                                                setDisablePassword("")
                                                setDisableCode("")
                                            }}
                                            className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors shrink-0 ml-4"
                                        >
                                            Disable 2FA
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleStart2FASetup}
                                            className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 transition-colors shrink-0 ml-4"
                                        >
                                            Set up 2FA
                                        </button>
                                    )}
                                </div>
                                {[
                                    { label: "Google login", desc: "Sign in with Google.", status: user?.google_linked ? t("security.status.linked") : t("security.status.notLinked") },
                                    { label: "Apple login",  desc: "Sign in with Apple.",  status: user?.apple_linked ? t("security.status.linked") : t("security.status.notLinked") },
                                    { label: "Phone number", desc: "Phone verification.",  status: user?.phone_linked ? t("security.status.linked") : t("security.status.notLinked"), action: !user?.phone_linked ? "link_phone" : null, value: user?.phone_number },
                                    { label: "Email",        desc: "Email verification.",  status: user?.email_verified ? t("security.status.verified") : t("security.status.notVerified"), action: user?.email && !user?.email_verified ? "verify_email" : null, value: user?.email },
                                ].map(({ label, desc, status, action, value }) => (
                                    <div key={label} className="flex items-center justify-between p-4 rounded-xl border border-neutral-200 bg-white">
                                        <div>
                                            <h4 className="text-body font-medium text-neutral-900">{label}</h4>
                                            <p className="text-caption text-neutral-500 mt-0.5">{desc}</p>
                                        </div>
                                        <div className="flex items-center gap-4 shrink-0">
                                            {value && user?.phone_linked && label === "Phone number" && (
                                                <span className="text-body text-neutral-500 hidden sm:inline-block">
                                                    {value.slice(0, 3)} ••••••{value.slice(-4)}
                                                </span>
                                            )}
                                            {action === "link_phone" ? (
                                                <button
                                                    onClick={() => {
                                                        setShowPhoneModal(true);
                                                        setPhoneError(null);
                                                        setPhoneNumber("");
                                                        setPhoneCode("");
                                                        setPhoneStep(1);
                                                    }}
                                                    className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 transition-colors shrink-0"
                                                >
                                                    {t("security.action.link_phone", "Link phone number")}
                                                </button>
                                            ) : action === "verify_email" ? (
                                                <button
                                                    onClick={() => {
                                                        setShowEmailModal(true);
                                                        setEmailError(null);
                                                        setEmailCode("");
                                                        setEmailStep(1);
                                                    }}
                                                    className="rounded-lg bg-neutral-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 transition-colors shrink-0"
                                                >
                                                    {t("security.action.verify_email", "Verify email")}
                                                </button>
                                            ) : (
                                                <span className={`text-caption px-2 py-1 rounded shrink-0 ${
                                                    status === t("security.status.linked") || status === t("security.status.verified")
                                                        ? "bg-emerald-100 text-emerald-800 font-semibold"
                                                        : "bg-neutral-100 text-neutral-500"
                                                }`}>{status}</span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* ── DATA CONTROLS ── */}
                    {activeTab === "data" && (
                        <>
                            <SettingsHeader title="Data Controls" sub="How OpusLex handles your data." />
                            <div className="space-y-3">
                                {[
                                    { title: "Document Privacy", body: "Documents are stored securely in the application repository and are not shared with any external parties." },
                                    { title: "Investigation Scoping", body: "Investigation data is scoped to your authenticated user account and role." },
                                    { title: "Agent Findings", body: "Compliance findings generated by AI Agents are persisted to your workspace and are accessible only to authorized users." },
                                    { title: "Knowledge Sharing", body: "Knowledge items marked as public are intentionally shared within the workspace for team collaboration." },
                                ].map(({ title, body }) => (
                                    <div key={title} className="p-4 rounded-xl border border-neutral-200 bg-white">
                                        <h4 className="text-body font-medium text-neutral-900">{title}</h4>
                                        <p className="text-secondary text-neutral-500 mt-1">{body}</p>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}

                    {/* ── STORAGE ── */}
                    {activeTab === "storage" && (
                        <>
                            <SettingsHeader title={t("settings.storage.headerTitle")} sub={t("settings.storage.headerSub")} />
                            <div className="space-y-6">
                                {/* Storage Summary */}
                                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                                    <h4 className="text-body font-medium text-neutral-900 mb-4">{t("settings.storage.summary.title")}</h4>
                                    <div className="flex justify-between border-b border-neutral-100 pb-2 text-sm">
                                        <span className="font-medium text-neutral-700">{t("settings.storage.summary.totalDocuments")}</span>
                                        <span className="text-neutral-900 font-semibold">{storageDocuments.length}</span>
                                    </div>
                                </div>

                                {/* Document List */}
                                <div className="rounded-xl border border-neutral-200 bg-white overflow-hidden">
                                    <div className="p-4 border-b border-neutral-100 flex justify-between items-center bg-neutral-50/50">
                                        <h4 className="text-body font-medium text-neutral-900">{t("settings.storage.documents.title")}</h4>
                                    </div>

                                    {storageLoading ? (
                                        <div className="p-8 text-center text-sm text-neutral-500">Loading documents...</div>
                                    ) : storageError ? (
                                        <div className="p-8 text-center text-sm text-red-500">Failed to load documents.</div>
                                    ) : storageDocuments.length === 0 ? (
                                        <div className="p-8 text-center text-sm text-neutral-500">{t("settings.storage.documents.empty")}</div>
                                    ) : (
                                        <ul className="divide-y divide-neutral-100">
                                            {storageDocuments.map(doc => (
                                                <li key={doc.id} className="p-4 flex items-center justify-between hover:bg-neutral-50 transition-colors">
                                                    <div className="flex flex-col min-w-0 mr-4">
                                                        <span className="text-sm font-medium text-neutral-900 truncate">{doc.title || doc.filename}</span>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className="text-xs text-neutral-500 uppercase tracking-wider">{doc.document_type || "Unknown"}</span>
                                                            <span className="text-xs text-neutral-300">•</span>
                                                            <span className={`text-xs ${doc.processing_status === 'COMPLETED' ? 'text-green-600' : 'text-amber-600'}`}>
                                                                {doc.processing_status}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <button
                                                        onClick={() => setDocumentToDelete(doc)}
                                                        className="text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded transition-colors whitespace-nowrap"
                                                    >
                                                        {t("settings.storage.documents.deleteAction")}
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            </div>

                            {/* Delete Confirmation Modal */}
                            {documentToDelete && (
                                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-900/40 backdrop-blur-sm">
                                    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl border border-neutral-100">
                                        <h3 className="text-lg font-semibold text-neutral-900 mb-2">Delete Document</h3>
                                        <p className="text-sm text-neutral-500 mb-4">
                                            {t("settings.storage.documents.confirmDelete")}
                                            <br/><br/>
                                            <span className="font-medium text-neutral-800">{documentToDelete.title || documentToDelete.filename}</span>
                                        </p>

                                        {deleteError && (
                                            <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
                                                {deleteError}
                                            </div>
                                        )}

                                        <div className="flex justify-end gap-3 mt-6">
                                            <button
                                                className="px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 rounded-lg transition-colors"
                                                onClick={() => { setDocumentToDelete(null); setDeleteError(null); }}
                                                disabled={deleteLoading}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors flex items-center gap-2"
                                                onClick={handleDeleteDocument}
                                                disabled={deleteLoading}
                                            >
                                                {deleteLoading ? "Deleting..." : "Delete"}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Success Toast */}
                            {deleteSuccess && (
                                <div className="fixed bottom-4 right-4 z-50 bg-neutral-900 text-white px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4">
                                    <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                    {deleteSuccess}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── PRIVACY ── */}
                    {activeTab === "privacy" && (
                        <>
                            <SettingsHeader title="Privacy & Data" sub="Manage your data and privacy controls." />
                            <div className="space-y-6">
                                {/* Local Data */}
                                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                                    <h4 className="text-body font-medium text-neutral-900 mb-1">Local Application Data</h4>
                                    <p className="text-sm text-neutral-500 mb-4">
                                        Your appearance, UI configurations, and navigation preferences are stored locally in your browser. You can clear this data at any time.
                                    </p>
                                    <div className="flex items-center gap-4">
                                        <button
                                            className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-900 text-sm font-medium rounded-lg transition-colors"
                                            onClick={() => {
                                                for (let i = localStorage.length - 1; i >= 0; i--) {
                                                    const key = localStorage.key(i)
                                                    if (key && (key.startsWith("pref_") || key === "font_size" || key === "last_notification_viewed" || key === "opuslex_cookie_consent")) {
                                                        localStorage.removeItem(key)
                                                    }
                                                }
                                                window.location.reload()
                                            }}
                                        >
                                            Clear Local Data
                                        </button>
                                        <button
                                            className="text-sm font-medium text-neutral-600 hover:text-neutral-900 underline underline-offset-4"
                                            onClick={() => window.dispatchEvent(new Event("open-cookie-settings"))}
                                        >
                                            Manage Cookie Preferences
                                        </button>
                                    </div>
                                </div>

                                {/* Investigation Scoping */}
                                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                                    <h4 className="text-body font-medium text-neutral-900 mb-1">Investigation Scoping</h4>
                                    <p className="text-sm text-neutral-500">
                                        Your investigations and research queries are strictly scoped to your authenticated account. This is enforced securely by the backend architecture and cannot be disabled.
                                    </p>
                                </div>

                                {/* Data Export */}
                                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                                    <h4 className="text-body font-medium text-neutral-900 mb-1">Data Export</h4>
                                    <p className="text-sm text-neutral-500 mb-4">
                                        Download a unified JSON export of your OpusLex data, including your investigations, documents, and audit logs.
                                    </p>
                                    <button
                                        onClick={handleExportData}
                                        disabled={exportLoading}
                                        className="btn-primary"
                                    >
                                        {exportLoading ? "Exporting..." : "Export My Data"}
                                    </button>
                                    {exportError && <p className="text-sm text-red-600 mt-2">{exportError}</p>}
                                    {exportSuccess && <p className="text-sm text-green-600 mt-2">{exportSuccess}</p>}
                                </div>

                                {/* Account Deletion */}
                                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                                    <h4 className="text-body font-medium text-neutral-900 mb-1">Account & Data Deletion</h4>
                                    <p className="text-sm text-neutral-500">
                                        Account and data deletion must currently be requested through your organization's IT administrator to preserve compliance audit logs.
                                    </p>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── ADVANCED ── */}
                    {activeTab === "advanced" && (
                        <>
                            <SettingsHeader title="Advanced Settings" sub="Application internals and hard resets." />
                            <div className="space-y-6">
                                {/* Application Information */}
                                <div className="rounded-xl border border-neutral-200 bg-white p-4">
                                    <h4 className="text-body font-medium text-neutral-900 mb-4">Application Information</h4>
                                    <div className="space-y-2 text-sm text-neutral-600">
                                        <div className="flex justify-between border-b border-neutral-100 pb-2">
                                            <span className="font-medium text-neutral-700">Client Build</span>
                                            <span className="text-neutral-500 font-mono text-xs">v1.0.0</span>
                                        </div>
                                        <div className="flex justify-between border-b border-neutral-100 pb-2">
                                            <span className="font-medium text-neutral-700">User Agent</span>
                                            <span className="text-neutral-500 font-mono text-xs truncate max-w-[200px] sm:max-w-xs">{navigator.userAgent}</span>
                                        </div>
                                        <div className="flex justify-between pb-1">
                                            <span className="font-medium text-neutral-700">Client Origin</span>
                                            <span className="text-neutral-500 font-mono text-xs">{window.location.origin}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Factory Reset */}
                                <div className="rounded-xl border border-red-100 bg-red-50/30 p-4">
                                    <h4 className="text-body font-medium text-red-700 mb-1">Reset Application Preferences / Session & Cache</h4>
                                    <p className="text-sm text-red-600/80 mb-4">
                                        This will immediately wipe all browser local storage preferences and UI state. You will remain logged in, and server-side data will not be deleted.
                                    </p>
                                    <button
                                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors"
                                        onClick={() => {
                                            if (window.confirm("Are you sure you want to clear all local UI preferences and cache? You will remain logged in.")) {
                                                const keysToRemove = [];
                                                for (let i = 0; i < localStorage.length; i++) {
                                                    const key = localStorage.key(i);
                                                    if (key && (key.startsWith("pref_") || key === "font_size" || key === "last_notification_viewed" || key === "opuslex_cookie_consent")) {
                                                        keysToRemove.push(key);
                                                    }
                                                }
                                                keysToRemove.forEach(key => localStorage.removeItem(key));
                                                window.location.reload()
                                            }
                                        }}
                                    >
                                        Reset Application Preferences
                                    </button>
                                </div>
                            </div>
                        </>
                    )}

                    {/* ── Fallback ── */}
                    {!allConfigured.includes(activeTab) && (
                        <>
                            <SettingsHeader
                                title={activeTab.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                                sub="These settings are not yet available."
                            />
                            <div className="p-8 rounded-xl border border-neutral-200 bg-neutral-50 text-center">
                                <p className="text-body text-neutral-500">Coming soon</p>
                            </div>
                        </>
                    )}

                </div>
            </div>

            {showPasswordModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-xl">
                        <h2 className="text-lg font-semibold text-neutral-900 mb-1">Change Password</h2>
                        <p className="text-caption text-neutral-500 mb-4">Enter your current password and a new password (min. 8 characters).</p>

                        {passwordSuccess ? (
                            <div className="space-y-4">
                                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                                    {passwordSuccess}
                                </div>
                                <div className="flex justify-end pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswordModal(false)}
                                        className="rounded bg-neutral-900 px-4 py-1.5 text-xs text-white"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handlePasswordChange} className="space-y-3">
                                {passwordError && (
                                    <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                                        {passwordError}
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-medium text-neutral-700 mb-1">Current Password</label>
                                    <input
                                        type="password"
                                        value={currentPassword}
                                        onChange={(e) => setCurrentPassword(e.target.value)}
                                        className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                                        placeholder="Enter current password"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-neutral-700 mb-1">New Password</label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                                        placeholder="Min. 8 characters"
                                        required
                                        minLength={8}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-neutral-700 mb-1">Confirm New Password</label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                                        placeholder="Re-enter new password"
                                        required
                                        minLength={8}
                                    />
                                </div>
                                <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-neutral-100">
                                    <button
                                        type="button"
                                        onClick={() => setShowPasswordModal(false)}
                                        disabled={passwordLoading}
                                        className="rounded px-3.5 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={passwordLoading}
                                        className="rounded bg-neutral-900 px-4 py-1.5 text-xs text-white hover:bg-neutral-800 disabled:opacity-50"
                                    >
                                        {passwordLoading ? "Saving…" : "Change Password"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* ── 2FA SETUP MODAL ── */}
            {showSetup2FAModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl">
                        <h2 className="text-lg font-semibold text-neutral-900 mb-1">Set Up Two-Factor Authentication</h2>
                        <p className="text-caption text-neutral-500 mb-4">
                            Configure your authenticator app (such as Google Authenticator, 1Password, or Authy) using the key below.
                        </p>

                        {setupLoading ? (
                            <div className="py-8 text-center text-sm text-neutral-500">
                                Generating secure setup key…
                            </div>
                        ) : setupSuccess ? (
                            <div className="space-y-4">
                                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                                    {setupSuccess}
                                </div>
                                <div className="flex justify-end pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowSetup2FAModal(false)}
                                        className="rounded bg-neutral-900 px-4 py-1.5 text-xs text-white"
                                    >
                                        Done
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleEnable2FA} className="space-y-4">
                                {setupError && (
                                    <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                                        {setupError}
                                    </div>
                                )}

                                <div>
                                    <label className="block text-xs font-semibold text-neutral-700 mb-1.5">1. Secret Key (Manual Entry)</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={setupSecret}
                                            className="w-full font-mono text-xs bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-neutral-800 select-all"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (setupSecret) {
                                                    navigator.clipboard.writeText(setupSecret)
                                                    setCopiedSecret(true)
                                                    setTimeout(() => setCopiedSecret(false), 2000)
                                                }
                                            }}
                                            className="shrink-0 flex items-center gap-1 px-2.5 py-2 text-xs border border-neutral-200 rounded-lg hover:bg-neutral-50 text-neutral-700"
                                            title="Copy Key"
                                        >
                                            {copiedSecret ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                                            <span>{copiedSecret ? "Copied" : "Copy"}</span>
                                        </button>
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-neutral-700 mb-1.5">Provisioning URI (for URI Import)</label>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="text"
                                            readOnly
                                            value={setupUri}
                                            className="w-full font-mono text-[11px] bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2 text-neutral-500 truncate select-all"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (setupUri) {
                                                    navigator.clipboard.writeText(setupUri)
                                                    setCopiedUri(true)
                                                    setTimeout(() => setCopiedUri(false), 2000)
                                                }
                                            }}
                                            className="shrink-0 flex items-center gap-1 px-2.5 py-2 text-xs border border-neutral-200 rounded-lg hover:bg-neutral-50 text-neutral-700"
                                            title="Copy URI"
                                        >
                                            {copiedUri ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                                            <span>{copiedUri ? "Copied" : "Copy"}</span>
                                        </button>
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-neutral-100">
                                    <label className="block text-xs font-semibold text-neutral-700 mb-1.5">2. Enter 6-Digit Code from Authenticator App</label>
                                    <input
                                        type="text"
                                        maxLength={6}
                                        value={setupCode}
                                        onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm font-mono tracking-widest text-center outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                                        placeholder="123456"
                                        required
                                    />
                                </div>

                                <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-neutral-100">
                                    <button
                                        type="button"
                                        onClick={() => setShowSetup2FAModal(false)}
                                        disabled={setupSubmitting}
                                        className="rounded px-3.5 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={setupSubmitting || setupCode.length !== 6}
                                        className="rounded bg-neutral-900 px-4 py-1.5 text-xs text-white hover:bg-neutral-800 disabled:opacity-50"
                                    >
                                        {setupSubmitting ? "Verifying…" : "Verify & Enable"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* ── 2FA DISABLE MODAL ── */}
            {showDisable2FAModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-xl border border-neutral-200 bg-white p-6 shadow-xl">
                        <h2 className="text-lg font-semibold text-neutral-900 mb-1">Disable Two-Factor Authentication</h2>
                        <p className="text-caption text-neutral-500 mb-4">
                            To disable 2FA, enter your current account password and a code from your authenticator app.
                        </p>

                        {disableSuccess ? (
                            <div className="space-y-4">
                                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                                    {disableSuccess}
                                </div>
                                <div className="flex justify-end pt-2">
                                    <button
                                        type="button"
                                        onClick={() => setShowDisable2FAModal(false)}
                                        className="rounded bg-neutral-900 px-4 py-1.5 text-xs text-white"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleDisable2FA} className="space-y-3">
                                {disableError && (
                                    <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                                        {disableError}
                                    </div>
                                )}
                                <div>
                                    <label className="block text-xs font-medium text-neutral-700 mb-1">Current Password</label>
                                    <input
                                        type="password"
                                        value={disablePassword}
                                        onChange={(e) => setDisablePassword(e.target.value)}
                                        className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                                        placeholder="Enter current password"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-neutral-700 mb-1">6-Digit Authenticator Code</label>
                                    <input
                                        type="text"
                                        maxLength={6}
                                        value={disableCode}
                                        onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-mono tracking-widest text-center outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                                        placeholder="123456"
                                        required
                                    />
                                </div>
                                <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-neutral-100">
                                    <button
                                        type="button"
                                        onClick={() => setShowDisable2FAModal(false)}
                                        disabled={disableLoading}
                                        className="rounded px-3.5 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={disableLoading || disableCode.length !== 6 || !disablePassword}
                                        className="rounded bg-red-600 px-4 py-1.5 text-xs text-white hover:bg-red-700 disabled:opacity-50"
                                    >
                                        {disableLoading ? "Disabling…" : "Disable 2FA"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* Phone Linking Modal */}
            {showPhoneModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl relative animate-in fade-in zoom-in duration-200">
                        <h3 className="text-body font-semibold text-neutral-900 mb-2">
                            {phoneStep === 1 ? "Link Phone Number" : "Verify Phone Number"}
                        </h3>
                        <p className="text-xs text-neutral-500 mb-4">
                            {phoneStep === 1
                                ? "Enter your phone number to link it to your account for secure sign-in."
                                : "Enter the 6-digit verification code sent to your phone."
                            }
                        </p>

                        <form onSubmit={phoneStep === 1 ? handlePhoneSend : handlePhoneVerify} className="space-y-3">
                            {phoneError && (
                                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                                    {phoneError}
                                </div>
                            )}

                            {phoneStep === 1 ? (
                                <div>
                                    <label className="block text-xs font-medium text-neutral-700 mb-1">Phone Number</label>
                                    <input
                                        type="tel"
                                        value={phoneNumber}
                                        onChange={(e) => setPhoneNumber(e.target.value)}
                                        className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                                        placeholder="+1 555-0123"
                                        required
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-medium text-neutral-700 mb-1">6-Digit Code</label>
                                    <input
                                        type="text"
                                        maxLength={6}
                                        value={phoneCode}
                                        onChange={(e) => setPhoneCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-mono tracking-widest text-center outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                                        placeholder="123456"
                                        required
                                    />
                                </div>
                            )}
                            <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-neutral-100">
                                <button
                                    type="button"
                                    onClick={() => setShowPhoneModal(false)}
                                    disabled={phoneLoading}
                                    className="rounded px-3.5 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
                                >
                                    Cancel
                                </button>
                                {phoneStep === 1 ? (
                                    <button
                                        type="submit"
                                        disabled={phoneLoading || !phoneNumber}
                                        className="rounded bg-neutral-900 px-4 py-1.5 text-xs text-white hover:bg-neutral-800 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {phoneLoading ? "Sending…" : phoneCooldown > 0 ? `Resend in ${phoneCooldown}s` : "Send Code"}
                                    </button>
                                ) : (
                                    <button
                                        type="submit"
                                        disabled={phoneLoading || phoneCode.length !== 6}
                                        className="rounded bg-neutral-900 px-4 py-1.5 text-xs text-white hover:bg-neutral-800 disabled:opacity-50"
                                    >
                                        {phoneLoading ? "Verifying…" : "Verify Code"}
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Email Verification Modal */}
            {showEmailModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl relative animate-in fade-in zoom-in duration-200">
                        <h3 className="text-body font-semibold text-neutral-900 mb-2">
                            {emailStep === 1 ? "Verify Email" : "Verify Email Code"}
                        </h3>
                        <p className="text-xs text-neutral-500 mb-4">
                            {emailStep === 1
                                ? `A verification code will be sent to ${user?.email}.`
                                : "Enter the 6-digit verification code sent to your email."
                            }
                        </p>

                        <form onSubmit={emailStep === 1 ? handleEmailSend : handleEmailVerify} className="space-y-3">
                            {emailError && (
                                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                                    {emailError}
                                </div>
                            )}

                            {emailStep === 1 ? (
                                <div>
                                    <label className="block text-xs font-medium text-neutral-700 mb-1">Email Address</label>
                                    <input
                                        type="email"
                                        value={user?.email || ""}
                                        readOnly
                                        className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm bg-neutral-50 text-neutral-500 outline-none cursor-not-allowed"
                                    />
                                </div>
                            ) : (
                                <div>
                                    <label className="block text-xs font-medium text-neutral-700 mb-1">6-Digit Code</label>
                                    <input
                                        type="text"
                                        maxLength={6}
                                        value={emailCode}
                                        onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-mono tracking-widest text-center outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900"
                                        placeholder="123456"
                                        required
                                    />
                                </div>
                            )}
                            <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-neutral-100">
                                <button
                                    type="button"
                                    onClick={() => setShowEmailModal(false)}
                                    disabled={emailLoading}
                                    className="rounded px-3.5 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
                                >
                                    Cancel
                                </button>
                                {emailStep === 1 ? (
                                    <button
                                        type="submit"
                                        disabled={emailLoading || emailCooldown > 0}
                                        className="rounded bg-neutral-900 px-4 py-1.5 text-xs text-white hover:bg-neutral-800 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {emailLoading ? "Sending…" : emailCooldown > 0 ? `Resend in ${emailCooldown}s` : "Send Code"}
                                    </button>
                                ) : (
                                    <button
                                        type="submit"
                                        disabled={emailLoading || emailCode.length !== 6}
                                        className="rounded bg-neutral-900 px-4 py-1.5 text-xs text-white hover:bg-neutral-800 disabled:opacity-50"
                                    >
                                        {emailLoading ? "Verifying…" : "Verify Code"}
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}

function SettingsHeader({ title, sub }: { title: string; sub: string }) {
    return (
        <div className="mb-6 border-b border-neutral-200 pb-5">
            <h3 className="text-heading font-semibold text-neutral-900">{title}</h3>
            <p className="text-secondary text-neutral-500 mt-1">{sub}</p>
        </div>
    )
}

function SettingsSection({ title, description, children }: {
    title: string; description?: string; children: React.ReactNode
}) {
    return (
        <div className="mb-8">
            <h4 className="text-subheading font-medium text-neutral-900 mb-1">{title}</h4>
            {description && <p className="text-secondary text-neutral-500 mb-4">{description}</p>}
            {children}
        </div>
    )
}

function HomeWorkspace({
    activeSection,
    onOpenResearch,
    onOpenInvestigations,
    onOpenAgents,
    onOpenAudit,
    user,
}: HomeWorkspaceProps & { user?: any }) {
    if (activeSection !== "home") {
        return (
            <div className="flex min-h-[520px] items-center justify-center">
                <div className="text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100">
                        <Sparkles size={16} className="text-neutral-500" />
                    </div>
                    <h2 className="mt-4 text-sm font-semibold capitalize">
                        {activeSection}
                    </h2>
                    <p className="mt-2 text-sm text-neutral-400">
                        This workspace will be built next.
                    </p>
                </div>
            </div>
        )
    }

    const { t } = useTranslation()
    const [data, setData] = useState<OverviewData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")

    useEffect(() => {
        const fetchOverview = async () => {
            const token = localStorage.getItem("access_token")
            if (!token) {
                setLoading(false)
                return
            }
            try {
                const res = await fetch("http://127.0.0.1:8000/api/v1/workspace/overview", {
                    headers: { Authorization: `Bearer ${token}` }
                })
                if (res.status === 401) {
                    localStorage.removeItem("access_token")
                    throw new Error("Session expired. Please log in again.")
                }
                if (!res.ok) throw new Error("Failed to load workspace overview")
                setData(await res.json())
            } catch (err: any) {
                setError(err.message)
            } finally {
                setLoading(false)
            }
        }
        fetchOverview()
    }, [])

    if (loading) {
        return (
            <div className="flex min-h-[520px] items-center justify-center">
                <p className="text-sm text-neutral-500">{t("common.loading", "Loading workspace...")}</p>
            </div>
        )
    }

    if (error) {
        return (
            <div className="flex min-h-[520px] items-center justify-center">
                <p className="text-sm text-red-500">{error}</p>
            </div>
        )
    }

    return (
        <div className="grid min-h-[600px] gap-4 xl:grid-cols-1">
            <section className="min-w-0">
                <div className="mb-5 flex items-start justify-between">
                    <div>
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-400">
                            {t("dashboard.activeWorkspace", "Workspace")}
                        </p>
                        <h1 className="mt-2 text-xl font-semibold tracking-tight">
                            {t("dashboard.welcomeBack", "Welcome back")}, {user?.full_name?.split(' ')[0] || "User"}
                        </h1>
                        <p className="mt-1 text-sm text-neutral-500">
                            {t("dashboard.systemOperational", "Your legal and compliance workspace.")}
                        </p>
                    </div>
                    <button
                        onClick={onOpenResearch}
                        className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-600 hover:bg-neutral-50"
                    >
                        <Sparkles size={13} />
                        {t("dashboard.quickLaunch.askResearch", "Open Research")}
                    </button>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                    <MetricCard
                        label={t("dashboard.stats.activeInvestigations", "Active Investigations")}
                        value={data?.metrics.active_investigations.toString() || "0"}
                        detail={t("dashboard.recentInvestigations.title", "Investigations requiring attention")}
                        onClick={onOpenInvestigations}
                    />
                    <MetricCard
                        label={t("dashboard.stats.documentsIndexed", "Total Documents")}
                        value={data?.metrics.total_documents.toString() || "0"}
                        detail={t("dashboard.stats.documentsIndexed", "Stored in your workspace")}
                        onClick={onOpenInvestigations}
                    />
                    <MetricCard
                        label={t("dashboard.stats.recentFindings", "Agent Runs")}
                        value={data?.metrics.total_agent_runs.toString() || "0"}
                        detail={t("dashboard.stats.recentFindings", "Total compliance analyses")}
                        onClick={onOpenAgents}
                    />
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div className="card-enterprise rounded-xl border border-neutral-200 bg-white">
                        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
                            <div>
                                <h2 className="text-sm font-semibold">{t("dashboard.recentInvestigations.title", "Active Investigations")}</h2>
                                <p className="mt-1 text-xs text-neutral-400">{t("dashboard.recentInvestigations.title", "Investigations currently requiring attention")}</p>
                            </div>
                            <button onClick={onOpenInvestigations} className="text-xs text-neutral-400 hover:text-neutral-700">
                                {t("dashboard.recentInvestigations.viewAll", "View all")}
                            </button>
                        </div>

                        {data?.active_investigations && data.active_investigations.length > 0 ? (
                            <div className="divide-y divide-neutral-100">
                                {data.active_investigations.map((inv) => (
                                    <button
                                        key={inv.id}
                                        onClick={onOpenInvestigations}
                                        className="row-hover flex w-full items-center gap-3 px-4 py-4 text-left"
                                    >
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                                            <Users size={15} className="text-neutral-600" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2">
                                                <p className="truncate text-sm font-medium">{inv.title}</p>
                                                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                                                    {inv.status}
                                                </span>
                                            </div>
                                            <p className="mt-1 truncate text-xs text-neutral-400">
                                                {inv.description || "No description provided."}
                                            </p>
                                            <div className="mt-2 flex items-center gap-3 text-xs text-neutral-400">
                                                <span>{inv.documents_count} docs</span>
                                                <span>•</span>
                                                <span>{inv.agent_runs_count} runs</span>
                                                <span>•</span>
                                                <span>Updated {new Date(inv.updated_at).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                        <ChevronRight size={14} className="shrink-0 text-neutral-300" />
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <div className="p-8 text-center text-neutral-500 text-xs">
                                {t("dashboard.recentInvestigations.empty", "No active investigations found.")}
                            </div>
                        )}
                    </div>

                    <div className="card-enterprise rounded-xl border border-neutral-200 bg-white">
                        <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-3">
                            <div>
                                <h2 className="text-sm font-semibold">{t("dashboard.activityFeed.title", "Recent Activity")}</h2>
                                <p className="mt-1 text-xs text-neutral-400">{t("dashboard.activityFeed.title", "Latest workspace activity")}</p>
                            </div>
                        </div>

                        {data?.recent_activity && data.recent_activity.length > 0 ? (
                            <div className="divide-y divide-neutral-100">
                                {data.recent_activity.map((act) => {
                                    let Icon = FileText;
                                    if (act.type === "investigation") Icon = Users;
                                    if (act.type === "agent_run") Icon = Sparkles;
                                    if (act.type === "knowledge") Icon = ShieldCheck;

                                    // Determine navigation destination
                                    let dest: (() => void) | undefined;
                                    if (act.type === "investigation") dest = onOpenInvestigations;
                                    else if (act.type === "agent_run") dest = onOpenAgents;
                                    else if (act.type === "knowledge") dest = onOpenAudit;
                                    else if (act.type === "document") dest = onOpenInvestigations;

                                    return (
                                        <ActivityRow
                                            key={act.id}
                                            icon={<Icon size={13} />}
                                            title={act.title}
                                            detail={act.detail}
                                            time={new Date(act.timestamp).toLocaleString()}
                                            onClick={dest}
                                        />
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="p-8 text-center text-neutral-500 text-xs">
                                {t("dashboard.activityFeed.empty", "No recent activity.")}
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </div>
    )
}

function MetricCard({
    label,
    value,
    detail,
    onClick,
}: {
    label: string
    value: string
    detail: string
    onClick?: () => void
}) {
    const base = "card-enterprise rounded-xl border border-neutral-200 bg-white p-4"
    if (onClick) {
        return (
            <button
                onClick={onClick}
                className={`${base} w-full text-left group hover:border-neutral-300 hover:shadow-sm transition-all cursor-pointer`}
            >
                <p className="text-xs uppercase tracking-[0.12em] text-neutral-400 group-hover:text-neutral-500 transition-colors">
                    {label}
                </p>
                <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
                <div className="mt-1 flex items-center justify-between">
                    <p className="text-xs text-neutral-400">{detail}</p>
                    <ChevronRight size={12} className="text-neutral-300 group-hover:text-neutral-400 transition-colors" />
                </div>
            </button>
        )
    }
    return (
        <div className={base}>
            <p className="text-xs uppercase tracking-[0.12em] text-neutral-400">{label}</p>
            <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-neutral-400">{detail}</p>
        </div>
    )
}

function ActivityRow({
    icon,
    title,
    detail,
    time,
    onClick,
}: {
    icon: React.ReactNode
    title: string
    detail: string
    time: string
    onClick?: () => void
}) {
    const inner = (
        <>
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{title}</p>
                <p className="mt-0.5 truncate text-xs text-neutral-400">{detail}</p>
            </div>
            <span className="shrink-0 text-xs text-neutral-400">{time}</span>
            {onClick && <ChevronRight size={12} className="shrink-0 text-neutral-300" />}
        </>
    )
    if (onClick) {
        return (
            <button
                onClick={onClick}
                className="flex w-full items-center gap-3 px-4 py-3 text-left row-hover"
            >
                {inner}
            </button>
        )
    }
    return <div className="flex items-center gap-3 px-4 py-3">{inner}</div>
}



function Dashboard() {
    const { t } = useTranslation()
    const { navConfig, notificationPrefs, language, setLanguage } = usePreferences()
    const [showLanguageDropdown, setShowLanguageDropdown] = useState(false)
    const langDropdownRef = useRef<HTMLDivElement>(null)
    // Initialise from user's preferred landing section
    const [activeSection, setActiveSection] = useState<Section>(() => {
        if (window.location.search.includes("code=") && window.location.search.includes("state=")) {
            return "integrations"
        }
        const saved = localStorage.getItem("pref_landing") as Section | null
        const valid: Section[] = ["home", "research", "investigations", "agents", "audit", "governance"]
        return saved && valid.includes(saved) ? saved : "home"
    })
    const [user, setUser] = useState<any>(null)
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [showProfile, setShowProfile] = useState(false)
    const [showFaq, setShowFaq] = useState(false)
    const [modalNameInput, setModalNameInput] = useState("")
    const [modalSaving, setModalSaving] = useState(false)
    const [modalError, setModalError] = useState<string | null>(null)
    const menuRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (user?.full_name) {
            setModalNameInput(user.full_name)
        }
    }, [user?.full_name])

    // ── AI Assistant (Themis) State & OS-Aware Shortcuts ──────────────────
    const [isAssistantOpen, setIsAssistantOpen] = useState(false)
    const [assistantMode, setAssistantMode] = useState<"voice" | "text">("voice")
    const [assistantOrbState, setAssistantOrbState] = useState<AssistantOrbState>("idle")
    const [assistantEnabled] = useState(() => localStorage.getItem("pref_assistant_enabled") !== "false")
    const [assistantPermissionLevel] = useState(() => parseInt(localStorage.getItem("pref_assistant_permission_level") || "1", 10))
    const [assistantVoiceEnabled, setAssistantVoiceEnabled] = useState(() => localStorage.getItem("pref_assistant_voice_enabled") === "true")
    const osShortcuts = useMemo(() => getAssistantShortcuts(), [])

    // Dedicated OS-aware shortcut listener (suppressed in editable elements)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.repeat || isEditableElement(e.target)) {
                return
            }

            // Voice activation (⌥A on macOS / Alt+A on Windows)
            if (osShortcuts.isVoiceShortcut(e)) {
                e.preventDefault()
                e.stopPropagation()
                setIsAssistantOpen(prev => {
                    if (prev && assistantMode === "voice") {
                        return false
                    }
                    setAssistantMode("voice")
                    return true
                })
                return
            }

            // Text/Spotlight activation (⌘K on macOS / Ctrl+K on Windows)
            if (osShortcuts.isTextShortcut(e)) {
                e.preventDefault()
                e.stopPropagation()
                setIsAssistantOpen(prev => {
                    if (prev && assistantMode === "text") {
                        return false
                    }
                    setAssistantMode("text")
                    return true
                })
                return
            }
        }
        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [osShortcuts, assistantMode])

    // Listen for "Hey Themis" wake-word event
    useEffect(() => {
        const handleTriggerVoice = () => {
            setAssistantMode("voice")
            setIsAssistantOpen(true)
        }
        window.addEventListener("themis:trigger_voice", handleTriggerVoice)
        return () => window.removeEventListener("themis:trigger_voice", handleTriggerVoice)
    }, [])

    // ── Global Search ──────────────────────────────────────────────────────
    const [searchOpen, setSearchOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState("")
    const [searchResults, setSearchResults] = useState<{ section: Section; label: string; detail: string; icon: string }[]>([])
    const [searchLoading, setSearchLoading] = useState(false)
    const [searchError, setSearchError] = useState<string | null>(null)
    const searchRef = useRef<HTMLDivElement>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)

    // ── Notification panel ────────────────────────────────────────────────
    const LAST_NOTIFICATION_VIEWED_KEY = "opuslex_last_notification_viewed"
    const [showNotifications, setShowNotifications] = useState(false)
    const [notifications, setNotifications] = useState<{ id: string; title: string; detail: string; time: string; timestamp: string; type: string }[]>([])
    const [notificationsLoading, setNotificationsLoading] = useState(false)
    const [notificationsError, setNotificationsError] = useState<string | null>(null)
    const [hasUnread, setHasUnread] = useState(false)
    const notifRef = useRef<HTMLDivElement>(null)

    // ── Top-nav tabs bubble ────────────────────────────────────────────────
    // "All" = home, "Reports" = audit, "Research" = research, "Agents" = agents
    const topNavTabs: {label: string; section: Section; key: string}[] = [
        { label: "All",      section: "home",     key: "all" },
        { label: "Reports",  section: "reports",  key: "reports" },
        { label: "Research", section: "research", key: "research" },
        { label: "Agents",   section: "agents",   key: "agents" },
    ]
    const activeTopTab = topNavTabs.find(t => t.section === activeSection)?.label ?? "All"
    const [topNavHover, setTopNavHover] = useState<number | null>(null)
    const topNavRef = useRef<HTMLDivElement>(null)
    const [topNavBubble, setTopNavBubble] = useState<{transform: string; width: string; opacity: number}>({
        transform: "translateX(0px)", width: "0px", opacity: 0,
    })

    // Position the top-nav bubble
    useEffect(() => {
        if (!topNavRef.current) return
        const btns = topNavRef.current.querySelectorAll("button")
        const activeIdx = topNavTabs.findIndex(t => t.label === activeTopTab)
        const targetIdx = topNavHover !== null ? topNavHover : activeIdx
        if (targetIdx === -1) return
        const btn = btns[targetIdx] as HTMLButtonElement | undefined
        if (!btn) return
        setTopNavBubble({ transform: `translateX(${btn.offsetLeft}px)`, width: `${btn.offsetWidth}px`, opacity: 1 })
    }, [topNavHover, activeTopTab])

    // Navigation helpers
    const navTo = useCallback((s: Section) => { setActiveSection(s); setSearchOpen(false) }, [])

    useEffect(() => {
        const handleSwitchTab = (e: Event) => {
            const customEvent = e as CustomEvent
            if (customEvent.detail && typeof customEvent.detail === 'string') {
                navTo(customEvent.detail as Section)
            }
        }
        window.addEventListener('switch_tab', handleSwitchTab)
        return () => window.removeEventListener('switch_tab', handleSwitchTab)
    }, [navTo])

    // Search: query backend when search term changes
    useEffect(() => {
        const query = searchQuery.trim()
        if (!query) {
            setSearchResults([])
            setSearchError(null)
            setSearchLoading(false)
            return
        }
        const token = localStorage.getItem("access_token") ?? ""
        let cancelled = false
        setSearchLoading(true)
        setSearchError(null)

        const run = async () => {
            try {
                const encoded = encodeURIComponent(query)
                const [invRes, polRes, regRes] = await Promise.all([
                    fetch("http://127.0.0.1:8000/api/v1/investigations/", {
                        headers: { Authorization: `Bearer ${token}` }
                    }),
                    fetch(`http://127.0.0.1:8000/api/v1/policies/?search=${encoded}&limit=5`, {
                        headers: { Authorization: `Bearer ${token}` }
                    }),
                    fetch(`http://127.0.0.1:8000/api/v1/regulations/?search=${encoded}&limit=5`, {
                        headers: { Authorization: `Bearer ${token}` }
                    }),
                ])

                if (cancelled) return

                const results: { section: Section; label: string; detail: string; icon: string }[] = []

                if (invRes.ok) {
                    const data: { id: number; title: string; description?: string | null; status: string }[] = await invRes.json()
                    const lowerQ = query.toLowerCase()
                    const matchingInvs = data.filter(i =>
                        (i.title && i.title.toLowerCase().includes(lowerQ)) ||
                        (i.description && i.description.toLowerCase().includes(lowerQ))
                    )
                    matchingInvs.slice(0, 4).forEach(i => {
                        results.push({
                            section: "investigations",
                            label: i.title,
                            detail: `Investigation · ${i.status}${i.description ? ` · ${i.description}` : ""}`,
                            icon: "👤"
                        })
                    })
                }

                if (polRes.ok) {
                    const data: { total: number; items: { id: number; title: string; department?: string | null; status?: string | null }[] } = await polRes.json()
                    const items = data.items || []
                    items.slice(0, 4).forEach(p => {
                        results.push({
                            section: "policies",
                            label: p.title,
                            detail: `Policy${p.department ? ` · ${p.department}` : ""}${p.status ? ` · ${p.status}` : ""}`,
                            icon: "📄"
                        })
                    })
                }

                if (regRes.ok) {
                    const data: { total: number; items: { id: number; title: string; jurisdiction?: string | null; status?: string | null }[] } = await regRes.json()
                    const items = data.items || []
                    items.slice(0, 4).forEach(r => {
                        results.push({
                            section: "regulations",
                            label: r.title,
                            detail: `Regulation${r.jurisdiction ? ` · ${r.jurisdiction}` : ""}${r.status ? ` · ${r.status}` : ""}`,
                            icon: "⚖️"
                        })
                    })
                }

                if (!cancelled) {
                    setSearchResults(results)
                }
            } catch {
                if (!cancelled) {
                    setSearchError("Unable to load search results. Please try again.")
                    setSearchResults([])
                }
            } finally {
                if (!cancelled) setSearchLoading(false)
            }
        }

        const timer = setTimeout(run, 250)
        return () => {
            cancelled = true
            clearTimeout(timer)
        }
    }, [searchQuery])

    // Load recent activity into notifications
    useEffect(() => {
        const token = localStorage.getItem("access_token") ?? ""
        if (!token) {
            setNotificationsLoading(false)
            return
        }
        setNotificationsLoading(true)
        setNotificationsError(null)

        fetch("http://127.0.0.1:8000/api/v1/workspace/overview", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => {
                if (r.status === 401) {
                    localStorage.removeItem("access_token")
                    throw new Error("Unauthorized")
                }
                if (!r.ok) throw new Error("Failed to load workspace activity")
                return r.json()
            })
            .then((d: { recent_activity?: { id: string; title: string; detail: string; timestamp: string; type: string }[] }) => {
                if (!d?.recent_activity) {
                    setNotifications([])
                    setHasUnread(false)
                    return
                }
                const items = d.recent_activity.slice(0, 6).map(a => ({
                    id: a.id,
                    title: a.title,
                    detail: a.detail,
                    time: new Date(a.timestamp).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
                    timestamp: a.timestamp,
                    type: a.type,
                })).filter(item => {
                    let cat: NotificationCategory = "investigation"
                    if (item.type === "agent_run") cat = "agent_run"
                    if (item.type === "knowledge" || item.type === "document") cat = "knowledge"
                    if (item.type === "security") cat = "security"
                    return notificationPrefs[cat]?.inApp !== false
                })
                setNotifications(items)

                if (items.length > 0) {
                    try {
                        const stored = localStorage.getItem(LAST_NOTIFICATION_VIEWED_KEY)
                        if (!stored) {
                            setHasUnread(true)
                        } else {
                            const lastViewedTime = new Date(stored).getTime()
                            const newestTime = new Date(items[0].timestamp).getTime()
                            if (!isNaN(newestTime) && (!isNaN(lastViewedTime) ? newestTime > lastViewedTime : true)) {
                                setHasUnread(true)
                            } else {
                                setHasUnread(false)
                            }
                        }
                    } catch {
                        setHasUnread(true)
                    }
                } else {
                    setHasUnread(false)
                }
            })
            .catch(() => {
                setNotificationsError("Failed to load recent activity.")
            })
            .finally(() => {
                setNotificationsLoading(false)
            })
    }, [])

    const handleToggleNotifications = useCallback(() => {
        setShowNotifications(prev => {
            const next = !prev
            if (next && notifications.length > 0) {
                setHasUnread(false)
                try {
                    const newest = notifications[0].timestamp
                    if (newest) {
                        localStorage.setItem(LAST_NOTIFICATION_VIEWED_KEY, newest)
                    }
                } catch {}
            }
            return next
        })
    }, [notifications])

    const fetchUser = useCallback(async () => {
        try {
            const token = localStorage.getItem("access_token")
            if (!token) return
            const res = await fetch("http://127.0.0.1:8000/api/v1/auth/me", {
                headers: { Authorization: `Bearer ${token}` }
            })
            if (res.ok) {
                setUser(await res.json())
            } else if (res.status === 401) {
                localStorage.removeItem("access_token")
                setUser(null)
            }
        } catch (e) {}
    }, [])

    useEffect(() => {
        fetchUser()
    }, [fetchUser])

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false)
            }
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setSearchOpen(false)
            }
            if (notifRef.current && !notifRef.current.contains(event.target as Node)) {
                setShowNotifications(false)
            }
            if (langDropdownRef.current && !langDropdownRef.current.contains(event.target as Node)) {
                setShowLanguageDropdown(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setIsMenuOpen(false)
                setShowProfile(false)
                setSearchOpen(false)
                setShowNotifications(false)
                setIsAssistantOpen(false)
                setShowLanguageDropdown(false)
            }
            // Press '/' outside editable fields to open workspace search
            if (e.key === "/" && !isEditableElement(e.target) && !isAssistantOpen) {
                e.preventDefault()
                setSearchOpen(true)
                setTimeout(() => searchInputRef.current?.focus(), 50)
            }
        }
        document.addEventListener("keydown", handleKeyDown)
        return () => document.removeEventListener("keydown", handleKeyDown)
    }, [isAssistantOpen])

    const handleLogout = () => {
        localStorage.removeItem("access_token")
        localStorage.removeItem("current_user")
        window.location.reload()
    }

    const initials = user?.full_name ? user.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().substring(0,2) : "U"


    const isResearch = activeSection === "research"
    const isAgents = activeSection === "agents"
    const isInvestigations = activeSection === "investigations"
    const isKnowledge = activeSection === "knowledge"
    const isRegulations = activeSection === "regulations"
    const isPolicies = activeSection === "policies"
    const isCompliance = activeSection === "compliance"
    const isAudit = activeSection === "audit"
    const isReports = activeSection === "reports"
    const isGovernance = activeSection === "governance"
    const isIntegrations = activeSection === "integrations"

    const navigation = useMemo(() => {
        let conf = navConfig || BASE_NAVIGATION.map(n => ({ id: n.id, hidden: false }))
        const missing = BASE_NAVIGATION.filter(n => !conf.find(c => c.id === n.id))
        if (missing.length > 0) {
            conf = [...conf, ...missing.map(n => ({ id: n.id, hidden: false }))]
        }

        const orderedItems = []
        for (const c of conf) {
            if (c.hidden) continue
            const item = BASE_NAVIGATION.find(n => n.id === c.id)
            if (item) orderedItems.push(item)
        }
        return orderedItems
    }, [navConfig])

    return (
        <div className="h-[100dvh] overflow-hidden bg-neutral-50 dark:bg-[#0d0d0d] text-neutral-900 dark:text-[#ececec] flex transition-colors">
            <aside className="flex flex-col h-[100dvh] w-[240px] shrink-0 border-r border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#171717] transition-colors">
                    {/* Brand lockup */}
                    <button
                        className="flex shrink-0 items-center px-5 py-4 transition hover:opacity-80"
                        onClick={() => setActiveSection("home")}
                    >
                        <OpusLexBrand />
                    </button>

                    <div className="flex-1 overflow-y-auto px-3 py-2">
                        <div className="mb-2">
                            <p className="px-2 pb-2 text-caption font-semibold uppercase tracking-wider text-neutral-400 dark:text-neutral-500">
                                Workspace
                            </p>
                        </div>

                        <nav className="space-y-0.5">
                            {navigation.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setActiveSection(item.id)}
                                    className={`nav-pill flex w-full items-center gap-3 px-3 py-2 text-left text-body transition-colors ${
                                        activeSection === item.id
                                            ? "active font-medium text-neutral-900 dark:text-white"
                                            : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                                    }`}
                                >
                                    {item.icon}
                                    <span className="truncate">{t(`nav.${item.id}`)}</span>
                                </button>
                            ))}
                        </nav>
                    </div>

                    <div className="shrink-0 border-t border-neutral-200 dark:border-[#262626] p-3 relative" ref={menuRef}>
                        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="profile-tile flex w-full items-center gap-3 p-2 text-left group rounded-xl hover:bg-neutral-100 dark:hover:bg-[#212121] transition-colors">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-900 dark:bg-[#262626] text-sm font-medium text-white shadow-sm" style={{ aspectRatio: '1/1' }}>
                                {initials}
                            </div>

                            <div className="min-w-0 flex-1">
                                <p className="truncate text-body font-medium text-neutral-900 dark:text-white">
                                    {user?.full_name || "Loading..."}
                                </p>
                                <p className="truncate text-caption text-neutral-500 dark:text-neutral-400">
                                    OpusLex Workspace{user?.role ? ` • ${user.role.charAt(0).toUpperCase() + user.role.slice(1)}` : ""}
                                </p>
                            </div>

                            <ChevronRight size={16} className="text-neutral-400 dark:text-neutral-500 group-hover:text-neutral-600 dark:group-hover:text-neutral-300" style={{ transition: "color 160ms ease" }} />
                        </button>

                        {isMenuOpen && (
                            <div className="absolute bottom-[calc(100%+8px)] left-3 w-[calc(100%-24px)] rounded-xl border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#1a1a1a] shadow-xl p-1.5 z-50 overflow-hidden transition-colors">
                                <div className="px-3 py-2.5 border-b border-neutral-100 dark:border-[#262626] mb-1.5">
                                    <p className="text-body font-medium text-neutral-900 dark:text-white truncate">{user?.full_name}</p>
                                    <p className="text-caption text-neutral-500 dark:text-neutral-400 truncate">{user?.email}</p>
                                </div>
                                <div className="p-1 space-y-0.5">
                                    <button onClick={() => { setIsAssistantOpen(true); setAssistantMode("voice"); setIsMenuOpen(false); }} className="menu-item w-full text-left px-2.5 py-2 text-body text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#262626] rounded-lg transition-colors flex items-center justify-between">
                                        <span>Themis Assistant</span>
                                        <span className="text-[10px] font-mono text-neutral-400 bg-neutral-100 dark:bg-[#262626] px-1.5 py-0.5 rounded-full border border-neutral-200 dark:border-[#333]">{osShortcuts.voiceKeyLabel}</span>
                                    </button>
                                    <button onClick={() => { setShowProfile(true); setIsMenuOpen(false); }} className="menu-item w-full text-left px-2.5 py-2 text-body text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#262626] rounded-lg transition-colors">{t("settings.tabs.profile")}</button>
                                    <button onClick={() => { setActiveSection("settings"); setIsMenuOpen(false); }} className="menu-item w-full text-left px-2.5 py-2 text-body text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#262626] rounded-lg transition-colors">{t("nav.settings")}</button>
                                    <button onClick={() => { setActiveSection("help"); setIsMenuOpen(false); }} className="menu-item w-full text-left px-2.5 py-2 text-body text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-[#262626] rounded-lg transition-colors">{t("nav.help")}</button>
                                </div>
                                <div className="mt-1.5 p-1 border-t border-neutral-100 dark:border-[#262626]">
                                    <button onClick={handleLogout} className="menu-item menu-item-danger w-full text-left px-2.5 py-2 text-body text-red-600 dark:text-red-400 font-medium hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors">{t("auth.logOut", "Log out")}</button>
                                </div>
                            </div>
                        )}
                    </div>
            </aside>
            <main className="min-w-0 flex-1 flex flex-col h-[100dvh]">
                <header className="shrink-0 flex h-16 items-center justify-between border-b border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#171717] px-5 transition-colors">
                    <div className="flex items-center gap-5">
                        {/* ── Search pill + overlay ── */}
                        <div className="relative" ref={searchRef}>
                            <button
                                id="global-search-trigger"
                                onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50) }}
                                className="search-pill flex items-center gap-2 px-3 py-2 cursor-text bg-neutral-50 dark:bg-[#212121] border border-neutral-200 dark:border-[#262626] rounded-full"
                            >
                                <Search size={13} className="text-neutral-400" />
                                <span className="w-36 bg-transparent text-xs text-neutral-400 dark:text-neutral-500 select-none truncate">{t("dashboard.topNav.searchPlaceholder", "Search workspace…")}</span>
                                <span className="rounded-full border border-neutral-200 dark:border-[#333333] bg-neutral-100 dark:bg-[#171717] px-2 py-0.5 text-xs text-neutral-400 dark:text-neutral-500 font-mono">/</span>
                            </button>

                            {searchOpen && (
                                <div className="absolute top-[calc(100%+6px)] left-0 w-[420px] rounded-xl border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#1a1a1a] shadow-xl z-50 overflow-hidden transition-colors">
                                    <div className="flex items-center gap-2 border-b border-neutral-100 dark:border-[#262626] px-3 py-2.5">
                                        <Search size={13} className="shrink-0 text-neutral-400" />
                                        <input
                                            ref={searchInputRef}
                                            id="global-search-input"
                                            value={searchQuery}
                                            onChange={e => setSearchQuery(e.target.value)}
                                            placeholder={t("dashboard.searchModal.placeholder", "Search investigations, policies, regulations…")}
                                            className="flex-1 bg-transparent text-sm text-neutral-900 dark:text-white outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
                                            autoComplete="off"
                                        />
                                        {searchQuery && (
                                            <button onClick={() => setSearchQuery("")}>
                                                <X size={12} className="text-neutral-400" />
                                            </button>
                                        )}
                                    </div>

                                    <div className="py-1 max-h-72 overflow-y-auto">
                                        {searchLoading ? (
                                            <p className="px-4 py-3 text-xs text-neutral-400">{t("common.loading", "Searching…")}</p>
                                        ) : searchError ? (
                                            <p className="px-4 py-3 text-xs text-red-500">{searchError}</p>
                                        ) : searchQuery && searchResults.length === 0 ? (
                                            <p className="px-4 py-3 text-xs text-neutral-400">{t("dashboard.searchModal.noResults", { query: searchQuery, defaultValue: `No results found for "${searchQuery}".` })}</p>
                                        ) : searchResults.length > 0 ? (
                                            searchResults.map((r, i) => (
                                                <button
                                                    key={i}
                                                    onClick={() => { navTo(r.section); setSearchQuery("") }}
                                                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-[#212121] transition-colors"
                                                >
                                                    <span className="text-base">{r.icon}</span>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="truncate text-sm font-medium text-neutral-800 dark:text-neutral-200">{r.label}</p>
                                                        <p className="truncate text-xs text-neutral-400 dark:text-neutral-500">{r.detail}</p>
                                                    </div>
                                                    <ChevronRight size={12} className="ml-auto shrink-0 text-neutral-300 dark:text-neutral-600" />
                                                </button>
                                            ))
                                        ) : (
                                            <div className="px-4 py-3 space-y-1">
                                                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wider mb-2">{t("dashboard.searchModal.title", "Quick navigation")}</p>
                                                {[
                                                    { label: t("nav.investigations", "Investigations"), section: "investigations" as Section, icon: "👤" },
                                                    { label: t("nav.policies", "Policies"),             section: "policies"       as Section, icon: "📄" },
                                                    { label: t("nav.regulations", "Regulations"),       section: "regulations"    as Section, icon: "⚖️" },
                                                    { label: t("nav.governance", "Governance"),         section: "governance"     as Section, icon: "🏛️" },
                                                    { label: t("nav.audit", "Audit & Findings"),        section: "audit"          as Section, icon: "🔍" },
                                                    { label: t("nav.research", "Research"),             section: "research"       as Section, icon: "📚" },
                                                ].map(s => (
                                                    <button
                                                        key={s.section}
                                                        onClick={() => navTo(s.section)}
                                                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-[#212121] transition-colors"
                                                    >
                                                        <span className="text-sm">{s.icon}</span>
                                                        <span className="text-sm text-neutral-700 dark:text-neutral-300">{s.label}</span>
                                                        <ChevronRight size={11} className="ml-auto text-neutral-300 dark:text-neutral-600" />
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div className="border-t border-neutral-100 dark:border-[#262626] px-4 py-2">
                                        <span className="text-xs text-neutral-400 dark:text-neutral-500">{t("dashboard.searchModal.escToClose", "Esc to close")}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* ── Top-nav travelling bubble ── */}
                        <div
                            className="hidden settings-container md:flex"
                            ref={topNavRef}
                            onMouseLeave={() => setTopNavHover(null)}
                        >
                            <div className="glass-bubble" style={topNavBubble} />
                            {topNavTabs.map((tab, i) => (
                                <button
                                    key={tab.label}
                                    id={`top-nav-${tab.label.toLowerCase()}`}
                                    onClick={() => navTo(tab.section)}
                                    onMouseEnter={() => setTopNavHover(i)}
                                    className={[
                                        "settings-pill relative z-10 px-3.5 py-1.5 text-sm whitespace-nowrap transition-colors",
                                        activeTopTab === tab.label ? "font-semibold text-neutral-900 dark:text-white" : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-300",
                                    ].join(" ")}
                                >
                                    {t(`dashboard.topNav.${tab.key}`, tab.label)}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Quick Language Selector */}
                        <div className="relative" ref={langDropdownRef}>
                            <button
                                id="header-language-btn"
                                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border border-neutral-200 dark:border-[#262626] bg-neutral-50 dark:bg-[#1a1a1a] text-neutral-700 dark:text-neutral-300 hover:border-neutral-400 dark:hover:border-neutral-500 transition-colors"
                                onClick={() => setShowLanguageDropdown(prev => !prev)}
                                title={t("dashboard.topNav.selectLanguage", "Change Language")}
                            >
                                <Globe size={13} className="text-neutral-500 dark:text-neutral-400" />
                                <span className="uppercase text-[11px] font-semibold">{language}</span>
                            </button>
                            {showLanguageDropdown && (
                                <div className="absolute right-0 top-[calc(100%+6px)] w-64 rounded-xl border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#1a1a1a] shadow-xl z-50 overflow-hidden p-1.5">
                                    <div className="px-3 py-2 border-b border-neutral-100 dark:border-[#262626] flex items-center justify-between">
                                        <span className="text-xs font-semibold text-neutral-900 dark:text-white">{t("settings.tabs.language", "Language")}</span>
                                        <button
                                            onClick={() => { setActiveSection("settings"); setShowLanguageDropdown(false); }}
                                            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            {t("dashboard.recentInvestigations.viewAll", "View all")}
                                        </button>
                                    </div>
                                    <div className="max-h-64 overflow-y-auto py-1">
                                        {LANGUAGES.filter(l => l.coverage === 'full' || l.coverage === 'priority').map(l => (
                                            <button
                                                key={l.code}
                                                onClick={() => { setLanguage(l.code); setShowLanguageDropdown(false); }}
                                                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-colors ${
                                                    language === l.code ? 'bg-neutral-100 dark:bg-[#262626] font-semibold text-neutral-900 dark:text-white' : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-[#212121]'
                                                }`}
                                            >
                                                <div className="flex flex-col">
                                                    <span>{l.name}</span>
                                                    <span className="text-[11px] text-neutral-400 font-normal" dir={l.direction || 'ltr'}>{l.nativeName}</span>
                                                </div>
                                                {language === l.code && <Check size={13} className="text-neutral-900 dark:text-white shrink-0 ml-2" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Themis Assistant header trigger */}
                        <button
                            id="header-themis-btn"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-neutral-200 dark:border-[#262626] bg-neutral-50 dark:bg-[#1a1a1a] text-neutral-700 dark:text-neutral-300 hover:border-[#FBC648] hover:text-[#FBC648] transition-colors"
                            onClick={() => {
                                setIsAssistantOpen(prev => !prev)
                                setAssistantMode("voice")
                            }}
                            title={`Themis Assistant (${osShortcuts.voiceKeyLabel} for Voice, ${osShortcuts.textKeyLabel} for Spotlight)`}
                        >
                            <Sparkles size={13} className="text-[#FBC648]" />
                            <span className="hidden sm:inline">{t("assistantUI.title", "Themis")}</span>
                            <span className="text-[10px] font-mono text-neutral-400 dark:text-neutral-500 bg-white dark:bg-[#262626] px-1.5 py-0.5 rounded-full border border-neutral-200 dark:border-[#333333]">
                                {osShortcuts.voiceKeyLabel}
                            </span>
                        </button>

                        {/* Help */}
                        <button
                            id="header-help-btn"
                            className="btn-icon relative flex h-8 w-8 items-center justify-center"
                            onClick={() => setShowFaq(true)}
                            title={t("nav.help", "Help & FAQ")}
                        >
                            <HelpCircle size={15} />
                        </button>

                        {/* Notification bell */}
                        <div className="relative" ref={notifRef}>
                            <button
                                id="header-notifications-btn"
                                className="btn-icon relative flex h-8 w-8 items-center justify-center"
                                onClick={handleToggleNotifications}
                                title={t("dashboard.notifications.title", "Recent activity")}
                            >
                                <Bell size={15} />
                                {hasUnread && (
                                    <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-neutral-700" />
                                )}
                            </button>

                            {showNotifications && (
                                <div className="absolute right-0 top-[calc(100%+6px)] w-80 rounded-xl border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#1a1a1a] shadow-xl z-50 overflow-hidden">
                                    <div className="flex items-center justify-between border-b border-neutral-100 dark:border-[#262626] px-4 py-3">
                                        <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">{t("dashboard.notifications.title", "Recent Activity")}</h3>
                                        <span className="text-xs text-neutral-400">{notifications.length} events</span>
                                    </div>
                                    <div className="max-h-80 overflow-y-auto">
                                        {notificationsLoading ? (
                                            <p className="px-4 py-6 text-center text-xs text-neutral-400">{t("common.loading", "Loading activity…")}</p>
                                        ) : notificationsError ? (
                                            <p className="px-4 py-6 text-center text-xs text-red-500">{notificationsError}</p>
                                        ) : notifications.length === 0 ? (
                                            <p className="px-4 py-6 text-center text-xs text-neutral-400">{t("dashboard.notifications.empty", "No recent activity.")}</p>
                                        ) : (
                                            <div className="divide-y divide-neutral-100 dark:divide-[#262626]">
                                                {notifications.map((n) => {
                                                    let dest: Section = "home"
                                                    if (n.type === "investigation") dest = "investigations"
                                                    else if (n.type === "agent_run") dest = "agents"
                                                    else if (n.type === "knowledge") dest = "audit"
                                                    else if (n.type === "document") dest = "investigations"
                                                    return (
                                                        <button
                                                            key={n.id}
                                                            onClick={() => { navTo(dest); setShowNotifications(false) }}
                                                            className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-[#212121] transition-colors"
                                                        >
                                                            <div className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-neutral-100 dark:bg-[#262626] flex items-center justify-center text-xs">
                                                                {n.type === "agent_run" ? "⚡" : n.type === "knowledge" ? "📚" : n.type === "document" ? "📄" : "🔍"}
                                                            </div>
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200 truncate">{n.title}</p>
                                                                <p className="mt-0.5 text-xs text-neutral-400 truncate">{n.detail}</p>
                                                            </div>
                                                            <span className="shrink-0 text-xs text-neutral-400">{n.time}</span>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        )}
                                    </div>
                                    <div className="border-t border-neutral-100 dark:border-[#262626] px-4 py-2">
                                        <button
                                            onClick={() => { navTo("audit"); setShowNotifications(false) }}
                                            className="text-xs text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                                        >
                                            {t("audit.title", "View full audit trail")} →
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </header>

                    <div className="flex-1 overflow-y-auto">

                    {isResearch ? (
                        <section className="p-5">
                            <Research />
                        </section>
                    ) : isAgents ? (
                        <section className="p-5 h-[calc(100vh-4rem)]">
                            <Agents />
                        </section>
                    ) : isInvestigations ? (
                        <section className="p-5">
                            <Investigations />
                        </section>
                    ) : isKnowledge ? (
                        <section className="p-5">
                            <Knowledge />
                        </section>
                    ) : isRegulations ? (
                        <section className="flex h-[calc(100vh-4rem)] flex-col">
                            <Regulations />
                        </section>
                    ) : isPolicies ? (
                        <section className="flex h-[calc(100vh-4rem)] flex-col">
                            <Policies />
                        </section>
                    ) : isCompliance ? (
                        <section className="flex h-[calc(100vh-4rem)] flex-col">
                            <Compliance />
                        </section>
                    ) : isAudit ? (
                        <section className="p-5">
                            <Audit />
                        </section>
                    ) : isReports ? (
                        <section className="p-5 h-full">
                            <Reports />
                        </section>
                    ) : isGovernance ? (
                        <section className="p-5">
                            <Governance />
                        </section>
                    ) : isIntegrations ? (
                        <section className="p-5">
                            <Integrations />
                        </section>
                    ) : activeSection === "settings" ? (
                        <section className="p-5">
                            <SettingsWorkspace user={user} onRefreshUser={fetchUser} />
                        </section>
                    ) : activeSection === "help" ? (
                        <section className="p-5">
                            <Help />
                        </section>
                    ) : (
                        <section className="p-5">
                            <HomeWorkspace
                                user={user}
                                activeSection={activeSection}
                                onOpenResearch={() => navTo("research")}
                                onOpenInvestigations={() => navTo("investigations")}
                                onOpenAgents={() => navTo("agents")}
                                onOpenAudit={() => navTo("audit")}
                            />
                        </section>
                    )}

                    {showProfile && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xs">
                            <div className="w-full max-w-sm rounded-2xl border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#171717] p-6 shadow-2xl transition-colors">
                                <div className="flex items-center justify-between mb-4">
                                    <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">{t("dashboard.profileModal.title", "Account Profile")}</h2>
                                    <button
                                        onClick={() => setShowProfile(false)}
                                        className="h-8 w-8 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-600 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-[#262626] transition-colors"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                                {modalError && (
                                    <p className="text-xs text-red-600 dark:text-red-400 mb-3 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg border border-red-200 dark:border-red-900/50">
                                        {modalError}
                                    </p>
                                )}
                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">{t("dashboard.profileModal.displayName", "Display Name")}</label>
                                        <input
                                            type="text"
                                            value={modalNameInput}
                                            onChange={(e) => setModalNameInput(e.target.value)}
                                            placeholder={t("dashboard.profileModal.displayNamePlaceholder", "Enter your name")}
                                            className="w-full rounded-full border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#212121] px-4 py-2 text-sm text-neutral-900 dark:text-white focus:border-[#FBC648] focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">{t("dashboard.profileModal.email", "Email (Permanent Identifier)")}</label>
                                        <div className="px-4 py-2 rounded-full bg-neutral-50 dark:bg-[#212121] border border-neutral-200 dark:border-[#262626] text-sm font-mono text-neutral-700 dark:text-neutral-300">
                                            {user?.email}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-1">{t("dashboard.profileModal.role", "Role")}</label>
                                        <div className="px-4 py-2 rounded-full bg-neutral-50 dark:bg-[#212121] border border-neutral-200 dark:border-[#262626] text-sm capitalize text-neutral-700 dark:text-neutral-300">
                                            {user?.role}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-6 flex justify-end gap-2 pt-4 border-t border-neutral-100 dark:border-[#262626]">
                                    <button
                                        className="rounded-full border border-neutral-200 dark:border-[#333333] px-4 py-2 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-[#212121] transition-colors"
                                        onClick={() => setShowProfile(false)}
                                    >
                                        {t("common.cancel", "Cancel")}
                                    </button>
                                    <button
                                        disabled={modalSaving || modalNameInput.trim() === (user?.full_name || "")}
                                        className="rounded-full bg-neutral-900 dark:bg-white px-5 py-2 text-xs font-semibold text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-40 transition-colors"
                                        onClick={async () => {
                                            const trimmed = modalNameInput.trim();
                                            if (!trimmed) {
                                                setModalError(t("dashboard.profileModal.emptyNameError", "Full Name cannot be empty."));
                                                return;
                                            }
                                            setModalSaving(true);
                                            setModalError(null);
                                            try {
                                                const token = localStorage.getItem("access_token") ?? "";
                                                const res = await fetch("http://127.0.0.1:8000/api/v1/auth/profile", {
                                                    method: "PUT",
                                                    headers: {
                                                        "Content-Type": "application/json",
                                                        Authorization: `Bearer ${token}`
                                                    },
                                                    body: JSON.stringify({ full_name: trimmed })
                                                });
                                                if (!res.ok) {
                                                    const data = await res.json();
                                                    throw new Error(data.detail || "Failed to update profile");
                                                }
                                                const updated = await res.json();
                                                setUser((prev: any) => prev ? { ...prev, full_name: updated.full_name } : updated);
                                                setShowProfile(false);
                                            } catch (err: any) {
                                                setModalError(err.message || "Failed to update profile.");
                                            } finally {
                                                setModalSaving(false);
                                            }
                                        }}
                                    >
                                        {modalSaving ? t("dashboard.profileModal.saving", "Saving...") : t("dashboard.profileModal.save", "Save Changes")}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {showFaq && (
                        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xs">
                            <div className="w-full max-w-md rounded-2xl border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#171717] p-6 shadow-2xl transition-colors">
                                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white mb-4">Frequently Asked Questions</h2>
                                <div className="space-y-4">
                                    <div>
                                        <h3 className="text-sm font-medium text-neutral-900 dark:text-white mb-1">What is OpusLex?</h3>
                                        <p className="text-sm text-neutral-600 dark:text-neutral-400">OpusLex is a legal compliance and research assistant that helps you stay on top of regulations, policies, and internal audits using AI.</p>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-neutral-900 dark:text-white mb-1">How does the Themis Assistant work?</h3>
                                        <p className="text-sm text-neutral-600 dark:text-neutral-400">Themis provides contextual legal research, citations, and action executions with four authorization tiers and explicit confirmations.</p>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-medium text-neutral-900 dark:text-white mb-1">Where is my data stored?</h3>
                                        <p className="text-sm text-neutral-600 dark:text-neutral-400">Your data remains in your designated workspace environment and is never used to train base models.</p>
                                    </div>
                                </div>
                                <div className="mt-6 flex justify-end pt-4 border-t border-neutral-100 dark:border-[#262626]">
                                    <button className="rounded-full bg-neutral-900 dark:bg-white px-5 py-2 text-xs font-semibold text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors" onClick={() => setShowFaq(false)}>Close</button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── AI Assistant (Themis) Centered Overlay & Spotlight ── */}
                    {assistantEnabled && (
                        <AssistantPanel
                            isOpen={isAssistantOpen}
                            onClose={() => setIsAssistantOpen(false)}
                            mode={assistantMode}
                            setMode={setAssistantMode}
                            orbState={assistantOrbState}
                            setOrbState={setAssistantOrbState}
                            activeSection={activeSection}
                            permissionLevel={assistantPermissionLevel}
                            voiceEnabled={assistantVoiceEnabled}
                            onToggleVoice={() => setAssistantVoiceEnabled(prev => !prev)}
                        />
                    )}
                </div>
            </main>
        </div>
    )
}

export default Dashboard
