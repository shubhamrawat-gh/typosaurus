import { EngineState, EngineConfig, CharStatus } from './types';
import { generateWords } from './text-generator';
import { generateCodeLines } from '@/data/code-snippets';

export type EngineAction =
  | { type: 'START'; timestamp: number }
  | { type: 'KEY_DOWN'; key: string; code: string; ctrlKey: boolean; timestamp: number }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'FINISH'; timestamp: number }
  | { type: 'RESET'; config?: Partial<EngineConfig> };

export function createInitialState(config: EngineConfig): EngineState {
  const wordCount = config.mode === 'words' ? (config.wordCount ?? 25) : 80;
  const words = config.mode === 'code' ? generateCodeLines(config.seed, config.codeLanguage) : generateWords({
    count: wordCount,
    punctuation: config.punctuation,
    numbers: config.numbers,
    seed: config.seed,
  });

  const charStatuses: CharStatus[][] = words.map((w) =>
    new Array(w.length).fill('untyped')
  );

  return {
    config,
    words,
    currentWordIndex: 0,
    currentCharIndex: 0,
    typedWords: words.map(() => ''),
    charStatuses,
    status: 'idle',
    startTime: null,
    endTime: null,
    correctKeystrokes: 0,
    incorrectKeystrokes: 0,
    extraKeystrokes: 0,
    consecutiveCorrect: 0,
    maxConsecutiveCorrect: 0,
  };
}

export function engineReducer(state: EngineState, action: EngineAction): EngineState {
  switch (action.type) {
    case 'START': {
      if (state.status !== 'idle') return state;
      return {
        ...state,
        status: 'running',
        startTime: action.timestamp,
      };
    }

    case 'PAUSE': {
      if (state.status !== 'running') return state;
      return {
        ...state,
        status: 'paused',
      };
    }

    case 'RESUME': {
      if (state.status !== 'paused') return state;
      return {
        ...state,
        status: 'running',
      };
    }

    case 'FINISH': {
      if (state.status === 'finished') return state;
      return {
        ...state,
        status: 'finished',
        endTime: action.timestamp,
      };
    }

    case 'RESET': {
      const mergedConfig = { ...state.config, ...(action.config || {}) };
      return createInitialState(mergedConfig);
    }

    case 'KEY_DOWN': {
      if (state.status === 'finished') return state;

      // Start on first valid typing keypress
      let s = state;
      if (s.status === 'idle') {
        s = {
          ...s,
          status: 'running',
          startTime: action.timestamp,
        };
      } else if (s.status === 'paused') {
        s = {
          ...s,
          status: 'running',
        };
      }

      const { key, ctrlKey } = action;
      const { currentWordIndex, currentCharIndex, words, typedWords, charStatuses } = s;
      const targetWord = words[currentWordIndex] || '';
      const currentTyped = typedWords[currentWordIndex] || '';
      const wordStatuses = [...charStatuses[currentWordIndex]];

      // 1. Backspace handling
      if (key === 'Backspace') {
        // Confidence mode check
        if (s.config.confidenceMode === 'no-backspace') {
          return s; // Backspace disabled
        }

        // Ctrl+Backspace: delete entire word
        if (ctrlKey) {
          if (s.config.confidenceMode === 'no-word-backspace') {
            return s;
          }
          if (currentTyped.length > 0) {
            const updatedTyped = [...typedWords];
            updatedTyped[currentWordIndex] = '';
            const updatedStatuses = [...charStatuses];
            updatedStatuses[currentWordIndex] = new Array(targetWord.length).fill('untyped');

            return {
              ...s,
              currentCharIndex: 0,
              typedWords: updatedTyped,
              charStatuses: updatedStatuses,
            };
          } else if (currentWordIndex > 0) {
            // Move back to previous word
            const prevWordIdx = currentWordIndex - 1;
            const updatedTyped = [...typedWords];
            updatedTyped[prevWordIdx] = '';
            const updatedStatuses = [...charStatuses];
            updatedStatuses[prevWordIdx] = new Array(words[prevWordIdx].length).fill('untyped');

            return {
              ...s,
              currentWordIndex: prevWordIdx,
              currentCharIndex: 0,
              typedWords: updatedTyped,
              charStatuses: updatedStatuses,
            };
          }
          return s;
        }

        // Single Backspace
        if (currentCharIndex > 0) {
          const newTyped = currentTyped.slice(0, -1);
          const updatedTyped = [...typedWords];
          updatedTyped[currentWordIndex] = newTyped;

          const updatedStatuses = [...charStatuses];
          if (currentCharIndex <= targetWord.length) {
            wordStatuses[currentCharIndex - 1] = 'untyped';
          } else {
            // Was an extra character, remove from end
            wordStatuses.pop();
          }
          updatedStatuses[currentWordIndex] = wordStatuses;

          return {
            ...s,
            currentCharIndex: currentCharIndex - 1,
            typedWords: updatedTyped,
            charStatuses: updatedStatuses,
          };
        } else if (currentWordIndex > 0 && s.config.confidenceMode !== 'no-word-backspace') {
          // Go back to end of previous word
          const prevIdx = currentWordIndex - 1;
          const prevTyped = typedWords[prevIdx];
          return {
            ...s,
            currentWordIndex: prevIdx,
            currentCharIndex: prevTyped.length,
          };
        }
        return s;
      }

      // Code mode preserves spaces inside each line. Enter advances to the next line.
      if (s.config.mode === 'code' && key === 'Enter') {
        if (currentTyped.length === 0) return s;
        const nextLine = currentWordIndex + 1;
        const finished = nextLine >= words.length;
        return {
          ...s,
          currentWordIndex: nextLine,
          currentCharIndex: 0,
          status: finished ? 'finished' : s.status,
          endTime: finished ? action.timestamp : s.endTime,
        };
      }

      // 2. Space key: advances word in prose modes
      if (key === ' ' && s.config.mode !== 'code') {
        if (currentTyped.length === 0) return s; // Ignore leading spaces

        // Stop on error: word policy
        if (s.config.stopOnError === 'word') {
          const hasError = wordStatuses.some((st) => st === 'incorrect' || st === 'extra');
          if (hasError || currentTyped !== targetWord) {
            return s; // Cannot advance until word is completely correct
          }
        }

        // Advance to next word
        const nextWordIndex = currentWordIndex + 1;

        // If reached end of words mode
        if (s.config.mode === 'words' && nextWordIndex >= words.length) {
          return {
            ...s,
            currentWordIndex: nextWordIndex,
            status: 'finished',
            endTime: action.timestamp,
          };
        }

        // In non-words modes, generate more words if near end
        let updatedWords = words;
        let updatedCharStatuses = charStatuses;
        let updatedTypedWords = typedWords;

        if (s.config.mode !== 'words' && nextWordIndex >= words.length - 15) {
          const moreWords = generateWords({
            count: 30,
            punctuation: s.config.punctuation,
            numbers: s.config.numbers,
          });
          updatedWords = [...words, ...moreWords];
          updatedTypedWords = [...typedWords, ...moreWords.map(() => '')];
          updatedCharStatuses = [
            ...charStatuses,
            ...moreWords.map((w) => new Array(w.length).fill('untyped')),
          ];
        }

        return {
          ...s,
          words: updatedWords,
          typedWords: updatedTypedWords,
          charStatuses: updatedCharStatuses,
          currentWordIndex: nextWordIndex,
          currentCharIndex: 0,
        };
      }

      // 3. Regular Printable Character Keypress
      if (key.length === 1) {
        // Stop on error: letter policy
        if (s.config.stopOnError === 'letter') {
          if (currentCharIndex < targetWord.length && key !== targetWord[currentCharIndex]) {
            return {
              ...s,
              incorrectKeystrokes: s.incorrectKeystrokes + 1,
              consecutiveCorrect: 0,
            };
          }
        }

        const newTyped = currentTyped + key;
        const updatedTyped = [...typedWords];
        updatedTyped[currentWordIndex] = newTyped;

        const updatedStatuses = [...charStatuses];
        let isCorrect = false;

        if (currentCharIndex < targetWord.length) {
          const expectedChar = targetWord[currentCharIndex];
          isCorrect = key === expectedChar;
          wordStatuses[currentCharIndex] = isCorrect ? 'correct' : 'incorrect';
        } else {
          // Extra character
          if (wordStatuses.length < targetWord.length + 15) {
            wordStatuses.push('extra');
          }
        }
        updatedStatuses[currentWordIndex] = wordStatuses;

        const correctInc = isCorrect ? 1 : 0;
        const incorrectInc = !isCorrect && currentCharIndex < targetWord.length ? 1 : 0;
        const extraInc = currentCharIndex >= targetWord.length ? 1 : 0;

        const newStreak = isCorrect ? s.consecutiveCorrect + 1 : 0;
        const maxStreak = Math.max(s.maxConsecutiveCorrect, newStreak);

        const isLastWord = currentWordIndex === words.length - 1;
        const isLastChar = currentCharIndex + 1 === targetWord.length;
        const shouldFinish = (s.config.mode === 'words' || s.config.mode === 'code') && isLastWord && isLastChar && isCorrect;

        return {
          ...s,
          currentCharIndex: currentCharIndex + 1,
          typedWords: updatedTyped,
          charStatuses: updatedStatuses,
          correctKeystrokes: s.correctKeystrokes + correctInc,
          incorrectKeystrokes: s.incorrectKeystrokes + incorrectInc,
          extraKeystrokes: s.extraKeystrokes + extraInc,
          consecutiveCorrect: newStreak,
          maxConsecutiveCorrect: maxStreak,
          status: shouldFinish ? 'finished' : s.status,
          endTime: shouldFinish ? action.timestamp : s.endTime,
        };
      }

      return s;
    }

    default:
      return state;
  }
}
