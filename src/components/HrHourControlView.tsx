/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Clock, 
  Calendar, 
  Save, 
  Search, 
  ChevronRight, 
  CheckCircle2,
  AlertTriangle,
  History,
  FileSpreadsheet,
  FileText,
  Filter,
  Check,
  Zap,
  ArrowRightLeft,
  XCircle,
  HelpCircle,
  Plus,
  Trash2,
  DollarSign,
  X
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';
import { supabase } from '../lib/supabase';
import HrMonthlyPayrollView from './HrMonthlyPayrollView';

interface HrHourRecord {
  id: string;
  roleId: string;
  roleLabel: string;
  referenceHours: number; // Planned hours
  horasSucursal: number; // Hours charged in store
  definitiveHours: number; // Real hours RRHH
  valorHora: number; // Standard rate
  status: 'pending' | 'verified';
  notes?: string;
}

const POSITIONS = [
  { id: 'encargado', label: 'Encargado', refHours: 48 },
  { id: 'jefe_cocina', label: 'Jefe de Cocina', refHours: 44 },
  { id: 'segundo_cocina', label: 'Segundo de Cocina', refHours: 44 },
  { id: 'cocinero', label: 'Cocinero', refHours: 40 },
  { id: 'caja', label: 'Caja', refHours: 40 },
  { id: 'barra', label: 'Barra', refHours: 40 },
  { id: 'mozos', label: 'Mozos', refHours: 36 },
  { id: 'runners', label: 'Runners', refHours: 36 },
  { id: 'bacha', label: 'Bacha', refHours: 40 },
];

// Mapea cada rol genérico operativo al título exacto del Maestro de Personal.
// El encargado depende de la sucursal: Barrio Norte (bn) = Nivel A, resto = Nivel B.
function getMaestroTitleForRole(roleId: string, branchId?: string): string | null {
  if (roleId === 'encargado') {
    return branchId === 'bn' ? 'ENCARGADO LOCAL NIVEL A' : 'ENCARGADO LOCAL NIVEL B';
  }
  const map: Record<string, string> = {
    jefe_cocina: 'JEFE DE COCINA',
    segundo_cocina: 'SEGUNDO COCINA',
    cocinero: 'COCINERO',
    caja: 'CAJERO',
    barra: 'BARRA',
    mozos: 'MOZOS',
    runners: 'RUNNER',
    bacha: 'BACHERO'
  };
  return map[roleId] || null;
}

// Normaliza el nombre de puesto del presupuesto (position_name) a un roleId genérico.
function budgetNameToRoleId(name: string): string | null {
  const n = (name || '').toLowerCase().trim();
  if (n.includes('encargado')) return 'encargado';
  if (n.includes('lider de cocina') || n.includes('líder de cocina') || n.includes('jefe de cocina') || n.includes('jefe cocina')) return 'jefe_cocina';
  if (n.includes('segundo')) return 'segundo_cocina';
  if (n.includes('cocinero') || n === 'cocina') return 'cocinero';
  if (n.includes('cajero') || n.includes('caja')) return 'caja';
  if (n.includes('barra') || n.includes('bartender')) return 'barra';
  if (n.includes('runner')) return 'runners';
  if (n.includes('bachero') || n.includes('bacha')) return 'bacha';
  if (n.includes('mozo')) return 'mozos';
  return null;
}

function getPositionRateFromMaestro(roleId: string, roleLabel: string, scale?: any[], branchId?: string): number {
  let positions: any[] = scale && scale.length > 0 ? scale : [];
  if (positions.length === 0) {
    const saved = localStorage.getItem('craft_salary_positions');
    if (saved) { try { positions = JSON.parse(saved); } catch (e) { positions = []; } }
  }

  const rateFromPosition = (p: any): number => {
    if (p.type === 'monthly') return (p.baseValue || 0) / 240;
    return p.baseValue || 0;
  };

  if (positions.length > 0) {
    // 1) Mapeo explícito rol -> título del Maestro (la forma correcta y robusta)
    const mappedTitle = getMaestroTitleForRole(roleId, branchId);
    if (mappedTitle) {
      const byMap = positions.find((p: any) => (p.title || '').toUpperCase().trim() === mappedTitle.toUpperCase().trim());
      if (byMap) return rateFromPosition(byMap);
    }
    // 2) Match exacto por label (por si el integrante tiene el título textual)
    const exactTitle = positions.find((p: any) => (p.title || '').toLowerCase().trim() === (roleLabel || '').toLowerCase().trim());
    if (exactTitle) return rateFromPosition(exactTitle);
  }

  const defaultRates: Record<string, number> = {
    encargado: 3500,
    jefe_cocina: 3200,
    segundo_cocina: 2800,
    cocinero: 2500,
    caja: 2400,
    barra: 2300,
    mozos: 2200,
    runners: 2000,
    bacha: 1900
  };
  return defaultRates[roleId] || 2000;
}

export default function HrHourControlView({ branches, isReadOnly = false }: { branches: Branch[]; isReadOnly?: boolean }) {
  const [selectedBranch, setSelectedBranch] = useState(branches[0]?.id || '1');
  const [selectedMonth, setSelectedMonth] = useState('2026-05'); // Default back to May 2026
  const [selectedWeek, setSelectedWeek] = useState<number>(1); // 1, 2, 3, or 4
  const [records, setRecords] = useState<HrHourRecord[]>([]);
  const [salaryScale, setSalaryScale] = useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem('craft_salary_positions') || '[]'); } catch { return []; }
  });
  const [saveSuccess, setSaveSuccess] = useState(false);

  // --- MONTHLY PAYROLL STATES & HANDLERS ---
  const [activeTab, setActiveTab] = useState<'weekly_control' | 'monthly_payroll'>('weekly_control');

  // Helper to calculate date ranges for a given year, month, and week number
  const getWeekRange = (yearMonthStr: string, weekNum: number) => {
    const [yearStr, monthStr] = yearMonthStr.split('-');
    const year = parseInt(yearStr) || 2026;
    const month = parseInt(monthStr) || 5;

    // Days in this month
    const daysInMonth = new Date(year, month, 0).getDate();

    let fromDay = 1;
    let toDay = 7;

    if (weekNum === 1) {
      fromDay = 1;
      toDay = 7;
    } else if (weekNum === 2) {
      fromDay = 8;
      toDay = 14;
    } else if (weekNum === 3) {
      fromDay = 15;
      toDay = 21;
    } else if (weekNum === 4) {
      fromDay = 22;
      toDay = daysInMonth;
    }

    const pad = (num: number) => num.toString().padStart(2, '0');

    return {
      from: `${yearStr}-${monthStr}-${pad(fromDay)}`,
      to: `${yearStr}-${monthStr}-${pad(toDay)}`,
      displayFrom: `${pad(fromDay)}/${monthStr}`,
      displayTo: `${pad(toDay)}/${monthStr}`,
      isCurrentDayInWeek: false
    };
  };

  // Load records from Supabase hour_logs + local storage
  // Cargar escala salarial desde Supabase (fuente de verdad para valor hora)
  useEffect(() => {
    const loadScale = async () => {
      try {
        const { data, error } = await supabase.from('salary_positions').select('*');
        if (!error && data && data.length > 0) {
          const mapped = data.map((p: any) => ({
            id: p.id, area: p.area, sector: p.sector, title: p.title || p.name,
            type: p.type === 'monthly' ? 'monthly' : 'hourly',
            baseValue: Number(p.base_value ?? p.base_hourly_rate ?? 0)
          }));
          setSalaryScale(mapped);
          localStorage.setItem('craft_salary_positions', JSON.stringify(mapped));
        }
      } catch (e) { console.error('Error cargando escala salarial:', e); }
    };
    loadScale();
  }, []);

  // Recalcular valorHora de los registros cuando llega/actualiza la escala salarial
  useEffect(() => {
    if (salaryScale.length === 0) return;
    setRecords(prev => prev.map(r => ({
      ...r,
      valorHora: getPositionRateFromMaestro(r.roleId, r.roleLabel, salaryScale, selectedBranch)
    })));
  }, [salaryScale, selectedBranch]);

  useEffect(() => {
    const storageKey = `hr_hours_${selectedBranch}_${selectedMonth}_w${selectedWeek}`;
    const saved = localStorage.getItem(storageKey);

    // Let's load the Budget for this branch & month
    const budgetKey = `hour_budget_${selectedBranch}_${selectedMonth}`;
    const budgetStr = localStorage.getItem(budgetKey);
    let budgetPositions: any[] = [];
    let budgetRows: any[] = [];
    let groupADays: string[] = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Domingo'];
    let groupBDays: string[] = ['Viernes', 'Sábado'];
    if (budgetStr) {
      try {
        const parsedBudget = JSON.parse(budgetStr);
        budgetPositions = parsedBudget.positions || [];
        budgetRows = parsedBudget.rows || [];
        if (parsedBudget.groupADays) groupADays = parsedBudget.groupADays;
        if (parsedBudget.groupBDays) groupBDays = parsedBudget.groupBDays;
      } catch(e) {
        console.error(e);
      }
    }

    // Let's compute actual hours loaded by Store Manager dynamically from craft_branch_daily_hours
    const savedDailyStr = localStorage.getItem('craft_branch_daily_hours') || '[]';
    let dailyRecords: any[] = [];
    try {
      dailyRecords = JSON.parse(savedDailyStr);
    } catch(e) {
      console.error(e);
    }
    const filteredDaily = dailyRecords.filter((log: any) => 
      log.originBranchId === selectedBranch || log.branchId === selectedBranch
    ).filter((log: any) => 
      log.monthKey === selectedMonth && log.weekNum === selectedWeek
    );

    const loadRecords = () => {
      let existingList: any[] = [];
      if (saved) {
        try {
          existingList = JSON.parse(saved);
        } catch(e) {
          console.error(e);
        }
      }

      const mergedList = POSITIONS.map(p => {
        const existing = existingList.find(r => r.roleId === p.id);
        
        // Let's calculate planned hours from budget if exists, else fallback to standard refHours
        let plannedHours = p.refHours;
        if (budgetRows && budgetRows.length > 0) {
          const matchingRows = budgetRows.filter((br: any) => br.roleId === p.id);
          if (matchingRows.length > 0) {
            const countADaysInWeek = groupADays.length;
            const countBDaysInWeek = groupBDays.length;
            let weeklySum = 0;
            matchingRows.forEach((br: any) => {
              const hoursA = countADaysInWeek * (br.countGroupA || 0) * (br.hoursPerDay || 0);
              const hoursB = countBDaysInWeek * (br.countGroupB || 0) * (br.hoursPerDay || 0);
              weeklySum += (hoursA + hoursB);
            });
            if (weeklySum > 0) {
              plannedHours = weeklySum;
            }
          }
        } else {
          const budgetPos = budgetPositions.find(bp => bp.id === p.id);
          if (budgetPos) {
            plannedHours = (budgetPos.countWeekday * 4 * budgetPos.hoursPerDay) + (budgetPos.countWeekend * 3 * budgetPos.hoursPerDay);
          }
        }

        // Sum actuals loaded from store
        const dailySum = filteredDaily.filter((log: any) => log.roleId === p.id).reduce((sum: number, log: any) => sum + (log.hours || 0), 0);
        // Show real hours only - 0 if nothing loaded
        const computedStoreHours = dailySum;

        // Use saved definitive hours if exist, otherwise 0 (don't invent data)
        const definitiveHours = existing ? existing.definitiveHours : 0;

        const rate = getPositionRateFromMaestro(p.id, p.label, salaryScale, selectedBranch);

        return {
          id: p.id,
          roleId: p.id,
          roleLabel: p.label,
          referenceHours: plannedHours, // Planned hours
          horasSucursal: computedStoreHours, // Hours charged in store
          definitiveHours: definitiveHours, // What RRHH enters
          valorHora: rate,
          status: existing ? existing.status : 'pending',
          notes: existing ? existing.notes : ''
        };
      });

      setRecords(mergedList);
    };

    // Load APPROVED budget from Supabase hour_budgets for planned hours
    const loadBudgetFromSupabase = async () => {
      try {
        const { data: budgets } = await supabase
          .from('hour_budgets')
          .select('position_id, position_name, week1, week2, week3, week4, week5, shift, hours_per_day, planned_hours, status')
          .eq('branch_id', selectedBranch)
          .eq('month', selectedMonth)
          .eq('status', 'approved'); // Only use approved budgets

        if (budgets && budgets.length > 0) {
          // El presupuesto usa position_id con códigos+turno, pero el nombre (position_name)
          // sí identifica el puesto. Agrupamos por roleId (derivado del nombre), sumando turnos.
          const budgetMap: Record<string, number> = {};
          budgets.forEach((b: any) => {
            const weekKey = `week${selectedWeek}` as 'week1'|'week2'|'week3'|'week4'|'week5';
            const planned = Number(b[weekKey] || b.planned_hours || 0);
            const roleId = budgetNameToRoleId(b.position_name);
            if (roleId) {
              budgetMap[roleId] = (budgetMap[roleId] || 0) + planned;
            }
            // También guardamos por position_id por compatibilidad
            if (b.position_id) budgetMap[b.position_id] = (budgetMap[b.position_id] || 0) + planned;
          });
          return budgetMap;
        }
      } catch(e) { console.error('Error loading budget:', e); }
      return {};
    };

    // Also load individual employee hours from Supabase hour_logs
    const loadFromSupabase = async () => {
      const budgetMap = await loadBudgetFromSupabase();
      try {
        const { data: logs } = await supabase
          .from('hour_logs')
          .select('employee_name, position, position_id, hours_actual, week_number')
          .eq('branch_id', selectedBranch)
          .eq('month', selectedMonth)
          .eq('week_number', parseInt(selectedWeek));

        if (logs && logs.length > 0) {
          // Group by employee+position and sum hours
          const empMap: Record<string, any> = {};
          logs.forEach((log: any) => {
            const key = `${log.employee_name}|${log.position_id || log.position}`;
            const posId = log.position_id || log.position || '';
            if (!empMap[key]) {
              empMap[key] = {
                id: key,
                roleId: posId,
                roleLabel: log.position || log.position_id,
                employeeName: log.employee_name,
                referenceHours: budgetMap[posId] || 0,
                horasSucursal: 0,
                definitiveHours: 0,
                valorHora: getPositionRateFromMaestro(posId, log.position || '', salaryScale, selectedBranch),
                status: 'pending',
                notes: ''
              };
            }
            empMap[key].horasSucursal += Number(log.hours_actual || 0);
            empMap[key].definitiveHours += Number(log.hours_actual || 0);
          });

          // Check if we have existing saved definitiveHours
          const existingStr = localStorage.getItem(storageKey);
          if (existingStr) {
            try {
              const existing = JSON.parse(existingStr);
              Object.values(empMap).forEach((emp: any) => {
                const found = existing.find((e: any) => e.id === emp.id);
                if (found) {
                  emp.definitiveHours = found.definitiveHours;
                  emp.status = found.status;
                  emp.notes = found.notes;
                }
              });
            } catch(e) {}
          }

          const empRecords = Object.values(empMap).filter((e: any) => e.horasSucursal > 0 || e.definitiveHours > 0);
          if (empRecords.length > 0) {
            setRecords(empRecords as any);
            return;
          }
        }
      } catch(e) {
        console.error('Error loading from hour_logs:', e);
      }
      // Fallback to position-based view with budget from Supabase
      // Update referenceHours from budgetMap if available
      if (Object.keys(budgetMap).length > 0) {
        const savedStr = localStorage.getItem(storageKey);
        let existingList: any[] = [];
        if (savedStr) {
          try { existingList = JSON.parse(savedStr); } catch(e) {}
        }
        const mergedList = POSITIONS.map((p: any) => {
          const existing = existingList.find((r: any) => r.roleId === p.id);
          const plannedFromBudget = budgetMap[p.id] || 0;
          const dailySum = filteredDaily.filter((log: any) => log.roleId === p.id).reduce((sum: number, log: any) => sum + (log.hours || 0), 0);
          return {
            id: p.id, roleId: p.id, roleLabel: p.label,
            referenceHours: plannedFromBudget || p.refHours,
            horasSucursal: dailySum,
            definitiveHours: existing ? existing.definitiveHours : 0,
            valorHora: getPositionRateFromMaestro(p.id, p.label, salaryScale, selectedBranch),
            status: existing ? existing.status : 'pending',
            notes: existing ? existing.notes : ''
          };
        });
        setRecords(mergedList);
      } else {
        loadRecords();
      }
    };

    loadFromSupabase();
  }, [selectedBranch, selectedMonth, selectedWeek]);

  // Handle single record hours change
  const handleUpdateHours = (id: string, hours: number) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setRecords(prev => prev.map(r => r.id === id ? { ...r, definitiveHours: hours } : r));
  };

  // Handle single record notes change
  const handleUpdateNotes = (id: string, noteStr: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setRecords(prev => prev.map(r => r.id === id ? { ...r, notes: noteStr } : r));
  };

  // Check off / verify single position
  const handleToggleVerify = (id: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setRecords(prev => prev.map(r => {
      if (r.id === id) {
        return { 
          ...r, 
          status: r.status === 'verified' ? 'pending' : 'verified' 
        };
      }
      return r;
    }));
  };

  // Check off all positions
  const handleVerifyAll = () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setRecords(prev => prev.map(r => ({ ...r, status: 'verified' })));
  };

  // Save changes to Supabase + localStorage backup
  const handleSaveChanges = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    try {
      // Guardar en Supabase
      const upsertData = records.map((r: any) => ({
        branch_id: selectedBranch,
        month: selectedMonth,
        week_number: parseInt(selectedWeek),
        position_id: r.roleId || r.positionId || r.id || 'unknown',
        position_name: r.roleLabel || r.positionName || r.position || 'Sin cargo',
        employee_name: r.employeeName || r.name || 'Sin nombre',
        hours_planned: r.referenceHours || r.hoursPlanned || r.budgetedHours || 0,
        hours_branch: r.horasSucursal || r.hoursBranch || r.hoursWorked || 0,
        hours_rrhh: r.definitiveHours || r.hoursRrhh || r.hoursActual || 0,
        hourly_rate: r.hourlyRate || r.rate || 0,
        deviation_hours: r.deviationHours || 0,
        deviation_pesos: r.deviationPesos || 0,
        status: r.status || 'pending',
        observations: r.observations || ''
      }));
      
      // Borrar semana anterior y reinsertar
      await supabase.from('hr_hour_logs')
        .delete()
        .eq('branch_id', selectedBranch)
        .eq('month', selectedMonth)
        .eq('week_number', parseInt(selectedWeek));
      
      if (upsertData.length > 0) {
        const { error: insertError } = await supabase.from('hr_hour_logs').insert(upsertData);
        if (insertError) throw insertError;
      }
    } catch (e: any) {
      console.error('Error guardando horas en Supabase:', e);
      alert(`Error al guardar en Supabase: ${e.message || JSON.stringify(e)}`);
      return;
    }
    
    // Backup local
    const storageKey = `hr_hours_${selectedBranch}_${selectedMonth}_w${selectedWeek}`;
    localStorage.setItem(storageKey, JSON.stringify(records));
    const statusKey = `hr_week_status_${selectedBranch}_${selectedMonth}_w${selectedWeek}`;
    localStorage.setItem(statusKey, 'controlled');

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // Utility to check week controlled state for indicator badges
  const getWeekSavedStatus = (weekNum: number) => {
    const statusKey = `hr_week_status_${selectedBranch}_${selectedMonth}_w${weekNum}`;
    const value = localStorage.getItem(statusKey);
    return value === 'controlled';
  };

  // Pre-fill / Synchronize with ideal planned hours to reset or speed up entry
  const handlePreloadPlanned = () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const confirmed = window.confirm('¿Desea restablecer todas las horas definitivas a los valores planificados de referencia?');
    if (!confirmed) return;

    setRecords(prev => prev.map(r => ({
      ...r,
      definitiveHours: r.referenceHours,
      status: 'pending'
    })));
  };

  const selectedWeekRange = getWeekRange(selectedMonth, selectedWeek);
  const currentBranchName = branches.find(b => b.id === selectedBranch)?.name || 'Sucursal';

  // Metrics
  const totalRefHours = records.reduce((sum, r) => sum + r.referenceHours, 0);
  const totalDefHours = records.reduce((sum, r) => sum + r.definitiveHours, 0);
  const [showZeroHours, setShowZeroHours] = useState(false);
  const visibleRecords = showZeroHours ? records : records.filter(r => r.definitiveHours > 0 || r.horasSucursal > 0);
  const hiddenCount = records.length - visibleRecords.length;
  const totalDeviation = totalDefHours - totalRefHours;
  const verifiedCount = records.filter(r => r.status === 'verified').length;
  const isFullyVerified = records.length > 0 && verifiedCount === records.length;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header Panel */}
      <div className="flex flex-wrap justify-between items-center gap-4 bg-bg-card border border-border-dim p-6 rounded-lg shadow-xl">
        <div>
          <h2 className="text-xl font-black uppercase text-text-main tracking-widest flex items-center gap-2">
            <Clock className="text-brand-500" size={24} /> Recursos Humanos
          </h2>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 opacity-70">
            Control de horas por semanas fijas con cierre analítico y liquidación de haberes
          </p>
        </div>

        {/* TABS SELECTOR (Segmented Controller) */}
        <div className="flex bg-bg-accent/40 border border-border-dim rounded-md p-1 gap-1 min-w-[280px]">
          <button
            onClick={() => setActiveTab('weekly_control')}
            className={cn(
              "flex-1 px-4 py-2 text-[9px] font-black uppercase tracking-wider rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer",
              activeTab === 'weekly_control'
                ? "bg-brand-500 text-black shadow font-black"
                : "text-text-dim hover:text-text-main"
            )}
          >
            <Clock size={12} /> Control Semanal
          </button>
          <button
            onClick={() => setActiveTab('monthly_payroll')}
            className={cn(
              "flex-1 px-4 py-2 text-[9px] font-black uppercase tracking-wider rounded transition-all flex items-center justify-center gap-1.5 cursor-pointer",
              activeTab === 'monthly_payroll'
                ? "bg-brand-500 text-black shadow font-black"
                : "text-text-dim hover:text-text-main"
            )}
          >
            <Users size={12} /> Liquidación Mensual
          </button>
        </div>
      </div>

      {activeTab === 'monthly_payroll' ? (
        <HrMonthlyPayrollView 
          branches={branches} 
          selectedMonth={selectedMonth} 
          setSelectedMonth={setSelectedMonth} 
        />
      ) : (
        <>
          {/* Quick actions top bar (Original preload, print, pdf buttons) */}
          <div className="flex flex-wrap justify-end gap-2">
            <button 
              onClick={handlePreloadPlanned}
              className="px-4 py-3 bg-bg-accent border border-border-dim text-text-dim rounded text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent/80 hover:text-text-main transition-all flex items-center gap-2"
            >
              <Zap size={13} className="text-brand-500" /> Sincronizar Programadas
            </button>
            
            <button 
              className="px-4 py-3 bg-bg-accent border border-border-dim text-text-dim rounded text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent/80 transition-all flex items-center gap-2 font-mono"
              onClick={() => window.print()}
            >
              <FileSpreadsheet size={13} /> EXCEL
            </button>
            
            <button 
              className="px-4 py-3 bg-bg-accent border border-border-dim text-text-dim rounded text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent/80 transition-all flex items-center gap-2"
              onClick={() => window.print()}
            >
              <FileText size={13} /> PDF
            </button>
          </div>

          {/* Control Filters Block */}
      <div className="bg-bg-sidebar border border-border-dim rounded-lg p-6 shadow-xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-widest flex items-center gap-1.5">
              <Filter size={11} className="text-brand-500" /> Filtrar por Sucursal
            </label>
            <select 
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main font-bold uppercase outline-none focus:border-brand-500 transition-all"
            >
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black text-text-dim uppercase tracking-widest flex items-center gap-1.5">
              <Calendar size={11} className="text-brand-500" /> Seleccionar Mes
            </label>
            <input 
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main font-bold uppercase outline-none focus:border-brand-500 transition-all font-mono"
            />
          </div>
        </div>

        {/* Weekly Load Buttons (Always 4 Weeks) */}
        <div className="space-y-2 pt-2 border-t border-border-dim/50">
          <label className="text-[10px] font-black text-text-dim uppercase tracking-widest block">
            Semanas del Período (Haga clic en una para cargar)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(wkNum => {
              const wkRange = getWeekRange(selectedMonth, wkNum);
              const isActive = selectedWeek === wkNum;
              const isSaved = getWeekSavedStatus(wkNum);

              return (
                <button
                  key={wkNum}
                  onClick={() => setSelectedWeek(wkNum)}
                  className={cn(
                    "relative overflow-hidden text-left p-4 border rounded-lg transition-all flex flex-col justify-between group",
                    isActive 
                      ? "bg-brand-500/[0.03] border-brand-500 shadow-lg shadow-brand-500/5 ring-1 ring-brand-500/20" 
                      : "bg-bg-accent border-border-dim/70 hover:border-text-dim/40 hover:bg-bg-accent/80"
                  )}
                >
                  <div className="flex items-start justify-between w-full mb-1">
                    <span className={cn(
                      "text-[10px] font-black uppercase tracking-wider",
                      isActive ? "text-brand-500" : "text-text-main"
                    )}>
                      Semana {wkNum}
                    </span>
                    {isSaved ? (
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase tracking-tighter">
                        Listo
                      </span>
                    ) : (
                      <span className="text-[8px] font-black px-1.5 py-0.5 rounded bg-amber-500/5 text-text-dim/60 border border-border-dim uppercase tracking-tighter">
                        Vacio
                      </span>
                    )}
                  </div>
                  
                  <div className="text-[11px] font-bold font-mono text-text-dim mt-2 group-hover:text-text-main transition-colors">
                     {wkRange.displayFrom} al {wkRange.displayTo}
                  </div>

                  <div className="w-full mt-3 flex justify-between items-center pt-2 border-t border-border-dim/20">
                     <span className="text-[8px] font-black uppercase text-brand-500 group-hover:underline flex items-center gap-1">
                       Cargar Semana
                     </span>
                     {isActive && (
                       <div className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-pulse" />
                     )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Week Selection Alert bar */}
      <div className="bg-bg-sidebar border border-border-dim rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-brand-500/10 rounded border border-brand-500/20">
            <Calendar size={16} className="text-brand-500" />
          </div>
          <div>
            <p className="text-[10px] font-bold text-text-main uppercase tracking-widest flex items-center gap-2">
              Auditoría: <span className="text-brand-500">Semana {selectedWeek}</span> ({selectedWeekRange.displayFrom} al {selectedWeekRange.displayTo})
            </p>
            <p className="text-[8px] text-text-dim font-bold uppercase tracking-wider mt-0.5">
              FILTRADO SUCURSAL: {currentBranchName.toUpperCase()} • {selectedMonth.split('-')[1]}/{selectedMonth.split('-')[0]}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowZeroHours(v => !v)}
            className="px-3 py-1.5 bg-bg-accent border border-border-dim text-[9px] font-black uppercase text-text-dim hover:text-text-main rounded tracking-wider"
          >
            {showZeroHours ? `Ocultar sin horas (${hiddenCount})` : `Ver todos (${hiddenCount} ocultos)`}
          </button>
          <button 
            onClick={handleVerifyAll}
            className="px-3 py-1.5 bg-bg-accent border border-border-dim text-[9px] font-black uppercase text-text-dim hover:text-text-main rounded tracking-wider"
          >
            Aprobar Todo el Lote
          </button>
        </div>
      </div>

      {localStorage.getItem(`hr_week_confirmed_by_branch_${selectedBranch}_${selectedMonth}_w${selectedWeek}`) === 'true' && (
        <motion.div 
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <span className="p-2 bg-emerald-500/20 text-emerald-400 rounded-full flex items-center justify-center">
              <CheckCircle2 size={16} className="stroke-[3.5]" />
            </span>
            <div>
              <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                ¡Sincronizado con Sucursal en Tiempo Real!
              </p>
              <p className="text-[8.5px] text-text-dim font-bold uppercase tracking-wider mt-0.5">
                Las horas reales de este período se importaron automáticamente de las planillas diarias enviadas y confirmadas por el Encargado.
              </p>
            </div>
          </div>
          <span className="text-[8px] font-black px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
            Integrado
          </span>
        </motion.div>
      )}

      {/* Main Table Content */}
      <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-2xl">
        <div className="overflow-x-auto overflow-y-hidden">
          <table className="w-full text-left border-collapse min-w-[1240px]">
            <thead>
              <tr className="bg-bg-accent/40 border-b border-border-dim">
                <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest">Sucursal</th>
                <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest">Empleado</th>
                <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest">Puesto</th>
                <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Horas Planificadas</th>
                <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Horas Cargadas en Sucursal</th>
                <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Horas Reales RRHH</th>
                <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Valor Hora</th>
                <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Desviación en Horas</th>
                <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Desviación en Pesos</th>
                <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest">Observaciones</th>
                <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Estado</th>
                <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Validar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim/40">
              {visibleRecords.map(record => {
                const deviation = record.definitiveHours - record.referenceHours;
                const isEncargado = record.roleId === 'encargado';
                const deviationPesos = isEncargado ? 0 : deviation * record.valorHora;
                const isPositiveDeviation = deviation > 0;
                const isZero = isEncargado ? true : deviation === 0;

                return (
                  <tr 
                    key={record.id} 
                    className={cn(
                      "hover:bg-bg-accent/5 transition-all text-[11px]",
                      record.status === 'verified' && "bg-emerald-500/[0.01]"
                    )}
                  >
                    <td className="px-4 py-4 font-bold text-text-dim uppercase">
                      {currentBranchName}
                    </td>

                    <td className="px-4 py-4 font-black text-text-main uppercase">
                      {(record as any).employeeName || '—'}
                    </td>

                    <td className="px-4 py-4 font-black text-text-main uppercase">
                      {record.roleLabel}
                    </td>
                    
                    <td className="px-4 py-4 text-center font-mono font-bold text-text-dim">
                      {record.referenceHours.toFixed(1)}h
                    </td>

                    <td className="px-4 py-4 text-center font-mono font-bold text-text-dim">
                      {record.horasSucursal.toFixed(1)}h
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                         <button 
                           onClick={() => handleUpdateHours(record.id, Math.max(0, record.definitiveHours - 1))}
                           className="w-5 h-5 rounded bg-bg-accent border border-border-dim hover:border-text-dim/50 text-text-dim hover:text-text-main flex items-center justify-center font-bold text-xs"
                         >
                           -
                         </button>
                         <input 
                           type="number" 
                           value={record.definitiveHours === 0 ? '' : record.definitiveHours}
                           onChange={(e) => handleUpdateHours(record.id, parseFloat(e.target.value) || 0)}
                           className="w-12 bg-bg-accent/60 border border-border-dim rounded px-1 py-1 text-center font-mono font-bold text-text-main outline-none focus:border-brand-500 focus:bg-bg-accent text-xs"
                           placeholder="0.0"
                           step="0.5"
                         />
                         <button 
                           onClick={() => handleUpdateHours(record.id, record.definitiveHours + 1)}
                           className="w-5 h-5 rounded bg-bg-accent border border-border-dim hover:border-text-dim/50 text-text-dim hover:text-text-main flex items-center justify-center font-bold text-xs"
                         >
                           +
                         </button>
                      </div>
                    </td>

                    <td className="px-4 py-4 text-center font-mono text-text-dim text-xs">
                      ${record.valorHora.toLocaleString('es-AR')}
                    </td>

                    <td className="px-4 py-4 text-center">
                      <span className={cn(
                        "px-2 py-0.5 rounded font-mono font-bold text-[10px]",
                        isZero 
                          ? "bg-bg-accent text-text-dim" 
                          : isPositiveDeviation 
                            ? "bg-red-500/10 text-red-400 border border-red-500/25" 
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                      )}>
                        {isZero ? '0.0' : `${isPositiveDeviation ? '+' : ''}${deviation.toFixed(1)}`}h
                      </span>
                    </td>

                    <td className="px-4 py-4 text-center">
                      {isEncargado ? (
                        <span className={cn(
                          "px-2.5 py-1 rounded-full text-[9px] font-black tracking-wider uppercase border",
                          record.definitiveHours < record.referenceHours
                            ? "bg-rose-500/10 text-rose-400 border-rose-500/20"
                            : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        )}>
                          {record.definitiveHours < record.referenceHours ? "Sueldo Fijo (Falta Cumplir Mínimo)" : "Sueldo Fijo (Cumple Mínimo)"}
                        </span>
                      ) : (
                        <span className={cn(
                          "px-2 py-0.5 rounded font-mono font-black text-[10px]",
                          isZero 
                            ? "text-text-dim" 
                            : isPositiveDeviation 
                              ? "text-red-400" 
                              : "text-emerald-400"
                        )}>
                          {isZero ? '$0' : `${isPositiveDeviation ? '+' : '-'}$${Math.abs(deviationPesos).toLocaleString('es-AR')}`}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-4">
                      <input 
                        type="text" 
                        value={record.notes || ''}
                        onChange={(e) => handleUpdateNotes(record.id, e.target.value)}
                        placeholder="Observación..."
                        className="w-full bg-transparent border-b border-border-dim/40 hover:border-border-dim focus:border-brand-500 outline-none px-1 py-1 text-[10px] text-text-dim focus:text-text-main"
                      />
                    </td>

                    <td className="px-4 py-4 text-center">
                      {record.status === 'verified' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 text-[8px] font-black uppercase border border-emerald-500/20">
                          CONCILIADO
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/5 text-amber-500 text-[8px] font-black uppercase border border-amber-500/20">
                          PENDIENTE
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-4 text-center">
                      <button 
                        onClick={() => handleToggleVerify(record.id)}
                        className={cn(
                          "p-1.5 rounded-full border transition-all",
                          record.status === 'verified' 
                            ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/30" 
                            : "hover:bg-bg-accent text-text-dim border-transparent hover:border-border-dim"
                        )}
                        title={record.status === 'verified' ? 'Marcar pendiente' : 'Marcar conciliado'}
                      >
                        <Check size={11} className="stroke-[3]" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Metrics and Actions */}
        <div className="p-6 border-t border-border-dim bg-bg-accent/15 flex flex-wrap justify-between items-center gap-6">
          <div className="flex flex-wrap gap-4">
            <div className="bg-bg-card border border-border-dim/60 px-4 py-2 rounded-lg text-center min-w-[110px]">
               <p className="text-[8px] text-text-dim uppercase font-black tracking-widest">Planificadas</p>
               <p className="text-sm font-black font-mono text-text-main mt-0.5">
                 {totalRefHours.toFixed(1)}h
               </p>
            </div>
            
            <div className="bg-bg-card border border-border-dim/60 px-4 py-2 rounded-lg text-center min-w-[110px]">
               <p className="text-[8px] text-text-dim uppercase font-black tracking-widest">Reales RRHH</p>
               <p className="text-sm font-black font-mono text-text-main mt-0.5">
                 {totalDefHours.toFixed(1)}h
               </p>
            </div>

            <div className="bg-bg-card border border-border-dim/60 px-4 py-2 rounded-lg text-center min-w-[110px]">
               <p className="text-[8px] text-text-dim uppercase font-black tracking-widest font-sans">Desviación Hs</p>
               <p className={cn(
                 "text-sm font-black font-mono mt-0.5",
                 totalDeviation === 0 
                   ? "text-text-main" 
                   : totalDeviation > 0 ? "text-red-400" : "text-emerald-400"
               )}>
                 {totalDeviation === 0 ? '0.0h' : `${totalDeviation > 0 ? '+' : ''}${totalDeviation.toFixed(1)}h`}
               </p>
            </div>

            <div className="bg-bg-card border border-border-dim/60 px-4 py-2 rounded-lg text-center min-w-[130px]">
               <p className="text-[8px] text-text-dim uppercase font-black tracking-widest">Desviación Pesos</p>
               <p className={cn(
                 "text-sm font-black font-mono mt-0.5",
                 records.reduce((sum, r) => sum + ((r.definitiveHours - r.referenceHours) * r.valorHora), 0) === 0
                   ? "text-text-main"
                   : records.reduce((sum, r) => sum + ((r.definitiveHours - r.referenceHours) * r.valorHora), 0) > 0 ? "text-red-400" : "text-emerald-400"
               )}>
                 {records.reduce((sum, r) => sum + ((r.definitiveHours - r.referenceHours) * r.valorHora), 0) === 0 
                   ? '$0' 
                   : `${records.reduce((sum, r) => sum + ((r.definitiveHours - r.referenceHours) * r.valorHora), 0) > 0 ? '+' : '-'}$${Math.abs(records.reduce((sum, r) => sum + ((r.definitiveHours - r.referenceHours) * r.valorHora), 0)).toLocaleString('es-AR')}`}
               </p>
            </div>

            <div className="bg-bg-card border border-border-dim/60 px-4 py-2 rounded-lg text-center min-w-[110px]">
               <p className="text-[8px] text-text-dim uppercase font-black tracking-widest">Control</p>
               <p className="text-sm font-black font-mono text-brand-500 mt-0.5">
                 {verifiedCount}/{records.length} puestos
               </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <AnimatePresence>
              {saveSuccess && (
                <motion.span 
                  initial={{ opacity: 0, x: 5 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="text-[10px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-3 py-2 border border-emerald-500/20 rounded font-sans flex items-center gap-1"
                >
                  <CheckCircle2 size={12} /> ¡Semana Guardada!
                </motion.span>
              )}
            </AnimatePresence>

            <button 
              onClick={handleSaveChanges}
              className={cn(
                "px-8 py-3 rounded text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 shadow-xl",
                isFullyVerified 
                  ? "bg-brand-500 text-black border-brand-500 hover:bg-brand-600 shadow-brand-500/15 font-bold" 
                  : "bg-bg-card border-border-dim text-text-main hover:bg-bg-accent"
              )}
            >
              <Save size={14} /> Guardar Horas Semana {selectedWeek}
            </button>
          </div>
        </div>
      </div>

      {/* Auxiliary Help panel */}
      <div className="bg-brand-500/[0.02] border border-brand-500/20 rounded-lg p-6">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-500 mb-2 flex items-center gap-2">
          <HelpCircle size={14} /> Puntos clave para el Control Semanal
        </h4>
        <ul className="text-[11px] text-text-main leading-relaxed space-y-1 bg-opacity-10 pl-2">
          <li>• <span className="font-bold">Ciclo Fijo de 4 Semanas</span>: Para mantener coherencia en comparativas con Ventas y CMV, se audita mensualmente en 4 intervalos exactos.</li>
          <li>• <span className="font-bold">Conciliación de Puestos</span>: Marque cada renglón como conciliado utilizando el botón de validación de la derecha después de revisar las horas reales.</li>
          <li>• <span className="font-bold">Desviaciones</span>: Los aumentos con relación a la planificación aparecen sombreados en rojo, mientras que las reducciones favorables aparecen en verde.</li>
        </ul>
      </div>
        </>
      )}
    </motion.div>
  );
}
