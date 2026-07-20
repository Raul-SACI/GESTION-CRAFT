/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  Clock,
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  AlertCircle,
  Trash2,
  Loader2,
  BarChart3,
  CheckCircle2
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';

interface AgendaEntry {
  id: string;
  supervisor_name: string;
  date: string;       // YYYY-MM-DD
  branch_id: string;
  start_time: string; // HH:MM
  end_time: string;   // HH:MM
  status: string;
}

const DAYS_OF_WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// Calcula las horas entre dos horarios "HH:MM"
function hoursBetween(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins > 0 ? mins / 60 : 0;
}

// Devuelve el lunes de la semana de una fecha dada
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay(); // 0=domingo
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(12, 0, 0, 0);
  return date;
}

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

interface CoverageRule {
  id: string;
  branch_id: string;
  rule_type: string;      // 'recurring' | 'specific'
  day_of_week: number | null;
  specific_date: string | null;
  start_time: string;
  end_time: string;
  label: string | null;
}

export default function SupervisorAgendaView({ branches, mode = 'armado', isReadOnly = false, currentUserName, currentUserRole }: { branches: Branch[]; mode?: 'armado' | 'control'; isReadOnly?: boolean; currentUserName?: string; currentUserRole?: string }) {
  const isControl = mode === 'control';
  const [leaders, setLeaders] = useState<string[]>([]);
  const [leadersDiag, setLeadersDiag] = useState<{ totalEmps: number; lideres: number; err: string | null }>({ totalEmps: 0, lideres: 0, err: null });
  const [agendas, setAgendas] = useState<AgendaEntry[]>([]);
  const [coverageRules, setCoverageRules] = useState<CoverageRule[]>([]);
  const [compliance, setCompliance] = useState<Record<string, boolean>>({}); // key: 'entry|<id>' o 'day|<date>'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showRules, setShowRules] = useState(false);

  // ─── MI AGENDA (tareas personales por fecha) ───
  const esAdminOLider = String(currentUserRole || '').toLowerCase() === 'administrador'
    || String(currentUserRole || '').toLowerCase().includes('lider');
  const [vista, setVista] = useState<'cobertura' | 'mi_agenda'>('cobertura');
  const [misTareas, setMisTareas] = useState<any[]>([]);
  // De quién se está viendo la agenda (admin/líder puede ver la de otros)
  const [agendaDe, setAgendaDe] = useState<string>('');
  const [nuevaTareaTexto, setNuevaTareaTexto] = useState('');
  const [nuevaTareaFecha, setNuevaTareaFecha] = useState(() => fmtDate(new Date()));
  const [nuevaTareaHora, setNuevaTareaHora] = useState('09:00');
  const [nuevaTareaNota, setNuevaTareaNota] = useState('');

  // Semana seleccionada (lunes)
  const [weekMonday, setWeekMonday] = useState<Date>(() => getMonday(new Date()));

  // Modal de carga
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [selectedLeader, setSelectedLeader] = useState('');
  const [newEntries, setNewEntries] = useState([
    { id: Date.now().toString(), date: fmtDate(getMonday(new Date())), branchId: '', startTime: '09:00', endTime: '13:00' }
  ]);

  // Form de nueva regla de cobertura
  const [ruleForm, setRuleForm] = useState({ branchId: '', ruleType: 'recurring', dayOfWeek: '5', specificDate: '', startTime: '20:00', endTime: '22:00', label: '' });
  const [savingRule, setSavingRule] = useState(false);

  // Días de la semana seleccionada
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekMonday);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [weekMonday]);

  const weekStart = fmtDate(weekDays[0]);
  const weekEnd = fmtDate(weekDays[6]);

  // Cargar líderes del maestro y agenda de la semana
  const loadData = async () => {
    setLoading(true);
    try {
      // Líderes (empleados con puesto "Líder...") del maestro de personal
      // No filtramos en la query por is_active (puede venir null); excluimos solo los explícitamente inactivos.
      const { data: emps, error: empErr } = await supabase
        .from('employees')
        .select('name, position, is_active');
      if (emps) {
        const ld = emps
          .filter(e => {
            const pos = (e.position || '').toLowerCase().trim();
            const esLider = pos.includes('líder') || pos.includes('lider');
            const activo = e.is_active !== false; // incluye true y null
            return esLider && activo;
          })
          .map(e => e.name);
        const unicos = Array.from(new Set(ld)).sort();
        setLeaders(unicos);
        setLeadersDiag({ totalEmps: emps.length, lideres: unicos.length, err: empErr ? empErr.message : null });
      } else {
        setLeaders([]);
        setLeadersDiag({ totalEmps: 0, lideres: 0, err: empErr ? empErr.message : 'No se recibieron datos de empleados.' });
      }

      // Agenda de la semana seleccionada
      const { data: ags } = await supabase
        .from('supervisor_agenda')
        .select('*')
        .gte('date', weekStart)
        .lte('date', weekEnd);
      setAgendas(ags || []);

      // Reglas de cobertura (todas)
      const { data: rules } = await supabase
        .from('coverage_rules')
        .select('*');
      setCoverageRules(rules || []);

      // Cumplimiento de la semana (tildes por visita y por día)
      const { data: comp } = await supabase
        .from('agenda_compliance')
        .select('*')
        .or(`date.gte.${weekStart},entry_id.not.is.null`);
      const compMap: Record<string, boolean> = {};
      (comp || []).forEach((c: any) => {
        if (c.compliance_type === 'entry' && c.entry_id) compMap[`entry|${c.entry_id}`] = c.fulfilled;
        if (c.compliance_type === 'day' && c.date) compMap[`day|${c.date}`] = c.fulfilled;
      });
      setCompliance(compMap);
    } catch (e) {
      console.error('Error cargando agenda:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekStart, weekEnd]);

  const isOverlapping = (s1: string, e1: string, s2: string, e2: string) => s1 < e2 && s2 < e1;

  const handleAddNewRow = () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setNewEntries([...newEntries, { id: Date.now().toString() + Math.random(), date: weekStart, branchId: '', startTime: '09:00', endTime: '13:00' }]);
    setError(null);
  };

  const handleRemoveRow = (id: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (newEntries.length > 1) setNewEntries(newEntries.filter(e => e.id !== id));
    setError(null);
  };

  const handleUpdateEntryRow = (id: string, field: string, value: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setNewEntries(newEntries.map(e => e.id === id ? { ...e, [field]: value } : e));
    setError(null);
  };

  const handleSaveEntries = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!selectedLeader) { setError('Elegí un líder.'); return; }
    const valid = newEntries.filter(e => e.branchId && e.date);
    if (valid.length === 0) { setError('Cargá al menos una visita con sucursal y fecha.'); return; }

    // Validar solapamientos contra lo existente y entre sí
    for (const e of valid) {
      if (hoursBetween(e.startTime, e.endTime) <= 0) {
        setError('El horario de fin debe ser posterior al de inicio.');
        return;
      }
      // Mismo líder no se pisa a sí mismo
      const overlap = agendas.find(a =>
        a.supervisor_name === selectedLeader && a.date === e.date &&
        isOverlapping(a.start_time, a.end_time, e.startTime, e.endTime)
      );
      if (overlap) {
        setError(`Conflicto: ${selectedLeader} ya tiene una visita ese día en ese horario.`);
        return;
      }
      // Dos líderes distintos no pueden coincidir en la misma sucursal+horario, salvo Almacén y Producción
      const isAlmacen = (branchName(e.branchId) || '').toLowerCase().includes('almac');
      if (!isAlmacen) {
        const crossOverlap = agendas.find(a =>
          a.supervisor_name !== selectedLeader &&
          a.branch_id === e.branchId &&
          a.date === e.date &&
          isOverlapping(a.start_time, a.end_time, e.startTime, e.endTime)
        );
        if (crossOverlap) {
          setError(`Conflicto: ${crossOverlap.supervisor_name} ya está agendado en ${branchName(e.branchId)} ese día en un horario que se superpone. (Solo se permite coincidencia en Almacén y Producción.)`);
          return;
        }
      }
      const internal = valid.find(e2 => e2.id !== e.id && e2.date === e.date && isOverlapping(e.startTime, e.endTime, e2.startTime, e2.endTime));
      if (internal) {
        setError('Conflicto: cargaste dos visitas el mismo día en horarios que se superponen.');
        return;
      }
    }

    setSaving(true);
    try {
      const rows = valid.map(e => ({
        supervisor_name: selectedLeader,
        date: e.date,
        branch_id: e.branchId,
        start_time: e.startTime,
        end_time: e.endTime,
        status: 'confirmed'
      }));
      const { error: insErr } = await supabase.from('supervisor_agenda').insert(rows);
      if (insErr) throw insErr;
      setShowAddEntry(false);
      setSelectedLeader('');
      setNewEntries([{ id: Date.now().toString(), date: weekStart, branchId: '', startTime: '09:00', endTime: '13:00' }]);
      setError(null);
      loadData();
    } catch (err: any) {
      console.error('Error guardando agenda:', err);
      setError('Error al guardar: ' + (err?.message || 'error desconocido'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEntry = async (id: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!window.confirm('¿Eliminar esta visita de la agenda?')) return;
    try {
      const { error: delErr } = await supabase.from('supervisor_agenda').delete().eq('id', id);
      if (delErr) throw delErr;
      setAgendas(prev => prev.filter(a => a.id !== id));
    } catch (err: any) {
      alert('Error al eliminar: ' + (err?.message || 'error desconocido'));
    }
  };

  const branchName = (id: string) => branches.find(b => b.id === id)?.name || id;

  // Tildar cumplimiento por visita o por día
  const toggleCompliance = async (type: 'entry' | 'day', refValue: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const key = `${type}|${refValue}`;
    const current = compliance[key] || false;
    const next = !current;
    setCompliance(prev => ({ ...prev, [key]: next })); // optimista
    try {
      const row: any = { compliance_type: type, fulfilled: next };
      if (type === 'entry') { row.entry_id = refValue; row.date = null; }
      else { row.date = refValue; row.entry_id = null; }
      const { error: upErr } = await supabase
        .from('agenda_compliance')
        .upsert(row, { onConflict: 'compliance_type,entry_id,date' });
      if (upErr) throw upErr;
    } catch (err: any) {
      console.error('Error tildando cumplimiento:', err);
      setCompliance(prev => ({ ...prev, [key]: current })); // revertir
      alert('Error al guardar el cumplimiento: ' + (err?.message || 'error'));
    }
  };

  // Guardar una nueva regla de cobertura
  const handleSaveRule = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!ruleForm.branchId) { alert('Elegí una sucursal.'); return; }
    if (ruleForm.ruleType === 'specific' && !ruleForm.specificDate) { alert('Elegí una fecha.'); return; }
    if (hoursBetween(ruleForm.startTime, ruleForm.endTime) <= 0) { alert('El horario de fin debe ser posterior al de inicio.'); return; }
    setSavingRule(true);
    try {
      const row: any = {
        branch_id: ruleForm.branchId,
        rule_type: ruleForm.ruleType,
        day_of_week: ruleForm.ruleType === 'recurring' ? parseInt(ruleForm.dayOfWeek) : null,
        specific_date: ruleForm.ruleType === 'specific' ? ruleForm.specificDate : null,
        start_time: ruleForm.startTime,
        end_time: ruleForm.endTime,
        label: ruleForm.label || null
      };
      const { error: insErr } = await supabase.from('coverage_rules').insert(row);
      if (insErr) throw insErr;
      setRuleForm({ branchId: '', ruleType: 'recurring', dayOfWeek: '5', specificDate: '', startTime: '20:00', endTime: '22:00', label: '' });
      loadData();
    } catch (err: any) {
      alert('Error al guardar la regla: ' + (err?.message || 'error'));
    } finally {
      setSavingRule(false);
    }
  };

  const handleDeleteRule = async (id: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!window.confirm('¿Eliminar esta regla de cobertura?')) return;
    try {
      const { error: delErr } = await supabase.from('coverage_rules').delete().eq('id', id);
      if (delErr) throw delErr;
      setCoverageRules(prev => prev.filter(r => r.id !== id));
    } catch (err: any) {
      alert('Error al eliminar: ' + (err?.message || 'error'));
    }
  };

  const DOW_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  // Líderes que tienen alguna entrada esta semana
  const leadersWithAgenda = useMemo(() => {
    return Array.from(new Set(agendas.map(a => a.supervisor_name))).sort();
  }, [agendas]);

  // Resumen de horas: por líder y sucursal + total por líder
  const hoursSummary = useMemo(() => {
    // map[leader][branchId] = horas
    const map: Record<string, Record<string, number>> = {};
    const totals: Record<string, number> = {};
    const branchTotals: Record<string, number> = {};
    let grandTotal = 0;
    agendas.forEach(a => {
      const h = hoursBetween(a.start_time, a.end_time);
      if (!map[a.supervisor_name]) map[a.supervisor_name] = {};
      map[a.supervisor_name][a.branch_id] = (map[a.supervisor_name][a.branch_id] || 0) + h;
      totals[a.supervisor_name] = (totals[a.supervisor_name] || 0) + h;
      branchTotals[a.branch_id] = (branchTotals[a.branch_id] || 0) + h;
      grandTotal += h;
    });
    return { map, totals, branchTotals, grandTotal };
  }, [agendas]);

  const fmtHrs = (h: number) => h % 1 === 0 ? `${h}` : h.toFixed(1);

  // Cobertura obligatoria según reglas configurables (recurrentes o por fecha).
  const coverageAlerts = useMemo(() => {
    const missing: { branchName: string; dayLabel: string; timeLabel: string }[] = [];
    coverageRules.forEach(rule => {
      const bName = branches.find(b => b.id === rule.branch_id)?.name || rule.branch_id;
      // Determinar a qué día(s) de la semana visible aplica esta regla
      const applicableDays: Date[] = [];
      if (rule.rule_type === 'specific' && rule.specific_date) {
        const match = weekDays.find(d => fmtDate(d) === rule.specific_date);
        if (match) applicableDays.push(match);
      } else if (rule.rule_type === 'recurring' && rule.day_of_week !== null) {
        // day_of_week: 0=domingo..6=sábado. Usamos getDay() de cada fecha (mismo criterio).
        weekDays.forEach(d => { if (d.getDay() === rule.day_of_week) applicableDays.push(d); });
      }
      applicableDays.forEach(d => {
        const dayStr = fmtDate(d);
        const covered = agendas.some(a =>
          a.branch_id === rule.branch_id && a.date === dayStr &&
          isOverlapping(a.start_time, a.end_time, rule.start_time, rule.end_time)
        );
        if (!covered) {
          const dayLabel = d.toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit' });
          missing.push({ branchName: bName, dayLabel, timeLabel: `${rule.start_time}-${rule.end_time}` });
        }
      });
    });
    return missing;
  }, [agendas, branches, weekDays, coverageRules]);

  const weekLabel = `${weekDays[0].toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })} – ${weekDays[6].toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}`;

  // ─── MI AGENDA: carga y alta de tareas personales ───
  const duenoAgenda = agendaDe || currentUserName || '';

  const cargarMisTareas = async () => {
    if (!duenoAgenda) { setMisTareas([]); return; }
    const desde = fmtDate(weekMonday);
    const hastaD = new Date(weekMonday); hastaD.setDate(hastaD.getDate() + 6);
    try {
      const { data } = await supabase
        .from('supervisor_tasks')
        .select('*')
        .eq('supervisor_name', duenoAgenda)
        .gte('date', desde)
        .lte('date', fmtDate(hastaD))
        .order('date').order('time');
      setMisTareas(data || []);
    } catch { setMisTareas([]); }
  };

  useEffect(() => {
    if (vista === 'mi_agenda') cargarMisTareas();
  }, [vista, duenoAgenda, weekMonday]);

  useEffect(() => {
    if (!agendaDe && currentUserName) setAgendaDe(currentUserName);
  }, [currentUserName]);

  const agregarMiTarea = async () => {
    if (isReadOnly) return;
    if (!duenoAgenda) { alert('No se pudo identificar el usuario.'); return; }
    if (!nuevaTareaTexto.trim()) { alert('Escribí la tarea.'); return; }
    const { error: err } = await supabase.from('supervisor_tasks').insert({
      id: `${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      supervisor_name: duenoAgenda,
      date: nuevaTareaFecha,
      time: nuevaTareaHora || null,
      task: nuevaTareaTexto.trim(),
      note: nuevaTareaNota || null,
      done: false,
      created_at: new Date().toISOString()
    });
    if (err) { alert('Error al guardar: ' + err.message); return; }
    setNuevaTareaTexto(''); setNuevaTareaNota('');
    await cargarMisTareas();
  };

  const toggleMiTarea = async (t: any) => {
    if (isReadOnly) return;
    await supabase.from('supervisor_tasks').update({ done: !t.done }).eq('id', t.id);
    await cargarMisTareas();
  };

  const borrarMiTarea = async (id: string) => {
    if (isReadOnly) return;
    if (!window.confirm('¿Eliminar esta tarea?')) return;
    await supabase.from('supervisor_tasks').delete().eq('id', id);
    await cargarMisTareas();
  };

  // Tareas agrupadas por día de la semana visible
  const tareasPorDia = useMemo(() => {
    const dias: Array<{ fecha: string; label: string; tareas: any[] }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekMonday); d.setDate(d.getDate() + i);
      const f = fmtDate(d);
      dias.push({
        fecha: f,
        label: `${DAYS_OF_WEEK[i]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`,
        tareas: misTareas.filter(t => t.date === f).sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')))
      });
    }
    return dias;
  }, [misTareas, weekMonday]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border-dim pb-4 gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-brand-500/10 p-3 text-brand-500 border border-brand-500/20 rounded-lg shadow-inner">
            <ClipboardList size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-text-main uppercase tracking-tight">Agenda Supervisores</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest italic opacity-70">
              {vista === 'mi_agenda' ? 'Tareas propias por día y horario' : (isControl ? 'Control de agendas y reglas de cobertura' : 'Planificación semanal de líderes')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Pestañas */}
          <div className="flex bg-bg-accent p-1 rounded border border-border-dim">
            <button onClick={() => setVista('cobertura')}
              className={cn("px-4 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-colors",
                vista === 'cobertura' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main")}>
              Cobertura
            </button>
            <button onClick={() => setVista('mi_agenda')}
              className={cn("px-4 py-1.5 rounded text-[10px] font-black uppercase tracking-wider transition-colors",
                vista === 'mi_agenda' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main")}>
              Mi Agenda
            </button>
          </div>
          {/* Selector de semana */}
          <div className="flex items-center gap-1 bg-bg-sidebar border border-border-dim rounded px-2 py-1.5">
            <button onClick={() => { const d = new Date(weekMonday); d.setDate(d.getDate() - 7); setWeekMonday(d); }} className="p-1 hover:text-brand-500 text-text-dim"><ChevronLeft size={16} /></button>
            <span className="text-[10px] font-black uppercase text-text-main tracking-wider min-w-[170px] text-center">{weekLabel}</span>
            <button onClick={() => { const d = new Date(weekMonday); d.setDate(d.getDate() + 7); setWeekMonday(d); }} className="p-1 hover:text-brand-500 text-text-dim"><ChevronRight size={16} /></button>
          </div>
          {isControl && vista === 'cobertura' && (
            <button
              onClick={() => setShowRules(true)}
              className="flex items-center gap-2 bg-bg-sidebar border border-border-dim text-text-main px-5 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:border-brand-500/50 transition-all"
            >
              <Calendar size={14} /> Reglas de Cobertura
            </button>
          )}
          {vista === 'cobertura' && <button
            onClick={() => { setShowAddEntry(true); setError(null); }}
            className="flex items-center gap-2 bg-brand-500 text-black px-5 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-lg"
          >
            <Plus size={14} /> Agendar Visita
          </button>}
        </div>
      </div>

      {/* ─── MI AGENDA ─── */}
      {vista === 'mi_agenda' && (
        <div className="space-y-5">
          {/* Selector de supervisor (solo admin/líder ve el de otros) */}
          {esAdminOLider && leaders.length > 0 && (
            <div className="bg-bg-card border border-brand-500/30 rounded-lg p-4 flex items-center gap-3 flex-wrap">
              <ClipboardList size={15} className="text-brand-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-text-main">Ver agenda de:</span>
              <select value={agendaDe} onChange={e => setAgendaDe(e.target.value)}
                className="flex-1 min-w-[200px] bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] font-black uppercase text-text-main outline-none focus:border-brand-500 cursor-pointer">
                {currentUserName && <option value={currentUserName}>{currentUserName} (yo)</option>}
                {leaders.filter(l => l !== currentUserName).map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
          )}

          {/* Alta de tarea */}
          {!isReadOnly && (
            <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-500 flex items-center gap-2">
                <Plus size={14} /> Nueva tarea {agendaDe && agendaDe !== currentUserName ? `para ${agendaDe}` : ''}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                <input type="text" value={nuevaTareaTexto} onChange={e => setNuevaTareaTexto(e.target.value)}
                  placeholder="Tarea (ej. Visitar Barrio Norte y revisar depósito)"
                  className="md:col-span-5 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-brand-500" />
                <input type="date" value={nuevaTareaFecha} onChange={e => setNuevaTareaFecha(e.target.value)}
                  className="md:col-span-2 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] font-mono font-bold text-text-main outline-none focus:border-brand-500" />
                <input type="time" value={nuevaTareaHora} onChange={e => setNuevaTareaHora(e.target.value)}
                  className="md:col-span-2 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] font-mono font-bold text-text-main outline-none focus:border-brand-500" />
                <input type="text" value={nuevaTareaNota} onChange={e => setNuevaTareaNota(e.target.value)}
                  placeholder="Nota (opcional)"
                  className="md:col-span-2 bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] font-bold text-text-main outline-none focus:border-brand-500" />
                <button onClick={agregarMiTarea}
                  className="md:col-span-1 bg-brand-500 hover:bg-brand-600 text-black rounded px-3 py-2 text-[9px] font-black uppercase transition-all">
                  Agregar
                </button>
              </div>
            </div>
          )}

          {/* Agenda de la semana, día por día */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {tareasPorDia.map(dia => (
              <div key={dia.fecha} className="bg-bg-sidebar border border-border-dim rounded-lg p-4 space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-brand-500 border-b border-border-dim/40 pb-1.5">
                  {dia.label}
                </p>
                {dia.tareas.length === 0 ? (
                  <p className="text-[9px] font-bold uppercase text-text-dim opacity-50 py-3 text-center">Sin tareas</p>
                ) : dia.tareas.map(t => (
                  <div key={t.id} className={cn(
                    "rounded border p-2.5 transition-all",
                    t.done ? "bg-emerald-500/5 border-emerald-500/30" : "bg-bg-card border-border-dim"
                  )}>
                    <div className="flex items-start gap-2">
                      <button onClick={() => toggleMiTarea(t)} disabled={isReadOnly}
                        className={cn("w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all",
                          t.done ? "bg-emerald-500 border-emerald-500" : "border-border-dim hover:border-brand-500")}>
                        {t.done && <CheckCircle2 size={10} className="text-white" />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-[10px] font-bold uppercase leading-tight",
                          t.done ? "text-text-dim line-through" : "text-text-main")}>{t.task}</p>
                        {t.note && <p className="text-[8px] font-bold text-text-dim mt-0.5">{t.note}</p>}
                      </div>
                      {!isReadOnly && (
                        <button onClick={() => borrarMiTarea(t.id)} className="text-text-dim hover:text-red-500 shrink-0">
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                    {t.time && (
                      <p className="text-[8px] font-mono font-black text-brand-500 mt-1.5 flex items-center gap-1">
                        <Clock size={9} /> {t.time}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {vista === 'cobertura' && (loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-dim">
          <Loader2 className="animate-spin text-brand-500" size={32} />
          <p className="mt-3 text-[10px] font-black uppercase tracking-widest">Cargando agenda…</p>
        </div>
      ) : (
        <>
          {/* Alerta de cobertura obligatoria viernes/sábado 20-22h */}
          {coverageAlerts.length > 0 && (
            <div className="bg-red-500/5 border border-red-500/30 rounded-lg p-5 space-y-3">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} className="text-red-500" />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-red-500">
                  Cobertura Obligatoria Faltante ({coverageAlerts.length})
                </h3>
              </div>
              <p className="text-[9px] font-bold text-text-dim uppercase tracking-wide">
                Estas sucursales/días requieren al menos un líder presente en el horario indicado (según las reglas configuradas).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {coverageAlerts.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 bg-bg-sidebar border border-red-500/20 rounded p-2.5">
                    <span className="text-[10px] font-black uppercase text-text-main truncate">{m.branchName}</span>
                    <span className="text-[9px] font-bold text-red-500 uppercase shrink-0">· {m.dayLabel} {m.timeLabel}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Grilla semanal */}
          <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-x-auto">
            <table className="w-full border-collapse text-[10px]">
              <thead>
                <tr className="bg-bg-accent border-b border-border-dim">
                  <th className="px-4 py-3 text-left text-text-dim font-bold uppercase tracking-widest">Líder</th>
                  {weekDays.map((d, i) => (
                    <th key={i} className="px-3 py-3 text-center text-text-dim font-bold uppercase tracking-widest">
                      {DAYS_OF_WEEK[i].substring(0, 3)}<br />
                      <span className="text-[8px] opacity-60">{d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim/40">
                {leadersWithAgenda.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-text-dim italic uppercase opacity-50">No hay visitas agendadas para esta semana</td></tr>
                ) : leadersWithAgenda.map(leader => (
                  <tr key={leader} className="hover:bg-bg-accent/20">
                    <td className="px-4 py-3 font-black text-text-main uppercase whitespace-nowrap">{leader}</td>
                    {weekDays.map((d, i) => {
                      const dayStr = fmtDate(d);
                      const dayEntries = agendas.filter(a => a.supervisor_name === leader && a.date === dayStr);
                      return (
                        <td key={i} className="px-2 py-2 align-top">
                          <div className="space-y-1">
                            {dayEntries.map(e => {
                              const done = compliance[`entry|${e.id}`] || false;
                              return (
                                <div key={e.id} className={cn("group border rounded px-2 py-1 text-[8px]", done ? "bg-emerald-500/10 border-emerald-500/40" : "bg-brand-500/10 border-brand-500/30")}>
                                  <div className="flex items-center justify-between gap-1">
                                    <button
                                      onClick={() => toggleCompliance('entry', e.id)}
                                      title={done ? 'Cumplida' : 'Marcar como cumplida'}
                                      className={cn("flex items-center gap-1 font-black uppercase truncate", done ? "text-emerald-500" : "text-brand-500")}
                                    >
                                      <span className={cn("w-3 h-3 rounded-sm border flex items-center justify-center shrink-0", done ? "bg-emerald-500 border-emerald-500" : "border-border-dim")}>
                                        {done && <CheckCircle2 size={9} className="text-black" />}
                                      </span>
                                      <span className="truncate">{branchName(e.branch_id)}</span>
                                    </button>
                                    <button onClick={() => handleDeleteEntry(e.id)} className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-red-500 transition-all shrink-0"><Trash2 size={10} /></button>
                                  </div>
                                  <span className="text-text-dim font-mono">{e.start_time}-{e.end_time}</span>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {leadersWithAgenda.length > 0 && (
                  <tr className="bg-bg-accent/40 border-t-2 border-border-dim">
                    <td className="px-4 py-3 font-black text-text-dim uppercase tracking-widest text-[9px]">Día cumplido</td>
                    {weekDays.map((d, i) => {
                      const dayStr = fmtDate(d);
                      const done = compliance[`day|${dayStr}`] || false;
                      return (
                        <td key={i} className="px-2 py-3 text-center">
                          <button
                            onClick={() => toggleCompliance('day', dayStr)}
                            title={done ? 'Día cumplido' : 'Marcar día como cumplido'}
                            className={cn("w-5 h-5 rounded border inline-flex items-center justify-center transition-all", done ? "bg-emerald-500 border-emerald-500" : "border-border-dim hover:border-emerald-500/50")}
                          >
                            {done && <CheckCircle2 size={12} className="text-black" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Resumen de horas */}
          <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-brand-500 flex items-center gap-2 mb-4">
              <BarChart3 size={15} /> Resumen de Horas — Semana {weekLabel}
            </h3>
            {leadersWithAgenda.length === 0 ? (
              <p className="text-[10px] text-text-dim italic uppercase opacity-50">Sin datos para esta semana</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border-dim">
                <table className="w-full border-collapse text-[10px]">
                  <thead>
                    <tr className="bg-bg-accent text-text-dim font-bold uppercase tracking-widest border-b border-border-dim">
                      <th className="px-4 py-3 text-left">Líder</th>
                      {branches.map(b => <th key={b.id} className="px-3 py-3 text-center">{b.name}</th>)}
                      <th className="px-4 py-3 text-center bg-brand-500/10 text-brand-500">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dim/40">
                    {leadersWithAgenda.map(leader => (
                      <tr key={leader} className="hover:bg-bg-accent/20">
                        <td className="px-4 py-3 font-black text-text-main uppercase whitespace-nowrap">{leader}</td>
                        {branches.map(b => {
                          const h = hoursSummary.map[leader]?.[b.id] || 0;
                          return <td key={b.id} className="px-3 py-3 text-center font-mono text-text-dim">{h > 0 ? `${fmtHrs(h)}h` : '—'}</td>;
                        })}
                        <td className="px-4 py-3 text-center font-black text-brand-500 bg-brand-500/5">{fmtHrs(hoursSummary.totals[leader] || 0)}h</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-bg-accent border-t-2 border-brand-500/30">
                      <td className="px-4 py-3 font-black text-brand-500 uppercase tracking-widest">Total Sucursal</td>
                      {branches.map(b => {
                        const h = hoursSummary.branchTotals[b.id] || 0;
                        return <td key={b.id} className="px-3 py-3 text-center font-black text-text-main">{h > 0 ? `${fmtHrs(h)}h` : '—'}</td>;
                      })}
                      <td className="px-4 py-3 text-center font-black text-brand-500 bg-brand-500/10">{fmtHrs(hoursSummary.grandTotal)}h</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>
        </>
      ))}

      {/* Modal de carga */}
      <AnimatePresence>
        {showAddEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-sidebar border border-border-dim rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between p-5 border-b border-border-dim">
                <h3 className="text-sm font-black uppercase text-text-main tracking-tight">Agendar Visitas</h3>
                <button onClick={() => setShowAddEntry(false)} className="text-text-dim hover:text-text-main"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-[9px] font-black text-text-dim uppercase tracking-widest">Líder</label>
                  <select
                    value={selectedLeader}
                    onChange={(e) => setSelectedLeader(e.target.value)}
                    className="w-full mt-1 bg-bg-card border border-border-dim rounded px-3 py-2 text-[11px] font-black uppercase text-brand-500"
                  >
                    <option value="">— Elegí un líder —</option>
                    {leaders.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  {leaders.length === 0 && <p className="text-[8px] text-text-dim italic uppercase mt-1 opacity-60">No hay empleados "Líder de…" en el maestro.</p>}
                  <p className="text-[8px] text-text-dim uppercase mt-1 opacity-70 tracking-wide">
                    Diagnóstico: {leadersDiag.totalEmps} empleados leídos · {leadersDiag.lideres} líderes detectados
                    {leadersDiag.err ? ` · ERROR: ${leadersDiag.err}` : ''}
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-text-dim uppercase tracking-widest">Visitas</label>
                  {newEntries.map(entry => (
                    <div key={entry.id} className="grid grid-cols-12 gap-2 items-center bg-bg-accent/30 p-2 rounded border border-border-dim/40">
                      <input type="date" value={entry.date} min={weekStart} max={weekEnd} onChange={(e) => handleUpdateEntryRow(entry.id, 'date', e.target.value)} className="col-span-3 bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[9px] font-mono" />
                      <select value={entry.branchId} onChange={(e) => handleUpdateEntryRow(entry.id, 'branchId', e.target.value)} className="col-span-4 bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[9px] font-bold uppercase">
                        <option value="">Sucursal…</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                      <input type="time" value={entry.startTime} onChange={(e) => handleUpdateEntryRow(entry.id, 'startTime', e.target.value)} className="col-span-2 bg-bg-card border border-border-dim rounded px-1 py-1.5 text-[9px] font-mono" />
                      <input type="time" value={entry.endTime} onChange={(e) => handleUpdateEntryRow(entry.id, 'endTime', e.target.value)} className="col-span-2 bg-bg-card border border-border-dim rounded px-1 py-1.5 text-[9px] font-mono" />
                      <button onClick={() => handleRemoveRow(entry.id)} className="col-span-1 text-text-dim hover:text-red-500 flex justify-center"><Trash2 size={13} /></button>
                    </div>
                  ))}
                  <button onClick={handleAddNewRow} className="flex items-center gap-1 text-[9px] font-black uppercase text-brand-500 hover:text-brand-600"><Plus size={12} /> Agregar otra visita</button>
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded p-3 text-[9px] font-bold text-red-500 uppercase">
                    <AlertCircle size={13} /> {error}
                  </div>
                )}
              </div>
              <div className="flex gap-3 p-5 border-t border-border-dim">
                <button onClick={handleSaveEntries} disabled={saving} className="flex-1 bg-brand-500 text-black py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 disabled:opacity-60 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="animate-spin" size={14} /> : <Clock size={14} />}
                  {saving ? 'Guardando…' : 'Guardar Agenda'}
                </button>
                <button onClick={() => setShowAddEntry(false)} disabled={saving} className="px-6 py-2.5 rounded border border-border-dim text-text-dim text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent disabled:opacity-40">Cancelar</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal de Reglas de Cobertura */}
      <AnimatePresence>
        {showRules && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-sidebar border border-border-dim rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between p-5 border-b border-border-dim">
                <h3 className="text-sm font-black uppercase text-text-main tracking-tight">Reglas de Cobertura Obligatoria</h3>
                <button onClick={() => setShowRules(false)} className="text-text-dim hover:text-text-main"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-5">
                {/* Form nueva regla */}
                <div className="bg-bg-accent/30 border border-border-dim/40 rounded-lg p-4 space-y-3">
                  <p className="text-[10px] font-black text-brand-500 uppercase tracking-widest">Nueva Regla</p>
                  <div className="grid grid-cols-2 gap-2">
                    <select value={ruleForm.branchId} onChange={e => setRuleForm({ ...ruleForm, branchId: e.target.value })} className="bg-bg-card border border-border-dim rounded px-2 py-2 text-[10px] font-bold uppercase">
                      <option value="">Sucursal…</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <select value={ruleForm.ruleType} onChange={e => setRuleForm({ ...ruleForm, ruleType: e.target.value })} className="bg-bg-card border border-border-dim rounded px-2 py-2 text-[10px] font-bold uppercase">
                      <option value="recurring">Recurrente (día de semana)</option>
                      <option value="specific">Fecha puntual</option>
                    </select>
                    {ruleForm.ruleType === 'recurring' ? (
                      <select value={ruleForm.dayOfWeek} onChange={e => setRuleForm({ ...ruleForm, dayOfWeek: e.target.value })} className="bg-bg-card border border-border-dim rounded px-2 py-2 text-[10px] font-bold uppercase">
                        {DOW_LABELS.map((l, i) => <option key={i} value={i}>{l}</option>)}
                      </select>
                    ) : (
                      <input type="date" value={ruleForm.specificDate} onChange={e => setRuleForm({ ...ruleForm, specificDate: e.target.value })} className="bg-bg-card border border-border-dim rounded px-2 py-2 text-[10px] font-mono" />
                    )}
                    <input type="text" placeholder="Descripción (opcional)" value={ruleForm.label} onChange={e => setRuleForm({ ...ruleForm, label: e.target.value })} className="bg-bg-card border border-border-dim rounded px-2 py-2 text-[10px]" />
                    <div className="flex items-center gap-2">
                      <input type="time" value={ruleForm.startTime} onChange={e => setRuleForm({ ...ruleForm, startTime: e.target.value })} className="flex-1 bg-bg-card border border-border-dim rounded px-2 py-2 text-[10px] font-mono" />
                      <span className="text-text-dim text-[9px]">a</span>
                      <input type="time" value={ruleForm.endTime} onChange={e => setRuleForm({ ...ruleForm, endTime: e.target.value })} className="flex-1 bg-bg-card border border-border-dim rounded px-2 py-2 text-[10px] font-mono" />
                    </div>
                    <button onClick={handleSaveRule} disabled={savingRule} className="bg-brand-500 text-black rounded px-3 py-2 text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 disabled:opacity-60 flex items-center justify-center gap-2">
                      {savingRule ? <Loader2 className="animate-spin" size={13} /> : <Plus size={13} />} Agregar Regla
                    </button>
                  </div>
                </div>

                {/* Lista de reglas existentes */}
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-text-dim uppercase tracking-widest">Reglas Configuradas ({coverageRules.length})</p>
                  {coverageRules.length === 0 ? (
                    <p className="text-[9px] text-text-dim italic uppercase opacity-50 py-2">No hay reglas cargadas.</p>
                  ) : coverageRules.map(r => (
                    <div key={r.id} className="flex items-center justify-between gap-2 bg-bg-accent/30 border border-border-dim/40 rounded p-3">
                      <div className="min-w-0">
                        <span className="text-[10px] font-black uppercase text-text-main">{branchName(r.branch_id)}</span>
                        <span className="text-[9px] font-bold text-text-dim uppercase ml-2">
                          {r.rule_type === 'recurring' ? `Todos los ${DOW_LABELS[r.day_of_week ?? 0]}` : r.specific_date} · {r.start_time}-{r.end_time}
                          {r.label ? ` · ${r.label}` : ''}
                        </span>
                      </div>
                      <button onClick={() => handleDeleteRule(r.id)} className="text-text-dim hover:text-red-500 shrink-0"><Trash2 size={13} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
