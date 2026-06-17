/**
 * SPDX-License-Identifier: Apache-2.0
 * Gift Cards en Gestión Sucursal: ver las emitidas y marcar cuando un cliente las usa.
 * No permite generar nuevas (eso es exclusivo de Marketing).
 */
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Loader2, Search, CheckCircle2, RotateCcw, Gift } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { cn } from '../lib/utils';

interface GiftCardRec {
  id: string; codigo: string; para: string; regalo: string; de_parte_de: string; fecha_emision: string;
  emitida_por?: string; medio_pago?: string; utilizada?: boolean; utilizada_fecha?: string | null; utilizada_sucursal?: string | null;
}

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const fmtDMY = (iso?: string | null) => { if (!iso) return '—'; const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };

export default function GiftCardBranchView({ branchName, isReadOnly }: { branchName?: string; isReadOnly?: boolean }) {
  const [records, setRecords] = useState<GiftCardRec[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'todas' | 'vigentes' | 'usadas'>('todas');

  const loadRecords = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('gift_cards').select('*').order('created_at', { ascending: false }).limit(500);
      setRecords((data as GiftCardRec[]) || []);
    } catch (e) { console.error('Error cargando gift cards:', e); }
    setLoading(false);
  };

  useEffect(() => { loadRecords(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return records.filter(r => {
      if (filter === 'vigentes' && r.utilizada) return false;
      if (filter === 'usadas' && !r.utilizada) return false;
      if (q) {
        const hay = `${r.codigo} ${r.para} ${r.regalo} ${r.de_parte_de}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [records, search, filter]);

  const marcarUsada = async (r: GiftCardRec) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!window.confirm(`¿Marcar la gift card ${r.codigo} como UTILIZADA por el cliente?\n\nSe registrará la sucursal "${branchName || 'N/A'}" y la fecha de hoy.`)) return;
    try {
      const { error } = await supabase.from('gift_cards').update({
        utilizada: true,
        utilizada_fecha: todayISO(),
        utilizada_sucursal: branchName || 'N/A',
      }).eq('id', r.id);
      if (error) throw error;
      await loadRecords();
    } catch (e: any) { alert('Error: ' + (e.message || e)); }
  };

  const desmarcar = async (r: GiftCardRec) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!window.confirm(`¿Revertir el uso de la gift card ${r.codigo}? Volverá a quedar vigente.`)) return;
    try {
      const { error } = await supabase.from('gift_cards').update({
        utilizada: false, utilizada_fecha: null, utilizada_sucursal: null,
      }).eq('id', r.id);
      if (error) throw error;
      await loadRecords();
    } catch (e: any) { alert('Error: ' + (e.message || e)); }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Filtros */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por código, destinatario, regalo..."
            className="w-full bg-bg-accent border border-border-dim rounded-full pl-9 pr-4 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" />
        </div>
        <div className="flex gap-1 bg-bg-accent rounded-lg p-1">
          {(['todas', 'vigentes', 'usadas'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                filter === f ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>
              {f}
            </button>
          ))}
        </div>
        <span className="text-[10px] font-black text-text-dim uppercase tracking-widest">{filtered.length} gift card(s)</span>
      </div>

      {/* Tabla */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        <div className="px-5 py-3 border-b border-border-dim flex items-center gap-2">
          <Gift size={14} className="text-brand-500" />
          <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Gift Cards</h3>
        </div>
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 size={24} className="animate-spin text-brand-500" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[760px]">
              <thead>
                <tr className="bg-bg-accent/40 border-b border-border-dim text-[10px] font-black uppercase text-text-dim tracking-widest">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Para</th>
                  <th className="px-4 py-3">Regalo</th>
                  <th className="px-4 py-3">Emisión</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                  <th className="px-4 py-3 text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className={cn("border-b border-border-dim/30 hover:bg-bg-accent/20 transition-colors text-[11px]", r.utilizada && "opacity-60")}>
                    <td className="px-4 py-2.5 font-mono font-black text-brand-500">{r.codigo}</td>
                    <td className="px-4 py-2.5 font-bold text-text-main">{r.para}</td>
                    <td className="px-4 py-2.5 text-text-dim truncate max-w-[220px]">{r.regalo}</td>
                    <td className="px-4 py-2.5 text-text-dim font-mono">{fmtDMY(r.fecha_emision)}</td>
                    <td className="px-4 py-2.5 text-center">
                      {r.utilizada
                        ? <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-text-dim/10 text-text-dim">Usada · {r.utilizada_sucursal || '—'} · {fmtDMY(r.utilizada_fecha)}</span>
                        : <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500">Vigente</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {!r.utilizada ? (
                        <button onClick={() => marcarUsada(r)} disabled={isReadOnly}
                          className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all disabled:opacity-50">
                          <CheckCircle2 size={12} /> Marcar usada
                        </button>
                      ) : (
                        <button onClick={() => desmarcar(r)} disabled={isReadOnly}
                          className="inline-flex items-center gap-1 text-text-dim hover:text-amber-500 px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50">
                          <RotateCcw size={12} /> Revertir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-10 text-center text-[10px] font-black uppercase text-text-dim">No hay gift cards para mostrar</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
