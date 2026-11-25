import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// base relativo: funciona em https://ulakzzz.github.io/vibdocs/ e, depois, em domínio próprio.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
