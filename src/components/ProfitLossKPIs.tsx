/**
 * SPDX-License-Identifier: Apache-2.0
 * KPIs del Estado de Resultados (Real vs Real, mes a mes y año contra año).
 * Reutilizable: pestaña KPIs del EERR y resumen en Dashboard de Socios (compact).
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, TrendingUp, TrendingDown, Minus, Save, FileSpreadsheet, FileText } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PL_STRUCTURE, SUBTOTAL_COMPONENTS, GANANCIA_BRUTA_COMPONENTS, OPERATIVA_COMPONENTS,
  OPERATIVA_NETA_COMPONENTS, FINAL_COMPONENTS, VARIABLE_COST_KEYS
} from './plStructure';

interface Props {
  scope?: string;
  compact?: boolean; // versión para dashboard
  selectedMonth?: string; // mes elegido en la pantalla (para el Punto de Equilibrio)
}

type LinesMap = Record<string, number>; // key -> realPesos
interface MonthData { month: string; ventas: number; ganancia: number; lines: Record<string, number>; linesProj: Record<string, number>; }

const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmt = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-AR');
const monthLabel = (m: string) => { const [y, mm] = m.split('-'); return `${MONTHS_ES[parseInt(mm) - 1]} ${y.slice(2)}`; };

// Gastos clave a vigilar
// Gastos seleccionados por defecto
const DEFAULT_EXPENSE_KEYS = ['cmv', 'sueldos_rel', 'alquileres_expensas', 'gastos_legales', 'consumo_energia', 'gastos_indumentaria'];

// Todos los conceptos analizables (líneas input + subtotales), con su label.
// isGroup = es una agrupación/subtotal (suma de otros conceptos), no un ítem individual.
const ANALYZABLE = PL_STRUCTURE.filter(d => d.type === 'input' || d.type === 'subtotal').map(d => ({ key: d.key, label: d.label, isGroup: d.type === 'subtotal' }));
const labelOf = (key: string) => ANALYZABLE.find(a => a.key === key)?.label || key;
const isGroupKey = (key: string) => ANALYZABLE.find(a => a.key === key)?.isGroup || false;
// Texto explicativo de qué compone cada agrupación (para el tooltip)
const groupTooltip = (key: string) => {
  const parts = SUBTOTAL_COMPONENTS[key];
  if (!parts || parts.length === 0) return 'Agrupación: suma de varios conceptos';
  return 'Suma de: ' + parts.map(labelOf).join(', ');
};

// Calcula el punto de equilibrio económico a partir de un mapa de líneas (key -> monto en pesos).
// Convención de signos del EERR: ventas positivas, egresos negativos.
// PE = Costos Fijos / Margen de Contribución, donde Margen = 1 - (Variables / Ventas).
function calcularPuntoEquilibrio(lines: Record<string, number>) {
  const ventas = SUBTOTAL_COMPONENTS.ventas_netas.reduce((s, k) => s + (lines[k] || 0), 0);
  if (ventas <= 0) return null;
  // Costos variables (en valor absoluto, porque vienen como egresos negativos)
  const variables = VARIABLE_COST_KEYS.reduce((s, k) => s + Math.abs(lines[k] || 0), 0);
  // Todos los egresos operativos (en valor absoluto): todo lo que está en los subtotales de egreso
  const keysEgreso = [
    ...SUBTOTAL_COMPONENTS.sueldos_rel, ...SUBTOTAL_COMPONENTS.alquileres_rel,
    ...SUBTOTAL_COMPONENTS.servicios_contrat, ...SUBTOTAL_COMPONENTS.gastos_comercial,
    ...SUBTOTAL_COMPONENTS.impuestos, ...SUBTOTAL_COMPONENTS.otros_egresos,
    'cmv', 'comisiones_socios', 'honorarios_socios',
  ];
  const egresosTotales = keysEgreso.reduce((s, k) => s + Math.abs(lines[k] || 0), 0);
  // Fijos = egresos totales - variables
  const fijos = Math.max(0, egresosTotales - variables);
  const ratioContribucion = 1 - (variables / ventas); // margen de contribución sobre ventas
  if (ratioContribucion <= 0) return { ventas, variables, fijos, ratioContribucion, pe: null, cubre: false };
  const pe = fijos / ratioContribucion; // ventas necesarias para no perder
  return { ventas, variables, fijos, ratioContribucion, pe, cubre: ventas >= pe };
}

export default function ProfitLossKPIs({ scope = 'consolidated', compact = false, selectedMonth }: Props) {
  const [allMonths, setAllMonths] = useState<MonthData[]>([]);
  const [inflationMap, setInflationMap] = useState<Record<string, number>>({}); // month -> % mensual
  const [editingInflation, setEditingInflation] = useState(false);
  const [savingInflation, setSavingInflation] = useState(false);
  const [selectedExpenses, setSelectedExpenses] = useState<string[]>(DEFAULT_EXPENSE_KEYS);
  const [showExpensePicker, setShowExpensePicker] = useState(false);
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
          const mProj: LinesMap = {};
          (arr || []).forEach((l: any) => { m[l.key] = l.realPesos || 0; mProj[l.key] = l.projPesos || 0; });
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
          // Mapa completo: todas las líneas input + subtotales calculados
          const fullLines: Record<string, number> = { ...m };
          Object.entries(SUBTOTAL_COMPONENTS).forEach(([key, comps]) => { fullLines[key] = sum(comps); });
          fullLines['ventas_netas'] = ventas;
          fullLines['ganancia_bruta'] = bruta;
          fullLines['ganancia_operativa'] = operativa;
          fullLines['ganancia_operativa_neta'] = operativaNeta;
          fullLines['ganancia_final'] = ganancia;
          return { month: r.month, ventas, ganancia, lines: fullLines, linesProj: mProj };
        }).filter(md => md.ventas !== 0 || md.ganancia !== 0 || Object.keys(md.linesProj).length > 0);
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

  // Punto de equilibrio económico: usa el MES SELECCIONADO en pantalla.
  // El resto de KPIs sigue usando 'current'.
  const mesPESeleccionado = selectedMonth ? allMonths.find(m => m.month === selectedMonth) : current;
  const mesPESinDatos = !!selectedMonth && !mesPESeleccionado;
  const mesPE = mesPESeleccionado || null;
  const peProyectado = mesPE ? calcularPuntoEquilibrio(mesPE.linesProj) : null;
  const realTieneDatos = mesPE ? Object.values(mesPE.lines).some(v => v !== 0) : false;
  const peReal = mesPE && realTieneDatos ? calcularPuntoEquilibrio(mesPE.lines) : null;
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

  // Edita solo el estado local (se persiste al tocar Guardar)
  const setInflationLocal = (month: string, value: string) => {
    const pct = value === '' ? 0 : Number(value);
    setInflationMap(prev => ({ ...prev, [month]: isNaN(pct) ? 0 : pct }));
  };
  const saveAllInflation = async () => {
    setSavingInflation(true);
    try {
      const rows = Object.entries(inflationMap).map(([month, pct]) => ({ month, inflation_pct: pct, updated_at: new Date().toISOString() }));
      if (rows.length > 0) {
        const { error } = await supabase.from('monthly_inflation').upsert(rows, { onConflict: 'month' });
        if (error) throw error;
      }
      alert('Inflación mensual guardada correctamente.');
    } catch (e: any) { alert('Error al guardar inflación: ' + (e?.message || '')); }
    setSavingInflation(false);
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
  // Detectar los dos años a comparar (el más reciente vs el anterior)
  const years = Array.from(new Set(allMonths.map(m => m.month.slice(0, 4)))).sort();
  const yearNew = years[years.length - 1];
  const yearOld = years.length > 1 ? years[years.length - 2] : null;
  const byMonthKey: Record<string, MonthData> = {};
  allMonths.forEach(m => { byMonthKey[m.month] = m; });
  // Filas: meses 01..12, con dato old (ajustado) y new
  const yoyRows = Array.from({ length: 12 }, (_, i) => {
    const mm = String(i + 1).padStart(2, '0');
    const oldMd = yearOld ? byMonthKey[`${yearOld}-${mm}`] : undefined;
    const newMd = byMonthKey[`${yearNew}-${mm}`];
    return { mm, oldMd, newMd };
  }).filter(r => r.oldMd || r.newMd);
  // Ajusta un valor del año viejo a pesos del año nuevo (mismo mes)
  const adjustOld = (val: number, mm: string) => {
    if (!yearOld) return val;
    return val * inflationFactor(`${yearOld}-${mm}`, `${yearNew}-${mm}`);
  };

  // Meses presentes en AMBOS años (los únicos comparables de forma justa para acumulados)
  const comparableMonths = yoyRows.filter(r => r.oldMd && r.newMd).map(r => MONTHS_ES[parseInt(r.mm) - 1]);
  const isPartialYear = yearOld != null && comparableMonths.length > 0 && comparableMonths.length < 12;

  // ───────── Exportaciones de KPIs ─────────
  const labelOfKey = (key: string) => labelOf(key);
  // Comparación de gastos seleccionados (mismo cálculo que la tabla)
  const buildGastosRows = () => selectedExpenses.map(key => {
    let oldSum = 0, oldVentas = 0, newSum = 0, newVentas = 0;
    yoyRows.forEach(r => {
      if (r.oldMd && r.newMd) { oldSum += adjustOld(Math.abs(r.oldMd.lines[key] || 0), r.mm); oldVentas += adjustOld(r.oldMd.ventas, r.mm); }
      if (r.newMd) { newSum += Math.abs(r.newMd.lines[key] || 0); newVentas += r.newMd.ventas; }
    });
    const oldPct = oldVentas !== 0 ? (oldSum / oldVentas) * 100 : 0;
    const newPct = newVentas !== 0 ? (newSum / newVentas) * 100 : 0;
    const varV = oldSum !== 0 ? ((newSum - oldSum) / Math.abs(oldSum)) * 100 : null;
    return { label: labelOfKey(key), oldSum, oldPct, newSum, newPct, varV };
  });
  // Evolución mensual (ventas, ganancia, margen)
  const buildEvolucionRows = () => allMonths.map(m => ({
    mes: monthLabel(m.month), ventas: m.ventas, ganancia: m.ganancia,
    margen: m.ventas !== 0 ? (m.ganancia / m.ventas) * 100 : 0,
  }));
  const money = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-AR');
  const scopeSuffix = scope && scope !== 'consolidated' ? scope : 'Consolidado';

  const exportKpisExcel = () => {
    const wb = XLSX.utils.book_new();
    const g = [[`Gastos a Analizar · ${yearOld || '—'} vs ${yearNew} (ajustado por inflación)`], [],
      ['Concepto', `${yearOld || 'Año ant.'} (ajustado) $`, '% s/Ventas', `${yearNew} $`, '% s/Ventas', 'Variación %']];
    buildGastosRows().forEach(r => g.push([r.label, Math.round(r.oldSum), +r.oldPct.toFixed(1), Math.round(r.newSum), +r.newPct.toFixed(1), r.varV !== null ? +r.varV.toFixed(1) : '—'] as any));
    const wsG = XLSX.utils.aoa_to_sheet(g); wsG['!cols'] = [{ wch: 38 }, { wch: 20 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsG, 'Gastos a Analizar');
    const e = [['Evolución mensual (Real)'], [], ['Mes', 'Ventas', 'Ganancia Final', 'Margen %']];
    buildEvolucionRows().forEach(r => e.push([r.mes, Math.round(r.ventas), Math.round(r.ganancia), +r.margen.toFixed(1)] as any));
    const wsE = XLSX.utils.aoa_to_sheet(e); wsE['!cols'] = [{ wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, wsE, 'Evolución mensual');
    XLSX.writeFile(wb, `KPIs_EERR_${scopeSuffix.replace(/\s+/g, '_')}_${yearNew}.xlsx`);
  };

  const exportKpisPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(13); doc.text('KPIs · Estado de Resultados', 14, 14);
    doc.setFontSize(9); doc.text(`Gastos a Analizar · ${yearOld || '—'} vs ${yearNew} (ajustado por inflación)`, 14, 20);
    autoTable(doc, {
      head: [['Concepto', `${yearOld || 'Ant.'} (ajust.)`, '% Vtas', `${yearNew}`, '% Vtas', 'Var. %']],
      body: buildGastosRows().map(r => [r.label, r.oldSum ? money(r.oldSum) : '—', r.oldSum ? r.oldPct.toFixed(1) + '%' : '—', r.newSum ? money(r.newSum) : '—', r.newSum ? r.newPct.toFixed(1) + '%' : '—', r.varV !== null ? (r.varV > 0 ? '+' : '') + r.varV.toFixed(1) + '%' : '—']),
      startY: 25, styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [193, 18, 31], fontSize: 8 },
      columnStyles: { 0: { cellWidth: 60 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
    });
    const y2 = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(11); doc.text('Evolución mensual (Real)', 14, y2);
    autoTable(doc, {
      head: [['Mes', 'Ventas', 'Ganancia Final', 'Margen %']],
      body: buildEvolucionRows().map(r => [r.mes, money(r.ventas), money(r.ganancia), r.margen.toFixed(1) + '%']),
      startY: y2 + 4, styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [193, 18, 31], fontSize: 8 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });

    // Comparativo interanual: Ventas Netas (año anterior ajustado por inflación vs año nuevo)
    const yInt = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(11); doc.text(`Ventas Netas · ${yearOld || '—'} vs ${yearNew} (${yearOld} ajustado por inflación)`, 14, yInt);
    autoTable(doc, {
      head: [['Mes', `${yearOld || 'Ant.'} (real, ajust.)`, `${yearNew}`, 'Var. % (real)']],
      body: yoyRows.map(r => {
        const oldAdj = r.oldMd ? adjustOld(r.oldMd.ventas, r.mm) : null;
        const newV = r.newMd ? r.newMd.ventas : null;
        const varV = (oldAdj && newV) ? ((newV - oldAdj) / Math.abs(oldAdj)) * 100 : null;
        return [MONTHS_ES[parseInt(r.mm) - 1], oldAdj !== null ? money(oldAdj) : '—', newV !== null ? money(newV) : '—', varV !== null ? (varV > 0 ? '+' : '') + varV.toFixed(1) + '%' : '—'];
      }),
      startY: yInt + 4, styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [193, 18, 31], fontSize: 8 },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });

    // Comparativo interanual: Ganancia/Pérdida Final (con total del año)
    const yGan = (doc as any).lastAutoTable.finalY + 8;
    doc.setFontSize(11); doc.text(`Ganancia/Pérdida Final · ${yearOld || '—'} vs ${yearNew} (ajustado por inflación)`, 14, yGan);
    let totOld = 0, totNew = 0;
    const ganBody = yoyRows.map(r => {
      const oldAdj = r.oldMd ? adjustOld(r.oldMd.ganancia, r.mm) : null;
      const newV = r.newMd ? r.newMd.ganancia : null;
      if (oldAdj !== null) totOld += oldAdj;
      if (newV !== null) totNew += newV;
      const varV = (oldAdj && newV && oldAdj !== 0) ? ((newV - oldAdj) / Math.abs(oldAdj)) * 100 : null;
      return [MONTHS_ES[parseInt(r.mm) - 1], oldAdj !== null ? money(oldAdj) : '—', newV !== null ? money(newV) : '—', varV !== null ? (varV > 0 ? '+' : '') + varV.toFixed(1) + '%' : '—'];
    });
    const totVar = totOld !== 0 ? ((totNew - totOld) / Math.abs(totOld)) * 100 : null;
    autoTable(doc, {
      head: [['Mes', `${yearOld || 'Ant.'} (real, ajust.)`, `${yearNew}`, 'Var. % (real)']],
      body: ganBody,
      foot: [['TOTAL DEL AÑO', totOld !== 0 ? money(totOld) : '—', totNew !== 0 ? money(totNew) : '—', totVar !== null ? (totVar > 0 ? '+' : '') + totVar.toFixed(1) + '%' : '—']],
      startY: yGan + 4, styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [193, 18, 31], fontSize: 8 },
      footStyles: { fillColor: [33, 37, 41], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    });

    doc.save(`KPIs_EERR_${scopeSuffix.replace(/\s+/g, '_')}_${yearNew}.pdf`);
  };

  return (
    <div className="space-y-6">
      {/* Exportaciones de KPIs */}
      <div className="flex items-center justify-end gap-2">
        <button onClick={exportKpisExcel}
          className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 rounded px-3 py-2 text-[10px] font-black uppercase hover:bg-emerald-500/20 transition-all flex items-center gap-2">
          <FileSpreadsheet size={14} /> Excel
        </button>
        <button onClick={exportKpisPDF}
          className="bg-red-500/10 border border-red-500/30 text-red-600 rounded px-3 py-2 text-[10px] font-black uppercase hover:bg-red-500/20 transition-all flex items-center gap-2">
          <FileText size={14} /> PDF
        </button>
      </div>

      {/* Aviso si el mes elegido no tiene Estado de Resultado cargado */}
      {mesPESinDatos && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <p className="text-[10px] font-black uppercase text-amber-600 tracking-widest">Punto de Equilibrio · sin datos para el mes elegido</p>
          <p className="text-[9px] font-bold text-text-dim mt-1">No hay un Estado de Resultado cargado para ese mes. Cargalo en la pestaña "Estado de Resultados" para ver su punto de equilibrio.</p>
        </div>
      )}

      {/* Punto de Equilibrio Económico (Estado de Resultado) */}
      {mesPE && (peProyectado || peReal) && (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-1">Punto de Equilibrio Económico · {monthLabel(mesPE.month)}</h3>
          <p className="text-[9px] text-text-dim font-bold uppercase tracking-widest mb-4 opacity-70">Ventas necesarias para cubrir costos fijos y variables</p>
          <div className={cn("grid gap-3", peReal ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1")}>
            {[{ titulo: 'Proyectado', pe: peProyectado }, { titulo: 'Real', pe: peReal }].filter(x => x.pe).map(({ titulo, pe }) => (
              <div key={titulo} className="border border-border-dim rounded-lg p-4">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand-500 mb-3">{titulo}</p>
                <div className="space-y-2">
                  <div className="flex justify-between items-baseline">
                    <span className="text-[9px] font-bold uppercase text-text-dim">Punto de equilibrio</span>
                    <span className="text-[16px] font-mono font-black text-text-main">{pe!.pe !== null ? fmt(pe!.pe) : 'N/A'}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[9px] font-bold uppercase text-text-dim">Ventas del mes</span>
                    <span className={cn("text-[12px] font-mono font-black", pe!.cubre ? "text-emerald-500" : "text-red-500")}>{fmt(pe!.ventas)}</span>
                  </div>
                  <div className="flex justify-between items-baseline border-t border-border-dim/40 pt-2">
                    <span className="text-[9px] font-bold uppercase text-text-dim">Margen de contribución</span>
                    <span className="text-[12px] font-mono font-black text-text-main">{(pe!.ratioContribucion * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[9px] font-bold uppercase text-text-dim">Costos fijos</span>
                    <span className="text-[11px] font-mono font-bold text-text-dim">{fmt(pe!.fijos)}</span>
                  </div>
                  <div className="flex justify-between items-baseline">
                    <span className="text-[9px] font-bold uppercase text-text-dim">Costos variables</span>
                    <span className="text-[11px] font-mono font-bold text-text-dim">{fmt(pe!.variables)}</span>
                  </div>
                  <div className={cn("mt-2 rounded px-3 py-2 text-center", pe!.cubre ? "bg-emerald-500/10" : "bg-red-500/10")}>
                    {pe!.pe !== null ? (
                      pe!.cubre
                        ? <span className="text-[10px] font-black uppercase text-emerald-500">Cubierto · {fmt(pe!.ventas - pe!.pe)} por encima</span>
                        : <span className="text-[10px] font-black uppercase text-red-500">Faltan {fmt(pe!.pe - pe!.ventas)} de ventas</span>
                    ) : (
                      <span className="text-[10px] font-black uppercase text-red-500">Margen negativo: las ventas no cubren ni los costos variables</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
          <>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {allMonths.map(m => (
                <div key={m.month}>
                  <label className="text-[8px] font-black uppercase text-text-dim tracking-widest block">{monthLabel(m.month)}</label>
                  <div className="flex items-center bg-bg-accent border border-border-dim rounded px-2 mt-0.5">
                    <input type="number" step="0.1" value={inflationMap[m.month] ?? ''} placeholder="0"
                      onChange={(e) => setInflationLocal(m.month, e.target.value)}
                      className="w-full bg-transparent border-none py-1.5 text-[11px] font-mono font-bold text-text-main outline-none" />
                    <span className="text-[9px] text-text-dim font-bold">%</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end mt-4">
              <button onClick={saveAllInflation} disabled={savingInflation}
                className="bg-brand-500 text-black px-5 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-60 flex items-center gap-2">
                {savingInflation ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar Inflación
              </button>
            </div>
          </>
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

      {/* Comparativo año contra año (ajustado por inflación) */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border-dim bg-bg-accent/30">
          <h3 className="text-xs font-black uppercase text-text-main tracking-wider">
            Ventas Netas · {yearOld || '—'} vs {yearNew} <span className="text-text-dim normal-case font-bold">({yearOld} ajustado por inflación a pesos de {yearNew})</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-bg-accent/20 border-b border-border-dim text-[8px] font-black uppercase text-text-dim tracking-wider">
                <th className="px-4 py-2">Mes</th>
                <th className="px-4 py-2 text-right">{yearOld || 'Año ant.'} (real, ajustado)</th>
                <th className="px-4 py-2 text-right">{yearNew}</th>
                <th className="px-4 py-2 text-right">Variación % (real)</th>
              </tr>
            </thead>
            <tbody>
              {yoyRows.map(r => {
                const oldAdj = r.oldMd ? adjustOld(r.oldMd.ventas, r.mm) : null;
                const newV = r.newMd ? r.newMd.ventas : null;
                const varV = (oldAdj && newV) ? ((newV - oldAdj) / Math.abs(oldAdj)) * 100 : null;
                return (
                  <tr key={r.mm} className="border-b border-border-dim/30 text-[11px] hover:bg-bg-accent/10">
                    <td className="px-4 py-2 font-black uppercase text-text-main">{MONTHS_ES[parseInt(r.mm) - 1]}</td>
                    <td className="px-4 py-2 text-right font-mono text-text-dim">{oldAdj !== null ? fmt(oldAdj) : '—'}</td>
                    <td className="px-4 py-2 text-right font-mono text-text-main">{newV !== null ? fmt(newV) : '—'}</td>
                    <td className={cn("px-4 py-2 text-right font-mono font-black", varV === null ? "text-text-dim" : varV > 0 ? "text-emerald-500" : "text-red-500")}>
                      {varV !== null ? (varV > 0 ? '+' : '') + varV.toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Comparativo Ganancia Final año contra año */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border-dim bg-bg-accent/30">
          <h3 className="text-xs font-black uppercase text-text-main tracking-wider">
            Ganancia/Pérdida Final · {yearOld || '—'} vs {yearNew} <span className="text-text-dim normal-case font-bold">(ajustado por inflación)</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-bg-accent/20 border-b border-border-dim text-[8px] font-black uppercase text-text-dim tracking-wider">
                <th className="px-4 py-2">Mes</th>
                <th className="px-4 py-2 text-right">{yearOld || 'Año ant.'} (real, ajustado)</th>
                <th className="px-4 py-2 text-right">{yearNew}</th>
                <th className="px-4 py-2 text-right">Variación % (real)</th>
              </tr>
            </thead>
            <tbody>
              {yoyRows.map(r => {
                const oldAdj = r.oldMd ? adjustOld(r.oldMd.ganancia, r.mm) : null;
                const newV = r.newMd ? r.newMd.ganancia : null;
                const varV = (oldAdj && newV && oldAdj !== 0) ? ((newV - oldAdj) / Math.abs(oldAdj)) * 100 : null;
                return (
                  <tr key={r.mm} className="border-b border-border-dim/30 text-[11px] hover:bg-bg-accent/10">
                    <td className="px-4 py-2 font-black uppercase text-text-main">{MONTHS_ES[parseInt(r.mm) - 1]}</td>
                    <td className={cn("px-4 py-2 text-right font-mono", oldAdj !== null && oldAdj < 0 ? "text-red-400" : "text-text-dim")}>{oldAdj !== null ? fmt(oldAdj) : '—'}</td>
                    <td className={cn("px-4 py-2 text-right font-mono", newV !== null && newV < 0 ? "text-red-400" : "text-text-main")}>{newV !== null ? fmt(newV) : '—'}</td>
                    <td className={cn("px-4 py-2 text-right font-mono font-black", varV === null ? "text-text-dim" : varV > 0 ? "text-emerald-500" : "text-red-500")}>
                      {varV !== null ? (varV > 0 ? '+' : '') + varV.toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                );
              })}
              {/* Total del año: suma de todos los meses */}
              {(() => {
                let totalOld = 0, totalNew = 0;
                yoyRows.forEach(r => {
                  if (r.oldMd) totalOld += adjustOld(r.oldMd.ganancia, r.mm);
                  if (r.newMd) totalNew += r.newMd.ganancia;
                });
                const totalVar = totalOld !== 0 ? ((totalNew - totalOld) / Math.abs(totalOld)) * 100 : null;
                return (
                  <tr className="border-t-2 border-border-dim bg-bg-accent/30 text-[11px] font-black">
                    <td className="px-4 py-2.5 uppercase text-text-main tracking-wider">Total del Año</td>
                    <td className={cn("px-4 py-2.5 text-right font-mono", totalOld < 0 ? "text-red-400" : "text-text-dim")}>{totalOld !== 0 ? fmt(totalOld) : '—'}</td>
                    <td className={cn("px-4 py-2.5 text-right font-mono", totalNew < 0 ? "text-red-500" : "text-emerald-500")}>{totalNew !== 0 ? fmt(totalNew) : '—'}</td>
                    <td className={cn("px-4 py-2.5 text-right font-mono", totalVar === null ? "text-text-dim" : totalVar > 0 ? "text-emerald-500" : "text-red-500")}>
                      {totalVar !== null ? (totalVar > 0 ? '+' : '') + totalVar.toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                );
              })()}
            </tbody>
          </table>
        </div>
      </div>

      {/* Gastos clave · año contra año ajustado por inflación */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border-dim bg-bg-accent/30 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-xs font-black uppercase text-text-main tracking-wider">
            Gastos a Analizar · {yearOld || '—'} vs {yearNew} <span className="text-text-dim normal-case font-bold">(acumulado de los meses comparables, ajustado por inflación · monto y % s/ventas)</span>
          </h3>
          <button onClick={() => setShowExpensePicker(!showExpensePicker)}
            className="bg-bg-accent border border-border-dim text-text-main px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest hover:border-brand-500/50 transition-all">
            {showExpensePicker ? 'Cerrar' : 'Elegir Gastos'}
          </button>
        </div>
        {showExpensePicker && (
          <div className="px-5 py-3 border-b border-border-dim bg-bg-accent/10">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <p className="text-[9px] font-black uppercase text-text-dim">Tildá los conceptos que querés analizar:</p>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[8px] font-black uppercase text-text-dim">
                  <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-500 border border-brand-500/30">Grupo</span> Agrupación
                </span>
                <span className="flex items-center gap-1 text-[8px] font-black uppercase text-text-dim">
                  <span className="w-2 h-2 rounded-full bg-text-dim/40" /> Ítem
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-x-4 gap-y-1.5 max-h-64 overflow-y-auto">
              {ANALYZABLE.map(a => (
                <label key={a.key} className={cn("flex items-center gap-2 cursor-pointer rounded px-1 py-0.5",
                  a.isGroup && "bg-brand-500/5")}>
                  <input type="checkbox" checked={selectedExpenses.includes(a.key)}
                    onChange={(e) => setSelectedExpenses(prev => e.target.checked ? [...prev, a.key] : prev.filter(k => k !== a.key))}
                    className="w-3.5 h-3.5 accent-brand-500 shrink-0" />
                  {a.isGroup
                    ? <span title={groupTooltip(a.key)} className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-500 border border-brand-500/30 shrink-0">Grupo</span>
                        <span className="text-[10px] font-black text-text-main uppercase truncate">{a.label}</span>
                      </span>
                    : <span className="text-[10px] font-bold text-text-dim truncate pl-1">{a.label}</span>}
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-bg-accent/20 border-b border-border-dim text-[8px] font-black uppercase text-text-dim tracking-wider">
                <th className="px-4 py-2">Concepto</th>
                <th className="px-4 py-2 text-right">{yearOld || 'Año ant.'} (ajustado)</th>
                <th className="px-4 py-2 text-right">{yearNew}</th>
                <th className="px-4 py-2 text-right">Variación % (real)</th>
              </tr>
            </thead>
            <tbody>
              {selectedExpenses.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-[10px] font-black uppercase text-text-dim opacity-50">Elegí al menos un concepto con "Elegir Gastos".</td></tr>
              ) : selectedExpenses.map(key => {
                let oldSum = 0, oldVentas = 0, newSum = 0, newVentas = 0;
                yoyRows.forEach(r => {
                  // Comparación justa: solo acumulamos el mes del año viejo si ese mismo
                  // mes también tiene datos cargados en el año nuevo. Así no se compara
                  // el año viejo completo contra un año nuevo parcial.
                  if (r.oldMd && r.newMd) {
                    oldSum += adjustOld(Math.abs(r.oldMd.lines[key] || 0), r.mm);
                    oldVentas += adjustOld(r.oldMd.ventas, r.mm);
                  }
                  if (r.newMd) { newSum += Math.abs(r.newMd.lines[key] || 0); newVentas += r.newMd.ventas; }
                });
                const oldPct = oldVentas !== 0 ? (oldSum / oldVentas) * 100 : 0;
                const newPct = newVentas !== 0 ? (newSum / newVentas) * 100 : 0;
                const varV = oldSum !== 0 ? ((newSum - oldSum) / Math.abs(oldSum)) * 100 : null;
                const esGrupo = isGroupKey(key);
                return (
                  <tr key={key} className={cn("border-b border-border-dim/30 text-[11px] hover:bg-bg-accent/10", esGrupo && "bg-brand-500/5")}>
                    <td className="px-4 py-2 font-black uppercase text-text-main">
                      <span className="flex items-center gap-2">
                        {esGrupo && <span title={groupTooltip(key)} className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-500 border border-brand-500/30 shrink-0">Grupo</span>}
                        <span className={esGrupo ? "" : "font-bold text-text-dim normal-case"}>{labelOf(key)}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-text-dim">
                      {oldSum ? fmt(oldSum) : '—'}{oldSum ? <span className="text-[8px] block">{oldPct.toFixed(1)}%</span> : null}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-text-main">
                      {newSum ? fmt(newSum) : '—'}{newSum ? <span className="text-[8px] block text-text-dim">{newPct.toFixed(1)}%</span> : null}
                    </td>
                    <td className={cn("px-4 py-2 text-right font-mono font-black", varV === null ? "text-text-dim" : varV > 0 ? "text-red-500" : "text-emerald-500")}>
                      {varV !== null ? (varV > 0 ? '+' : '') + varV.toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[8px] text-text-dim font-bold uppercase px-5 py-2 opacity-60">
          {isPartialYear
            ? `Comparación justa: solo se suman los meses cargados en ambos años (${comparableMonths.join(', ')}). En gastos, una variación en rojo (subió en términos reales) es lo que conviene vigilar.`
            : 'En gastos, una variación en rojo (subió en términos reales) es lo que conviene vigilar.'}
        </p>
      </div>
    </div>
  );
}
