/**
 * SPDX-License-Identifier: Apache-2.0
 * Estructura fija del Estado de Resultados (P&L) de CRAFT.
 */

export interface PLLineDef {
  key: string;
  label: string;
  type: 'input' | 'subtotal' | 'header';
  bold?: boolean;
  indent?: number;
}

export const PL_STRUCTURE: PLLineDef[] = [
  { key: 'ing_ord', label: 'Ingresos Ordinarios', type: 'header' },
  { key: 'ventas_1', label: 'Ventas 1', type: 'input', indent: 1 },
  { key: 'ventas_2', label: 'Ventas 2', type: 'input', indent: 1 },
  { key: 'ventas_netas', label: 'Ventas Totales Netas', type: 'subtotal', bold: true },
  { key: 'cmv', label: 'Costo de Mercadería Vendida', type: 'input' },
  { key: 'ganancia_bruta', label: 'Ganancia/Pérdida Bruta', type: 'subtotal', bold: true },

  { key: 'sueldos_rel', label: 'Sueldos y Relacionados', type: 'subtotal' },
  { key: 'sueldos', label: 'Sueldos', type: 'input', indent: 1 },
  { key: 'cargas_sociales', label: 'Cargas Sociales', type: 'input', indent: 1 },
  { key: 'liquidacion_final', label: 'Liquidación Final', type: 'input', indent: 1 },
  { key: 'sac', label: 'SAC', type: 'input', indent: 1 },
  { key: 'salud_publica', label: 'Salud Pública', type: 'input', indent: 1 },
  { key: 'sindicato', label: 'Sindicato', type: 'input', indent: 1 },
  { key: 'variables_premios', label: 'Variables/Premios', type: 'input', indent: 1 },
  { key: 'vacaciones', label: 'Vacaciones', type: 'input', indent: 1 },
  { key: 'servicios_eventuales', label: 'Servicios Eventuales (Pruebas)', type: 'input', indent: 1 },

  { key: 'alquileres_rel', label: 'Alquileres y Relacionados', type: 'subtotal' },
  { key: 'alquileres_expensas', label: 'Alquileres y Expensas', type: 'input', indent: 1 },

  { key: 'servicios_contrat', label: 'Servicios y Contrataciones', type: 'subtotal' },
  { key: 'software', label: 'Software', type: 'input', indent: 1 },
  { key: 'consumo_energia', label: 'Consumo Energía', type: 'input', indent: 1 },
  { key: 'consumo_gas', label: 'Consumo Gas', type: 'input', indent: 1 },
  { key: 'limpieza_seguridad', label: 'Servicio de Limpieza y Seguridad', type: 'input', indent: 1 },
  { key: 'servicios_varios', label: 'Servicios Varios', type: 'input', indent: 1 },
  { key: 'telefonia_internet', label: 'Servicio de Telefonía e Internet', type: 'input', indent: 1 },
  { key: 'consumo_agua', label: 'Consumo de Agua', type: 'input', indent: 1 },
  { key: 'mantenimiento_bienes', label: 'Mantenimiento Bienes de Uso', type: 'input', indent: 1 },
  { key: 'honorarios', label: 'Honorarios', type: 'input', indent: 1 },

  { key: 'gastos_comercial', label: 'Gastos Comercialización y bancarios', type: 'subtotal' },
  { key: 'comisiones_py', label: 'Comisiones Pedidos Ya', type: 'input', indent: 1 },
  { key: 'comisiones_bancarias', label: 'Comisiones Bancarias', type: 'input', indent: 1 },
  { key: 'comisiones_mp', label: 'Comisiones Mercado Pago', type: 'input', indent: 1 },
  { key: 'comisiones_tc', label: 'Comisiones y gastos TC', type: 'input', indent: 1 },
  { key: 'cadeteria_propia', label: 'Cadetería Propia', type: 'input', indent: 1 },

  { key: 'impuestos', label: 'Impuestos', type: 'subtotal' },
  { key: 'imp_deb_cred', label: 'Impuestos D. y Créditos', type: 'input', indent: 1 },
  { key: 'imp_internos', label: 'Impuestos Internos', type: 'input', indent: 1 },
  { key: 'imp_sellos', label: 'Impuestos a los sellos', type: 'input', indent: 1 },
  { key: 'imp_cheque', label: 'Impuesto al cheque', type: 'input', indent: 1 },
  { key: 'imp_automotor', label: 'Impuesto Automotor', type: 'input', indent: 1 },
  { key: 'imp_inmobiliario', label: 'Impuesto Inmobiliario', type: 'input', indent: 1 },
  { key: 'imp_autonomos', label: 'Impuesto Autonomos', type: 'input', indent: 1 },
  { key: 'imp_municipales', label: 'Impuestos Municipales', type: 'input', indent: 1 },
  { key: 'imp_planes', label: 'Impuestos y tasas - Planes', type: 'input', indent: 1 },
  { key: 'ingresos_brutos', label: 'Ingresos Brutos', type: 'input', indent: 1 },

  { key: 'otros_egresos', label: 'Otros Egresos', type: 'subtotal' },
  { key: 'gastos_mkt', label: 'Gastos MKT', type: 'input', indent: 1 },
  { key: 'gastos_farmacia', label: 'Gastos Farmacia', type: 'input', indent: 1 },
  { key: 'gastos_generales', label: 'Gastos Generales', type: 'input', indent: 1 },
  { key: 'gastos_insumos_limpieza', label: 'Gastos Insumos de Limpieza', type: 'input', indent: 1 },
  { key: 'gastos_jardineria', label: 'Gastos Jardinería', type: 'input', indent: 1 },
  { key: 'libreria', label: 'Librería', type: 'input', indent: 1 },
  { key: 'movilidad_fletes', label: 'Movilidad ,Fletes, viáticos', type: 'input', indent: 1 },
  { key: 'patentes_seguros', label: 'Patentes y Seguros', type: 'input', indent: 1 },
  { key: 'bazar', label: 'Bazar', type: 'input', indent: 1 },
  { key: 'gastos_descartables', label: 'Gastos descartables', type: 'input', indent: 1 },
  { key: 'gastos_indumentaria', label: 'Gastos Indumentaria', type: 'input', indent: 1 },
  { key: 'intereses_actualizaciones', label: 'Intereses y actualizaciones', type: 'input', indent: 1 },
  { key: 'gastos_legales', label: 'Gastos Legales', type: 'input', indent: 1 },
  { key: 'devolucion_clientes', label: 'Devolución a Clientes', type: 'input', indent: 1 },
  { key: 'consumo_personal', label: 'Consumo de Personal (EG 9 + FAC CEN)', type: 'input', indent: 1 },
  { key: 'compras_sucursal', label: 'Desperdicios (EG 8)', type: 'input', indent: 1 },

  { key: 'otros_ingresos', label: 'Otros Ingresos', type: 'subtotal' },
  { key: 'bonificaciones', label: 'Bonificaciones', type: 'input', indent: 1 },
  { key: 'otros_ingresos_2', label: 'Otros Ingresos Varios', type: 'input', indent: 1 },
  { key: 'rendimientos', label: 'Rendimientos', type: 'input', indent: 1 },

  { key: 'ganancia_operativa', label: 'GANANCIA/PERDIDA OPERATIVA', type: 'subtotal', bold: true },
  { key: 'comisiones_socios', label: 'Comisiones Socios Sucursales', type: 'input' },
  { key: 'ganancia_operativa_neta', label: 'GANANCIA/PERDIDA OPERATIVA NETA', type: 'subtotal', bold: true },
  { key: 'honorarios_socios', label: 'Honorarios Socios', type: 'input' },
  { key: 'ganancia_final', label: 'GANANCIA/PERDIDA F.', type: 'subtotal', bold: true },
];

export const SUBTOTAL_COMPONENTS: Record<string, string[]> = {
  ventas_netas: ['ventas_1', 'ventas_2'],
  sueldos_rel: ['sueldos', 'cargas_sociales', 'liquidacion_final', 'sac', 'salud_publica', 'sindicato', 'variables_premios', 'vacaciones', 'servicios_eventuales'],
  alquileres_rel: ['alquileres_expensas'],
  servicios_contrat: ['software', 'consumo_energia', 'consumo_gas', 'limpieza_seguridad', 'servicios_varios', 'telefonia_internet', 'consumo_agua', 'mantenimiento_bienes', 'honorarios'],
  gastos_comercial: ['comisiones_py', 'comisiones_bancarias', 'comisiones_mp', 'comisiones_tc', 'cadeteria_propia'],
  impuestos: ['imp_deb_cred', 'imp_internos', 'imp_sellos', 'imp_cheque', 'imp_automotor', 'imp_inmobiliario', 'imp_autonomos', 'imp_municipales', 'imp_planes', 'ingresos_brutos'],
  otros_egresos: ['gastos_mkt', 'gastos_farmacia', 'gastos_generales', 'gastos_insumos_limpieza', 'gastos_jardineria', 'libreria', 'movilidad_fletes', 'patentes_seguros', 'bazar', 'gastos_descartables', 'gastos_indumentaria', 'intereses_actualizaciones', 'gastos_legales', 'devolucion_clientes', 'consumo_personal', 'compras_sucursal'],
  otros_ingresos: ['bonificaciones', 'otros_ingresos_2', 'rendimientos'],
};

export const GANANCIA_BRUTA_COMPONENTS = ['ventas_netas', 'cmv'];
export const OPERATIVA_COMPONENTS = ['ganancia_bruta', 'sueldos_rel', 'alquileres_rel', 'servicios_contrat', 'gastos_comercial', 'impuestos', 'otros_egresos', 'otros_ingresos'];
export const OPERATIVA_NETA_COMPONENTS = ['ganancia_operativa', 'comisiones_socios'];
export const FINAL_COMPONENTS = ['ganancia_operativa_neta', 'honorarios_socios'];

// Costos VARIABLES para el punto de equilibrio económico (suben con las ventas).
// El resto de los egresos se consideran fijos.
// Incluye: CMV, Comisiones Pedidos Ya, Comisiones y gastos TC, toda la sección
// Impuestos, y Desperdicios (EG 8).
export const VARIABLE_COST_KEYS = [
  'cmv',
  'comisiones_py',
  'comisiones_tc',
  'imp_deb_cred', 'imp_internos', 'imp_sellos', 'imp_cheque', 'imp_automotor',
  'imp_inmobiliario', 'imp_autonomos', 'imp_municipales', 'imp_planes', 'ingresos_brutos',
  'compras_sucursal', // Desperdicios (EG 8)
];

export function normalizeLabel(s: string): string {
  return (s || '').toLowerCase().trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

export const LABEL_TO_KEY: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  PL_STRUCTURE.forEach(l => {
    if (l.type === 'input' || l.type === 'subtotal') {
      const n = normalizeLabel(l.label);
      if (!(n in m)) m[n] = l.key;
    }
  });
  return m;
})();
