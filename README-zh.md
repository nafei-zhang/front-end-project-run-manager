# 前端项目管理器

![平台支持](https://img.shields.io/badge/平台-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![版本](https://img.shields.io/badge/版本-1.0.0-blue)
![许可证](https://img.shields.io/badge/许可证-MIT-green)
![Electron](https://img.shields.io/badge/Electron-27.0.0-47848F)
![React](https://img.shields.io/badge/React-18.2.0-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0.0-3178C6)

一个现代化的跨平台桌面应用程序，用于管理前端项目，支持国际化。

## 🌟 功能特性

- 🚀 **现代技术栈**：基于 Electron、React、TypeScript 和 Tailwind CSS 构建
- 🌍 **国际化支持**：完整支持英文和简体中文
- 📱 **跨平台兼容**：在 Windows、macOS 和 Linux 上无缝运行
- 🎨 **现代化界面**：简洁直观的界面，响应式设计
- 📊 **项目管理**：全面的项目跟踪和组织功能
- ⚡ **快速开发**：热重载和现代开发工具
- 🔧 **可定制性**：灵活的设置和配置选项
- 📝 **实时日志**：实时项目日志和状态监控

## 📋 系统要求

- **Node.js**：16.0.0 或更高版本
- **npm**：7.0.0 或更高版本（或 pnpm 6.0.0+）
- **操作系统**：
  - Windows 10/11
  - macOS 10.15 (Catalina) 或更高版本
  - Linux (Ubuntu 18.04+ 或同等版本)

## 🚀 快速开始

### 安装

1. **克隆仓库**

   ```bash
   git clone https://github.com/your-username/frontend-project-manager.git
   cd frontend-project-manager
   ```

2. **安装依赖**

   ```bash
   # 使用 npm
   npm install
   
   # 或使用 pnpm（推荐）
   pnpm install
   ```

3. **启动开发服务器**

   ```bash
   # 使用 npm
   npm run dev
   
   # 或使用 pnpm
   pnpm dev
   ```

4. **启动 Electron 应用**

   ```bash
   # 使用 npm
   npm run electron:dev
   
   # 或使用 pnpm
   pnpm electron:dev
   ```

### 生产环境构建

```bash
# 构建应用程序
npm run build

# 创建可分发的安装包
npm run dist
```

## 📖 使用说明

### 入门指南

1. **启动应用程序**：使用开发命令启动应用或运行构建的可执行文件
2. **语言选择**：在设置中选择您偏好的语言（English/中文）
3. **创建项目**：添加新的前端项目进行跟踪和管理
4. **监控进度**：查看实时日志和项目状态
5. **自定义设置**：调整应用程序行为和外观

### 主要功能

#### 项目管理

- 创建和组织多个前端项目
- 跟踪项目状态和进度
- 查看详细的项目信息和日志

#### 设置和自定义

- 在英文和中文之间切换语言
- 自定义应用程序外观和行为
- 配置项目特定设置

#### 实时监控

- 实时项目日志和状态更新
- 错误跟踪和调试信息
- 性能监控和分析

## 🏗️ 技术架构

```
┌─────────────────────────────────────────┐
│              主进程                      │
│         (Electron 主线程)               │
├─────────────────────────────────────────┤
│  • 窗口管理                             │
│  • IPC 通信                             │
│  • 文件系统操作                         │
│  • 系统集成                             │
└─────────────────┬───────────────────────┘
                  │
                  │ IPC 桥接
                  │
┌─────────────────▼───────────────────────┐
│            渲染进程                      │
│         (React 应用程序)                │
├─────────────────────────────────────────┤
│  • React 组件                           │
│  • 状态管理 (Zustand)                   │
│  • 国际化 (i18next)                     │
│  • UI 组件 (Tailwind CSS)               │
│  • 路由 (React Router)                  │
└─────────────────────────────────────────┘
```

### 技术栈

- **前端框架**：React 18.2.0
- **桌面框架**：Electron 27.0.0
- **编程语言**：TypeScript 5.0.0
- **样式框架**：Tailwind CSS 3.3.0
- **状态管理**：Zustand 4.4.0
- **国际化**：i18next 25.6.0
- **构建工具**：Vite 4.4.0
- **图标库**：Lucide React 0.279.0

## 📁 项目结构

```
frontend-project-manager/
├── electron/                 # Electron 主进程
│   ├── main.ts              # 主进程入口
│   ├── preload.ts           # 预加载脚本
│   └── services/            # 后端服务
├── src/                     # React 应用程序
│   ├── components/          # 可复用组件
│   ├── pages/              # 应用程序页面
│   ├── hooks/              # 自定义 React hooks
│   ├── stores/             # Zustand 状态存储
│   ├── i18n/               # 国际化
│   ├── types/              # TypeScript 类型定义
│   └── App.tsx             # 主应用组件
├── dist/                   # 构建后的应用程序
├── dist-electron/          # 编译后的 Electron 文件
├── package.json           # 依赖和脚本
├── vite.config.ts         # Vite 配置
├── tailwind.config.js     # Tailwind CSS 配置
└── tsconfig.json          # TypeScript 配置
```

## 🛠️ 开发指南

### 可用脚本

| 脚本 | 描述 |
|------|------|
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产环境构建 |
| `npm run preview` | 预览生产构建 |
| `npm run electron` | 运行 Electron 应用 |
| `npm run electron:dev` | 开发模式运行 Electron |
| `npm run build:electron` | 构建 Electron 应用 |
| `npm run dist` | 创建分发包 |

### 开发工作流

1. **启动开发环境**

   ```bash
   npm run dev          # 终端 1：启动 Vite 开发服务器
   npm run electron:dev # 终端 2：启动 Electron 应用
   ```

2. **代码结构指南**
   - 保持组件在 300 行以内
   - 使用 TypeScript 确保类型安全
   - 遵循 React 最佳实践
   - 实现响应式设计
   - 使用适当的国际化

3. **构建和测试**

   ```bash
   npm run build        # 构建应用程序
   npm run dist         # 创建可分发包
   ```

### 添加新功能

1. **组件**：添加到 `src/components/`
2. **页面**：添加到 `src/pages/`
3. **翻译**：更新 `src/i18n/locales/`
4. **类型**：在 `src/types/` 中定义
5. **状态**：使用 Zustand 在 `src/stores/` 中管理

## 🤝 贡献指南

我们欢迎贡献！请遵循以下指南：

### 开始贡献

1. Fork 仓库
2. 创建功能分支：`git checkout -b feature/amazing-feature`
3. 进行更改
4. 如适用，添加测试
5. 提交更改：`git commit -m 'Add amazing feature'`
6. 推送到分支：`git push origin feature/amazing-feature`
7. 打开 Pull Request

### 开发标准

- **代码风格**：遵循 TypeScript 和 React 最佳实践
- **提交信息**：使用约定式提交信息
- **测试**：为新功能添加测试
- **文档**：更新 README 和内联文档
- **国际化**：为新文本添加翻译

### Pull Request 流程

1. 确保所有测试通过
2. 根据需要更新文档
3. 为新文本添加翻译键
4. 遵循现有代码风格
5. 提供清晰的 PR 描述

## 📄 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

- [Electron](https://electronjs.org/) - 跨平台桌面应用
- [React](https://reactjs.org/) - UI 库
- [TypeScript](https://typescriptlang.org/) - 类型安全
- [Tailwind CSS](https://tailwindcss.com/) - 实用优先的 CSS
- [Vite](https://vitejs.dev/) - 快速构建工具
- [i18next](https://i18next.com/) - 国际化框架

## 📞 支持

如果您遇到任何问题或有疑问：

1. 查看 [Issues](https://github.com/your-username/frontend-project-manager/issues) 页面
2. 创建包含详细信息的新问题
3. 加入我们的社区讨论

---

**用 ❤️ 为前端开发社区打造**

[中文文档](README-zh.md) | [English Documentation](README.md)
