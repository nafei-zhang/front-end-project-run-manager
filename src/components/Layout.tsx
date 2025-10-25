import React from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { 
  LayoutDashboard, 
  FolderOpen, 
  FileText, 
  Settings,
  Monitor
} from 'lucide-react'

const Layout: React.FC = () => {
  const { t } = useTranslation()
  
  const navItems = [
    { path: '/dashboard', icon: LayoutDashboard, label: t('navigation.dashboard') },
    { path: '/projects', icon: FolderOpen, label: t('navigation.projects') },
    { path: '/logs', icon: FileText, label: t('navigation.logs') },
    { path: '/settings', icon: Settings, label: t('navigation.settings') }
  ]

  return (
    <div className="flex h-screen bg-background">
      {/* 侧边栏 */}
      <div className="w-64 bg-card border-r border-border flex flex-col">
        {/* 标题 */}
        <div className="p-6 border-b border-border drag-region">
          <div className="flex items-center space-x-3">
            <Monitor className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-lg font-semibold text-foreground">
                {t('app.title')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t('app.subtitle')}
              </p>
            </div>
          </div>
        </div>

        {/* 导航菜单 */}
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {navItems.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                    }`
                  }
                >
                  <item.icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* 主内容区域 */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export default Layout