/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Clock, 
  Users, 
  User, 
  Info, 
  MapPin, 
  Calendar, 
  Coffee, 
  TrendingUp, 
  ListOrdered
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Branch } from '../types';

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
  staffByDate?: Record<string, number>;
}

const JS_DAY_MAPPING = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function getWeeksForMonth(yearMonth: string) {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr) || 2026;
  const month = (parseInt(monthStr) || 5) - 1; 
  
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  
  let startOfWeek = new Date(firstDayOfMonth);
  let dayOfWeek = startOfWeek.getDay(); 
  
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

export default function ReadOnlyPlantaView({ 
  selectedBranchId, 
  branches, 
  selectedMonth 
}: { 
  selectedBranchId: string; 
  branches: Branch[]; 
  selectedMonth: string;
}) {
  const localBranchId = selectedBranchId === 'all' ? (branches[0]?.id || 'bn') : selectedBranchId;
  const activeBranch = branches.find(b => b.id === localBranchId) || branches[0];

  const [rows, setRows] = useState<BudgetRow[]>([]);
  const [holidaysList, setHolidaysList] = useState<string[]>([]);
  const [mapShift, setMapShift] = useState<'Mañana' | 'Tarde'>('Mañana');
  
  // Selected date on the map view
  const [mapDateStr, setMapDateStr] = useState<string>('');
  const [selectedRoom, setSelectedRoom] = useState<string>('cocina');
  const [hoveredRoom, setHoveredRoom] = useState<string | null>(null);

  const weeks = useMemo(() => {
    return getWeeksForMonth(selectedMonth);
  }, [selectedMonth]);

  // Load saved holidays globally and branch budget data
  useEffect(() => {
    const branchIdKey = localBranchId === 'all' ? '1' : localBranchId;
    const storageKeyV2 = `hour_budget_v2_${branchIdKey}_${selectedMonth}`;
    const savedV2 = localStorage.getItem(storageKeyV2);
    
    // Global holiday loading
    const globalHolidaysKey = `hour_budget_holidays_${selectedMonth}`;
    const savedGlobalHolidays = localStorage.getItem(globalHolidaysKey);
    let resolvedHolidays: string[] = [];
    
    if (savedGlobalHolidays) {
      try {
        resolvedHolidays = JSON.parse(savedGlobalHolidays);
      } catch (e) {
        console.error('Error parsing global holidays:', e);
      }
    }

    if (savedV2) {
      try {
        const parsed = JSON.parse(savedV2);
        if (parsed.rows) {
          setRows(parsed.rows);
        } else {
          setRows([]);
        }
        
        // If there were holidays in this specific branch but none globally, fallback/sync
        if (!savedGlobalHolidays && parsed.holidaysList && Array.isArray(parsed.holidaysList)) {
          resolvedHolidays = parsed.holidaysList;
        }
      } catch (e) {
        console.error('Error parsing budget V2:', e);
      }
    } else {
      setRows([]);
    }

    setHolidaysList(resolvedHolidays);
  }, [localBranchId, selectedMonth]);

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
    const sorted = daysList.sort((a, b) => a.dateStr.localeCompare(b.dateStr));
    
    // Set default selected date to the first day of the month if not set or out of range
    if (sorted.length > 0 && (!mapDateStr || !sorted.some(d => d.dateStr === mapDateStr))) {
      setMapDateStr(sorted[0].dateStr);
    }
    return sorted;
  }, [weeks, holidaysList, mapDateStr]);

  const activeDayName = useMemo(() => {
    const found = activeMonthDays.find(d => d.dateStr === mapDateStr);
    return found ? found.dayName : 'Lunes';
  }, [activeMonthDays, mapDateStr]);

  const getHeadcount = (row: BudgetRow, dateStr: string, dayName: string) => {
    if (row.staffByDate?.[dateStr] !== undefined) {
      return row.staffByDate[dateStr];
    }
    return ['Viernes', 'Sábado'].includes(dayName) ? row.countGroupB : row.countGroupA;
  };

  const mapData = useMemo(() => {
    const roomTotals: Record<string, number> = {
      cocina: 0,
      bacha: 0,
      barra: 0,
      caja: 0,
      salon: 0
    };

    const roomStaff: Record<string, Array<{ label: string; count: number }>> = {
      cocina: [],
      bacha: [],
      barra: [],
      caja: [],
      salon: []
    };

    let totalActiveStaff = 0;

    rows.forEach(row => {
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
            totalActiveStaff += headcount;
          }
        }
      }
    });

    const isHoliday = holidaysList.includes(mapDateStr);

    return {
      roomTotals,
      roomStaff,
      totalActiveStaff,
      isHoliday,
      activeDayName
    };
  }, [rows, mapShift, mapDateStr, activeMonthDays, holidaysList, activeDayName]);

  return (
    <div className="bg-bg-sidebar border border-border-dim rounded-lg shadow-xl p-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border-b border-border-dim pb-4 mb-5 gap-3">
        <div className="flex items-center gap-2">
          <MapPin size={18} className="text-brand-500 animate-bounce" />
          <div>
            <h3 className="text-xs font-black uppercase text-text-main tracking-wider flex items-center gap-2">
              Distribución de Planta <span className="text-brand-500 font-mono text-[9.5px]">({activeBranch?.name || 'Sucursal'})</span>
            </h3>
            <p className="text-[9px] text-text-dim uppercase font-bold mt-0.5">
              Auditoría visual de dotación presupuestada • SÓLO LECTURA
            </p>
          </div>
        </div>

        {/* Shift Filter (MAÑANA/TARDE) */}
        <div className="flex items-center gap-1.5 bg-bg-main p-1 rounded-lg border border-border-dim/40 self-start md:self-auto">
          <span className="text-[8.5px] font-black text-text-dim uppercase tracking-wider px-2">FILTRAR TURNO:</span>
          <button
            onClick={() => setMapShift('Mañana')}
            className={cn(
              "px-3 py-1 rounded-md text-[8.5px] font-black uppercase tracking-wider transition-all",
              mapShift === 'Mañana'
                ? "bg-brand-500 text-black font-black shadow"
                : "text-text-dim hover:text-text-main"
            )}
          >
            Mañana
          </button>
          <button
            onClick={() => setMapShift('Tarde')}
            className={cn(
              "px-3 py-1 rounded-md text-[8.5px] font-black uppercase tracking-wider transition-all",
              mapShift === 'Tarde'
                ? "bg-brand-500 text-black font-black shadow"
                : "text-text-dim hover:text-text-main"
            )}
          >
            Tarde
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-12 text-center bg-[#121212]/35 border border-dashed border-border-dim/60 rounded-xl space-y-2">
          <Calendar size={32} className="text-text-dim mx-auto" />
          <p className="text-xs font-bold text-text-main uppercase tracking-wider">No hay presupuesto de horas configurado</p>
          <p className="text-[10px] text-text-dim max-w-[400px] mx-auto uppercase">
            Para visualizar la planta, se debe cargar el presupuesto del mes de {selectedMonth} desde la herramienta de Líderes Operativos.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Day Pills horizontal selection Strip */}
          <div className="space-y-1.5">
            <span className="text-[9px] font-black uppercase text-brand-500 flex items-center gap-1 select-none">
              <Clock size={12} /> Selecciona el Día del Mes a Auditar:
            </span>
            <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-zinc-800">
              {activeMonthDays.map((day) => {
                const isSelected = mapDateStr === day.dateStr;
                return (
                  <button
                    key={day.dateStr}
                    onClick={() => setMapDateStr(day.dateStr)}
                    className={cn(
                      "flex flex-col items-center px-4 py-1.5 rounded border text-[9px] uppercase font-black shrink-0 transition-all min-w-[50px] cursor-pointer",
                      isSelected
                        ? "bg-brand-500 text-black border-brand-500 shadow scale-105"
                        : day.isHoliday
                          ? "bg-red-500/10 hover:bg-red-500/15 text-red-100 border-red-500/30"
                          : "bg-[#18181b]/60 hover:bg-bg-accent border-border-dim/50 text-text-main"
                    )}
                  >
                    <span className="text-[7.5px] opacity-75">{day.dayName.substring(0, 3)}</span>
                    <span className="text-xs font-black mt-0.5">{day.dayNumber}</span>
                    {day.isHoliday && <span className="text-[6.5px] text-red-500 font-extrabold mt-0.5">🚩 Feriado</span>}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            {/* Floor Map Layout */}
            <div className="xl:col-span-2 bg-[#0c0c0c] border border-border-dim/80 rounded-xl p-4 flex items-center justify-center relative overflow-hidden shadow-2xl h-[360px]">
              <svg className="w-full h-full" viewBox="0 0 600 350" fill="none">
                <defs>
                  <pattern id="dotGridMapReadOnly" width="20" height="20" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1" fill="#1f1f1f" />
                  </pattern>
                </defs>
                <rect width="600" height="350" fill="url(#dotGridMapReadOnly)" rx="10" />

                {/* AREA 1: COCINA PRINCIPAL */}
                <g 
                  onMouseEnter={() => setHoveredRoom('cocina')}
                  onMouseLeave={() => setHoveredRoom(null)}
                  onClick={() => setSelectedRoom('cocina')}
                  className="cursor-pointer group"
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
                  <text x="35" y="45" className="font-extrabold text-[9px] fill-[#8B949E] uppercase tracking-wider">
                    Cocina Principal
                  </text>
                </g>

                {/* AREA 2: BACHA / LAVADO */}
                <g 
                  onMouseEnter={() => setHoveredRoom('bacha')}
                  onMouseLeave={() => setHoveredRoom(null)}
                  onClick={() => setSelectedRoom('bacha')}
                  className="cursor-pointer group"
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
                  <text x="35" y="215" className="font-extrabold text-[9px] fill-[#8B949E] uppercase tracking-wider">
                    Bachas
                  </text>
                </g>

                {/* AREA 3: BAR / CAFETERIA */}
                <g 
                  onMouseEnter={() => setHoveredRoom('barra')}
                  onMouseLeave={() => setHoveredRoom(null)}
                  onClick={() => setSelectedRoom('barra')}
                  className="cursor-pointer group"
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
                  <text x="235" y="45" className="font-extrabold text-[9px] fill-[#8B949E] uppercase tracking-wider">
                    Barra
                  </text>
                </g>

                {/* AREA 4: CAJA Y MOSTRADOR */}
                <g 
                  onMouseEnter={() => setHoveredRoom('caja')}
                  onMouseLeave={() => setHoveredRoom(null)}
                  onClick={() => setSelectedRoom('caja')}
                  className="cursor-pointer group"
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
                  <text x="165" y="215" className="font-extrabold text-[9px] fill-[#8B949E] uppercase tracking-wider">
                    Caja / Front
                  </text>
                </g>

                {/* AREA 5: SALON / ACCESOS y TERRAZA */}
                <g 
                  onMouseEnter={() => setHoveredRoom('salon')}
                  onMouseLeave={() => setHoveredRoom(null)}
                  onClick={() => setSelectedRoom('salon')}
                  className="cursor-pointer group"
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
                  <text x="325" y="45" className="font-extrabold text-[9px] fill-[#8B949E] uppercase tracking-wider">
                    Salón Principal & Terraza
                  </text>
                </g>
              </svg>

              {/* Cocina Overlay */}
              <div className="absolute top-[55px] left-[40px] w-[145px] flex flex-col gap-1.5 pointer-events-none">
                <div className="flex flex-wrap gap-1">
                  {rows
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
                  {rows
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
                  {rows
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
                  {rows
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
                  {rows
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

            {/* Sidebar with Selected Room breakdown */}
            <div className="space-y-4">
              <div className="bg-bg-main border border-border-dim p-4 rounded-xl shadow-xl space-y-4 h-[360px] flex flex-col justify-between overflow-hidden">
                <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                  <div className="flex items-center justify-between border-b border-border-dimpb-2 pb-2">
                    <h4 className="text-[10px] font-black uppercase text-text-main tracking-widest flex items-center gap-1.5 select-none">
                      <ListOrdered size={12} className="text-[#C0C0C0]" /> Personal en {selectedRoom.toUpperCase()}
                    </h4>
                    <span className="font-mono text-[9px] font-bold bg-brand-500/10 text-brand-500 px-2 py-0.5 rounded">
                      {mapData.roomTotals[selectedRoom]?.toFixed(1) || 0} p
                    </span>
                  </div>

                  {mapData.isHoliday && (
                    <div className="bg-red-500/10 border border-red-500/20 p-2.5 rounded text-[8.5px] uppercase font-black tracking-wide text-red-400 flex items-center gap-1.5 select-none">
                      <span>🚩 Feriado Activado (Hora Doble para este Día)</span>
                    </div>
                  )}

                  <div className="space-y-2">
                    {(!mapData.roomStaff[selectedRoom] || mapData.roomStaff[selectedRoom].length === 0) ? (
                      <p className="text-[10px] text-text-dim/80 text-center py-10 uppercase italic font-bold">
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
                </div>

                <div className="text-[8.5px] uppercase font-bold text-text-dim border-t border-border-dim/40 pt-2 text-center select-none">
                  Total Personal Activo en Turno: <span className="text-brand-500 font-mono font-black">{mapData.totalActiveStaff}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
