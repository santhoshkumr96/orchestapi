import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import './index.css'
import App from './App.tsx'

// Prepend base path to all axios requests (for context-path deployment)
const basePath = import.meta.env.BASE_URL.replace(/\/$/, '')
if (basePath) {
  axios.interceptors.request.use((config) => {
    if (config.url?.startsWith('/')) {
      config.url = basePath + config.url
    }
    return config
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
