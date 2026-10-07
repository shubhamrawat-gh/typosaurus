export type TestMode = 'time' | 'words' | 'zen' | 'code' | 'weak-spots' | 'pressure' | 'daily';
export type CodeLanguage = 'javascript' | 'typescript' | 'python' | 'html' | 'css' | 'sql';

export type ConfidenceMode = 'off' | 'no-word-backspace' | 'no-backspace';
export type StopOnError = 'off' | 'letter' | 'word';
export type CharStatus = 'untyped' | 'correct' | 'incorrect' | 'extra';

export interface EngineConfig {
  mode: TestMode;
  duration?: number; // seconds (default 30)
  wordCount?: number; // target words for words mode (default 25)
  punctuation?: boolean;
  numbers?: boolean;
  seed?: number | string;
  codeLanguage?: CodeLanguage;
  confidenceMode?: ConfidenceMode;
  stopOnError?: StopOnError;
  blindMode?: boolean;
}

export interface KeystrokeRecord {
  timestamp: number; // ms from test start
  key: string;
  code: string;
  expected: string;
  status: CharStatus;
}

export interface EngineState {
  config: EngineConfig;
  words: string[];
  currentWordIndex: number;
  currentCharIndex: number;
  typedWords: string[];
  charStatuses: CharStatus[][];
  status: 'idle' | 'running' | 'paused' | 'finished';
  startTime: number | null;
  endTime: number | null;
  correctKeystrokes: number;
  incorrectKeystrokes: number;
  extraKeystrokes: number;
  consecutiveCorrect: number; // current flow streak
  maxConsecutiveCorrect: number;
}

export interface EngineMetrics {
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  correctChars: number;
  totalChars: number;
  elapsedMs: number;
  streak: number;
}
