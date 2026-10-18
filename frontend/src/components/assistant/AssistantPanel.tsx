import { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Mic,
  Volume2,
  Trash2,
  AlertTriangle,
  Eye,
  MessageSquare,
  Sparkles,
  ExternalLink,
  Shield,
  CornerDownLeft,
  Square,
} from 'lucide-react';
import { MarkdownRenderer } from '../common/MarkdownRenderer';
import { useTranslation } from 'react-i18next';
import { voiceService } from './VoiceService';
import AssistantOrb, { type AssistantOrbState } from './AssistantOrb';
import { usePreferences } from '../../contexts/PreferencesContext';
import { detectOperatingSystem, getAssistantShortcuts } from '../../utils/keyboardShortcuts';

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/+$/, "");

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  status?: 'success' | 'action_pending' | 'suggested' | 'denied' | 'error' | 'clarification_needed';
  action?: {
    id: string;
    type: string;
    title: string;
    description: string;
    payload: Record<string, any>;
    requires_approval: boolean;
    risk_level: 'low' | 'medium' | 'high';
    permission_level_required: number;
    confirmation_token?: string;
  };
  sources?: Array<{
    document_title?: string;
    filename?: string;
    page_number?: number;
    similarity?: number;
  }>;
}

interface AssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'voice' | 'text';
  setMode: (mode: 'voice' | 'text') => void;
  orbState?: AssistantOrbState;
  setOrbState: (state: AssistantOrbState) => void;
  activeSection: string;
  investigationId?: number;
  documentIds?: number[];
  permissionLevel: number;
  voiceEnabled: boolean;
  onToggleVoice: () => void;
  selectedVoice?: string | null;
}

export default function AssistantPanel({
  isOpen,
  onClose,
  mode,
  setMode,
  orbState: controlledOrbState,
  setOrbState,
  activeSection,
  investigationId,
  documentIds,
  permissionLevel,
  voiceEnabled,
  selectedVoice,
}: AssistantPanelProps) {
  const { t } = useTranslation();
  const { transcriptFontSize } = usePreferences();

  // Host OS shortcuts
  const hostOS = detectOperatingSystem();
  const shortcuts = getAssistantShortcuts(hostOS);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: 'welcome',
      sender: 'assistant',
      text: `Hello! I am Themis, your OpusLex compliance assistant. I can answer regulatory inquiries, search compliance policies, and assist with investigation tasks.\n\nActive Security: Level ${permissionLevel} (${
        permissionLevel === 1
          ? 'Read & Answer'
          : permissionLevel === 2
          ? 'Suggest'
          : permissionLevel === 3
          ? 'Execute with Approval'
          : 'Limited Autonomy'
      }).`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [conversationId] = useState(() => `conv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUserScrolledUp, setIsUserScrolledUp] = useState<boolean>(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  const transcriptBottomRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Derive active computed Orb state
  const computedOrbState: AssistantOrbState = useMemo(() => {
    if (isSubmitting) return 'thinking';
    if (isListening) return 'listening';
    if (isSpeaking) return 'speaking';
    const lastMsg = messages[messages.length - 1];
    if (lastMsg?.status === 'action_pending') return 'action-pending';
    return controlledOrbState || 'idle';
  }, [isSubmitting, isListening, isSpeaking, messages, controlledOrbState]);

  // Subtitle font size mapping
  const fontSizeClasses = useMemo(() => {
    switch (transcriptFontSize) {
      case 's':
        return 'text-xs'; // ~13px
      case 'l':
        return 'text-base'; // ~17px
      case 'xl':
        return 'text-lg'; // ~19px
      case 'm':
      default:
        return 'text-sm'; // ~15px
    }
  }, [transcriptFontSize]);

  // Auto-focus input when opening Spotlight text mode
  useEffect(() => {
    if (isOpen && mode === 'text') {
      const timer = setTimeout(() => inputRef.current?.focus(), 80);
      return () => clearTimeout(timer);
    }
  }, [isOpen, mode]);

  // Scroll to bottom on new messages in text mode
  useEffect(() => {
    if (mode === 'text') {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, mode]);

  // Synchronized lyric scrolling in voice mode
  useEffect(() => {
    if (mode === 'voice' && !isUserScrolledUp) {
      transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, interimTranscript, isSubmitting, mode, isUserScrolledUp]);

  // Dynamic speech audio cadence for orb reactivity during assistant TTS playback
  useEffect(() => {
    if (!isSpeaking) return;
    let animId: number;
    let t = 0;
    const pulseAudio = () => {
      t += 0.09;
      const syllableWave = Math.sin(t * 3.4) * 0.5 + 0.5;
      const sentenceWave = Math.sin(t * 0.95) * 0.3 + 0.7;
      const cadence = syllableWave * sentenceWave;
      setAudioLevel(0.12 + cadence * 0.42);
      animId = requestAnimationFrame(pulseAudio);
    };
    animId = requestAnimationFrame(pulseAudio);
    return () => {
      cancelAnimationFrame(animId);
      if (!isListening) setAudioLevel(0);
    };
  }, [isSpeaking, isListening]);

  // Auto-listen when Voice Mode opens (if enabled and user opened it)
  useEffect(() => {
    if (isOpen && mode === 'voice') {
      if (!isListening && !isSpeaking && !isSubmitting) {
        startVoiceListening();
      }
    } else {
      if (isListening) {
        voiceService.stopListening();
        setIsListening(false);
        setAudioLevel(0);
        setInterimTranscript('');
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode]);

  // Voice listening handler
  const startVoiceListening = () => {
    if (isSpeaking) {
      voiceService.stopSpeaking();
      setIsSpeaking(false);
    }

    setIsListening(true);
    setOrbState('listening');
    setInterimTranscript('');

    const started = voiceService.startListening(
      // On final result
      (transcript) => {
        setIsListening(false);
        setAudioLevel(0);
        setInterimTranscript('');
        setOrbState('idle');

        const trimmed = transcript.trim().toLowerCase();
        // Check for verbal mode-switch command
        if (trimmed.includes('switch to text') || trimmed.includes('text mode') || trimmed.includes('open text')) {
          setMode('text');
          return;
        }

        if (transcript.trim()) {
          handleSendMessage(transcript.trim());
        }
      },
      // On error
      (errorMsg) => {
        setIsListening(false);
        setAudioLevel(0);
        setInterimTranscript('');
        setOrbState('idle');
        // Do not pollute the chat messages transcript with voice errors
        if (errorMsg.includes('permission denied') || errorMsg.includes('not-allowed')) {
          setMode('text');
          setVoiceNotice('Microphone permission denied. Switched to text mode.');
        } else if (errorMsg && !errorMsg.includes('aborted') && !errorMsg.includes('no-speech')) {
          setVoiceNotice(errorMsg);
        }
        setTimeout(() => setVoiceNotice(null), 5000);
      },
      // On end
      () => {
        setIsListening(false);
        setAudioLevel(0);
        setInterimTranscript('');
        setOrbState('idle');
      },
      // On interim transcript
      (interim) => {
        setInterimTranscript(interim);
        const lower = interim.toLowerCase();
        if (lower.includes('switch to text') || lower.includes('text mode')) {
          voiceService.stopListening();
          setIsListening(false);
          setAudioLevel(0);
          setInterimTranscript('');
          setMode('text');
        }
      },
      // Real-time audio amplitude metering for organic orb reaction
      (level) => {
        setAudioLevel(level);
      }
    );

    if (!started) {
      setIsListening(false);
      setAudioLevel(0);
      setOrbState('idle');
    }
  };

  const handleToggleListening = () => {
    if (isListening) {
      voiceService.stopListening();
      setIsListening(false);
      setAudioLevel(0);
      setInterimTranscript('');
      setOrbState('idle');
    } else {
      startVoiceListening();
    }
  };

  const handleClose = () => {
    if (isListening) {
      voiceService.stopListening();
      setIsListening(false);
      setAudioLevel(0);
    }
    if (isSpeaking) {
      voiceService.stopSpeaking();
      setIsSpeaking(false);
    }
    setInterimTranscript('');
    onClose();
  };

  const handleTranscriptScroll = () => {
    if (!transcriptContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = transcriptContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 35;
    setIsUserScrolledUp(!isAtBottom);
  };

  const scrollToBottom = () => {
    setIsUserScrolledUp(false);
    transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsSubmitting(false);
    setOrbState('idle');
  };

  const handleSendMessage = async (rawText?: string) => {
    const textToSend = (rawText || inputText).trim();
    if (!textToSend || isSubmitting) return;

    if (isSpeaking) {
      voiceService.stopSpeaking();
      setIsSpeaking(false);
    }

    const userMessage: ChatMessage = {
      id: `msg_u_${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const assistantMsgId = `msg_a_${Date.now()}`;
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      sender: 'assistant',
      text: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status: 'success',
    };

    setMessages((prev) => [...prev, userMessage, initialAssistantMsg]);
    setInputText('');
    setIsSubmitting(true);
    setOrbState('thinking');

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const token = localStorage.getItem('access_token');
    const requestPayload = {
      message: textToSend,
      conversation_id: conversationId,
      context: {
        active_section: activeSection,
        investigation_id: investigationId || null,
        document_ids: documentIds || null,
      },
    };

    let streamSucceeded = false;

    try {
      // 1. Attempt true token-by-token streaming from /api/v1/assistant/stream
      const response = await fetch(`${API_BASE}/api/v1/assistant/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(requestPayload),
        signal: abortController.signal,
      });

      if (response.ok && response.body) {
        streamSucceeded = true;
        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullResponseText = '';
        let finalAction: any = undefined;
        let finalSources: any = undefined;
        let finalStatus: ChatMessage['status'] = 'success';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          let currentEvent = 'message';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('event:')) {
              currentEvent = trimmed.slice(6).trim();
            } else if (trimmed.startsWith('data:')) {
              const dataStr = trimmed.slice(5).trim();
              try {
                const parsed = JSON.parse(dataStr);
                if (currentEvent === 'delta') {
                  const delta = parsed.delta || '';
                  if (delta) {
                    fullResponseText += delta;
                    setMessages((prev) =>
                      prev.map((m) =>
                        m.id === assistantMsgId
                          ? { ...m, text: fullResponseText }
                          : m
                      )
                    );
                  }
                } else if (currentEvent === 'sources') {
                  finalSources = parsed.sources || [];
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, sources: finalSources }
                        : m
                    )
                  );
                } else if (currentEvent === 'done') {
                  if (parsed.response_text) fullResponseText = parsed.response_text;
                  if (parsed.action) finalAction = parsed.action;
                  if (parsed.status) finalStatus = parsed.status;
                  if (parsed.sources) finalSources = parsed.sources;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId
                        ? {
                            ...m,
                            text: fullResponseText,
                            status: finalStatus,
                            action: finalAction,
                            sources: finalSources,
                          }
                        : m
                    )
                  );
                } else if (currentEvent === 'error') {
                  finalStatus = 'error';
                  const errMsg = parsed.error || 'Streaming error occurred.';
                  fullResponseText = `Error: ${errMsg}`;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, text: fullResponseText, status: 'error' }
                        : m
                    )
                  );
                }
              } catch {
                // Ignore parsing errors for heartbeats or non-JSON comments
              }
            }
          }
        }

        // Handle navigation execution
        if (finalAction?.type === 'navigate' && finalStatus === 'success') {
          const targetSection = finalAction.payload?.section;
          if (targetSection) {
            window.dispatchEvent(new CustomEvent('switch_tab', { detail: targetSection }));
          }
        }

        // Update Orb state
        if (finalStatus === 'action_pending') {
          setOrbState('action-pending');
        } else if (finalStatus === 'error' || finalStatus === 'denied') {
          setOrbState('error');
          setTimeout(() => setOrbState('idle'), 3000);
        } else {
          setOrbState('success');
          setTimeout(() => setOrbState('idle'), 2000);
        }

        // Speak in voice mode or if voice enabled
        if ((mode === 'voice' || voiceEnabled) && fullResponseText) {
          setIsSpeaking(true);
          setOrbState('speaking');
          voiceService.speak(
            fullResponseText,
            selectedVoice,
            () => setIsSpeaking(true),
            () => {
              setIsSpeaking(false);
              setOrbState('idle');
            },
            () => {
              setIsSpeaking(false);
              setOrbState('idle');
            }
          );
        }
      }
    } catch (streamErr: any) {
      if (streamErr.name === 'AbortError') {
        // User clicked Stop Generation
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, text: m.text ? `${m.text}\n\n*(Generation stopped by user)*` : '*(Generation stopped by user)*' }
              : m
          )
        );
        setIsSubmitting(false);
        setOrbState('idle');
        return;
      }
    }

    // 2. Fallback to /api/v1/assistant/interact if streaming failed
    if (!streamSucceeded) {
      try {
        const response = await fetch(`${API_BASE}/api/v1/assistant/interact`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(requestPayload),
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Server returned status ${response.status}`);
        }

        const data = await response.json();

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  text: data.response_text,
                  status: data.status,
                  action: data.action || undefined,
                  sources: data.sources || data.action?.payload?.sources || undefined,
                }
              : m
          )
        );

        if (data.action?.type === 'navigate' && data.status === 'success') {
          const targetSection = data.action.payload?.section;
          if (targetSection) {
            window.dispatchEvent(new CustomEvent('switch_tab', { detail: targetSection }));
          }
        }

        if (data.status === 'action_pending') {
          setOrbState('action-pending');
        } else if (data.status === 'error' || data.status === 'denied') {
          setOrbState('error');
          setTimeout(() => setOrbState('idle'), 3000);
        } else {
          setOrbState('success');
          setTimeout(() => setOrbState('idle'), 2000);
        }

        if ((mode === 'voice' || voiceEnabled) && data.response_text) {
          setIsSpeaking(true);
          setOrbState('speaking');
          voiceService.speak(
            data.response_text,
            selectedVoice,
            () => setIsSpeaking(true),
            () => {
              setIsSpeaking(false);
              setOrbState('idle');
            },
            () => {
              setIsSpeaking(false);
              setOrbState('idle');
            }
          );
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        setOrbState('error');
        let displayError = err.message || 'Unknown network error.';
        if (
          (err.name === 'TypeError' || !err.message) &&
          (displayError.toLowerCase().includes('failed') || displayError.toLowerCase().includes('network') || displayError === 'Load failed')
        ) {
          displayError = 'Unable to connect to the OpusLex backend service. Please ensure the server is active on http://127.0.0.1:8000.';
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? { ...m, text: `Error processing request: ${displayError}`, status: 'error' }
              : m
          )
        );
        setTimeout(() => setOrbState('idle'), 3000);
      }
    }

    setIsSubmitting(false);
    abortControllerRef.current = null;
  };

  const handleConfirmAction = async (msgId: string, action: any, confirmed: boolean) => {
    setIsSubmitting(true);
    setOrbState('thinking');

    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${API_BASE}/api/v1/assistant/actions/confirm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          conversation_id: conversationId,
          action_id: action.id,
          action_type: action.type,
          payload: action.payload,
          confirmed,
          confirmation_token: action.confirmation_token,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.detail || `Confirmation request returned ${response.status}`);
      }

      const data = await response.json();

      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? {
                ...m,
                status: confirmed ? 'success' : 'denied',
                text: `${m.text}\n\n[Status: ${data.message || (confirmed ? 'Action Approved & Executed' : 'Action Rejected')}]`,
              }
            : m
        )
      );

      setOrbState(confirmed ? 'success' : 'idle');
      setTimeout(() => setOrbState('idle'), 2000);

      if (data.message && (mode === 'voice' || voiceEnabled)) {
        setIsSpeaking(true);
        setOrbState('speaking');
        voiceService.speak(
          data.message,
          selectedVoice,
          () => setIsSpeaking(true),
          () => {
            setIsSpeaking(false);
            setOrbState('idle');
          },
          () => {
            setIsSpeaking(false);
            setOrbState('idle');
          }
        );
      }
    } catch (err: any) {
      setOrbState('error');
      setMessages((prev) => [
        ...prev,
        {
          id: `msg_err_${Date.now()}`,
          sender: 'assistant',
          text: `Action confirmation failed: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          status: 'error',
        },
      ]);
      setTimeout(() => setOrbState('idle'), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExplainPage = () => {
    handleSendMessage(`Please explain the current page or view (${activeSection}) and any active compliance obligations.`);
  };

  const handleReplayVoice = (text: string) => {
    setIsSpeaking(true);
    setOrbState('speaking');
    voiceService.speak(
      text,
      selectedVoice,
      () => setIsSpeaking(true),
      () => {
        setIsSpeaking(false);
        setOrbState('idle');
      },
      () => {
        setIsSpeaking(false);
        setOrbState('idle');
      }
    );
  };

  const handleClearChat = async () => {
    try {
      const token = localStorage.getItem('access_token');
      await fetch(`${API_BASE}/api/v1/assistant/conversations/${conversationId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
    } catch {}

    setMessages([
      {
        id: 'cleared',
        sender: 'assistant',
        text: 'Conversation history cleared. How may I assist your compliance inquiries?',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  if (!isOpen) return null;

  const pendingActionMessage = messages[messages.length - 1]?.status === 'action_pending' ? messages[messages.length - 1] : null;

  // ───────────────────────────────────────────────────────────────────────────
  // 1. IMMERSIVE VOICE EXPERIENCE (Window Removed, Atmosphere Retained)
  // ───────────────────────────────────────────────────────────────────────────
  if (mode === 'voice') {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Themis Voice Mode"
        className="fixed inset-0 z-[200] flex flex-col justify-between p-6 sm:p-8 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 select-none overflow-hidden"
      >
        {/* ── Top Bar: Title & Controls ── */}
        <div className="w-full flex items-center justify-between z-10">
          {/* Top-Left: Themis + Voice Mode Pill */}
          <div className="flex items-center gap-2.5">
            <span className="text-base font-semibold tracking-wide text-white">Themis</span>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-[#FBC648]/15 text-[#FBC648] border border-[#FBC648]/30">
              Voice Mode
            </span>
          </div>

          {/* Top-Right: Text Mode, Explain Page, Close (X) */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => {
                if (isListening) voiceService.stopListening();
                if (isSpeaking) voiceService.stopSpeaking();
                setMode('text');
              }}
              title="Switch to Text Mode"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-[#171717]/85 hover:bg-[#262626] text-neutral-300 hover:text-white border border-[#262626] transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <MessageSquare size={13} />
              <span>Text Mode</span>
            </button>

            <button
              onClick={handleExplainPage}
              disabled={isSubmitting}
              title="Explain current page context"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium bg-[#171717]/85 hover:bg-[#262626] text-[#FBC648] hover:text-amber-300 border border-[#FBC648]/30 transition-all cursor-pointer shadow-xs disabled:opacity-50 active:scale-95"
            >
              <Sparkles size={13} className="text-[#FBC648]" />
              <span>Explain Page</span>
            </button>

            <button
              onClick={handleClose}
              aria-label="Close Themis Voice Mode"
              className="h-8 w-8 rounded-full flex items-center justify-center bg-[#171717]/85 hover:bg-[#262626] text-neutral-400 hover:text-white border border-[#262626] transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Voice Error Notice Banner (Non-Intrusive) */}
        {voiceNotice && (
          <div className="w-full max-w-md mx-auto my-2 px-4 py-2 rounded-full bg-amber-500/20 border border-amber-500/40 text-xs text-amber-200 flex items-center justify-between gap-2 shadow-lg animate-in fade-in z-20">
            <div className="flex items-center gap-2 truncate">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span className="truncate">{voiceNotice}</span>
            </div>
            <button
              onClick={() => setVoiceNotice(null)}
              className="p-1 hover:bg-white/10 rounded-full text-neutral-400 hover:text-white"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* ── Center: Floating Glowing Themis Orb (Click to Toggle Listening) ── */}
        <div className="w-full flex-1 flex flex-col items-center justify-center my-auto z-10">
          <AssistantOrb
            state={computedOrbState}
            audioLevel={audioLevel}
            onClick={handleToggleListening}
            isCentered={true}
            size="xl"
            shortcut={shortcuts.voiceKeyLabel}
          />
        </div>

        {/* ── Bottom: Apple Music-Style Synchronized Subtitles ── */}
        <div className="w-full max-w-2xl mx-auto flex flex-col items-center z-10 pb-2">
          {/* Pending Action Confirmation Card (Floating above subtitles) */}
          {pendingActionMessage && pendingActionMessage.action && (
            <div className="w-full mb-3 rounded-2xl border border-amber-500/50 bg-[#171717]/90 backdrop-blur-md p-4 text-xs text-amber-200 flex flex-col gap-2.5 shadow-xl animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 font-semibold text-amber-400">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{t('assistantUI.actionRequiresApproval')}: {pendingActionMessage.action.title}</span>
              </div>
              <p className="text-[12px] text-neutral-300 leading-normal">{pendingActionMessage.action.description}</p>
              <div className="flex gap-2.5 mt-1">
                <button
                  onClick={() => handleConfirmAction(pendingActionMessage.id, pendingActionMessage.action, true)}
                  className="flex-1 py-2 px-4 rounded-full bg-[#FBC648] hover:bg-[#F0BD44] text-neutral-900 font-semibold text-xs cursor-pointer shadow-md transition-all active:scale-[0.98]"
                >
                  {t('assistantUI.approveAction')}
                </button>
                <button
                  onClick={() => handleConfirmAction(pendingActionMessage.id, pendingActionMessage.action, false)}
                  className="py-2 px-4 rounded-full bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium cursor-pointer transition-colors active:scale-[0.98]"
                >
                  {t('assistantUI.rejectAction')}
                </button>
              </div>
            </div>
          )}

          {/* Subtitles Scrollable Area */}
          <div className="relative w-full">
            <div
              ref={transcriptContainerRef}
              onScroll={handleTranscriptScroll}
              className={`w-full max-h-[26vh] sm:max-h-[30vh] overflow-y-auto px-4 py-2 space-y-3.5 text-center transition-all ${fontSizeClasses}`}
              style={{
                maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.4) 15%, black 40%, black 100%)',
                WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.4) 15%, black 40%, black 100%)',
              }}
            >
              {messages.map((item, index) => {
                const isLatest = index === messages.length - 1;
                return (
                  <div
                    key={item.id}
                    className={`transition-all duration-300 flex flex-col items-center ${
                      isLatest ? 'opacity-100 scale-100' : 'opacity-65 hover:opacity-90 scale-[0.99]'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className={`text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        item.sender === 'assistant'
                          ? 'bg-[#FBC648]/15 text-[#FBC648]'
                          : 'bg-white/10 text-neutral-300'
                      }`}>
                        {item.sender === 'assistant' ? 'Themis' : 'You'}
                      </span>
                      <span className="text-[10px] text-neutral-500 font-mono">{item.timestamp}</span>
                    </div>
                    <p className={`max-w-xl text-center leading-relaxed ${
                      item.sender === 'assistant' ? 'text-white font-medium' : 'text-neutral-200'
                    }`}>
                      {item.text}
                    </p>
                  </div>
                );
              })}

              {/* Interim Live Recognition */}
              {interimTranscript && (
                <div className="transition-all duration-200 flex flex-col items-center opacity-100">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/15 text-white">
                      You
                    </span>
                    <span className="text-[10px] text-amber-400 font-mono animate-pulse">speaking...</span>
                  </div>
                  <p className="max-w-xl text-center leading-relaxed text-[#FBC648] font-medium italic">
                    "{interimTranscript}..."
                  </p>
                </div>
              )}

              {/* Thinking State Indicator */}
              {isSubmitting && (
                <div className="flex flex-col items-center opacity-90 animate-pulse py-1">
                  <span className="text-xs text-amber-300 font-medium">Consulting legal regulations & policies...</span>
                </div>
              )}

              <div ref={transcriptBottomRef} className="h-1" />
            </div>

            {/* Resume Live Subtitles Floating Button */}
            {isUserScrolledUp && (
              <button
                onClick={scrollToBottom}
                className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-[#171717] text-[#FBC648] border border-[#FBC648]/40 shadow-lg cursor-pointer hover:bg-[#262626] transition-all animate-bounce"
              >
                <span>↓ Resume live subtitles</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ───────────────────────────────────────────────────────────────────────────
  // 2. SPOTLIGHT-STYLE TEXT INTERFACE (Centered Overlay)
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Themis Compliance Spotlight"
      className="fixed inset-0 z-[200] flex justify-center items-start pt-[6vh] sm:pt-[10vh] bg-black/60 backdrop-blur-md p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="w-full max-w-2xl bg-white dark:bg-[#171717] border border-neutral-200 dark:border-[#262626] rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[82vh] transition-all">
        {/* Top Search / Command Bar */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-neutral-200 dark:border-[#262626] bg-neutral-50/70 dark:bg-[#121212]">
          <div className="h-7 w-7 rounded-full bg-[#FBC648]/20 flex items-center justify-center text-[#FBC648] shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>

          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                handleClose();
              }
            }}
            placeholder={t('assistantUI.spotlightPlaceholder')}
            className="flex-1 bg-transparent border-none text-sm text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:ring-0"
          />

          <div className="flex items-center gap-2 shrink-0">
            {/* Explain Page Shortcut */}
            <button
              onClick={handleExplainPage}
              title={t('assistantUI.explainPage')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-full bg-neutral-200/60 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors cursor-pointer"
            >
              <Eye className="h-3.5 w-3.5 text-[#FBC648]" />
              <span className="hidden sm:inline">{t('assistantUI.explainPage')}</span>
            </button>

            {/* Return to Voice Button */}
            <button
              onClick={() => {
                setMode('voice');
              }}
              title={t('assistantUI.switchToVoice')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs rounded-full bg-[#FBC648]/15 hover:bg-[#FBC648]/25 text-amber-600 dark:text-[#FBC648] font-medium transition-colors border border-[#FBC648]/30 cursor-pointer"
            >
              <Mic className="h-3.5 w-3.5" />
              <span>{t('assistantUI.returnToVoice')}</span>
            </button>

            {/* Close Button */}
            <button
              onClick={handleClose}
              className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-200/50 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Voice Error Notice Banner (Text Mode) */}
        {voiceNotice && (
          <div className="mx-4 mt-2 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
              <span>{voiceNotice}</span>
            </div>
            <button
              onClick={() => setVoiceNotice(null)}
              className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-white"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* Scrollable Conversation Thread */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-sm">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-neutral-400">
                <span>{msg.sender === 'user' ? 'You' : 'Themis'}</span>
                <span>•</span>
                <span>{msg.timestamp}</span>
              </div>

              <div
                className={`rounded-2xl px-4 py-2.5 max-w-[85%] leading-relaxed ${
                  msg.sender === 'user'
                    ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900 font-medium'
                    : 'bg-neutral-100 dark:bg-neutral-800/80 text-neutral-800 dark:text-neutral-200 border border-neutral-200/60 dark:border-neutral-700/60'
                }`}
              >
                {msg.sender === 'user' ? (
                  <div className="whitespace-pre-wrap">{msg.text}</div>
                ) : (
                  <div>
                    {!msg.text && isSubmitting ? (
                      <div className="flex items-center gap-1.5 py-1 text-xs text-neutral-400 dark:text-neutral-500 animate-pulse">
                        <Sparkles className="h-3.5 w-3.5 text-[#FBC648]" />
                        <span>Thinking...</span>
                      </div>
                    ) : (
                      <MarkdownRenderer content={msg.text} />
                    )}
                  </div>
                )}

                {/* Evidence Sources / Legal Citations */}
                {msg.sources && msg.sources.length > 0 && (
                  <div className="mt-3 pt-2.5 border-t border-neutral-200 dark:border-neutral-700/80 text-xs text-neutral-600 dark:text-neutral-400">
                    <div className="font-semibold text-neutral-700 dark:text-neutral-300 mb-1 flex items-center gap-1">
                      <ExternalLink className="h-3 w-3 text-[#FBC648]" />
                      <span>Retrieved Citations & Policies:</span>
                    </div>
                    <ul className="list-disc list-inside space-y-0.5">
                      {msg.sources.map((s, idx) => (
                        <li key={idx}>
                          <span className="font-medium text-neutral-800 dark:text-neutral-200">
                            {s.document_title || s.filename || 'Compliance Document'}
                          </span>
                          {s.page_number && <span className="ml-1">(p. {s.page_number})</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Single-Use Action Confirmation Gate */}
                {msg.status === 'action_pending' && msg.action && (
                  <div className="mt-3 p-3.5 rounded-2xl border border-amber-300 dark:border-amber-600/50 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200">
                    <div className="flex items-center gap-2 font-semibold text-xs text-amber-800 dark:text-amber-400 mb-1">
                      <AlertTriangle className="h-4 w-4" />
                      <span>{t('assistantUI.actionRequiresApproval')}: {msg.action.title}</span>
                    </div>
                    <p className="text-xs text-neutral-600 dark:text-neutral-300 mb-3">
                      {msg.action.description}
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleConfirmAction(msg.id, msg.action, true)}
                        className="px-4 py-1.5 rounded-full bg-[#FBC648] hover:bg-[#F0BD44] text-neutral-900 font-semibold text-xs transition-colors cursor-pointer shadow-sm"
                      >
                        {t('assistantUI.approveAction')}
                      </button>
                      <button
                        onClick={() => handleConfirmAction(msg.id, msg.action, false)}
                        className="px-4 py-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 text-xs transition-colors cursor-pointer"
                      >
                        {t('assistantUI.rejectAction')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Voice Replay Button */}
                {msg.sender === 'assistant' && (
                  <div className="mt-2 flex items-center justify-end">
                    <button
                      onClick={() => handleReplayVoice(msg.text)}
                      className="p-1 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                      title="Replay Voice"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Bottom Toolbar & Footer */}
        <div className="px-4 py-3 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50/70 dark:bg-[#10121a] flex items-center justify-between text-xs text-neutral-500">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1 text-neutral-600 dark:text-neutral-400 font-medium">
              <Shield className="h-3.5 w-3.5 text-[#FBC648]" />
              <span>Level {permissionLevel}</span>
            </span>
            <span>•</span>
            <span>{t('assistantUI.contextBadge', { section: activeSection })}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleClearChat}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-neutral-400 hover:text-red-500 transition-colors cursor-pointer"
              title={t('assistantUI.clearHistory')}
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('assistantUI.clearHistory')}</span>
            </button>

            {isSubmitting ? (
              <button
                onClick={handleStopGeneration}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white font-medium transition-all cursor-pointer shadow-sm active:scale-[0.98]"
                title="Stop generation"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                onClick={() => handleSendMessage()}
                disabled={!inputText.trim()}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#FBC648] hover:bg-[#F0BD44] text-neutral-900 font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm active:scale-[0.98]"
              >
                <span>{t('assistantUI.send')}</span>
                <CornerDownLeft className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
