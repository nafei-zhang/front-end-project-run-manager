"use strict";
var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => {
  __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
  return value;
};
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const child_process = require("child_process");
class ProjectManager {
  constructor() {
    __publicField(this, "projectsFilePath");
    __publicField(this, "projects", []);
    this.projectsFilePath = path.join(electron.app.getPath("userData"), "projects.json");
    this.loadProjects();
  }
  loadProjects() {
    try {
      if (fs.existsSync(this.projectsFilePath)) {
        const data = fs.readFileSync(this.projectsFilePath, "utf-8");
        const projectsData = JSON.parse(data);
        this.projects = projectsData.projects || [];
      } else {
        this.projects = [];
        this.saveProjects();
      }
    } catch (error) {
      console.error("Failed to load projects:", error);
      this.projects = [];
    }
  }
  saveProjects() {
    console.log("[ProjectManager] saveProjects called, projects to save:", this.projects.length);
    console.log("[ProjectManager] Projects data:", this.projects);
    console.log("[ProjectManager] Saving to file:", this.projectsFilePath);
    try {
      const data = { projects: this.projects };
      fs.writeFileSync(this.projectsFilePath, JSON.stringify(data, null, 2));
      console.log("[ProjectManager] Successfully saved projects to file");
    } catch (error) {
      console.error("[ProjectManager] Failed to save projects:", error);
    }
  }
  getAllProjects() {
    console.log("[ProjectManager] getAllProjects called, returning:", this.projects.length, "projects");
    return [...this.projects];
  }
  getProject(id) {
    return this.projects.find((project) => project.id === id);
  }
  createProject(projectData) {
    console.log("[ProjectManager] createProject called with data:", projectData);
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let startCommand = projectData.startCommand || "dev";
    try {
      const packageJsonPath = path.join(projectData.path, "package.json");
      console.log("[ProjectManager] Checking package.json at:", packageJsonPath);
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
        const scripts = packageJson.scripts || {};
        console.log("[ProjectManager] Found scripts:", scripts);
        if (scripts.dev) {
          startCommand = "dev";
        } else if (scripts.start) {
          startCommand = "start";
        } else if (scripts.serve) {
          startCommand = "serve";
        }
      } else {
        console.log("[ProjectManager] package.json not found at path");
      }
    } catch (error) {
      console.warn("[ProjectManager] Failed to read package.json:", error);
    }
    const project = {
      id: crypto.randomUUID(),
      name: projectData.name,
      path: projectData.path,
      packageManager: projectData.packageManager,
      startCommand,
      status: "stopped",
      createdAt: now,
      updatedAt: now
    };
    console.log("[ProjectManager] Created project object:", project);
    console.log("[ProjectManager] Current projects count before add:", this.projects.length);
    this.projects.push(project);
    console.log("[ProjectManager] Current projects count after add:", this.projects.length);
    console.log("[ProjectManager] Calling saveProjects...");
    this.saveProjects();
    console.log("[ProjectManager] saveProjects completed");
    return project;
  }
  updateProject(id, updates) {
    const projectIndex = this.projects.findIndex((project) => project.id === id);
    if (projectIndex === -1)
      return null;
    this.projects[projectIndex] = {
      ...this.projects[projectIndex],
      ...updates,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    this.saveProjects();
    return this.projects[projectIndex];
  }
  // 新增：重置所有项目状态为停止状态（应用启动时调用）
  resetAllProjectsToStopped() {
    console.log("[ProjectManager] Resetting all projects to stopped status");
    let hasChanges = false;
    this.projects.forEach((project) => {
      if (project.status === "running" || project.pid || project.url) {
        console.log("[ProjectManager] Resetting project:", project.id, project.name);
        project.status = "stopped";
        project.pid = void 0;
        project.url = void 0;
        project.port = void 0;
        project.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        hasChanges = true;
      }
    });
    if (hasChanges) {
      console.log("[ProjectManager] Saving updated project states");
      this.saveProjects();
    } else {
      console.log("[ProjectManager] No projects needed status reset");
    }
  }
  deleteProject(id) {
    const projectIndex = this.projects.findIndex((project) => project.id === id);
    if (projectIndex === -1) {
      return false;
    }
    this.projects.splice(projectIndex, 1);
    this.saveProjects();
    return true;
  }
  // 检测项目的包管理器
  detectPackageManager(projectPath) {
    if (fs.existsSync(path.join(projectPath, "pnpm-lock.yaml"))) {
      return "pnpm";
    }
    if (fs.existsSync(path.join(projectPath, "yarn.lock"))) {
      return "yarn";
    }
    return "npm";
  }
  // 验证项目路径
  validateProjectPath(projectPath) {
    return fs.existsSync(path.join(projectPath, "package.json"));
  }
}
class ProcessManager {
  constructor(logManager2) {
    __publicField(this, "runningProcesses", /* @__PURE__ */ new Map());
    __publicField(this, "logManager");
    __publicField(this, "onProjectStatusChange");
    // 添加 URL 检测回调
    __publicField(this, "onUrlDetected");
    this.logManager = logManager2;
  }
  setProjectStatusChangeCallback(callback) {
    this.onProjectStatusChange = callback;
  }
  async startProject(project) {
    console.log("[ProcessManager] startProject called for project:", project.id, project.name);
    try {
      if (this.runningProcesses.has(project.id)) {
        console.log("[ProcessManager] Project is already running");
        return { success: false, error: "Project is already running" };
      }
      const command = this.buildCommand(project.packageManager, project.startCommand);
      console.log("[ProcessManager] Starting command:", command.cmd, command.args.join(" "));
      const childProcess = child_process.spawn(command.cmd, command.args, {
        cwd: project.path,
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
        env: { ...process.env, FORCE_COLOR: "1" }
      });
      if (!childProcess.pid) {
        console.log("[ProcessManager] Failed to get PID from child process");
        return { success: false, error: "Failed to start process" };
      }
      console.log("[ProcessManager] Process started with PID:", childProcess.pid);
      const processInfo = {
        projectId: project.id,
        process: childProcess,
        pid: childProcess.pid,
        startTime: /* @__PURE__ */ new Date()
      };
      this.runningProcesses.set(project.id, processInfo);
      console.log("[ProcessManager] Added process to running processes list");
      console.log("[ProcessManager] Current running processes:", Array.from(this.runningProcesses.keys()));
      this.setupLogListeners(project.id, childProcess);
      childProcess.on("exit", (code, signal) => {
        console.log("[ProcessManager] Process exited:", project.id, "code:", code, "signal:", signal);
        this.runningProcesses.delete(project.id);
        console.log("[ProcessManager] Removed process from running list on exit");
        this.logManager.addLog(project.id, {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          level: code === 0 ? "info" : "error",
          message: `Process exited with code ${code} ${signal ? `(${signal})` : ""}`
        });
      });
      childProcess.on("error", (error) => {
        console.log("[ProcessManager] Process error:", project.id, error.message);
        this.runningProcesses.delete(project.id);
        console.log("[ProcessManager] Removed process from running list on error");
        this.logManager.addLog(project.id, {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          level: "error",
          message: `Process error: ${error.message}`
        });
      });
      this.logManager.addLog(project.id, {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        level: "info",
        message: `Starting project: ${command.cmd} ${command.args.join(" ")}`
      });
      console.log("[ProcessManager] Process started successfully");
      return { success: true, pid: childProcess.pid };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.log("[ProcessManager] Failed to start project:", errorMessage);
      return { success: false, error: errorMessage };
    }
  }
  async stopProject(projectId) {
    console.log("[ProcessManager] stopProject called for projectId:", projectId);
    console.log("[ProcessManager] Current running processes:", Array.from(this.runningProcesses.keys()));
    console.log("[ProcessManager] Total running processes count:", this.runningProcesses.size);
    const processInfo = this.runningProcesses.get(projectId);
    if (!processInfo) {
      console.log("[ProcessManager] No running process found for projectId:", projectId);
      console.log("[ProcessManager] Process may have already stopped, treating as success");
      return true;
    }
    console.log("[ProcessManager] Found running process, PID:", processInfo.pid);
    return new Promise((resolve) => {
      let isResolved = false;
      let forceKillTimeout = null;
      const cleanup = () => {
        if (!isResolved) {
          isResolved = true;
          if (forceKillTimeout) {
            clearTimeout(forceKillTimeout);
          }
          this.runningProcesses.delete(projectId);
          console.log("[ProcessManager] Removed process from running processes list");
        }
      };
      const onExit = (code, signal) => {
        console.log(`[ProcessManager] Process ${projectId} exited with code ${code}, signal ${signal}`);
        cleanup();
        this.logManager.addLog(projectId, {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          level: "info",
          message: `Project stopped (code: ${code}, signal: ${signal})`
        });
        if (this.onProjectStatusChange) {
          console.log(`[ProcessManager] Notifying project status change to stopped for ${projectId}`);
          this.onProjectStatusChange(projectId, "stopped");
        }
        if (!isResolved) {
          resolve(true);
        }
      };
      const onError = (error) => {
        console.log(`[ProcessManager] Process ${projectId} error during stop:`, error.message);
        if (error.message.includes("WebSocket") || error.message.includes("RSV1")) {
          console.log("[ProcessManager] WebSocket error detected, treating as normal termination");
          this.logManager.addLog(projectId, {
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            level: "info",
            message: "Project stopped (WebSocket connection closed)"
          });
        } else {
          this.logManager.addLog(projectId, {
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            level: "warn",
            message: `Process error during stop: ${error.message}`
          });
        }
        cleanup();
        if (!isResolved) {
          resolve(true);
        }
      };
      processInfo.process.once("exit", onExit);
      processInfo.process.once("error", onError);
      try {
        this.logManager.addLog(projectId, {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          level: "info",
          message: "Stopping project..."
        });
        console.log("[ProcessManager] Sending SIGTERM to process for graceful shutdown");
        processInfo.process.kill("SIGTERM");
        forceKillTimeout = setTimeout(() => {
          if (!isResolved) {
            console.log("[ProcessManager] Process did not exit gracefully, sending SIGKILL");
            try {
              process.kill(processInfo.pid, 0);
              console.log("[ProcessManager] Process still exists, force killing");
              processInfo.process.kill("SIGKILL");
              this.logManager.addLog(projectId, {
                timestamp: (/* @__PURE__ */ new Date()).toISOString(),
                level: "warn",
                message: "Process force killed after timeout"
              });
            } catch (checkError) {
              console.log("[ProcessManager] Process already terminated during force kill check");
            }
            setTimeout(() => {
              if (!isResolved) {
                console.log("[ProcessManager] Force resolving after SIGKILL");
                cleanup();
                resolve(true);
              }
            }, 1e3);
          }
        }, 5e3);
        console.log("[ProcessManager] Graceful stop initiated, waiting for process to exit...");
      } catch (error) {
        console.error("[ProcessManager] Failed to send stop signal:", error);
        this.logManager.addLog(projectId, {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          level: "error",
          message: `Failed to stop project: ${error instanceof Error ? error.message : "Unknown error"}`
        });
        cleanup();
        resolve(false);
      }
    });
  }
  stopAllProjects() {
    for (const [projectId] of this.runningProcesses) {
      this.stopProject(projectId);
    }
  }
  getRunningProjects() {
    return Array.from(this.runningProcesses.keys());
  }
  isProjectRunning(projectId) {
    return this.runningProcesses.has(projectId);
  }
  getProcessInfo(projectId) {
    return this.runningProcesses.get(projectId);
  }
  buildCommand(packageManager, startCommand) {
    if (startCommand.includes(" ")) {
      const parts = startCommand.trim().split(/\s+/);
      return { cmd: parts[0], args: parts.slice(1) };
    }
    switch (packageManager) {
      case "pnpm":
        return { cmd: "pnpm", args: ["run", startCommand] };
      case "yarn":
        return { cmd: "yarn", args: [startCommand] };
      case "npm":
      default:
        return { cmd: "npm", args: ["run", startCommand] };
    }
  }
  setupLogListeners(projectId, childProcess) {
    var _a, _b;
    (_a = childProcess.stdout) == null ? void 0 : _a.on("data", (data) => {
      const message = data.toString().trim();
      if (message) {
        this.extractAndSaveUrl(projectId, message);
        this.logManager.addLog(projectId, {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          level: "info",
          message: this.cleanLogMessage(message)
        });
      }
    });
    (_b = childProcess.stderr) == null ? void 0 : _b.on("data", (data) => {
      const message = data.toString().trim();
      if (message) {
        this.extractAndSaveUrl(projectId, message);
        const level = this.isErrorMessage(message) ? "error" : "warn";
        this.logManager.addLog(projectId, {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          level,
          message: this.cleanLogMessage(message)
        });
      }
    });
  }
  extractAndSaveUrl(projectId, message) {
    console.log(`[ProcessManager] Checking message for URL patterns: "${message}"`);
    const urlPatterns = [
      // Vite: Local: http://localhost:5173/
      /Local:\s*https?:\/\/[^\s]+/i,
      // Vue CLI: App running at: - Local: http://localhost:8080/
      /Local:\s*https?:\/\/[^\s]+/i,
      // Create React App: Local: http://localhost:3000
      /Local:\s*https?:\/\/[^\s]+/i,
      // Next.js: ready - started server on 0.0.0.0:3000, url: http://localhost:3000
      /url:\s*https?:\/\/[^\s]+/i,
      // 通用模式: http://localhost:端口
      /https?:\/\/localhost:\d+\/?/i,
      // 通用模式: http://127.0.0.1:端口
      /https?:\/\/127\.0\.0\.1:\d+\/?/i
    ];
    for (const pattern of urlPatterns) {
      const match = message.match(pattern);
      if (match) {
        let url = match[0];
        console.log(`[ProcessManager] Found URL match: "${url}" using pattern: ${pattern}`);
        url = url.replace(/^(Local:\s*|url:\s*)/i, "").trim();
        if (!url.endsWith("/")) {
          url += "/";
        }
        const portMatch = url.match(/:(\d+)/);
        const port = portMatch ? parseInt(portMatch[1]) : void 0;
        console.log(`[ProcessManager] Detected URL for project ${projectId}: ${url}, port: ${port}`);
        if (this.onUrlDetected) {
          console.log(`[ProcessManager] Calling URL detected callback for project ${projectId}`);
          this.onUrlDetected(projectId, url, port);
        } else {
          console.log(`[ProcessManager] No URL detected callback set`);
        }
        this.logManager.addLog(projectId, {
          timestamp: (/* @__PURE__ */ new Date()).toISOString(),
          level: "info",
          message: `🌐 项目已启动，访问地址: ${url}`
        });
        break;
      }
    }
    if (!message.match(/Local:|url:|localhost|127\.0\.0\.1/i))
      ;
    else {
      console.log(`[ProcessManager] No URL pattern matched for message: "${message}"`);
    }
  }
  setUrlDetectedCallback(callback) {
    this.onUrlDetected = callback;
  }
  cleanLogMessage(message) {
    return message.replace(/\x1b\[[0-9;]*m/g, "");
  }
  isErrorMessage(message) {
    const errorKeywords = ["error", "failed", "exception", "cannot", "unable"];
    const lowerMessage = message.toLowerCase();
    return errorKeywords.some((keyword) => lowerMessage.includes(keyword));
  }
}
class LogManager {
  constructor() {
    __publicField(this, "logs", /* @__PURE__ */ new Map());
    __publicField(this, "maxLogsPerProject", 500);
    __publicField(this, "mainWindow");
  }
  setMainWindow(window) {
    this.mainWindow = window;
  }
  addLog(projectId, logEntry) {
    if (!this.logs.has(projectId)) {
      this.logs.set(projectId, []);
    }
    const projectLogs = this.logs.get(projectId);
    projectLogs.push(logEntry);
    if (projectLogs.length > this.maxLogsPerProject) {
      projectLogs.shift();
    }
    this.sendLogToRenderer(projectId, logEntry);
  }
  getMemoryLogs(projectId) {
    return this.logs.get(projectId) || [];
  }
  getAllMemoryLogs() {
    const result = {};
    for (const [projectId, logs] of this.logs) {
      result[projectId] = [...logs];
    }
    return result;
  }
  clearProjectLogs(projectId) {
    this.logs.delete(projectId);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("logs:cleared", projectId);
    }
  }
  clearAllLogs() {
    this.logs.clear();
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("logs:allCleared");
    }
  }
  getLogStats(projectId) {
    const logs = this.logs.get(projectId) || [];
    return {
      total: logs.length,
      errors: logs.filter((log) => log.level === "error").length,
      warnings: logs.filter((log) => log.level === "warn").length
    };
  }
  // 获取最近的错误日志
  getRecentErrors(projectId, limit = 10) {
    const logs = this.logs.get(projectId) || [];
    return logs.filter((log) => log.level === "error").slice(-limit);
  }
  // 搜索日志
  searchLogs(projectId, query, level) {
    const logs = this.logs.get(projectId) || [];
    const lowerQuery = query.toLowerCase();
    return logs.filter((log) => {
      const matchesQuery = log.message.toLowerCase().includes(lowerQuery);
      const matchesLevel = !level || log.level === level;
      return matchesQuery && matchesLevel;
    });
  }
  sendLogToRenderer(projectId, logEntry) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send("logs:newEntry", {
        projectId,
        logEntry
      });
    }
  }
  // 获取内存使用情况
  getMemoryUsage() {
    let totalLogs = 0;
    let estimatedMemoryBytes = 0;
    for (const [projectId, logs] of this.logs) {
      totalLogs += logs.length;
      for (const log of logs) {
        estimatedMemoryBytes += JSON.stringify(log).length * 2;
      }
      estimatedMemoryBytes += projectId.length * 2;
    }
    return {
      totalProjects: this.logs.size,
      totalLogs,
      estimatedMemoryKB: Math.round(estimatedMemoryBytes / 1024)
    };
  }
  // 清理过期项目的日志（当项目被删除时调用）
  cleanupProjectLogs(projectId) {
    this.logs.delete(projectId);
  }
}
const DEFAULT_CONFIG = {
  theme: "system",
  autoStart: false,
  minimizeToTray: true,
  showNotifications: true,
  defaultPackageManager: "npm",
  maxConcurrentProjects: 5,
  language: "en-US",
  logLevel: "info"
};
class ConfigManager {
  constructor() {
    __publicField(this, "configFilePath");
    __publicField(this, "config");
    this.configFilePath = path.join(electron.app.getPath("userData"), "app-config.json");
    this.config = this.loadConfig();
  }
  loadConfig() {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const data = fs.readFileSync(this.configFilePath, "utf-8");
        const savedConfig = JSON.parse(data);
        return { ...DEFAULT_CONFIG, ...savedConfig };
      } else {
        this.saveConfig(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG };
      }
    } catch (error) {
      console.error("Failed to load config:", error);
      return { ...DEFAULT_CONFIG };
    }
  }
  saveConfig(config) {
    try {
      fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2));
    } catch (error) {
      console.error("Failed to save config:", error);
    }
  }
  getConfig() {
    return { ...this.config };
  }
  updateConfig(updates) {
    this.config = { ...this.config, ...updates };
    this.saveConfig(this.config);
    return { ...this.config };
  }
  resetConfig() {
    this.config = { ...DEFAULT_CONFIG };
    this.saveConfig(this.config);
    return { ...this.config };
  }
  // 获取特定配置项
  getTheme() {
    return this.config.theme;
  }
  getDefaultPackageManager() {
    return this.config.defaultPackageManager;
  }
  getMaxConcurrentProjects() {
    return this.config.maxConcurrentProjects;
  }
  getLanguage() {
    return this.config.language;
  }
  // 设置特定配置项
  setTheme(theme) {
    this.updateConfig({ theme });
  }
  setDefaultPackageManager(packageManager) {
    this.updateConfig({ defaultPackageManager: packageManager });
  }
  setWindowBounds(bounds) {
    this.updateConfig({ windowBounds: bounds });
  }
  setLanguage(language) {
    this.updateConfig({ language });
  }
  // 验证配置
  validateConfig(config) {
    const errors = [];
    if (config.theme && !["light", "dark", "system"].includes(config.theme)) {
      errors.push("Invalid theme value");
    }
    if (config.defaultPackageManager && !["npm", "pnpm", "yarn"].includes(config.defaultPackageManager)) {
      errors.push("Invalid package manager");
    }
    if (config.maxConcurrentProjects && (config.maxConcurrentProjects < 1 || config.maxConcurrentProjects > 20)) {
      errors.push("Max concurrent projects must be between 1 and 20");
    }
    if (config.language && !["zh-CN", "en-US"].includes(config.language)) {
      errors.push("Invalid language");
    }
    if (config.logLevel && !["info", "warn", "error"].includes(config.logLevel)) {
      errors.push("Invalid log level");
    }
    return {
      valid: errors.length === 0,
      errors
    };
  }
  // 导出配置
  exportConfig() {
    return JSON.stringify(this.config, null, 2);
  }
  // 导入配置
  importConfig(configJson) {
    try {
      const importedConfig = JSON.parse(configJson);
      const validation = this.validateConfig(importedConfig);
      if (!validation.valid) {
        return {
          success: false,
          error: `Invalid configuration: ${validation.errors.join(", ")}`
        };
      }
      this.config = { ...DEFAULT_CONFIG, ...importedConfig };
      this.saveConfig(this.config);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Invalid JSON format"
      };
    }
  }
}
let projectManager;
let processManager;
let logManager;
let configManager;
let mainWindow = null;
const isDev = process.env.NODE_ENV === "development";
function createWindow() {
  var _a, _b, _c, _d;
  const config = configManager ? configManager.getConfig() : null;
  mainWindow = new electron.BrowserWindow({
    width: ((_a = config == null ? void 0 : config.windowBounds) == null ? void 0 : _a.width) || 1200,
    height: ((_b = config == null ? void 0 : config.windowBounds) == null ? void 0 : _b.height) || 800,
    x: (_c = config == null ? void 0 : config.windowBounds) == null ? void 0 : _c.x,
    y: (_d = config == null ? void 0 : config.windowBounds) == null ? void 0 : _d.y,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js")
    },
    titleBarStyle: "hiddenInset",
    show: false
  });
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
  mainWindow.once("ready-to-show", () => {
    mainWindow == null ? void 0 : mainWindow.show();
  });
  mainWindow.on("close", () => {
    if (mainWindow && configManager) {
      const bounds = mainWindow.getBounds();
      configManager.updateConfig({
        windowBounds: bounds
      });
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function initializeServices() {
  configManager = new ConfigManager();
  projectManager = new ProjectManager();
  logManager = new LogManager();
  processManager = new ProcessManager(logManager);
  processManager.setUrlDetectedCallback((projectId, url, port) => {
    console.log(`[Main] URL detected for project ${projectId}: ${url}`);
    projectManager.updateProject(projectId, {
      url,
      port
    });
  });
  processManager.setProjectStatusChangeCallback((projectId, status) => {
    console.log(`[Main] Project status change for ${projectId}: ${status}`);
    if (status === "stopped") {
      projectManager.updateProject(projectId, {
        status: "stopped",
        pid: void 0,
        url: void 0,
        port: void 0
      });
    }
  });
  projectManager.resetAllProjectsToStopped();
}
function setupIpcHandlers() {
  electron.ipcMain.handle("projects:getAll", () => projectManager.getAllProjects());
  electron.ipcMain.handle("projects:create", (_, projectData) => projectManager.createProject(projectData));
  electron.ipcMain.handle("projects:update", (_, id, updates) => projectManager.updateProject(id, updates));
  electron.ipcMain.handle("projects:delete", (_, id) => projectManager.deleteProject(id));
  electron.ipcMain.handle("projects:getRunning", () => processManager.getRunningProjects());
  electron.ipcMain.handle("projects:start", async (_, id) => {
    const project = projectManager.getProject(id);
    if (!project)
      return { success: false, error: "Project not found" };
    const result = await processManager.startProject(project);
    if (result.success) {
      projectManager.updateProject(id, {
        status: "running",
        pid: result.pid
      });
    }
    return result;
  });
  electron.ipcMain.handle("projects:stop", async (_, id) => {
    console.log("[IPC] projects:stop called for id:", id);
    const success = await processManager.stopProject(id);
    console.log("[IPC] processManager.stopProject result:", success);
    if (success) {
      console.log("[IPC] Updating project status to stopped");
      projectManager.updateProject(id, {
        status: "stopped",
        pid: void 0
      });
      console.log("[IPC] Project status updated successfully");
    } else {
      console.log("[IPC] Failed to stop project, not updating status");
    }
    console.log("[IPC] Returning success:", success);
    return success;
  });
  electron.ipcMain.handle("projects:getStatus", (_, id) => {
    const project = projectManager.getProject(id);
    return project ? project.status : "stopped";
  });
  electron.ipcMain.handle("logs:getMemoryLogs", (_, projectId) => logManager.getMemoryLogs(projectId));
  electron.ipcMain.handle("logs:clearAll", () => logManager.clearAllLogs());
  electron.ipcMain.handle("logs:clear", (_, projectId) => logManager.clearProjectLogs(projectId));
  electron.ipcMain.handle("config:get", () => configManager.getConfig());
  electron.ipcMain.handle("config:update", (_, updates) => configManager.updateConfig(updates));
  electron.ipcMain.handle("config:reset", () => configManager.resetConfig());
  electron.ipcMain.handle("dialog:selectFolder", async () => {
    if (!mainWindow)
      return null;
    const result = await electron.dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory"],
      title: "选择项目文件夹"
    });
    return result.canceled ? null : result.filePaths[0];
  });
  electron.ipcMain.handle("system:openFolder", async (_, folderPath) => {
    try {
      await electron.shell.openPath(folderPath);
      return { success: true };
    } catch (error) {
      console.error("Failed to open folder:", error);
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}
electron.app.whenReady().then(() => {
  initializeServices();
  setupIpcHandlers();
  createWindow();
  if (mainWindow && logManager) {
    logManager.setMainWindow(mainWindow);
  }
  electron.app.on("activate", () => {
    if (electron.BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
electron.app.on("window-all-closed", () => {
  if (processManager) {
    processManager.stopAllProjects();
  }
  if (process.platform !== "darwin") {
    electron.app.quit();
  }
});
electron.app.on("before-quit", () => {
  if (processManager) {
    processManager.stopAllProjects();
  }
});
//# sourceMappingURL=main.js.map
