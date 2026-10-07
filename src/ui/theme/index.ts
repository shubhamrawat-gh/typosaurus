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
    name: 'MongoDB Dark (Default)',
    type: 'dark',
    preview: {
      canvas: '#001e2b',
      primary: '#00ed64',
      accent: '#7b3ff2',
      ink: '#ffffff',
    },
  },
  {
    id: 'mongodb-light',
    name: 'MongoDB Light',
    type: 'light',
    preview: {
      canvas: '#ffffff',
      primary: '#00684a',
      accent: '#fa6e39',
      ink: '#001e2b',
    },
  },
  {
    id: 'matrix-cyber',
    name: 'Matrix Cyber',
    type: 'dark',
    preview: {
      canvas: '#050a06',
      primary: '#00ff66',
      accent: '#00ffff',
      ink: '#c8ffd4',
    },
  },
  {
    id: 'nord-frost',
    name: 'Nord Frost',
    type: 'dark',
    preview: {
      canvas: '#242933',
      primary: '#88c0d0',
      accent: '#b48ead',
      ink: '#eceff4',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    type: 'dark',
    preview: {
      canvas: '#21222c',
      primary: '#50fa7b',
      accent: '#ff79c6',
      ink: '#f8f8f2',
    },
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    type: 'dark',
    preview: {
      canvas: '#00212b',
      primary: '#2aa198',
      accent: '#b58900',
      ink: '#93a1a1',
    },
  },
  {
    id: 'monokai-pro',
    name: 'Monokai Pro',
    type: 'dark',
    preview: {
      canvas: '#221f22',
      primary: '#a9dc76',
      accent: '#ffd866',
      ink: '#fcfcfa',
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

export const useThemeStore = create<ThemeState>((set, get) => {
  const initialTheme =
    typeof window !== 'undefined'
      ? localStorage.getItem(STORAGE_KEY) || 'mongodb-dark'
      : 'mongodb-dark';

  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', initialTheme);
  }

  return {
    currentTheme: initialTheme,
    setTheme: (themeId: string) => {
      if (!THEMES.some((t) => t.id === themeId)) return;
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-theme', themeId);
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, themeId);
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
