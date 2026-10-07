import type { EngineConfig } from '@/engine/types';

export const PRACTICE_TEST_COUNT = 1000;

export type PracticeType = 'words' | 'punctuation' | 'numbers' | 'code';

export interface PracticeTest {
  id: number;
  type: PracticeType;
  label: string;
  config: EngineConfig;
}

/** Four groups of 250 repeatable, local practice tests. */
export function getPracticeTest(id: number): PracticeTest {
  if (!Number.isInteger(id) || id < 1 || id > PRACTICE_TEST_COUNT) {
    throw new RangeError(`Practice test must be between 1 and ${PRACTICE_TEST_COUNT}`);
  }

  const type: PracticeType = id <= 250 ? 'words' : id <= 500 ? 'punctuation' : id <= 750 ? 'numbers' : 'code';
  return {
    id,
    type,
    label: type === 'code' ? 'JavaScript' : type === 'punctuation' ? 'Punctuation' : type === 'numbers' ? 'Numbers' : 'Words',
    config: {
      mode: type === 'code' ? 'code' : 'words',
      wordCount: 50,
      punctuation: type === 'punctuation',
      numbers: type === 'numbers',
      seed: id,
    },
  };
}
