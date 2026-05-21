/**
 * Seed questions and initial template definitions for Supervisions
 */

export interface Option {
  id: string;
  text: string;
  score: number; // 0 for fail/red, 1 for pass/green, or intermediate
  color: 'red' | 'yellow' | 'green';
}

export interface Question {
  id: string;
  text: string;
  category: string;
  type?: 'select' | 'text';
  options: Option[];
}

export interface AuditTemplate {
  id: string;
  name: string;
  category: string;
  questions: Question[];
}

export const SEEDED_TEMPLATES: AuditTemplate[] = [
  {
    id: 't-servicio',
    name: 'Supervisión Servicio',
    category: 'Servicio',
    questions: [
      // STOCK Y SERVICIO
      {
        id: 's_q1',
        text: 'Los mozos/runners cumplen con el manual de Atención a clientes',
        category: 'STOCK Y SERVICIO',
        options: [
          { id: 's_q1_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q1_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q1_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q2',
        text: 'Los mozos conocen los platos de la carta y su receta',
        category: 'STOCK Y SERVICIO',
        options: [
          { id: 's_q2_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q2_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q2_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q3',
        text: 'Los cocineros conocen las recetas y las respetan',
        category: 'STOCK Y SERVICIO',
        options: [
          { id: 's_q3_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q3_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q3_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q4',
        text: 'Los platos respetan la receta y estética indicada en el Manual de Cocina',
        category: 'STOCK Y SERVICIO',
        options: [
          { id: 's_q4_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q4_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q4_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q5',
        text: 'Los insumos se encuentran correctamente resguardados (fechas, film, empaquetado)',
        category: 'STOCK Y SERVICIO',
        options: [
          { id: 's_q5_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q5_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q5_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q6',
        text: 'Las comandas están marchando en tiempo y forma',
        category: 'STOCK Y SERVICIO',
        options: [
          { id: 's_q6_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q6_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q6_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q7',
        text: 'La cocina posee todos los insumos necesarios hasta el próximo pedido',
        category: 'STOCK Y SERVICIO',
        options: [
          { id: 's_q7_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q7_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q7_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q8',
        text: 'La barra posee todos los insumos necesarios hasta el próximo pedido',
        category: 'STOCK Y SERVICIO',
        options: [
          { id: 's_q8_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q8_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q8_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q9',
        text: 'Recopilación de comentarios de Google',
        category: 'STOCK Y SERVICIO',
        options: [
          { id: 's_q9_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q9_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q9_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q10',
        text: 'Apreciación del cliente en cuanto al servicio en la semana (según comentarios de Google)',
        category: 'STOCK Y SERVICIO',
        options: [
          { id: 's_q10_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q10_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q10_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },

      // SOBRE CAJA Y ENCARGADO
      {
        id: 's_q11',
        text: 'El encargado pudo resolver los imprevistos que surgieron durante la semana',
        category: 'SOBRE CAJA Y ENCARGADO',
        options: [
          { id: 's_q11_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q11_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q11_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q12',
        text: 'El personal es el adecuado para el servicio al momento de la supervisión',
        category: 'SOBRE CAJA Y ENCARGADO',
        options: [
          { id: 's_q12_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q12_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q12_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q13',
        text: 'El encargado realizó los pedidos de compras y de cocina en tiempo y forma',
        category: 'SOBRE CAJA Y ENCARGADO',
        options: [
          { id: 's_q13_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q13_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q13_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q14',
        text: 'El encargado controla que el equipo utilice el uniforme correcto para el servicio',
        category: 'SOBRE CAJA Y ENCARGADO',
        options: [
          { id: 's_q14_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q14_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q14_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q15',
        text: 'El encargado mantiene buena comunicación con su equipo',
        category: 'SOBRE CAJA Y ENCARGADO',
        options: [
          { id: 's_q15_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q15_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q15_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q16',
        text: 'El encargado envío los horarios del personal a tiempo y de forma correcta',
        category: 'SOBRE CAJA Y ENCARGADO',
        options: [
          { id: 's_q16_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q16_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q16_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q17',
        text: 'El cajero controla adecuadamente los pedidos de delivery previo a su entrega',
        category: 'SOBRE CAJA Y ENCARGADO',
        options: [
          { id: 's_q17_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q17_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q17_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q18',
        text: 'El cajero ha resuelto adecuadamente los imprevistos que surgen en ausencia del encargado',
        category: 'SOBRE CAJA Y ENCARGADO',
        options: [
          { id: 's_q18_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q18_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q18_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q19',
        text: 'La caja realiza adecuadamente los retiros de caja (En las bolsas correspondientes y de forma ordenada)',
        category: 'SOBRE CAJA Y ENCARGADO',
        options: [
          { id: 's_q19_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q19_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q19_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q20',
        text: 'La caja resguarda and envía correctamente los comprobantes de gastos de su turno',
        category: 'SOBRE CAJA Y ENCARGADO',
        options: [
          { id: 's_q20_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q20_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q20_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q21',
        text: 'El cajero registra correctamente las transacciones en el sistema (Consultar a la admin problemas durante la semana)',
        category: 'SOBRE CAJA Y ENCARGADO',
        options: [
          { id: 's_q21_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q21_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q21_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q22',
        text: 'El sector cuenta con toda la documentación exigible (Constancia de Afip - Rentas - Habilitación Municipal - F904- Certificado de Fumigación al día - Carnet de Sanidad)',
        category: 'SOBRE CAJA Y ENCARGADO',
        options: [
          { id: 's_q22_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q22_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q22_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q23',
        text: 'Se realiza arqueo de caja sorpresivo',
        category: 'SOBRE CAJA Y ENCARGADO',
        options: [
          { id: 's_q23_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q23_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q23_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },

      // LIMPIEZA Y AMBIENTE
      {
        id: 's_q24',
        text: 'Limpieza de la vereda, deck, espacios exteriores, toldos, etc',
        category: 'LIMPIEZA Y AMBIENTE',
        options: [
          { id: 's_q24_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q24_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q24_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q25',
        text: 'Limpieza de sillas, mesas, vidrios del exterior, fachada en general',
        category: 'LIMPIEZA Y AMBIENTE',
        options: [
          { id: 's_q25_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q25_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q25_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q26',
        text: 'Limpieza de aires acondicionados, ventiladores, focos y parlantes',
        category: 'LIMPIEZA Y AMBIENTE',
        options: [
          { id: 's_q26_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q26_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q26_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q27',
        text: 'Limpieza de mesas, sillas, servilleteros en el interior',
        category: 'LIMPIEZA Y AMBIENTE',
        options: [
          { id: 's_q27_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q27_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q27_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q28',
        text: 'Limpieza de pisos, escaleras y espejos',
        category: 'LIMPIEZA Y AMBIENTE',
        options: [
          { id: 's_q28_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q28_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q28_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q29',
        text: 'Limpieza de baños',
        category: 'LIMPIEZA Y AMBIENTE',
        options: [
          { id: 's_q29_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q29_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q29_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q30',
        text: 'Limpieza en el Sector de Caja',
        category: 'LIMPIEZA Y AMBIENTE',
        options: [
          { id: 's_q30_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q30_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q30_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q31',
        text: 'Limpieza en el Sector de Barra',
        category: 'LIMPIEZA Y AMBIENTE',
        options: [
          { id: 's_q31_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q31_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q31_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q32',
        text: 'Limpieza en Cocina (Utensilios, mixers, licuadoras, pequeñas herramientas)',
        category: 'LIMPIEZA Y AMBIENTE',
        options: [
          { id: 's_q32_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q32_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q32_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q33',
        text: 'Limpieza de Campana, Horno, Carliteras, Freidoras, Planchas.',
        category: 'LIMPIEZA Y AMBIENTE',
        options: [
          { id: 's_q33_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q33_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q33_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q34',
        text: 'Limpieza en Cámaras y Freezers',
        category: 'LIMPIEZA Y AMBIENTE',
        options: [
          { id: 's_q34_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q34_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q34_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q35',
        text: 'Limpieza en el Sector de Bacha',
        category: 'LIMPIEZA Y AMBIENTE',
        options: [
          { id: 's_q35_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q35_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q35_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q36',
        text: 'Limpieza de vajilla',
        category: 'LIMPIEZA Y AMBIENTE',
        options: [
          { id: 's_q36_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q36_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q36_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q37',
        text: 'Orden y Limpieza en el Depósito',
        category: 'LIMPIEZA Y AMBIENTE',
        options: [
          { id: 's_q37_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q37_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q37_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q38',
        text: 'Control de vencimiento de Matafuegos',
        category: 'LIMPIEZA Y AMBIENTE',
        options: [
          { id: 's_q38_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q38_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q38_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q39',
        text: 'El encargado envió las fotos de cierre durante la semana',
        category: 'LIMPIEZA Y AMBIENTE',
        options: [
          { id: 's_q39_o1', text: 'Excelente (Verde)', score: 1, color: 'green' },
          { id: 's_q39_o2', text: 'Muy bueno (Amarillo)', score: 0.5, color: 'yellow' },
          { id: 's_q39_o3', text: 'Necesita Mejorar (Rojo)', score: 0, color: 'red' }
        ]
      },
      {
        id: 's_q40',
        text: 'Comentarios del Supervisor',
        category: 'COMENTARIOS',
        type: 'text',
        options: []
      }
    ]
  },
  {
    id: 't-cocina',
    name: 'Supervisión Cocina',
    category: 'Cocina',
    questions: [
      // LIMPIEZA Y ORDEN
      {
        id: 'c_q1',
        text: 'Uniforme del equipo de Cocina: Estado',
        category: 'LIMPIEZA Y ORDEN',
        options: [
          { id: 'c_q1_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q1_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q1_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q2',
        text: 'Limpieza del Horno (Afuera, adentro, arriba , abajo y atrás)',
        category: 'LIMPIEZA Y ORDEN',
        options: [
          { id: 'c_q2_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q2_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q2_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q3',
        text: 'Limpieza en estantes, mesadas, pisos y paredes',
        category: 'LIMPIEZA Y ORDEN',
        options: [
          { id: 'c_q3_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q3_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q3_o3', text: 'Necesita mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q4',
        text: 'Limpieza de Carliteras - Freidoras - Horno Convector - Plancha',
        category: 'LIMPIEZA Y ORDEN',
        options: [
          { id: 'c_q4_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q4_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q4_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q5',
        text: 'Limpieza de Licuadoras - Mixer - Pequeños Electros',
        category: 'LIMPIEZA Y ORDEN',
        options: [
          { id: 'c_q5_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q5_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q5_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q6',
        text: 'Limpieza de Campana de Cocina',
        category: 'LIMPIEZA Y ORDEN',
        options: [
          { id: 'c_q6_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q6_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q6_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q7',
        text: 'Limpieza de Cámara de Frío',
        category: 'LIMPIEZA Y ORDEN',
        options: [
          { id: 'c_q7_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q7_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q7_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q8',
        text: 'Estado/Limpieza de Utensilios de Cocina',
        category: 'LIMPIEZA Y ORDEN',
        options: [
          { id: 'c_q8_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q8_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q8_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q9',
        text: 'Limpieza y orden en Bacha',
        category: 'LIMPIEZA Y ORDEN',
        options: [
          { id: 'c_q9_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q9_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q9_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q10',
        text: 'Limpieza y orden en Depósito',
        category: 'LIMPIEZA Y ORDEN',
        options: [
          { id: 'c_q10_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q10_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q10_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q11',
        text: 'Comentarios del Supervisor (Limpieza)',
        category: 'LIMPIEZA Y ORDEN',
        type: 'text',
        options: []
      },

      // STOCK Y RESGUARDO
      {
        id: 'c_q12',
        text: 'Cuentan con el stock necesario para el servicio hasta el próximo pedido',
        category: 'STOCK Y RESGUARDO',
        options: [
          { id: 'c_q12_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q12_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q12_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q13',
        text: 'Todos los insumos se encuentran enfilmados',
        category: 'STOCK Y RESGUARDO',
        options: [
          { id: 'c_q13_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q13_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q13_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q14',
        text: 'Todos los insumos poseen fecha de elaboración y vencimiento',
        category: 'STOCK Y RESGUARDO',
        options: [
          { id: 'c_q14_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q14_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q14_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q15',
        text: 'Evaluación del último pedido realizado (estuvo correcto, se olvidaron de algo?, etc)',
        category: 'STOCK Y RESGUARDO',
        options: [
          { id: 'c_q15_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q15_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q15_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q16',
        text: 'Comentarios del Supervisor (Stock)',
        category: 'STOCK Y RESGUARDO',
        type: 'text',
        options: []
      },

      // SERVICIO - PLATOS
      {
        id: 'c_q17',
        text: 'El equipo de cocina esta correctamente conformado según el horario',
        category: 'SERVICIO - PLATOS',
        options: [
          { id: 'c_q17_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q17_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q17_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q18',
        text: 'El equipo de cocina está capacitado para realizar las tareas',
        category: 'SERVICIO - PLATOS',
        options: [
          { id: 'c_q18_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q18_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q18_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q19',
        text: 'Los cocineros tienen a disposición ("a mano") las recetas y manual de cocina',
        category: 'SERVICIO - PLATOS',
        options: [
          { id: 'c_q19_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q19_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q19_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q20',
        text: 'Cada cocinero conoce con precisión las tareas a realizar en su turno',
        category: 'SERVICIO - PLATOS',
        options: [
          { id: 'c_q20_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q20_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q20_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q21',
        text: 'Mise en place adecuado para el servicio',
        category: 'SERVICIO - PLATOS',
        options: [
          { id: 'c_q21_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q21_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q21_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q22',
        text: 'El cocinero conoce con precisión la receta de cada plato (hacer pregunta aleatoria)',
        category: 'SERVICIO - PLATOS',
        options: [
          { id: 'c_q22_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q22_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q22_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q23',
        text: 'Los cocineros respetan las recetas indicadas en el Manual de Cocina',
        category: 'SERVICIO - PLATOS',
        options: [
          { id: 'c_q23_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q23_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q23_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q24',
        text: 'Estética de los platos según receta',
        category: 'SERVICIO - PLATOS',
        options: [
          { id: 'c_q24_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q24_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q24_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q25',
        text: 'Tiempos: El tiempo de las órdenes durante el servicio',
        category: 'SERVICIO - PLATOS',
        options: [
          { id: 'c_q25_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'c_q25_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'c_q25_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q26',
        text: 'Existieron platos devueltos por los clientes?',
        category: 'SERVICIO - PLATOS',
        options: [
          { id: 'c_q26_o1', text: 'No', score: 1, color: 'green' },
          { id: 'c_q26_o2', text: 'Si', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q27',
        text: 'Se efectuaron correctamente los cierres en las últimas jornadas? (Según fotos enviadas)',
        category: 'SERVICIO - PLATOS',
        options: [
          { id: 'c_q27_o1', text: 'Si', score: 1, color: 'green' },
          { id: 'c_q27_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'c_q28',
        text: 'Comentarios del Supervisor (Servicio)',
        category: 'SERVICIO - PLATOS',
        type: 'text',
        options: []
      }
    ]
  },
  {
    id: 't-delivery',
    name: 'Supervisión Delivery',
    category: 'Delivery',
    questions: [
      // COCINA
      {
        id: 'd_q1',
        text: 'Los cocineros conocen las recetas y las respetan',
        category: 'COCINA',
        options: [
          { id: 'd_q1_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'd_q1_o2', text: 'Muy bien', score: 0.5, color: 'yellow' },
          { id: 'd_q1_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q2',
        text: 'Las comandas están marchando en tiempo y forma',
        category: 'COCINA',
        options: [
          { id: 'd_q2_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'd_q2_o2', text: 'Muy bien', score: 0.5, color: 'yellow' },
          { id: 'd_q2_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q3',
        text: 'Los platos respetan la receta y estética indicada en el Manual de Cocina',
        category: 'COCINA',
        options: [
          { id: 'd_q3_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'd_q3_o2', text: 'Muy bien', score: 0.5, color: 'yellow' },
          { id: 'd_q3_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q4',
        text: 'La cocina posee todos los insumos necesarios hasta el próximo pedido',
        category: 'COCINA',
        options: [
          { id: 'd_q4_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'd_q4_o2', text: 'Muy bien', score: 0.5, color: 'yellow' },
          { id: 'd_q4_o3', text: 'Necesita mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q5',
        text: 'Los insumos se encuentran correctamente resguardados (fechas, film, empaquetado)',
        category: 'COCINA',
        options: [
          { id: 'd_q5_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'd_q5_o2', text: 'Muy bien', score: 0.5, color: 'yellow' },
          { id: 'd_q5_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },

      // ENCARGADO - CAJERO
      {
        id: 'd_q6',
        text: 'El sector cuenta con toda la documentación exigible (Constancia de Afip - Rentas - Habilitación Municipal - F904- Certificado de Fumigación al día - Carnet de Sanidad)',
        category: 'ENCARGADO - CAJERO',
        options: [
          { id: 'd_q6_o1', text: 'Si', score: 1, color: 'green' },
          { id: 'd_q6_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q7',
        text: 'La caja realiza adecuadamente los retiros de caja (En las bolsas correspondientes y de forma ordenada)',
        category: 'ENCARGADO - CAJERO',
        options: [
          { id: 'd_q7_o1', text: 'Si', score: 1, color: 'green' },
          { id: 'd_q7_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q8',
        text: 'El cajero registra correctamente las transacciones en el sistema (Consultar a la admin problemas durante la semana)',
        category: 'ENCARGADO - CAJERO',
        options: [
          { id: 'd_q8_o1', text: 'Si', score: 1, color: 'green' },
          { id: 'd_q8_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q9',
        text: 'El encargado mantiene buena comunicación con su equipo',
        category: 'ENCARGADO - CAJERO',
        options: [
          { id: 'd_q9_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'd_q9_o2', text: 'Muy bien', score: 0.5, color: 'yellow' },
          { id: 'd_q9_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q10',
        text: 'El encargado verifica que todo el personal este con el uniforme correcto',
        category: 'ENCARGADO - CAJERO',
        options: [
          { id: 'd_q10_o1', text: 'Si', score: 1, color: 'green' },
          { id: 'd_q10_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q11',
        text: 'El encargado pudo resolver los imprevistos que surgieron durante la semana',
        category: 'ENCARGADO - CAJERO',
        options: [
          { id: 'd_q11_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'd_q11_o2', text: 'Muy bien', score: 0.5, color: 'yellow' },
          { id: 'd_q11_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q12',
        text: 'El encargado envío los horarios y novedades (bitacora) en tiempo y forma',
        category: 'ENCARGADO - CAJERO',
        options: [
          { id: 'd_q12_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'd_q12_o2', text: 'Muy bien', score: 0.5, color: 'yellow' },
          { id: 'd_q12_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q13',
        text: 'Apreciación del cliente en cuanto al servicio en la semana (según comentarios de Pedidos Ya)',
        category: 'ENCARGADO - CAJERO',
        options: [
          { id: 'd_q13_o1', text: 'Si', score: 1, color: 'green' },
          { id: 'd_q13_o2', text: 'No', score: 0, color: 'red' }
        ]
      },

      // LIMPIEZA Y ORDEN GENERAL
      {
        id: 'd_q14',
        text: 'Limpieza en Cámara, heladeras y Freezers',
        category: 'LIMPIEZA Y ORDEN GENERAL',
        options: [
          { id: 'd_q14_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'd_q14_o2', text: 'Muy bien', score: 0.5, color: 'yellow' },
          { id: 'd_q14_o3', text: 'Necesita mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q15',
        text: 'Limpieza de Campana, Horno, Carliteras, Freidoras, Planchas.',
        category: 'LIMPIEZA Y ORDEN GENERAL',
        options: [
          { id: 'd_q15_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'd_q15_o2', text: 'Muy bien', score: 0.5, color: 'yellow' },
          { id: 'd_q15_o3', text: 'Necesita mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q16',
        text: 'Limpieza en Cocina (Utensilios, mixers, licuadoras, pequeñas herramientas)',
        category: 'LIMPIEZA Y ORDEN GENERAL',
        options: [
          { id: 'd_q16_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'd_q16_o2', text: 'Muy bien', score: 0.5, color: 'yellow' },
          { id: 'd_q16_o3', text: 'Necesita mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q17',
        text: 'Limpieza en el Sector de Caja',
        category: 'LIMPIEZA Y ORDEN GENERAL',
        options: [
          { id: 'd_q17_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'd_q17_o2', text: 'Muy bien', score: 0.5, color: 'yellow' },
          { id: 'd_q17_o3', text: 'Necesita mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q18',
        text: 'Limpieza de aires acondicionados, ventiladores, focos y parlantes',
        category: 'LIMPIEZA Y ORDEN GENERAL',
        options: [
          { id: 'd_q18_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'd_q18_o2', text: 'Muy bien', score: 0.5, color: 'yellow' },
          { id: 'd_q18_o3', text: 'Necesita mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q19',
        text: 'Control de Matafuegos y Certificados de Fumigación',
        category: 'LIMPIEZA Y ORDEN GENERAL',
        options: [
          { id: 'd_q19_o1', text: 'Si', score: 1, color: 'green' },
          { id: 'd_q19_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'd_q20',
        text: 'Comentarios del Supervisor',
        category: 'COMENTARIOS GENERALES',
        type: 'text',
        options: []
      }
    ]
  },
  {
    id: 't-deposito',
    name: 'Supervisión Depósito Central',
    category: 'Depósito Central',
    questions: [
      // DEPOSITO Y TRASLADOS
      {
        id: 'dc_q1',
        text: 'Mantenimiento y limpieza de los vehículos',
        category: 'DEPOSITO Y TRASLADOS',
        options: [
          { id: 'dc_q1_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q1_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q2',
        text: 'Limpieza y orden correcto en Depósito',
        category: 'DEPOSITO Y TRASLADOS',
        options: [
          { id: 'dc_q2_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q2_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q3',
        text: 'Todas los envíos se están realizando con remitos de respaldo',
        category: 'DEPOSITO Y TRASLADOS',
        options: [
          { id: 'dc_q3_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q3_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q4',
        text: 'Se emitieron remitos sin errores en la última semana',
        category: 'DEPOSITO Y TRASLADOS',
        options: [
          { id: 'dc_q4_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q4_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q5',
        text: 'El equipo esta cumpliendo con los tiempos de entrega a Sucursales',
        category: 'DEPOSITO Y TRASLADOS',
        options: [
          { id: 'dc_q5_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q5_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q6',
        text: 'Los productos se encuentran correctamente resguardados en el Almacén',
        category: 'DEPOSITO Y TRASLADOS',
        options: [
          { id: 'dc_q6_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q6_o2', text: 'No', score: 0, color: 'red' }
        ]
      },

      // PRODUCCION: RECETAS - PERSONAL - STOCK
      {
        id: 'dc_q7',
        text: 'El equipo de producción esta completo según horario',
        category: 'PRODUCCION: RECETAS - PERSONAL - STOCK',
        options: [
          { id: 'dc_q7_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q7_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q8',
        text: 'El personal esta utilizando el uniforme correspondiente',
        category: 'PRODUCCION: RECETAS - PERSONAL - STOCK',
        options: [
          { id: 'dc_q8_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q8_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q9',
        text: 'El personal tiene conocimiento de las recetas',
        category: 'PRODUCCION: RECETAS - PERSONAL - STOCK',
        options: [
          { id: 'dc_q9_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q9_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q10',
        text: 'El personal tiene acceso a las recetas de forma sencilla',
        category: 'PRODUCCION: RECETAS - PERSONAL - STOCK',
        options: [
          { id: 'dc_q10_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q10_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q11',
        text: 'El personal respeta las recetas y sus procedimientos',
        category: 'PRODUCCION: RECETAS - PERSONAL - STOCK',
        options: [
          { id: 'dc_q11_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q11_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q12',
        text: 'Los productos se encuentran correctamente resguardados (enfilmados, empaquetados)',
        category: 'PRODUCCION: RECETAS - PERSONAL - STOCK',
        options: [
          { id: 'dc_q12_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q12_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q13',
        text: 'Los productos se encuentran con fecha de elaboración y vencimiento',
        category: 'PRODUCCION: RECETAS - PERSONAL - STOCK',
        options: [
          { id: 'dc_q13_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q13_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q14',
        text: 'En cámaras y freezer se observa un orden claro de acopio',
        category: 'PRODUCCION: RECETAS - PERSONAL - STOCK',
        options: [
          { id: 'dc_q14_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q14_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q15',
        text: 'Existe una correcta rotación de insumos y productos terminados',
        category: 'PRODUCCION: RECETAS - PERSONAL - STOCK',
        options: [
          { id: 'dc_q15_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q15_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q16',
        text: 'Existe stock suficiente para hacer frente al próximo pedido',
        category: 'PRODUCCION: RECETAS - PERSONAL - STOCK',
        options: [
          { id: 'dc_q16_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q16_o2', text: 'Faltan algunos productos', score: 0.5, color: 'yellow' },
          { id: 'dc_q16_o3', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q17',
        text: 'El líder de producción informa a tiempo los Partes de Producción',
        category: 'PRODUCCION: RECETAS - PERSONAL - STOCK',
        options: [
          { id: 'dc_q17_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q17_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q18',
        text: 'El equipo esta cumpliendo con los tiempos para entregar a Traslados',
        category: 'PRODUCCION: RECETAS - PERSONAL - STOCK',
        options: [
          { id: 'dc_q18_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q18_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q19',
        text: 'Los pedidos de compras fueron realizados correctamente en la última semana',
        category: 'PRODUCCION: RECETAS - PERSONAL - STOCK',
        options: [
          { id: 'dc_q19_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q19_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q20',
        text: 'El equipo cuenta con todas las herramientas necesarias para el desarrollo de sus tareas',
        category: 'PRODUCCION: RECETAS - PERSONAL - STOCK',
        options: [
          { id: 'dc_q20_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q20_o2', text: 'No', score: 0, color: 'red' }
        ]
      },

      // LIMPIEZA
      {
        id: 'dc_q21',
        text: 'El equipo realizó un correcto cierre de turno',
        category: 'LIMPIEZA',
        options: [
          { id: 'dc_q21_o1', text: 'Sí', score: 1, color: 'green' },
          { id: 'dc_q21_o2', text: 'No', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q22',
        text: 'Limpieza de Pisos, estantes, paredes, bacha',
        category: 'LIMPIEZA',
        options: [
          { id: 'dc_q22_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'dc_q22_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'dc_q22_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q23',
        text: 'Limpieza de herramientas de trabajo (utensilios, mixers, licuadoras)',
        category: 'LIMPIEZA',
        options: [
          { id: 'dc_q23_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'dc_q23_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'dc_q23_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      },
      {
        id: 'dc_q24',
        text: 'Limpieza de Maquinaria de trabajo (bolladora, cortadora de fiambre, etc)',
        category: 'LIMPIEZA',
        options: [
          { id: 'dc_q24_o1', text: 'Excelente', score: 1, color: 'green' },
          { id: 'dc_q24_o2', text: 'Muy bueno', score: 0.5, color: 'yellow' },
          { id: 'dc_q24_o3', text: 'Necesita Mejorar', score: 0, color: 'red' }
        ]
      }
    ]
  }
];
