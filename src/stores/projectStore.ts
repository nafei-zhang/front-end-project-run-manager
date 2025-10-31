import { create } from 'zustand'

interface Project {
  id: string
  name: string
  path: string
  startCommand: string
  status: 'stopped' | 'running' | 'error'
  port?: number
  pid?: number
  url?: string  // 添加 URL 字段
  packageManager?: 'npm' | 'pnpm' | 'yarn'  // 添加包管理器字段
  autoRefreshLogs?: boolean  // 添加自动刷新日志字段
  createdAt: string
  updatedAt: string
}

interface CreateProjectData {
  name: string
  path: string
  packageManager?: 'npm' | 'pnpm' | 'yarn'
  startCommand?: string
}

interface ProjectStore {
  projects: Project[]
  loading: boolean
  error: string | null
  
  // Actions
  loadProjects: () => Promise<void>
  createProject: (data: CreateProjectData) => Promise<Project | null>
  updateProject: (id: string, updates: Partial<Project>) => Promise<Project | null>
  deleteProject: (id: string) => Promise<boolean>
  startProject: (id: string) => Promise<boolean>
  stopProject: (id: string) => Promise<boolean>
  refreshProjectStatus: (id: string) => Promise<void>
  refreshAllProjects: () => Promise<void>
  toggleAutoRefreshLogs: (id: string) => Promise<void>
}

// 检测是否在Electron环境中
const isElectron = () => {
  return typeof window !== 'undefined' && window.electronAPI !== undefined
}

// 模拟项目数据（用于浏览器环境测试）
const mockProjects: Project[] = [
  {
    id: 'be603f12-b3b3-41b8-9236-77a0ea4b0fa3',
    name: 'vite-app',
    path: '/Users/about/Downloads/auto/vite-app',
    packageManager: 'pnpm',
    startCommand: 'pnpm run dev',
    status: 'stopped',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  },
  {
    id: 'test-project-2',
    name: 'react-app',
    path: '/Users/about/Downloads/auto/react-app',
    packageManager: 'npm',
    startCommand: 'npm start',
    status: 'running',
    port: 3000,
    pid: 12345,
    url: 'http://localhost:3000',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  }
]

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  loading: false,
  error: null,

  loadProjects: async () => {
    console.log('loadProjects called') // 添加调试日志
    set({ loading: true, error: null })
    try {
      if (isElectron()) {
        console.log('Calling electronAPI.projects.getAll()') // 添加调试日志
        const projects = await window.electronAPI.projects.getAll()
        console.log('Projects loaded:', projects) // 添加调试日志
        set({ projects, loading: false })
      } else {
        console.log('Running in browser mode, using mock data') // 添加调试日志
        // 在浏览器环境中使用模拟数据
        set({ projects: mockProjects, loading: false })
      }
    } catch (error) {
      console.error('Error loading projects:', error) // 添加调试日志
      const errorMessage = error instanceof Error ? error.message : 'Failed to load projects'
      set({ error: errorMessage, loading: false })
    }
  },

  createProject: async (data: CreateProjectData) => {
    console.log('[ProjectStore] createProject called with data:', data)
    set({ loading: true, error: null })
    try {
      if (isElectron()) {
        console.log('[ProjectStore] Calling electronAPI.projects.create')
        const project = await window.electronAPI.projects.create({
          ...data,
          packageManager: data.packageManager || 'npm'
        })
        console.log('[ProjectStore] Project created:', project)
        
        if (project) {
          const { projects } = get()
          set({ projects: [...projects, project], loading: false })
          return project
        } else {
          set({ error: 'Failed to create project', loading: false })
        }
      } else {
        console.log('[ProjectStore] Running in browser mode, simulating create project')
        // 在浏览器环境中模拟创建项目
        const newProject: Project = {
          id: Date.now().toString(),
          ...data,
          startCommand: data.startCommand || 'npm start',
          status: 'stopped',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }
        
        const { projects } = get()
        set({ projects: [...projects, newProject], loading: false })
        return newProject
      }
    } catch (error) {
      console.error('[ProjectStore] Error creating project:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to create project'
      set({ error: errorMessage, loading: false })
    }
    return null
  },

  updateProject: async (id: string, updates: Partial<Project>) => {
    console.log('[ProjectStore] updateProject called for id:', id, 'with updates:', updates)
    set({ loading: true, error: null })
    try {
      if (isElectron()) {
        console.log('[ProjectStore] Calling electronAPI.projects.update')
        const project = await window.electronAPI.projects.update(id, updates)
        console.log('[ProjectStore] Project updated:', project)
        
        if (project) {
          const { projects } = get()
          const updatedProjects = projects.map(p => p.id === id ? project : p)
          set({ projects: updatedProjects, loading: false })
          return project
        } else {
          set({ error: 'Failed to update project', loading: false })
        }
      } else {
        console.log('[ProjectStore] Running in browser mode, simulating update project')
        // 在浏览器环境中模拟更新项目
        const { projects } = get()
        const updatedProjects = projects.map(p => 
          p.id === id ? { ...p, ...updates, updatedAt: new Date().toISOString() } : p
        )
        set({ projects: updatedProjects, loading: false })
        const updatedProject = updatedProjects.find(p => p.id === id)
        return updatedProject || null
      }
    } catch (error) {
      console.error('[ProjectStore] Error updating project:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to update project'
      set({ error: errorMessage, loading: false })
    }
    return null
  },

  deleteProject: async (id: string) => {
    console.log('[ProjectStore] deleteProject called for id:', id)
    set({ loading: true, error: null })
    try {
      if (isElectron()) {
        console.log('[ProjectStore] Calling electronAPI.projects.delete')
        const success = await window.electronAPI.projects.delete(id)
        console.log('[ProjectStore] Delete project result:', success)
        
        if (success) {
          const { projects } = get()
          const filteredProjects = projects.filter(p => p.id !== id)
          set({ projects: filteredProjects, loading: false })
          return true
        } else {
          set({ error: 'Failed to delete project', loading: false })
        }
      } else {
        console.log('[ProjectStore] Running in browser mode, simulating delete project')
        // 在浏览器环境中模拟删除项目
        const { projects } = get()
        const filteredProjects = projects.filter(p => p.id !== id)
        set({ projects: filteredProjects, loading: false })
        return true
      }
    } catch (error) {
      console.error('[ProjectStore] Error deleting project:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete project'
      set({ error: errorMessage, loading: false })
    }
    return false
  },

  startProject: async (id: string) => {
    console.log('[ProjectStore] startProject called for id:', id)
    try {
      if (isElectron()) {
        console.log('[ProjectStore] Calling electronAPI.projects.start')
        const result = await window.electronAPI.projects.start(id)
        console.log('[ProjectStore] Start project result:', result)
        
        if (result && result.success) {
          // 直接更新本地状态
          const { projects } = get()
          const updatedProjects = projects.map(p => 
            p.id === id ? { ...p, status: 'running' as const, pid: result.pid } : p
          )
          set({ projects: updatedProjects })
          return true
        } else {
          set({ error: 'Failed to start project' })
        }
      } else {
        console.log('[ProjectStore] Running in browser mode, simulating start project')
        // 在浏览器环境中模拟启动项目
        const { projects } = get()
        const updatedProjects = projects.map(p => 
          p.id === id ? { 
            ...p, 
            status: 'running' as const, 
            pid: Math.floor(Math.random() * 10000), 
            url: 'http://localhost:3000', 
            port: 3000 
          } : p
        )
        set({ projects: updatedProjects })
        return true
      }
      return false
    } catch (error) {
      console.error('[ProjectStore] Error starting project:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to start project'
      set({ error: errorMessage })
      return false
    }
  },

  stopProject: async (id: string) => {
    console.log('[ProjectStore] stopProject called for id:', id)
    try {
      if (isElectron()) {
        console.log('[ProjectStore] Calling electronAPI.projects.stop')
        const success = await window.electronAPI.projects.stop(id)
        console.log('[ProjectStore] Stop project result:', success)
        
        if (success) {
          console.log('[ProjectStore] Project stopped successfully, updating status')
          // 直接更新本地状态，避免调用updateProject导致loading状态变化
          const { projects } = get()
          console.log('[ProjectStore] Current projects before update:', projects.map(p => ({ id: p.id, status: p.status })))
          
          const updatedProjects = projects.map(p => 
            p.id === id ? { ...p, status: 'stopped' as const, pid: undefined, url: undefined, port: undefined, updatedAt: new Date().toISOString() } : p
          )
          
          console.log('[ProjectStore] Updated projects:', updatedProjects.map(p => ({ id: p.id, status: p.status })))
          
          // 强制触发状态更新，确保React组件重新渲染
          set({ projects: updatedProjects, error: null })
          
          console.log('[ProjectStore] Project status updated to stopped')
          
          // 验证状态是否真的更新了
          const { projects: newProjects } = get()
          const updatedProject = newProjects.find(p => p.id === id)
          console.log('[ProjectStore] Verification - updated project status:', updatedProject?.status)
          
          return true
        } else {
          console.error('[ProjectStore] Failed to stop project')
          set({ error: 'Failed to stop project' })
        }
      } else {
        console.log('[ProjectStore] Running in browser mode, simulating stop project')
        // 在浏览器环境中模拟停止项目
        const { projects } = get()
        console.log('[ProjectStore] Current projects before update:', projects.map(p => ({ id: p.id, status: p.status })))
        
        const updatedProjects = projects.map(p => 
          p.id === id ? { ...p, status: 'stopped' as const, pid: undefined, url: undefined, port: undefined, updatedAt: new Date().toISOString() } : p
        )
        
        console.log('[ProjectStore] Updated projects:', updatedProjects.map(p => ({ id: p.id, status: p.status })))
        
        // 强制触发状态更新，确保React组件重新渲染
        set({ projects: updatedProjects, error: null })
        
        console.log('[ProjectStore] Project status updated to stopped (simulated)')
        
        // 验证状态是否真的更新了
        const { projects: newProjects } = get()
        const updatedProject = newProjects.find(p => p.id === id)
        console.log('[ProjectStore] Verification - updated project status:', updatedProject?.status)
        
        return true
      }
      return false
    } catch (error) {
      console.error('[ProjectStore] Error stopping project:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to stop project'
      set({ error: errorMessage })
      return false
    }
  },

  refreshProjectStatus: async (id: string) => {
    console.log('[ProjectStore] refreshProjectStatus called for id:', id)
    try {
      if (isElectron()) {
        console.log('[ProjectStore] Calling electronAPI.projects.getStatus')
        const status = await window.electronAPI.projects.getStatus(id)
        console.log('[ProjectStore] Received status:', status)
        const { projects } = get()
        const updatedProjects = projects.map(p => 
          p.id === id ? { ...p, status: status as 'stopped' | 'running' | 'error', updatedAt: new Date().toISOString() } : p
        )
        set({ projects: updatedProjects })
      } else {
        console.log('[ProjectStore] Running in browser mode, simulating status refresh')
        // 在浏览器环境中，模拟状态刷新
        const { projects } = get()
        const updatedProjects = projects.map(p => 
          p.id === id ? { ...p, updatedAt: new Date().toISOString() } : p
        )
        set({ projects: updatedProjects })
      }
    } catch (error) {
      console.error('[ProjectStore] Error refreshing project status:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh project status'
      set({ error: errorMessage })
    }
  },

  refreshAllProjects: async () => {
    console.log('[ProjectStore] refreshAllProjects called')
    set({ loading: true, error: null })
    try {
      if (isElectron()) {
        console.log('[ProjectStore] Calling electronAPI.projects.getAll')
        const projects = await window.electronAPI.projects.getAll()
        console.log('[ProjectStore] Received projects:', projects)
        set({ projects, loading: false })
      } else {
        console.log('[ProjectStore] Running in browser mode, simulating refresh')
        // 在浏览器环境中，模拟刷新延迟
        await new Promise(resolve => setTimeout(resolve, 500))
        // 模拟状态更新
        const { projects } = get()
        const updatedProjects = projects.map(p => ({
          ...p,
          updatedAt: new Date().toISOString()
        }))
        set({ projects: updatedProjects, loading: false })
      }
    } catch (error) {
      console.error('[ProjectStore] Error refreshing all projects:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to refresh projects'
      set({ error: errorMessage, loading: false })
    }
  },

  toggleAutoRefreshLogs: async (id: string) => {
    console.log('[ProjectStore] toggleAutoRefreshLogs called for project:', id)
    try {
      const { projects } = get()
      const project = projects.find(p => p.id === id)
      
      if (!project) {
        console.error('[ProjectStore] Project not found:', id)
        return
      }

      const newAutoRefreshState = !project.autoRefreshLogs
      console.log('[ProjectStore] Toggling autoRefreshLogs from', project.autoRefreshLogs, 'to', newAutoRefreshState)

      if (isElectron()) {
        // 在Electron环境中，通过API更新项目
        const updatedProject = await window.electronAPI.projects.update(id, { 
          autoRefreshLogs: newAutoRefreshState 
        })
        if (updatedProject) {
          const updatedProjects = projects.map(p => 
            p.id === id ? updatedProject : p
          )
          set({ projects: updatedProjects })
        }
      } else {
        // 在浏览器环境中，直接更新本地状态
        const updatedProjects = projects.map(p => 
          p.id === id ? { ...p, autoRefreshLogs: newAutoRefreshState, updatedAt: new Date().toISOString() } : p
        )
        set({ projects: updatedProjects })
      }
    } catch (error) {
      console.error('[ProjectStore] Error toggling auto refresh logs:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to toggle auto refresh logs'
      set({ error: errorMessage })
    }
  }
}))

export type { Project, CreateProjectData }