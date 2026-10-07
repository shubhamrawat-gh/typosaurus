import { describe, expect, it } from 'vitest';
import { getPracticeTest, PRACTICE_TEST_COUNT } from '../src/data/practice-tests';
import { createInitialState } from '../src/engine/reducer';

describe('1,000 practice tests', () => {
  it('provides 250 repeatable tests for each practice type', () => {
    const counts = { words: 0, punctuation: 0, numbers: 0, code: 0 };
    const texts = new Set<string>();

    for (let id = 1; id <= PRACTICE_TEST_COUNT; id++) {
      const test = getPracticeTest(id);
      const words = createInitialState(test.config).words;
      counts[test.type]++;
      expect(createInitialState(test.config).words).toEqual(words);
      expect(words.length).toBeGreaterThan(0);
      texts.add(words.join('\n'));

      if (test.type === 'punctuation') expect(test.config.punctuation).toBe(true);
      if (test.type === 'numbers') expect(test.config.numbers).toBe(true);
      if (test.type === 'code') {
        expect(test.config.mode).toBe('code');
        expect(words.some((line) => line.startsWith('  '))).toBe(true);
      }
    }

    expect(counts).toEqual({ words: 250, punctuation: 250, numbers: 250, code: 250 });
    expect(texts.size).toBe(PRACTICE_TEST_COUNT);
  });

  it('rejects numbers outside the library', () => {
    expect(() => getPracticeTest(0)).toThrow(RangeError);
    expect(() => getPracticeTest(1001)).toThrow(RangeError);
    expect(() => getPracticeTest(2.5)).toThrow(RangeError);
  });
});
