import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import electronRenderer from 'vite-plugin-electron-renderer'
import path from 'path'
import fs from 'fs'

function copyBootstrap() {
  return {
    name: 'copy-ext-host-bootstrap',
    closeBundle() {
      const src = path.resolve(__dirname, 'electron/extension-host/bootstrap.js')
      const dest = path.resolve(__dirname, 'dist-electron/extension-host/bootstrap.js')
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(src, dest)
    },
  }
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? './' : '/',
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              external: ['node-pty', 'simple-git', 'adm-zip', 'jsonc-parser'],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            outDir: 'dist-electron',
          },
        },
      },
      {
        entry: 'electron/extension-host/host-process.ts',
        vite: {
          build: {
            outDir: 'dist-electron/extension-host',
            rollupOptions: {
              external: ['node-pty', 'simple-git', 'adm-zip', 'jsonc-parser'],
            },
          },
          plugins: [copyBootstrap()],
        },
      },
    ]),
    electronRenderer(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
}))
