import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    historyApiFallback: true,
    // client/ 밖의 shared/ 를 dev 서버가 서빙할 수 있도록 허용
    fs: { allow: ['..'] },
  },
})
