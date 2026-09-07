import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig(({ mode }) => ({
  // mode=singlefile では 1 枚の HTML に全部を埋め込む（配布・埋め込み用）
  plugins: [react(), ...(mode === 'singlefile' ? [viteSingleFile()] : [])],
  // GitHub Pages のようにサブパスへ置く場合は VITE_BASE=/リポジトリ名/ を指定する
  base: process.env.VITE_BASE ?? '/',
  server: { port: 5173 },
  // Artifact 版は ExcelJS を CDN から読むため、バンドルにはスタブだけを入れる
  resolve:
    mode === 'singlefile'
      ? {
          alias: {
            exceljs: fileURLToPath(new URL('./src/lib/exceljs-cdn.ts', import.meta.url)),
          },
        }
      : {},
  build:
    mode === 'singlefile'
      ? { outDir: 'dist-single', chunkSizeWarningLimit: 4000 }
      : { chunkSizeWarningLimit: 1200 },
}));
