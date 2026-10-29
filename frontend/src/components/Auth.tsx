import React, { useState, useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import logoWhite from "../assets/OpusLexLogoWhite.png"
import logoLight from "../assets/OpusLexLogoLight.png"

import { Smartphone, ArrowLeft, Loader2, Mail, Globe, Check } from "lucide-react"
import { TermsPage, PrivacyPage, CookiesPage } from "./PolicyPages"
import { usePreferences } from "../contexts/PreferencesContext"
import { LANGUAGES } from "../i18n/languages"
import { getApiUrl } from "../utils/api"

type AuthProps = {
    onLoginSuccess: () => void
}

const VIDEO_ASSET_VERSION = "2"

const VIDEO_SOURCES = [
    `/videos/law1.mp4?v=${VIDEO_ASSET_VERSION}`,
    `/videos/law2.mp4?v=${VIDEO_ASSET_VERSION}`,
    `/videos/law3.mp4?v=${VIDEO_ASSET_VERSION}`
]

export default function Auth({ onLoginSuccess }: AuthProps) {
    const { t } = useTranslation()
    const { language, setLanguage } = usePreferences()
    const [showLanguageDropdown, setShowLanguageDropdown] = useState(false)
    const langDropdownRef = useRef<HTMLDivElement>(null)

    const [loginStage, setLoginStage] = useState<'initial' | 'providers' | 'email' | 'mfa' | 'email-otp' | 'email-otp-verify'>('initial')
    const [policyRoute, setPolicyRoute] = useState<'terms' | 'privacy' | 'cookies' | null>(null)
    const [email, setEmail] = useState("")
    const [fullName, setFullName] = useState("")
    const [password, setPassword] = useState("")
    const [mfaToken, setMfaToken] = useState("")
    const [mfaCode, setMfaCode] = useState("")
    const [otpCode, setOtpCode] = useState("")
    const [resendCooldown, setResendCooldown] = useState(0)
    const [message, setMessage] = useState("")
    const [isRegistering, setIsRegistering] = useState(false)
    const [authLoading, setAuthLoading] = useState<string | null>(null)
    const [isDarkBackground, setIsDarkBackground] = useState(true)
    const [activeVideoIndex, setActiveVideoIndex] = useState(0)
    const [autoplayFailed, setAutoplayFailed] = useState(false)

    const videoRef = useRef<HTMLVideoElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [isGsiLoaded, setIsGsiLoaded] = useState(false)
    const [isAppleSdkLoaded, setIsAppleSdkLoaded] = useState(false)
    const googleButtonRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
                setShowLanguageDropdown(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [resendCooldown]);

    useEffect(() => {
        if (loginStage === 'providers' && isGsiLoaded && googleButtonRef.current) {
            const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
            if (!clientId) {
                setMessage("Google Client ID is not configured.");
                return;
            }
            // @ts-ignore
            if (window.google && window.google.accounts) {
                // @ts-ignore
                window.google.accounts.id.renderButton(
                    googleButtonRef.current,
                    { theme: "outline", size: "large", shape: "pill", width: 312 }
                );
            }
        }
    }, [loginStage, isGsiLoaded]);

    const hasInitializedGsi = useRef(false);

    // Load Google Identity Services script
    useEffect(() => {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

        const initGsi = () => {
            if (!clientId) {
                setIsGsiLoaded(true);
                return;
            }
            if (hasInitializedGsi.current) {
                setIsGsiLoaded(true);
                return;
            }
            // @ts-ignore
            if (window.google && window.google.accounts) {
                hasInitializedGsi.current = true;
                // @ts-ignore
                window.google.accounts.id.initialize({
                    client_id: clientId,
                    callback: handleGoogleCredential,
                    ux_mode: "popup"
                });
                setIsGsiLoaded(true);
            }
        };

        const existingScript = document.getElementById("gsi-client-script");
        if (existingScript) {
            // @ts-ignore
            if (window.google) initGsi();
            else existingScript.addEventListener("load", initGsi);
            return;
        }

        const script = document.createElement("script");
        script.id = "gsi-client-script";
        script.src = "https://accounts.google.com/gsi/client";
        script.async = true;
        script.defer = true;
        script.onload = initGsi;
        document.head.appendChild(script);
    }, []);

    // Load Apple Identity Services script
    useEffect(() => {
        const clientId = import.meta.env.VITE_APPLE_CLIENT_ID;

        const initApple = () => {
            if (!clientId) {
                setIsAppleSdkLoaded(true);
                return;
            }
            // @ts-ignore
            if (window.AppleID && window.AppleID.auth) {
                // @ts-ignore
                window.AppleID.auth.init({
                    clientId: clientId,
                    scope: 'name email',
                    redirectURI: window.location.origin,
                    usePopup: true
                });
                setIsAppleSdkLoaded(true);
            }
        };

        const existingScript = document.getElementById("apple-auth-script");
        if (existingScript) {
            // @ts-ignore
            if (window.AppleID) initApple();
            else existingScript.addEventListener("load", initApple);
            return;
        }

        const script = document.createElement("script");
        script.id = "apple-auth-script";
        script.src = "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";
        script.async = true;
        script.defer = true;
        script.onload = initApple;
        document.head.appendChild(script);
    }, []);

    const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

    // Configure video for maximum Safari compatibility and provide one fallback play attempt
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Establish strict properties before any programmatic interaction
        video.muted = true;
        video.defaultMuted = true;
        video.playsInline = true;

        // Provide a single controlled fallback if declarative autoplay fails
        const ensurePlayback = async () => {
            if (video.paused) {
                try {
                    await video.play();
                } catch (error: any) {
                    console.warn("Background video autoplay was blocked", error);
                    if (error.name === 'NotAllowedError') {
                        setAutoplayFailed(true);
                    }
                }
            }
        };

        ensurePlayback();
    }, [activeVideoIndex]);

    // Handle user interaction fallback for Safari
    useEffect(() => {
        if (!autoplayFailed) return;

        const handleUserInteraction = () => {
            const video = videoRef.current;
            if (!video) return;

            const playPromise = video.play();

            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        setAutoplayFailed(false);
                    })
                    .catch(() => {
                        // Ignore subsequent failures, leave poster displayed
                    });
            } else {
                setAutoplayFailed(false);
            }

            document.removeEventListener('click', handleUserInteraction, true);
            document.removeEventListener('touchend', handleUserInteraction, true);
            document.removeEventListener('keydown', handleUserInteraction, true);
        };

        document.addEventListener('click', handleUserInteraction, true);
        document.addEventListener('touchend', handleUserInteraction, true);
        document.addEventListener('keydown', handleUserInteraction, true);

        return () => {
            document.removeEventListener('click', handleUserInteraction, true);
            document.removeEventListener('touchend', handleUserInteraction, true);
            document.removeEventListener('keydown', handleUserInteraction, true);
        };
    }, [autoplayFailed]);

    // Video luminance detection
    useEffect(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return;

        let animationFrameId: number;
        let lastSampleTime = 0;

        const sampleLuminance = (timestamp: number) => {
            if (timestamp - lastSampleTime > 500) {
                lastSampleTime = timestamp;
                if (video.readyState >= 2) {
                    try {
                        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        const data = imageData.data;
                        let r = 0, g = 0, b = 0;
                        for (let i = 0; i < data.length; i += 4) {
                            r += data[i];
                            g += data[i + 1];
                            b += data[i + 2];
                        }
                        const pixels = data.length / 4;
                        const luminance = (0.2126 * (r / pixels) + 0.7152 * (g / pixels) + 0.0722 * (b / pixels));

                        // Hysteresis
                        setIsDarkBackground(prev => {
                            if (luminance < 110) return true;
                            if (luminance > 140) return false;
                            return prev;
                        });
                    } catch (e) {
                        // Ignore CORS or canvas errors safely
                    }
                }
            }
            animationFrameId = requestAnimationFrame(sampleLuminance);
        };

        animationFrameId = requestAnimationFrame(sampleLuminance);
        return () => cancelAnimationFrame(animationFrameId);
    }, [activeVideoIndex]);

    const handleSendOtp = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!email.trim()) {
            setMessage("Please enter an email address.");
            return;
        }
        setMessage("Sending verification code…");
        setAuthLoading("email-otp");
        try {
            const response = await fetch(getApiUrl("/api/v1/auth/email-otp/send"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim() }),
            });
            const data = await response.json();
            if (!response.ok) {
                if (response.status === 429) {
                    setMessage("Too many requests. Please wait before requesting another code.");
                } else {
                    setMessage(data.detail || "Failed to send verification code.");
                }
                return;
            }
            setMessage("Verification code sent.");
            setOtpCode("");
            setResendCooldown(60);
            setLoginStage('email-otp-verify');
        } catch {
            setMessage("Unable to connect to the backend");
        } finally {
            setAuthLoading(null);
        }
    };

    const handleVerifyOtp = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (otpCode.trim().length !== 6) {
            setMessage("Please enter a 6-digit verification code.");
            return;
        }
        setMessage("Verifying code…");
        setAuthLoading("email-otp-verify");
        try {
            const response = await fetch(getApiUrl("/api/v1/auth/email-otp/verify"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), code: otpCode.trim() }),
            });
            const data = await response.json();
            if (!response.ok) {
                if (response.status === 429) {
                    setMessage("Too many requests. Please wait before requesting another code.");
                } else {
                    setMessage("Invalid or expired verification code.");
                }
                return;
            }
            if (data.mfa_required) {
                setMfaToken(data.mfa_token);
                setMfaCode("");
                setMessage("");
                setLoginStage('mfa');
                return;
            }
            localStorage.setItem("access_token", data.access_token);
            localStorage.setItem("current_user", JSON.stringify(data.user));
            setMessage(`Welcome, ${data.user.full_name || data.user.email}!`);
            onLoginSuccess();
        } catch {
            setMessage("Unable to connect to the backend");
        } finally {
            setAuthLoading(null);
        }
    };

    const handleLogin = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setMessage("Signing in…");
        setAuthLoading("email");
        try {
            const response = await fetch(getApiUrl("/api/v1/auth/login"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });
            const data = await response.json();
            if (!response.ok) { setMessage(data.detail || "Login failed"); return; }

            if (data.mfa_required) {
                setMfaToken(data.mfa_token);
                setMfaCode("");
                setMessage("");
                setLoginStage('mfa');
                return;
            }

            localStorage.setItem("access_token", data.access_token);
            localStorage.setItem("current_user", JSON.stringify(data.user));
            setMessage(`Welcome, ${data.user.full_name || data.user.email}!`);
            onLoginSuccess();
        } catch {
            setMessage("Unable to connect to the backend");
        } finally {
            setAuthLoading(null);
        }
    };

    const handleMfaVerify = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (mfaCode.trim().length !== 6) {
            setMessage("Please enter a 6-digit authentication code.");
            return;
        }
        setMessage("Verifying code…");
        setAuthLoading("mfa");
        try {
            const response = await fetch(getApiUrl("/api/v1/auth/login/mfa"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ mfa_token: mfaToken, code: mfaCode.trim() }),
            });
            const data = await response.json();
            if (!response.ok) {
                setMessage(data.detail || "Invalid verification code.");
                return;
            }
            localStorage.setItem("access_token", data.access_token);
            localStorage.setItem("current_user", JSON.stringify(data.user));
            setMessage(`Welcome, ${data.user.full_name || data.user.email}!`);
            onLoginSuccess();
        } catch {
            setMessage("Unable to connect to the backend");
        } finally {
            setAuthLoading(null);
        }
    };

    const handleRegister = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setMessage("Creating account…");
        setAuthLoading("email");
        try {
            const response = await fetch(getApiUrl("/api/v1/auth/register"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password, full_name: fullName }),
            });
            const data = await response.json();
            if (!response.ok) { setMessage(data.detail || "Registration failed"); return; }
            setMessage("Account created successfully!");
            setIsRegistering(false);
            setFullName("");
            setPassword("");
        } catch {
            setMessage("Unable to connect to the backend");
        } finally {
            setAuthLoading(null);
        }
    };

    const handleGoogleCredential = async (response: any) => {
        // @ts-ignore
        window.__handleGoogleCredential = handleGoogleCredential;
        if (!response.credential) {
            setMessage("Google Sign-In failed.");
            setAuthLoading(null);
            return;
        }
        try {
            const res = await fetch(getApiUrl("/api/v1/auth/google"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id_token: response.credential }),
            });
            const data = await res.json();
            if (!res.ok) {
                setMessage(data.detail || "Google Sign-In failed.");
                setAuthLoading(null);
                return;
            }
            if (data.mfa_required) {
                setMfaToken(data.mfa_token);
                setMfaCode("");
                setMessage("");
                setLoginStage('mfa');
                setAuthLoading(null);
                return;
            }
            localStorage.setItem("access_token", data.access_token);
            localStorage.setItem("current_user", JSON.stringify(data.user));
            setMessage(`Welcome, ${data.user.full_name || data.user.email}!`);
            onLoginSuccess();
        } catch {
            setMessage("Unable to connect to the backend");
            setAuthLoading(null);
        }
    };

    const handleAppleSignIn = async () => {
        if (!isAppleSdkLoaded) return;
        try {
            // @ts-ignore
            const response = await window.AppleID.auth.signIn();
            await handleAppleCredential(response);
        } catch (error) {
            // Error typically occurs when user cancels
            setMessage("Apple Sign-In cancelled or failed.");
        }
    };

    const handleAppleCredential = async (response: any) => {
        if (!response.authorization || !response.authorization.id_token) {
            setMessage("Apple Sign-In failed.");
            setAuthLoading(null);
            return;
        }

        let payload: any = { id_token: response.authorization.id_token };
        if (response.user) {
            try {
                const userObj = typeof response.user === 'string' ? JSON.parse(response.user) : response.user;
                if (userObj.name) {
                    payload.first_name = userObj.name.firstName;
                    payload.last_name = userObj.name.lastName;
                }
            } catch (e) {
            }
        }

        try {
            const res = await fetch(getApiUrl("/api/v1/auth/apple"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) {
                setMessage(data.detail || "Apple Sign-In failed.");
                setAuthLoading(null);
                return;
            }
            if (data.mfa_required) {
                setMfaToken(data.mfa_token);
                setMfaCode("");
                setMessage("");
                setLoginStage('mfa');
                setAuthLoading(null);
                return;
            }
            localStorage.setItem("access_token", data.access_token);
            localStorage.setItem("current_user", JSON.stringify(data.user));
            setMessage(`Welcome, ${data.user.full_name || data.user.email}!`);
            onLoginSuccess();
        } catch {
            setMessage("Unable to connect to the backend");
            setAuthLoading(null);
        }
    };

    if (policyRoute === 'terms') return <TermsPage onBack={() => setPolicyRoute(null)} />
    if (policyRoute === 'privacy') return <PrivacyPage onBack={() => setPolicyRoute(null)} />
    if (policyRoute === 'cookies') return <CookiesPage onBack={() => setPolicyRoute(null)} />

    const textColorClass = isDarkBackground ? "text-white" : "text-neutral-900";
    const secondaryTextColorClass = isDarkBackground ? "text-white/80" : "text-neutral-800/80";
    const vignetteClass = isDarkBackground ? "from-black/80 via-black/40 to-transparent" : "from-white/90 via-white/50 to-transparent";

    const primaryButtonClass = "w-full rounded-full py-4 text-[15px] font-semibold transition-all active:scale-[0.98] bg-white text-black shadow-[0_4px_20px_rgba(0,0,0,0.15)] flex items-center justify-center gap-2 hover:bg-neutral-50";

    return (
        <div className="relative flex flex-col h-screen w-full overflow-hidden transition-colors duration-700 bg-neutral-900">
            {/* Background Videos */}
            <div className="absolute inset-0 z-0 bg-neutral-900">
                {!reduceMotion && (
                    <video
                        key={VIDEO_SOURCES[activeVideoIndex]}
                        ref={videoRef}
                        src={VIDEO_SOURCES[activeVideoIndex]}
                        autoPlay
                        muted
                        playsInline
                        preload="auto"
                        controls={false}
                        onEnded={() => setActiveVideoIndex(prev => (prev + 1) % VIDEO_SOURCES.length)}
                        onError={() => setActiveVideoIndex(prev => (prev + 1) % VIDEO_SOURCES.length)}
                        className={`absolute inset-0 object-cover w-full h-full transition-opacity duration-700 ease-in-out ${autoplayFailed ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                    />
                )}

                {(reduceMotion || autoplayFailed) && (
                    <img
                        src="/videos/law1_poster.jpg"
                        alt="OpusLex Background"
                        className="absolute inset-0 object-cover w-full h-full"
                    />
                )}

                {/* Dynamic Bottom Vignette ONLY */}
                <div className={`absolute bottom-0 left-0 right-0 h-3/5 z-10 bg-gradient-to-t pointer-events-none transition-colors duration-700 ease-in-out ${vignetteClass}`} />

                <canvas ref={canvasRef} width={8} height={8} className="hidden" />
            </div>

            {/* Content Container */}
            <div className={`relative z-20 flex flex-col flex-1 w-full h-full safe-area-pt safe-area-pb transition-colors duration-700 ease-in-out ${textColorClass}`}>

                {/* Quick Language Selector */}
                <div className="absolute top-4 right-4 sm:top-6 sm:right-6 z-30" ref={langDropdownRef}>
                    <button
                        id="auth-language-btn"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border border-white/20 bg-black/40 text-white backdrop-blur-md hover:bg-black/60 transition-colors shadow-lg"
                        onClick={() => setShowLanguageDropdown(prev => !prev)}
                        title={t("dashboard.topNav.selectLanguage", "Change Language")}
                    >
                        <Globe size={13} className="text-white/80" />
                        <span className="uppercase text-[11px] font-semibold">{language}</span>
                    </button>
                    {showLanguageDropdown && (
                        <div className="absolute right-0 top-[calc(100%+8px)] w-64 rounded-xl border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#1a1a1a] shadow-2xl z-50 overflow-hidden p-1.5 text-neutral-900 dark:text-white">
                            <div className="px-3 py-2 border-b border-neutral-100 dark:border-[#262626] flex items-center justify-between">
                                <span className="text-xs font-semibold">{t("settings.tabs.language", "Language")}</span>
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
                                        {language === l.code && <Check size={14} className="text-blue-600" />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Header (Logo & Tagline) */}
                <div className="flex flex-col items-center pt-16 sm:pt-24 px-6 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="transition-all duration-700">
                         <div className="relative flex justify-center items-center w-[220px]">
                            <img src={logoWhite} alt="OpusLex Logo" className={`w-full h-auto transition-opacity duration-700 ${isDarkBackground ? 'opacity-100' : 'opacity-0 absolute'}`} />
                            <img src={logoLight} alt="OpusLex Logo" className={`w-full h-auto transition-opacity duration-700 ${!isDarkBackground ? 'opacity-100' : 'opacity-0 absolute'}`} />
                        </div>
                    </div>
                    <p className={`mt-5 text-[13px] font-medium tracking-wide text-center transition-colors duration-700 ${textColorClass} ${isDarkBackground ? 'drop-shadow-md' : ''}`}>
                        Beyond books — instant legal clarity.
                    </p>
                </div>

                <div className="flex-1" />

                {/* Main Auth Actions */}
                <div className="w-full max-w-[360px] mx-auto px-6 pb-12 sm:pb-16 flex flex-col items-center">

                    {loginStage === 'initial' && (
                        <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <p className={`text-[11px] sm:text-[12px] text-center mb-6 leading-relaxed font-medium transition-colors duration-700 ${secondaryTextColorClass} ${isDarkBackground ? 'drop-shadow-sm' : ''}`}>
                                {t("auth.termsNotice", "By continuing, you agree to OpusLex's Terms of Service and Privacy Policy.")}{' '}
                                <button onClick={() => setPolicyRoute('terms')} className="font-bold underline decoration-1 underline-offset-2 hover:opacity-70 transition-opacity">Terms</button> •{' '}
                                <button onClick={() => setPolicyRoute('privacy')} className="font-bold underline decoration-1 underline-offset-2 hover:opacity-70 transition-opacity">Privacy</button> •{' '}
                                <button onClick={() => setPolicyRoute('cookies')} className="font-bold underline decoration-1 underline-offset-2 hover:opacity-70 transition-opacity">Cookies</button>
                            </p>

                            <button
                                onClick={() => { setLoginStage('email'); setIsRegistering(true); setMessage(""); }}
                                className={primaryButtonClass}
                            >
                                {t("auth.createAccount", "Create account")}
                            </button>

                            <div className={`mt-7 flex items-center justify-center gap-3 text-[14px] font-bold tracking-wide transition-colors duration-700 ${textColorClass}`}>
                                <button
                                    onClick={() => { setLoginStage('providers'); setMessage(""); }}
                                    className="hover:opacity-70 transition-opacity"
                                >
                                    {t("auth.signIn", "Sign in")}
                                </button>
                                <span className="opacity-50 font-normal">|</span>
                                <button
                                    onClick={() => { setLoginStage('email'); setIsRegistering(false); setMessage(""); }}
                                    className="hover:opacity-70 transition-opacity"
                                >
                                    {t("auth.logIn", "Log in")}
                                </button>
                            </div>
                        </div>
                    )}

                    {loginStage === 'providers' && (
                        <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-right-4 duration-400">
                            <div className="w-full space-y-3 mb-6">
                                <ProviderButton
                                    icon={<span className="text-xl"></span>}
                                    label={t("auth.continueApple", "Sign in with Apple")}
                                    onClick={handleAppleSignIn}
                                />
                                <ProviderButton
                                    icon={<GoogleIcon />}
                                    label={t("auth.continueGoogle", "Sign in with Google")}
                                    onClick={() => {
                                        if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
                                            setMessage("Google Sign-In is not configured.");
                                        }
                                    }}
                                >
                                    <div
                                        ref={googleButtonRef}
                                        className="absolute inset-0 opacity-0 z-10 flex items-center justify-center cursor-pointer pointer-events-auto rounded-full overflow-hidden"
                                        style={{ transform: "scale(1.25)" }}
                                    />
                                </ProviderButton>
                                <ProviderButton
                                    icon={<Mail size={20} strokeWidth={1.5} />}
                                    label={t("auth.continueEmail", "Sign in with Email Code")}
                                    onClick={() => {
                                        setLoginStage('email-otp');
                                        setMessage("");
                                    }}
                                />
                                <ProviderButton
                                    icon={<Smartphone size={20} strokeWidth={1.5} />}
                                    label="Sign in with phone number"
                                    disabled={true}
                                    badge={t("settings.appearance.theme.comingSoon", "Coming Soon")}
                                />
                            </div>

                            <button
                                onClick={() => setLoginStage('initial')}
                                className={`text-[14px] font-bold hover:opacity-70 transition-opacity flex items-center gap-1.5 ${textColorClass}`}
                            >
                                <ArrowLeft size={16} />
                                {t("common.back", "Back")}
                            </button>

                            {message && (
                                <div className={`mt-5 p-3 rounded-xl text-xs w-full text-center font-bold ${
                                    message.includes("success") || message.includes("Welcome") || message.includes("sent")
                                        ? "bg-green-100 text-green-800"
                                        : "bg-red-100 text-red-800"
                                }`}>
                                    {message}
                                </div>
                            )}
                        </div>
                    )}

                    {loginStage === 'email' && (
                        <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-right-4 duration-400">

                            <form onSubmit={isRegistering ? handleRegister : handleLogin} className="w-full flex flex-col gap-3 mb-6">
                                {isRegistering && (
                                    <AuthField type="text" placeholder={t("auth.fullName", "Full name")} value={fullName} onChange={setFullName} />
                                )}
                                <AuthField type="email" placeholder={t("auth.email", "Email address")} value={email} onChange={setEmail} />
                                <AuthField type="password" placeholder={t("auth.password", "Password")} value={password} onChange={setPassword} />

                                <button
                                    type="submit"
                                    disabled={authLoading === "email"}
                                    className={`${primaryButtonClass} mt-2`}
                                >
                                    {authLoading === "email" && <Loader2 size={16} className="animate-spin text-black" />}
                                    {authLoading === "email" ? t("common.loading", "Processing...") : (isRegistering ? t("auth.createAccount", "Create account") : t("auth.logIn", "Log in"))}
                                </button>
                            </form>

                            {!isRegistering && (
                                <button
                                    onClick={() => { setLoginStage('email-otp'); setMessage(""); }}
                                    className={`mb-6 text-[14px] font-bold hover:opacity-70 transition-opacity ${textColorClass}`}
                                >
                                    {t("auth.continueEmail", "Log in with Email Code")}
                                </button>
                            )}

                            <button
                                onClick={() => { setLoginStage('initial'); setMessage(""); setIsRegistering(false); }}
                                className={`text-[14px] font-bold hover:opacity-70 transition-opacity flex items-center gap-1.5 ${textColorClass}`}
                            >
                                <ArrowLeft size={16} />
                                {t("common.back", "Back")}
                            </button>

                            {message && (
                                <div className={`mt-5 p-3 rounded-xl text-xs w-full text-center font-bold ${
                                    message.includes("success") || message.includes("Welcome") || message.includes("sent")
                                        ? "bg-green-100 text-green-800"
                                        : "bg-red-100 text-red-800"
                                }`}>
                                    {message}
                                </div>
                            )}
                        </div>
                    )}

                    {loginStage === 'email-otp' && (
                        <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-right-4 duration-400">
                            <div className="text-center mb-5">
                                <h3 className={`text-lg font-bold ${textColorClass}`}>{t("auth.continueEmail", "Log in with Email Code")}</h3>
                                <p className={`mt-1.5 text-[12px] leading-relaxed font-medium transition-colors duration-700 ${secondaryTextColorClass}`}>
                                    {t("auth.verifyCode", "We'll send a 6-digit code to your email.")}
                                </p>
                            </div>

                            <form onSubmit={handleSendOtp} className="w-full flex flex-col gap-3 mb-6">
                                <AuthField type="email" placeholder={t("auth.email", "Email address")} value={email} onChange={setEmail} />

                                <button
                                    type="submit"
                                    disabled={authLoading === "email-otp"}
                                    className={`${primaryButtonClass} mt-2`}
                                >
                                    {authLoading === "email-otp" && <Loader2 size={16} className="animate-spin text-black" />}
                                    {authLoading === "email-otp" ? t("common.loading", "Sending...") : t("auth.verify", "Send Code")}
                                </button>
                            </form>

                            <button
                                onClick={() => { setLoginStage('email'); setMessage(""); }}
                                className={`text-[14px] font-bold hover:opacity-70 transition-opacity flex items-center gap-1.5 ${textColorClass}`}
                            >
                                <ArrowLeft size={16} />
                                {t("common.back", "Back")}
                            </button>

                            {message && (
                                <div className={`mt-5 p-3 rounded-xl text-xs w-full text-center font-bold ${
                                    message.includes("success") || message.includes("Welcome") || message.includes("sent") || message.includes("Sending")
                                        ? "bg-green-100 text-green-800"
                                        : "bg-red-100 text-red-800"
                                }`}>
                                    {message}
                                </div>
                            )}
                        </div>
                    )}

                    {loginStage === 'email-otp-verify' && (
                        <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-right-4 duration-400">
                            <div className="text-center mb-5">
                                <h3 className={`text-lg font-bold ${textColorClass}`}>{t("auth.verifyCode", "Enter Verification Code")}</h3>
                                <p className={`mt-1.5 text-[12px] leading-relaxed font-medium transition-colors duration-700 ${secondaryTextColorClass}`}>
                                    {email}
                                </p>
                            </div>

                            <form onSubmit={handleVerifyOtp} className="w-full flex flex-col gap-3 mb-6">
                                <AuthField
                                    type="text"
                                    placeholder={t("auth.verifyCode", "6-digit code")}
                                    value={otpCode}
                                    onChange={(v) => setOtpCode(v.replace(/\D/g, '').slice(0, 6))}
                                />

                                <button
                                    type="submit"
                                    disabled={authLoading === "email-otp-verify"}
                                    className={`${primaryButtonClass} mt-2`}
                                >
                                    {authLoading === "email-otp-verify" && <Loader2 size={16} className="animate-spin text-black" />}
                                    {authLoading === "email-otp-verify" ? t("common.loading", "Verifying...") : t("auth.verify", "Verify")}
                                </button>
                            </form>

                            <div className="flex flex-col items-center gap-4 w-full">
                                <button
                                    onClick={handleSendOtp}
                                    disabled={resendCooldown > 0 || authLoading === "email-otp"}
                                    className={`text-[13px] font-bold hover:opacity-70 transition-opacity ${textColorClass} ${resendCooldown > 0 ? "opacity-50" : ""}`}
                                >
                                    {resendCooldown > 0 ? `${t("common.retry", "Resend Code")} (${resendCooldown}s)` : t("common.retry", "Resend Code")}
                                </button>

                                <button
                                    onClick={() => { setLoginStage('email-otp'); setMessage(""); setOtpCode(""); }}
                                    className={`text-[14px] font-bold hover:opacity-70 transition-opacity flex items-center gap-1.5 ${textColorClass}`}
                                >
                                    <ArrowLeft size={16} />
                                    {t("common.back", "Change email")}
                                </button>
                            </div>

                            {message && (
                                <div className={`mt-5 p-3 rounded-xl text-xs w-full text-center font-bold ${
                                    message.includes("success") || message.includes("Welcome") || message.includes("sent") || message.includes("Sending") || message.includes("Verifying")
                                        ? "bg-green-100 text-green-800"
                                        : "bg-red-100 text-red-800"
                                }`}>
                                    {message}
                                </div>
                            )}
                        </div>
                    )}

                    {loginStage === 'mfa' && (
                        <div className="w-full flex flex-col items-center animate-in fade-in slide-in-from-right-4 duration-400">
                            <div className="text-center mb-5">
                                <h3 className={`text-lg font-bold ${textColorClass}`}>{t("settings.tabs.security", "Two-factor authentication")}</h3>
                                <p className={`mt-1.5 text-[12px] leading-relaxed font-medium transition-colors duration-700 ${secondaryTextColorClass}`}>
                                    {t("auth.verifyCode", "Enter the 6-digit verification code from your authenticator app.")}
                                </p>
                            </div>

                            <form onSubmit={handleMfaVerify} className="w-full flex flex-col gap-3 mb-6">
                                <AuthField
                                    type="text"
                                    placeholder={t("auth.verifyCode", "6-digit code")}
                                    value={mfaCode}
                                    onChange={(v) => setMfaCode(v.replace(/\D/g, '').slice(0, 6))}
                                />

                                <button
                                    type="submit"
                                    disabled={authLoading === "mfa"}
                                    className={`${primaryButtonClass} mt-2`}
                                >
                                    {authLoading === "mfa" && <Loader2 size={16} className="animate-spin text-black" />}
                                    {authLoading === "mfa" ? t("common.loading", "Verifying...") : t("auth.verify", "Verify & Continue")}
                                </button>
                            </form>

                            <button
                                onClick={() => { setLoginStage('email'); setMessage(""); setMfaToken(""); setMfaCode(""); }}
                                className={`text-[14px] font-bold hover:opacity-70 transition-opacity flex items-center gap-1.5 ${textColorClass}`}
                            >
                                <ArrowLeft size={16} />
                                {t("common.back", "Back to Log in")}
                            </button>

                            {message && (
                                <div className={`mt-5 p-3 rounded-xl text-xs w-full text-center font-bold ${
                                    message.includes("success") || message.includes("Welcome") || message.includes("sent")
                                        ? "bg-green-100 text-green-800"
                                        : "bg-red-100 text-red-800"
                                }`}>
                                    {message}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .safe-area-pt { padding-top: env(safe-area-inset-top); }
                .safe-area-pb { padding-bottom: max(env(safe-area-inset-bottom), 16px); }
            `}</style>
        </div>
    )
}

const GoogleIcon = () => (
    <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
        <path
            fill="#4285F4"
            d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.65v3h3.86c2.26-2.09 3.685-5.17 3.685-9.09z"
        />
        <path
            fill="#34A853"
            d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
        />
        <path
            fill="#FBBC05"
            d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.61H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.39l3.98-3.1z"
        />
        <path
            fill="#EA4335"
            d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.61l3.98 3.1c.95-2.85 3.6-4.96 6.73-4.96z"
        />
    </svg>
);

function ProviderButton({
    icon,
    label,
    onClick,
    disabled,
    badge,
    children
}: {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    disabled?: boolean;
    badge?: string;
    children?: React.ReactNode;
}) {
    return (
        <div className="relative w-full h-[50px] overflow-hidden rounded-full">
            <button
                type="button"
                onClick={onClick}
                disabled={disabled}
                className={`w-full h-full rounded-full px-6 text-[14px] font-semibold transition-all active:scale-[0.98] bg-white text-black shadow-[0_4px_16px_rgba(0,0,0,0.12)] flex items-center justify-center relative hover:bg-neutral-50 ${disabled ? "opacity-70 cursor-not-allowed" : "cursor-pointer"}`}
            >
                <span className="absolute left-6 flex items-center justify-center w-5 h-5 opacity-90">
                    {icon}
                </span>
                <span>{label}</span>
                {badge && (
                    <span className="absolute right-6 text-[9px] uppercase tracking-wider font-bold opacity-40">
                        {badge}
                    </span>
                )}
            </button>
            {children}
        </div>
    );
}

function AuthField({ type, placeholder, value, onChange }: {
    type: string; placeholder: string; value: string; onChange: (v: string) => void
}) {
    return (
        <div className="w-full relative">
            <input
                type={type}
                placeholder={placeholder}
                value={value}
                onChange={e => onChange(e.target.value)}
                required
                className="w-full rounded-full py-4 px-6 text-[15px] outline-none transition-all duration-200 focus:ring-2 focus:ring-black/20 bg-white/95 text-black placeholder-neutral-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.04),0_2px_10px_rgba(0,0,0,0.08)] backdrop-blur-sm font-medium"
            />
        </div>
    )
}
