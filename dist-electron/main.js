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
const os = require("os");
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
    let startCommand = projectData.startCommand;
    if (!startCommand) {
      startCommand = "dev";
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
    } else {
      console.log("[ProjectManager] Using user-provided startCommand:", startCommand);
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
      console.log("[ProcessManager] Clearing logs for project before start:", project.id);
      this.logManager.clearProjectLogs(project.id);
      this.logManager.addLog(project.id, {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        level: "info",
        message: "Logs cleared before project start"
      });
      let command = this.buildCommand(project.packageManager, project.startCommand);
      if (this.shouldUseViteConfigRunner(project)) {
        command = this.applyViteConfigRunner(command, project.packageManager);
      }
      console.log("[ProcessManager] Starting command:", command.cmd, command.args.join(" "));
      console.log("[ProcessManager] Working directory:", project.path);
      console.log("[ProcessManager] Environment NODE_ENV:", process.env.NODE_ENV || "undefined");
      this.clearViteTempCache(project.id, project.path);
      const childProcess = child_process.spawn(command.cmd, command.args, {
        cwd: project.path,
        stdio: ["pipe", "pipe", "pipe"],
        shell: true,
        env: {
          ...process.env,
          FORCE_COLOR: "1",
          // 确保 PATH 包含常见的 Node.js 和包管理器路径
          PATH: this.getEnhancedPath()
        }
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
        if (this.onProjectStatusChange) {
          console.log(`[ProcessManager] Notifying project status change to stopped on exit for ${project.id}`);
          this.onProjectStatusChange(project.id, "stopped");
        }
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
        if (this.onProjectStatusChange) {
          console.log(`[ProcessManager] Notifying project status change to stopped on error for ${project.id}`);
          this.onProjectStatusChange(project.id, "stopped");
        }
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
      const cleanup = () => {
        if (!isResolved) {
          isResolved = true;
          this.runningProcesses.delete(projectId);
          console.log("[ProcessManager] Removed process from running processes list");
        }
      };
      this.logManager.addLog(projectId, {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        level: "info",
        message: "Force stopping project and all child processes..."
      });
      try {
        if (process.platform === "win32") {
          console.log("[ProcessManager] Using taskkill to force terminate process tree on Windows");
          const { spawn: spawn2 } = require("child_process");
          const taskkill = spawn2("taskkill", ["/pid", processInfo.pid.toString(), "/t", "/f"], {
            stdio: "pipe"
          });
          taskkill.on("close", (code) => {
            console.log(`[ProcessManager] taskkill exited with code ${code}`);
            this.logManager.addLog(projectId, {
              timestamp: (/* @__PURE__ */ new Date()).toISOString(),
              level: "info",
              message: `Process tree terminated (taskkill exit code: ${code})`
            });
            if (this.onProjectStatusChange) {
              console.log(`[ProcessManager] Notifying project status change to stopped for ${projectId}`);
              this.onProjectStatusChange(projectId, "stopped");
            }
            cleanup();
            if (!isResolved) {
              resolve(true);
            }
          });
          taskkill.on("error", (error) => {
            console.error("[ProcessManager] taskkill error:", error);
            try {
              console.log("[ProcessManager] Fallback to SIGKILL after taskkill failure");
              processInfo.process.kill("SIGKILL");
              this.logManager.addLog(projectId, {
                timestamp: (/* @__PURE__ */ new Date()).toISOString(),
                level: "warn",
                message: `Process force killed with SIGKILL (taskkill failed: ${error.message})`
              });
              if (this.onProjectStatusChange) {
                this.onProjectStatusChange(projectId, "stopped");
              }
              cleanup();
              if (!isResolved) {
                resolve(true);
              }
            } catch (killError) {
              console.error("[ProcessManager] SIGKILL also failed:", killError);
              this.logManager.addLog(projectId, {
                timestamp: (/* @__PURE__ */ new Date()).toISOString(),
                level: "error",
                message: `Failed to stop process: ${killError instanceof Error ? killError.message : "Unknown error"}`
              });
              cleanup();
              resolve(false);
            }
          });
        } else {
          console.log("[ProcessManager] Using SIGKILL on non-Windows system");
          try {
            process.kill(-processInfo.pid, "SIGKILL");
            console.log("[ProcessManager] Sent SIGKILL to process group");
          } catch (groupError) {
            console.log("[ProcessManager] Process group kill failed, trying single process kill");
            processInfo.process.kill("SIGKILL");
          }
          this.logManager.addLog(projectId, {
            timestamp: (/* @__PURE__ */ new Date()).toISOString(),
            level: "info",
            message: "Process force killed with SIGKILL"
          });
          if (this.onProjectStatusChange) {
            this.onProjectStatusChange(projectId, "stopped");
          }
          cleanup();
          resolve(true);
        }
      } catch (error) {
        console.error("[ProcessManager] Failed to force stop process:", error);
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
    const isProduction = process.env.NODE_ENV === "production" || !process.env.NODE_ENV;
    switch (packageManager) {
      case "pnpm":
        const pnpmCmd = isProduction ? this.getCommandPath("pnpm") : "pnpm";
        return { cmd: pnpmCmd, args: ["run", startCommand] };
      case "yarn":
        const yarnCmd = isProduction ? this.getCommandPath("yarn") : "yarn";
        return { cmd: yarnCmd, args: [startCommand] };
      case "npm":
      default:
        const npmCmd = isProduction ? this.getCommandPath("npm") : "npm";
        return { cmd: npmCmd, args: ["run", startCommand] };
    }
  }
  getCommandPath(command) {
    const { execSync } = require("child_process");
    const fs2 = require("fs");
    const path2 = require("path");
    const os2 = require("os");
    const isWindows = process.platform === "win32";
    const commandWithExt = isWindows ? `${command}.cmd` : command;
    try {
      const findCommand = isWindows ? "where" : "which";
      const fullPath = execSync(`${findCommand} ${command}`, { encoding: "utf8" }).trim();
      if (fullPath) {
        const firstPath = fullPath.split("\n")[0].trim();
        console.log(`[ProcessManager] Found ${command} at: ${firstPath}`);
        return firstPath.includes(" ") ? `"${firstPath}"` : firstPath;
      }
    } catch (error) {
      console.warn(`[ProcessManager] Could not find ${command} using system command, trying common paths`);
    }
    const commonPaths = [];
    if (isWindows) {
      const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
      const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
      const appData = process.env["APPDATA"] || path2.join(os2.homedir(), "AppData", "Roaming");
      const localAppData = process.env["LOCALAPPDATA"] || path2.join(os2.homedir(), "AppData", "Local");
      commonPaths.push(
        path2.join(programFiles, "nodejs", `${command}.cmd`),
        path2.join(programFilesX86, "nodejs", `${command}.cmd`),
        path2.join(appData, "npm", `${command}.cmd`),
        path2.join(localAppData, "npm", `${command}.cmd`),
        path2.join(os2.homedir(), "AppData", "Roaming", "npm", `${command}.cmd`)
      );
      const nvmPath = process.env["NVM_HOME"];
      if (nvmPath) {
        commonPaths.push(path2.join(nvmPath, `${command}.cmd`));
      }
      const voltaHome = process.env["VOLTA_HOME"] || path2.join(os2.homedir(), ".volta");
      commonPaths.push(path2.join(voltaHome, "bin", `${command}.cmd`));
    } else {
      const homeDir = process.env.HOME || os2.homedir();
      commonPaths.push(
        `/usr/local/bin/${command}`,
        `/opt/homebrew/bin/${command}`,
        `/usr/bin/${command}`,
        `${homeDir}/.volta/bin/${command}`
      );
      if (homeDir) {
        try {
          const nvmDir = path2.join(homeDir, ".nvm", "versions", "node");
          if (fs2.existsSync(nvmDir)) {
            const versions = fs2.readdirSync(nvmDir);
            for (const version of versions) {
              const binPath = path2.join(nvmDir, version, "bin", command);
              commonPaths.push(binPath);
            }
          }
        } catch (error) {
          console.warn("[ProcessManager] Failed to scan NVM paths:", error);
        }
        try {
          const fnmDir = path2.join(homeDir, ".fnm", "node-versions");
          if (fs2.existsSync(fnmDir)) {
            const versions = fs2.readdirSync(fnmDir);
            for (const version of versions) {
              const binPath = path2.join(fnmDir, version, "installation", "bin", command);
              commonPaths.push(binPath);
            }
          }
        } catch (error) {
          console.warn("[ProcessManager] Failed to scan FNM paths:", error);
        }
      }
    }
    for (const cmdPath of commonPaths) {
      try {
        if (fs2.existsSync(cmdPath)) {
          console.log(`[ProcessManager] Found ${command} at: ${cmdPath}`);
          return cmdPath.includes(" ") ? `"${cmdPath}"` : cmdPath;
        }
      } catch (error) {
        continue;
      }
    }
    console.warn(`[ProcessManager] Could not find full path for ${command}, using original command`);
    return isWindows ? commandWithExt : command;
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
    const normalizedMessage = this.cleanLogMessage(message);
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
      /https?:\/\/127\.0\.0\.1:\d+\/?/i,
      // 通用模式: http://0.0.0.0:端口
      /https?:\/\/0\.0\.0\.0:\d+\/?/i,
      // 通用模式: http://[::1]:端口
      /https?:\/\/\[\:\:1\]:\d+\/?/i
    ];
    for (const pattern of urlPatterns) {
      const match = normalizedMessage.match(pattern);
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
        return;
      }
    }
    const startedPortMatch = normalizedMessage.match(/started server on [^:]+:(\d+)/i);
    if (startedPortMatch) {
      const port = parseInt(startedPortMatch[1], 10);
      const url = `http://localhost:${port}/`;
      if (this.onUrlDetected) {
        this.onUrlDetected(projectId, url, port);
      }
      this.logManager.addLog(projectId, {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        level: "info",
        message: `🌐 项目已启动，访问地址: ${url}`
      });
      return;
    }
    if (!normalizedMessage.match(/Local:|url:|localhost|127\.0\.0\.1|0\.0\.0\.0|started server on/i))
      ;
    else {
      console.log(`[ProcessManager] No URL pattern matched for message: "${normalizedMessage}"`);
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
  getEnhancedPath() {
    const currentPath = process.env.PATH || "";
    const fs2 = require("fs");
    const path2 = require("path");
    const os2 = require("os");
    const isWindows = process.platform === "win32";
    const pathSeparator = isWindows ? ";" : ":";
    const additionalPaths = [];
    if (isWindows) {
      const programFiles = process.env["ProgramFiles"] || "C:\\Program Files";
      const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
      const appData = process.env["APPDATA"] || path2.join(os2.homedir(), "AppData", "Roaming");
      const localAppData = process.env["LOCALAPPDATA"] || path2.join(os2.homedir(), "AppData", "Local");
      additionalPaths.push(
        path2.join(programFiles, "nodejs"),
        path2.join(programFilesX86, "nodejs"),
        path2.join(appData, "npm"),
        path2.join(localAppData, "npm"),
        path2.join(os2.homedir(), "AppData", "Roaming", "npm")
      );
      const nvmPath = process.env["NVM_HOME"];
      if (nvmPath) {
        additionalPaths.push(nvmPath);
      }
      const voltaHome = process.env["VOLTA_HOME"] || path2.join(os2.homedir(), ".volta");
      additionalPaths.push(path2.join(voltaHome, "bin"));
    } else {
      additionalPaths.push(
        "/usr/local/bin",
        "/opt/homebrew/bin",
        "/usr/bin",
        "/bin"
      );
      const homeDir = process.env.HOME || os2.homedir();
      if (homeDir) {
        try {
          const nvmDir = path2.join(homeDir, ".nvm", "versions", "node");
          if (fs2.existsSync(nvmDir)) {
            const versions = fs2.readdirSync(nvmDir);
            for (const version of versions) {
              const binPath = path2.join(nvmDir, version, "bin");
              if (fs2.existsSync(binPath)) {
                additionalPaths.push(binPath);
              }
            }
          }
        } catch (error) {
          console.warn("[ProcessManager] Failed to resolve NVM paths:", error);
        }
        additionalPaths.push(`${homeDir}/.volta/bin`);
        try {
          const fnmDir = path2.join(homeDir, ".fnm", "node-versions");
          if (fs2.existsSync(fnmDir)) {
            const versions = fs2.readdirSync(fnmDir);
            for (const version of versions) {
              const binPath = path2.join(fnmDir, version, "installation", "bin");
              if (fs2.existsSync(binPath)) {
                additionalPaths.push(binPath);
              }
            }
          }
        } catch (error) {
          console.warn("[ProcessManager] Failed to resolve FNM paths:", error);
        }
      }
    }
    const uniquePaths = [.../* @__PURE__ */ new Set([...currentPath.split(pathSeparator), ...additionalPaths])].filter((pathStr) => {
      if (!pathStr)
        return false;
      try {
        return fs2.existsSync(pathStr);
      } catch {
        return false;
      }
    });
    const enhancedPath = uniquePaths.join(pathSeparator);
    console.log(`[ProcessManager] Enhanced PATH: ${enhancedPath}`);
    return enhancedPath;
  }
  clearViteTempCache(projectId, projectPath) {
    try {
      const viteTempPath = path.join(projectPath, "node_modules", ".vite-temp");
      if (!fs.existsSync(viteTempPath)) {
        return;
      }
      fs.rmSync(viteTempPath, { recursive: true, force: true });
      this.logManager.addLog(projectId, {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        level: "info",
        message: "Cleared Vite temporary cache before project start"
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      this.logManager.addLog(projectId, {
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        level: "warn",
        message: `Failed to clear Vite temporary cache: ${errorMessage}`
      });
    }
  }
  shouldUseViteConfigRunner(project) {
    const commandText = project.startCommand.trim();
    if (!commandText) {
      return false;
    }
    if (commandText.toLowerCase().includes("--configloader")) {
      return false;
    }
    const viteMajor = this.getViteMajorVersion(project.path);
    if (!viteMajor || viteMajor < 6) {
      return false;
    }
    if (this.isDirectViteCommand(commandText)) {
      return true;
    }
    const scriptName = this.resolveScriptName(project.packageManager, commandText);
    if (!scriptName) {
      return false;
    }
    const scriptContent = this.getScriptContent(project.path, scriptName);
    if (!scriptContent) {
      return false;
    }
    return scriptContent.toLowerCase().includes("vite");
  }
  getViteMajorVersion(projectPath) {
    var _a, _b;
    try {
      const packageJsonPath = path.join(projectPath, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        return null;
      }
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      const viteVersionRaw = ((_a = packageJson == null ? void 0 : packageJson.devDependencies) == null ? void 0 : _a.vite) || ((_b = packageJson == null ? void 0 : packageJson.dependencies) == null ? void 0 : _b.vite);
      if (typeof viteVersionRaw !== "string") {
        return null;
      }
      const versionMatch = viteVersionRaw.match(/\d+/);
      if (!versionMatch) {
        return null;
      }
      const major = parseInt(versionMatch[0], 10);
      return Number.isFinite(major) ? major : null;
    } catch {
      return null;
    }
  }
  isDirectViteCommand(commandText) {
    var _a;
    const tokens = commandText.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return false;
    }
    if (tokens[0].includes("vite")) {
      return true;
    }
    return tokens[0] === "npx" && ((_a = tokens[1]) == null ? void 0 : _a.includes("vite")) === true;
  }
  resolveScriptName(packageManager, commandText) {
    const tokens = commandText.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) {
      return null;
    }
    if (tokens.length === 1) {
      return tokens[0];
    }
    const firstToken = tokens[0].toLowerCase();
    if (firstToken.includes("pnpm") || firstToken.includes("npm")) {
      if (tokens[1] === "run" && tokens[2]) {
        return tokens[2];
      }
      if (tokens[1] && !tokens[1].startsWith("-")) {
        return tokens[1];
      }
      return null;
    }
    if (firstToken.includes("yarn")) {
      if (tokens[1] === "run" && tokens[2]) {
        return tokens[2];
      }
      if (tokens[1] && !tokens[1].startsWith("-")) {
        return tokens[1];
      }
      return null;
    }
    if (packageManager === "yarn" || packageManager === "npm" || packageManager === "pnpm") {
      return tokens[0];
    }
    return null;
  }
  getScriptContent(projectPath, scriptName) {
    var _a;
    try {
      const packageJsonPath = path.join(projectPath, "package.json");
      if (!fs.existsSync(packageJsonPath)) {
        return null;
      }
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
      const script = (_a = packageJson == null ? void 0 : packageJson.scripts) == null ? void 0 : _a[scriptName];
      return typeof script === "string" ? script : null;
    } catch {
      return null;
    }
  }
  applyViteConfigRunner(command, packageManager) {
    if (command.args.some((arg) => arg.toLowerCase() === "--configloader")) {
      return command;
    }
    const lowerCmd = command.cmd.toLowerCase().replace(/"/g, "");
    const isDirectVite = lowerCmd.includes("vite");
    if (isDirectVite) {
      return {
        cmd: command.cmd,
        args: [...command.args, "--configLoader", "runner"]
      };
    }
    if (lowerCmd.includes("yarn") || packageManager === "yarn") {
      return {
        cmd: command.cmd,
        args: [...command.args, "--configLoader", "runner"]
      };
    }
    return {
      cmd: command.cmd,
      args: [...command.args, "--", "--configLoader", "runner"]
    };
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
  logLevel: "info",
  projectOrder: []
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
const _ShortcutConfigManager = class _ShortcutConfigManager {
  constructor() {
    __publicField(this, "configDir");
    __publicField(this, "backupDir");
    __publicField(this, "configFilePath");
    __publicField(this, "startupLogPath");
    __publicField(this, "secretKey");
    this.configDir = this.resolveConfigDir();
    this.backupDir = path.join(this.configDir, "backups");
    this.configFilePath = path.join(this.configDir, "config.json");
    this.startupLogPath = path.join(this.configDir, "startup.log");
    this.secretKey = crypto.createHash("sha256").update(path.join(this.configDir, "front-end-project-run-manager-key")).digest();
    this.ensureDirectories();
    this.ensureConfig();
  }
  getShortcuts() {
    const payload = this.readPayloadWithRecovery();
    return payload.shortcuts;
  }
  createShortcut(name, projects) {
    const sanitizedName = this.validateAndSanitizeName(name);
    if (projects.length === 0) {
      throw new Error("No projects selected");
    }
    const shortcuts = this.getShortcuts();
    const duplicated = shortcuts.some((item) => item.name.toLowerCase() === sanitizedName.toLowerCase());
    if (duplicated) {
      throw new Error("Shortcut name already exists");
    }
    if (shortcuts.length >= _ShortcutConfigManager.MAX_SHORTCUTS) {
      throw new Error(`Maximum ${_ShortcutConfigManager.MAX_SHORTCUTS} shortcuts allowed`);
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const shortcut = {
      id: crypto.randomBytes(8).toString("hex"),
      name: sanitizedName,
      projects: projects.map((project) => ({ ...project })),
      createdAt: now,
      updatedAt: now
    };
    this.writePayload({ shortcuts: [...shortcuts, shortcut] });
    return shortcut;
  }
  deleteShortcut(shortcutId) {
    const shortcuts = this.getShortcuts();
    const next = shortcuts.filter((item) => item.id !== shortcutId);
    if (next.length === shortcuts.length) {
      return false;
    }
    this.writePayload({ shortcuts: next });
    return true;
  }
  updateShortcutName(shortcutId, name) {
    const sanitizedName = this.validateAndSanitizeName(name);
    const shortcuts = this.getShortcuts();
    const target = shortcuts.find((item) => item.id === shortcutId);
    if (!target) {
      throw new Error("Shortcut not found");
    }
    const duplicated = shortcuts.some(
      (item) => item.id !== shortcutId && item.name.toLowerCase() === sanitizedName.toLowerCase()
    );
    if (duplicated) {
      throw new Error("Shortcut name already exists");
    }
    const updatedShortcut = {
      ...target,
      name: sanitizedName,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    const next = shortcuts.map((item) => item.id === shortcutId ? updatedShortcut : item);
    this.writePayload({ shortcuts: next });
    return updatedShortcut;
  }
  reorderShortcuts(orderedIds) {
    const shortcuts = this.getShortcuts();
    const map = new Map(shortcuts.map((item) => [item.id, item]));
    const deduped = Array.from(new Set(orderedIds)).filter((id) => map.has(id));
    const missing = shortcuts.map((item) => item.id).filter((id) => !deduped.includes(id));
    const finalOrder = [...deduped, ...missing];
    const next = finalOrder.map((id) => map.get(id)).filter(Boolean);
    this.writePayload({ shortcuts: next });
    return next;
  }
  exportShortcuts() {
    const data = {
      version: _ShortcutConfigManager.VERSION,
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      shortcuts: this.getShortcuts()
    };
    return JSON.stringify(data, null, 2);
  }
  importShortcuts(rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      const sourceShortcuts = Array.isArray(parsed == null ? void 0 : parsed.shortcuts) ? parsed.shortcuts : [];
      const validShortcuts = sourceShortcuts.map((item) => this.normalizeShortcut(item)).filter(Boolean);
      if (validShortcuts.length === 0) {
        return { success: false, imported: 0, error: "No valid shortcuts found" };
      }
      const dedupedByName = /* @__PURE__ */ new Map();
      validShortcuts.forEach((item) => {
        const key = item.name.toLowerCase();
        if (!dedupedByName.has(key)) {
          dedupedByName.set(key, item);
        }
      });
      const merged = Array.from(dedupedByName.values()).slice(0, _ShortcutConfigManager.MAX_SHORTCUTS);
      this.writePayload({ shortcuts: merged });
      return { success: true, imported: merged.length };
    } catch (error) {
      return {
        success: false,
        imported: 0,
        error: error instanceof Error ? error.message : "Import failed"
      };
    }
  }
  appendStartupLogs(logs) {
    const lines = logs.map((log) => {
      return `${(/* @__PURE__ */ new Date()).toISOString()} [${log.success ? "SUCCESS" : "FAILED"}] ${log.projectName}(${log.projectId}) ${log.message}`;
    });
    try {
      fs.appendFileSync(this.startupLogPath, `${lines.join("\n")}
`);
    } catch (error) {
      console.error("[ShortcutConfigManager] Failed to append startup logs:", error);
    }
  }
  resolveConfigDir() {
    const candidates = [
      path.join(os.homedir(), ".config", "front-end-project-run-manager"),
      path.join(electron.app.getPath("userData"), "shortcut-config"),
      path.join(process.cwd(), ".runtime-config")
    ];
    for (const candidate of candidates) {
      try {
        if (!fs.existsSync(candidate)) {
          fs.mkdirSync(candidate, { recursive: true });
        }
        return candidate;
      } catch (error) {
        continue;
      }
    }
    throw new Error("No writable config directory available");
  }
  ensureDirectories() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }
  ensureConfig() {
    if (!fs.existsSync(this.configFilePath)) {
      this.writePayload({ shortcuts: [] }, false);
      return;
    }
    this.readPayloadWithRecovery();
  }
  readPayloadWithRecovery() {
    try {
      return this.readPayload();
    } catch (error) {
      const restored = this.restoreLatestBackup();
      if (!restored) {
        this.writePayload({ shortcuts: [] }, false);
        return { shortcuts: [] };
      }
      try {
        return this.readPayload();
      } catch (retryError) {
        this.writePayload({ shortcuts: [] }, false);
        return { shortcuts: [] };
      }
    }
  }
  readPayload() {
    const raw = fs.readFileSync(this.configFilePath, "utf-8");
    const parsed = JSON.parse(raw);
    const migrated = this.migrateIfNeeded(parsed);
    if (migrated) {
      return migrated;
    }
    const encrypted = parsed;
    if (!encrypted.encrypted || !encrypted.payload || !encrypted.iv) {
      throw new Error("Invalid encrypted config");
    }
    const currentChecksum = crypto.createHash("sha256").update(`${encrypted.version}|${encrypted.iv}|${encrypted.payload}`).digest("hex");
    if (currentChecksum !== encrypted.checksum) {
      throw new Error("Config checksum mismatch");
    }
    const ivBuffer = Buffer.from(encrypted.iv, "hex");
    const encryptedBuffer = Buffer.from(encrypted.payload, "base64");
    const decipher = crypto.createDecipheriv("aes-256-cbc", this.secretKey, ivBuffer);
    const decrypted = Buffer.concat([decipher.update(encryptedBuffer), decipher.final()]).toString("utf-8");
    const payload = JSON.parse(decrypted);
    return {
      shortcuts: this.normalizeShortcuts(payload.shortcuts || [])
    };
  }
  migrateIfNeeded(parsed) {
    if (parsed.encrypted) {
      return null;
    }
    const legacy = parsed;
    const shortcuts = this.normalizeShortcuts(legacy.shortcuts || []);
    const payload = { shortcuts };
    this.writePayload(payload);
    return payload;
  }
  writePayload(payload, backupCurrent = true) {
    const normalized = {
      shortcuts: this.normalizeShortcuts(payload.shortcuts || []).slice(0, _ShortcutConfigManager.MAX_SHORTCUTS)
    };
    if (backupCurrent && fs.existsSync(this.configFilePath)) {
      this.createBackup();
    }
    const ivBuffer = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", this.secretKey, ivBuffer);
    const plainText = JSON.stringify(normalized);
    const encryptedBuffer = Buffer.concat([cipher.update(plainText, "utf-8"), cipher.final()]);
    const encryptedPayload = encryptedBuffer.toString("base64");
    const iv = ivBuffer.toString("hex");
    const checksum = crypto.createHash("sha256").update(`${_ShortcutConfigManager.VERSION}|${iv}|${encryptedPayload}`).digest("hex");
    const output = {
      version: _ShortcutConfigManager.VERSION,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
      encrypted: true,
      payload: encryptedPayload,
      iv,
      checksum
    };
    fs.writeFileSync(this.configFilePath, JSON.stringify(output, null, 2));
    this.trimBackups();
  }
  createBackup() {
    const backupName = `config-${Date.now()}.json`;
    const backupPath = path.join(this.backupDir, backupName);
    fs.copyFileSync(this.configFilePath, backupPath);
  }
  trimBackups() {
    if (!fs.existsSync(this.backupDir)) {
      return;
    }
    const backups = fs.readdirSync(this.backupDir).map((file) => {
      const filePath = path.join(this.backupDir, file);
      return { file, filePath, mtime: fs.statSync(filePath).mtimeMs };
    }).sort((a, b) => b.mtime - a.mtime);
    backups.slice(_ShortcutConfigManager.MAX_BACKUPS).forEach((item) => {
      fs.rmSync(item.filePath, { force: true });
    });
  }
  restoreLatestBackup() {
    if (!fs.existsSync(this.backupDir)) {
      return false;
    }
    const backups = fs.readdirSync(this.backupDir).map((file) => {
      const filePath = path.join(this.backupDir, file);
      return { filePath, mtime: fs.statSync(filePath).mtimeMs };
    }).sort((a, b) => b.mtime - a.mtime);
    for (const backup of backups) {
      try {
        const content = fs.readFileSync(backup.filePath, "utf-8");
        JSON.parse(content);
        fs.writeFileSync(this.configFilePath, content);
        return true;
      } catch (error) {
        fs.unlinkSync(backup.filePath);
      }
    }
    return false;
  }
  normalizeShortcuts(shortcuts) {
    return shortcuts.map((item) => this.normalizeShortcut(item)).filter(Boolean);
  }
  normalizeShortcut(item) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const name = this.validateAndSanitizeName(item.name);
    const projects = Array.isArray(item.projects) ? item.projects : [];
    const normalizedProjects = projects.filter((project) => project && project.id && project.name && project.path && project.startCommand).map((project) => ({
      id: String(project.id),
      name: String(project.name),
      path: String(project.path),
      packageManager: ["npm", "pnpm", "yarn"].includes(project.packageManager) ? project.packageManager : "npm",
      startCommand: String(project.startCommand),
      autoRefreshLogs: typeof project.autoRefreshLogs === "boolean" ? project.autoRefreshLogs : void 0
    }));
    if (normalizedProjects.length === 0) {
      return null;
    }
    const now = (/* @__PURE__ */ new Date()).toISOString();
    return {
      id: item.id ? String(item.id) : crypto.randomBytes(8).toString("hex"),
      name,
      projects: normalizedProjects,
      createdAt: item.createdAt ? String(item.createdAt) : now,
      updatedAt: item.updatedAt ? String(item.updatedAt) : now
    };
  }
  validateAndSanitizeName(name) {
    const trimmed = String(name || "").trim();
    if (!trimmed) {
      throw new Error("Shortcut name is required");
    }
    if (trimmed.length > 20) {
      throw new Error("Shortcut name must be 20 characters or less");
    }
    if (!/^[a-zA-Z0-9_\-\u4e00-\u9fa5\s]+$/.test(trimmed)) {
      throw new Error("Shortcut name contains invalid characters");
    }
    return trimmed;
  }
};
__publicField(_ShortcutConfigManager, "VERSION", 2);
__publicField(_ShortcutConfigManager, "MAX_SHORTCUTS", 5);
__publicField(_ShortcutConfigManager, "MAX_BACKUPS", 5);
let ShortcutConfigManager = _ShortcutConfigManager;
let projectManager;
let processManager;
let logManager;
let configManager;
let shortcutConfigManager;
let mainWindow = null;
const isDev = process.env.NODE_ENV === "development";
function applyProjectOrder(items, order) {
  if (order.length === 0) {
    return items;
  }
  const indexMap = new Map(order.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const indexA = indexMap.get(a.id);
    const indexB = indexMap.get(b.id);
    if (indexA === void 0 && indexB === void 0)
      return 0;
    if (indexA === void 0)
      return 1;
    if (indexB === void 0)
      return -1;
    return indexA - indexB;
  });
}
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
  shortcutConfigManager = new ShortcutConfigManager();
  projectManager = new ProjectManager();
  logManager = new LogManager();
  processManager = new ProcessManager(logManager);
  processManager.setUrlDetectedCallback((projectId, url, port) => {
    console.log(`[Main] URL detected for project ${projectId}: ${url}`);
    const updatedProject = projectManager.updateProject(projectId, {
      url,
      port
    });
    if (mainWindow && updatedProject) {
      try {
        mainWindow.webContents.send("projects:projectUpdated", updatedProject);
      } catch (err) {
        console.warn("[Main] Failed to send projects:projectUpdated:", err);
      }
    }
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
    if (mainWindow) {
      try {
        mainWindow.webContents.send("projects:statusChanged", { id: projectId, status });
      } catch (err) {
        console.warn("[Main] Failed to send projects:statusChanged:", err);
      }
    }
  });
  projectManager.resetAllProjectsToStopped();
}
function setupIpcHandlers() {
  electron.ipcMain.handle("projects:getAll", () => {
    const projects = projectManager.getAllProjects();
    const { projectOrder } = configManager.getConfig();
    return applyProjectOrder(projects, projectOrder || []);
  });
  electron.ipcMain.handle("projects:create", (_, projectData) => {
    const project = projectManager.createProject(projectData);
    const { projectOrder } = configManager.getConfig();
    const nextOrder = [...(projectOrder || []).filter((id) => id !== project.id), project.id];
    configManager.updateConfig({ projectOrder: nextOrder });
    return project;
  });
  electron.ipcMain.handle("projects:update", (_, id, updates) => projectManager.updateProject(id, updates));
  electron.ipcMain.handle("projects:delete", (_, id) => {
    const success = projectManager.deleteProject(id);
    if (success) {
      const { projectOrder } = configManager.getConfig();
      const nextOrder = (projectOrder || []).filter((projectId) => projectId !== id);
      configManager.updateConfig({ projectOrder: nextOrder });
    }
    return success;
  });
  electron.ipcMain.handle("projects:reorder", (_, projectIds) => {
    const projects = projectManager.getAllProjects();
    const projectSet = new Set(projects.map((project) => project.id));
    const dedupedIds = Array.from(new Set(projectIds)).filter((id) => projectSet.has(id));
    const missingIds = projects.map((project) => project.id).filter((id) => !dedupedIds.includes(id));
    const normalizedOrder = [...dedupedIds, ...missingIds];
    configManager.updateConfig({ projectOrder: normalizedOrder });
    return true;
  });
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
    shortcutConfigManager.appendStartupLogs([{
      projectId: id,
      projectName: project.name,
      success: result.success,
      message: result.success ? `Started with PID ${result.pid || "N/A"}` : result.error || "Unknown error"
    }]);
    return result;
  });
  electron.ipcMain.handle("projects:startBatch", async (_, ids) => {
    const uniqueIds = Array.from(new Set(ids));
    const started = await Promise.all(uniqueIds.map(async (id) => {
      const project = projectManager.getProject(id);
      if (!project) {
        return { id, name: id, success: false, error: "Project not found" };
      }
      const result = await processManager.startProject(project);
      if (result.success) {
        projectManager.updateProject(id, {
          status: "running",
          pid: result.pid
        });
      }
      return {
        id,
        name: project.name,
        success: result.success,
        pid: result.pid,
        error: result.error
      };
    }));
    shortcutConfigManager.appendStartupLogs(
      started.map((item) => ({
        projectId: item.id,
        projectName: item.name,
        success: item.success,
        message: item.success ? `Started with PID ${item.pid || "N/A"}` : item.error || "Unknown error"
      }))
    );
    return started;
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
      if (mainWindow) {
        try {
          mainWindow.webContents.send("projects:statusChanged", { id, status: "stopped" });
        } catch (err) {
          console.warn("[IPC] Failed to send projects:statusChanged:", err);
        }
      }
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
  electron.ipcMain.handle("shortcuts:getAll", () => shortcutConfigManager.getShortcuts());
  electron.ipcMain.handle("shortcuts:create", (_, payload) => {
    const { name, projectIds } = payload;
    const uniqueIds = Array.from(new Set(projectIds));
    const allProjects = projectManager.getAllProjects();
    const projectMap = new Map(allProjects.map((project) => [project.id, project]));
    const selectedProjects = uniqueIds.map((id) => projectMap.get(id)).filter(Boolean).map((project) => ({
      id: project.id,
      name: project.name,
      path: project.path,
      packageManager: project.packageManager,
      startCommand: project.startCommand,
      autoRefreshLogs: !!project.autoRefreshLogs
    }));
    return shortcutConfigManager.createShortcut(name, selectedProjects);
  });
  electron.ipcMain.handle("shortcuts:delete", (_, id) => shortcutConfigManager.deleteShortcut(id));
  electron.ipcMain.handle("shortcuts:rename", (_, payload) => {
    return shortcutConfigManager.updateShortcutName(payload.id, payload.name);
  });
  electron.ipcMain.handle("shortcuts:reorder", (_, orderedIds) => shortcutConfigManager.reorderShortcuts(orderedIds));
  electron.ipcMain.handle("shortcuts:export", () => shortcutConfigManager.exportShortcuts());
  electron.ipcMain.handle("shortcuts:import", (_, rawJson) => shortcutConfigManager.importShortcuts(rawJson));
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
