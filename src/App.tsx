import React, { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Transactions from './pages/Transactions'

export type Page = 'dashboard' | 'transactions' | 'pl' | 'cashflow' | 'reports'

interface NavProps { page: Page; setPage: (p: Page) => void }
export const NavContext = React.createContext<NavProps>({ page:'dashboard', setPage:()=>{} })

function AppContent() {
  const { user, loading } = useAuth()
  const [page, setPage] = useState<Page>('dashboard')

  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',fontFamily:'system-ui,sans-serif',color:'#888'}}>
      Loading Mintflow...
    </div>
  )

  if (!user) return <Login />

  return (
    <NavContext.Provider value={{ page, setPage }}>
      {page === 'dashboard' && <Dashboard />}
      {page === 'transactions' && <Transactions />}
      {page === 'pl' && <div style={{padding:'2rem',fontFamily:'system-ui'}}>P&L Report — coming soon</div>}
      {page === 'cashflow' && <div style={{padding:'2rem',fontFamily:'system-ui'}}>Cash Flow — coming soon</div>}
      {page === 'reports' && <div style={{padding:'2rem',fontFamily:'system-ui'}}>Reports — coming soon</div>}
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