import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectOperatingSystem,
  getAssistantShortcuts,
  isEditableElement,
} from '../keyboardShortcuts.ts';

describe('keyboardShortcuts utility', () => {
  describe('detectOperatingSystem', () => {
    it('detects macOS when platform indicates Mac', () => {
      // Mock global navigator
      const originalNav = globalThis.navigator;
      try {
        Object.defineProperty(globalThis, 'navigator', {
          value: {
            userAgentData: { platform: 'macOS' },
            platform: 'MacIntel',
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          },
          configurable: true,
          writable: true,
        });
        assert.equal(detectOperatingSystem(), 'mac');
      } finally {
        Object.defineProperty(globalThis, 'navigator', {
          value: originalNav,
          configurable: true,
          writable: true,
        });
      }
    });

    it('detects Windows when platform indicates Win', () => {
      const originalNav = globalThis.navigator;
      try {
        Object.defineProperty(globalThis, 'navigator', {
          value: {
            userAgentData: undefined,
            platform: 'Win32',
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          },
          configurable: true,
          writable: true,
        });
        assert.equal(detectOperatingSystem(), 'windows');
      } finally {
        Object.defineProperty(globalThis, 'navigator', {
          value: originalNav,
          configurable: true,
          writable: true,
        });
      }
    });

    it('detects Linux when platform indicates Linux', () => {
      const originalNav = globalThis.navigator;
      try {
        Object.defineProperty(globalThis, 'navigator', {
          value: {
            userAgentData: undefined,
            platform: 'Linux x86_64',
            userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
          },
          configurable: true,
          writable: true,
        });
        assert.equal(detectOperatingSystem(), 'linux');
      } finally {
        Object.defineProperty(globalThis, 'navigator', {
          value: originalNav,
          configurable: true,
          writable: true,
        });
      }
    });
  });

  describe('getAssistantShortcuts', () => {
    it('returns Mac-specific shortcut labels and matchers', () => {
      const macConfig = getAssistantShortcuts('mac');
      assert.equal(macConfig.voiceKeyLabel, '⌥A');
      assert.equal(macConfig.textKeyLabel, '⌘K');

      // Test Mac Option+A for voice
      const optionA = {
        altKey: true,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        key: 'a',
      } as unknown as KeyboardEvent;
      assert.equal(macConfig.isVoiceShortcut(optionA), true);

      // Test Mac Cmd+Shift+A alternative for voice
      const cmdShiftA = {
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: true,
        key: 'a',
      } as unknown as KeyboardEvent;
      assert.equal(macConfig.isVoiceShortcut(cmdShiftA), true);

      // Test Mac Cmd+K for Spotlight text
      const cmdK = {
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        key: 'k',
      } as unknown as KeyboardEvent;
      assert.equal(macConfig.isTextShortcut(cmdK), true);

      // Unrelated key should be rejected
      const cmdP = {
        altKey: false,
        metaKey: true,
        ctrlKey: false,
        shiftKey: false,
        key: 'p',
      } as unknown as KeyboardEvent;
      assert.equal(macConfig.isTextShortcut(cmdP), false);
    });

    it('returns Windows-specific shortcut labels and matchers', () => {
      const winConfig = getAssistantShortcuts('windows');
      assert.equal(winConfig.voiceKeyLabel, 'Alt+A');
      assert.equal(winConfig.textKeyLabel, 'Ctrl+K');

      // Test Alt+A for voice
      const altA = {
        altKey: true,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        key: 'a',
      } as unknown as KeyboardEvent;
      assert.equal(winConfig.isVoiceShortcut(altA), true);

      // Test Ctrl+Shift+A alternative for voice
      const ctrlShiftA = {
        altKey: false,
        metaKey: false,
        ctrlKey: true,
        shiftKey: true,
        key: 'a',
      } as unknown as KeyboardEvent;
      assert.equal(winConfig.isVoiceShortcut(ctrlShiftA), true);

      // Test Ctrl+K for text
      const ctrlK = {
        altKey: false,
        metaKey: false,
        ctrlKey: true,
        shiftKey: false,
        key: 'k',
      } as unknown as KeyboardEvent;
      assert.equal(winConfig.isTextShortcut(ctrlK), true);
    });
  });

  describe('isEditableElement', () => {
    it('returns true for mocked inputs and textareas', () => {
      const mockInput = { tagName: 'INPUT', isContentEditable: false };
      assert.equal(isEditableElement(mockInput as any), true);

      const mockTextarea = { tagName: 'TEXTAREA', isContentEditable: false };
      assert.equal(isEditableElement(mockTextarea as any), true);

      const mockSelect = { tagName: 'SELECT', isContentEditable: false };
      assert.equal(isEditableElement(mockSelect as any), true);

      const mockContentEditable = { tagName: 'DIV', isContentEditable: true };
      assert.equal(isEditableElement(mockContentEditable as any), true);
    });

    it('returns false for non-editable elements', () => {
      const mockButton = { tagName: 'BUTTON', isContentEditable: false };
      assert.equal(isEditableElement(mockButton as any), false);

      const mockDiv = { tagName: 'DIV', isContentEditable: false };
      assert.equal(isEditableElement(mockDiv as any), false);

      assert.equal(isEditableElement(null), false);
    });
  });
});
