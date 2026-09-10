// Genera los íconos PNG del PWA a partir de un SVG simple (monograma "TM" en
// el color de marca --rojo-1). Se corre una sola vez / cuando cambie el logo:
// node scripts/generate-pwa-icons.mjs

import sharp from 'sharp';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BRAND = '#8b1e1e';

function svgIcon({ size, padding = 0 }) {
  const inner = size - padding * 2;
  const radius = inner * 0.18;
  const fontSize = inner * 0.42;
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect x="${padding}" y="${padding}" width="${inner}" height="${inner}" rx="${radius}" fill="${BRAND}"/>
  <text x="${size / 2}" y="${size / 2}" font-family="Segoe UI, Arial, sans-serif" font-weight="700"
    font-size="${fontSize}" fill="#ffffff" text-anchor="middle" dominant-baseline="central">TM</text>
</svg>`;
}

async function render(name, { size, padding }) {
  const svg = Buffer.from(svgIcon({ size, padding }));
  await sharp(svg).png().toFile(path.join(outDir, name));
  console.log('generado', name);
}

await render('icon-192.png', { size: 192, padding: 0 });
await render('icon-512.png', { size: 512, padding: 0 });
// Maskable: los sistemas operativos recortan un círculo/redondeo sobre el
// ícono, así que el contenido debe tener margen de seguridad (safe zone).
await render('icon-512-maskable.png', { size: 512, padding: 64 });
