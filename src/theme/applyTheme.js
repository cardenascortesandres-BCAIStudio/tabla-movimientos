// Aplica los colores de una plantilla (src/theme/templates.js) a las
// variables CSS en :root, para que la tabla en pantalla (encabezado, bloques
// de categoría, subtotales, colores de diferencia) cambie en vivo al elegir
// otra plantilla. Toca document — por eso vive fuera de src/theme/templates.js
// (que se mantiene puro y testeable sin DOM).

export function applyTemplateToDOM(template) {
  const c = template.colors;
  const root = document.documentElement.style;
  root.setProperty('--header-bg', c.headerBg);
  root.setProperty('--header-fg', c.headerFg);
  root.setProperty('--cat-row-bg', c.catRowBg);
  root.setProperty('--cat-row-fg', c.catRowFg);
  root.setProperty('--subtotal-bg', c.subtotalBg);
  root.setProperty('--subtotal-fg', c.subtotalFg);
  root.setProperty('--rojo-bg', c.diffNegBg);
  root.setProperty('--rojo-2', c.diffNegFg);
  root.setProperty('--verde-bg', c.diffZeroBg);
  root.setProperty('--verde-ok', c.diffZeroFg);
  root.setProperty('--gris-2', c.borderColor);
  root.setProperty('--accent', c.accent);
  root.setProperty('--accent-2', c.accent2);
}
