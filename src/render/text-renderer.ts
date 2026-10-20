import { EngineState, CharStatus } from '@/engine/types';
import { RectCache } from './rect-cache';
import { Spring2D } from './spring';
import { scheduler } from '@/scheduler';

export class TextRenderer {
  private container: HTMLElement;
  private wordsContainer: HTMLElement;
  private caretElement: HTMLElement;
  private rectCache: RectCache = new RectCache();
  private caretSpring: Spring2D = new Spring2D(0, 0);
  private scrollSpring: Spring2D = new Spring2D(0, 0);
  private resizeObserver: ResizeObserver | null = null;
  private schedulerUnsub: (() => void) | null = null;

  // Cached DOM references
  private wordElements: HTMLElement[] = [];
  private charElements: HTMLElement[][] = [];
  private extraElements: HTMLElement[][] = [];
  private currentWordIndex: number = 0;
  private currentCharIndex: number = 0;
  private lastRenderedStatuses: CharStatus[][] = [];

  // Style memoization to prevent layout/style recalculation thrashing
  private lastCaretHeight: number = -1;
  private lastScrollY: number = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.container.classList.add('typing-text-arena');
    this.container.style.contain = 'layout paint style';
    this.container.style.position = 'relative';
    this.container.style.overflow = 'hidden';

    // Internal words wrapper that can translate for line scrolling
    this.wordsContainer = document.createElement('div');
    this.wordsContainer.className = 'words-wrapper will-change-transform';
    this.wordsContainer.style.transform = 'translate3d(0, 0, 0)';
    this.wordsContainer.style.display = 'flex';
    this.wordsContainer.style.flexWrap = 'wrap';
    this.wordsContainer.style.gap = '0.45em 0.7em';
    this.wordsContainer.style.userSelect = 'none';
    this.wordsContainer.style.willChange = 'transform';
    this.wordsContainer.style.backfaceVisibility = 'hidden';
    this.container.appendChild(this.wordsContainer);

    // Spring Caret element with dedicated hardware acceleration layer
    this.caretElement = document.createElement('div');
    this.caretElement.className = 'spring-caret will-change-transform';
    this.caretElement.style.position = 'absolute';
    this.caretElement.style.top = '0';
    this.caretElement.style.left = '0';
    this.caretElement.style.width = '2.5px';
    this.caretElement.style.height = '1.4em';
    this.caretElement.style.backgroundColor = 'var(--color-caret)';
    this.caretElement.style.borderRadius = '1px';
    this.caretElement.style.pointerEvents = 'none';
    this.caretElement.style.zIndex = '10';
    this.caretElement.style.transition = 'opacity 0.2s ease';
    this.caretElement.style.willChange = 'transform';
    this.caretElement.style.backfaceVisibility = 'hidden';
    this.caretElement.style.perspective = '1000px';
    this.wordsContainer.appendChild(this.caretElement);

    this.setupResizeObserver();
    this.attachScheduler();
  }

  /**
   * Builds the DOM representation of the words.
   * Only called on reset / new test initialization.
   */
  public mountWords(words: string[]): void {
    this.wordsContainer.innerHTML = '';
    this.wordsContainer.appendChild(this.caretElement);

    const len = words.length;
    this.wordElements = new Array(len);
    this.charElements = new Array(len);
    this.extraElements = new Array(len);
    this.lastRenderedStatuses = new Array(len);

    for (let w = 0; w < len; w++) {
      const word = words[w];
      const wordDiv = document.createElement('div');
      wordDiv.className = 'word';
      wordDiv.setAttribute('data-word-idx', String(w));
      wordDiv.setAttribute('data-line', String(w + 1));
      wordDiv.style.display = 'inline-flex';
      wordDiv.style.position = 'relative';

      const chars: HTMLElement[] = new Array(word.length);
      for (let c = 0; c < word.length; c++) {
        const charSpan = document.createElement('span');
        charSpan.className = 'glyph glyph-untyped';
        charSpan.textContent = word[c];
        wordDiv.appendChild(charSpan);
        chars[c] = charSpan;
      }

      this.wordsContainer.appendChild(wordDiv);
      this.wordElements[w] = wordDiv;
      this.charElements[w] = chars;
      this.extraElements[w] = [];
      this.lastRenderedStatuses[w] = new Array(word.length).fill('untyped');
    }

    // Remeasure layout
    this.remeasureLayout();

    // Snap caret to origin
    this.currentWordIndex = 0;
    this.currentCharIndex = 0;
    const initialPos = this.rectCache.getCaretPosition(0, 0);
    if (initialPos) {
      this.caretSpring.snapTo(initialPos.x, initialPos.y);
      this.lastCaretHeight = initialPos.height;
      this.caretElement.style.height = `${initialPos.height}px`;
    }
  }

  public remeasureLayout(): void {
    if (this.wordElements.length === 0) return;
    this.rectCache.measure(this.wordsContainer, this.wordElements);
    this.updateCaretTarget(this.currentWordIndex, this.currentCharIndex);
  }

  /**
   * Synchronous, sub-millisecond hot-path update.
   * Zero DOM queries, only updates dirty glyph classNames and sets caret spring target.
   */
  public update(state: EngineState): void {
    const { currentWordIndex, currentCharIndex, charStatuses, typedWords } = state;
    this.currentWordIndex = currentWordIndex;
    this.currentCharIndex = currentCharIndex;

    // 1. Update current word's glyphs
    const wordStatuses = charStatuses[currentWordIndex];
    const wordGlyphs = this.charElements[currentWordIndex];
    const wordDiv = this.wordElements[currentWordIndex];

    if (wordStatuses && wordGlyphs && wordDiv) {
      const targetLen = wordGlyphs.length;

      // Update regular characters
      for (let c = 0; c < targetLen; c++) {
        const st = wordStatuses[c] || 'untyped';
        const glyphEl = wordGlyphs[c];
        if (glyphEl && this.lastRenderedStatuses[currentWordIndex]?.[c] !== st) {
          glyphEl.className = `glyph glyph-${st}`;
          if (!this.lastRenderedStatuses[currentWordIndex]) {
            this.lastRenderedStatuses[currentWordIndex] = [];
          }
          this.lastRenderedStatuses[currentWordIndex][c] = st;
        }
      }

      // Handle extra characters typed (zero DOM queries: uses cached extraElements)
      const extraCharsCount = wordStatuses.length - targetLen;
      const extras = this.extraElements[currentWordIndex] || (this.extraElements[currentWordIndex] = []);

      if (extraCharsCount > extras.length) {
        // Add new extra character
        const typedStr = typedWords[currentWordIndex] || '';
        for (let i = extras.length; i < extraCharsCount; i++) {
          const char = typedStr[targetLen + i] || '';
          const extraSpan = document.createElement('span');
          extraSpan.className = 'glyph glyph-extra';
          extraSpan.textContent = char;
          wordDiv.appendChild(extraSpan);
          extras.push(extraSpan);
        }
      } else if (extraCharsCount < extras.length) {
        // Remove trailing extra characters on backspace
        for (let i = extras.length - 1; i >= extraCharsCount; i--) {
          const el = extras.pop();
          el?.remove();
        }
      }
    }

    // Mark previous completed word as settled
    if (currentWordIndex > 0) {
      const prevWordDiv = this.wordElements[currentWordIndex - 1];
      if (prevWordDiv && !prevWordDiv.classList.contains('word-complete')) {
        prevWordDiv.classList.add('word-complete');
      }
    }

    // 2. Update caret target
    this.updateCaretTarget(currentWordIndex, currentCharIndex);
  }

  private updateCaretTarget(wordIndex: number, charIndex: number): void {
    const pos = this.rectCache.getCaretPosition(wordIndex, charIndex);
    if (!pos) return;

    this.caretSpring.setTarget(pos.x, pos.y);

    // Avoid redundant style recalculations: only update caret height if changed
    if (Math.abs(pos.height - this.lastCaretHeight) > 0.5) {
      this.lastCaretHeight = pos.height;
      this.caretElement.style.height = `${pos.height}px`;
    }

    // 3. Line scroll handling
    // If caret moves beyond line 2 (e.g. y > 60px), smoothly scroll the container up
    const lineHeight = pos.height || 36;
    if (pos.y > lineHeight * 1.5) {
      const targetScrollY = -(pos.y - lineHeight);
      this.scrollSpring.setTarget(0, targetScrollY);
    } else {
      this.scrollSpring.setTarget(0, 0);
    }
  }

  private attachScheduler(): void {
    this.schedulerUnsub = scheduler.subscribe(
      'text-renderer',
      (dtSeconds) => {
        // Step caret spring physics (closed-form analytical evaluation)
        const caretActive = this.caretSpring.update(dtSeconds);
        if (caretActive || this.caretSpring.vx !== 0 || this.caretSpring.vy !== 0) {
          this.caretElement.style.transform = `translate3d(${this.caretSpring.x.toFixed(2)}px, ${this.caretSpring.y.toFixed(2)}px, 0)`;
        }

        // Step scroll spring physics
        const scrollActive = this.scrollSpring.update(dtSeconds);
        if (scrollActive || this.scrollSpring.vy !== 0) {
          if (Math.abs(this.scrollSpring.y - this.lastScrollY) > 0.05) {
            this.lastScrollY = this.scrollSpring.y;
            this.wordsContainer.style.transform = `translate3d(0, ${this.scrollSpring.y.toFixed(2)}px, 0)`;
          }
        }
      },
      5 // High priority rendering
    );
  }

  private setupResizeObserver(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        this.remeasureLayout();
      });
      this.resizeObserver.observe(this.container);
    }
  }

  public destroy(): void {
    if (this.schedulerUnsub) {
      this.schedulerUnsub();
      this.schedulerUnsub = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    this.container.innerHTML = '';
  }
}
