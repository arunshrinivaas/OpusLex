/**
 * Shared API configuration and URL resolution utility for OpusLex frontend.
 *
 * Handles:
 * - Empty VITE_API_URL in local dev (routes through Vite `/api` proxy or relative domain)
 * - Explicit VITE_API_URL (e.g. http://127.0.0.1:8000, https://api.opuslex.com)
 * - Base URLs that already end with `/api` or `/api/v1` (avoids duplicate prefixes)
 * - Trailing slashes on base URLs and leading slashes on paths
 * - Safe fallback in Node.js test environments where import.meta.env is undefined
 */

function getEnvApiUrl(): string {
    try {
        if (typeof import.meta !== "undefined" && import.meta.env && typeof import.meta.env.VITE_API_URL === "string") {
            return import.meta.env.VITE_API_URL;
        }
    } catch {
        // Fall back to process.env if in Node environment
    }

    const nodeProc = (globalThis as Record<string, any>).process;
    if (nodeProc && nodeProc.env && typeof nodeProc.env.VITE_API_URL === "string") {
        return nodeProc.env.VITE_API_URL;
    }

    return "";
}

export function resolveApiUrl(path: string, baseUrl?: string): string {
    const rawBase = (baseUrl !== undefined ? baseUrl : getEnvApiUrl()).trim().replace(/\/+$/, "");
    const cleanPath = path.startsWith("/") ? path : `/${path}`;

    if (!rawBase) {
        return cleanPath;
    }

    if (rawBase.endsWith("/api/v1") && cleanPath.startsWith("/api/v1")) {
        return `${rawBase}${cleanPath.slice("/api/v1".length)}`;
    }

    if (rawBase.endsWith("/api") && cleanPath.startsWith("/api")) {
        return `${rawBase}${cleanPath.slice("/api".length)}`;
    }

    return `${rawBase}${cleanPath}`;
}

export const API_BASE = getEnvApiUrl().trim().replace(/\/+$/, "");

export function getApiUrl(path: string): string {
    return resolveApiUrl(path);
}
