/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  StickyNote, Loader2, Plus, Trash2, CheckCircle2, Clock,
  ChevronLeft, ChevronRight, CalendarDays, ArrowRight
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';

interface CurrentUser {
  id: string;
  name: string;
}

interface Props {
  currentUser: CurrentUser;
  isReadOnly?: boolean;
}

interface Note {
  id: string;
  content: string;
  noteDate: string;
  noteTime: string;
  done: boolean;
}

const todayStr = () => new Date().toISOString().split('T')[0];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const addDays = (dateStr: string, days: number) => {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

export default function PersonalNotesView({ currentUser, isReadOnly = false }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calMonth, setCalMonth] = useState(() => todayStr().slice(0, 7));
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  const [newNote, setNewNote] = useState({ content: '', noteDate: todayStr(), noteTime: '' });

  const fetchNotes = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('personal_notes').select('*').eq('user_id', currentUser.id).order('note_date', { ascending: true });
      setNotes((data || []).map((r: any) => ({
        id: r.id, content: r.content, noteDate: r.note_date, noteTime: r.note_time || '', done: !!r.done
      })));
    } catch (e) { console.error('Error cargando notas:', e); }
    setLoading(false);
  };

  useEffect(() => { fetchNotes(); }, [currentUser.id]);

  const handleCreate = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!newNote.content.trim()) { alert('Escribí el contenido de la nota.'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from('personal_notes').insert({
        user_id: currentUser.id,
        content: newNote.content.trim(),
        note_date: newNote.noteDate,
        note_time: newNote.noteTime || null,
        done: false
      }).select().single();
      if (error) throw error;
      setNotes(prev => [...prev, { id: data.id, content: data.content, noteDate: data.note_date, noteTime: data.note_time || '', done: false }]);
      setNewNote({ content: '', noteDate: newNote.noteDate, noteTime: '' });
    } catch (err: any) {
      alert('Error al crear la nota: ' + (err?.message || ''));
    }
    setSaving(false);
  };

  const toggleDone = async (n: Note) => {
    if (isReadOnly) return;
    try {
      await supabase.from('personal_notes').update({ done: !n.done }).eq('id', n.id);
      setNotes(prev => prev.map(x => x.id === n.id ? { ...x, done: !x.done } : x));
    } catch (err: any) { alert('Error: ' + (err?.message || '')); }
  };

  const handleDelete = async (id: string) => {
    if (isReadOnly) return;
    if (!window.confirm('¿Eliminar esta nota?')) return;
    try {
      await supabase.from('personal_notes').delete().eq('id', id);
      setNotes(prev => prev.filter(x => x.id !== id));
    } catch (err: any) { alert('Error: ' + (err?.message || '')); }
  };

  const moveNote = async (id: string, newDate: string) => {
    if (isReadOnly) return;
    try {
      await supabase.from('personal_notes').update({ note_date: newDate }).eq('id', id);
      setNotes(prev => prev.map(x => x.id === id ? { ...x, noteDate: newDate } : x));
    } catch (err: any) { alert('Error al mover la nota: ' + (err?.message || '')); }
  };

  // Lista de notas: las próximas (de hoy en adelante), ordenadas por fecha y hora
  const upcomingNotes = useMemo(() => {
    const today = todayStr();
    return [...notes]
      .filter(n => n.noteDate >= today || !n.done)
      .sort((a, b) => (a.noteDate + (a.noteTime || '')).localeCompare(b.noteDate + (b.noteTime || '')));
  }, [notes]);

  // Notas agrupadas por fecha para el calendario
  const notesByDate = useMemo(() => {
    const map: Record<string, Note[]> = {};
    notes.forEach(n => { if (!map[n.noteDate]) map[n.noteDate] = []; map[n.noteDate].push(n); });
    return map;
  }, [notes]);

  // Construir matriz del calendario (semana arranca lunes)
  const calendarDays = useMemo(() => {
    const [y, m] = calMonth.split('-').map(Number);
    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0);
    const daysInMonth = lastDay.getDate();
    // getDay: 0=Dom..6=Sab → convertir a lunes=0
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;
    const cells: Array<{ date: string; day: number } | null> = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: `${calMonth}-${String(d).padStart(2, '0')}`, day: d });
    }
    return cells;
  }, [calMonth]);

  const adjustMonth = (delta: number) => {
    const [y, m] = calMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const today = todayStr();
  const fmtDate = (d: string) => {
    if (d === today) return 'Hoy';
    if (d === addDays(today, 1)) return 'Mañana';
    return d.split('-').reverse().slice(0, 2).join('/');
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="bg-brand-500/15 p-3 text-brand-500 border border-brand-500/25 rounded-xl">
          <StickyNote size={24} />
        </div>
        <div>
          <h2 className="text-xl font-black text-text-main uppercase tracking-tight">Notas Personales</h2>
          <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">Tus recordatorios privados · solo vos los ves</p>
        </div>
      </div>

      {/* Form nueva nota */}
      {!isReadOnly && (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4 flex flex-col md:flex-row gap-3 items-end">
          <div className="flex-1 w-full">
            <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Nota / Recordatorio</label>
            <input type="text" value={newNote.content} onChange={(e) => setNewNote({ ...newNote, content: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              placeholder="Ej: Llamar al contador, comprar insumos…"
              className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[12px] font-bold text-text-main outline-none mt-1" />
          </div>
          <div>
            <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Fecha</label>
            <input type="date" value={newNote.noteDate} onChange={(e) => setNewNote({ ...newNote, noteDate: e.target.value })}
              className="bg-bg-accent border border-border-dim rounded px-2 py-2 text-[12px] font-bold text-text-main outline-none mt-1" />
          </div>
          <div>
            <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Hora (opcional)</label>
            <input type="time" value={newNote.noteTime} onChange={(e) => setNewNote({ ...newNote, noteTime: e.target.value })}
              className="bg-bg-accent border border-border-dim rounded px-2 py-2 text-[12px] font-bold text-text-main outline-none mt-1" />
          </div>
          <button onClick={handleCreate} disabled={saving}
            className="bg-brand-500 text-black px-5 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-60 flex items-center gap-2 shrink-0">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Agregar
          </button>
        </div>
      )}

      {/* Lista de notas próximas */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border-dim bg-bg-accent/30 flex items-center gap-2">
          <StickyNote size={14} className="text-brand-500" />
          <span className="text-[10px] font-black uppercase text-text-main tracking-widest">Mis Notas</span>
        </div>
        {loading ? (
          <div className="py-12 flex justify-center"><Loader2 size={24} className="animate-spin text-brand-500" /></div>
        ) : upcomingNotes.length === 0 ? (
          <div className="py-12 text-center text-text-dim text-[10px] font-black uppercase tracking-widest opacity-50">No tenés notas. Agregá la primera arriba.</div>
        ) : (
          <div className="divide-y divide-border-dim/40">
            {upcomingNotes.map(n => (
              <div key={n.id}
                draggable={!isReadOnly}
                onDragStart={() => setDraggedId(n.id)}
                onDragEnd={() => setDraggedId(null)}
                className={cn("flex items-center gap-3 px-4 py-3 group", n.done && "opacity-50", !isReadOnly && "cursor-grab active:cursor-grabbing")}>
                {!isReadOnly && (
                  <button onClick={() => toggleDone(n)}
                    className={cn("shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all",
                      n.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-border-dim hover:border-emerald-500")}>
                    {n.done && <CheckCircle2 size={12} />}
                  </button>
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[12px] font-bold text-text-main", n.done && "line-through")}>{n.content}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={cn("text-[9px] font-black uppercase", n.noteDate === today ? "text-brand-500" : "text-text-dim")}>
                      <CalendarDays size={9} className="inline mr-1" />{fmtDate(n.noteDate)}
                    </span>
                    {n.noteTime && <span className="text-[9px] font-bold text-text-dim"><Clock size={9} className="inline mr-1" />{n.noteTime}</span>}
                  </div>
                </div>
                {!isReadOnly && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => moveNote(n.id, addDays(n.noteDate, 1))} title="Pasar a mañana"
                      className="text-text-dim hover:text-brand-500 p-1.5 flex items-center gap-1 text-[8px] font-black uppercase">
                      <ArrowRight size={13} /> Mañana
                    </button>
                    <button onClick={() => handleDelete(n.id)} title="Eliminar" className="text-text-dim hover:text-red-500 p-1.5">
                      <Trash2 size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Calendario del mes */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border-dim bg-bg-accent/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays size={14} className="text-brand-500" />
            <span className="text-[11px] font-black uppercase text-text-main tracking-widest">
              {MONTHS[parseInt(calMonth.split('-')[1]) - 1]} {calMonth.split('-')[0]}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => adjustMonth(-1)} className="p-1.5 rounded hover:bg-bg-accent text-text-dim hover:text-text-main"><ChevronLeft size={16} /></button>
            <button onClick={() => setCalMonth(todayStr().slice(0, 7))} className="text-[8px] font-black uppercase text-brand-500 px-2">Hoy</button>
            <button onClick={() => adjustMonth(1)} className="p-1.5 rounded hover:bg-bg-accent text-text-dim hover:text-text-main"><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="p-3">
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map(d => <div key={d} className="text-center text-[8px] font-black uppercase text-text-dim py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((cell, idx) => {
              if (!cell) return <div key={`empty-${idx}`} className="min-h-[80px]" />;
              const dayNotes = notesByDate[cell.date] || [];
              const isToday = cell.date === today;
              const isDragOver = dragOverDay === cell.date;
              return (
                <div key={cell.date}
                  onDragOver={(e) => { if (draggedId && !isReadOnly) { e.preventDefault(); setDragOverDay(cell.date); } }}
                  onDragLeave={() => setDragOverDay(null)}
                  onDrop={() => { if (draggedId && !isReadOnly) { moveNote(draggedId, cell.date); setDraggedId(null); setDragOverDay(null); } }}
                  className={cn("min-h-[80px] rounded border p-1 transition-all",
                    isToday ? "border-brand-500 bg-brand-500/5" : "border-border-dim/40 bg-bg-accent/10",
                    isDragOver && "border-brand-500 bg-brand-500/15 ring-1 ring-brand-500")}>
                  <div className={cn("text-[9px] font-black mb-0.5", isToday ? "text-brand-500" : "text-text-dim")}>{cell.day}</div>
                  <div className="space-y-0.5">
                    {dayNotes.slice(0, 3).map(n => (
                      <div key={n.id}
                        draggable={!isReadOnly}
                        onDragStart={() => setDraggedId(n.id)}
                        onDragEnd={() => setDraggedId(null)}
                        title={n.content + (n.noteTime ? ` (${n.noteTime})` : '')}
                        className={cn("text-[8px] font-bold rounded px-1 py-0.5 truncate cursor-grab",
                          n.done ? "bg-emerald-500/10 text-emerald-600 line-through" : "bg-brand-500/15 text-text-main")}>
                        {n.noteTime ? `${n.noteTime} ` : ''}{n.content}
                      </div>
                    ))}
                    {dayNotes.length > 3 && <div className="text-[7px] font-bold text-text-dim pl-1">+{dayNotes.length - 3} más</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {!isReadOnly && (
            <p className="text-[8px] text-text-dim font-bold uppercase mt-2 text-center opacity-60">Arrastrá una nota a otro día para reprogramarla</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
