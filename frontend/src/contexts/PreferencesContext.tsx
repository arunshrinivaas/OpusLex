import React, { createContext, useContext, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { isSupportedLanguageCode, getLanguageByCode } from "../i18n/languages"

export type FontSize = "xs" | "s" | "m" | "l" | "xl"
export type TranscriptFontSize = "s" | "m" | "l" | "xl"
export type Density = "comfortable" | "compact"
export type LandingSection = "home" | "research" | "investigations" | "agents" | "audit" | "governance"
export type ThemeMode = "light" | "dark" | "auto"

export type NotificationCategory = "investigation" | "agent_run" | "knowledge" | "security"
export type NotificationPrefs = Record<NotificationCategory, { inApp: boolean; email: boolean }>

const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
    investigation: { inApp: true, email: true },
    agent_run: { inApp: true, email: true },
    knowledge: { inApp: true, email: false },
    security: { inApp: true, email: true },
}

type PreferencesContextType = {
    fontSize: FontSize
    setFontSize: (size: FontSize) => void
    transcriptFontSize: TranscriptFontSize
    setTranscriptFontSize: (size: TranscriptFontSize) => void
    density: Density
    setDensity: (d: Density) => void
    landingSection: LandingSection
    setLandingSection: (s: LandingSection) => void
    theme: ThemeMode
    setTheme: (t: ThemeMode) => void
    resolvedTheme: "light" | "dark"
    reduceMotion: boolean
    setReduceMotion: (v: boolean) => void
    largerTargets: boolean
    setLargerTargets: (v: boolean) => void
    highContrast: boolean
    setHighContrast: (v: boolean) => void
    navConfig: { id: string, hidden: boolean }[] | null
    setNavConfig: (config: { id: string, hidden: boolean }[] | null) => void
    notificationPrefs: NotificationPrefs
    setNotificationPrefs: (n: NotificationPrefs) => void
    language: string
    setLanguage: (lang: string) => void
    workspaceName: string | null
    setWorkspaceName: (name: string) => void
}

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined)

function readLS<T>(key: string, fallback: T, allowed?: T[]): T {
    try {
        const saved = localStorage.getItem(key) as T | null
        if (saved && (!allowed || allowed.includes(saved))) return saved
    } catch {}
    return fallback
}

export function PreferencesProvider({ children }: { children: React.ReactNode }) {
    const [fontSize, setFontSizeState] = useState<FontSize>(() =>
        readLS<FontSize>("pref_font_size", "m", ["xs", "s", "m", "l", "xl"])
    )
    const [transcriptFontSize, setTranscriptFontSizeState] = useState<TranscriptFontSize>(() =>
        readLS<TranscriptFontSize>("pref_transcript_font_size", "m", ["s", "m", "l", "xl"])
    )
    const [density, setDensityState] = useState<Density>(() =>
        readLS<Density>("pref_density", "comfortable", ["comfortable", "compact"])
    )
    const [landingSection, setLandingSectionState] = useState<LandingSection>(() =>
        readLS<LandingSection>("pref_landing", "home", ["home", "research", "investigations", "agents", "audit", "governance"])
    )
    const [theme, setThemeState] = useState<ThemeMode>(() =>
        readLS<ThemeMode>("pref_theme", "auto", ["light", "dark", "auto"])
    )
    const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
        if (typeof window === "undefined" || !window.matchMedia) return false
        return window.matchMedia("(prefers-color-scheme: dark)").matches
    })

    // Listen to system preference changes dynamically when in Auto mode
    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return
        const mq = window.matchMedia("(prefers-color-scheme: dark)")
        const handler = (e: MediaQueryListEvent) => {
            setSystemPrefersDark(e.matches)
        }
        mq.addEventListener("change", handler)
        return () => mq.removeEventListener("change", handler)
    }, [])

    const resolvedTheme: "light" | "dark" =
        theme === "auto" ? (systemPrefersDark ? "dark" : "light") : theme

    // Apply global theme classes and data attributes
    useEffect(() => {
        localStorage.setItem("pref_theme", theme)
        document.documentElement.setAttribute("data-theme-pref", theme)
        document.documentElement.setAttribute("data-theme-mode", resolvedTheme)
        if (resolvedTheme === "dark") {
            document.documentElement.classList.add("dark")
        } else {
            document.documentElement.classList.remove("dark")
        }
    }, [theme, resolvedTheme])

    const [reduceMotion, setReduceMotionState] = useState<boolean>(() => {
        const saved = localStorage.getItem("pref_reduce_motion")
        if (saved !== null) return saved === "true"
        // Also respect OS preference
        return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    })
    const [largerTargets, setLargerTargetsState] = useState<boolean>(() =>
        localStorage.getItem("pref_larger_targets") === "true"
    )
    const [highContrast, setHighContrastState] = useState<boolean>(() =>
        localStorage.getItem("pref_high_contrast") === "true"
    )
    const [navConfig, setNavConfigState] = useState<{ id: string, hidden: boolean }[] | null>(() => {
        try {
            const saved = localStorage.getItem("pref_nav_config")
            if (saved) return JSON.parse(saved)
        } catch {}
        return null
    })
    const [notificationPrefs, setNotificationPrefsState] = useState<NotificationPrefs>(() => {
        try {
            const saved = localStorage.getItem("pref_notifications")
            if (saved) return { ...DEFAULT_NOTIFICATIONS, ...JSON.parse(saved) }
        } catch {}
        return DEFAULT_NOTIFICATIONS
    })
    const [language, setLanguageState] = useState<string>(() => {
        const saved = localStorage.getItem("pref_language")
        if (saved && isSupportedLanguageCode(saved)) return saved
        return "en"
    })
    const [workspaceName, setWorkspaceNameState] = useState<string | null>(() => {
        const stored = localStorage.getItem("pref_workspace_name")
        if (stored !== null) return stored
        return null
    })
    const { i18n } = useTranslation()

    // Apply font size
    useEffect(() => {
        localStorage.setItem("pref_font_size", fontSize)
        // Also keep legacy key for backward compat
        localStorage.setItem("font_size", fontSize)
        document.documentElement.setAttribute("data-theme-size", fontSize)
    }, [fontSize])

    // Apply transcript font size
    useEffect(() => {
        localStorage.setItem("pref_transcript_font_size", transcriptFontSize)
        document.documentElement.setAttribute("data-transcript-size", transcriptFontSize)
    }, [transcriptFontSize])

    // Apply density
    useEffect(() => {
        localStorage.setItem("pref_density", density)
        document.documentElement.setAttribute("data-density", density)
    }, [density])

    // Apply reduce motion
    useEffect(() => {
        localStorage.setItem("pref_reduce_motion", String(reduceMotion))
        document.documentElement.setAttribute("data-reduce-motion", String(reduceMotion))
    }, [reduceMotion])

    // Apply larger targets
    useEffect(() => {
        localStorage.setItem("pref_larger_targets", String(largerTargets))
        if (largerTargets) {
            document.documentElement.classList.add("larger-targets")
        } else {
            document.documentElement.classList.remove("larger-targets")
        }
    }, [largerTargets])

    // Apply high contrast
    useEffect(() => {
        localStorage.setItem("pref_high_contrast", String(highContrast))
        if (highContrast) {
            document.documentElement.classList.add("high-contrast")
        } else {
            document.documentElement.classList.remove("high-contrast")
        }
    }, [highContrast])

    // Apply nav config
    useEffect(() => {
        if (navConfig === null) {
            localStorage.removeItem("pref_nav_config")
        } else {
            localStorage.setItem("pref_nav_config", JSON.stringify(navConfig))
        }
    }, [navConfig])

    // Apply notification prefs
    useEffect(() => {
        localStorage.setItem("pref_notifications", JSON.stringify(notificationPrefs))
    }, [notificationPrefs])

    // Apply landing section
    useEffect(() => {
        localStorage.setItem("pref_landing", landingSection)
    }, [landingSection])

    // Apply language
    useEffect(() => {
        localStorage.setItem("pref_language", language)
        i18n.changeLanguage(language)
        if (typeof document !== 'undefined') {
            const entry = getLanguageByCode(language)
            document.documentElement.dir = entry.direction || 'ltr'
            document.documentElement.lang = language
        }
    }, [language, i18n])

    // Apply workspace name
    useEffect(() => {
        if (workspaceName !== null) {
            localStorage.setItem("pref_workspace_name", workspaceName)
        }
    }, [workspaceName])

    const setFontSize = (size: FontSize) => setFontSizeState(size)
    const setTranscriptFontSize = (size: TranscriptFontSize) => setTranscriptFontSizeState(size)
    const setDensity = (d: Density) => setDensityState(d)
    const setLandingSection = (s: LandingSection) => setLandingSectionState(s)
    const setTheme = (t: ThemeMode) => setThemeState(t)
    const setReduceMotion = (v: boolean) => setReduceMotionState(v)
    const setLargerTargets = (v: boolean) => setLargerTargetsState(v)
    const setHighContrast = (v: boolean) => setHighContrastState(v)
    const setNavConfig = (config: { id: string, hidden: boolean }[] | null) => setNavConfigState(config)
    const setNotificationPrefs = (n: NotificationPrefs) => setNotificationPrefsState(n)
    const setLanguage = (lang: string) => setLanguageState(lang)
    const setWorkspaceName = (name: string) => setWorkspaceNameState(name)

    return (
        <PreferencesContext.Provider value={{
            fontSize, setFontSize,
            transcriptFontSize, setTranscriptFontSize,
            density, setDensity,
            landingSection, setLandingSection,
            theme, setTheme, resolvedTheme,
            reduceMotion, setReduceMotion,
            largerTargets, setLargerTargets,
            highContrast, setHighContrast,
            navConfig, setNavConfig,
            notificationPrefs, setNotificationPrefs,
            language, setLanguage,
            workspaceName, setWorkspaceName,
        }}>
            {children}
        </PreferencesContext.Provider>
    )
}

export function usePreferences() {
    const context = useContext(PreferencesContext)
    if (context === undefined) {
        throw new Error("usePreferences must be used within a PreferencesProvider")
    }
    return context
}
