import { describe, expect, it } from 'vitest';
import { createInitialState, engineReducer } from '../src/engine/reducer';
import { CODE_LANGUAGES, CODE_TEST_COUNT, CODE_TESTS_PER_LANGUAGE, generateCodeLines } from '../src/data/code-snippets';

describe('code mode', () => {
  it('offers more than 1,000 distinct, repeatable exercises across six languages', () => {
    const exercises = new Set<string>();
    for (const language of CODE_LANGUAGES) {
      for (let seed = 0; seed < CODE_TESTS_PER_LANGUAGE; seed++) {
        const lines = generateCodeLines(seed, language.id);
        expect(generateCodeLines(seed, language.id)).toEqual(lines);
        expect(lines.length).toBeGreaterThanOrEqual(2);
        expect(lines.every((line) => line.length > 0 && line.length <= 55)).toBe(true);
        exercises.add(lines.join('\n'));
      }
    }
    expect(CODE_TEST_COUNT).toBeGreaterThan(1000);
    expect(exercises.size).toBe(CODE_TEST_COUNT);
  });

  it('uses the selected language in the typing engine', () => {
    const state = createInitialState({ mode: 'code', codeLanguage: 'python', seed: 0 });
    expect(state.words).toEqual(generateCodeLines(0, 'python'));
    expect(state.words[0]).toContain('def');
  });

  it('can type a complete exercise in every language', () => {
    for (const language of CODE_LANGUAGES) {
      let state = createInitialState({ mode: 'code', codeLanguage: language.id, seed: 5 });
      const lines = [...state.words];
      let timestamp = 1;
      for (const [lineIndex, line] of lines.entries()) {
        for (const key of line) {
          state = engineReducer(state, { type: 'KEY_DOWN', key, code: 'KeyA', ctrlKey: false, timestamp: timestamp++ });
        }
        if (lineIndex < lines.length - 1) {
          state = engineReducer(state, { type: 'KEY_DOWN', key: 'Enter', code: 'Enter', ctrlKey: false, timestamp: timestamp++ });
        }
      }
      expect(state.status).toBe('finished');
      expect(state.incorrectKeystrokes).toBe(0);
    }
  });

  it('generates seeded snippets with indentation and symbols', () => {
    expect(generateCodeLines('practice')).toEqual(generateCodeLines('practice'));
    expect(generateCodeLines('practice').join('\n')).toMatch(/[{}()[\];=]/);
    expect(generateCodeLines('practice').some((line) => line.startsWith('  '))).toBe(true);
  });

  it('types spaces within a line and advances only on Enter', () => {
    let state = createInitialState({ mode: 'code', seed: 1 });
    const firstLine = state.words[0];
    for (const [index, key] of [...firstLine].entries()) {
      state = engineReducer(state, { type: 'KEY_DOWN', key, code: key === ' ' ? 'Space' : 'KeyA', ctrlKey: false, timestamp: index + 1 });
    }
    expect(state.currentWordIndex).toBe(0);
    expect(state.typedWords[0]).toBe(firstLine);

    state = engineReducer(state, { type: 'KEY_DOWN', key: 'Enter', code: 'Enter', ctrlKey: false, timestamp: 100 });
    expect(state.currentWordIndex).toBe(1);

    const indent = state.words[1].match(/^ +/)?.[0];
    if (indent) {
      for (const [index, key] of [...indent].entries()) {
        state = engineReducer(state, { type: 'KEY_DOWN', key, code: 'Space', ctrlKey: false, timestamp: 101 + index });
      }
      expect(state.typedWords[1]).toBe(indent);
      expect(state.charStatuses[1].slice(0, indent.length)).toEqual(Array(indent.length).fill('correct'));
    }
  });

  it('finishes after the final code character', () => {
    let state = createInitialState({ mode: 'code', seed: 2 });
    const lines = [...state.words];
    let timestamp = 1;
    for (const [lineIndex, line] of lines.entries()) {
      for (const key of line) {
        state = engineReducer(state, { type: 'KEY_DOWN', key, code: key === ' ' ? 'Space' : 'KeyA', ctrlKey: false, timestamp: timestamp++ });
      }
      if (lineIndex < lines.length - 1) {
        state = engineReducer(state, { type: 'KEY_DOWN', key: 'Enter', code: 'Enter', ctrlKey: false, timestamp: timestamp++ });
      }
    }
    expect(state.status).toBe('finished');
    expect(state.correctKeystrokes).toBe(lines.join('').length);
  });
});
