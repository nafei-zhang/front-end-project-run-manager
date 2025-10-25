import { BrowserWindow } from 'electron'

export interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error'
  message: string
}

export class LogManager {
  private logs: Map<string, LogEntry[]> = new Map()
  private maxLogsPerProject = 500
  private mainWindow?: BrowserWindow

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  addLog(projectId: string, logEntry: LogEntry): void {
    if (!this.logs.has(projectId)) {
      this.logs.set(projectId, [])
    }

    const projectLogs = this.logs.get(projectId)!
    projectLogs.push(logEntry)

    // 保持循环缓冲区大小
    if (projectLogs.length > this.maxLogsPerProject) {
      projectLogs.shift() // 移除最旧的日志
    }

    // 实时发送日志到渲染进程
    this.sendLogToRenderer(projectId, logEntry)
  }

  getMemoryLogs(projectId: string): LogEntry[] {
    return this.logs.get(projectId) || []
  }

  getAllMemoryLogs(): Record<string, LogEntry[]> {
    const result: Record<string, LogEntry[]> = {}
    for (const [projectId, logs] of this.logs) {
      result[projectId] = [...logs]
    }
    return result
  }

  clearProjectLogs(projectId: string): void {
    this.logs.delete(projectId)
    
    // 通知渲染进程日志已清除
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('logs:cleared', projectId)
    }
  }

  clearAllLogs(): void {
    this.logs.clear()
    
    // 通知渲染进程所有日志已清除
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('logs:allCleared')
    }
  }

  getLogStats(projectId: string): { total: number; errors: number; warnings: number } {
    const logs = this.logs.get(projectId) || []
    
    return {
      total: logs.length,
      errors: logs.filter(log => log.level === 'error').length,
      warnings: logs.filter(log => log.level === 'warn').length
    }
  }

  // 获取最近的错误日志
  getRecentErrors(projectId: string, limit = 10): LogEntry[] {
    const logs = this.logs.get(projectId) || []
    return logs
      .filter(log => log.level === 'error')
      .slice(-limit)
  }

  // 搜索日志
  searchLogs(projectId: string, query: string, level?: LogEntry['level']): LogEntry[] {
    const logs = this.logs.get(projectId) || []
    const lowerQuery = query.toLowerCase()
    
    return logs.filter(log => {
      const matchesQuery = log.message.toLowerCase().includes(lowerQuery)
      const matchesLevel = !level || log.level === level
      return matchesQuery && matchesLevel
    })
  }

  private sendLogToRenderer(projectId: string, logEntry: LogEntry): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('logs:newEntry', {
        projectId,
        logEntry
      })
    }
  }

  // 获取内存使用情况
  getMemoryUsage(): { totalProjects: number; totalLogs: number; estimatedMemoryKB: number } {
    let totalLogs = 0
    let estimatedMemoryBytes = 0

    for (const [projectId, logs] of this.logs) {
      totalLogs += logs.length
      
      // 估算内存使用（粗略计算）
      for (const log of logs) {
        estimatedMemoryBytes += JSON.stringify(log).length * 2 // UTF-16 字符
      }
      estimatedMemoryBytes += projectId.length * 2
    }

    return {
      totalProjects: this.logs.size,
      totalLogs,
      estimatedMemoryKB: Math.round(estimatedMemoryBytes / 1024)
    }
  }

  // 清理过期项目的日志（当项目被删除时调用）
  cleanupProjectLogs(projectId: string): void {
    this.logs.delete(projectId)
  }
}