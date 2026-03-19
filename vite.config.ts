import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, readFileSync, writeFileSync } from 'fs';

// Plugin to copy the nested panel HTML to dist root and fix script paths
function copyPanelHtml() {
  return {
    name: 'copy-panel-html',
    closeBundle() {
      const src = resolve(__dirname, 'dist/src/panel/index.html');
      let html = readFileSync(src, 'utf-8');
      // Fix script src to be relative to dist root (not nested path)
      html = html.replace(/src="[^"]*panel\.js"/, 'src="./panel.js"');
      writeFileSync(resolve(__dirname, 'dist/panel.html'), html);
    },
  };
}

// Plugin to copy manifest.json to dist/ after build
function copyManifest() {
  return {
    name: 'copy-manifest',
    writeBundle() {
      copyFileSync(
        resolve(__dirname, 'manifest.json'),
        resolve(__dirname, 'dist/manifest.json'),
      );
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), copyPanelHtml(), copyManifest()],
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
