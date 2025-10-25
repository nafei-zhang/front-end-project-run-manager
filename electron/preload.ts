import { contextBridge, ipcRenderer } from 'electron'

// 定义 API 类型
export interface ElectronAPI {
  // 项目管理
  projects: {
    getAll: () => Promise<Project[]>
    create: (projectData: CreateProjectData) => Promise<Project>
    update: (id: string, updates: Partial<Project>) => Promise<Project>
    delete: (id: string) => Promise<boolean>
    getRunning: () => Promise<Project[]>
    start: (id: string) => Promise<{ success: boolean; pid?: number; error?: string }>
    stop: (id: string) => Promise<boolean>
    getStatus: (id: string) => Promise<ProjectStatus>
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
}

export type ProjectStatus = 'stopped' | 'running' | 'error'

// 暴露 API 到渲染进程
const electronAPI: ElectronAPI = {
  projects: {
    getAll: () => ipcRenderer.invoke('projects:getAll'),
    create: (projectData) => ipcRenderer.invoke('projects:create', projectData),
    update: (id, updates) => ipcRenderer.invoke('projects:update', id, updates),
    delete: (id) => ipcRenderer.invoke('projects:delete', id),
    getRunning: () => ipcRenderer.invoke('projects:getRunning'),
    start: (id) => ipcRenderer.invoke('projects:start', id),
    stop: (id) => ipcRenderer.invoke('projects:stop', id),
    getStatus: (id) => ipcRenderer.invoke('projects:getStatus', id)
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