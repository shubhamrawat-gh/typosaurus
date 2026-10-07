import React from 'react';
import { EngineConfig, TestMode } from '@/engine/types';
import { useThemeStore, THEMES } from './theme';

interface NavHeaderProps {
  config: EngineConfig;
  onConfigChange: (newConfig: EngineConfig) => void;
}

export const NavHeader: React.FC<NavHeaderProps> = ({ config, onConfigChange }) => {
  const { currentTheme, nextTheme } = useThemeStore();
  const themeObj = THEMES.find((t) => t.id === currentTheme) || THEMES[0];

  const setMode = (mode: TestMode) => {
    onConfigChange({ ...config, mode });
  };

  const setDuration = (duration: number) => {
    onConfigChange({ ...config, mode: 'time', duration });
  };

  const setWordCount = (wordCount: number) => {
    onConfigChange({ ...config, mode: 'words', wordCount });
  };

  const togglePunctuation = () => {
    onConfigChange({ ...config, punctuation: !config.punctuation });
  };

  const toggleNumbers = () => {
    onConfigChange({ ...config, numbers: !config.numbers });
  };

  return (
    <header className="w-full max-w-4xl mx-auto flex items-center justify-between py-6 text-xs font-mono select-none">
      {/* Brand Wordmark (Linear / Raycast subtle style) */}
      <div className="flex items-center gap-2">
        <span className="font-bold tracking-tight text-ink text-sm font-display flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-primary" />
          typosaurus
        </span>
      </div>

      {/* Center Segmented Control Pill */}
      <nav
        aria-label="Test mode navigation"
        className="flex items-center gap-1 bg-surface/80 border border-hairline/80 px-2.5 py-1 rounded-full backdrop-blur-md shadow-sm text-text-muted"
      >
        {/* Mode Selector */}
        <div className="flex items-center gap-1 border-r border-hairline pr-2 mr-1">
          <button
            onClick={() => setMode('time')}
            className={`px-2 py-0.5 rounded-full transition-colors ${
              config.mode === 'time' ? 'text-primary font-semibold bg-surface-soft' : 'hover:text-ink'
            }`}
          >
            time
          </button>
          <button
            onClick={() => setMode('words')}
            className={`px-2 py-0.5 rounded-full transition-colors ${
              config.mode === 'words' ? 'text-primary font-semibold bg-surface-soft' : 'hover:text-ink'
            }`}
          >
            words
          </button>
          <button
            onClick={() => setMode('zen')}
            className={`px-2 py-0.5 rounded-full transition-colors ${
              config.mode === 'zen' ? 'text-primary font-semibold bg-surface-soft' : 'hover:text-ink'
            }`}
          >
            zen
          </button>
        </div>

        {/* Sub-options for Time mode */}
        {config.mode === 'time' && (
          <div className="flex items-center gap-1">
            {[15, 30, 60, 120].map((dur) => (
              <button
                key={dur}
                onClick={() => setDuration(dur)}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  config.duration === dur ? 'text-primary font-bold' : 'hover:text-ink'
                }`}
              >
                {dur}
              </button>
            ))}
          </div>
        )}

        {/* Sub-options for Words mode */}
        {config.mode === 'words' && (
          <div className="flex items-center gap-1">
            {[10, 25, 50, 100].map((wc) => (
              <button
                key={wc}
                onClick={() => setWordCount(wc)}
                className={`px-1.5 py-0.5 rounded transition-colors ${
                  config.wordCount === wc ? 'text-primary font-bold' : 'hover:text-ink'
                }`}
              >
                {wc}
              </button>
            ))}
          </div>
        )}

        {/* Punctuation & Numbers Toggles */}
        <div className="flex items-center gap-1 border-l border-hairline pl-2 ml-1">
          <button
            onClick={togglePunctuation}
            className={`px-1.5 py-0.5 rounded transition-colors ${
              config.punctuation ? 'text-primary font-bold' : 'hover:text-ink'
            }`}
            title="Toggle Punctuation"
          >
            @ punctuation
          </button>
          <button
            onClick={toggleNumbers}
            className={`px-1.5 py-0.5 rounded transition-colors ${
              config.numbers ? 'text-primary font-bold' : 'hover:text-ink'
            }`}
            title="Toggle Numbers"
          >
            # numbers
          </button>
        </div>
      </nav>

      {/* Right Controls: Theme cycle pill */}
      <div className="flex items-center gap-3">
        <button
          onClick={nextTheme}
          className="flex items-center gap-1.5 hover:text-ink text-text-muted transition-colors py-1 px-2.5 rounded-full hover:bg-surface border border-transparent hover:border-hairline"
          title="Click to cycle themes"
        >
          <span
            className="w-2 h-2 rounded-full border border-hairline"
            style={{ backgroundColor: themeObj.preview.primary }}
          />
          <span className="hidden sm:inline capitalize">{themeObj.name.split(' ')[0]}</span>
        </button>
      </div>
    </header>
  );
};
