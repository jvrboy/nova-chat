import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { applyTheme, DEFAULT_THEME } from './theme'
import { applyFonts, loadFontSettings } from './fonts'
import './index.css'

applyTheme(localStorage.getItem('nova.theme') ?? DEFAULT_THEME)
applyFonts(loadFontSettings())

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
