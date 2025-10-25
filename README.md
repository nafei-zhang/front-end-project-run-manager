# Frontend Project Manager

![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)
![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Electron](https://img.shields.io/badge/Electron-27.0.0-47848F)
![React](https://img.shields.io/badge/React-18.2.0-61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0.0-3178C6)

A modern, cross-platform desktop application for managing frontend projects with internationalization support.

## 🌟 Features

- 🚀 **Modern Tech Stack**: Built with Electron, React, TypeScript, and Tailwind CSS
- 🌍 **Internationalization**: Full support for English and Simplified Chinese
- 📱 **Cross-Platform**: Works seamlessly on Windows, macOS, and Linux
- 🎨 **Modern UI**: Clean and intuitive interface with responsive design
- 📊 **Project Management**: Comprehensive project tracking and organization
- ⚡ **Fast Development**: Hot reload and modern development tools
- 🔧 **Customizable**: Flexible settings and configuration options
- 📝 **Real-time Logs**: Live project logs and status monitoring

## 📋 System Requirements

- **Node.js**: 16.0.0 or higher
- **npm**: 7.0.0 or higher (or pnpm 6.0.0+)
- **Operating System**:
  - Windows 10/11
  - macOS 10.15 (Catalina) or higher
  - Linux (Ubuntu 18.04+ or equivalent)

## 🚀 Quick Start

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-username/frontend-project-manager.git
   cd frontend-project-manager
   ```

2. **Install dependencies**

   ```bash
   # Using npm
   npm install
   
   # Or using pnpm (recommended)
   pnpm install
   ```

3. **Start development server**

   ```bash
   # Using npm
   npm run dev
   
   # Or using pnpm
   pnpm dev
   ```

4. **Launch Electron app**

   ```bash
   # Using npm
   npm run electron:dev
   
   # Or using pnpm
   pnpm electron:dev
   ```

### Building for Production

```bash
# Build the application
npm run build

# Create distributable packages
npm run dist
```

## 📖 Usage

### Getting Started

1. **Launch the Application**: Start the app using the development command or run the built executable
2. **Language Selection**: Choose your preferred language (English/中文) in the settings
3. **Create Projects**: Add new frontend projects to track and manage
4. **Monitor Progress**: View real-time logs and project status
5. **Customize Settings**: Adjust application behavior and appearance

### Key Features

#### Project Management

- Create and organize multiple frontend projects
- Track project status and progress
- View detailed project information and logs

#### Settings & Customization

- Switch between English and Chinese languages
- Customize application appearance and behavior
- Configure project-specific settings

#### Real-time Monitoring

- Live project logs and status updates
- Error tracking and debugging information
- Performance monitoring and analytics

## 🏗️ Technical Architecture

```
┌─────────────────────────────────────────┐
│              Main Process               │
│         (Electron Main Thread)         │
├─────────────────────────────────────────┤
│  • Window Management                    │
│  • IPC Communication                    │
│  • File System Operations              │
│  • System Integration                   │
└─────────────────┬───────────────────────┘
                  │
                  │ IPC Bridge
                  │
┌─────────────────▼───────────────────────┐
│            Renderer Process             │
│         (React Application)            │
├─────────────────────────────────────────┤
│  • React Components                     │
│  • State Management (Zustand)          │
│  • Internationalization (i18next)      │
│  • UI Components (Tailwind CSS)        │
│  • Routing (React Router)              │
└─────────────────────────────────────────┘
```

### Tech Stack

- **Frontend Framework**: React 18.2.0
- **Desktop Framework**: Electron 27.0.0
- **Language**: TypeScript 5.0.0
- **Styling**: Tailwind CSS 3.3.0
- **State Management**: Zustand 4.4.0
- **Internationalization**: i18next 25.6.0
- **Build Tool**: Vite 4.4.0
- **Icons**: Lucide React 0.279.0

## 📁 Project Structure

```
frontend-project-manager/
├── electron/                 # Electron main process
│   ├── main.ts              # Main process entry
│   ├── preload.ts           # Preload script
│   └── services/            # Backend services
├── src/                     # React application
│   ├── components/          # Reusable components
│   ├── pages/              # Application pages
│   ├── hooks/              # Custom React hooks
│   ├── stores/             # Zustand stores
│   ├── i18n/               # Internationalization
│   ├── types/              # TypeScript definitions
│   └── App.tsx             # Main App component
├── dist/                   # Built application
├── dist-electron/          # Compiled Electron files
├── package.json           # Dependencies and scripts
├── vite.config.ts         # Vite configuration
├── tailwind.config.js     # Tailwind CSS config
└── tsconfig.json          # TypeScript config
```

## 🛠️ Development Guide

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run electron` | Run Electron app |
| `npm run electron:dev` | Run Electron in development |
| `npm run build:electron` | Build Electron app |
| `npm run dist` | Create distribution packages |

### Development Workflow

1. **Start Development Environment**

   ```bash
   npm run dev          # Terminal 1: Start Vite dev server
   npm run electron:dev # Terminal 2: Start Electron app
   ```

2. **Code Structure Guidelines**
   - Keep components under 300 lines
   - Use TypeScript for type safety
   - Follow React best practices
   - Implement responsive design
   - Use proper internationalization

3. **Building and Testing**

   ```bash
   npm run build        # Build the application
   npm run dist         # Create distributable packages
   ```

### Adding New Features

1. **Components**: Add to `src/components/`
2. **Pages**: Add to `src/pages/`
3. **Translations**: Update `src/i18n/locales/`
4. **Types**: Define in `src/types/`
5. **State**: Manage with Zustand in `src/stores/`

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests if applicable
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Development Standards

- **Code Style**: Follow TypeScript and React best practices
- **Commits**: Use conventional commit messages
- **Testing**: Add tests for new features
- **Documentation**: Update README and inline docs
- **Internationalization**: Add translations for new text

### Pull Request Process

1. Ensure all tests pass
2. Update documentation as needed
3. Add translation keys for new text
4. Follow the existing code style
5. Provide clear PR description

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Electron](https://electronjs.org/) - Cross-platform desktop apps
- [React](https://reactjs.org/) - UI library
- [TypeScript](https://typescriptlang.org/) - Type safety
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [Vite](https://vitejs.dev/) - Fast build tool
- [i18next](https://i18next.com/) - Internationalization framework

## 📞 Support

If you encounter any issues or have questions:

1. Check the [Issues](https://github.com/your-username/frontend-project-manager/issues) page
2. Create a new issue with detailed information
3. Join our community discussions

---

**Made with ❤️ for the frontend development community**

[中文文档](README-zh.md) | [English Documentation](README.md)
