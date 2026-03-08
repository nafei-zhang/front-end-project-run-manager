import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, unlinkSync, writeFileSync, appendFileSync, copyFileSync } from 'fs'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { homedir } from 'os'
import { join } from 'path'
import { app } from 'electron'

export interface ShortcutProjectSnapshot {
  id: string
  name: string
  path: string
  packageManager: 'npm' | 'pnpm' | 'yarn'
  startCommand: string
}

export interface ProjectShortcut {
  id: string
  name: string
  projects: ShortcutProjectSnapshot[]
  createdAt: string
  updatedAt: string
}

interface ShortcutConfigFileV1 {
  version?: number
  shortcuts?: ProjectShortcut[]
}

interface ShortcutConfigFileV2 {
  version: number
  updatedAt: string
  encrypted: true
  payload: string
  iv: string
  checksum: string
}

interface DecryptedShortcutPayload {
  shortcuts: ProjectShortcut[]
}

export class ShortcutConfigManager {
  private static readonly VERSION = 2
  private static readonly MAX_SHORTCUTS = 5
  private static readonly MAX_BACKUPS = 5
  private configDir: string
  private backupDir: string
  private configFilePath: string
  private startupLogPath: string
  private secretKey: Buffer

  constructor() {
    this.configDir = this.resolveConfigDir()
    this.backupDir = join(this.configDir, 'backups')
    this.configFilePath = join(this.configDir, 'config.json')
    this.startupLogPath = join(this.configDir, 'startup.log')
    this.secretKey = createHash('sha256')
      .update(join(this.configDir, 'front-end-project-run-manager-key'))
      .digest()
    this.ensureDirectories()
    this.ensureConfig()
  }

  getShortcuts(): ProjectShortcut[] {
    const payload = this.readPayloadWithRecovery()
    return payload.shortcuts
  }

  createShortcut(name: string, projects: ShortcutProjectSnapshot[]): ProjectShortcut {
    const sanitizedName = this.validateAndSanitizeName(name)
    if (projects.length === 0) {
      throw new Error('No projects selected')
    }

    const shortcuts = this.getShortcuts()
    const duplicated = shortcuts.some(item => item.name.toLowerCase() === sanitizedName.toLowerCase())
    if (duplicated) {
      throw new Error('Shortcut name already exists')
    }

    if (shortcuts.length >= ShortcutConfigManager.MAX_SHORTCUTS) {
      throw new Error(`Maximum ${ShortcutConfigManager.MAX_SHORTCUTS} shortcuts allowed`)
    }

    const now = new Date().toISOString()
    const shortcut: ProjectShortcut = {
      id: randomBytes(8).toString('hex'),
      name: sanitizedName,
      projects: projects.map(project => ({ ...project })),
      createdAt: now,
      updatedAt: now
    }

    this.writePayload({ shortcuts: [...shortcuts, shortcut] })
    return shortcut
  }

  deleteShortcut(shortcutId: string): boolean {
    const shortcuts = this.getShortcuts()
    const next = shortcuts.filter(item => item.id !== shortcutId)
    if (next.length === shortcuts.length) {
      return false
    }
    this.writePayload({ shortcuts: next })
    return true
  }

  updateShortcutName(shortcutId: string, name: string): ProjectShortcut {
    const sanitizedName = this.validateAndSanitizeName(name)
    const shortcuts = this.getShortcuts()
    const target = shortcuts.find(item => item.id === shortcutId)
    if (!target) {
      throw new Error('Shortcut not found')
    }

    const duplicated = shortcuts.some(
      item => item.id !== shortcutId && item.name.toLowerCase() === sanitizedName.toLowerCase()
    )
    if (duplicated) {
      throw new Error('Shortcut name already exists')
    }

    const updatedShortcut: ProjectShortcut = {
      ...target,
      name: sanitizedName,
      updatedAt: new Date().toISOString()
    }
    const next = shortcuts.map(item => (item.id === shortcutId ? updatedShortcut : item))
    this.writePayload({ shortcuts: next })
    return updatedShortcut
  }

  reorderShortcuts(orderedIds: string[]): ProjectShortcut[] {
    const shortcuts = this.getShortcuts()
    const map = new Map(shortcuts.map(item => [item.id, item]))
    const deduped = Array.from(new Set(orderedIds)).filter(id => map.has(id))
    const missing = shortcuts.map(item => item.id).filter(id => !deduped.includes(id))
    const finalOrder = [...deduped, ...missing]
    const next = finalOrder.map(id => map.get(id)!).filter(Boolean)
    this.writePayload({ shortcuts: next })
    return next
  }

  exportShortcuts(): string {
    const data = {
      version: ShortcutConfigManager.VERSION,
      exportedAt: new Date().toISOString(),
      shortcuts: this.getShortcuts()
    }
    return JSON.stringify(data, null, 2)
  }

  importShortcuts(rawJson: string): { success: boolean; imported: number; error?: string } {
    try {
      const parsed = JSON.parse(rawJson)
      const sourceShortcuts = Array.isArray(parsed?.shortcuts) ? parsed.shortcuts : []
      const validShortcuts: ProjectShortcut[] = sourceShortcuts
        .map((item: any) => this.normalizeShortcut(item))
        .filter(Boolean) as ProjectShortcut[]

      if (validShortcuts.length === 0) {
        return { success: false, imported: 0, error: 'No valid shortcuts found' }
      }

      const dedupedByName = new Map<string, ProjectShortcut>()
      validShortcuts.forEach(item => {
        const key = item.name.toLowerCase()
        if (!dedupedByName.has(key)) {
          dedupedByName.set(key, item)
        }
      })
      const merged = Array.from(dedupedByName.values()).slice(0, ShortcutConfigManager.MAX_SHORTCUTS)
      this.writePayload({ shortcuts: merged })
      return { success: true, imported: merged.length }
    } catch (error) {
      return {
        success: false,
        imported: 0,
        error: error instanceof Error ? error.message : 'Import failed'
      }
    }
  }

  appendStartupLogs(logs: Array<{ projectId: string; projectName: string; success: boolean; message: string }>): void {
    const lines = logs.map(log => {
      return `${new Date().toISOString()} [${log.success ? 'SUCCESS' : 'FAILED'}] ${log.projectName}(${log.projectId}) ${log.message}`
    })
    try {
      appendFileSync(this.startupLogPath, `${lines.join('\n')}\n`)
    } catch (error) {
      console.error('[ShortcutConfigManager] Failed to append startup logs:', error)
    }
  }

  private resolveConfigDir(): string {
    const candidates = [
      join(homedir(), '.config', 'front-end-project-run-manager'),
      join(app.getPath('userData'), 'shortcut-config'),
      join(process.cwd(), '.runtime-config')
    ]

    for (const candidate of candidates) {
      try {
        if (!existsSync(candidate)) {
          mkdirSync(candidate, { recursive: true })
        }
        return candidate
      } catch (error) {
        continue
      }
    }

    throw new Error('No writable config directory available')
  }

  private ensureDirectories(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true })
    }
    if (!existsSync(this.backupDir)) {
      mkdirSync(this.backupDir, { recursive: true })
    }
  }

  private ensureConfig(): void {
    if (!existsSync(this.configFilePath)) {
      this.writePayload({ shortcuts: [] }, false)
      return
    }
    this.readPayloadWithRecovery()
  }

  private readPayloadWithRecovery(): DecryptedShortcutPayload {
    try {
      return this.readPayload()
    } catch (error) {
      const restored = this.restoreLatestBackup()
      if (!restored) {
        this.writePayload({ shortcuts: [] }, false)
        return { shortcuts: [] }
      }
      try {
        return this.readPayload()
      } catch (retryError) {
        this.writePayload({ shortcuts: [] }, false)
        return { shortcuts: [] }
      }
    }
  }

  private readPayload(): DecryptedShortcutPayload {
    const raw = readFileSync(this.configFilePath, 'utf-8')
    const parsed = JSON.parse(raw) as ShortcutConfigFileV2 | ShortcutConfigFileV1
    const migrated = this.migrateIfNeeded(parsed)
    if (migrated) {
      return migrated
    }
    const encrypted = parsed as ShortcutConfigFileV2
    if (!encrypted.encrypted || !encrypted.payload || !encrypted.iv) {
      throw new Error('Invalid encrypted config')
    }

    const currentChecksum = createHash('sha256')
      .update(`${encrypted.version}|${encrypted.iv}|${encrypted.payload}`)
      .digest('hex')

    if (currentChecksum !== encrypted.checksum) {
      throw new Error('Config checksum mismatch')
    }

    const ivBuffer = Buffer.from(encrypted.iv, 'hex')
    const encryptedBuffer = Buffer.from(encrypted.payload, 'base64')
    const decipher = createDecipheriv('aes-256-cbc', this.secretKey, ivBuffer)
    const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]).toString('utf-8')
    const payload = JSON.parse(decrypted) as DecryptedShortcutPayload

    return {
      shortcuts: this.normalizeShortcuts(payload.shortcuts || [])
    }
  }

  private migrateIfNeeded(parsed: ShortcutConfigFileV2 | ShortcutConfigFileV1): DecryptedShortcutPayload | null {
    if ((parsed as ShortcutConfigFileV2).encrypted) {
      return null
    }
    const legacy = parsed as ShortcutConfigFileV1
    const shortcuts = this.normalizeShortcuts(legacy.shortcuts || [])
    const payload = { shortcuts }
    this.writePayload(payload)
    return payload
  }

  private writePayload(payload: DecryptedShortcutPayload, backupCurrent = true): void {
    const normalized: DecryptedShortcutPayload = {
      shortcuts: this.normalizeShortcuts(payload.shortcuts || []).slice(0, ShortcutConfigManager.MAX_SHORTCUTS)
    }

    if (backupCurrent && existsSync(this.configFilePath)) {
      this.createBackup()
    }

    const ivBuffer = randomBytes(16)
    const cipher = createCipheriv('aes-256-cbc', this.secretKey, ivBuffer)
    const plainText = JSON.stringify(normalized)
    const encryptedBuffer = Buffer.concat([cipher.update(plainText, 'utf-8'), cipher.final()])
    const encryptedPayload = encryptedBuffer.toString('base64')
    const iv = ivBuffer.toString('hex')
    const checksum = createHash('sha256')
      .update(`${ShortcutConfigManager.VERSION}|${iv}|${encryptedPayload}`)
      .digest('hex')

    const output: ShortcutConfigFileV2 = {
      version: ShortcutConfigManager.VERSION,
      updatedAt: new Date().toISOString(),
      encrypted: true,
      payload: encryptedPayload,
      iv,
      checksum
    }

    writeFileSync(this.configFilePath, JSON.stringify(output, null, 2))
    this.trimBackups()
  }

  private createBackup(): void {
    const backupName = `config-${Date.now()}.json`
    const backupPath = join(this.backupDir, backupName)
    copyFileSync(this.configFilePath, backupPath)
  }

  private trimBackups(): void {
    if (!existsSync(this.backupDir)) {
      return
    }
    const backups = readdirSync(this.backupDir)
      .map(file => {
        const filePath = join(this.backupDir, file)
        return { file, filePath, mtime: statSync(filePath).mtimeMs }
      })
      .sort((a, b) => b.mtime - a.mtime)

    backups.slice(ShortcutConfigManager.MAX_BACKUPS).forEach(item => {
      rmSync(item.filePath, { force: true })
    })
  }

  private restoreLatestBackup(): boolean {
    if (!existsSync(this.backupDir)) {
      return false
    }
    const backups = readdirSync(this.backupDir)
      .map(file => {
        const filePath = join(this.backupDir, file)
        return { filePath, mtime: statSync(filePath).mtimeMs }
      })
      .sort((a, b) => b.mtime - a.mtime)

    for (const backup of backups) {
      try {
        const content = readFileSync(backup.filePath, 'utf-8')
        JSON.parse(content)
        writeFileSync(this.configFilePath, content)
        return true
      } catch (error) {
        unlinkSync(backup.filePath)
      }
    }
    return false
  }

  private normalizeShortcuts(shortcuts: any[]): ProjectShortcut[] {
    return shortcuts
      .map(item => this.normalizeShortcut(item))
      .filter(Boolean) as ProjectShortcut[]
  }

  private normalizeShortcut(item: any): ProjectShortcut | null {
    if (!item || typeof item !== 'object') {
      return null
    }
    const name = this.validateAndSanitizeName(item.name)
    const projects = Array.isArray(item.projects) ? item.projects : []
    const normalizedProjects = projects
      .filter((project: any) => project && project.id && project.name && project.path && project.startCommand)
      .map((project: any) => ({
        id: String(project.id),
        name: String(project.name),
        path: String(project.path),
        packageManager: ['npm', 'pnpm', 'yarn'].includes(project.packageManager) ? project.packageManager : 'npm',
        startCommand: String(project.startCommand)
      })) as ShortcutProjectSnapshot[]

    if (normalizedProjects.length === 0) {
      return null
    }
    const now = new Date().toISOString()
    return {
      id: item.id ? String(item.id) : randomBytes(8).toString('hex'),
      name,
      projects: normalizedProjects,
      createdAt: item.createdAt ? String(item.createdAt) : now,
      updatedAt: item.updatedAt ? String(item.updatedAt) : now
    }
  }

  private validateAndSanitizeName(name: string): string {
    const trimmed = String(name || '').trim()
    if (!trimmed) {
      throw new Error('Shortcut name is required')
    }
    if (trimmed.length > 20) {
      throw new Error('Shortcut name must be 20 characters or less')
    }
    if (!/^[a-zA-Z0-9_\-\u4e00-\u9fa5\s]+$/.test(trimmed)) {
      throw new Error('Shortcut name contains invalid characters')
    }
    return trimmed
  }
}
