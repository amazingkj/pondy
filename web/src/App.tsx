import { Dashboard } from './components/Dashboard'
import { ThemeProvider } from './context/ThemeContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'
import './index.css'

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <ToastProvider>
          <Dashboard />
        </ToastProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
