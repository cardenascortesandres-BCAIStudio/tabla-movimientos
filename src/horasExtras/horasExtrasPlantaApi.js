// Horas Extras de Planta — misma API que src/horasExtras/horasExtrasApi.js,
// apuntando a /api/horas-extras-planta (tabla y caché separados de PDV).
import { createHorasExtrasApi } from './horasExtrasApi.js';

export const { getAllDias, saveDias } = createHorasExtrasApi('/api/horas-extras-planta', 'horasExtrasPlanta:cache:');
