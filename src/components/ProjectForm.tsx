import React, { useState, useEffect } from 'react'
import { useProjectStore } from '../stores/projectStore'
import { X, FolderOpen, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface ProjectFormProps {
  project?: any
  onClose: () => void
  onSuccess: () => void
}

const ProjectForm: React.FC<ProjectFormProps> = ({ project, onClose, onSuccess }) => {
  const { createProject, updateProject } = useProjectStore()
  const { t } = useTranslation()
  
  const [formData, setFormData] = useState({
    name: '',
    path: '',
    startCommand: 'dev'
  })
  
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (project) {
      console.log('ProjectForm: Setting form data for project:', project) // 添加调试日志
      setFormData({
        name: project.name,
        path: project.path,
        startCommand: project.startCommand
      })
    } else {
      console.log('ProjectForm: Resetting form data for new project') // 添加调试日志
      setFormData({
        name: '',
        path: '',
        startCommand: 'dev'
      })
    }
  }, [project])

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    // 清除对应字段的错误
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const handleSelectFolder = async () => {
    try {
      if (window.electronAPI) {
        const selectedPath = await window.electronAPI.dialog.selectFolder()
        if (selectedPath) {
          handleInputChange('path', selectedPath)
          
          // 如果名称为空，使用文件夹名称作为项目名称
          if (!formData.name) {
            const folderName = selectedPath.split('/').pop() || ''
            handleInputChange('name', folderName)
          }
        }
      }
    } catch (error) {
      console.error('Failed to select folder:', error)
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.name.trim()) {
      newErrors.name = t('projectForm.validation.nameRequired')
    }

    if (!formData.path.trim()) {
      newErrors.path = t('projectForm.validation.pathRequired')
    }

    if (!formData.startCommand.trim()) {
      newErrors.startCommand = t('projectForm.validation.startCommandRequired')
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      return
    }

    setLoading(true)
    
    try {
      if (project) {
        // 更新项目
        console.log('Updating project:', project.id, formData) // 添加调试日志
        await updateProject(project.id, formData)
      } else {
        // 创建项目
        console.log('Creating project:', formData) // 添加调试日志
        const result = await createProject(formData)
        console.log('Create project result:', result) // 添加调试日志
      }
      console.log('About to call onSuccess') // 添加调试日志
      onSuccess()
    } catch (error) {
      console.error('Failed to save project:', error)
      setErrors({ submit: t('projectForm.saveError') })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-card border border-border rounded-lg w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            {project ? t('projectForm.editTitle') : t('projectForm.title')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 表单内容 */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* 项目名称 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              {t('projectForm.name')} *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => handleInputChange('name', e.target.value)}
              placeholder={t('projectForm.namePlaceholder')}
              className={`w-full px-3 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
                errors.name ? 'border-red-500' : 'border-border'
              }`}
            />
            {errors.name && (
              <p className="mt-1 text-sm text-red-500 flex items-center space-x-1">
                <AlertCircle className="w-4 h-4" />
                <span>{errors.name}</span>
              </p>
            )}
          </div>

          {/* 项目路径 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              {t('projectForm.path')} *
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={formData.path}
                onChange={(e) => handleInputChange('path', e.target.value)}
                placeholder={t('projectForm.pathPlaceholder')}
                className={`flex-1 px-3 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
                  errors.path ? 'border-red-500' : 'border-border'
                }`}
              />
              <button
                type="button"
                onClick={handleSelectFolder}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
              </button>
            </div>
            {errors.path && (
              <p className="mt-1 text-sm text-red-500 flex items-center space-x-1">
                <AlertCircle className="w-4 h-4" />
                <span>{errors.path}</span>
              </p>
            )}
          </div>

          {/* 启动命令 */}
          <div>
            <label className="block text-sm font-medium text-foreground mb-2">
              {t('projectForm.startCommand')} *
            </label>
            <input
              type="text"
              value={formData.startCommand}
              onChange={(e) => handleInputChange('startCommand', e.target.value)}
              placeholder="npm run dev"
              className={`w-full px-3 py-2 bg-background border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary ${
                errors.startCommand ? 'border-red-500' : 'border-border'
              }`}
            />
            {errors.startCommand && (
              <p className="mt-1 text-sm text-red-500 flex items-center space-x-1">
                <AlertCircle className="w-4 h-4" />
                <span>{errors.startCommand}</span>
              </p>
            )}
            <p className="mt-1 text-xs text-muted-foreground">
              {t('projects.commonCommands')}
            </p>
          </div>

          {/* 提交错误 */}
          {errors.submit && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
              <p className="text-sm text-red-700 dark:text-red-300 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4" />
                <span>{errors.submit}</span>
              </p>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors"
            >
              {t('projectForm.cancel')}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center space-x-2"
            >
              {loading && <div className="loading-spinner w-4 h-4"></div>}
              <span>{project ? t('projectForm.updateProject') : t('projectForm.createProject')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProjectForm