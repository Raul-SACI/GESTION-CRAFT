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
import LiderBibliotecaView from './LiderBibliotecaView';
import LiderSemanaView from './LiderSemanaView';

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
  weekday: number | null;         // día de la semana (solo diarias); null en periódicas
  tipo?: 'diaria' | 'semanal' | 'mensual';
  turno?: 'Mañana' | 'Tarde' | null; // solo diarias
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
  const esLider = esAdmin || roleKey.includes('lider') || roleKey.includes('líder');
  // Armar el check-list SOLO se habilita desde Gestión Líderes Operativos (scope 'lideres').
  const puedeArmar = scope === 'lideres' && esLider;
  // En Gestión Sucursal, un líder NO ve su propia agenda: monitorea el check-list de un rol
  // (encargado, cajero, jefe de cocina…) en una sucursal, para ver qué completaron y qué falta.
  const modoMonitoreo = scope === 'sucursal' && esLider;

  // Los líderes abren en "Mi Semana" (su tablero); los roles operativos en "Mi Check-List".
  const [activeTab, setActiveTab] = useState<'mias' | 'armar' | 'biblioteca' | 'semana'>(scope === 'lideres' ? 'semana' : 'mias');
  const [monitorRol, setMonitorRol] = useState<string>('');
  const [monitorBranch, setMonitorBranch] = useState<string>('');
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [rolesDisponibles, setRolesDisponibles] = useState<RolConfig[]>([]);
  // Rol para el que se están armando las tareas (lo elige quien administra)
  const [rolesDestino, setRolesDestino] = useState<string[]>([]); // se puede armar para varios roles a la vez
  const [marcas, setMarcas] = useState<Record<string, { id: string; done: boolean; by?: string }>>({});
  // Marcas de todo el período visible (semana + mes) para saber si una periódica ya se cumplió
  const [marcasMes, setMarcasMes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Turno con el que trabaja el subordinado (elige el suyo al abrir su check-list)
  const [miTurno, setMiTurno] = useState<'Mañana' | 'Tarde'>('Mañana');

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

  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Semana (Lunes→Domingo) que contiene la fecha elegida → para periódicas semanales
  const rangoSemana = useMemo(() => {
    const [y, m, d] = fecha.split('-').map(Number);
    const base = new Date(y, m - 1, d);
    const dow = base.getDay(); // 0=Dom … 6=Sáb
    const haciaLunes = dow === 0 ? -6 : 1 - dow;
    const lunes = new Date(y, m - 1, d + haciaLunes);
    const domingo = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 6);
    return { desde: ymd(lunes), hasta: ymd(domingo) };
  }, [fecha]);

  // Mes que contiene la fecha elegida → para periódicas mensuales
  const rangoMes = useMemo(() => {
    const [y, m] = fecha.split('-').map(Number);
    return { desde: ymd(new Date(y, m - 1, 1)), hasta: ymd(new Date(y, m, 0)) };
  }, [fecha]);

  // --- Formulario de alta ---
  const [nuevaTarea, setNuevaTarea] = useState('');
  const [nuevosDias, setNuevosDias] = useState<number[]>([1]); // varios días de la semana
  const toggleDia = (id: number) => setNuevosDias(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const [nuevoTipo, setNuevoTipo] = useState<'diaria' | 'semanal' | 'mensual'>('diaria');
  const [nuevoTurno, setNuevoTurno] = useState<'Mañana' | 'Tarde'>('Mañana');
  const [nuevaHora, setNuevaHora] = useState('');
  const [nuevasSucursales, setNuevasSucursales] = useState<string[]>(['all']); // 'all' = todas, o varias sucursales
  const toggleSucursal = (id: string) => {
    if (id === 'all') { setNuevasSucursales(['all']); return; }
    setNuevasSucursales(prev => {
      const sinAll = prev.filter(x => x !== 'all');
      const next = sinAll.includes(id) ? sinAll.filter(x => x !== id) : [...sinAll, id];
      return next.length === 0 ? ['all'] : next;
    });
  };

  const cargarRoles = async () => {
    try {
      const { data } = await supabase.from('roles_config').select('id, name, access_scope').order('name');
      const roles = (data as RolConfig[]) || [];
      setRolesDisponibles(roles);
      // Preseleccionar un rol destino razonable según quién está mirando
      if (rolesDestino.length === 0 && roles.length > 0) {
        const buscado = scope === 'lideres'
          ? roles.find(r => String(r.id).toLowerCase().includes('lider') || String(r.name).toLowerCase().includes('líder'))
          : roles.find(r => String(r.id).toLowerCase().includes('encargado'));
        setRolesDestino([buscado?.id || roles[0].id]);
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

  // Sucursal efectiva para las marcas: en monitoreo es la sucursal elegida por el líder
  const branchMarcas = modoMonitoreo ? monitorBranch : selectedBranchId;

  const cargarMarcas = async () => {
    if (!branchMarcas) { setMarcas({}); return; }
    try {
      const { data } = await supabase
        .from('checklist_marks')
        .select('*')
        .eq('date', fecha)
        .eq('branch_id', branchMarcas);
      const map: Record<string, { id: string; done: boolean; by?: string }> = {};
      (data || []).forEach((m: any) => { map[m.task_id] = { id: m.id, done: m.done, by: m.marked_by }; });
      setMarcas(map);
    } catch { setMarcas({}); }
  };

  // Carga las marcas de todo el período visible (unión de la semana y el mes de la fecha)
  const cargarMarcasMes = async () => {
    if (!branchMarcas) { setMarcasMes([]); return; }
    const desde = rangoSemana.desde < rangoMes.desde ? rangoSemana.desde : rangoMes.desde;
    const hasta = rangoSemana.hasta > rangoMes.hasta ? rangoSemana.hasta : rangoMes.hasta;
    try {
      const { data } = await supabase
        .from('checklist_marks')
        .select('*')
        .eq('branch_id', branchMarcas)
        .gte('date', desde)
        .lte('date', hasta);
      setMarcasMes(data || []);
    } catch { setMarcasMes([]); }
  };

  useEffect(() => { cargarTareas(); cargarRoles(); }, []);
  useEffect(() => { cargarMarcas(); cargarMarcasMes(); }, [fecha, branchMarcas]);

  // Roles que tienen al menos una tarea creada (para que el líder elija a quién monitorear).
  // Se excluyen los roles de líder (su agenda se ve/arma desde Gestión Líderes).
  const rolesConTareas = useMemo(() => {
    const idsConTareas = new Set(tareas.map(t => t.role));
    return rolesDisponibles.filter(r =>
      idsConTareas.has(r.id) && !/lider|líder/i.test(`${r.id} ${r.name}`));
  }, [tareas, rolesDisponibles]);

  // Defaults del monitoreo: primera sucursal real y primer rol con tareas
  useEffect(() => {
    if (!modoMonitoreo) return;
    if (!monitorBranch) {
      const real = branches.find(b => b.id !== 'all');
      if (real) setMonitorBranch(real.id);
    }
    if (!monitorRol && rolesConTareas.length > 0) setMonitorRol(rolesConTareas[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoMonitoreo, branches, rolesConTareas]);

  // Tareas propias (rol del usuario) — vista del encargado que ejecuta
  const misTareasHoy = useMemo(() => {
    return tareas.filter(t =>
      t.role === miRol &&
      t.weekday === diaSemana &&
      (!t.turno || t.turno === miTurno) &&
      (!t.branch_id || t.branch_id === 'all' || t.branch_id === selectedBranchId)
    ).sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  }, [tareas, miRol, diaSemana, miTurno, selectedBranchId]);

  // Periódicas (semanales/mensuales) del rol del subordinado — no dependen del día ni del turno
  const misPeriodicas = useMemo(() => {
    if (modoMonitoreo) return [];
    return tareas.filter(t =>
      t.role === miRol &&
      (t.tipo === 'semanal' || t.tipo === 'mensual') &&
      (!t.branch_id || t.branch_id === 'all' || t.branch_id === selectedBranchId)
    ).sort((a, b) => String(a.task).localeCompare(String(b.task)));
  }, [tareas, miRol, selectedBranchId, modoMonitoreo]);
  const misSemanales = useMemo(() => misPeriodicas.filter(t => t.tipo === 'semanal'), [misPeriodicas]);
  const misMensuales = useMemo(() => misPeriodicas.filter(t => t.tipo === 'mensual'), [misPeriodicas]);

  // ¿Una periódica ya se cumplió dentro de su período? Devuelve la marca (o null)
  const periodicaHecha = (t: Tarea) => {
    const rango = t.tipo === 'mensual' ? rangoMes : rangoSemana;
    return marcasMes.find((m: any) => m.task_id === t.id && m.done && m.date >= rango.desde && m.date <= rango.hasta) || null;
  };

  const togglePeriodica = async (t: Tarea) => {
    if (isReadOnly) return;
    if (!selectedBranchId) { alert('No hay sucursal seleccionada.'); return; }
    const marcaBranch = selectedBranchId === 'all' ? 'all' : selectedBranchId;
    const hecha = periodicaHecha(t);
    if (hecha) {
      // Destildar: se apaga la marca cumplida del período
      const { error } = await supabase.from('checklist_marks').update({ done: false }).eq('id', hecha.id);
      if (error) { alert('Error al guardar: ' + error.message); return; }
    } else {
      const id = `${t.id}-${marcaBranch}-${fecha}`;
      const { error } = await supabase.from('checklist_marks').upsert({
        id,
        task_id: t.id,
        branch_id: marcaBranch,
        date: fecha,
        done: true,
        marked_by: currentUserName || '—',
        marked_at: new Date().toISOString()
      }, { onConflict: 'task_id,branch_id,date' });
      if (error) { alert('Error al guardar: ' + error.message); return; }
    }
    await cargarMarcasMes();
    await cargarMarcas();
  };

  // Tareas del rol y sucursal que el líder está monitoreando
  const tareasMonitor = useMemo(() => {
    if (!modoMonitoreo || !monitorRol) return [];
    return tareas.filter(t =>
      t.role === monitorRol &&
      t.weekday === diaSemana &&
      (!t.branch_id || t.branch_id === 'all' || t.branch_id === monitorBranch)
    ).sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')));
  }, [tareas, monitorRol, monitorBranch, diaSemana, modoMonitoreo]);

  // Vista efectiva: monitoreo (líder) o mis tareas (rol operativo)
  const tareasVista = modoMonitoreo ? tareasMonitor : misTareasHoy;

  // Tareas del rol que se está administrando (el elegido en el selector)
  // Tareas de los roles seleccionados (para el contador del encabezado)
  const tareasQueArmo = useMemo(() =>
    tareas.filter(t => rolesDestino.includes(t.role)),
    [tareas, rolesDestino]);

  const tareasDeRol = (roleId: string) => tareas.filter(t => t.role === roleId)
    .sort((a, b) => (a.weekday ?? 99) - (b.weekday ?? 99) || String(a.time || '').localeCompare(String(b.time || '')));

  const nombreRol = (roleId: string) => rolesDisponibles.find(r => r.id === roleId)?.name || roleId;
  const rolesDestinoLabel = useMemo(() =>
    rolesDestino.map(nombreRol).join(', ') || '—',
    [rolesDisponibles, rolesDestino]);

  // Fila de una tarea en el listado de armado (reutilizable para diarias y periódicas)
  const filaTareaArmado = (t: Tarea) => {
    const esTodas = !t.branch_id || t.branch_id === 'all';
    const suc = esTodas ? 'Todas las sucursales' : (branches.find(b => b.id === t.branch_id)?.name || t.branch_id);
    return (
      <div key={t.id} className="flex items-center gap-2 bg-bg-card border border-border-dim rounded px-3 py-2">
        <span className="flex-1 text-[11px] font-bold uppercase text-text-main">{t.task}</span>
        {t.turno && (
          <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded shrink-0 text-amber-600 bg-amber-500/10 border border-amber-500/30">{t.turno}</span>
        )}
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
  };

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
    if (rolesDestino.length === 0) { alert('Elegí al menos un rol para el que armás la tarea.'); return; }
    if (!nuevaTarea.trim()) { alert('Escribí la tarea.'); return; }
    if (nuevoTipo === 'diaria' && nuevosDias.length === 0) { alert('Elegí al menos un día de la semana.'); return; }
    // Sucursales destino: 'all' (o vacío) = una sola fila para todas; si no, una por cada sucursal
    const sucursalesDestino: (string | null)[] = (nuevasSucursales.includes('all') || nuevasSucursales.length === 0)
      ? [null]
      : nuevasSucursales;
    const filas: any[] = [];
    let seq = 0;
    // La misma tarea se crea para cada rol × cada sucursal seleccionados
    rolesDestino.forEach(roleId => {
      sucursalesDestino.forEach(branchId => {
        const base = {
          role: roleId,
          branch_id: branchId,
          task: nuevaTarea.trim(),
          tipo: nuevoTipo,
          time: nuevaHora || null,
          created_by: currentUserName || '—',
          created_at: new Date().toISOString(),
        };
        if (nuevoTipo === 'diaria') {
          nuevosDias.forEach(wd => {
            filas.push({ id: `${Date.now()}${seq++}${Math.random().toString(36).slice(2, 6)}`, ...base, weekday: wd, turno: nuevoTurno });
          });
        } else {
          filas.push({ id: `${Date.now()}${seq++}${Math.random().toString(36).slice(2, 6)}`, ...base, weekday: null, turno: null });
        }
      });
    });
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

  const cumplidas = tareasVista.filter(t => marcas[t.id]?.done).length;
  const totalHoy = tareasVista.length;
  const pct = totalHoy > 0 ? Math.round((cumplidas / totalHoy) * 100) : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      {/* Encabezado */}
      <div className="bg-bg-card border border-border-dim rounded-lg p-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-brand-500/10 p-2.5 rounded-lg"><CheckSquare className="text-brand-500" size={20} /></div>
            <div>
              <h2 className="text-base font-black uppercase text-text-main tracking-wider">
                {scope === 'sucursal' ? 'Check-List Sucursal' : 'Check-List Operativo'}
              </h2>
              <p className="text-[9px] text-text-dim uppercase font-bold">
                {scope === 'lideres'
                  ? 'Tareas de líderes operativos'
                  : modoMonitoreo ? 'Seguimiento del check-list por rol y sucursal' : 'Tareas de la sucursal'}
              </p>
            </div>
          </div>
          {puedeArmar && (
            <div className="flex gap-1 bg-bg-accent p-1 rounded-lg">
              <button onClick={() => setActiveTab('semana')}
                className={cn("px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                  activeTab === 'semana' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>
                Mi Semana
              </button>
              <button onClick={() => setActiveTab('biblioteca')}
                className={cn("px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                  activeTab === 'biblioteca' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>
                Biblioteca
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
            {!modoMonitoreo && (
              <div className="flex items-center gap-1.5">
                <span className="text-[8px] font-black uppercase text-text-dim tracking-widest mr-1">Mi turno:</span>
                {(['Mañana', 'Tarde'] as const).map(tu => (
                  <button key={tu} type="button" onClick={() => setMiTurno(tu)}
                    className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase border transition-all",
                      miTurno === tu ? "bg-amber-500 text-white border-amber-500" : "bg-bg-accent text-text-dim border-border-dim hover:border-amber-500/50")}>
                    {tu}
                  </button>
                ))}
              </div>
            )}
            {modoMonitoreo && (
              <div className="flex items-center gap-2 flex-wrap">
                <select value={monitorBranch} onChange={e => setMonitorBranch(e.target.value)}
                  className="bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-[10px] font-black uppercase text-text-main outline-none focus:border-brand-500 cursor-pointer">
                  {branches.filter(b => b.id !== 'all').map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select value={monitorRol} onChange={e => setMonitorRol(e.target.value)}
                  className="bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-[10px] font-black uppercase text-text-main outline-none focus:border-brand-500 cursor-pointer">
                  {rolesConTareas.length === 0 && <option value="">Sin roles con check-list</option>}
                  {rolesConTareas.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
            )}
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
          ) : tareasVista.length === 0 && (modoMonitoreo || misPeriodicas.length === 0) ? (
            <p className="text-center text-[10px] font-bold uppercase text-text-dim py-10">
              {modoMonitoreo ? 'Este rol no tiene tareas para este día.' : 'No hay tareas cargadas para este día.'}
            </p>
          ) : tareasVista.length === 0 ? (
            <p className="text-[9px] font-bold uppercase text-text-dim px-1">Sin tareas diarias para el {miTurno === 'Mañana' ? 'turno mañana' : 'turno tarde'} de este día.</p>
          ) : (
            <div className="space-y-2">
              {tareasVista.map((t: Tarea) => {
                const marca = marcas[t.id];
                const hecha = marca?.done;
                return (
                  <div key={t.id}
                    onClick={() => { if (!modoMonitoreo) toggleMarca(t.id); }}
                    className={cn(
                      "flex items-center gap-3 p-3.5 rounded-lg border transition-all",
                      modoMonitoreo ? "cursor-default" : "cursor-pointer",
                      hecha
                        ? "bg-emerald-500/5 border-emerald-500/30"
                        : modoMonitoreo
                          ? "bg-red-500/5 border-red-500/30"
                          : "bg-bg-card border-border-dim hover:border-brand-500/40"
                    )}>
                    <div className={cn(
                      "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                      hecha ? "bg-emerald-500 border-emerald-500" : modoMonitoreo ? "border-red-500/50" : "border-border-dim"
                    )}>
                      {hecha && <Check size={13} className="text-white" strokeWidth={3} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-[11px] font-bold uppercase",
                        hecha ? "text-text-dim line-through" : "text-text-main")}>{t.task}</p>
                      {marca?.by && hecha ? (
                        <p className="text-[8px] font-bold uppercase text-emerald-600 mt-0.5">Marcada por {marca.by}</p>
                      ) : modoMonitoreo && !hecha ? (
                        <p className="text-[8px] font-black uppercase text-red-500 mt-0.5">Pendiente</p>
                      ) : null}
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

          {/* ─── PERIÓDICAS (semanales / mensuales): el subordinado las tilda una vez por período ─── */}
          {!modoMonitoreo && (misSemanales.length > 0 || misMensuales.length > 0) && (
            <div className="space-y-4 pt-2">
              {([
                { titulo: 'Semanales', desc: 'Una vez por semana', lista: misSemanales, color: 'emerald' },
                { titulo: 'Mensuales', desc: 'Una vez por mes', lista: misMensuales, color: 'blue' },
              ] as const).filter(g => g.lista.length > 0).map(grupo => (
                <div key={grupo.titulo} className="space-y-2">
                  <p className={cn("text-[9px] font-black uppercase tracking-widest border-b pb-1",
                    grupo.color === 'emerald' ? "text-emerald-500 border-emerald-500/30" : "text-blue-500 border-blue-500/30")}>
                    {grupo.titulo} · {grupo.desc} ({grupo.lista.length})
                  </p>
                  {grupo.lista.map((t: Tarea) => {
                    const marca = periodicaHecha(t);
                    const hecha = !!marca;
                    return (
                      <div key={t.id}
                        onClick={() => togglePeriodica(t)}
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
                          {hecha ? (
                            <p className="text-[8px] font-bold uppercase text-emerald-600 mt-0.5">
                              Cumplida {marca.date === fecha ? 'hoy' : `el ${marca.date}`}{marca.marked_by ? ` · ${marca.marked_by}` : ''}
                            </p>
                          ) : (
                            <p className="text-[8px] font-black uppercase text-text-dim mt-0.5">Pendiente del período</p>
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
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── MI SEMANA (tablero semanal) ─── */}
      {activeTab === 'semana' && puedeArmar && (
        <LiderSemanaView role={miRol} roleLabel={currentUserRole} ownerName={currentUserName} isReadOnly={isReadOnly} />
      )}

      {/* ─── BIBLIOTECA (Funciones → Tareas → Descripción) ─── */}
      {activeTab === 'biblioteca' && puedeArmar && (
        <LiderBibliotecaView role={miRol} roleLabel={currentUserRole} isReadOnly={isReadOnly} />
      )}

      {/* ─── ARMAR CHECK-LIST ─── */}
      {activeTab === 'armar' && puedeArmar && (
        <div className="space-y-4">
          {/* Selector de roles (uno o varios) cuyo check-list se está armando */}
          <div className="bg-bg-card border border-brand-500/30 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Users size={15} className="text-brand-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-text-main">Armar el check-list de:</span>
              <span className="text-[8px] font-bold uppercase text-text-dim">(podés elegir varios, ej. Encargado y Cajero)</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {rolesDestino.map(rid => (
                <span key={rid} className="flex items-center gap-1 bg-brand-500/10 text-brand-500 border border-brand-500/30 rounded px-2 py-1 text-[10px] font-black uppercase">
                  {nombreRol(rid)}
                  <button onClick={() => setRolesDestino(prev => prev.filter(x => x !== rid))} className="hover:text-red-500"><X size={11} /></button>
                </span>
              ))}
              <select value="" onChange={e => { const v = e.target.value; if (v && !rolesDestino.includes(v)) setRolesDestino(prev => [...prev, v]); }}
                className="bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-[10px] font-black uppercase text-text-main outline-none focus:border-brand-500 cursor-pointer">
                <option value="">+ Agregar rol…</option>
                {rolesDisponibles.filter(r => !rolesDestino.includes(r.id)).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>

          {/* Alta */}
          <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-500 flex items-center gap-2">
              <Plus size={14} /> Nueva tarea para {rolesDestinoLabel}
            </h3>
            <input type="text" value={nuevaTarea} onChange={e => setNuevaTarea(e.target.value)}
              placeholder="Tarea a realizar (ej. Controlar temperatura de heladeras)"
              className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500" />

            {/* Tipo de tarea */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[8px] font-black uppercase text-text-dim tracking-widest mr-1">Tipo:</span>
              {(['diaria', 'semanal', 'mensual'] as const).map(t => (
                <button key={t} type="button" onClick={() => setNuevoTipo(t)}
                  className={cn("px-3 py-1 rounded text-[9px] font-black uppercase border transition-all",
                    nuevoTipo === t ? "bg-brand-500 text-white border-brand-500" : "bg-bg-accent text-text-dim border-border-dim hover:border-brand-500/50")}>
                  {t}
                </button>
              ))}
            </div>

            {/* Turno + días: solo para diarias */}
            {nuevoTipo === 'diaria' && (
              <>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[8px] font-black uppercase text-text-dim tracking-widest mr-1">Turno:</span>
                  {(['Mañana', 'Tarde'] as const).map(tu => (
                    <button key={tu} type="button" onClick={() => setNuevoTurno(tu)}
                      className={cn("px-3 py-1 rounded text-[9px] font-black uppercase border transition-all",
                        nuevoTurno === tu ? "bg-amber-500 text-white border-amber-500" : "bg-bg-accent text-text-dim border-border-dim hover:border-amber-500/50")}>
                      {tu}
                    </button>
                  ))}
                </div>
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
              </>
            )}

            {/* Sucursales (una o varias, o Todas) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[8px] font-black uppercase text-text-dim tracking-widest mr-1">Sucursales:</span>
              <button type="button" onClick={() => toggleSucursal('all')}
                className={cn("px-2.5 py-1 rounded text-[9px] font-black uppercase border transition-all",
                  nuevasSucursales.includes('all') ? "bg-brand-500 text-white border-brand-500" : "bg-bg-accent text-text-dim border-border-dim hover:border-brand-500/50")}>
                Todas
              </button>
              {branches.filter(b => b.id !== 'all').map(b => (
                <button key={b.id} type="button" onClick={() => toggleSucursal(b.id)}
                  className={cn("px-2.5 py-1 rounded text-[9px] font-black uppercase border transition-all",
                    nuevasSucursales.includes(b.id) ? "bg-brand-500 text-white border-brand-500" : "bg-bg-accent text-text-dim border-border-dim hover:border-brand-500/50")}>
                  {b.name}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input type="time" value={nuevaHora} onChange={e => setNuevaHora(e.target.value)}
                className="w-28 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] font-mono font-bold text-text-main outline-none focus:border-brand-500" />
              <button onClick={agregarTarea}
                className="flex-1 min-w-[120px] bg-brand-500 hover:bg-brand-600 text-white rounded px-3 py-2 text-[9px] font-black uppercase transition-all">
                Agregar
              </button>
            </div>
            <p className="text-[8px] font-bold uppercase text-text-dim opacity-70">
              {nuevoTipo === 'diaria'
                ? 'Diaria: se repite en los días elegidos, en el turno indicado. La hora es opcional.'
                : nuevoTipo === 'semanal'
                  ? 'Semanal: se cumple una vez por semana (cualquier día). La hora es opcional.'
                  : 'Mensual: se cumple una vez por mes (cualquier día). La hora es opcional.'}
            </p>
          </div>

          {/* Listado: un bloque por cada rol seleccionado */}
          {rolesDestino.map(roleId => {
            const lista = tareasDeRol(roleId);
            const esDiaria = (t: Tarea) => t.tipo === 'diaria' || (!t.tipo && t.weekday != null);
            const semanales = lista.filter(t => t.tipo === 'semanal');
            const mensuales = lista.filter(t => t.tipo === 'mensual');
            return (
              <div key={roleId} className="bg-bg-sidebar border border-border-dim rounded-lg p-5 space-y-4">
                <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-500 flex items-center gap-2">
                  <ListChecks size={14} /> Check-List de {nombreRol(roleId)} ({lista.length})
                </h3>
                {lista.length === 0 ? (
                  <p className="text-center text-[10px] font-bold uppercase text-text-dim py-6">
                    Todavía no cargaste ninguna tarea para este rol.
                  </p>
                ) : (
                  <>
                    {DIAS.map(dia => {
                      const delDia = lista.filter(t => esDiaria(t) && t.weekday === dia.id);
                      if (delDia.length === 0) return null;
                      return (
                        <div key={dia.id} className="space-y-1.5">
                          <p className="text-[9px] font-black uppercase tracking-widest text-text-dim border-b border-border-dim/40 pb-1">
                            {dia.label} ({delDia.length})
                          </p>
                          {delDia.map(filaTareaArmado)}
                        </div>
                      );
                    })}
                    {semanales.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 border-b border-emerald-500/30 pb-1">Semanales ({semanales.length})</p>
                        {semanales.map(filaTareaArmado)}
                      </div>
                    )}
                    {mensuales.length > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 border-b border-blue-500/30 pb-1">Mensuales ({mensuales.length})</p>
                        {mensuales.map(filaTareaArmado)}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
