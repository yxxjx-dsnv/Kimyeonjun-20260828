import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // `vercel dev`가 3000에서 프론트+/api를 함께 서빙한다. 프론트만 손볼 때만 5173을 쓴다.
  server: { proxy: { '/api': 'http://localhost:3000' } },
})
