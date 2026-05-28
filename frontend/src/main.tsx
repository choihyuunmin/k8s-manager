import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'
import App from './App'
import { AuthProvider } from './hooks/useAuth'
import { ThemeProvider } from './hooks/useTheme'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ClusterPage from './pages/ClusterPage'
import ImagesPage from './pages/ImagesPage'
import ManifestsPage from './pages/ManifestsPage'
import ManifestEditPage from './pages/ManifestEditPage'
import LogsPage from './pages/LogsPage'
import IssuesPage from './pages/IssuesPage'
import HistoryPage from './pages/HistoryPage'
import NodesPage from './pages/NodesPage'
import ProtectedRoute from './components/ProtectedRoute'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<App />}>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/cluster" element={<ClusterPage />} />
              <Route path="/images" element={<ImagesPage />} />
              <Route path="/manifests" element={<ManifestsPage />} />
              <Route path="/manifests/new" element={<ManifestEditPage />} />
              <Route path="/manifests/:id" element={<ManifestEditPage />} />
              <Route path="/logs" element={<LogsPage />} />
              <Route path="/issues" element={<IssuesPage />} />
              <Route path="/history" element={<HistoryPage />} />
              <Route path="/nodes" element={<NodesPage />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
)
