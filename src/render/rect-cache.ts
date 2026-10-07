export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WordLayout {
  rect: Rect;
  charRects: Rect[];
}

export class RectCache {
  private words: WordLayout[] = [];

  public measure(container: HTMLElement, wordElements: HTMLElement[]): void {
    const cRect = container.getBoundingClientRect();

    this.words = new Array(wordElements.length);

    for (let w = 0; w < wordElements.length; w++) {
      const wEl = wordElements[w];
      const wBox = wEl.getBoundingClientRect();

      const wordRect: Rect = {
        x: wBox.left - cRect.left,
        y: wBox.top - cRect.top,
        width: wBox.width,
        height: wBox.height,
      };

      const charNodes = wEl.querySelectorAll<HTMLElement>('.glyph');
      const charRects: Rect[] = new Array(charNodes.length);

      for (let c = 0; c < charNodes.length; c++) {
        const cEl = charNodes[c];
        const cBox = cEl.getBoundingClientRect();
        charRects[c] = {
          x: cBox.left - cRect.left,
          y: cBox.top - cRect.top,
          width: cBox.width,
          height: cBox.height,
        };
      }

      this.words[w] = {
        rect: wordRect,
        charRects,
      };
    }
  }

  /**
   * Get cached caret position for given word and char index.
   * Zero DOM access on keystroke hot path!
   */
  public getCaretPosition(
    wordIndex: number,
    charIndex: number
  ): { x: number; y: number; height: number } | null {
    if (wordIndex >= this.words.length) {
      // Past last word, place at end of last word
      const lastWord = this.words[this.words.length - 1];
      if (!lastWord) return null;
      return {
        x: lastWord.rect.x + lastWord.rect.width,
        y: lastWord.rect.y,
        height: lastWord.rect.height || 28,
      };
    }

    const word = this.words[wordIndex];
    if (!word) return null;

    if (charIndex === 0) {
      // Start of word
      const firstChar = word.charRects[0];
      return {
        x: firstChar ? firstChar.x : word.rect.x,
        y: firstChar ? firstChar.y : word.rect.y,
        height: firstChar?.height || word.rect.height || 28,
      };
    }

    if (charIndex <= word.charRects.length) {
      // Before or between characters
      const prevChar = word.charRects[charIndex - 1];
      if (prevChar) {
        return {
          x: prevChar.x + prevChar.width,
          y: prevChar.y,
          height: prevChar.height,
        };
      }
    }

    // Extra characters typed beyond word length
    const lastChar = word.charRects[word.charRects.length - 1];
    if (lastChar) {
      const extraOffset = (charIndex - word.charRects.length) * (lastChar.width || 12);
      return {
        x: lastChar.x + lastChar.width + extraOffset,
        y: lastChar.y,
        height: lastChar.height,
      };
    }

    return {
      x: word.rect.x + word.rect.width,
      y: word.rect.y,
      height: word.rect.height || 28,
    };
  }

  public getWordLayout(wordIndex: number): WordLayout | undefined {
    return this.words[wordIndex];
  }
}
