import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { builtinModules } from 'module';

export default defineConfig({
  main: {
    build: {
      target: 'node18',
      rollupOptions: {
        external: ['electron', 'better-sqlite3', 'mssql', ...builtinModules],
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs'
        }
      }
    }
  },
  preload: {
    build: {
      target: 'node18',
      rollupOptions: {
        external: ['electron', ...builtinModules],
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs'
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    },
    server: {
      host: '0.0.0.0',
      port: 5181,
      // allow Vite to pick the next free port if 5181 is occupied
      strictPort: false
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react()]
  }
});
