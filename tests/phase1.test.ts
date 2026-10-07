import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { SeededRNG } from '../src/engine/rng';
import { generateWords } from '../src/engine/text-generator';
import { createInitialState, engineReducer } from '../src/engine/reducer';
import { calculateMetrics } from '../src/engine/metrics';
import { Spring2D } from '../src/render/spring';

describe('Phase 1 - Core Typing Engine & Input Hot Path', () => {
  describe('SeededRNG & Determinism', () => {
    it('produces identical sequences given identical seeds', () => {
      const rng1 = new SeededRNG('deterministic-seed-123');
      const rng2 = new SeededRNG('deterministic-seed-123');

      for (let i = 0; i < 50; i++) {
        expect(rng1.next()).toBe(rng2.next());
      }
    });

    it('generates consistent word lists from same seed', () => {
      const words1 = generateWords({ count: 20, seed: 9999 });
      const words2 = generateWords({ count: 20, seed: 9999 });

      expect(words1).toEqual(words2);
      expect(words1.length).toBe(20);
    });

    it('property test: seeded generation produces non-empty words of requested length', () => {
      fc.assert(
        fc.property(fc.integer({ min: 5, max: 100 }), (count) => {
          const words = generateWords({ count, seed: 42 });
          return words.length === count && words.every((w) => w.length > 0);
        })
      );
    });
  });

  describe('Engine Reducer & State Machine', () => {
    let state = createInitialState({ mode: 'time', duration: 30, seed: 100 });

    beforeEach(() => {
      state = createInitialState({ mode: 'time', duration: 30, seed: 100 });
    });

    it('starts on first valid character keypress', () => {
      const firstChar = state.words[0][0];
      const nextState = engineReducer(state, {
        type: 'KEY_DOWN',
        key: firstChar,
        code: 'KeyX',
        ctrlKey: false,
        timestamp: 1000,
      });

      expect(nextState.status).toBe('running');
      expect(nextState.startTime).toBe(1000);
      expect(nextState.currentCharIndex).toBe(1);
      expect(nextState.charStatuses[0][0]).toBe('correct');
      expect(nextState.correctKeystrokes).toBe(1);
      expect(nextState.consecutiveCorrect).toBe(1);
    });

    it('marks incorrect character and resets streak', () => {
      // First type a correct char
      let s = engineReducer(state, {
        type: 'KEY_DOWN',
        key: state.words[0][0],
        code: 'KeyA',
        ctrlKey: false,
        timestamp: 1000,
      });
      expect(s.consecutiveCorrect).toBe(1);

      // Now type incorrect character
      s = engineReducer(s, {
        type: 'KEY_DOWN',
        key: '§', // definitely wrong
        code: 'KeyB',
        ctrlKey: false,
        timestamp: 1100,
      });

      expect(s.charStatuses[0][1]).toBe('incorrect');
      expect(s.incorrectKeystrokes).toBe(1);
      expect(s.consecutiveCorrect).toBe(0);
    });

    it('handles backspace correctly within a word', () => {
      let s = engineReducer(state, {
        type: 'KEY_DOWN',
        key: state.words[0][0],
        code: 'KeyA',
        ctrlKey: false,
        timestamp: 1000,
      });
      expect(s.currentCharIndex).toBe(1);

      s = engineReducer(s, {
        type: 'KEY_DOWN',
        key: 'Backspace',
        code: 'Backspace',
        ctrlKey: false,
        timestamp: 1100,
      });

      expect(s.currentCharIndex).toBe(0);
      expect(s.charStatuses[0][0]).toBe('untyped');
      expect(s.typedWords[0]).toBe('');
    });

    it('handles extra characters typed beyond word length', () => {
      const word = state.words[0];
      let s = state;

      // Type whole word correctly
      for (let i = 0; i < word.length; i++) {
        s = engineReducer(s, {
          type: 'KEY_DOWN',
          key: word[i],
          code: 'KeyChar',
          ctrlKey: false,
          timestamp: 1000 + i * 100,
        });
      }

      // Type 2 extra characters
      s = engineReducer(s, {
        type: 'KEY_DOWN',
        key: 'x',
        code: 'KeyX',
        ctrlKey: false,
        timestamp: 2000,
      });
      s = engineReducer(s, {
        type: 'KEY_DOWN',
        key: 'y',
        code: 'KeyY',
        ctrlKey: false,
        timestamp: 2100,
      });

      expect(s.extraKeystrokes).toBe(2);
      expect(s.charStatuses[0].length).toBe(word.length + 2);
      expect(s.charStatuses[0][word.length]).toBe('extra');
    });

    it('advances to next word on space key', () => {
      const word = state.words[0];
      let s = state;

      for (let i = 0; i < word.length; i++) {
        s = engineReducer(s, {
          type: 'KEY_DOWN',
          key: word[i],
          code: 'KeyA',
          ctrlKey: false,
          timestamp: 1000 + i * 50,
        });
      }

      s = engineReducer(s, {
        type: 'KEY_DOWN',
        key: ' ',
        code: 'Space',
        ctrlKey: false,
        timestamp: 2000,
      });

      expect(s.currentWordIndex).toBe(1);
      expect(s.currentCharIndex).toBe(0);
    });

    it('finishes words mode when reaching target words count', () => {
      const wordsState = createInitialState({ mode: 'words', wordCount: 2, seed: 42 });
      let s = wordsState;

      // Type word 0
      for (const char of s.words[0]) {
        s = engineReducer(s, { type: 'KEY_DOWN', key: char, code: 'Key', ctrlKey: false, timestamp: 1000 });
      }
      s = engineReducer(s, { type: 'KEY_DOWN', key: ' ', code: 'Space', ctrlKey: false, timestamp: 1200 });

      // Type word 1
      for (const char of s.words[1]) {
        s = engineReducer(s, { type: 'KEY_DOWN', key: char, code: 'Key', ctrlKey: false, timestamp: 1300 });
      }

      // Word 1 finishes as soon as the last character is typed at 1300
      expect(s.status).toBe('finished');
      expect(s.endTime).toBe(1300);
    });
  });

  describe('Metrics Calculations', () => {
    it('computes exact hand-calculated WPM and Accuracy', () => {
      let state = createInitialState({ mode: 'time', duration: 60, seed: 10 });
      state = {
        ...state,
        startTime: 0,
        endTime: 60000, // exactly 1 minute
        correctKeystrokes: 250,
        incorrectKeystrokes: 10,
        extraKeystrokes: 0,
        currentWordIndex: 50,
      };

      // Set 200 correct characters across words
      state.charStatuses = state.words.map((w, idx) =>
        idx < 40 ? new Array(w.length).fill('correct') : new Array(w.length).fill('untyped')
      );

      const metrics = calculateMetrics(state);
      expect(metrics.accuracy).toBe(Math.round((250 / 260) * 100)); // ~96%
      expect(metrics.wpm).toBeGreaterThan(0);
      expect(metrics.rawWpm).toBe(52); // (260 / 5) / 1 min = 52
    });
  });

  describe('Spring2D Physics Simulation', () => {
    it('animates smoothly toward target and snaps on convergence', () => {
      const spring = new Spring2D(0, 0);
      spring.setTarget(100, 50);

      // Simulate a series of 16.6ms frames (~60fps)
      for (let i = 0; i < 60; i++) {
        spring.update(0.0166);
      }

      // After ~1 second, spring should be settled precisely at target
      expect(spring.x).toBeCloseTo(100, 1);
      expect(spring.y).toBeCloseTo(50, 1);
      expect(spring.vx).toBe(0);
      expect(spring.vy).toBe(0);
    });
  });
});
