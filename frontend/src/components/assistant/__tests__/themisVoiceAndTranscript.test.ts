import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Helper functions mirroring AssistantPanel & AssistantOrb state and transcript resolution logic

export function resolveTranscriptFontSize(size: string): string {
  switch (size) {
    case 's':
      return 'text-xs';
    case 'l':
      return 'text-base';
    case 'xl':
      return 'text-lg';
    case 'm':
    default:
      return 'text-sm';
  }
}

export function computeThemisOrbState({
  isSubmitting,
  isListening,
  isSpeaking,
  hasPendingAction,
  fallbackState = 'idle',
}: {
  isSubmitting: boolean;
  isListening: boolean;
  isSpeaking: boolean;
  hasPendingAction: boolean;
  fallbackState?: string;
}): string {
  if (isSubmitting) return 'thinking';
  if (isListening) return 'listening';
  if (isSpeaking) return 'speaking';
  if (hasPendingAction) return 'action-pending';
  return fallbackState;
}

export interface TranscriptItem {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  isFinal: boolean;
  timestamp: string;
}

export function handleIncomingTranscriptSegment(
  currentList: TranscriptItem[],
  newText: string,
  isFinal: boolean
): { updatedList: TranscriptItem[]; activeInterim: string } {
  const trimmed = newText.trim();
  if (!trimmed) {
    return { updatedList: currentList, activeInterim: '' };
  }

  if (isFinal) {
    const finalItem: TranscriptItem = {
      id: `seg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sender: 'user',
      text: trimmed,
      isFinal: true,
      timestamp: '12:00 PM',
    };
    return {
      updatedList: [...currentList, finalItem],
      activeInterim: '',
    };
  }

  return {
    updatedList: currentList,
    activeInterim: trimmed,
  };
}

describe('Themis Voice Overlay & Transcript Subtitles', () => {
  describe('Transcript Font Size Resolution', () => {
    it('returns text-xs for small size', () => {
      assert.equal(resolveTranscriptFontSize('s'), 'text-xs');
    });

    it('returns text-sm for medium default size', () => {
      assert.equal(resolveTranscriptFontSize('m'), 'text-sm');
    });

    it('returns text-base for large size', () => {
      assert.equal(resolveTranscriptFontSize('l'), 'text-base');
    });

    it('returns text-lg for extra-large size', () => {
      assert.equal(resolveTranscriptFontSize('xl'), 'text-lg');
    });

    it('falls back safely to text-sm on unknown or invalid size strings', () => {
      assert.equal(resolveTranscriptFontSize('invalid'), 'text-sm');
      assert.equal(resolveTranscriptFontSize(''), 'text-sm');
    });
  });

  describe('Themis Orb State Machine Transitions', () => {
    it('prioritizes thinking state when request is submitting', () => {
      const state = computeThemisOrbState({
        isSubmitting: true,
        isListening: true,
        isSpeaking: true,
        hasPendingAction: true,
      });
      assert.equal(state, 'thinking');
    });

    it('transitions to listening state during microphone input', () => {
      const state = computeThemisOrbState({
        isSubmitting: false,
        isListening: true,
        isSpeaking: false,
        hasPendingAction: false,
      });
      assert.equal(state, 'listening');
    });

    it('transitions to speaking state during TTS output', () => {
      const state = computeThemisOrbState({
        isSubmitting: false,
        isListening: false,
        isSpeaking: true,
        hasPendingAction: false,
      });
      assert.equal(state, 'speaking');
    });

    it('transitions to action-pending state when privileged action awaits confirmation', () => {
      const state = computeThemisOrbState({
        isSubmitting: false,
        isListening: false,
        isSpeaking: false,
        hasPendingAction: true,
      });
      assert.equal(state, 'action-pending');
    });

    it('defaults to idle state when no active audio or processing operation', () => {
      const state = computeThemisOrbState({
        isSubmitting: false,
        isListening: false,
        isSpeaking: false,
        hasPendingAction: false,
      });
      assert.equal(state, 'idle');
    });
  });

  describe('Transcript Segment & Interim Deduplication', () => {
    it('maintains interim speech in buffer without mutating conversation history', () => {
      const initialHistory: TranscriptItem[] = [
        { id: '1', sender: 'assistant', text: 'Hello', isFinal: true, timestamp: '10:00 AM' },
      ];

      const result = handleIncomingTranscriptSegment(initialHistory, 'compliance obligations for', false);
      assert.equal(result.updatedList.length, 1);
      assert.equal(result.activeInterim, 'compliance obligations for');
    });

    it('appends finalized segment and clears interim buffer seamlessly', () => {
      const initialHistory: TranscriptItem[] = [
        { id: '1', sender: 'assistant', text: 'Hello', isFinal: true, timestamp: '10:00 AM' },
      ];

      const result = handleIncomingTranscriptSegment(
        initialHistory,
        'compliance obligations for GDPR Article 30',
        true
      );
      assert.equal(result.updatedList.length, 2);
      assert.equal(result.updatedList[1].text, 'compliance obligations for GDPR Article 30');
      assert.equal(result.updatedList[1].sender, 'user');
      assert.equal(result.activeInterim, '');
    });

    it('ignores empty or whitespace-only recognition segments', () => {
      const initialHistory: TranscriptItem[] = [];
      const result = handleIncomingTranscriptSegment(initialHistory, '   ', true);
      assert.equal(result.updatedList.length, 0);
      assert.equal(result.activeInterim, '');
    });
  });
});
