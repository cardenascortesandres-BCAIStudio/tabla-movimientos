// Parseo de números cuando SheetJS no entrega ya un valor numérico nativo
// (celda guardada como texto). Los archivos de Balance se leen con
// {raw:true}, así que esto casi nunca se usa — pero cuando sí llega texto,
// puede venir en formato US (1,234.56) o colombiano (1.234,56), así que se
// detectan ambos en vez de asumir uno solo (a diferencia de normalize.js,
// que solo asume formato US y no se toca aquí para no arriesgar el flujo de
// movimientos que ya funciona con ese supuesto).

export function parseLocaleNumber(raw) {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return raw;
  const s = String(raw).trim();
  if (!s) return 0;

  // Colombiano: punto de miles, coma decimal -> "38.254.366,80"
  if (/^-?\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    const num = parseFloat(s.replace(/\./g, '').replace(',', '.'));
    return isNaN(num) ? 0 : num;
  }
  // US: coma de miles, punto decimal -> "38,254,366.80"
  if (/^-?\d{1,3}(,\d{3})*(\.\d+)?$/.test(s)) {
    const num = parseFloat(s.replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  }
  const num = parseFloat(s.replace(/[^0-9.\-]/g, ''));
  return isNaN(num) ? 0 : num;
}
