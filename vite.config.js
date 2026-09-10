import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Compila SIEMPRE a un único archivo HTML autocontenido (sin backend, doble clic para abrir),
// tal como funcionaba la versión anterior — solo que ahora el código fuente vive modularizado
// en src/ para que sea mantenible y escalable.
export default defineConfig({
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 100000000,
    outDir: 'dist',
    rollupOptions: {
      output: {
        inlineDynamicImports: true
      }
    }
  }
});
