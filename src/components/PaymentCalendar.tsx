/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays, X, Pencil, CheckCircle2, RotateCcw } from 'lucide-react';
import { cn } from '@/src/lib/utils';

export interface CalendarItem {
  id: string;
  label: string;
  amount: number;
  date: string;       // YYYY-MM-DD
  status?: string;    // 'paid' | 'pending' | etc
}

interface Props {
  items: CalendarItem[];
  title?: string;
  accentClass?: string; // color del badge de monto
  // Acciones opcionales desde el detalle del día. Si no se pasan, el día es solo lectura.
  onTogglePaid?: (id: string) => void; // marcar pagado / pendiente
  onEdit?: (id: string) => void;       // abrir la edición del vencimiento en el módulo padre
  readOnly?: boolean;                  // oculta las acciones si el rol es de solo lectura
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const todayStr = () => new Date().toISOString().split('T')[0];

const fmtMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');

export default function PaymentCalendar({ items, title = 'Calendario de Vencimientos', accentClass = 'text-brand-500', onTogglePaid, onEdit, readOnly = false }: Props) {
  const [calMonth, setCalMonth] = useState(() => todayStr().slice(0, 7));
  // Día seleccionado: al hacer click en una fecha se abre el detalle con TODOS sus vencimientos.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const itemsByDate = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {};
    items.forEach(it => {
      if (!it.date) return;
      const d = it.date.slice(0, 10);
      if (!map[d]) map[d] = [];
      map[d].push(it);
    });
    return map;
  }, [items]);

  const calendarDays = useMemo(() => {
    const [y, m] = calMonth.split('-').map(Number);
    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0);
    const daysInMonth = lastDay.getDate();
    let startOffset = firstDay.getDay() - 1;
    if (startOffset < 0) startOffset = 6;
    const cells: Array<{ date: string; day: number } | null> = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: `${calMonth}-${String(d).padStart(2, '0')}`, day: d });
    return cells;
  }, [calMonth]);

  const adjustMonth = (delta: number) => {
    const [y, m] = calMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const today = todayStr();
  const monthTotal = useMemo(() => {
    return items.filter(it => (it.date || '').slice(0, 7) === calMonth).reduce((s, it) => s + (it.amount || 0), 0);
  }, [items, calMonth]);

  return (
    <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border-dim bg-bg-accent/30 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays size={14} className={accentClass} />
          <span className="text-[11px] font-black uppercase text-text-main tracking-widest">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {monthTotal > 0 && (
            <span className="text-[10px] font-black uppercase text-text-dim">Total del mes: <span className="text-text-main font-mono">{fmtMoney(monthTotal)}</span></span>
          )}
          <div className="flex items-center gap-1">
            <button onClick={() => adjustMonth(-1)} className="p-1.5 rounded hover:bg-bg-accent text-text-dim hover:text-text-main"><ChevronLeft size={16} /></button>
            <span className="text-[10px] font-black uppercase text-text-main px-2 min-w-[110px] text-center">{MONTHS[parseInt(calMonth.split('-')[1]) - 1]} {calMonth.split('-')[0]}</span>
            <button onClick={() => adjustMonth(1)} className="p-1.5 rounded hover:bg-bg-accent text-text-dim hover:text-text-main"><ChevronRight size={16} /></button>
          </div>
        </div>
      </div>
      <div className="p-3">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map(d => <div key={d} className="text-center text-[8px] font-black uppercase text-text-dim py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {calendarDays.map((cell, idx) => {
            if (!cell) return <div key={`e-${idx}`} className="min-h-[78px]" />;
            const dayItems = itemsByDate[cell.date] || [];
            const isToday = cell.date === today;
            const hasItems = dayItems.length > 0;
            return (
              <div
                key={cell.date}
                onClick={hasItems ? () => setSelectedDate(cell.date) : undefined}
                role={hasItems ? 'button' : undefined}
                title={hasItems ? 'Ver detalle del día' : undefined}
                className={cn("min-h-[78px] rounded border p-1 transition-all",
                  isToday ? "border-brand-500 bg-brand-500/5" : "border-border-dim/40 bg-bg-accent/10",
                  hasItems && "cursor-pointer hover:border-brand-500 hover:shadow-md hover:bg-brand-500/[0.03]")}>
                <div className={cn("text-[9px] font-black mb-0.5", isToday ? "text-brand-500" : "text-text-dim")}>{cell.day}</div>
                <div className="space-y-0.5">
                  {dayItems.slice(0, 3).map(it => (
                    <div key={it.id} title={`${it.label}: ${fmtMoney(it.amount)}`}
                      className={cn("text-[8px] font-bold rounded px-1 py-0.5 truncate",
                        it.status === 'paid' ? "bg-emerald-500/10 text-emerald-600 line-through" : "bg-red-500/10 text-red-500")}>
                      {it.label} · {fmtMoney(it.amount)}
                    </div>
                  ))}
                  {dayItems.length > 3 && <div className="text-[7px] font-bold text-brand-500 pl-1">+{dayItems.length - 3} más</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detalle del día seleccionado */}
      {selectedDate && (() => {
        const dayItems = itemsByDate[selectedDate] || [];
        const [yy, mm, dd] = selectedDate.split('-').map(Number);
        const dayTotal = dayItems.reduce((s, it) => s + (it.amount || 0), 0);
        const pendingTotal = dayItems.filter(it => it.status !== 'paid').reduce((s, it) => s + (it.amount || 0), 0);
        return (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
               onClick={() => setSelectedDate(null)}>
            <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
                 onClick={e => e.stopPropagation()}>
              <div className="px-4 py-3 border-b border-border-dim bg-bg-accent/30 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays size={15} className={accentClass} />
                  <div>
                    <div className="text-[11px] font-black uppercase text-text-main tracking-widest">
                      {dd} de {MONTHS[mm - 1]} {yy}
                    </div>
                    <div className="text-[8px] font-bold uppercase text-text-dim tracking-widest">
                      {dayItems.length} vencimiento(s) · {title.replace(/^Calendario de\s*/i, '')}
                    </div>
                  </div>
                </div>
                <button onClick={() => setSelectedDate(null)} className="p-1.5 rounded hover:bg-bg-accent text-text-dim hover:text-text-main"><X size={16} /></button>
              </div>
              <div className="p-3 overflow-y-auto space-y-2">
                {dayItems.length === 0 ? (
                  <div className="text-center text-[10px] font-bold uppercase text-text-dim py-8">Sin vencimientos este día</div>
                ) : dayItems.map(it => {
                  const paid = it.status === 'paid';
                  const showActions = !readOnly && (onTogglePaid || onEdit);
                  return (
                  <div key={it.id} className={cn("rounded-lg border p-3",
                    paid ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-red-500/25 bg-red-500/[0.05]")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold text-text-main break-words">{it.label}</div>
                        <span className={cn("inline-block mt-1 text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                          paid ? "bg-emerald-500/15 text-emerald-600" : "bg-red-500/15 text-red-500")}>
                          {paid ? 'Pagado' : 'Pendiente'}
                        </span>
                      </div>
                      <div className={cn("text-[12px] font-black font-mono shrink-0",
                        paid ? "text-emerald-600 line-through" : "text-text-main")}>
                        {fmtMoney(it.amount)}
                      </div>
                    </div>
                    {showActions && (
                      <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-border-dim/40">
                        {onTogglePaid && (
                          <button
                            onClick={() => onTogglePaid(it.id)}
                            className={cn("flex-1 inline-flex items-center justify-center gap-1 text-[9px] font-black uppercase tracking-wider rounded px-2 py-1.5 border transition-all",
                              paid
                                ? "border-border-dim text-text-dim hover:text-amber-600 hover:border-amber-500/40"
                                : "border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10")}
                          >
                            {paid ? <><RotateCcw size={11} /> Marcar pendiente</> : <><CheckCircle2 size={11} /> Marcar pagado</>}
                          </button>
                        )}
                        {onEdit && (
                          <button
                            onClick={() => { onEdit(it.id); setSelectedDate(null); }}
                            className="inline-flex items-center justify-center gap-1 text-[9px] font-black uppercase tracking-wider rounded px-2.5 py-1.5 border border-border-dim text-text-dim hover:text-brand-500 hover:border-brand-500/40 transition-all"
                          >
                            <Pencil size={11} /> Editar
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );})}
              </div>
              {dayItems.length > 0 && (
                <div className="px-4 py-3 border-t border-border-dim bg-bg-accent/20 flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase text-text-dim tracking-widest">Total del día</span>
                  <div className="text-right">
                    <div className="text-[13px] font-black font-mono text-text-main">{fmtMoney(dayTotal)}</div>
                    {pendingTotal !== dayTotal && (
                      <div className="text-[8px] font-bold uppercase text-red-500">Pendiente: {fmtMoney(pendingTotal)}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
