/**
 * SPDX-License-Identifier: Apache-2.0
 * Tareas de mantenimiento (CRUD sobre la base de mantenimiento).
 */
import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { Loader2, Plus, Trash2, Pencil, X, ClipboardList, CalendarDays, ChevronLeft, ChevronRight, Wrench } from 'lucide-react';
import { supabaseMant } from '../lib/supabase';
import { cn } from '../lib/utils';

interface Asset { id: string; name: string; branch: string; }
interface Task {
  id: string; task_type: string; asset_id: string | null; branch: string; description: string;
  priority: string; scheduled_date: string; status: string; created_by: string; created_at: string;
  responsible: string; external_entity: string; supervisor: string;
  source_plan_id?: string | null; source_date?: string | null;
}

const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

// Suma (o resta, con n negativo) días a una fecha ISO 'YYYY-MM-DD' usando fecha local (sin toISOString para no correr el día por zona horaria)
const addDaysTo = (iso: string, n: number): string => {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
};

const STATUSES = ['sin_asignar', 'pendiente', 'en proceso', 'resuelto'] as const;
const ST_LBL: Record<string, string> = { sin_asignar: 'Pendientes de Asignar', pendiente: 'Pendiente', 'en proceso': 'En proceso', resuelto: 'Resuelto' };
const ST_CLR: Record<string, string> = { sin_asignar: 'text-blue-500 bg-blue-500/10', pendiente: 'text-red-500 bg-red-500/10', 'en proceso': 'text-amber-500 bg-amber-500/10', resuelto: 'text-emerald-500 bg-emerald-500/10' };
const ST_BORDER: Record<string, string> = { sin_asignar: '#3b82f6', pendiente: '#ef4444', 'en proceso': '#f59e0b', resuelto: '#10b981' };

const emptyTask = (branch: string): Partial<Task> => ({
  task_type: 'especifico', asset_id: '', branch, description: '', priority: 'normal',
  scheduled_date: todayISO(), responsible: 'interno', status: 'pendiente', external_entity: '', supervisor: '',
});

export default function MantTasksView({ currentUser }: { currentUser?: { name?: string } }) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [fBranch, setFBranch] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fAsset, setFAsset] = useState(''); // filtro por bien/activo
  const [reparaciones, setReparaciones] = useState<any[]>([]); // costos registrados (tabla reparaciones)
  const [editing, setEditing] = useState<Partial<Task> | null>(null);
  // Vista: lista (tablero) o almanaque (calendario)
  const [vista, setVista] = useState<'lista' | 'calendario'>('lista');
  const [calMonth, setCalMonth] = useState<string>(() => todayISO().slice(0, 7));

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const getAll = async (table: string, cols: string) => {
        let all: any[] = []; let from = 0; const step = 1000;
        while (true) {
          const { data, error } = await supabaseMant.from(table).select(cols).range(from, from + step - 1);
          if (error) throw error;
          if (data && data.length > 0) { all = all.concat(data); if (data.length < step) break; from += step; } else break;
        }
        return all;
      };
      const [t, a, planes, descartadas, reps] = await Promise.all([
        getAll('tareas', '*'),
        getAll('activos', 'id, name, branch'),
        getAll('mantenimientos', '*'),
        getAll('tareas_descartadas', '*'),
        getAll('reparaciones', 'id, asset_id, total_cost, date').catch(() => []),
      ]);
      setReparaciones((reps as any[]) || []);

      // --- Generación automática de tareas desde los planes preventivos ---
      // Por cada plan, se proyectan las fechas (next_date ± intervalo) dentro del año en curso.
      // Se crea la tarea solo si no existe ya (mismo plan + misma fecha) y no fue descartada.
      let tareasActuales = t as Task[];
      try {
        const yearNow = new Date().getFullYear();
        const yearStart = `${yearNow}-01-01`;
        const yearEnd = `${yearNow}-12-31`;

        // Claves ya existentes (plan+fecha) entre las tareas y entre las descartadas
        const existentes = new Set<string>();
        tareasActuales.forEach(tk => { if (tk.source_plan_id && tk.source_date) existentes.add(`${tk.source_plan_id}|${tk.source_date}`); });
        (descartadas as any[]).forEach(d => { if (d.source_plan_id && d.source_date) existentes.add(`${d.source_plan_id}|${d.source_date}`); });

        const nuevas: any[] = [];
        for (const p of (planes as any[])) {
          const intervalo = Number(p.interval_days);
          if (!p.next_date || !intervalo || intervalo <= 0) continue;

          // Reunir todas las ocurrencias del año: desde next_date hacia atrás y hacia adelante
          const fechas: string[] = [];
          // hacia atrás (incluida next_date)
          let f = p.next_date;
          let guard = 0;
          while (f >= yearStart && guard < 400) {
            if (f <= yearEnd) fechas.push(f);
            f = addDaysTo(f, -intervalo);
            guard++;
          }
          // hacia adelante
          f = addDaysTo(p.next_date, intervalo);
          guard = 0;
          while (f <= yearEnd && guard < 400) {
            if (f >= yearStart) fechas.push(f);
            f = addDaysTo(f, intervalo);
            guard++;
          }

          for (const fecha of fechas) {
            const clave = `${p.id}|${fecha}`;
            if (existentes.has(clave)) continue;
            existentes.add(clave); // evita duplicar dentro de la misma corrida
            const tipo = p.maint_type || 'Mantenimiento';
            const desc = p.description ? `${tipo} — ${p.description}` : tipo;
            nuevas.push({
              id: uid(),
              task_type: 'preventivo',
              asset_id: p.asset_id || null,
              branch: p.branch || '',
              description: `Preventivo: ${desc}`,
              priority: 'normal',
              scheduled_date: fecha,
              status: 'pendiente',
              created_by: 'Plan Preventivo',
              responsible: 'interno',
              external_entity: '',
              supervisor: '',
              source_plan_id: p.id,
              source_date: fecha,
            });
          }
        }

        if (nuevas.length > 0) {
          const { error: insErr } = await supabaseMant.from('tareas').insert(nuevas);
          if (insErr) throw insErr;
          tareasActuales = tareasActuales.concat(nuevas as Task[]);
        }
      } catch (genErr: any) {
        // Si la generación falla, no rompemos la carga de tareas: solo lo registramos.
        console.error('Error generando tareas desde planes preventivos:', genErr);
      }

      setTasks(tareasActuales);
      setAssets(a as Asset[]);
      const { data: cfg } = await supabaseMant.from('configuracion').select('*').eq('id', 'branches').maybeSingle();
      if (cfg && cfg.data) setBranches(cfg.data);
    } catch (e: any) {
      console.error('Error cargando tareas:', e);
      setError(e.message || 'No se pudieron cargar las tareas.');
    }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, []);

  const assetById = useMemo(() => { const m: Record<string, Asset> = {}; assets.forEach(a => { m[a.id] = a; }); return m; }, [assets]);

  const branchOf = (t: Task) => t.branch || (t.asset_id ? assetById[t.asset_id]?.branch : '') || '';

  const filtered = useMemo(() => tasks.filter(t => {
    const tb = branchOf(t);
    if (fBranch && tb !== fBranch) return false;
    if (fStatus && t.status !== fStatus) return false;
    if (fAsset && t.asset_id !== fAsset) return false;
    return true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [tasks, fBranch, fStatus, fAsset, assetById]);

  // Activos disponibles para el filtro (opcionalmente acotados a la sucursal elegida)
  const assetsFiltro = useMemo(() =>
    assets.filter(a => !fBranch || a.branch === fBranch).sort((x, y) => x.name.localeCompare(y.name)),
    [assets, fBranch]);

  // Resumen del bien elegido: reparaciones, última intervención y costo total
  const resumenBien = useMemo(() => {
    if (!fAsset) return null;
    const act = assetById[fAsset];
    const tareasBien = tasks.filter(t => t.asset_id === fAsset);
    const resueltas = tareasBien.filter(t => t.status === 'resuelto');
    const fechas = tareasBien.map(t => t.scheduled_date).filter(Boolean).sort();
    const ultima = fechas.length ? fechas[fechas.length - 1] : null;
    const repsBien = reparaciones.filter(r => r.asset_id === fAsset);
    const costoTotal = repsBien.reduce((s, r) => s + (parseFloat(r.total_cost) || 0), 0);
    return { act, total: tareasBien.length, resueltas: resueltas.length, ultima, costoTotal, nReps: repsBien.length };
  }, [fAsset, tasks, reparaciones, assetById]);

  // Color estable por sucursal (para identificarla rápido en el calendario)
  const BRANCH_PALETTE = ['#6366f1', '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#0ea5e9', '#84cc16', '#e11d48', '#eab308', '#06b6d4'];
  const branchColor = useMemo(() => {
    const m: Record<string, string> = {};
    [...branches].sort().forEach((b, i) => { m[b] = BRANCH_PALETTE[i % BRANCH_PALETTE.length]; });
    return m;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches]);
  // Abreviatura corta de la sucursal (iniciales de palabras o primeras 3 letras)
  const abrevSuc = (name?: string) => {
    const c = (name || '').trim();
    if (!c) return '';
    const w = c.split(/\s+/).filter(Boolean);
    if (w.length >= 2) return (w[0][0] + w[1][0] + (w[2] ? w[2][0] : '')).toUpperCase();
    return c.slice(0, 3).toUpperCase();
  };

  // Modal con la lista completa de tareas de un día
  const [dayDetail, setDayDetail] = useState<string | null>(null);
  const fmtDMY = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const DIAS_SEM = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const nombreDiaDe = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return DIAS_SEM[new Date(y, m - 1, d).getDay()]; };
  const tareasDeFecha = (iso: string) => filtered.filter(t => t.scheduled_date === iso);

  const saveTask = async () => {
    if (!editing) return;
    if (!editing.description || !editing.branch) { alert('Completá la descripción y la sucursal.'); return; }
    setSaving(true);
    try {
      const payload = {
        id: editing.id || uid(),
        task_type: editing.task_type || 'especifico',
        asset_id: editing.asset_id || null,
        branch: editing.branch || '',
        description: editing.description || '',
        priority: editing.priority || 'normal',
        scheduled_date: editing.scheduled_date || '',
        status: editing.status || 'pendiente',
        created_by: editing.created_by || currentUser?.name || 'CRAFT',
        responsible: editing.responsible || 'interno',
        external_entity: editing.external_entity || '',
        supervisor: editing.supervisor || '',
      };
      const { error } = await supabaseMant.from('tareas').upsert(payload);
      if (error) throw error;
      setEditing(null);
      await loadAll();
    } catch (e: any) { alert('Error al guardar: ' + (e.message || e)); }
    setSaving(false);
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabaseMant.from('tareas').update({ status }).eq('id', id);
      if (error) throw error;
      setTasks(prev => prev.map(t => t.id === id ? { ...t, status } : t));
    } catch (e: any) { alert('Error al cambiar estado: ' + (e.message || e)); }
  };

  const deleteTask = async (t: Task) => {
    if (!window.confirm('¿Eliminar esta tarea? Esta acción no se puede deshacer.')) return;
    try {
      // Si la tarea fue generada por un plan preventivo, la registramos como descartada
      // para que no vuelva a generarse esa misma fecha al recargar.
      if (t.source_plan_id && t.source_date) {
        const { error: descErr } = await supabaseMant.from('tareas_descartadas').insert({
          id: uid(), source_plan_id: t.source_plan_id, source_date: t.source_date,
        });
        if (descErr) throw descErr;
      }
      const { error } = await supabaseMant.from('tareas').delete().eq('id', t.id);
      if (error) throw error;
      await loadAll();
    } catch (e: any) { alert('Error al eliminar: ' + (e.message || e)); }
  };

  if (loading) return <div className="py-24 flex justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>;
  if (error) return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 text-center">
      <p className="text-[11px] font-black text-red-500 uppercase tracking-widest mb-1">Error al cargar tareas</p>
      <p className="text-[10px] text-text-dim font-bold">{error}</p>
    </div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {/* Filtros y nuevo */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 flex flex-wrap gap-3 items-center">
        <select value={fBranch} onChange={e => setFBranch(e.target.value)}
          className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
          <option value="">Todas las sucursales</option>
          {branches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={fStatus} onChange={e => setFStatus(e.target.value)}
          className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none">
          <option value="">Todos los estados</option>
          {STATUSES.map(s => <option key={s} value={s}>{ST_LBL[s]}</option>)}
        </select>
        <select value={fAsset} onChange={e => setFAsset(e.target.value)}
          className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none max-w-[220px]">
          <option value="">Todos los bienes</option>
          {assetsFiltro.map(a => <option key={a.id} value={a.id}>{a.name}{fBranch ? '' : ` · ${a.branch}`}</option>)}
        </select>
        <span className="text-[10px] font-black text-text-dim uppercase tracking-widest">{filtered.length} tarea(s)</span>
        <div className="flex gap-1 bg-bg-accent rounded-lg p-1">
          <button onClick={() => setVista('lista')}
            className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
              vista === 'lista' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>
            <ClipboardList size={12} /> Tablero
          </button>
          <button onClick={() => setVista('calendario')}
            className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5",
              vista === 'calendario' ? "bg-brand-500 text-white" : "text-text-dim hover:text-text-main")}>
            <CalendarDays size={12} /> Calendario
          </button>
        </div>
        <button onClick={() => setEditing(emptyTask(branches[0] || ''))}
          className="ml-auto bg-brand-500 text-white px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center gap-2">
          <Plus size={14} /> Nueva tarea
        </button>
      </div>

      {/* Resumen del bien elegido */}
      {resumenBien && (
        <div className="bg-bg-card border border-brand-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Wrench size={16} className="text-brand-500 shrink-0" />
              <div className="min-w-0">
                <p className="text-[12px] font-black uppercase text-text-main truncate">{resumenBien.act?.name || 'Bien'}</p>
                <p className="text-[8px] font-bold uppercase text-text-dim">{resumenBien.act?.branch || '—'}</p>
              </div>
            </div>
            <div className="flex items-center gap-5 flex-wrap">
              <div className="text-center">
                <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Reparaciones</p>
                <p className="text-base font-mono font-black text-text-main">{resumenBien.total}<span className="text-[9px] text-emerald-500 ml-1">{resumenBien.resueltas} ok</span></p>
              </div>
              <div className="text-center">
                <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Última intervención</p>
                <p className="text-[12px] font-mono font-black text-text-main">{resumenBien.ultima ? fmtDMY(resumenBien.ultima) : '—'}</p>
              </div>
              <div className="text-center">
                <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Costo total</p>
                <p className="text-[12px] font-mono font-black text-brand-500">{resumenBien.nReps > 0 ? '$' + Math.round(resumenBien.costoTotal).toLocaleString('es-AR') : 'Sin costos'}</p>
                {resumenBien.nReps > 0 && <p className="text-[7px] font-bold uppercase text-text-dim">{resumenBien.nReps} registro(s)</p>}
              </div>
              <button onClick={() => setFAsset('')} className="text-text-dim hover:text-red-500" title="Quitar filtro"><X size={16} /></button>
            </div>
          </div>
        </div>
      )}

      {/* Vista calendario */}
      {vista === 'calendario' && (() => {
        const [cy, cm] = calMonth.split('-').map(Number);
        const primerDia = new Date(cy, cm - 1, 1);
        const diasEnMes = new Date(cy, cm, 0).getDate();
        const offset = (primerDia.getDay() + 6) % 7; // lunes=0
        const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const celdas: (number | null)[] = [];
        for (let i = 0; i < offset; i++) celdas.push(null);
        for (let d = 1; d <= diasEnMes; d++) celdas.push(d);
        const tareasDia = (d: number) => {
          const ds = `${cy}-${String(cm).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          return filtered.filter(t => t.scheduled_date === ds);
        };
        const cambiarMes = (delta: number) => {
          const nd = new Date(cy, cm - 1 + delta, 1);
          setCalMonth(`${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}`);
        };
        const hoy = todayISO();
        return (
          <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => cambiarMes(-1)} className="text-text-dim hover:text-brand-500 p-1"><ChevronLeft size={18} /></button>
              <h3 className="text-[12px] font-black uppercase text-text-main tracking-widest">{MESES[cm-1]} {cy}</h3>
              <button onClick={() => cambiarMes(1)} className="text-text-dim hover:text-brand-500 p-1"><ChevronRight size={18} /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 mb-1">
              {['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(d => (
                <div key={d} className="text-center text-[8px] font-black uppercase text-text-dim tracking-widest py-1">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {celdas.map((d, i) => {
                if (d === null) return <div key={`e${i}`} className="min-h-[90px]" />;
                const ds = `${cy}-${String(cm).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
                const tdia = tareasDia(d);
                const esHoy = ds === hoy;
                return (
                  <div key={d} onClick={() => tdia.length > 0 && setDayDetail(ds)}
                    className={cn("min-h-[90px] border rounded-lg p-1.5 flex flex-col gap-1 overflow-hidden transition-colors",
                      tdia.length > 0 && "cursor-pointer hover:border-brand-500/60",
                      esHoy ? "border-brand-500 bg-brand-500/5" : "border-border-dim/40 bg-bg-accent/10")}>
                    <div className="flex items-center justify-between">
                      <span className={cn("text-[10px] font-black", esHoy ? "text-brand-500" : "text-text-dim")}>{d}</span>
                      {tdia.length > 0 && <span className="text-[8px] font-black text-text-dim bg-bg-accent rounded px-1">{tdia.length}</span>}
                    </div>
                    <div className="flex flex-col gap-0.5 overflow-y-auto">
                      {tdia.slice(0, 4).map(t => {
                        const tb = branchOf(t);
                        return (
                          <button key={t.id} onClick={e => { e.stopPropagation(); setEditing(t); }}
                            className="flex items-center gap-1 text-left text-[8px] font-bold uppercase px-1 py-0.5 rounded hover:opacity-80 transition-opacity"
                            style={{ backgroundColor: ST_BORDER[t.status] + '22', color: ST_BORDER[t.status] }}
                            title={`${tb ? tb + ' · ' : ''}${t.description}`}>
                            {tb && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: branchColor[tb] || '#94a3b8' }} />}
                            <span className="truncate">{tb ? `${abrevSuc(tb)} · ` : ''}{t.description || t.task_type}</span>
                          </button>
                        );
                      })}
                      {tdia.length > 4 && <span className="text-[8px] font-bold text-brand-500 px-1">+{tdia.length - 4} más</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Referencia de colores: estado (fondo del chip) */}
            <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-border-dim/40">
              <span className="text-[8px] font-black uppercase text-text-dim/60 tracking-widest self-center">Estado:</span>
              {STATUSES.map(s => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: ST_BORDER[s] }} />
                  <span className="text-[8px] font-black uppercase text-text-dim tracking-widest">{ST_LBL[s]}</span>
                </div>
              ))}
            </div>
            {/* Referencia de colores: sucursal (puntito del chip) */}
            {branches.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-2">
                <span className="text-[8px] font-black uppercase text-text-dim/60 tracking-widest self-center">Sucursal:</span>
                {[...branches].sort().map(b => (
                  <div key={b} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: branchColor[b] || '#94a3b8' }} />
                    <span className="text-[8px] font-black uppercase text-text-dim tracking-widest">{abrevSuc(b)} · {b}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      {/* Lista agrupada por estado */}
      {vista === 'lista' && STATUSES.map(status => {
        const ts = filtered.filter(t => t.status === status);
        if (!ts.length) return null;
        return (
          <div key={status} className="space-y-2">
            <h4 className="text-[10px] font-black uppercase tracking-widest flex items-center gap-2 px-1">
              <span className={cn("px-2 py-0.5 rounded", ST_CLR[status])}>{ST_LBL[status]} ({ts.length})</span>
            </h4>
            <div className="space-y-2">
              {ts.map(t => {
                const a = t.asset_id ? assetById[t.asset_id] : null;
                const tb = t.branch || (a && a.branch) || '';
                const isGen = t.task_type === 'general';
                return (
                  <div key={t.id} className="bg-bg-sidebar border border-border-dim rounded-lg p-3 flex justify-between items-start gap-4"
                    style={{ borderLeftWidth: '3px', borderLeftColor: ST_BORDER[status] }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {isGen
                          ? <span className="text-[8px] bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded font-black uppercase">Tarea general</span>
                          : <span className="text-[11px] font-black text-text-main uppercase">{a?.name || 'Activo'}</span>}
                        {t.priority === 'urgente' && <span className="text-[8px] bg-red-500/15 text-red-500 px-2 py-0.5 rounded font-black uppercase">Urgente</span>}
                        {t.scheduled_date && <span className="text-[9px] text-text-dim font-mono">📅 {t.scheduled_date}</span>}
                        {tb && <span className="text-[9px] text-text-dim font-bold uppercase">{tb}</span>}
                      </div>
                      <p className="text-[12px] text-text-main">{t.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={cn("text-[8px] px-1.5 py-0.5 rounded font-black uppercase", t.responsible === 'interno' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500')}>
                          {t.responsible === 'interno' ? 'Técnico interno' : `Externo: ${t.external_entity || 'Tercerizado'}`}
                        </span>
                        {t.created_by && <span className="text-[8px] text-text-dim font-bold uppercase">{t.created_by}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <select value={t.status} onChange={e => updateStatus(t.id, e.target.value)}
                        className="bg-bg-accent border border-border-dim rounded px-2 py-1 text-[10px] font-bold text-text-main outline-none">
                        {STATUSES.map(s => <option key={s} value={s}>{ST_LBL[s]}</option>)}
                      </select>
                      <button onClick={() => setEditing({ ...t })} title="Editar" className="p-1.5 text-text-dim hover:text-brand-500 transition-colors"><Pencil size={14} /></button>
                      <button onClick={() => deleteTask(t)} title="Eliminar" className="p-1.5 text-text-dim hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {filtered.length === 0 && (
        <div className="py-16 text-center text-[10px] font-black uppercase text-text-dim">No hay tareas para mostrar</div>
      )}

      {/* Modal: lista completa de tareas de un día */}
      {dayDetail && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setDayDetail(null)}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-border-dim">
              <div className="flex items-center gap-2">
                <CalendarDays size={18} className="text-brand-500" />
                <div>
                  <h3 className="text-sm font-black uppercase text-text-main tracking-wide">{nombreDiaDe(dayDetail)} {fmtDMY(dayDetail)}</h3>
                  <p className="text-[9px] text-text-dim font-bold uppercase">{tareasDeFecha(dayDetail).length} tarea(s){fBranch ? ` · ${fBranch}` : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setEditing({ ...emptyTask(fBranch || branches[0] || ''), scheduled_date: dayDetail }); setDayDetail(null); }}
                  className="flex items-center gap-1.5 bg-brand-500 text-white px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest hover:bg-brand-600">
                  <Plus size={13} /> Nueva
                </button>
                <button onClick={() => setDayDetail(null)} className="p-1.5 text-text-dim hover:text-text-main"><X size={18} /></button>
              </div>
            </div>
            <div className="p-4 overflow-y-auto custom-scrollbar space-y-2">
              {tareasDeFecha(dayDetail).length === 0 ? (
                <p className="text-center text-[10px] font-bold uppercase text-text-dim py-8">No hay tareas para este día.</p>
              ) : tareasDeFecha(dayDetail).map(t => {
                const a = t.asset_id ? assetById[t.asset_id] : null;
                const tb = branchOf(t);
                const isGen = t.task_type === 'general';
                return (
                  <div key={t.id} className="bg-bg-sidebar border border-border-dim rounded-lg p-3 flex justify-between items-start gap-3"
                    style={{ borderLeftWidth: '3px', borderLeftColor: ST_BORDER[t.status] }}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {tb && (
                          <span className="flex items-center gap-1 text-[8px] font-black uppercase px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: (branchColor[tb] || '#94a3b8') + '22', color: branchColor[tb] || '#64748b' }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: branchColor[tb] || '#94a3b8' }} /> {tb}
                          </span>
                        )}
                        <span className={cn("text-[8px] px-2 py-0.5 rounded font-black uppercase", ST_CLR[t.status])}>{ST_LBL[t.status]}</span>
                        {t.priority === 'urgente' && <span className="text-[8px] bg-red-500/15 text-red-500 px-2 py-0.5 rounded font-black uppercase">Urgente</span>}
                        {isGen
                          ? <span className="text-[8px] bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded font-black uppercase">General</span>
                          : a?.name && <span className="text-[9px] font-black text-text-main uppercase">{a.name}</span>}
                      </div>
                      <p className="text-[12px] text-text-main">{t.description}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className={cn("text-[8px] px-1.5 py-0.5 rounded font-black uppercase", t.responsible === 'interno' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500')}>
                          {t.responsible === 'interno' ? 'Técnico interno' : `Externo: ${t.external_entity || 'Tercerizado'}`}
                        </span>
                        {t.created_by && <span className="text-[8px] text-text-dim font-bold uppercase">{t.created_by}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <select value={t.status} onChange={e => updateStatus(t.id, e.target.value)}
                        className="bg-bg-accent border border-border-dim rounded px-2 py-1 text-[9px] font-bold text-text-main outline-none">
                        {STATUSES.map(s => <option key={s} value={s}>{ST_LBL[s]}</option>)}
                      </select>
                      <button onClick={() => { setEditing({ ...t }); setDayDetail(null); }} title="Editar" className="p-1.5 text-text-dim hover:text-brand-500 transition-colors"><Pencil size={14} /></button>
                      <button onClick={() => deleteTask(t)} title="Eliminar" className="p-1.5 text-text-dim hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal alta/edición */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !saving && setEditing(null)}>
          <div className="bg-bg-card border border-border-dim rounded-xl max-w-xl w-full max-h-[88vh] overflow-hidden flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-border-dim">
              <h3 className="text-sm font-black uppercase text-text-main tracking-wide flex items-center gap-2">
                <ClipboardList size={16} className="text-brand-500" /> {editing.id ? 'Editar tarea' : 'Nueva tarea'}
              </h3>
              <button onClick={() => setEditing(null)} className="p-1.5 text-text-dim hover:text-text-main"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tipo">
                  <select value={editing.task_type || 'especifico'} onChange={e => setEditing({ ...editing, task_type: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500">
                    <option value="especifico">Sobre un activo</option>
                    <option value="general">General</option>
                  </select>
                </Field>
                <Field label="Sucursal *">
                  <select value={editing.branch || ''} onChange={e => setEditing({ ...editing, branch: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500">
                    <option value="">Seleccionar...</option>
                    {branches.map(b => <option key={b} value={b}>{b}</option>)}
                  </select>
                </Field>
              </div>
              {editing.task_type !== 'general' && (
                <Field label="Activo">
                  <select value={editing.asset_id || ''} onChange={e => setEditing({ ...editing, asset_id: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500">
                    <option value="">Seleccionar activo...</option>
                    {assets.filter(a => !editing.branch || a.branch === editing.branch).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </Field>
              )}
              <Field label="Descripción *"><textarea value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500 min-h-[70px]" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prioridad">
                  <select value={editing.priority || 'normal'} onChange={e => setEditing({ ...editing, priority: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500">
                    <option value="normal">Normal</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </Field>
                <Field label="Fecha programada"><input type="date" value={editing.scheduled_date || ''} onChange={e => setEditing({ ...editing, scheduled_date: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" /></Field>
                <Field label="Estado">
                  <select value={editing.status || 'pendiente'} onChange={e => setEditing({ ...editing, status: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500">
                    {STATUSES.map(s => <option key={s} value={s}>{ST_LBL[s]}</option>)}
                  </select>
                </Field>
                <Field label="Responsable">
                  <select value={editing.responsible || 'interno'} onChange={e => setEditing({ ...editing, responsible: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500">
                    <option value="interno">Técnico interno</option>
                    <option value="externo">Externo</option>
                  </select>
                </Field>
              </div>
              {editing.responsible === 'externo' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Entidad externa"><input value={editing.external_entity || ''} onChange={e => setEditing({ ...editing, external_entity: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" /></Field>
                  <Field label="Supervisa"><input value={editing.supervisor || ''} onChange={e => setEditing({ ...editing, supervisor: e.target.value })} className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-brand-500" /></Field>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-border-dim flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} disabled={saving} className="px-4 py-2 bg-bg-accent text-text-dim rounded-lg text-[10px] font-black uppercase tracking-widest hover:text-text-main">Cancelar</button>
              <button onClick={saveTask} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 disabled:opacity-60">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null} Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">{label}</label>
      {children}
    </div>
  );
}
