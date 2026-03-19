import React, { useEffect, useMemo, useRef, useState } from 'react'
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
  GripVertical,
  Save,
  X,
  Loader2,
  Download,
  Upload
} from 'lucide-react'
import ProjectForm from '../components/ProjectForm'
import ConfirmDialog from '../components/ConfirmDialog'
import { useTranslation } from 'react-i18next'

interface ProjectShortcut {
  id: string
  name: string
  projects: Array<{
    id: string
    name: string
    path: string
    packageManager: 'npm' | 'pnpm' | 'yarn'
    startCommand: string
    autoRefreshLogs?: boolean
  }>
  createdAt: string
  updatedAt: string
}

const Projects: React.FC = () => {
  const SHORTCUT_SINGLE_CLICK_DELAY = 320
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
    reorderProjects,
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
  const [draggingProjectId, setDraggingProjectId] = useState<string | null>(null)
  const [dragOverProjectId, setDragOverProjectId] = useState<string | null>(null)
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([])
  const [shortcuts, setShortcuts] = useState<ProjectShortcut[]>([])
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [shortcutName, setShortcutName] = useState('')
  const [savingShortcut, setSavingShortcut] = useState(false)
  const [shortcutLoadingId, setShortcutLoadingId] = useState<string | null>(null)
  const [shortcutDragId, setShortcutDragId] = useState<string | null>(null)
  const [shortcutDragOverId, setShortcutDragOverId] = useState<string | null>(null)
  const [editingShortcutId, setEditingShortcutId] = useState<string | null>(null)
  const [editingShortcutName, setEditingShortcutName] = useState('')
  const [renamingShortcutId, setRenamingShortcutId] = useState<string | null>(null)
  const [batchStarting, setBatchStarting] = useState(false)
  const [batchStopping, setBatchStopping] = useState(false)
  const [batchProgress, setBatchProgress] = useState({ total: 0, done: 0, success: 0, failed: 0 })
  const [importing, setImporting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const shortcutClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const batchStopToastSentRef = useRef(false)
  const selectionStorageKey = 'selectedProjectIds'

  const selectedCount = selectedProjectIds.length
  const projectMap = useMemo(() => new Map(projects.map(project => [project.id, project])), [projects])
  const shortcutNameError = useMemo(() => {
    const normalized = shortcutName.trim()
    if (!normalized) {
      return t('projects.shortcuts.validation.required')
    }
    if (normalized.length > 20) {
      return t('projects.shortcuts.validation.maxLength')
    }
    if (!/^[a-zA-Z0-9_\-\u4e00-\u9fa5\s]+$/.test(normalized)) {
      return t('projects.shortcuts.validation.invalidChars')
    }
    const duplicated = shortcuts.some(item => item.name.toLowerCase() === normalized.toLowerCase())
    if (duplicated) {
      return t('projects.shortcuts.validation.duplicate')
    }
    return ''
  }, [shortcutName, shortcuts, t])

  const translateShortcutError = (message?: string) => {
    if (!message) {
      return t('errors.unknownError')
    }
    const messageMap: Record<string, string> = {
      'No projects selected': t('projects.shortcuts.backend.noProjectsSelected'),
      'Shortcut name already exists': t('projects.shortcuts.backend.nameExists'),
      'Maximum 5 shortcuts allowed': t('projects.shortcuts.backend.maxShortcuts'),
      'Shortcut not found': t('projects.shortcuts.backend.notFound'),
      'No valid shortcuts found': t('projects.shortcuts.backend.noValidShortcuts'),
      'Import failed': t('projects.shortcuts.backend.importFailed')
    }
    return messageMap[message] || message
  }

  useEffect(() => {
    loadProjects()
  }, [loadProjects])

  useEffect(() => {
    try {
      const raw = localStorage.getItem(selectionStorageKey)
      if (!raw) {
        return
      }
      const ids = JSON.parse(raw)
      if (Array.isArray(ids)) {
        setSelectedProjectIds(ids.filter((id): id is string => typeof id === 'string'))
      }
    } catch (error) {
      console.warn('[Projects] Failed to load selected projects from storage:', error)
    }
  }, [])

  useEffect(() => {
    const availableIds = new Set(projects.map(project => project.id))
    setSelectedProjectIds(prev => prev.filter(id => availableIds.has(id)))
  }, [projects])

  useEffect(() => {
    try {
      localStorage.setItem(selectionStorageKey, JSON.stringify(selectedProjectIds))
    } catch (error) {
      console.warn('[Projects] Failed to persist selected projects to storage:', error)
    }
  }, [selectedProjectIds])

  useEffect(() => {
    if (!batchStopping) {
      return
    }
    const hasRunningInSelection = selectedProjectIds.some(projectId => {
      const project = projects.find(item => item.id === projectId)
      return project?.status === 'running'
    })
    if (!hasRunningInSelection) {
      if (!batchStopToastSentRef.current) {
        batchStopToastSentRef.current = true
        showToast('success', t('projects.bulkStopResult'), t('projects.shortcuts.batchStopDoneDesc'))
      }
      setBatchStopping(false)
      setBatchProgress({ total: 0, done: 0, success: 0, failed: 0 })
    }
  }, [batchStopping, projects, selectedProjectIds, showToast, t])

  useEffect(() => {
    const loadShortcuts = async () => {
      if (!window.electronAPI?.shortcuts) {
        return
      }
      try {
        const loadedShortcuts = await window.electronAPI.shortcuts.getAll()
        setShortcuts(loadedShortcuts)
      } catch (error) {
        showToast('error', t('projects.shortcuts.loadErrorTitle'), translateShortcutError(error instanceof Error ? error.message : undefined))
      }
    }
    void loadShortcuts()
  }, [showToast, t])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        if (selectedProjectIds.length === 0) {
          showToast('info', t('projects.shortcuts.selectNoneTitle'), t('projects.shortcuts.saveSelectHint'))
          return
        }
        setShowSaveDialog(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedProjectIds.length, showToast, t])

  useEffect(() => {
    return () => {
      if (shortcutClickTimerRef.current) {
        clearTimeout(shortcutClickTimerRef.current)
        shortcutClickTimerRef.current = null
      }
    }
  }, [])

  const toggleProjectSelection = (projectId: string, checked: boolean) => {
    setSelectedProjectIds(prev => {
      if (checked) {
        if (prev.includes(projectId)) return prev
        return [...prev, projectId]
      }
      return prev.filter(id => id !== projectId)
    })
  }

  const selectAllFilteredProjects = () => {
    setSelectedProjectIds(prev => {
      const merged = new Set(prev)
      filteredProjects.forEach(project => merged.add(project.id))
      return Array.from(merged)
    })
  }

  const clearSelectedProjects = () => {
    setSelectedProjectIds([])
  }

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

  const handleSaveShortcut = async () => {
    if (!window.electronAPI?.shortcuts) {
      showToast('error', t('projects.shortcuts.unsupportedTitle'), t('projects.shortcuts.desktopOnlySave'))
      return
    }
    if (selectedProjectIds.length === 0) {
      showToast('error', t('projects.shortcuts.selectNoneTitle'), t('projects.shortcuts.selectHint'))
      return
    }
    if (shortcutNameError) {
      showToast('error', t('projects.shortcuts.saveErrorTitle'), shortcutNameError)
      return
    }
    setSavingShortcut(true)
    const start = performance.now()
    try {
      const created = await window.electronAPI.shortcuts.create({
        name: shortcutName.trim(),
        projectIds: selectedProjectIds
      })
      setShortcuts(prev => [...prev, created])
      setShortcutName('')
      setShowSaveDialog(false)
      const cost = Math.round(performance.now() - start)
      showToast('success', t('projects.shortcuts.saveSuccessTitle'), t('projects.shortcuts.saveSuccessDesc', { cost }))
    } catch (error) {
      showToast('error', t('projects.shortcuts.saveErrorTitle'), translateShortcutError(error instanceof Error ? error.message : undefined))
    } finally {
      setSavingShortcut(false)
    }
  }

  const handleDeleteShortcut = async (shortcutId: string) => {
    if (!window.electronAPI?.shortcuts) {
      return
    }
    try {
      const success = await window.electronAPI.shortcuts.delete(shortcutId)
      if (!success) {
        showToast('error', t('projects.shortcuts.deleteErrorTitle'), t('projects.shortcuts.backend.notFound'))
        return
      }
      setShortcuts(prev => prev.filter(item => item.id !== shortcutId))
      showToast('success', t('projects.shortcuts.deleteSuccessTitle'))
    } catch (error) {
      showToast('error', t('projects.shortcuts.deleteErrorTitle'), translateShortcutError(error instanceof Error ? error.message : undefined))
    }
  }

  const validateShortcutName = (name: string, currentShortcutId?: string) => {
    const normalized = name.trim()
    if (!normalized) {
      return t('projects.shortcuts.validation.required')
    }
    if (normalized.length > 20) {
      return t('projects.shortcuts.validation.maxLength')
    }
    if (!/^[a-zA-Z0-9_\-\u4e00-\u9fa5\s]+$/.test(normalized)) {
      return t('projects.shortcuts.validation.invalidChars')
    }
    const duplicated = shortcuts.some(
      item => item.id !== currentShortcutId && item.name.toLowerCase() === normalized.toLowerCase()
    )
    if (duplicated) {
      return t('projects.shortcuts.validation.duplicate')
    }
    return ''
  }

  const beginRenameShortcut = (shortcut: ProjectShortcut) => {
    setEditingShortcutId(shortcut.id)
    setEditingShortcutName(shortcut.name)
  }

  const cancelRenameShortcut = () => {
    setEditingShortcutId(null)
    setEditingShortcutName('')
    setRenamingShortcutId(null)
  }

  const submitRenameShortcut = async (shortcutId: string) => {
    if (!window.electronAPI?.shortcuts) {
      return
    }
    const errorMessage = validateShortcutName(editingShortcutName, shortcutId)
    if (errorMessage) {
      showToast('error', t('projects.shortcuts.renameErrorTitle'), errorMessage)
      return
    }
    setRenamingShortcutId(shortcutId)
    try {
      const updated = await window.electronAPI.shortcuts.rename({
        id: shortcutId,
        name: editingShortcutName.trim()
      })
      setShortcuts(prev => prev.map(item => (item.id === updated.id ? updated : item)))
      showToast('success', t('projects.shortcuts.renameSuccessTitle'))
      cancelRenameShortcut()
    } catch (error) {
      setRenamingShortcutId(null)
      showToast('error', t('projects.shortcuts.renameErrorTitle'), translateShortcutError(error instanceof Error ? error.message : undefined))
    }
  }

  const handleApplyShortcut = async (shortcut: ProjectShortcut, appendMode: boolean) => {
    setShortcutLoadingId(shortcut.id)
    const start = performance.now()
    try {
      const missingProjects = shortcut.projects.filter(item => !projectMap.has(item.id))
      const availableProjects = shortcut.projects.filter(item => projectMap.has(item.id))
      const availableProjectIds = availableProjects.map(item => item.id)
      if (appendMode) {
        setSelectedProjectIds(prev => Array.from(new Set([...prev, ...availableProjectIds])))
      } else {
        setSelectedProjectIds(availableProjectIds)
      }
      await Promise.all(
        availableProjects.map(async (item) => {
          if (typeof item.autoRefreshLogs !== 'boolean') {
            return
          }
          const current = projectMap.get(item.id)
          if (!current) {
            return
          }
          if (!!current.autoRefreshLogs !== item.autoRefreshLogs) {
            await toggleAutoRefreshLogs(item.id)
          }
        })
      )

      const cost = Math.round(performance.now() - start)
      if (missingProjects.length > 0) {
        showToast('error', t('projects.shortcuts.partialMissingTitle'), missingProjects.map(item => item.name).join('、'))
      } else {
        showToast('success', t('projects.shortcuts.applySuccessTitle'), t('projects.shortcuts.applySuccessDesc', { cost }))
      }
    } finally {
      setTimeout(() => {
        setShortcutLoadingId(null)
      }, 150)
    }
  }

  const handleShortcutDrop = async (targetShortcutId: string) => {
    if (!window.electronAPI?.shortcuts || !shortcutDragId || shortcutDragId === targetShortcutId) {
      setShortcutDragId(null)
      setShortcutDragOverId(null)
      return
    }
    const fromIndex = shortcuts.findIndex(item => item.id === shortcutDragId)
    const toIndex = shortcuts.findIndex(item => item.id === targetShortcutId)
    if (fromIndex < 0 || toIndex < 0) {
      setShortcutDragId(null)
      setShortcutDragOverId(null)
      return
    }
    const reordered = [...shortcuts]
    const [moved] = reordered.splice(fromIndex, 1)
    reordered.splice(toIndex, 0, moved)
    setShortcuts(reordered)
    try {
      const persisted = await window.electronAPI.shortcuts.reorder(reordered.map(item => item.id))
      setShortcuts(persisted)
    } catch (error) {
      showToast('error', t('projects.shortcuts.reorderErrorTitle'), translateShortcutError(error instanceof Error ? error.message : undefined))
    } finally {
      setShortcutDragId(null)
      setShortcutDragOverId(null)
    }
  }

  const handleExportShortcuts = async () => {
    if (!window.electronAPI?.shortcuts) {
      showToast('error', t('projects.shortcuts.unsupportedTitle'), t('projects.shortcuts.desktopOnlyExport'))
      return
    }
    try {
      const data = await window.electronAPI.shortcuts.export()
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = `project-shortcuts-${Date.now()}.json`
      anchor.click()
      URL.revokeObjectURL(url)
      showToast('success', t('projects.shortcuts.exportSuccessTitle'))
    } catch (error) {
      showToast('error', t('projects.shortcuts.exportErrorTitle'), translateShortcutError(error instanceof Error ? error.message : undefined))
    }
  }

  const handleImportShortcuts = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !window.electronAPI?.shortcuts) {
      return
    }
    setImporting(true)
    try {
      const content = await file.text()
      const result = await window.electronAPI.shortcuts.import(content)
      if (!result.success) {
        showToast('error', t('projects.shortcuts.importErrorTitle'), translateShortcutError(result.error))
        return
      }
      const loaded = await window.electronAPI.shortcuts.getAll()
      setShortcuts(loaded)
      showToast('success', t('projects.shortcuts.importSuccessTitle'), t('projects.shortcuts.importSuccessDesc', { imported: result.imported }))
    } catch (error) {
      showToast('error', t('projects.shortcuts.importErrorTitle'), translateShortcutError(error instanceof Error ? error.message : undefined))
    } finally {
      setImporting(false)
    }
  }

  const handleBatchStartSelected = async () => {
    if (selectedProjectIds.length === 0) {
      showToast('info', t('projects.shortcuts.selectNoneTitle'), t('projects.shortcuts.batchSelectHint'))
      return
    }
    setBatchStarting(true)
    setBatchProgress({
      total: selectedProjectIds.length,
      done: 0,
      success: 0,
      failed: 0
    })

    const toStart = [...selectedProjectIds]
    let successCount = 0
    let failedCount = 0
    await Promise.all(toStart.map(async (projectId) => {
      const success = await startProject(projectId)
      if (success) {
        successCount += 1
      } else {
        failedCount += 1
      }
      setBatchProgress(prev => ({
        total: prev.total,
        done: prev.done + 1,
        success: prev.success + (success ? 1 : 0),
        failed: prev.failed + (success ? 0 : 1)
      }))
    }))

    await loadProjects()
    setBatchStarting(false)
    showToast('success', t('projects.shortcuts.batchDoneTitle'), t('projects.shortcuts.batchDoneDesc', { successCount, failedCount }))
  }

  const handleBatchStopSelected = async () => {
    if (selectedProjectIds.length === 0) {
      showToast('info', t('projects.shortcuts.selectNoneTitle'), t('projects.shortcuts.batchSelectHint'))
      return
    }

    const runningSelected = selectedProjectIds.filter(projectId => projectMap.get(projectId)?.status === 'running')
    if (runningSelected.length === 0) {
      showToast('info', t('projects.bulkStopResult'), t('projects.noRunningSelected'))
      return
    }

    batchStopToastSentRef.current = false
    setBatchStopping(true)
    setBatchProgress({
      total: runningSelected.length,
      done: 0,
      success: 0,
      failed: 0
    })

    const stopProjectWithTimeout = async (projectId: string): Promise<boolean> => {
      const timeoutPromise = new Promise<boolean>(resolve => {
        setTimeout(() => resolve(false), 10000)
      })
      return Promise.race([stopProject(projectId), timeoutPromise])
    }

    let successCount = 0
    let failedCount = 0
    try {
      await Promise.all(runningSelected.map(async (projectId) => {
        const success = await stopProjectWithTimeout(projectId)
        if (success) {
          successCount += 1
        } else {
          failedCount += 1
        }
        setBatchProgress(prev => ({
          total: prev.total,
          done: prev.done + 1,
          success: prev.success + (success ? 1 : 0),
          failed: prev.failed + (success ? 0 : 1)
        }))
      }))

      setBatchStopping(false)
      setBatchProgress({ total: 0, done: 0, success: 0, failed: 0 })
      void loadProjects()
      if (failedCount > 0) {
        showToast('info', t('projects.bulkStopResult'), t('projects.bulkStartDesc', { success: successCount, failed: failedCount }))
      }
    } catch (error) {
      console.error('Error stopping selected projects:', error)
      showToast('error', t('projects.bulkStopResult'), t('errors.unknownError'))
    } finally {
      setBatchStopping(false)
      setBatchProgress({ total: 0, done: 0, success: 0, failed: 0 })
    }
  }

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, projectId: string) => {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', projectId)
    setDraggingProjectId(projectId)
  }

  const handleDragEnd = () => {
    setDraggingProjectId(null)
    setDragOverProjectId(null)
  }

  const handleDropOnProject = async (targetProjectId: string) => {
    if (!draggingProjectId || draggingProjectId === targetProjectId) {
      setDraggingProjectId(null)
      return
    }

    const fromIndex = projects.findIndex(project => project.id === draggingProjectId)
    const toIndex = projects.findIndex(project => project.id === targetProjectId)

    if (fromIndex < 0 || toIndex < 0) {
      setDraggingProjectId(null)
      return
    }

    const reorderedProjects = [...projects]
    const [movedProject] = reorderedProjects.splice(fromIndex, 1)
    reorderedProjects.splice(toIndex, 0, movedProject)

    const success = await reorderProjects(reorderedProjects.map(project => project.id))
    if (!success) {
      showToast('error', t('projects.error'), t('projects.refreshErrorDesc'))
    }
    setDraggingProjectId(null)
    setDragOverProjectId(null)
  }

  const handleStopProject = async (projectId: string) => {
    setStopConfirm(projectId)
  }

  const confirmStopProject = async () => {
    console.log('[Projects] confirmStopProject called')
    if (stopConfirm) {
      const id = stopConfirm
      // 先关闭模态框，避免需要点击两次确认
      setStopConfirm(null)
      console.log('[Projects] Stopping project:', id)
      try {
        const success = await stopProject(id)
        console.log('[Projects] Stop project result:', success)
        if (success) {
          console.log('[Projects] Project stopped successfully, refreshing status and list')
          await refreshAllProjects()
        } else {
          console.error('[Projects] Failed to stop project')
        }
      } catch (e) {
        console.error('[Projects] Error stopping project:', e)
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
  const canDragSort = searchTerm.trim() === '' && statusFilter === 'all'
  const allFilteredSelected = filteredProjects.length > 0 && filteredProjects.every(project => selectedProjectIds.includes(project.id))
  const progressPercent = batchProgress.total === 0 ? 0 : Math.round((batchProgress.done / batchProgress.total) * 100)
  const hasRunningSelected = selectedProjectIds.some(projectId => projectMap.get(projectId)?.status === 'running')
  const isBatchProcessing = batchStarting || batchStopping
  const batchStopMode = batchStopping || (!isBatchProcessing && hasRunningSelected)

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

      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowSaveDialog(true)}
            disabled={selectedCount === 0}
            className="inline-flex items-center space-x-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            <span>{t('projects.shortcuts.saveButton')}</span>
          </button>
          <button
            onClick={handleExportShortcuts}
            className="inline-flex items-center space-x-2 px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>{t('projects.shortcuts.exportButton')}</span>
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center space-x-2 px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors disabled:opacity-50"
          >
            <Upload className={`w-4 h-4 ${importing ? 'animate-spin' : ''}`} />
            <span>{importing ? t('projects.shortcuts.importingButton') : t('projects.shortcuts.importButton')}</span>
          </button>
          <button
            onClick={selectAllFilteredProjects}
            className="px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
          >
            {allFilteredSelected ? t('projects.shortcuts.filteredAllSelected') : t('projects.shortcuts.selectFilteredAll')}
          </button>
          <button
            onClick={clearSelectedProjects}
            className="px-3 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
          >
            {t('projects.shortcuts.clearSelection')}
          </button>
          <span className="text-sm text-muted-foreground">{t('projects.shortcuts.selectedCount', { count: selectedCount })}</span>
          <input ref={fileInputRef} type="file" className="hidden" accept="application/json" onChange={handleImportShortcuts} />
        </div>
        <div className="flex flex-wrap gap-2">
          {shortcuts.map(shortcut => (
            <button
              key={shortcut.id}
              draggable
              onDragStart={() => setShortcutDragId(shortcut.id)}
              onDragEnter={() => {
                if (shortcutDragId && shortcutDragId !== shortcut.id) {
                  setShortcutDragOverId(shortcut.id)
                }
              }}
              onDragOver={(event) => {
                event.preventDefault()
                if (shortcutDragId && shortcutDragId !== shortcut.id) {
                  setShortcutDragOverId(shortcut.id)
                }
              }}
              onDragLeave={() => {
                if (shortcutDragOverId === shortcut.id) {
                  setShortcutDragOverId(null)
                }
              }}
              onDrop={() => void handleShortcutDrop(shortcut.id)}
              onDragEnd={() => {
                setShortcutDragId(null)
                setShortcutDragOverId(null)
              }}
              onClick={(event) => {
                if (editingShortcutId === shortcut.id) {
                  return
                }
                if (shortcutClickTimerRef.current) {
                  clearTimeout(shortcutClickTimerRef.current)
                  shortcutClickTimerRef.current = null
                }
                if (event.detail > 1) {
                  return
                }
                const shiftKeyPressed = event.shiftKey
                shortcutClickTimerRef.current = setTimeout(() => {
                  shortcutClickTimerRef.current = null
                  void handleApplyShortcut(shortcut, shiftKeyPressed)
                }, SHORTCUT_SINGLE_CLICK_DELAY)
              }}
              onDoubleClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                if (shortcutClickTimerRef.current) {
                  clearTimeout(shortcutClickTimerRef.current)
                  shortcutClickTimerRef.current = null
                }
                beginRenameShortcut(shortcut)
              }}
              title={shortcut.projects.map(item => item.name).join('\n')}
              className={`group inline-flex items-center space-x-2 px-3 py-2 rounded-full text-sm border transition-all ${
                shortcutDragOverId === shortcut.id
                  ? 'border-primary ring-2 ring-primary/30'
                  : 'border-border bg-secondary hover:bg-secondary/80'
              }`}
            >
              {shortcutLoadingId === shortcut.id && <Loader2 className="w-3 h-3 animate-spin" />}
              {editingShortcutId === shortcut.id ? (
                <input
                  value={editingShortcutName}
                  onChange={(event) => setEditingShortcutName(event.target.value.slice(0, 20))}
                  onClick={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onBlur={() => void submitRenameShortcut(shortcut.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void submitRenameShortcut(shortcut.id)
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      cancelRenameShortcut()
                    }
                  }}
                  autoFocus
                  maxLength={20}
                  className="w-28 px-2 py-0.5 rounded bg-background border border-border text-foreground outline-none ring-1 ring-primary/30"
                />
              ) : (
                <span>{shortcut.name}</span>
              )}
              <span className="text-xs text-muted-foreground">{shortcut.projects.length}</span>
              {renamingShortcutId === shortcut.id && <Loader2 className="w-3 h-3 animate-spin" />}
              <span
                onClick={(event) => {
                  event.stopPropagation()
                  if (editingShortcutId === shortcut.id) {
                    cancelRenameShortcut()
                  }
                  void handleDeleteShortcut(shortcut.id)
                }}
                className="opacity-0 group-hover:opacity-100 text-red-500"
              >
                <X className="w-3 h-3" />
              </span>
            </button>
          ))}
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
              className={`project-card group relative bg-card border border-border rounded-lg p-6 transition-all duration-200 ${
                draggingProjectId === project.id
                  ? 'opacity-45 scale-[0.98] rotate-[1deg] shadow-inner'
                  : 'hover:shadow-lg'
              } ${
                dragOverProjectId === project.id
                  ? 'border-primary/70 ring-2 ring-primary/40 shadow-xl -translate-y-1 bg-primary/5'
                  : ''
              } ${canDragSort ? 'cursor-grab active:cursor-grabbing' : ''}`}
              draggable={canDragSort}
              onDragStart={(event) => handleDragStart(event, project.id)}
              onDragEnd={handleDragEnd}
              onDragEnter={() => {
                if (canDragSort && draggingProjectId && draggingProjectId !== project.id) {
                  setDragOverProjectId(project.id)
                }
              }}
              onDragOver={(event) => {
                if (canDragSort) {
                  event.preventDefault()
                  if (draggingProjectId && draggingProjectId !== project.id && dragOverProjectId !== project.id) {
                    setDragOverProjectId(project.id)
                  }
                }
              }}
              onDragLeave={() => {
                if (dragOverProjectId === project.id) {
                  setDragOverProjectId(null)
                }
              }}
              onDrop={() => {
                if (canDragSort) {
                  void handleDropOnProject(project.id)
                }
              }}
            >
              <div
                className={`pointer-events-none absolute left-4 right-4 top-2 h-1 rounded-full transition-all duration-200 ${
                  dragOverProjectId === project.id ? 'bg-primary opacity-100' : 'opacity-0'
                }`}
              />
              {/* 项目头部 */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedProjectIds.includes(project.id)}
                      onChange={(event) => toggleProjectSelection(project.id, event.target.checked)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <GripVertical
                      className={`w-4 h-4 transition-all duration-200 ${
                        canDragSort
                          ? 'text-muted-foreground group-hover:text-primary group-hover:scale-110'
                          : 'text-muted-foreground/40'
                      } ${draggingProjectId === project.id ? 'text-primary scale-110' : ''}`}
                    />
                    {getStatusIcon(project.status)}
                    <h3 className="flex-1 min-w-0 text-base font-semibold text-foreground truncate">
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
                <div className="flex items-center space-x-1 shrink-0 ml-2">
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
                  <p className="mt-0.5 truncate" title={project.startCommand}>
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
                      className="inline-block max-w-full truncate align-bottom text-blue-500 hover:text-blue-600 underline ml-1"
                      title={project.url}
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

      {(batchStarting || batchStopping || batchProgress.total > 0) && (
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">{batchStopping ? t('projects.shortcuts.batchStopProgressTitle') : t('projects.shortcuts.batchProgressTitle')}</span>
            <span className="text-sm text-muted-foreground">{progressPercent}%</span>
          </div>
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div className="h-2 bg-primary transition-all duration-200" style={{ width: `${progressPercent}%` }} />
          </div>
          <div className="mt-2 text-xs text-muted-foreground">
            {t('projects.shortcuts.batchProgressSummary', {
              total: batchProgress.total,
              done: batchProgress.done,
              success: batchProgress.success,
              failed: batchProgress.failed
            })}
          </div>
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 z-40 bg-card border-t border-border shadow-lg">
        <div className="w-full px-6 py-3 flex items-center justify-end">
          <button
            onClick={() => {
              if (batchStopMode) {
                void handleBatchStopSelected()
                return
              }
              void handleBatchStartSelected()
            }}
            disabled={isBatchProcessing || selectedCount === 0}
            className={`flex items-center space-x-2 px-5 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              batchStopMode ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-green-600 text-white hover:bg-green-700'
            }`}
          >
            {isBatchProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : batchStopMode ? (
              <Square className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            <span className="font-medium">
              {isBatchProcessing
                ? (batchStopping ? t('projects.shortcuts.batchStoppingButton') : t('projects.shortcuts.batchStartingButton'))
                : (batchStopMode ? t('projects.shortcuts.batchStopButton') : t('projects.shortcuts.batchStartButton'))}
            </span>
            {selectedCount > 0 && (
              <span className="text-xs opacity-80">({selectedCount})</span>
            )}
          </button>
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
        onConfirm={() => { void confirmStopProject() }}
        onCancel={cancelStopProject}
        confirmButtonClass="bg-red-600 hover:bg-red-700"
      />

      {showSaveDialog && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t('projects.shortcuts.saveDialogTitle')}</h3>
              <button
                onClick={() => {
                  setShowSaveDialog(false)
                  setShortcutName('')
                }}
                className="p-2 rounded hover:bg-secondary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{t('projects.shortcuts.customNameLabel')}</label>
              <input
                value={shortcutName}
                onChange={(event) => setShortcutName(event.target.value.slice(0, 20))}
                maxLength={20}
                autoFocus
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                placeholder={t('projects.shortcuts.namePlaceholder')}
              />
              <div className="flex items-center justify-between text-xs">
                <span className={shortcutNameError ? 'text-red-500' : 'text-muted-foreground'}>
                  {shortcutNameError || t('projects.shortcuts.validation.invalidChars')}
                </span>
                <span className="text-muted-foreground">{shortcutName.length}/20</span>
              </div>
            </div>
            <div className="flex items-center justify-end space-x-2">
              <button
                onClick={() => {
                  setShowSaveDialog(false)
                  setShortcutName('')
                }}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => void handleSaveShortcut()}
                disabled={!!shortcutNameError || savingShortcut}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {savingShortcut ? t('projects.shortcuts.savingButton') : t('projects.shortcuts.confirmSaveButton')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Projects
