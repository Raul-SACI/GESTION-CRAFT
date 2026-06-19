/**
 * SPDX-License-Identifier: Apache-2.0
 * Flujo de Caja Mensual: importa la planilla Excel mensual (formato Google Sheets de CRAFT)
 * y muestra el resumen del mes (saldos por cuenta, ingresos, egresos por sección, neto y acumulado).
 * Guarda en Supabase (tabla monthly_cashflow) tanto los totales como el detalle día por día.
 */
import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { BarChart3, Upload, Loader2, ArrowUpRight, ArrowDownRight, Calendar, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
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
const fmt = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

// Convierte un valor de celda (número o texto "$ 1.234,56" / "-$ 1.234") a número
function parseMoney(v: any): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (!s) return 0;
  const neg = s.includes('-');
  s = s.replace(/[^\d.,]/g, '');
  if (!s) return 0;
  // formato es-AR: punto miles, coma decimal
  s = s.replace(/\./g, '').replace(',', '.');
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
  // Mes/año a usar al importar (selector previo)
  const now = new Date();
  const [importMonth, setImportMonth] = useState<number>(now.getMonth() + 1);
  const [importYear, setImportYear] = useState<number>(now.getFullYear());

  useEffect(() => { loadMonths(); }, []);
  useEffect(() => { if (selectedMonth) loadMonth(selectedMonth); }, [selectedMonth]);

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

      // Mes elegido en el selector de la pantalla
      const month = `${importYear}-${String(importMonth).padStart(2, '0')}`;
      // Si ya existe ese mes, confirmar reemplazo
      if (months.includes(month)) {
        if (!window.confirm(`Ya hay una planilla cargada para ${monthLabel(month)}. ¿Reemplazarla con este archivo?`)) {
          setImporting(false);
          e.target.value = '';
          return;
        }
      }

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

        // Resumen superior (antes de la primera sección)
        const matchResumen = resumenLabels.find(rl => lower.startsWith(rl));
        if (matchResumen && secciones.length === 0) {
          const perDay: Record<number, number> = {};
          Object.entries(dayCols).forEach(([c, d]) => { perDay[d] = cellNum(r, parseInt(c)); });
          resumen[matchResumen] = perDay;
          resumenTotales[matchResumen] = totalCol >= 0 ? cellNum(r, totalCol) : 0;
          continue;
        }

        // ¿Encabezado de sección? (la celda de totales tiene una etiqueta conocida)
        if (HEADER_AG.has(ag)) {
          cur = { titulo: label, rubros: [], total: 0 };
          secciones.push(cur);
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
  const saldoInicial = data?.resumenTotales['saldo inicial'] || 0;
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
          {/* Selector de mes/año para la importación */}
          <div className="flex items-center gap-1 bg-bg-accent/30 border border-border-dim rounded px-2 py-1">
            <span className="text-[8px] font-black uppercase text-text-dim tracking-widest pl-1">Importar a:</span>
            <select value={importMonth} onChange={e => setImportMonth(parseInt(e.target.value))}
              className="bg-bg-card border border-border-dim rounded px-2 py-1 text-[11px] font-bold text-text-main outline-none focus:border-brand-500">
              {MONTH_NAMES.map((nm, i) => <option key={i} value={i + 1}>{nm}</option>)}
            </select>
            <select value={importYear} onChange={e => setImportYear(parseInt(e.target.value))}
              className="bg-bg-card border border-border-dim rounded px-2 py-1 text-[11px] font-bold text-text-main outline-none focus:border-brand-500">
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
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
                {s.rubros.map(r => (
                  <div key={r.nombre} className="bg-bg-accent/30 border border-border-dim/40 rounded px-3 py-2 flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-text-dim truncate">{r.nombre}</span>
                    <span className="text-[11px] font-mono font-black text-text-main">{fmt(r.total)}</span>
                  </div>
                ))}
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

          {/* Acciones */}
          {!isReadOnly && (
            <div className="flex justify-end">
              <button onClick={eliminarMes} className="flex items-center gap-1.5 text-text-dim hover:text-red-500 px-3 py-2 text-[9px] font-black uppercase tracking-widest transition-all">
                <Trash2 size={12} /> Eliminar este mes
              </button>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
