import { create } from 'zustand'

interface ThemeState {
  dark: boolean
  toggle: () => void
}

const stored = typeof window !== 'undefined' ? localStorage.getItem('xsp-dark-mode') : null
const prefersDark = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
const initialDark = stored !== null ? stored === 'true' : prefersDark

// Apply immediately to avoid flash
if (typeof document !== 'undefined') {
  document.documentElement.classList.toggle('dark', initialDark)
}

export const useThemeStore = create<ThemeState>((set) => ({
  dark: initialDark,
  toggle: () =>
    set((state) => {
      const next = !state.dark
      document.documentElement.classList.toggle('dark', next)
      localStorage.setItem('xsp-dark-mode', String(next))
      return { dark: next }
    }),
}))
