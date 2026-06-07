/**
 * SPDX-License-Identifier: Apache-2.0
 * KPIs del Estado de Resultados (Real vs Real, mes a mes y año contra año).
 * Reutilizable: pestaña KPIs del EERR y resumen en Dashboard de Socios (compact).
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import {
  SUBTOTAL_COMPONENTS, GANANCIA_BRUTA_COMPONENTS, OPERATIVA_COMPONENTS,
  OPERATIVA_NETA_COMPONENTS, FINAL_COMPONENTS
} from './plStructure';

interface Props {
  scope?: string;
  compact?: boolean; // versión para dashboard
}

type LinesMap = Record<string, number>; // key -> realPesos
interface MonthData { month: string; ventas: number; ganancia: number; cmv: number; sueldos: number; alquileres: number; legales: number; energia: number; indumentaria: number; }

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmt = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-AR');
const monthLabel = (m: string) => { const [y, mm] = m.split('-'); return `${MONTHS_ES[parseInt(mm) - 1]} ${y.slice(2)}`; };

// Gastos clave a vigilar
const KEY_EXPENSES: { key: string; label: string; components?: string[] }[] = [
  { key: 'cmv', label: 'CMV' },
  { key: 'sueldos_rel', label: 'Sueldos y Rel.', components: SUBTOTAL_COMPONENTS.sueldos_rel },
  { key: 'alquileres_expensas', label: 'Alquileres' },
  { key: 'gastos_legales', label: 'Gastos Legales' },
  { key: 'consumo_energia', label: 'Consumo Energía' },
  { key: 'gastos_indumentaria', label: 'Indumentaria' },
];

export default function ProfitLossKPIs({ scope = 'consolidated', compact = false }: Props) {
  const [allMonths, setAllMonths] = useState<MonthData[]>([]);
  const [inflationMap, setInflationMap] = useState<Record<string, number>>({}); // month -> % mensual
  const [editingInflation, setEditingInflation] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await supabase.from('income_statements').select('*')
          .eq('scope', scope).order('month', { ascending: true });
        const parsed: MonthData[] = (data || []).map((r: any) => {
          const arr = typeof r.lines === 'string' ? JSON.parse(r.lines) : r.lines;
          const m: LinesMap = {};
          (arr || []).forEach((l: any) => { m[l.key] = l.realPesos || 0; });
          const sum = (keys: string[]) => keys.reduce((s, k) => s + (m[k] || 0), 0);
          const ventas = sum(SUBTOTAL_COMPONENTS.ventas_netas);
          const bruta = ventas + (m['cmv'] || 0);
          const subtotal = (comps: string[]) => sum(comps);
          const operativa = bruta
            + subtotal(SUBTOTAL_COMPONENTS.sueldos_rel)
            + subtotal(SUBTOTAL_COMPONENTS.alquileres_rel)
            + subtotal(SUBTOTAL_COMPONENTS.servicios_contrat)
            + subtotal(SUBTOTAL_COMPONENTS.gastos_comercial)
            + subtotal(SUBTOTAL_COMPONENTS.impuestos)
            + subtotal(SUBTOTAL_COMPONENTS.otros_egresos)
            + subtotal(SUBTOTAL_COMPONENTS.otros_ingresos);
          const operativaNeta = operativa + (m['comisiones_socios'] || 0);
          const ganancia = operativaNeta + (m['honorarios_socios'] || 0);
          return {
            month: r.month, ventas, ganancia,
            cmv: m['cmv'] || 0,
            sueldos: subtotal(SUBTOTAL_COMPONENTS.sueldos_rel),
            alquileres: m['alquileres_expensas'] || 0,
            legales: m['gastos_legales'] || 0,
            energia: m['consumo_energia'] || 0,
            indumentaria: m['gastos_indumentaria'] || 0,
          };
        }).filter(md => md.ventas !== 0 || md.ganancia !== 0);
        setAllMonths(parsed);
        // Cargar inflación mensual
        const { data: infl } = await supabase.from('monthly_inflation').select('*');
        const im: Record<string, number> = {};
        (infl || []).forEach((r: any) => { im[r.month] = Number(r.inflation_pct) || 0; });
        setInflationMap(im);
      } catch (e) { console.error('Error KPIs:', e); }
      setLoading(false);
    };
    load();
  }, [scope]);

  // Último mes con datos = mes "actual" para las tarjetas
  const current = allMonths[allMonths.length - 1];
  const prevMonth = allMonths[allMonths.length - 2];
  const sameMonthLastYear = useMemo(() => {
    if (!current) return undefined;
    const [y, mm] = current.month.split('-');
    return allMonths.find(m => m.month === `${parseInt(y) - 1}-${mm}`);
  }, [allMonths, current]);

  const variation = (cur: number, base: number) => base !== 0 ? ((cur - base) / Math.abs(base)) * 100 : 0;

  // Factor de inflación acumulada ENTRE dos meses (exclusivo del mes base, inclusivo hasta el mes nuevo).
  // Ej: de abr-2025 a abr-2026 acumula la inflación de may-2025..abr-2026.
  const inflationFactor = (fromMonth: string, toMonth: string): number => {
    if (fromMonth >= toMonth) return 1;
    let factor = 1;
    // iterar meses desde el siguiente a fromMonth hasta toMonth inclusive
    let [y, m] = fromMonth.split('-').map(Number);
    const advance = () => { m++; if (m > 12) { m = 1; y++; } };
    advance();
    while (true) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const infl = inflationMap[key] || 0;
      factor *= (1 + infl / 100);
      if (key === toMonth) break;
      advance();
      if (y > 3000) break; // seguridad
    }
    return factor;
  };

  // Variación REAL: deflacta el valor nuevo al poder adquisitivo del mes base
  const realVariation = (curVal: number, curMonth: string, baseVal: number, baseMonth: string) => {
    if (baseVal === 0) return null;
    const f = inflationFactor(baseMonth, curMonth);
    const deflated = f > 0 ? curVal / f : curVal;
    return ((deflated - baseVal) / Math.abs(baseVal)) * 100;
  };

  const saveInflation = async (month: string, value: string) => {
    const pct = Number(value) || 0;
    setInflationMap(prev => ({ ...prev, [month]: pct }));
    try {
      await supabase.from('monthly_inflation').upsert({ month, inflation_pct: pct, updated_at: new Date().toISOString() }, { onConflict: 'month' });
    } catch (e) { console.error('Error guardando inflación:', e); }
  };
  const margin = (md: MonthData) => md.ventas !== 0 ? (md.ganancia / md.ventas) * 100 : 0;

  if (loading) return <div className="py-12 flex justify-center"><Loader2 size={24} className="animate-spin text-brand-500" /></div>;
  if (!current) return <div className="py-12 text-center text-text-dim text-[10px] font-black uppercase tracking-widest opacity-50">Sin datos cargados todavía. Importá estados de resultados para ver KPIs.</div>;

  const VarBadge = ({ cur, base, curMonth, baseMonth, invert = false }: { cur: number; base?: number; curMonth?: string; baseMonth?: string; invert?: boolean }) => {
    if (base === undefined || base === 0) return <span className="text-[9px] text-text-dim">—</span>;
    // Si hay meses, usar variación REAL (ajustada por inflación); sino, nominal
    let v: number | null;
    if (curMonth && baseMonth) {
      v = realVariation(cur, curMonth, base, baseMonth);
    } else {
      v = variation(cur, base);
    }
    if (v === null) return <span className="text-[9px] text-text-dim">—</span>;
    const good = invert ? v < 0 : v > 0;
    const Icon = Math.abs(v) < 0.1 ? Minus : v > 0 ? TrendingUp : TrendingDown;
    return (
      <span className={cn("text-[9px] font-black inline-flex items-center gap-0.5", Math.abs(v) < 0.1 ? "text-text-dim" : good ? "text-emerald-500" : "text-red-500")}>
        <Icon size={10} />{v > 0 ? '+' : ''}{v.toFixed(1)}%
      </span>
    );
  };

  // ===== Versión compacta (Dashboard de Socios) =====
  if (compact) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="bg-bg-accent/30 border border-border-dim rounded-lg p-4">
            <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Ventas Netas · {monthLabel(current.month)}</p>
            <p className="text-lg font-mono font-black text-text-main mt-1">{fmt(current.ventas)}</p>
            <div className="flex gap-3 mt-1">
              <span className="text-[8px] text-text-dim uppercase">vs mes ant: <VarBadge cur={current.ventas} base={prevMonth?.ventas} curMonth={current.month} baseMonth={prevMonth?.month} /></span>
              <span className="text-[8px] text-text-dim uppercase">vs año ant: <VarBadge cur={current.ventas} base={sameMonthLastYear?.ventas} curMonth={current.month} baseMonth={sameMonthLastYear?.month} /></span>
            </div>
          </div>
          <div className="bg-bg-accent/30 border border-border-dim rounded-lg p-4">
            <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Ganancia Final · {monthLabel(current.month)}</p>
            <p className={cn("text-lg font-mono font-black mt-1", current.ganancia >= 0 ? "text-emerald-500" : "text-red-500")}>{fmt(current.ganancia)}</p>
            <div className="flex gap-3 mt-1">
              <span className="text-[8px] text-text-dim uppercase">margen: {margin(current).toFixed(1)}%</span>
              <span className="text-[8px] text-text-dim uppercase">vs año ant: <VarBadge cur={current.ganancia} base={sameMonthLastYear?.ganancia} curMonth={current.month} baseMonth={sameMonthLastYear?.month} /></span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ===== Versión completa (pestaña KPIs) =====
  const maxVentas = Math.max(...allMonths.map(m => m.ventas), 1);

  return (
    <div className="space-y-6">
      {/* Aviso y carga de inflación */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-[11px] font-black uppercase text-text-main tracking-wider">Comparaciones ajustadas por inflación</p>
            <p className="text-[9px] text-text-dim font-bold uppercase mt-0.5">Las variaciones se muestran en términos REALES (deflactadas). Cargá la inflación mensual para que el cálculo sea preciso.</p>
          </div>
          <button onClick={() => setEditingInflation(!editingInflation)}
            className="bg-bg-accent border border-border-dim text-text-main px-3 py-2 rounded text-[9px] font-black uppercase tracking-widest hover:border-brand-500/50 transition-all">
            {editingInflation ? 'Cerrar' : 'Cargar Inflación Mensual'}
          </button>
        </div>
        {editingInflation && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
            {allMonths.map(m => (
              <div key={m.month}>
                <label className="text-[8px] font-black uppercase text-text-dim tracking-widest block">{monthLabel(m.month)}</label>
                <div className="flex items-center bg-bg-accent border border-border-dim rounded px-2 mt-0.5">
                  <input type="number" step="0.1" defaultValue={inflationMap[m.month] ?? ''} placeholder="0"
                    onBlur={(e) => saveInflation(m.month, e.target.value)}
                    className="w-full bg-transparent border-none py-1.5 text-[11px] font-mono font-bold text-text-main outline-none" />
                  <span className="text-[9px] text-text-dim font-bold">%</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tarjetas principales */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <p className="text-[9px] font-black uppercase text-text-dim tracking-widest">Ventas Netas · {monthLabel(current.month)}</p>
          <p className="text-2xl font-mono font-black text-text-main mt-1">{fmt(current.ventas)}</p>
          <div className="flex gap-5 mt-2">
            <div><span className="text-[8px] text-text-dim uppercase font-bold block">vs mes ant. (real)</span><VarBadge cur={current.ventas} base={prevMonth?.ventas} curMonth={current.month} baseMonth={prevMonth?.month} /></div>
            <div><span className="text-[8px] text-text-dim uppercase font-bold block">vs {sameMonthLastYear ? sameMonthLastYear.month.slice(0, 4) : 'año ant.'}</span><VarBadge cur={current.ventas} base={sameMonthLastYear?.ventas} curMonth={current.month} baseMonth={sameMonthLastYear?.month} /></div>
          </div>
        </div>
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <p className="text-[9px] font-black uppercase text-text-dim tracking-widest">Ganancia/Pérdida Final · {monthLabel(current.month)}</p>
          <p className={cn("text-2xl font-mono font-black mt-1", current.ganancia >= 0 ? "text-emerald-500" : "text-red-500")}>{fmt(current.ganancia)}</p>
          <div className="flex gap-5 mt-2">
            <div><span className="text-[8px] text-text-dim uppercase font-bold block">margen s/ventas</span><span className="text-[9px] font-black text-text-main">{margin(current).toFixed(1)}%</span></div>
            <div><span className="text-[8px] text-text-dim uppercase font-bold block">vs mes ant. (real)</span><VarBadge cur={current.ganancia} base={prevMonth?.ganancia} curMonth={current.month} baseMonth={prevMonth?.month} /></div>
            <div><span className="text-[8px] text-text-dim uppercase font-bold block">vs año ant. (real)</span><VarBadge cur={current.ganancia} base={sameMonthLastYear?.ganancia} curMonth={current.month} baseMonth={sameMonthLastYear?.month} /></div>
          </div>
        </div>
      </div>

      {/* Evolución mes a mes */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
        <h3 className="text-xs font-black uppercase text-text-main tracking-wider mb-4">Evolución Mensual</h3>
        <div className="space-y-2">
          {allMonths.map(m => (
            <div key={m.month} className="flex items-center gap-3">
              <span className="text-[9px] font-black uppercase text-text-dim w-16 shrink-0">{monthLabel(m.month)}</span>
              <div className="flex-1 bg-bg-accent/30 rounded-full h-5 relative overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-brand-500/30 rounded-full" style={{ width: `${(m.ventas / maxVentas) * 100}%` }} />
                <span className="absolute inset-y-0 left-2 flex items-center text-[9px] font-mono font-bold text-text-main">{fmt(m.ventas)}</span>
              </div>
              <span className={cn("text-[10px] font-mono font-black w-28 text-right shrink-0", m.ganancia >= 0 ? "text-emerald-500" : "text-red-500")}>{fmt(m.ganancia)}</span>
              <span className="text-[8px] font-bold text-text-dim w-12 text-right shrink-0">{margin(m).toFixed(0)}%</span>
            </div>
          ))}
          <div className="flex items-center gap-3 text-[8px] font-black uppercase text-text-dim pt-1 border-t border-border-dim/40">
            <span className="w-16 shrink-0">Mes</span><span className="flex-1">Ventas Netas</span><span className="w-28 text-right shrink-0">Ganancia Final</span><span className="w-12 text-right shrink-0">Margen</span>
          </div>
        </div>
      </div>

      {/* Gastos clave */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border-dim bg-bg-accent/30">
          <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Gastos Clave · monto y % sobre ventas</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-bg-accent/20 border-b border-border-dim text-[8px] font-black uppercase text-text-dim tracking-wider">
                <th className="px-4 py-2">Gasto</th>
                {allMonths.slice(-6).map(m => <th key={m.month} className="px-3 py-2 text-right">{monthLabel(m.month)}</th>)}
              </tr>
            </thead>
            <tbody>
              {KEY_EXPENSES.map(exp => (
                <tr key={exp.key} className="border-b border-border-dim/30 text-[10px] hover:bg-bg-accent/10">
                  <td className="px-4 py-2 font-black uppercase text-text-main">{exp.label}</td>
                  {allMonths.slice(-6).map(m => {
                    const val = Math.abs((m as any)[exp.key === 'sueldos_rel' ? 'sueldos' : exp.key === 'alquileres_expensas' ? 'alquileres' : exp.key === 'gastos_legales' ? 'legales' : exp.key === 'consumo_energia' ? 'energia' : exp.key === 'gastos_indumentaria' ? 'indumentaria' : 'cmv'] || 0);
                    const pctV = m.ventas !== 0 ? (val / m.ventas) * 100 : 0;
                    return (
                      <td key={m.month} className="px-3 py-2 text-right font-mono">
                        <div className="text-text-main">{fmt(val)}</div>
                        <div className="text-[8px] text-text-dim">{pctV.toFixed(1)}%</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
