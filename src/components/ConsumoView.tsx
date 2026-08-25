/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useEffect, type FC } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calculator, 
  Plus, 
  Trash2, 
  Receipt, 
  Truck, 
  Save, 
  ChevronRight,
  TrendingDown,
  DollarSign,
  FileSpreadsheet,
  FileText,
  ChevronLeft,
  Loader2
} from 'lucide-react';
import { cn } from '../lib/utils';
import { ConsumptionDetail, Branch } from '../types';
import { supabase } from '../lib/supabase';

export default function ConsumoView({ 
  selectedBranchId, 
  branches, 
  onBranchChange,
  isReadOnly = false
}: { 
  selectedBranchId: string, 
  branches: Branch[], 
  onBranchChange?: (id: string) => void,
  isReadOnly?: boolean
}) {
  const activeBranch = branches.find(b => b.id === selectedBranchId);
  
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [initialExistence, setInitialExistence] = useState(0);
  const [finalExistence, setFinalExistence] = useState(0);
  const [purchases, setPurchases] = useState<ConsumptionDetail[]>([]);
  const [movements, setMovements] = useState<ConsumptionDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Datos consolidados por sucursal (mes actual y anterior) para la vista CONSOLIDADO
  const [consolidated, setConsolidated] = useState<any[]>([]);
  const [loadingConsolidated, setLoadingConsolidated] = useState(false);

  // Pestaña: CMV Real (carga de existencias/compras) o CMV Teórico (ranking × receta costeada)
  const [activeTab, setActiveTab] = useState<'real' | 'teorico'>('real');
  const [teorico, setTeorico] = useState<{ loading: boolean; total: number; netSales: number; rows: any[]; sinCosto: number; sinMatch: number }>(
    { loading: false, total: 0, netSales: 0, rows: [], sinCosto: 0, sinMatch: 0 }
  );

  const branchKey = selectedBranchId === 'all' ? branches[0]?.id || 'all' : selectedBranchId;

  // Límites de fecha del mes seleccionado (para que no se carguen fechas de otros meses)
  const monthStart = `${selectedMonth}-01`;
  const monthEnd = (() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    return `${selectedMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
  })();

  // Cargar datos desde Supabase
  useEffect(() => {
    if (!branchKey || branchKey === 'all') return;
    const load = async () => {
      setLoading(true);
      try {
        // Cargar resumen CMV
        const { data: summary } = await supabase
          .from('cmv_monthly')
          .select('*')
          .eq('branch_id', branchKey)
          .eq('month', selectedMonth)
          .maybeSingle();

        if (summary) {
          setInitialExistence(summary.initial_existence || 0);
          setFinalExistence(summary.final_existence || 0);
        } else {
          setInitialExistence(0);
          setFinalExistence(0);
        }

        // Cargar detalles
        const { data: details } = await supabase
          .from('cmv_details')
          .select('*')
          .eq('branch_id', branchKey)
          .eq('month', selectedMonth)
          .order('created_at');

        if (details) {
          setPurchases(details.filter(d => d.type === 'purchase').map(d => ({
            id: d.id,
            periodStart: d.period_start,
            periodEnd: d.period_end,
            documentNumber: d.document_number || '',
            details: d.details || '',
            amount: d.amount
          })));
          setMovements(details.filter(d => d.type === 'movement').map(d => ({
            id: d.id,
            periodStart: d.period_start,
            periodEnd: d.period_end,
            documentNumber: d.document_number || '',
            details: d.details || '',
            amount: d.amount
          })));
        } else {
          setPurchases([]);
          setMovements([]);
        }
      } catch (e) {
        console.error('Error cargando CMV:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [branchKey, selectedMonth]);

  // Carga consolidada: CMV por sucursal del mes actual y del mes anterior
  useEffect(() => {
    if (selectedBranchId !== 'all') return;
    const loadConsolidated = async () => {
      setLoadingConsolidated(true);
      try {
        const prevMonth = (() => {
          const [y, m] = selectedMonth.split('-').map(Number);
          const d = new Date(y, m - 1, 1); d.setMonth(d.getMonth() - 1);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        })();
        const realBranches = branches.filter(b => b.id !== 'all');
        const [summaries, details] = await Promise.all([
          supabase.from('cmv_monthly').select('*').in('month', [selectedMonth, prevMonth]),
          supabase.from('cmv_details').select('branch_id, month, type, amount').in('month', [selectedMonth, prevMonth])
        ]);
        const calcCmv = (bid: string, month: string) => {
          const sum = (summaries.data || []).find((s: any) => s.branch_id === bid && s.month === month);
          if (!sum && !(details.data || []).some((d: any) => d.branch_id === bid && d.month === month)) return null;
          const ini = Number(sum?.initial_existence) || 0;
          const fin = Number(sum?.final_existence) || 0;
          const purch = (details.data || []).filter((d: any) => d.branch_id === bid && d.month === month && d.type === 'purchase').reduce((a: number, d: any) => a + (Number(d.amount) || 0), 0);
          const mov = (details.data || []).filter((d: any) => d.branch_id === bid && d.month === month && d.type === 'movement').reduce((a: number, d: any) => a + (Number(d.amount) || 0), 0);
          return ini + purch + mov - fin;
        };
        setConsolidated(realBranches.map(b => ({
          branchId: b.id,
          branchName: b.name,
          current: calcCmv(b.id, selectedMonth),
          prev: calcCmv(b.id, prevMonth)
        })));
      } catch (e) {
        console.error('Error cargando consolidado CMV:', e);
      } finally {
        setLoadingConsolidated(false);
      }
    };
    loadConsolidated();
  }, [selectedBranchId, selectedMonth, branches]);

  const handleAdjustMonth = (offset: number) => {
    const [yearStr, monthStr] = selectedMonth.split('-');
    const date = new Date(parseInt(yearStr), parseInt(monthStr) - 1 + offset, 1);
    setSelectedMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  };
  
  const [newPurchase, setNewPurchase] = useState<Partial<ConsumptionDetail>>({
    periodStart: new Date().toISOString().split('T')[0],
    periodEnd: new Date().toISOString().split('T')[0],
    documentNumber: '',
    details: '',
    amount: 0
  });

  const [newMovement, setNewMovement] = useState<Partial<ConsumptionDetail>>({
    periodStart: new Date().toISOString().split('T')[0],
    periodEnd: new Date().toISOString().split('T')[0],
    documentNumber: '',
    details: 'Resumen EG Internos',
    amount: 0
  });

  const totalPurchases = useMemo(() => 
    purchases.reduce((acc, curr) => acc + curr.amount, 0), 
  [purchases]);

  const totalMovements = useMemo(() => 
    movements.reduce((acc, curr) => acc + curr.amount, 0), 
  [movements]);

  const totalCMV = initialExistence + totalPurchases + totalMovements - finalExistence;

  // ── CMV TEÓRICO ─────────────────────────────────────────────────────────────
  // = Σ (cantidad vendida del ranking × costo de la receta del plato).
  // Se resuelve el producto por CÓDIGO (dato confiable del POS) y, si no, por nombre/alias.
  // El costo del plato es products.cost (la receta costeada; se mantiene con "Recalcular costos").
  useEffect(() => {
    if (activeTab !== 'teorico' || !branchKey || branchKey === 'all') return;
    let active = true;
    (async () => {
      setTeorico(t => ({ ...t, loading: true }));
      try {
        const [ty, tm] = selectedMonth.split('-').map(Number);
        const lastDay = new Date(ty, tm, 0).getDate();
        const [{ data: rank }, { data: prods }, { data: aliasData }, { data: salesData }] = await Promise.all([
          supabase.from('product_rankings').select('product_code, product_name, quantity').eq('branch_id', branchKey).eq('month', selectedMonth),
          supabase.from('products').select('id, name, code, cost'),
          supabase.from('product_ranking_aliases').select('alias_name, product_id, ignore'),
          supabase.from('sales').select('net_sales').eq('branch_id', branchKey).gte('date', `${selectedMonth}-01`).lte('date', `${selectedMonth}-${String(lastDay).padStart(2, '0')}`),
        ]);
        const norm = (s: any) => String(s || '').trim().toUpperCase().replace(/\s+/g, ' ');
        const normCode = (c: any) => String(c ?? '').trim();
        const byCode: Record<string, any> = {}, byName: Record<string, any> = {}, byId: Record<string, any> = {};
        (prods || []).forEach((p: any) => { if (normCode(p.code) !== '') byCode[normCode(p.code)] = p; if (p.name) byName[norm(p.name)] = p; byId[p.id] = p; });
        const aliasToId: Record<string, string> = {}; const ignore = new Set<string>();
        (aliasData || []).forEach((a: any) => { if (!a.alias_name) return; if (a.ignore) { ignore.add(norm(a.alias_name)); return; } if (a.product_id) aliasToId[norm(a.alias_name)] = a.product_id; });
        // Agrupar el ranking por producto (mismo plato puede venir en varias líneas/semanas).
        const agg: Record<string, { code: string; name: string; qty: number }> = {};
        (rank || []).forEach((r: any) => {
          const k = normCode(r.product_code) + '|' + norm(r.product_name);
          if (!agg[k]) agg[k] = { code: normCode(r.product_code), name: r.product_name, qty: 0 };
          agg[k].qty += Number(r.quantity) || 0;
        });
        const rows: any[] = []; let total = 0, sinCosto = 0, sinMatch = 0;
        Object.values(agg).forEach((a) => {
          const p = (a.code !== '' && byCode[a.code]) || (aliasToId[norm(a.name)] && byId[aliasToId[norm(a.name)]]) || byName[norm(a.name)];
          if (!p) {
            if (!ignore.has(norm(a.name))) { sinMatch++; rows.push({ name: a.name, code: a.code, qty: a.qty, cost: null, subtotal: 0, flag: 'sinmatch' }); }
            return;
          }
          const cost = Number(p.cost) || 0; const subtotal = a.qty * cost; total += subtotal;
          if (cost <= 0) sinCosto++;
          rows.push({ name: p.name || a.name, code: p.code || a.code, qty: a.qty, cost, subtotal, flag: cost > 0 ? 'ok' : 'sincosto' });
        });
        rows.sort((x, y) => y.subtotal - x.subtotal);
        const netSales = (salesData || []).reduce((s: number, x: any) => s + (Number(x.net_sales) || 0), 0);
        if (active) setTeorico({ loading: false, total, netSales, rows, sinCosto, sinMatch });
      } catch (e) {
        console.error('Error calculando CMV teórico:', e);
        if (active) setTeorico(t => ({ ...t, loading: false }));
      }
    })();
    return () => { active = false; };
  }, [activeTab, branchKey, selectedMonth]);

  const addPurchase = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!newPurchase.amount || !newPurchase.periodStart || !newPurchase.periodEnd) return;
    if (newPurchase.periodStart < monthStart || newPurchase.periodStart > monthEnd || newPurchase.periodEnd < monthStart || newPurchase.periodEnd > monthEnd) {
      alert(`Las fechas deben estar dentro del mes seleccionado (${selectedMonth}).`);
      return;
    }
    const { data, error } = await supabase.from('cmv_details').insert([{
      branch_id: branchKey,
      month: selectedMonth,
      type: 'purchase',
      period_start: newPurchase.periodStart,
      period_end: newPurchase.periodEnd,
      document_number: newPurchase.documentNumber || 'RESUMEN',
      details: newPurchase.details || 'Carga por Período',
      amount: newPurchase.amount
    }]).select().single();
    if (!error && data) {
      setPurchases([...purchases, {
        id: data.id,
        periodStart: data.period_start,
        periodEnd: data.period_end,
        documentNumber: data.document_number,
        details: data.details,
        amount: data.amount
      }]);
    }
    setNewPurchase({ ...newPurchase, documentNumber: '', amount: 0, details: '' });
  };

  const addMovement = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!newMovement.amount || !newMovement.periodStart || !newMovement.periodEnd) return;
    if (newMovement.periodStart < monthStart || newMovement.periodStart > monthEnd || newMovement.periodEnd < monthStart || newMovement.periodEnd > monthEnd) {
      alert(`Las fechas deben estar dentro del mes seleccionado (${selectedMonth}).`);
      return;
    }
    const { data, error } = await supabase.from('cmv_details').insert([{
      branch_id: branchKey,
      month: selectedMonth,
      type: 'movement',
      period_start: newMovement.periodStart,
      period_end: newMovement.periodEnd,
      document_number: newMovement.documentNumber || 'RESUMEN EG',
      details: newMovement.details || 'Movimientos del Período',
      amount: newMovement.amount
    }]).select().single();
    if (!error && data) {
      setMovements([...movements, {
        id: data.id,
        periodStart: data.period_start,
        periodEnd: data.period_end,
        documentNumber: data.document_number,
        details: data.details,
        amount: data.amount
      }]);
    }
    setNewMovement({ ...newMovement, documentNumber: '', amount: 0 });
  };

  const removePurchase = async (id: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    await supabase.from('cmv_details').delete().eq('id', id);
    setPurchases(purchases.filter(x => x.id !== id));
  };

  const removeMovement = async (id: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    await supabase.from('cmv_details').delete().eq('id', id);
    setMovements(movements.filter(x => x.id !== id));
  };

  const handleSaveCMV = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setSaving(true);
    try {
      // Calcular ventas netas del mes desde la tabla sales
      const [csy, csm] = selectedMonth.split('-').map(Number);
      const csLastDay = new Date(csy, csm, 0).getDate();
      const { data: salesData } = await supabase
        .from('sales')
        .select('net_sales')
        .eq('branch_id', branchKey)
        .gte('date', `${selectedMonth}-01`)
        .lte('date', `${selectedMonth}-${String(csLastDay).padStart(2, '0')}`);
      
      const netSales = salesData?.reduce((sum, s) => sum + (Number(s.net_sales) || 0), 0) || 0;
      const cmvPct = netSales > 0 ? (totalCMV / netSales) * 100 : 0;

      await supabase.from('cmv_monthly').upsert([{
        branch_id: branchKey,
        month: selectedMonth,
        initial_existence: initialExistence,
        final_existence: finalExistence,
        total_purchases: totalPurchases,
        total_movements: totalMovements,
        net_sales: netSales,
        cmv_amount: totalCMV,
        cmv_percentage: Math.round(cmvPct * 10) / 10
      }], { onConflict: 'branch_id,month' });

      alert(`¡CMV de ${activeBranch?.name || ''} para ${selectedMonth} guardado correctamente!`);
    } catch (e: any) {
      alert(`Error al guardar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center gap-4 bg-bg-sidebar p-6 rounded border border-border-dim">
        <div className="bg-brand-500/10 p-3 text-brand-500 border border-brand-500/20 rounded shadow-inner">
          <Calculator size={24} />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-bold text-text-main uppercase tracking-tight">CMV Mensual Sucursal {activeBranch ? `• ${activeBranch.name}` : '(CONSOLIDADO)'}</h2>
          <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">Costo de Mercadería Vendida - Mensual & Cargas Parciales</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 bg-brand-500/10 text-brand-500 border border-brand-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-500/20 transition-all font-bold" onClick={() => window.print()}>
            <FileText size={14} /> PDF
          </button>
        </div>
      </div>
      
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-bg-sidebar/50 p-4 rounded border border-border-dim/60">
        {onBranchChange && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[9px] font-black uppercase text-text-dim tracking-widest mr-2">Sucursal:</span>
            <button onClick={() => onBranchChange('all')}
              className={cn("px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all",
                selectedBranchId === 'all' ? "bg-brand-500 text-black border-brand-500" : "bg-bg-accent text-text-dim border-border-dim hover:text-text-main"
              )}>Consolidado (Todas)</button>
            {branches.map(b => (
              <button key={b.id} onClick={() => onBranchChange(b.id)}
                className={cn("px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all",
                  selectedBranchId === b.id ? "bg-brand-500 text-black border-brand-500" : "bg-bg-accent text-text-dim border-border-dim hover:text-text-main"
                )}>{b.name}</button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 bg-bg-accent border border-border-dim rounded-md overflow-hidden p-1">
          <button type="button" onClick={() => handleAdjustMonth(-1)} className="p-1 text-text-dim hover:text-text-main rounded"><ChevronLeft size={13} /></button>
          <span className="px-2 text-[10px] font-black text-text-main uppercase font-mono tracking-wider">
            {(() => { const [y,m] = selectedMonth.split('-'); const names=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']; return `${names[parseInt(m)-1]} ${y}`; })()}
          </span>
          <button type="button" onClick={() => handleAdjustMonth(1)} className="p-1 text-text-dim hover:text-text-main rounded"><ChevronRight size={13} /></button>
        </div>
      </div>

      {/* Pestañas: CMV Real (carga) vs CMV Teórico (ranking × receta) */}
      <div className="flex gap-1 p-1 bg-bg-sidebar border border-border-dim rounded-lg w-fit shadow-sm">
        {([['real', 'CMV Real'], ['teorico', 'CMV Teórico']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setActiveTab(k)}
            className={cn("px-5 py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all",
              activeTab === k ? "bg-brand-500 text-black shadow" : "text-text-dim hover:text-text-main")}>{l}</button>
        ))}
      </div>

      {activeTab === 'real' && (loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-brand-500" size={32} />
        </div>
      ) : selectedBranchId === 'all' ? (
        /* Vista CONSOLIDADA: tabla comparativa por sucursal (mes anterior vs actual) */
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm overflow-hidden">
          <h3 className="text-xs font-black uppercase text-brand-500 tracking-wider mb-1">CMV Consolidado por Sucursal</h3>
          <p className="text-[9px] text-text-dim font-bold uppercase mb-4">Comparativa mes anterior vs mes actual · {selectedMonth}</p>
          {loadingConsolidated ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="animate-spin text-brand-500" size={24} /></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-black uppercase tracking-wider text-text-dim border-b border-border-dim">
                    <th className="px-3 py-2">Sucursal</th>
                    <th className="px-3 py-2 text-right">CMV Mes Anterior</th>
                    <th className="px-3 py-2 text-right">CMV Mes Actual</th>
                    <th className="px-3 py-2 text-right">Variación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim">
                  {consolidated.map(c => {
                    const variation = (c.prev && c.prev !== 0 && c.current !== null) ? ((c.current - c.prev) / c.prev) * 100 : null;
                    return (
                      <tr key={c.branchId} className="text-[11px] font-medium hover:bg-bg-accent/30">
                        <td className="px-3 py-2.5 font-black uppercase text-text-main">{c.branchName}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-text-dim">{c.prev !== null ? '$' + Math.round(c.prev).toLocaleString('es-AR') : '— sin carga'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-text-main">{c.current !== null ? '$' + Math.round(c.current).toLocaleString('es-AR') : '— sin carga'}</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold">
                          {variation !== null
                            ? <span className={variation <= 0 ? 'text-emerald-500' : 'text-red-500'}>{variation > 0 ? '+' : ''}{variation.toFixed(1)}%</span>
                            : <span className="text-text-dim">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  {(() => {
                    const totalPrev = consolidated.reduce((s, c) => s + (c.prev || 0), 0);
                    const totalCurrent = consolidated.reduce((s, c) => s + (c.current || 0), 0);
                    const totalVar = (totalPrev !== 0) ? ((totalCurrent - totalPrev) / totalPrev) * 100 : null;
                    return (
                      <tr className="text-[11px] font-black border-t-2 border-border-dim">
                        <td className="px-3 py-2.5 uppercase text-brand-500">Total consolidado</td>
                        <td className="px-3 py-2.5 text-right font-mono text-text-main">{'$' + Math.round(totalPrev).toLocaleString('es-AR')}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-text-main">{'$' + Math.round(totalCurrent).toLocaleString('es-AR')}</td>
                        <td className="px-3 py-2.5 text-right font-mono">
                          {totalVar !== null
                            ? <span className={totalVar <= 0 ? 'text-emerald-500' : 'text-red-500'}>{totalVar > 0 ? '+' : ''}{totalVar.toFixed(1)}%</span>
                            : <span className="text-text-dim">—</span>}
                        </td>
                      </tr>
                    );
                  })()}
                </tfoot>
              </table>
            </div>
          )}
          <p className="text-[8px] text-text-dim font-bold uppercase mt-3 opacity-70">Para cargar compras y movimientos, elegí una sucursal específica arriba.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="EI (CARGA MENSUAL)" value={initialExistence} onChange={(v) => setInitialExistence(parseFloat(v) || 0)} color="text-text-main" sublabel="Existencia al inicio del mes" />
            <StatCard label="Total Compras" value={totalPurchases} readOnly color="text-emerald-500" sublabel="Suma de facturas cargadas" />
            <StatCard label="Movimientos EG" value={totalMovements} readOnly color="text-brand-500" sublabel="Transferencias internas" />
            <StatCard label="EF (CARGA MENSUAL)" value={finalExistence} onChange={(v) => setFinalExistence(parseFloat(v) || 0)} color="text-text-main" sublabel="Existencia al cierre del mes" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* COMPRAS */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border-dim pb-2">
                <h3 className="text-xs font-black uppercase text-text-dim flex items-center gap-2"><Receipt size={14} className="text-emerald-500" /> Compras / Facturas</h3>
                <span className="text-[10px] font-mono font-bold text-emerald-500">${totalPurchases.toLocaleString()}</span>
              </div>
              <div className="bg-bg-sidebar border border-border-dim rounded p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><label className="text-[8px] font-bold text-text-dim uppercase">Desde</label><input type="date" value={newPurchase.periodStart} min={monthStart} max={monthEnd} onChange={(e) => setNewPurchase({...newPurchase, periodStart: e.target.value})} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 font-mono" /></div>
                  <div className="space-y-1"><label className="text-[8px] font-bold text-text-dim uppercase">Hasta</label><input type="date" value={newPurchase.periodEnd} min={monthStart} max={monthEnd} onChange={(e) => setNewPurchase({...newPurchase, periodEnd: e.target.value})} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 font-mono" /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2"><input placeholder="Detalle (Opcional)" value={newPurchase.details} onChange={(e) => setNewPurchase({...newPurchase, details: e.target.value})} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 uppercase font-bold" /></div>
                  <input type="number" placeholder="Importe" value={newPurchase.amount || ''} onChange={(e) => setNewPurchase({...newPurchase, amount: parseFloat(e.target.value) || 0})} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 font-mono text-right" />
                </div>
                <button onClick={addPurchase} className="w-full bg-brand-500 text-black py-2 rounded text-[9px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center justify-center gap-2"><Plus size={14} /> CARGAR IMPORTE</button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                <AnimatePresence>{purchases.map(p => (<ListItem key={p.id} item={p} onRemove={() => removePurchase(p.id)} />))}</AnimatePresence>
              </div>
            </div>

            {/* MOVIMIENTOS */}
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border-dim pb-2">
                <h3 className="text-xs font-black uppercase text-text-dim flex items-center gap-2"><Truck size={14} className="text-brand-500" /> Mov. Internos / Central</h3>
                <span className="text-[10px] font-mono font-bold text-brand-500">${totalMovements.toLocaleString()}</span>
              </div>
              <div className="bg-bg-sidebar border border-border-dim rounded p-4 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1"><label className="text-[8px] font-bold text-text-dim uppercase">Desde</label><input type="date" value={newMovement.periodStart} min={monthStart} max={monthEnd} onChange={(e) => setNewMovement({...newMovement, periodStart: e.target.value})} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 font-mono" /></div>
                  <div className="space-y-1"><label className="text-[8px] font-bold text-text-dim uppercase">Hasta</label><input type="date" value={newMovement.periodEnd} min={monthStart} max={monthEnd} onChange={(e) => setNewMovement({...newMovement, periodEnd: e.target.value})} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 font-mono" /></div>
                </div>
                <input type="number" placeholder="Importe Total EG" value={newMovement.amount || ''} onChange={(e) => setNewMovement({...newMovement, amount: parseFloat(e.target.value) || 0})} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 font-mono text-right" />
                <button onClick={addMovement} className="w-full bg-brand-500 text-black py-2 rounded text-[9px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center justify-center gap-2"><Plus size={14} /> CARGAR TOTAL EG</button>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                <AnimatePresence>{movements.map(m => (<ListItem key={m.id} item={m} onRemove={() => removeMovement(m.id)} />))}</AnimatePresence>
              </div>
            </div>
          </div>

          <div className="bg-bg-sidebar border border-brand-500/20 p-8 rounded-lg shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-8 opacity-5"><TrendingDown size={120} /></div>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8 relative z-10">
              <div className="space-y-4">
                <div>
                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-500 mb-1">Resultado Mensual CMV</h4>
                  <p className="text-4xl font-mono font-black text-text-main">${totalCMV.toLocaleString()}</p>
                </div>
                <p className="text-[10px] font-mono text-text-main italic opacity-60">EI + Compras + EG - EF</p>
              </div>
              <button onClick={handleSaveCMV} disabled={saving} className="bg-brand-500 text-black px-12 py-4 rounded text-[12px] font-black uppercase tracking-[0.2em] hover:bg-brand-600 transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-50">
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} CERRAR MES & GUARDAR
              </button>
            </div>
          </div>
        </>
      ))}

      {activeTab === 'teorico' && (
        selectedBranchId === 'all' ? (
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-8 text-center">
            <p className="text-[11px] font-black uppercase text-text-dim tracking-wider">Elegí una sucursal para ver su CMV Teórico</p>
            <p className="text-[9px] text-text-dim/70 font-bold uppercase mt-1">Se calcula con el ranking de ventas y las recetas costeadas de esa sucursal</p>
          </div>
        ) : teorico.loading ? (
          <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-brand-500" size={32} /></div>
        ) : (() => {
          const diff = totalCMV - teorico.total; // Real − Teórico = desvío valorizado (fuga si > 0)
          const foodCostTeo = teorico.netSales > 0 ? (teorico.total / teorico.netSales) * 100 : null;
          const foodCostReal = teorico.netSales > 0 ? (totalCMV / teorico.netSales) * 100 : null;
          const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');
          return (
            <div className="space-y-6">
              {/* Comparación teórico vs real */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-bg-sidebar border border-border-dim p-5 rounded-lg">
                  <div className="text-[9px] font-black uppercase text-text-dim tracking-widest">CMV Teórico</div>
                  <div className="text-[8px] text-text-dim/60 font-bold uppercase">Σ ventas × receta costeada</div>
                  <div className="text-3xl font-mono font-black text-text-main mt-2">{fmt(teorico.total)}</div>
                  {foodCostTeo !== null && <div className="text-[10px] font-mono text-text-dim mt-1">Food cost teórico: <b className="text-text-main">{foodCostTeo.toFixed(1)}%</b></div>}
                </div>
                <div className="bg-bg-sidebar border border-border-dim p-5 rounded-lg">
                  <div className="text-[9px] font-black uppercase text-text-dim tracking-widest">CMV Real</div>
                  <div className="text-[8px] text-text-dim/60 font-bold uppercase">EI + compras + EG − EF</div>
                  <div className="text-3xl font-mono font-black text-text-main mt-2">{fmt(totalCMV)}</div>
                  {foodCostReal !== null && <div className="text-[10px] font-mono text-text-dim mt-1">Food cost real: <b className="text-text-main">{foodCostReal.toFixed(1)}%</b></div>}
                </div>
                <div className={cn("p-5 rounded-lg border", diff > 0 ? "bg-red-500/10 border-red-500/30" : "bg-emerald-500/10 border-emerald-500/30")}>
                  <div className="text-[9px] font-black uppercase text-text-dim tracking-widest">Diferencia (Real − Teórico)</div>
                  <div className="text-[8px] text-text-dim/60 font-bold uppercase">{diff > 0 ? 'Fuga: se consumió más de lo vendido' : 'Real por debajo del teórico'}</div>
                  <div className={cn("text-3xl font-mono font-black mt-2", diff > 0 ? "text-red-500" : "text-emerald-500")}>{diff > 0 ? '+' : ''}{fmt(diff)}</div>
                  {teorico.total > 0 && <div className="text-[10px] font-mono text-text-dim mt-1">{((diff / teorico.total) * 100).toFixed(1)}% del CMV teórico</div>}
                </div>
              </div>

              {/* Avisos de completitud */}
              {(teorico.sinCosto > 0 || teorico.sinMatch > 0) && (
                <div className="flex flex-wrap gap-3">
                  {teorico.sinMatch > 0 && (
                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5">
                      <span className="text-[11px] font-bold text-red-500">{teorico.sinMatch} producto(s) vendido(s) sin receta/producto vinculado — no suman al CMV teórico.</span>
                    </div>
                  )}
                  {teorico.sinCosto > 0 && (
                    <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-4 py-2.5">
                      <span className="text-[11px] font-bold text-amber-600">{teorico.sinCosto} producto(s) con costo 0 — falta costear su receta (Recalcular costos).</span>
                    </div>
                  )}
                </div>
              )}

              {/* Detalle por producto */}
              <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-border-dim/60 flex items-center justify-between">
                  <h3 className="text-xs font-black uppercase text-brand-500 tracking-wider">Detalle · producto × receta</h3>
                  <span className="text-[9px] font-mono text-text-dim">{teorico.rows.length} producto(s) · {selectedMonth}</span>
                </div>
                <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                  <table className="w-full text-left">
                    <thead className="sticky top-0 bg-bg-sidebar">
                      <tr className="text-[9px] font-black uppercase tracking-wider text-text-dim border-b border-border-dim">
                        <th className="px-4 py-2.5">Producto</th>
                        <th className="px-3 py-2.5">Código</th>
                        <th className="px-3 py-2.5 text-right">Cant. vendida</th>
                        <th className="px-3 py-2.5 text-right">Costo receta</th>
                        <th className="px-4 py-2.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dim/60">
                      {teorico.rows.map((r, i) => (
                        <tr key={i} className="text-[11px] hover:bg-bg-accent/30">
                          <td className="px-4 py-2.5 font-bold text-text-main">{r.name}</td>
                          <td className="px-3 py-2.5 font-mono text-text-dim">{r.code || '—'}</td>
                          <td className="px-3 py-2.5 text-right font-mono text-text-main tabular-nums">{r.qty.toLocaleString('es-AR')}</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                            {r.flag === 'sinmatch'
                              ? <span className="text-red-500 font-bold">sin producto</span>
                              : r.flag === 'sincosto'
                                ? <span className="text-amber-600 font-bold">costo 0</span>
                                : <span className="text-text-dim">{fmt(r.cost)}</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-bold text-emerald-500 tabular-nums">{fmt(r.subtotal)}</td>
                        </tr>
                      ))}
                      {teorico.rows.length === 0 && (
                        <tr><td colSpan={5} className="px-4 py-10 text-center text-[10px] font-bold uppercase text-text-dim">No hay ranking de ventas cargado para este mes.</td></tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="text-[12px] font-black border-t-2 border-border-dim bg-bg-accent/30">
                        <td className="px-4 py-3 uppercase text-brand-500" colSpan={4}>CMV Teórico total</td>
                        <td className="px-4 py-3 text-right font-mono text-text-main">{fmt(teorico.total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              <p className="text-[9px] text-text-dim/70 font-bold uppercase">El costo de cada receta se mantiene con "Recalcular costos". El CMV real depende de tener cargadas EI/EF y compras del mes.</p>
            </div>
          );
        })()
      )}
    </motion.div>
  );
}

function StatCard({ label, value, readOnly, onChange, color, sublabel }: { label: string, value: number, readOnly?: boolean, onChange?: (v: string) => void, color: string, sublabel?: string }) {
  return (
    <div className="bg-bg-sidebar border border-border-dim p-5 rounded space-y-3">
      <div className="flex flex-col">
        <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block">{label}</label>
        {sublabel && <span className="text-[8px] text-text-dim opacity-50 font-bold uppercase">{sublabel}</span>}
      </div>
      {readOnly ? (
        <div className={cn("text-xl font-mono font-bold", color)}>${value.toLocaleString()}</div>
      ) : (
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-text-dim">$</span>
          <input type="number" value={value || ''} onChange={(e) => onChange?.(e.target.value)} placeholder="0.00" className={cn("w-full bg-bg-accent border border-border-dim rounded pl-8 pr-4 py-2 text-sm font-mono font-bold outline-none transition-all focus:border-brand-500", color)} />
        </div>
      )}
    </div>
  );
}

const ListItem: FC<{ item: ConsumptionDetail, onRemove: () => void | Promise<void> }> = ({ item, onRemove }) => {
  return (
    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}
      className="bg-bg-accent/40 border border-border-dim/30 p-3 rounded flex items-center justify-between group hover:border-brand-500/30 transition-all">
      <div className="flex flex-col">
        <span className="text-[9px] font-mono text-brand-500 font-bold uppercase">{item.periodStart} - {item.periodEnd}</span>
        <p className="text-[10px] font-bold text-text-main uppercase">{item.details}</p>
      </div>
      <div className="flex items-center gap-4">
        <span className="font-mono font-bold text-[11px] text-text-main">${item.amount.toLocaleString()}</span>
        <button onClick={onRemove} className="text-text-dim/20 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={12} /></button>
      </div>
    </motion.div>
  );
};
