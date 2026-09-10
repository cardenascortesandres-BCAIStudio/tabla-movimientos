// Indexación del catálogo maestro y agrupación del informe por categoría/producto.

import { normalizeCode } from './normalize.js';

// Usa la PRIMERA coincidencia cuando un código se repite en el catálogo.
export function buildCatalogIndex(MASTER_CATALOG) {
  const index = new Map();
  const catOrder = [];
  MASTER_CATALOG.forEach((cat, catIdx) => {
    catOrder.push(cat.category);
    cat.items.forEach((item, itemIdx) => {
      const code = normalizeCode(item.code);
      if (!index.has(code)) {
        index.set(code, { category: cat.category, name: item.name, catIdx, itemIdx });
      }
    });
  });
  return { index, catOrder };
}

export function buildReport(products, catalogInfo, MASTER_CATALOG) {
  const { index } = catalogInfo;
  const byCategory = new Map();
  const additional = new Map();

  products.forEach(p => {
    const hit = index.get(p.normCode);
    if (hit) {
      if (!byCategory.has(hit.catIdx)) byCategory.set(hit.catIdx, { category: hit.category, rows: new Map() });
      const bucket = byCategory.get(hit.catIdx).rows;
      if (!bucket.has(p.normCode)) {
        bucket.set(p.normCode, { code: p.rawCode, name: hit.name, itemIdx: hit.itemIdx, values: Object.assign({}, p.values), merged: false });
      } else {
        const existing = bucket.get(p.normCode);
        Object.keys(p.values).forEach(k => { existing.values[k] = (existing.values[k] || 0) + p.values[k]; });
        existing.merged = true;
      }
    } else {
      if (!additional.has(p.normCode)) {
        additional.set(p.normCode, { code: p.rawCode, name: p.rawName, values: Object.assign({}, p.values), merged: false });
      } else {
        const existing = additional.get(p.normCode);
        Object.keys(p.values).forEach(k => { existing.values[k] = (existing.values[k] || 0) + p.values[k]; });
        existing.merged = true;
      }
    }
  });

  const categories = [];
  MASTER_CATALOG.forEach((cat, catIdx) => {
    if (byCategory.has(catIdx)) {
      const bucket = byCategory.get(catIdx);
      const items = Array.from(bucket.rows.values()).sort((a, b) => a.itemIdx - b.itemIdx);
      categories.push({ category: cat.category, items });
    }
  });

  if (additional.size > 0) {
    categories.push({ category: 'PRODUCTOS ADICIONALES (fuera del listado maestro)', items: Array.from(additional.values()) });
  }

  return categories;
}
