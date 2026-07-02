/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  Users, 
  User,
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
  Building2,
  Copy,
  Flag,
  CheckSquare,
  Download,
  Upload
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
  countGroupA: number; // fallback legacy weekday headcount
  countGroupB: number; // fallback legacy weekend headcount
  hoursPerDay: number;
  hourlyRate: number;
  staffByDate?: Record<string, number>; // exact headcount by date "YYYY-MM-DD"
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

const DEFAULT_INITIAL_ROWS = [
  { id: 'b1', roleId: 'encargado', roleLabel: 'Encargado', shift: 'Mañana', countGroupA: 1, countGroupB: 1, hoursPerDay: 8 },
  { id: 'b2', roleId: 'encargado', roleLabel: 'Encargado', shift: 'Tarde', countGroupA: 1, countGroupB: 1, hoursPerDay: 8 },
  { id: 'b3', roleId: 'jefe_cocina', roleLabel: 'Jefe de Cocina', shift: 'Mañana', countGroupA: 1, countGroupB: 1, hoursPerDay: 8 },
  { id: 'b4', roleId: 'segundo_cocina', roleLabel: 'Segundo de Cocina', shift: 'Tarde', countGroupA: 1, countGroupB: 1, hoursPerDay: 8 },
  { id: 'b5', roleId: 'cocinero', roleLabel: 'Cocinero', shift: 'Mañana', countGroupA: 1, countGroupB: 1, hoursPerDay: 8 },
  { id: 'b6', roleId: 'cocinero', roleLabel: 'Cocinero', shift: 'Tarde', countGroupA: 2, countGroupB: 2, hoursPerDay: 8 },
  { id: 'b7', roleId: 'caja', roleLabel: 'Caja', shift: 'Mañana', countGroupA: 1, countGroupB: 1, hoursPerDay: 8 },
  { id: 'b8', roleId: 'caja', roleLabel: 'Caja', shift: 'Tarde', countGroupA: 1, countGroupB: 1, hoursPerDay: 8 },
  { id: 'b9', roleId: 'barra', roleLabel: 'Barra', shift: 'Mañana', countGroupA: 0.5, countGroupB: 1, hoursPerDay: 8 },
  { id: 'b10', roleId: 'barra', roleLabel: 'Barra', shift: 'Tarde', countGroupA: 0.5, countGroupB: 1, hoursPerDay: 8 },
  { id: 'b11', roleId: 'mozos', roleLabel: 'Mozos', shift: 'Mañana', countGroupA: 1, countGroupB: 2, hoursPerDay: 8 },
  { id: 'b12', roleId: 'mozos', roleLabel: 'Mozos', shift: 'Tarde', countGroupA: 2, countGroupB: 4, hoursPerDay: 8 },
  { id: 'b13', roleId: 'runners', roleLabel: 'Runners', shift: 'Tarde', countGroupA: 0.5, countGroupB: 1.5, hoursPerDay: 8 },
  { id: 'b14', roleId: 'bacha', roleLabel: 'Bacha', shift: 'Tarde', countGroupA: 1, countGroupB: 1, hoursPerDay: 8 },
];

const WEEK_DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

function getWeeksForMonth(yearMonth: string) {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr) || 2026;
  const month = (parseInt(monthStr) || 5) - 1; // 0-indexed
  
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  
  // Find Monday of the first calendar week in the month
  let startOfWeek = new Date(firstDayOfMonth);
  let dayOfWeek = startOfWeek.getDay(); // 0 Sunday, 1 Monday...
  
  const shiftDays = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(startOfWeek.getDate() - shiftDays);
  
  const weeks: Array<{
    weekIndex: number;
    days: Array<{
      dateStr: string;
      dayName: string;
      dayNumber: number;
      isInMonth: boolean;
      formattedDate: string;
    }>;
  }> = [];
  
  let currentWordDate = new Date(startOfWeek);
  let weekIdx = 1;
  const JS_DAY_MAPPING = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  
  while (currentWordDate <= lastDayOfMonth || currentWordDate.getDay() !== 1) {
    const days: any[] = [];
    for (let d = 0; d < 7; d++) {
      const dayIdx = currentWordDate.getDay();
      const isCurrentMonth = currentWordDate.getMonth() === month && currentWordDate.getFullYear() === year;
      const dStr = `${currentWordDate.getFullYear()}-${String(currentWordDate.getMonth() + 1).padStart(2, '0')}-${String(currentWordDate.getDate()).padStart(2, '0')}`;
      
      days.push({
        dateStr: dStr,
        dayName: JS_DAY_MAPPING[dayIdx],
        dayNumber: currentWordDate.getDate(),
        isInMonth: isCurrentMonth,
        formattedDate: `${String(currentWordDate.getDate()).padStart(2, '0')}/${String(currentWordDate.getMonth() + 1).padStart(2, '0')}`
      });
      
      currentWordDate.setDate(currentWordDate.getDate() + 1);
    }
    
    weeks.push({
      weekIndex: weekIdx,
      days
    });
    weekIdx++;
    if (weekIdx > 10) break;
  }
  
  return weeks;
}

const ROLE_TO_ROOM_DEFAULTS: Record<string, string> = {
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

const getRoomForRole = (roleId?: string, roleLabel?: string): string => {
  const normId = (roleId || '').toLowerCase().trim();
  const normLabel = (roleLabel || '').toLowerCase().trim();
  
  // Salon Principal (Mozos, Runners, y Encargado Nivel A, Encargado Nivel B)
  if (
    normId.includes('mozo') || normLabel.includes('mozo') ||
    normId.includes('runner') || normLabel.includes('runner') ||
    normId.includes('encargado') || normLabel.includes('encargado') ||
    normId.includes('salon') || normLabel.includes('salón') ||
    normId.includes('atencion') || normLabel.includes('atención')
  ) {
    return 'salon';
  }
  
  // Cocina Principal (Cocinero y Lider de Cocina, Jefe de Cocina, Segundo de Cocina, etc.)
  if (
    normId.includes('cocina') || normLabel.includes('cocina') ||
    normId.includes('cocinero') || normLabel.includes('cocinero') ||
    normId.includes('chef') || normLabel.includes('chef') ||
    normId.includes('lider') || normLabel.includes('lider')
  ) {
    return 'cocina';
  }
  
  // Barra
  if (
    normId.includes('barra') || normLabel.includes('barra') ||
    normId.includes('bartender') || normLabel.includes('bartender') ||
    normId.includes('barman') || normLabel.includes('barman')
  ) {
    return 'barra';
  }
  
  // Bacha (Puesto: Bachero / Bacha)
  if (
    normId.includes('bacha') || normLabel.includes('bacha') ||
    normId.includes('bachero') || normLabel.includes('bachero') ||
    normId.includes('lavador') || normLabel.includes('lavador') ||
    normId.includes('lavaplato') || normLabel.includes('lavaplato')
  ) {
    return 'bacha';
  }
  
  // Caja (Puesto: Cajero)
  if (
    normId.includes('caja') || normLabel.includes('caja') ||
    normId.includes('cajero') || normLabel.includes('cajero') ||
    normId.includes('front') || normLabel.includes('front')
  ) {
    return 'caja';
  }

  return ROLE_TO_ROOM_DEFAULTS[normId] || '';
};

export default function HourBudgetView({ selectedBranchId, branches, isReadOnly = false }: { selectedBranchId: string, branches: Branch[], isReadOnly?: boolean }) {
  const [localBranchId, setLocalBranchId] = useState<string>(selectedBranchId === 'all' ? (branches[0]?.id || '') : selectedBranchId);
  const activeBranch = branches.find(b => b.id === localBranchId) || branches[0];
  const [selectedMonth, setSelectedMonth] = useState('2026-05');
  const [currentTab, setCurrentTab] = useState<'table' | 'map' | 'simulate'>('table');
  // Escala salarial desde Supabase (fuente de verdad para valor hora)
  const [salaryScale, setSalaryScale] = useState<any[]>(() => {
    try { return JSON.parse(localStorage.getItem('craft_salary_positions') || '[]'); } catch { return []; }
  });

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
  const [activeWeekIndex, setActiveWeekIndex] = useState(1);
  const [holidaysList, setHolidaysList] = useState<string[]>([]);
  const [pendingHolidays, setPendingHolidays] = useState<string[]>([]);
  const [showHolidayPicker, setShowHolidayPicker] = useState(false);
  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [budgetStatus, setBudgetStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  
  // Selected Row IDs for bulk actions
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);

  // Clear selected rows when branch or month changes
  useEffect(() => {
    setSelectedRowIds([]);
  }, [localBranchId, selectedMonth]);
  
  // Excel/CSV Import/Export States
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importModalSuccess, setImportModalSuccess] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);

  // Interactive Map State
  const [mapDateStr, setMapDateStr] = useState<string>('');
  const [mapShift, setMapShift] = useState<'Mañana' | 'Tarde'>('Tarde');
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<string>('cocina');
  // --- Simulación de Planta (escenario hipotético) ---
  const [simDateStr, setSimDateStr] = useState<string>('');
  const [simShift, setSimShift] = useState<'Mañana' | 'Tarde'>('Tarde');
  const [simSelectedRoom, setSimSelectedRoom] = useState<string>('cocina');
  // Escenario editable: por sector, lista de fichas { label, count }
  const [simScenario, setSimScenario] = useState<Record<string, Array<{ label: string; count: number }>>>({ cocina: [], bacha: [], barra: [], caja: [], salon: [] });
  const [simLoadedKey, setSimLoadedKey] = useState<string>(''); // para saber si ya precargamos este día/turno
  const [dragLabel, setDragLabel] = useState<string | null>(null); // puesto que se está arrastrando


  // Sync with selected branch changes
  useEffect(() => {
    if (selectedBranchId !== 'all') {
      setLocalBranchId(selectedBranchId);
    }
  }, [selectedBranchId]);

  // Reset active week when user shifts months
  useEffect(() => {
    setActiveWeekIndex(1);
  }, [selectedMonth]);

  // Set default selected date for the map view
  useEffect(() => {
    const [yr, mo] = selectedMonth.split('-');
    setMapDateStr(`${yr}-${mo}-01`);
    setSimDateStr(`${yr}-${mo}-01`);
    setSimLoadedKey(''); // forzar recarga del escenario al cambiar de mes
  }, [selectedMonth]);

  // Load and memoize custom positions lists
  const sucursalRolesList = useMemo(() => {
    if (salaryScale && salaryScale.length > 0) {
      const sucursalPositions = salaryScale.filter((p: any) => p.area?.trim().toUpperCase() === 'SUCURSAL');
      if (sucursalPositions.length > 0) {
        return sucursalPositions.map((p: any) => ({
          id: p.id || p.title.toLowerCase().replace(/\s+/g, '_'),
          label: p.title,
          defaultRate: p.type === 'monthly' ? (p.baseValue / 240) : p.baseValue
        }));
      }
    }
    return ROLES_LIST;
  }, [salaryScale]);

  const getMaestroRate = (roleId: string, roleLabel: string): number => {
    const positions = salaryScale || [];
    if (positions.length > 0) {
      const exact = positions.find((p: any) => p.title.toLowerCase().trim() === roleLabel.toLowerCase().trim());
      if (exact) return exact.type === 'monthly' ? (exact.baseValue / 240) : exact.baseValue;

      const approx = positions.find((p: any) => p.title.toLowerCase().includes(roleLabel.toLowerCase()) || roleLabel.toLowerCase().includes(p.title.toLowerCase()));
      if (approx) return approx.type === 'monthly' ? (approx.baseValue / 240) : approx.baseValue;
    }
    const defaultR = sucursalRolesList.find(r => r.id === roleId);
    return defaultR ? defaultR.defaultRate : 2500;
  };

  const weeks = useMemo(() => {
    return getWeeksForMonth(selectedMonth);
  }, [selectedMonth]);

  const activeWeek = useMemo(() => {
    return weeks.find(w => w.weekIndex === activeWeekIndex) || weeks[0] || { weekIndex: 1, days: [] };
  }, [weeks, activeWeekIndex]);

  // Active month days that are sorted correctly
  const activeMonthDays = useMemo(() => {
    const daysList: Array<{ dateStr: string; dayName: string; dayNumber: number; formattedDate: string; isHoliday: boolean }> = [];
    weeks.forEach(week => {
      week.days.forEach(day => {
        if (day.isInMonth) {
          daysList.push({
            ...day,
            isHoliday: holidaysList.includes(day.dateStr)
          });
        }
      });
    });
    return daysList.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [weeks, holidaysList]);

  // Sync pendingHolidays from holidaysList when it changes
  useEffect(() => {
    setPendingHolidays([...holidaysList]);
  }, [holidaysList]);

  // Sync pendingHolidays when holidaysList loads
  useEffect(() => { setPendingHolidays([...holidaysList]); }, [holidaysList.length]);

  // Load roster from Supabase when no localStorage data (cross-device sync)
  useEffect(() => {
    if (!localBranchId || localBranchId === 'all') return;
    const storageKey = `hour_budget_v2_${localBranchId}_${selectedMonth}`;
    const hasLocalData = !!localStorage.getItem(storageKey);
    if (hasLocalData) return; // LocalStorage has data, use it
    
    // No local data - load from Supabase
    const loadRoster = async () => {
      try {
        const { data } = await supabase
          .from('hour_budgets')
          .select('*')
          .eq('branch_id', localBranchId)
          .eq('month', selectedMonth);
        if (data && data.length > 0) {
          const loadedRows: BudgetRow[] = data.map((r: any) => ({
            id: r.id || `sb-${Math.random().toString(36).substr(2,9)}`,
            branchId: r.branch_id,
            roleId: r.position_id?.replace(/_(?:ma[nñ]ana|tarde|manana)$/, '') || r.position_id,
            roleLabel: r.position_name || r.position_id,
            shift: r.shift || 'Tarde',
            hoursPerDay: r.hours_per_day || 8,
            hourlyRate: r.hourly_rate || 0,
            countGroupA: 1,
            countGroupB: 1,
            staffByDate: r.staff_by_date ? (() => { try { return JSON.parse(r.staff_by_date); } catch(e) { return {}; } })() : {}
          }));
          setRows(loadedRows);
          setBudgetStatus(data[0]?.status || 'draft');
          console.log('[Budget] Loaded', loadedRows.length, 'rows from Supabase');
        }
      } catch(e) { console.warn('[Budget] Supabase load error:', e); }
    };
    loadRoster();
  }, [localBranchId, selectedMonth]);

  // Load holidays from Supabase
  useEffect(() => {
    const loadHolidays = async () => {
      try {
        const { data: hData } = await supabase
          .from('budget_holidays')
          .select('holiday_dates')
          .eq('month', selectedMonth)
          .maybeSingle();
        if (hData?.holiday_dates && hData.holiday_dates.length > 0) {
          setHolidaysList(hData.holiday_dates);
          localStorage.setItem(`hour_budget_holidays_${selectedMonth}`, JSON.stringify(hData.holiday_dates));
        }
      } catch(e) {
        const cached = localStorage.getItem(`hour_budget_holidays_${selectedMonth}`);
        if (cached) try { setHolidaysList(JSON.parse(cached)); } catch(e2) {}
      }
    };
    loadHolidays();
  }, [selectedMonth]);

  // Load saved budget V2 or fall back & upgrade from V1
  useEffect(() => {
    const branchIdKey = localBranchId === 'all' ? '1' : localBranchId;
    const storageKeyV2 = `hour_budget_v2_${branchIdKey}_${selectedMonth}`;
    const storageKeyV1 = `hour_budget_${branchIdKey}_${selectedMonth}`;
    
    const savedV2 = localStorage.getItem(storageKeyV2);
    const savedV1 = localStorage.getItem(storageKeyV1);
    
    const computedWeeks = getWeeksForMonth(selectedMonth);
    
    // Load holidays from localStorage cache (Supabase loaded separately)
    const globalHolidaysKey = `hour_budget_holidays_${selectedMonth}`;
    let resolvedHolidays: string[] = [];
    let hasGlobalHolidays = false;
    const cached = localStorage.getItem(globalHolidaysKey);
    if (cached) { try { resolvedHolidays = JSON.parse(cached); hasGlobalHolidays = true; } catch(e) {} }

    if (savedV2) {
      try {
        const parsed = JSON.parse(savedV2);
        if (parsed.rows) {
          setRows(parsed.rows);
        }
        
        // Migrate to global key if not set yet, but exists in this branch V2 budget
        if (!hasGlobalHolidays && parsed.holidaysList && Array.isArray(parsed.holidaysList) && parsed.holidaysList.length > 0) {
          resolvedHolidays = parsed.holidaysList;
          localStorage.setItem(globalHolidaysKey, JSON.stringify(resolvedHolidays));
          hasGlobalHolidays = true;
        }
        
        setHolidaysList(resolvedHolidays);
        if (parsed.status) setBudgetStatus(parsed.status);
      } catch (e) {
        console.error('Error loading budget V2:', e);
      }
    } else if (savedV1) {
      try {
        const parsed = JSON.parse(savedV1);
        const legacyRows = parsed.rows || [];
        
        // Dynamic upgrade holidays
        if (!hasGlobalHolidays) {
          const legacyHolidaysCount = parsed.holidays || 0;
          const generatedHolidays: string[] = [];
          let count = 0;
          
          computedWeeks.forEach(week => {
            week.days.forEach(day => {
              if (day.isInMonth && day.dayName === 'Domingo' && count < legacyHolidaysCount) {
                generatedHolidays.push(day.dateStr);
                count++;
              }
            });
          });
          resolvedHolidays = generatedHolidays;
          localStorage.setItem(globalHolidaysKey, JSON.stringify(resolvedHolidays));
        }
        setHolidaysList(resolvedHolidays);

        const upgradedRows = legacyRows.map((r: any) => {
          const staffByDate: Record<string, number> = {};
          computedWeeks.forEach(week => {
            week.days.forEach(day => {
              if (day.isInMonth) {
                const isWeekend = ['Viernes', 'Sábado'].includes(day.dayName);
                staffByDate[day.dateStr] = isWeekend ? (r.countGroupB ?? r.countGroupA) : r.countGroupA;
              }
            });
          });

          return {
            ...r,
            countGroupA: r.countGroupA ?? 1,
            countGroupB: r.countGroupB ?? 2,
            staffByDate
          };
        });

        setRows(upgradedRows);
        if (parsed.status) setBudgetStatus(parsed.status);
      } catch (e) {
        console.error('Error upgrading budget V1:', e);
      }
    } else {
      // By user request, show months and weeks that don't have saved data empty by default
      setRows([]);
      setHolidaysList(resolvedHolidays);
      setBudgetStatus('pending');
    }
  }, [localBranchId, selectedMonth, sucursalRolesList]);

  const handleSaveBudget = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const branchIdKey = localBranchId === 'all' ? branches[0]?.id || localBranchId : localBranchId;
    
    // Guardar cada fila en Supabase
    try {
      const upsertData = rows.map((r: any) => {
        const rate = r.hourlyRate || 0;
        const hpd = r.hoursPerDay || 0;
        const staffByDate = (r.staffByDate || {}) as Record<string, number>;

        const baseHrs = r.staffByDate
          ? Object.values(staffByDate).reduce((a: number, b: number) => a + b * hpd, 0)
          : ((r.week1||0)+(r.week2||0)+(r.week3||0)+(r.week4||0)+(r.week5||0));

        // Premium de feriado: las horas trabajadas en días feriados se pagan al DOBLE.
        // baseHrs ya incluye todas las horas a tarifa normal, así que sumamos UNA vez más
        // el costo de las horas de feriado (eso completa el x2).
        let holidayPremium = 0;
        if (holidaysList && holidaysList.length > 0 && r.staffByDate) {
          holidaysList.forEach((hDate: string) => {
            const staffOnDay = Number(staffByDate[hDate] || 0);
            if (staffOnDay > 0) {
              holidayPremium += staffOnDay * hpd * rate;
            }
          });
        }

        return {
          branch_id: branchIdKey,
          month: selectedMonth,
          position_id: r.roleId || r.id,
          position_name: r.roleLabel || r.positionName || r.roleId,
          week1: r.staffByDate ? Object.values(staffByDate).slice(0, 7).reduce((a: number, b: number) => a + b * hpd, 0) : (r.week1 || 0),
          week2: r.staffByDate ? Object.values(staffByDate).slice(7, 14).reduce((a: number, b: number) => a + b * hpd, 0) : (r.week2 || 0),
          week3: r.staffByDate ? Object.values(staffByDate).slice(14, 21).reduce((a: number, b: number) => a + b * hpd, 0) : (r.week3 || 0),
          week4: r.staffByDate ? Object.values(staffByDate).slice(21, 28).reduce((a: number, b: number) => a + b * hpd, 0) : (r.week4 || 0),
          week5: r.staffByDate ? Object.values(staffByDate).slice(28).reduce((a: number, b: number) => a + b * hpd, 0) : (r.week5 || 0),
          hours_per_day: hpd,
          hourly_rate: rate,
          total_hours: baseHrs,
          total_cost: Math.round(baseHrs * rate + holidayPremium),
          staff_by_date: r.staffByDate ? JSON.stringify(staffByDate) : null,
          holidays_json: JSON.stringify(holidaysList || []),
          status: 'pending'
        };
      });
      
      // Borrar registros previos del mes/sucursal y reinsertar
      await supabase.from('hour_budgets').delete().eq('branch_id', branchIdKey).eq('month', selectedMonth);
      if (upsertData.length > 0) {
        await supabase.from('hour_budgets').insert(upsertData);
      }
    } catch (e) {
      console.error('Error guardando en Supabase:', e);
    }
    
    // También guardar localmente como respaldo
    const storageKeyV2 = `hour_budget_v2_${branchIdKey}_${selectedMonth}`;
    localStorage.setItem(storageKeyV2, JSON.stringify({ rows, holidaysList, status: budgetStatus }));
    localStorage.setItem(`hour_budget_holidays_${selectedMonth}`, JSON.stringify(holidaysList));
    
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Toggle a day in pending selection (checkbox, not saved yet)
  const handleToggleHoliday = (dateStr: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setPendingHolidays(prev =>
      prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr]
    );
  };

  // Confirm and save all holidays at once - single Supabase call
  const handleConfirmHolidays = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const updated = [...pendingHolidays].sort();
    setHolidaysList(updated);
    localStorage.setItem(`hour_budget_holidays_${selectedMonth}`, JSON.stringify(updated));
    try {
      const { error } = await supabase
        .from('budget_holidays')
        .upsert({ month: selectedMonth, holiday_dates: updated }, { onConflict: 'month' });
      if (error) throw error;
    } catch(e: any) {
      alert('Error guardando feriados: ' + e.message);
    }
  };

  const handleLoadDefaultTemplate = () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const branchIdKey = localBranchId === 'all' ? '1' : localBranchId;
    const computedWeeks = getWeeksForMonth(selectedMonth);
    const defWithBranch = DEFAULT_INITIAL_ROWS.map((r, index) => {
      const staffByDate: Record<string, number> = {};
      computedWeeks.forEach(week => {
        week.days.forEach(day => {
          if (day.isInMonth) {
            const isWeekend = ['Viernes', 'Sábado'].includes(day.dayName);
            staffByDate[day.dateStr] = isWeekend ? r.countGroupB : r.countGroupA;
          }
        });
      });
      
      return {
        id: `init-${r.id}-${index}-${Math.random().toString(36).substr(2, 5)}`,
        branchId: branchIdKey,
        roleId: r.roleId,
        roleLabel: r.roleLabel,
        shift: r.shift as 'Mañana' | 'Tarde',
        countGroupA: r.countGroupA,
        countGroupB: r.countGroupB,
        hoursPerDay: r.hoursPerDay,
        hourlyRate: getMaestroRate(r.roleId, r.roleLabel),
        staffByDate
      };
    });
    setRows(prev => {
      const otherBranchesRows = prev.filter(r => r.branchId !== branchIdKey);
      return [...otherBranchesRows, ...defWithBranch];
    });
  };

  const handleAddRow = () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const branchIdKey = localBranchId === 'all' ? '1' : localBranchId;
    const defaultRole = sucursalRolesList[3] || sucursalRolesList[0];
    const initialStaffByDate: Record<string, number> = {};
    
    weeks.forEach(week => {
      week.days.forEach(day => {
        if (day.isInMonth) {
          initialStaffByDate[day.dateStr] = 1;
        }
      });
    });

    const newRow: BudgetRow = {
      id: `custom-${Math.random().toString(36).substr(2, 9)}`,
      branchId: branchIdKey,
      roleId: defaultRole.id,
      roleLabel: defaultRole.label,
      shift: 'Tarde',
      countGroupA: 1,
      countGroupB: 1,
      hoursPerDay: 8,
      hourlyRate: getMaestroRate(defaultRole.id, defaultRole.label),
      staffByDate: initialStaffByDate
    };
    setRows([...rows, newRow]);
  };

  const handleRemoveRow = (id: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setRows(rows.filter(r => r.id !== id));
  };

  const handleRowChange = (id: string, field: keyof BudgetRow, value: any) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setRows(rows.map(row => {
      if (row.id === id) {
        const updated = { ...row, [field]: value };
        if (field === 'roleId') {
          const matchRole = sucursalRolesList.find(rl => rl.id === value);
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

  const handleStaffChange = (rowId: string, dateStr: string, val: number) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setRows(rows.map(row => {
      if (row.id === rowId) {
        const staffMap = { ...(row.staffByDate || {}) };
        staffMap[dateStr] = val;
        return {
          ...row,
          staffByDate: staffMap
        };
      }
      return row;
    }));
  };

  const handleCopyWeekToMonth = (currentWeekIdx: number) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const currentWeekObj = weeks.find(w => w.weekIndex === currentWeekIdx);
    if (!currentWeekObj) return;

    const weekdayValues: Record<string, Record<string, number>> = {};
    
    // For each role row, map the staffing pattern of current week by Day Name (Lunes, Martes...)
    rows.forEach(r => {
      weekdayValues[r.id] = {};
      currentWeekObj.days.forEach(d => {
        const hc = r.staffByDate?.[d.dateStr] !== undefined
          ? r.staffByDate[d.dateStr]
          : (['Viernes', 'Sábado'].includes(d.dayName) ? r.countGroupB : r.countGroupA);
        weekdayValues[r.id][d.dayName] = hc;
      });
    });

    // Populate all other days in the active month with that day-of-week pattern
    const updated = rows.map(r => {
      const staffByDate = { ...(r.staffByDate || {}) };
      weeks.forEach(wk => {
        wk.days.forEach(dy => {
          if (dy.isInMonth) {
            staffByDate[dy.dateStr] = weekdayValues[r.id]?.[dy.dayName] ?? 0;
          }
        });
      });
      return {
        ...r,
        staffByDate
      };
    });

    setRows(updated);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // Filter rows of current branch context
  const filteredRows = useMemo(() => {
    const activeBranchId = localBranchId === 'all' ? '1' : localBranchId;
    return rows.filter(r => r.branchId === activeBranchId);
  }, [rows, localBranchId]);

  // Download CSV template pre-populated with current month's dates and positions
  const handleDownloadTemplate = () => {
    const activeBranchId = localBranchId === 'all' ? '1' : localBranchId;
    const branchName = activeBranch?.name || `Sucursal ${activeBranchId}`;
    
    // Create Date headers in spanish format, e.g. "Viernes 01/05/2026"
    const dateHeaders = activeMonthDays.map(d => `${d.dayName} ${d.dateStr.split('-').reverse().join('/')}`);
    const headers = ['Puesto', 'Turno', 'Horas_Jornada', ...dateHeaders];
    
    const csvRows = [];
    csvRows.push('sep=,');
    csvRows.push(headers.join(','));
    
    // We export ALL possible sucursalRolesList positions for both Mañana & Tarde to make name selection simple
    const allExpectedRows: any[] = [];
    const shifts: ('Mañana' | 'Tarde')[] = ['Mañana', 'Tarde'];

    sucursalRolesList.forEach(roleObj => {
      shifts.forEach(sh => {
        // Try to match with any configured row for activeBranch
        const existingRow = filteredRows.find(
          r => r.roleLabel.toLowerCase().trim() === roleObj.label.toLowerCase().trim() && r.shift === sh
        );

        if (existingRow) {
          allExpectedRows.push(existingRow);
        } else {
          // Create an empty template row for this role and shift
          const staffByDate: Record<string, number> = {};
          activeMonthDays.forEach(day => {
            staffByDate[day.dateStr] = 0;
          });

          let defaultHrs = 8;
          if (roleObj.label.toLowerCase().includes('medio') || roleObj.label.toLowerCase().includes('4h')) {
            defaultHrs = 4;
          }

          allExpectedRows.push({
            id: `temp-${roleObj.id}-${sh}`,
            branchId: activeBranchId,
            roleId: roleObj.id,
            roleLabel: roleObj.label,
            shift: sh,
            hoursPerDay: defaultHrs,
            hourlyRate: roleObj.defaultRate,
            staffByDate
          });
        }
      });
    });

    // Also include other custom rows that weren't in sucursalRolesList originally
    filteredRows.forEach(fRow => {
      const isAlreadyAdded = allExpectedRows.some(
        r => r.roleLabel.toLowerCase().trim() === fRow.roleLabel.toLowerCase().trim() && r.shift === fRow.shift
      );
      if (!isAlreadyAdded) {
        allExpectedRows.push(fRow);
      }
    });

    allExpectedRows.forEach(row => {
      const line = [
        row.roleLabel || row.roleId,
        row.shift,
        row.hoursPerDay.toString()
      ];
      
      activeMonthDays.forEach(day => {
        const val = row.staffByDate?.[day.dateStr] !== undefined ? row.staffByDate[day.dateStr] : 0;
        line.push(val.toString());
      });
      
      csvRows.push(line.join(','));
    });
    
    const csvBuffer = "\uFEFF" + csvRows.join('\n');
    const blob = new Blob([csvBuffer], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    const fileName = `Plantilla_Presupuesto_${branchName.replace(/\s+/g, '_')}_${selectedMonth}.csv`;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const parseCSVLine = (line: string, delimiter: string): string[] => {
    const result: string[] = [];
    let currentCell = '';
    let insideQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === delimiter && !insideQuotes) {
        result.push(currentCell.trim());
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
    result.push(currentCell.trim());
    return result;
  };

  const processCSVFile = (fileText: string) => {
    try {
      const rawLines = fileText.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
      if (rawLines.length === 0) {
        alert("El archivo CSV está vacío.");
        return;
      }
      
      let delimiter = ',';
      let dataStartIndex = 0;
      if (rawLines[0].startsWith('sep=')) {
        delimiter = rawLines[0].slice(4).trim();
        dataStartIndex = 1;
      } else if (!rawLines[0].includes(',') && rawLines[0].includes(';')) {
        // Fallback guess if no sep= is declared but it has semicolons
        delimiter = ';';
      }
      
      if (rawLines.length <= dataStartIndex) {
        alert("El archivo no contiene filas de datos.");
        return;
      }
      
      const headerLine = rawLines[dataStartIndex];
      const headers = parseCSVLine(headerLine, delimiter);
      
      let roleColIdx = headers.findIndex(h => h.toLowerCase().includes('puesto'));
      let shiftColIdx = headers.findIndex(h => h.toLowerCase().includes('turno'));
      let hoursColIdx = headers.findIndex(h => h.toLowerCase().includes('jornada') || h.toLowerCase().includes('horas'));
      
      if (roleColIdx === -1) roleColIdx = 0;
      if (shiftColIdx === -1) shiftColIdx = 1;
      if (hoursColIdx === -1) hoursColIdx = 2;
      
      const dateColumns: { colIdx: number, dateStr: string }[] = [];
      headers.forEach((header, idx) => {
        if (idx !== roleColIdx && idx !== shiftColIdx && idx !== hoursColIdx) {
          const cleanHeader = header.trim();
          
          // Match header name with activeMonthDays
          const matchedDay = activeMonthDays.find(day => {
            const formattedExpected = `${day.dayName} ${day.dateStr.split('-').reverse().join('/')}`;
            return cleanHeader === formattedExpected || cleanHeader === day.dateStr;
          });

          if (matchedDay) {
            dateColumns.push({ colIdx: idx, dateStr: matchedDay.dateStr });
          } else {
            if (/^\d{4}-\d{2}-\d{2}$/.test(cleanHeader)) {
              dateColumns.push({ colIdx: idx, dateStr: cleanHeader });
            } else {
              const matchDDMMYYYY = cleanHeader.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
              if (matchDDMMYYYY) {
                const [_, dd, mm, yyyy] = matchDDMMYYYY;
                const paddedDD = dd.padStart(2, '0');
                const paddedMM = mm.padStart(2, '0');
                dateColumns.push({ colIdx: idx, dateStr: `${yyyy}-${paddedMM}-${paddedDD}` });
              }
            }
          }
        }
      });
      
      const parsedPreviewRows: any[] = [];
      
      for (let i = dataStartIndex + 1; i < rawLines.length; i++) {
        const rowCells = parseCSVLine(rawLines[i], delimiter);
        if (rowCells.length < 3) continue;
        
        const csvRoleName = rowCells[roleColIdx] || 'Personal';
        const shiftRaw = (rowCells[shiftColIdx] || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const shiftVal: 'Mañana' | 'Tarde' = shiftRaw.includes('manana') ? 'Mañana' : 'Tarde';
        const hoursPerDayVal = parseInt(rowCells[hoursColIdx]) || 8;
        
        const matchedRole = sucursalRolesList.find((rl: any) => 
          rl.label.toLowerCase().trim() === csvRoleName.toLowerCase().trim() ||
          rl.id.toLowerCase().trim() === csvRoleName.toLowerCase().trim()
        ) || { id: csvRoleName.toLowerCase().replace(/\s+/g, '_'), label: csvRoleName, defaultRate: 2500 };
        
        const staffByDate: Record<string, number> = {};
        let totalAssignedHours = 0;
        
        dateColumns.forEach(({ colIdx, dateStr }) => {
          const countVal = parseFloat(rowCells[colIdx]) || 0;
          staffByDate[dateStr] = countVal;
          if (countVal > 0) {
            totalAssignedHours += countVal * hoursPerDayVal;
          }
        });
        
        parsedPreviewRows.push({
          roleId: matchedRole.id,
          roleLabel: matchedRole.label,
          shift: shiftVal,
          countGroupA: 1,
          countGroupB: 1,
          hoursPerDay: hoursPerDayVal,
          hourlyRate: getMaestroRate(matchedRole.id, matchedRole.label),
          staffByDate,
          totalHours: totalAssignedHours
        });
      }
      
      if (parsedPreviewRows.length === 0) {
        alert("No se pudieron cargar filas válidas del CSV.");
        return;
      }
      
      setImportPreview(parsedPreviewRows);
    } catch (err: any) {
      console.error(err);
      alert("Error al procesar el archivo CSV: " + err.message);
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;
    const activeBranchId = localBranchId === 'all' ? (branches[0]?.id || '1') : localBranchId;
    
    const importedBudgetRows: BudgetRow[] = importPreview.map(preview => ({
      id: `imported-${Math.random().toString(36).substr(2, 9)}`,
      branchId: activeBranchId,
      roleId: preview.roleId,
      roleLabel: preview.roleLabel,
      shift: preview.shift,
      countGroupA: preview.countGroupA,
      countGroupB: preview.countGroupB,
      hoursPerDay: preview.hoursPerDay,
      hourlyRate: preview.hourlyRate,
      staffByDate: preview.staffByDate
    }));
    
    const otherBranchesRows = rows.filter(r => r.branchId !== activeBranchId);
    const newRows = [...otherBranchesRows, ...importedBudgetRows];
    setRows(newRows);

    // Auto-save to Supabase on import confirm
    // Fetch holidays from Supabase first to ensure we have the latest
    let importHolidays: string[] = [...holidaysList];
    try {
      const { data: hData } = await supabase
        .from('budget_holidays')
        .select('holiday_dates')
        .eq('month', selectedMonth)
        .maybeSingle();
      if (hData?.holiday_dates) {
        const raw = hData.holiday_dates;
        const dates = Array.isArray(raw) ? raw 
          : (typeof raw === 'string' ? JSON.parse(raw) 
          : Object.values(raw));
        if (dates.length > 0) importHolidays = dates;
      }
      if (importHolidays.length === 0 && holidaysList.length > 0) {
        importHolidays = [...holidaysList];
      }
    } catch(e: any) { console.warn('holiday fetch error:', e); }

    try {
      // Calculate weekly hours from staffByDate
      const getWeekHours = (row: BudgetRow, weekDays: string[] | undefined) => {
        if (!weekDays || weekDays.length === 0) return 0;
        return weekDays.reduce((sum, dateStr) => {
          const count = row.staffByDate?.[dateStr] ?? 0;
          return sum + (count * (row.hoursPerDay || 0));
        }, 0);
      };

      // Get date ranges for each week in the selected month
      const [yr, mo] = selectedMonth.split('-').map(Number);
      const daysInMonth = new Date(yr, mo, 0).getDate();
      const weekDates: string[][] = [[], [], [], [], []];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${yr}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const w = d <= 7 ? 0 : d <= 14 ? 1 : d <= 21 ? 2 : d <= 28 ? 3 : 4;
        weekDates[w].push(dateStr);
      }

      // Group by position_id+shift to avoid duplicate key violations
      // (same position can have multiple shifts - sum their hours)
      const grouped: Record<string, any> = {};
      importedBudgetRows.forEach(r => {
        const key = `${r.roleId}|${r.shift}`;
        if (!grouped[key]) {
          grouped[key] = {
            branch_id: activeBranchId,
            month: selectedMonth,
            position_id: `${r.roleId}_${(r.shift || 'tarde').toLowerCase().replace(/[^a-z]/g,'')}`,
            position_name: r.roleLabel,
            shift: r.shift,
            hours_per_day: r.hoursPerDay,
            hourly_rate: r.hourlyRate || 0,
            week1: 0, week2: 0, week3: 0, week4: 0, week5: 0,
            total_hours: 0,
            status: 'pending',
            staff_by_date: r.staffByDate ? JSON.stringify(r.staffByDate) : null,
          };
        }
        grouped[key].week1 += Math.round(getWeekHours(r, weekDates[0]));
        grouped[key].week2 += Math.round(getWeekHours(r, weekDates[1]));
        grouped[key].week3 += Math.round(getWeekHours(r, weekDates[2]));
        grouped[key].week4 += Math.round(getWeekHours(r, weekDates[3]));
        grouped[key].week5 += Math.round(getWeekHours(r, weekDates[4]));
        grouped[key].total_hours += Math.round(
          getWeekHours(r, weekDates[0]) + getWeekHours(r, weekDates[1]) +
          getWeekHours(r, weekDates[2]) + getWeekHours(r, weekDates[3]) +
          getWeekHours(r, weekDates[4])
        );
      });
      // Calculate total cost including holiday premium for each position
      const upsertData = Object.values(grouped).map((g: any) => {
        const baseHrs = g.total_hours || 0;
        const rate = g.hourly_rate || 0;
        const hpd = g.hours_per_day || 0;
        
        // Use importHolidays fetched from Supabase at start of import
        const currentHolidays: string[] = importHolidays;
        let holidayPremium = 0;
        if (currentHolidays && currentHolidays.length > 0 && g.staff_by_date) {
          try {
            const staffByDate = JSON.parse(g.staff_by_date);
            currentHolidays.forEach((hDate: string) => {
              const staffOnDay = Number(staffByDate[hDate] || 0);
              if (staffOnDay > 0) {
                holidayPremium += staffOnDay * hpd * rate;
              }
            });
          } catch(e) {}
        }
        
        return {
          ...g,
          total_cost: Math.round(baseHrs * rate + holidayPremium),
        };
      });

      // Delete all existing rows for this branch+month first, then insert fresh
      const { error: delError } = await supabase
        .from('hour_budgets')
        .delete()
        .eq('branch_id', activeBranchId)
        .eq('month', selectedMonth);
      
      if (delError) console.warn('Delete warning:', delError.message);
      
      if (upsertData.length > 0) {
        const { error: insertError } = await supabase
          .from('hour_budgets')
          .insert(upsertData);
        if (insertError) throw insertError;
      }
      alert(`✅ Presupuesto guardado correctamente: ${upsertData.length} puestos guardados en Supabase`);
    } catch (e: any) {
      console.error('Error saving budget to Supabase:', e);
      alert(`Error al guardar en Supabase: ${e.message || JSON.stringify(e)}`);
      return; // Don't proceed if save failed
    }

    // Also save to localStorage
    const storageKeyV2 = `hour_budget_v2_${activeBranchId}_${selectedMonth}`;
    localStorage.setItem(storageKeyV2, JSON.stringify({ rows: newRows, holidaysList, status: budgetStatus }));
    
    setImportModalSuccess(true);
    setTimeout(() => {
      setImportModalSuccess(false);
      setIsImportModalOpen(false);
      setImportPreview(null);
    }, 2000);
  };

  const getHeadcount = (row: BudgetRow, dateStr: string, dayName: string) => {
    if (row.staffByDate?.[dateStr] !== undefined) {
      return row.staffByDate[dateStr];
    }
    return ['Viernes', 'Sábado'].includes(dayName) ? row.countGroupB : row.countGroupA;
  };

  // Math Calculations (Accumulate hours, costs, weekly costs breakdown)
  const budgetCalculations = useMemo(() => {
    let totalHours = 0;
    let totalCost = 0;
    let regularHours = 0;
    let holidayHours = 0;
    let extraHolidayCost = 0;

    weeks.forEach(week => {
      week.days.forEach(day => {
        if (day.isInMonth) {
          const isHoliday = holidaysList.includes(day.dateStr);
          
          filteredRows.forEach(row => {
            const headcount = getHeadcount(row, day.dateStr, day.dayName);
            if (headcount > 0) {
              const hours = headcount * row.hoursPerDay;
              const rate = isHoliday ? row.hourlyRate * 2 : row.hourlyRate;
              const cost = hours * rate;

              totalHours += hours;
              totalCost += cost;

              if (isHoliday) {
                holidayHours += hours;
                extraHolidayCost += hours * row.hourlyRate; // portion that double rate added
              } else {
                regularHours += hours;
              }
            }
          });
        }
      });
    });

    return { totalHours, totalCost, regularHours, holidayHours, extraHolidayCost };
  }, [filteredRows, weeks, holidaysList]);

  // Week-by-Week Metrics list for sidebar Constituion breakdown
  const weeklyBreakdown = useMemo(() => {
    return weeks.map(week => {
      let weekHrs = 0;
      let weekCost = 0;
      
      week.days.forEach(day => {
        if (day.isInMonth) {
          const isHoliday = holidaysList.includes(day.dateStr);
          filteredRows.forEach(row => {
            const headcount = getHeadcount(row, day.dateStr, day.dayName);
            if (headcount > 0) {
              const hours = headcount * row.hoursPerDay;
              const rate = isHoliday ? row.hourlyRate * 2 : row.hourlyRate;
              weekCost += hours * rate;
              weekHrs += hours;
            }
          });
        }
      });

      return {
        weekIndex: week.weekIndex,
        label: `Semana ${week.weekIndex}`,
        dateRange: `${week.days[0].formattedDate} - ${week.days[6].formattedDate}`,
        hours: weekHrs,
        cost: weekCost
      };
    });
  }, [weeks, filteredRows, holidaysList]);

  // Resumen por PUESTO: agrupa todas las filas por roleLabel y suma horas y costo del mes.
  const positionBreakdown = useMemo(() => {
    const map: Record<string, { label: string; hours: number; cost: number }> = {};
    weeks.forEach(week => {
      week.days.forEach(day => {
        if (day.isInMonth) {
          const isHoliday = holidaysList.includes(day.dateStr);
          filteredRows.forEach(row => {
            const headcount = getHeadcount(row, day.dateStr, day.dayName);
            if (headcount > 0) {
              const hours = headcount * row.hoursPerDay;
              const rate = isHoliday ? row.hourlyRate * 2 : row.hourlyRate;
              const key = row.roleLabel || row.roleId || 'Sin puesto';
              if (!map[key]) map[key] = { label: key, hours: 0, cost: 0 };
              map[key].hours += hours;
              map[key].cost += hours * rate;
            }
          });
        }
      });
    });
    return Object.values(map).sort((a, b) => b.hours - a.hours);
  }, [weeks, filteredRows, holidaysList]);

  // Active Week Row Calculations
  const activeWeekCostSummary = useMemo(() => {
    let weekHrs = 0;
    let weekCost = 0;
    activeWeek.days.forEach(day => {
      if (day.isInMonth) {
        const isHoliday = holidaysList.includes(day.dateStr);
        filteredRows.forEach(row => {
          const headcount = getHeadcount(row, day.dateStr, day.dayName);
          if (headcount > 0) {
            const hours = headcount * row.hoursPerDay;
            const rate = isHoliday ? row.hourlyRate * 2 : row.hourlyRate;
            weekCost += hours * rate;
            weekHrs += hours;
          }
        });
      }
    });
    return { hours: weekHrs, cost: weekCost };
  }, [activeWeek, filteredRows, holidaysList]);

  // Helper for rendering interactive map metrics of the SELECTED day
  const mapData = useMemo(() => {
    const matchedDayObj = activeMonthDays.find(d => d.dateStr === mapDateStr);
    const activeDayName = matchedDayObj ? matchedDayObj.dayName : 'Lunes';
    const isHoliday = holidaysList.includes(mapDateStr);

    const roomTotals: Record<string, number> = { cocina: 0, bacha: 0, barra: 0, caja: 0, salon: 0 };
    const roomStaff: Record<string, Array<{ label: string; count: number }>> = { cocina: [], bacha: [], barra: [], caja: [], salon: [] };

    filteredRows.forEach(row => {
      if (row.shift === mapShift) {
        const headcount = getHeadcount(row, mapDateStr, activeDayName);
        if (headcount > 0) {
          const room = getRoomForRole(row.roleId, row.roleLabel);
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

    return { roomTotals, roomStaff, isHoliday, activeDayName };
  }, [filteredRows, mapShift, mapDateStr, activeMonthDays, holidaysList]);

  // Dotación REAL del día/turno de simulación (para precargar el escenario)
  const simRealData = useMemo(() => {
    const matchedDayObj = activeMonthDays.find(d => d.dateStr === simDateStr);
    const activeDayName = matchedDayObj ? matchedDayObj.dayName : 'Lunes';
    const roomStaff: Record<string, Array<{ label: string; count: number }>> = { cocina: [], bacha: [], barra: [], caja: [], salon: [] };
    filteredRows.forEach(row => {
      if (row.shift === simShift) {
        const headcount = getHeadcount(row, simDateStr, activeDayName);
        if (headcount > 0) {
          const room = getRoomForRole(row.roleId, row.roleLabel);
          if (room) {
            const existing = roomStaff[room].find(s => s.label === row.roleLabel);
            if (existing) existing.count += headcount;
            else roomStaff[room].push({ label: row.roleLabel, count: headcount });
          }
        }
      }
    });
    return { roomStaff, activeDayName };
  }, [filteredRows, simShift, simDateStr, activeMonthDays]);

  // Puestos disponibles para arrastrar (labels únicos del roster + su sector sugerido)
  const availablePositions = useMemo(() => {
    const seen = new Map<string, string>(); // label -> room
    filteredRows.forEach(row => {
      if (!seen.has(row.roleLabel)) {
        seen.set(row.roleLabel, getRoomForRole(row.roleId, row.roleLabel) || 'salon');
      }
    });
    return Array.from(seen.entries()).map(([label, room]) => ({ label, room })).sort((a, b) => a.label.localeCompare(b.label));
  }, [filteredRows]);

  // Al cambiar día/turno de simulación, precargar el escenario con la dotación real (si no fue editado aún)
  useEffect(() => {
    if (!simDateStr) return;
    const key = `${simDateStr}_${simShift}`;
    if (key === simLoadedKey) return;
    // Copia profunda de la dotación real como punto de partida
    const fresh: Record<string, Array<{ label: string; count: number }>> = { cocina: [], bacha: [], barra: [], caja: [], salon: [] };
    Object.entries(simRealData.roomStaff).forEach(([room, arr]) => {
      fresh[room] = (arr as Array<{ label: string; count: number }>).map(s => ({ ...s }));
    });
    setSimScenario(fresh);
    setSimLoadedKey(key);
  }, [simDateStr, simShift, simRealData, simLoadedKey]);

  // Suma +1 de un puesto en un sector (o lo crea si no existe)
  const simAddPosition = (room: string, label: string) => {
    setSimScenario(prev => {
      const next = { ...prev, [room]: [...(prev[room] || [])] };
      const existing = next[room].find(s => s.label === label);
      if (existing) next[room] = next[room].map(s => s.label === label ? { ...s, count: s.count + 1 } : s);
      else next[room] = [...next[room], { label, count: 1 }];
      return next;
    });
  };
  // Cambia el conteo de un puesto (delta +1 / -1); si llega a 0, lo quita
  const simChangeCount = (room: string, label: string, delta: number) => {
    setSimScenario(prev => {
      const arr = (prev[room] || []).map(s => s.label === label ? { ...s, count: s.count + delta } : s).filter(s => s.count > 0);
      return { ...prev, [room]: arr };
    });
  };
  const simRemovePosition = (room: string, label: string) => {
    setSimScenario(prev => ({ ...prev, [room]: (prev[room] || []).filter(s => s.label !== label) }));
  };
  const simResetToReal = () => { setSimLoadedKey(''); };
  const simTotalPeople = (Object.values(simScenario) as Array<Array<{ label: string; count: number }>>).reduce((a, arr) => a + arr.reduce((b, s) => b + s.count, 0), 0);

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
            <p className="text-text-dim text-[9px] font-bold uppercase tracking-widest mt-0.5">Planificación Calendario Semana & Día por Día</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-bg-sidebar border border-border-dim rounded px-3 py-1.5 flex items-center gap-2.5">
            <Building2 size={14} className="text-brand-500" />
            <select
              value={localBranchId}
              onChange={(e) => setLocalBranchId(e.target.value)}
              className="bg-transparent border-none text-[10px] font-sans text-text-main outline-none uppercase font-bold cursor-pointer pr-4 border-r border-border-dim"
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

          <button
            onClick={() => {
              if (confirm('⚠️ ¿Estás seguro de que deseas eliminar TODOS los presupuestos cargados hasta ahora en todas las sucursales y meses? Esta acción no se puede deshacer y te permitirá realizar una importación limpia.')) {
                // Clear all keys from localStorage that start with hour_budget
                const keysToRemove: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                  const key = localStorage.key(i);
                  if (key && (key.startsWith('hour_budget_') || key.startsWith('hour_budget'))) {
                    keysToRemove.push(key);
                  }
                }
                keysToRemove.forEach(k => localStorage.removeItem(k));
                
                // Reset state
                setRows([]);
                setHolidaysList([]);
                setSelectedRowIds([]);
                alert('¡Datos correspondientes a todos los presupuestos vaciados con éxito! Procediendo a recargar la página.');
                window.location.reload();
              }
            }}
            className="text-[9.5px] font-black uppercase text-red-550 hover:text-red-400 bg-red-500/5 hover:bg-red-500/10 transition-all flex items-center gap-1.5 border border-red-500/20 px-3.5 py-1.5 rounded shrink-0 cursor-pointer"
            title="Eliminar absolutamente todos los datos de presupuestos cargados para re-importar de cero"
          >
            <Trash2 size={13} className="stroke-[2.5]" /> Limpiar Todo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Left Column Controls */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Holiday (Feriados) Sidebar Manager */}
          <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 space-y-4 shadow-sm">
            <h3 className="text-[10px] font-black uppercase text-brand-500 flex items-center gap-2 tracking-wider">
              <Flag size={13} className="text-brand-500" /> Feriados de este Mes (Valor x2)
            </h3>
            <p className="text-[9px] text-text-dim font-bold uppercase leading-relaxed">
              Registra los feriados nacionales del mes. El costo por hora para estas fechas se duplicará automáticamente.
            </p>

            {/* Multi-select checklist + confirm button */}
            <div className="space-y-2 pt-1">
              <label className="text-[9.5px] font-black text-text-dim uppercase tracking-widest">Seleccionar Días Feriados:</label>
              <div className="max-h-[160px] overflow-y-auto space-y-1 border border-border-dim rounded p-2 bg-bg-main">
                {activeMonthDays.map(day => (
                  <label key={day.dateStr} className="flex items-center gap-2 cursor-pointer hover:bg-bg-accent/30 px-1 py-0.5 rounded">
                    <input
                      type="checkbox"
                      checked={pendingHolidays.includes(day.dateStr)}
                      onChange={() => handleToggleHoliday(day.dateStr)}
                      className="accent-red-500 w-3 h-3"
                    />
                    <span className="text-[10px] font-bold text-text-main uppercase">
                      {day.dayNumber} - {day.dayName.substring(0,3).toUpperCase()}
                    </span>
                  </label>
                ))}
              </div>
              <button
                onClick={handleConfirmHolidays}
                className="w-full px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-[9px] font-black uppercase tracking-widest rounded transition-all flex items-center justify-center gap-2"
              >
                <Flag size={11} /> Confirmar Feriados ({pendingHolidays.length})
              </button>
            </div>

            {/* List of registered holidays */}
            <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
              <p className="text-[8.5px] font-black text-[#8B949E] uppercase tracking-wide">Feriados Cargados ({holidaysList.length}):</p>
              {holidaysList.length === 0 ? (
                <p className="text-[9px] text-text-dim italic">No hay feriados registrados para este mes.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {holidaysList.map(hDate => {
                    const foundObj = activeMonthDays.find(d => d.dateStr === hDate);
                    const formatted = foundObj ? `${foundObj.dayNumber} ${foundObj.dayName.substring(0,3)}` : hDate;
                    return (
                      <span 
                        key={hDate} 
                        className="inline-flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 text-red-400 font-bold px-2 py-0.5 rounded text-[8.5px] uppercase"
                      >
                        {formatted}
                        <button 
                          onClick={() => handleToggleHoliday(hDate)}
                          className="hover:text-red-600 text-[10px] font-black leading-none"
                          title="Quitar Feriado"
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg text-text-dim text-[8.5px] uppercase leading-relaxed font-bold">
              Tip: Puedes marcar/desmarcar feriados directamente con los checkboxes sobre los encabezados de columnas en la tabla de presupuesto.
            </div>
          </div>

          {/* Budget Metrics with Weekly Constitution */}
          <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 relative overflow-hidden shadow-sm space-y-4">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-[#8B949E] dark:text-text-dim mb-1 flex items-center gap-1.5">
              <TrendingUp size={13} className="text-brand-500" /> Presupuesto Consolidado
            </h4>
            
            <div className="space-y-3">
              <div>
                <p className="text-[8px] text-[#8B949E] uppercase font-black tracking-widest opacity-70">Horas Totales del Mes</p>
                <p className="text-xl font-mono font-black text-text-main mt-0.5">
                  {budgetCalculations.totalHours.toLocaleString()}h
                </p>
              </div>
              
              <div>
                <p className="text-[8px] text-[#8B949E] uppercase font-black tracking-widest opacity-70">Costo Mensual Planificado</p>
                <p className="text-2xl font-mono font-black text-brand-600 dark:text-brand-500 tracking-tighter italic">
                  ${budgetCalculations.totalCost.toLocaleString('es-AR')}
                </p>
              </div>
            </div>

            {/* Weekly Sum constitutes total month */}
            <div className="pt-3.5 border-t border-border-dim/50 space-y-2">
              <p className="text-[8.5px] font-black text-text-dim uppercase tracking-wider">Desglose de Suma Semanal:</p>
              <div className="space-y-1">
                {weeklyBreakdown.map((wb) => (
                  <div key={wb.weekIndex} className="flex justify-between items-center text-[9px] py-1 border-b border-border-dim/20 last:border-none font-sans">
                    <div className="flex flex-col">
                      <span className="font-extrabold text-text-main">{wb.label}</span>
                      <span className="text-[7.5px] text-[#8B949E]">{wb.dateRange}</span>
                    </div>
                    <div className="text-right font-mono">
                      <span className="text-text-dim mr-1.5">{wb.hours}h</span>
                      <span className="font-bold text-brand-500">${wb.cost.toLocaleString('es-AR')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Desglose por PUESTO */}
            <div className="pt-3.5 border-t border-border-dim/50 space-y-2">
              <p className="text-[8.5px] font-black text-text-dim uppercase tracking-wider">Presupuesto de Horas por Puesto:</p>
              <div className="space-y-1">
                {positionBreakdown.length === 0 ? (
                  <p className="text-[8px] text-text-dim italic uppercase opacity-50 py-2">Sin datos cargados</p>
                ) : positionBreakdown.map((pb) => (
                  <div key={pb.label} className="flex justify-between items-center text-[9px] py-1 border-b border-border-dim/20 last:border-none font-sans">
                    <span className="font-extrabold text-text-main uppercase truncate max-w-[120px]">{pb.label}</span>
                    <div className="text-right font-mono shrink-0">
                      <span className="text-text-dim mr-1.5">{pb.hours.toLocaleString()}h</span>
                      <span className="font-bold text-brand-500">${pb.cost.toLocaleString('es-AR')}</span>
                    </div>
                  </div>
                ))}
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
                  <Calculator size={13} /> Roster por Semanas Calendario
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
                  <Layers size={13} /> Visualizar en Planta Día x Día
                </span>
              </button>

              <button
                onClick={() => setCurrentTab('simulate')}
                className={cn(
                  "px-5 py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all",
                  currentTab === 'simulate'
                    ? "bg-brand-500 text-black font-extrabold shadow-md"
                    : "text-text-dim hover:text-text-main"
                )}
              >
                <span className="flex items-center gap-1.5">
                  <Layers size={13} /> Simular Planta
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
                {/* Week Tabs Sub-Navigation */}
                <div className="p-3 bg-bg-main/50 border-b border-border-dim flex flex-wrap justify-between items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[9px] font-black uppercase text-text-dim tracking-wider mr-2">Elegir Semana:</span>
                    <div className="flex gap-1">
                      {weeks.map((week) => {
                        const isCurrentWk = week.weekIndex === activeWeekIndex;
                        const wStart = week.days[0].formattedDate;
                        const wEnd = week.days[6].formattedDate;
                        return (
                          <button
                            key={week.weekIndex}
                            onClick={() => setActiveWeekIndex(week.weekIndex)}
                            className={cn(
                              "px-3 py-1.5 rounded text-[9.5px] font-bold uppercase transition-all flex flex-col items-center min-w-[75px]",
                              isCurrentWk
                                ? "bg-[#252525] text-brand-500 border border-brand-500/20 shadow-inner"
                                : "hover:bg-bg-accent text-text-dim hover:text-text-main border border-transparent"
                            )}
                          >
                            <span>Semana {week.weekIndex}</span>
                            <span className="text-[7.5px] font-mono opacity-80 mt-0.5">{wStart} - {wEnd}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={handleDownloadTemplate}
                      className="text-[9px] font-black uppercase text-[#8B949E] hover:text-text-main bg-bg-main hover:bg-[#202020] transition-all flex items-center gap-1.5 border border-border-dim/85 px-3 py-1.5 rounded"
                      title="Descargar Planilla Modelo en formato CSV para Excel"
                    >
                      <Download size={12} /> Descargar Plantilla
                    </button>
                    <button
                      onClick={() => setIsImportModalOpen(true)}
                      className="text-[9px] font-black uppercase text-[#8B949E] hover:text-text-main bg-bg-main hover:bg-[#202020] transition-all flex items-center gap-1.5 border border-border-dim/85 px-3 py-1.5 rounded"
                      title="Importar Presupuesto mensual desde planilla Excel / CSV"
                    >
                      <Upload size={12} /> Importar Planilla
                    </button>
                    <button
                      onClick={() => handleCopyWeekToMonth(activeWeekIndex)}
                      className="text-[9px] font-black uppercase text-[#8B949E] hover:text-text-main bg-bg-main hover:bg-[#202020] transition-all flex items-center gap-1.5 border border-border-dim/85 px-3 py-1.5 rounded"
                      title="Copiar estos valores de personal diario a todas las semanas de este mes"
                    >
                      <Copy size={12} /> Copiar a Todo el Mes
                    </button>
                    {selectedRowIds.some(id => filteredRows.some(r => r.id === id)) && (
                      <button
                        onClick={() => {
                          const toDelete = selectedRowIds.filter(id => filteredRows.some(r => r.id === id));
                          if (confirm(`⚠️ ¿Estás seguro de que deseas eliminar los ${toDelete.length} puestos seleccionados?`)) {
                            setRows(prev => prev.filter(r => !toDelete.includes(r.id)));
                            setSelectedRowIds(prev => prev.filter(id => !toDelete.includes(id)));
                          }
                        }}
                        className="text-[9px] font-black uppercase text-red-400 hover:text-white bg-red-500/10 hover:bg-red-500 transition-all flex items-center gap-1.5 border border-red-500/30 px-3 py-1.5 rounded"
                      >
                        <Trash2 size={12} className="stroke-[2.5]" /> Eliminar Seleccionados ({selectedRowIds.filter(id => filteredRows.some(r => r.id === id)).length})
                      </button>
                    )}
                    {filteredRows.length === 0 && (
                      <button
                        onClick={handleLoadDefaultTemplate}
                        className="text-[9px] font-black uppercase text-brand-500 hover:text-white bg-brand-500/[0.04] hover:bg-brand-500 transition-all flex items-center gap-1.5 border border-brand-500/15 px-3 py-1.5 rounded shadow-sm"
                        title="Cargar la distribución estándar de puestos y personal de esta sucursal"
                      >
                        <Layers size={12} className="stroke-[2.5]" /> Cargar Plantilla
                      </button>
                    )}
                    <button 
                      onClick={handleAddRow}
                      className="text-[9px] font-black uppercase text-brand-500 hover:text-brand-600 transition-all flex items-center gap-1.5 border border-brand-500/15 px-3 py-1.5 bg-brand-500/[0.03] rounded"
                    >
                      <Plus size={12} className="stroke-[2.5]" /> Agregar Puesto
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[950px]">
                    <thead>
                      {/* Sub-Header Row with Dates & Holidays indicator */}
                      <tr className="bg-bg-main/20 border-b border-border-dim/55 text-[8px] uppercase tracking-wider font-extrabold text-[#8B949E]">
                        <th className="px-4 py-2 w-10"></th>
                        <th className="px-4 py-2"></th>
                        <th className="px-4 py-2"></th>
                        <th className="px-4 py-2"></th>
                        {activeWeek.days.map((day) => {
                          const isHoliday = holidaysList.includes(day.dateStr);
                          return (
                            <th 
                              key={day.dateStr} 
                              className={cn(
                                "px-2 py-2 text-center select-none",
                                day.isInMonth ? "bg-bg-main/10" : "bg-bg-main/5 text-text-dim/40"
                              )}
                            >
                              {day.isInMonth && (
                                <div className="flex flex-col items-center gap-1 justify-center py-1">
                                  <input 
                                    type="checkbox" 
                                    id={`holcheckbox-${day.dateStr}`}
                                    checked={isHoliday} 
                                    onChange={() => handleToggleHoliday(day.dateStr)}
                                    className="rounded text-brand-500 bg-bg-sidebar focus:ring-0 border-border-dim w-3.5 h-3.5 cursor-pointer accent-brand-500" 
                                    title="Marcar como feriado (Valor Hora x2)"
                                  />
                                  <span className={cn(
                                    "text-[7px] font-black tracking-tight uppercase leading-none mt-0.5", 
                                    isHoliday ? "text-red-500 font-extrabold" : "text-text-dim"
                                  )}>
                                    {isHoliday ? "🚩 FERIADO" : "REGULAR"}
                                  </span>
                                </div>
                              )}
                            </th>
                          );
                        })}
                        <th className="px-4 py-2 text-right"></th>
                        <th className="px-4 py-2"></th>
                      </tr>

                      {/* Prime Headings */}
                      <tr className="bg-bg-accent/40 border-b border-border-dim text-[9px] uppercase text-text-dim tracking-widest font-black">
                        <th className="px-4 py-3 text-center w-10">
                          <input 
                            type="checkbox" 
                            checked={filteredRows.length > 0 && filteredRows.every(r => selectedRowIds.includes(r.id))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedRowIds(prev => [...new Set([...prev, ...filteredRows.map(r => r.id)])]);
                              } else {
                                setSelectedRowIds(prev => prev.filter(id => !filteredRows.some(r => r.id === id)));
                              }
                            }}
                            className="rounded text-brand-500 bg-bg-sidebar focus:ring-0 border-border-dim w-3.5 h-3.5 cursor-pointer accent-brand-500"
                            title="Seleccionar todos los puestos"
                          />
                        </th>
                        <th className="px-4 py-3">Puesto</th>
                        <th className="px-4 py-3 text-center">Turno</th>
                        <th className="px-4 py-3 text-center">Hs Jornada</th>
                        {activeWeek.days.map((day) => (
                          <th 
                            key={day.dateStr} 
                            className={cn(
                              "px-2 py-3 text-center",
                              day.isInMonth ? "font-black" : "opacity-30 line-through"
                            )}
                          >
                            {day.dayName.substring(0,3)} {day.dayNumber}
                          </th>
                        ))}
                        <th className="px-4 py-3 text-right">Suma Semanal ($)</th>
                        <th className="px-4 py-3 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dim/40">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={14} className="px-6 py-16 text-center text-text-dim">
                            <div className="flex flex-col items-center justify-center max-w-md mx-auto py-8">
                              <Calendar size={40} className="text-text-dim/20 mb-3" />
                              <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-1.5">
                                Mes - Semana Sin Datos
                              </h3>
                              <p className="text-[9px] text-text-dim uppercase tracking-wider mb-6 font-medium leading-relaxed">
                                No se encontraron puestos ni datos guardados para esta combinación de mes y sucursal.
                              </p>
                              <div className="flex flex-col sm:flex-row gap-3 w-full justify-center">
                                <button
                                  type="button"
                                  onClick={handleLoadDefaultTemplate}
                                  className="text-[9.5px] font-black uppercase tracking-widest text-[#22c55e] border border-[#22c55e]/20 hover:bg-[#22c55e] hover:text-white bg-[#22c55e]/[0.02] px-4 py-2.5 rounded transition-all shadow-sm"
                                >
                                  Cargar Plantilla por Defecto
                                </button>
                                <button 
                                  type="button"
                                  onClick={handleAddRow}
                                  className="text-[9.5px] font-black uppercase tracking-widest text-text-main hover:text-white hover:bg-[#252525] transition-all border border-border-dim px-4 py-2.5 rounded bg-bg-main shadow-sm"
                                >
                                  <Plus size={11} className="inline mr-1 -mt-0.5" /> Agregar Puesto Manual
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((row) => {
                          let rowHrsInActiveWeek = 0;
                          let rowCostInActiveWeek = 0;

                          activeWeek.days.forEach(day => {
                            if (day.isInMonth) {
                              const headcount = getHeadcount(row, day.dateStr, day.dayName);
                              if (headcount > 0) {
                                const hours = headcount * row.hoursPerDay;
                                const isHoliday = holidaysList.includes(day.dateStr);
                                const rate = isHoliday ? row.hourlyRate * 2 : row.hourlyRate;
                                rowHrsInActiveWeek += hours;
                                rowCostInActiveWeek += hours * rate;
                              }
                            }
                          });

                          return (
                            <tr key={row.id} className="hover:bg-bg-accent/30 transition-colors group">
                              {/* Selection Checkbox */}
                              <td className="px-4 py-2.5 text-center w-10">
                                <input 
                                  type="checkbox" 
                                  checked={selectedRowIds.includes(row.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedRowIds(prev => [...prev, row.id]);
                                    } else {
                                      setSelectedRowIds(prev => prev.filter(id => id !== row.id));
                                    }
                                  }}
                                  className="rounded text-brand-500 bg-bg-sidebar focus:ring-0 border-border-dim w-3.5 h-3.5 cursor-pointer accent-brand-500"
                                />
                              </td>
                              {/* Puesto Column */}
                              <td className="px-4 py-2.5">
                                <select
                                  value={row.roleId}
                                  onChange={(e) => handleRowChange(row.id, 'roleId', e.target.value)}
                                  className="bg-bg-accent border border-border-dim rounded px-2 py-1 text-[10.5px] font-bold text-text-main outline-none focus:border-brand-500 uppercase w-full max-w-[160px]"
                                >
                                  {sucursalRolesList.map(rl => (
                                    <option key={rl.id} value={rl.id}>{rl.label}</option>
                                  ))}
                                  {row.roleId && !sucursalRolesList.find(rl => rl.id === row.roleId) && (
                                    <option key={row.roleId} value={row.roleId}>{row.roleLabel || row.roleId}</option>
                                  )}
                                </select>
                              </td>

                              {/* Turno Column */}
                              <td className="px-4 py-2.5 text-center">
                                <select
                                  value={row.shift}
                                  onChange={(e) => handleRowChange(row.id, 'shift', e.target.value as 'Mañana' | 'Tarde')}
                                  className="bg-bg-accent border border-border-dim rounded px-2 py-1 text-[10.5px] font-bold text-text-main outline-none focus:border-brand-500 uppercase"
                                >
                                  <option value="Mañana">Mañana</option>
                                  <option value="Tarde">Tarde</option>
                                </select>
                              </td>

                              {/* Hs Jornada Column */}
                              <td className="px-4 py-2.5 text-center">
                                <input
                                  type="number"
                                  value={row.hoursPerDay}
                                  onChange={(e) => handleRowChange(row.id, 'hoursPerDay', parseInt(e.target.value) || 0)}
                                  className="w-11 bg-bg-accent border border-border-dim rounded py-1 text-center text-text-main font-mono text-[11px] font-bold outline-none focus:border-brand-500"
                                  min="0"
                                />
                              </td>

                              {/* Day Columns (Lunes to Domingo) */}
                              {activeWeek.days.map((day) => {
                                const isHoliday = holidaysList.includes(day.dateStr);
                                const headcount = getHeadcount(row, day.dateStr, day.dayName);
                                
                                return (
                                  <td 
                                    key={day.dateStr} 
                                    className={cn(
                                      "px-1 py-2.5 text-center",
                                      day.isInMonth ? "" : "bg-[#181818]/15"
                                    )}
                                  >
                                    {day.isInMonth ? (
                                      <input
                                        type="number"
                                        value={headcount}
                                        onChange={(e) => handleStaffChange(row.id, day.dateStr, parseFloat(e.target.value) || 0)}
                                        className={cn(
                                          "w-11 bg-bg-main border rounded py-1 text-center text-text-main font-mono text-[11px] font-bold outline-none focus:border-brand-500 transition-all",
                                          isHoliday 
                                            ? "border-red-500/40 text-red-500 bg-red-500/[0.04] focus:border-red-500" 
                                            : "border-border-dim"
                                        )}
                                        min="0"
                                        step="0.5"
                                      />
                                    ) : (
                                      <div className="text-text-dim/35 text-[8px] font-mono tracking-tighter uppercase select-none">
                                        FUERA
                                      </div>
                                    )}
                                  </td>
                                );
                              })}

                              {/* Coste Proyectado Column */}
                              <td className="px-4 py-2.5 text-right font-mono">
                                <div className="flex flex-col items-end">
                                  <span className="text-[11.5px] font-black text-text-main">
                                    ${rowCostInActiveWeek.toLocaleString('es-AR')}
                                  </span>
                                  <span className="text-[8px] text-text-dim uppercase font-bold text-[7px] mt-0.5">
                                    {rowHrsInActiveWeek} h / semana
                                  </span>
                                </div>
                              </td>

                              {/* Action Remove Column */}
                              <td className="px-4 py-2.5 text-center">
                                <button
                                  onClick={() => handleRemoveRow(row.id)}
                                  className="text-text-dim hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors"
                                  title="Eliminar Puesto"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>

                    {/* Footer Row summarizing daily details */}
                    {filteredRows.length > 0 && (
                      <tfoot className="bg-[#121212]/30 border-t border-border-dim/80 font-mono text-[9.5px]">
                        {/* Summary: Total Headcount */}
                        <tr className="border-b border-border-dim/20">
                          <td colSpan={4} className="px-4 py-2 font-bold text-text-dim uppercase text-[8px] tracking-wider text-right">
                            Personal del Turno (Dotación):
                          </td>
                          {activeWeek.days.map(day => {
                            const sumStaff = filteredRows.reduce((a, r) => a + (day.isInMonth ? getHeadcount(r, day.dateStr, day.dayName) : 0), 0);
                            return (
                              <td key={day.dateStr} className="px-1 py-2 text-center text-text-main font-extrabold text-[10.5px]">
                                {day.isInMonth ? `${sumStaff}p` : '-'}
                              </td>
                            );
                          })}
                          <td colSpan={2}></td>
                        </tr>

                        {/* Summary: Total Hours */}
                        <tr className="border-b border-border-dim/20">
                          <td colSpan={4} className="px-4 py-2 font-bold text-text-dim uppercase text-[8px] tracking-wider text-right">
                            Horas Totales del Día:
                          </td>
                          {activeWeek.days.map(day => {
                            const sumHrs = filteredRows.reduce((a, r) => a + (day.isInMonth ? getHeadcount(r, day.dateStr, day.dayName) * r.hoursPerDay : 0), 0);
                            return (
                              <td key={day.dateStr} className="px-1 py-2 text-center text-[#8B949E] font-bold text-[10px]">
                                {day.isInMonth ? `${sumHrs}h` : '-'}
                              </td>
                            );
                          })}
                          <td colSpan={2}></td>
                        </tr>

                        {/* Summary: Cost */}
                        <tr className="border-b border-border-dim/20 font-bold bg-[#1A1A1A]">
                          <td colSpan={4} className="px-4 py-2 font-black text-brand-500 uppercase text-[8.5px] tracking-wider text-right">
                            Costo Proyectado Por Día:
                          </td>
                          {activeWeek.days.map(day => {
                            const isHoliday = holidaysList.includes(day.dateStr);
                            const sumCost = filteredRows.reduce((a, r) => {
                              if (!day.isInMonth) return a;
                              const headcount = getHeadcount(r, day.dateStr, day.dayName);
                              const rate = isHoliday ? r.hourlyRate * 2 : r.hourlyRate;
                              return a + (headcount * r.hoursPerDay * rate);
                            }, 0);
                            return (
                              <td key={day.dateStr} className={cn(
                                "px-1 py-2.5 text-center text-[10px] font-black",
                                isHoliday ? "text-red-400" : "text-brand-500"
                              )}>
                                {day.isInMonth ? `$${sumCost.toLocaleString()}` : '-'}
                              </td>
                            );
                          })}
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>

                {/* Table Bottom Save bar */}
                <div className="p-4 bg-[#141414] border-t border-border-dim flex justify-between items-center">
                  <div className="flex gap-4">
                    <div className="text-left">
                      <p className="text-[8px] font-black text-[#8B949E] uppercase tracking-wider">Costo Semana {activeWeekIndex}</p>
                      <p className="text-sm font-black text-white mt-0.5 font-mono">
                        ${activeWeekCostSummary.cost.toLocaleString('es-AR')}
                      </p>
                    </div>
                    <div className="text-left border-l border-border-dim/50 pl-4">
                      <p className="text-[8px] font-black text-brand-500 uppercase tracking-wider">Horas Semana {activeWeekIndex}</p>
                      <p className="text-sm font-black text-brand-500 mt-0.5 font-mono">
                        {activeWeekCostSummary.hours}h
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    {saveSuccess && (
                      <span className="text-[9px] font-bold text-emerald-500 uppercase bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded flex items-center">
                        ¡Presupuesto Guardado Correctamente!
                      </span>
                    )}
                    <button
                      onClick={handleSaveBudget}
                      className="bg-brand-500 hover:bg-brand-600 text-black font-extrabold text-[10.5px] uppercase tracking-wider px-6 py-2.5 rounded shadow-lg shadow-brand-500/10 flex items-center gap-2"
                    >
                      <Save size={14} className="stroke-[2.5]" /> Guardar Todo el Mes {selectedMonth}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* View B: Hall Floor Graphic Map with Exact Day selection */}
            {currentTab === 'map' && (
              <motion.div
                key="map-view"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="bg-[#1A1A1A] border border-border-dim rounded-lg p-6 space-y-6"
              >
                {/* Map Control Bar */}
                <div className="space-y-4 border-b border-border-dim/60 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="text-xs font-black uppercase text-text-main flex items-center gap-2">
                        <MapPin size={14} className="text-brand-500" /> Distribución en Planta (Visualización Diaria)
                      </h3>
                      <p className="text-[8.5px] text-[#8C959F] uppercase font-bold tracking-tight">
                        Audita el despliegue físico de personal en cualquier día de este mes para verificar refuerzos u operaciones.
                      </p>
                    </div>

                    {/* Shift switch */}
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-black uppercase text-text-dim">Filtrar Turno:</span>
                      <div className="flex bg-[#121212]/80 p-1 rounded-md border border-border-dim/40">
                        <button
                          onClick={() => setMapShift('Mañana')}
                          className={cn(
                            "px-3 py-1 rounded text-[8.5px] font-black uppercase transition-all whitespace-nowrap",
                            mapShift === 'Mañana' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main"
                          )}
                        >
                          Mañana
                        </button>
                        <button
                          onClick={() => setMapShift('Tarde')}
                          className={cn(
                            "px-3 py-1 rounded text-[8.5px] font-black uppercase transition-all whitespace-nowrap",
                            mapShift === 'Tarde' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main"
                          )}
                        >
                          Tarde
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Day Pills horizontal selection Strip */}
                  <div className="space-y-2">
                    <span className="text-[9px] font-black uppercase text-brand-500 flex items-center gap-1">
                      <Clock size={12} /> Selecciona el Día del Mes a Auditar:
                    </span>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-800">
                      {activeMonthDays.map((day) => {
                        const isSelected = mapDateStr === day.dateStr;
                        return (
                          <button
                            key={day.dateStr}
                            onClick={() => setMapDateStr(day.dateStr)}
                            className={cn(
                              "flex flex-col items-center px-4 py-2 rounded border text-[9.5px] uppercase font-bold shrink-0 transition-all min-w-[55px]",
                              isSelected
                                ? "bg-brand-500 text-black border-brand-500 shadow"
                                : day.isHoliday
                                  ? "bg-red-500/10 hover:bg-red-500/15 text-red-400 border-red-500/20"
                                  : "bg-bg-sidebar hover:bg-bg-accent border-border-dim text-text-main"
                            )}
                          >
                            <span className="text-[7.5px] opacity-75">{day.dayName.substring(0, 3)}</span>
                            <span className="text-sm font-black mt-0.5">{day.dayNumber}</span>
                            {day.isHoliday && <span className="text-[7.2px] text-red-500 font-extrabold mt-0.5">🚩 Feriado</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Primary Graphical Layout */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                  
                  {/* SVG Map Representation */}
                  <div className="xl:col-span-2 bg-[#121212] border border-border-dim rounded-xl p-4 flex items-center justify-center relative overflow-hidden shadow-2xl h-[380px]">
                    
                    <svg className="w-full h-full" viewBox="0 0 600 350" fill="none">
                      <defs>
                        <pattern id="dotGridMap" width="20" height="20" patternUnits="userSpaceOnUse">
                          <circle cx="2" cy="2" r="1" fill="#202020" />
                        </pattern>
                      </defs>
                      <rect width="600" height="350" fill="url(#dotGridMap)" rx="10" />

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

                    {/* Cocina Overlay */}
                    <div className="absolute top-[55px] left-[40px] w-[145px] flex flex-col gap-1.5 pointer-events-none">
                      <div className="flex flex-wrap gap-1">
                        {filteredRows
                          .filter(r => r.shift === mapShift && getRoomForRole(r.roleId, r.roleLabel) === 'cocina')
                          .map((r) => {
                            const count = getHeadcount(r, mapDateStr, mapData.activeDayName);
                            if (count <= 0) return null;
                            return (
                              <div 
                                key={r.id} 
                                className="bg-brand-500 text-black text-[8px] font-black px-1.5 py-0.5 rounded shadow cursor-help flex items-center gap-0.5 border border-black/10 pointer-events-auto"
                                title={`${r.roleLabel}: ${count}p`}
                              >
                                {r.roleLabel.substring(0, 3).toUpperCase()} {count}p
                              </div>
                            );
                          })}
                      </div>
                      {mapData.roomTotals.cocina > 0 && (
                        <div className="flex flex-wrap gap-1 bg-black/60 p-1.5 rounded border border-white/5 max-w-full justify-start pointer-events-auto">
                          {Array.from({ length: Math.ceil(mapData.roomTotals.cocina) }).map((_, idx) => (
                            <span key={idx} className="p-0.5 rounded bg-orange-500/10 border border-orange-500/30 flex items-center justify-center animate-pulse animate-delay-[100ms] shadow-sm shadow-orange-500/10" title="Personal de Cocina">
                              <User size={12} className="text-orange-500 fill-orange-500/40 drop-shadow-[0_0_5px_rgba(249,115,22,0.8)]" />
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bacha Overlay */}
                    <div className="absolute top-[230px] left-[30px] w-[95px] flex flex-col gap-1.5 pointer-events-none">
                      <div className="flex flex-wrap gap-1">
                        {filteredRows
                          .filter(r => r.shift === mapShift && getRoomForRole(r.roleId, r.roleLabel) === 'bacha')
                          .map((r) => {
                            const count = getHeadcount(r, mapDateStr, mapData.activeDayName);
                            if (count <= 0) return null;
                            return (
                              <div 
                                key={r.id} 
                                className="bg-[#C0C0C0] text-black text-[8px] font-black px-1.5 py-0.5 rounded shadow cursor-help pointer-events-auto"
                                title={`${r.roleLabel}: ${count}p`}
                              >
                                BAC {count}p
                              </div>
                            );
                          })}
                      </div>
                      {mapData.roomTotals.bacha > 0 && (
                        <div className="flex flex-wrap gap-1 bg-black/60 p-1.5 rounded border border-white/5 max-w-full justify-start pointer-events-auto">
                          {Array.from({ length: Math.ceil(mapData.roomTotals.bacha) }).map((_, idx) => (
                            <span key={idx} className="p-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center animate-pulse animate-delay-[200ms] shadow-sm shadow-emerald-500/10" title="Personal de Bacha">
                              <User size={12} className="text-emerald-400 fill-emerald-400/40 drop-shadow-[0_0_5px_rgba(52,211,153,0.8)]" />
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Barra Overlay */}
                    <div className="absolute top-[55px] left-[225px] w-[65px] flex flex-col gap-1.5 pointer-events-none">
                      <div className="flex flex-wrap gap-1">
                        {filteredRows
                          .filter(r => r.shift === mapShift && getRoomForRole(r.roleId, r.roleLabel) === 'barra')
                          .map((r) => {
                            const count = getHeadcount(r, mapDateStr, mapData.activeDayName);
                            if (count <= 0) return null;
                            return (
                              <div 
                                key={r.id} 
                                className="bg-[#D4AF37] text-black text-[8px] font-black px-1.5 py-0.5 rounded shadow cursor-help pointer-events-auto"
                                title={`${r.roleLabel}: ${count}p`}
                              >
                                BAR {count}p
                              </div>
                            );
                          })}
                      </div>
                      {mapData.roomTotals.barra > 0 && (
                        <div className="flex flex-wrap gap-1 bg-black/60 p-1.5 rounded border border-white/5 max-w-full justify-start pointer-events-auto">
                          {Array.from({ length: Math.ceil(mapData.roomTotals.barra) }).map((_, idx) => (
                            <span key={idx} className="p-0.5 rounded bg-yellow-500/15 border border-yellow-500/30 flex items-center justify-center animate-pulse animate-delay-[300ms] shadow-sm shadow-yellow-500/10" title="Personal de Barra">
                              <User size={12} className="text-yellow-400 fill-yellow-400/40 drop-shadow-[0_0_5px_rgba(250,204,21,0.8)]" />
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Caja Overlay */}
                    <div className="absolute top-[230px] left-[155px] w-[130px] flex flex-col gap-1.5 pointer-events-none">
                      <div className="flex flex-wrap gap-1">
                        {filteredRows
                          .filter(r => r.shift === mapShift && getRoomForRole(r.roleId, r.roleLabel) === 'caja')
                          .map((r) => {
                            const count = getHeadcount(r, mapDateStr, mapData.activeDayName);
                            if (count <= 0) return null;
                            return (
                              <div 
                                key={r.id} 
                                className="bg-[#4682B4] text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow cursor-help pointer-events-auto"
                                title={`${r.roleLabel}: ${count}p`}
                              >
                                CAJ {count}p
                              </div>
                            );
                          })}
                      </div>
                      {mapData.roomTotals.caja > 0 && (
                        <div className="flex flex-wrap gap-1 bg-black/60 p-1.5 rounded border border-white/5 max-w-full justify-start pointer-events-auto">
                          {Array.from({ length: Math.ceil(mapData.roomTotals.caja) }).map((_, idx) => (
                            <span key={idx} className="p-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center animate-pulse animate-delay-[400ms] shadow-sm shadow-cyan-500/10" title="Personal de Caja">
                              <User size={12} className="text-cyan-400 fill-cyan-400/40 drop-shadow-[0_0_5px_rgba(34,211,238,0.8)]" />
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Salon Overlay */}
                    <div className="absolute top-[55px] left-[320px] w-[250px] flex flex-col gap-1.5 pointer-events-none">
                      <div className="flex flex-wrap gap-1.5 justify-start">
                        {filteredRows
                          .filter(r => r.shift === mapShift && getRoomForRole(r.roleId, r.roleLabel) === 'salon')
                          .map((r) => {
                            const count = getHeadcount(r, mapDateStr, mapData.activeDayName);
                            if (count <= 0) return null;
                            return (
                              <div 
                                key={r.id} 
                                className="bg-zinc-700 text-white text-[8px] font-black px-1.5 py-0.5 rounded shadow cursor-help flex items-center gap-0.5 border border-border-dim pointer-events-auto"
                                title={`${r.roleLabel}: ${count}p`}
                              >
                                {r.roleLabel.toUpperCase()} <span className="text-brand-500 font-black">{count}p</span>
                              </div>
                            );
                          })}
                      </div>
                      {mapData.roomTotals.salon > 0 && (
                        <div className="flex flex-wrap gap-1 bg-black/60 p-1.5 rounded border border-white/5 max-w-full justify-start pointer-events-auto">
                          {Array.from({ length: Math.ceil(mapData.roomTotals.salon) }).map((_, idx) => (
                            <span key={idx} className="p-0.5 rounded bg-purple-500/15 border border-purple-500/30 flex items-center justify-center animate-pulse animate-delay-[500ms] shadow-sm shadow-purple-500/10" title="Personal de Salón">
                              <User size={12} className="text-purple-400 fill-purple-400/40 drop-shadow-[0_0_5px_rgba(192,132,252,0.8)]" />
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Room Metrics details (Sidebar inside map view) */}
                  <div className="bg-[#121212] border border-border-dim rounded-xl p-5 space-y-4">
                    <div className="border-b border-border-dim/40 pb-3 flex justify-between items-center">
                      <div className="flex flex-col">
                        <h4 className="text-xs font-black uppercase text-[#E0E0E0] tracking-wider">
                          Personal en {selectedRoom.toUpperCase()}
                        </h4>
                        <span className="text-[7.5px] text-text-dim uppercase mt-0.5 font-sans font-black">
                          Día seleccionado: {mapDateStr}
                        </span>
                      </div>
                      <span className="text-[9px] font-mono font-bold text-brand-500 bg-brand-500/10 px-2.5 py-0.5 rounded-full shrink-0">
                        {mapData.roomTotals[selectedRoom] || 0} p
                      </span>
                    </div>

                    {mapData.isHoliday && (
                      <div className="bg-red-500/10 border border-red-500/20 text-red-400 font-bold p-2.5 rounded text-[8.5px] uppercase flex items-center gap-2">
                        <span>🚩 Feriado Activado (Hora Doble para este Día)</span>
                      </div>
                    )}

                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {(mapData.roomStaff[selectedRoom] || []).length === 0 ? (
                        <p className="text-[10px] text-text-dim uppercase font-black tracking-tight text-center py-6 opacity-40">
                          Sin personal asignado en este turno para el sector {selectedRoom}
                        </p>
                      ) : (
                        (mapData.roomStaff[selectedRoom] || []).map((staff, i) => {
                          let bgClass = "bg-[#ffffff]/5 border-[#ffffff]/10";
                          let svgClass = "text-text-main fill-text-main/20 drop-shadow-[0_0_2px_rgba(255,255,255,0.4)]";
                          if (selectedRoom === 'cocina') {
                            bgClass = "bg-orange-500/10 border-orange-500/30";
                            svgClass = "text-orange-500 fill-orange-500/30 drop-shadow-[0_0_4px_rgba(249,115,22,0.8)]";
                          } else if (selectedRoom === 'bacha') {
                            bgClass = "bg-emerald-500/10 border-emerald-500/30";
                            svgClass = "text-emerald-400 fill-emerald-400/30 drop-shadow-[0_0_4px_rgba(52,211,153,0.8)]";
                          } else if (selectedRoom === 'barra') {
                            bgClass = "bg-yellow-500/10 border-yellow-500/30";
                            svgClass = "text-yellow-400 fill-yellow-400/30 drop-shadow-[0_0_4px_rgba(250,204,21,0.8)]";
                          } else if (selectedRoom === 'caja') {
                            bgClass = "bg-cyan-500/10 border-cyan-500/30";
                            svgClass = "text-cyan-400 fill-cyan-400/30 drop-shadow-[0_0_4px_rgba(34,211,238,0.8)]";
                          } else if (selectedRoom === 'salon') {
                            bgClass = "bg-purple-500/10 border-purple-500/30";
                            svgClass = "text-purple-400 fill-purple-400/30 drop-shadow-[0_0_4px_rgba(192,132,252,0.8)]";
                          }

                          return (
                            <div key={i} className="p-2.5 rounded bg-bg-accent/40 border border-border-dim/40 space-y-1.5 animate-fadeIn">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-text-main uppercase text-[10px]">{staff.label}</span>
                                <span className="font-mono text-[10.5px] font-bold text-brand-500">{staff.count}p</span>
                              </div>
                              <div className="flex flex-wrap gap-1 bg-[#121212]/50 p-1.5 rounded border border-border-dim/20">
                                {Array.from({ length: Math.ceil(staff.count) }).map((_, idx) => (
                                  <div key={idx} title={`${staff.label} #${idx + 1}`} className={cn("p-1.5 rounded flex items-center justify-center animate-pulse", bgClass)}>
                                    <User size={13} className={svgClass} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="bg-bg-card p-3 rounded border border-border-dim/40 text-[9.5px] leading-relaxed text-text-dim">
                      <p className="font-bold text-text-main uppercase mb-1">Guía del Supervisor:</p>
                      Haz click sobre cualquier sector del plano (<span className="text-brand-500 font-extrabold">Cocina, Salón, Barra, Caja, Bachas</span>) para auditar la dotación. Tienes la libertad de configurar refuerzos para un día en particular (por ejemplo, si un lunes es feriado) en la pestaña del Roster Semanal; esta planta reflejará exactamente esos cambios.
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {currentTab === 'simulate' && (
              <motion.div
                key="simulate-view"
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="bg-[#1A1A1A] border border-border-dim rounded-lg p-6 space-y-6"
              >
                {/* Control Bar */}
                <div className="space-y-4 border-b border-border-dim/60 pb-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="text-xs font-black uppercase text-white flex items-center gap-2">
                        <MapPin size={14} className="text-brand-500" /> Simulación de Planta (Escenario Hipotético)
                      </h3>
                      <p className="text-[8.5px] text-zinc-400 uppercase font-bold tracking-tight">
                        Armá un escenario de dotación para planificar cuánta gente necesitás. Arranca con la dotación real del día; no afecta los datos reales.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[9px] font-black uppercase text-text-dim">Filtrar Turno:</span>
                      <div className="flex bg-[#121212]/80 p-1 rounded-md border border-border-dim/40">
                        <button onClick={() => { setSimShift('Mañana'); setSimLoadedKey(''); }}
                          className={cn("px-3 py-1 rounded text-[8.5px] font-black uppercase transition-all whitespace-nowrap", simShift === 'Mañana' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main")}>
                          Mañana
                        </button>
                        <button onClick={() => { setSimShift('Tarde'); setSimLoadedKey(''); }}
                          className={cn("px-3 py-1 rounded text-[8.5px] font-black uppercase transition-all whitespace-nowrap", simShift === 'Tarde' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main")}>
                          Tarde
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Day strip */}
                  <div className="space-y-2">
                    <span className="text-[9px] font-black uppercase text-brand-500 flex items-center gap-1">
                      <Clock size={12} /> Selecciona el Día a Simular:
                    </span>
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-800">
                      {activeMonthDays.map((day) => {
                        const isSelected = simDateStr === day.dateStr;
                        return (
                          <button key={day.dateStr}
                            onClick={() => { setSimDateStr(day.dateStr); setSimLoadedKey(''); }}
                            className={cn(
                              "flex flex-col items-center justify-center min-w-[60px] h-[60px] rounded-lg border transition-all shrink-0",
                              isSelected ? "bg-brand-500 border-brand-500 text-black" : "bg-[#121212] border-border-dim text-text-dim hover:border-brand-500/50"
                            )}>
                            <span className="text-[8px] font-black uppercase">{day.dayName.slice(0, 3)}</span>
                            <span className="text-base font-black">{parseInt(day.dateStr.split('-')[2], 10)}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Panel de puestos para arrastrar + total */}
                <div className="bg-[#121212] border border-border-dim rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h4 className="text-[10px] font-black uppercase text-white tracking-widest">Puestos disponibles — arrastralos a un sector</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black bg-brand-500/15 text-brand-500 px-2 py-1 rounded">Total: {simTotalPeople}p</span>
                      <button onClick={simResetToReal}
                        className="text-[9px] font-black uppercase tracking-widest bg-[#1A1A1A] border border-amber-500/40 text-amber-500 px-2.5 py-1 rounded hover:border-amber-500">
                        Reiniciar a real
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {availablePositions.map(p => (
                      <div key={p.label}
                        draggable
                        onDragStart={() => setDragLabel(p.label)}
                        onDragEnd={() => setDragLabel(null)}
                        className="cursor-grab active:cursor-grabbing bg-[#1A1A1A] border border-border-dim rounded-lg px-3 py-2 text-[10px] font-black uppercase text-zinc-200 hover:border-brand-500/60 select-none flex items-center gap-1.5">
                        <User size={12} className="text-orange-500 fill-orange-500/40" /> {p.label}
                      </div>
                    ))}
                    {availablePositions.length === 0 && (
                      <p className="text-[9px] font-bold uppercase text-text-dim tracking-widest">No hay puestos definidos en el roster</p>
                    )}
                  </div>
                </div>

                {/* Sectores (zonas de drop) */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {(['cocina','salon','barra','caja','bacha'] as const).map(room => {
                    const staff = simScenario[room] || [];
                    const total = staff.reduce((a, s) => a + s.count, 0);
                    const roomLabel = { cocina: 'Cocina', salon: 'Salón', barra: 'Barra', caja: 'Caja', bacha: 'Bachas' }[room];
                    return (
                      <div key={room}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => { if (dragLabel) { simAddPosition(room, dragLabel); setDragLabel(null); } }}
                        className={cn("bg-[#121212] border rounded-xl p-4 transition-all", dragLabel ? "border-brand-500/60 border-dashed" : "border-border-dim")}>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-[11px] font-black uppercase text-white tracking-widest">{roomLabel}</h4>
                          <span className="text-[9px] font-black bg-brand-500/15 text-brand-500 px-2 py-0.5 rounded">{total}p</span>
                        </div>
                        {staff.length === 0 ? (
                          <p className="text-[9px] font-bold uppercase text-text-dim tracking-widest py-6 text-center border border-dashed border-border-dim/40 rounded-lg">
                            {dragLabel ? 'Soltá acá' : 'Sin personal · arrastrá un puesto'}
                          </p>
                        ) : (
                          <div className="space-y-1.5">
                            {staff.map((s, i) => (
                              <div key={i} className="flex items-center justify-between bg-[#1A1A1A] border border-border-dim/50 rounded px-3 py-1.5 gap-2">
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <div className="flex items-center -space-x-1 shrink-0">
                                    {Array.from({ length: Math.min(s.count, 5) }).map((_, k) => (
                                      <User key={k} size={12} className="text-orange-500 fill-orange-500/40" />
                                    ))}
                                    {s.count > 5 && <span className="text-[9px] font-black text-orange-400 ml-1">+{s.count - 5}</span>}
                                  </div>
                                  <span className="text-[10px] font-bold text-zinc-200 truncate">{s.label}</span>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button onClick={() => simChangeCount(room, s.label, -1)}
                                    className="w-5 h-5 rounded bg-[#252525] text-zinc-300 text-[11px] font-black hover:bg-red-500/20 hover:text-red-400 flex items-center justify-center">−</button>
                                  <span className="text-[11px] font-mono font-black text-brand-500 w-5 text-center">{s.count}</span>
                                  <button onClick={() => simChangeCount(room, s.label, 1)}
                                    className="w-5 h-5 rounded bg-[#252525] text-zinc-300 text-[11px] font-black hover:bg-emerald-500/20 hover:text-emerald-400 flex items-center justify-center">+</button>
                                  <button onClick={() => simRemovePosition(room, s.label)}
                                    className="ml-1 text-text-dim hover:text-red-500" title="Quitar"><Trash2 size={12} /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="bg-brand-500/5 border border-brand-500/20 rounded-lg p-3 text-[9px] text-zinc-300 leading-relaxed">
                  <p className="font-black text-white uppercase mb-1">Cómo usar la simulación</p>
                  Arrastrá un puesto desde arriba hacia el sector donde lo necesitás, o usá los botones + / − para ajustar cantidades. "Reiniciar a real" vuelve a la dotación real del día. Esto es un escenario hipotético: no afecta los datos reales. (Guardar el escenario llega en la próxima parte.)
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>

      {/* Excel / CSV Import Modal */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div key="import-modal-overlay" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl bg-bg-sidebar border border-border-dim rounded-xl shadow-2xl overflow-hidden text-left"
            >
              {/* Modal Header */}
              <div className="px-6 py-4.5 bg-[#171717] border-b border-border-dim flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Layers className="text-brand-500" size={18} />
                  <h3 className="text-sm font-black uppercase text-white tracking-wider">Importador de Presupuesto (CSV / Excel)</h3>
                </div>
                <button 
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setImportPreview(null);
                  }}
                  className="text-text-dim hover:text-text-main font-black text-xs uppercase cursor-pointer"
                >
                  Cerrar
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4">
                {importModalSuccess ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
                    <div className="w-12 h-12 rounded-full bg-green-500/15 border border-green-500/30 flex items-center justify-center text-green-500">
                      <CheckSquare size={24} />
                    </div>
                    <h4 className="text-sm font-black uppercase text-green-500">¡Importación Exitosa!</h4>
                    <p className="text-[11px] text-text-dim uppercase max-w-sm">Los datos de presupuesto se han cargado para la sucursal activa. Haz click en "Guardar Todo el Mes" para confirmar la persistencia.</p>
                  </div>
                ) : !importPreview ? (
                  <div className="space-y-4">
                    <p className="text-[10.5px] text-text-dim uppercase leading-relaxed font-bold">
                      Carga el presupuesto mensual de personal directamente guardándolo en Excel como <span className="text-white font-black">archivo CSV (delimitado por comas)</span>. 
                      Utiliza nuestra plantilla descargada que ya contiene los puestos de tu sucursal y la estructura de fechas exacta para el mes seleccionado (<span className="text-brand-500 font-black">{selectedMonth}</span>).
                    </p>

                    {/* Drag and Drop Zone */}
                    <div 
                      onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                      onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                      onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragActive(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            if (event.target?.result) processCSVFile(event.target.result as string);
                          };
                          reader.readAsText(file);
                        }
                      }}
                      className={cn(
                        "border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-3 transition-colors cursor-pointer",
                        dragActive ? "border-brand-500 bg-brand-500/[0.03]" : "border-border-dim/80 hover:border-brand-500/40 bg-bg-main/20"
                      )}
                      onClick={() => document.getElementById('csv-file-input')?.click()}
                    >
                      <input 
                        type="file" 
                        id="csv-file-input" 
                        accept=".csv" 
                        className="hidden" 
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            const reader = new FileReader();
                            reader.onload = (event) => {
                              if (event.target?.result) processCSVFile(event.target.result as string);
                            };
                            reader.readAsText(file);
                          }
                        }}
                      />
                      <Upload className="text-text-dim/80" size={32} />
                      <div className="space-y-1">
                        <p className="text-xs font-black uppercase text-white">Arrastra aquí tu plantilla CSV o haz click para buscar</p>
                        <p className="text-[9px] text-[#8B949E] uppercase font-black">Formatos soportados: .csv (delimitado por comas o punto y coma)</p>
                      </div>
                    </div>

                    <div className="bg-bg-main/30 border border-border-dim/60 p-4 rounded-lg flex items-start gap-3">
                      <Info size={16} className="text-brand-500 shrink-0 mt-0.5" />
                      <div className="space-y-1 text-left">
                        <p className="text-[10px] font-black uppercase text-white font-black">¿Cómo operar con Excel?</p>
                        <ol className="list-decimal list-inside text-[9px] text-text-dim uppercase space-y-1 font-bold">
                          <li>Descarga la plantilla haciendo click en <span className="text-brand-500 font-extrabold">"Descargar Plantilla"</span></li>
                          <li>Ábrela en Excel y completa la dotación diaria para cada puesto</li>
                          <li>Guarda el archivo indicando tipo <span className="text-white">"Archivos CSV"</span> (delimitado por comas)</li>
                          <li>Súbela aquí para auditar e integrar los datos de dotación</li>
                        </ol>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Preview state
                  <div className="space-y-4">
                    <p className="text-[10.5px] text-text-dim uppercase font-bold">Filas detectadas en el archivo ({importPreview.length} puestos):</p>
                    
                    <div className="max-h-60 overflow-y-auto border border-border-dim rounded bg-bg-main/40 divide-y divide-[#202020]">
                      {importPreview.map((preview, idx) => (
                        <div key={idx} className="p-2.5 flex justify-between items-center text-[10px]">
                          <div className="flex flex-col">
                            <span className="font-black uppercase text-white">{preview.roleLabel}</span>
                            <span className="text-[8px] text-text-dim uppercase mt-0.5 font-bold">
                              Turno: {preview.shift} • Hs Jornada: {preview.hoursPerDay}h • Valor Hora aproximado: ${preview.hourlyRate.toLocaleString('es-AR', {maximumFractionDigits: 0})}/h
                            </span>
                          </div>
                          <div className="text-right font-mono">
                            <span className="text-brand-500 font-black tracking-tight">{preview.totalHours} HS</span>
                            <div className="text-[7.5px] text-text-dim uppercase font-black tracking-tighter mt-0.5">horas totales / mes</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end gap-3 pt-3 border-t border-border-dim">
                      <button 
                        onClick={() => setImportPreview(null)}
                        className="text-[10px] font-black uppercase text-text-dim hover:text-text-main border border-border-dim bg-bg-main px-4 py-2 rounded-lg"
                      >
                        Atrás / Limpiar
                      </button>
                      <button 
                        onClick={handleConfirmImport}
                        className="text-[10px] font-black uppercase bg-brand-500 hover:bg-brand-600 text-black px-4 py-2 rounded-lg"
                      >
                        Confirmar e Importar {importPreview.length} Puestos
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Standard warning notice below */}
      <div className="p-4.5 bg-orange-500/5 border border-orange-500/15 rounded-lg flex items-start gap-3 shadow-sm">
        <AlertCircle size={18} className="text-orange-500 shrink-0 mt-0.5" />
        <p className="text-[10px] text-orange-500/90 font-bold uppercase tracking-tight leading-relaxed">
          Atención: Asegúrate de guardar los cambios haciendo click en el botón "Guardar Todo el Mes". Cada cambio de personal programado por día se integrará de inmediato para los reportes de control operacional e informes financieros de Gerencia.
        </p>
      </div>
    </motion.div>
  );
}
