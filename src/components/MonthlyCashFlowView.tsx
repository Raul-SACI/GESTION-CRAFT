/**
 * SPDX-License-Identifier: Apache-2.0
 * Flujo de Caja Mensual: importa la planilla Excel mensual (formato Google Sheets de CRAFT)
 * y muestra el resumen del mes (saldos por cuenta, ingresos, egresos por sección, neto y acumulado).
 * Guarda en Supabase (tabla monthly_cashflow) tanto los totales como el detalle día por día.
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BarChart3, Upload, Download, Loader2, ArrowUpRight, ArrowDownRight, Calendar, Trash2, ChevronDown, ChevronRight, TrendingUp, LayoutDashboard, AlertTriangle, Target } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart
} from 'recharts';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';

// Etiquetas que aparecen en la columna de TOTALES solo en filas de encabezado de sección
const HEADER_AG = new Set(['ingresos iniciales','ingresos','alquileres','servicios','compras','sueldos','impuestos','g. bancarios','otros g.','inversiones']);

// Estructura por defecto de la plantilla, cuando todavía no hay ningún mes cargado
// del cual copiar las cuentas reales. Los títulos importan (definen si la sección es
// de ingresos, de saldo inicial o de inversiones); la etiqueta solo marca el corte.
const PLANTILLA_SECCIONES: Array<{ titulo: string; tag: string; rubros: string[] }> = [
  { titulo: 'SALDO INICIAL', tag: 'ingresos iniciales', rubros: ['Caja', 'Banco', 'Mercado Pago'] },
  { titulo: 'INGRESOS', tag: 'ingresos', rubros: ['Ventas Salón', 'Ventas Delivery', 'Otros Ingresos'] },
  { titulo: 'ALQUILERES', tag: 'alquileres', rubros: ['Alquiler Local'] },
  { titulo: 'SERVICIOS', tag: 'servicios', rubros: ['Luz', 'Gas', 'Agua', 'Internet'] },
  { titulo: 'COMPRAS', tag: 'compras', rubros: ['Mercadería', 'Bebidas', 'Descartables'] },
  { titulo: 'SUELDOS', tag: 'sueldos', rubros: ['Sueldos', 'Cargas Sociales'] },
  { titulo: 'IMPUESTOS', tag: 'impuestos', rubros: ['IVA', 'Ingresos Brutos', 'Municipal'] },
  { titulo: 'G. BANCARIOS', tag: 'g. bancarios', rubros: ['Comisiones', 'Mantenimiento de Cuenta'] },
  { titulo: 'OTROS G.', tag: 'otros g.', rubros: ['Varios'] },
  { titulo: 'INVERSIONES Y CUOTAS PRESTAMO', tag: 'inversiones', rubros: ['Cuota Préstamo'] },
];

// La etiqueta de la columna TOTALES solo sirve para que el importador detecte que la
// fila abre una sección: cualquier valor de HEADER_AG sirve. Se elige el más parecido
// al título nada más que para que la planilla se lea bien.
const tagParaTitulo = (titulo: string): string => {
  const t = (titulo || '').toLowerCase();
  if (t.includes('saldo inicial')) return 'ingresos iniciales';
  if (t.startsWith('ingreso')) return 'ingresos';
  if (t.includes('alquiler')) return 'alquileres';
  if (t.includes('servicio')) return 'servicios';
  if (t.includes('compra')) return 'compras';
  if (t.includes('sueldo')) return 'sueldos';
  if (t.includes('impuesto')) return 'impuestos';
  if (t.includes('banc')) return 'g. bancarios';
  if (t.includes('inversion')) return 'inversiones';
  return 'otros g.';
};

interface Rubro { nombre: string; total: number; dias: Record<number, number>; }
interface Seccion { titulo: string; rubros: Rubro[]; total: number; }
interface MonthData {
  month: string;
  resumen: Record<string, Record<number, number> & { __total?: number }>; // filas de arriba
  resumenTotales: Record<string, number>;
  secciones: Seccion[];
  dias: number[];
}

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const fmt = (n: number) => `$${(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtShort = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}MM`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
};
const monthShort = (m: string) => { const [y, mm] = m.split('-'); return `${MONTH_NAMES[parseInt(mm) - 1].slice(0, 3)} ${y.slice(2)}`; };

// Suma diaria de una sección (todas sus cuentas/rubros) para un día dado
const seccionDia = (s: Seccion, dia: number) => s.rubros.reduce((a, r) => a + (r.dias[dia] || 0), 0);
// ¿La sección es de ingresos?
const esSeccionIngreso = (s: Seccion) => s.titulo.toLowerCase().startsWith('ingreso') && !s.titulo.toUpperCase().includes('SALDO');
// ¿Es la sección de saldo inicial (cuentas)?
const esSaldoInicial = (s: Seccion) => s.titulo.toUpperCase().includes('SALDO INICIAL');

// ¿Es la sección de Inversiones? (el título suele ser "Inversiones y Cuotas Prestamo")
const esSeccionInversiones = (s: Seccion) => s.titulo.toLowerCase().includes('inversion');
// Devuelve la sección de inversiones de un mes (o null)
const inversionesDeMes = (md: MonthData): Seccion | null => md.secciones.find(esSeccionInversiones) || null;

// Totales de ingresos y egresos de un mes por DÉCADA del mes (1-10, 11-20, 21-fin)
function porDecada(md: MonthData) {
  const tramos = [
    { label: '1 a 10', desde: 1, hasta: 10, ingresos: 0, egresos: 0 },
    { label: '11 a 20', desde: 11, hasta: 20, ingresos: 0, egresos: 0 },
    { label: '21 a fin', desde: 21, hasta: 31, ingresos: 0, egresos: 0 },
  ];
  md.secciones.forEach(s => {
    if (esSaldoInicial(s)) return;
    const ingreso = esSeccionIngreso(s);
    s.rubros.forEach(r => {
      Object.entries(r.dias).forEach(([d, val]) => {
        const dia = parseInt(d);
        const t = tramos.find(t => dia >= t.desde && dia <= t.hasta);
        if (t) { if (ingreso) t.ingresos += val; else t.egresos += Math.abs(val); }
      });
    });
  });
  return tramos.map(t => ({ ...t, neto: t.ingresos - t.egresos }));
}

// Punto de equilibrio de caja de un mes: día en que los ingresos acumulados
// alcanzan a cubrir los egresos totales del mes. Devuelve null si no hay egresos.
// `excluidas` es un Set de nombres de cuenta (rubros) a NO considerar en el cálculo.
function puntoEquilibrioDeMes(md: MonthData, excluidas?: Set<string>) {
  const exc = excluidas || new Set<string>();
  const dias = md.dias || [];
  // Egresos e ingresos totales recalculados sumando solo las cuentas NO excluidas
  let egresosTotales = 0;
  let ingresosTotales = 0;
  md.secciones.forEach(s => {
    if (esSaldoInicial(s)) return;
    const ingreso = esSeccionIngreso(s);
    s.rubros.forEach(r => {
      if (exc.has(r.nombre)) return;
      const totalRubro = Object.values(r.dias).reduce((a, v) => a + v, 0);
      if (ingreso) ingresosTotales += totalRubro;
      else egresosTotales += Math.abs(totalRubro);
    });
  });
  if (egresosTotales <= 0) return null;
  let ingAcum = 0;
  let diaCubierto: number | null = null;
  for (const d of dias) {
    let ingDia = 0;
    md.secciones.forEach(s => {
      if (esSaldoInicial(s)) return;
      if (esSeccionIngreso(s)) {
        s.rubros.forEach(r => { if (!exc.has(r.nombre)) ingDia += (r.dias[d] || 0); });
      }
    });
    ingAcum += ingDia;
    if (ingAcum >= egresosTotales) { diaCubierto = d; break; }
  }
  return { alcanzado: diaCubierto !== null, dia: diaCubierto, egresosTotales, ingresosTotales };
}

// Convierte un valor de celda (número o texto "$ 1.234,56" / "$ 1,234.56" / "-$ 1234") a número.
// Soporta separadores en formato es-AR (1.234,56) y US (1,234.56) detectando cuál es el decimal.
function parseMoney(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (!s) return 0;
  const neg = s.includes('-');
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return 0;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > lastDot) {
    // decimal = coma (es-AR): quitar puntos de miles, coma -> punto
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    // decimal = punto (US): quitar comas de miles
    s = s.replace(/,/g, '');
  } else {
    // sin separador decimal claro: quitar ambos como miles
    s = s.replace(/[.,]/g, '');
  }
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return neg ? -Math.abs(n) : n;
}

export default function MonthlyCashFlowView({ isReadOnly }: { isReadOnly?: boolean }) {
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [months, setMonths] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [data, setData] = useState<MonthData | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<'resumen' | 'analisis'>('resumen');
  const [allData, setAllData] = useState<MonthData[]>([]); // todos los meses, para comparar
  // Mes/año a usar al importar (selector previo)
  const now = new Date();
  const [importMonth, setImportMonth] = useState<number>(now.getMonth() + 1);
  const [importYear, setImportYear] = useState<number>(now.getFullYear());

  useEffect(() => { loadMonths(); }, []);
  useEffect(() => { if (selectedMonth) loadMonth(selectedMonth); }, [selectedMonth]);
  useEffect(() => { if (activeTab === 'analisis') loadAllData(); }, [activeTab, months.join(',')]);

  const loadAllData = async () => {
    try {
      const { data: rows } = await supabase.from('monthly_cashflow').select('data').order('month', { ascending: true });
      setAllData((rows || []).map((r: any) => r.data as MonthData).filter(Boolean));
    } catch (e) { console.error('Error cargando análisis:', e); }
  };

  const loadMonths = async () => {
    setLoading(true);
    try {
      const { data: rows } = await supabase.from('monthly_cashflow').select('month').order('month', { ascending: false });
      const ms = (rows || []).map((r: any) => r.month);
      setMonths(ms);
      if (ms.length && !selectedMonth) setSelectedMonth(ms[0]);
    } catch (e) { console.error('Error cargando meses:', e); }
    setLoading(false);
  };

  const loadMonth = async (month: string) => {
    try {
      const { data: row } = await supabase.from('monthly_cashflow').select('data').eq('month', month).maybeSingle();
      if (row?.data) setData(row.data as MonthData);
      else setData(null);
    } catch (e) { console.error('Error cargando mes:', e); }
  };

  const monthLabel = (m: string) => {
    if (!m) return '';
    const [y, mm] = m.split('-');
    return `${MONTH_NAMES[parseInt(mm) - 1]} ${y}`;
  };

  // ===== Importación del Excel =====
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

      // Fila 0 = DIA: detectar columnas de días (1..31) y la columna de TOTALES
      const headerRow = grid[0] || [];
      const dayCols: Record<number, number> = {}; // colIndex -> dayNumber
      let totalCol = -1;
      for (let c = 1; c < headerRow.length; c++) {
        const v = headerRow[c];
        if (typeof v === 'number' && v >= 1 && v <= 31) dayCols[c] = v;
        else if (v && String(v).toUpperCase().includes('TOTAL')) { totalCol = c; break; }
      }
      const dias = Object.values(dayCols).sort((a, b) => a - b);

      // Pedir el mes al que corresponde la planilla (con un valor sugerido)
      const sugerido = `${importYear}-${String(importMonth).padStart(2, '0')}`;
      const mesInput = window.prompt(
        '¿A qué mes corresponde esta planilla?\n\nEscribilo en formato AAAA-MM (año-mes).\nEjemplos: 2026-01 para Enero 2026, 2026-02 para Febrero 2026.',
        sugerido
      );
      if (!mesInput) { setImporting(false); e.target.value = ''; return; }
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesInput.trim())) {
        alert('Mes inválido. Usá el formato AAAA-MM, por ejemplo 2026-02.');
        setImporting(false); e.target.value = '';
        return;
      }
      const month = mesInput.trim();

      // Confirmar antes de guardar: indicar si crea uno nuevo o reemplaza uno existente
      const yaExiste = months.includes(month);
      const totIngresosArchivo = (() => {
        // pequeño preview del total de ingresos para que el usuario verifique que es el archivo correcto
        for (let r = 1; r < grid.length; r++) {
          const lab = (grid[r]?.[0] != null ? String(grid[r][0]).trim().toLowerCase() : '');
          if (lab === 'total ingresos') return totalCol >= 0 ? parseMoney(grid[r][totalCol]) : 0;
        }
        return 0;
      })();
      const confirmMsg =
        `Vas a importar la planilla para: ${monthLabel(month)}\n\n` +
        `Total Ingresos detectado: $${totIngresosArchivo.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n` +
        `Días detectados: ${dias.length}\n\n` +
        (yaExiste
          ? `⚠️ Ya hay una planilla cargada para ${monthLabel(month)}. Se REEMPLAZARÁ por esta.\n\n`
          : `Se creará una nueva planilla para este mes.\n\n`) +
        `¿Confirmás?`;
      if (!window.confirm(confirmMsg)) { setImporting(false); e.target.value = ''; return; }

      const cellNum = (r: number, c: number) => parseMoney(grid[r]?.[c]);
      const labelOf = (r: number) => (grid[r]?.[0] != null ? String(grid[r][0]).trim() : '');
      const agText = (r: number) => (totalCol >= 0 && grid[r]?.[totalCol] != null ? String(grid[r][totalCol]).trim().toLowerCase() : '');

      // Filas de resumen (arriba): Saldo Inicial, Total Ingresos, Total Egresos, Neto, Acumulado, Ajustes
      const resumen: any = {};
      const resumenTotales: Record<string, number> = {};
      const resumenLabels = ['saldo inicial', 'total ingresos', 'total egresos', 'neto', 'acumulado', 'ajustes'];
      // Secciones
      const secciones: Seccion[] = [];
      let cur: Seccion | null = null;

      for (let r = 1; r < grid.length; r++) {
        const label = labelOf(r);
        if (!label) continue;
        const lower = label.toLowerCase();
        const ag = agText(r);

        // ¿Encabezado de sección? (la celda de totales tiene una etiqueta conocida).
        // Se chequea PRIMERO para que el header "SALDO INICIAL" de la sección de cuentas
        // no se confunda con la fila de resumen "Saldo Inicial".
        if (HEADER_AG.has(ag)) {
          cur = { titulo: label, rubros: [], total: 0 };
          secciones.push(cur);
          continue;
        }

        // Resumen superior (antes de la primera sección)
        const matchResumen = resumenLabels.find(rl => lower.startsWith(rl));
        if (matchResumen && secciones.length === 0) {
          const perDay: Record<number, number> = {};
          Object.entries(dayCols).forEach(([c, d]) => { perDay[d] = cellNum(r, parseInt(c)); });
          resumen[matchResumen] = perDay;
          resumenTotales[matchResumen] = totalCol >= 0 ? cellNum(r, totalCol) : 0;
          continue;
        }

        // ¿Total de sección?
        if (lower.startsWith('total')) {
          if (cur) cur.total = totalCol >= 0 ? cellNum(r, totalCol) : 0;
          continue;
        }
        // Rubro normal
        if (cur) {
          const perDay: Record<number, number> = {};
          Object.entries(dayCols).forEach(([c, d]) => { const val = cellNum(r, parseInt(c)); if (val !== 0) perDay[d] = val; });
          cur.rubros.push({ nombre: label, total: totalCol >= 0 ? cellNum(r, totalCol) : 0, dias: perDay });
        }
      }

      const monthData: MonthData = { month, resumen, resumenTotales, secciones, dias };

      // Guardar en Supabase
      const { error } = await supabase.from('monthly_cashflow').upsert({
        id: month, month, data: monthData, imported_at: new Date().toISOString(),
      }, { onConflict: 'month' });
      if (error) throw error;

      await loadMonths();
      setSelectedMonth(month);
      setData(monthData);
      alert(`Planilla de ${monthLabel(month)} importada correctamente: ${secciones.length} secciones, ${dias.length} días.`);
    } catch (err: any) {
      console.error('Error importando:', err);
      alert('Error al importar la planilla: ' + (err.message || err));
    }
    setImporting(false);
    e.target.value = '';
  };

  // ===== Plantilla modelo para cargar los meses que faltan =====
  // Se arma con la MISMA estructura que espera handleImport. Si ya hay un mes cargado,
  // se copian sus secciones y cuentas (con los importes vacíos) para no tener que
  // reescribir el plan de cuentas; si no hay ninguno, se usa el modelo por defecto.
  const descargarPlantilla = () => {
    const sugerido = `${importYear}-${String(importMonth).padStart(2, '0')}`;
    const mesInput = window.prompt(
      '¿Para qué mes querés la plantilla?\n\nEscribilo en formato AAAA-MM (año-mes).\nSe generan las columnas de días que tiene ese mes.\nEjemplos: 2026-01 para Enero 2026, 2026-02 para Febrero 2026.',
      sugerido
    );
    if (!mesInput) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mesInput.trim())) {
      alert('Mes inválido. Usá el formato AAAA-MM, por ejemplo 2026-02.');
      return;
    }
    const month = mesInput.trim();
    const [y, m] = month.split('-').map(Number);
    const cantDias = new Date(y, m, 0).getDate();
    const dias = Array.from({ length: cantDias }, (_, i) => i + 1);

    // Estructura: la del mes que se está viendo, o el modelo por defecto
    const base = data && data.secciones?.length
      ? data.secciones.map(s => ({
          titulo: s.titulo,
          tag: tagParaTitulo(s.titulo),
          rubros: s.rubros.map(r => r.nombre)
        }))
      : PLANTILLA_SECCIONES;
    const copiadaDeMes = Boolean(data && data.secciones?.length);

    const vacias = () => dias.map(() => null);
    const grid: any[][] = [];

    // Fila 0: DIA + los días + TOTALES (el importador corta en la primera celda con "TOTAL")
    grid.push(['DIA', ...dias, 'TOTALES']);

    // Resumen superior. Tiene que ir ANTES de la primera sección: el importador solo lo
    // reconoce mientras no haya abierto ninguna.
    ['Saldo Inicial', 'Total Ingresos', 'Total Egresos', 'Neto', 'Acumulado', 'Ajustes']
      .forEach(lbl => grid.push([lbl, ...vacias(), null]));

    grid.push([]); // separador visual, el importador ignora las filas sin etiqueta

    base.forEach(sec => {
      // Encabezado de sección: título en la columna A y la etiqueta en TOTALES
      grid.push([sec.titulo, ...vacias(), sec.tag]);
      sec.rubros.forEach(nombre => grid.push([nombre, ...vacias(), null]));
      grid.push([`TOTAL ${sec.titulo}`, ...vacias(), null]);
      grid.push([]);
    });

    const ws = XLSX.utils.aoa_to_sheet(grid);
    ws['!cols'] = [{ wch: 34 }, ...dias.map(() => ({ wch: 11 })), { wch: 16 }];

    // Hoja aparte con las reglas del formato, para que la planilla no se rompa al editarla
    const ayuda: any[][] = [
      ['PLANTILLA DE FLUJO DE CAJA MENSUAL'],
      [`Generada para: ${monthLabel(month)} (${cantDias} días)`],
      [copiadaDeMes
        ? `Las secciones y cuentas se copiaron de la planilla de ${monthLabel(selectedMonth)} que ya tenés cargada.`
        : 'Todavía no hay ninguna planilla cargada, así que las secciones y cuentas son un modelo de ejemplo.'],
      [],
      ['CÓMO COMPLETARLA'],
      ['1', 'Cargá los importes de cada cuenta en la columna del día que corresponde.'],
      ['2', 'Podés renombrar, agregar o borrar cuentas dentro de cada sección.'],
      ['3', 'Los egresos se pueden cargar en positivo o en negativo: el sistema usa el valor absoluto.'],
      ['4', 'Las celdas vacías o en cero simplemente no se cargan.'],
      ['5', 'Cuando termines, subila con el botón "Importar Excel" y elegí el mes.'],
      [],
      ['QUÉ NO HAY QUE TOCAR'],
      ['A', 'La fila 1: tiene que seguir siendo DIA, los números de día y TOTALES al final.'],
      ['B', 'La última columna (TOTALES) en las filas de encabezado de sección.'],
      ['', 'Ese texto es lo que le indica al sistema dónde empieza cada sección.'],
      ['', `Valores válidos: ${Array.from(HEADER_AG).join(' · ')}`],
      ['C', 'Las 6 filas de resumen de arriba (Saldo Inicial, Total Ingresos, Total Egresos,'],
      ['', 'Neto, Acumulado, Ajustes) tienen que quedar ANTES de la primera sección.'],
      ['D', 'Las filas que empiezan con la palabra TOTAL se leen como el total de la sección,'],
      ['', 'así que no le pongas ese nombre a una cuenta.'],
      [],
      ['NOMBRES DE SECCIÓN CON SIGNIFICADO'],
      ['', 'Si el título contiene "SALDO INICIAL" se trata como saldos de cuentas, no como movimiento.'],
      ['', 'Si el título empieza con "INGRESO" se suma como ingreso; el resto se toma como egreso.'],
      ['', 'Si el título contiene "INVERSION" aparece además en el detalle de inversiones.'],
    ];
    const wsAyuda = XLSX.utils.aoa_to_sheet(ayuda);
    wsAyuda['!cols'] = [{ wch: 5 }, { wch: 100 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'FLUJO DE CAJA');
    XLSX.utils.book_append_sheet(wb, wsAyuda, 'INSTRUCCIONES');
    XLSX.writeFile(wb, `plantilla_flujo_caja_${month}.xlsx`);
  };

  const eliminarMes = async () => {
    if (isReadOnly || !selectedMonth) return;
    if (!window.confirm(`¿Eliminar la planilla de ${monthLabel(selectedMonth)}?`)) return;
    try {
      await supabase.from('monthly_cashflow').delete().eq('month', selectedMonth);
      setData(null);
      await loadMonths();
      setSelectedMonth('');
    } catch (e: any) { alert('Error: ' + (e.message || e)); }
  };

  const toggleSection = (t: string) => setOpenSections(p => ({ ...p, [t]: !p[t] }));

  // Totales derivados para las tarjetas
  const totIngresos = data?.resumenTotales['total ingresos'] || 0;
  const totEgresos = data?.resumenTotales['total egresos'] || 0;
  const totNeto = data?.resumenTotales['neto'] ?? (totIngresos - totEgresos);
  const saldoInicialResumen = data?.resumenTotales['saldo inicial'] || 0;
  // Si el resumen no trajo el saldo inicial, lo calculamos sumando el PRIMER día de cada cuenta
  // (Caja Central, Santander, etc.) de la sección "SALDO INICIAL".
  const primerDia = data?.dias?.[0];
  const saldoSeccionCuentas = (data?.secciones || [])
    .filter(s => s.titulo.toUpperCase().includes('SALDO INICIAL'))
    .reduce((acc, s) => acc + s.rubros.reduce((a, r) => a + (primerDia != null ? (r.dias[primerDia] || 0) : 0), 0), 0);
  const saldoInicial = saldoInicialResumen || saldoSeccionCuentas;
  const acumulado = data?.resumenTotales['acumulado'] || 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Cabecera */}
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h2 className="text-xl font-black uppercase text-text-main tracking-widest flex items-center gap-2">
            <BarChart3 className="text-brand-500" size={24} /> Flujo de Caja Mensual
          </h2>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 opacity-70">
            Importá tu planilla mensual y visualizá el resumen
          </p>
        </div>
        <div className="flex gap-2 items-center flex-wrap">
          {months.length > 0 && (
            <div className="relative">
              <Calendar size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
              <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}
                className="bg-bg-card border border-border-dim rounded pl-8 pr-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500 appearance-none">
                {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
              </select>
            </div>
          )}
          {data && !isReadOnly && (
            <button onClick={eliminarMes}
              className="flex items-center gap-1.5 bg-red-500/10 text-red-500 border border-red-500/30 px-3 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"
              title="Eliminar la planilla del mes seleccionado">
              <Trash2 size={14} /> Eliminar
            </button>
          )}
          <button onClick={descargarPlantilla}
            className="flex items-center gap-1.5 bg-bg-card border border-border-dim text-text-main px-3 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:border-brand-500 hover:text-brand-500 transition-all"
            title="Descargar una plantilla Excel vacía con el formato que espera el importador">
            <Download size={14} /> Plantilla
          </button>
          <label className={cn("flex items-center gap-2 bg-brand-500 text-white px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest cursor-pointer hover:bg-brand-600 transition-all", importing && "opacity-50 pointer-events-none")}>
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Importar Excel
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} disabled={importing || isReadOnly} />
          </label>
        </div>
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 size={26} className="animate-spin text-brand-500" /></div>
      ) : !data ? (
        <div className="bg-bg-sidebar border border-dashed border-border-dim rounded-xl p-12 text-center">
          <BarChart3 size={40} className="mx-auto text-text-dim opacity-40 mb-4" />
          <p className="text-[12px] font-black uppercase text-text-main tracking-widest mb-2">No hay ninguna planilla cargada</p>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest opacity-70">Tocá "Importar Excel" para cargar tu flujo de caja mensual</p>
        </div>
      ) : (
        <>
          {/* Pestañas */}
          <div className="flex gap-1 bg-bg-accent/40 rounded-lg p-1 w-fit">
            <button onClick={() => setActiveTab('resumen')}
              className={cn("flex items-center gap-1.5 px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all",
                activeTab === 'resumen' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>
              <LayoutDashboard size={13} /> Resumen
            </button>
            <button onClick={() => setActiveTab('analisis')}
              className={cn("flex items-center gap-1.5 px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all",
                activeTab === 'analisis' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>
              <TrendingUp size={13} /> Análisis
            </button>
          </div>

          {activeTab === 'resumen' && (<>
          {/* Tarjetas de resumen */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label: 'Saldo Inicial', val: saldoInicial, color: 'text-text-main' },
              { label: 'Total Ingresos', val: totIngresos, color: 'text-emerald-500' },
              { label: 'Total Egresos', val: totEgresos, color: 'text-red-500' },
              { label: 'Neto del Mes', val: totNeto, color: totNeto >= 0 ? 'text-emerald-500' : 'text-red-500' },
              { label: 'Acumulado', val: acumulado, color: 'text-brand-500' },
            ].map(c => (
              <div key={c.label} className="bg-bg-sidebar border border-border-dim rounded-xl p-4">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-dim mb-1">{c.label}</p>
                <p className={cn("text-[15px] font-mono font-black", c.color)}>{fmt(c.val)}</p>
              </div>
            ))}
          </div>

          {/* Saldo inicial por cuenta */}
          {data.secciones.filter(s => s.titulo.toUpperCase().includes('SALDO INICIAL')).map(s => (
            <div key={s.titulo} className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-border-dim bg-bg-accent/30">
                <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Saldo Inicial por Cuenta</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-4">
                {s.rubros.map(r => {
                  const valCuenta = primerDia != null ? (r.dias[primerDia] || 0) : r.total;
                  return (
                    <div key={r.nombre} className="bg-bg-accent/30 border border-border-dim/40 rounded px-3 py-2 flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-text-dim truncate">{r.nombre}</span>
                      <span className="text-[11px] font-mono font-black text-text-main">{fmt(valCuenta)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Secciones de ingresos y egresos (excluye saldo inicial) */}
          <div className="space-y-3">
            {data.secciones.filter(s => !s.titulo.toUpperCase().includes('SALDO INICIAL')).map(s => {
              const esIngreso = s.titulo.toLowerCase().startsWith('ingreso');
              const isOpen = openSections[s.titulo] ?? false;
              return (
                <div key={s.titulo} className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
                  <button onClick={() => toggleSection(s.titulo)} className="w-full px-5 py-3 border-b border-border-dim flex items-center justify-between hover:bg-bg-accent/20 transition-all">
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown size={15} className="text-text-dim" /> : <ChevronRight size={15} className="text-text-dim" />}
                      <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">{s.titulo}</h3>
                      <span className="text-[8px] font-bold text-text-dim uppercase">({s.rubros.length})</span>
                    </div>
                    <span className={cn("text-[13px] font-mono font-black", esIngreso ? "text-emerald-500" : "text-red-500")}>{fmt(s.total)}</span>
                  </button>
                  {isOpen && (
                    <div className="divide-y divide-border-dim/30">
                      {s.rubros.map(r => (
                        <div key={r.nombre} className="px-5 py-2 flex items-center justify-between hover:bg-bg-accent/10">
                          <span className="text-[10px] font-bold text-text-dim uppercase">{r.nombre}</span>
                          <span className={cn("text-[11px] font-mono font-black", r.total < 0 ? "text-red-400" : "text-text-main")}>{fmt(r.total)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </>)}

          {activeTab === 'analisis' && (
            <AnalysisTab allData={allData} currentMonth={data} monthLabel={monthLabel} monthShort={monthShort} />
          )}

        </>
      )}
    </motion.div>
  );
}

// ===== Pestaña de Análisis =====
function AnalysisTab({ allData, currentMonth, monthLabel, monthShort }: {
  allData: MonthData[]; currentMonth: MonthData;
  monthLabel: (m: string) => string; monthShort: (m: string) => string;
}) {
  if (!allData || allData.length === 0) {
    return <div className="py-12 flex justify-center"><Loader2 size={22} className="animate-spin text-brand-500" /></div>;
  }

  // Vista del gráfico de saldo día a día
  const [vistaGrafico, setVistaGrafico] = useState<'ingvsegr' | 'dispvsegr' | 'acumulado'>('acumulado');

  // 1) Serie día a día del mes actual
  const serieDiaria = (() => {
    const md = currentMonth;
    const dias = md.dias || [];
    const acumPorDia = md.resumen?.['acumulado'] as Record<number, number> | undefined;
    const saldoInicialTotal = md.resumenTotales?.['saldo inicial'] || 0;
    let ingAcum = 0;
    return dias.map(d => {
      // Ingresos y egresos del día (sumando secciones)
      let ingDia = 0, egrDia = 0;
      md.secciones.forEach(s => {
        if (esSaldoInicial(s)) return;
        const v = seccionDia(s, d);
        if (esSeccionIngreso(s)) ingDia += v; else egrDia += Math.abs(v);
      });
      ingAcum += ingDia;
      return {
        dia: d,
        ingresos: ingDia,
        egresos: egrDia,
        disponible: saldoInicialTotal + ingAcum, // saldo inicial + ingresos acumulados
        acumulado: acumPorDia?.[d] ?? 0,
      };
    });
  })();

  // Cuentas que se pueden marcar/desmarcar para el punto de equilibrio.
  // Son todas las cuentas (rubros) de las secciones de ingreso y egreso (no Saldo Inicial),
  // de todos los meses cargados. Por defecto todas INCLUIDAS (set de excluidas vacío).
  const cuentasMarcables = Array.from(new Set(
    allData.flatMap(md => md.secciones
      .filter(s => !esSaldoInicial(s))
      .flatMap(s => s.rubros.map(r => r.nombre))
    )
  ));
  const [cuentasExcluidas, setCuentasExcluidas] = useState<Set<string>>(new Set());
  const [mostrarSelectorPE, setMostrarSelectorPE] = useState(false);
  const toggleCuenta = (nombre: string) => {
    setCuentasExcluidas(prev => {
      const n = new Set(prev);
      if (n.has(nombre)) n.delete(nombre); else n.add(nombre);
      return n;
    });
  };

  // 1b) Punto de equilibrio del mes (respeta las cuentas excluidas)
  const puntoEquilibrio = (() => {
    const pe = puntoEquilibrioDeMes(currentMonth, cuentasExcluidas);
    if (!pe) return null;
    const totalDias = (currentMonth.dias || []).length || 1;
    const pctDelMes = pe.alcanzado ? Math.round((pe.dia! / totalDias) * 100) : 100;
    const faltante = pe.alcanzado ? 0 : Math.max(0, pe.egresosTotales - pe.ingresosTotales);
    return {
      alcanzado: pe.alcanzado, dia: pe.dia, ingresosAlCubrir: pe.egresosTotales,
      egresosTotales: pe.egresosTotales, ingresosTotales: pe.ingresosTotales, pctDelMes, faltante,
    };
  })();

  // 2) Por década del mes actual
  const decadas = porDecada(currentMonth);

  // 3) Comparación mes a mes: totales
  const compMeses = allData.map(md => {
    const ing = md.resumenTotales?.['total ingresos'] || 0;
    const egr = md.resumenTotales?.['total egresos'] || 0;
    return { mes: monthShort(md.month), ingresos: ing, egresos: egr, neto: ing - egr };
  });

  // 4) Comparación por rubro de EGRESO entre meses (secciones de egreso)
  const seccionesEgreso = Array.from(new Set(
    allData.flatMap(md => md.secciones.filter(s => !esSaldoInicial(s) && !esSeccionIngreso(s)).map(s => s.titulo))
  ));
  // Rubro elegido para ver su evolución mes a mes (por defecto el primero)
  const [rubroSel, setRubroSel] = useState<string>('');
  const rubroActivo = rubroSel && seccionesEgreso.includes(rubroSel) ? rubroSel : (seccionesEgreso[0] || '');
  // Evolución del rubro elegido: un punto por mes
  const evolucionRubro = allData.map(md => {
    const s = md.secciones.find(x => x.titulo === rubroActivo);
    return { mes: monthShort(md.month), monto: s ? Math.abs(s.total) : 0 };
  });

  // KPIs
  const peorTramo = decadas.reduce((min, t) => t.neto < min.neto ? t : min, decadas[0]);
  const mejorMes = compMeses.reduce((max, m) => m.neto > max.neto ? m : max, compMeses[0]);
  const peorMes = compMeses.reduce((min, m) => m.neto < min.neto ? m : min, compMeses[0]);

  // Análisis de Inversiones del mes actual: total + cada cuenta con su monto,
  // % sobre el total de inversiones y % sobre el total de ingresos del mes.
  const inversionesMesActual = (() => {
    const sec = inversionesDeMes(currentMonth);
    if (!sec) return null;
    const totalInv = Math.abs(sec.total) || sec.rubros.reduce((a, r) => a + Math.abs(r.total), 0);
    const ingresosMes = currentMonth.resumenTotales?.['total ingresos'] || 0;
    const cuentas = sec.rubros
      .map(r => {
        const monto = Math.abs(r.total);
        return {
          nombre: r.nombre,
          monto,
          pctSobreInv: totalInv > 0 ? (monto / totalInv) * 100 : 0,
          pctSobreIng: ingresosMes > 0 ? (monto / ingresosMes) * 100 : 0,
        };
      })
      .filter(c => c.monto !== 0)
      .sort((a, b) => b.monto - a.monto);
    return { titulo: sec.titulo, totalInv, ingresosMes, pctInvSobreIng: ingresosMes > 0 ? (totalInv / ingresosMes) * 100 : 0, cuentas };
  })();

  // Para el consolidado: todas las cuentas de inversiones que existen en cualquier mes
  const cuentasInvConsolidado = Array.from(new Set(
    allData.flatMap(md => { const s = inversionesDeMes(md); return s ? s.rubros.map(r => r.nombre) : []; })
  ));

  // Modo Consolidado: ver todos los meses en columnas, lado a lado
  const [consolidado, setConsolidado] = useState(false);
  const datosConsolidados = allData.map(md => {
    const ing = md.resumenTotales?.['total ingresos'] || 0;
    const egr = md.resumenTotales?.['total egresos'] || 0;
    const acum = md.resumenTotales?.['acumulado'] || 0;
    const tramos = porDecada(md);
    const pe = puntoEquilibrioDeMes(md, cuentasExcluidas);
    return {
      month: md.month,
      mesLabel: monthLabel(md.month),
      ingresos: ing,
      egresos: egr,
      neto: ing - egr,
      acumulado: acum,
      tramos,
      pe,
    };
  });

  const COLORS = ['#e31e24', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  // ===== Exportación a PDF para presentar a socios =====
  // Estilo de marca compartido con los demás PDF del sistema.
  const PDF_BRAND: [number, number, number] = [193, 18, 31];
  const PDF_DARK: [number, number, number] = [33, 37, 41];
  const PDF_GRAY: [number, number, number] = [110, 116, 122];
  const PDF_GREEN: [number, number, number] = [16, 120, 80];
  const PDF_RED: [number, number, number] = [190, 60, 60];
  const PDF_FONT = 'helvetica';

  // La fuente base (Helvetica/WinAnsi) no soporta em-dash ni otros simbolos: se limpian.
  const pdfTxt = (s: string) => String(s ?? '').replace(/—/g, '-').replace(/[^\x00-\xFF]/g, '').trim();
  // Importes sin el simbolo $ repetido en cada celda (va aclarado en el encabezado)
  const pdfNum = (n: number) => (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Cabecera de marca comun a los dos informes. Devuelve la Y donde sigue el contenido.
  const pdfHeader = (doc: any, PW: number, M: number, titulo: string, subtitulo: string, derecha: string) => {
    doc.setFillColor(...PDF_BRAND); doc.rect(0, 0, PW, 30, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(PDF_FONT, 'bold'); doc.setFontSize(9); doc.text('GESTIÓN CRAFT', M, 12);
    doc.setFontSize(15); doc.text(titulo, M, 21);
    doc.setFont(PDF_FONT, 'normal'); doc.setFontSize(8); doc.text(subtitulo, M, 26.5);
    doc.setFont(PDF_FONT, 'bold'); doc.setFontSize(9); doc.text('INFORME PARA SOCIOS', PW - M, 12, { align: 'right' });
    doc.setFontSize(11); doc.text(derecha, PW - M, 18, { align: 'right' });
    doc.setFont(PDF_FONT, 'normal'); doc.setFontSize(8);
    doc.text(`Emitido el ${new Date().toLocaleDateString('es-AR')}`, PW - M, 24, { align: 'right' });
    return 40;
  };

  // Nota al pie del punto de equilibrio. Aclara de donde sale el numero (se recalcula
  // desde las cuentas, no es la fila "Total Egresos" de la planilla) y que cuentas se
  // dejaron afuera: sin eso el informe no es reproducible por quien lo lee.
  const pdfNotaEquilibrio = (doc: any, M: number, CW: number, y: number) => {
    const nombres = Array.from(cuentasExcluidas).map(pdfTxt).join(', ');
    const base = 'El punto de equilibrio se recalcula sumando las cuentas de ingreso y egreso del mes, '
      + 'por lo que puede no coincidir con la fila Total Egresos de la planilla importada.';
    const txtCompleto = cuentasExcluidas.size > 0
      ? `${base} Se excluyeron ${cuentasExcluidas.size} cuenta(s): ${nombres}.`
      : base;
    doc.setFont(PDF_FONT, 'italic'); doc.setFontSize(7.5); doc.setTextColor(...PDF_GRAY);
    const txt = doc.splitTextToSize(txtCompleto, CW);
    doc.text(txt, M, y);
    return y + txt.length * 3.6 + 3;
  };

  const pdfFooter = (doc: any, PW: number, PH: number, M: number, pie: string) => {
    const pc = doc.getNumberOfPages();
    for (let p = 1; p <= pc; p++) {
      doc.setPage(p);
      doc.setDrawColor(230, 231, 233); doc.setLineWidth(0.3); doc.line(M, PH - 12, PW - M, PH - 12);
      doc.setFont(PDF_FONT, 'normal'); doc.setFontSize(7); doc.setTextColor(...PDF_GRAY);
      doc.text(pie, M, PH - 8);
      doc.text(`Página ${p} de ${pc}`, PW - M, PH - 8, { align: 'right' });
    }
  };

  const baseTable = {
    styles: { fontSize: 8.5, cellPadding: 2.2, textColor: PDF_DARK as any, lineColor: [235, 236, 238] as any, lineWidth: 0.2 },
    headStyles: { fillColor: PDF_BRAND as any, textColor: [255, 255, 255] as any, fontStyle: 'bold' as const, fontSize: 8 },
    alternateRowStyles: { fillColor: [249, 250, 251] as any },
  };

  // ---- Informe del mes seleccionado ----
  const exportarPDFMes = () => {
    const PW = 210, PH = 297, M = 14, CW = PW - 2 * M;
    const doc = new jsPDF();
    let y = pdfHeader(doc, PW, M,
      'ANÁLISIS DE FLUJO DE CAJA',
      'Resumen del mes: equilibrio, tramos, movimiento diario e inversiones',
      pdfTxt(monthLabel(currentMonth.month)));

    // Titulares del mes
    const ingresosMes = currentMonth.resumenTotales?.['total ingresos'] || 0;
    const egresosMes = currentMonth.resumenTotales?.['total egresos'] || 0;
    autoTable(doc, {
      head: [['Indicador', 'Valor']],
      body: [
        ['Total de ingresos del mes', `$${pdfNum(ingresosMes)}`],
        ['Total de egresos del mes', `$${pdfNum(egresosMes)}`],
        ['Neto del mes', `$${pdfNum(ingresosMes - egresosMes)}`],
        ['Acumulado', `$${pdfNum(currentMonth.resumenTotales?.['acumulado'] || 0)}`],
        ['Tramo más ajustado', `Días ${peorTramo.label} · $${pdfNum(peorTramo.neto)}`],
        ['Mejor mes de la serie (neto)', `${pdfTxt(mejorMes?.mes || '-')} · $${pdfNum(mejorMes?.neto || 0)}`],
        ['Peor mes de la serie (neto)', `${pdfTxt(peorMes?.mes || '-')} · $${pdfNum(peorMes?.neto || 0)}`],
      ],
      startY: y, margin: { left: M, right: M }, ...baseTable,
      columnStyles: { 0: { cellWidth: CW - 70 }, 1: { cellWidth: 70, halign: 'right', fontStyle: 'bold' } },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // Punto de equilibrio
    doc.setFont(PDF_FONT, 'bold'); doc.setFontSize(11); doc.setTextColor(...PDF_DARK);
    doc.text('Punto de equilibrio', M, y); y += 3;
    if (puntoEquilibrio) {
      autoTable(doc, {
        head: [['Concepto', 'Valor']],
        body: [
          ['Estado', puntoEquilibrio.alcanzado
            ? `Alcanzado el día ${puntoEquilibrio.dia} (${puntoEquilibrio.pctDelMes}% del mes)`
            : 'No alcanzado en el mes'],
          ['Egresos totales a cubrir', `$${pdfNum(puntoEquilibrio.egresosTotales)}`],
          ['Ingresos totales del mes', `$${pdfNum(puntoEquilibrio.ingresosTotales)}`],
          [puntoEquilibrio.alcanzado ? 'Excedente sobre el equilibrio' : 'Faltante para el equilibrio',
            `$${pdfNum(puntoEquilibrio.alcanzado
              ? puntoEquilibrio.ingresosTotales - puntoEquilibrio.egresosTotales
              : puntoEquilibrio.faltante)}`],
        ],
        startY: y + 2, margin: { left: M, right: M }, ...baseTable,
        columnStyles: {
          0: { cellWidth: CW - 70 },
          1: { cellWidth: 70, halign: 'right', fontStyle: 'bold',
               textColor: (puntoEquilibrio.alcanzado ? PDF_GREEN : PDF_RED) as any },
        },
      });
      y = (doc as any).lastAutoTable.finalY + 4;
      y = pdfNotaEquilibrio(doc, M, CW, y);
      y += 4;
    } else {
      doc.setFont(PDF_FONT, 'normal'); doc.setFontSize(9); doc.setTextColor(...PDF_GRAY);
      doc.text('El mes no registra egresos, no aplica.', M, y + 6); y += 14;
    }

    // Tramos del mes
    if (y > PH - 60) { doc.addPage(); y = 20; }
    doc.setFont(PDF_FONT, 'bold'); doc.setFontSize(11); doc.setTextColor(...PDF_DARK);
    doc.text('Tramos del mes', M, y);
    autoTable(doc, {
      head: [['Tramo', 'Ingresos', 'Egresos', 'Neto']],
      body: decadas.map(t => [
        `Días ${t.label}${t.label === peorTramo.label ? ' (más ajustado)' : ''}`,
        `$${pdfNum(t.ingresos)}`, `$${pdfNum(t.egresos)}`, `$${pdfNum(t.neto)}`,
      ]),
      startY: y + 5, margin: { left: M, right: M }, ...baseTable,
      columnStyles: {
        1: { halign: 'right', textColor: PDF_GREEN as any },
        2: { halign: 'right', textColor: PDF_RED as any },
        3: { halign: 'right', fontStyle: 'bold' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // Movimiento día a día
    if (y > PH - 60) { doc.addPage(); y = 20; }
    doc.setFont(PDF_FONT, 'bold'); doc.setFontSize(11); doc.setTextColor(...PDF_DARK);
    doc.text('Movimiento día a día', M, y);
    autoTable(doc, {
      head: [['Día', 'Ingresos', 'Egresos', 'Neto del día', 'Acumulado']],
      body: serieDiaria.map(d => [
        String(d.dia), `$${pdfNum(d.ingresos)}`, `$${pdfNum(d.egresos)}`,
        `$${pdfNum(d.ingresos - d.egresos)}`, `$${pdfNum(d.acumulado)}`,
      ]),
      startY: y + 5, margin: { left: M, right: M }, ...baseTable,
      styles: { ...baseTable.styles, fontSize: 7.5, cellPadding: 1.6 },
      columnStyles: {
        0: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        1: { halign: 'right', textColor: PDF_GREEN as any },
        2: { halign: 'right', textColor: PDF_RED as any },
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // Inversiones del mes
    if (inversionesMesActual && inversionesMesActual.cuentas.length > 0) {
      if (y > PH - 60) { doc.addPage(); y = 20; }
      doc.setFont(PDF_FONT, 'bold'); doc.setFontSize(11); doc.setTextColor(...PDF_DARK);
      doc.text('Análisis de inversiones', M, y);
      doc.setFont(PDF_FONT, 'normal'); doc.setFontSize(8); doc.setTextColor(...PDF_GRAY);
      doc.text(
        `${pdfTxt(inversionesMesActual.titulo)} · Total $${pdfNum(inversionesMesActual.totalInv)} · ` +
        `${inversionesMesActual.pctInvSobreIng.toFixed(1)}% de los ingresos del mes`,
        M, y + 5);
      autoTable(doc, {
        head: [['Cuenta', 'Monto', '% s/ Inversiones', '% s/ Ingresos']],
        body: inversionesMesActual.cuentas.map(c => [
          pdfTxt(c.nombre), `$${pdfNum(c.monto)}`,
          `${c.pctSobreInv.toFixed(1)}%`, `${c.pctSobreIng.toFixed(1)}%`,
        ]),
        startY: y + 9, margin: { left: M, right: M }, ...baseTable,
        columnStyles: {
          1: { halign: 'right', fontStyle: 'bold' },
          2: { halign: 'right' },
          3: { halign: 'right' },
        },
      });
    }

    pdfFooter(doc, PW, PH, M, pdfTxt(`Análisis de Flujo de Caja · ${monthLabel(currentMonth.month)} · Informe para socios`));
    doc.save(`analisis_flujo_caja_${currentMonth.month}.pdf`);
  };

  // ---- Informe consolidado: todos los meses lado a lado ----
  const exportarPDFConsolidado = () => {
    const PW = 297, PH = 210, M = 14, CW = PW - 2 * M; // horizontal: los meses van en columnas
    const doc = new jsPDF('l');
    const meses = datosConsolidados;
    const rango = meses.length
      ? `${pdfTxt(meses[0].mesLabel)} - ${pdfTxt(meses[meses.length - 1].mesLabel)}`
      : '';
    let y = pdfHeader(doc, PW, M,
      'ANÁLISIS CONSOLIDADO DE FLUJO DE CAJA',
      'Todos los meses cargados, lado a lado',
      rango);

    // Con muchos meses las columnas se achican: se baja el cuerpo de letra y, a partir de
    // 7 meses, se redondea a pesos. Con 12 columnas los centavos no entran y para una
    // comparativa no aportan; se aclara al pie para que el redondeo no pase inadvertido.
    const n = meses.length;
    const fs = n <= 6 ? 8 : n <= 9 ? 7 : 6;
    const redondear = n > 6;
    const num = (v: number) => redondear
      ? `$${Math.round(v || 0).toLocaleString('es-AR')}`
      : `$${pdfNum(v)}`;
    const labelW = 46;
    const cols: any = { 0: { cellWidth: labelW, fontStyle: 'bold', halign: 'left' } };
    meses.forEach((_, i) => { cols[i + 1] = { halign: 'right' }; });

    autoTable(doc, {
      head: [['Indicador', ...meses.map(m => pdfTxt(m.mesLabel))]],
      body: [
        ['Total Ingresos', ...meses.map(m => num(m.ingresos))],
        ['Total Egresos', ...meses.map(m => num(m.egresos))],
        ['Neto del Mes', ...meses.map(m => num(m.neto))],
        ['Acumulado', ...meses.map(m => num(m.acumulado))],
        ['Punto de Equilibrio', ...meses.map(m => m.pe?.alcanzado ? `Día ${m.pe.dia}` : 'No alcanzado')],
        ['Tramo 1 a 10 (neto)', ...meses.map(m => num(m.tramos[0].neto))],
        ['Tramo 11 a 20 (neto)', ...meses.map(m => num(m.tramos[1].neto))],
        ['Tramo 21 a fin (neto)', ...meses.map(m => num(m.tramos[2].neto))],
        ['Suma de Tramos (= Neto)', ...meses.map(m => num(m.tramos.reduce((a, t) => a + t.neto, 0)))],
      ],
      startY: y, margin: { left: M, right: M }, ...baseTable,
      styles: { ...baseTable.styles, fontSize: fs, cellPadding: 1.8 },
      headStyles: { ...baseTable.headStyles, fontSize: fs },
      columnStyles: cols,
      didParseCell: (d: any) => {
        if (d.section !== 'body' || d.column.index === 0) return;
        const fila = d.row.index;
        if (fila === 0) d.cell.styles.textColor = PDF_GREEN;      // ingresos
        else if (fila === 1) d.cell.styles.textColor = PDF_RED;   // egresos
        else if (fila === 2 || fila === 8) {                       // neto y suma de tramos
          const neg = String(d.cell.raw).includes('-');
          d.cell.styles.textColor = neg ? PDF_RED : PDF_GREEN;
          d.cell.styles.fontStyle = 'bold';
        } else if (fila === 4) {                                   // punto de equilibrio
          d.cell.styles.textColor = String(d.cell.raw).startsWith('Día') ? PDF_GREEN : PDF_RED;
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 5;
    y = pdfNotaEquilibrio(doc, M, CW, y);
    if (redondear) {
      doc.setFont(PDF_FONT, 'italic'); doc.setFontSize(7.5); doc.setTextColor(...PDF_GRAY);
      doc.text(`Importes redondeados a pesos: con ${n} meses en columnas los centavos no entran.`, M, y);
      y += 4;
    }
    y += 4;

    // Inversiones por cuenta, mes a mes
    if (cuentasInvConsolidado.length > 0) {
      if (y > PH - 50) { doc.addPage(); y = 20; }
      doc.setFont(PDF_FONT, 'bold'); doc.setFontSize(11); doc.setTextColor(...PDF_DARK);
      doc.text('Inversiones por cuenta', M, y);

      const filas = cuentasInvConsolidado.map(nombre => [
        pdfTxt(nombre),
        ...allData.map(md => {
          const sec = inversionesDeMes(md);
          const r = sec?.rubros.find(x => x.nombre === nombre);
          const monto = r ? Math.abs(r.total) : 0;
          return monto > 0 ? num(monto) : '-';
        }),
      ]);
      filas.push([
        'TOTAL INVERSIONES',
        ...allData.map(md => {
          const sec = inversionesDeMes(md);
          const tot = sec ? (Math.abs(sec.total) || sec.rubros.reduce((a, r) => a + Math.abs(r.total), 0)) : 0;
          return num(tot);
        }),
      ]);
      filas.push([
        '% SOBRE INGRESOS',
        ...meses.map(m => {
          const md = allData.find(x => x.month === m.month);
          const sec = md ? inversionesDeMes(md) : null;
          const tot = sec ? (Math.abs(sec.total) || sec.rubros.reduce((a, r) => a + Math.abs(r.total), 0)) : 0;
          return `${(m.ingresos > 0 ? (tot / m.ingresos) * 100 : 0).toFixed(1)}%`;
        }),
      ]);

      autoTable(doc, {
        head: [['Cuenta', ...meses.map(m => pdfTxt(m.mesLabel))]],
        body: filas,
        startY: y + 5, margin: { left: M, right: M }, ...baseTable,
        styles: { ...baseTable.styles, fontSize: fs, cellPadding: 1.8 },
        headStyles: { ...baseTable.headStyles, fontSize: fs },
        columnStyles: cols,
        didParseCell: (d: any) => {
          if (d.section === 'body' && d.row.index >= filas.length - 2) d.cell.styles.fontStyle = 'bold';
        },
      });
    }

    pdfFooter(doc, PW, PH, M, pdfTxt(`Análisis Consolidado de Flujo de Caja · ${rango} · Informe para socios`));
    doc.save(`analisis_flujo_caja_consolidado_${meses[0]?.month || ''}_a_${meses[meses.length - 1]?.month || ''}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Toggle: análisis por mes vs consolidado + export del informe para socios */}
      <div className="flex flex-wrap items-center justify-between gap-3">
      {allData.length > 1 ? (
        <div className="flex gap-1 bg-bg-accent/40 rounded-lg p-1 w-fit">
          <button onClick={() => setConsolidado(false)}
            className={cn("flex items-center gap-1.5 px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all",
              !consolidado ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>
            <Calendar size={13} /> Por Mes
          </button>
          <button onClick={() => setConsolidado(true)}
            className={cn("flex items-center gap-1.5 px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all",
              consolidado ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>
            <BarChart3 size={13} /> Consolidado
          </button>
        </div>
      ) : <div />}

        <button onClick={consolidado ? exportarPDFConsolidado : exportarPDFMes}
          className="flex items-center gap-1.5 bg-brand-500/10 border border-brand-500/25 text-brand-500 px-3.5 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-500 hover:text-white transition-all"
          title={consolidado
            ? 'Descargar el consolidado de todos los meses en PDF para presentar a socios'
            : 'Descargar el análisis de este mes en PDF para presentar a socios'}>
          <Download size={14} /> Exportar PDF {consolidado ? 'Consolidado' : 'del Mes'}
        </button>
      </div>

      {/* Selector de cuentas para el Punto de Equilibrio */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4">
        <button onClick={() => setMostrarSelectorPE(!mostrarSelectorPE)} className="w-full flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Target size={13} className="text-brand-500" />
            <span className="text-[10px] font-black uppercase text-text-main tracking-widest">Cuentas incluidas en el Punto de Equilibrio</span>
          </div>
          <div className="flex items-center gap-2">
            {cuentasExcluidas.size > 0 && <span className="text-[8px] font-black uppercase text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">{cuentasExcluidas.size} excluida{cuentasExcluidas.size > 1 ? 's' : ''}</span>}
            <span className="text-text-dim text-[12px]">{mostrarSelectorPE ? '▾' : '▸'}</span>
          </div>
        </button>
        {mostrarSelectorPE && (
          <div className="mt-3 pt-3 border-t border-border-dim/40">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest opacity-70">Desmarcá las cuentas que no querés contar (ej: dividendos, cuotas de préstamos)</p>
              <div className="flex gap-2 shrink-0">
                <button onClick={() => setCuentasExcluidas(new Set())} className="text-[8px] font-black uppercase tracking-widest text-emerald-500 hover:underline">Marcar todas</button>
                <button onClick={() => setCuentasExcluidas(new Set(cuentasMarcables))} className="text-[8px] font-black uppercase tracking-widest text-red-500 hover:underline">Desmarcar todas</button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto">
              {cuentasMarcables.map(nombre => {
                const incluida = !cuentasExcluidas.has(nombre);
                return (
                  <button key={nombre} onClick={() => toggleCuenta(nombre)}
                    className={cn("flex items-center gap-2 px-2.5 py-1.5 rounded text-left transition-all border", incluida ? "bg-bg-accent/30 border-border-dim/50" : "bg-bg-card/30 border-border-dim/30 opacity-50")}>
                    <span className={cn("w-3.5 h-3.5 rounded shrink-0 flex items-center justify-center text-[9px] font-black", incluida ? "bg-emerald-500 text-white" : "bg-transparent border border-text-dim/40")}>{incluida ? '✓' : ''}</span>
                    <span className={cn("text-[9px] font-bold truncate", incluida ? "text-text-main" : "text-text-dim line-through")}>{nombre}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {consolidado ? (
        /* ===== Vista Consolidada: todos los meses en columnas ===== */
        <>
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 overflow-x-auto">
          <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-1">Comparativa de meses</h3>
          <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest mb-4 opacity-70">Todos los meses cargados, lado a lado</p>
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="border-b-2 border-border-dim">
                <th className="text-left py-2 px-2 text-[8px] font-black uppercase tracking-widest text-text-dim sticky left-0 bg-bg-sidebar">Indicador</th>
                {datosConsolidados.map(m => (
                  <th key={m.month} className="text-right py-2 px-3 text-[9px] font-black uppercase tracking-widest text-text-main whitespace-nowrap">{m.mesLabel}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim/50">
              <tr>
                <td className="py-2 px-2 font-black uppercase text-[8px] tracking-widest text-emerald-500 sticky left-0 bg-bg-sidebar">Total Ingresos</td>
                {datosConsolidados.map(m => <td key={m.month} className="py-2 px-3 text-right font-mono font-black text-emerald-500 whitespace-nowrap">{fmt(m.ingresos)}</td>)}
              </tr>
              <tr>
                <td className="py-2 px-2 font-black uppercase text-[8px] tracking-widest text-red-500 sticky left-0 bg-bg-sidebar">Total Egresos</td>
                {datosConsolidados.map(m => <td key={m.month} className="py-2 px-3 text-right font-mono font-black text-red-500 whitespace-nowrap">{fmt(m.egresos)}</td>)}
              </tr>
              <tr>
                <td className="py-2 px-2 font-black uppercase text-[8px] tracking-widest text-text-main sticky left-0 bg-bg-sidebar">Neto del Mes</td>
                {datosConsolidados.map(m => <td key={m.month} className={cn("py-2 px-3 text-right font-mono font-black whitespace-nowrap", m.neto >= 0 ? "text-emerald-500" : "text-red-500")}>{fmt(m.neto)}</td>)}
              </tr>
              <tr>
                <td className="py-2 px-2 font-black uppercase text-[8px] tracking-widest text-brand-500 sticky left-0 bg-bg-sidebar">Acumulado</td>
                {datosConsolidados.map(m => <td key={m.month} className="py-2 px-3 text-right font-mono font-black text-brand-500 whitespace-nowrap">{fmt(m.acumulado)}</td>)}
              </tr>
              <tr className="bg-bg-accent/20">
                <td className="py-2 px-2 font-black uppercase text-[8px] tracking-widest text-text-main sticky left-0 bg-bg-sidebar">Punto de Equilibrio</td>
                {datosConsolidados.map(m => (
                  <td key={m.month} className="py-2 px-3 text-right font-black whitespace-nowrap">
                    {m.pe?.alcanzado
                      ? <span className="text-emerald-500">Día {m.pe.dia}</span>
                      : <span className="text-red-500 text-[9px]">No alcanzado</span>}
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 px-2 font-bold uppercase text-[8px] tracking-widest text-text-dim sticky left-0 bg-bg-sidebar pl-4">Tramo 1 a 10 (neto)</td>
                {datosConsolidados.map(m => { const t = m.tramos[0]; return <td key={m.month} className={cn("py-2 px-3 text-right font-mono font-bold text-[10px] whitespace-nowrap", t.neto >= 0 ? "text-emerald-500/80" : "text-red-500/80")}>{fmt(t.neto)}</td>; })}
              </tr>
              <tr>
                <td className="py-2 px-2 font-bold uppercase text-[8px] tracking-widest text-text-dim sticky left-0 bg-bg-sidebar pl-4">Tramo 11 a 20 (neto)</td>
                {datosConsolidados.map(m => { const t = m.tramos[1]; return <td key={m.month} className={cn("py-2 px-3 text-right font-mono font-bold text-[10px] whitespace-nowrap", t.neto >= 0 ? "text-emerald-500/80" : "text-red-500/80")}>{fmt(t.neto)}</td>; })}
              </tr>
              <tr>
                <td className="py-2 px-2 font-bold uppercase text-[8px] tracking-widest text-text-dim sticky left-0 bg-bg-sidebar pl-4">Tramo 21 a fin (neto)</td>
                {datosConsolidados.map(m => { const t = m.tramos[2]; return <td key={m.month} className={cn("py-2 px-3 text-right font-mono font-bold text-[10px] whitespace-nowrap", t.neto >= 0 ? "text-emerald-500/80" : "text-red-500/80")}>{fmt(t.neto)}</td>; })}
              </tr>
              <tr className="border-t border-border-dim bg-bg-accent/10">
                <td className="py-2 px-2 font-black uppercase text-[8px] tracking-widest text-text-main sticky left-0 bg-bg-sidebar">Suma de Tramos (= Neto)</td>
                {datosConsolidados.map(m => { const sumaTramos = m.tramos.reduce((a, t) => a + t.neto, 0); return <td key={m.month} className={cn("py-2 px-3 text-right font-mono font-black whitespace-nowrap", sumaTramos >= 0 ? "text-emerald-500" : "text-red-500")}>{fmt(sumaTramos)}</td>; })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Consolidado de Inversiones: cada cuenta mes a mes */}
        {cuentasInvConsolidado.length > 0 && (
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 overflow-x-auto">
            <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-1">Inversiones por cuenta · meses</h3>
            <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest mb-4 opacity-70">Cada cuenta de inversiones, mes a mes</p>
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="border-b-2 border-border-dim">
                  <th className="text-left py-2 px-2 text-[8px] font-black uppercase tracking-widest text-text-dim sticky left-0 bg-bg-sidebar">Cuenta</th>
                  {datosConsolidados.map(m => (
                    <th key={m.month} className="text-right py-2 px-3 text-[9px] font-black uppercase tracking-widest text-text-main whitespace-nowrap">{m.mesLabel}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim/50">
                {cuentasInvConsolidado.map(nombreCuenta => (
                  <tr key={nombreCuenta} className="hover:bg-bg-accent/20">
                    <td className="py-2 px-2 font-bold text-text-main sticky left-0 bg-bg-sidebar whitespace-nowrap">{nombreCuenta}</td>
                    {allData.map(md => {
                      const sec = inversionesDeMes(md);
                      const r = sec?.rubros.find(x => x.nombre === nombreCuenta);
                      const monto = r ? Math.abs(r.total) : 0;
                      return <td key={md.month} className={cn("py-2 px-3 text-right font-mono font-bold whitespace-nowrap", monto > 0 ? "text-brand-500" : "text-text-dim/40")}>{monto > 0 ? fmt(monto) : '—'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border-dim font-black">
                  <td className="py-2 px-2 uppercase text-[9px] tracking-widest text-text-main sticky left-0 bg-bg-sidebar">Total Inversiones</td>
                  {allData.map(md => {
                    const sec = inversionesDeMes(md);
                    const tot = sec ? (Math.abs(sec.total) || sec.rubros.reduce((a, r) => a + Math.abs(r.total), 0)) : 0;
                    return <td key={md.month} className="py-2 px-3 text-right font-mono text-brand-500 whitespace-nowrap">{fmt(tot)}</td>;
                  })}
                </tr>
                <tr className="font-bold">
                  <td className="py-2 px-2 uppercase text-[8px] tracking-widest text-text-dim sticky left-0 bg-bg-sidebar">% sobre Ingresos</td>
                  {datosConsolidados.map(m => {
                    const sec = inversionesDeMes(allData.find(md => md.month === m.month)!);
                    const tot = sec ? (Math.abs(sec.total) || sec.rubros.reduce((a, r) => a + Math.abs(r.total), 0)) : 0;
                    const pct = m.ingresos > 0 ? (tot / m.ingresos) * 100 : 0;
                    return <td key={m.month} className="py-2 px-3 text-right font-mono text-text-dim whitespace-nowrap">{pct.toFixed(1)}%</td>;
                  })}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        </>
      ) : (
      <>
      {/* KPIs de análisis */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-1"><AlertTriangle size={12} className="text-amber-500" /><p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-dim">Tramo más ajustado del mes</p></div>
          <p className="text-[14px] font-black text-text-main">Días {peorTramo.label}</p>
          <p className={cn("text-[12px] font-mono font-black", peorTramo.neto < 0 ? "text-red-500" : "text-emerald-500")}>{fmt(peorTramo.neto)}</p>
        </div>
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-1"><ArrowUpRight size={12} className="text-emerald-500" /><p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-dim">Mejor mes (neto)</p></div>
          <p className="text-[14px] font-black text-text-main">{mejorMes?.mes || '—'}</p>
          <p className="text-[12px] font-mono font-black text-emerald-500">{fmt(mejorMes?.neto || 0)}</p>
        </div>
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4">
          <div className="flex items-center gap-1.5 mb-1"><ArrowDownRight size={12} className="text-red-500" /><p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-dim">Peor mes (neto)</p></div>
          <p className="text-[14px] font-black text-text-main">{peorMes?.mes || '—'}</p>
          <p className="text-[12px] font-mono font-black text-red-500">{fmt(peorMes?.neto || 0)}</p>
        </div>
      </div>

      {/* Punto de Equilibrio del mes */}
      {puntoEquilibrio && (
        <div className={cn("rounded-xl p-5 border-2", puntoEquilibrio.alcanzado ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/40 bg-red-500/5")}>
          <div className="flex items-center gap-1.5 mb-1">
            <Target size={13} className={puntoEquilibrio.alcanzado ? "text-emerald-500" : "text-red-500"} />
            <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Punto de Equilibrio · {monthLabel(currentMonth.month)}</h3>
          </div>
          <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest mb-4 opacity-70">Cuándo los ingresos del mes cubrieron los egresos totales</p>
          {puntoEquilibrio.alcanzado ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-bg-accent/30 rounded-lg p-4">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-dim mb-1">Se cubrió el día</p>
                <p className="text-[20px] font-black text-emerald-500">Día {puntoEquilibrio.dia}</p>
                <p className="text-[9px] font-bold text-text-dim mt-0.5">≈ {puntoEquilibrio.pctDelMes}% del mes transcurrido</p>
              </div>
              <div className="bg-bg-accent/30 rounded-lg p-4">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-dim mb-1">Ingresos para cubrir</p>
                <p className="text-[15px] font-mono font-black text-text-main">{fmt(puntoEquilibrio.egresosTotales)}</p>
                <p className="text-[9px] font-bold text-text-dim mt-0.5">= total de egresos del mes</p>
              </div>
              <div className="bg-bg-accent/30 rounded-lg p-4">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-dim mb-1">Ingresos del mes</p>
                <p className="text-[15px] font-mono font-black text-emerald-500">{fmt(puntoEquilibrio.ingresosTotales)}</p>
                <p className="text-[9px] font-bold text-text-dim mt-0.5">{fmt(puntoEquilibrio.ingresosTotales - puntoEquilibrio.egresosTotales)} por encima del equilibrio</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-bg-accent/30 rounded-lg p-4">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-dim mb-1">Estado</p>
                <p className="text-[16px] font-black text-red-500">No se alcanzó</p>
                <p className="text-[9px] font-bold text-text-dim mt-0.5">los ingresos no cubrieron los egresos</p>
              </div>
              <div className="bg-bg-accent/30 rounded-lg p-4">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-dim mb-1">Egresos del mes</p>
                <p className="text-[15px] font-mono font-black text-text-main">{fmt(puntoEquilibrio.egresosTotales)}</p>
                <p className="text-[9px] font-bold text-text-dim mt-0.5">ingresos: {fmt(puntoEquilibrio.ingresosTotales)}</p>
              </div>
              <div className="bg-bg-accent/30 rounded-lg p-4">
                <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-dim mb-1">Faltaron</p>
                <p className="text-[15px] font-mono font-black text-red-500">{fmt(puntoEquilibrio.faltante)}</p>
                <p className="text-[9px] font-bold text-text-dim mt-0.5">de ingresos para llegar al equilibrio</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detalle de los 3 tramos del mes (1-10, 11-20, 21-fin) */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
        <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-1">Tramos del mes · {monthLabel(currentMonth.month)}</h3>
        <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest mb-4 opacity-70">Cómo se comporta la caja en cada parte del mes</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {decadas.map(t => {
            const esPeor = t.label === peorTramo.label;
            return (
              <div key={t.label} className={cn("rounded-lg border p-4", esPeor ? "border-red-500/40 bg-red-500/5" : "border-border-dim bg-bg-accent/20")}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-text-main">Días {t.label}</p>
                  {esPeor && <span className="text-[7px] font-black uppercase px-2 py-0.5 rounded bg-red-500/15 text-red-500">Más ajustado</span>}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase text-text-dim">Ingresos</span>
                    <span className="text-[11px] font-mono font-black text-emerald-500">{fmt(t.ingresos)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase text-text-dim">Egresos</span>
                    <span className="text-[11px] font-mono font-black text-red-500">{fmt(t.egresos)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-border-dim/40">
                    <span className="text-[9px] font-black uppercase text-text-main">Neto</span>
                    <span className={cn("text-[12px] font-mono font-black", t.neto < 0 ? "text-red-500" : "text-emerald-500")}>{fmt(t.neto)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Saldo / acumulado día a día */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
        <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-1">Movimiento día a día · {monthLabel(currentMonth.month)}</h3>
        <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest mb-3 opacity-70">Elegí qué comparar a lo largo del mes</p>
        {/* Selector de vista */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {[
            { id: 'acumulado', label: 'Solo Acumulado' },
            { id: 'ingvsegr', label: 'Ingresos vs Egresos' },
            { id: 'dispvsegr', label: 'Disponible vs Egresos' },
          ].map(o => (
            <button key={o.id} onClick={() => setVistaGrafico(o.id as any)}
              className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                vistaGrafico === o.id ? "bg-brand-500 text-white" : "bg-bg-accent text-text-dim hover:text-text-main")}>
              {o.label}
            </button>
          ))}
        </div>
        {vistaGrafico === 'dispvsegr' && (
          <p className="text-[8px] text-text-dim font-bold uppercase tracking-widest mb-2 opacity-60">Disponible = Saldo inicial + ingresos acumulados</p>
        )}
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={serieDiaria}>
              <CartesianGrid strokeDasharray="3 3" stroke="#33333322" />
              <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10 }} width={60} />
              <Tooltip formatter={(v: any) => fmt(v)} labelFormatter={(l) => `Día ${l}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {vistaGrafico === 'acumulado' && (
                <Line type="monotone" dataKey="acumulado" name="Acumulado" stroke="#e31e24" strokeWidth={2} dot={false} />
              )}
              {vistaGrafico === 'ingvsegr' && (<>
                <Line type="monotone" dataKey="ingresos" name="Ingresos del día" stroke="#10b981" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="egresos" name="Egresos del día" stroke="#e31e24" strokeWidth={2} dot={false} />
              </>)}
              {vistaGrafico === 'dispvsegr' && (<>
                <Line type="monotone" dataKey="disponible" name="Disponible (saldo+ingresos)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="egresos" name="Egresos del día" stroke="#e31e24" strokeWidth={2} dot={false} />
              </>)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Ingresos vs egresos por década */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
        <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-1">Ingresos vs Egresos por tramo del mes</h3>
        <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest mb-4 opacity-70">Detectá en qué parte del mes se ajusta la caja</p>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <ComposedChart data={decadas}>
              <CartesianGrid strokeDasharray="3 3" stroke="#33333322" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10 }} width={60} />
              <Tooltip formatter={(v: any) => fmt(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="egresos" name="Egresos" fill="#e31e24" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="neto" name="Neto" stroke="#f59e0b" strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Análisis de Inversiones del mes */}
      {inversionesMesActual && inversionesMesActual.cuentas.length > 0 && (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-1">Análisis de Inversiones · {monthLabel(currentMonth.month)}</h3>
          <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest mb-4 opacity-70">{inversionesMesActual.titulo} · detalle por cuenta</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div className="bg-bg-accent/30 rounded-lg p-4">
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-dim mb-1">Total Invertido en el mes</p>
              <p className="text-[18px] font-mono font-black text-brand-500">{fmt(inversionesMesActual.totalInv)}</p>
            </div>
            <div className="bg-bg-accent/30 rounded-lg p-4">
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-text-dim mb-1">% sobre Ingresos del mes</p>
              <p className="text-[18px] font-mono font-black text-text-main">{inversionesMesActual.pctInvSobreIng.toFixed(1)}%</p>
              <p className="text-[9px] font-bold text-text-dim mt-0.5">de {fmt(inversionesMesActual.ingresosMes)} de ingresos</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="border-b-2 border-border-dim">
                  <th className="text-left py-2 px-2 text-[8px] font-black uppercase tracking-widest text-text-dim">Cuenta</th>
                  <th className="text-right py-2 px-3 text-[8px] font-black uppercase tracking-widest text-text-dim whitespace-nowrap">Monto</th>
                  <th className="text-right py-2 px-3 text-[8px] font-black uppercase tracking-widest text-text-dim whitespace-nowrap">% s/ Inversiones</th>
                  <th className="text-right py-2 px-3 text-[8px] font-black uppercase tracking-widest text-text-dim whitespace-nowrap">% s/ Ingresos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim/50">
                {inversionesMesActual.cuentas.map(c => (
                  <tr key={c.nombre} className="hover:bg-bg-accent/20">
                    <td className="py-2 px-2 font-bold text-text-main">{c.nombre}</td>
                    <td className="py-2 px-3 text-right font-mono font-black text-brand-500 whitespace-nowrap">{fmt(c.monto)}</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-text-main whitespace-nowrap">{c.pctSobreInv.toFixed(1)}%</td>
                    <td className="py-2 px-3 text-right font-mono font-bold text-text-dim whitespace-nowrap">{c.pctSobreIng.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-border-dim font-black">
                  <td className="py-2 px-2 uppercase text-[9px] tracking-widest text-text-main">Total</td>
                  <td className="py-2 px-3 text-right font-mono text-brand-500 whitespace-nowrap">{fmt(inversionesMesActual.totalInv)}</td>
                  <td className="py-2 px-3 text-right font-mono text-text-main whitespace-nowrap">100%</td>
                  <td className="py-2 px-3 text-right font-mono text-text-dim whitespace-nowrap">{inversionesMesActual.pctInvSobreIng.toFixed(1)}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Comparación mes a mes: totales */}
      {compMeses.length > 1 && (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-4">Comparación mes a mes</h3>
          <div style={{ width: '100%', height: 300 }}>
            <ResponsiveContainer>
              <ComposedChart data={compMeses}>
                <CartesianGrid strokeDasharray="3 3" stroke="#33333322" />
                <XAxis dataKey="mes" tick={{ fontSize: 10 }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10 }} width={60} />
                <Tooltip formatter={(v: any) => fmt(v)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="ingresos" name="Ingresos" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="egresos" name="Egresos" fill="#e31e24" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="neto" name="Neto" stroke="#f59e0b" strokeWidth={2} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Evolución de un rubro de egreso elegido, mes a mes */}
      {seccionesEgreso.length > 0 && (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-1">Evolución de un rubro de egreso</h3>
          <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest mb-4 opacity-70">Elegí un rubro y mirá cómo cambia mes a mes</p>
          {/* Botones para elegir el rubro */}
          <div className="flex flex-wrap gap-1.5 mb-5">
            {seccionesEgreso.map(r => (
              <button key={r} onClick={() => setRubroSel(r)}
                className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                  rubroActivo === r ? "bg-brand-500 text-white" : "bg-bg-accent text-text-dim hover:text-text-main")}>
                {r}
              </button>
            ))}
          </div>
          <div style={{ width: '100%', height: 320 }}>
            <ResponsiveContainer>
              <BarChart data={evolucionRubro} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#33333322" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={fmtShort} tick={{ fontSize: 10 }} width={70} />
                <Tooltip formatter={(v: any) => fmt(v)} labelFormatter={(l) => `${rubroActivo} · ${l}`} />
                <Bar dataKey="monto" name={rubroActivo} fill="#e31e24" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
