/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  ListTodo, Loader2, Plus, Trash2, CheckCircle2, Clock, AlertCircle,
  Calendar, Bot, User, Repeat, Building2, Filter
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';
import { supabase } from '../lib/supabase';

interface CurrentUser {
  id: string;
  name: string;
  role: string;
  accessScope: 'all_branches' | 'single_branch';
  branchId?: string;
  canSeePayments?: boolean;
}

interface TasksViewProps {
  branches: Branch[];
  currentUser: CurrentUser;
  isReadOnly?: boolean;
  canCreate?: boolean; // permiso de edición sobre el módulo
}

interface Task {
  id: string;
  description: string;
  notes: string;
  branchId: string;
  targetRole: string;
  targetUser: string;
  dueDate: string | null;
  priority: string;
  status: string;
  recurrence: string;
  recurrenceDay: number | null;
  createdBy: string;
}

const ROLE_OPTIONS = [
  { id: 'all', label: 'Todos los roles' },
  { id: 'encargado', label: 'Encargado' },
  { id: 'jefe_cocina', label: 'Jefe de Cocina' },
  { id: 'segundo_cocina', label: 'Segundo de Cocina' },
  { id: 'cocinero', label: 'Cocinero' },
  { id: 'caja', label: 'Caja' },
  { id: 'barra', label: 'Barra' },
  { id: 'mozos', label: 'Mozos' },
  { id: 'runners', label: 'Runners' },
  { id: 'bacha', label: 'Bacha' },
];

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

const todayStr = () => new Date().toISOString().split('T')[0];

export default function TasksView({ branches, currentUser, isReadOnly = false, canCreate = true }: TasksViewProps) {
  const operativeBranches = useMemo(() => branches.filter(b => !/almac/i.test(b.name)), [branches]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<Record<string, Set<string>>>({}); // taskId -> set de fechas completadas
  const [autoTasks, setAutoTasks] = useState<Array<{ id: string; description: string; detail: string; branchId: string; severity: 'overdue' | 'today' }>>([]);
  const [systemUsers, setSystemUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'today' | 'pending' | 'done' | 'all'>('today');
  const [showForm, setShowForm] = useState(false);

  const [newTask, setNewTask] = useState({
    description: '', notes: '', branchId: 'all', targetRole: 'all', targetUser: '',
    dueDate: todayStr(), priority: 'normal', recurrence: 'none', recurrenceDay: 1
  });

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('tasks').select('*').order('created_at', { ascending: false });
      setTasks((data || []).map((r: any) => ({
        id: r.id, description: r.description, notes: r.notes || '',
        branchId: r.branch_id || 'all', targetRole: r.target_role || 'all', targetUser: r.target_user || '',
        dueDate: r.due_date, priority: r.priority || 'normal', status: r.status || 'pending',
        recurrence: r.recurrence || 'none', recurrenceDay: r.recurrence_day, createdBy: r.created_by || ''
      })));
      // Completions de los últimos 60 días
      const since = new Date(); since.setDate(since.getDate() - 60);
      const { data: comps } = await supabase.from('task_completions').select('task_id, date').gte('date', since.toISOString().split('T')[0]);
      const map: Record<string, Set<string>> = {};
      (comps || []).forEach((c: any) => {
        if (!map[c.task_id]) map[c.task_id] = new Set();
        map[c.task_id].add(c.date);
      });
      setCompletions(map);
    } catch (e) { console.error('Error cargando tareas:', e); }
    setLoading(false);
  };

  useEffect(() => { fetchTasks(); }, []);

  // Cargar usuarios del sistema para el selector de destinatario
  useEffect(() => {
    const loadUsers = async () => {
      try {
        const { data } = await supabase.from('profiles').select('id, name').order('name');
        setSystemUsers((data || []).filter((u: any) => u && u.id && u.name).map((u: any) => ({ id: u.id, name: u.name })));
      } catch (e) { console.error('Error cargando usuarios:', e); }
    };
    loadUsers();
  }, []);

  // === Tareas automáticas (calculadas de otros módulos) ===
  const fetchAutoTasks = async () => {
    try {
      const today = todayStr();
      const month = today.slice(0, 7);
      const [y, m] = month.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const auto: Array<{ id: string; description: string; detail: string; branchId: string; severity: 'overdue' | 'today' }> = [];

      // Sucursales a chequear (según alcance del usuario)
      const branchesToCheck = isAdmin || currentUser.accessScope === 'all_branches'
        ? operativeBranches
        : operativeBranches.filter(b => b.id === currentUser.branchId);

      // 1. Días sin carga de horas (del mes, hasta hoy) por sucursal
      const { data: hourRows } = await supabase
        .from('hour_logs').select('branch_id, date')
        .gte('date', `${month}-01`).lte('date', `${month}-${String(lastDay).padStart(2, '0')}`);
      const loggedByBranch: Record<string, Set<string>> = {};
      (hourRows || []).forEach((r: any) => {
        if (!loggedByBranch[r.branch_id]) loggedByBranch[r.branch_id] = new Set();
        loggedByBranch[r.branch_id].add(r.date);
      });
      const limitDay = new Date().getDate();
      branchesToCheck.forEach(b => {
        const logged = loggedByBranch[b.id] || new Set();
        const missing: string[] = [];
        for (let d = 1; d <= limitDay; d++) {
          const ds = `${month}-${String(d).padStart(2, '0')}`;
          if (!logged.has(ds)) missing.push(String(d));
        }
        if (missing.length > 0) {
          auto.push({
            id: `auto-horas-${b.id}`,
            description: `Cargar horas (${b.name})`,
            detail: `Faltan ${missing.length} día(s): ${missing.join(', ')}`,
            branchId: b.id,
            severity: 'overdue'
          });
        }
      });

      // 2. Arqueo de caja central de hoy sin cargar (solo admin/tesorería - lo mostramos a quienes ven todas)
      if (isAdmin || currentUser.accessScope === 'all_branches') {
        const { data: arqueo } = await supabase.from('treasury_cash_count').select('date').eq('date', today).maybeSingle();
        if (!arqueo) {
          auto.push({ id: 'auto-arqueo', description: 'Cargar arqueo de Caja Central', detail: 'No se registró el arqueo de hoy', branchId: 'all', severity: 'today' });
        }
      }

      // 3. Supervisiones vencidas/pendientes por sucursal
      const { data: scheds } = await supabase.from('supervision_schedules').select('checklist_id, branch_id, frequency, start_date');
      const { data: resps } = await supabase.from('supervision_responses').select('branch_id, date, checklist_id');
      const freqDays: Record<string, number> = { semanal: 7, quincenal: 15, mensual: 30 };
      (scheds || []).forEach((sch: any) => {
        if (!branchesToCheck.find(b => b.id === sch.branch_id)) return;
        const days = freqDays[sch.frequency] || 7;
        const matching = (resps || [])
          .filter((r: any) => r.branch_id === sch.branch_id && r.checklist_id === sch.checklist_id)
          .sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
        const last = matching[0];
        const branchNm = branches.find(b => b.id === sch.branch_id)?.name || sch.branch_id;
        const todayD = new Date(today + 'T12:00:00');
        if (!last) {
          if (sch.start_date) {
            const due = new Date(sch.start_date + 'T12:00:00'); due.setDate(due.getDate() + days);
            if (todayD.getTime() >= due.getTime()) {
              auto.push({ id: `auto-sup-${sch.checklist_id}-${sch.branch_id}`, description: `Supervisión pendiente (${branchNm})`, detail: 'Vencida / nunca realizada', branchId: sch.branch_id, severity: 'overdue' });
            }
          }
        } else {
          const lastD = new Date(last.date + 'T12:00:00');
          const diff = Math.floor((todayD.getTime() - lastD.getTime()) / (1000 * 60 * 60 * 24));
          if (diff > days) {
            auto.push({ id: `auto-sup-${sch.checklist_id}-${sch.branch_id}`, description: `Supervisión vencida (${branchNm})`, detail: `Hace ${diff} días`, branchId: sch.branch_id, severity: 'overdue' });
          }
        }
      });

      setAutoTasks(prev => {
        const pays = prev.filter(t => t.id.startsWith('pay-'));
        return [...auto, ...pays];
      });
    } catch (e) { console.error('Error calculando tareas automáticas:', e); }
  };

  // Pagos previstos del Flujo de Caja como tareas (solo admin/tesorería)
  const fetchPaymentTasks = async () => {
    try {
      if (!(currentUser.canSeePayments === true)) return;
      const { data } = await supabase.from('finance_liabilities').select('type, notes').in('type', ['scheduled_payments', 'finance_entries']);
      if (!data) return;
      const today = todayStr();
      // Ventana: pagos vencidos o que vencen en los próximos 7 días
      const in7 = new Date(today + 'T12:00:00'); in7.setDate(in7.getDate() + 7);
      const in7Str = `${in7.getFullYear()}-${String(in7.getMonth() + 1).padStart(2, '0')}-${String(in7.getDate()).padStart(2, '0')}`;
      const pays: Array<{ id: string; description: string; detail: string; branchId: string; severity: 'overdue' | 'today' }> = [];

      data.forEach((row: any) => {
        let parsed: any = null;
        try { parsed = JSON.parse(row.notes); } catch (e) { return; }
        if (row.type === 'scheduled_payments' && Array.isArray(parsed)) {
          parsed.forEach((p: any) => {
            if (p.status === 'paid') return;
            const due = p.dueDate;
            if (!due || due > in7Str) return;
            const monto = Number(p.amount) || 0;
            const concepto = p.description || p.entity || p.bank || 'Pago';
            pays.push({
              id: `pay-${p.id}`,
              description: `Pagar: ${concepto} ($${monto.toLocaleString('es-AR')})`,
              detail: due < today ? `VENCIDO el ${due.split('-').reverse().join('/')}` : `Vence ${due.split('-').reverse().join('/')}`,
              branchId: 'all',
              severity: due < today ? 'overdue' : 'today'
            });
          });
        }
      });

      setAutoTasks(prev => {
        // Quitar pagos previos para no duplicar y agregar los nuevos
        const withoutPays = prev.filter(t => !t.id.startsWith('pay-'));
        return [...withoutPays, ...pays];
      });
    } catch (e) { console.error('Error calculando tareas de pagos:', e); }
  };

  useEffect(() => { fetchAutoTasks(); }, [currentUser, branches]);
  useEffect(() => { fetchPaymentTasks(); }, [currentUser]);

  const isAdmin = currentUser.role === 'administrador' || currentUser.role === 'dueño';

  // ¿Esta tarea le corresponde al usuario actual?
  const taskAppliesToUser = (t: Task): boolean => {
    if (isAdmin) return true;
    // Sucursal
    const branchOk = t.branchId === 'all' || t.branchId === currentUser.branchId || currentUser.accessScope === 'all_branches';
    // Rol
    const roleOk = t.targetRole === 'all' || t.targetRole === currentUser.role;
    // Usuario puntual
    const userOk = !t.targetUser || t.targetUser === currentUser.id;
    return branchOk && roleOk && userOk;
  };

  // ¿La tarea recurrente aplica para una fecha dada?
  const recurrenceAppliesOn = (t: Task, dateStr: string): boolean => {
    if (t.recurrence === 'none') return t.dueDate === dateStr || (!t.dueDate);
    const d = new Date(dateStr + 'T12:00:00');
    if (t.recurrence === 'daily') return true;
    if (t.recurrence === 'weekly') return d.getDay() === (t.recurrenceDay ?? 1);
    if (t.recurrence === 'monthly') return d.getDate() === (t.recurrenceDay ?? 1);
    return false;
  };

  const isCompletedOn = (t: Task, dateStr: string): boolean => {
    if (t.recurrence === 'none') return t.status === 'done';
    return completions[t.id]?.has(dateStr) || false;
  };

  const handleCreate = async () => {
    if (isReadOnly || !canCreate) { alert('No tenés permiso para crear tareas.'); return; }
    if (!newTask.description.trim()) { alert('Ingresá una descripción de la tarea.'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from('tasks').insert({
        description: newTask.description.trim(),
        notes: newTask.notes.trim() || null,
        branch_id: newTask.branchId,
        target_role: newTask.targetRole,
        target_user: newTask.targetUser || null,
        due_date: newTask.recurrence === 'none' ? (newTask.dueDate || null) : null,
        priority: newTask.priority,
        status: 'pending',
        recurrence: newTask.recurrence,
        recurrence_day: newTask.recurrence === 'weekly' || newTask.recurrence === 'monthly' ? newTask.recurrenceDay : null,
        created_by: currentUser.name
      }).select().single();
      if (error) throw error;
      setTasks(prev => [{
        id: data.id, description: data.description, notes: data.notes || '',
        branchId: data.branch_id, targetRole: data.target_role, targetUser: data.target_user || '',
        dueDate: data.due_date, priority: data.priority, status: data.status,
        recurrence: data.recurrence, recurrenceDay: data.recurrence_day, createdBy: data.created_by || ''
      }, ...prev]);
      setNewTask({ description: '', notes: '', branchId: 'all', targetRole: 'all', targetUser: '', dueDate: todayStr(), priority: 'normal', recurrence: 'none', recurrenceDay: 1 });
      setShowForm(false);
    } catch (err: any) {
      alert('Error al crear la tarea: ' + (err?.message || 'error desconocido'));
    }
    setSaving(false);
  };

  const toggleComplete = async (t: Task) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    const today = todayStr();
    try {
      if (t.recurrence === 'none') {
        const newStatus = t.status === 'done' ? 'pending' : 'done';
        const { error } = await supabase.from('tasks').update({ status: newStatus, completed_at: newStatus === 'done' ? new Date().toISOString() : null }).eq('id', t.id);
        if (error) throw error;
        setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: newStatus } : x));
      } else {
        const done = isCompletedOn(t, today);
        if (done) {
          await supabase.from('task_completions').delete().eq('task_id', t.id).eq('date', today);
          setCompletions(prev => { const n = { ...prev }; n[t.id]?.delete(today); return { ...n }; });
        } else {
          await supabase.from('task_completions').insert({ task_id: t.id, date: today, completed_by: currentUser.name });
          setCompletions(prev => { const n = { ...prev }; if (!n[t.id]) n[t.id] = new Set(); n[t.id].add(today); return { ...n }; });
        }
      }
    } catch (err: any) {
      alert('Error al actualizar la tarea: ' + (err?.message || ''));
    }
  };

  const handleDelete = async (id: string) => {
    if (isReadOnly || !canCreate) { alert('No tenés permiso para eliminar tareas.'); return; }
    if (!window.confirm('¿Eliminar esta tarea?')) return;
    try {
      await supabase.from('tasks').delete().eq('id', id);
      await supabase.from('task_completions').delete().eq('task_id', id);
      setTasks(prev => prev.filter(x => x.id !== id));
    } catch (err: any) {
      alert('Error al eliminar: ' + (err?.message || ''));
    }
  };

  const branchName = (id: string) => id === 'all' ? 'Todas' : (branches.find(b => b.id === id)?.name || id);
  const roleName = (id: string) => ROLE_OPTIONS.find(r => r.id === id)?.label || id;

  // Lista de tareas manuales visibles para el usuario, según filtro
  const visibleManual = useMemo(() => {
    const today = todayStr();
    return tasks.filter(taskAppliesToUser).map(t => {
      const completedToday = isCompletedOn(t, today);
      const appliesToday = recurrenceAppliesOn(t, today);
      return { task: t, completedToday, appliesToday };
    }).filter(({ task, completedToday, appliesToday }) => {
      if (filter === 'today') return appliesToday && !completedToday;
      if (filter === 'pending') return task.recurrence !== 'none' ? !completedToday : task.status !== 'done';
      if (filter === 'done') return task.recurrence !== 'none' ? completedToday : task.status === 'done';
      return true;
    });
  }, [tasks, completions, filter, currentUser]);

  const dueLabel = (t: Task) => {
    if (t.recurrence === 'daily') return 'Todos los días';
    if (t.recurrence === 'weekly') return `Cada ${WEEKDAYS[t.recurrenceDay ?? 1]}`;
    if (t.recurrence === 'monthly') return `Día ${t.recurrenceDay ?? 1} de cada mes`;
    if (t.dueDate) return t.dueDate.split('-').reverse().join('/');
    return 'Sin fecha';
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/15 p-3 text-brand-500 border border-brand-500/25 rounded-xl">
            <ListTodo size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-text-main uppercase tracking-tight">Tareas Pendientes</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">Tareas del día y planificadas</p>
          </div>
        </div>
        {canCreate && !isReadOnly && (
          <button onClick={() => setShowForm(!showForm)}
            className="bg-brand-500 text-black px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center gap-2">
            <Plus size={14} /> Nueva Tarea
          </button>
        )}
      </div>

      {/* Form */}
      {showForm && canCreate && !isReadOnly && (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 space-y-3">
          <h3 className="text-xs font-black uppercase text-brand-500 tracking-wider mb-2">Nueva Tarea</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Descripción</label>
              <input type="text" value={newTask.description} onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                placeholder="Ej: Revisar limpieza de campana" className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1" />
            </div>
            <div>
              <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Sucursal</label>
              <select value={newTask.branchId} onChange={(e) => setNewTask({ ...newTask, branchId: e.target.value })}
                className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1">
                <option value="all">Todas las sucursales</option>
                {operativeBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Rol destinatario</label>
              <select value={newTask.targetRole} onChange={(e) => setNewTask({ ...newTask, targetRole: e.target.value })}
                className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1">
                {ROLE_OPTIONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Usuario puntual (opcional)</label>
              <select value={newTask.targetUser} onChange={(e) => setNewTask({ ...newTask, targetUser: e.target.value })}
                className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1">
                <option value="">— Sin usuario específico —</option>
                {systemUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Recurrencia</label>
              <select value={newTask.recurrence} onChange={(e) => setNewTask({ ...newTask, recurrence: e.target.value })}
                className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1">
                <option value="none">Una vez (con fecha)</option>
                <option value="daily">Todos los días</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensual</option>
              </select>
            </div>
            {newTask.recurrence === 'none' && (
              <div>
                <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Fecha</label>
                <input type="date" value={newTask.dueDate} onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                  className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1" />
              </div>
            )}
            {newTask.recurrence === 'weekly' && (
              <div>
                <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Día de la semana</label>
                <select value={newTask.recurrenceDay} onChange={(e) => setNewTask({ ...newTask, recurrenceDay: Number(e.target.value) })}
                  className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1">
                  {WEEKDAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
                </select>
              </div>
            )}
            {newTask.recurrence === 'monthly' && (
              <div>
                <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Día del mes</label>
                <input type="number" min="1" max="31" value={newTask.recurrenceDay} onChange={(e) => setNewTask({ ...newTask, recurrenceDay: Number(e.target.value) })}
                  className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1" />
              </div>
            )}
            <div>
              <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Prioridad</label>
              <select value={newTask.priority} onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1">
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded border border-border-dim text-text-dim text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all">Cancelar</button>
            <button onClick={handleCreate} disabled={saving}
              className="bg-brand-500 text-black px-5 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-60 flex items-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Crear
            </button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {([['today', 'Hoy'], ['pending', 'Pendientes'], ['done', 'Completadas'], ['all', 'Todas']] as const).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest border transition-all",
              filter === f ? "bg-brand-500 text-black border-brand-500" : "bg-bg-accent text-text-dim border-border-dim hover:text-text-main")}>
            {label}
          </button>
        ))}
      </div>

      {/* Tareas automáticas del sistema */}
      {autoTasks.length > 0 && filter !== 'done' && (
        <div className="bg-bg-sidebar border border-amber-500/30 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-amber-500/5 border-b border-amber-500/20 flex items-center gap-2">
            <Bot size={14} className="text-amber-500" />
            <span className="text-[10px] font-black uppercase text-amber-500 tracking-widest">Tareas del Sistema ({autoTasks.length})</span>
            <span className="text-[8px] font-bold uppercase text-text-dim ml-auto">Se completan al hacer la acción</span>
          </div>
          <div className="divide-y divide-border-dim/40">
            {autoTasks.map(a => (
              <div key={a.id} className="flex items-center gap-4 px-4 py-3">
                <div className={cn("shrink-0 w-6 h-6 rounded-full flex items-center justify-center", a.severity === 'overdue' ? "bg-red-500/10" : "bg-amber-500/10")}>
                  {a.severity === 'overdue' ? <AlertCircle size={14} className="text-red-500" /> : <Clock size={14} className="text-amber-500" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Bot size={11} className="text-amber-500 shrink-0" />
                    <p className="text-[12px] font-black uppercase text-text-main truncate">{a.description}</p>
                  </div>
                  <p className="text-[9px] text-text-dim font-bold uppercase mt-0.5">{a.detail}</p>
                </div>
                <span className={cn("text-[8px] font-black uppercase px-2 py-1 rounded shrink-0", a.severity === 'overdue' ? "text-red-500 bg-red-500/10" : "text-amber-500 bg-amber-500/10")}>
                  {a.severity === 'overdue' ? 'Pendiente' : 'Hoy'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista de tareas manuales */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>
        ) : visibleManual.length === 0 ? (
          <div className="py-16 text-center text-text-dim text-[10px] font-black uppercase tracking-widest opacity-50">
            {filter === 'today' ? 'No tenés tareas para hoy 🎉' : 'No hay tareas'}
          </div>
        ) : (
          <div className="divide-y divide-border-dim/40">
            {visibleManual.map(({ task: t, completedToday }) => (
              <div key={t.id} className={cn("flex items-center gap-4 px-4 py-3 group", completedToday && "opacity-60")}>
                {!isReadOnly && (
                  <button onClick={() => toggleComplete(t)}
                    className={cn("shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                      completedToday ? "bg-emerald-500 border-emerald-500 text-white" : "border-border-dim hover:border-emerald-500")}>
                    {completedToday && <CheckCircle2 size={14} />}
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <User size={11} className="text-text-dim shrink-0" />
                    <p className={cn("text-[12px] font-black uppercase text-text-main truncate", completedToday && "line-through")}>{t.description}</p>
                    {t.priority === 'alta' && <span className="text-[7px] font-black uppercase text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded shrink-0">Alta</span>}
                    {t.recurrence !== 'none' && <Repeat size={11} className="text-blue-400 shrink-0" />}
                  </div>
                  <p className="text-[9px] text-text-dim font-bold uppercase mt-0.5">
                    {branchName(t.branchId)} · {roleName(t.targetRole)}{t.targetUser ? ` · 👤 ${systemUsers.find(u => u.id === t.targetUser)?.name || 'Usuario'}` : ''} · {dueLabel(t)}
                  </p>
                  {t.notes && <p className="text-[9px] text-text-dim mt-0.5">{t.notes}</p>}
                </div>
                {canCreate && !isReadOnly && (
                  <button onClick={() => handleDelete(t.id)} className="shrink-0 text-text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
