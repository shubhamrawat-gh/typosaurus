import Dexie, { type Table } from 'dexie';

export interface StoredTestResult {
  id: string;
  timestamp: number;
  mode: string;
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency: number;
  durationMs: number;
  errorCount: number;
  config: {
    mode: string;
    duration?: number;
    wordCount?: number;
    punctuation?: boolean;
    numbers?: boolean;
    language?: string;
    theme: string;
  };
  telemetry: Array<{
    timestamp: number;
    key: string;
    expected: string;
    status: 'correct' | 'incorrect' | 'extra';
  }>;
}

export interface StoredKeyWeakness {
  key: string; // primary key
  totalAttempts: number;
  errorCount: number;
  avgLatencyMs: number;
  lastUpdated: number;
}

export interface StoredProgression {
  id: string; // 'current'
  xp: number;
  level: number;
  currentStreak: number;
  maxStreak: number;
  lastActiveDate: string;
  unlockedAchievements: string[];
}

export interface StoredSettings {
  id: string; // 'current'
  theme: string;
  fontSize: number;
  caretStyle: 'line' | 'block' | 'underline';
  soundProfile: 'thocky' | 'clicky' | 'linear' | 'off';
  soundVolume: number; // 0 - 100
  effectsIntensity: number; // 0 - 100
  showLiveWpm: boolean;
  focusMode: boolean;
  confidenceMode: 'off' | 'no-word-backspace' | 'no-backspace';
  stopOnError: 'off' | 'letter' | 'word';
  blindMode: boolean;
}

export class TyposaurusDatabase extends Dexie {
  public tests!: Table<StoredTestResult, string>;
  public weaknesses!: Table<StoredKeyWeakness, string>;
  public progression!: Table<StoredProgression, string>;
  public settings!: Table<StoredSettings, string>;

  public constructor() {
    super('typosaurus_db');

    // Schema version 1
    this.version(1).stores({
      tests: 'id, timestamp, mode, wpm, accuracy',
      weaknesses: 'key, errorCount, avgLatencyMs',
      progression: 'id',
      settings: 'id',
    });
  }
}

export const db = new TyposaurusDatabase();
