import { spawn, ChildProcess } from 'child_process'
import { Project } from './ProjectManager'
import { LogManager } from './LogManager'

export interface ProcessInfo {
  projectId: string
  process: ChildProcess
  pid: number
  startTime: Date
}

export class ProcessManager {
  private runningProcesses: Map<string, ProcessInfo> = new Map()
  private logManager: LogManager
  private onProjectStatusChange?: (projectId: string, status: 'running' | 'stopped') => void

  constructor(logManager: LogManager) {
    this.logManager = logManager
  }

  setProjectStatusChangeCallback(callback: (projectId: string, status: 'running' | 'stopped') => void): void {
    this.onProjectStatusChange = callback
  }

  async startProject(project: Project): Promise<{ success: boolean; pid?: number; error?: string }> {
    console.log('[ProcessManager] startProject called for project:', project.id, project.name)
    
    try {
      // 检查项目是否已经在运行
      if (this.runningProcesses.has(project.id)) {
        console.log('[ProcessManager] Project is already running')
        return { success: false, error: 'Project is already running' }
      }

      // 启动项目前清理该项目的日志
      console.log('[ProcessManager] Clearing logs for project before start:', project.id)
      this.logManager.clearProjectLogs(project.id)
      
      // 记录清理日志的操作
      this.logManager.addLog(project.id, {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Logs cleared before project start'
      })

      // 构建命令
      const command = this.buildCommand(project.packageManager, project.startCommand)
      console.log('[ProcessManager] Starting command:', command.cmd, command.args.join(' '))
      console.log('[ProcessManager] Working directory:', project.path)
      console.log('[ProcessManager] Environment NODE_ENV:', process.env.NODE_ENV || 'undefined')
      
      // 启动进程
      const childProcess = spawn(command.cmd, command.args, {
        cwd: project.path,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
        env: { 
          ...process.env, 
          FORCE_COLOR: '1',
          // 确保 PATH 包含常见的 Node.js 和包管理器路径
          PATH: this.getEnhancedPath()
        }
      })

      if (!childProcess.pid) {
        console.log('[ProcessManager] Failed to get PID from child process')
        return { success: false, error: 'Failed to start process' }
      }

      console.log('[ProcessManager] Process started with PID:', childProcess.pid)

      // 记录进程信息
      const processInfo: ProcessInfo = {
        projectId: project.id,
        process: childProcess,
        pid: childProcess.pid,
        startTime: new Date()
      }

      this.runningProcesses.set(project.id, processInfo)
      console.log('[ProcessManager] Added process to running processes list')
      console.log('[ProcessManager] Current running processes:', Array.from(this.runningProcesses.keys()))

      // 设置日志监听
      this.setupLogListeners(project.id, childProcess)

      // 监听进程退出
      childProcess.on('exit', (code, signal) => {
        console.log('[ProcessManager] Process exited:', project.id, 'code:', code, 'signal:', signal)
        this.runningProcesses.delete(project.id)
        console.log('[ProcessManager] Removed process from running list on exit')
        this.logManager.addLog(project.id, {
          timestamp: new Date().toISOString(),
          level: code === 0 ? 'info' : 'error',
          message: `Process exited with code ${code} ${signal ? `(${signal})` : ''}`
        })
        // 进程退出后，通知项目状态变更为 stopped，确保持久化状态与前端一致
        if (this.onProjectStatusChange) {
          console.log(`[ProcessManager] Notifying project status change to stopped on exit for ${project.id}`)
          this.onProjectStatusChange(project.id, 'stopped')
        }
      })

      childProcess.on('error', (error) => {
        console.log('[ProcessManager] Process error:', project.id, error.message)
        this.runningProcesses.delete(project.id)
        console.log('[ProcessManager] Removed process from running list on error')
        this.logManager.addLog(project.id, {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `Process error: ${error.message}`
        })
        // 进程错误时同样通知状态为 stopped，避免卡在 running 状态
        if (this.onProjectStatusChange) {
          console.log(`[ProcessManager] Notifying project status change to stopped on error for ${project.id}`)
          this.onProjectStatusChange(project.id, 'stopped')
        }
      })

      // 添加启动日志
      this.logManager.addLog(project.id, {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `Starting project: ${command.cmd} ${command.args.join(' ')}`
      })

      console.log('[ProcessManager] Process started successfully')
      return { success: true, pid: childProcess.pid }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.log('[ProcessManager] Failed to start project:', errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  async stopProject(projectId: string): Promise<boolean> {
    console.log('[ProcessManager] stopProject called for projectId:', projectId)
    console.log('[ProcessManager] Current running processes:', Array.from(this.runningProcesses.keys()))
    console.log('[ProcessManager] Total running processes count:', this.runningProcesses.size)
    
    const processInfo = this.runningProcesses.get(projectId)
    
    if (!processInfo) {
      console.log('[ProcessManager] No running process found for projectId:', projectId)
      // 如果进程不在运行列表中，可能已经停止了，视为成功
      console.log('[ProcessManager] Process may have already stopped, treating as success')
      return true
    }

    console.log('[ProcessManager] Found running process, PID:', processInfo.pid)

    return new Promise((resolve) => {
      let isResolved = false
      
      const cleanup = () => {
        if (!isResolved) {
          isResolved = true
          this.runningProcesses.delete(projectId)
          console.log('[ProcessManager] Removed process from running processes list')
        }
      }

      // 记录停止开始
      this.logManager.addLog(projectId, {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'Force stopping project and all child processes...'
      })

      try {
        // 在Windows上使用taskkill强制终止整个进程树
        if (process.platform === 'win32') {
          console.log('[ProcessManager] Using taskkill to force terminate process tree on Windows')
          
          const { spawn } = require('child_process')
          const taskkill = spawn('taskkill', ['/pid', processInfo.pid.toString(), '/t', '/f'], {
            stdio: 'pipe'
          })

          taskkill.on('close', (code: number | null) => {
            console.log(`[ProcessManager] taskkill exited with code ${code}`)
            
            this.logManager.addLog(projectId, {
              timestamp: new Date().toISOString(),
              level: 'info',
              message: `Process tree terminated (taskkill exit code: ${code})`
            })

            // 通知项目状态变更
            if (this.onProjectStatusChange) {
              console.log(`[ProcessManager] Notifying project status change to stopped for ${projectId}`)
              this.onProjectStatusChange(projectId, 'stopped')
            }

            cleanup()
            if (!isResolved) {
              resolve(true)
            }
          })

          taskkill.on('error', (error: Error) => {
            console.error('[ProcessManager] taskkill error:', error)
            
            // 如果taskkill失败，尝试使用SIGKILL
            try {
              console.log('[ProcessManager] Fallback to SIGKILL after taskkill failure')
              processInfo.process.kill('SIGKILL')
              
              this.logManager.addLog(projectId, {
                timestamp: new Date().toISOString(),
                level: 'warn',
                message: `Process force killed with SIGKILL (taskkill failed: ${error.message})`
              })

              // 通知项目状态变更
              if (this.onProjectStatusChange) {
                this.onProjectStatusChange(projectId, 'stopped')
              }

              cleanup()
              if (!isResolved) {
                resolve(true)
              }
            } catch (killError) {
              console.error('[ProcessManager] SIGKILL also failed:', killError)
              
              this.logManager.addLog(projectId, {
                timestamp: new Date().toISOString(),
                level: 'error',
                message: `Failed to stop process: ${killError instanceof Error ? killError.message : 'Unknown error'}`
              })

              cleanup()
              resolve(false)
            }
          })

          // 不设置超时，立即处理结果

        } else {
          // 非Windows系统，直接使用SIGKILL
          console.log('[ProcessManager] Using SIGKILL on non-Windows system')
          
          try {
            // 尝试终止进程组（如果支持的话）
            process.kill(-processInfo.pid, 'SIGKILL')
            console.log('[ProcessManager] Sent SIGKILL to process group')
          } catch (groupError) {
            // 如果进程组终止失败，尝试终止单个进程
            console.log('[ProcessManager] Process group kill failed, trying single process kill')
            processInfo.process.kill('SIGKILL')
          }

          this.logManager.addLog(projectId, {
            timestamp: new Date().toISOString(),
            level: 'info',
            message: 'Process force killed with SIGKILL'
          })

          // 通知项目状态变更
          if (this.onProjectStatusChange) {
            this.onProjectStatusChange(projectId, 'stopped')
          }

          cleanup()
          resolve(true)
        }
        
      } catch (error) {
        console.error('[ProcessManager] Failed to force stop process:', error)
        
        this.logManager.addLog(projectId, {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `Failed to stop project: ${error instanceof Error ? error.message : 'Unknown error'}`
        })
        
        cleanup()
        resolve(false)
      }
    })
  }

  stopAllProjects(): void {
    for (const [projectId] of this.runningProcesses) {
      this.stopProject(projectId)
    }
  }

  getRunningProjects(): string[] {
    return Array.from(this.runningProcesses.keys())
  }

  isProjectRunning(projectId: string): boolean {
    return this.runningProcesses.has(projectId)
  }

  getProcessInfo(projectId: string): ProcessInfo | undefined {
    return this.runningProcesses.get(projectId)
  }

  private buildCommand(packageManager: string, startCommand: string): { cmd: string; args: string[] } {
    // 如果启动命令已经包含完整的命令格式，直接解析
    if (startCommand.includes(' ')) {
      const parts = startCommand.trim().split(/\s+/)
      return { cmd: parts[0], args: parts.slice(1) }
    }
    
    // 向后兼容：如果只是简单的命令名，使用原有的包管理器逻辑
    // 在生产环境中使用完整路径来避免 PATH 问题
    const isProduction = process.env.NODE_ENV === 'production' || !process.env.NODE_ENV
    
    switch (packageManager) {
      case 'pnpm':
        const pnpmCmd = isProduction ? this.getCommandPath('pnpm') : 'pnpm'
        return { cmd: pnpmCmd, args: ['run', startCommand] }
      case 'yarn':
        const yarnCmd = isProduction ? this.getCommandPath('yarn') : 'yarn'
        return { cmd: yarnCmd, args: [startCommand] }
      case 'npm':
      default:
        const npmCmd = isProduction ? this.getCommandPath('npm') : 'npm'
        return { cmd: npmCmd, args: ['run', startCommand] }
    }
  }

  private getCommandPath(command: string): string {
    const { execSync } = require('child_process')
    const fs = require('fs')
    const path = require('path')
    const os = require('os')
    
    const isWindows = process.platform === 'win32'
    const commandWithExt = isWindows ? `${command}.cmd` : command
    
    try {
      // 在Windows上使用where命令，在Unix系统上使用which命令
      const findCommand = isWindows ? 'where' : 'which'
      const fullPath = execSync(`${findCommand} ${command}`, { encoding: 'utf8' }).trim()
      if (fullPath) {
        // Windows的where命令可能返回多行，取第一行
        const firstPath = fullPath.split('\n')[0].trim()
        console.log(`[ProcessManager] Found ${command} at: ${firstPath}`)
        // 如果路径包含空格，用引号包围
        return firstPath.includes(' ') ? `"${firstPath}"` : firstPath
      }
    } catch (error) {
      console.warn(`[ProcessManager] Could not find ${command} using system command, trying common paths`)
    }
    
    // 如果系统命令失败，尝试常见的路径
    const commonPaths = []
    
    if (isWindows) {
      // Windows常见路径
      const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
      const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
      const appData = process.env['APPDATA'] || path.join(os.homedir(), 'AppData', 'Roaming')
      const localAppData = process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local')
      
      commonPaths.push(
        path.join(programFiles, 'nodejs', `${command}.cmd`),
        path.join(programFilesX86, 'nodejs', `${command}.cmd`),
        path.join(appData, 'npm', `${command}.cmd`),
        path.join(localAppData, 'npm', `${command}.cmd`),
        path.join(os.homedir(), 'AppData', 'Roaming', 'npm', `${command}.cmd`)
      )
      
      // 添加NVM for Windows路径
      const nvmPath = process.env['NVM_HOME']
      if (nvmPath) {
        commonPaths.push(path.join(nvmPath, `${command}.cmd`))
      }
      
      // 添加Volta路径（Windows）
      const voltaHome = process.env['VOLTA_HOME'] || path.join(os.homedir(), '.volta')
      commonPaths.push(path.join(voltaHome, 'bin', `${command}.cmd`))
      
    } else {
      // Unix/Linux/macOS路径
      const homeDir = process.env.HOME || os.homedir()
      commonPaths.push(
        `/usr/local/bin/${command}`,
        `/opt/homebrew/bin/${command}`,
        `/usr/bin/${command}`,
        `${homeDir}/.volta/bin/${command}`
      )
      
      // 添加 NVM 和 FNM 路径（手动遍历目录）
      if (homeDir) {
        try {
          // NVM 路径
          const nvmDir = path.join(homeDir, '.nvm', 'versions', 'node')
          if (fs.existsSync(nvmDir)) {
            const versions = fs.readdirSync(nvmDir)
            for (const version of versions) {
              const binPath = path.join(nvmDir, version, 'bin', command)
              commonPaths.push(binPath)
            }
          }
        } catch (error) {
          console.warn('[ProcessManager] Failed to scan NVM paths:', error)
        }
        
        try {
          // FNM 路径
          const fnmDir = path.join(homeDir, '.fnm', 'node-versions')
          if (fs.existsSync(fnmDir)) {
            const versions = fs.readdirSync(fnmDir)
            for (const version of versions) {
              const binPath = path.join(fnmDir, version, 'installation', 'bin', command)
              commonPaths.push(binPath)
            }
          }
        } catch (error) {
          console.warn('[ProcessManager] Failed to scan FNM paths:', error)
        }
      }
    }
    
    for (const cmdPath of commonPaths) {
      try {
        if (fs.existsSync(cmdPath)) {
          console.log(`[ProcessManager] Found ${command} at: ${cmdPath}`)
          // 如果路径包含空格，用引号包围
          return cmdPath.includes(' ') ? `"${cmdPath}"` : cmdPath
        }
      } catch (error) {
        continue
      }
    }
    
    // 如果都找不到，返回原始命令名，让系统尝试
    console.warn(`[ProcessManager] Could not find full path for ${command}, using original command`)
    return isWindows ? commandWithExt : command
  }

  private setupLogListeners(projectId: string, childProcess: ChildProcess): void {
    // 监听标准输出
    childProcess.stdout?.on('data', (data) => {
      const message = data.toString().trim()
      if (message) {
        // 检测并提取 URL 信息
        this.extractAndSaveUrl(projectId, message)
        
        this.logManager.addLog(projectId, {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: this.cleanLogMessage(message)
        })
      }
    })

    // 监听标准错误
    childProcess.stderr?.on('data', (data) => {
      const message = data.toString().trim()
      if (message) {
        // 也检查 stderr 中的 URL 信息（某些工具会将正常信息输出到 stderr）
        this.extractAndSaveUrl(projectId, message)
        
        // 判断是否为错误信息（很多工具会将正常信息输出到 stderr）
        const level = this.isErrorMessage(message) ? 'error' : 'warn'
        this.logManager.addLog(projectId, {
          timestamp: new Date().toISOString(),
          level,
          message: this.cleanLogMessage(message)
        })
      }
    })
  }

  private extractAndSaveUrl(projectId: string, message: string): void {
    console.log(`[ProcessManager] Checking message for URL patterns: "${message}"`)
    
    // 检测常见的开发服务器 URL 模式
    const urlPatterns = [
      // Vite: Local: http://localhost:5173/
      /Local:\s*https?:\/\/[^\s]+/i,
      // Vue CLI: App running at: - Local: http://localhost:8080/
      /Local:\s*https?:\/\/[^\s]+/i,
      // Create React App: Local: http://localhost:3000
      /Local:\s*https?:\/\/[^\s]+/i,
      // Next.js: ready - started server on 0.0.0.0:3000, url: http://localhost:3000
      /url:\s*https?:\/\/[^\s]+/i,
      // 通用模式: http://localhost:端口
      /https?:\/\/localhost:\d+\/?/i,
      // 通用模式: http://127.0.0.1:端口
      /https?:\/\/127\.0\.0\.1:\d+\/?/i
    ]

    for (const pattern of urlPatterns) {
      const match = message.match(pattern)
      if (match) {
        let url = match[0]
        console.log(`[ProcessManager] Found URL match: "${url}" using pattern: ${pattern}`)
        
        // 清理 URL，移除前缀
        url = url.replace(/^(Local:\s*|url:\s*)/i, '').trim()
        
        // 确保 URL 以 / 结尾
        if (!url.endsWith('/')) {
          url += '/'
        }

        // 提取端口号
        const portMatch = url.match(/:(\d+)/)
        const port = portMatch ? parseInt(portMatch[1]) : undefined

        console.log(`[ProcessManager] Detected URL for project ${projectId}: ${url}, port: ${port}`)
        
        // 通过 IPC 通知主进程更新项目信息
        if (this.onUrlDetected) {
          console.log(`[ProcessManager] Calling URL detected callback for project ${projectId}`)
          this.onUrlDetected(projectId, url, port)
        } else {
          console.log(`[ProcessManager] No URL detected callback set`)
        }
        
        // 添加 URL 检测日志
        this.logManager.addLog(projectId, {
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `🌐 项目已启动，访问地址: ${url}`
        })
        
        break // 找到第一个匹配的 URL 就停止
      }
    }
    
    if (!message.match(/Local:|url:|localhost|127\.0\.0\.1/i)) {
      // 只有当消息不包含任何URL相关关键词时才跳过日志
    } else {
      console.log(`[ProcessManager] No URL pattern matched for message: "${message}"`)
    }
  }

  // 添加 URL 检测回调
  private onUrlDetected?: (projectId: string, url: string, port?: number) => void

  setUrlDetectedCallback(callback: (projectId: string, url: string, port?: number) => void): void {
    this.onUrlDetected = callback
  }

  private cleanLogMessage(message: string): string {
    // 移除 ANSI 颜色代码
    return message.replace(/\x1b\[[0-9;]*m/g, '')
  }

  private isErrorMessage(message: string): boolean {
    const errorKeywords = ['error', 'failed', 'exception', 'cannot', 'unable']
    const lowerMessage = message.toLowerCase()
    return errorKeywords.some(keyword => lowerMessage.includes(keyword))
  }

  private getEnhancedPath(): string {
    const currentPath = process.env.PATH || ''
    const fs = require('fs')
    const path = require('path')
    const os = require('os')
    
    const isWindows = process.platform === 'win32'
    const pathSeparator = isWindows ? ';' : ':'
    
    // 获取系统中所有可能的 Node.js 和包管理器路径
    const additionalPaths = []
    
    if (isWindows) {
      // Windows路径
      const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
      const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
      const appData = process.env['APPDATA'] || path.join(os.homedir(), 'AppData', 'Roaming')
      const localAppData = process.env['LOCALAPPDATA'] || path.join(os.homedir(), 'AppData', 'Local')
      
      additionalPaths.push(
        path.join(programFiles, 'nodejs'),
        path.join(programFilesX86, 'nodejs'),
        path.join(appData, 'npm'),
        path.join(localAppData, 'npm'),
        path.join(os.homedir(), 'AppData', 'Roaming', 'npm')
      )
      
      // 添加NVM for Windows路径
      const nvmPath = process.env['NVM_HOME']
      if (nvmPath) {
        additionalPaths.push(nvmPath)
      }
      
      // 添加Volta路径（Windows）
      const voltaHome = process.env['VOLTA_HOME'] || path.join(os.homedir(), '.volta')
      additionalPaths.push(path.join(voltaHome, 'bin'))
      
    } else {
      // Unix/Linux/macOS路径
      additionalPaths.push(
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/usr/bin',
        '/bin'
      )
      
      // 添加 Node.js 版本管理器的路径
      const homeDir = process.env.HOME || os.homedir()
      if (homeDir) {
        // NVM 路径
        try {
          const nvmDir = path.join(homeDir, '.nvm', 'versions', 'node')
          if (fs.existsSync(nvmDir)) {
            const versions = fs.readdirSync(nvmDir)
            for (const version of versions) {
              const binPath = path.join(nvmDir, version, 'bin')
              if (fs.existsSync(binPath)) {
                additionalPaths.push(binPath)
              }
            }
          }
        } catch (error) {
          console.warn('[ProcessManager] Failed to resolve NVM paths:', error)
        }
        
        // Volta 路径
        additionalPaths.push(`${homeDir}/.volta/bin`)
        
        // FNM 路径
        try {
          const fnmDir = path.join(homeDir, '.fnm', 'node-versions')
          if (fs.existsSync(fnmDir)) {
            const versions = fs.readdirSync(fnmDir)
            for (const version of versions) {
              const binPath = path.join(fnmDir, version, 'installation', 'bin')
              if (fs.existsSync(binPath)) {
                additionalPaths.push(binPath)
              }
            }
          }
        } catch (error) {
          console.warn('[ProcessManager] Failed to resolve FNM paths:', error)
        }
      }
    }
    
    // 去重并过滤存在的路径
    const uniquePaths = [...new Set([...currentPath.split(pathSeparator), ...additionalPaths])]
      .filter(pathStr => {
        if (!pathStr) return false
        try {
          return fs.existsSync(pathStr)
        } catch {
          return false
        }
      })
    
    const enhancedPath = uniquePaths.join(pathSeparator)
    console.log(`[ProcessManager] Enhanced PATH: ${enhancedPath}`)
    return enhancedPath
  }
}