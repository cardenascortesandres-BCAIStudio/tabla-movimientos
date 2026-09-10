// Normalización de texto y de códigos de producto.

export function removeAccents(str) {
  return String(str).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export function normText(v) {
  return removeAccents(String(v == null ? '' : v).toUpperCase()).trim().replace(/\s+/g, ' ');
}

// Códigos pueden venir con formato de miles ("171,201"), o con residuo decimal
// de una celda numérica ("2700.0"). Se normalizan antes de comparar contra el catálogo.
export function normalizeCode(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  s = s.replace(/,/g, '');
  s = s.replace(/\s+/g, '');
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s;
}
