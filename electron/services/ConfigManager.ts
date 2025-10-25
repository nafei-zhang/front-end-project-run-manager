import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

export interface AppConfig {
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

const DEFAULT_CONFIG: AppConfig = {
  theme: 'system',
  autoStart: false,
  minimizeToTray: true,
  showNotifications: true,
  defaultPackageManager: 'npm',
  maxConcurrentProjects: 5,
  language: 'en-US',
  logLevel: 'info'
}

export class ConfigManager {
  private configFilePath: string
  private config: AppConfig

  constructor() {
    this.configFilePath = join(app.getPath('userData'), 'app-config.json')
    this.config = this.loadConfig()
  }

  private loadConfig(): AppConfig {
    try {
      if (existsSync(this.configFilePath)) {
        const data = readFileSync(this.configFilePath, 'utf-8')
        const savedConfig = JSON.parse(data)
        
        // 合并默认配置和保存的配置，确保新增的配置项有默认值
        return { ...DEFAULT_CONFIG, ...savedConfig }
      } else {
        this.saveConfig(DEFAULT_CONFIG)
        return { ...DEFAULT_CONFIG }
      }
    } catch (error) {
      console.error('Failed to load config:', error)
      return { ...DEFAULT_CONFIG }
    }
  }

  private saveConfig(config: AppConfig): void {
    try {
      writeFileSync(this.configFilePath, JSON.stringify(config, null, 2))
    } catch (error) {
      console.error('Failed to save config:', error)
    }
  }

  getConfig(): AppConfig {
    return { ...this.config }
  }

  updateConfig(updates: Partial<AppConfig>): AppConfig {
    this.config = { ...this.config, ...updates }
    this.saveConfig(this.config)
    return { ...this.config }
  }

  resetConfig(): AppConfig {
    this.config = { ...DEFAULT_CONFIG }
    this.saveConfig(this.config)
    return { ...this.config }
  }

  // 获取特定配置项
  getTheme(): AppConfig['theme'] {
    return this.config.theme
  }

  getDefaultPackageManager(): AppConfig['defaultPackageManager'] {
    return this.config.defaultPackageManager
  }

  getMaxConcurrentProjects(): number {
    return this.config.maxConcurrentProjects
  }

  getLanguage(): AppConfig['language'] {
    return this.config.language
  }

  // 设置特定配置项
  setTheme(theme: AppConfig['theme']): void {
    this.updateConfig({ theme })
  }

  setDefaultPackageManager(packageManager: AppConfig['defaultPackageManager']): void {
    this.updateConfig({ defaultPackageManager: packageManager })
  }

  setWindowBounds(bounds: AppConfig['windowBounds']): void {
    this.updateConfig({ windowBounds: bounds })
  }

  setLanguage(language: AppConfig['language']): void {
    this.updateConfig({ language })
  }

  // 验证配置
  validateConfig(config: Partial<AppConfig>): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (config.theme && !['light', 'dark', 'system'].includes(config.theme)) {
      errors.push('Invalid theme value')
    }

    if (config.defaultPackageManager && !['npm', 'pnpm', 'yarn'].includes(config.defaultPackageManager)) {
      errors.push('Invalid package manager')
    }

    if (config.maxConcurrentProjects && (config.maxConcurrentProjects < 1 || config.maxConcurrentProjects > 20)) {
      errors.push('Max concurrent projects must be between 1 and 20')
    }

    if (config.language && !['zh-CN', 'en-US'].includes(config.language)) {
      errors.push('Invalid language')
    }

    if (config.logLevel && !['info', 'warn', 'error'].includes(config.logLevel)) {
      errors.push('Invalid log level')
    }

    return {
      valid: errors.length === 0,
      errors
    }
  }

  // 导出配置
  exportConfig(): string {
    return JSON.stringify(this.config, null, 2)
  }

  // 导入配置
  importConfig(configJson: string): { success: boolean; error?: string } {
    try {
      const importedConfig = JSON.parse(configJson)
      const validation = this.validateConfig(importedConfig)
      
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid configuration: ${validation.errors.join(', ')}`
        }
      }

      this.config = { ...DEFAULT_CONFIG, ...importedConfig }
      this.saveConfig(this.config)
      
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid JSON format'
      }
    }
  }
}