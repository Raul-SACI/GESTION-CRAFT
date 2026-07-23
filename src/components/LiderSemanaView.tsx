/**
 * SPDX-License-Identifier: Apache-2.0
 * Etapa 2 — Tablero semanal del líder.
 * A la izquierda, los días de la semana con las tareas asignadas (marcar hecho / pendiente, quitar).
 * A la derecha, la biblioteca por función: cada tarea con chips de día para asignarla (toque; sirve
 * en compu y en celular). Botón para copiar la planificación de la semana anterior.
 */
import { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Check, X, Loader2, Copy, ChevronLeft, ChevronRight, Layers, ListChecks, CalendarDays, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

interface Funcion { id: string; role: string; name: string; }
interface Tarea { id: string; funcion_id: string; role: string; title: string; description: string | null; }
interface Plan { id: string; owner: string; role: string; fecha: string; tarea_id: string | null; titulo?: string | null; done: boolean; done_by?: string | null; }

const DIAS_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DIAS_SHORT = ['LU', 'MA', 'MI', 'JU', 'VI', 'SA', 'DO'];
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

const uid = () => `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
const fmtDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0=domingo
  const diff = (day === 0 ? -6 : 1) - day;
  date.setDate(date.getDate() + diff);
  date.setHours(12, 0, 0, 0);
  return date;
}

export default function LiderSemanaView({
  role, roleLabel, ownerName, isReadOnly = false,
}: { role: string; roleLabel?: string; ownerName?: string; isReadOnly?: boolean }) {
  const [weekMonday, setWeekMonday] = useState<Date>(() => getMonday(new Date()));
  const [funciones, setFunciones] = useState<Funcion[]>([]);
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [plan, setPlan] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Alta de tarea suelta (texto libre) en un día
  const [adhocFecha, setAdhocFecha] = useState<string | null>(null);
  const [adhocTitulo, setAdhocTitulo] = useState('');

  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekMonday); d.setDate(d.getDate() + i); return d;
  }), [weekMonday]);
  const weekStart = fmtDate(weekDays[0]);
  const weekEnd = fmtDate(weekDays[6]);

  const cargarBiblioteca = async () => {
    try {
      const [{ data: fx }, { data: tk }] = await Promise.all([
        supabase.from('lider_funciones').select('*').eq('role', role).order('orden').order('created_at'),
        supabase.from('lider_tareas').select('*').eq('role', role).order('orden').order('created_at'),
      ]);
      setFunciones((fx as Funcion[]) || []);
      setTareas((tk as Tarea[]) || []);
    } catch { setFunciones([]); setTareas([]); }
  };

  const cargarPlan = async () => {
    if (!ownerName) { setPlan([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { data } = await supabase
        .from('lider_plan')
        .select('*')
        .eq('owner', ownerName)
        .gte('fecha', weekStart).lte('fecha', weekEnd);
      setPlan((data as Plan[]) || []);
    } catch { setPlan([]); }
    setLoading(false);
  };

  useEffect(() => { if (role) cargarBiblioteca(); /* eslint-disable-next-line */ }, [role]);
  useEffect(() => { cargarPlan(); /* eslint-disable-next-line */ }, [ownerName, weekStart]);

  const tareaById = useMemo(() => Object.fromEntries(tareas.map(t => [t.id, t])), [tareas]);
  const funcionById = useMemo(() => Object.fromEntries(funciones.map(f => [f.id, f])), [funciones]);

  const asignacion = (tareaId: string, fecha: string) => plan.find(p => p.tarea_id === tareaId && p.fecha === fecha);

  const toggleAsignacion = async (tareaId: string, fecha: string) => {
    if (isReadOnly) return;
    const existente = asignacion(tareaId, fecha);
    if (existente) {
      await supabase.from('lider_plan').delete().eq('id', existente.id);
      setPlan(p => p.filter(x => x.id !== existente.id));
    } else {
      const row: Plan = { id: uid(), owner: ownerName || '', role, fecha, tarea_id: tareaId, done: false };
      const { error } = await supabase.from('lider_plan').insert(row);
      if (error) { alert('Error al asignar: ' + error.message); return; }
      setPlan(p => [...p, row]);
    }
  };

  const agregarAdhoc = async (fecha: string) => {
    if (isReadOnly) return;
    const titulo = adhocTitulo.trim();
    if (!titulo) return;
    const row: Plan = { id: uid(), owner: ownerName || '', role, fecha, tarea_id: null, titulo, done: false };
    const { error } = await supabase.from('lider_plan').insert(row);
    if (error) { alert('Error al agregar la tarea: ' + error.message); return; }
    setPlan(p => [...p, row]);
    setAdhocTitulo(''); setAdhocFecha(null);
  };

  const quitarPlan = async (id: string) => {
    if (isReadOnly) return;
    await supabase.from('lider_plan').delete().eq('id', id);
    setPlan(p => p.filter(x => x.id !== id));
  };

  const toggleDone = async (p: Plan) => {
    if (isReadOnly) return;
    const nuevo = !p.done;
    await supabase.from('lider_plan').update({
      done: nuevo, done_by: nuevo ? (ownerName || '') : null, done_at: nuevo ? new Date().toISOString() : null,
    }).eq('id', p.id);
    setPlan(prev => prev.map(x => x.id === p.id ? { ...x, done: nuevo, done_by: nuevo ? ownerName : null } : x));
  };

  const copiarSemanaAnterior = async () => {
    if (isReadOnly) return;
    if (!ownerName) return;
    if (!window.confirm('¿Copiar la planificación de la semana anterior a esta semana?')) return;
    setSaving(true);
    try {
      const prevMon = new Date(weekMonday); prevMon.setDate(prevMon.getDate() - 7);
      const prevStart = fmtDate(prevMon);
      const prevEndD = new Date(prevMon); prevEndD.setDate(prevEndD.getDate() + 6);
      const prevEnd = fmtDate(prevEndD);
      const { data } = await supabase.from('lider_plan').select('*')
        .eq('owner', ownerName).gte('fecha', prevStart).lte('fecha', prevEnd);
      const yaHay = new Set(plan.map(p => `${p.tarea_id}|${p.fecha}`));
      const nuevos: Plan[] = [];
      (data || []).forEach((p: any, i: number) => {
        const d = new Date(`${p.fecha}T12:00:00`); d.setDate(d.getDate() + 7);
        const f = fmtDate(d);
        const key = `${p.tarea_id}|${f}`;
        if (yaHay.has(key)) return;
        yaHay.add(key);
        nuevos.push({ id: `${Date.now()}${i}${Math.random().toString(36).slice(2, 6)}`, owner: ownerName, role, fecha: f, tarea_id: p.tarea_id, done: false });
      });
      if (nuevos.length) {
        const { error } = await supabase.from('lider_plan').insert(nuevos);
        if (error) throw error;
        setPlan(prev => [...prev, ...nuevos]);
      }
      alert(`Se copiaron ${nuevos.length} asignación(es) de la semana anterior.`);
    } catch (e: any) { alert('Error al copiar: ' + (e.message || e)); }
    setSaving(false);
  };

  const totalAsignadas = plan.length;
  const totalHechas = plan.filter(p => p.done).length;
  const rangoLabel = `${weekDays[0].getDate()} ${MESES[weekDays[0].getMonth()].slice(0, 3)} — ${weekDays[6].getDate()} ${MESES[weekDays[6].getMonth()].slice(0, 3)} ${weekDays[6].getFullYear()}`;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Barra: navegación mes/semana + copiar */}
      <div className="bg-bg-sidebar border border-border-dim rounded-lg p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => { const d = new Date(weekMonday); d.setDate(d.getDate() - 7); setWeekMonday(d); }}
            className="p-1.5 rounded border border-border-dim text-text-dim hover:text-brand-500 hover:border-brand-500/50"><ChevronLeft size={16} /></button>
          <div className="text-center min-w-[190px]">
            <p className="text-[11px] font-black uppercase tracking-widest text-text-main flex items-center justify-center gap-1.5">
              <CalendarDays size={13} className="text-brand-500" /> {rangoLabel}
            </p>
            <p className="text-[8px] font-bold uppercase text-text-dim tracking-widest">{MESES[weekMonday.getMonth()]} {weekMonday.getFullYear()}</p>
          </div>
          <button onClick={() => { const d = new Date(weekMonday); d.setDate(d.getDate() + 7); setWeekMonday(d); }}
            className="p-1.5 rounded border border-border-dim text-text-dim hover:text-brand-500 hover:border-brand-500/50"><ChevronRight size={16} /></button>
          <button onClick={() => setWeekMonday(getMonday(new Date()))}
            className="ml-1 px-2.5 py-1 rounded border border-border-dim text-[9px] font-black uppercase tracking-widest text-text-dim hover:text-brand-500 hover:border-brand-500/50">Hoy</button>
        </div>
        <div className="flex items-center gap-3">
          {totalAsignadas > 0 && (
            <span className="text-[9px] font-black uppercase tracking-widest text-text-dim">
              Cumplimiento <span className={cn("font-mono", totalHechas === totalAsignadas ? "text-emerald-500" : "text-amber-500")}>{totalHechas}/{totalAsignadas}</span>
            </span>
          )}
          {!isReadOnly && (
            <button onClick={copiarSemanaAnterior} disabled={saving}
              className="flex items-center gap-1.5 bg-bg-card border border-border-dim px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest text-text-dim hover:text-brand-500 hover:border-brand-500/50 transition-all disabled:opacity-50">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />} Copiar semana anterior
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center gap-2 text-text-dim">
          <Loader2 size={26} className="animate-spin text-brand-500" />
          <p className="text-[10px] font-bold uppercase tracking-widest">Cargando la semana…</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Izquierda: días de la semana con sus tareas */}
          <div className="space-y-2">
            {weekDays.map((d, i) => {
              const f = fmtDate(d);
              const delDia = plan.filter(p => p.fecha === f);
              return (
                <div key={f} className="bg-bg-sidebar border border-border-dim rounded-lg p-3">
                  <div className="flex items-center justify-between border-b border-border-dim/40 pb-1.5 mb-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-brand-500">
                      {DIAS_LABEL[i]} {String(d.getDate()).padStart(2, '0')}/{String(d.getMonth() + 1).padStart(2, '0')}
                    </p>
                    <span className="text-[8px] font-black uppercase text-text-dim">{delDia.length} tareas</span>
                  </div>
                  <div className="space-y-1.5">
                    {delDia.length === 0 && (
                      <p className="text-[9px] font-bold uppercase text-text-dim opacity-50 py-1 text-center">Sin tareas asignadas</p>
                    )}
                    {delDia.map(p => {
                      const t = p.tarea_id ? tareaById[p.tarea_id] : null;
                      const fn = t ? funcionById[t.funcion_id] : null;
                      const titulo = t ? t.title : (p.titulo || '(tarea)');
                      return (
                        <div key={p.id} className={cn("flex items-start gap-2 rounded border px-2.5 py-1.5",
                          p.done ? "bg-emerald-500/5 border-emerald-500/30" : "bg-bg-card border-border-dim")}>
                          <button onClick={() => toggleDone(p)} disabled={isReadOnly}
                            className={cn("w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                              p.done ? "bg-emerald-500 border-emerald-500" : "border-border-dim",
                              isReadOnly ? "cursor-default opacity-70" : "hover:border-brand-500 cursor-pointer")}>
                            {p.done && <Check size={10} className="text-white" strokeWidth={3} />}
                          </button>
                          <div className="flex-1 min-w-0">
                            <p className={cn("text-[10px] font-bold uppercase leading-tight", p.done ? "text-text-dim line-through" : "text-text-main")}>{titulo}</p>
                            {fn ? (
                              <p className="text-[7px] font-black uppercase text-text-dim/70 mt-0.5">{fn.name}</p>
                            ) : !p.tarea_id ? (
                              <p className="text-[7px] font-black uppercase text-amber-500/80 mt-0.5">Tarea suelta</p>
                            ) : null}
                          </div>
                          {!isReadOnly && (
                            <button onClick={() => quitarPlan(p.id)} className="text-text-dim hover:text-red-500 shrink-0" title="Quitar de este día"><X size={12} /></button>
                          )}
                        </div>
                      );
                    })}
                    {!isReadOnly && (
                      adhocFecha === f ? (
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <input
                            type="text"
                            value={adhocTitulo}
                            onChange={e => setAdhocTitulo(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') agregarAdhoc(f); if (e.key === 'Escape') { setAdhocFecha(null); setAdhocTitulo(''); } }}
                            autoFocus
                            placeholder="Tarea suelta para este día…"
                            className="flex-1 bg-bg-card border border-brand-500/60 rounded px-2 py-1 text-[10px] font-bold text-text-main outline-none"
                          />
                          <button onClick={() => agregarAdhoc(f)} className="text-emerald-500 hover:text-emerald-400 shrink-0"><Check size={14} /></button>
                          <button onClick={() => { setAdhocFecha(null); setAdhocTitulo(''); }} className="text-text-dim hover:text-text-main shrink-0"><X size={14} /></button>
                        </div>
                      ) : (
                        <button onClick={() => { setAdhocFecha(f); setAdhocTitulo(''); }}
                          className="w-full flex items-center justify-center gap-1 border border-dashed border-border-dim rounded px-2 py-1 text-[8px] font-black uppercase tracking-widest text-text-dim hover:text-brand-500 hover:border-brand-500/50 transition-all">
                          <Plus size={10} /> Tarea suelta
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Derecha: biblioteca por función con chips de día para asignar */}
          <div className="space-y-3">
            <div className="bg-bg-sidebar border border-border-dim rounded-lg p-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-text-dim flex items-center gap-1.5">
                <Layers size={12} className="text-brand-500" /> {roleLabel ? `${roleLabel} · ` : ''}Asigná tocando el día (LU · MA · MI · JU · VI · SA · DO)
              </p>
            </div>
            {funciones.length === 0 ? (
              <p className="text-center text-[10px] font-bold uppercase text-text-dim py-8">
                No hay funciones en la biblioteca. Cargalas en la pestaña "Biblioteca".
              </p>
            ) : funciones.map(f => {
              const tf = tareas.filter(t => t.funcion_id === f.id);
              if (tf.length === 0) return null;
              return (
                <div key={f.id} className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 bg-bg-accent/40 border-b border-border-dim">
                    <ListChecks size={13} className="text-brand-500 shrink-0" />
                    <span className="text-[10px] font-black uppercase text-text-main truncate">{f.name}</span>
                  </div>
                  <div className="p-2.5 space-y-2">
                    {tf.map(t => (
                      <div key={t.id} className="bg-bg-card border border-border-dim/60 rounded px-2.5 py-2">
                        <p className="text-[10px] font-bold uppercase text-text-main leading-tight">{t.title}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {weekDays.map((d, i) => {
                            const f2 = fmtDate(d);
                            const on = !!asignacion(t.id, f2);
                            return (
                              <button key={i} onClick={() => toggleAsignacion(t.id, f2)} disabled={isReadOnly}
                                title={`${DIAS_LABEL[i]} ${d.getDate()}/${d.getMonth() + 1}`}
                                className={cn("px-1.5 py-0.5 rounded text-[8px] font-black uppercase border transition-all",
                                  on ? "bg-brand-500 text-white border-brand-500" : "bg-bg-accent text-text-dim border-border-dim hover:border-brand-500/50",
                                  isReadOnly && "opacity-60 cursor-default")}>
                                {DIAS_SHORT[i]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}
