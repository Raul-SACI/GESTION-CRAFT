/**
 * MÓDULO MARKETING — Tareas y Calendario de Reuniones
 *
 * Tareas: seguimiento de lo que desarrolla el área por día, con horas dedicadas,
 *   % de cumplimiento, fecha de terminación y responsable (personas con rol Marketing).
 * Reuniones: calendario mensual para agendar reuniones del área.
 *
 * Tablas: mkt_tasks y mkt_meetings (RLS desactivado).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Megaphone, Plus, Trash2, Pencil, X, Save, Loader2, Search, CalendarDays,
  ClipboardList, ChevronLeft, ChevronRight, Clock, CheckCircle2, Users
} from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const fmtDMY = (iso?: string | null) => { if (!iso) return '—'; const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

interface MktTask {
  id: string;
  title: string;
  description: string | null;
  responsible: string | null;
  date: string;              // día de la tarea
  due_date: string | null;   // fecha de terminación
  hours: number | null;      // horas dedicadas (suma del registro por día)
  estimated_hours: number | null; // horas estimadas
  progress: number | null;   // % de cumplimiento
  status: string;            // pendiente | en_proceso | completada
  created_by?: string | null;
}
interface HourEntry { id?: string; task_id?: string; date: string; hours: number | string; note?: string | null; }
interface MktMeeting {
  id: string;
  title: string;
  date: string;
  time: string | null;
  participants: string | null;
  location: string | null;
  notes: string | null;
  created_by?: string | null;
}

const STATUS = [
  { id: 'pendiente', label: 'Pendiente', color: 'text-red-500 bg-red-500/10 border-red-500/30', dot: '#ef4444' },
  { id: 'en_proceso', label: 'En proceso', color: 'text-amber-500 bg-amber-500/10 border-amber-500/30', dot: '#f59e0b' },
  { id: 'completada', label: 'Completada', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30', dot: '#10b981' },
];
const statusInfo = (s: string) => STATUS.find(x => x.id === s) || STATUS[0];
const DIAS_SEM = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export default function MktTasksView({ currentUserName, isReadOnly }: { currentUserName?: string; isReadOnly?: boolean }) {
  const [tab, setTab] = useState<'tareas' | 'reuniones'>('tareas');
  const [vistaTareas, setVistaTareas] = useState<'lista' | 'calendario'>('lista');
  const [tasks, setTasks] = useState<MktTask[]>([]);
  const [meetings, setMeetings] = useState<MktMeeting[]>([]);
  const [hoursByTask, setHoursByTask] = useState<Record<string, number>>({}); // total de horas dedicadas por tarea
  const [responsables, setResponsables] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Filtros de tareas
  const [fResp, setFResp] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [search, setSearch] = useState('');

  // Editor de tarea / reunión
  const [editTask, setEditTask] = useState<Partial<MktTask> | null>(null);
  const [draftHours, setDraftHours] = useState<HourEntry[]>([]); // registro de horas de la tarea en edición
  const [editMeeting, setEditMeeting] = useState<Partial<MktMeeting> | null>(null);
  const [saving, setSaving] = useState(false);

  // Calendario (reuniones y tareas)
  const [calMonth, setCalMonth] = useState<string>(() => todayISO().slice(0, 7));
  const [dayDetail, setDayDetail] = useState<string | null>(null);
  const [dayTasksDetail, setDayTasksDetail] = useState<string | null>(null); // día abierto en el calendario de tareas
  const [calTareasMonth, setCalTareasMonth] = useState<string>(() => todayISO().slice(0, 7));

  const emptyTask = (): Partial<MktTask> => ({ title: '', description: '', responsible: responsables[0] || '', date: todayISO(), due_date: '', hours: null, estimated_hours: null, progress: 0, status: 'pendiente' });
  const emptyMeeting = (date?: string): Partial<MktMeeting> => ({ title: '', date: date || todayISO(), time: '', participants: '', location: '', notes: '' });

  const cargarResponsables = async () => {
    try {
      const { data: roles } = await supabase.from('roles_config').select('id, name');
      const mktRoleIds = (roles || []).filter((r: any) => /marketing|comercial|mkt/i.test(`${r.id} ${r.name}`)).map((r: any) => r.id);
      const { data: profs } = await supabase.from('profiles').select('name, role');
      let people = (profs || []).filter((p: any) => p.name && mktRoleIds.includes(p.role)).map((p: any) => p.name);
      // Si no hay nadie con rol marketing, ofrecer todos los usuarios como respaldo
      if (people.length === 0) people = (profs || []).filter((p: any) => p.name).map((p: any) => p.name);
      setResponsables(Array.from(new Set(people)).sort());
    } catch { setResponsables([]); }
  };

  const cargar = async () => {
    setLoading(true);
    try {
      const [{ data: t }, { data: m }, { data: h }] = await Promise.all([
        supabase.from('mkt_tasks').select('*').order('date', { ascending: false }),
        supabase.from('mkt_meetings').select('*').order('date'),
        supabase.from('mkt_task_hours').select('task_id, hours'),
      ]);
      setTasks((t as MktTask[]) || []);
      setMeetings((m as MktMeeting[]) || []);
      const map: Record<string, number> = {};
      (h || []).forEach((r: any) => { map[r.task_id] = (map[r.task_id] || 0) + (Number(r.hours) || 0); });
      setHoursByTask(map);
    } catch { setTasks([]); setMeetings([]); setHoursByTask({}); }
    setLoading(false);
  };

  // Total de horas dedicadas a una tarea (suma del registro por día)
  const horasDe = (id?: string) => (id && hoursByTask[id] != null ? hoursByTask[id] : 0);

  // Abrir editor cargando su registro de horas
  const abrirTarea = async (t?: MktTask) => {
    if (!t) { setEditTask(emptyTask()); setDraftHours([]); return; }
    setEditTask({ ...t });
    try {
      const { data } = await supabase.from('mkt_task_hours').select('*').eq('task_id', t.id).order('date');
      setDraftHours((data as HourEntry[]) || []);
    } catch { setDraftHours([]); }
  };

  useEffect(() => { cargarResponsables(); cargar(); }, []);

  const tareasFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(t => {
      if (fResp && t.responsible !== fResp) return false;
      if (fStatus && t.status !== fStatus) return false;
      if (q && !(`${t.title} ${t.description || ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [tasks, fResp, fStatus, search]);

  // Resumen
  const resumen = useMemo(() => {
    const horas = tareasFiltradas.reduce((s, t) => s + horasDe(t.id), 0);
    const estim = tareasFiltradas.reduce((s, t) => s + (Number(t.estimated_hours) || 0), 0);
    const prom = tareasFiltradas.length ? Math.round(tareasFiltradas.reduce((s, t) => s + (Number(t.progress) || 0), 0) / tareasFiltradas.length) : 0;
    const comp = tareasFiltradas.filter(t => t.status === 'completada').length;
    return { horas, estim, prom, comp, total: tareasFiltradas.length };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tareasFiltradas, hoursByTask]);

  const guardarTarea = async () => {
    if (!editTask) return;
    if (!editTask.title?.trim()) { alert('Poné un título a la tarea.'); return; }
    setSaving(true);
    try {
      const id = editTask.id || `mt_${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
      const prog = Math.max(0, Math.min(100, Number(editTask.progress) || 0));
      // Registro de horas por día → total dedicado
      const entradas = draftHours.filter(h => h.date && (Number(h.hours) || 0) > 0);
      const totalHoras = entradas.reduce((s, h) => s + (Number(h.hours) || 0), 0);
      const payload = {
        id, title: editTask.title.trim(), description: editTask.description?.trim() || null,
        responsible: editTask.responsible || null, date: editTask.date || todayISO(),
        due_date: editTask.due_date || null,
        hours: totalHoras,
        estimated_hours: editTask.estimated_hours === null || editTask.estimated_hours === undefined || (editTask.estimated_hours as any) === '' ? null : Number(editTask.estimated_hours),
        progress: prog, status: prog >= 100 ? 'completada' : (editTask.status || 'pendiente'),
        created_by: currentUserName || '—', updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('mkt_tasks').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
      // Reemplazar el registro de horas de la tarea
      await supabase.from('mkt_task_hours').delete().eq('task_id', id);
      if (entradas.length > 0) {
        const rows = entradas.map((h, i) => ({
          id: `${id}_h${i + 1}_${Math.random().toString(36).slice(2, 5)}`,
          task_id: id, date: h.date, hours: Number(h.hours) || 0, note: h.note?.toString().trim() || null,
          created_by: currentUserName || '—',
        }));
        const { error: e2 } = await supabase.from('mkt_task_hours').insert(rows);
        if (e2) throw e2;
      }
      setEditTask(null); setDraftHours([]); await cargar();
    } catch (e: any) { alert('Error al guardar: ' + (e.message || e)); }
    setSaving(false);
  };

  // Helpers del registro de horas en el editor
  const addHora = () => setDraftHours(prev => [...prev, { date: editTask?.date || todayISO(), hours: '' }]);
  const setHora = (i: number, field: keyof HourEntry, value: any) => setDraftHours(prev => prev.map((h, idx) => idx === i ? { ...h, [field]: value } : h));
  const delHora = (i: number) => setDraftHours(prev => prev.filter((_, idx) => idx !== i));
  const totalDraftHoras = draftHours.reduce((s, h) => s + (Number(h.hours) || 0), 0);

  const borrarTarea = async (t: MktTask) => {
    if (!window.confirm(`¿Eliminar la tarea "${t.title}"?`)) return;
    await supabase.from('mkt_tasks').delete().eq('id', t.id); await cargar();
  };

  const guardarReunion = async () => {
    if (!editMeeting) return;
    if (!editMeeting.title?.trim()) { alert('Poné un título a la reunión.'); return; }
    setSaving(true);
    try {
      const id = editMeeting.id || `mm_${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
      const payload = {
        id, title: editMeeting.title.trim(), date: editMeeting.date || todayISO(),
        time: editMeeting.time || null, participants: editMeeting.participants?.trim() || null,
        location: editMeeting.location?.trim() || null, notes: editMeeting.notes?.trim() || null,
        created_by: currentUserName || '—',
      };
      const { error } = await supabase.from('mkt_meetings').upsert(payload, { onConflict: 'id' });
      if (error) throw error;
      setEditMeeting(null); await cargar();
    } catch (e: any) { alert('Error al guardar: ' + (e.message || e)); }
    setSaving(false);
  };

  const borrarReunion = async (m: MktMeeting) => {
    if (!window.confirm(`¿Eliminar la reunión "${m.title}"?`)) return;
    await supabase.from('mkt_meetings').delete().eq('id', m.id); await cargar();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Encabezado */}
      <div className="bg-bg-card border border-border-dim rounded-lg p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/10 p-2.5 rounded-lg"><Megaphone className="text-brand-500" size={20} /></div>
            <div>
              <h2 className="text-base font-black uppercase text-text-main tracking-wider">Marketing · Tareas y Reuniones</h2>
              <p className="text-[9px] text-text-dim uppercase font-bold">Seguimiento de tareas del área y calendario de reuniones</p>
            </div>
          </div>
          <div className="flex gap-1 bg-bg-accent p-1 rounded-lg">
            <button onClick={() => setTab('tareas')}
              className={cn("px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
                tab === 'tareas' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>
              <ClipboardList size={12} /> Tareas
            </button>
            <button onClick={() => setTab('reuniones')}
              className={cn("px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
                tab === 'reuniones' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>
              <CalendarDays size={12} /> Reuniones
            </button>
          </div>
        </div>
      </div>

      {/* ───────── TAREAS ───────── */}
      {tab === 'tareas' && (
        <>
          {/* Filtros + resumen */}
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2 bg-bg-accent border border-border-dim rounded px-2 flex-1 min-w-[180px]">
              <Search size={13} className="text-text-dim shrink-0" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tarea…"
                className="bg-transparent px-1 py-2 text-[11px] font-bold text-text-main outline-none flex-1" />
            </div>
            <select value={fResp} onChange={e => setFResp(e.target.value)}
              className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
              <option value="">Todos los responsables</option>
              {responsables.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
            <select value={fStatus} onChange={e => setFStatus(e.target.value)}
              className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
              <option value="">Todos los estados</option>
              {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
            <div className="flex gap-1 bg-bg-accent rounded-lg p-1">
              <button onClick={() => setVistaTareas('lista')}
                className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5", vistaTareas === 'lista' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>
                <ClipboardList size={12} /> Lista
              </button>
              <button onClick={() => setVistaTareas('calendario')}
                className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5", vistaTareas === 'calendario' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>
                <CalendarDays size={12} /> Calendario
              </button>
            </div>
            {!isReadOnly && (
              <button onClick={() => abrirTarea()}
                className="ml-auto bg-brand-500 text-white px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center gap-2">
                <Plus size={14} /> Nueva tarea
              </button>
            )}
          </div>

          {/* Tarjetas de resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { lbl: 'Tareas', val: resumen.total, icon: ClipboardList },
              { lbl: 'Horas dedicadas / estim.', val: `${resumen.horas.toLocaleString('es-AR')} / ${resumen.estim.toLocaleString('es-AR')}`, icon: Clock },
              { lbl: 'Cumplimiento promedio', val: resumen.prom + '%', icon: CheckCircle2 },
              { lbl: 'Completadas', val: resumen.comp, icon: CheckCircle2 },
            ].map((c, i) => (
              <div key={i} className="bg-bg-card border border-border-dim rounded-lg p-3">
                <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">{c.lbl}</p>
                <p className="text-lg font-mono font-black text-text-main mt-1">{c.val}</p>
              </div>
            ))}
          </div>

          {/* Vista CALENDARIO de tareas */}
          {vistaTareas === 'calendario' && (() => {
            const [cy, cm] = calTareasMonth.split('-').map(Number);
            const primerDia = new Date(cy, cm - 1, 1);
            const diasEnMes = new Date(cy, cm, 0).getDate();
            const offset = (primerDia.getDay() + 6) % 7;
            const celdas: (number | null)[] = [];
            for (let i = 0; i < offset; i++) celdas.push(null);
            for (let d = 1; d <= diasEnMes; d++) celdas.push(d);
            const tareasDia = (d: number) => {
              const ds = `${cy}-${String(cm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              return tareasFiltradas.filter(t => t.date === ds);
            };
            const cambiar = (delta: number) => { const nd = new Date(cy, cm - 1 + delta, 1); setCalTareasMonth(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`); };
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
                      <div key={d} onClick={() => td.length > 0 && setDayTasksDetail(ds)}
                        className={cn("min-h-[92px] border rounded-lg p-1.5 flex flex-col gap-1 overflow-hidden", esHoy ? "border-brand-500 bg-brand-500/5" : "border-border-dim/40 bg-bg-accent/10", td.length > 0 && "cursor-pointer hover:border-brand-500/60")}>
                        <div className="flex items-center justify-between">
                          <span className={cn("text-[10px] font-black", esHoy ? "text-brand-500" : "text-text-dim")}>{d}</span>
                          {td.length > 0 && <span className="text-[8px] font-black text-text-dim bg-bg-accent rounded px-1">{td.length}</span>}
                        </div>
                        <div className="flex flex-col gap-0.5 overflow-y-auto">
                          {td.slice(0, 4).map(t => {
                            const si = statusInfo(t.status);
                            return (
                              <button key={t.id} onClick={(e) => { e.stopPropagation(); abrirTarea(t); }} title={`${t.title} · ${t.responsible || ''}`}
                                className="flex items-center gap-1 text-left text-[8px] font-bold uppercase px-1 py-0.5 rounded hover:opacity-80"
                                style={{ backgroundColor: si.dot + '22', color: si.dot }}>
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: si.dot }} />
                                <span className="truncate">{t.title}</span>
                              </button>
                            );
                          })}
                          {td.length > 4 && (
                            <button onClick={(e) => { e.stopPropagation(); setDayTasksDetail(ds); }}
                              className="text-[8px] font-black text-brand-500 hover:text-brand-600 px-1 text-left uppercase tracking-wider">
                              +{td.length - 4} más · ver todas
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Lista de tareas */}
          {vistaTareas === 'lista' && (loading ? (
            <p className="text-center text-[10px] font-bold uppercase text-text-dim py-10">Cargando…</p>
          ) : tareasFiltradas.length === 0 ? (
            <p className="text-center text-[10px] font-bold uppercase text-text-dim py-12">No hay tareas cargadas.{!isReadOnly && ' Usá "Nueva tarea".'}</p>
          ) : (
            <div className="space-y-2">
              {tareasFiltradas.map(t => {
                const si = statusInfo(t.status);
                const prog = Number(t.progress) || 0;
                return (
                  <div key={t.id} className="bg-bg-sidebar border border-border-dim rounded-lg p-4" style={{ borderLeftWidth: '3px', borderLeftColor: si.dot }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={cn("text-[8px] font-black uppercase px-2 py-0.5 rounded border", si.color)}>{si.label}</span>
                          {t.responsible && <span className="text-[9px] font-bold uppercase text-text-dim flex items-center gap-1"><Users size={10} /> {t.responsible}</span>}
                        </div>
                        <p className="text-[12px] font-black uppercase text-text-main">{t.title}</p>
                        {t.description && <p className="text-[10px] text-text-dim mt-0.5">{t.description}</p>}
                        <div className="flex items-center gap-4 mt-2 flex-wrap text-[9px] font-bold uppercase text-text-dim">
                          <span className="flex items-center gap-1"><CalendarDays size={11} /> Día: {fmtDMY(t.date)}</span>
                          <span>Termina: {fmtDMY(t.due_date)}</span>
                          <span className="flex items-center gap-1"><Clock size={11} /> {horasDe(t.id)} h{t.estimated_hours ? ` / ${Number(t.estimated_hours)} est.` : ''}</span>
                        </div>
                        {/* Barra de cumplimiento */}
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-2 bg-bg-accent rounded-full overflow-hidden max-w-[240px]">
                            <div className="h-full rounded-full transition-all" style={{ width: `${prog}%`, backgroundColor: prog >= 100 ? '#10b981' : prog >= 50 ? '#f59e0b' : '#ef4444' }} />
                          </div>
                          <span className="text-[10px] font-mono font-black text-text-main">{prog}%</span>
                        </div>
                      </div>
                      {!isReadOnly && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={() => abrirTarea(t)} className="text-text-dim hover:text-brand-500"><Pencil size={14} /></button>
                          <button onClick={() => borrarTarea(t)} className="text-text-dim hover:text-red-500"><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}

      {/* ───────── REUNIONES (Calendario) ───────── */}
      {tab === 'reuniones' && (() => {
        const [cy, cm] = calMonth.split('-').map(Number);
        const primerDia = new Date(cy, cm - 1, 1);
        const diasEnMes = new Date(cy, cm, 0).getDate();
        const offset = (primerDia.getDay() + 6) % 7;
        const celdas: (number | null)[] = [];
        for (let i = 0; i < offset; i++) celdas.push(null);
        for (let d = 1; d <= diasEnMes; d++) celdas.push(d);
        const reunionesDia = (d: number) => {
          const ds = `${cy}-${String(cm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          return meetings.filter(m => m.date === ds).sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
        };
        const cambiarMes = (delta: number) => { const nd = new Date(cy, cm - 1 + delta, 1); setCalMonth(`${nd.getFullYear()}-${String(nd.getMonth() + 1).padStart(2, '0')}`); };
        const hoy = todayISO();
        return (
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => cambiarMes(-1)} className="text-text-dim hover:text-brand-500 p-1"><ChevronLeft size={18} /></button>
              <h3 className="text-[12px] font-black uppercase text-text-main tracking-widest">{MESES[cm - 1]} {cy}</h3>
              <div className="flex items-center gap-2">
                {!isReadOnly && <button onClick={() => setEditMeeting(emptyMeeting())} className="bg-brand-500 text-white px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest hover:bg-brand-600 flex items-center gap-1.5"><Plus size={13} /> Reunión</button>}
                <button onClick={() => cambiarMes(1)} className="text-text-dim hover:text-brand-500 p-1"><ChevronRight size={18} /></button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                <div key={d} className="text-center text-[8px] font-black uppercase text-text-dim tracking-widest py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {celdas.map((d, i) => {
                if (d === null) return <div key={`e${i}`} className="min-h-[92px]" />;
                const ds = `${cy}-${String(cm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                const rd = reunionesDia(d);
                const esHoy = ds === hoy;
                return (
                  <div key={d} onClick={() => setDayDetail(ds)}
                    className={cn("min-h-[92px] border rounded-lg p-1.5 flex flex-col gap-1 overflow-hidden cursor-pointer transition-colors hover:border-brand-500/60",
                      esHoy ? "border-brand-500 bg-brand-500/5" : "border-border-dim/40 bg-bg-accent/10")}>
                    <div className="flex items-center justify-between">
                      <span className={cn("text-[10px] font-black", esHoy ? "text-brand-500" : "text-text-dim")}>{d}</span>
                      {rd.length > 0 && <span className="text-[8px] font-black text-white bg-brand-500 rounded px-1">{rd.length}</span>}
                    </div>
                    <div className="flex flex-col gap-0.5 overflow-y-auto">
                      {rd.slice(0, 3).map(m => (
                        <button key={m.id} onClick={e => { e.stopPropagation(); setEditMeeting({ ...m }); }}
                          className="text-left text-[8px] font-bold uppercase truncate px-1 py-0.5 rounded bg-brand-500/15 text-brand-600 hover:opacity-80"
                          title={`${m.time || ''} ${m.title}`}>
                          {m.time ? m.time + ' ' : ''}{m.title}
                        </button>
                      ))}
                      {rd.length > 3 && <span className="text-[8px] font-bold text-brand-500 px-1">+{rd.length - 3} más</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Modal detalle del día (reuniones) */}
      {dayDetail && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDayDetail(null)}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border-dim">
              <div className="flex items-center gap-2">
                <CalendarDays size={18} className="text-brand-500" />
                <h3 className="text-sm font-black uppercase text-text-main">{DIAS_SEM[new Date(dayDetail.split('-').map(Number)[0], dayDetail.split('-').map(Number)[1] - 1, dayDetail.split('-').map(Number)[2]).getDay()]} {fmtDMY(dayDetail)}</h3>
              </div>
              <div className="flex items-center gap-1">
                {!isReadOnly && <button onClick={() => { setEditMeeting(emptyMeeting(dayDetail)); setDayDetail(null); }} className="flex items-center gap-1.5 bg-brand-500 text-white px-3 py-1.5 rounded text-[9px] font-black uppercase hover:bg-brand-600"><Plus size={13} /> Nueva</button>}
                <button onClick={() => setDayDetail(null)} className="p-1.5 text-text-dim hover:text-text-main"><X size={18} /></button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
              {meetings.filter(m => m.date === dayDetail).length === 0 ? (
                <p className="text-center text-[10px] font-bold uppercase text-text-dim py-6">No hay reuniones este día.</p>
              ) : meetings.filter(m => m.date === dayDetail).sort((a, b) => String(a.time || '').localeCompare(String(b.time || ''))).map(m => (
                <div key={m.id} className="bg-bg-sidebar border border-border-dim rounded-lg p-3 flex justify-between items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {m.time && <span className="text-[9px] font-mono font-black text-brand-500">{m.time}</span>}
                      <span className="text-[11px] font-black uppercase text-text-main">{m.title}</span>
                    </div>
                    {m.participants && <p className="text-[9px] text-text-dim mt-0.5 uppercase font-bold">Participantes: {m.participants}</p>}
                    {m.location && <p className="text-[9px] text-text-dim mt-0.5">{m.location}</p>}
                    {m.notes && <p className="text-[10px] text-text-main mt-1">{m.notes}</p>}
                  </div>
                  {!isReadOnly && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => { setEditMeeting({ ...m }); setDayDetail(null); }} className="text-text-dim hover:text-brand-500"><Pencil size={13} /></button>
                      <button onClick={() => borrarReunion(m)} className="text-text-dim hover:text-red-500"><Trash2 size={13} /></button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal detalle del día (tareas): listado completo del día */}
      {dayTasksDetail && (() => {
        const [yy, mm, dd] = dayTasksDetail.split('-').map(Number);
        const tareasDelDia = tareasFiltradas.filter(t => t.date === dayTasksDetail);
        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDayTasksDetail(null)}>
            <div className="bg-bg-card border border-border-dim rounded-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between p-4 border-b border-border-dim">
                <div className="flex items-center gap-2">
                  <CalendarDays size={18} className="text-brand-500" />
                  <h3 className="text-sm font-black uppercase text-text-main">
                    {DIAS_SEM[new Date(yy, mm - 1, dd).getDay()]} {fmtDMY(dayTasksDetail)}
                    <span className="text-[10px] font-bold text-text-dim ml-2">· {tareasDelDia.length} tarea(s)</span>
                  </h3>
                </div>
                <div className="flex items-center gap-1">
                  {!isReadOnly && <button onClick={() => { setEditTask({ ...emptyTask(), date: dayTasksDetail }); setDayTasksDetail(null); }} className="flex items-center gap-1.5 bg-brand-500 text-white px-3 py-1.5 rounded text-[9px] font-black uppercase hover:bg-brand-600"><Plus size={13} /> Nueva</button>}
                  <button onClick={() => setDayTasksDetail(null)} className="p-1.5 text-text-dim hover:text-text-main"><X size={18} /></button>
                </div>
              </div>
              <div className="p-4 overflow-y-auto space-y-2">
                {tareasDelDia.length === 0 ? (
                  <p className="text-center text-[10px] font-bold uppercase text-text-dim py-6">No hay tareas este día.</p>
                ) : tareasDelDia.map(t => {
                  const si = statusInfo(t.status);
                  const prog = Number(t.progress) || 0;
                  return (
                    <div key={t.id} className="bg-bg-sidebar border border-border-dim rounded-lg p-3 flex justify-between items-start gap-3" style={{ borderLeftWidth: '3px', borderLeftColor: si.dot }}>
                      <button onClick={() => { abrirTarea(t); setDayTasksDetail(null); }} className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={cn("text-[8px] font-black uppercase px-2 py-0.5 rounded border", si.color)}>{si.label}</span>
                          {t.responsible && <span className="text-[9px] font-bold uppercase text-text-dim flex items-center gap-1"><Users size={10} /> {t.responsible}</span>}
                          <span className="text-[9px] font-mono font-black text-text-dim ml-auto">{prog}%</span>
                        </div>
                        <p className="text-[11px] font-black uppercase text-text-main">{t.title}</p>
                        {t.description && <p className="text-[9px] text-text-dim mt-0.5">{t.description}</p>}
                        {t.due_date && <p className="text-[8px] font-bold uppercase text-text-dim mt-0.5">Termina: {fmtDMY(t.due_date)}</p>}
                      </button>
                      {!isReadOnly && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <button onClick={() => { abrirTarea(t); setDayTasksDetail(null); }} className="text-text-dim hover:text-brand-500"><Pencil size={13} /></button>
                          <button onClick={() => borrarTarea(t)} className="text-text-dim hover:text-red-500"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal editor de TAREA */}
      {editTask && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start md:items-center justify-center p-3 overflow-y-auto" onClick={() => !saving && setEditTask(null)}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-xl w-full my-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border-dim">
              <h3 className="text-sm font-black uppercase text-text-main flex items-center gap-2"><Pencil size={16} className="text-brand-500" /> {editTask.id ? 'Editar tarea' : 'Nueva tarea'}</h3>
              <button onClick={() => setEditTask(null)} className="p-1.5 text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Título *</label>
                <input value={editTask.title || ''} onChange={e => setEditTask({ ...editTask, title: e.target.value })}
                  className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Descripción</label>
                <textarea value={editTask.description || ''} onChange={e => setEditTask({ ...editTask, description: e.target.value })} rows={2}
                  className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Responsable</label>
                  <select value={editTask.responsible || ''} onChange={e => setEditTask({ ...editTask, responsible: e.target.value })}
                    className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500">
                    <option value="">— Sin asignar —</option>
                    {responsables.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Estado</label>
                  <select value={editTask.status || 'pendiente'} onChange={e => setEditTask({ ...editTask, status: e.target.value })}
                    className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500">
                    {STATUS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Día de la tarea</label>
                  <input type="date" value={editTask.date || ''} onChange={e => setEditTask({ ...editTask, date: e.target.value })}
                    className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-mono font-bold text-text-main outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Fecha de terminación</label>
                  <input type="date" value={editTask.due_date || ''} onChange={e => setEditTask({ ...editTask, due_date: e.target.value })}
                    className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-mono font-bold text-text-main outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Horas estimadas</label>
                  <input type="number" step="any" value={editTask.estimated_hours ?? ''} onChange={e => setEditTask({ ...editTask, estimated_hours: e.target.value === '' ? null : parseFloat(e.target.value) })}
                    placeholder="Ej. 5" className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-mono font-bold text-text-main outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">% Cumplimiento: {Math.max(0, Math.min(100, Number(editTask.progress) || 0))}%</label>
                  <input type="range" min={0} max={100} step={5} value={Number(editTask.progress) || 0} onChange={e => setEditTask({ ...editTask, progress: parseInt(e.target.value) })}
                    className="w-full accent-brand-500" />
                </div>
              </div>

              {/* Registro de horas por día */}
              <div className="border border-border-dim rounded-lg p-3 bg-bg-accent/20 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-brand-500 flex items-center gap-2"><Clock size={13} /> Horas dedicadas por día</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono font-black text-text-main">
                      Total: {totalDraftHoras} h{editTask.estimated_hours ? ` / ${Number(editTask.estimated_hours)} est.` : ''}
                    </span>
                    <button type="button" onClick={addHora} className="text-[8px] font-black uppercase text-white bg-brand-500 hover:bg-brand-600 rounded px-2 py-1 flex items-center gap-1"><Plus size={11} /> Agregar</button>
                  </div>
                </div>
                {draftHours.length === 0 ? (
                  <p className="text-[9px] font-bold uppercase text-text-dim py-1">Todavía no registraste horas. Agregá una entrada por cada día trabajado.</p>
                ) : (
                  <div className="space-y-1.5">
                    {draftHours.map((h, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="date" value={h.date} onChange={e => setHora(i, 'date', e.target.value)}
                          className="bg-bg-card border border-border-dim rounded px-2 py-1 text-[10px] font-mono font-bold text-text-main outline-none focus:border-brand-500" />
                        <input type="number" step="any" value={h.hours} onChange={e => setHora(i, 'hours', e.target.value)}
                          placeholder="hs" className="w-16 bg-bg-card border border-border-dim rounded px-2 py-1 text-[10px] font-mono font-bold text-text-main outline-none focus:border-brand-500" />
                        <input value={h.note || ''} onChange={e => setHora(i, 'note', e.target.value)}
                          placeholder="Nota (opcional)" className="flex-1 bg-bg-card border border-border-dim rounded px-2 py-1 text-[10px] text-text-main outline-none focus:border-brand-500" />
                        <button type="button" onClick={() => delHora(i)} className="text-text-dim hover:text-red-500 shrink-0"><Trash2 size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 p-4 border-t border-border-dim">
              <button onClick={() => setEditTask(null)} className="px-4 py-2 rounded text-[9px] font-black uppercase text-text-dim hover:text-text-main border border-border-dim">Cancelar</button>
              <button onClick={guardarTarea} disabled={saving} className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 rounded text-[9px] font-black uppercase tracking-widest disabled:opacity-50">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal editor de REUNIÓN */}
      {editMeeting && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-start md:items-center justify-center p-3 overflow-y-auto" onClick={() => !saving && setEditMeeting(null)}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-lg w-full my-4 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border-dim">
              <h3 className="text-sm font-black uppercase text-text-main flex items-center gap-2"><CalendarDays size={16} className="text-brand-500" /> {editMeeting.id ? 'Editar reunión' : 'Nueva reunión'}</h3>
              <button onClick={() => setEditMeeting(null)} className="p-1.5 text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Título *</label>
                <input value={editMeeting.title || ''} onChange={e => setEditMeeting({ ...editMeeting, title: e.target.value })}
                  className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Fecha</label>
                  <input type="date" value={editMeeting.date || ''} onChange={e => setEditMeeting({ ...editMeeting, date: e.target.value })}
                    className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-mono font-bold text-text-main outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Hora</label>
                  <input type="time" value={editMeeting.time || ''} onChange={e => setEditMeeting({ ...editMeeting, time: e.target.value })}
                    className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-mono font-bold text-text-main outline-none focus:border-brand-500" />
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Participantes</label>
                <input value={editMeeting.participants || ''} onChange={e => setEditMeeting({ ...editMeeting, participants: e.target.value })}
                  placeholder="Nombres separados por coma" className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Lugar o link</label>
                <input value={editMeeting.location || ''} onChange={e => setEditMeeting({ ...editMeeting, location: e.target.value })}
                  placeholder="Sala, dirección o link de videollamada" className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" />
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Notas / temario</label>
                <textarea value={editMeeting.notes || ''} onChange={e => setEditMeeting({ ...editMeeting, notes: e.target.value })} rows={3}
                  className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500 resize-none" />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 p-4 border-t border-border-dim">
              {editMeeting.id && !isReadOnly ? (
                <button onClick={() => { const m = editMeeting as MktMeeting; setEditMeeting(null); borrarReunion(m); }} className="px-3 py-2 rounded text-[9px] font-black uppercase text-red-500 hover:bg-red-500/10 border border-red-500/30 flex items-center gap-1.5"><Trash2 size={13} /> Eliminar</button>
              ) : <span />}
              <div className="flex items-center gap-2">
                <button onClick={() => setEditMeeting(null)} className="px-4 py-2 rounded text-[9px] font-black uppercase text-text-dim hover:text-text-main border border-border-dim">Cancelar</button>
                <button onClick={guardarReunion} disabled={saving} className="flex items-center gap-2 bg-brand-500 hover:bg-brand-600 text-white px-5 py-2 rounded text-[9px] font-black uppercase tracking-widest disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
