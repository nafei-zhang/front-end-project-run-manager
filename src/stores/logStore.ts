import { create } from 'zustand'

interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
}

interface LogStore {
  logs: Record<string, LogEntry[]>
  activeProjectId: string | null
  filter: {
    level: 'all' | 'info' | 'warn' | 'error'
    search: string
  }
  
  // Actions
  setActiveProject: (projectId: string | null) => void
  addLog: (projectId: string, log: LogEntry) => void
  clearProjectLogs: (projectId: string) => void
  clearAllLogs: () => void
  loadLogs: (projectId: string) => Promise<void>
  refreshLogs: (projectId: string) => Promise<void>
  setFilter: (filter: Partial<LogStore['filter']>) => void
  getFilteredLogs: (projectId: string) => LogEntry[]
}

export const useLogStore = create<LogStore>((set, get) => ({
  logs: {},
  activeProjectId: null,
  filter: {
    level: 'all',
    search: ''
  },

  setActiveProject: (projectId) => {
    set({ activeProjectId: projectId })
    if (projectId) {
      get().loadLogs(projectId)
    }
  },

  addLog: (projectId, log) => {
    const { logs } = get()
    const projectLogs = logs[projectId] || []
    
    // 保持最多 500 条日志
    const updatedLogs = [...projectLogs, log]
    if (updatedLogs.length > 500) {
      updatedLogs.shift()
    }
    
    set({
      logs: {
        ...logs,
        [projectId]: updatedLogs
      }
    })
  },

  clearProjectLogs: (projectId) => {
    const { logs } = get()
    const updatedLogs = { ...logs }
    delete updatedLogs[projectId]
    
    set({ logs: updatedLogs })
    
    // 通知主进程清除日志
    if (window.electronAPI) {
      window.electronAPI.logs.clear(projectId)
    }
  },

  clearAllLogs: () => {
    set({ logs: {} })
    
    // 通知主进程清除所有日志
    if (window.electronAPI) {
      window.electronAPI.logs.clearAll()
    }
  },

  loadLogs: async (projectId) => {
    try {
      if (window.electronAPI) {
        const logs = await window.electronAPI.logs.getMemoryLogs(projectId)
        const { logs: currentLogs } = get()
        
        set({
          logs: {
            ...currentLogs,
            [projectId]: logs
          }
        })
      }
    } catch (error) {
      console.error('Failed to load logs:', error)
    }
  },

  refreshLogs: async (projectId) => {
    try {
      if (window.electronAPI) {
        const logs = await window.electronAPI.logs.getMemoryLogs(projectId)
        const { logs: currentLogs } = get()
        
        set({
          logs: {
            ...currentLogs,
            [projectId]: logs
          }
        })
      }
    } catch (error) {
      console.error('Failed to refresh logs:', error)
    }
  },

  setFilter: (filter) => {
    const { filter: currentFilter } = get()
    set({
      filter: {
        ...currentFilter,
        ...filter
      }
    })
  },

  getFilteredLogs: (projectId) => {
    const { logs, filter } = get()
    const projectLogs = logs[projectId] || []
    
    return projectLogs.filter(log => {
      // 级别过滤
      if (filter.level !== 'all' && log.level !== filter.level) {
        return false
      }
      
      // 搜索过滤
      if (filter.search) {
        const searchLower = filter.search.toLowerCase()
        return log.message.toLowerCase().includes(searchLower)
      }
      
      return true
    })
  }
}))

// 设置日志监听器
if (typeof window !== 'undefined' && window.electronAPI) {
  window.electronAPI.logs.onData((data: { projectId: string; data: LogEntry }) => {
    const store = useLogStore.getState()
    store.addLog(data.projectId, data.data)
  })
}

export type { LogEntry }