/**
 * SPDX-License-Identifier: Apache-2.0
 * Informe de Campañas Meta Ads (Marketing · Informes), mensual · carga manual.
 * Tabla: mkt_meta_ads (RLS desactivado).
 */
import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Megaphone, Loader2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';

interface AdRow {
  id: string; anio: number; mes: number;
  nombre: string; piezas: string; objetivo: string; resultados: string;
  costo_resultado: number; presupuesto: number; importe_gastado: number; impresiones: number; alcance: number;
}
const newId = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const fmt = (n: number) => `$${(Number(n) || 0).toLocaleString('es-AR')}`;
const fmtN = (n: number) => (Number(n) || 0).toLocaleString('es-AR');

export default function MktMetaAdsTab({ month, isReadOnly = false }: { month: string; isReadOnly?: boolean }) {
  const [anio, mes] = month.split('-').map(Number);
  const [rows, setRows] = useState<AdRow[]>([]);
  const [loading, setLoading] = useState(false);
  const inp = 'w-full bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[11px] text-text-main outline-none focus:border-brand-500';
  const numInp = cn(inp, 'text-right font-mono');

  const cargar = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('mkt_meta_ads').select('*').eq('anio', anio).eq('mes', mes).order('created_at', { ascending: true });
      setRows(((data as AdRow[]) || []).map(r => ({
        ...r, costo_resultado: Number(r.costo_resultado) || 0, presupuesto: Number(r.presupuesto) || 0,
        importe_gastado: Number(r.importe_gastado) || 0, impresiones: Number(r.impresiones) || 0, alcance: Number(r.alcance) || 0,
      })));
    } catch (e) { console.warn('Meta Ads load error', e); }
    finally { setLoading(false); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [anio, mes]);

  const add = () => setRows(prev => [...prev, { id: newId(), anio, mes, nombre: '', piezas: '', objetivo: '', resultados: '', costo_resultado: 0, presupuesto: 0, importe_gastado: 0, impresiones: 0, alcance: 0 }]);
  const upd = (id: string, patch: Partial<AdRow>) => setRows(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x));
  const save = async (r: AdRow) => {
    if (isReadOnly) return;
    try {
      await supabase.from('mkt_meta_ads').upsert({
        id: r.id, anio, mes, nombre: r.nombre.trim() || null, piezas: r.piezas.trim() || null, objetivo: r.objetivo.trim() || null,
        resultados: r.resultados.trim() || null, costo_resultado: Number(r.costo_resultado) || 0, presupuesto: Number(r.presupuesto) || 0,
        importe_gastado: Number(r.importe_gastado) || 0, impresiones: Number(r.impresiones) || 0, alcance: Number(r.alcance) || 0,
      }, { onConflict: 'id' });
    } catch (e: any) { alert('No se pudo guardar la campaña: ' + (e.message || e)); }
  };
  const del = async (r: AdRow) => { if (isReadOnly) return; if (!confirm(`¿Eliminar la campaña "${r.nombre || 'sin nombre'}"?`)) return; await supabase.from('mkt_meta_ads').delete().eq('id', r.id); setRows(prev => prev.filter(x => x.id !== r.id)); };

  const tot = rows.reduce((a, r) => ({ presupuesto: a.presupuesto + (Number(r.presupuesto) || 0), gastado: a.gastado + (Number(r.importe_gastado) || 0), impresiones: a.impresiones + (Number(r.impresiones) || 0), alcance: a.alcance + (Number(r.alcance) || 0) }), { presupuesto: 0, gastado: 0, impresiones: 0, alcance: 0 });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[{ l: 'Presupuesto total', v: fmt(tot.presupuesto) }, { l: 'Importe gastado', v: fmt(tot.gastado) }, { l: 'Impresiones', v: fmtN(tot.impresiones) }, { l: 'Alcance', v: fmtN(tot.alcance) }].map((c, i) => (
          <div key={i} className="bg-bg-card border border-border-dim rounded-lg p-3">
            <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">{c.l}</p>
            <p className="text-base font-mono font-black text-text-main mt-1">{c.v}</p>
          </div>
        ))}
      </div>

      <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between border-b border-border-dim/50">
          <h3 className="text-[12px] font-black uppercase tracking-wider text-text-main flex items-center gap-2"><Megaphone size={15} className="text-brand-500" /> Campañas Meta Ads</h3>
          <div className="flex items-center gap-2">
            {loading && <Loader2 size={14} className="animate-spin text-brand-500" />}
            {!isReadOnly && <button onClick={add} className="flex items-center gap-1.5 bg-brand-500/10 text-brand-500 border border-brand-500/25 rounded px-3 py-1.5 text-[9px] font-black uppercase tracking-widest hover:bg-brand-500/20"><Plus size={12} /> Campaña</button>}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] border-collapse min-w-[1100px]">
            <thead><tr className="bg-bg-accent/20 text-text-dim">
              <th className="p-2.5 text-left text-[9px] font-black uppercase tracking-widest w-44">Nombre campaña</th>
              <th className="p-2.5 text-left text-[9px] font-black uppercase tracking-widest w-40">Piezas / pautas</th>
              <th className="p-2.5 text-left text-[9px] font-black uppercase tracking-widest w-40">Objetivo</th>
              <th className="p-2.5 text-right text-[9px] font-black uppercase tracking-widest">Resultados</th>
              <th className="p-2.5 text-right text-[9px] font-black uppercase tracking-widest">Costo / result.</th>
              <th className="p-2.5 text-right text-[9px] font-black uppercase tracking-widest">Presupuesto</th>
              <th className="p-2.5 text-right text-[9px] font-black uppercase tracking-widest">Gastado</th>
              <th className="p-2.5 text-right text-[9px] font-black uppercase tracking-widest">Impresiones</th>
              <th className="p-2.5 text-right text-[9px] font-black uppercase tracking-widest">Alcance</th>
              <th className="w-10" />
            </tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={10} className="p-6 text-center text-text-dim text-[11px] italic">Sin campañas cargadas para este mes. {!isReadOnly && 'Agregá una con "Campaña".'}</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="border-t border-border-dim/25">
                  <td className="p-2"><input disabled={isReadOnly} className={inp} value={r.nombre} onChange={e => upd(r.id, { nombre: e.target.value })} onBlur={() => save(r)} /></td>
                  <td className="p-2"><input disabled={isReadOnly} className={inp} value={r.piezas} onChange={e => upd(r.id, { piezas: e.target.value })} onBlur={() => save(r)} /></td>
                  <td className="p-2"><input disabled={isReadOnly} className={inp} value={r.objetivo} onChange={e => upd(r.id, { objetivo: e.target.value })} onBlur={() => save(r)} /></td>
                  <td className="p-2"><input disabled={isReadOnly} className={cn(inp, 'text-right')} value={r.resultados} onChange={e => upd(r.id, { resultados: e.target.value })} onBlur={() => save(r)} /></td>
                  <td className="p-2"><input type="number" disabled={isReadOnly} className={numInp} value={r.costo_resultado || ''} onChange={e => upd(r.id, { costo_resultado: parseFloat(e.target.value) || 0 })} onBlur={() => save(r)} /></td>
                  <td className="p-2"><input type="number" disabled={isReadOnly} className={numInp} value={r.presupuesto || ''} onChange={e => upd(r.id, { presupuesto: parseFloat(e.target.value) || 0 })} onBlur={() => save(r)} /></td>
                  <td className="p-2"><input type="number" disabled={isReadOnly} className={numInp} value={r.importe_gastado || ''} onChange={e => upd(r.id, { importe_gastado: parseFloat(e.target.value) || 0 })} onBlur={() => save(r)} /></td>
                  <td className="p-2"><input type="number" disabled={isReadOnly} className={numInp} value={r.impresiones || ''} onChange={e => upd(r.id, { impresiones: parseFloat(e.target.value) || 0 })} onBlur={() => save(r)} /></td>
                  <td className="p-2"><input type="number" disabled={isReadOnly} className={numInp} value={r.alcance || ''} onChange={e => upd(r.id, { alcance: parseFloat(e.target.value) || 0 })} onBlur={() => save(r)} /></td>
                  <td className="p-2 text-center">{!isReadOnly && <button onClick={() => del(r)} className="text-text-dim hover:text-red-500"><Trash2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[10px] text-text-dim">Carga manual. Los cambios se guardan solos al salir de cada campo.</p>
    </div>
  );
}
