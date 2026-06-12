/**
 * SPDX-License-Identifier: Apache-2.0
 * Módulo de Tickets/Órdenes: volumen de órdenes por mes/año/sucursal + ticket promedio (ventas/órdenes).
 * Comparación del mismo mes entre años.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Ticket, Calendar, FileUp, Loader2, Save, TrendingUp, TrendingDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';
import { supabase } from '../lib/supabase';
import { SUBTOTAL_COMPONENTS } from './plStructure';

const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fmtNum = (n: number) => Math.round(n).toLocaleString('es-AR');
const fmtMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');

interface Props {
  branches: Branch[];
  selectedBranchId: string;
  isReadOnly?: boolean;
}

export default function OrdersView({ branches, selectedBranchId, isReadOnly = false }: Props) {
  const [scope, setScope] = useState<string>('consolidated');
  const [orders, setOrders] = useState<Record<string, number>>({}); // 'YYYY-MM' -> órdenes
  const [sales, setSales] = useState<Record<string, number>>({});   // 'YYYY-MM' -> ventas netas
  const [inflationMap, setInflationMap] = useState<Record<string, number>>({}); // 'YYYY-MM' -> % mensual
  const [autoMonths, setAutoMonths] = useState<Set<string>>(new Set()); // meses calculados desde ventas
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const operativeBranches = useMemo(() => branches.filter(b => !/almac/i.test(b.name)), [branches]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Órdenes históricas cargadas manualmente / importadas (monthly_orders)
      const manualOrders: Record<string, number> = {};
      if (scope === 'consolidated') {
        const branchIds = operativeBranches.map(b => b.id);
        const { data: ord } = await supabase.from('monthly_orders').select('*').in('scope', branchIds);
        (ord || []).forEach((r: any) => { manualOrders[r.month] = (manualOrders[r.month] || 0) + (Number(r.orders) || 0); });
      } else {
        const { data: ord } = await supabase.from('monthly_orders').select('*').eq('scope', scope);
        (ord || []).forEach((r: any) => { manualOrders[r.month] = Number(r.orders) || 0; });
      }

      // 2. Órdenes automáticas desde las ventas cargadas (sales_tickets)
      const autoOrders: Record<string, number> = {};
      let tkQuery = supabase.from('sales_tickets').select('branch_id, date, orders, comprobante');
      if (scope !== 'consolidated') tkQuery = tkQuery.eq('branch_id', scope);
      else tkQuery = tkQuery.in('branch_id', operativeBranches.map(b => b.id));
      // paginar por si hay muchos tickets
      let page = 0; let allTk: any[] = [];
      while (true) {
        const { data: tk } = await tkQuery.range(page * 1000, page * 1000 + 999);
        if (!tk || tk.length === 0) break;
        allTk = [...allTk, ...tk];
        if (tk.length < 1000) break;
        page++; if (page > 50) break;
      }
      // Contar comprobantes ÚNICOS por mes. Un duplicado real es: misma sucursal +
      // mismo comprobante + MISMO DÍA. Si el comprobante se repite en días distintos,
      // son ventas legítimas distintas (la numeración se reinicia/reutiliza) y se cuentan.
      // Las filas SIN comprobante (datos viejos) usan el campo 'orders' como respaldo.
      const seenComprobantes: Record<string, Set<string>> = {}; // mes -> set de "branch|fecha|comprobante"
      const fallbackOrders: Record<string, number> = {};
      allTk.forEach((t: any) => {
        if (!t.date) return;
        const m = String(t.date).slice(0, 7);
        const comp = (t.comprobante != null && String(t.comprobante).trim() !== '') ? String(t.comprobante).trim() : null;
        if (comp) {
          if (!seenComprobantes[m]) seenComprobantes[m] = new Set();
          seenComprobantes[m].add(`${t.branch_id}|${String(t.date)}|${comp}`);
        } else {
          fallbackOrders[m] = (fallbackOrders[m] || 0) + Number(t.orders || 0);
        }
      });
      const allMonthsTk = new Set([...Object.keys(seenComprobantes), ...Object.keys(fallbackOrders)]);
      allMonthsTk.forEach(m => {
        autoOrders[m] = (seenComprobantes[m]?.size || 0) + (fallbackOrders[m] || 0);
      });

      // 3. Combinar: el dato automático (de ventas) tiene prioridad cuando existe y es > 0
      const merged: Record<string, number> = { ...manualOrders };
      Object.entries(autoOrders).forEach(([m, o]) => { if (o > 0) merged[m] = o; });
      setOrders(merged);
      setAutoMonths(new Set(Object.keys(autoOrders).filter(m => autoOrders[m] > 0)));

      // Ventas netas desde los EERR (mismo scope)
      const { data: eerr } = await supabase.from('income_statements').select('month, lines').eq('scope', scope);
      const sm: Record<string, number> = {};
      (eerr || []).forEach((r: any) => {
        const arr = typeof r.lines === 'string' ? JSON.parse(r.lines) : r.lines;
        const m: Record<string, number> = {};
        (arr || []).forEach((l: any) => { m[l.key] = l.realPesos || 0; });
        const ventas = SUBTOTAL_COMPONENTS.ventas_netas.reduce((s, k) => s + (m[k] || 0), 0);
        sm[r.month] = ventas;
      });
      setSales(sm);
      // Inflación mensual (compartida con el Estado de Resultados)
      const { data: infl } = await supabase.from('monthly_inflation').select('*');
      const im: Record<string, number> = {};
      (infl || []).forEach((r: any) => { im[r.month] = Number(r.inflation_pct) || 0; });
      setInflationMap(im);
    } catch (e) { console.error('Error cargando órdenes:', e); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [scope]);

  // Años y meses presentes
  const years = useMemo(() => {
    const ys = new Set<string>();
    Object.keys(orders).forEach(k => ys.add(k.slice(0, 4)));
    return Array.from(ys).sort();
  }, [orders]);

  // Año más reciente: a ese poder adquisitivo ajustamos los años anteriores
  const refYear = years.length > 0 ? years[years.length - 1] : null;

  // Factor de inflación acumulada entre dos meses (igual que en KPIs)
  const inflationFactor = (fromMonth: string, toMonth: string): number => {
    if (fromMonth >= toMonth) return 1;
    let factor = 1;
    let [y, m] = fromMonth.split('-').map(Number);
    const advance = () => { m++; if (m > 12) { m = 1; y++; } };
    advance();
    while (true) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      factor *= (1 + (inflationMap[key] || 0) / 100);
      if (key === toMonth) break;
      advance();
      if (y > 3000) break;
    }
    return factor;
  };

  // Ticket promedio de un mes/año, ajustado por inflación al año de referencia
  const adjustedTicket = (year: string, mm: string): number | null => {
    const month = `${year}-${mm}`;
    const o = orders[month]; const s = sales[month];
    if (!o || !s) return null;
    const ticket = s / o;
    if (!refYear || year === refYear) return ticket;
    // inflar el ticket del año viejo a pesos del año de referencia (mismo mes)
    return ticket * inflationFactor(`${year}-${mm}`, `${refYear}-${mm}`);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
        const parsed: Record<string, number> = {};
        rows.forEach(row => {
          if (!row || !row[0]) return;
          const mes = String(row[0]).trim();
          if (!/^\d{4}-\d{2}$/.test(mes)) return; // formato YYYY-MM
          const n = Number(row[1]);
          if (!isNaN(n)) parsed[mes] = Math.round(n);
        });
        if (Object.keys(parsed).length === 0) {
          alert('No se reconocieron filas. El archivo debe tener columna "Mes" (formato 2025-01) y "Ordenes".');
        } else {
          const merged = { ...orders, ...parsed };
          setOrders(merged);
          await persist(merged);
          alert(`Se importaron y guardaron ${Object.keys(parsed).length} meses de órdenes.`);
        }
      } catch (err: any) { alert('Error al leer el Excel: ' + (err?.message || '')); }
      setImporting(false);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const persist = async (data: Record<string, number>) => {
    const rows = Object.entries(data).map(([month, o]) => ({ scope, month, orders: o, updated_at: new Date().toISOString() }));
    if (rows.length === 0) return;
    const { error } = await supabase.from('monthly_orders').upsert(rows, { onConflict: 'scope,month' });
    if (error) throw error;
  };

  const handleSave = async () => {
    if (isReadOnly) return;
    setSaving(true);
    try { await persist(orders); alert('Órdenes guardadas.'); }
    catch (err: any) { alert('Error al guardar: ' + (err?.message || '')); }
    setSaving(false);
  };

  const setOrderValue = (month: string, val: string) => {
    if (isReadOnly) return;
    const n = val === '' ? 0 : parseInt(val);
    setOrders(prev => ({ ...prev, [month]: isNaN(n) ? 0 : n }));
  };

  const isConsolidated = scope === 'consolidated';
  const canEdit = !isReadOnly && !isConsolidated;
  const scopeName = scope === 'consolidated' ? 'Consolidado (Todas)' : (branches.find(b => b.id === scope)?.name || scope);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-bg-sidebar p-5 rounded-xl border border-border-dim shadow-xl">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/15 p-3 text-brand-500 border border-brand-500/25 rounded-xl"><Ticket size={24} /></div>
          <div>
            <h2 className="text-lg font-black text-text-main uppercase tracking-tight">Tickets / Órdenes</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">Volumen de órdenes y ticket promedio · {scopeName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={scope} onChange={(e) => setScope(e.target.value)}
            className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-black uppercase text-text-main outline-none">
            <option value="consolidated">Consolidado (Todas)</option>
            {operativeBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {canEdit && (
            <>
              <label className={cn("bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] font-black uppercase text-text-main cursor-pointer hover:border-brand-500/50 transition-all flex items-center gap-2", importing && "opacity-60 pointer-events-none")}>
                {importing ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Importar Excel
                <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" disabled={importing} />
              </label>
              <button onClick={handleSave} disabled={saving}
                className="bg-brand-500 text-black px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-60 flex items-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>
      ) : years.length === 0 ? (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl py-16 text-center text-text-dim text-[11px] font-black uppercase tracking-widest opacity-60">
          {isConsolidated ? 'No hay órdenes cargadas en ninguna sucursal todavía. Cargá las órdenes en cada sucursal y el consolidado se calcula solo.' : `No hay órdenes cargadas para ${scopeName}. Importá el Excel de tickets de esta sucursal.`}
        </div>
      ) : (
        <>
          {/* Volumen de órdenes: mismo mes entre años */}
          <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border-dim bg-bg-accent/30">
              <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Volumen de Órdenes · comparación entre años</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-bg-accent/20 border-b border-border-dim text-[8px] font-black uppercase text-text-dim tracking-wider">
                    <th className="px-4 py-2">Mes</th>
                    {years.map(y => <th key={y} className="px-4 py-2 text-right">{y}</th>)}
                    {years.length >= 2 && <th className="px-4 py-2 text-right">Var. % (último vs anterior)</th>}
                  </tr>
                </thead>
                <tbody>
                  {MONTHS_ES.map((mname, idx) => {
                    const mm = String(idx + 1).padStart(2, '0');
                    const vals = years.map(y => orders[`${y}-${mm}`]);
                    const lastTwo = years.slice(-2);
                    const newV = lastTwo[1] ? orders[`${lastTwo[1]}-${mm}`] : undefined;
                    const oldV = lastTwo[0] ? orders[`${lastTwo[0]}-${mm}`] : undefined;
                    const varV = (newV && oldV) ? ((newV - oldV) / oldV) * 100 : null;
                    if (vals.every(v => v === undefined)) return null;
                    return (
                      <tr key={mm} className="border-b border-border-dim/30 text-[11px] hover:bg-bg-accent/10">
                        <td className="px-4 py-2 font-black uppercase text-text-main">{mname}</td>
                        {years.map(y => {
                          const month = `${y}-${mm}`;
                          const isAuto = autoMonths.has(month);
                          return (
                            <td key={y} className="px-4 py-2 text-right font-mono">
                              {!canEdit || isAuto ? (
                                <span className={cn(isAuto ? "text-emerald-500" : "text-text-main")} title={isAuto ? 'Calculado automáticamente desde Ventas' : undefined}>
                                  {orders[month] !== undefined ? fmtNum(orders[month]) : '—'}{isAuto ? ' •' : ''}
                                </span>
                              ) : (
                                <input type="number" value={orders[month] ?? ''} onChange={(e) => setOrderValue(month, e.target.value)}
                                  placeholder="—" className="w-20 bg-transparent border border-transparent hover:border-border-dim focus:border-brand-500 rounded px-1 py-0.5 text-right font-mono text-[11px] text-text-main outline-none" />
                              )}
                            </td>
                          );
                        })}
                        {years.length >= 2 && (
                          <td className={cn("px-4 py-2 text-right font-mono font-black", varV === null ? "text-text-dim" : varV > 0 ? "text-emerald-500" : "text-red-500")}>
                            {varV !== null ? (varV > 0 ? '+' : '') + varV.toFixed(1) + '%' : '—'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[8px] text-text-dim font-bold uppercase px-5 py-2 opacity-60">
              Los meses marcados con • (en verde) se calculan automáticamente sumando las órdenes cargadas en el módulo Ventas. El resto son datos históricos importados (editables).
            </p>
          </div>

          {/* Ticket promedio (ventas / órdenes) */}
          <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border-dim bg-bg-accent/30">
              <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Ticket Promedio · ventas ÷ órdenes <span className="text-text-dim normal-case font-bold">(años anteriores ajustados por inflación a pesos de {refYear || '—'})</span></h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-bg-accent/20 border-b border-border-dim text-[8px] font-black uppercase text-text-dim tracking-wider">
                    <th className="px-4 py-2">Mes</th>
                    {years.map(y => <th key={y} className="px-4 py-2 text-right">{y}{refYear && y !== refYear ? ' (ajust.)' : ''}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MONTHS_ES.map((mname, idx) => {
                    const mm = String(idx + 1).padStart(2, '0');
                    const cells = years.map(y => adjustedTicket(y, mm));
                    if (cells.every(c => c === null)) return null;
                    return (
                      <tr key={mm} className="border-b border-border-dim/30 text-[11px] hover:bg-bg-accent/10">
                        <td className="px-4 py-2 font-black uppercase text-text-main">{mname}</td>
                        {cells.map((c, i) => (
                          <td key={i} className="px-4 py-2 text-right font-mono text-text-main">{c !== null ? fmtMoney(c) : '—'}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[8px] text-text-dim font-bold uppercase px-5 py-2 opacity-60">
              Los años anteriores a {refYear || '—'} están ajustados por inflación a pesos de hoy, para que el ticket promedio sea comparable en términos reales. Necesita la inflación mensual cargada en el Estado de Resultados.
            </p>
          </div>
        </>
      )}
    </motion.div>
  );
}
