// Checklist de Auditoría de Punto de Venta — mismos 8 bloques y textos que el
// PDF imprimible (ver conversación), ahora como formulario digital. Cambiar
// esta lista actualiza a la vez el formulario y el conteo de cumplimiento;
// no hace falta tocar nada más.

export const AUDIT_BLOCKS = [
  {
    id: 1,
    title: 'Presentación del personal',
    items: [
      'Uniforme completo (cofia, tapabocas, delantal)',
      'Botas antideslizantes en buen estado',
      'Higiene personal (uñas, cabello recogido, sin joyas)',
      'Actitud y atención al cliente'
    ]
  },
  {
    id: 2,
    title: 'Limpieza e higiene del punto',
    items: [
      'Pisos, vitrinas y mesones limpios',
      'Neveras/congeladores sin residuos ni olores',
      'Mesones de corte desinfectados',
      'Manejo adecuado de canecas/residuos',
      'Sin evidencia de plagas o insectos',
      'Cuchillos y utensilios higienizados'
    ]
  },
  {
    id: 3,
    title: 'Cadena de frío',
    items: [
      'Temperatura de neveras dentro de rango',
      'Termómetros funcionando y visibles',
      'Producto organizado, sin hacinamiento',
      'Rotación PEPS (primero en entrar, primero en salir)'
    ]
  },
  {
    id: 4,
    title: 'Infraestructura y equipos',
    items: [
      'Estado de vitrinas, neveras y luces',
      'Pintura, techos y paredes en buen estado',
      'Básculas calibradas y funcionando',
      'Cortadora/empacadora al vacío operativas',
      'Empaques al vacío sin fugas de aire',
      'Señalización de precios visible y actualizada'
    ]
  },
  {
    id: 5,
    title: 'Cumplimiento normativo',
    items: [
      'Registro INVIMA visible',
      'Certificado de fumigación vigente',
      'Extintores vigentes y accesibles'
    ]
  },
  {
    id: 6,
    title: 'Inventario y producto',
    items: [
      'Sin producto vencido o próximo a vencer',
      'Presentación en vitrina (orden, etiquetado, precios)'
    ]
  },
  {
    id: 7,
    title: 'Operación y servicio',
    items: [
      'Cumplimiento de horario de apertura/cierre',
      'Manejo correcto de caja/efectivo',
      'Tiempos de atención razonables',
      'Publicidad/promociones exhibidas correctamente'
    ]
  },
  {
    id: 8,
    title: 'Seguridad',
    items: [
      'Cámaras funcionando',
      'Botón de pánico/alarma operativo',
      'Salidas de emergencia despejadas'
    ]
  }
];

export const AUDIT_TOTAL_ITEMS = AUDIT_BLOCKS.reduce((a, b) => a + b.items.length, 0);

export const AUDIT_RESULT_OPTIONS = [
  { value: 'cumple_total', label: 'Cumple totalmente' },
  { value: 'cumple_obs', label: 'Cumple con observaciones' },
  { value: 'no_cumple', label: 'No cumple' }
];
