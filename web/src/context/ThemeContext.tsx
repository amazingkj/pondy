import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  isDark: boolean;
  toggleTheme: () => void;
  colors: ThemeColors;
}

interface ThemeColors {
  bg: string;
  bgSecondary: string;
  bgCard: string;
  cardBg: string;
  text: string;
  textSecondary: string;
  border: string;
  borderLight: string;
  accent: string;
  primary: string;
}

const lightColors: ThemeColors = {
  bg: '#f3f4f6',
  bgSecondary: '#f9fafb',
  bgCard: '#ffffff',
  cardBg: '#ffffff',
  text: '#111827',
  textSecondary: '#6b7280',
  border: '#e5e7eb',
  borderLight: '#f3f4f6',
  accent: '#2563eb',
  primary: '#3b82f6',
};

const darkColors: ThemeColors = {
  bg: '#111827',
  bgSecondary: '#1f2937',
  bgCard: '#1f2937',
  cardBg: '#1f2937',
  text: '#f9fafb',
  textSecondary: '#9ca3af',
  border: '#374151',
  borderLight: '#374151',
  accent: '#60a5fa',
  primary: '#3b82f6',
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pondy-theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });

  useEffect(() => {
    localStorage.setItem('pondy-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  const isDark = theme === 'dark';
  const colors = isDark ? darkColors : lightColors;

  return (
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
