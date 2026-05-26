/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  Users, 
  Calculator, 
  Info, 
  Save, 
  TrendingUp, 
  AlertCircle,
  Plus,
  Trash2,
  MapPin,
  Clock,
  Layers,
  HelpCircle,
  Building2
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';

interface BudgetRow {
  id: string;
  branchId: string;
  roleId: string;
  roleLabel: string;
  shift: 'Mañana' | 'Tarde';
  countGroupA: number; // For Group A days of the week
  countGroupB: number; // For Group B days of the week
  hoursPerDay: number;
  hourlyRate: number;
}

const ROLES_LIST = [
  { id: 'encargado', label: 'Encargado', defaultRate: 3500 },
  { id: 'jefe_cocina', label: 'Jefe de Cocina', defaultRate: 3200 },
  { id: 'segundo_cocina', label: 'Segundo de Cocina', defaultRate: 2800 },
  { id: 'cocinero', label: 'Cocinero', defaultRate: 2500 },
  { id: 'caja', label: 'Caja', defaultRate: 2400 },
  { id: 'barra', label: 'Barra', defaultRate: 2300 },
  { id: 'mozos', label: 'Mozos', defaultRate: 2200 },
  { id: 'runners', label: 'Runners', defaultRate: 2000 },
  { id: 'bacha', label: 'Bacha', defaultRate: 1900 },
];

const DEFAULT_INITIAL_ROWS: BudgetRow[] = [
  { id: 'b1', branchId: '1', roleId: 'encargado', roleLabel: 'Encargado', shift: 'Mañana', countGroupA: 1, countGroupB: 1, hoursPerDay: 8, hourlyRate: 3500 },
  { id: 'b2', branchId: '1', roleId: 'encargado', roleLabel: 'Encargado', shift: 'Tarde', countGroupA: 1, countGroupB: 1, hoursPerDay: 8, hourlyRate: 3500 },
  { id: 'b3', branchId: '1', roleId: 'jefe_cocina', roleLabel: 'Jefe de Cocina', shift: 'Mañana', countGroupA: 1, countGroupB: 1, hoursPerDay: 8, hourlyRate: 3200 },
  { id: 'b4', branchId: '1', roleId: 'segundo_cocina', roleLabel: 'Segundo de Cocina', shift: 'Tarde', countGroupA: 1, countGroupB: 1, hoursPerDay: 8, hourlyRate: 2800 },
  { id: 'b5', branchId: '1', roleId: 'cocinero', roleLabel: 'Cocinero', shift: 'Mañana', countGroupA: 1, countGroupB: 1, hoursPerDay: 8, hourlyRate: 2500 },
  { id: 'b6', branchId: '1', roleId: 'cocinero', roleLabel: 'Cocinero', shift: 'Tarde', countGroupA: 2, countGroupB: 2, hoursPerDay: 8, hourlyRate: 2500 },
  { id: 'b7', branchId: '1', roleId: 'caja', roleLabel: 'Caja', shift: 'Mañana', countGroupA: 1, countGroupB: 1, hoursPerDay: 8, hourlyRate: 2400 },
  { id: 'b8', branchId: '1', roleId: 'caja', roleLabel: 'Caja', shift: 'Tarde', countGroupA: 1, countGroupB: 1, hoursPerDay: 8, hourlyRate: 2400 },
  { id: 'b9', branchId: '1', roleId: 'barra', roleLabel: 'Barra', shift: 'Mañana', countGroupA: 0.5, countGroupB: 1, hoursPerDay: 8, hourlyRate: 2300 },
  { id: 'b10', branchId: '1', roleId: 'barra', roleLabel: 'Barra', shift: 'Tarde', countGroupA: 0.5, countGroupB: 1, hoursPerDay: 8, hourlyRate: 2300 },
  { id: 'b11', branchId: '1', roleId: 'mozos', roleLabel: 'Mozos', shift: 'Mañana', countGroupA: 1, countGroupB: 2, hoursPerDay: 8, hourlyRate: 2200 },
  { id: 'b12', branchId: '1', roleId: 'mozos', roleLabel: 'Mozos', shift: 'Tarde', countGroupA: 2, countGroupB: 4, hoursPerDay: 8, hourlyRate: 2200 },
  { id: 'b13', branchId: '1', roleId: 'runners', roleLabel: 'Runners', shift: 'Tarde', countGroupA: 0.5, countGroupB: 1.5, hoursPerDay: 8, hourlyRate: 2000 },
  { id: 'b14', branchId: '1', roleId: 'bacha', roleLabel: 'Bacha', shift: 'Tarde', countGroupA: 1, countGroupB: 1, hoursPerDay: 8, hourlyRate: 1900 },
];

const WEEK_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

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

// Map roles to standard map room categories
const ROLE_TO_ROOM: Record<string, string> = {
  jefe_cocina: 'cocina',
  segundo_cocina: 'cocina',
  cocinero: 'cocina',
  bacha: 'bacha',
  barra: 'barra',
  caja: 'caja',
  encargado: 'salon',
  mozos: 'salon',
  runners: 'salon'
};

export default function HourBudgetView({ selectedBranchId, branches }: { selectedBranchId: string, branches: Branch[] }) {
  const [localBranchId, setLocalBranchId] = useState<string>(selectedBranchId === 'all' ? (branches[0]?.id || '') : selectedBranchId);
  const activeBranch = branches.find(b => b.id === localBranchId) || branches[0];
  const [selectedMonth, setSelectedMonth] = useState('2026-05');
  const [currentTab, setCurrentTab] = useState<'table' | 'map'>('table');
  
  // Synchronize local state with prop when it isn't "all"
  useEffect(() => {
    if (selectedBranchId !== 'all') {
      setLocalBranchId(selectedBranchId);
    }
  }, [selectedBranchId]);
  
  // Custom groupings: Group A (regular) and Group B (weekend/specific)
  const [groupADays, setGroupADays] = useState<string[]>(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Domingo']);
  const [groupBDays, setGroupBDays] = useState<string[]>(['Viernes', 'Sábado']);
  
  const [holidays, setHolidays] = useState(1);
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [budgetStatus, setBudgetStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');

  // Interactive Map State
  const [mapDayType, setMapDayType] = useState<'A' | 'B'>('A');
  const [mapShift, setMapShift] = useState<'Mañana' | 'Tarde'>('Tarde');
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>('cocina');

  // Read latest Maestro de Personal rates if available to update hourlyRate automatically
  const getMaestroRate = (roleId: string, roleLabel: string): number => {
    const saved = localStorage.getItem('craft_salary_positions');
    if (saved) {
      try {
        const positions = JSON.parse(saved);
        const hourlyPositions = positions.filter((p: any) => p.type === 'hourly');
        
        // Exact match
        const exact = hourlyPositions.find((p: any) => p.title.toLowerCase().trim() === roleLabel.toLowerCase().trim());
        if (exact) return exact.baseValue;

        // Approx match
        const approx = hourlyPositions.find((p: any) => p.title.toLowerCase().includes(roleLabel.toLowerCase()) || roleLabel.toLowerCase().includes(p.title.toLowerCase()));
        if (approx) return approx.baseValue;
      } catch (e) {
        console.error(e);
      }
    }
    const defaultR = ROLES_LIST.find(r => r.id === roleId);
    return defaultR ? defaultR.defaultRate : 2500;
  };

  // Compute total occurrences of days based on month
  const { totalDays: computedTotalDays, dayCounts } = useMemo(() => {
    return getDaysOfWeekCounts(selectedMonth);
  }, [selectedMonth]);

  // Compute count of days for group A and B in this month
  const { countDaysGroupA, countDaysGroupB } = useMemo(() => {
    let aSum = 0;
    let bSum = 0;
    groupADays.forEach(day => {
      aSum += dayCounts[day] || 0;
    });
    groupBDays.forEach(day => {
      bSum += dayCounts[day] || 0;
    });
    return { countDaysGroupA: aSum, countDaysGroupB: bSum };
  }, [groupADays, groupBDays, dayCounts]);

  // Load saved budget or defaults
  useEffect(() => {
    const branchIdKey = localBranchId === 'all' ? '1' : localBranchId;
    const storageKey = `hour_budget_${branchIdKey}_${selectedMonth}`;
    const saved = localStorage.getItem(storageKey);
    
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Map legacy arrays to have new properties
        if (parsed.rows) {
          setRows(parsed.rows);
        } else if (parsed.positions) {
          // Upgrade legacy positions to rows format
          const upgraded: BudgetRow[] = [];
          parsed.positions.forEach((p: any, idx: number) => {
            // Distribute on Mañana shift
            upgraded.push({
              id: `u-${idx}-m`,
              branchId: branchIdKey,
              roleId: p.id,
              roleLabel: p.name,
              shift: 'Mañana',
              countGroupA: p.countWeekday,
              countGroupB: p.countWeekend,
              hoursPerDay: p.hoursPerDay,
              hourlyRate: p.hourlyRate
            });
            // Distribute on Tarde shift
            upgraded.push({
              id: `u-${idx}-t`,
              branchId: branchIdKey,
              roleId: p.id,
              roleLabel: p.name,
              shift: 'Tarde',
              countGroupA: 0,
              countGroupB: 0,
              hoursPerDay: p.hoursPerDay,
              hourlyRate: p.hourlyRate
            });
          });
          setRows(upgraded);
        } else {
          // Populate with defaults assigned to this branch
          const defWithBranch = DEFAULT_INITIAL_ROWS.map(r => ({
            ...r,
            id: `init-${r.id}-${Math.random().toString(36).substr(2, 5)}`,
            branchId: branchIdKey,
            hourlyRate: getMaestroRate(r.roleId, r.roleLabel)
          }));
          setRows(defWithBranch);
        }

        if (parsed.groupADays) setGroupADays(parsed.groupADays);
        if (parsed.groupBDays) setGroupBDays(parsed.groupBDays);
        if (parsed.holidays !== undefined) setHolidays(parsed.holidays);
        if (parsed.status) setBudgetStatus(parsed.status);
      } catch (e) {
        console.error('Error loading budget, fell back to defaults', e);
      }
    } else {
      // Load standard defaults
      const branchIdKey = localBranchId === 'all' ? '1' : localBranchId;
      const defWithBranch = DEFAULT_INITIAL_ROWS.map(r => ({
        ...r,
        id: `init-${r.id}-${Math.random().toString(36).substr(2, 5)}`,
        branchId: branchIdKey,
        hourlyRate: getMaestroRate(r.roleId, r.roleLabel)
      }));
      setRows(defWithBranch);
      setGroupADays(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Domingo']);
      setGroupBDays(['Viernes', 'Sábado']);
      setHolidays(2);
      setBudgetStatus('pending');
    }
  }, [localBranchId, selectedMonth]);

  // Sync state saved
  const handleSaveBudget = () => {
    const branchIdKey = localBranchId === 'all' ? '1' : localBranchId;
    const storageKey = `hour_budget_${branchIdKey}_${selectedMonth}`;
    const payload = {
      rows,
      daysInMonth: computedTotalDays,
      groupADays,
      groupBDays,
      holidays,
      status: budgetStatus
    };
    
    localStorage.setItem(storageKey, JSON.stringify(payload));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleToggleDayGroup = (dayName: string) => {
    if (groupADays.includes(dayName)) {
      setGroupADays(groupADays.filter(d => d !== dayName));
      if (!groupBDays.includes(dayName)) {
        setGroupBDays([...groupBDays, dayName]);
      }
    } else {
      setGroupBDays(groupBDays.filter(d => d !== dayName));
      if (!groupADays.includes(dayName)) {
        setGroupADays([...groupADays, dayName]);
      }
    }
  };

  const handleAddRow = () => {
    const branchIdKey = selectedBranchId === 'all' ? '1' : selectedBranchId;
    const defaultRole = ROLES_LIST[3]; // Cocinero
    const newRow: BudgetRow = {
      id: `custom-${Math.random().toString(36).substr(2, 9)}`,
      branchId: branchIdKey,
      roleId: defaultRole.id,
      roleLabel: defaultRole.label,
      shift: 'Tarde',
      countGroupA: 1,
      countGroupB: 1,
      hoursPerDay: 8,
      hourlyRate: getMaestroRate(defaultRole.id, defaultRole.label)
    };
    setRows([...rows, newRow]);
  };

  const handleRemoveRow = (id: string) => {
    setRows(rows.filter(r => r.id !== id));
  };

  const handleRowChange = (id: string, field: keyof BudgetRow, value: any) => {
    setRows(rows.map(row => {
      if (row.id === id) {
        const updated = { ...row, [field]: value };
        if (field === 'roleId') {
          const matchRole = ROLES_LIST.find(rl => rl.id === value);
          if (matchRole) {
            updated.roleLabel = matchRole.label;
            updated.hourlyRate = getMaestroRate(matchRole.id, matchRole.label);
          }
        }
        return updated;
      }
      return row;
    }));
  };

  // Filter rows of current branch context
  const filteredRows = useMemo(() => {
    const activeBranchId = localBranchId === 'all' ? '1' : localBranchId;
    return rows.filter(r => r.branchId === activeBranchId);
  }, [rows, localBranchId]);

  // Calculations
  const budgetCalculations = useMemo(() => {
    let totalHours = 0;
    let totalCost = 0;

    filteredRows.forEach(row => {
      const hoursA = countDaysGroupA * row.countGroupA * row.hoursPerDay;
      const hoursB = countDaysGroupB * row.countGroupB * row.hoursPerDay;
      const posMonthlyHs = hoursA + hoursB;

      // Feriado extra cost double value assumption
      const holidayHs = holidays * row.countGroupB * row.hoursPerDay;
      const holidayExtraCost = row.roleId === 'encargado' ? 0 : holidayHs * row.hourlyRate;

      totalHours += posMonthlyHs;
      totalCost += (posMonthlyHs * row.hourlyRate) + holidayExtraCost;
    });

    return { totalHours, totalCost };
  }, [filteredRows, countDaysGroupA, countDaysGroupB, holidays]);

  // Helper for rendering interactive map metrics
  const mapData = useMemo(() => {
    const rolesPerRoom: Record<string, string[]> = {
      cocina: ['jefe_cocina', 'segundo_cocina', 'cocinero'],
      bacha: ['bacha'],
      barra: ['barra'],
      caja: ['caja'],
      salon: ['encargado', 'mozos', 'runners']
    };

    const roomTotals: Record<string, number> = { cocina: 0, bacha: 0, barra: 0, caja: 0, salon: 0 };
    const roomStaff: Record<string, Array<{ label: string; count: number }>> = { cocina: [], bacha: [], barra: [], caja: [], salon: [] };

    filteredRows.forEach(row => {
      if (row.shift === mapShift) {
        const headcount = mapDayType === 'A' ? row.countGroupA : row.countGroupB;
        if (headcount > 0) {
          const room = ROLE_TO_ROOM[row.roleId];
          if (room) {
            roomTotals[room] += headcount;
            const existing = roomStaff[room].find(s => s.label === row.roleLabel);
            if (existing) {
              existing.count += headcount;
            } else {
              roomStaff[room].push({ label: row.roleLabel, count: headcount });
            }
          }
        }
      }
    });

    return { roomTotals, roomStaff };
  }, [filteredRows, mapShift, mapDayType]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6 pb-20 text-[11px]"
    >
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/15 p-2.5 text-brand-500 border border-brand-500/25 rounded-md shadow-inner shadow-brand-500/5">
            <Calendar size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <h2 className="text-xl font-black text-text-main uppercase tracking-tight">
              Presupuestador de Horas {activeBranch ? `• ${activeBranch.name}` : ''}
            </h2>
            <p className="text-text-dim text-[9px] font-bold uppercase tracking-widest mt-0.5">Planificación Mensual Estratégica & Rotaciones de Personal</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Sucursal selection dropdown */}
          <div className="bg-bg-sidebar border border-border-dim rounded px-3 py-1.5 flex items-center gap-2.5">
            <Building2 size={14} className="text-brand-500" />
            <select
              value={localBranchId}
              onChange={(e) => setLocalBranchId(e.target.value)}
              className="bg-transparent border-none text-[10px] font-sans text-text-main outline-none uppercase font-bold cursor-pointer pr-4"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id} className="bg-bg-sidebar text-text-main">
                  {b.name.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-bg-sidebar border border-border-dim rounded px-3 py-1.5 flex items-center gap-2.5">
            <Calendar size={14} className="text-brand-500" />
            <input 
              type="month" 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none text-[10px] font-mono text-text-main outline-none uppercase font-bold"
            />
          </div>
        </div>
      </div>

      {/* Main Budget Panel Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Column Controls */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Day Group Configurator */}
          <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 space-y-4 shadow-sm">
            <h3 className="text-[10px] font-black uppercase text-brand-500 flex items-center gap-2 tracking-wider">
              <Calculator size={13} className="stroke-[2.5]" /> Configuración de Repetición
            </h3>
            <p className="text-[9px] text-text-dim font-bold uppercase leading-relaxed">
              Define qué días de la semana siguen el patrón de personal normal o se duplican por volumen comercial.
            </p>

            <div className="space-y-2 mt-4 font-sans">
              {WEEK_DAYS.map((day) => {
                const isGroupA = groupADays.includes(day);
                const occurrences = dayCounts[day] || 0;
                return (
                  <div 
                    key={day}
                    onClick={() => handleToggleDayGroup(day)}
                    className={cn(
                      "flex items-center justify-between p-2.5 rounded-lg border cursor-pointer select-none transition-all",
                      isGroupA 
                        ? "bg-bg-main/40 hover:bg-bg-accent/60 border-border-dim/80 text-text-main" 
                        : "bg-brand-50/70 border-brand-500/30 text-brand-600 hover:bg-brand-50 dark:bg-brand-500/10 dark:border-brand-500/30 dark:text-brand-500 dark:hover:bg-brand-500/15"
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={cn(
                        "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black",
                        isGroupA 
                          ? "bg-bg-accent text-text-dim border border-border-dim/60" 
                          : "bg-brand-500 text-white font-extrabold shadow-sm"
                      )}>
                        {isGroupA ? 'A' : 'B'}
                      </div>
                      <span className={cn(
                        "font-extrabold text-[10.5px] uppercase tracking-wide",
                        isGroupA ? "text-text-main" : "text-brand-600 dark:text-brand-500"
                      )}>{day}</span>
                    </div>
                    <span className={cn(
                      "font-mono text-[9.5px] font-bold uppercase",
                      isGroupA ? "text-text-dim" : "text-brand-600/90 dark:text-brand-500/90"
                    )}>
                      {occurrences} {occurrences === 1 ? 'vez' : 'veces'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Summarizer of computed days */}
            <div className="pt-3.5 border-t border-border-dim/60 grid grid-cols-2 gap-2 text-center">
              <div>
                <p className="text-[8px] font-black text-text-dim uppercase tracking-wider">Patrón Normal (Grupo A)</p>
                <p className="text-xs font-mono font-black text-text-main mt-1 bg-bg-main/35 py-1 px-2 rounded border border-border-dim/40 inline-block min-w-[60px]">{countDaysGroupA} días</p>
              </div>
              <div>
                <p className="text-[8px] font-black text-brand-600 dark:text-brand-500 uppercase tracking-wider">Fin de Semana (Grupo B)</p>
                <p className="text-xs font-mono font-black text-brand-600 dark:text-brand-500 mt-1 bg-brand-500/10 dark:bg-brand-500/15 py-1 px-2 border border-brand-500/25 rounded inline-block min-w-[60px]">{countDaysGroupB} días</p>
              </div>
            </div>

            <div className="space-y-1.5 pt-2">
              <label className="text-[9px] font-black text-brand-600 dark:text-brand-500 uppercase tracking-widest">Feriados Proyectados</label>
              <input 
                type="number" 
                value={holidays}
                onChange={(e) => setHolidays(parseInt(e.target.value) || 0)}
                className="w-full bg-bg-main border border-border-dim/80 rounded px-2.5 py-1.5 text-[11px] font-mono font-bold text-brand-600 dark:text-brand-500 focus:border-brand-500 outline-none"
                min="0"
              />
            </div>
          </div>

          {/* Budget Metrics Card */}
          <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
              <TrendingUp size={60} className="text-brand-500" />
            </div>
            
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[#8B949E] dark:text-text-dim mb-4">Total Presupuestado Sucursal</h4>
            <div className="space-y-4">
              <div>
                <p className="text-[8px] text-[#8B949E] uppercase font-black tracking-widest opacity-70">Horas Totales del Mes</p>
                <p className="text-2xl font-mono font-black text-text-main mt-0.5">
                  {budgetCalculations.totalHours.toLocaleString()}h
                </p>
              </div>
              
              <div className="pt-4 border-t border-border-dim/50">
                <p className="text-[8px] text-[#8B949E] uppercase font-black tracking-widest opacity-70">Costo Mensual Planificado</p>
                <p className="text-3xl font-mono font-black text-brand-600 dark:text-brand-500 tracking-tighter italic">
                  ${budgetCalculations.totalCost.toLocaleString('es-AR')}
                </p>
                <span className="text-[8.5px] font-bold text-text-dim block mt-2.5 uppercase leading-relaxed">
                  Basado en {WEEK_DAYS.length} rotaciones semanales con feriados
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Columns (Split View: Table vs Map) */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Section Navigation Tabs */}
          <div className="flex border-b border-border-dim bg-[#121212]/30 p-1.5 rounded-lg justify-between items-center gap-4">
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentTab('table')}
                className={cn(
                  "px-5 py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all",
                  currentTab === 'table'
                    ? "bg-brand-500 text-black font-extrabold shadow-md"
                    : "text-text-dim hover:text-text-main"
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Calculator size={13} /> Tabla de Dotación por Turno
                </span>
              </button>
              
              <button
                onClick={() => setCurrentTab('map')}
                className={cn(
                  "px-5 py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all",
                  currentTab === 'map'
                    ? "bg-brand-500 text-black font-extrabold shadow-md"
                    : "text-text-dim hover:text-text-main"
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Layers size={13} /> Visualizador: Mapa de Sucursal
                </span>
              </button>
            </div>

            <div className="flex items-center gap-3">
              <p className="text-[9px] font-black uppercase text-text-dim">Estado:</p>
              <span className={cn(
                "px-2 py-0.5 rounded border text-[8.5px] font-black font-mono uppercase",
                budgetStatus === 'approved' 
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                  : budgetStatus === 'rejected'
                    ? "bg-red-500/10 text-red-500 border-red-500/20"
                    : "bg-amber-500/15 text-amber-500 border-amber-500/20"
              )}>
                {budgetStatus === 'approved' ? 'Aprobado' : budgetStatus === 'rejected' ? 'Rechazado' : 'Pendiente'}
              </span>
            </div>
          </div>

          <AnimatePresence mode="wait">
            
            {/* View A: Table Grid */}
            {currentTab === 'table' && (
              <motion.div
                key="table-view"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden"
              >
                <div className="p-4 bg-[#1A1A1A] border-b border-border-dim flex justify-between items-center">
                  <h3 className="text-xs font-black uppercase text-[#E0E0E0] flex items-center gap-1.5">
                    <Users size={14} className="text-brand-500" /> Presupuestación de Puestos por Turno
                  </h3>
                  <button 
                    onClick={handleAddRow}
                    className="text-[10px] font-black uppercase text-brand-500 hover:text-brand-600 transition-all flex items-center gap-1.5 border border-brand-500/10 px-3 py-1.5 bg-brand-500/[0.02] rounded"
                  >
                    <Plus size={13} className="stroke-[2.5]" /> Agregar Fila de Rotación
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[900px]">
                    <thead>
                      <tr className="bg-bg-accent/40 border-b border-border-dim text-[9px] uppercase text-text-dim tracking-widest font-black">
                        <th className="px-4 py-4">Sucursal</th>
                        <th className="px-4 py-4">Puesto</th>
                        <th className="px-4 py-4 text-center">Turno</th>
                        <th className="px-4 py-4 text-center">Pers. Normal (Grupo A)</th>
                        <th className="px-4 py-4 text-center">Pers. Especial (Grupo B)</th>
                        <th className="px-4 py-4 text-center">Hs Jornada</th>
                        <th className="px-4 py-4 text-center">$ Hora/Mensual</th>
                        <th className="px-4 py-4 text-right">Coste Proyectado</th>
                        <th className="px-4 py-4 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dim/40">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-6 py-12 text-center text-text-dim uppercase font-black opacity-40">
                            No hay filas de presupuesto para esta sucursal. ¡Crea una para comenzar!
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row) => {
                          const hoursPerMonth = (countDaysGroupA * row.countGroupA * row.hoursPerDay) + (countDaysGroupB * row.countGroupB * row.hoursPerDay);
                          const holidayDoublePayCost = holidays * row.countGroupB * row.hoursPerDay * row.hourlyRate;
                          const totalCostRow = (hoursPerMonth * row.hourlyRate) + holidayDoublePayCost;

                          return (
                            <tr key={row.id} className="hover:bg-bg-accent/30 transition-colors group">
                              {/* Sucursal Column */}
                              <td className="px-4 py-3 text-text-dim uppercase font-sans font-black text-[9px] max-w-[150px] truncate">
                                {activeBranch?.name}
                              </td>

                              {/* Puesto Column */}
                              <td className="px-4 py-3">
                                <select
                                  value={row.roleId}
                                  onChange={(e) => handleRowChange(row.id, 'roleId', e.target.value)}
                                  className="bg-bg-accent border border-border-dim rounded px-2 py-1 text-[10.5px] font-bold text-text-main outline-none focus:border-brand-500 uppercase w-full max-w-[160px] h-8"
                                >
                                  {ROLES_LIST.map(rl => (
                                    <option key={rl.id} value={rl.id}>{rl.label}</option>
                                  ))}
                                </select>
                              </td>

                              {/* Turno Column */}
                              <td className="px-4 py-3 text-center">
                                <select
                                  value={row.shift}
                                  onChange={(e) => handleRowChange(row.id, 'shift', e.target.value as 'Mañana' | 'Tarde')}
                                  className="bg-bg-accent border border-border-dim rounded px-2 py-1 text-[10.5px] font-bold text-text-main outline-none focus:border-brand-500 uppercase h-8"
                                >
                                  <option value="Mañana">Mañana</option>
                                  <option value="Tarde">Tarde</option>
                                </select>
                              </td>

                              {/* Pers. Normal Column */}
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="number"
                                  value={row.countGroupA}
                                  onChange={(e) => handleRowChange(row.id, 'countGroupA', parseFloat(e.target.value) || 0)}
                                  className="w-14 bg-bg-accent border border-border-dim rounded py-1 text-center text-text-main font-mono text-[11px] font-bold outline-none focus:border-brand-500"
                                  min="0"
                                  step="0.5"
                                />
                              </td>

                              {/* Pers. Especial Column */}
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="number"
                                  value={row.countGroupB}
                                  onChange={(e) => handleRowChange(row.id, 'countGroupB', parseFloat(e.target.value) || 0)}
                                  className="w-14 bg-bg-accent border border-brand-500/25 rounded py-1 text-center text-text-main font-mono text-[11px] font-bold outline-none focus:border-brand-500"
                                  min="0"
                                  step="0.5"
                                />
                              </td>

                              {/* Hs Jornada Column */}
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="number"
                                  value={row.hoursPerDay}
                                  onChange={(e) => handleRowChange(row.id, 'hoursPerDay', parseInt(e.target.value) || 0)}
                                  className="w-12 bg-bg-accent border border-border-dim rounded py-1 text-center text-text-main font-mono text-[11px] font-bold outline-none focus:border-brand-500"
                                  min="0"
                                />
                              </td>

                              {/* Valor Hora Column */}
                              <td className="px-4 py-3 text-center">
                                <div className="inline-flex items-center gap-1 bg-bg-accent/40 px-2.5 py-1 rounded border border-border-dim/20 text-[#8B949E] select-none text-[11px]">
                                  <span className="text-[9px] text-[#8B949E]">$</span>
                                  <span className="text-center text-text-main font-mono text-[11px] font-bold">
                                    {row.hourlyRate.toLocaleString('es-AR')}
                                  </span>
                                </div>
                              </td>

                              {/* Coste Proyectado Column */}
                              <td className="px-4 py-3 text-right">
                                <div className="flex flex-col items-end">
                                  <span className="text-[11.5px] font-mono font-bold text-[#E6EDF0]">
                                    ${totalCostRow.toLocaleString()}
                                  </span>
                                  <span className="text-[8.5px] font-mono text-text-dim uppercase">
                                    {hoursPerMonth}h / mes
                                  </span>
                                </div>
                              </td>

                              {/* Action Remove Column */}
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => handleRemoveRow(row.id)}
                                  className="text-text-dim hover:text-red-400 p-1.5 rounded hover:bg-red-500/10 transition-colors"
                                  title="Eliminar Fila"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="p-4 bg-[#141414] border-t border-border-dim flex justify-between items-center">
                  <div className="flex gap-4">
                    <div className="text-left">
                      <p className="text-[8px] font-black text-[#8B949E] uppercase tracking-wider">Acumulado Horas Semanal</p>
                      <p className="text-sm font-bold text-[#E6EDF0] mt-0.5 font-mono">
                        {(budgetCalculations.totalHours / 4).toFixed(1)}h
                      </p>
                    </div>
                    <div className="text-left border-l border-border-dim/50 pl-4">
                      <p className="text-[8px] font-black text-brand-500 uppercase tracking-wider">Costo Feriados (Duplicados)</p>
                      <p className="text-sm font-bold text-brand-500 mt-0.5 font-mono">
                        ${filteredRows.reduce((a, r) => a + (holidays * r.countGroupB * r.hoursPerDay * r.hourlyRate), 0).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    {saveSuccess && (
                      <span className="text-[9px] font-bold text-emerald-500 uppercase bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded flex items-center">
                        ¡Presupuesto de Horas Guardado!
                      </span>
                    )}
                    <button
                      onClick={handleSaveBudget}
                      className="bg-brand-500 hover:bg-brand-600 text-black font-extrabold text-[10.5px] uppercase tracking-wider px-6 py-2.5 rounded shadow-lg shadow-brand-500/10 flex items-center gap-2"
                    >
                      <Save size={14} className="stroke-[2.5]" /> Guardar Presupuesto {selectedMonth}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* View B: Hall Floor Graphic Map */}
            {currentTab === 'map' && (
              <motion.div
                key="map-view"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="bg-[#1A1A1A] border border-border-dim rounded-lg p-6 space-y-6"
              >
                {/* Map Control Bar */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border-dim/60 pb-4">
                  <div className="space-y-1">
                    <h3 className="text-xs font-black uppercase text-text-main flex items-center gap-2">
                      <MapPin size={14} className="text-brand-500" /> Distribución Práctica del Personal
                    </h3>
                    <p className="text-[8.5px] text-[#8C959F] uppercase font-bold tracking-tight">
                      Visualiza dónde están ubicados físicamente los recursos y la dotación total para la combinación seleccionada.
                    </p>
                  </div>

                  {/* Toggle Parameters */}
                  <div className="flex items-center gap-3">
                    <div className="flex bg-[#121212]/80 p-1 rounded-md border border-border-dim/40">
                      <button
                        onClick={() => setMapDayType('A')}
                        className={cn(
                          "px-3 py-1.5 rounded text-[8.5px] font-black uppercase transition-all whitespace-nowrap",
                          mapDayType === 'A' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main"
                        )}
                      >
                        Grupo A (Normal)
                      </button>
                      <button
                        onClick={() => setMapDayType('B')}
                        className={cn(
                          "px-3 py-1.5 rounded text-[8.5px] font-black uppercase transition-all whitespace-nowrap",
                          mapDayType === 'B' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main"
                        )}
                      >
                        Grupo B (Especial)
                      </button>
                    </div>

                    <div className="flex bg-[#121212]/80 p-1 rounded-md border border-border-dim/40">
                      <button
                        onClick={() => setMapShift('Mañana')}
                        className={cn(
                          "px-3 py-1.5 rounded text-[8.5px] font-black uppercase transition-all whitespace-nowrap",
                          mapShift === 'Mañana' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main"
                        )}
                      >
                        Mañana
                      </button>
                      <button
                        onClick={() => setMapShift('Tarde')}
                        className={cn(
                          "px-3 py-1.5 rounded text-[8.5px] font-black uppercase transition-all whitespace-nowrap",
                          mapShift === 'Tarde' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main"
                        )}
                      >
                        Tarde
                      </button>
                    </div>
                  </div>
                </div>

                {/* Primary Graphical Layout */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  
                  {/* SVG Map Representation */}
                  <div className="xl:col-span-2 bg-[#121212] border border-border-dim rounded-xl p-4 flex items-center justify-center relative overflow-hidden shadow-2xl h-[380px]">
                    
                    <svg className="w-full h-full" viewBox="0 0 600 350" fill="none">
                      {/* Grid background markers */}
                      <defs>
                        <pattern id="dotGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                          <circle cx="2" cy="2" r="1" fill="#202020" />
                        </pattern>
                      </defs>
                      <rect width="600" height="350" fill="url(#dotGrid)" rx="10" />

                      {/* AREA 1: COCINA PRINCIPAL */}
                      <g 
                        onMouseEnter={() => setHoveredRoom('cocina')}
                        onMouseLeave={() => setHoveredRoom(null)}
                        onClick={() => setSelectedRoom('cocina')}
                        className="cursor-pointer group/room"
                      >
                        <rect 
                          x="20" y="20" width="180" height="150" 
                          rx="6" 
                          className={cn(
                            "stroke-2 transition-all fill-brand-500/[0.01]",
                            selectedRoom === 'cocina' 
                              ? "stroke-brand-500 fill-brand-500/[0.04]" 
                              : hoveredRoom === 'cocina'
                                ? "stroke-brand-500/70"
                                : "stroke-border-dim"
                          )} 
                        />
                        <text x="35" y="45" className="font-black text-[9px] fill-[#8B949E] uppercase tracking-wider">
                          Cocina Principal
                        </text>
                        {/* Dot count container */}
                        <g transform="translate(35, 65)">
                          {/* We can plot dots */}
                        </g>
                      </g>

                      {/* AREA 2: BACHA / LAVADO */}
                      <g 
                        onMouseEnter={() => setHoveredRoom('bacha')}
                        onMouseLeave={() => setHoveredRoom(null)}
                        onClick={() => setSelectedRoom('bacha')}
                        className="cursor-pointer group/room"
                      >
                        <rect 
                          x="20" y="190" width="110" height="130" 
                          rx="6" 
                          className={cn(
                            "stroke-2 transition-all fill-brand-500/[0.01]",
                            selectedRoom === 'bacha' 
                              ? "stroke-brand-500 fill-brand-500/[0.04]" 
                              : hoveredRoom === 'bacha'
                                ? "stroke-brand-500/70"
                                : "stroke-border-dim"
                          )} 
                        />
                        <text x="35" y="215" className="font-black text-[9px] fill-[#8B949E] uppercase tracking-wider">
                          Bachas
                        </text>
                      </g>

                      {/* AREA 3: BAR / CAFETERIA */}
                      <g 
                        onMouseEnter={() => setHoveredRoom('barra')}
                        onMouseLeave={() => setHoveredRoom(null)}
                        onClick={() => setSelectedRoom('barra')}
                        className="cursor-pointer group/room"
                      >
                        <rect 
                          x="220" y="20" width="70" height="150" 
                          rx="6" 
                          className={cn(
                            "stroke-2 transition-all fill-brand-500/[0.01]",
                            selectedRoom === 'barra' 
                              ? "stroke-brand-500 fill-brand-500/[0.04]" 
                              : hoveredRoom === 'barra'
                                ? "stroke-brand-500/70"
                                : "stroke-border-dim"
                          )} 
                        />
                        <text x="235" y="45" className="font-black text-[9px] fill-[#8B949E] uppercase tracking-wider">
                          Barra
                        </text>
                      </g>

                      {/* AREA 4: CAJA Y MOSTRADOR */}
                      <g 
                        onMouseEnter={() => setHoveredRoom('caja')}
                        onMouseLeave={() => setHoveredRoom(null)}
                        onClick={() => setSelectedRoom('caja')}
                        className="cursor-pointer group/room"
                      >
                        <rect 
                          x="150" y="190" width="140" height="130" 
                          rx="6" 
                          className={cn(
                            "stroke-2 transition-all fill-brand-500/[0.01]",
                            selectedRoom === 'caja' 
                              ? "stroke-brand-500 fill-brand-500/[0.04]" 
                              : hoveredRoom === 'caja'
                                ? "stroke-brand-500/70"
                                : "stroke-border-dim"
                          )} 
                        />
                        <text x="165" y="215" className="font-black text-[9px] fill-[#8B949E] uppercase tracking-wider">
                          Caja / Front
                        </text>
                      </g>

                      {/* AREA 5: SALON / ACCESOS y TERRAZA */}
                      <g 
                        onMouseEnter={() => setHoveredRoom('salon')}
                        onMouseLeave={() => setHoveredRoom(null)}
                        onClick={() => setSelectedRoom('salon')}
                        className="cursor-pointer group/room"
                      >
                        <rect 
                          x="310" y="20" width="270" height="300" 
                          rx="6" 
                          className={cn(
                            "stroke-2 transition-all fill-brand-500/[0.01]",
                            selectedRoom === 'salon' 
                              ? "stroke-brand-500 fill-brand-500/[0.04]" 
                              : hoveredRoom === 'salon'
                                ? "stroke-brand-500/70"
                                : "stroke-border-dim"
                          )} 
                        />
                        <text x="325" y="45" className="font-black text-[9px] fill-[#8B949E] uppercase tracking-wider">
                          Salón Principal & Terraza
                        </text>
                      </g>
                    </svg>

                    {/* DYNAMIC AVATARS INTEGRATION OVERLAYING THE SVG */}
                    {/* Cocina Overlay */}
                    <div className="absolute top-[65px] left-[55px] w-[140px] flex flex-wrap gap-1">
                      {mapShift === 'Tarde' || mapShift === 'Mañana' ? (
                        filteredRows
                          .filter(r => r.shift === mapShift && ROLE_TO_ROOM[r.roleId] === 'cocina')
                          .map((r, i) => {
                            const count = mapDayType === 'A' ? r.countGroupA : r.countGroupB;
                            if (count <= 0) return null;
                            return (
                              <div 
                                key={r.id + i} 
                                className="bg-brand-500 text-black text-[8px] font-black px-1 rounded shadow cursor-help flex items-center gap-0.5 border border-black/10"
                                title={`${r.roleLabel}: ${count}p`}
                              >
                                {r.roleLabel.substring(0, 3).toUpperCase()} {count}p
                              </div>
                            );
                          })
                      ) : null}
                    </div>

                    {/* Bacha Overlay */}
                    <div className="absolute top-[230px] left-[45px] w-[90px] flex flex-wrap gap-1">
                      {filteredRows
                        .filter(r => r.shift === mapShift && ROLE_TO_ROOM[r.roleId] === 'bacha')
                        .map((r, i) => {
                          const count = mapDayType === 'A' ? r.countGroupA : r.countGroupB;
                          if (count <= 0) return null;
                          return (
                            <div 
                              key={r.id + i} 
                              className="bg-[#C0C0C0] text-black text-[8px] font-black px-1 rounded shadow cursor-help"
                              title={`${r.roleLabel}: ${count}p`}
                            >
                              BAC {count}p
                            </div>
                          );
                        })}
                    </div>

                    {/* Barra Overlay */}
                    <div className="absolute top-[65px] left-[235px] w-[55px] flex flex-wrap gap-1">
                      {filteredRows
                        .filter(r => r.shift === mapShift && ROLE_TO_ROOM[r.roleId] === 'barra')
                        .map((r, i) => {
                          const count = mapDayType === 'A' ? r.countGroupA : r.countGroupB;
                          if (count <= 0) return null;
                          return (
                            <div 
                              key={r.id + i} 
                              className="bg-[#D4AF37] text-black text-[8px] font-black px-1 rounded shadow cursor-help"
                              title={`${r.roleLabel}: ${count}p`}
                            >
                              BAR {count}p
                            </div>
                          );
                        })}
                    </div>

                    {/* Caja Overlay */}
                    <div className="absolute top-[230px] left-[175px] w-[110px] flex flex-wrap gap-1">
                      {filteredRows
                        .filter(r => r.shift === mapShift && ROLE_TO_ROOM[r.roleId] === 'caja')
                        .map((r, i) => {
                          const count = mapDayType === 'A' ? r.countGroupA : r.countGroupB;
                          if (count <= 0) return null;
                          return (
                            <div 
                              key={r.id + i} 
                              className="bg-[#4682B4] text-white text-[8px] font-black px-1 rounded shadow cursor-help"
                              title={`${r.roleLabel}: ${count}p`}
                            >
                              CAJ {count}p
                            </div>
                          );
                        })}
                    </div>

                    {/* Salon Overlay */}
                    <div className="absolute top-[65px] left-[325px] w-[240px] flex flex-wrap gap-1.5 justify-start">
                      {filteredRows
                        .filter(r => r.shift === mapShift && ROLE_TO_ROOM[r.roleId] === 'salon')
                        .map((r, i) => {
                          const count = mapDayType === 'A' ? r.countGroupA : r.countGroupB;
                          if (count <= 0) return null;
                          return (
                            <div 
                              key={r.id + i} 
                              className="bg-zinc-700 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow cursor-help flex items-center gap-0.5 border border-border-dim"
                              title={`${r.roleLabel}: ${count}p`}
                            >
                              {r.roleLabel.toUpperCase()} <span className="text-brand-500">{count}p</span>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Room Metrics details (Sidebar inside map view) */}
                  <div className="bg-[#121212] border border-border-dim rounded-xl p-5 space-y-4">
                    <div className="border-b border-border-dim/40 pb-3 flex justify-between items-center">
                      <h4 className="text-xs font-black uppercase text-[#E0E0E0] tracking-wider">
                        Atención en {selectedRoom.toUpperCase()}
                      </h4>
                      <span className="text-[9px] font-mono font-bold text-brand-500 bg-brand-500/10 px-2.5 py-0.5 rounded-full">
                        {mapData.roomTotals[selectedRoom] || 0} personas
                      </span>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {(mapData.roomStaff[selectedRoom] || []).length === 0 ? (
                        <p className="text-[10px] text-text-dim uppercase font-black tracking-tight text-center py-6 opacity-40">
                          Sin personal asignado en este turno/día
                        </p>
                      ) : (
                        (mapData.roomStaff[selectedRoom] || []).map((staff, i) => (
                          <div key={i} className="flex justify-between items-center p-2 rounded bg-bg-accent/40 border border-border-dim/40">
                            <span className="font-bold text-text-main uppercase text-[10px]">{staff.label}</span>
                            <span className="font-mono text-[10.5px] font-bold text-brand-500">{staff.count} personas</span>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="bg-bg-card p-3 rounded border border-border-dim/40 text-[9.5px] leading-relaxed text-text-dim">
                      <p className="font-bold text-text-main uppercase mb-1">Guía del Supervisor:</p>
                      Haz click sobre cualquier sector del mapa interactivo (<span className="text-brand-500 font-extrabold">Cocina, Salón, Barra, Caja, Bachas</span>) para inspeccionar la dotación instantánea de personal de ese salón. Elige la combinación de Turno y Tipo de Día arriba para auditar cómo se despliega tu equipo.
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>

      {/* Standard warning notice below */}
      <div className="p-4.5 bg-orange-500/5 border border-orange-500/15 rounded-lg flex items-start gap-3 shadow-sm">
        <AlertCircle size={18} className="text-orange-500 shrink-0 mt-0.5" />
        <p className="text-[10px] text-orange-500/90 font-bold uppercase tracking-tight leading-relaxed">
          Atención: Asegúrate de guardar los cambios haciendo click en el botón "Guardar Presupuesto". Cada cambio será transmitido automáticamente a Gerencia General para su correspondiente auditoría y aprobación.
        </p>
      </div>
    </motion.div>
  );
}
