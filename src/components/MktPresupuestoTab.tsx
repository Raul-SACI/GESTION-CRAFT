/**
 * SPDX-License-Identifier: Apache-2.0
 * Informe de Presupuesto e Inversión (Marketing · Informes), mensual.
 * 1) Inversión del mes por rubro (Honorarios, Publicidad, Imprenta, …) con detalle e importe.
 * 2) Gastos reales (pedidos) con estado, pagado y factura adjunta (bucket "documents").
 * Tablas: mkt_inversion_plan y mkt_gastos_reales (RLS desactivado).
 */
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Wallet, Upload, Download, Loader2, FileText } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';

interface PlanRow { id: string; anio: number; mes: number; rubro: string; detalle: string; importe: number; }
interface GastoRow { id: string; anio: number; mes: number; pedido: string; detalle: string; estado: string; pagado: boolean; factura_path: string | null; factura_name: string | null; }
const ESTADOS = ['Pendiente', 'En Diseño', 'En imprenta', 'Entregado'];
const newId = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const fmt = (n: number) => `$${(Number(n) || 0).toLocaleString('es-AR')}`;

export default function MktPresupuestoTab({ month, isReadOnly = false }: { month: string; isReadOnly?: boolean }) {
  const [anio, mes] = month.split('-').map(Number);
  const [plan, setPlan] = useState<PlanRow[]>([]);
  const [gastos, setGastos] = useState<GastoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const inp = 'w-full bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[11px] text-text-main outline-none focus:border-brand-500';

  const cargar = async () => {
    setLoading(true);
    try {
      const [p, g] = await Promise.all([
        supabase.from('mkt_inversion_plan').select('*').eq('anio', anio).eq('mes', mes).order('created_at', { ascending: true }),
        supabase.from('mkt_gastos_reales').select('*').eq('anio', anio).eq('mes', mes).order('created_at', { ascending: true }),
      ]);
      setPlan(((p.data as PlanRow[]) || []).map(r => ({ ...r, importe: Number(r.importe) || 0 })));
      setGastos(((g.data as GastoRow[]) || []).map(r => ({ ...r, pagado: !!r.pagado })));
    } catch (e) { console.warn('Presupuesto load error', e); }
    finally { setLoading(false); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [anio, mes]);

  const totalPlan = plan.reduce((s, r) => s + (Number(r.importe) || 0), 0);
  const totalGastos = gastos.reduce((s, r) => s + 0, 0); // gastos no tienen importe propio en la planilla
  void totalGastos;

  // ── Inversión (plan) ──
  const addPlan = () => setPlan(prev => [...prev, { id: newId(), anio, mes, rubro: '', detalle: '', importe: 0 }]);
  const savePlan = async (r: PlanRow) => {
    if (isReadOnly) return;
    try { await supabase.from('mkt_inversion_plan').upsert({ id: r.id, anio, mes, rubro: r.rubro.trim() || null, detalle: r.detalle.trim() || null, importe: Number(r.importe) || 0 }, { onConflict: 'id' }); }
    catch (e: any) { alert('No se pudo guardar el rubro: ' + (e.message || e)); }
  };
  const delPlan = async (r: PlanRow) => { if (isReadOnly) return; if (!confirm('¿Eliminar este rubro?')) return; await supabase.from('mkt_inversion_plan').delete().eq('id', r.id); setPlan(prev => prev.filter(x => x.id !== r.id)); };

  // ── Gastos reales ──
  const addGasto = () => setGastos(prev => [...prev, { id: newId(), anio, mes, pedido: '', detalle: '', estado: 'Pendiente', pagado: false, factura_path: null, factura_name: null }]);
  const saveGasto = async (r: GastoRow) => {
    if (isReadOnly) return;
    try { await supabase.from('mkt_gastos_reales').upsert({ id: r.id, anio, mes, pedido: r.pedido.trim() || null, detalle: r.detalle.trim() || null, estado: r.estado, pagado: r.pagado, factura_path: r.factura_path, factura_name: r.factura_name }, { onConflict: 'id' }); }
    catch (e: any) { alert('No se pudo guardar el gasto: ' + (e.message || e)); }
  };
  const delGasto = async (r: GastoRow) => {
    if (isReadOnly) return; if (!confirm('¿Eliminar este pedido/gasto?')) return;
    if (r.factura_path) { try { await supabase.storage.from('documents').remove([r.factura_path]); } catch { /* ignore */ } }
    await supabase.from('mkt_gastos_reales').delete().eq('id', r.id); setGastos(prev => prev.filter(x => x.id !== r.id));
  };
  const subirFactura = async (r: GastoRow, file?: File) => {
    if (!file || isReadOnly) return;
    if (file.size > 25 * 1024 * 1024) { alert('El archivo supera los 25 MB.'); return; }
    setUploadingId(r.id);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `mkt-facturas/${r.id}/${Date.now()}_${safe}`;
      const { error } = await supabase.storage.from('documents').upload(path, file);
      if (error) throw error;
      if (r.factura_path) { try { await supabase.storage.from('documents').remove([r.factura_path]); } catch { /* ignore */ } }
      const upd = { ...r, factura_path: path, factura_name: file.name };
      setGastos(prev => prev.map(x => x.id === r.id ? upd : x));
      await saveGasto(upd);
    } catch (e: any) { alert('No se pudo subir la factura: ' + (e.message || e)); }
    finally { setUploadingId(null); }
  };
  const verFactura = async (r: GastoRow) => {
    if (!r.factura_path) return;
    try { const { data } = await supabase.storage.from('documents').createSignedUrl(r.factura_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, '_blank'); }
    catch (e: any) { alert('No se pudo abrir: ' + (e.message || e)); }
  };

  return (
    <div className="space-y-6">
      {/* INVERSIÓN DEL MES */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2 border-b border-border-dim/50">
          <h3 className="text-[12px] font-black uppercase tracking-wider text-text-main flex items-center gap-2"><Wallet size={15} className="text-brand-500" /> Inversión del mes · presupuesto</h3>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-black text-text-main">Total presupuesto: <span className="text-brand-500 font-mono">{fmt(totalPlan)}</span></span>
            {!isReadOnly && <button onClick={addPlan} className="flex items-center gap-1.5 bg-brand-500/10 text-brand-500 border border-brand-500/25 rounded px-3 py-1.5 text-[9px] font-black uppercase tracking-widest hover:bg-brand-500/20"><Plus size={12} /> Rubro</button>}
            {loading && <Loader2 size={14} className="animate-spin text-brand-500" />}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse min-w-[640px]">
            <thead><tr className="bg-bg-accent/20 text-text-dim">
              <th className="p-2.5 text-left text-[9px] font-black uppercase tracking-widest w-48">Rubro</th>
              <th className="p-2.5 text-left text-[9px] font-black uppercase tracking-widest">Detalle</th>
              <th className="p-2.5 text-right text-[9px] font-black uppercase tracking-widest w-40">Importe</th>
              <th className="w-10" />
            </tr></thead>
            <tbody>
              {plan.length === 0 ? (
                <tr><td colSpan={4} className="p-6 text-center text-text-dim text-[11px] italic">Sin rubros. {!isReadOnly && 'Agregá uno con "Rubro".'}</td></tr>
              ) : plan.map(r => (
                <tr key={r.id} className="border-t border-border-dim/25">
                  <td className="p-2"><input disabled={isReadOnly} className={inp} placeholder="Honorarios…" value={r.rubro} onChange={e => setPlan(p => p.map(x => x.id === r.id ? { ...x, rubro: e.target.value } : x))} onBlur={() => savePlan(r)} /></td>
                  <td className="p-2"><input disabled={isReadOnly} className={inp} placeholder="Detalle" value={r.detalle} onChange={e => setPlan(p => p.map(x => x.id === r.id ? { ...x, detalle: e.target.value } : x))} onBlur={() => savePlan(r)} /></td>
                  <td className="p-2"><input type="number" disabled={isReadOnly} className={cn(inp, 'text-right font-mono')} value={r.importe || ''} onChange={e => setPlan(p => p.map(x => x.id === r.id ? { ...x, importe: parseFloat(e.target.value) || 0 } : x))} onBlur={() => savePlan(r)} /></td>
                  <td className="p-2 text-center">{!isReadOnly && <button onClick={() => delPlan(r)} className="text-text-dim hover:text-red-500"><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* GASTOS REALES */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2 border-b border-border-dim/50">
          <h3 className="text-[12px] font-black uppercase tracking-wider text-text-main flex items-center gap-2"><FileText size={15} className="text-brand-500" /> Gastos reales · pedidos</h3>
          {!isReadOnly && <button onClick={addGasto} className="flex items-center gap-1.5 bg-brand-500/10 text-brand-500 border border-brand-500/25 rounded px-3 py-1.5 text-[9px] font-black uppercase tracking-widest hover:bg-brand-500/20"><Plus size={12} /> Pedido</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse min-w-[900px]">
            <thead><tr className="bg-bg-accent/20 text-text-dim">
              <th className="p-2.5 text-left text-[9px] font-black uppercase tracking-widest w-48">Pedido</th>
              <th className="p-2.5 text-left text-[9px] font-black uppercase tracking-widest">Detalle</th>
              <th className="p-2.5 text-center text-[9px] font-black uppercase tracking-widest w-40">Estado</th>
              <th className="p-2.5 text-center text-[9px] font-black uppercase tracking-widest w-24">Pagado</th>
              <th className="p-2.5 text-center text-[9px] font-black uppercase tracking-widest w-48">Factura</th>
              <th className="w-10" />
            </tr></thead>
            <tbody>
              {gastos.length === 0 ? (
                <tr><td colSpan={6} className="p-6 text-center text-text-dim text-[11px] italic">Sin pedidos. {!isReadOnly && 'Agregá uno con "Pedido".'}</td></tr>
              ) : gastos.map(r => (
                <tr key={r.id} className="border-t border-border-dim/25">
                  <td className="p-2"><input disabled={isReadOnly} className={inp} placeholder="Flyers Club CRAFT…" value={r.pedido} onChange={e => setGastos(g => g.map(x => x.id === r.id ? { ...x, pedido: e.target.value } : x))} onBlur={() => saveGasto(r)} /></td>
                  <td className="p-2"><input disabled={isReadOnly} className={inp} placeholder="2000 flyers a6…" value={r.detalle} onChange={e => setGastos(g => g.map(x => x.id === r.id ? { ...x, detalle: e.target.value } : x))} onBlur={() => saveGasto(r)} /></td>
                  <td className="p-2"><select disabled={isReadOnly} className={inp} value={r.estado} onChange={e => { const v = e.target.value; setGastos(g => g.map(x => x.id === r.id ? { ...x, estado: v } : x)); saveGasto({ ...r, estado: v }); }}>{ESTADOS.map(s => <option key={s} value={s}>{s}</option>)}</select></td>
                  <td className="p-2 text-center">
                    <button disabled={isReadOnly} onClick={() => { const v = !r.pagado; setGastos(g => g.map(x => x.id === r.id ? { ...x, pagado: v } : x)); saveGasto({ ...r, pagado: v }); }}
                      className={cn('px-2.5 py-1 rounded text-[9px] font-black uppercase', r.pagado ? 'bg-emerald-500/15 text-emerald-600 border border-emerald-500/30' : 'bg-bg-accent border border-border-dim text-text-dim')}>{r.pagado ? 'Sí' : 'No'}</button>
                  </td>
                  <td className="p-2 text-center">
                    {r.factura_path ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => verFactura(r)} title={r.factura_name || 'factura'} className="flex items-center gap-1 text-brand-500 hover:text-brand-600 text-[10px] font-bold"><Download size={12} /> Ver</button>
                        {!isReadOnly && <label className="text-text-dim hover:text-brand-500 cursor-pointer" title="Reemplazar"><Upload size={12} /><input type="file" className="hidden" onChange={e => subirFactura(r, e.target.files?.[0])} /></label>}
                      </div>
                    ) : !isReadOnly ? (
                      <label className={cn('inline-flex items-center gap-1.5 bg-brand-500/10 text-brand-500 border border-brand-500/25 rounded px-2.5 py-1 text-[9px] font-black uppercase cursor-pointer hover:bg-brand-500/20', uploadingId === r.id && 'opacity-50 pointer-events-none')}>
                        {uploadingId === r.id ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />} Cargar
                        <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx,.doc,.docx" onChange={e => subirFactura(r, e.target.files?.[0])} />
                      </label>
                    ) : <span className="text-text-dim text-[10px]">—</span>}
                  </td>
                  <td className="p-2 text-center">{!isReadOnly && <button onClick={() => delGasto(r)} className="text-text-dim hover:text-red-500"><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-text-dim">Los cambios se guardan solos al salir de cada campo. La factura se guarda en el almacenamiento de la app (bucket "documents").</p>
    </div>
  );
}
