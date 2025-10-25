import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useThemeStore } from '../stores/themeStore'
import { 
  Monitor, 
  Sun, 
  Moon, 
  Settings as SettingsIcon,
  Save,
  RotateCcw,
  AlertCircle,
  CheckCircle,
  Download,
  Upload
} from 'lucide-react'

interface AppConfig {
  theme: 'light' | 'dark' | 'system'
  autoStart: boolean
  minimizeToTray: boolean
  showNotifications: boolean
  defaultPackageManager: 'npm' | 'pnpm' | 'yarn'
  maxConcurrentProjects: number
  windowBounds?: {
    x: number
    y: number
    width: number
    height: number
  }
  language: 'zh-CN' | 'en-US'
  logLevel: 'info' | 'warn' | 'error'
}

const Settings: React.FC = () => {
  const { t, i18n } = useTranslation()
  const { setTheme } = useThemeStore()
  const [config, setConfig] = useState<AppConfig>({
    theme: 'system',
    autoStart: false,
    minimizeToTray: true,
    showNotifications: true,
    defaultPackageManager: 'npm',
    maxConcurrentProjects: 3,
    language: 'zh-CN',
    logLevel: 'info'
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      if (window.electronAPI) {
        const appConfig = await window.electronAPI.config.get()
        setConfig({
          theme: appConfig.theme || 'system',
          autoStart: appConfig.autoStart || false,
          minimizeToTray: appConfig.minimizeToTray || true,
          showNotifications: appConfig.showNotifications || true,
          defaultPackageManager: appConfig.defaultPackageManager || 'npm',
          maxConcurrentProjects: appConfig.maxConcurrentProjects || 3,
          language: appConfig.language || 'zh-CN',
          logLevel: appConfig.logLevel || 'info'
        })
      }
    } catch (error) {
      console.error('Failed to load config:', error)
      showMessage('error', t('settings.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const handleLanguageChange = (language: 'zh-CN' | 'en-US') => {
    handleConfigChange('language', language)
    // Update i18n language immediately
    i18n.changeLanguage(language === 'zh-CN' ? 'zh' : 'en')
  }

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  const handleConfigChange = (key: keyof AppConfig, value: any) => {
    if (config) {
      setConfig({ ...config, [key]: value })
      
      // 如果是主题设置，立即应用主题变化
      if (key === 'theme') {
        setTheme(value)
      }
    }
  }

  const handleSave = async () => {
    if (!config) return

    setSaving(true)
    try {
      if (window.electronAPI) {
        await window.electronAPI.config.update(config)
        // 更新主题
        setTheme(config.theme)
        showMessage('success', t('settings.saveSuccess'))
      }
    } catch (error) {
      console.error('Failed to save config:', error)
      showMessage('error', t('settings.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const handleReset = async () => {
    if (!window.confirm(t('settings.resetConfirm'))) {
      return
    }

    setSaving(true)
    try {
      if (window.electronAPI) {
        const defaultConfig = await window.electronAPI.config.reset()
        setConfig(defaultConfig)
        setTheme(defaultConfig.theme)
        showMessage('success', t('settings.resetSuccess'))
      }
    } catch (error) {
      console.error('Failed to reset config:', error)
      showMessage('error', t('settings.resetError'))
    } finally {
      setSaving(false)
    }
  }

  const handleExportConfig = () => {
    if (!config) return

    const configJson = JSON.stringify(config, null, 2)
    const blob = new Blob([configJson], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `frontend-project-manager-config-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    showMessage('success', t('settings.exportSuccess'))
  }

  const handleImportConfig = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        const text = await file.text()
        const importedConfig = JSON.parse(text)
        
        // 验证配置格式
        if (typeof importedConfig === 'object' && importedConfig.theme) {
          setConfig({ ...config, ...importedConfig })
          showMessage('success', t('settings.importSuccess'))
        } else {
          showMessage('error', t('settings.importInvalidFormat'))
        }
      } catch (error) {
        showMessage('error', t('settings.importError'))
      }
    }
    input.click()
  }



  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center space-x-2">
          <div className="loading-spinner w-6 h-6"></div>
          <span>{t('settings.loading')}</span>
        </div>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-foreground mb-2">{t('settings.loadError')}</h3>
          <p className="text-muted-foreground">{t('settings.loadErrorDesc')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t('settings.title')}</h1>
          <p className="text-muted-foreground">{t('settings.subtitle')}</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleImportConfig}
            className="flex items-center space-x-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
          >
            <Upload className="w-4 h-4" />
            <span>{t('settings.import')}</span>
          </button>
          <button
            onClick={handleExportConfig}
            className="flex items-center space-x-2 px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/80 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span>{t('settings.export')}</span>
          </button>
          <button
            onClick={handleReset}
            disabled={saving}
            className="flex items-center space-x-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{t('settings.reset')}</span>
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center space-x-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <div className="loading-spinner w-4 h-4"></div>
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{t('settings.save')}</span>
          </button>
        </div>
      </div>

      {/* 消息提示 */}
      {message && (
        <div className={`border rounded-lg p-4 ${
          message.type === 'success' 
            ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800' 
            : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800'
        }`}>
          <div className="flex items-center space-x-2">
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-green-500" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-500" />
            )}
            <span className={message.type === 'success' ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
              {message.text}
            </span>
          </div>
        </div>
      )}

      {/* 设置面板 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 外观设置 */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center space-x-3 mb-6">
            <SettingsIcon className="w-6 h-6 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">{t('settings.appearance')}</h2>
          </div>

          <div className="space-y-4">
            {/* 主题设置 */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-3">
                {t('settings.theme')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { value: 'light', label: t('settings.lightTheme'), icon: Sun },
                  { value: 'dark', label: t('settings.darkTheme'), icon: Moon },
                  { value: 'system', label: t('settings.systemTheme'), icon: Monitor }
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleConfigChange('theme', option.value)}
                    className={`flex flex-col items-center space-y-2 p-4 rounded-lg border transition-colors ${
                      config.theme === option.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    <option.icon className="w-6 h-6" />
                    <span className="text-sm font-medium">{option.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 语言设置 */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('settings.language')}
              </label>
              <select
                value={config.language}
                onChange={(e) => handleLanguageChange(e.target.value as 'zh-CN' | 'en-US')}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="zh-CN">{t('settings.chineseLanguage')}</option>
                <option value="en-US">{t('settings.englishLanguage')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* 行为设置 */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center space-x-3 mb-6">
            <SettingsIcon className="w-6 h-6 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">{t('settings.behavior')}</h2>
          </div>

          <div className="space-y-4">
            {/* 开关设置 */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('settings.autoStart')}</p>
                  <p className="text-xs text-muted-foreground">{t('settings.autoStartDesc')}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.autoStart}
                    onChange={(e) => handleConfigChange('autoStart', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/40 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('settings.minimizeToTray')}</p>
                  <p className="text-xs text-muted-foreground">{t('settings.minimizeToTrayDesc')}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.minimizeToTray}
                    onChange={(e) => handleConfigChange('minimizeToTray', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/40 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                </label>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{t('settings.showNotifications')}</p>
                  <p className="text-xs text-muted-foreground">{t('settings.showNotificationsDesc')}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showNotifications}
                    onChange={(e) => handleConfigChange('showNotifications', e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 dark:peer-focus:ring-primary/40 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-primary"></div>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* 项目设置 */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center space-x-3 mb-6">
            <SettingsIcon className="w-6 h-6 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">{t('settings.projectSettings')}</h2>
          </div>

          <div className="space-y-4">
            {/* 默认包管理器 */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('settings.defaultPackageManager')}
              </label>
              <select
                value={config.defaultPackageManager}
                onChange={(e) => handleConfigChange('defaultPackageManager', e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="npm">npm</option>
                <option value="pnpm">pnpm</option>
                <option value="yarn">yarn</option>
              </select>
            </div>

            {/* 最大并发项目数 */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('settings.maxConcurrentProjects')}
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={config.maxConcurrentProjects}
                onChange={(e) => handleConfigChange('maxConcurrentProjects', parseInt(e.target.value))}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {t('settings.maxConcurrentProjectsDesc')}
              </p>
            </div>
          </div>
        </div>

        {/* 日志设置 */}
        <div className="bg-card border border-border rounded-lg p-6">
          <div className="flex items-center space-x-3 mb-6">
            <SettingsIcon className="w-6 h-6 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">{t('settings.logSettings')}</h2>
          </div>

          <div className="space-y-4">
            {/* 日志级别 */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {t('settings.logLevel')}
              </label>
              <select
                value={config.logLevel}
                onChange={(e) => handleConfigChange('logLevel', e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="info">{t('settings.logLevelInfo')}</option>
                <option value="warn">{t('settings.logLevelWarn')}</option>
                <option value="error">{t('settings.logLevelError')}</option>
              </select>
              <p className="mt-1 text-xs text-muted-foreground">
                {t('settings.logLevelDesc')}
              </p>
            </div>

            {/* 日志说明 */}
            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="text-sm font-medium text-foreground mb-2">{t('settings.logStorageTitle')}</h4>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• {t('settings.logStorageDesc1')}</li>
                <li>• {t('settings.logStorageDesc2')}</li>
                <li>• {t('settings.logStorageDesc3')}</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Settings