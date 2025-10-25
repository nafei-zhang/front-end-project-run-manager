import { create } from 'zustand'

interface ThemeStore {
  theme: 'light' | 'dark' | 'system'
  actualTheme: 'light' | 'dark'
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  updateActualTheme: () => void
  initializeTheme: () => void
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: 'system',
  actualTheme: 'light',

  setTheme: (theme: 'light' | 'dark' | 'system') => {
    set({ theme })
    const { updateActualTheme } = get()
    updateActualTheme()
  },

  updateActualTheme: () => {
    const { theme } = get()
    const root = document.documentElement
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
      root.setAttribute('data-theme', systemTheme)
    } else {
      root.setAttribute('data-theme', theme)
    }
  },

  initializeTheme: () => {
    const { updateActualTheme } = get()
    updateActualTheme()
    
    // 监听系统主题变化
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      const { theme } = get()
      if (theme === 'system') {
        updateActualTheme()
      }
    })
  }
}))