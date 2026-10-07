import React, { useEffect, useRef, useState } from 'react';
import { THEMES, useThemeStore } from './theme';

export const ThemePicker: React.FC = () => {
  const currentTheme = useThemeStore((state) => state.currentTheme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const [open, setOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const current = THEMES.find((theme) => theme.id === currentTheme) ?? THEMES[0];

  useEffect(() => {
    if (!open) return;

    pickerRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus();
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const chooseTheme = (id: string) => {
    setTheme(id);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const options = Array.from(pickerRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? []);
    const index = options.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1
      : event.key === 'ArrowDown' ? (index + 1) % options.length : (index - 1 + options.length) % options.length;
    options[nextIndex]?.focus();
  };

  return (
    <div
      ref={pickerRef}
      className="theme-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`theme-trigger ${open ? 'is-open' : ''}`}
        aria-label={`Theme: ${current.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="theme-preview" style={{ backgroundColor: current.preview.canvas }} aria-hidden="true">
          <span style={{ backgroundColor: current.preview.primary }} />
        </span>
        <span className="theme-trigger-name">{current.name}</span>
        <svg className="theme-chevron" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className="theme-menu" role="menu" aria-label="Choose theme" onKeyDown={handleMenuKeyDown}>
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              className={`theme-option ${theme.id === currentTheme ? 'is-selected' : ''}`}
              role="menuitemradio"
              aria-checked={theme.id === currentTheme}
              onClick={() => chooseTheme(theme.id)}
            >
              <span className="theme-preview" style={{ backgroundColor: theme.preview.canvas }} aria-hidden="true">
                <span style={{ backgroundColor: theme.preview.primary }} />
              </span>
              <span>{theme.name}</span>
              {theme.id === currentTheme && <svg className="theme-check" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m3 8 3 3 7-7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
