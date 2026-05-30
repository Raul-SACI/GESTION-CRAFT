/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Building2, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Calendar, 
  DollarSign, 
  Clock, 
  Check, 
  ChevronRight,
  TrendingUp, 
  Layers
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';
import { supabase } from '../lib/supabase';

interface BudgetRow {
  id: string;
  branchId: string;
  roleId: string;
  roleLabel: string;
  shift: 'Mañana' | 'Tarde';
  countGroupA: number;
  countGroupB: number;
  hoursPerDay: number;
  hourlyRate: number;
}

interface LegacyBudgetPosition {
  id: string;
  name: string;
  countWeekday: number;
  countWeekend: number;
  hoursPerDay: number;
  hourlyRate: number;
}

const DEFAULT_POSITIONS: LegacyBudgetPosition[] = [
  { id: 'encargado', name: 'Encargado', countWeekday: 1, countWeekend: 1, hoursPerDay: 8, hourlyRate: 3500 },
  { id: 'jefe_cocina', name: 'Jefe de Cocina', countWeekday: 1, countWeekend: 1, hoursPerDay: 8, hourlyRate: 3200 },
  { id: 'segundo_cocina', name: 'Segundo de Cocina', countWeekday: 1, countWeekend: 1, hoursPerDay: 8, hourlyRate: 2800 },
  { id: 'cocinero', name: 'Cocinero', countWeekday: 1, countWeekend: 1, hoursPerDay: 8, hourlyRate: 2500 },
  { id: 'caja', name: 'Caja', countWeekday: 1, countWeekend: 1, hoursPerDay: 8, hourlyRate: 2400 },
  { id: 'barra', name: 'Barra', countWeekday: 0.5, countWeekend: 1, hoursPerDay: 8, hourlyRate: 2300 },
  { id: 'mozos', name: 'Mozos', countWeekday: 2, countWeekend: 4, hoursPerDay: 8, hourlyRate: 2200 },
  { id: 'runners', name: 'Runners', countWeekday: 0.5, countWeekend: 1.5, hoursPerDay: 8, hourlyRate: 2000 },
  { id: 'bacha', name: 'Bacha', countWeekday: 1, countWeekend: 1, hoursPerDay: 8, hourlyRate: 1900 },
];

function getDaysOfWeekCounts(yearMonth: string) {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr) || 2026;
  const month = (parseInt(monthStr) || 5) - 1; // 0-indexed
  
  const totalDays = new Date(year, month + 1, 0).getDate();
  const dayCounts: Record<string, number> = {
    'Domingo': 0,
    'Lunes': 0,
    'Martes': 0,
    'Miércoles': 0,
    'Jueves': 0,
    'Viernes': 0,
    'Sábado': 0,
  };

  const JS_DAY_MAPPING: Record<number, string> = {
    0: 'Domingo',
    1: 'Lunes',
    2: 'Martes',
    3: 'Miércoles',
    4: 'Jueves',
    5: 'Viernes',
    6: 'Sábado'
  };

  for (let d = 1; d <= totalDays; d++) {
    const dateInstance = new Date(year, month, d);
    const dayName = JS_DAY_MAPPING[dateInstance.getDay()];
    if (dayName) {
      dayCounts[dayName]++;
    }
  }

  return { totalDays, dayCounts };
}

export default function AprobacionPresupuestosView({ branches }: { branches: Branch[] }) {
  const [selectedMonth, setSelectedMonth] = useState('2026-06');
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [budgetsState, setBudgetsState] = useState<Record<string, any>>({});

  // Fetch budgets from Supabase
  const loadAllBudgets = async () => {
    try {
      const { data, error } = await supabase
        .from('hour_budgets')
        .select('branch_id, position_id, position_name, week1, week2, week3, week4, week5, total_hours, total_cost, hourly_rate, hours_per_day, shift, status, holidays_json')
        .eq('month', selectedMonth);

      if (error) {
        console.error('Supabase error:', error.message);
        return;
      }

      const loaded: Record<string, any> = {};

      // Initialize all branches as empty
      branches.forEach(b => {
        loaded[b.id] = { rows: [], status: 'pending' };
      });

      // Fill in data from Supabase
      if (data && data.length > 0) {
        data.forEach((row: any) => {
          if (!loaded[row.branch_id]) {
            loaded[row.branch_id] = { rows: [], status: 'pending' };
          }
          loaded[row.branch_id].rows.push(row);
          loaded[row.branch_id].status = row.status || 'pending';
        });
      }

      setBudgetsState(loaded);
    } catch(e: any) {
      console.error('Error loading budgets:', e.message);
    }
  };

  useEffect(() => {
    if (branches && branches.length > 0) loadAllBudgets();
  }, [selectedMonth, branches.length]);

  const handleToggleApprove = async (branchId: string) => {
    const current = budgetsState[branchId] || {
      positions: DEFAULT_POSITIONS,
      daysInMonth: 30,
      fridays: 4,
      saturdays: 4,
      sundays: 4,
      holidays: 2,
      groupADays: ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Domingo'],
      groupBDays: ['Viernes', 'Sábado'],
      status: 'pending'
    };
    
    const nextStatus = current.status === 'approved' ? 'pending' : 'approved';
    const updated = {
      ...current,
      status: nextStatus
    };

    // Guardar estado en Supabase
    try {
      await supabase.from('hour_budgets')
        .update({ status: nextStatus })
        .eq('branch_id', branchId)
        .eq('month', selectedMonth);
    } catch(e) {
      console.error('Error actualizando estado en Supabase:', e);
    }
    
    // Backup localStorage
    localStorage.setItem(`hour_budget_${branchId}_${selectedMonth}`, JSON.stringify(updated));
    
    // Update local state
    setBudgetsState(prev => ({
      ...prev,
      [branchId]: updated
    }));

    if (selectedBranch?.id === branchId) {
      setSelectedBranch(prev => prev ? { ...prev } : null);
    }
  };

  // Upgraded custom calculations helper
  const getBranchCalculatedBudget = (branchId: string) => {
    const info = budgetsState[branchId];
    if (!info) return { totalHours: 0, totalCost: 0, status: 'pending' };

    const status = info.status || 'pending';
    const holidays = info.holidays !== undefined ? info.holidays : 2;

    const { dayCounts } = getDaysOfWeekCounts(selectedMonth);
    const groupADays = info.groupADays || ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Domingo'];
    const groupBDays = info.groupBDays || ['Viernes', 'Sábado'];

    let countDaysGroupA = 0;
    let countDaysGroupB = 0;
    groupADays.forEach((day: string) => {
      countDaysGroupA += dayCounts[day] || 0;
    });
    groupBDays.forEach((day: string) => {
      countDaysGroupB += dayCounts[day] || 0;
    });

    let totalHours = 0;
    let totalCost = 0;

    if (info.rows && Array.isArray(info.rows) && info.rows.length > 0) {
      info.rows.forEach((row: any) => {
        let posMonthlyHs = 0;
        
        if (row.total_hours && Number(row.total_hours) > 0) {
          // From Supabase import: use pre-calculated total_hours
          posMonthlyHs = Number(row.total_hours);
        } else if (row.staffByDate && Object.keys(row.staffByDate).length > 0) {
          // From localStorage/manual format: calculate from staffByDate
          posMonthlyHs = Object.values(row.staffByDate as Record<string,number>)
            .reduce((s: number, v: number) => s + (Number(v) * (row.hoursPerDay || 0)), 0);
        } else {
          // Week columns fallback
          posMonthlyHs = Number(row.week1 || 0) + Number(row.week2 || 0) +
                         Number(row.week3 || 0) + Number(row.week4 || 0) +
                         Number(row.week5 || 0);
        }

        totalHours += posMonthlyHs;

        // Use pre-calculated total_cost if available (includes holiday premium)
        if (row.total_cost && Number(row.total_cost) > 0) {
          totalCost += Number(row.total_cost);
        } else {
          const rate = Number(row.hourly_rate || row.hourlyRate || 0);
          totalCost += posMonthlyHs * rate;
        }
      });
    } else {
      // Legacy support
      // No legacy fallback - show 0 when no real data
    }

    return { totalHours, totalCost, status };
  };

  // Totals calculations across all branches
  const consolidatedMetrics = useMemo(() => {
    let totalHours = 0;
    let totalCost = 0;
    let approvedCount = 0;

    branches.forEach(b => {
      const calc = getBranchCalculatedBudget(b.id);
      totalHours += calc.totalHours;
      totalCost += calc.totalCost;
      if (calc.status === 'approved') approvedCount++;
    });

    return { totalHours, totalCost, approvedCount };
  }, [branches, budgetsState, selectedMonth]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-20 text-[11px]"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-bg-card border border-border-dim p-6 rounded-lg">
        <div>
          <h2 className="text-xl font-black uppercase text-text-main tracking-widest flex items-center gap-2">
            <Layers className="text-brand-500" size={24} /> Gerencia General: Aprobación de Presupuestos
          </h2>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 opacity-70">
            Aprobación jerárquica de dotaciones y de presupuestos de horas mensuales por sucursal
          </p>
        </div>

        <div className="bg-bg-sidebar border border-border-dim rounded p-2 px-4 flex items-center gap-3">
          <Calendar size={16} className="text-brand-500" />
          <input 
            type="month" 
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent border-none font-mono text-text-main text-xs outline-none uppercase font-bold"
          />
        </div>
      </div>

      {/* Consolidation Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-bg-sidebar border border-border-dim p-4 rounded-lg">
          <p className="text-[9px] font-black text-text-dim uppercase tracking-wider">Costo Consolidado Mensual</p>
          <p className="text-xl font-mono font-black text-brand-500 mt-1">
            ${consolidatedMetrics.totalCost.toLocaleString('es-AR')}
          </p>
          <span className="text-[8px] font-bold text-text-dim uppercase opacity-60">
            Suma total monetaria proyectada
          </span>
        </div>

        <div className="bg-bg-sidebar border border-border-dim p-4 rounded-lg">
          <p className="text-[9px] font-black text-text-dim uppercase tracking-wider">Horas Presupuestadas</p>
          <p className="text-xl font-mono font-bold text-text-main mt-1">
            {consolidatedMetrics.totalHours.toLocaleString()}h
          </p>
          <span className="text-[8px] font-bold text-text-dim uppercase opacity-60">
            Total horas planificadas mes
          </span>
        </div>

        <div className="bg-bg-sidebar border border-border-dim p-4 rounded-lg">
          <p className="text-[9px] font-black text-text-dim uppercase tracking-wider">Estado Aprobaciones</p>
          <p className="text-xl font-mono font-bold text-brand-500 mt-1">
            {consolidatedMetrics.approvedCount} / {branches.length}
          </p>
          <span className="text-[8px] font-bold text-text-dim uppercase opacity-60">
            Sucursales con presupuesto aprobado
          </span>
        </div>

        <div className="bg-bg-sidebar border border-brand-500/25 p-4 rounded-lg flex items-center justify-between gap-3">
          <div>
            <p className="text-[9px] font-black text-brand-500 uppercase tracking-wide">Cierre Gerencia</p>
            <p className="font-bold text-text-main mt-1">
              {consolidatedMetrics.approvedCount === branches.length ? 'CIERRE COMPLETO' : 'PENDIENTE DE AUTORIZACIÓN'}
            </p>
          </div>
          <div className={cn(
            "p-2 rounded-full",
            consolidatedMetrics.approvedCount === branches.length ? "bg-emerald-500/20 text-emerald-500" : "bg-amber-500/10 text-amber-500"
          )}>
            <CheckCircle2 size={20} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Branches Grid Column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-2xl">
            <div className="p-4 bg-bg-accent/30 border-b border-border-dim">
              <h3 className="text-xs font-black uppercase tracking-widest text-text-main">
                Presupuestos por Sucursal - Periodo: {selectedMonth}
              </h3>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-bg-accent border-b border-border-dim text-[10px] uppercase text-text-dim tracking-widest font-black">
                    <th className="px-6 py-4">Sucursal</th>
                    <th className="px-4 py-4 text-center">Horas Presupuestadas</th>
                    <th className="px-4 py-4 text-center">Costo Mensual Proyectado</th>
                    <th className="px-4 py-4 text-center">Estado</th>
                    <th className="px-6 py-4 text-right font-black">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim/50">
                  {branches.map(b => {
                    const calc = getBranchCalculatedBudget(b.id);
                    const isApproved = calc.status === 'approved';
                    const isSelected = selectedBranch?.id === b.id;

                    return (
                      <tr 
                        key={b.id} 
                        onClick={() => setSelectedBranch(b)}
                        className={cn(
                          "cursor-pointer hover:bg-bg-accent/30 transition-all text-xs font-medium text-text-main",
                          isSelected && "bg-brand-500/[0.03] border-l-2 border-brand-500"
                        )}
                      >
                        <td className="px-6 py-4">
                          <span className="font-sans font-bold uppercase block">{b.name}</span>
                          <span className="text-[10px] text-text-dim font-bold block opacity-60">{b.location || 'Argentina'}</span>
                        </td>
                        <td className="px-4 py-4 text-center font-mono font-bold text-text-dim text-xs">
                          {calc.totalHours.toLocaleString()}h
                        </td>
                        <td className="px-4 py-4 text-center font-mono font-bold text-brand-500 text-xs font-black">
                          ${calc.totalCost.toLocaleString('es-AR')}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {isApproved ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-500 text-[9px] font-black uppercase border border-emerald-500/20">
                              <CheckCircle2 size={11} /> Aprobado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-amber-500/10 text-amber-500 text-[9px] font-black uppercase border border-amber-500/20 animate-pulse">
                              <AlertCircle size={11} /> Pendiente
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right" onClick={e => e.stopPropagation()}>
                          <button
                            onClick={() => handleToggleApprove(b.id)}
                            className={cn(
                              "text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded transition-all border",
                              isApproved 
                                ? "bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/35"
                                : "bg-emerald-500 text-black border-emerald-500 hover:bg-emerald-600 font-bold"
                            )}
                          >
                            {isApproved ? 'Desautorizar' : 'Autorizar'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Detailed Breakdown for the selected branch */}
        <div className="lg:col-span-1">
          {selectedBranch ? (
            <motion.div 
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-bg-sidebar border border-border-dim rounded-lg p-5 space-y-4 shadow-2xl"
            >
              <div className="flex justify-between items-center border-b border-border-dim pb-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-[#FFFFFF]">
                  Visualización Analítica: {selectedBranch.name.toUpperCase()}
                </h3>
                <span className="text-[9px] font-mono font-bold uppercase text-brand-500 bg-brand-500/10 border border-brand-500/20 px-2 py-0.5 rounded">
                  {budgetsState[selectedBranch.id]?.status === 'approved' ? 'APROBADO' : 'PENDIENTE'}
                </span>
              </div>

              <div className="divide-y divide-border-dim/40 max-h-96 overflow-y-auto pr-1">
                {/* Check if new Rows schema or legacy Positions */}
                {budgetsState[selectedBranch.id]?.rows && Array.isArray(budgetsState[selectedBranch.id].rows) ? (
                  budgetsState[selectedBranch.id].rows.map((row: BudgetRow) => {
                    const bInfo = budgetsState[selectedBranch.id];
                    const { dayCounts } = getDaysOfWeekCounts(selectedMonth);
                    const groupADays = bInfo.groupADays || ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Domingo'];
                    const groupBDays = bInfo.groupBDays || ['Viernes', 'Sábado'];
                    const holidays = bInfo.holidays !== undefined ? bInfo.holidays : 2;

                    let countDaysGroupA = 0;
                    let countDaysGroupB = 0;
                    groupADays.forEach((day: string) => {
                      countDaysGroupA += dayCounts[day] || 0;
                    });
                    groupBDays.forEach((day: string) => {
                      countDaysGroupB += dayCounts[day] || 0;
                    });

                    const hoursA = countDaysGroupA * row.countGroupA * row.hoursPerDay;
                    const hoursB = countDaysGroupB * row.countGroupB * row.hoursPerDay;
                    const posMonthlyHs = hoursA + hoursB;
                    const holidayHs = holidays * row.countGroupB * row.hoursPerDay;
                    const totalCostRow = (posMonthlyHs * row.hourlyRate) + (holidayHs * row.hourlyRate);

                    return (
                      <div key={row.id} className="py-2.5 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-bold text-text-main uppercase font-sans tracking-wide">
                            {row.roleLabel} <span className="text-[9px] font-black text-brand-500">[{row.shift}]</span>
                          </p>
                          <p className="text-[9px] text-[#8C959F] mt-0.5 font-bold">
                            Nom: {row.countGroupA}p • Esp: {row.countGroupB}p • {row.hoursPerDay}h/d
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-black text-text-main">${totalCostRow.toLocaleString()}</p>
                          <p className="text-[9px] font-mono text-brand-500 font-bold tracking-tight uppercase">
                            {posMonthlyHs} horas
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  // No legacy data
                  [].map((pos: LegacyBudgetPosition) => {
                    const bInfo = budgetsState[selectedBranch.id] || {
                      daysInMonth: 30,
                      fridays: 4,
                      saturdays: 4,
                      sundays: 4,
                      holidays: 2
                    };
                    const weekendDaysCount = bInfo.fridays + bInfo.saturdays + bInfo.sundays;
                    const weekdayDaysCount = Math.max(0, bInfo.daysInMonth - weekendDaysCount);
                    const posMonthlyHs = (weekdayDaysCount * pos.countWeekday * pos.hoursPerDay) + (weekendDaysCount * pos.countWeekend * pos.hoursPerDay);
                    const posMonthlyTotal = (posMonthlyHs * pos.hourlyRate) + (bInfo.holidays * pos.countWeekend * pos.hoursPerDay * pos.hourlyRate);

                    return (
                      <div key={pos.id} className="py-2.5 flex justify-between items-center text-xs">
                        <div>
                          <p className="font-bold text-text-main uppercase font-sans tracking-wide">{pos.name}</p>
                          <p className="text-[9px] text-[#8C959F] mt-0.5 font-bold">
                            Lu-Ju: {pos.countWeekday}p • Vi-Do: {pos.countWeekend}p • {pos.hoursPerDay}h/d
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-black text-text-main">${posMonthlyTotal.toLocaleString()}</p>
                          <p className="text-[9px] font-mono text-brand-500 font-bold tracking-tight uppercase">
                            {posMonthlyHs} horas
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="bg-bg-accent/50 border border-border-dim p-4 rounded-lg space-y-2 mt-4">
                <div className="flex justify-between text-xs">
                  <span className="text-text-dim uppercase font-bold">Costo Proyectado Feriados:</span>
                  <span className="font-mono font-black text-brand-500">
                    ${(budgetsState[selectedBranch.id]?.rows 
                    ? budgetsState[selectedBranch.id].rows.reduce((acc: number, p: BudgetRow) => {
                        const bInfo = budgetsState[selectedBranch.id];
                        const holidays = bInfo.holidays !== undefined ? bInfo.holidays : 2;
                        return acc + (holidays * (p.countGroupB * p.hoursPerDay) * p.hourlyRate);
                      }, 0)
                    : 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-xs border-t border-border-dim/40 pt-2 font-black">
                  <span className="text-[#FFFFFF] uppercase text-[10px]">MONTO TOTAL PRESUPUESTADO:</span>
                  <span className="text-brand-500 font-mono text-xs">
                    ${getBranchCalculatedBudget(selectedBranch.id).totalCost.toLocaleString('es-AR')}
                  </span>
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="bg-bg-sidebar border border-border-dim border-dashed rounded-lg p-12 text-center text-text-dim">
              <Building2 className="mx-auto text-text-dim opacity-30 mb-3" size={28} />
              <p className="text-xs font-black uppercase tracking-widest opacity-50">Seleccione sucursal para ver desglose de puestos</p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
