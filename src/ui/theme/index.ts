import { create } from 'zustand';

export interface ThemeDefinition {
  id: string;
  name: string;
  type: 'dark' | 'light';
  preview: {
    canvas: string;
    primary: string;
    accent: string;
    ink: string;
  };
}

export const THEMES: ThemeDefinition[] = [
  {
    id: 'mongodb-dark',
    name: 'Dark',
    type: 'dark',
    preview: {
      canvas: '#111715',
      primary: '#a4bf9d',
      accent: '#a4bf9d',
      ink: '#f2f4ee',
    },
  },
  {
    id: 'mongodb-light',
    name: 'Light',
    type: 'light',
    preview: {
      canvas: '#f6f5f0',
      primary: '#42644c',
      accent: '#42644c',
      ink: '#1d2921',
    },
  },
  {
    id: 'classic-green',
    name: 'Classic Green',
    type: 'dark',
    preview: {
      canvas: '#001e2b',
      primary: '#00ed64',
      accent: '#00ed64',
      ink: '#ffffff',
    },
  },
];

interface ThemeState {
  currentTheme: string;
  setTheme: (themeId: string) => void;
  nextTheme: () => void;
  prevTheme: () => void;
}

const STORAGE_KEY = 'typosaurus_theme';
const DEFAULT_THEME_ID = 'mongodb-dark';
const THEME_IDS = new Set(THEMES.map((theme) => theme.id));

function getSavedTheme(): string {
  if (typeof window === 'undefined') return DEFAULT_THEME_ID;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved && THEME_IDS.has(saved) ? saved : DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export const useThemeStore = create<ThemeState>((set, get) => {
  const initialTheme = getSavedTheme();

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', initialTheme);
  }

  return {
    currentTheme: initialTheme,
    setTheme: (themeId: string) => {
      if (!THEME_IDS.has(themeId) || get().currentTheme === themeId) return;
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', themeId);
      }
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(STORAGE_KEY, themeId);
        } catch {
          // Theme selection still works when storage is unavailable.
        }
      }
      set({ currentTheme: themeId });
    },
    nextTheme: () => {
      const current = get().currentTheme;
      const idx = THEMES.findIndex((t) => t.id === current);
      const next = THEMES[(idx + 1) % THEMES.length].id;
      get().setTheme(next);
    },
    prevTheme: () => {
      const current = get().currentTheme;
      const idx = THEMES.findIndex((t) => t.id === current);
      const prev = THEMES[(idx - 1 + THEMES.length) % THEMES.length].id;
      get().setTheme(prev);
    },
  };
});
