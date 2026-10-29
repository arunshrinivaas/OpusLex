/**
 * OS-Aware Keyboard Shortcuts Utility for Themis Assistant
 * 
 * Dynamically detects the host OS (macOS vs Windows/Linux) and provides
 * non-conflicting keybindings for Voice mode and Text (Spotlight) mode.
 */

export type OperatingSystem = 'mac' | 'windows' | 'linux' | 'other';

export interface ShortcutConfig {
  voiceKeyLabel: string;
  textKeyLabel: string;
  isVoiceShortcut: (e: KeyboardEvent) => boolean;
  isTextShortcut: (e: KeyboardEvent) => boolean;
}

/**
 * Detect host OS using User-Agent Client Hints (navigator.userAgentData)
 * or fallback to navigator.platform / navigator.userAgent.
 */
export function detectOperatingSystem(customNavigator?: any): OperatingSystem {
  const nav = customNavigator ?? (typeof navigator !== 'undefined' ? (navigator as any) : typeof window !== 'undefined' ? (window as any).navigator : undefined);
  if (!nav) {
    return 'other';
  }

  // 1. Modern User-Agent Client Hints API
  if (nav.userAgentData && typeof nav.userAgentData.platform === 'string') {
    const p = nav.userAgentData.platform.toLowerCase();
    if (p.includes('mac') || p.includes('ios')) return 'mac';
    if (p.includes('win')) return 'windows';
    if (p.includes('linux') || p.includes('android')) return 'linux';
  }

  // 2. Standard navigator.platform & userAgent fallback
  const platform = String(nav.platform || '').toLowerCase();
  const ua = String(nav.userAgent || '').toLowerCase();

  if (platform.includes('mac') || ua.includes('macintosh') || ua.includes('mac os')) {
    return 'mac';
  }
  if (platform.includes('win') || ua.includes('windows')) {
    return 'windows';
  }
  if (platform.includes('linux') || ua.includes('linux')) {
    return 'linux';
  }

  return 'other';
}

/**
 * Get OS-specific shortcuts configuration and display labels.
 */
export function getAssistantShortcuts(os?: OperatingSystem): ShortcutConfig {
  const currentOS = os ?? detectOperatingSystem();
  const isMac = currentOS === 'mac';

  if (isMac) {
    return {
      voiceKeyLabel: '⌥A', // Option + A (or ⌘⇧A)
      textKeyLabel: '⌘K',  // Command + K
      isVoiceShortcut: (e: KeyboardEvent) => {
        // Option + A or Command + Shift + A
        const key = e.key.toLowerCase();
        const isOptionA = e.altKey && !e.metaKey && !e.ctrlKey && key === 'a';
        const isCmdShiftA = e.metaKey && e.shiftKey && !e.altKey && key === 'a';
        return isOptionA || isCmdShiftA;
      },
      isTextShortcut: (e: KeyboardEvent) => {
        // Command + K (Spotlight text overlay)
        return e.metaKey && !e.altKey && !e.ctrlKey && e.key.toLowerCase() === 'k';
      },
    };
  }

  // Windows / Linux
  return {
    voiceKeyLabel: 'Alt+A',
    textKeyLabel: 'Ctrl+K',
    isVoiceShortcut: (e: KeyboardEvent) => {
      // Alt + A or Ctrl + Shift + A
      const key = e.key.toLowerCase();
      const isAltA = e.altKey && !e.ctrlKey && !e.metaKey && key === 'a';
      const isCtrlShiftA = e.ctrlKey && e.shiftKey && !e.altKey && key === 'a';
      return isAltA || isCtrlShiftA;
    },
    isTextShortcut: (e: KeyboardEvent) => {
      // Ctrl + K (Spotlight text overlay)
      return e.ctrlKey && !e.altKey && !e.metaKey && e.key.toLowerCase() === 'k';
    },
  };
}

/**
 * Determine if an event originated from an active editable text field
 * (input, textarea, select, contentEditable) to suppress triggering unless intended.
 */
export function isEditableElement(target: EventTarget | null): boolean {
  if (!target) {
    return false;
  }
  if (typeof HTMLElement !== 'undefined' && !(target instanceof HTMLElement)) {
    return false;
  }
  const el = target as any;
  const tag = (el.tagName || '').toUpperCase();
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  if (Boolean(el.isContentEditable)) {
    return true;
  }
  return false;
}
