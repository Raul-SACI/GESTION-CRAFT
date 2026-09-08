import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Briefcase, Plus, Trash2, Pencil, X, RefreshCw, Sparkles, Save,
  ChevronLeft, ChevronRight, CheckCircle2, Clock, Info
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

// Cuentas / medios de pago (deben coincidir con ACCOUNTS del Flujo de Caja Estimado)
const CUENTAS: { id: string; label: string }[] = [
  { id: 'efectivo', label: 'Efectivo' },
  { id: 'santander', label: 'Banco Santander' },
  { id: 'bbva', label: 'Banco BBVA' },
  { id: 'ciudad', label: 'Banco Ciudad' },
  { id: 'nacion', label: 'Banco Nación' },
  { id: 'macro', label: 'Banco Macro' },
  { id: 'mp', label: 'Mercado Pago' },
];
// Línea del Flujo de Caja Estimado (subrubro HONORARIOS)
const HON_ITEMS: { id: string; label: string }[] = [
  { id: 'hon_abog_1', label: 'Honorarios Abogados' },
  { id: 'hon_cont', label: 'Honorarios Contador' },
  { id: 'hon_abog_2', label: 'Honorarios Abogada' },
  { id: 'hon_rrhh', label: 'Honorarios RRHH' },
  { id: 'hon_franco', label: 'Honorarios Marketing' },
  { id: 'hon_domo', label: 'Honorarios Domo' },
  { id: 'hon_other', label: 'Honorarios (Otros)' },
];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const fmt = (n: number | string) => '$' + Math.round(parseFloat(n as string) || 0).toLocaleString('es-AR');
const monthLabel = (mk: string) => { const [y, m] = mk.split('-'); return `${MESES[(parseInt(m, 10) || 1) - 1]} ${y}`; };
const cuentaLabel = (id: string) => CUENTAS.find(c => c.id === id)?.label || id;

type Asesor = { id: string; nombre: string; tipo: string | null; monto_mensual: number; dia_pago: number; cuenta: string; item_id: string; activo: boolean; notas: string | null; orden: number };
type Pago = { id: string; asesor_id: string; nombre: string; tipo: string | null; mes: string; fecha_pago: string; importe: number; cuenta: string; item_id: string; estado: string; notas: string | null };

const READONLY = 'Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.';

export default function HonorariosView({ isReadOnly = false }: { isReadOnly?: boolean }) {
  const [asesores, setAsesores] = useState<Asesor[]>([]);
  const [pagos, setPagos] = useState<Pago[]>([]);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const [editing, setEditing] = useState<Partial<Asesor> | null>(null);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, p] = await Promise.all([
        supabase.from('honorarios_asesores').select('*'),
        supabase.from('honorarios_pagos').select('*').eq('mes', month),
      ]);
      const N = (v: any) => Number(v) || 0;
      setAsesores(((a.data as any[]) || []).map(r => ({ ...r, monto_mensual: N(r.monto_mensual), dia_pago: N(r.dia_pago) || 10, orden: N(r.orden), activo: r.activo !== false })).sort((x, y) => x.orden - y.orden || x.nombre.localeCompare(y.nombre)));
      setPagos(((p.data as any[]) || []).map(r => ({ ...r, importe: N(r.importe) })));
    } catch (e) { console.warn('Honorarios load error', e); }
    finally { setLoading(false); }
  }, [month]);
  useEffect(() => { load(); }, [load]);

  const prevMonth = () => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 2, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const nextMonth = () => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };

  const pagoByAsesor = useMemo(() => { const m: Record<string, Pago> = {}; pagos.forEach(p => { m[p.asesor_id] = p; }); return m; }, [pagos]);
  const totalMes = useMemo(() => pagos.reduce((s, p) => s + p.importe, 0), [pagos]);
  const totalPagado = useMemo(() => pagos.filter(p => p.estado === 'pagado').reduce((s, p) => s + p.importe, 0), [pagos]);
  const totalMensualRef = useMemo(() => asesores.filter(a => a.activo).reduce((s, a) => s + a.monto_mensual, 0), [asesores]);

  const fechaDelMes = (dia: number) => { const [y, m] = month.split('-').map(Number); const last = new Date(y, m, 0).getDate(); const d = Math.min(Math.max(1, dia || 10), last); return `${month}-${String(d).padStart(2, '0')}`; };

  // ── Asesores ──
  const abrirNuevo = () => setEditing({ nombre: '', tipo: '', monto_mensual: 0, dia_pago: 10, cuenta: 'efectivo', item_id: 'hon_other', activo: true, notas: '', orden: (asesores.at(-1)?.orden || 0) + 1 });
  const guardarAsesor = async () => {
    if (isReadOnly) { alert(READONLY); return; }
    if (!editing || !editing.nombre?.trim()) { alert('Poné el nombre del asesor.'); return; }
    setSaving(true);
    try {
      const id = editing.id || editing.nombre.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || `a_${Date.now()}`;
      const payload = { id, nombre: editing.nombre.trim(), tipo: editing.tipo || null, monto_mensual: Number(editing.monto_mensual) || 0, dia_pago: Number(editing.dia_pago) || 10, cuenta: editing.cuenta || 'efectivo', item_id: editing.item_id || 'hon_other', activo: editing.activo !== false, notas: editing.notas || null, orden: Number(editing.orden) || 0, updated_at: new Date().toISOString() };
      const { error } = await supabase.from('honorarios_asesores').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
      setEditing(null); await load();
    } catch (e: any) { alert('Error al guardar: ' + (e.message || e)); }
    finally { setSaving(false); }
  };
  const eliminarAsesor = async (a: Asesor) => {
    if (isReadOnly) { alert(READONLY); return; }
    if (!confirm(`¿Eliminar el asesor "${a.nombre}"? (No borra los pagos ya cargados.)`)) return;
    const { error } = await supabase.from('honorarios_asesores').delete().eq('id', a.id);
    if (error) { alert('Error: ' + error.message); return; }
    load();
  };

  // ── Pagos ──
  const generarPagosMes = async () => {
    if (isReadOnly) { alert(READONLY); return; }
    const activos = asesores.filter(a => a.activo);
    const faltan = activos.filter(a => !pagoByAsesor[a.id]);
    if (faltan.length === 0) { alert('Todos los asesores activos ya tienen su pago cargado en ' + monthLabel(month) + '.'); return; }
    if (!confirm(`¿Generar los pagos de ${monthLabel(month)} para ${faltan.length} asesor(es)?\n\nCada uno con su monto mensual y su fecha de pago. Los que ya tenías cargados no se tocan.`)) return;
    setGenerating(true);
    try {
      const nuevos = faltan.map(a => ({ id: `${a.id}_${month}`, asesor_id: a.id, nombre: a.nombre, tipo: a.tipo, mes: month, fecha_pago: fechaDelMes(a.dia_pago), importe: a.monto_mensual, cuenta: a.cuenta, item_id: a.item_id, estado: 'pendiente', notas: null, updated_at: new Date().toISOString() }));
      const { error } = await supabase.from('honorarios_pagos').upsert(nuevos, { onConflict: 'id' });
      if (error) throw error;
      await load();
    } catch (e: any) { alert('Error al generar pagos: ' + (e.message || e)); }
    finally { setGenerating(false); }
  };

  const upsertPago = async (p: Pago, patch: Partial<Pago>) => {
    if (isReadOnly) { alert(READONLY); return; }
    const updated = { ...p, ...patch };
    setPagos(prev => prev.map(x => x.id === p.id ? updated : x)); // optimista
    const { error } = await supabase.from('honorarios_pagos').upsert({ ...updated, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) { alert('Error al guardar: ' + error.message); load(); }
  };
  const crearPagoManual = async (a: Asesor) => {
    if (isReadOnly) { alert(READONLY); return; }
    const nuevo: Pago = { id: `${a.id}_${month}`, asesor_id: a.id, nombre: a.nombre, tipo: a.tipo, mes: month, fecha_pago: fechaDelMes(a.dia_pago), importe: a.monto_mensual, cuenta: a.cuenta, item_id: a.item_id, estado: 'pendiente', notas: null };
    setPagos(prev => [...prev, nuevo]);
    const { error } = await supabase.from('honorarios_pagos').upsert({ ...nuevo, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) { alert('Error: ' + error.message); load(); }
  };
  const eliminarPago = async (p: Pago) => {
    if (isReadOnly) { alert(READONLY); return; }
    setPagos(prev => prev.filter(x => x.id !== p.id));
    const { error } = await supabase.from('honorarios_pagos').delete().eq('id', p.id);
    if (error) { alert('Error: ' + error.message); load(); }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="p-5 bg-bg-sidebar border border-border-dim rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-brand-500/10 rounded-xl text-brand-500 hidden sm:block"><Briefcase size={22} /></div>
          <div>
            <h2 className="text-base font-black uppercase text-text-main tracking-wider">Honorarios Profesionales</h2>
            <p className="text-[9px] text-text-dim uppercase font-bold tracking-widest mt-0.5">Asesores externos permanentes · impacta el Flujo de Caja Estimado</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-bg-accent/40 p-1 rounded-lg border border-border-dim/80">
          <button onClick={prevMonth} className="p-1.5 hover:bg-bg-sidebar rounded text-text-dim"><ChevronLeft size={15} /></button>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-transparent text-text-main text-[11px] font-black uppercase outline-none w-[120px] text-center cursor-pointer" />
          <button onClick={nextMonth} className="p-1.5 hover:bg-bg-sidebar rounded text-text-dim"><ChevronRight size={15} /></button>
          {loading && <RefreshCw size={13} className="animate-spin text-brand-500 ml-1" />}
        </div>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card label="Asesores activos" value={String(asesores.filter(a => a.activo).length)} sub={`${asesores.length} en total`} />
        <Card label="Honorarios mensuales" value={fmt(totalMensualRef)} sub="suma de referencia" />
        <Card label={`Pagos ${monthLabel(month)}`} value={fmt(totalMes)} sub={`${pagos.length} pago(s)`} accent />
        <Card label="Ya pagado" value={fmt(totalPagado)} sub={`de ${fmt(totalMes)}`} />
      </div>

      {/* Pagos del mes */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-lg overflow-hidden">
        <div className="p-4 border-b border-border-dim/60 flex flex-wrap items-center justify-between gap-3 bg-bg-accent/10">
          <h3 className="text-xs font-black text-text-main uppercase tracking-wider">Pagos de {monthLabel(month)}</h3>
          {!isReadOnly && (
            <button onClick={generarPagosMes} disabled={generating}
              className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 text-white px-3.5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest">
              {generating ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />} Generar pagos del mes
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[820px]">
            <thead>
              <tr className="bg-bg-accent/20 text-text-dim">
                <th className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-widest">Asesor</th>
                <th className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-widest">Fecha de pago</th>
                <th className="px-3 py-2.5 text-right text-[9px] font-black uppercase tracking-widest">Importe</th>
                <th className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-widest">Cuenta</th>
                <th className="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-widest">Estado</th>
                <th className="px-3 py-2.5 text-right text-[9px] font-black uppercase tracking-widest"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim/30">
              {asesores.filter(a => a.activo || pagoByAsesor[a.id]).map(a => {
                const p = pagoByAsesor[a.id];
                if (!p) {
                  return (
                    <tr key={a.id} className="opacity-70">
                      <td className="px-3 py-2.5 font-bold text-text-main">{a.nombre}<span className="text-[8px] text-text-dim font-black uppercase ml-2">{a.tipo}</span></td>
                      <td className="px-3 py-2.5 text-text-dim italic" colSpan={4}>Sin pago cargado este mes</td>
                      <td className="px-3 py-2.5 text-right">{!isReadOnly && <button onClick={() => crearPagoManual(a)} className="text-[9px] font-black uppercase text-brand-500 hover:underline">+ Cargar</button>}</td>
                    </tr>
                  );
                }
                return (
                  <tr key={a.id} className="hover:bg-bg-accent/10">
                    <td className="px-3 py-2 font-bold text-text-main whitespace-nowrap">{p.nombre}<span className="text-[8px] text-text-dim font-black uppercase ml-2">{p.tipo}</span></td>
                    <td className="px-3 py-2">
                      <input type="date" value={p.fecha_pago} disabled={isReadOnly} onChange={e => upsertPago(p, { fecha_pago: e.target.value })}
                        className="bg-bg-accent border border-border-dim rounded px-2 py-1 text-[11px] text-text-main outline-none focus:border-brand-500" />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" value={p.importe || ''} disabled={isReadOnly} onChange={e => upsertPago(p, { importe: Number(e.target.value) || 0 })}
                        className="w-28 bg-bg-accent border border-border-dim rounded px-2 py-1 text-[11px] text-right font-mono text-text-main outline-none focus:border-brand-500" />
                    </td>
                    <td className="px-3 py-2">
                      <select value={p.cuenta} disabled={isReadOnly} onChange={e => upsertPago(p, { cuenta: e.target.value })}
                        className="bg-bg-accent border border-border-dim rounded px-2 py-1 text-[10px] text-text-main outline-none focus:border-brand-500">
                        {CUENTAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button disabled={isReadOnly} onClick={() => upsertPago(p, { estado: p.estado === 'pagado' ? 'pendiente' : 'pagado' })}
                        className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded text-[9px] font-black uppercase tracking-wider border',
                          p.estado === 'pagado' ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25' : 'bg-amber-500/15 text-amber-500 border-amber-500/25')}>
                        {p.estado === 'pagado' ? <CheckCircle2 size={11} /> : <Clock size={11} />}{p.estado === 'pagado' ? 'Pagado' : 'Pendiente'}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right">{!isReadOnly && <button onClick={() => eliminarPago(p)} className="p-1 text-text-dim hover:text-red-500"><Trash2 size={13} /></button>}</td>
                  </tr>
                );
              })}
              {pagos.length > 0 && (
                <tr className="bg-bg-accent/25 font-black text-text-main">
                  <td className="px-3 py-2.5 uppercase text-[10px]">Total {monthLabel(month)}</td>
                  <td></td>
                  <td className="px-3 py-2.5 text-right font-mono text-brand-500">{fmt(totalMes)}</td>
                  <td colSpan={3}></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-text-dim flex items-center gap-1.5 p-3 border-t border-border-dim/40"><Info size={12} /> Cada pago impacta el Flujo de Caja Estimado en la semana de su fecha (línea Honorarios). Marcá "Pagado" cuando se abone.</p>
      </div>

      {/* Asesores */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-lg overflow-hidden">
        <div className="p-4 border-b border-border-dim/60 flex items-center justify-between gap-3 bg-bg-accent/10">
          <h3 className="text-xs font-black text-text-main uppercase tracking-wider">Asesores permanentes</h3>
          {!isReadOnly && <button onClick={abrirNuevo} className="flex items-center gap-2 bg-bg-accent border border-border-dim text-text-dim hover:text-brand-500 hover:border-brand-500/40 px-3 py-2 rounded text-[10px] font-black uppercase tracking-widest"><Plus size={13} /> Nuevo asesor</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[760px]">
            <thead>
              <tr className="bg-bg-accent/20 text-text-dim">
                <th className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-widest">Asesor</th>
                <th className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-widest">Tipo</th>
                <th className="px-3 py-2.5 text-right text-[9px] font-black uppercase tracking-widest">Honorario mensual</th>
                <th className="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-widest">Día de pago</th>
                <th className="px-3 py-2.5 text-left text-[9px] font-black uppercase tracking-widest">Cuenta</th>
                <th className="px-3 py-2.5 text-center text-[9px] font-black uppercase tracking-widest">Estado</th>
                <th className="px-3 py-2.5 text-right text-[9px] font-black uppercase tracking-widest"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim/30">
              {asesores.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-text-dim text-[11px] font-bold">No hay asesores cargados.</td></tr>}
              {asesores.map(a => (
                <tr key={a.id} className={cn('hover:bg-bg-accent/10', !a.activo && 'opacity-50')}>
                  <td className="px-3 py-2.5 font-bold text-text-main">{a.nombre}</td>
                  <td className="px-3 py-2.5 text-text-dim uppercase text-[10px]">{a.tipo || '—'}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-main">{fmt(a.monto_mensual)}</td>
                  <td className="px-3 py-2.5 text-center font-mono text-text-dim">{a.dia_pago}</td>
                  <td className="px-3 py-2.5 text-text-dim text-[10px]">{cuentaLabel(a.cuenta)}</td>
                  <td className="px-3 py-2.5 text-center"><span className={cn('text-[8px] font-black uppercase px-2 py-0.5 rounded', a.activo ? 'bg-emerald-500/10 text-emerald-500' : 'bg-text-dim/10 text-text-dim')}>{a.activo ? 'Activo' : 'Inactivo'}</span></td>
                  <td className="px-3 py-2.5 text-right">
                    {!isReadOnly && <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditing({ ...a })} className="p-1 text-text-dim hover:text-brand-500"><Pencil size={13} /></button>
                      <button onClick={() => eliminarAsesor(a)} className="p-1 text-text-dim hover:text-red-500"><Trash2 size={13} /></button>
                    </div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal asesor */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start md:items-center justify-center p-3 overflow-y-auto" onClick={() => !saving && setEditing(null)}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-lg w-full my-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border-dim">
              <h3 className="text-sm font-black uppercase text-text-main tracking-wider">{editing.id ? 'Editar asesor' : 'Nuevo asesor'}</h3>
              <button onClick={() => setEditing(null)} className="p-1.5 text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <F label="Nombre / Estudio"><input value={editing.nombre || ''} onChange={e => setEditing({ ...editing, nombre: e.target.value })} className={inp} /></F>
              <F label="Tipo"><input value={editing.tipo || ''} onChange={e => setEditing({ ...editing, tipo: e.target.value })} placeholder="Legal, Contable, RRHH…" className={inp} /></F>
              <div className="grid grid-cols-2 gap-3">
                <F label="Honorario mensual"><input type="number" value={editing.monto_mensual ?? 0} onChange={e => setEditing({ ...editing, monto_mensual: Number(e.target.value) || 0 })} className={inp} /></F>
                <F label="Día de pago"><input type="number" min={1} max={31} value={editing.dia_pago ?? 10} onChange={e => setEditing({ ...editing, dia_pago: Number(e.target.value) || 10 })} className={inp} /></F>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <F label="Cuenta / medio de pago"><select value={editing.cuenta || 'efectivo'} onChange={e => setEditing({ ...editing, cuenta: e.target.value })} className={inp}>{CUENTAS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></F>
                <F label="Línea en el flujo"><select value={editing.item_id || 'hon_other'} onChange={e => setEditing({ ...editing, item_id: e.target.value })} className={inp}>{HON_ITEMS.map(i => <option key={i.id} value={i.id}>{i.label}</option>)}</select></F>
              </div>
              <F label="Notas"><textarea value={editing.notas || ''} onChange={e => setEditing({ ...editing, notas: e.target.value })} className={cn(inp, 'min-h-[54px]')} /></F>
              <label className="flex items-center gap-2 text-[11px] font-bold text-text-main cursor-pointer"><input type="checkbox" checked={editing.activo !== false} onChange={e => setEditing({ ...editing, activo: e.target.checked })} /> Activo</label>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-border-dim">
              <button onClick={() => setEditing(null)} disabled={saving} className="px-4 py-2 bg-bg-accent text-text-dim rounded-lg text-[10px] font-black uppercase tracking-widest hover:text-text-main">Cancelar</button>
              <button onClick={guardarAsesor} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 disabled:opacity-60">{saving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />} Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inp = 'w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500';
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[9px] font-black uppercase text-text-dim tracking-widest mb-1">{label}</label>{children}</div>;
}
function Card({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="p-4 bg-bg-sidebar border border-border-dim rounded-xl shadow-sm">
      <div className="text-[9px] font-black text-text-dim uppercase tracking-widest">{label}</div>
      <div className={cn('text-xl font-black font-mono mt-1', accent ? 'text-brand-500' : 'text-text-main')}>{value}</div>
      {sub && <div className="text-[10px] text-text-dim font-bold mt-0.5">{sub}</div>}
    </div>
  );
}
