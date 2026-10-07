import React from 'react';
import { CodeLanguage, EngineConfig, TestMode } from '@/engine/types';
import { CODE_LANGUAGES } from '@/data/code-snippets';
import { ThemePicker } from './ThemePicker';

interface NavHeaderProps {
  config: EngineConfig;
  onConfigChange: (newConfig: EngineConfig) => void;
}

export const NavHeader: React.FC<NavHeaderProps> = ({ config, onConfigChange }) => {
  const setMode = (mode: TestMode) => onConfigChange({ ...config, mode });
  const setCodeLanguage = (codeLanguage: CodeLanguage) => onConfigChange({ ...config, mode: 'code', codeLanguage });

  return (
    <header className="app-header">
      <div className="header-top">
        <div className="brand" aria-label="Typosaurus home">
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="brand-mark" />
          <span className="brand-wordmark" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}text-logo.png`} alt="" /></span>
        </div>
        <div className="header-actions">
          <ThemePicker />
        </div>
      </div>
      <nav className="test-toolbar" aria-label="Typing test settings">
        <div className="toolbar-group mode-group" aria-label="Test mode">
          {(['time', 'words', 'code', 'zen'] as TestMode[]).map((mode) => (
            <button key={mode} className={`toolbar-button mode-button ${config.mode === mode ? 'is-active' : ''}`} aria-pressed={config.mode === mode} onClick={() => setMode(mode)}>{mode}</button>
          ))}
        </div>
        {config.mode !== 'code' && <>
          <span className="toolbar-divider" aria-hidden="true" />
          <div className="toolbar-group value-group" aria-label={config.mode === 'time' ? 'Duration in seconds' : 'Word count'}>
            {config.mode === 'time' && [15, 30, 60, 120].map((duration) => (
              <button key={duration} className={`toolbar-button value-button ${config.duration === duration ? 'is-active' : ''}`} aria-pressed={config.duration === duration} onClick={() => onConfigChange({ ...config, duration })}>{duration}</button>
            ))}
            {config.mode === 'words' && [10, 25, 50, 100].map((wordCount) => (
              <button key={wordCount} className={`toolbar-button value-button ${config.wordCount === wordCount ? 'is-active' : ''}`} aria-pressed={config.wordCount === wordCount} onClick={() => onConfigChange({ ...config, wordCount })}>{wordCount}</button>
            ))}
            {config.mode === 'zen' && <span className="zen-label">Untimed</span>}
          </div>
        </>}
        {config.mode !== 'code' && <>
          <span className="toolbar-divider options-divider" aria-hidden="true" />
          <div className="toolbar-group options-group" aria-label="Text options">
            <button className={`toolbar-button option-button ${config.punctuation ? 'is-active' : ''}`} aria-pressed={config.punctuation} onClick={() => onConfigChange({ ...config, punctuation: !config.punctuation })}>punctuation</button>
            <button className={`toolbar-button option-button ${config.numbers ? 'is-active' : ''}`} aria-pressed={config.numbers} onClick={() => onConfigChange({ ...config, numbers: !config.numbers })}>numbers</button>
          </div>
        </>}
      </nav>
      {config.mode === 'code' && <nav className="language-bar" aria-label="Code language">
        {CODE_LANGUAGES.map((language) => (
          <button
            key={language.id}
            className={`language-button ${(config.codeLanguage ?? 'javascript') === language.id ? 'is-active' : ''}`}
            aria-pressed={(config.codeLanguage ?? 'javascript') === language.id}
            onClick={() => setCodeLanguage(language.id)}
          >{language.label}</button>
        ))}
      </nav>}
    </header>
  );
};
