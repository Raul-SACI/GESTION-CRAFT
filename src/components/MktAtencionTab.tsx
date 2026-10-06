/**
 * SPDX-License-Identifier: Apache-2.0
 * Informe de Atención al Cliente (Marketing · Informes).
 * Por semana del negocio y por sucursal, en 3 fuentes: Google, Pedidos Ya e Instagram.
 * Reseñas (cantidad, 5-3★ y 2-1★ con % automático) y comentarios/quejas.
 * Tabla: mkt_atencion_cliente (RLS desactivado). Único por (anio,mes,semana,fuente,branch_id).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Star, Save, Loader2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';

const SEM_RANGO = ['1-7', '8-14', '15-21', '22-fin'];
type Row = { cantidad: number; altas: number; bajas: number; comentarios: string };
type Fuente = { id: string; label: string; color: string; conEstrellas: boolean };
// Desde este mes (inclusive), Pedidos Ya se carga SEPARADO por marca: Resto y Café.
// Los meses anteriores (ej. Septiembre) siguen unificados en la fuente 'pedidosya'.
const SPLIT_PY_FROM = '2026-10';

export default function MktAtencionTab({ branches, month, isReadOnly = false }: { branches: Branch[]; month: string; isReadOnly?: boolean }) {
  const [anio, mes] = month.split('-').map(Number);
  const operative = useMemo(() => branches.filter(b => b.id !== 'all' && b.id !== 'virtual' && !/almac/i.test(b.name)), [branches]);
  // Fuentes a mostrar según el mes: Pedidos Ya unificado (meses viejos) o separado Resto/Café.
  const fuentes = useMemo<Fuente[]>(() => {
    const list: Fuente[] = [{ id: 'google', label: 'Google', color: 'text-amber-500', conEstrellas: true }];
    if (month >= SPLIT_PY_FROM) {
      list.push({ id: 'pedidosya_resto', label: 'Pedidos Ya · Resto', color: 'text-red-500', conEstrellas: true });
      list.push({ id: 'pedidosya_cafe', label: 'Pedidos Ya · Café', color: 'text-orange-500', conEstrellas: true });
    } else {
      list.push({ id: 'pedidosya', label: 'Pedidos Ya', color: 'text-red-500', conEstrellas: true });
    }
    list.push({ id: 'instagram', label: 'Instagram', color: 'text-purple-500', conEstrellas: false });
    return list;
  }, [month]);
  const [semana, setSemana] = useState(1);
  const [data, setData] = useState<Record<string, Row>>({}); // `${fuente}|${branchId}` -> Row
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const key = (f: string, b: string) => `${f}|${b}`;

  const cargar = async () => {
    setLoading(true);
    try {
      const { data: rows } = await supabase.from('mkt_atencion_cliente').select('*')
        .eq('anio', anio).eq('mes', mes).eq('semana', semana);
      const map: Record<string, Row> = {};
      ((rows as any[]) || []).forEach(r => { map[key(r.fuente, r.branch_id)] = { cantidad: Number(r.cantidad) || 0, altas: Number(r.estrellas_altas) || 0, bajas: Number(r.estrellas_bajas) || 0, comentarios: r.comentarios || '' }; });
      setData(map);
    } catch (e) { console.warn('Atención load error', e); }
    finally { setLoading(false); }
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [anio, mes, semana]);

  const get = (f: string, b: string): Row => data[key(f, b)] || { cantidad: 0, altas: 0, bajas: 0, comentarios: '' };
  const set = (f: string, b: string, patch: Partial<Row>) => setData(prev => ({ ...prev, [key(f, b)]: { ...get(f, b), ...patch } }));

  const guardar = async () => {
    if (isReadOnly) return;
    setSaving(true);
    try {
      const payload: any[] = [];
      fuentes.forEach(f => operative.forEach(b => {
        const r = data[key(f.id, b.id)];
        if (!r) return;
        const vacia = !r.cantidad && !r.altas && !r.bajas && !(r.comentarios || '').trim();
        if (vacia) return;
        payload.push({ anio, mes, semana, fuente: f.id, branch_id: b.id, cantidad: r.cantidad || 0, estrellas_altas: r.altas || 0, estrellas_bajas: r.bajas || 0, comentarios: (r.comentarios || '').trim() || null });
      }));
      if (payload.length === 0) { alert('No hay datos cargados para guardar.'); setSaving(false); return; }
      const { error } = await supabase.from('mkt_atencion_cliente').upsert(payload, { onConflict: 'anio,mes,semana,fuente,branch_id' });
      if (error) throw error;
      await cargar();
      alert('Guardado.');
    } catch (e: any) { alert('No se pudo guardar: ' + (e.message || e)); }
    finally { setSaving(false); }
  };

  const pct = (n: number, tot: number) => tot > 0 ? `${((n / tot) * 100).toFixed(0)}%` : '—';
  const numInp = 'w-16 bg-bg-card border border-border-dim rounded px-1.5 py-1 text-[11px] font-mono font-bold text-text-main outline-none focus:border-brand-500 text-center';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 flex-wrap bg-bg-accent/30 p-1 rounded-lg border border-border-dim/60 w-fit">
        {[1, 2, 3, 4].map(w => (
          <button key={w} onClick={() => setSemana(w)}
            className={cn('px-2.5 py-1.5 text-[10px] font-black uppercase rounded', semana === w ? 'bg-brand-500 text-white' : 'text-text-dim hover:text-text-main')}>
            Sem {w} <span className="opacity-60">({SEM_RANGO[w - 1]})</span>
          </button>
        ))}
        {loading && <Loader2 size={14} className="animate-spin text-brand-500 ml-1" />}
      </div>

      {fuentes.map(f => (
        <div key={f.id} className="bg-bg-sidebar border border-border-dim rounded-xl shadow-sm overflow-x-auto">
          <div className="px-4 pt-3 pb-2 flex items-center gap-2 border-b border-border-dim/50">
            <Star size={14} className={f.color} />
            <h3 className={cn('text-[12px] font-black uppercase tracking-wider', f.color)}>{f.label}</h3>
          </div>
          <table className="w-full text-[12px] border-collapse min-w-[720px]">
            <thead><tr className="bg-bg-accent/20 text-text-dim">
              <th className="p-2.5 text-left text-[9px] font-black uppercase tracking-widest">Sucursal</th>
              {f.conEstrellas && <>
                <th className="p-2.5 text-center text-[9px] font-black uppercase tracking-widest">Reseñas</th>
                <th className="p-2.5 text-center text-[9px] font-black uppercase tracking-widest">5-3 ★</th>
                <th className="p-2.5 text-center text-[9px] font-black uppercase tracking-widest">%</th>
                <th className="p-2.5 text-center text-[9px] font-black uppercase tracking-widest">2-1 ★</th>
                <th className="p-2.5 text-center text-[9px] font-black uppercase tracking-widest">%</th>
              </>}
              <th className="p-2.5 text-left text-[9px] font-black uppercase tracking-widest">Comentarios negativos / quejas / sugerencias</th>
            </tr></thead>
            <tbody>
              {operative.map(b => {
                const r = get(f.id, b.id);
                return (
                  <tr key={b.id} className="border-t border-border-dim/25">
                    <td className="p-2.5 text-left font-bold text-text-main whitespace-nowrap">{b.name}</td>
                    {f.conEstrellas && <>
                      <td className="p-2.5 text-center"><input type="number" disabled={isReadOnly} className={numInp} value={r.cantidad || ''} onChange={e => set(f.id, b.id, { cantidad: parseInt(e.target.value) || 0 })} /></td>
                      <td className="p-2.5 text-center"><input type="number" disabled={isReadOnly} className={numInp} value={r.altas || ''} onChange={e => set(f.id, b.id, { altas: parseInt(e.target.value) || 0 })} /></td>
                      <td className="p-2.5 text-center font-mono text-emerald-500 font-bold">{pct(r.altas, r.cantidad)}</td>
                      <td className="p-2.5 text-center"><input type="number" disabled={isReadOnly} className={numInp} value={r.bajas || ''} onChange={e => set(f.id, b.id, { bajas: parseInt(e.target.value) || 0 })} /></td>
                      <td className="p-2.5 text-center font-mono text-red-500 font-bold">{pct(r.bajas, r.cantidad)}</td>
                    </>}
                    <td className="p-2.5">
                      <input disabled={isReadOnly} className="w-full min-w-[240px] bg-bg-card border border-border-dim rounded px-2 py-1 text-[11px] text-text-main outline-none focus:border-brand-500"
                        placeholder="—" value={r.comentarios} onChange={e => set(f.id, b.id, { comentarios: e.target.value })} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {!isReadOnly && (
        <div className="flex justify-end">
          <button onClick={guardar} disabled={saving}
            className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg px-5 py-2.5 text-[10px] font-black uppercase tracking-widest disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar {monthLabelShort(month)} · Sem {semana}
          </button>
        </div>
      )}
    </div>
  );
}
function monthLabelShort(m: string) { const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']; const [y, mm] = m.split('-'); return `${MESES[(parseInt(mm, 10) || 1) - 1]} ${y}`; }
