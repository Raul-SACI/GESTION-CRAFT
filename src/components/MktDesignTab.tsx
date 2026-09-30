/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pestaña "Diseño Gráfico" del módulo Marketing · Tareas y Reuniones.
 * Tareas de diseño con seguimiento (estado, % de avance, fechas, responsable/estudio)
 * y adjuntos por tarea (PDF, Excel, Word, imágenes, etc.) guardados en Storage (bucket "documents").
 * Tablas: mkt_design_tasks y mkt_design_files (RLS desactivado).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Plus, Search, Trash2, Pencil, X, CheckCircle2, Paperclip, Upload, Download,
  FileText, PenTool, Loader2, CalendarDays, ClipboardList, ChevronLeft, ChevronRight
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';

interface DesignTask {
  id: string;
  title: string;
  description: string | null;
  responsible: string | null;
  date: string;
  due_date: string | null;
  progress: number | null;
  status: string; // pendiente | en_proceso | completada
  created_at?: string;
}
interface DesignFile { id: string; task_id: string; name: string; path: string; size: number | null; mime: string | null; created_at?: string; }

const STATUS = [
  { id: 'pendiente', label: 'Pendiente', color: 'text-red-500 bg-red-500/10 border-red-500/30', dot: '#ef4444' },
  { id: 'en_proceso', label: 'En proceso', color: 'text-amber-500 bg-amber-500/10 border-amber-500/30', dot: '#f59e0b' },
  { id: 'completada', label: 'Completada', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30', dot: '#10b981' },
];
const statusInfo = (s: string) => STATUS.find(x => x.id === s) || STATUS[0];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const todayISO = () => new Date().toLocaleDateString('en-CA');
const newId = () => (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const fmtSize = (b: number | null) => { if (!b) return ''; if (b < 1024) return `${b} B`; if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`; return `${(b / 1048576).toFixed(1)} MB`; };
const dmy = (iso: string | null) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

export default function MktDesignTab({ isReadOnly = false }: { isReadOnly?: boolean }) {
  const [tasks, setTasks] = useState<DesignTask[]>([]);
  const [filesByTask, setFilesByTask] = useState<Record<string, DesignFile[]>>({});
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [vista, setVista] = useState<'lista' | 'calendario'>('lista');
  const [calMonth, setCalMonth] = useState<string>(() => todayISO().slice(0, 7));
  const [editTask, setEditTask] = useState<Partial<DesignTask> | null>(null);
  const [editFiles, setEditFiles] = useState<DesignFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);

  const emptyTask = (): Partial<DesignTask> => ({ id: newId(), title: '', description: '', responsible: 'Estudio de Diseño', date: todayISO(), due_date: '', progress: 0, status: 'pendiente' });

  const cargar = async () => {
    setLoading(true);
    try {
      const [{ data: t }, { data: f }] = await Promise.all([
        supabase.from('mkt_design_tasks').select('*').order('date', { ascending: false }),
        supabase.from('mkt_design_files').select('*').order('created_at', { ascending: true }),
      ]);
      setTasks((t as DesignTask[]) || []);
      const map: Record<string, DesignFile[]> = {};
      ((f as DesignFile[]) || []).forEach(x => { (map[x.task_id] ||= []).push(x); });
      setFilesByTask(map);
    } catch (e) { console.warn('Error cargando diseño:', e); }
    finally { setLoading(false); }
  };
  useEffect(() => { cargar(); }, []);

  const filtradas = useMemo(() => tasks.filter(t => {
    if (fStatus && t.status !== fStatus) return false;
    const q = search.trim().toLowerCase();
    if (q && !((t.title || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q) || (t.responsible || '').toLowerCase().includes(q))) return false;
    return true;
  }), [tasks, fStatus, search]);

  const resumen = useMemo(() => ({
    total: tasks.length,
    pend: tasks.filter(t => t.status !== 'completada').length,
    comp: tasks.filter(t => t.status === 'completada').length,
  }), [tasks]);

  const abrir = (t?: DesignTask) => { setEditTask(t ? { ...t } : emptyTask()); setEditFiles(t ? (filesByTask[t.id] || []) : []); };

  const guardar = async () => {
    if (!editTask || isReadOnly) return;
    if (!editTask.title?.trim()) { alert('Poné un título a la tarea.'); return; }
    setSaving(true);
    try {
      const prog = Number(editTask.progress) || 0;
      const payload = {
        id: editTask.id, title: editTask.title.trim(), description: editTask.description || null,
        responsible: editTask.responsible || null, date: editTask.date || todayISO(),
        due_date: editTask.due_date || null, progress: prog,
        status: prog >= 100 ? 'completada' : (editTask.status || 'pendiente'),
      };
      const { error } = await supabase.from('mkt_design_tasks').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
      setEditTask(null);
      await cargar();
    } catch (e: any) { alert('No se pudo guardar: ' + (e.message || e)); }
    finally { setSaving(false); }
  };

  const eliminar = async (t: DesignTask) => {
    if (isReadOnly) return;
    if (!window.confirm(`¿Eliminar la tarea "${t.title}" y sus archivos adjuntos?`)) return;
    try {
      const files = filesByTask[t.id] || [];
      if (files.length > 0) { try { await supabase.storage.from('documents').remove(files.map(f => f.path)); } catch { /* ignore */ } }
      await supabase.from('mkt_design_files').delete().eq('task_id', t.id);
      await supabase.from('mkt_design_tasks').delete().eq('id', t.id);
      await cargar();
    } catch (e: any) { alert('No se pudo eliminar: ' + (e.message || e)); }
  };

  const subirArchivos = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0 || !editTask?.id || isReadOnly) return;
    setUploading(true);
    try {
      // La tarea debe existir en la base para poder colgarle archivos (evita adjuntos huérfanos).
      await supabase.from('mkt_design_tasks').upsert({
        id: editTask.id, title: (editTask.title || 'Sin título').trim(), description: editTask.description || null,
        responsible: editTask.responsible || null, date: editTask.date || todayISO(), due_date: editTask.due_date || null,
        progress: Number(editTask.progress) || 0, status: editTask.status || 'pendiente',
      }, { onConflict: 'id' });

      for (const file of Array.from(fileList)) {
        if (file.size > 25 * 1024 * 1024) { alert(`"${file.name}" supera los 25 MB y se omitió.`); continue; }
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `mkt-diseno/${editTask.id}/${Date.now()}_${safe}`;
        const { error: upErr } = await supabase.storage.from('documents').upload(path, file);
        if (upErr) { alert(`No se pudo subir "${file.name}": ${upErr.message}`); continue; }
        const row: DesignFile = { id: newId(), task_id: editTask.id, name: file.name, path, size: file.size, mime: file.type || null };
        const { error: dbErr } = await supabase.from('mkt_design_files').insert(row);
        if (dbErr) { await supabase.storage.from('documents').remove([path]); alert(`No se pudo registrar "${file.name}": ${dbErr.message}`); continue; }
        setEditFiles(prev => [...prev, row]);
      }
      await cargar();
    } catch (e: any) { alert('Error al subir: ' + (e.message || e)); }
    finally { setUploading(false); }
  };

  const descargar = async (f: DesignFile) => {
    try {
      const { data, error } = await supabase.storage.from('documents').createSignedUrl(f.path, 3600);
      if (error || !data?.signedUrl) throw error || new Error('sin URL');
      window.open(data.signedUrl, '_blank');
    } catch (e: any) { alert('No se pudo abrir el archivo: ' + (e.message || e)); }
  };

  const quitarArchivo = async (f: DesignFile) => {
    if (isReadOnly) return;
    if (!window.confirm(`¿Quitar el archivo "${f.name}"?`)) return;
    try {
      try { await supabase.storage.from('documents').remove([f.path]); } catch { /* ignore */ }
      await supabase.from('mkt_design_files').delete().eq('id', f.id);
      setEditFiles(prev => prev.filter(x => x.id !== f.id));
      await cargar();
    } catch (e: any) { alert('No se pudo quitar: ' + (e.message || e)); }
  };

  // ── Importar tablero de Trello (JSON) · 1 tarjeta = 1 tarea ──────────────────
  const importarTrello = async (fileList: FileList | null) => {
    if (isReadOnly) return;
    const file = fileList?.[0];
    if (!file) return;
    let board: any;
    try { board = JSON.parse(await file.text()); } catch { alert('El archivo no parece un JSON válido de Trello.'); return; }
    const cards = (board.cards || []).filter((c: any) => c && !c.closed && !c.isTemplate);
    if (cards.length === 0) { alert('No se encontraron tarjetas para importar en el archivo.'); return; }
    const memberName: Record<string, string> = {};
    (board.members || []).forEach((m: any) => { memberName[m.id] = m.fullName || m.username || ''; });
    const listName: Record<string, string> = {};
    (board.lists || []).forEach((l: any) => { listName[l.id] = l.name; });
    if (!window.confirm(`Se van a importar ${cards.length} tarjeta(s) de "${board.name || 'Trello'}" como tareas de diseño.\n\nLas tarjetas ya importadas antes se ACTUALIZAN (no se duplican).\n\n¿Continuar?`)) return;
    setImporting(true);
    try {
      const { data: exist } = await supabase.from('mkt_design_tasks').select('id, trello_id');
      const idByTrello: Record<string, string> = {};
      ((exist as any[]) || []).forEach(r => { if (r.trello_id) idByTrello[r.trello_id] = r.id; });
      const rows = cards.map((c: any) => {
        const done = !!c.dueComplete || !!c.dateCompleted;
        const due = c.due ? String(c.due).slice(0, 10) : null;
        const day = due || (c.start ? String(c.start).slice(0, 10) : todayISO());
        const resp = (c.idMembers || []).map((id: string) => memberName[id]).filter(Boolean).join(', ') || 'Estudio de Diseño';
        const lista = listName[c.idList];
        const desc = [c.desc && String(c.desc).trim(), lista ? `(Trello · lista: ${lista})` : ''].filter(Boolean).join('\n\n') || null;
        return {
          id: idByTrello[c.id] || newId(), trello_id: c.id,
          title: (c.name || 'Sin título').trim(), description: desc, responsible: resp,
          date: day, due_date: due, progress: done ? 100 : 0, status: done ? 'completada' : 'pendiente',
        };
      });
      const { error } = await supabase.from('mkt_design_tasks').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
      await cargar();
      alert(`Listo: ${rows.length} tarea(s) importada(s) / actualizada(s) desde Trello.`);
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (/trello_id/.test(msg)) alert('Falta la columna trello_id en la tabla. Corré el ALTER TABLE de mkt_design.sql en Supabase y volvé a intentar.\n\nDetalle: ' + msg);
      else alert('Error al importar: ' + msg);
    } finally { setImporting(false); }
  };

  const inp = 'w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500';

  return (
    <>
      {/* Filtros + resumen */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2 bg-bg-accent border border-border-dim rounded px-2 flex-1 min-w-[180px]">
          <Search size={13} className="text-text-dim shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tarea de diseño…"
            className="bg-transparent px-1 py-2 text-[11px] font-bold text-text-main outline-none flex-1" />
        </div>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}
          className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
          <option value="">Todos los estados</option>
          {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <div className="flex gap-1 bg-bg-accent rounded-lg p-1">
          <button onClick={() => setVista('lista')}
            className={cn('px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5', vista === 'lista' ? 'bg-brand-500 text-white' : 'text-text-dim hover:text-text-main')}>
            <ClipboardList size={12} /> Lista
          </button>
          <button onClick={() => setVista('calendario')}
            className={cn('px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5', vista === 'calendario' ? 'bg-brand-500 text-white' : 'text-text-dim hover:text-text-main')}>
            <CalendarDays size={12} /> Calendario
          </button>
        </div>
        {!isReadOnly && (
          <label title="Importar tablero de Trello (JSON) · 1 tarjeta = 1 tarea"
            className={cn('ml-auto flex items-center gap-2 bg-bg-accent border border-border-dim text-text-dim hover:text-brand-500 hover:border-brand-500 px-3 py-2.5 rounded text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all', importing && 'opacity-50 pointer-events-none')}>
            {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Importar Trello
            <input type="file" accept=".json,application/json" className="hidden" disabled={importing} onChange={e => { importarTrello(e.target.files); e.currentTarget.value = ''; }} />
          </label>
        )}
        {!isReadOnly && (
          <button onClick={() => abrir()}
            className="bg-brand-500 text-white px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center gap-2">
            <Plus size={14} /> Nueva tarea de diseño
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {[{ lbl: 'Tareas de diseño', val: resumen.total }, { lbl: 'Pendientes', val: resumen.pend }, { lbl: 'Completadas', val: resumen.comp }].map((c, i) => (
          <div key={i} className="bg-bg-card border border-border-dim rounded-lg p-3">
            <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">{c.lbl}</p>
            <p className="text-lg font-mono font-black text-text-main mt-1">{c.val}</p>
          </div>
        ))}
      </div>

      {vista === 'calendario' ? (() => {
        const [cy, cm] = calMonth.split('-').map(Number);
        const primerDia = new Date(cy, cm - 1, 1);
        const diasEnMes = new Date(cy, cm, 0).getDate();
        const offset = (primerDia.getDay() + 6) % 7; // lunes primero
        const celdas: (number | null)[] = [];
        for (let i = 0; i < offset; i++) celdas.push(null);
        for (let d = 1; d <= diasEnMes; d++) celdas.push(d);
        const tareasDia = (d: number) => { const ds = `${cy}-${String(cm).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return filtradas.filter(t => t.date === ds); };
        const cambiar = (delta: number) => { const nd = new Date(cy, cm - 1 + delta, 1); setCalMonth(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`); };
        const hoy = todayISO();
        return (
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => cambiar(-1)} className="text-text-dim hover:text-brand-500 p-1"><ChevronLeft size={18} /></button>
              <h3 className="text-[12px] font-black uppercase text-text-main tracking-widest">{MESES[cm - 1]} {cy}</h3>
              <button onClick={() => cambiar(1)} className="text-text-dim hover:text-brand-500 p-1"><ChevronRight size={18} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <div key={d} className="text-center text-[8px] font-black uppercase text-text-dim tracking-widest py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {celdas.map((d, i) => {
                if (d === null) return <div key={`e${i}`} className="min-h-[92px]" />;
                const ds = `${cy}-${String(cm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const td = tareasDia(d);
                const esHoy = ds === hoy;
                return (
                  <div key={d} className={cn('min-h-[92px] border rounded-lg p-1.5 flex flex-col gap-1 overflow-hidden', esHoy ? 'border-brand-500 bg-brand-500/5' : 'border-border-dim/40 bg-bg-accent/10')}>
                    <div className="flex items-center justify-between">
                      <span className={cn('text-[10px] font-black', esHoy ? 'text-brand-500' : 'text-text-dim')}>{d}</span>
                      {td.length > 0 && <span className="text-[8px] font-black text-text-dim bg-bg-accent rounded px-1">{td.length}</span>}
                    </div>
                    <div className="flex flex-col gap-0.5 overflow-y-auto">
                      {td.map(t => {
                        const si = statusInfo(t.status);
                        return (
                          <button key={t.id} onClick={() => abrir(t)} title={`${t.title} · ${t.responsible || ''}`}
                            className="flex items-center gap-1 text-left text-[8px] font-bold uppercase px-1 py-0.5 rounded hover:opacity-80"
                            style={{ backgroundColor: si.dot + '22', color: si.dot }}>
                            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: si.dot }} />
                            <span className="truncate">{t.title}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })() : loading ? (
        <p className="text-center text-[10px] font-bold uppercase text-text-dim py-10">Cargando…</p>
      ) : filtradas.length === 0 ? (
        <p className="text-center text-[10px] font-bold uppercase text-text-dim py-12">No hay tareas de diseño.{!isReadOnly && ' Usá "Nueva tarea de diseño".'}</p>
      ) : (
        <div className="space-y-2">
          {filtradas.map(t => {
            const si = statusInfo(t.status);
            const prog = Number(t.progress) || 0;
            const files = filesByTask[t.id] || [];
            return (
              <div key={t.id} className="bg-bg-sidebar border border-border-dim rounded-lg p-4" style={{ borderLeftWidth: '3px', borderLeftColor: si.dot }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={cn('text-[8px] font-black uppercase px-2 py-0.5 rounded border', si.color)}>{si.label}</span>
                      <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-text-dim"><PenTool size={11} /> {t.responsible || '—'}</span>
                      {files.length > 0 && <span className="flex items-center gap-1 text-[9px] font-bold uppercase text-brand-500"><Paperclip size={11} /> {files.length}</span>}
                    </div>
                    <h4 className="text-[13px] font-black uppercase text-text-main truncate">{t.title}</h4>
                    {t.description && <p className="text-[11px] text-text-dim mt-0.5 line-clamp-2">{t.description}</p>}
                    <div className="flex items-center gap-4 mt-2 text-[9px] font-bold uppercase text-text-dim">
                      <span>Día: {dmy(t.date)}</span>
                      <span>Termina: {dmy(t.due_date)}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-bg-accent rounded-full overflow-hidden max-w-[240px]">
                        <div className="h-full rounded-full" style={{ width: `${prog}%`, backgroundColor: si.dot }} />
                      </div>
                      <span className="text-[9px] font-mono font-black text-text-dim">{prog}%</span>
                    </div>
                  </div>
                  {!isReadOnly && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => abrir(t)} className="text-text-dim hover:text-brand-500 p-1"><Pencil size={14} /></button>
                      <button onClick={() => eliminar(t)} className="text-text-dim hover:text-red-500 p-1"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal alta/edición */}
      {editTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setEditTask(null)}>
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} onClick={e => e.stopPropagation()}
            className="bg-bg-sidebar border border-border-dim rounded-xl w-full max-w-2xl max-h-[88vh] overflow-y-auto shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-border-dim sticky top-0 bg-bg-sidebar z-10">
              <h3 className="text-sm font-black uppercase text-brand-500 tracking-widest flex items-center gap-2"><PenTool size={16} /> {editTask.id && tasks.some(t => t.id === editTask.id) ? 'Editar' : 'Nueva'} tarea de diseño</h3>
              <button onClick={() => setEditTask(null)} className="text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="text-[9px] font-black uppercase text-text-dim">Título</label>
                <input className={inp} value={editTask.title || ''} onChange={e => setEditTask({ ...editTask, title: e.target.value })} placeholder="Ej. Flyer promo octubre" />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-text-dim">Descripción / brief</label>
                <textarea className={cn(inp, 'min-h-[70px] resize-y')} value={editTask.description || ''} onChange={e => setEditTask({ ...editTask, description: e.target.value })} placeholder="Detalle de lo que hay que diseñar…" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim">Responsable / estudio</label>
                  <input className={inp} value={editTask.responsible || ''} onChange={e => setEditTask({ ...editTask, responsible: e.target.value })} />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim">Estado</label>
                  <select className={inp} value={editTask.status || 'pendiente'} onChange={e => setEditTask({ ...editTask, status: e.target.value })}>
                    {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim">Día</label>
                  <input type="date" className={inp} value={editTask.date || ''} onChange={e => setEditTask({ ...editTask, date: e.target.value })} />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim">Termina</label>
                  <input type="date" className={inp} value={editTask.due_date || ''} onChange={e => setEditTask({ ...editTask, due_date: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-[9px] font-black uppercase text-text-dim">Avance (%)</label>
                  <input type="number" min={0} max={100} className={inp} value={editTask.progress ?? 0} onChange={e => setEditTask({ ...editTask, progress: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) })} />
                </div>
              </div>

              {/* Adjuntos */}
              <div className="border-t border-border-dim pt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-black uppercase text-text-main tracking-wider flex items-center gap-1.5"><Paperclip size={13} /> Archivos adjuntos ({editFiles.length})</span>
                  {!isReadOnly && (
                    <label className={cn('flex items-center gap-1.5 bg-brand-500/10 text-brand-500 border border-brand-500/25 rounded px-3 py-1.5 text-[9px] font-black uppercase tracking-widest cursor-pointer hover:bg-brand-500/20', uploading && 'opacity-50 pointer-events-none')}>
                      {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Subir archivos
                      <input type="file" multiple className="hidden" disabled={uploading} onChange={e => subirArchivos(e.target.files)}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.gif,.webp,.svg,.ai,.psd,.zip,.rar" />
                    </label>
                  )}
                </div>
                {editFiles.length === 0 ? (
                  <p className="text-[10px] text-text-dim italic">Sin archivos. Subí PDF, Excel, Word, imágenes, etc. (máx. 25 MB c/u).</p>
                ) : (
                  <div className="space-y-1.5">
                    {editFiles.map(f => (
                      <div key={f.id} className="flex items-center gap-2 bg-bg-accent/40 border border-border-dim/50 rounded px-3 py-2">
                        <FileText size={14} className="text-text-dim shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-bold text-text-main truncate">{f.name}</p>
                          <p className="text-[8px] font-bold uppercase text-text-dim">{fmtSize(f.size)}</p>
                        </div>
                        <button onClick={() => descargar(f)} title="Abrir / descargar" className="text-text-dim hover:text-brand-500 p-1"><Download size={14} /></button>
                        {!isReadOnly && <button onClick={() => quitarArchivo(f)} title="Quitar" className="text-text-dim hover:text-red-500 p-1"><Trash2 size={14} /></button>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-border-dim sticky bottom-0 bg-bg-sidebar">
              <button onClick={() => setEditTask(null)} className="px-4 py-2 rounded border border-border-dim text-text-dim text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent">Cerrar</button>
              {!isReadOnly && (
                <button onClick={guardar} disabled={saving} className="px-5 py-2 rounded bg-brand-500 text-white text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 flex items-center gap-2 disabled:opacity-50">
                  <CheckCircle2 size={14} /> {saving ? 'Guardando…' : 'Guardar'}
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
