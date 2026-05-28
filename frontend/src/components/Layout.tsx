import { useState, type ReactNode } from 'react'
import Sidebar from './Sidebar'
import { NamespaceProvider } from '../hooks/useNamespace'

interface LayoutProps {
  children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <NamespaceProvider>
      <div className="flex h-screen bg-slate-900">
        <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(!collapsed)} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </NamespaceProvider>
  )
}
