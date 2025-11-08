import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { ProjectManager } from './services/ProjectManager'
import { ProcessManager } from './services/ProcessManager'
import { LogManager } from './services/LogManager'
import { ConfigManager } from './services/ConfigManager'

// 服务实例
let projectManager: ProjectManager
let processManager: ProcessManager
let logManager: LogManager
let configManager: ConfigManager

// 主窗口
let mainWindow: BrowserWindow | null = null

const isDev = process.env.NODE_ENV === 'development'

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
  ipcMain.handle('projects:getAll', () => projectManager.getAllProjects())
  ipcMain.handle('projects:create', (_, projectData) => projectManager.createProject(projectData))
  ipcMain.handle('projects:update', (_, id, updates) => projectManager.updateProject(id, updates))
  ipcMain.handle('projects:delete', (_, id) => projectManager.deleteProject(id))
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
    return result
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