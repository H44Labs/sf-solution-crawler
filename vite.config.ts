import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync } from 'fs';

// Plugin to copy the nested panel HTML to dist root after build
function copyPanelHtml() {
  return {
    name: 'copy-panel-html',
    closeBundle() {
      copyFileSync(
        resolve(__dirname, 'dist/src/panel/index.html'),
        resolve(__dirname, 'dist/panel.html'),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), copyPanelHtml()],
  build: {
    rollupOptions: {
      input: {
        panel: resolve(__dirname, 'src/panel/index.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/index.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        // Flatten HTML output so panel.html sits at dist root (not dist/src/panel/)
        assetFileNames: '[name][extname]',
        chunkFileNames: '[name].js',
      },
    },
    outDir: 'dist',
  },
  test: {
    globals: true,
    environment: 'jsdom',
  },
});
