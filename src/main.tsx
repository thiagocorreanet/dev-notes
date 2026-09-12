import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/app/app'
import '@/styles/global.css'

const root = document.getElementById('root')

if (!root) throw new Error('Elemento raiz da aplicação não encontrado.')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
