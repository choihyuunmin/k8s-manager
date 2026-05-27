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
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

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

  return (
    <aside
      className={`flex flex-col h-screen bg-slate-800 border-r border-slate-700 transition-all duration-200 ${
        collapsed ? 'w-16' : 'w-60'
      }`}
    >
      <div className="flex items-center justify-between px-4 h-14 border-b border-slate-700">
        {!collapsed && (
          <span className="text-lg font-bold text-blue-400 whitespace-nowrap">K8s Manager</span>
        )}
        <button
          onClick={onToggle}
          className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      <nav className="flex-1 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 mx-2 px-3 py-2.5 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-500/15 text-blue-400'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
              }`
            }
          >
            <Icon size={20} className="flex-shrink-0" />
            {!collapsed && <span className="text-sm font-medium whitespace-nowrap">{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-700 p-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-sm font-bold flex-shrink-0">
            {user?.username?.charAt(0).toUpperCase() ?? 'U'}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-200 truncate">{user?.username}</p>
              <p className="text-xs text-slate-500">{user?.role}</p>
            </div>
          )}
          <button
            onClick={logout}
            title="로그아웃"
            className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded transition-colors flex-shrink-0"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  )
}
