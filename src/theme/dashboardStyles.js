// Estilos visuales del "Panel comparativo" (dashboard). A diferencia de
// src/theme/templates.js (que rige la tabla de detalle por sede + el Excel
// exportado), esto solo afecta esa pestaña en pantalla — el panel comparativo
// no se exporta a Excel, así que no hace falta una versión ARGB. Los valores
// de color de cada estilo viven en src/styles/main.css (bloques
// `#dashboardView[data-dash-style="..."]`); aquí solo está la lista para
// poblar el selector y el id por defecto.

export const DASHBOARD_STYLES = [
  { id: 'futurista', name: 'Futurista' },
  { id: 'minimalista', name: 'Minimalista' },
  { id: 'corporativo', name: 'Corporativo' },
  { id: 'denso', name: 'Alto contraste' },
  { id: 'calido', name: 'Cálido' }
];

export const DEFAULT_DASHBOARD_STYLE_ID = 'futurista';

export function getDashboardStyle(id) {
  return DASHBOARD_STYLES.find(s => s.id === id) || DASHBOARD_STYLES.find(s => s.id === DEFAULT_DASHBOARD_STYLE_ID);
}
