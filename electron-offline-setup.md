# Electron 离线安装指南

## 方案一：预下载缓存包

### 步骤1：在有网络的机器上准备
```bash
# 创建临时目录
mkdir electron-offline
cd electron-offline

# 下载项目依赖（包括Electron）
npm pack electron@27.0.0
npm pack electron-builder@24.0.0

# 或者下载整个node_modules
npm install --production
tar -czf node_modules.tar.gz node_modules/
```

### 步骤2：传输到目标机器
将下载的包文件复制到Windows 11机器上

### 步骤3：离线安装
```bash
# 安装预下载的包
npm install electron-27.0.0.tgz
npm install electron-builder-24.0.0.tgz

# 或者解压node_modules
tar -xzf node_modules.tar.gz
```

## 方案二：手动下载二进制文件

### 步骤1：下载Electron二进制文件
从GitHub Release页面下载：
- URL: https://github.com/electron/electron/releases/tag/v27.0.0
- 文件: electron-v27.0.0-win32-x64.zip

### 步骤2：设置环境变量
```cmd
set ELECTRON_CACHE=C:\electron-cache
set ELECTRON_CUSTOM_DIR=27.0.0
```

### 步骤3：放置文件
将下载的zip文件放到：
`C:\electron-cache\27.0.0\electron-v27.0.0-win32-x64.zip`

## 方案三：使用离线npm registry

### 步骤1：创建本地registry
```bash
# 安装verdaccio（在有网络的机器上）
npm install -g verdaccio

# 启动本地registry
verdaccio

# 发布包到本地registry
npm publish --registry http://localhost:4873
```

### 步骤2：在目标机器配置
```bash
npm config set registry http://[本地服务器IP]:4873
```

## 方案四：使用pnpm离线模式

### 步骤1：创建离线store
```bash
# 在有网络的机器上
pnpm install --frozen-lockfile
pnpm store path  # 获取store路径

# 打包store
tar -czf pnpm-store.tar.gz [store路径]
```

### 步骤2：在目标机器恢复
```bash
# 解压store
tar -xzf pnpm-store.tar.gz -C [目标store路径]

# 离线安装
pnpm install --offline --frozen-lockfile
```

## 推荐方案

对于你的项目，推荐使用**方案一**，因为：
1. 简单易操作
2. 包含所有依赖
3. 不需要复杂配置

## 注意事项

1. 确保下载的Electron版本与package.json中的版本一致（27.0.0）
2. Windows 11需要对应的win32-x64架构
3. 如果使用electron-builder，也需要离线安装相关依赖
4. 建议在离线安装前先清理npm缓存：`npm cache clean --force`