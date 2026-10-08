import { createHorasExtrasRouter } from './horasExtrasShared.js';

// Horas Extras de Planta, controlada por separado de PDV (horas_extra_dias)
// a pedido explícito del usuario — mismo PDF/parser, tabla propia.
export const horasExtrasPlantaRouter = createHorasExtrasRouter('horas_extra_planta_dias');
