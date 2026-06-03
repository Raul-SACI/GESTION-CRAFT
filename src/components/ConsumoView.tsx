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

      {loading ? (
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
