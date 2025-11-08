import React, { useEffect, useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { useToast } from '../hooks/useToast'
import { 
  Play, 
  Square, 
  Plus, 
  RefreshCw, 
  AlertCircle,
  CheckCircle,
  Clock,
  FolderOpen,
  Edit,
  Trash2,
  Search,
  Filter,
  Loader2
} from 'lucide-react'
import ProjectForm from '../components/ProjectForm'
import ConfirmDialog from '../components/ConfirmDialog'
import { useTranslation } from 'react-i18next'

const Projects: React.FC = () => {
  const { showToast } = useToast()
  const { t } = useTranslation()
  const { 
    projects, 
    loading, 
    error, 
    loadProjects, 
    startProject, 
    stopProject,
    deleteProject,
    refreshProjectStatus,
    refreshAllProjects,
    toggleAutoRefreshLogs
  } = useProjectStore()

  const [showForm, setShowForm] = useState(false)
  const [editingProject, setEditingProject] = useState<any>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'running' | 'stopped' | 'error'>('all')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [stopConfirm, setStopConfirm] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
  const [bulkStarting, setBulkStarting] = useState(false)
  const [bulkStopConfirmOpen, setBulkStopConfirmOpen] = useState(false)
  const SELECTION_STORAGE_KEY = 'selectedProjectIds'

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  // 加载并同步选中集合（持久化）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(SELECTION_STORAGE_KEY)
      if (raw) {
        const ids: string[] = JSON.parse(raw)
        setSelectedProjects(new Set(ids))
      }
    } catch (e) {
      console.warn('[Projects] Failed to load selection from storage:', e)
    }
  }, [])

  // 当项目列表变化时，清理不存在的选中项并保存
  useEffect(() => {
    setSelectedProjects(prev => {
      const existingIds = new Set(projects.map(p => p.id))
      const next = new Set(Array.from(prev).filter(id => existingIds.has(id)))
      try {
        localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(Array.from(next)))
      } catch (e) {
        console.warn('[Projects] Failed to persist selection to storage:', e)
      }
      return next
    })
  }, [projects])

  const handleCreateProject = () => {
    console.log('handleCreateProject called') // 添加调试日志
    setEditingProject(null)
    setShowForm(true)
    console.log('showForm set to true') // 添加调试日志
  }

  const handleEditProject = (project: any) => {
    console.log('handleEditProject called with project:', project) // 添加调试日志
    setEditingProject(project)
    setShowForm(true)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshAllProjects()
      console.log('Projects refreshed successfully')
      showToast('success', t('projects.refreshSuccess'), t('projects.refreshSuccessDesc'))
    } catch (error) {
      console.error('Error refreshing projects:', error)
      showToast('error', t('projects.refreshError'), t('projects.refreshErrorDesc'))
    } finally {
      setRefreshing(false)
    }
  }

  const handleOpenFolder = async (projectPath: string) => {
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.system.openFolder(projectPath)
        if (!result.success) {
          console.error('Failed to open folder:', result.error)
          // 可以在这里添加用户提示
        }
      }
    } catch (error) {
      console.error('Error opening folder:', error)
    }
  }

  const handleDeleteProject = async (projectId: string) => {
    if (deleteConfirm === projectId) {
      await deleteProject(projectId)
      setDeleteConfirm(null)
    } else {
      setDeleteConfirm(projectId)
      // 3秒后自动取消确认
      setTimeout(() => {
        setDeleteConfirm(null)
      }, 3000)
    }
  }

  const handleStartProject = async (projectId: string) => {
    await startProject(projectId)
  }

  const handleStopProject = async (projectId: string) => {
    setStopConfirm(projectId)
  }

  // 选择相关
  const isSelected = (projectId: string) => selectedProjects.has(projectId)
  const toggleSelection = (projectId: string) => {
    setSelectedProjects(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      try {
        localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(Array.from(next)))
      } catch (e) {
        console.warn('[Projects] Failed to persist selection to storage:', e)
      }
      return next
    })
  }

  // 一键启动所选项目
  const startSelectedProjects = async () => {
    if (selectedProjects.size === 0) return
    setBulkStarting(true)
    try {
      const ids = Array.from(selectedProjects)
      const startable = ids.filter(id => {
        const p = projects.find(p => p.id === id)
        return p && p.status === 'stopped'
      })
      if (startable.length === 0) {
        // 标题使用统一的批量启动结果，内容提示无可启动项
        showToast('info', t('projects.bulkStartResult'), t('projects.noSelectableProjects'))
        return
      }
      let success = 0
      let failed = 0
      for (const id of startable) {
        const ok = await startProject(id)
        if (ok) success++
        else failed++
      }
      showToast('success', t('projects.bulkStartResult'), t('projects.bulkStartDesc', { success, failed }))
    } catch (e) {
      console.error('[Projects] Bulk start error:', e)
      showToast('error', t('projects.startError'), t('projects.refreshErrorDesc'))
    } finally {
      setBulkStarting(false)
      // 保留选中状态，不再自动清空
    }
  }

  // 一键停止所选正在运行的项目
  const [bulkStopping, setBulkStopping] = useState(false)
  const stopSelectedProjects = async () => {
    if (selectedProjects.size === 0) return
    setBulkStopping(true)
    try {
      const ids = Array.from(selectedProjects)
      const stoppable = ids.filter(id => {
        const p = projects.find(p => p.id === id)
        return p && p.status === 'running'
      })
      if (stoppable.length === 0) {
        showToast('info', t('projects.bulkStopResult', { defaultValue: '批量停止结果' }), t('projects.noRunningSelected', { defaultValue: '没有正在运行的选中项目' }))
        return
      }
      // 并行停止所有可停止的项目
      const results = await Promise.allSettled(stoppable.map(id => stopProject(id)))
      let success = 0
      let failed = 0
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) success++
        else failed++
      }
      // 确认状态最新，避免渲染滞后
      await refreshAllProjects()
      showToast(success > 0 ? 'success' : 'info', t('projects.bulkStopResult', { defaultValue: '批量停止结果' }), t('projects.bulkStopDesc', { success, failed, defaultValue: '成功停止 {{success}} 个，失败 {{failed}} 个' }))
    } catch (e) {
      console.error('[Projects] Bulk stop error:', e)
      showToast('error', t('projects.startError'), t('projects.refreshErrorDesc'))
    } finally {
      setBulkStopping(false)
    }
  }

  // 计算按钮状态：有选中正在运行 -> 显示一键停止，否则显示一键启动
  const hasRunningSelected = projects.some(p => selectedProjects.has(p.id) && p.status === 'running')
  const runningSelectedCount = projects.filter(p => selectedProjects.has(p.id) && p.status === 'running').length

  const confirmStopProject = async () => {
    console.log('[Projects] confirmStopProject called')
    if (stopConfirm) {
      console.log('[Projects] Stopping project:', stopConfirm)
      const success = await stopProject(stopConfirm)
      console.log('[Projects] Stop project result:', success)
      if (success) {
        console.log('[Projects] Project stopped successfully, refreshing status and list')
        // 先刷新该项目状态，再刷新全量，避免局部未更新导致按钮不切换
        await refreshProjectStatus(stopConfirm)
        await refreshAllProjects()
        setStopConfirm(null)
      } else {
        console.error('[Projects] Failed to stop project, keeping modal open')
      }
    }
  }

  const cancelStopProject = () => {
    setStopConfirm(null)
  }

  const handleToggleAutoRefreshLogs = async (projectId: string) => {
    try {
      await toggleAutoRefreshLogs(projectId)
      const project = projects.find(p => p.id === projectId)
      const newState = !project?.autoRefreshLogs
      showToast(
        'success', 
        t('projects.autoRefreshToggled'), 
        newState ? t('projects.autoRefreshEnabled') : t('projects.autoRefreshDisabled')
      )
    } catch (error) {
      console.error('Error toggling auto refresh logs:', error)
      showToast('error', t('projects.autoRefreshError'), t('projects.autoRefreshErrorDesc'))
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />
      default:
        return <Clock className="w-5 h-5 text-gray-400" />
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'running':
        return t('projects.running')
      case 'error':
        return t('projects.error')
      default:
        return t('projects.stopped')
    }
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400'
    }
  }

  // 过滤项目
  const filteredProjects = projects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         project.path.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || project.status === statusFilter
    return matchesSearch && matchesStatus
  })

  if (loading && projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center space-x-2">
          <div className="loading-spinner w-6 h-6"></div>
          <span>{t('projects.loadingProjects')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 pb-20">
      {/* 页面标题和操作 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('projects.title')}</h1>
          <p className="text-muted-foreground">{t('projects.subtitle')}</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className={`
              group relative flex items-center space-x-2 px-4 py-2 
              bg-secondary text-secondary-foreground rounded-lg 
              transition-all duration-300 ease-in-out
              hover:bg-secondary/80 hover:scale-105 hover:shadow-lg
              active:scale-95 active:shadow-sm
              disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
              ${refreshing ? 'animate-pulse' : ''}
            `}
          >
            <RefreshCw 
              className={`
                w-4 h-4 transition-all duration-300
                ${refreshing ? 'animate-spin text-blue-500' : 'group-hover:rotate-180'}
                group-active:scale-110
              `} 
            />
            <span className="font-medium">{t('projects.refreshStatus')}</span>
            {/* 点击波纹效果 */}
            <div className="absolute inset-0 rounded-lg bg-white/20 opacity-0 group-active:opacity-100 group-active:animate-ping pointer-events-none"></div>
            {/* 加载状态指示器 */}
            {refreshing && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full animate-bounce"></div>
            )}
          </button>
          <button
            onClick={handleCreateProject}
            className="flex items-center space-x-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{t('projects.addProject')}</span>
          </button>
        </div>
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-red-700 dark:text-red-300">{error}</span>
          </div>
        </div>
      )}

      {/* 搜索和过滤 */}
      <div className="flex items-center space-x-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('projects.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">{t('projects.allStatus')}</option>
            <option value="running">{t('projects.running')}</option>
            <option value="stopped">{t('projects.stopped')}</option>
            <option value="error">{t('projects.error')}</option>
          </select>
        </div>
      </div>

      {/* 项目列表 */}
      {filteredProjects.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <FolderOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">
            {projects.length === 0 ? t('projects.noProjects') : t('projects.noProjects')}
          </h3>
          <p className="text-muted-foreground mb-6">
            {projects.length === 0 
              ? t('projects.noProjectsDesc') 
              : t('projects.noMatchingProjects')
            }
          </p>
          {projects.length === 0 && (
            <button
              onClick={handleCreateProject}
              className="flex items-center space-x-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors mx-auto"
            >
              <Plus className="w-5 h-5" />
              <span>{t('projects.addProject')}</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredProjects.map((project) => (
            <div
              key={project.id}
              className="project-card bg-card border border-border rounded-lg p-6 hover:shadow-lg transition-all"
            >
              {/* 项目头部 */}
              <div className="flex items-start justify-between mb-3">
                {/* 选择复选框 */}
                <div className="mr-3 mt-0.5">
                  <input
                    type="checkbox"
                    checked={isSelected(project.id)}
                    onChange={() => toggleSelection(project.id)}
                    className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary focus:ring-2"
                    aria-label={t('projects.selectProject') || 'Select project'}
                  />
                </div>
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    {getStatusIcon(project.status)}
                    <h3 className="text-base font-semibold text-foreground truncate">
                      {project.name}
                    </h3>
                  </div>
                  <div className="flex items-center space-x-2 mb-1">
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadgeColor(project.status)}`}>
                      {getStatusText(project.status)}
                    </span>
                    <span className="px-2 py-1 text-xs bg-secondary text-secondary-foreground rounded">
                      {project.packageManager}
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleEditProject(project)}
                    className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
                    title={t('projects.editProject')}
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteProject(project.id)}
                    className={`p-2 rounded transition-colors ${
                      deleteConfirm === project.id
                        ? 'text-red-600 bg-red-100 dark:bg-red-900/20'
                        : 'text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                    }`}
                    title={deleteConfirm === project.id ? t('projects.confirmDelete') : t('projects.deleteProject')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* 项目信息 */}
              <div className="space-y-1 mb-3">
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">{t('projects.path')}</span>
                  <p className="truncate mt-0.5" title={project.path}>
                    {project.path}
                  </p>
                </div>
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">{t('projects.command')}</span>
                  <p className="mt-0.5">
                    {project.startCommand}
                  </p>
                </div>
                {project.pid && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">{t('projects.processId')}</span> {project.pid}
                  </div>
                )}
                {project.url && (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium">{t('projects.accessUrl')}</span> 
                    <a 
                      href={project.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-500 hover:text-blue-600 underline ml-1"
                    >
                      {project.url}
                    </a>
                  </div>
                )}
              </div>

              {/* 自动刷新日志复选框 */}
              <div className="flex items-center space-x-2 mb-3 p-2 bg-accent/30 rounded-lg">
                <input
                  type="checkbox"
                  id={`auto-refresh-${project.id}`}
                  checked={project.autoRefreshLogs || false}
                  onChange={() => handleToggleAutoRefreshLogs(project.id)}
                  className="w-4 h-4 text-primary bg-background border-border rounded focus:ring-primary focus:ring-2"
                />
                <label 
                  htmlFor={`auto-refresh-${project.id}`}
                  className="text-sm text-foreground cursor-pointer select-none"
                >
                  {t('projects.autoRefreshLogs')}
                </label>
              </div>

              {/* 操作按钮 */}
              <div className="flex items-center space-x-2">
                {project.status === 'running' ? (
                  <button
                    onClick={() => handleStopProject(project.id)}
                    className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                  >
                    <Square className="w-4 h-4" />
                    <span>{t('projects.stop')}</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleStartProject(project.id)}
                    className="flex-1 flex items-center justify-center space-x-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
                  >
                    <Play className="w-4 h-4" />
                    <span>{t('projects.start')}</span>
                  </button>
                )}
                <button
                  onClick={() => handleOpenFolder(project.path)}
                  className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
                  title={t('projects.openInFileManager')}
                >
                  <FolderOpen className="w-4 h-4" />
                </button>
              </div>

              {/* 删除确认提示 */}
              {deleteConfirm === project.id && (
                <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {t('projects.deleteConfirmMessage')}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 固定底栏：一键启动/停止 */}
      <div className="fixed inset-x-0 bottom-0 z-40 bg-card border-t border-border shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-end">
          {hasRunningSelected ? (
            <button
              onClick={() => setBulkStopConfirmOpen(true)}
              disabled={bulkStopping}
              className="flex items-center space-x-2 px-5 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkStopping ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              <span className="font-medium">{t('projects.bulkStop', { defaultValue: '一键停止' })}</span>
              {selectedProjects.size > 0 && (
                <span className="text-xs opacity-80">({selectedProjects.size})</span>
              )}
            </button>
          ) : (
            <button
              onClick={startSelectedProjects}
              disabled={bulkStarting || selectedProjects.size === 0}
              className="flex items-center space-x-2 px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {bulkStarting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              <span className="font-medium">{t('projects.bulkStart')}</span>
              {selectedProjects.size > 0 && (
                <span className="text-xs opacity-80">({selectedProjects.size})</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 项目表单模态框 */}
      {showForm && (
        <ProjectForm
          project={editingProject}
          onClose={() => {
            setShowForm(false)
            setEditingProject(null)
          }}
          onSuccess={() => {
            setShowForm(false)
            setEditingProject(null)
            loadProjects()
          }}
        />
      )}

      {/* 停止项目确认对话框 */}
      <ConfirmDialog
        isOpen={!!stopConfirm}
        title={t('projects.stopProject')}
        message={t('projects.stopProjectMessage')}
        confirmText={t('projects.confirm')}
        cancelText={t('projects.cancel')}
        onConfirm={confirmStopProject}
        onCancel={cancelStopProject}
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />

      {/* 批量停止确认对话框 */}
      <ConfirmDialog
        isOpen={bulkStopConfirmOpen}
        title={t('projects.bulkStopConfirmTitle', { defaultValue: '确认批量停止' })}
        message={t('projects.bulkStopConfirmMessage', { count: runningSelectedCount, defaultValue: `确定要停止选中的正在运行项目吗？（${runningSelectedCount} 个）` })}
        confirmText={t('projects.confirm', { defaultValue: '确认' })}
        cancelText={t('projects.cancel', { defaultValue: '取消' })}
        onConfirm={() => { setBulkStopConfirmOpen(false); stopSelectedProjects() }}
        onCancel={() => setBulkStopConfirmOpen(false)}
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
    </div>
  )
}

export default Projects