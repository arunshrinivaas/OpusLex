import { useEffect, useState } from 'react';
import logoWhite from '../assets/OpusLexLogoWhite.png';
import logoLight from '../assets/OpusLexLogoLight.png';
import { usePreferences } from '../contexts/PreferencesContext';

export function OpusLexSymbol({ className }: { className?: string }) {
    return (
        <OpusLexBrand className={className} />
    );
}

export function OpusLexBrand({ variant, className = "w-[150px] h-auto" }: { variant?: "light" | "dark", className?: string }) {
    let resolvedTheme: "light" | "dark" = "light";
    try {
        const prefs = usePreferences();
        resolvedTheme = prefs.resolvedTheme;
    } catch {
        if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
            resolvedTheme = 'dark';
        }
    }

    // Also support reactive DOM class observation if used outside PreferencesProvider
    const [domIsDark, setDomIsDark] = useState<boolean>(() => {
        if (typeof document !== 'undefined') {
            return document.documentElement.classList.contains('dark');
        }
        return false;
    });

    useEffect(() => {
        if (typeof document === 'undefined') return;
        const observer = new MutationObserver(() => {
            setDomIsDark(document.documentElement.classList.contains('dark'));
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme-mode'] });
        return () => observer.disconnect();
    }, []);

    const effectiveTheme = variant ? variant : (resolvedTheme || (domIsDark ? "dark" : "light"));
    const activeLogo = effectiveTheme === "dark" ? logoWhite : logoLight;

    return (
        <img
            src={activeLogo}
            alt="OpusLex Brand Logo"
            className={className}
            style={{ objectFit: 'contain' }}
        />
    );
}
