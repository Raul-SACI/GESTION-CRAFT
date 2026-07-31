/**
 * ACTAS DE DIRECCIÓN — Gerencia General
 *
 * Registro de las reuniones de dirección con los departamentos: temas tratados,
 * decisiones y compromisos (tareas) con responsable, fecha límite y estado.
 * Incluye un tablero de compromisos pendientes y exportación del acta a PDF.
 *
 * Tablas: direccion_areas, direccion_actas, direccion_compromisos.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Landmark, Plus, Trash2, Pencil, X, Save, Loader2, CalendarDays, Users, ListChecks,
  ClipboardList, FileText, CheckCircle2, Settings2
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDMY = (iso?: string | null) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

interface Area { id: string; name: string; sort_order?: number; }
interface Tema { titulo: string; detalle: string; }
interface Acta {
  id: string; date: string; participants: string[]; temas: Tema[]; notes: string | null;
  created_by?: string | null;
}
interface Compromiso {
  id: string; acta_id: string; acta_date: string | null; tema: string | null;
  descripcion: string; responsable: string | null; due_date: string | null; status: string;
}

const STATUS = [
  { id: 'pendiente', label: 'Pendiente', color: 'text-red-500 bg-red-500/10 border-red-500/30' },
  { id: 'en_curso', label: 'En curso', color: 'text-amber-500 bg-amber-500/10 border-amber-500/30' },
  { id: 'resuelto', label: 'Resuelto', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30' },
];
const stInfo = (s: string) => STATUS.find(x => x.id === s) || STATUS[0];

export default function ActasDireccionView({ currentUserName, isReadOnly }: { currentUserName?: string; isReadOnly?: boolean }) {
  const [tab, setTab] = useState<'actas' | 'compromisos' | 'areas'>('actas');
  const [areas, setAreas] = useState<Area[]>([]);
  const [actas, setActas] = useState<Acta[]>([]);
  const [compromisos, setCompromisos] = useState<Compromiso[]>([]);
  const [loading, setLoading] = useState(false);

  // Editor de acta
  const [editing, setEditing] = useState<Acta | null>(null);
  const [draftComp, setDraftComp] = useState<Compromiso[]>([]);
  const [saving, setSaving] = useState(false);

  // Filtros del tablero de compromisos
  const [fResp, setFResp] = useState('');
  const [fEstado, setFEstado] = useState('pendientes'); // pendientes | todos | resueltos

  // Alta de área
  const [nuevaArea, setNuevaArea] = useState('');

  const cargar = async () => {
    setLoading(true);
    try {
      const [{ data: ar }, { data: ac }, { data: co }] = await Promise.all([
        supabase.from('direccion_areas').select('*').order('sort_order').order('name'),
        supabase.from('direccion_actas').select('*').order('date', { ascending: false }),
        supabase.from('direccion_compromisos').select('*').order('due_date'),
      ]);
      setAreas((ar as Area[]) || []);
      setActas(((ac as any[]) || []).map(a => ({
        ...a,
        participants: Array.isArray(a.participants) ? a.participants : (a.participants ? JSON.parse(a.participants) : []),
        temas: Array.isArray(a.temas) ? a.temas : (a.temas ? JSON.parse(a.temas) : []),
      })));
      setCompromisos((co as Compromiso[]) || []);
    } catch { setAreas([]); setActas([]); setCompromisos([]); }
    setLoading(false);
  };
  useEffect(() => { cargar(); }, []);

  const compByActa = useMemo(() => {
    const m: Record<string, Compromiso[]> = {};
    compromisos.forEach(c => { (m[c.acta_id] = m[c.acta_id] || []).push(c); });
    return m;
  }, [compromisos]);

  // ── Editor de acta ──
  const emptyActa = (): Acta => ({ id: '', date: todayISO(), participants: [], temas: [], notes: '' });
  const abrirNueva = () => { setEditing(emptyActa()); setDraftComp([]); };
  const abrirActa = (a: Acta) => {
    setEditing({ ...a, participants: [...a.participants], temas: a.temas.map(t => ({ ...t })) });
    setDraftComp((compByActa[a.id] || []).map(c => ({ ...c })));
  };
  const cerrar = () => { setEditing(null); setDraftComp([]); };

  const toggleParticipante = (name: string) => setEditing(e => e ? ({ ...e, participants: e.participants.includes(name) ? e.participants.filter(p => p !== name) : [...e.participants, name] }) : e);
  const addTema = () => setEditing(e => e ? ({ ...e, temas: [...e.temas, { titulo: '', detalle: '' }] }) : e);
  const setTema = (i: number, field: keyof Tema, val: string) => setEditing(e => e ? ({ ...e, temas: e.temas.map((t, idx) => idx === i ? { ...t, [field]: val } : t) }) : e);
  const delTema = (i: number) => setEditing(e => e ? ({ ...e, temas: e.temas.filter((_, idx) => idx !== i) }) : e);

  const addComp = () => setDraftComp(prev => [...prev, { id: '', acta_id: '', acta_date: null, tema: '', descripcion: '', responsable: '', due_date: '', status: 'pendiente' }]);
  const setComp = (i: number, field: keyof Compromiso, val: any) => setDraftComp(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: val } : c));
  const delComp = (i: number) => setDraftComp(prev => prev.filter((_, idx) => idx !== i));

  const guardar = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!editing) return;
    if (!editing.date) { alert('Poné la fecha de la reunión.'); return; }
    const comps = draftComp.filter(c => c.descripcion.trim());
    if (comps.some(c => !c.descripcion.trim())) { alert('Todos los compromisos deben tener descripción.'); return; }
    setSaving(true);
    try {
      const isNew = !editing.id;
      const actaId = editing.id || `ac_${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
      const temas = editing.temas.filter(t => t.titulo.trim() || t.detalle.trim());
      const payload = {
        id: actaId, date: editing.date, participants: editing.participants, temas,
        notes: editing.notes?.trim() || null, created_by: currentUserName || '—', updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('direccion_actas').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
      await supabase.from('direccion_compromisos').delete().eq('acta_id', actaId);
      if (comps.length > 0) {
        const rows = comps.map((c, idx) => ({
          id: `${actaId}_c${idx + 1}_${Math.random().toString(36).slice(2, 5)}`,
          acta_id: actaId, acta_date: editing.date, tema: c.tema?.trim() || null,
          descripcion: c.descripcion.trim(), responsable: c.responsable || null,
          due_date: c.due_date || null, status: c.status || 'pendiente', created_by: currentUserName || '—',
        }));
        const { error: e2 } = await supabase.from('direccion_compromisos').insert(rows);
        if (e2) throw e2;
      }
      cerrar(); await cargar();
      if (isNew) setTab('actas');
    } catch (e: any) { alert('Error al guardar: ' + (e.message || e)); }
    setSaving(false);
  };

  const borrarActa = async (a: Acta) => {
    if (!window.confirm(`¿Eliminar el acta del ${fmtDMY(a.date)}? Se borran también sus compromisos.`)) return;
    await supabase.from('direccion_compromisos').delete().eq('acta_id', a.id);
    await supabase.from('direccion_actas').delete().eq('id', a.id);
    await cargar();
  };

  // Cambiar estado de un compromiso desde el tablero
  const cambiarEstado = async (c: Compromiso, status: string) => {
    if (isReadOnly) return;
    setCompromisos(prev => prev.map(x => x.id === c.id ? { ...x, status } : x));
    const { error } = await supabase.from('direccion_compromisos').update({ status }).eq('id', c.id);
    if (error) { alert('Error: ' + error.message); await cargar(); }
  };

  // ── Áreas ──
  const agregarArea = async () => {
    if (isReadOnly) return;
    const name = nuevaArea.trim();
    if (!name) return;
    if (areas.some(a => a.name.trim().toLowerCase() === name.toLowerCase())) { alert('Ya existe esa área.'); return; }
    const { error } = await supabase.from('direccion_areas').insert({ id: `ar_${Date.now()}${Math.random().toString(36).slice(2, 5)}`, name, sort_order: (areas.length + 1) });
    if (error) { alert('No se pudo guardar el área: ' + error.message); return; }
    setNuevaArea(''); await cargar();
  };
  const borrarArea = async (a: Area) => {
    if (!window.confirm(`¿Eliminar el área "${a.name}"? (No borra las actas ni los compromisos ya cargados)`)) return;
    await supabase.from('direccion_areas').delete().eq('id', a.id); await cargar();
  };

  // Tablero de compromisos filtrado
  const compFiltrados = useMemo(() => {
    return compromisos.filter(c => {
      if (fResp && c.responsable !== fResp) return false;
      if (fEstado === 'pendientes' && c.status === 'resuelto') return false;
      if (fEstado === 'resueltos' && c.status !== 'resuelto') return false;
      return true;
    }).sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')));
  }, [compromisos, fResp, fEstado]);

  const pendientesPorArea = useMemo(() => {
    const m: Record<string, number> = {};
    compromisos.filter(c => c.status !== 'resuelto').forEach(c => { const k = c.responsable || 'Sin asignar'; m[k] = (m[k] || 0) + 1; });
    return m;
  }, [compromisos]);

  const exportarPDF = (a: Acta) => {
    const comps = compByActa[a.id] || [];
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text('Acta de Reunión de Dirección', 14, 16);
    doc.setFontSize(10); doc.text(`Fecha: ${fmtDMY(a.date)}`, 14, 24);
    doc.setFontSize(9);
    const parts = a.participants.length ? a.participants.join(', ') : 'Sin registrar';
    const partLines = doc.splitTextToSize(`Participantes: ${parts}`, 180);
    doc.text(partLines, 14, 30);
    let y = 30 + partLines.length * 5 + 4;
    a.temas.forEach((t, i) => {
      doc.setFontSize(10); doc.setFont(undefined as any, 'bold');
      doc.text(`${i + 1}. ${t.titulo || '(sin título)'}`, 14, y); y += 5;
      doc.setFont(undefined as any, 'normal'); doc.setFontSize(9);
      if (t.detalle) { const dl = doc.splitTextToSize(t.detalle, 178); doc.text(dl, 18, y); y += dl.length * 4.5 + 2; }
      if (y > 270) { doc.addPage(); y = 16; }
    });
    if (comps.length) {
      y += 2;
      autoTable(doc, {
        head: [['Compromiso', 'Responsable', 'Límite', 'Estado']],
        body: comps.map(c => [c.descripcion, c.responsable || '—', c.due_date ? fmtDMY(c.due_date) : '—', stInfo(c.status).label]),
        startY: y, styles: { fontSize: 8, cellPadding: 1.5 }, headStyles: { fillColor: [193, 18, 31] },
        columnStyles: { 0: { cellWidth: 90 } },
      });
    }
    if (a.notes) {
      const afterY = (doc as any).lastAutoTable ? (doc as any).lastAutoTable.finalY + 6 : y;
      doc.setFontSize(9); doc.setFont(undefined as any, 'bold'); doc.text('Notas:', 14, afterY);
      doc.setFont(undefined as any, 'normal'); doc.text(doc.splitTextToSize(a.notes, 180), 14, afterY + 5);
    }
    doc.save(`acta_direccion_${a.date}.pdf`);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Encabezado */}
      <div className="bg-bg-card border border-border-dim rounded-lg p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/10 p-2.5 rounded-lg"><Landmark className="text-brand-500" size={20} /></div>
            <div>
              <h2 className="text-base font-black uppercase text-text-main tracking-wider">Actas de Dirección</h2>
              <p className="text-[9px] text-text-dim uppercase font-bold">Reuniones con los departamentos · temas, decisiones y compromisos</p>
            </div>
          </div>
          <div className="flex gap-1 bg-bg-accent p-1 rounded-lg">
            <button onClick={() => setTab('actas')} className={cn("px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5", tab === 'actas' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}><ClipboardList size={12} /> Actas</button>
            <button onClick={() => setTab('compromisos')} className={cn("px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5", tab === 'compromisos' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}><ListChecks size={12} /> Compromisos</button>
            {!isReadOnly && <button onClick={() => setTab('areas')} className={cn("px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5", tab === 'areas' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}><Settings2 size={12} /> Áreas</button>}
          </div>
        </div>
      </div>

      {/* ───────── ACTAS ───────── */}
      {tab === 'actas' && (
        <>
          {!isReadOnly && (
            <div className="flex justify-end">
              <button onClick={abrirNueva} className="flex items-center gap-2 bg-brand-500 text-white px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all">
                <Plus size={14} /> Nueva acta
              </button>
            </div>
          )}
          {loading ? (
            <p className="text-center text-[10px] font-bold uppercase text-text-dim py-10">Cargando…</p>
          ) : actas.length === 0 ? (
            <p className="text-center text-[10px] font-bold uppercase text-text-dim py-12">No hay actas cargadas.{!isReadOnly && ' Usá "Nueva acta" para registrar la reunión.'}</p>
          ) : (
            <div className="space-y-2">
              {actas.map(a => {
                const comps = compByActa[a.id] || [];
                const pend = comps.filter(c => c.status !== 'resuelto').length;
                return (
                  <div key={a.id} className="bg-bg-sidebar border border-border-dim rounded-lg p-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="min-w-0 flex-1 cursor-pointer" onClick={() => abrirActa(a)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[12px] font-black uppercase text-text-main flex items-center gap-1"><CalendarDays size={13} className="text-brand-500" /> Reunión {fmtDMY(a.date)}</span>
                          <span className="text-[8px] font-black uppercase text-text-dim">· {a.temas.length} tema(s) · {comps.length} compromiso(s)</span>
                          {pend > 0 && <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/30">{pend} pendiente(s)</span>}
                        </div>
                        {a.participants.length > 0 && (
                          <p className="text-[9px] font-bold uppercase text-text-dim mt-1 flex items-center gap-1"><Users size={10} /> {a.participants.join(' · ')}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => exportarPDF(a)} title="Exportar PDF" className="p-1.5 text-text-dim hover:text-red-500 transition-colors"><FileText size={15} /></button>
                        <button onClick={() => abrirActa(a)} title={isReadOnly ? 'Ver' : 'Editar'} className="p-1.5 text-text-dim hover:text-brand-500 transition-colors"><Pencil size={15} /></button>
                        {!isReadOnly && <button onClick={() => borrarActa(a)} title="Eliminar" className="p-1.5 text-text-dim hover:text-red-500 transition-colors"><Trash2 size={15} /></button>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ───────── COMPROMISOS ───────── */}
      {tab === 'compromisos' && (
        <>
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 flex flex-wrap gap-3 items-center">
            <select value={fResp} onChange={e => setFResp(e.target.value)} className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
              <option value="">Todas las áreas</option>
              {areas.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>
            <div className="flex gap-1 bg-bg-accent rounded-lg p-1">
              {([['pendientes', 'Pendientes'], ['todos', 'Todos'], ['resueltos', 'Resueltos']] as const).map(([v, l]) => (
                <button key={v} onClick={() => setFEstado(v)} className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase transition-all", fEstado === v ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>{l}</button>
              ))}
            </div>
            <span className="text-[10px] font-black text-text-dim uppercase tracking-widest ml-auto">{compFiltrados.length} compromiso(s)</span>
          </div>

          {/* Resumen por área (pendientes) */}
          {Object.keys(pendientesPorArea).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(pendientesPorArea).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([area, n]) => (
                <button key={area} onClick={() => { setFResp(area === 'Sin asignar' ? '' : area); setFEstado('pendientes'); }}
                  className="bg-bg-card border border-border-dim rounded-lg px-3 py-2 hover:border-brand-500/40 transition-all">
                  <span className="text-[9px] font-bold uppercase text-text-dim">{area}</span>
                  <span className="text-[13px] font-mono font-black text-red-500 ml-2">{n}</span>
                </button>
              ))}
            </div>
          )}

          {compFiltrados.length === 0 ? (
            <p className="text-center text-[10px] font-bold uppercase text-text-dim py-12">No hay compromisos para este filtro.</p>
          ) : (
            <div className="space-y-2">
              {compFiltrados.map(c => {
                const si = stInfo(c.status);
                const vencido = c.status !== 'resuelto' && c.due_date && c.due_date < todayISO();
                return (
                  <div key={c.id} className="bg-bg-sidebar border border-border-dim rounded-lg p-3.5 flex items-start justify-between gap-3" style={{ borderLeftWidth: '3px', borderLeftColor: si.color.includes('red') ? '#ef4444' : si.color.includes('amber') ? '#f59e0b' : '#10b981' }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {c.responsable && <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-brand-500/10 text-brand-500 border border-brand-500/30">{c.responsable}</span>}
                        {vencido && <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-red-500/15 text-red-500">Vencido</span>}
                        <span className="text-[8px] font-bold uppercase text-text-dim">Reunión {fmtDMY(c.acta_date)}{c.tema ? ` · ${c.tema}` : ''}</span>
                      </div>
                      <p className="text-[12px] text-text-main">{c.descripcion}</p>
                      <p className="text-[9px] font-bold uppercase text-text-dim mt-1">Límite: {fmtDMY(c.due_date)}</p>
                    </div>
                    {isReadOnly ? (
                      <span className={cn("text-[8px] font-black uppercase px-2 py-1 rounded border shrink-0", si.color)}>{si.label}</span>
                    ) : (
                      <select value={c.status} onChange={e => cambiarEstado(c, e.target.value)}
                        className="bg-bg-accent border border-border-dim rounded px-2 py-1 text-[9px] font-black uppercase text-text-main outline-none shrink-0">
                        {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ───────── ÁREAS ───────── */}
      {tab === 'areas' && !isReadOnly && (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 space-y-4 max-w-xl">
          <h3 className="text-[11px] font-black uppercase tracking-widest text-brand-500">Áreas / Responsables</h3>
          <div className="flex gap-2">
            <input value={nuevaArea} onChange={e => setNuevaArea(e.target.value)} onKeyDown={e => e.key === 'Enter' && agregarArea()}
              placeholder="Nueva área (ej. Compras)…" className="flex-1 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500" />
            <button onClick={agregarArea} className="bg-brand-500 text-white px-4 rounded text-[10px] font-black uppercase hover:bg-brand-600 flex items-center gap-1"><Plus size={14} /> Agregar</button>
          </div>
          <div className="space-y-1.5">
            {areas.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-bg-accent/40 border border-border-dim rounded px-3 py-2">
                <span className="text-[11px] font-bold uppercase text-text-main">{a.name}</span>
                <button onClick={() => borrarArea(a)} className="text-text-dim hover:text-red-500"><Trash2 size={14} /></button>
              </div>
            ))}
            {areas.length === 0 && <p className="text-[9px] font-bold uppercase text-text-dim text-center py-3">Sin áreas cargadas.</p>}
          </div>
        </div>
      )}

      {/* ───────── EDITOR DE ACTA ───────── */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start md:items-center justify-center p-3 overflow-y-auto" onClick={() => !saving && cerrar()}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-3xl w-full my-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border-dim">
              <h3 className="text-sm font-black uppercase text-text-main flex items-center gap-2"><ClipboardList size={16} className="text-brand-500" /> {isReadOnly ? 'Ver acta' : editing.id ? 'Editar acta' : 'Nueva acta'}</h3>
              <button onClick={cerrar} className="p-1.5 text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>

            <div className="p-4 space-y-4 max-h-[72vh] overflow-y-auto custom-scrollbar">
              {/* Fecha + participantes */}
              <div className="flex items-center gap-3 flex-wrap">
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Fecha de la reunión</label>
                  <input type="date" readOnly={isReadOnly} value={editing.date} onChange={e => setEditing({ ...editing, date: e.target.value })}
                    className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-mono font-bold text-text-main outline-none focus:border-brand-500" />
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1.5">Participantes</label>
                <div className="flex flex-wrap gap-1.5">
                  {areas.map(a => {
                    const on = editing.participants.includes(a.name);
                    return (
                      <button key={a.id} type="button" disabled={isReadOnly} onClick={() => toggleParticipante(a.name)}
                        className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase border transition-all", on ? "bg-brand-500 text-white border-brand-500" : "bg-bg-accent text-text-dim border-border-dim hover:border-brand-500/40")}>
                        {a.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Temas */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-500 flex items-center gap-2"><ListChecks size={14} /> Temas tratados ({editing.temas.length})</p>
                  {!isReadOnly && <button onClick={addTema} type="button" className="text-[8px] font-black uppercase text-white bg-brand-500 hover:bg-brand-600 rounded px-2 py-1 flex items-center gap-1"><Plus size={11} /> Tema</button>}
                </div>
                {editing.temas.length === 0 ? (
                  <p className="text-[9px] font-bold uppercase text-text-dim py-1">Sin temas.{!isReadOnly && ' Agregá los puntos que se trataron.'}</p>
                ) : editing.temas.map((t, i) => (
                  <div key={i} className="bg-bg-accent/40 border border-border-dim rounded p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black text-brand-500">{i + 1}.</span>
                      <input readOnly={isReadOnly} value={t.titulo} onChange={e => setTema(i, 'titulo', e.target.value)}
                        placeholder="Título del tema" className="flex-1 bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[11px] font-bold text-text-main outline-none focus:border-brand-500" />
                      {!isReadOnly && <button onClick={() => delTema(i)} type="button" className="text-text-dim hover:text-red-500"><Trash2 size={13} /></button>}
                    </div>
                    <textarea readOnly={isReadOnly} value={t.detalle} onChange={e => setTema(i, 'detalle', e.target.value)} rows={2}
                      placeholder="Qué se habló y qué se decidió…" className="w-full bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[10px] text-text-main outline-none focus:border-brand-500 resize-none" />
                  </div>
                ))}
              </div>

              {/* Compromisos */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500 flex items-center gap-2"><CheckCircle2 size={14} /> Compromisos / tareas ({draftComp.length})</p>
                  {!isReadOnly && <button onClick={addComp} type="button" className="text-[8px] font-black uppercase text-white bg-emerald-500 hover:bg-emerald-600 rounded px-2 py-1 flex items-center gap-1"><Plus size={11} /> Compromiso</button>}
                </div>
                {draftComp.length === 0 ? (
                  <p className="text-[9px] font-bold uppercase text-text-dim py-1">Sin compromisos.{!isReadOnly && ' Agregá las tareas que salieron de la reunión.'}</p>
                ) : draftComp.map((c, i) => (
                  <div key={i} className="bg-emerald-500/5 border border-emerald-500/20 rounded p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <textarea readOnly={isReadOnly} value={c.descripcion} onChange={e => setComp(i, 'descripcion', e.target.value)} rows={2}
                        placeholder="Qué hay que hacer…" className="flex-1 bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[11px] text-text-main outline-none focus:border-emerald-500 resize-none" />
                      {!isReadOnly && <button onClick={() => delComp(i)} type="button" className="text-text-dim hover:text-red-500 mt-1"><Trash2 size={13} /></button>}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      <select disabled={isReadOnly} value={c.responsable || ''} onChange={e => setComp(i, 'responsable', e.target.value)}
                        className="bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[10px] font-bold text-text-main outline-none">
                        <option value="">Responsable…</option>
                        {areas.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                      </select>
                      <select disabled={isReadOnly} value={c.tema || ''} onChange={e => setComp(i, 'tema', e.target.value)}
                        className="bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[10px] font-bold text-text-main outline-none">
                        <option value="">Tema (opcional)…</option>
                        {editing.temas.filter(t => t.titulo.trim()).map((t, ti) => <option key={ti} value={t.titulo}>{t.titulo}</option>)}
                      </select>
                      <input type="date" readOnly={isReadOnly} value={c.due_date || ''} onChange={e => setComp(i, 'due_date', e.target.value)}
                        className="bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[10px] font-mono font-bold text-text-main outline-none" />
                      <select disabled={isReadOnly} value={c.status} onChange={e => setComp(i, 'status', e.target.value)}
                        className="bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[10px] font-black uppercase text-text-main outline-none">
                        {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              {/* Notas */}
              <div>
                <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Notas generales</label>
                <textarea readOnly={isReadOnly} value={editing.notes || ''} onChange={e => setEditing({ ...editing, notes: e.target.value })} rows={2}
                  className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500 resize-none" />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 p-4 border-t border-border-dim">
              {editing.id ? <button onClick={() => exportarPDF(editing)} className="flex items-center gap-1.5 px-3 py-2 rounded text-[9px] font-black uppercase text-text-dim hover:text-brand-500 border border-border-dim"><FileText size={13} /> Exportar PDF</button> : <span />}
              <div className="flex items-center gap-2">
                <button onClick={cerrar} className="px-4 py-2 rounded text-[9px] font-black uppercase text-text-dim hover:text-text-main border border-border-dim">{isReadOnly ? 'Cerrar' : 'Cancelar'}</button>
                {!isReadOnly && (
                  <button onClick={guardar} disabled={saving} className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 rounded text-[9px] font-black uppercase tracking-widest disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar acta
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
