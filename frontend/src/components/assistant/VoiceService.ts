/**
 * Voice & Speech Adapter for OpusLex AI Assistant
 * 
 * Provides an English-first Web Speech API adapter for speech recognition
 * and synthesis with graceful degradation to text-only mode.
 * Does not persist raw audio streams.
 */

export interface VoiceOption {
  name: string;
  lang: string;
  default: boolean;
}

export type VoiceState = 'idle' | 'listening' | 'speaking' | 'error';

class VoiceService {
  private recognition: any | null = null;
  private standbyRecognition: any | null = null;
  private synthesis: SpeechSynthesis | null = null;
  private isListening = false;
  private isStandbyListening = false;
  private standbyCallback: (() => void) | null = null;
  private standbyErrorCallback: ((err: string) => void) | null = null;
  private isTabVisible = true;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private speechRate = 1.0;
  private audioContext: any | null = null;
  private audioStream: MediaStream | null = null;
  private analyser: any | null = null;
  private animFrameId: number | null = null;
  private onAudioLevelCallback: ((level: number) => void) | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // 1. Initialize Speech Recognition (standard or webkit prefix)
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        try {
          this.recognition = new SpeechRecognition();
          this.recognition.continuous = false;
          this.recognition.interimResults = true; // Support real-time transcript preview
          this.recognition.lang = 'en-US'; // English-first initial release
          this.recognition.maxAlternatives = 1;
        } catch (e) {
          console.warn('[VoiceService] Failed to initialize SpeechRecognition:', e);
          this.recognition = null;
        }

        try {
          this.standbyRecognition = new SpeechRecognition();
          this.standbyRecognition.continuous = true;
          this.standbyRecognition.interimResults = true;
          this.standbyRecognition.lang = 'en-US';
          this.standbyRecognition.maxAlternatives = 1;
        } catch {
          this.standbyRecognition = null;
        }
      }

      // Handle visibility changes responsibly: pause standby when tab is backgrounded
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          this.isTabVisible = !document.hidden;
          if (this.isStandbyListening) {
            if (document.hidden) {
              try { this.standbyRecognition?.stop(); } catch {}
            } else {
              try { this.standbyRecognition?.start(); } catch {}
            }
          }
        });
      }

      // 2. Initialize Speech Synthesis
      if ('speechSynthesis' in window) {
        this.synthesis = window.speechSynthesis;
        this.loadVoices();
        if (this.synthesis.onvoiceschanged !== undefined) {
          this.synthesis.onvoiceschanged = () => this.loadVoices();
        }
      }
    }
  }

  public setSpeechRate(rate: number): void {
    if (rate >= 0.5 && rate <= 2.0) {
      this.speechRate = rate;
    }
  }

  public getSpeechRate(): number {
    return this.speechRate;
  }

  public isRecognitionSupported(): boolean {
    return this.recognition !== null;
  }

  public isSynthesisSupported(): boolean {
    return this.synthesis !== null;
  }

  public isSpeaking(): boolean {
    return this.currentUtterance !== null || (this.synthesis?.speaking ?? false);
  }

  private loadVoices() {
    if (!this.synthesis) return;
    this.voices = this.synthesis.getVoices();
  }

  public getAvailableVoices(): VoiceOption[] {
    if (!this.synthesis) return [];
    if (this.voices.length === 0) {
      this.loadVoices();
    }
    return this.voices.map((v) => ({
      name: v.name,
      lang: v.lang,
      default: v.default,
    }));
  }

  /**
   * Start listening for English speech input with optional interim live transcript.
   */
  public startListening(
    onResult: (transcript: string) => void,
    onError: (error: string) => void,
    onEnd: () => void,
    onInterim?: (interim: string) => void,
    onAudioLevel?: (level: number) => void
  ): boolean {
    if (!this.recognition) {
      onError('Speech recognition is not supported in this browser.');
      return false;
    }

    if (this.isListening) {
      this.stopListening();
    }

    this.onAudioLevelCallback = onAudioLevel || null;

    // Connect Web Audio API Analyser for real microphone amplitude metering
    if (onAudioLevel && typeof window !== 'undefined' && navigator?.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          if (!this.isListening) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          this.audioStream = stream;
          try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx) {
              this.audioContext = new AudioCtx();
              const source = this.audioContext.createMediaStreamSource(stream);
              this.analyser = this.audioContext.createAnalyser();
              this.analyser.fftSize = 64;
              this.analyser.smoothingTimeConstant = 0.4;
              source.connect(this.analyser);
              const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

              const sampleAudio = () => {
                if (!this.isListening || !this.analyser) {
                  if (this.onAudioLevelCallback) this.onAudioLevelCallback(0);
                  return;
                }
                this.analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                  sum += dataArray[i];
                }
                const avg = sum / dataArray.length;
                const normalized = Math.min(1.0, Math.max(0, avg / 120));
                if (this.onAudioLevelCallback) {
                  this.onAudioLevelCallback(normalized);
                }
                this.animFrameId = requestAnimationFrame(sampleAudio);
              };
              this.animFrameId = requestAnimationFrame(sampleAudio);
            }
          } catch {
            // Audio context failed gracefully, recognition continues
          }
        })
        .catch(() => {
          // Stream error handled by speech recognition onerror
        });
    }

    this.recognition.onstart = () => {
      this.isListening = true;
    };

    this.recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (interimTranscript && onInterim) {
        onInterim(interimTranscript);
      }

      if (finalTranscript && finalTranscript.trim()) {
        this.isListening = false;
        this.stopAudioAnalysis();
        onResult(finalTranscript.trim());
      }
    };

    this.recognition.onerror = (event: any) => {
      this.isListening = false;
      this.stopAudioAnalysis();
      // Silently ignore benign events (no-speech timeout and aborted by user/system)
      if (event.error === 'no-speech' || event.error === 'aborted') {
        return;
      }
      let msg = 'Speech recognition error.';
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        msg = 'Microphone permission denied. Switched to text mode.';
      } else if (event.error === 'network') {
        msg = 'Network error during speech recognition.';
      } else if (event.error === 'audio-capture') {
        msg = 'No microphone audio input detected.';
      }
      onError(msg);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      this.stopAudioAnalysis();
      onEnd();
    };

    try {
      this.recognition.start();
      return true;
    } catch (e: any) {
      this.isListening = false;
      this.stopAudioAnalysis();
      onError(e.message || 'Failed to start speech recognition.');
      return false;
    }
  }

  private stopAudioAnalysis(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.audioStream) {
      this.audioStream.getTracks().forEach((track) => {
        try { track.stop(); } catch {}
      });
      this.audioStream = null;
    }
    if (this.audioContext) {
      try { this.audioContext.close(); } catch {}
      this.audioContext = null;
    }
    this.analyser = null;
    if (this.onAudioLevelCallback) {
      this.onAudioLevelCallback(0);
      this.onAudioLevelCallback = null;
    }
  }

  /**
   * Immediately abort and stop listening, releasing all microphone resources.
   */
  public stopListening(): void {
    this.stopAudioAnalysis();
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {}
      this.isListening = false;
    }
  }

  /**
   * Speak response using Web Speech Synthesis.
   */
  public speak(
    text: string,
    voiceName?: string | null,
    onStart?: () => void,
    onEnd?: () => void,
    onError?: (err: string) => void
  ): void {
    if (!this.synthesis) {
      if (onError) onError('Speech synthesis is not supported.');
      return;
    }

    // Cancel any active speech
    this.stopSpeaking();

    // Clean markdown symbols or HTML from text before speaking
    const cleanText = text
      .replace(/[*_#`[\]()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'en-US';
    utterance.rate = this.speechRate;


    if (voiceName) {
      const selected = this.voices.find((v) => v.name === voiceName);
      if (selected) {
        utterance.voice = selected;
      }
    }

    utterance.onstart = () => {
      if (onStart) onStart();
    };

    utterance.onend = () => {
      this.currentUtterance = null;
      if (onEnd) onEnd();
    };

    utterance.onerror = (e) => {
      this.currentUtterance = null;
      if (onError) onError(e.error);
    };

    this.currentUtterance = utterance;
    this.synthesis.speak(utterance);
  }

  /**
   * Stop any active speech output immediately.
   */
  public stopSpeaking(): void {
    if (this.synthesis) {
      try {
        this.synthesis.cancel();
      } catch {}
    }
    this.currentUtterance = null;
  }

  /**
   * Start opt-in "Hey Themis" foreground wake-word detector.
   * Only active while the tab is in foreground and requires explicit user activation.
   */
  public startWakeWordStandby(
    onWakeWord: () => void,
    onError: (err: string) => void,
    onStateChange?: (active: boolean) => void
  ): boolean {
    if (!this.standbyRecognition) {
      onError('Speech recognition is not supported in this browser.');
      return false;
    }

    if (this.isStandbyListening) {
      this.stopWakeWordStandby();
    }

    this.standbyCallback = onWakeWord;
    this.standbyErrorCallback = onError;
    this.isStandbyListening = true;

    // Wake word pattern: requires attention cue "hey / hi / ok / okay" followed by "themis"
    const WAKE_WORD_PATTERN = /(?:^|\b)(?:hey|hi|hello|ok|okay)\s+themis\b/i;

    this.standbyRecognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const text = event.results[i][0]?.transcript || '';
        if (WAKE_WORD_PATTERN.test(text)) {
          // Wake word triggered! Stop standby and invoke callback
          this.stopWakeWordStandby();
          if (this.standbyCallback) {
            this.standbyCallback();
          }
          return;
        }
      }
    };

    this.standbyRecognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        this.isStandbyListening = false;
        if (onStateChange) onStateChange(false);
        const msg = 'Microphone permission denied for wake-word standby.';
        if (this.standbyErrorCallback) {
          this.standbyErrorCallback(msg);
        }
        onError(msg);
      } else if (event.error === 'no-speech') {
        // Normal during ambient silence; loop continues in onend
      }
    };

    this.standbyRecognition.onend = () => {
      // Auto-restart standby loop if user left it active and tab is visible
      if (this.isStandbyListening && this.isTabVisible) {
        try {
          this.standbyRecognition.start();
        } catch {}
      } else if (!this.isStandbyListening) {
        if (onStateChange) onStateChange(false);
      }
    };

    try {
      this.standbyRecognition.start();
      if (onStateChange) onStateChange(true);
      return true;
    } catch (e: any) {
      this.isStandbyListening = false;
      if (onStateChange) onStateChange(false);
      onError(e.message || 'Failed to start wake-word standby.');
      return false;
    }
  }

  /**
   * Stop wake-word standby listening.
   */
  public stopWakeWordStandby(): void {
    this.isStandbyListening = false;
    if (this.standbyRecognition) {
      try {
        this.standbyRecognition.stop();
      } catch {}
    }
  }

  /**
   * Check if wake-word standby is currently active.
   */
  public isWakeWordActive(): boolean {
    return this.isStandbyListening;
  }
}


export const voiceService = new VoiceService();
