import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import { AlertCircle, Cloud, HardDrive, Share2, Archive, FolderOpen, Loader2 } from "lucide-react"
import GoogleDrivePicker from "./GoogleDrivePicker"

type IntegrationCard = {
    id: string
    name: string
    description: string
    icon: React.ReactNode
    status: "not-configured" | "coming-soon" | "connected"
    message?: string
    badgeLabel: string
    bgColor: string
}

function Integrations() {
    const { t } = useTranslation()
    const [message, setMessage] = useState("")
    const [driveStatus, setDriveStatus] = useState<any>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const token = localStorage.getItem("access_token")
                const res = await fetch("http://localhost:8000/api/v1/integrations/google-drive/status", {
                    headers: { "Authorization": `Bearer ${token}` }
                })
                if (res.ok) {
                    const data = await res.json()
                    setDriveStatus(data)
                }
            } catch (error) {
                console.error("Failed to fetch integration status", error)
            } finally {
                setLoading(false)
            }
        }
        fetchStatus()
    }, [])

    const handleConnectDrive = async () => {
        try {
            const token = localStorage.getItem("access_token")
            const res = await fetch("http://localhost:8000/api/v1/integrations/google-drive/auth-url", {
                headers: { "Authorization": `Bearer ${token}` }
            })
            if (res.ok) {
                const data = await res.json()
                localStorage.setItem("google_oauth_state", data.state)
                window.location.href = data.auth_url
            } else {
                setMessage("Failed to start Google Drive connection.")
            }
        } catch (error) {
            setMessage("Failed to communicate with server.")
        }
    }

    const handleDisconnectDrive = async () => {
        if (!window.confirm(`${t("integrations.disconnect", "Disconnect")}?`)) return
        try {
            const token = localStorage.getItem("access_token")
            const res = await fetch("http://localhost:8000/api/v1/integrations/google-drive", {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${token}` }
            })
            if (res.ok) {
                setDriveStatus({ connected: false })
            } else {
                setMessage("Failed to disconnect Google Drive.")
            }
        } catch (error) {
            setMessage("Failed to communicate with server.")
        }
    }

    // Handle OAuth Callback
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search)
        const code = urlParams.get("code")
        const state = urlParams.get("state")

        if (code && state) {
            // Unconditionally clean the URL immediately to prevent stale state loops on refresh
            window.history.replaceState({}, document.title, window.location.pathname)

            const expectedState = localStorage.getItem("google_oauth_state")
            if (state !== expectedState) {
                setMessage("Invalid OAuth state. Please try connecting again.")
                return
            }

            const exchangeCode = async () => {
                try {
                    const token = localStorage.getItem("access_token")
                    const res = await fetch("http://localhost:8000/api/v1/integrations/google-drive/callback", {
                        method: "POST",
                        headers: {
                            "Authorization": `Bearer ${token}`,
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify({ code, state, expected_state: expectedState })
                    })

                    if (res.ok) {
                        setDriveStatus((prev: any) => ({ ...prev, connected: true }))
                        setMessage("Successfully connected Google Drive.")
                    } else {
                        setMessage("Failed to complete Google Drive connection.")
                    }
                } catch (error) {
                    setMessage("Failed to communicate with server during callback.")
                }
            }

            exchangeCode()
        }
    }, [])

    const cards: IntegrationCard[] = [
        {
            id: "google-drive",
            name: t("integrations.googleDrive", "Google Drive"),
            description: driveStatus?.connected
                ? `${t("integrations.connected", "Connected to")} ${driveStatus.provider_account_id}`
                : "Import legal documents and evidence directly from Google Drive.",
            icon: <HardDrive size={18} className="text-neutral-700" />,
            status: driveStatus?.connected ? "connected" : "not-configured",
            badgeLabel: driveStatus?.connected ? t("integrations.connected", "Connected") : t("integrations.notConnected", "Not Configured"),
            bgColor: driveStatus?.connected ? "bg-green-50" : "bg-neutral-100",
        },
        {
            id: "dropbox",
            name: "Dropbox",
            description: "Sync shared folders and files from your Dropbox workspace. Requires Dropbox API credentials.",
            icon: <Cloud size={18} className="text-neutral-700" />,
            status: "not-configured",
            badgeLabel: t("integrations.notConnected", "Not Configured"),
            bgColor: "bg-neutral-100",
            message: "Dropbox integration requires backend API credentials and webhook infrastructure which have not yet been configured.",
        },
        {
            id: "box",
            name: t("integrations.box", "Box"),
            description: "Connect your Box workspace to import and manage legal files and folders at scale.",
            icon: <Archive size={18} className="text-neutral-700" />,
            status: "coming-soon",
            badgeLabel: t("settings.appearance.theme.comingSoon", "Coming Soon"),
            bgColor: "bg-neutral-100",
            message: "Box integration is planned for a future release.",
        },
        {
            id: "onedrive",
            name: t("integrations.oneDrive", "Microsoft OneDrive"),
            description: "Connect your Microsoft 365 OneDrive to bring documents into your compliance workspace.",
            icon: <FolderOpen size={18} className="text-blue-700" />,
            status: "coming-soon",
            badgeLabel: t("settings.appearance.theme.comingSoon", "Coming Soon"),
            bgColor: "bg-blue-50",
            message: "OneDrive integration with Microsoft 365 OAuth is planned for a future release.",
        },
        {
            id: "sharepoint",
            name: "SharePoint",
            description: "Sync document libraries from Microsoft SharePoint for centralized legal and compliance management.",
            icon: <Share2 size={18} className="text-blue-700" />,
            status: "coming-soon",
            badgeLabel: t("settings.appearance.theme.comingSoon", "Coming Soon"),
            bgColor: "bg-blue-50",
            message: "SharePoint integration is planned for a future release and will support CSOM and Graph API.",
        },
    ]

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="animate-spin text-neutral-400" />
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <Share2 size={15} className="text-neutral-500" />
                    <span className="text-xs font-medium uppercase tracking-[0.14em] text-neutral-400">
                        {t("nav.integrations", "Integrations")}
                    </span>
                </div>
                <h1 className="text-xl font-semibold tracking-tight">{t("integrations.title", "External Data Sources")}</h1>
                <p className="mt-1 text-sm text-neutral-500">
                    {t("integrations.subtitle", "Connect external repositories to securely import and sync documents into your workspace.")}
                </p>
            </div>

            {message && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <div>
                        <p className="font-medium mb-0.5">Integration Update</p>
                        <p>{message}</p>
                    </div>
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {cards.map(card => (
                    <div key={card.id} className="rounded-xl border border-neutral-200 bg-white p-5 flex flex-col h-full">
                        <div className="flex items-start justify-between mb-4">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${card.bgColor}`}>
                                {card.icon}
                            </div>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                card.status === "coming-soon"
                                    ? "bg-blue-50 text-blue-600"
                                    : card.status === "connected"
                                    ? "bg-green-100 text-green-700"
                                    : "bg-neutral-100 text-neutral-600"
                            }`}>
                                {card.badgeLabel}
                            </span>
                        </div>

                        <h2 className="text-sm font-semibold text-neutral-900 mb-1">{card.name}</h2>
                        <p className="text-sm text-neutral-500 mb-4 flex-1">{card.description}</p>

                        <div className="mt-auto border-t border-neutral-100 pt-4">
                            {card.id === "google-drive" ? (
                                card.status === "connected" ? (
                                    <div className="space-y-2">
                                        <button
                                            onClick={() => window.dispatchEvent(new CustomEvent("open-google-picker", { detail: { token: driveStatus.access_token } }))}
                                            className="w-full rounded-lg border border-neutral-200 bg-white text-neutral-700 px-3 py-2 text-sm font-medium hover:bg-neutral-50 transition"
                                        >
                                            {t("common.add", "Import")} {t("integrations.googleDrive", "Google Drive")}
                                        </button>
                                        <button
                                            onClick={handleDisconnectDrive}
                                            className="w-full rounded-lg border border-red-200 bg-red-50 text-red-600 px-3 py-2 text-sm font-medium hover:bg-red-100 transition"
                                        >
                                            {t("integrations.disconnect", "Disconnect")}
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleConnectDrive}
                                        className="w-full rounded-lg border border-neutral-200 bg-white text-neutral-700 px-3 py-2 text-sm font-medium hover:bg-neutral-50 transition"
                                    >
                                        {t("integrations.connect", "Connect")} {t("integrations.googleDrive", "Google Drive")}
                                    </button>
                                )
                            ) : (
                                <button
                                    onClick={() => setMessage(card.message || "")}
                                    disabled={card.status === "coming-soon"}
                                    className={`w-full rounded-lg border px-3 py-2 text-sm font-medium transition ${
                                        card.status === "coming-soon"
                                            ? "border-neutral-100 bg-neutral-50 text-neutral-400 cursor-not-allowed"
                                            : "border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50"
                                    }`}
                                >
                                    {card.status === "coming-soon" ? t("settings.appearance.theme.comingSoon", "Coming Soon") : t("integrations.connect", "Connect Account")}
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Google Picker Component will be mounted outside but triggered via event */}
            <GoogleDrivePicker />
        </div>
    )
}

export default Integrations
