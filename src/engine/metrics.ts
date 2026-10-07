import { EngineState, EngineMetrics } from './types';

/**
 * Pure calculation functions for typing test metrics.
 * 100% original, standard standard touch-typing metrics.
 */

export function calculateMetrics(
  state: EngineState,
  perSecondRawWpm: number[] = []
): EngineMetrics {
  const { startTime, endTime, correctKeystrokes, incorrectKeystrokes, extraKeystrokes } = state;
  const now = performance.now();
  const effectiveEnd = endTime ?? now;
  const elapsedMs = startTime !== null ? Math.max(1, effectiveEnd - startTime) : 1;
  const minutes = elapsedMs / 60000;

  // Count correct characters in completed and active words
  let correctChars = 0;
  for (let w = 0; w < state.charStatuses.length; w++) {
    const statuses = state.charStatuses[w];
    for (let c = 0; c < statuses.length; c++) {
      if (statuses[c] === 'correct') {
        correctChars++;
      }
    }
    // If the word was completed and had a space after it
    if (w < state.currentWordIndex) {
      correctChars++; // Space character count
    }
  }

  const totalTypedKeystrokes = correctKeystrokes + incorrectKeystrokes + extraKeystrokes;

  // Standard net WPM: (correct characters / 5) / minutes
  const wpm = minutes > 0 ? Math.round((correctChars / 5) / minutes) : 0;

  // Raw WPM: (all typed keystrokes / 5) / minutes
  const rawWpm = minutes > 0 ? Math.round((totalTypedKeystrokes / 5) / minutes) : 0;

  // Accuracy: correct keystrokes / total keystrokes
  const accuracy =
    totalTypedKeystrokes > 0
      ? Math.round((correctKeystrokes / totalTypedKeystrokes) * 100)
      : 100;

  // Consistency: 100 - clamp(CoV(per-second WPM) * 100)
  let consistency = 100;
  if (perSecondRawWpm.length > 2) {
    const mean =
      perSecondRawWpm.reduce((acc, v) => acc + v, 0) / perSecondRawWpm.length;
    if (mean > 0) {
      const variance =
        perSecondRawWpm.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) /
        perSecondRawWpm.length;
      const stdDev = Math.sqrt(variance);
      const cov = (stdDev / mean) * 100;
      consistency = Math.max(0, Math.min(100, Math.round(100 - cov)));
    }
  }

  return {
    wpm: Math.max(0, wpm),
    rawWpm: Math.max(0, rawWpm),
    accuracy: Math.max(0, Math.min(100, accuracy)),
    consistency,
    correctChars,
    totalChars: totalTypedKeystrokes,
    elapsedMs,
    streak: state.consecutiveCorrect,
  };
}
