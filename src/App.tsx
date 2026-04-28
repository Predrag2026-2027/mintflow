import React, { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'
import Revenue from './pages/Revenue'
import PL from './pages/PL'
import CashFlow from './pages/CashFlow'
import Reports from './pages/Reports'
import Partners from './pages/Partners'
import Settings from './pages/Settings'
import Sidebar from './components/Sidebar'

export type Page = 'dashboard' | 'transactions' | 'revenue' | 'pl' | 'cashflow' | 'reports' | 'partners' | 'settings'

interface NavProps { page: Page; setPage: (p: Page) => void }
export const NavContext = React.createContext<NavProps>({ page: 'dashboard', setPage: () => {} })

function AppContent() {
  const { user, loading } = useAuth()
  const [page, setPage] = useState<Page>('dashboard')

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontFamily: "'Inter', system-ui, sans-serif", color: '#888' }}>
      Loading Mintflow...
    </div>
  )

  if (!user) return <Login />

  return (
    <NavContext.Provider value={{ page, setPage }}>
      <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#FAF9F7' }}>
        <Sidebar />
        <main style={{ flex: 1, overflow: 'auto' }}>
          {page === 'dashboard'    && <Dashboard />}
          {page === 'transactions' && <Transactions />}
          {page === 'revenue'      && <Revenue />}
          {page === 'pl'           && <PL />}
          {page === 'cashflow'     && <CashFlow />}
          {page === 'reports'      && <Reports />}
          {page === 'partners'     && <Partners />}
          {page === 'settings'     && <Settings />}
        </main>
      </div>
    </NavContext.Provider>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App