import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Server,
  Box,
  FileCode,
  ScrollText,
  AlertCircle,
  History,
  Monitor,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Globe,
  Sun,
  Moon,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useNamespace } from '../hooks/useNamespace'
import { useTheme } from '../hooks/useTheme'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

const navItems = [
  { to: '/dashboard', icon: LayoutDashboard, label: '대시보드' },
  { to: '/cluster', icon: Server, label: '클러스터 상태' },
  { to: '/images', icon: Box, label: '이미지' },
  { to: '/manifests', icon: FileCode, label: '매니페스트' },
  { to: '/logs', icon: ScrollText, label: '로그' },
  { to: '/issues', icon: AlertCircle, label: '이슈' },
  { to: '/history', icon: History, label: '히스토리' },
  { to: '/nodes', icon: Monitor, label: '노드 관리' },
]

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, logout } = useAuth()
  const { namespace, namespaces, setNamespace } = useNamespace()
  const { theme, toggle: toggleTheme } = useTheme()

  return (
    <aside
      className={`flex flex-col h-screen bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div className="flex items-center justify-between px-4 h-14 border-b border-slate-200 dark:border-slate-700">
        {!collapsed && (
          <span className="text-lg font-bold text-blue-600 dark:text-blue-400 whitespace-nowrap">K8s Manager</span>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <div className="px-3 py-3 border-b border-slate-200 dark:border-slate-700">
        {collapsed ? (
          <div className="flex justify-center">
            <Globe size={18} className="text-slate-600 dark:text-slate-400" />
          </div>
        ) : (
          <div>
            <label className="block text-xs text-slate-500 mb-1.5 px-1">네임스페이스</label>
            <select
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="all">전체</option>
              {namespaces.map((ns) => (
                <option key={ns} value={ns}>{ns}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
              }`
            }
          >
            <Icon size={20} className="flex-shrink-0" />
            {!collapsed && <span className="text-sm font-medium whitespace-nowrap">{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center text-sm font-bold flex-shrink-0">
            {user?.username?.charAt(0).toUpperCase() ?? 'U'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-800 dark:text-slate-200 truncate">{user?.username}</p>
              <p className="text-xs text-slate-500">{user?.role}</p>
            </div>
          )}
          <button
            onClick={toggleTheme}
            title={theme === 'dark' ? '라이트 모드' : '다크 모드'}
            className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors flex-shrink-0"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button
            onClick={logout}
            title="로그아웃"
            className="p-1.5 text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-colors flex-shrink-0"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
