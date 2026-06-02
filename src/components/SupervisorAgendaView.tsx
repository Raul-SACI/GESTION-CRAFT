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
  BarChart3
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

export default function SupervisorAgendaView({ branches }: { branches: Branch[] }) {
  const [leaders, setLeaders] = useState<string[]>([]);
  const [agendas, setAgendas] = useState<AgendaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Semana seleccionada (lunes)
  const [weekMonday, setWeekMonday] = useState<Date>(() => getMonday(new Date()));

  // Modal de carga
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [selectedLeader, setSelectedLeader] = useState('');
  const [newEntries, setNewEntries] = useState([
    { id: Date.now().toString(), date: fmtDate(getMonday(new Date())), branchId: '', startTime: '09:00', endTime: '13:00' }
  ]);

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
      // Líderes (empleados "Líder de...") del maestro de personal
      const { data: emps } = await supabase
        .from('employees')
        .select('name, position')
        .eq('is_active', true);
      if (emps) {
        const ld = emps
          .filter(e => (e.position || '').toLowerCase().trim().startsWith('líder de') || (e.position || '').toLowerCase().trim().startsWith('lider de'))
          .map(e => e.name);
        setLeaders(Array.from(new Set(ld)).sort());
      }

      // Agenda de la semana seleccionada
      const { data: ags } = await supabase
        .from('supervisor_agenda')
        .select('*')
        .gte('date', weekStart)
        .lte('date', weekEnd);
      setAgendas(ags || []);
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
    setNewEntries([...newEntries, { id: Date.now().toString() + Math.random(), date: weekStart, branchId: '', startTime: '09:00', endTime: '13:00' }]);
    setError(null);
  };

  const handleRemoveRow = (id: string) => {
    if (newEntries.length > 1) setNewEntries(newEntries.filter(e => e.id !== id));
    setError(null);
  };

  const handleUpdateEntryRow = (id: string, field: string, value: string) => {
    setNewEntries(newEntries.map(e => e.id === id ? { ...e, [field]: value } : e));
    setError(null);
  };

  const handleSaveEntries = async () => {
    if (!selectedLeader) { setError('Elegí un líder.'); return; }
    const valid = newEntries.filter(e => e.branchId && e.date);
    if (valid.length === 0) { setError('Cargá al menos una visita con sucursal y fecha.'); return; }

    // Validar solapamientos contra lo existente y entre sí
    for (const e of valid) {
      if (hoursBetween(e.startTime, e.endTime) <= 0) {
        setError('El horario de fin debe ser posterior al de inicio.');
        return;
      }
      const overlap = agendas.find(a =>
        a.supervisor_name === selectedLeader && a.date === e.date &&
        isOverlapping(a.start_time, a.end_time, e.startTime, e.endTime)
      );
      if (overlap) {
        setError(`Conflicto: ${selectedLeader} ya tiene una visita ese día en ese horario.`);
        return;
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

  // Líderes que tienen alguna entrada esta semana
  const leadersWithAgenda = useMemo(() => {
    return Array.from(new Set(agendas.map(a => a.supervisor_name))).sort();
  }, [agendas]);

  // Resumen de horas: por líder y sucursal + total por líder
  const hoursSummary = useMemo(() => {
    // map[leader][branchId] = horas
    const map: Record<string, Record<string, number>> = {};
    const totals: Record<string, number> = {};
    agendas.forEach(a => {
      const h = hoursBetween(a.start_time, a.end_time);
      if (!map[a.supervisor_name]) map[a.supervisor_name] = {};
      map[a.supervisor_name][a.branch_id] = (map[a.supervisor_name][a.branch_id] || 0) + h;
      totals[a.supervisor_name] = (totals[a.supervisor_name] || 0) + h;
    });
    return { map, totals };
  }, [agendas]);

  const fmtHrs = (h: number) => h % 1 === 0 ? `${h}` : h.toFixed(1);

  const weekLabel = `${weekDays[0].toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })} – ${weekDays[6].toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}`;

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
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest italic opacity-70">Planificación semanal de líderes</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Selector de semana */}
          <div className="flex items-center gap-1 bg-bg-sidebar border border-border-dim rounded px-2 py-1.5">
            <button onClick={() => { const d = new Date(weekMonday); d.setDate(d.getDate() - 7); setWeekMonday(d); }} className="p-1 hover:text-brand-500 text-text-dim"><ChevronLeft size={16} /></button>
            <span className="text-[10px] font-black uppercase text-text-main tracking-wider min-w-[170px] text-center">{weekLabel}</span>
            <button onClick={() => { const d = new Date(weekMonday); d.setDate(d.getDate() + 7); setWeekMonday(d); }} className="p-1 hover:text-brand-500 text-text-dim"><ChevronRight size={16} /></button>
          </div>
          <button
            onClick={() => { setShowAddEntry(true); setError(null); }}
            className="flex items-center gap-2 bg-brand-500 text-black px-5 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-lg"
          >
            <Plus size={14} /> Agendar Visita
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 text-text-dim">
          <Loader2 className="animate-spin text-brand-500" size={32} />
          <p className="mt-3 text-[10px] font-black uppercase tracking-widest">Cargando agenda…</p>
        </div>
      ) : (
        <>
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
                            {dayEntries.map(e => (
                              <div key={e.id} className="group bg-brand-500/10 border border-brand-500/30 rounded px-2 py-1 text-[8px]">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="font-black text-brand-500 uppercase truncate">{branchName(e.branch_id)}</span>
                                  <button onClick={() => handleDeleteEntry(e.id)} className="opacity-0 group-hover:opacity-100 text-text-dim hover:text-red-500 transition-all shrink-0"><Trash2 size={10} /></button>
                                </div>
                                <span className="text-text-dim font-mono">{e.start_time}-{e.end_time}</span>
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
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
                </table>
              </div>
            )}
          </div>
        </>
      )}

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
    </motion.div>
  );
}
