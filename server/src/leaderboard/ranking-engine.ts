import crypto from 'node:crypto';

export type TypingTier = 'Grandmaster' | 'Master' | 'Diamond' | 'Platinum' | 'Gold' | 'Silver' | 'Bronze';

export interface LeaderboardEntry {
  id: string;
  userId: string;
  username: string;
  mode: string; // e.g. "time-30", "words-25", "code-typescript"
  wpm: number;
  rawWpm: number;
  accuracy: number;
  consistency?: number;
  isVerified: boolean;
  certificateId?: string;
  timestamp: number;
}

export interface UserRankResult {
  rank: number;
  totalEntries: number;
  percentile: number; // e.g. 98.5 means top 1.5%
  tier: TypingTier;
  entry: LeaderboardEntry;
}

export class RankingEngine {
  // Map of mode -> sorted array of LeaderboardEntry (descending by wpm, then accuracy)
  private boards: Map<string, LeaderboardEntry[]> = new Map();

  constructor() {
    this.seedInitialBenchmarkData();
  }

  /**
   * Calculates the competitive tier based on percentile.
   */
  public static getTier(percentile: number): TypingTier {
    if (percentile >= 99.9) return 'Grandmaster';
    if (percentile >= 99.0) return 'Master';
    if (percentile >= 95.0) return 'Diamond';
    if (percentile >= 85.0) return 'Platinum';
    if (percentile >= 65.0) return 'Gold';
    if (percentile >= 35.0) return 'Silver';
    return 'Bronze';
  }

  /**
   * Binary search insertion to keep entries sorted in O(log N) time.
   */
  public submitScore(data: Omit<LeaderboardEntry, 'id' | 'timestamp'> & { timestamp?: number }): UserRankResult {
    const mode = data.mode;
    if (!this.boards.has(mode)) {
      this.boards.set(mode, []);
    }

    const board = this.boards.get(mode)!;
    const entry: LeaderboardEntry = {
      ...data,
      id: `lead_${crypto.randomUUID().slice(0, 8)}`,
      timestamp: data.timestamp || Date.now(),
    };

    // Find insertion index (descending by wpm, then accuracy)
    let low = 0;
    let high = board.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      const compare = this.compareEntries(entry, board[mid]);
      if (compare < 0) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    board.splice(low, 0, entry);

    const rank = low + 1;
    const totalEntries = board.length;
    // Percentile: (total - rank + 1) / total * 100
    const percentile = Math.round(((totalEntries - rank + 1) / totalEntries) * 1000) / 10;
    const tier = RankingEngine.getTier(percentile);

    return {
      rank,
      totalEntries,
      percentile,
      tier,
      entry,
    };
  }

  private compareEntries(a: LeaderboardEntry, b: LeaderboardEntry): number {
    if (b.wpm !== a.wpm) {
      return a.wpm - b.wpm; // Higher WPM wins
    }
    return a.accuracy - b.accuracy; // Tiebreak: higher accuracy
  }

  /**
   * Retrieves paginated top rankings for a mode.
   */
  public getTop(mode: string, limit: number = 50, offset: number = 0): { entries: LeaderboardEntry[]; total: number; mode: string } {
    const board = this.boards.get(mode) || [];
    const sliced = board.slice(offset, offset + limit);
    return {
      entries: sliced,
      total: board.length,
      mode,
    };
  }

  /**
   * Finds a specific user's best rank in a given mode.
   */
  public getUserRank(mode: string, userId: string): UserRankResult | null {
    const board = this.boards.get(mode);
    if (!board || board.length === 0) return null;

    const index = board.findIndex((e) => e.userId === userId);
    if (index === -1) return null;

    const entry = board[index];
    const rank = index + 1;
    const totalEntries = board.length;
    const percentile = Math.round(((totalEntries - rank + 1) / totalEntries) * 1000) / 10;
    const tier = RankingEngine.getTier(percentile);

    return { rank, totalEntries, percentile, tier, entry };
  }

  /**
   * Computes WPM distribution histogram (e.g. 0-20, 20-40, ..., 200+)
   */
  public getDistribution(mode: string): Array<{ range: string; count: number; minWpm: number; maxWpm: number }> {
    const board = this.boards.get(mode) || [];
    const BUCKET_SIZE = 10;
    const MAX_BUCKET = 20; // Up to 200 WPM
    const counts = new Array(MAX_BUCKET).fill(0);

    for (const entry of board) {
      const idx = Math.min(Math.floor(entry.wpm / BUCKET_SIZE), MAX_BUCKET - 1);
      counts[idx]++;
    }

    return counts.map((count, i) => {
      const minWpm = i * BUCKET_SIZE;
      const maxWpm = (i + 1) * BUCKET_SIZE;
      return {
        range: i === MAX_BUCKET - 1 ? `${minWpm}+` : `${minWpm}-${maxWpm}`,
        minWpm,
        maxWpm,
        count,
      };
    });
  }

  /**
   * Seeds realistic benchmark scores across modes for instant competitive leaderboards.
   */
  private seedInitialBenchmarkData(): void {
    const modes = ['time-30', 'time-60', 'words-25', 'code-typescript'];
    const benchmarks = [
      { username: 'apex_typist', wpm: 182, rawWpm: 191, accuracy: 99.1, tier: 'Grandmaster' },
      { username: 'syntaxtic', wpm: 154, rawWpm: 160, accuracy: 98.4, tier: 'Master' },
      { username: 'mechanic_keys', wpm: 138, rawWpm: 144, accuracy: 97.8, tier: 'Diamond' },
      { username: 'velociraptor', wpm: 122, rawWpm: 129, accuracy: 96.5, tier: 'Platinum' },
      { username: 'flow_state', wpm: 104, rawWpm: 110, accuracy: 98.0, tier: 'Platinum' },
      { username: 'qwerty_knight', wpm: 89, rawWpm: 94, accuracy: 95.2, tier: 'Gold' },
      { username: 'colemak_pro', wpm: 76, rawWpm: 82, accuracy: 94.0, tier: 'Silver' },
      { username: 'touch_learner', wpm: 58, rawWpm: 63, accuracy: 92.1, tier: 'Bronze' },
    ];

    for (const mode of modes) {
      for (const b of benchmarks) {
        this.submitScore({
          userId: `usr_${b.username}`,
          username: b.username,
          mode,
          wpm: b.wpm,
          rawWpm: b.rawWpm,
          accuracy: b.accuracy,
          isVerified: true,
          consistency: 85,
        });
      }
    }
  }
}

export const rankingEngine = new RankingEngine();
