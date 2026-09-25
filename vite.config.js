import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Compila SIEMPRE a un único archivo HTML autocontenido (sin backend, doble clic para abrir),
// tal como funcionaba la versión anterior — solo que ahora el código fuente vive modularizado
// en src/ para que sea mantenible y escalable.
// Sello de versión: se ve en pantalla y en el nombre del HTML descargado, para distinguir de un vistazo
// si el navegador está sirviendo la app vieja (caché del PWA) o la última publicada.
const BUILD_TIME = new Date().toLocaleString('sv-SE', { timeZone: 'America/Bogota' }).slice(0, 16);

export default defineConfig({
  define: { __BUILD_TIME__: JSON.stringify(BUILD_TIME) },
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
