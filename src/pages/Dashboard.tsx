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
  Terminal
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
    refreshAllProjects 
  } = useProjectStore()
  
  const { setActiveProject } = useLogStore()
  const [refreshing, setRefreshing] = useState(false)
  const [stopConfirm, setStopConfirm] = useState<string | null>(null)

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  const handleStartProject = async (projectId: string) => {
    const success = await startProject(projectId)
    if (success) {
      setActiveProject(projectId)
    }
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
        console.log('[Dashboard] Project stopped successfully, closing modal')
        setStopConfirm(null)
      } else {
        console.error('[Dashboard] Failed to stop project, keeping modal open')
      }
    }
  }

  const cancelStopProject = () => {
    setStopConfirm(null)
  }

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
    <div className="p-6 space-y-6">
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

      {/* 停止项目确认对话框 */}
      <ConfirmDialog
        isOpen={!!stopConfirm}
        title={t('projects.stopProject')}
        message={t('projects.stopProjectConfirm')}
        confirmText={t('common.confirm')}
        cancelText={t('common.cancel')}
        onConfirm={confirmStopProject}
        onCancel={cancelStopProject}
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />
    </div>
  )
}

export default Dashboard