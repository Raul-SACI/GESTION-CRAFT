/**
 * SPDX-License-Identifier: Apache-2.0
 * Flujo de Caja Mensual: importa la planilla Excel mensual (formato Google Sheets de CRAFT)
 * y muestra el resumen del mes (saldos por cuenta, ingresos, egresos por sección, neto y acumulado).
 * Guarda en Supabase (tabla monthly_cashflow) tanto los totales como el detalle día por día.
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BarChart3, Upload, Loader2, ArrowUpRight, ArrowDownRight, Calendar, Trash2, ChevronDown, ChevronRight, TrendingUp, LayoutDashboard, AlertTriangle, Target } from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart
} from 'recharts';
import * as XLSX from 'xlsx';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';

// Etiquetas que aparecen en la columna de TOTALES solo en filas de encabezado de sección
const HEADER_AG = new Set(['ingresos iniciales','ingresos','alquileres','servicios','compras','sueldos','impuestos','g. bancarios','otros g.','inversiones']);

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
function puntoEquilibrioDeMes(md: MonthData) {
  const egresosTotales = md.resumenTotales?.['total egresos'] || 0;
  const ingresosTotales = md.resumenTotales?.['total ingresos'] || 0;
  if (egresosTotales <= 0) return null;
  const dias = md.dias || [];
  let ingAcum = 0;
  let diaCubierto: number | null = null;
  for (const d of dias) {
    let ingDia = 0;
    md.secciones.forEach(s => {
      if (esSaldoInicial(s)) return;
      if (esSeccionIngreso(s)) {
        s.rubros.forEach(r => { ingDia += (r.dias[d] || 0); });
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

  // 1b) Punto de equilibrio del mes: día en que los ingresos acumulados del mes
  // alcanzan a cubrir los egresos TOTALES del mes. Responde "con cuántos ingresos
  // se cubrieron los gastos del mes y en qué día se llegó".
  const puntoEquilibrio = (() => {
    const egresosTotales = currentMonth.resumenTotales?.['total egresos'] || 0;
    const ingresosTotales = currentMonth.resumenTotales?.['total ingresos'] || 0;
    if (egresosTotales <= 0) return null;
    let ingAcum = 0;
    let diaCubierto: number | null = null;
    let ingresosAlCubrir = 0;
    for (const punto of serieDiaria) {
      ingAcum += punto.ingresos;
      if (ingAcum >= egresosTotales) {
        diaCubierto = punto.dia;
        ingresosAlCubrir = ingAcum;
        break;
      }
    }
    const alcanzado = diaCubierto !== null;
    // % del mes que representa ese día (si el mes tiene N días con datos)
    const totalDias = serieDiaria.length || 1;
    const pctDelMes = alcanzado ? Math.round((diaCubierto! / totalDias) * 100) : 100;
    // Cuánto faltó si no se alcanzó
    const faltante = alcanzado ? 0 : Math.max(0, egresosTotales - ingresosTotales);
    return { alcanzado, dia: diaCubierto, ingresosAlCubrir, egresosTotales, ingresosTotales, pctDelMes, faltante };
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
    const pe = puntoEquilibrioDeMes(md);
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

  return (
    <div className="space-y-6">
      {/* Toggle: análisis por mes vs consolidado (todos los meses en columnas) */}
      {allData.length > 1 && (
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
      )}

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
