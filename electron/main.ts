import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { ProjectManager } from './services/ProjectManager'
import { ProcessManager } from './services/ProcessManager'
import { LogManager } from './services/LogManager'
import { ConfigManager } from './services/ConfigManager'
import { ShortcutConfigManager } from './services/ShortcutConfigManager'

// 服务实例
let projectManager: ProjectManager
let processManager: ProcessManager
let logManager: LogManager
let configManager: ConfigManager
let shortcutConfigManager: ShortcutConfigManager

// 主窗口
let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV === 'development'

function applyProjectOrder<T extends { id: string }>(items: T[], order: string[]): T[] {
  if (order.length === 0) {
    return items
  }

  const indexMap = new Map(order.map((id, index) => [id, index]))

  return [...items].sort((a, b) => {
    const indexA = indexMap.get(a.id)
    const indexB = indexMap.get(b.id)

    if (indexA === undefined && indexB === undefined) return 0
    if (indexA === undefined) return 1
    if (indexB === undefined) return -1
    return indexA - indexB
  })
}

function createWindow() {
  // 获取窗口配置
  const config = configManager ? configManager.getConfig() : null
  
  mainWindow = new BrowserWindow({
    width: config?.windowBounds?.width || 1200,
    height: config?.windowBounds?.height || 800,
    x: config?.windowBounds?.x,
    y: config?.windowBounds?.y,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    show: false
  })

  // 加载应用
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  // 窗口准备好后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // 保存窗口位置和大小
  mainWindow.on('close', () => {
    if (mainWindow && configManager) {
      const bounds = mainWindow.getBounds()
      configManager.updateConfig({
        windowBounds: bounds
      })
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// 初始化服务
function initializeServices() {
  configManager = new ConfigManager()
  shortcutConfigManager = new ShortcutConfigManager()
  projectManager = new ProjectManager()
  logManager = new LogManager()
  processManager = new ProcessManager(logManager)
  
  // 设置 URL 检测回调
  processManager.setUrlDetectedCallback((projectId: string, url: string, port?: number) => {
    console.log(`[Main] URL detected for project ${projectId}: ${url}`)
    projectManager.updateProject(projectId, { 
      url: url,
      port: port 
    })
  })
  
  // 设置项目状态变更回调
  processManager.setProjectStatusChangeCallback((projectId: string, status: 'running' | 'stopped') => {
    console.log(`[Main] Project status change for ${projectId}: ${status}`)
    if (status === 'stopped') {
      projectManager.updateProject(projectId, { 
        status: 'stopped',
        pid: undefined,
        url: undefined,
        port: undefined
      })
    }
    // 主动通知渲染进程状态变更，确保前端无需依赖轮询即可及时更新
    if (mainWindow) {
      try {
        mainWindow.webContents.send('projects:statusChanged', { id: projectId, status })
      } catch (err) {
        console.warn('[Main] Failed to send projects:statusChanged:', err)
      }
    }
  })
  
  // 应用启动时重置所有项目状态为停止状态
  // 因为应用重启后，之前运行的进程已经不在ProcessManager的管理范围内
  projectManager.resetAllProjectsToStopped()
}

// 设置 IPC 处理器
function setupIpcHandlers() {
  // 项目管理
  ipcMain.handle('projects:getAll', () => {
    const projects = projectManager.getAllProjects()
    const { projectOrder } = configManager.getConfig()
    return applyProjectOrder(projects, projectOrder || [])
  })
  ipcMain.handle('projects:create', (_, projectData) => {
    const project = projectManager.createProject(projectData)
    const { projectOrder } = configManager.getConfig()
    const nextOrder = [...(projectOrder || []).filter(id => id !== project.id), project.id]
    configManager.updateConfig({ projectOrder: nextOrder })
    return project
  })
  ipcMain.handle('projects:update', (_, id, updates) => projectManager.updateProject(id, updates))
  ipcMain.handle('projects:delete', (_, id) => {
    const success = projectManager.deleteProject(id)
    if (success) {
      const { projectOrder } = configManager.getConfig()
      const nextOrder = (projectOrder || []).filter(projectId => projectId !== id)
      configManager.updateConfig({ projectOrder: nextOrder })
    }
    return success
  })
  ipcMain.handle('projects:reorder', (_, projectIds: string[]) => {
    const projects = projectManager.getAllProjects()
    const projectSet = new Set(projects.map(project => project.id))
    const dedupedIds = Array.from(new Set(projectIds)).filter(id => projectSet.has(id))
    const missingIds = projects
      .map(project => project.id)
      .filter(id => !dedupedIds.includes(id))
    const normalizedOrder = [...dedupedIds, ...missingIds]
    configManager.updateConfig({ projectOrder: normalizedOrder })
    return true
  })
  ipcMain.handle('projects:getRunning', () => processManager.getRunningProjects())

  // 项目控制
  ipcMain.handle('projects:start', async (_, id) => {
    const project = projectManager.getProject(id)
    if (!project) return { success: false, error: 'Project not found' }
    
    const result = await processManager.startProject(project)
    if (result.success) {
      projectManager.updateProject(id, { 
        status: 'running', 
        pid: result.pid 
      })
    }
    shortcutConfigManager.appendStartupLogs([{
      projectId: id,
      projectName: project.name,
      success: result.success,
      message: result.success ? `Started with PID ${result.pid || 'N/A'}` : (result.error || 'Unknown error')
    }])
    return result
  })

  ipcMain.handle('projects:startBatch', async (_, ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids))
    const started = await Promise.all(uniqueIds.map(async (id) => {
      const project = projectManager.getProject(id)
      if (!project) {
        return { id, name: id, success: false, error: 'Project not found' }
      }
      const result = await processManager.startProject(project)
      if (result.success) {
        projectManager.updateProject(id, {
          status: 'running',
          pid: result.pid
        })
      }
      return {
        id,
        name: project.name,
        success: result.success,
        pid: result.pid,
        error: result.error
      }
    }))

    shortcutConfigManager.appendStartupLogs(
      started.map(item => ({
        projectId: item.id,
        projectName: item.name,
        success: item.success,
        message: item.success ? `Started with PID ${item.pid || 'N/A'}` : (item.error || 'Unknown error')
      }))
    )

    return started
  })

  ipcMain.handle('projects:stop', async (_, id) => {
    console.log('[IPC] projects:stop called for id:', id)
    const success = await processManager.stopProject(id)
    console.log('[IPC] processManager.stopProject result:', success)
    
    if (success) {
      console.log('[IPC] Updating project status to stopped')
      projectManager.updateProject(id, { 
        status: 'stopped', 
        pid: undefined 
      })
      console.log('[IPC] Project status updated successfully')
      // 向渲染进程广播状态更新事件
      if (mainWindow) {
        try {
          mainWindow.webContents.send('projects:statusChanged', { id, status: 'stopped' })
        } catch (err) {
          console.warn('[IPC] Failed to send projects:statusChanged:', err)
        }
      }
    } else {
      console.log('[IPC] Failed to stop project, not updating status')
    }
    
    console.log('[IPC] Returning success:', success)
    return success
  })

  ipcMain.handle('projects:getStatus', (_, id) => {
    const project = projectManager.getProject(id)
    return project ? project.status : 'stopped'
  })

  // 日志管理
  ipcMain.handle('logs:getMemoryLogs', (_, projectId) => logManager.getMemoryLogs(projectId))
  ipcMain.handle('logs:clearAll', () => logManager.clearAllLogs())
  ipcMain.handle('logs:clear', (_, projectId) => logManager.clearProjectLogs(projectId))

  // 配置管理
  ipcMain.handle('config:get', () => configManager.getConfig())
  ipcMain.handle('config:update', (_, updates) => configManager.updateConfig(updates))
  ipcMain.handle('config:reset', () => configManager.resetConfig())
  ipcMain.handle('shortcuts:getAll', () => shortcutConfigManager.getShortcuts())
  ipcMain.handle('shortcuts:create', (_, payload) => {
    const { name, projectIds } = payload as { name: string; projectIds: string[] }
    const uniqueIds = Array.from(new Set(projectIds))
    const allProjects = projectManager.getAllProjects()
    const projectMap = new Map(allProjects.map(project => [project.id, project]))
    const selectedProjects = uniqueIds
      .map(id => projectMap.get(id))
      .filter(Boolean)
      .map(project => ({
        id: project!.id,
        name: project!.name,
        path: project!.path,
        packageManager: project!.packageManager,
        startCommand: project!.startCommand
      }))
    return shortcutConfigManager.createShortcut(name, selectedProjects)
  })
  ipcMain.handle('shortcuts:delete', (_, id: string) => shortcutConfigManager.deleteShortcut(id))
  ipcMain.handle('shortcuts:rename', (_, payload: { id: string; name: string }) => {
    return shortcutConfigManager.updateShortcutName(payload.id, payload.name)
  })
  ipcMain.handle('shortcuts:reorder', (_, orderedIds: string[]) => shortcutConfigManager.reorderShortcuts(orderedIds))
  ipcMain.handle('shortcuts:export', () => shortcutConfigManager.exportShortcuts())
  ipcMain.handle('shortcuts:import', (_, rawJson: string) => shortcutConfigManager.importShortcuts(rawJson))

  // 文件对话框
  ipcMain.handle('dialog:selectFolder', async () => {
    if (!mainWindow) return null
    
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: '选择项目文件夹'
    })
    
    return result.canceled ? null : result.filePaths[0]
  })

  // 打开文件夹
  ipcMain.handle('system:openFolder', async (_, folderPath) => {
    try {
      await shell.openPath(folderPath)
      return { success: true }
    } catch (error) {
      console.error('Failed to open folder:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}

// 应用事件
app.whenReady().then(() => {
  initializeServices()
  setupIpcHandlers()
  createWindow()

  // 在窗口创建后设置日志管理器的主窗口引用
  if (mainWindow && logManager) {
    logManager.setMainWindow(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // 停止所有运行中的项目
  if (processManager) {
    processManager.stopAllProjects()
  }
  
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  // 清理资源
  if (processManager) {
    processManager.stopAllProjects()
  }
})
