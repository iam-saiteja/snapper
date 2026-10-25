import { copyFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Apache-2.0 §4(a)/(d): every copy we distribute (the APK, the web app) carries the license and NOTICE.
// They're shown on the in-app Licenses screen.
function legalFiles(): Plugin {
  return {
    name: 'snapper-legal-files',
    apply: 'build',
    closeBundle() {
      for (const f of ['LICENSE', 'NOTICE']) copyFileSync(f, `dist/${f}.txt`)
    },
  }
}

export default defineConfig({
  plugins: [react(), legalFiles()],
  envPrefix: ['VITE_'],
})
