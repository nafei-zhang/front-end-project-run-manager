import React, { useEffect, useState } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { useLogStore } from '../stores/logStore'
import { useToast } from '../hooks/useToast'
import { 
  Search, 
  Trash2, 
  Download,
  AlertCircle,
  Info,
  AlertTriangle,
  Terminal,
  RefreshCw
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

const Logs: React.FC = () => {
  const { t } = useTranslation()
  const { showToast } = useToast()
  const { projects } = useProjectStore()
  const { 
    activeProjectId, 
    filter, 
    setActiveProject, 
    clearProjectLogs, 
    setFilter, 
    getFilteredLogs,
    refreshLogs,
    startAutoRefresh,
    stopAutoRefresh
  } = useLogStore()

  const [searchInput, setSearchInput] = useState(filter.search)
  const [isRefreshing, setIsRefreshing] = useState(false)

  useEffect(() => {
    // 如果没有选中项目且有项目列表，默认选择第一个
    if (!activeProjectId && projects.length > 0) {
      setActiveProject(projects[0].id)
    }
  }, [activeProjectId, projects, setActiveProject])

  // 监听当前项目的autoRefreshLogs设置变化
  useEffect(() => {
    if (activeProjectId) {
      const project = projects.find(p => p.id === activeProjectId)
      if (project?.autoRefreshLogs) {
        startAutoRefresh(activeProjectId)
      } else {
        stopAutoRefresh()
      }
    }
    
    // 组件卸载时清理定时器
    return () => {
      stopAutoRefresh()
    }
  }, [activeProjectId, projects, startAutoRefresh, stopAutoRefresh])

  const handleProjectChange = (projectId: string) => {
    setActiveProject(projectId)
    
    // 根据项目的autoRefreshLogs设置来启动或停止自动刷新
    const project = projects.find(p => p.id === projectId)
    if (project?.autoRefreshLogs) {
      startAutoRefresh(projectId)
    } else {
      stopAutoRefresh()
    }
  }

  const handleSearchChange = (value: string) => {
    setSearchInput(value)
    setFilter({ search: value })
  }

  const handleLevelFilter = (level: 'all' | 'info' | 'warn' | 'error') => {
    setFilter({ level })
  }

  const handleClearLogs = () => {
    if (activeProjectId) {
      clearProjectLogs(activeProjectId)
    }
  }

  const handleExportLogs = () => {
    if (!activeProjectId) return
    
    const filteredLogs = getFilteredLogs(activeProjectId)
    const logText = filteredLogs
      .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`)
      .join('\n')
    
    const blob = new Blob([logText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `logs-${activeProjectId}-${new Date().toISOString().split('T')[0]}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleRefreshLogs = async () => {
    if (!activeProjectId || isRefreshing) return
    
    setIsRefreshing(true)
    try {
      await refreshLogs(activeProjectId)
      console.log('Logs refreshed successfully')
      showToast('success', t('logs.refreshSuccess'), t('logs.refreshSuccessDesc'))
    } catch (error) {
      console.error('Failed to refresh logs:', error)
      showToast('error', t('logs.refreshError'), t('logs.refreshErrorDesc'))
    } finally {
      setIsRefreshing(false)
    }
  }

  const getLevelIcon = (level: string) => {
    switch (level) {
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      case 'warn':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />
      default:
        return <Info className="w-4 h-4 text-blue-500" />
    }
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-600 dark:text-red-400'
      case 'warn':
        return 'text-yellow-600 dark:text-yellow-400'
      default:
        return 'text-blue-600 dark:text-blue-400'
    }
  }

  const currentProject = projects.find(p => p.id === activeProjectId)
  const filteredLogs = activeProjectId ? getFilteredLogs(activeProjectId) : []

  return (
    <div className="flex flex-col h-full">
      {/* 头部控制栏 */}
      <div className="p-6 border-b border-border bg-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{t('logs.title')}</h1>
            <p className="text-muted-foreground">{t('logs.subtitle')}</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleRefreshLogs}
              disabled={!activeProjectId || isRefreshing}
              className={`
                group relative flex items-center space-x-2 px-4 py-2 
                bg-secondary text-secondary-foreground rounded-lg 
                transition-all duration-200 ease-in-out
                hover:bg-secondary/80 hover:scale-[1.02] hover:shadow-md
                active:scale-[0.98]
                disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100
                ${isRefreshing ? 'cursor-wait' : ''}
              `}
            >
              <RefreshCw 
                className={`
                  w-4 h-4 transition-transform duration-200
                  ${isRefreshing ? 'animate-spin text-blue-500' : 'group-hover:rotate-90'}
                `} 
              />
              <span className="font-medium transition-colors duration-200">
                {t('projects.refreshStatus')}
              </span>
              {/* 简化的加载状态指示器 */}
              {isRefreshing && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
              )}
            </button>
            <button
              onClick={handleExportLogs}
              disabled={!activeProjectId || filteredLogs.length === 0}
              className="flex items-center space-x-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>{t('logs.exportLogs')}</span>
            </button>
            <button
              onClick={handleClearLogs}
              disabled={!activeProjectId}
              className="flex items-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>{t('logs.clearLogs')}</span>
            </button>
          </div>
        </div>

        {/* 项目选择和过滤器 */}
        <div className="flex items-center space-x-4">
          {/* 项目选择 */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-foreground mb-2">
              {t('logs.filterByProject')}
            </label>
            <select
              value={activeProjectId || ''}
              onChange={(e) => handleProjectChange(e.target.value)}
              className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{t('logs.selectProject')}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name} ({project.status})
                </option>
              ))}
            </select>
          </div>

          {/* 搜索框 */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-foreground mb-2">
              {t('logs.searchLogs')}
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder={t('logs.searchPlaceholder')}
                className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* 级别过滤 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              {t('logs.filterByLevel')}
            </label>
            <div className="flex items-center space-x-2">
              {[
                { value: 'all', label: t('logs.allLevels') },
                { value: 'info', label: t('logs.infoLevel') },
                { value: 'warn', label: t('logs.warnLevel') },
                { value: 'error', label: t('logs.errorLevel') }
              ].map((level) => (
                <button
                  key={level.value}
                  onClick={() => handleLevelFilter(level.value as any)}
                  className={`px-3 py-2 text-sm rounded-lg transition-colors ${
                    filter.level === level.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                  }`}
                >
                  {level.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 日志内容区域 */}
      <div className="flex-1 overflow-hidden">
        {!activeProjectId ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Terminal className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">{t('logs.selectProject')}</h3>
              <p className="text-muted-foreground">
                {t('logs.selectProjectDesc')}
              </p>
            </div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Terminal className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2">{t('logs.noLogs')}</h3>
              <p className="text-muted-foreground">
                {currentProject?.status === 'running' 
                  ? t('logs.waitingForLogs')
                  : t('logs.startProjectForLogs')
                }
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-auto bg-background">
            {/* 日志统计 */}
            <div className="sticky top-0 bg-card border-b border-border px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                  <span>{t('logs.totalLogs', { count: filteredLogs.length })}</span>
                  <span>{t('logs.project')}: {currentProject?.name}</span>
                  <span>{t('logs.status')}: {currentProject?.status}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <span className="text-xs text-muted-foreground">{t('logs.infoLevel')}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full"></div>
                    <span className="text-xs text-muted-foreground">{t('logs.warnLevel')}</span>
                  </div>
                  <div className="flex items-center space-x-1">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span className="text-xs text-muted-foreground">{t('logs.errorLevel')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 日志列表 */}
            <div className="p-4 space-y-1">
              {filteredLogs.map((log, index) => (
                <div
                  key={index}
                  className={`log-entry ${log.level} flex items-start space-x-3 p-3 rounded-lg`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getLevelIcon(log.level)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3 mb-1">
                      <span className={`text-xs font-medium ${getLevelColor(log.level)}`}>
                        {log.level.toUpperCase()}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <pre className="text-sm text-foreground whitespace-pre-wrap break-words font-mono">
                      {log.message}
                    </pre>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Logs