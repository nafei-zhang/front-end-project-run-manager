import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useProjectStore } from '../stores/projectStore'
import { useLogStore } from '../stores/logStore'
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
  Terminal,
  Loader2
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import ConfirmDialog from '../components/ConfirmDialog'

const Dashboard: React.FC = () => {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { 
    projects, 
    loading, 
    error, 
    loadProjects, 
    startProject, 
    stopProject,
    refreshProjectStatus,
    refreshAllProjects,
    toggleAutoRefreshLogs
  } = useProjectStore()
  
  const { setActiveProject } = useLogStore()
  const [refreshing, setRefreshing] = useState(false)
  const [stopConfirm, setStopConfirm] = useState<string | null>(null)
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set())
  const SELECTION_STORAGE_KEY = 'selectedProjectIds'
  const [bulkStarting, setBulkStarting] = useState(false)
  const [bulkStopConfirmOpen, setBulkStopConfirmOpen] = useState(false)

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
      console.warn('[Dashboard] Failed to load selection from storage:', e)
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
        console.warn('[Dashboard] Failed to persist selection to storage:', e)
      }
      return next
    })
  }, [projects])

  const handleStartProject = async (projectId: string) => {
    const success = await startProject(projectId)
    if (success) {
      setActiveProject(projectId)
    }
  }

  const isSelected = (projectId: string) => selectedProjects.has(projectId)
  const toggleSelection = (projectId: string) => {
    setSelectedProjects(prev => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      try {
        localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(Array.from(next)))
      } catch (e) {
        console.warn('[Dashboard] Failed to persist selection to storage:', e)
      }
      return next
    })
  }

  const handleStopProject = async (projectId: string) => {
    setStopConfirm(projectId)
  }

  const confirmStopProject = async () => {
    console.log('[Dashboard] confirmStopProject called')
    if (stopConfirm) {
      console.log('[Dashboard] Stopping project:', stopConfirm)
      const success = await stopProject(stopConfirm)
      console.log('[Dashboard] Stop project result:', success)
      if (success) {
        console.log('[Dashboard] Project stopped successfully, refreshing status and list')
        // 先刷新该项目状态，再刷新全量，避免局部未更新导致按钮不切换
        await refreshProjectStatus(stopConfirm)
        await refreshAllProjects()
        setStopConfirm(null)
      } else {
        console.error('[Dashboard] Failed to stop project, keeping modal open')
      }
    }
  }

  const cancelStopProject = () => {
    setStopConfirm(null)
  }

  // 批量停止所选正在运行的项目
  const [bulkStopping, setBulkStopping] = useState(false)
  const stopSelectedProjects = async () => {
    if (selectedProjects.size === 0) {
      showToast('info', t('projects.noSelectableProjects'), t('projects.noSelectableProjects'))
      return
    }
    setBulkStopping(true)
    try {
      const ids = Array.from(selectedProjects)
      const stoppable = ids.filter(id => {
        const project = projects.find(p => p.id === id)
        return project && project.status === 'running'
      })
      if (stoppable.length === 0) {
        await refreshAllProjects()
        showToast('info', t('projects.bulkStopResult', { defaultValue: '批量停止结果' }), t('projects.noRunningSelected', { defaultValue: '没有正在运行的选中项目' }))
        setBulkStopping(false)
        return
      }
      const results = await Promise.allSettled(stoppable.map(id => stopProject(id)))
      let successCount = 0
      let failCount = 0
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) successCount += 1
        else failCount += 1
      }
      // 先逐个刷新已停止项目的状态，确保卡片按钮立即切换
      if (successCount > 0) {
        await Promise.allSettled(stoppable.map(id => refreshProjectStatus(id)))
      }
      // 再做一次全量刷新，确保整个列表与统计同步
      await refreshAllProjects()
      // 由于进程强杀存在极短延时，这里加一次延迟全量刷新兜底，确保状态完全切换
      setTimeout(() => {
        refreshAllProjects()
      }, 600)
      if (successCount === 0) {
        showToast('info', t('projects.bulkStopResult', { defaultValue: '批量停止结果' }), t('projects.noRunningSelected', { defaultValue: '没有正在运行的选中项目' }))
      } else {
        showToast(
          failCount === 0 ? 'success' : 'info',
          t('projects.bulkStopResult', { defaultValue: '批量停止结果' }),
          t('projects.bulkStopDesc', { success: successCount, failed: failCount, defaultValue: '成功停止 {{success}} 个，失败 {{failed}} 个' })
        )
      }
    } catch (error) {
      console.error('Error bulk stopping projects:', error)
      showToast('error', t('projects.bulkStopResult', { defaultValue: '批量停止结果' }), t('errors.unknownError'))
    } finally {
      // 兜底关闭所有处理中的 loading 状态，避免底栏一直转圈
      setBulkStopping(false)
      setBulkStarting(false)
    }
  }

  // 计算按钮状态：有选中正在运行 -> 显示一键停止，否则显示一键启动
  const hasRunningSelected = projects.some(p => selectedProjects.has(p.id) && p.status === 'running')
  const isProcessing = bulkStarting || bulkStopping
  const runningSelectedCount = projects.filter(p => selectedProjects.has(p.id) && p.status === 'running').length

  const startSelectedProjects = async () => {
    if (selectedProjects.size === 0) {
      showToast('info', t('projects.noSelectableProjects'), t('projects.noSelectableProjects'))
      return
    }
    setBulkStarting(true)
    let successCount = 0
    let failCount = 0
    try {
      const ids = Array.from(selectedProjects)
      for (const id of ids) {
        const project = projects.find(p => p.id === id)
        if (!project || project.status !== 'stopped') {
          continue
        }
        const ok = await startProject(id)
        if (ok) {
          successCount += 1
          setActiveProject(id)
        } else {
          failCount += 1
        }
      }
      if (successCount === 0) {
        showToast('info', t('projects.noSelectableProjects'), t('projects.noSelectableProjects'))
      } else {
        showToast(
          failCount === 0 ? 'success' : 'info',
          t('projects.bulkStartResult'),
          t('projects.bulkStartDesc', { success: successCount, failed: failCount })
        )
      }
    } catch (error) {
      console.error('Error bulk starting projects:', error)
      showToast('error', t('projects.bulkStartResult'), t('errors.unknownError'))
    } finally {
      setBulkStarting(false)
      // 保留选中状态，不再自动清空
    }
  }

  // 兜底：根据项目状态变化自动清理底栏的处理中的 loading 状态
  // 场景：批量停止完成后，所有选中项都非 running，则关闭 bulkStopping；
  //      批量启动完成后，选中项中已无 stopped 项，则关闭 bulkStarting。
  useEffect(() => {
    if (!bulkStarting && !bulkStopping) return
    const selectedIds = Array.from(selectedProjects)
    const noneRunningSelected = !projects.some(p => selectedIds.includes(p.id) && p.status === 'running')
    const noneStoppedSelected = !projects.some(p => selectedIds.includes(p.id) && p.status === 'stopped')
    if (bulkStopping && noneRunningSelected) {
      setBulkStopping(false)
    }
    if (bulkStarting && noneStoppedSelected) {
      setBulkStarting(false)
    }
  }, [projects, selectedProjects, bulkStarting, bulkStopping])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshAllProjects()
      console.log('Dashboard projects refreshed successfully')
      showToast('success', t('projects.refreshSuccess'), t('projects.refreshSuccessDesc'))
    } catch (error) {
      console.error('Error refreshing dashboard projects:', error)
      showToast('error', t('projects.refreshError'), t('projects.refreshErrorDesc'))
    } finally {
      setRefreshing(false)
    }
  }

  const handleViewLogs = (projectId: string) => {
    setActiveProject(projectId)
    navigate('/logs')
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
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <Clock className="w-4 h-4 text-gray-400" />
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

  const runningProjects = projects.filter(p => p.status === 'running')
  const stoppedProjects = projects.filter(p => p.status === 'stopped')
  const errorProjects = projects.filter(p => p.status === 'error')

  if (loading && projects.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center space-x-2">
          <div className="loading-spinner w-6 h-6"></div>
          <span>{t('common.loading')}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 pb-20">
      {/* 页面标题和操作 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('dashboard.title')}</h1>
          <p className="text-muted-foreground">{t('dashboard.subtitle')}</p>
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
            onClick={() => navigate('/projects')}
            className="flex items-center space-x-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{t('projects.createNew')}</span>
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

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('dashboard.totalProjects')}</p>
              <p className="text-2xl font-bold text-foreground">{projects.length}</p>
            </div>
            <FolderOpen className="w-8 h-8 text-blue-500" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('dashboard.runningProjects')}</p>
              <p className="text-2xl font-bold text-green-600">{runningProjects.length}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('projects.stopped')}</p>
              <p className="text-2xl font-bold text-gray-600">{stoppedProjects.length}</p>
            </div>
            <Clock className="w-8 h-8 text-gray-500" />
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{t('projects.error')}</p>
              <p className="text-2xl font-bold text-red-600">{errorProjects.length}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
        </div>
      </div>

      

      {/* 项目列表 */}
      {projects.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <FolderOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">{t('projects.noProjects')}</h3>
          <p className="text-muted-foreground mb-6">
            {t('projects.noProjectsDesc')}
          </p>
          <button
            onClick={() => navigate('/projects')}
            className="flex items-center space-x-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors mx-auto"
          >
            <Plus className="w-5 h-5" />
            <span>{t('projects.addProject')}</span>
          </button>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">{t('dashboard.projectList')}</h2>
          </div>
          <div className="divide-y divide-border">
            {projects.map((project) => (
              <div key={project.id} className="p-6 hover:bg-accent/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      {getStatusIcon(project.status)}
                      <h3 className="text-lg font-medium text-foreground">
                        {project.name}
                      </h3>
                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`select-${project.id}`}
                          checked={isSelected(project.id)}
                          onChange={() => toggleSelection(project.id)}
                          className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                        />
                        <label 
                          htmlFor={`select-${project.id}`}
                          className="text-xs text-muted-foreground cursor-pointer"
                        >
                          {t('projects.selectProject')}
                        </label>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mb-1">
                      {t('projects.projectPath')}: {project.path}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t('projects.startCommand')}: {project.startCommand}
                    </p>
                    <div className="flex items-center space-x-4 mt-2">
                      <span className="text-sm text-muted-foreground">
                        {t('projects.status')} {getStatusText(project.status)}
                      </span>
                      {project.pid && (
                        <span className="text-sm text-muted-foreground">
                          PID: {project.pid}
                        </span>
                      )}
                    </div>
                    
                    {/* 自动刷新日志复选框 */}
                    <div className="flex items-center space-x-2 mt-3">
                      <input
                        type="checkbox"
                        id={`auto-refresh-${project.id}`}
                        checked={project.autoRefreshLogs || false}
                        onChange={() => handleToggleAutoRefreshLogs(project.id)}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                      />
                      <label 
                        htmlFor={`auto-refresh-${project.id}`}
                        className="text-sm text-muted-foreground cursor-pointer"
                      >
                        {t('projects.autoRefreshLogs')}
                      </label>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleViewLogs(project.id)}
                      className="flex items-center space-x-1 px-3 py-2 text-sm bg-secondary text-secondary-foreground rounded hover:bg-secondary/80 transition-colors"
                    >
                      <Terminal className="w-4 h-4" />
                      <span>{t('projects.logs')}</span>
                    </button>
                    
                    {project.status === 'running' ? (
                      <button
                        onClick={() => handleStopProject(project.id)}
                        className="flex items-center space-x-1 px-3 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors"
                      >
                        <Square className="w-4 h-4" />
                        <span>{t('projects.stop')}</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartProject(project.id)}
                        className="flex items-center space-x-1 px-3 py-2 text-sm bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                      >
                        <Play className="w-4 h-4" />
                        <span>{t('projects.start')}</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      

      {/* 固定底栏：一键启动 */}
      <div className="fixed inset-x-0 bottom-0 z-40 bg-card border-t border-border shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-end">
          <button
            onClick={hasRunningSelected ? () => setBulkStopConfirmOpen(true) : startSelectedProjects}
            disabled={isProcessing || selectedProjects.size === 0}
            className={`flex items-center space-x-2 px-5 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${hasRunningSelected ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'}`}
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : hasRunningSelected ? (
              <Square className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span className="font-medium">{hasRunningSelected ? t('projects.stop') : t('projects.bulkStart')}</span>
            {selectedProjects.size > 0 && (
              <span className="text-xs opacity-80">({selectedProjects.size})</span>
            )}
          </button>
        </div>
      </div>

      {/* 停止项目确认对话框 */}
      <ConfirmDialog
        isOpen={!!stopConfirm}
        title={t('projects.stopProject')}
        message={t('projects.stopProjectConfirm')}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        onConfirm={() => { void confirmStopProject() }}
        onCancel={cancelStopProject}
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />

      {/* 批量停止确认对话框 */}
      <ConfirmDialog
        isOpen={bulkStopConfirmOpen}
        title={t('projects.bulkStopConfirmTitle', { defaultValue: '确认批量停止' })}
        message={t('projects.bulkStopConfirmMessage', { count: runningSelectedCount, defaultValue: `确定要停止选中的正在运行项目吗？（${runningSelectedCount} 个）` })}
        confirmText={t('common.confirm', { defaultValue: '确认' })}
        cancelText={t('common.cancel', { defaultValue: '取消' })}
        onConfirm={() => { setBulkStopConfirmOpen(false); stopSelectedProjects() }}
        onCancel={() => setBulkStopConfirmOpen(false)}
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
    </div>
  )
}

export default Dashboard