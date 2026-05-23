/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { Calendar, Users, Calculator, Info, Save, TrendingUp, AlertCircle } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';

interface BudgetPosition {
  id: string;
  name: string;
  countWeekday: number;
  countWeekend: number; // Fri, Sat, Sun
  hoursPerDay: number;
  hourlyRate: number;
}

const INITIAL_POSITIONS: BudgetPosition[] = [
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

export default function HourBudgetView({ selectedBranchId, branches }: { selectedBranchId: string, branches: Branch[] }) {
  const activeBranch = branches.find(b => b.id === selectedBranchId) || branches[0];
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  
  // Day counters
  const [daysInMonth, setDaysInMonth] = useState(30);
  const [fridays, setFridays] = useState(4);
  const [saturdays, setSaturdays] = useState(4);
  const [sundays, setSundays] = useState(4);
  const [holidays, setHolidays] = useState(1);

  const [positions, setPositions] = useState<BudgetPosition[]>(INITIAL_POSITIONS);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [budgetStatus, setBudgetStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');

  // Load saved budget or defaults
  React.useEffect(() => {
    const branchIdKey = selectedBranchId === 'all' ? '1' : selectedBranchId;
    const storageKey = `hour_budget_${branchIdKey}_${selectedMonth}`;
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.positions) setPositions(parsed.positions);
        if (parsed.daysInMonth) setDaysInMonth(parsed.daysInMonth);
        if (parsed.fridays) setFridays(parsed.fridays);
        if (parsed.saturdays) setSaturdays(parsed.saturdays);
        if (parsed.sundays) setSundays(parsed.sundays);
        if (parsed.holidays) setHolidays(parsed.holidays);
        if (parsed.status) setBudgetStatus(parsed.status);
      } catch (e) {
        console.error('Error loading budget', e);
      }
    } else {
      setPositions(INITIAL_POSITIONS);
      setBudgetStatus('pending');
    }
  }, [selectedBranchId, selectedMonth]);

  const handleSaveBudget = () => {
    const branchIdKey = selectedBranchId === 'all' ? '1' : selectedBranchId;
    const storageKey = `hour_budget_${branchIdKey}_${selectedMonth}`;
    const payload = {
      positions,
      daysInMonth,
      fridays,
      saturdays,
      sundays,
      holidays,
      status: budgetStatus
    };
    localStorage.setItem(storageKey, JSON.stringify(payload));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  const budget = useMemo(() => {
    let totalHours = 0;
    let totalCost = 0;

    const weekendDaysCount = fridays + saturdays + sundays;
    const weekdayDaysCount = Math.max(0, daysInMonth - weekendDaysCount);

    positions.forEach(pos => {
      // Calculation based on different staffing for weekdays vs weekends
      const weekdayHours = weekdayDaysCount * (pos.countWeekday * pos.hoursPerDay);
      const weekendHours = weekendDaysCount * (pos.countWeekend * pos.hoursPerDay);
      const posMonthlyHours = weekdayHours + weekendHours;
      
      // Holiday surcharge (Assuming they use weekend staffing level for holidays)
      const holidayExtraCost = holidays * (pos.countWeekend * pos.hoursPerDay) * pos.hourlyRate; 

      totalHours += posMonthlyHours;
      totalCost += (posMonthlyHours * pos.hourlyRate) + holidayExtraCost;
    });

    return { totalHours, totalCost, weekdayDaysCount, weekendDaysCount };
  }, [positions, daysInMonth, fridays, saturdays, sundays, holidays]);

  const handlePositionChange = (id: string, field: keyof BudgetPosition, value: string) => {
    const numValue = parseFloat(value) || 0;
    setPositions(prev => prev.map(p => p.id === id ? { ...p, [field]: numValue } : p));
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-20"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/10 p-2 text-brand-500 border border-brand-500/20 rounded">
            <Calendar size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main uppercase tracking-tight">
              Presupuestador de horas {activeBranch ? `• ${activeBranch.name}` : '(CONSOLIDADO)'}
            </h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">Planificación mensual estratégica (Supervisor)</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-bg-sidebar border border-border-dim rounded p-2 px-4 flex items-center gap-3">
            <Calendar size={16} className="text-brand-500" />
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none text-[11px] font-mono text-text-main outline-none uppercase"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Variables Section */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-bg-sidebar border border-border-dim rounded-lg p-6 space-y-6">
            <h3 className="text-[11px] font-black uppercase text-brand-500 flex items-center gap-2">
              <Calculator size={14} /> Variables del Mes
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-text-dim uppercase tracking-wider">Días del Mes</label>
                <input 
                  type="number" 
                  value={daysInMonth}
                  onChange={(e) => setDaysInMonth(parseInt(e.target.value) || 0)}
                  className="w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-sm font-mono text-text-main focus:border-brand-500 outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-text-dim uppercase tracking-wider text-brand-500">Feriados (x2)</label>
                <input 
                  type="number" 
                  value={holidays}
                  onChange={(e) => setHolidays(parseInt(e.target.value) || 0)}
                  className="w-full bg-bg-accent border border-brand-500/50 rounded px-3 py-2 text-sm font-mono text-brand-500 focus:border-brand-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-2">
              <div className="space-y-1.5 text-center">
                <label className="text-[8px] font-bold text-text-dim uppercase">Viernes</label>
                <input 
                  type="number" 
                  value={fridays}
                  onChange={(e) => setFridays(parseInt(e.target.value) || 0)}
                  className="w-full bg-bg-accent border border-border-dim rounded py-1 px-2 text-center text-xs font-mono text-text-main focus:border-brand-500 outline-none"
                />
              </div>
              <div className="space-y-1.5 text-center">
                <label className="text-[8px] font-bold text-text-dim uppercase">Sábados</label>
                <input 
                  type="number" 
                  value={saturdays}
                  onChange={(e) => setSaturdays(parseInt(e.target.value) || 0)}
                  className="w-full bg-bg-accent border border-border-dim rounded py-1 px-2 text-center text-xs font-mono text-text-main focus:border-brand-500 outline-none"
                />
              </div>
              <div className="space-y-1.5 text-center">
                <label className="text-[8px] font-bold text-text-dim uppercase">Domingos</label>
                <input 
                  type="number" 
                  value={sundays}
                  onChange={(e) => setSundays(parseInt(e.target.value) || 0)}
                  className="w-full bg-bg-accent border border-border-dim rounded py-1 px-2 text-center text-xs font-mono text-text-main focus:border-brand-500 outline-none"
                />
              </div>
            </div>

            <div className="mt-4 p-4 bg-brand-500/5 border border-brand-500/10 rounded-lg">
                <div className="flex gap-3">
                    <Info size={20} className="text-brand-500 shrink-0" />
                    <p className="text-[10px] text-text-dim leading-relaxed font-bold uppercase tracking-tight">
                        El cálculo contempla que los feriados se pagan al 100% extra (Doble).
                        Los fines de semana se utilizan para proyectar variaciones en la rotación.
                    </p>
                </div>
            </div>
          </div>

          <div className="bg-bg-sidebar border border-brand-500/20 rounded-lg p-6 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <TrendingUp size={60} className="text-brand-500" />
            </div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#8B949E] mb-4">Total Presupuestado</h4>
            <div className="space-y-4">
              <div>
                <p className="text-[9px] text-text-dim uppercase font-bold opacity-60">Horas Totales Mes</p>
                <p className="text-2xl font-mono font-bold text-text-main tracking-tight">{budget.totalHours.toLocaleString()}h</p>
              </div>
              <div className="pt-4 border-t border-border-dim">
                <p className="text-[9px] text-text-dim uppercase font-bold opacity-60">Monto Mensual Proyectado</p>
                <p className="text-3xl font-mono font-black text-brand-500 tracking-tighter italic">
                  ${budget.totalCost.toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Positions Table */}
        <div className="lg:col-span-2">
          <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden flex flex-col h-full">
            <div className="p-6 border-b border-border-dim flex justify-between items-center">
              <h3 className="text-[11px] font-black uppercase text-text-main flex items-center gap-2">
                <Users size={14} className="text-brand-500" /> Dotación por Puesto
              </h3>
            </div>
            
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left">
                <thead className="bg-[#1C1C1C] border-b border-border-dim">
                  <tr>
                    <th className="px-6 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest">Puesto</th>
                    <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Pers. Lu-Ju</th>
                    <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Pers. Vi-Do</th>
                    <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Hs Jornada</th>
                    <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Valor Hora</th>
                    <th className="px-6 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-right">Monto Mes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim">
                  {positions.map((pos) => {
                    const posMonthlyHs = (budget.weekdayDaysCount * pos.countWeekday * pos.hoursPerDay) + (budget.weekendDaysCount * pos.countWeekend * pos.hoursPerDay);
                    const posMonthlyTotal = (posMonthlyHs * pos.hourlyRate) + (holidays * pos.countWeekend * pos.hoursPerDay * pos.hourlyRate);

                    return (
                      <tr key={pos.id} className="hover:bg-bg-accent/50 transition-colors group">
                        <td className="px-6 py-4">
                          <span className="text-xs font-black uppercase text-text-main tracking-tight">{pos.name}</span>
                        </td>
                        <td className="px-4 py-4">
                          <input 
                            type="number"
                            value={pos.countWeekday}
                            onChange={(e) => handlePositionChange(pos.id, 'countWeekday', e.target.value)}
                            className="w-16 mx-auto block bg-bg-accent border border-border-dim rounded py-1.5 px-2 text-center text-text-main font-mono focus:border-brand-500 outline-none"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <input 
                            type="number"
                            value={pos.countWeekend}
                            onChange={(e) => handlePositionChange(pos.id, 'countWeekend', e.target.value)}
                            className="w-16 mx-auto block bg-bg-accent border border-brand-500/30 rounded py-1.5 px-2 text-center text-text-main font-mono focus:border-brand-500 outline-none"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <input 
                            type="number"
                            value={pos.hoursPerDay}
                            onChange={(e) => handlePositionChange(pos.id, 'hoursPerDay', e.target.value)}
                            className="w-16 mx-auto block bg-bg-accent border border-border-dim rounded py-1.5 px-2 text-center text-text-main font-mono focus:border-brand-500 outline-none"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-[10px] text-text-dim font-bold">$</span>
                            <input 
                              type="number"
                              value={pos.hourlyRate}
                              onChange={(e) => handlePositionChange(pos.id, 'hourlyRate', e.target.value)}
                              className="w-20 bg-bg-accent border border-border-dim rounded py-1.5 px-2 text-center text-xs font-mono text-text-main focus:border-brand-500 outline-none"
                            />
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-col items-end">
                              <span className="text-sm font-mono font-bold text-text-main">
                                  ${posMonthlyTotal.toLocaleString()}
                              </span>
                              <span className="text-[9px] font-bold text-text-dim opacity-50 uppercase">
                                  {posMonthlyHs.toLocaleString()} Hs Totales
                              </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-6 bg-bg-accent border-t border-border-dim flex items-center justify-between">
              <div className="flex gap-6 items-center">
                 <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-text-dim uppercase opacity-60">Hs Promedio/Día</span>
                    <span className="text-sm font-mono font-bold text-text-main">{(budget.totalHours / daysInMonth).toFixed(1)}h</span>
                 </div>
                 <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-brand-500 uppercase opacity-60">Surcharge Feriados</span>
                    <span className="text-sm font-mono font-bold text-brand-500">
                      ${positions.reduce((acc, pos) => acc + (holidays * (pos.countWeekend * pos.hoursPerDay) * pos.hourlyRate), 0).toLocaleString()}
                    </span>
                 </div>
                 <div className="flex flex-col">
                    <span className="text-[9px] font-bold text-text-dim uppercase opacity-60">Estado de Aprobación</span>
                    <span className={cn(
                      "text-[10px] font-black uppercase px-2 py-0.5 rounded border mt-0.5",
                      budgetStatus === 'approved' 
                        ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/25"
                        : budgetStatus === 'rejected'
                          ? "bg-red-500/10 text-red-500 border-red-500/25"
                          : "bg-amber-500/15 text-amber-500 border-amber-500/25 animate-pulse"
                    )}>
                      {budgetStatus === 'approved' ? 'Aprobado Gerencia' : budgetStatus === 'rejected' ? 'Rechazado' : 'Pendiente Líder'}
                    </span>
                 </div>
              </div>
              <div className="flex items-center gap-2">
                {saveSuccess && (
                  <span className="text-[10px] font-bold text-emerald-500 uppercase py-2 px-3 bg-emerald-500/10 rounded border border-emerald-500/20">
                    ¡Presupuesto Guardado!
                  </span>
                )}
                <button 
                  onClick={handleSaveBudget}
                  className="bg-brand-500 hover:bg-brand-600 text-black px-8 py-3 rounded text-[11px] font-black uppercase tracking-widest transition-all flex items-center gap-2 shadow-lg shadow-brand-500/10"
                >
                  <Save size={16} /> GUARDAR PRESUPUESTO MENSUAL
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 bg-orange-500/5 border border-orange-500/20 rounded flex items-start gap-3">
        <AlertCircle size={20} className="text-orange-500 shrink-0 mt-0.5" />
        <p className="text-[10px] text-orange-500/80 font-bold uppercase tracking-tight leading-relaxed">
          Atención: Este presupuesto será la base contra la cual Recursos Humanos cargará las horas reales semanales. 
          Asegúrese de que el presupuesto esté aprobado por Gerencia General antes de auditar desvíos.
        </p>
      </div>
    </motion.div>
  );
}
