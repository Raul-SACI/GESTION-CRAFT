/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ListTodo, Bot, User, ChevronRight, CheckCircle2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';
import { supabase } from '../lib/supabase';

interface CurrentUser {
  id: string;
  name: string;
  role: string;
  accessScope: 'all_branches' | 'single_branch';
  branchId?: string;
}

interface Props {
  branches: Branch[];
  currentUser: CurrentUser;
  onOpenTasks?: () => void;
}

const todayStr = () => new Date().toISOString().split('T')[0];

export default function TasksSummaryWidget({ branches, currentUser, onOpenTasks }: Props) {
  const operativeBranches = useMemo(() => branches.filter(b => !/almac/i.test(b.name)), [branches]);
  const [manualToday, setManualToday] = useState<Array<{ id: string; description: string; priority: string }>>([]);
  const [autoCount, setAutoCount] = useState(0);
  const [autoSample, setAutoSample] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = currentUser.role === 'administrador' || currentUser.role === 'dueño';

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const today = todayStr();
        const month = today.slice(0, 7);
        const [y, m] = month.split('-').map(Number);
        const lastDay = new Date(y, m, 0).getDate();
        const dow = new Date(today + 'T12:00:00').getDay();
        const dom = new Date(today + 'T12:00:00').getDate();

        const { data: tasksData } = await supabase.from('tasks').select('*').eq('status', 'pending');
        const { data: comps } = await supabase.from('task_completions').select('task_id').eq('date', today);
        const completedIds = new Set((comps || []).map((c: any) => c.task_id));
        const manual = (tasksData || []).filter((t: any) => {
          if (!isAdmin) {
            const branchOk = (t.branch_id === 'all' || t.branch_id === currentUser.branchId || currentUser.accessScope === 'all_branches');
            const roleOk = (t.target_role === 'all' || t.target_role === currentUser.role);
            const userOk = (!t.target_user || t.target_user === currentUser.id);
            if (!(branchOk && roleOk && userOk)) return false;
          }
          const rec = t.recurrence || 'none';
          let appliesToday = false;
          if (rec === 'none') appliesToday = (t.due_date === today);
          else if (rec === 'daily') appliesToday = true;
          else if (rec === 'weekly') appliesToday = (dow === (t.recurrence_day ?? 1));
          else if (rec === 'monthly') appliesToday = (dom === (t.recurrence_day ?? 1));
          if (!appliesToday) return false;
          if (rec !== 'none' && completedIds.has(t.id)) return false;
          return true;
        }).map((t: any) => ({ id: t.id, description: t.description, priority: t.priority || 'normal' }));
        setManualToday(manual);

        const branchesToCheck = isAdmin || currentUser.accessScope === 'all_branches'
          ? operativeBranches : operativeBranches.filter(b => b.id === currentUser.branchId);
        const sample: string[] = [];
        let count = 0;

        const { data: hourRows } = await supabase.from('hour_logs').select('branch_id, date')
          .gte('date', `${month}-01`).lte('date', `${month}-${String(lastDay).padStart(2, '0')}`);
        const loggedByBranch: Record<string, Set<string>> = {};
        (hourRows || []).forEach((r: any) => { if (!loggedByBranch[r.branch_id]) loggedByBranch[r.branch_id] = new Set(); loggedByBranch[r.branch_id].add(r.date); });
        branchesToCheck.forEach(b => {
          const logged = loggedByBranch[b.id] || new Set();
          let missing = 0;
          for (let d = 1; d <= dom; d++) { if (!logged.has(`${month}-${String(d).padStart(2, '0')}`)) missing++; }
          if (missing > 0) { count++; if (sample.length < 3) sample.push(`Cargar horas (${b.name})`); }
        });

        if (isAdmin || currentUser.accessScope === 'all_branches') {
          const { data: arqueo } = await supabase.from('treasury_cash_count').select('date').eq('date', today).maybeSingle();
          if (!arqueo) { count++; if (sample.length < 3) sample.push('Cargar arqueo de Caja Central'); }
        }

        setAutoCount(count);
        setAutoSample(sample);
      } catch (e) { console.error('Error widget tareas:', e); }
      setLoading(false);
    };
    load();
  }, [currentUser, branches]);

  const total = manualToday.length + autoCount;

  return (
    <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ListTodo size={16} className="text-brand-500" />
          <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Tareas de Hoy</h3>
          {total > 0 && <span className="text-[9px] font-black uppercase text-brand-500 bg-brand-500/10 px-2 py-0.5 rounded-full">{total}</span>}
        </div>
        {onOpenTasks && (
          <button onClick={onOpenTasks} className="text-[9px] font-black uppercase text-brand-500 hover:text-brand-600 flex items-center gap-1">
            Ver todas <ChevronRight size={12} />
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-[10px] text-text-dim uppercase font-bold opacity-50 py-4 text-center">Cargando…</p>
      ) : total === 0 ? (
        <div className="flex items-center gap-2 py-4 justify-center">
          <CheckCircle2 size={16} className="text-emerald-500" />
          <p className="text-[11px] text-text-dim font-bold uppercase">No tenés tareas pendientes para hoy</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {autoSample.map((s, i) => (
            <div key={`auto-${i}`} className="flex items-center gap-2 bg-amber-500/5 border border-amber-500/20 rounded px-3 py-2">
              <Bot size={12} className="text-amber-500 shrink-0" />
              <span className="text-[11px] font-bold text-text-main truncate">{s}</span>
            </div>
          ))}
          {autoCount > autoSample.length && (
            <p className="text-[9px] text-text-dim font-bold uppercase pl-1">+{autoCount - autoSample.length} tarea(s) del sistema más</p>
          )}
          {manualToday.slice(0, 4).map(t => (
            <div key={t.id} className="flex items-center gap-2 bg-bg-accent/30 border border-border-dim/40 rounded px-3 py-2">
              <User size={12} className="text-text-dim shrink-0" />
              <span className="text-[11px] font-bold text-text-main truncate flex-1">{t.description}</span>
              {t.priority === 'alta' && <span className="text-[7px] font-black uppercase text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded shrink-0">Alta</span>}
            </div>
          ))}
          {manualToday.length > 4 && (
            <p className="text-[9px] text-text-dim font-bold uppercase pl-1">+{manualToday.length - 4} tarea(s) más</p>
          )}
        </div>
      )}
    </div>
  );
}
