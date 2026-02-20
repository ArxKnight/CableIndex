import React, { createContext, useCallback, useLayoutEffect, useMemo, useState } from 'react'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'infradb-theme'

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const defaultContext: ThemeContextValue = {
  theme: 'dark',
  setTheme: () => {},
  toggleTheme: () => {},
}

const ThemeContext = createContext<ThemeContextValue>(defaultContext)

const isTheme = (value: string | null): value is Theme => value === 'dark' || value === 'light'

const readStoredTheme = (): Theme | null => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isTheme(stored) ? stored : null
  } catch {
    return null
  }
}

const applyThemeToRoot = (theme: Theme) => {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme() ?? 'dark')

  const setTheme = useCallback((nextTheme: Theme) => {
    setThemeState(nextTheme)
    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme)
    } catch {
      // ignore
    }
    applyThemeToRoot(nextTheme)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [setTheme, theme])

  useLayoutEffect(() => {
    // Ensures theme is applied in environments where the inline bootstrap
    // script didn't run (tests) and keeps document class in sync.
    applyThemeToRoot(theme)
  }, [theme])

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme, toggleTheme }), [theme, setTheme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export const useTheme = () => React.useContext(ThemeContext)
