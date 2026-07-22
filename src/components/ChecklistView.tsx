/**
 * CHECK-LIST OPERATIVO
 *
 * Dos vistas en un mismo módulo:
 *  - "Mi Check-List": las tareas que le tocan HOY al usuario según su rol, para tildar.
 *  - "Armar Check-List": define las tareas recurrentes del rol que tiene a cargo.
 *      · El admin arma las de los líderes
 *      · El líder arma las de los encargados
 *
 * Las tareas son recurrentes por día de la semana (una tarea del "Lunes 10:00"
 * aparece todos los lunes) y las marcas se guardan por fecha.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { CheckSquare, Plus, Trash2, Clock, Calendar, ListChecks, Check, X, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';

const DIAS = [
  { id: 1, label: 'Lunes', short: 'LUN' },
  { id: 2, label: 'Martes', short: 'MAR' },
  { id: 3, label: 'Miércoles', short: 'MIÉ' },
  { id: 4, label: 'Jueves', short: 'JUE' },
  { id: 5, label: 'Viernes', short: 'VIE' },
  { id: 6, label: 'Sábado', short: 'SÁB' },
  { id: 0, label: 'Domingo', short: 'DOM' },
];

// Los roles se leen de roles_config: cada rol (Líder de Encargados, Líder de Cocina,
// Líder de Cocina y Depósito, Encargado, etc.) tiene su propio check-list.

interface ChecklistViewProps {
  branches: Branch[];
  selectedBranchId: string;
  currentUserRole?: string;
  currentUserName?: string;
  isReadOnly?: boolean;
  /** 'sucursal' = vista del encargado · 'lideres' = vista del líder */
  scope?: 'sucursal' | 'lideres';
}

interface Tarea {
  id: string;
  role: string;
  branch_id: string | null;
  task: string;
  weekday: number;
  time: string | null;
  created_by?: string;
}

interface RolConfig {
  id: string;
  name: string;
  access_scope?: string;
}

export default function ChecklistView({
  branches,
  selectedBranchId,
  currentUserRole,
  currentUserName,
  isReadOnly,
  scope = 'sucursal'
}: ChecklistViewProps) {
  const roleKey = String(currentUserRole || '').toLowerCase();
  const esAdmin = roleKey === 'administrador';
  // Armar el check-list SOLO se habilita desde Gestión Líderes Operativos (scope 'lideres').
  // En Gestión Sucursal el encargado únicamente ve y marca las tareas ya armadas.
  const puedeArmar = scope === 'lideres' && (esAdmin || roleKey.includes('lider') || roleKey.includes('líder'));

  const [activeTab, setActiveTab] = useState<'mias' | 'armar'>('mias');
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [rolesDisponibles, setRolesDisponibles] = useState<RolConfig[]>([]);
  // Rol para el que se están armando las tareas (lo elige quien administra)
  const [rolDestino, setRolDestino] = useState<string>('');
  const [marcas, setMarcas] = useState<Record<string, { id: string; done: boolean; by?: string }>>({});
  const [loading, setLoading] = useState(false);

  // Las tareas que ve/marca este usuario son las de SU propio rol
  const miRol = roleKey;

  // Fecha sobre la que se marca (por defecto hoy)
  const [fecha, setFecha] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });

  const diaSemana = useMemo(() => {
    const [y, m, d] = fecha.split('-').map(Number);
    return new Date(y, m - 1, d).getDay();
  }, [fecha]);

  // --- Formulario de alta ---
  const [nuevaTarea, setNuevaTarea] = useState('');
  const [nuevosDias, setNuevosDias] = useState<number[]>([1]); // varios días de la semana
  const toggleDia = (id: number) => setNuevosDias(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const [nuevaHora, setNuevaHora] = useState('');
  const [nuevaSucursal, setNuevaSucursal] = useState('all');

  const cargarRoles = async () => {
    try {
      const { data } = await supabase.from('roles_config').select('id, name, access_scope').order('name');
      const roles = (data as RolConfig[]) || [];
      setRolesDisponibles(roles);
      // Preseleccionar un rol destino razonable según quién está mirando
      if (!rolDestino && roles.length > 0) {
        const buscado = scope === 'lideres'
          ? roles.find(r => String(r.id).toLowerCase().includes('lider') || String(r.name).toLowerCase().includes('líder'))
          : roles.find(r => String(r.id).toLowerCase().includes('encargado'));
        setRolDestino(buscado?.id || roles[0].id);
      }
    } catch { setRolesDisponibles([]); }
  };

  const cargarTareas = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('checklist_tasks').select('*').order('time');
      setTareas((data as Tarea[]) || []);
    } catch { setTareas([]); }
    setLoading(false);
  };

  const cargarMarcas = async () => {
    try {
      const { data } = await supabase
        .from('checklist_marks')
        .select('*')
        .eq('date', fecha)
        .eq('branch_id', selectedBranchId);
      const map: Record<string, { id: string; done: boolean; by?: string }> = {};
      (data || []).forEach((m: any) => { map[m.task_id] = { id: m.id, done: m.done, by: m.marked_by }; });
      setMarcas(map);
    } catch { setMarcas({}); }
  };

  useEffect(() => { cargarTareas(); cargarRoles(); }, []);
  useEffect(() => { cargarMarcas(); }, [fecha, selectedBranchId]);

  // Tareas que corresponden a este rol, este día y esta sucursal
  const misTareasHoy = useMemo(() => {
    return tareas.filter(t =>
      t.role === miRol &&
      t.weekday === diaSemana &&
      (!t.branch_id || t.branch_id === 'all' || t.branch_id === selectedBranchId)
    ).sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  }, [tareas, miRol, diaSemana, selectedBranchId]);

  // Tareas del rol que se está administrando (el elegido en el selector)
  const tareasQueArmo = useMemo(() => {
    if (!rolDestino) return [];
    return tareas.filter(t => t.role === rolDestino)
      .sort((a, b) => a.weekday - b.weekday || String(a.time || '').localeCompare(String(b.time || '')));
  }, [tareas, rolDestino]);

  const rolDestinoLabel = useMemo(() =>
    rolesDisponibles.find(r => r.id === rolDestino)?.name || rolDestino,
    [rolesDisponibles, rolDestino]);

  const toggleMarca = async (taskId: string) => {
    if (isReadOnly) return;
    if (!selectedBranchId) { alert('No hay sucursal seleccionada.'); return; }
    // Si el usuario ve "todas las sucursales" (líder), las marcas se guardan bajo 'all'.
    const marcaBranch = selectedBranchId === 'all' ? 'all' : selectedBranchId;
    const actual = marcas[taskId];
    const nuevoEstado = !actual?.done;
    const id = `${taskId}-${marcaBranch}-${fecha}`;
    const { error } = await supabase.from('checklist_marks').upsert({
      id,
      task_id: taskId,
      branch_id: marcaBranch,
      date: fecha,
      done: nuevoEstado,
      marked_by: currentUserName || '—',
      marked_at: new Date().toISOString()
    }, { onConflict: 'task_id,branch_id,date' });
    if (error) { alert('Error al guardar: ' + error.message); return; }
    await cargarMarcas();
  };

  const agregarTarea = async () => {
    if (!puedeArmar) return;
    if (!rolDestino) { alert('Elegí el rol para el que armás la tarea.'); return; }
    if (!nuevaTarea.trim()) { alert('Escribí la tarea.'); return; }
    if (nuevosDias.length === 0) { alert('Elegí al menos un día de la semana.'); return; }
    // Se crea una tarea por cada día elegido (mismo texto, hora, rol y sucursal)
    const base = {
      role: rolDestino,
      branch_id: nuevaSucursal === 'all' ? null : nuevaSucursal,
      task: nuevaTarea.trim(),
      time: nuevaHora || null,
      created_by: currentUserName || '—',
      created_at: new Date().toISOString(),
    };
    const filas = nuevosDias.map((wd, idx) => ({
      id: `${Date.now()}${idx}${Math.random().toString(36).slice(2, 6)}`,
      ...base,
      weekday: wd,
    }));
    const { error } = await supabase.from('checklist_tasks').insert(filas);
    if (error) { alert('Error al guardar: ' + error.message); return; }
    setNuevaTarea(''); setNuevaHora('');
    await cargarTareas();
  };

  const borrarTarea = async (id: string) => {
    if (!window.confirm('¿Eliminar esta tarea del check-list?')) return;
    await supabase.from('checklist_tasks').delete().eq('id', id);
    await cargarTareas();
  };

  const cumplidas = misTareasHoy.filter(t => marcas[t.id]?.done).length;
  const totalHoy = misTareasHoy.length;
  const pct = totalHoy > 0 ? Math.round((cumplidas / totalHoy) * 100) : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Encabezado */}
      <div className="bg-bg-card border border-border-dim rounded-lg p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/10 p-2.5 rounded-lg"><CheckSquare className="text-brand-500" size={20} /></div>
            <div>
              <h2 className="text-base font-black uppercase text-text-main tracking-wider">Check-List Operativo</h2>
              <p className="text-[9px] text-text-dim uppercase font-bold">
                {scope === 'lideres' ? 'Tareas de líderes operativos' : 'Tareas de la sucursal'}
              </p>
            </div>
          </div>
          {puedeArmar && (
            <div className="flex gap-1 bg-bg-accent p-1 rounded-lg">
              <button onClick={() => setActiveTab('mias')}
                className={cn("px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                  activeTab === 'mias' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>
                Mi Check-List
              </button>
              <button onClick={() => setActiveTab('armar')}
                className={cn("px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                  activeTab === 'armar' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>
                Armar Check-Lists
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ─── MI CHECK-LIST ─── */}
      {activeTab === 'mias' && (
        <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-brand-500" />
              <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                className="bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-[10px] font-mono font-bold text-text-main outline-none focus:border-brand-500" />
              <span className="text-[9px] font-black uppercase text-text-dim">
                {DIAS.find(d => d.id === diaSemana)?.label}
              </span>
            </div>
            {totalHoy > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black uppercase text-text-dim">Cumplimiento</span>
                <span className={cn("text-sm font-mono font-black",
                  pct === 100 ? "text-emerald-500" : pct >= 50 ? "text-amber-500" : "text-red-500")}>
                  {cumplidas}/{totalHoy} · {pct}%
                </span>
              </div>
            )}
          </div>

          {loading ? (
            <p className="text-center text-[10px] font-bold uppercase text-text-dim py-8">Cargando…</p>
          ) : misTareasHoy.length === 0 ? (
            <p className="text-center text-[10px] font-bold uppercase text-text-dim py-10">
              No hay tareas cargadas para este día.
            </p>
          ) : (
            <div className="space-y-2">
              {misTareasHoy.map(t => {
                const marca = marcas[t.id];
                const hecha = marca?.done;
                return (
                  <div key={t.id}
                    onClick={() => toggleMarca(t.id)}
                    className={cn(
                      "flex items-center gap-3 p-3.5 rounded-lg border transition-all cursor-pointer",
                      hecha ? "bg-emerald-500/5 border-emerald-500/30" : "bg-bg-card border-border-dim hover:border-brand-500/40"
                    )}>
                    <div className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                      hecha ? "bg-emerald-500 border-emerald-500" : "border-border-dim"
                    )}>
                      {hecha && <Check size={13} className="text-white" strokeWidth={3} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-[11px] font-bold uppercase",
                        hecha ? "text-text-dim line-through" : "text-text-main")}>{t.task}</p>
                      {marca?.by && hecha && (
                        <p className="text-[8px] font-bold uppercase text-emerald-600 mt-0.5">Marcada por {marca.by}</p>
                      )}
                    </div>
                    {(() => {
                      const esTodas = !t.branch_id || t.branch_id === 'all';
                      const suc = esTodas ? 'Todas' : (branches.find(b => b.id === t.branch_id)?.name || t.branch_id);
                      return (
                        <span className={cn(
                          "text-[8px] font-black uppercase px-2 py-0.5 rounded shrink-0 flex items-center gap-1",
                          esTodas ? "text-text-dim bg-bg-accent border border-border-dim" : "text-brand-500 bg-brand-500/10"
                        )}>
                          <Users size={9} /> {suc}
                        </span>
                      );
                    })()}
                    {t.time && (
                      <span className="text-[9px] font-mono font-black text-text-dim flex items-center gap-1 shrink-0">
                        <Clock size={11} /> {t.time}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── ARMAR CHECK-LIST ─── */}
      {activeTab === 'armar' && puedeArmar && (
        <div className="space-y-4">
          {/* Selector del rol cuyo check-list se está armando */}
          <div className="bg-bg-card border border-brand-500/30 rounded-lg p-4 flex items-center gap-3 flex-wrap">
            <Users size={15} className="text-brand-500" />
            <span className="text-[10px] font-black uppercase tracking-widest text-text-main">Armar el check-list de:</span>
            <select value={rolDestino} onChange={e => setRolDestino(e.target.value)}
              className="flex-1 min-w-[200px] bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] font-black uppercase text-text-main outline-none focus:border-brand-500 cursor-pointer">
              {rolesDisponibles.length === 0 && <option value="">Sin roles configurados</option>}
              {rolesDisponibles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>

          {/* Alta */}
          <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-500 flex items-center gap-2">
              <Plus size={14} /> Nueva tarea para {rolDestinoLabel}
            </h3>
            <input type="text" value={nuevaTarea} onChange={e => setNuevaTarea(e.target.value)}
              placeholder="Tarea a realizar (ej. Controlar temperatura de heladeras)"
              className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500" />

            {/* Selección de días (varios) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[8px] font-black uppercase text-text-dim tracking-widest mr-1">Días:</span>
              {DIAS.map(d => (
                <button key={d.id} type="button" onClick={() => toggleDia(d.id)}
                  className={cn("px-2.5 py-1 rounded text-[9px] font-black uppercase border transition-all",
                    nuevosDias.includes(d.id)
                      ? "bg-brand-500 text-white border-brand-500"
                      : "bg-bg-accent text-text-dim border-border-dim hover:border-brand-500/50")}>
                  {d.short}
                </button>
              ))}
              <button type="button"
                onClick={() => setNuevosDias(nuevosDias.length === DIAS.length ? [] : DIAS.map(d => d.id))}
                className="ml-1 px-2.5 py-1 rounded text-[9px] font-black uppercase border border-border-dim text-text-dim hover:text-brand-500 hover:border-brand-500/50 transition-all">
                {nuevosDias.length === DIAS.length ? 'Ninguno' : 'Todos'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
              <input type="time" value={nuevaHora} onChange={e => setNuevaHora(e.target.value)}
                className="md:col-span-3 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] font-mono font-bold text-text-main outline-none focus:border-brand-500" />
              <select value={nuevaSucursal} onChange={e => setNuevaSucursal(e.target.value)}
                className="md:col-span-6 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[9px] font-black uppercase text-text-main outline-none focus:border-brand-500 cursor-pointer">
                <option value="all">Todas las sucursales</option>
                {branches.filter(b => b.id !== 'all').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button onClick={agregarTarea}
                className="md:col-span-3 bg-brand-500 hover:bg-brand-600 text-white rounded px-3 py-2 text-[9px] font-black uppercase transition-all">
                Agregar
              </button>
            </div>
            <p className="text-[8px] font-bold uppercase text-text-dim opacity-70">
              La tarea se repite todas las semanas en los días elegidos (se crea una por cada día).
            </p>
          </div>

          {/* Listado agrupado por día */}
          <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-500 flex items-center gap-2">
              <ListChecks size={14} /> Check-List de {rolDestinoLabel} ({tareasQueArmo.length})
            </h3>
            {tareasQueArmo.length === 0 ? (
              <p className="text-center text-[10px] font-bold uppercase text-text-dim py-8">
                Todavía no cargaste ninguna tarea.
              </p>
            ) : (
              DIAS.map(dia => {
                const delDia = tareasQueArmo.filter(t => t.weekday === dia.id);
                if (delDia.length === 0) return null;
                return (
                  <div key={dia.id} className="space-y-1.5">
                    <p className="text-[9px] font-black uppercase tracking-widest text-text-dim border-b border-border-dim/40 pb-1">
                      {dia.label} ({delDia.length})
                    </p>
                    {delDia.map(t => {
                      const esTodas = !t.branch_id || t.branch_id === 'all';
                      const suc = esTodas ? 'Todas las sucursales' : (branches.find(b => b.id === t.branch_id)?.name || t.branch_id);
                      return (
                        <div key={t.id} className="flex items-center gap-3 bg-bg-card border border-border-dim rounded px-3 py-2">
                          <span className="flex-1 text-[11px] font-bold uppercase text-text-main">{t.task}</span>
                          <span className={cn(
                            "text-[8px] font-black uppercase px-2 py-0.5 rounded shrink-0 flex items-center gap-1",
                            esTodas ? "text-text-dim bg-bg-accent border border-border-dim" : "text-brand-500 bg-brand-500/10"
                          )}>
                            <Users size={9} /> {suc}
                          </span>
                          {t.time && (
                            <span className="text-[9px] font-mono font-black text-text-dim shrink-0">{t.time}</span>
                          )}
                          {!isReadOnly && (
                            <button onClick={() => borrarTarea(t.id)} className="text-text-dim hover:text-red-500 shrink-0">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}
