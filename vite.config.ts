import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// base relativo: funciona em https://ulakzzz.github.io/vibdocs/ e, depois, em domínio próprio.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    // mdb-reader (leitura dos bancos Omnitrend): o "create-hash" só serve para bancos com senha e puxa módulos do Node
    alias: { 'create-hash': fileURLToPath(new URL('./src/lib/omnitrend/semHash.ts', import.meta.url)) },
  },
  worker: { format: 'es' },
})
