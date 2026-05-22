/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Clock, 
  DollarSign, 
  Save, 
  AlertCircle, 
  Calendar, 
  Plus, 
  Trash2, 
  UserPlus, 
  X, 
  FileSpreadsheet, 
  FileText,
  Loader2,
  CheckCircle2,
  Lock,
  ArrowRight
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';
import { supabase } from '../lib/supabase';

interface Employee {
  id: string;
  name: string;
  position: string;
  hourly_rate: number;
}

interface HourRecord {
  id: string;
  branchId: string;
  employeeName: string;
  date: string;       // e.g. "2026-05-22"
  dayName: string;    // e.g. "Viernes"
  monthName: string;  // e.g. "Mayo"
  monthKey: string;   // e.g. "2026-05"
  weekNum: number;    // e.g. 4
  roleId: string;     // e.g. "cocinero"
  rate: number;       // fetched from Maestro de Personal
  hours: number;
  confirmed: boolean;
}

const ROLES = [
  { id: 'encargado', label: 'Encargado', defaultRate: 5000 },
  { id: 'caja', label: 'Caja', defaultRate: 2500 },
  { id: 'runners', label: 'Runners', defaultRate: 2200 },
  { id: 'mozos', label: 'Mozos', defaultRate: 2200 },
  { id: 'barra', label: 'Barra', defaultRate: 2800 },
  { id: 'jefe_cocina', label: 'Jefe de Cocina', defaultRate: 4500 },
  { id: 'segundo_cocina', label: 'Segundo de Cocina', defaultRate: 3800 },
  { id: 'cocinero', label: 'Cocinero', defaultRate: 3200 },
  { id: 'bacha', label: 'Bacha', defaultRate: 2000 },
];

// Helper to look up latest rate from Maestro de Personal
function getPositionRateFromMaestro(roleId: string, roleLabel: string): number {
  const saved = localStorage.getItem('craft_salary_positions');
  if (saved) {
    try {
      const positions = JSON.parse(saved);
      // Find hourly positions only
      const hourlyPositions = positions.filter((p: any) => p.type === 'hourly');
      
      // 1. Try exact title match
      const exactTitle = hourlyPositions.find((p: any) => p.title.toLowerCase().trim() === roleLabel.toLowerCase().trim());
      if (exactTitle) return exactTitle.baseValue;

      // 2. Try partial match
      const approx = hourlyPositions.find((p: any) => p.title.toLowerCase().includes(roleLabel.toLowerCase()) || roleLabel.toLowerCase().includes(p.title.toLowerCase()));
      if (approx) return approx.baseValue;

      // 3. Synonym matching
      const synonyms: Record<string, string[]> = {
        bacha: ['bacha', 'bachero', 'limpieza', 'lavavajillas', 'bachero a', 'bachero b'],
        cocinero: ['cocinero', 'cocina', 'prueba cocinero', 'cocinero a', 'cocinero b'],
        jefe_cocina: ['lider de cocina', 'jefe de cocina', 'jefe cocina'],
        segundo_cocina: ['segundo cocina', 'segundo de cocina'],
        mozos: ['mozo', 'mozos', 'mozo salon'],
        barra: ['bartender', 'barra'],
        runners: ['runner', 'runners'],
        caja: ['cajero', 'caja'],
        encargado: ['encargado', 'sub-encargado', 'gerente']
      };

      const searchTerms = synonyms[roleId] || [];
      const synonymMatch = hourlyPositions.find((p: any) => {
        const titleLower = p.title.toLowerCase();
        return searchTerms.some((term: string) => titleLower.includes(term) || term.includes(titleLower));
      });
      if (synonymMatch) return synonymMatch.baseValue;

    } catch (e) {
      console.error('Error parsing salary positions', e);
    }
  }

  // Fallback to default ROLES
  const role = ROLES.find(r => r.id === roleId);
  return role ? role.defaultRate : 2500;
}

interface SearchableEmployeeSelectProps {
  value: string;
  onChange: (val: string) => void;
  staffPool: Array<{ id: string; name: string; position: string; hourly_rate: number }>;
  disabled?: boolean;
}

export function SearchableEmployeeSelect({ value, onChange, staffPool, disabled }: SearchableEmployeeSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredStaff = staffPool.filter(staff => 
    staff.name.toUpperCase().includes(search.toUpperCase())
  );

  return (
    <div className="relative w-full" ref={containerRef}>
      <button 
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            setSearch('');
          }
        }}
        className={cn(
          "w-full bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-bold text-left text-text-main outline-none focus:border-brand-500 uppercase flex items-center justify-between cursor-pointer select-none h-9 min-w-[200px]",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span>{value || "SELECCIONAR PERSONA..."}</span>
        <span className="text-text-dim text-[8px] ml-2">▼</span>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1 w-full min-w-[220px] bg-bg-card border border-border-dim rounded shadow-2xl z-55 max-h-60 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-border-dim bg-bg-accent/40 flex items-center">
            <input 
              type="text"
              placeholder="Buscar por nombre o apellido..."
              autoFocus
              className="w-full bg-bg-card border border-border-dim/60 rounded px-2.5 py-1.5 text-[10px] font-semibold text-text-main outline-none focus:border-brand-500 uppercase"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onClick={e => e.stopPropagation()}
            />
          </div>
          <div className="overflow-y-auto flex-1 divide-y divide-border-dim/30">
            {filteredStaff.length === 0 ? (
              <div className="px-4 py-3 text-[10px] text-text-dim font-bold uppercase text-center">
                Sin resultados
              </div>
            ) : (
              filteredStaff.map(staff => (
                <div
                  key={staff.id}
                  onClick={() => {
                    onChange(staff.name);
                    setIsOpen(false);
                  }}
                  className="px-4 py-2 text-[10.5px] font-bold text-text-main hover:bg-brand-500 hover:text-black cursor-pointer transition-colors uppercase font-sans flex justify-between items-center"
                >
                  <span>{staff.name}</span>
                  <span className="text-[9px] opacity-75 uppercase bg-black/10 px-1.5 py-0.5 rounded font-mono text-text-dim">
                    {staff.position.toUpperCase()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function HourControlView({ selectedBranchId, branches }: { selectedBranchId: string, branches: Branch[] }) {
  const activeBranch = branches.find(b => b.id === selectedBranchId);
  const [selectedDate, setSelectedDate] = useState('2026-05-22'); // May 22, 2026 default
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('GUARDADO');
  
  // Staff Pool
  const [staffPool, setStaffPool] = useState<Employee[]>([]);
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', position: 'mozos', rate: 2200 });

  // Table Data
  const [records, setRecords] = useState<HourRecord[]>([]);

  // Derived Values
  const getDayNameInSpanish = (dateStr: string) => {
    const dateObj = new Date(dateStr + 'T00:00:00');
    const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
    return days[dateObj.getDay()];
  };

  const getMonthValues = (dateStr: string) => {
    const dateObj = new Date(dateStr + 'T00:00:00');
    const months = [
      'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO',
      'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'
    ];
    return {
      monthName: months[dateObj.getMonth()],
      monthKey: `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}`,
      dayNum: dateObj.getDate()
    };
  };

  const getWeekFromDate = (dateStr: string): number => {
    const dateObj = new Date(dateStr + 'T00:00:00');
    const day = dateObj.getDate();
    if (day >= 1 && day <= 7) return 1;
    if (day >= 8 && day <= 14) return 2;
    if (day >= 15 && day <= 21) return 3;
    return 4;
  };

  const dayName = getDayNameInSpanish(selectedDate);
  const { monthName, monthKey } = getMonthValues(selectedDate);
  const weekNum = getWeekFromDate(selectedDate);

  // Fetch employees
  useEffect(() => {
    const fetchEmployees = async () => {
      const branchIdToFetch = selectedBranchId === 'all' ? '1' : selectedBranchId;
      try {
        const { data } = await supabase
          .from('employees')
          .select('*')
          .eq('branch_id', branchIdToFetch)
          .eq('is_active', true);
        
        if (data && data.length > 0) {
          const mapped = data.map(e => ({
            id: e.id,
            name: e.name,
            position: e.position,
            hourly_rate: getPositionRateFromMaestro(e.position, ROLES.find(r => r.id === e.position)?.label || e.position)
          }));
          setStaffPool(mapped);
          localStorage.setItem(`staff_pool_${branchIdToFetch}`, JSON.stringify(mapped));
          return;
        }
      } catch (err) {
        console.error('Supabase query failed', err);
      }

      // Offline Fallback
      const savedStaff = localStorage.getItem(`staff_pool_${branchIdToFetch}`);
      if (savedStaff) {
        setStaffPool(JSON.parse(savedStaff));
      } else {
        const fallbackTeam = [
          { id: 'emp1', name: 'JUAN PEREZ', position: 'cocinero', hourly_rate: 3200 },
          { id: 'emp2', name: 'MARIA GOMEZ', position: 'mozos', hourly_rate: 2800 },
          { id: 'emp3', name: 'CARLOS LOPEZ', position: 'jefe_cocina', hourly_rate: 4500 },
          { id: 'emp4', name: 'ANTONIA DIAZ', position: 'bacha', hourly_rate: 2000 },
          { id: 'emp5', name: 'PEDRO SANCHEZ', position: 'caja', hourly_rate: 2500 }
        ];
        setStaffPool(fallbackTeam);
        localStorage.setItem(`staff_pool_${branchIdToFetch}`, JSON.stringify(fallbackTeam));
      }
    };
    fetchEmployees();
  }, [selectedBranchId]);

  // Fetch records
  useEffect(() => {
    const fetchRecords = () => {
      const branchIdToFetch = selectedBranchId === 'all' ? '1' : selectedBranchId;
      setLoading(true);

      const savedStr = localStorage.getItem('craft_branch_daily_hours') || '[]';
      let allLogs: HourRecord[] = [];
      try {
        allLogs = JSON.parse(savedStr);
      } catch (e) {
        console.error(e);
      }

      // Filter for this branch & selectedDate
      const activeLogs = allLogs.filter(log => log.branchId === branchIdToFetch && log.date === selectedDate);
      
      if (activeLogs.length > 0) {
        // Resolve rates dynamically in case we updated Maestro de personal!
        const resolved = activeLogs.map(log => {
          const roleLabel = ROLES.find(r => r.id === log.roleId)?.label || log.roleId;
          const currentRate = getPositionRateFromMaestro(log.roleId, roleLabel);
          return {
            ...log,
            rate: currentRate
          };
        });
        setRecords(resolved);
      } else {
        // Automatically default with active employees for this branch to save input time!
        const defaults = staffPool.map(emp => {
          const roleLabel = ROLES.find(r => r.id === emp.position)?.label || emp.position;
          const currentRate = getPositionRateFromMaestro(emp.position, roleLabel);
          return {
            id: `daily-${emp.id}-${selectedDate}`,
            branchId: branchIdToFetch,
            employeeName: emp.name,
            date: selectedDate,
            dayName,
            monthName,
            monthKey,
            weekNum,
            roleId: emp.position,
            rate: currentRate,
            hours: 0,
            confirmed: false
          };
        });
        setRecords(defaults);
      }

      setLoading(false);
    };

    fetchRecords();
  }, [selectedBranchId, selectedDate, staffPool]);

  // Sync state for new employee rate display
  useEffect(() => {
    const rate = getPositionRateFromMaestro(newStaff.position, ROLES.find(r => r.id === newStaff.position)?.label || newStaff.position);
    setNewStaff(prev => ({ ...prev, rate }));
  }, [newStaff.position]);

  const handleManagementAddStaff = async () => {
    if (!newStaff.name.trim()) return;
    const nameUpper = newStaff.name.trim().toUpperCase();
    const resolvedRate = getPositionRateFromMaestro(newStaff.position, ROLES.find(r => r.id === newStaff.position)?.label || newStaff.position);
    const branchIdToFetch = selectedBranchId === 'all' ? '1' : selectedBranchId;

    let newEmp = {
      id: `emp-${Math.random().toString(36).substr(2, 9)}`,
      name: nameUpper,
      position: newStaff.position,
      hourly_rate: resolvedRate
    };

    try {
      const { data } = await supabase
        .from('employees')
        .insert({
          branch_id: branchIdToFetch,
          name: nameUpper,
          position: newStaff.position,
          hourly_rate: resolvedRate
        })
        .select()
        .single();

      if (data) {
        newEmp = {
          id: data.id,
          name: data.name,
          position: data.position,
          hourly_rate: data.hourly_rate
        };
      }
    } catch (e) {
      console.error('Supabase insert failed, continuing locally', e);
    }

    const updatedPool = [...staffPool, newEmp];
    setStaffPool(updatedPool);
    localStorage.setItem(`staff_pool_${branchIdToFetch}`, JSON.stringify(updatedPool));
    setNewStaff({ name: '', position: 'mozos', rate: 2200 });
  };

  const handleAddRow = () => {
    const branchIdToUse = selectedBranchId === 'all' ? '1' : selectedBranchId;
    const newRecord: HourRecord = {
      id: `temp-${Math.random().toString(36).substr(2, 9)}`,
      branchId: branchIdToUse,
      employeeName: '',
      date: selectedDate,
      dayName,
      monthName,
      monthKey,
      weekNum,
      roleId: 'mozos',
      rate: getPositionRateFromMaestro('mozos', 'Mozos'),
      hours: 0,
      confirmed: false
    };
    setRecords([...records, newRecord]);
  };

  const handleRemoveRow = (id: string) => {
    setRecords(records.filter(r => r.id !== id));
    
    // Remove from localStorage array
    const savedStr = localStorage.getItem('craft_branch_daily_hours') || '[]';
    try {
      const allLogs = JSON.parse(savedStr);
      const filtered = allLogs.filter((log: any) => log.id !== id);
      localStorage.setItem('craft_branch_daily_hours', JSON.stringify(filtered));
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateRecord = (id: string, field: keyof HourRecord, value: any) => {
    setRecords(prev => prev.map(r => {
      if (r.id === id) {
        const updated = { ...r, [field]: value };
        if (field === 'employeeName') {
          const emp = staffPool.find(e => e.name === value);
          if (emp) {
            updated.roleId = emp.position;
            const roleLabel = ROLES.find(rol => rol.id === emp.position)?.label || emp.position;
            updated.rate = getPositionRateFromMaestro(emp.position, roleLabel);
          }
        }
        return updated;
      }
      return r;
    }));
  };

  // Helper to save a draft (local only, does not affect HR)
  const saveDraft = () => {
    setSaving(true);
    setSaveSuccess(false);

    const branchIdToUse = selectedBranchId === 'all' ? '1' : selectedBranchId;
    const validRecords = records.filter(r => r.employeeName);
    
    const draftRecords = validRecords.map(r => ({
      ...r,
      branchId: branchIdToUse,
      date: selectedDate,
      dayName,
      monthName,
      monthKey,
      weekNum,
      confirmed: false
    }));

    setRecords(draftRecords);

    // Save to master array in localStorage
    const savedStr = localStorage.getItem('craft_branch_daily_hours') || '[]';
    let allLogs: HourRecord[] = [];
    try {
      allLogs = JSON.parse(savedStr);
    } catch (e) {
      console.error(e);
    }

    const otherLogs = allLogs.filter(log => !(log.branchId === branchIdToUse && log.date === selectedDate));
    const mergedLogs = [...otherLogs, ...draftRecords];
    localStorage.setItem('craft_branch_daily_hours', JSON.stringify(mergedLogs));

    setSuccessMsg('BORRADOR GUARDADO');
    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  // Helper to confirm and push to Resources Humanos Control Board
  const confirmDay = () => {
    setSaving(true);
    setSaveSuccess(false);

    const branchIdToUse = selectedBranchId === 'all' ? '1' : selectedBranchId;
    const validRecords = records.filter(r => r.employeeName);
    
    // Set all as confirmed = true
    const confirmedRecords = validRecords.map(r => ({
      ...r,
      branchId: branchIdToUse,
      date: selectedDate,
      dayName,
      monthName,
      monthKey,
      weekNum,
      confirmed: true
    }));

    setRecords(confirmedRecords);

    // Save logs to master store
    const savedStr = localStorage.getItem('craft_branch_daily_hours') || '[]';
    let allLogs: HourRecord[] = [];
    try {
      allLogs = JSON.parse(savedStr);
    } catch (e) {
      console.error(e);
    }

    // Filter out old records for the same branch and date
    const otherLogs = allLogs.filter(log => !(log.branchId === branchIdToUse && log.date === selectedDate));
    const mergedLogs = [...otherLogs, ...confirmedRecords];
    localStorage.setItem('craft_branch_daily_hours', JSON.stringify(mergedLogs));

    // Async post to Supabase database as persistent backup
    const saveToSupabase = async () => {
      for (const r of confirmedRecords) {
        const dbData = {
          branch_id: branchIdToUse,
          employee_name: r.employeeName,
          position: r.roleId,
          date: r.date,
          hours_actual: r.hours
        };
        try {
          const { data } = await supabase
            .from('hour_logs')
            .select('id')
            .eq('branch_id', branchIdToUse)
            .eq('employee_name', r.employeeName)
            .eq('date', r.date)
            .maybeSingle();

          if (data) {
            await supabase.from('hour_logs').update(dbData).eq('id', data.id);
          } else {
            await supabase.from('hour_logs').insert(dbData);
          }
        } catch (err) {
          console.error('Postgres backup error', err);
        }
      }
    };
    saveToSupabase();

    // Sum hours by position/roleId for the entire active week (across all days of this week)
    const weekConfirmedLogs = mergedLogs.filter(log => 
      log.branchId === branchIdToUse && 
      log.monthKey === monthKey && 
      log.weekNum === weekNum && 
      log.confirmed === true
    );

    const totalsByRole: Record<string, number> = {};
    weekConfirmedLogs.forEach(log => {
      totalsByRole[log.roleId] = (totalsByRole[log.roleId] || 0) + (log.hours || 0);
    });

    // Write aggregated totals straight into HR Control Board Local Storage key so they sync live!
    const hrStorageKey = `hr_hours_${branchIdToUse}_${monthKey}_w${weekNum}`;
    const existingHrStr = localStorage.getItem(hrStorageKey);
    let existingHrRecords: any[] = [];
    try {
      if (existingHrStr) existingHrRecords = JSON.parse(existingHrStr);
    } catch (e) {
      console.error(e);
    }

    const defaultPositions = [
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

    const updatedHrRecords = defaultPositions.map(pos => {
      const existing = existingHrRecords.find(r => r.roleId === pos.id);
      const confirmedSum = totalsByRole[pos.id] || 0;

      return {
        id: pos.id,
        roleId: pos.id,
        roleLabel: pos.label,
        referenceHours: pos.refHours,
        definitiveHours: confirmedSum, 
        status: existing?.status || 'pending',
        notes: existing?.notes || ''
      };
    });

    localStorage.setItem(hrStorageKey, JSON.stringify(updatedHrRecords));
    localStorage.setItem(`hr_week_confirmed_by_branch_${branchIdToUse}_${monthKey}_w${weekNum}`, 'true');

    setSuccessMsg('¡JORNADA DÍA CONFIRMADA & ENVIADA A RRHH!');
    setSaving(false);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 4000);
  };

  const calculateTotals = () => {
    return records.reduce((acc, r) => {
      return {
        hours: acc.hours + (r.hours || 0),
        pesos: acc.pesos + ((r.hours || 0) * r.rate)
      };
    }, { hours: 0, pesos: 0 });
  };

  const totals = calculateTotals();
  const isDayConfirmed = records.length > 0 && records.some(r => r.confirmed === true);

  // Weekly benchmark stats
  const budgetPesosTotal = 2000000; 
  const weeklyBudgetPesos = budgetPesosTotal / 4;
  const weeklyDiff = totals.pesos - weeklyBudgetPesos;
  const isOverBudget = weeklyDiff > 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Top Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-bg-card border border-border-dim p-6 rounded-lg">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/10 p-3 text-brand-500 border border-brand-500/20 rounded-lg">
            <Clock size={28} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-text-main uppercase tracking-widest">
                Carga Diaria de Horas {activeBranch ? `• ${activeBranch.name}` : '(CONSOLIDADO)'}
              </h2>
              {isDayConfirmed && (
                <span className="text-[9px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20 rounded flex items-center gap-1">
                  <CheckCircle2 size={10} className="stroke-[3]" /> CONFIRMADO
                </span>
              )}
            </div>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest mt-1 opacity-80">
              Formulario de carga diaria por empleado - Integrado con Maestro de Personal
            </p>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5 mr-2">
            <button 
              className="flex items-center gap-2 px-3 py-2 bg-emerald-500/5 text-emerald-400 border border-emerald-500/20 rounded text-[9px] font-black uppercase tracking-wider hover:bg-emerald-500/10 transition-all font-mono"
              onClick={() => window.print()}
            >
              <FileSpreadsheet size={13} /> EXCEL
            </button>
            <button 
              className="flex items-center gap-2 px-3 py-2 bg-brand-500/10 text-brand-500 border border-brand-500/20 rounded text-[9px] font-black uppercase tracking-wider hover:bg-brand-500/20 transition-all font-sans"
              onClick={() => window.print()}
            >
              <FileText size={13} /> PDF
            </button>
          </div>
          
          <button 
            onClick={() => setShowAddStaff(true)}
            className="px-4 py-2 border border-border-dim bg-bg-accent hover:border-brand-500 rounded text-[9px] font-black uppercase tracking-widest text-text-dim hover:text-brand-500 transition-all flex items-center gap-2"
          >
            <UserPlus size={13} /> GESTIONAR EQUIPO
          </button>

          {/* Core Feature: Calendar Control for Daily Logs */}
          <div className="bg-bg-sidebar border border-border-dim rounded p-2.5 px-4 flex items-center gap-3">
            <Calendar size={17} className="text-brand-500 animate-pulse" />
            <div className="flex flex-col">
              <span className="text-[8px] font-black text-text-dim uppercase leading-none mb-1">FECHA CARGA DIARIA</span>
              <input 
                type="date" 
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent border-none text-xs font-black font-mono text-text-main outline-none uppercase cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Date detail indicators */}
      <div className="bg-[#161616] border border-border-dim rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="px-3.5 py-1.5 bg-brand-500/10 text-brand-500 rounded font-black font-mono text-center">
            <p className="text-[8px] uppercase tracking-tighter text-text-dim">DÍA</p>
            <p className="text-sm font-black tracking-tight">{selectedDate.split('-')[2]}</p>
          </div>
          <div>
            <p className="text-[11px] font-black text-text-main uppercase tracking-widest flex items-center gap-2 font-sans">
              Planilla de asistencia del {dayName}
            </p>
            <p className="text-[8px] text-text-dim font-black uppercase tracking-widest mt-0.5">
              MES: <span className="text-brand-500">{monthName}</span> • PERÍODO: <span className="text-brand-500">SEMANA {weekNum}</span>
            </p>
          </div>
        </div>

        <div className="flex gap-4">
          <div className="bg-bg-accent/40 border border-border-dim/60 px-4 py-1.5 rounded text-center">
            <span className="text-[8px] font-black uppercase tracking-widest text-text-dim block">CONCILIADO EN RECURSOS HUMANOS</span>
            <span className="text-[10px] font-black font-mono text-text-main uppercase space-x-1">
              {isDayConfirmed ? (
                <span className="text-emerald-500">SÍ (PENDIENTE REVISIÓN)</span>
              ) : (
                <span className="text-amber-500">NO ENVIADO</span>
              )}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main interactive datasheet */}
        <div className="lg:col-span-3 bg-bg-sidebar border border-border-dim rounded overflow-hidden shadow-2xl relative min-h-[400px]">
          {loading && (
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] z-50 flex items-center justify-center">
              <Loader2 className="text-brand-500 animate-spin" size={32} />
            </div>
          )}
          <div className="p-4.5 border-b border-border-dim bg-bg-accent/20 flex justify-between items-center">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-[#8B949E] flex items-center gap-2">
              <Users size={12} className="text-brand-500" /> Registro Diario de Jornadas
            </h3>
            <button 
              onClick={handleAddRow}
              className="text-[10px] font-black uppercase text-brand-500 hover:text-brand-600 transition-all flex items-center gap-1.5 border border-brand-500/10 px-3 py-1 bg-brand-500/[0.02] rounded"
            >
              <Plus size={13} /> Agregar Integrante Extra
            </button>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-[#1C1C1C] border-b border-border-dim text-[10px] font-black uppercase text-text-dim tracking-widest">
                <tr>
                  <th className="px-6 py-4">Nombre y Apellido</th>
                  <th className="px-4 py-4 text-center">Fecha</th>
                  <th className="px-4 py-4 text-center">Día</th>
                  <th className="px-4 py-4 text-center">Mes</th>
                  <th className="px-4 py-4 text-center">Semana</th>
                  <th className="px-4 py-4 text-center">Puesto</th>
                  <th className="px-4 py-4 text-center">Valor Hora</th>
                  <th className="px-5 py-4 text-center">Horas Trabajadas</th>
                  <th className="px-6 py-4 text-right">Subtotal</th>
                  <th className="px-4 py-4 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim/40">
                <AnimatePresence mode="popLayout">
                  {records.map((r) => {
                    return (
                      <motion.tr 
                        key={r.id}
                        layout
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 10 }}
                        className={cn(
                          "hover:bg-bg-accent/50 transition-colors group",
                          r.confirmed && "bg-emerald-500/[0.01]"
                        )}
                      >
                        <td className="px-6 py-3.5">
                          <SearchableEmployeeSelect
                            value={r.employeeName}
                            onChange={(val) => handleUpdateRecord(r.id, 'employeeName', val)}
                            staffPool={staffPool}
                            disabled={r.confirmed}
                          />
                        </td>
                        
                        {/* Fecha Column */}
                        <td className="px-4 py-3.5 text-center text-text-dim font-mono text-[11px]">
                          {r.date.split('-').reverse().join('/')}
                        </td>

                        {/* Dia Column */}
                        <td className="px-4 py-3.5 text-center text-text-main font-bold uppercase text-[10px]">
                          {r.dayName}
                        </td>

                        {/* Mes Column */}
                        <td className="px-4 py-3.5 text-center text-text-dim uppercase text-[10px]">
                          {r.monthName}
                        </td>

                        {/* Semana Column */}
                        <td className="px-4 py-3.5 text-center">
                          <span className="px-2 py-0.5 rounded bg-brand-500/10 text-brand-500 font-bold uppercase text-[9px]">
                            Semana {r.weekNum}
                          </span>
                        </td>

                        {/* Puesto Column */}
                        <td className="px-4 py-3.5 text-center">
                          <span className="px-2 py-0.5 rounded bg-bg-accent border border-border-dim text-text-dim font-bold uppercase text-[9px]">
                            {ROLES.find(rol => rol.id === r.roleId)?.label || r.roleId}
                          </span>
                        </td>

                        {/* Valor Hora Column - Read Only from Maestro de Personal */}
                        <td className="px-4 py-3.5 text-center text-text-dim font-mono text-[11px] font-black relative group-hover:text-text-main">
                          <div className="flex items-center justify-center gap-1">
                            <Lock size={10} className="opacity-40" />
                            <span>${r.rate.toLocaleString('es-AR')}</span>
                          </div>
                        </td>

                        {/* Horas Trabajadas Column */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-center gap-1.5">
                            <button 
                              onClick={() => handleUpdateRecord(r.id, 'hours', Math.max(0, (r.hours || 0) - 1))}
                              className="w-5 h-5 rounded bg-bg-accent border border-border-dim hover:border-text-dim/50 text-text-dim hover:text-text-main flex items-center justify-center font-bold text-xs"
                              disabled={r.confirmed}
                            >
                              -
                            </button>
                            <input 
                              type="number"
                              value={r.hours || ''}
                              onChange={(e) => handleUpdateRecord(r.id, 'hours', parseFloat(e.target.value) || 0)}
                              className="w-16 bg-bg-accent border border-border-dim rounded py-1 px-1.5 text-center text-text-main font-mono text-[11.5px] font-bold outline-none focus:border-brand-500 disabled:opacity-50"
                              placeholder="0"
                              min="0"
                              max="24"
                              step="0.5"
                              disabled={r.confirmed}
                            />
                            <button 
                              onClick={() => handleUpdateRecord(r.id, 'hours', (r.hours || 0) + 1)}
                              className="w-5 h-5 rounded bg-bg-accent border border-border-dim hover:border-text-dim/50 text-text-dim hover:text-text-main flex items-center justify-center font-bold text-xs"
                              disabled={r.confirmed}
                            >
                              +
                            </button>
                          </div>
                        </td>

                        {/* Subtotal Column */}
                        <td className="px-6 py-3.5 text-right font-mono font-bold text-brand-500">
                          ${((r.hours || 0) * r.rate).toLocaleString('es-AR')}
                        </td>

                        <td className="px-4 py-3.5 text-center">
                          <button 
                            onClick={() => handleRemoveRow(r.id)}
                            className="text-text-dim hover:text-red-500 transition-colors p-1"
                            title="Eliminar registro"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
              <tfoot>
                <tr className="bg-bg-accent/40 text-white font-mono border-t border-border-dim font-bold">
                  <td colSpan={2} className="px-6 py-4 uppercase text-text-dim text-[10px] font-black">Totales de Asistencia Diaria</td>
                  <td colSpan={5}></td>
                  <td className="px-5 py-4 text-center text-brand-500 font-black">{totals.hours.toFixed(1)}h</td>
                  <td className="px-6 py-4 text-right text-base font-black text-brand-500" colSpan={2}>
                    ${totals.pesos.toLocaleString('es-AR')}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          {!loading && records.length === 0 && (
            <div className="py-16 flex flex-col items-center justify-center text-text-dim opacity-30">
              <Clock size={48} />
              <p className="mt-4 text-[10px] font-black uppercase tracking-widest">Ingrese integrantes para comenzar</p>
            </div>
          )}
        </div>

        {/* Sidebar benchmarking */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-bg-sidebar border border-brand-500/10 rounded-lg p-6 relative overflow-hidden group">
             <div className="absolute top-0 right-0 p-4 opacity-5">
                <DollarSign size={60} className="text-brand-500" />
             </div>
             <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#8B949E] mb-4">Métricas Consolidadas de la jornada</h4>
             
             <div className="space-y-4">
                <div>
                  <p className="text-[9px] text-text-dim uppercase font-bold opacity-60">Horas Totales del Día</p>
                  <p className="text-2xl font-mono font-black text-brand-500 leading-tight">{totals.hours.toFixed(1)}h</p>
                </div>
                
                <div>
                  <p className="text-[9px] text-text-dim uppercase font-bold opacity-60">Costo Estimado Devengado</p>
                  <p className="text-xl font-mono font-bold text-text-main leading-tight">${totals.pesos.toLocaleString('es-AR')}</p>
                </div>

                <div className="pt-4 border-t border-border-dim space-y-2">
                  <p className="text-[8px] text-brand-500 uppercase font-black tracking-widest">Integridad en Tiempo Real</p>
                  <div className="bg-bg-accent/40 rounded p-2.5 border border-border-dim/20 text-[10px] text-text-dim leading-relaxed">
                    Las horas cargadas en este módulo alimentan de forma directa el control por puesto de Recursos Humanos agrupado por Semana Fiscal.
                  </div>
                </div>
             </div>
          </div>
        </div>
      </div>

      {/* Action Footer Button Group */}
      <div className="flex flex-col sm:flex-row items-center justify-between p-6 bg-bg-accent/80 border border-border-dim rounded-lg gap-4">
        <div className="flex items-center gap-3 text-text-dim">
          <AlertCircle size={20} className="text-brand-500 shrink-0" />
          <p className="text-[10px] font-bold uppercase tracking-wide italic text-left leading-relaxed">
            Una vez finalizada la asistencia del día, use el botón de confirmar. Esto exportará y sincronizará de forma directa con la planilla RRHH.
          </p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto justify-end">
          <AnimatePresence>
            {saveSuccess && (
              <motion.span 
                initial={{ opacity: 0, x: 5 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="text-[10px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-3.5 py-3 border border-emerald-500/20 rounded flex items-center gap-1.5"
              >
                <CheckCircle2 size={12} className="stroke-[3]" /> {successMsg}
              </motion.span>
            )}
          </AnimatePresence>

          <button 
            onClick={saveDraft}
            disabled={saving || loading}
            className="w-full sm:w-auto px-5 py-3.5 bg-bg-sidebar border border-border-dim text-[10px] font-black uppercase text-text-main hover:bg-bg-accent transition-all rounded tracking-widest flex items-center justify-center gap-2"
          >
            GUARDAR BORRADOR
          </button>

          <button 
            onClick={confirmDay}
            disabled={saving || loading}
            className={cn(
              "w-full sm:w-auto bg-brand-500 hover:bg-brand-600 text-black px-7 py-3.5 rounded text-[10px] font-extrabold uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-500/10",
              (saving || loading) && "opacity-50 cursor-not-allowed",
              isDayConfirmed && "bg-emerald-500 text-white hover:bg-emerald-600"
            )}
          >
            {saving ? (
              <Loader2 size={15} className="animate-spin" />
            ) : isDayConfirmed ? (
              <CheckCircle2 size={15} className="stroke-[3]" />
            ) : (
              <ArrowRight size={15} className="stroke-[2.5]" />
            )} 
            {isDayConfirmed ? 'CONFIRMACIÓN ENVIADA 🚀' : 'CONFIRMAR DÍA & ENVIAR A RRHH'}
          </button>
        </div>
      </div>

      {/* Staff pool management modal */}
      <AnimatePresence>
        {showAddStaff && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddStaff(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-bg-card border border-border-dim rounded-lg shadow-2xl p-6"
            >
              <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest mb-6 border-l-2 border-brand-500 pl-4">Gestión de Personal</h3>
              
              <div className="space-y-4">
                <div className="space-y-4 bg-bg-accent p-4 rounded border border-border-dim">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-text-dim uppercase">Nombre y Apellido</label>
                    <input 
                      type="text" 
                      placeholder="INGRESE EL NOMBRE Y APELLIDO..."
                      className="w-full bg-bg-card border border-border-dim rounded px-4 py-2 text-xs text-text-main outline-none focus:border-brand-500 uppercase font-bold"
                      value={newStaff.name}
                      onChange={e => setNewStaff({...newStaff, name: e.target.value})}
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-text-dim uppercase">Puesto</label>
                      <select 
                        className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-xs text-text-main outline-none"
                        value={newStaff.position}
                        onChange={e => setNewStaff({...newStaff, position: e.target.value})}
                      >
                        {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </div>
                    
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-text-dim uppercase flex items-center gap-1">
                        <Lock size={10} className="opacity-40" /> Valor Hora (Maestro)
                      </label>
                      <input 
                        type="text" 
                        className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-xs text-text-dim outline-none font-mono font-bold"
                        value={`$${newStaff.rate.toLocaleString('es-AR')}`}
                        disabled
                      />
                    </div>
                  </div>
                  
                  <button 
                    onClick={handleManagementAddStaff}
                    className="w-full bg-brand-500 text-black py-3 rounded text-xs font-black uppercase tracking-widest hover:bg-brand-600 transition-all font-sans"
                  >
                    AGREGAR AL EQUIPO DESDE EL MAESTRO
                  </button>
                </div>

                <div className="space-y-2 pt-4">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Personal Registrado ({staffPool.length})</label>
                  <div className="max-h-48 overflow-y-auto bg-bg-accent rounded border border-border-dim p-2 space-y-1 custom-scrollbar">
                    {staffPool.map(staff => (
                      <div key={staff.id} className="flex justify-between items-center p-2 hover:bg-bg-card rounded group border border-transparent hover:border-border-dim/55">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-text-main">{staff.name}</span>
                          <span className="text-[8px] text-text-dim uppercase">{ROLES.find(r => r.id === staff.position)?.label || staff.position} • Hourly: ${staff.hourly_rate.toLocaleString('es-AR')}</span>
                        </div>
                        <button 
                          onClick={async () => {
                            await supabase.from('employees').delete().eq('id', staff.id);
                            setStaffPool(staffPool.filter(s => s.id !== staff.id));
                          }}
                          className="text-text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <button 
                  onClick={() => setShowAddStaff(false)}
                  className="w-full py-4 rounded border border-border-dim text-text-dim text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
