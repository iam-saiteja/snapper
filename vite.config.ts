import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// NEXT_PUBLIC_* only holds publishable values (Supabase URL + publishable key).
export default defineConfig({
  plugins: [react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
})
