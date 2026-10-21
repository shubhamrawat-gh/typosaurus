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
  private fontListenerCleanups: (() => void)[] = [];
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
    this.wordsContainer.style.position = 'relative';
    this.wordsContainer.style.transform = 'translate3d(0, 0, 0)';
    this.wordsContainer.style.display = 'flex';
    this.wordsContainer.style.flexWrap = 'wrap';
    this.wordsContainer.style.gap = '0.45em 0.7em';
    this.wordsContainer.style.userSelect = 'none';
    this.wordsContainer.style.willChange = 'transform';
    this.wordsContainer.style.backfaceVisibility = 'hidden';
    this.container.appendChild(this.wordsContainer);

    // Spring Caret element with dedicated hardware acceleration layer
    // Centered on character boundary with 2px width and -1px margin
    this.caretElement = document.createElement('div');
    this.caretElement.className = 'spring-caret will-change-transform';
    this.caretElement.style.position = 'absolute';
    this.caretElement.style.top = '0';
    this.caretElement.style.left = '0';
    this.caretElement.style.width = '2px';
    this.caretElement.style.marginLeft = '-1px';
    this.caretElement.style.height = '1.2em';
    this.caretElement.style.backgroundColor = 'var(--color-caret)';
    this.caretElement.style.borderRadius = '1.5px';
    this.caretElement.style.pointerEvents = 'none';
    this.caretElement.style.zIndex = '10';
    this.caretElement.style.transition = 'opacity 0.15s ease';
    this.caretElement.style.willChange = 'transform';
    this.caretElement.style.backfaceVisibility = 'hidden';
    this.caretElement.style.perspective = '1000px';
    this.wordsContainer.appendChild(this.caretElement);

    this.setupResizeObserver();
    this.setupFontListener();
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
      this.createWordElement(words[w], w);
    }

    // Remeasure layout
    this.remeasureLayout();

    // Snap caret to origin
    this.currentWordIndex = 0;
    this.currentCharIndex = 0;
    const initialPos = this.rectCache.getCaretPosition(0, 0);
    if (initialPos) {
      const caretHeight = Math.max(18, Math.round(initialPos.height * 0.74));
      const caretY = initialPos.y + Math.round((initialPos.height - caretHeight) / 2);
      this.caretSpring.snapTo(initialPos.x, caretY);
      this.lastCaretHeight = caretHeight;
      this.caretElement.style.height = `${caretHeight}px`;
      this.renderCaret();
    }
  }

  private createWordElement(word: string, w: number): HTMLElement {
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
    return wordDiv;
  }

  public remeasureLayout(): void {
    if (this.wordElements.length === 0) return;
    this.rectCache.measure(this.wordsContainer, this.wordElements);
    const pos = this.rectCache.getCaretPosition(this.currentWordIndex, this.currentCharIndex);
    if (pos) {
      const caretHeight = Math.max(18, Math.round(pos.height * 0.74));
      const caretY = pos.y + Math.round((pos.height - caretHeight) / 2);
      this.caretSpring.snapTo(pos.x, caretY);
      this.lastCaretHeight = caretHeight;
      this.caretElement.style.height = `${caretHeight}px`;
      this.renderCaret();
    }
  }

  /**
   * Synchronous, sub-millisecond hot-path update.
   * Zero DOM queries, only updates dirty glyph classNames and sets caret spring target.
   */
  public update(state: EngineState): void {
    const { currentWordIndex, currentCharIndex, charStatuses, typedWords } = state;

    // Detect if this keystroke is a backspace or word reset
    const isBackspace =
      currentWordIndex < this.currentWordIndex ||
      (currentWordIndex === this.currentWordIndex && currentCharIndex < this.currentCharIndex);

    this.currentWordIndex = currentWordIndex;
    this.currentCharIndex = currentCharIndex;

    // Handle dynamic word expansion (e.g. infinite/time modes)
    if (state.words.length > this.wordElements.length) {
      const startIdx = this.wordElements.length;
      for (let w = startIdx; w < state.words.length; w++) {
        this.createWordElement(state.words[w], w);
      }
      this.rectCache.measure(this.wordsContainer, this.wordElements);
    }

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

    // 2. Update caret target with instantaneous responsiveness
    this.updateCaretTarget(currentWordIndex, currentCharIndex, isBackspace);
  }

  private updateCaretTarget(wordIndex: number, charIndex: number, isBackspace: boolean = false): void {
    const pos = this.rectCache.getCaretPosition(wordIndex, charIndex);
    if (!pos) return;

    // Centered vertical height: 74% of line-box height matches font em cleanly
    const caretHeight = Math.max(18, Math.round(pos.height * 0.74));
    const caretY = pos.y + Math.round((pos.height - caretHeight) / 2);

    // If backspacing or moving lines, snap immediately for crisp responsiveness
    const isLineJump = Math.abs(caretY - this.caretSpring.y) > 10;

    if (isLineJump || isBackspace) {
      this.caretSpring.snapTo(pos.x, caretY);
    } else {
      this.caretSpring.setTarget(pos.x, caretY);
      // Advance by an initial micro-step so the keystroke paint displays immediate live movement
      this.caretSpring.update(0.016);
    }

    // Avoid redundant style recalculations: only update caret height if changed
    if (Math.abs(caretHeight - this.lastCaretHeight) > 0.5) {
      this.lastCaretHeight = caretHeight;
      this.caretElement.style.height = `${caretHeight}px`;
    }

    // Render immediately on the keystroke hot path
    this.renderCaret();

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

  private renderCaret(): void {
    this.caretElement.style.transform = `translate3d(${this.caretSpring.x.toFixed(2)}px, ${this.caretSpring.y.toFixed(2)}px, 0)`;
  }

  private attachScheduler(): void {
    this.schedulerUnsub = scheduler.subscribe(
      'text-renderer',
      (dtSeconds) => {
        // Step caret spring physics (closed-form analytical evaluation)
        const caretActive = this.caretSpring.update(dtSeconds);
        if (caretActive || this.caretSpring.vx !== 0 || this.caretSpring.vy !== 0) {
          this.renderCaret();
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

  private setupFontListener(): void {
    if (typeof document !== 'undefined' && 'fonts' in document) {
      document.fonts.ready.then(() => {
        this.remeasureLayout();
      });

      const onLoadingDone = () => {
        this.remeasureLayout();
      };
      document.fonts.addEventListener?.('loadingdone', onLoadingDone);
      this.fontListenerCleanups.push(() => {
        document.fonts.removeEventListener?.('loadingdone', onLoadingDone);
      });
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
    for (const cleanup of this.fontListenerCleanups) {
      cleanup();
    }
    this.fontListenerCleanups = [];
    this.container.innerHTML = '';
  }
}
