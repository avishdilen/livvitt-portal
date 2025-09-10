import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// If deploying to GitHub Pages under a repo path, set base to '/REPO_NAME/'
export default defineConfig({
  plugins: [react()],
  // base: '/livvitt-quote-invoice-demo/'
})
