import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { randomUUID } from 'crypto'

export interface Project {
  id: string
  name: string
  path: string
  packageManager: 'npm' | 'pnpm' | 'yarn'
  startCommand: string
  status: 'stopped' | 'running' | 'error'
  port?: number
  pid?: number
  url?: string  // 添加 URL 字段
  autoRefreshLogs?: boolean  // 添加自动刷新日志字段
  createdAt: string
  updatedAt: string
}

export interface CreateProjectData {
  name: string
  path: string
  packageManager: 'npm' | 'pnpm' | 'yarn'
  startCommand?: string
}

interface ProjectsData {
  projects: Project[]
}

export class ProjectManager {
  private projectsFilePath: string
  private projects: Project[] = []

  constructor() {
    this.projectsFilePath = join(app.getPath('userData'), 'projects.json')
    this.loadProjects()
  }

  private loadProjects(): void {
    try {
      if (existsSync(this.projectsFilePath)) {
        const data = readFileSync(this.projectsFilePath, 'utf-8')
        const projectsData: ProjectsData = JSON.parse(data)
        this.projects = projectsData.projects || []
      } else {
        this.projects = []
        this.saveProjects()
      }
    } catch (error) {
      console.error('Failed to load projects:', error)
      this.projects = []
    }
  }

  private saveProjects(): void {
    console.log('[ProjectManager] saveProjects called, projects to save:', this.projects.length)
    console.log('[ProjectManager] Projects data:', this.projects)
    console.log('[ProjectManager] Saving to file:', this.projectsFilePath)
    try {
      const data: ProjectsData = { projects: this.projects }
      writeFileSync(this.projectsFilePath, JSON.stringify(data, null, 2))
      console.log('[ProjectManager] Successfully saved projects to file')
    } catch (error) {
      console.error('[ProjectManager] Failed to save projects:', error)
    }
  }

  getAllProjects(): Project[] {
    console.log('[ProjectManager] getAllProjects called, returning:', this.projects.length, 'projects')
    return [...this.projects]
  }

  getProject(id: string): Project | undefined {
    return this.projects.find(project => project.id === id)
  }

  createProject(projectData: CreateProjectData): Project {
    console.log('[ProjectManager] createProject called with data:', projectData)
    const now = new Date().toISOString()
    
    // 检测默认启动命令
    let startCommand = projectData.startCommand || 'dev'
    
    // 尝试读取 package.json 来检测可用的脚本
    try {
      const packageJsonPath = join(projectData.path, 'package.json')
      console.log('[ProjectManager] Checking package.json at:', packageJsonPath)
      if (existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
        const scripts = packageJson.scripts || {}
        console.log('[ProjectManager] Found scripts:', scripts)
        
        // 优先级：dev > start > serve
        if (scripts.dev) {
          startCommand = 'dev'
        } else if (scripts.start) {
          startCommand = 'start'
        } else if (scripts.serve) {
          startCommand = 'serve'
        }
      } else {
        console.log('[ProjectManager] package.json not found at path')
      }
    } catch (error) {
      console.warn('[ProjectManager] Failed to read package.json:', error)
    }

    const project: Project = {
      id: randomUUID(),
      name: projectData.name,
      path: projectData.path,
      packageManager: projectData.packageManager,
      startCommand,
      status: 'stopped',
      createdAt: now,
      updatedAt: now
    }

    console.log('[ProjectManager] Created project object:', project)
    console.log('[ProjectManager] Current projects count before add:', this.projects.length)
    
    this.projects.push(project)
    console.log('[ProjectManager] Current projects count after add:', this.projects.length)
    
    console.log('[ProjectManager] Calling saveProjects...')
    this.saveProjects()
    console.log('[ProjectManager] saveProjects completed')
    
    return project
  }

  updateProject(id: string, updates: Partial<Project>): Project | null {
    const projectIndex = this.projects.findIndex(project => project.id === id)
    if (projectIndex === -1) return null

    this.projects[projectIndex] = {
      ...this.projects[projectIndex],
      ...updates,
      updatedAt: new Date().toISOString()
    }

    this.saveProjects()
    return this.projects[projectIndex]
  }

  // 新增：重置所有项目状态为停止状态（应用启动时调用）
  resetAllProjectsToStopped(): void {
    console.log('[ProjectManager] Resetting all projects to stopped status')
    let hasChanges = false
    
    this.projects.forEach(project => {
      if (project.status === 'running' || project.pid || project.url) {
        console.log('[ProjectManager] Resetting project:', project.id, project.name)
        project.status = 'stopped'
        project.pid = undefined
        project.url = undefined  // 清除 URL
        project.port = undefined  // 清除端口
        project.updatedAt = new Date().toISOString()
        hasChanges = true
      }
    })
    
    if (hasChanges) {
      console.log('[ProjectManager] Saving updated project states')
      this.saveProjects()
    } else {
      console.log('[ProjectManager] No projects needed status reset')
    }
  }

  deleteProject(id: string): boolean {
    const projectIndex = this.projects.findIndex(project => project.id === id)
    
    if (projectIndex === -1) {
      return false
    }

    this.projects.splice(projectIndex, 1)
    this.saveProjects()
    
    return true
  }

  // 检测项目的包管理器
  detectPackageManager(projectPath: string): 'npm' | 'pnpm' | 'yarn' {
    if (existsSync(join(projectPath, 'pnpm-lock.yaml'))) {
      return 'pnpm'
    }
    if (existsSync(join(projectPath, 'yarn.lock'))) {
      return 'yarn'
    }
    return 'npm'
  }

  // 验证项目路径
  validateProjectPath(projectPath: string): boolean {
    return existsSync(join(projectPath, 'package.json'))
  }
}