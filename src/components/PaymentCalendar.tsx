/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
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
}

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const todayStr = () => new Date().toISOString().split('T')[0];

const fmtMoney = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');

export default function PaymentCalendar({ items, title = 'Calendario de Vencimientos', accentClass = 'text-brand-500' }: Props) {
  const [calMonth, setCalMonth] = useState(() => todayStr().slice(0, 7));

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
            return (
              <div key={cell.date} className={cn("min-h-[78px] rounded border p-1",
                isToday ? "border-brand-500 bg-brand-500/5" : "border-border-dim/40 bg-bg-accent/10")}>
                <div className={cn("text-[9px] font-black mb-0.5", isToday ? "text-brand-500" : "text-text-dim")}>{cell.day}</div>
                <div className="space-y-0.5">
                  {dayItems.slice(0, 3).map(it => (
                    <div key={it.id} title={`${it.label}: ${fmtMoney(it.amount)}`}
                      className={cn("text-[8px] font-bold rounded px-1 py-0.5 truncate",
                        it.status === 'paid' ? "bg-emerald-500/10 text-emerald-600 line-through" : "bg-red-500/10 text-red-500")}>
                      {it.label} · {fmtMoney(it.amount)}
                    </div>
                  ))}
                  {dayItems.length > 3 && <div className="text-[7px] font-bold text-text-dim pl-1">+{dayItems.length - 3} más</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
