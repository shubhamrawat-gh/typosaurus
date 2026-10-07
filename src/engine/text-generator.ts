import { COMMON_WORDS } from '@/data/words';
import { SeededRNG } from './rng';

export interface TextGenOptions {
  count?: number;
  punctuation?: boolean;
  numbers?: boolean;
  seed?: number | string;
}

const PUNCTUATION_MARKS = ['.', ',', '!', '?', ';', ':'];

export function generateWords(options: TextGenOptions = {}): string[] {
  const count = options.count ?? 50;
  const rng = new SeededRNG(options.seed);
  const words: string[] = [];

  for (let i = 0; i < count; i++) {
    let word: string;

    // Optional numbers insertion (~10% probability)
    if (options.numbers && rng.next() < 0.12) {
      word = String(rng.nextInt(1, 999));
    } else {
      word = rng.pick(COMMON_WORDS);
    }

    // Optional punctuation (~15% probability)
    if (options.punctuation && !options.numbers) {
      if (i === 0 || words[i - 1]?.endsWith('.')) {
        // Capitalize after period
        word = word.charAt(0).toUpperCase() + word.slice(1);
      }
      if (rng.next() < 0.18) {
        const mark = rng.pick(PUNCTUATION_MARKS);
        word += mark;
      }
    }

    words.push(word);
  }

  // Ensure last word has period if punctuation enabled
  if (options.punctuation && words.length > 0) {
    const last = words[words.length - 1];
    if (!last.endsWith('.')) {
      words[words.length - 1] = last.replace(/[^\w\s]$/, '') + '.';
    }
  }

  return words;
}
