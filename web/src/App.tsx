import { Dashboard } from './components/Dashboard'
import { ThemeProvider } from './context/ThemeContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Dashboard />
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
