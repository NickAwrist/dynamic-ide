import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import defaultTheme from './themes/default-theme'
import { applyFullTheme, hydrateThemeFromCache } from './utils/theme-engine'

if (!hydrateThemeFromCache()) {
  applyFullTheme(defaultTheme, 'vs-dark')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
