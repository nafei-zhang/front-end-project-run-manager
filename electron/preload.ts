import { contextBridge, ipcRenderer } from 'electron'

// 定义 API 类型
export interface ElectronAPI {
  // 项目管理
  projects: {
    getAll: () => Promise<Project[]>
    create: (projectData: CreateProjectData) => Promise<Project>
    update: (id: string, updates: Partial<Project>) => Promise<Project>
    delete: (id: string) => Promise<boolean>
    reorder: (projectIds: string[]) => Promise<boolean>
    getRunning: () => Promise<Project[]>
    start: (id: string) => Promise<{ success: boolean; pid?: number; error?: string }>
    startBatch: (ids: string[]) => Promise<Array<{ id: string; name: string; success: boolean; pid?: number; error?: string }>>
    stop: (id: string) => Promise<boolean>
    getStatus: (id: string) => Promise<ProjectStatus>
    onStatusChange: (callback: (data: { id: string; status: ProjectStatus }) => void) => void
    removeStatusChangeListeners: () => void
  }

  // 日志管理
  logs: {
    getMemoryLogs: (projectId: string) => Promise<LogEntry[]>
    clearAll: () => Promise<boolean>
    clear: (projectId: string) => Promise<boolean>
    onData: (callback: (data: { projectId: string; data: LogEntry }) => void) => void
    removeAllListeners: () => void
  }

  // 配置管理
  config: {
    get: () => Promise<AppConfig>
    update: (updates: Partial<AppConfig>) => Promise<AppConfig>
    reset: () => Promise<AppConfig>
  }

  shortcuts: {
    getAll: () => Promise<ProjectShortcut[]>
    create: (payload: { name: string; projectIds: string[] }) => Promise<ProjectShortcut>
    delete: (id: string) => Promise<boolean>
    rename: (payload: { id: string; name: string }) => Promise<ProjectShortcut>
    reorder: (orderedIds: string[]) => Promise<ProjectShortcut[]>
    export: () => Promise<string>
    import: (rawJson: string) => Promise<{ success: boolean; imported: number; error?: string }>
  }

  // 系统对话框
  dialog: {
    selectFolder: () => Promise<string | null>
  }

  // 系统操作
  system: {
    openFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>
  }
}

// 数据类型定义
export interface Project {
  id: string
  name: string
  path: string
  packageManager: 'npm' | 'pnpm' | 'yarn'
  startCommand: string
  status: 'stopped' | 'running' | 'error'
  port?: number
  pid?: number
  url?: string
  createdAt: string
  updatedAt: string
  autoRefreshLogs?: boolean // 添加自动刷新日志字段
}

export interface CreateProjectData {
  name: string
  path: string
  packageManager: 'npm' | 'pnpm' | 'yarn'
  startCommand?: string
}

export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export interface AppConfig {
  theme: 'light' | 'dark' | 'system'
  autoStart: boolean
  minimizeToTray: boolean
  showNotifications: boolean
  defaultPackageManager: 'npm' | 'pnpm' | 'yarn'
  maxConcurrentProjects: number
  windowBounds?: {
    x: number
    y: number
    width: number
    height: number
  }
  language: 'zh-CN' | 'en-US'
  logLevel: 'info' | 'warn' | 'error'
  projectOrder: string[]
}

export type ProjectStatus = 'stopped' | 'running' | 'error'

export interface ShortcutProjectSnapshot {
  id: string
  name: string
  path: string
  packageManager: 'npm' | 'pnpm' | 'yarn'
  startCommand: string
}

export interface ProjectShortcut {
  id: string
  name: string
  projects: ShortcutProjectSnapshot[]
  createdAt: string
  updatedAt: string
}

// 暴露 API 到渲染进程
const electronAPI: ElectronAPI = {
  projects: {
    getAll: () => ipcRenderer.invoke('projects:getAll'),
    create: (projectData) => ipcRenderer.invoke('projects:create', projectData),
    update: (id, updates) => ipcRenderer.invoke('projects:update', id, updates),
    delete: (id) => ipcRenderer.invoke('projects:delete', id),
    reorder: (projectIds) => ipcRenderer.invoke('projects:reorder', projectIds),
    getRunning: () => ipcRenderer.invoke('projects:getRunning'),
    start: (id) => ipcRenderer.invoke('projects:start', id),
    startBatch: (ids) => ipcRenderer.invoke('projects:startBatch', ids),
    stop: (id) => ipcRenderer.invoke('projects:stop', id),
    getStatus: (id) => ipcRenderer.invoke('projects:getStatus', id),
    onStatusChange: (callback) => {
      ipcRenderer.on('projects:statusChanged', (_, data) => callback(data))
    },
    removeStatusChangeListeners: () => {
      ipcRenderer.removeAllListeners('projects:statusChanged')
    }
  },

  logs: {
    getMemoryLogs: (projectId) => ipcRenderer.invoke('logs:getMemoryLogs', projectId),
    clearAll: () => ipcRenderer.invoke('logs:clearAll'),
    clear: (projectId) => ipcRenderer.invoke('logs:clear', projectId),
    onData: (callback) => {
      ipcRenderer.on('logs:data', (_, data) => callback(data))
    },
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('logs:data')
    }
  },

  config: {
    get: () => ipcRenderer.invoke('config:get'),
    update: (updates) => ipcRenderer.invoke('config:update', updates),
    reset: () => ipcRenderer.invoke('config:reset')
  },

  shortcuts: {
    getAll: () => ipcRenderer.invoke('shortcuts:getAll'),
    create: (payload) => ipcRenderer.invoke('shortcuts:create', payload),
    delete: (id) => ipcRenderer.invoke('shortcuts:delete', id),
    rename: (payload) => ipcRenderer.invoke('shortcuts:rename', payload),
    reorder: (orderedIds) => ipcRenderer.invoke('shortcuts:reorder', orderedIds),
    export: () => ipcRenderer.invoke('shortcuts:export'),
    import: (rawJson) => ipcRenderer.invoke('shortcuts:import', rawJson)
  },

  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:selectFolder')
  },

  system: {
    openFolder: (folderPath) => ipcRenderer.invoke('system:openFolder', folderPath)
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// 类型声明
declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
