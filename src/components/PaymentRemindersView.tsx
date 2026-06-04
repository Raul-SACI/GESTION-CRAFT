/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Bell, Loader2, Plus, Trash2, CheckCircle2, Clock, AlertCircle, Calendar
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';

interface PaymentRemindersViewProps {
  isReadOnly?: boolean;
}

interface Reminder {
  id: string;
  description: string;
  payee: string;
  amount: number;
  dueDate: string | null;
  status: string;
  notes: string;
}

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');

// Días hasta el vencimiento (negativo = vencido)
const daysUntil = (dateStr: string | null): number | null => {
  if (!dateStr) return null;
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const due = new Date(dateStr + 'T12:00:00');
  return Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

export default function PaymentRemindersView({ isReadOnly = false }: PaymentRemindersViewProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'paid' | 'all'>('pending');
  const [newR, setNewR] = useState({ description: '', payee: '', amount: '', dueDate: '', notes: '' });

  const fetchReminders = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('treasury_payment_reminders')
        .select('*')
        .order('due_date', { ascending: true });
      setReminders((data || []).map((r: any) => ({
        id: r.id, description: r.description, payee: r.payee || '',
        amount: Number(r.amount) || 0, dueDate: r.due_date, status: r.status || 'pending', notes: r.notes || ''
      })));
    } catch (e) { console.error('Error cargando recordatorios:', e); }
    setLoading(false);
  };

  useEffect(() => { fetchReminders(); }, []);

  const handleAdd = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!newR.description.trim()) { alert('Ingresá una descripción del pago.'); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from('treasury_payment_reminders').insert({
        description: newR.description.trim(),
        payee: newR.payee.trim() || null,
        amount: newR.amount ? Number(newR.amount) : 0,
        due_date: newR.dueDate || null,
        status: 'pending',
        notes: newR.notes.trim() || null
      }).select().single();
      if (error) throw error;
      setReminders(prev => [...prev, {
        id: data.id, description: data.description, payee: data.payee || '',
        amount: Number(data.amount) || 0, dueDate: data.due_date, status: data.status, notes: data.notes || ''
      }]);
      setNewR({ description: '', payee: '', amount: '', dueDate: '', notes: '' });
    } catch (err: any) {
      alert('Error al guardar el recordatorio: ' + (err?.message || 'error desconocido'));
    }
    setSaving(false);
  };

  const toggleStatus = async (r: Reminder) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const newStatus = r.status === 'paid' ? 'pending' : 'paid';
    try {
      const { error } = await supabase.from('treasury_payment_reminders').update({ status: newStatus }).eq('id', r.id);
      if (error) throw error;
      setReminders(prev => prev.map(x => x.id === r.id ? { ...x, status: newStatus } : x));
    } catch (err: any) {
      alert('Error al actualizar: ' + (err?.message || ''));
    }
  };

  const handleDelete = async (id: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!window.confirm('¿Eliminar este recordatorio?')) return;
    try {
      const { error } = await supabase.from('treasury_payment_reminders').delete().eq('id', id);
      if (error) throw error;
      setReminders(prev => prev.filter(x => x.id !== id));
    } catch (err: any) {
      alert('Error al eliminar: ' + (err?.message || ''));
    }
  };

  const shown = useMemo(() => {
    return reminders.filter(r => filter === 'all' ? true : filter === 'paid' ? r.status === 'paid' : r.status !== 'paid');
  }, [reminders, filter]);

  const pendingList = useMemo(() => reminders.filter(r => r.status !== 'paid'), [reminders]);
  const totalPending = useMemo(() => pendingList.reduce((s, r) => s + r.amount, 0), [pendingList]);
  const overdueCount = useMemo(() => pendingList.filter(r => { const d = daysUntil(r.dueDate); return d !== null && d < 0; }).length, [pendingList]);
  const soonCount = useMemo(() => pendingList.filter(r => { const d = daysUntil(r.dueDate); return d !== null && d >= 0 && d <= 7; }).length, [pendingList]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="bg-brand-500/15 p-3 text-brand-500 border border-brand-500/25 rounded-xl">
          <Bell size={24} />
        </div>
        <div>
          <h2 className="text-xl font-black text-text-main uppercase tracking-tight">Recordatorios de Pago</h2>
          <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">Tesorería · Pagos pendientes para no olvidarse</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <p className="text-[9px] text-text-dim uppercase font-black tracking-widest">Total Pendiente</p>
          <p className="text-2xl font-mono font-black text-text-main mt-1">{fmt(totalPending)}</p>
          <p className="text-[8px] text-text-dim uppercase font-bold mt-1 opacity-70">{pendingList.length} pago{pendingList.length !== 1 ? 's' : ''} sin saldar</p>
        </div>
        <div className={cn("border rounded-xl p-5", overdueCount > 0 ? "bg-red-500/5 border-red-500/30" : "bg-bg-sidebar border-border-dim")}>
          <p className="text-[9px] text-text-dim uppercase font-black tracking-widest">Vencidos</p>
          <p className={cn("text-2xl font-mono font-black mt-1", overdueCount > 0 ? "text-red-500" : "text-text-main")}>{overdueCount}</p>
          <p className="text-[8px] text-text-dim uppercase font-bold mt-1 opacity-70">Pasaron su fecha de vencimiento</p>
        </div>
        <div className={cn("border rounded-xl p-5", soonCount > 0 ? "bg-amber-500/5 border-amber-500/30" : "bg-bg-sidebar border-border-dim")}>
          <p className="text-[9px] text-text-dim uppercase font-black tracking-widest">Vencen Pronto</p>
          <p className={cn("text-2xl font-mono font-black mt-1", soonCount > 0 ? "text-amber-500" : "text-text-main")}>{soonCount}</p>
          <p className="text-[8px] text-text-dim uppercase font-bold mt-1 opacity-70">En los próximos 7 días</p>
        </div>
      </div>

      {/* Form alta */}
      {!isReadOnly && (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <h3 className="text-xs font-black uppercase text-brand-500 tracking-wider mb-4 flex items-center gap-2"><Plus size={14} /> Nuevo Recordatorio</h3>
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
            <div className="md:col-span-4">
              <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Descripción</label>
              <input type="text" value={newR.description} onChange={(e) => setNewR({ ...newR, description: e.target.value })} placeholder="Ej: Alquiler local"
                className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1" />
            </div>
            <div className="md:col-span-3">
              <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Proveedor / A quién</label>
              <input type="text" value={newR.payee} onChange={(e) => setNewR({ ...newR, payee: e.target.value })} placeholder="Ej: Inmobiliaria X"
                className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Monto ($)</label>
              <input type="number" value={newR.amount} onChange={(e) => setNewR({ ...newR, amount: e.target.value })} placeholder="0"
                className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1 font-mono" />
            </div>
            <div className="md:col-span-2">
              <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Vencimiento</label>
              <input type="date" value={newR.dueDate} onChange={(e) => setNewR({ ...newR, dueDate: e.target.value })}
                className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1" />
            </div>
            <button onClick={handleAdd} disabled={saving}
              className="md:col-span-1 bg-brand-500 text-black px-3 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-60 flex items-center justify-center">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={16} />}
            </button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-2">
        {(['pending', 'paid', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest border transition-all",
              filter === f ? "bg-brand-500 text-black border-brand-500" : "bg-bg-accent text-text-dim border-border-dim hover:text-text-main")}>
            {f === 'pending' ? 'Pendientes' : f === 'paid' ? 'Pagados' : 'Todos'}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-16 flex items-center justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>
        ) : shown.length === 0 ? (
          <div className="py-16 text-center text-text-dim text-[10px] font-black uppercase tracking-widest opacity-50">No hay recordatorios {filter === 'pending' ? 'pendientes' : filter === 'paid' ? 'pagados' : ''}</div>
        ) : (
          <div className="divide-y divide-border-dim/40">
            {shown.map(r => {
              const d = daysUntil(r.dueDate);
              const isPaid = r.status === 'paid';
              const isOverdue = !isPaid && d !== null && d < 0;
              const isSoon = !isPaid && d !== null && d >= 0 && d <= 7;
              return (
                <div key={r.id} className={cn("flex items-center gap-4 px-4 py-3 group",
                  isOverdue ? "bg-red-500/[0.04]" : isSoon ? "bg-amber-500/[0.04]" : "")}>
                  {!isReadOnly && (
                    <button onClick={() => toggleStatus(r)} title={isPaid ? 'Marcar como pendiente' : 'Marcar como pagado'}
                      className={cn("shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all",
                        isPaid ? "bg-emerald-500 border-emerald-500 text-white" : "border-border-dim hover:border-emerald-500")}>
                      {isPaid && <CheckCircle2 size={14} />}
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-[12px] font-black uppercase text-text-main truncate", isPaid && "line-through opacity-50")}>{r.description}</p>
                    <p className="text-[9px] text-text-dim font-bold uppercase">{r.payee || 'Sin destinatario'}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn("text-[13px] font-mono font-black text-text-main", isPaid && "opacity-50")}>{r.amount > 0 ? fmt(r.amount) : '—'}</p>
                    {r.dueDate && (
                      <p className={cn("text-[8px] font-black uppercase",
                        isPaid ? "text-text-dim" : isOverdue ? "text-red-500" : isSoon ? "text-amber-500" : "text-text-dim")}>
                        {r.dueDate.split('-').reverse().join('/')}
                        {!isPaid && d !== null && (isOverdue ? ` · vencido hace ${-d}d` : d === 0 ? ' · vence hoy' : isSoon ? ` · en ${d}d` : '')}
                      </p>
                    )}
                  </div>
                  {(isOverdue || isSoon) && !isPaid && (
                    <div className="shrink-0">
                      {isOverdue ? <AlertCircle size={16} className="text-red-500" /> : <Clock size={16} className="text-amber-500" />}
                    </div>
                  )}
                  {!isReadOnly && (
                    <button onClick={() => handleDelete(r.id)} className="shrink-0 text-text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1">
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
