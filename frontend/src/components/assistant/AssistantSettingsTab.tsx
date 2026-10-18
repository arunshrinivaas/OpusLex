import { useState, useEffect } from 'react';
import { Shield, Sparkles, Volume2, Keyboard, Eye, Check, AlertTriangle, History, Mic, Radio } from 'lucide-react';
import { voiceService, type VoiceOption } from './VoiceService';
import { detectOperatingSystem, getAssistantShortcuts } from '../../utils/keyboardShortcuts';
import { usePreferences, type TranscriptFontSize } from '../../contexts/PreferencesContext';

const API_BASE = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

interface AssistantSettingsTabProps {
  onPreferencesUpdated?: () => void;
}

export default function AssistantSettingsTab({ onPreferencesUpdated }: AssistantSettingsTabProps) {
  const [enabled, setEnabled] = useState(true);
  const [permissionLevel, setPermissionLevel] = useState(1);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceName, setVoiceName] = useState<string>('');
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [activationShortcut, setActivationShortcut] = useState('Alt+A');
  const [contextSharingEnabled, setContextSharingEnabled] = useState(true);
  const [historyRetentionDays, setHistoryRetentionDays] = useState<number>(30);

  // "Hey Themis" Foreground Standby State
  const [wakeWordEnabled, setWakeWordEnabled] = useState(() => localStorage.getItem('pref_themis_wake_word') === 'true');
  const [standbyActive, setStandbyActive] = useState(() => voiceService.isWakeWordActive());

  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Global preferences
  const { transcriptFontSize, setTranscriptFontSize } = usePreferences();

  // Detected operating system & shortcuts
  const hostOS = detectOperatingSystem();
  const shortcuts = getAssistantShortcuts(hostOS);

  // Load preferences from backend
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const token = localStorage.getItem('access_token');
        const headers = {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        };

        // 1. Fetch Preferences
        const prefRes = await fetch(`${API_BASE}/api/v1/assistant/preferences`, { headers });
        if (prefRes.ok) {
          const prefData = await prefRes.json();
          setEnabled(prefData.enabled);
          setPermissionLevel(prefData.permission_level);
          setVoiceEnabled(prefData.voice_enabled);
          setVoiceName(prefData.voice_name || '');
          setSpeechRate(prefData.speech_rate || 1.0);
          voiceService.setSpeechRate(prefData.speech_rate || 1.0);
          setActivationShortcut(prefData.activation_shortcut || (hostOS === 'mac' ? '⌥A' : 'Alt+A'));
          setContextSharingEnabled(prefData.context_sharing_enabled);
          setHistoryRetentionDays(prefData.history_retention_days || 30);
        }

        // 2. Fetch Audit Logs
        const logsRes = await fetch(`${API_BASE}/api/v1/assistant/audit-logs?limit=10`, { headers });
        if (logsRes.ok) {
          const logsData = await logsRes.json();
          setAuditLogs(logsData);
        }
      } catch (err) {
        console.warn('Failed to load Themis assistant settings:', err);
      } finally {
        setLoading(false);
      }
    }

    loadData();

    // Populate browser voices
    const voices = voiceService.getAvailableVoices();
    setAvailableVoices(voices);
  }, [hostOS]);

  const handleSave = async (overrides: Partial<{
    enabled: boolean;
    permission_level: number;
    voice_enabled: boolean;
    voice_name: string | null;
    speech_rate: number;
    activation_shortcut: string;
    context_sharing_enabled: boolean;
    history_retention_days: number;
  }> = {}) => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    const payload = {
      enabled: overrides.enabled ?? enabled,
      permission_level: overrides.permission_level ?? permissionLevel,
      voice_enabled: overrides.voice_enabled ?? voiceEnabled,
      voice_name: overrides.voice_name !== undefined ? overrides.voice_name : (voiceName || null),
      speech_rate: overrides.speech_rate ?? speechRate,
      activation_shortcut: overrides.activation_shortcut ?? activationShortcut,
      context_sharing_enabled: overrides.context_sharing_enabled ?? contextSharingEnabled,
      history_retention_days: overrides.history_retention_days ?? historyRetentionDays,
    };

    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE}/api/v1/assistant/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || 'Failed to save settings.');
      }

      const updated = await res.json();
      setEnabled(updated.enabled);
      setPermissionLevel(updated.permission_level);
      setVoiceEnabled(updated.voice_enabled);
      setVoiceName(updated.voice_name || '');
      setActivationShortcut(updated.activation_shortcut);
      setContextSharingEnabled(updated.context_sharing_enabled);

      // Mirror to localStorage for immediate client-side render
      localStorage.setItem('pref_assistant_enabled', String(updated.enabled));
      localStorage.setItem('pref_assistant_permission_level', String(updated.permission_level));
      localStorage.setItem('pref_assistant_voice_enabled', String(updated.voice_enabled));
      localStorage.setItem('pref_assistant_shortcut', updated.activation_shortcut);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);

      if (onPreferencesUpdated) onPreferencesUpdated();
    } catch (err: any) {
      setSaveError(err.message || 'Error saving settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleWakeWord = async () => {
    const next = !wakeWordEnabled;
    setWakeWordEnabled(next);
    localStorage.setItem('pref_themis_wake_word', String(next));

    if (next) {
      try {
        voiceService.startWakeWordStandby(
          () => {
            window.dispatchEvent(new CustomEvent('themis:trigger_voice'));
          },
          (err) => {
            console.warn('Wake word activation error:', err);
            setStandbyActive(false);
          },
          (active) => setStandbyActive(active)
        );
      } catch (err) {
        console.warn('Wake word activation error:', err);
        setStandbyActive(false);
      }
    } else {
      voiceService.stopWakeWordStandby();
      setStandbyActive(false);
    }
  };

  const permissionOptions = [
    {
      level: 1,
      title: 'Level 1: Read & Answer (Least Privilege Default)',
      desc: 'Can read authorized context and answer regulatory compliance questions. Mutations and actions are strictly prohibited.',
      tag: 'Safe',
    },
    {
      level: 2,
      title: 'Level 2: Suggest',
      desc: 'Prepares draft findings, proposed investigations, and suggestions for review. Does not execute mutations.',
      tag: 'Read-Only Suggestions',
    },
    {
      level: 3,
      title: 'Level 3: Execute with Approval',
      desc: 'Prepares actions (creating investigations, running agents, archiving) and executes only after explicit user confirmation.',
      tag: 'Gated Execution',
    },
    {
      level: 4,
      title: 'Level 4: Limited Autonomy',
      desc: 'Directly executes allowlisted low-risk actions. High-impact operations (such as permanently deleting investigations) still require explicit confirmation.',
      tag: 'Autonomy with Safeguards',
    },
  ];

  if (loading) {
    return (
      <div className="p-8 text-center text-neutral-400 text-sm">
        Loading Themis Assistant settings...
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* ── Status Alerts ── */}
      {saving && (
        <div className="p-3 bg-neutral-100 dark:bg-[#1a1a1a] border border-neutral-200 dark:border-[#262626] rounded-xl text-xs text-neutral-700 dark:text-neutral-300 flex items-center gap-2">
          <span>Saving Themis configuration...</span>
        </div>
      )}
      {saveSuccess && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <span>Themis configuration saved successfully and enforced on the backend.</span>
        </div>
      )}
      {saveError && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-800 dark:text-red-300 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <span>{saveError}</span>
        </div>
      )}

      {/* ── Section 1: Enablement Toggle ── */}
      <div className="rounded-xl border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#171717] p-5 flex items-center justify-between transition-colors">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#FBC648]" />
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">Enable Themis Assistant</h4>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 max-w-lg">
            Provides keyboard-driven Spotlight search, voice activation HUD, contextual legal explanations, and verified action confirmations.
          </p>
        </div>
        <button
          onClick={() => {
            const next = !enabled;
            setEnabled(next);
            handleSave({ enabled: next });
          }}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
            enabled ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-200 dark:bg-[#262626]'
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full transition-transform ${
              enabled ? 'translate-x-6 bg-white dark:bg-neutral-900' : 'translate-x-1 bg-white'
            }`}
          />
        </button>
      </div>

      {/* ── Section 2: Permission Levels ── */}
      <div className="rounded-xl border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#171717] p-5 space-y-4 transition-colors">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-neutral-800 dark:text-neutral-200" />
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">Themis Permission Level</h4>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Enforced strictly on the server side. Prevents prompt injection and untrusted commands from performing unauthorized operations.
          </p>
        </div>

        <div className="space-y-2.5">
          {permissionOptions.map((opt) => {
            const isSelected = permissionLevel === opt.level;
            return (
              <div
                key={opt.level}
                onClick={() => {
                  setPermissionLevel(opt.level);
                  handleSave({ permission_level: opt.level });
                }}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                  isSelected
                    ? 'border-neutral-900 dark:border-white bg-neutral-50/80 dark:bg-[#212121] ring-1 ring-neutral-900 dark:ring-white'
                    : 'border-neutral-200 dark:border-[#262626] hover:border-neutral-300 dark:hover:border-[#333333] bg-white dark:bg-[#171717]'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-neutral-900 dark:text-white">{opt.title}</span>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-[#262626] text-neutral-700 dark:text-neutral-300">
                      {opt.tag}
                    </span>
                  </div>
                  <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">{opt.desc}</p>
                </div>
                <div
                  className={`mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0 ${
                    isSelected ? 'border-neutral-900 dark:border-white bg-neutral-900 dark:bg-white' : 'border-neutral-300 dark:border-[#404040]'
                  }`}
                >
                  {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-white dark:bg-neutral-900" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Section 3: "Hey Themis" Voice Activation & Spoken Output ── */}
      <div className="rounded-xl border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#171717] p-5 space-y-4 transition-colors">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Volume2 className="h-4 w-4 text-neutral-800 dark:text-neutral-200" />
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">Voice Activation & Speech Output</h4>
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Natural spoken responses and hands-free wake word activation using browser Web Speech APIs.
          </p>
        </div>

        {/* Hey Themis Standby Toggle */}
        <div className="pt-2 border-t border-neutral-100 dark:border-[#262626] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <Mic className="h-3.5 w-3.5 text-[#FBC648]" />
              <p className="text-xs font-semibold text-neutral-900 dark:text-white">"Hey Themis" Wake Word Standby</p>
              {wakeWordEnabled && (
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${
                  standbyActive 
                    ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-800 dark:text-amber-400' 
                    : 'bg-neutral-100 dark:bg-[#262626] text-neutral-500'
                }`}>
                  <Radio size={10} className={standbyActive ? "animate-pulse" : ""} />
                  {standbyActive ? "Standby (Active Tab)" : "Paused"}
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 max-w-lg mt-0.5">
              Listens for "Hey Themis" strictly while this browser tab is active. Automatically pauses when the tab is backgrounded. Continuous system-wide detection requires a native application runtime.
            </p>
          </div>
          <button
            onClick={handleToggleWakeWord}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer shrink-0 ml-4 ${
              wakeWordEnabled ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-200 dark:bg-[#262626]'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                wakeWordEnabled ? 'translate-x-4 bg-white dark:bg-neutral-900' : 'translate-x-0.5 bg-white'
              }`}
            />
          </button>
        </div>

        {/* Read Responses Out Loud Toggle */}
        <div className="pt-2 border-t border-neutral-100 dark:border-[#262626] flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-neutral-900 dark:text-white">Enable spoken audio responses</p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Read assistant responses out loud after text completion.</p>
          </div>
          <button
            onClick={() => {
              const next = !voiceEnabled;
              setVoiceEnabled(next);
              handleSave({ voice_enabled: next });
            }}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer shrink-0 ml-4 ${
              voiceEnabled ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-200 dark:bg-[#262626]'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                voiceEnabled ? 'translate-x-4 bg-white dark:bg-neutral-900' : 'translate-x-0.5 bg-white'
              }`}
            />
          </button>
        </div>

        {voiceEnabled && availableVoices.length > 0 && (
          <div className="pt-2 border-t border-neutral-100 dark:border-[#262626]">
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
              Available Browser Voice
            </label>
            <select
              value={voiceName}
              onChange={(e) => {
                setVoiceName(e.target.value);
                handleSave({ voice_name: e.target.value });
              }}
              className="w-full text-xs bg-neutral-50 dark:bg-[#212121] border border-neutral-200 dark:border-[#262626] rounded-full px-4 py-2 text-neutral-800 dark:text-neutral-200 focus:outline-none focus:ring-1 focus:ring-[#FBC648]"
            >
              <option value="">Default System Voice</option>
              {availableVoices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Speech Rate Controls */}
        <div className="pt-2 border-t border-neutral-100 dark:border-[#262626]">
          <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300 mb-1.5">
            Speech Rate: <span className="font-semibold text-neutral-900 dark:text-white">{speechRate}x</span>
          </label>
          <div className="flex items-center gap-2">
            {[0.8, 1.0, 1.2, 1.5].map((rate) => (
              <button
                key={rate}
                onClick={() => {
                  setSpeechRate(rate);
                  voiceService.setSpeechRate(rate);
                  handleSave({ speech_rate: rate });
                }}
                className={`py-1 px-3.5 rounded-full border text-xs font-medium transition-colors ${
                  speechRate === rate
                    ? 'border-neutral-900 dark:border-white bg-neutral-900 dark:bg-white text-white dark:text-neutral-900'
                    : 'border-neutral-200 dark:border-[#262626] text-neutral-700 dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-[#404040]'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>

        {/* Live Transcript Subtitle Size Selector */}
        <div className="pt-2 border-t border-neutral-100 dark:border-[#262626]">
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-neutral-700 dark:text-neutral-300">
              Live Transcript Subtitle Size
            </label>
            <span className="text-[11px] font-mono text-neutral-400 capitalize">
              {transcriptFontSize === 's' ? 'Small (13px)' : transcriptFontSize === 'm' ? 'Medium (15px - Default)' : transcriptFontSize === 'l' ? 'Large (17px)' : 'Extra Large (19px)'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {[
              { id: 's', label: 'Small' },
              { id: 'm', label: 'Medium' },
              { id: 'l', label: 'Large' },
              { id: 'xl', label: 'Extra Large' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTranscriptFontSize(id as TranscriptFontSize)}
                className={`py-1.5 px-3.5 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
                  transcriptFontSize === id
                    ? 'border-neutral-900 dark:border-white bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 shadow-xs'
                    : 'border-neutral-200 dark:border-[#262626] text-neutral-700 dark:text-neutral-300 hover:border-neutral-300 dark:hover:border-[#404040]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-1">
            Controls subtitle text size in the immersive voice overlay without altering application typography.
          </p>
        </div>
      </div>

      {/* ── Section 4: OS-Aware Keyboard Shortcuts ── */}
      <div className="rounded-xl border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#171717] p-5 space-y-4 transition-colors">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Keyboard className="h-4 w-4 text-neutral-800 dark:text-neutral-200" />
              <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">OS-Aware Activation Shortcuts</h4>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Shortcuts work anywhere in OpusLex and automatically suppress when typing in form inputs.
            </p>
          </div>
          <span className="text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-neutral-100 dark:bg-[#262626] text-neutral-700 dark:text-neutral-300 capitalize">
            Detected: {hostOS === 'mac' ? 'macOS' : hostOS === 'windows' ? 'Windows' : hostOS === 'linux' ? 'Linux' : 'Web'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-[#262626] bg-neutral-50 dark:bg-[#1a1a1a] flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-neutral-900 dark:text-white">Voice Mode Activation</p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Opens centered voice HUD with glowing orb</p>
            </div>
            <kbd className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-white dark:bg-[#262626] text-neutral-900 dark:text-white border border-neutral-200 dark:border-[#333333] shadow-xs">
              {shortcuts.voiceKeyLabel}
            </kbd>
          </div>

          <div className="p-3.5 rounded-xl border border-neutral-200 dark:border-[#262626] bg-neutral-50 dark:bg-[#1a1a1a] flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-neutral-900 dark:text-white">Spotlight Text Mode</p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Opens centered input with auto-focus</p>
            </div>
            <kbd className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-white dark:bg-[#262626] text-neutral-900 dark:text-white border border-neutral-200 dark:border-[#333333] shadow-xs">
              {shortcuts.textKeyLabel}
            </kbd>
          </div>
        </div>

        <div className="pt-3 border-t border-neutral-100 dark:border-[#262626] flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5 text-neutral-700 dark:text-neutral-300" />
              <p className="text-xs font-medium text-neutral-900 dark:text-white">Application Context Awareness</p>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 max-w-md">
              Allows Themis to inspect active investigation IDs and attached document IDs to answer context-specific questions.
            </p>
          </div>
          <button
            onClick={() => {
              const next = !contextSharingEnabled;
              setContextSharingEnabled(next);
              handleSave({ context_sharing_enabled: next });
            }}
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer shrink-0 ml-4 ${
              contextSharingEnabled ? 'bg-neutral-900 dark:bg-white' : 'bg-neutral-200 dark:bg-[#262626]'
            }`}
          >
            <span
              className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
                contextSharingEnabled ? 'translate-x-4 bg-white dark:bg-neutral-900' : 'translate-x-0.5 bg-white'
              }`}
            />
          </button>
        </div>
      </div>

      {/* ── Section 5: Themis Action Audit Trail & Retention ── */}
      <div className="rounded-xl border border-neutral-200 dark:border-[#262626] bg-white dark:bg-[#171717] p-5 space-y-4 transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-neutral-800 dark:text-neutral-200" />
            <h4 className="text-sm font-semibold text-neutral-900 dark:text-white">Action Audit Trail & Retention</h4>
          </div>
          <span className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-2.5 py-0.5 rounded-full font-medium">
            SHA-256 Hash Chained
          </span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-[#262626]">
          <div>
            <p className="text-xs font-medium text-neutral-900 dark:text-white">Conversation History Retention</p>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">Automatically prune conversation history after retention period.</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={historyRetentionDays}
              onChange={(e) => {
                const days = Number(e.target.value);
                setHistoryRetentionDays(days);
                handleSave({ history_retention_days: days });
              }}
              className="text-xs bg-neutral-50 dark:bg-[#212121] border border-neutral-200 dark:border-[#262626] rounded-full px-3 py-1.5 text-neutral-800 dark:text-neutral-200"
            >
              <option value={7}>7 Days</option>
              <option value={30}>30 Days</option>
              <option value={90}>90 Days</option>
              <option value={365}>1 Year</option>
            </select>
            <button
              onClick={async () => {
                if (!confirm('Are you sure you want to clear all Themis conversation history?')) return;
                try {
                  const token = localStorage.getItem('access_token');
                  const res = await fetch(`${API_BASE}/api/v1/assistant/conversations/clear`, {
                    method: 'POST',
                    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                  });
                  if (res.ok) {
                    alert('All Themis conversation history has been cleared.');
                  }
                } catch (e: any) {
                  alert('Failed to clear history: ' + e.message);
                }
              }}
              className="px-3.5 py-1.5 text-xs border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-full transition-colors cursor-pointer"
            >
              Clear History
            </button>
          </div>
        </div>

        {auditLogs.length === 0 ? (
          <p className="text-xs text-neutral-400 dark:text-neutral-500 py-4 text-center">No Themis actions logged yet.</p>
        ) : (
          <div className="divide-y divide-neutral-100 dark:divide-[#262626] overflow-x-auto text-xs pt-2">
            {auditLogs.map((log) => (
              <div key={log.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-neutral-900 dark:text-white capitalize">
                      {log.action_type.replace('_', ' ')}
                    </span>
                    <span
                      className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        log.status === 'executed'
                          ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-400'
                          : log.status === 'denied'
                          ? 'bg-red-100 dark:bg-red-950/50 text-red-800 dark:text-red-400'
                          : log.status === 'security_flag'
                          ? 'bg-red-200 dark:bg-red-900/60 text-red-900 dark:text-red-200'
                          : log.status === 'pending_approval'
                          ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-400'
                          : 'bg-neutral-100 dark:bg-[#262626] text-neutral-700 dark:text-neutral-300'
                      }`}
                    >
                      {log.status}
                    </span>
                    {log.record_hash && (
                      <span className="text-[9px] font-mono text-neutral-400 dark:text-neutral-500">
                        hash:{log.record_hash.slice(0, 8)}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 truncate max-w-md">{log.result_summary || 'No details'}</p>
                </div>
                <span className="text-[10px] text-neutral-400 dark:text-neutral-500 shrink-0">
                  {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
