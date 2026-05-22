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
  HelpCircle
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';

interface HrHourRecord {
  id: string;
  roleId: string;
  roleLabel: string;
  referenceHours: number; // Planned hours
  definitiveHours: number; // Actual hours verified by HR
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

export default function HrHourControlView({ branches }: { branches: Branch[] }) {
  const [selectedBranch, setSelectedBranch] = useState(branches[0]?.id || '1');
  const [selectedMonth, setSelectedMonth] = useState('2026-05'); // Default back to May 2026
  const [selectedWeek, setSelectedWeek] = useState<number>(1); // 1, 2, 3, or 4
  const [records, setRecords] = useState<HrHourRecord[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

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

  // Load records from local storage or set defaults when selectors change
  useEffect(() => {
    const storageKey = `hr_hours_${selectedBranch}_${selectedMonth}_w${selectedWeek}`;
    const saved = localStorage.getItem(storageKey);

    if (saved) {
      try {
        setRecords(JSON.parse(saved));
        return;
      } catch (e) {
        console.error('Error loading hours record from storage', e);
      }
    }

    // Default values if nothing is stored in local storage
    const defaults: HrHourRecord[] = POSITIONS.map(p => {
      // Add slight variance to reference hours to simulate actual logged hours
      const simulatedHours = selectedBranch === 'bn' 
        ? p.refHours 
        : Math.max(0, p.refHours + (selectedWeek % 2 === 0 ? 2 : -1.5));
        
      return {
        id: p.id,
        roleId: p.id,
        roleLabel: p.label,
        referenceHours: p.refHours,
        definitiveHours: simulatedHours,
        status: 'pending',
        notes: ''
      };
    });
    setRecords(defaults);
  }, [selectedBranch, selectedMonth, selectedWeek]);

  // Handle single record hours change
  const handleUpdateHours = (id: string, hours: number) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, definitiveHours: hours } : r));
  };

  // Handle single record notes change
  const handleUpdateNotes = (id: string, noteStr: string) => {
    setRecords(prev => prev.map(r => r.id === id ? { ...r, notes: noteStr } : r));
  };

  // Check off / verify single position
  const handleToggleVerify = (id: string) => {
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
    setRecords(prev => prev.map(r => ({ ...r, status: 'verified' })));
  };

  // Save changes to LocalStorage
  const handleSaveChanges = () => {
    const storageKey = `hr_hours_${selectedBranch}_${selectedMonth}_w${selectedWeek}`;
    localStorage.setItem(storageKey, JSON.stringify(records));
    
    // Also save simple log that this week is controlled
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
      <div className="flex flex-wrap justify-between items-end gap-4 bg-bg-card border border-border-dim p-6 rounded-lg">
        <div>
          <h2 className="text-xl font-black uppercase text-text-main tracking-widest flex items-center gap-2">
            <Clock className="text-brand-500" size={24} /> Control de Horas (RRHH)
          </h2>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 opacity-70">
            Control de horas por semanas fijas con cierre analítico
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
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
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg-accent/40 border-b border-border-dim">
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Puesto Operativo</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Horas Planificadas</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Horas Reales RRHH</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Desviación (Hs)</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Observaciones</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Estado</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Validar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim/40">
              {records.map(record => {
                const deviation = record.definitiveHours - record.referenceHours;
                const isPositiveDeviation = deviation > 0;
                const isZero = deviation === 0;

                return (
                  <tr 
                    key={record.id} 
                    className={cn(
                      "hover:bg-bg-accent/5 transition-all text-[11px]",
                      record.status === 'verified' && "bg-emerald-500/[0.01]"
                    )}
                  >
                    <td className="px-6 py-4.5 font-bold text-text-main uppercase">
                      {record.roleLabel}
                    </td>
                    
                    <td className="px-6 py-4.5 text-center font-mono font-bold text-text-dim">
                      {record.referenceHours.toFixed(1)}h
                    </td>

                    <td className="px-6 py-4.5">
                      <div className="flex items-center justify-center gap-2">
                         <button 
                           onClick={() => handleUpdateHours(record.id, Math.max(0, record.definitiveHours - 1))}
                           className="w-6 h-6 rounded bg-bg-accent border border-border-dim hover:border-text-dim/50 text-text-dim hover:text-text-main flex items-center justify-center font-bold text-xs"
                         >
                           -
                         </button>
                         <input 
                           type="number" 
                           value={record.definitiveHours === 0 ? '' : record.definitiveHours}
                           onChange={(e) => handleUpdateHours(record.id, parseFloat(e.target.value) || 0)}
                           className="w-16 bg-bg-accent/60 border border-border-dim rounded px-2 py-1.5 text-center font-mono font-bold text-text-main outline-none focus:border-brand-500 focus:bg-bg-accent"
                           placeholder="0.0"
                           step="0.5"
                         />
                         <button 
                           onClick={() => handleUpdateHours(record.id, record.definitiveHours + 1)}
                           className="w-6 h-6 rounded bg-bg-accent border border-border-dim hover:border-text-dim/50 text-text-dim hover:text-text-main flex items-center justify-center font-bold text-xs"
                         >
                           +
                         </button>
                      </div>
                    </td>

                    <td className="px-6 py-4.5 text-center">
                      <span className={cn(
                        "px-2 py-1 rounded font-mono font-bold text-[10px]",
                        isZero 
                          ? "bg-bg-accent text-text-dim" 
                          : isPositiveDeviation 
                            ? "bg-red-500/10 text-red-400 border border-red-500/25" 
                            : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/25"
                      )}>
                        {isZero ? '0.0' : `${isPositiveDeviation ? '+' : ''}${deviation.toFixed(1)}`}h
                      </span>
                    </td>

                    <td className="px-6 py-4.5">
                      <input 
                        type="text" 
                        value={record.notes || ''}
                        onChange={(e) => handleUpdateNotes(record.id, e.target.value)}
                        placeholder="Observación de desvío..."
                        className="w-full bg-transparent border-b border-border-dim/40 hover:border-border-dim focus:border-brand-500 outline-none px-1 py-1 text-[10px] text-text-dim focus:text-text-main"
                      />
                    </td>

                    <td className="px-6 py-4.5 text-center">
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

                    <td className="px-6 py-4.5 text-center">
                      <button 
                        onClick={() => handleToggleVerify(record.id)}
                        className={cn(
                          "p-2 rounded-full border transition-all",
                          record.status === 'verified' 
                            ? "bg-emerald-500/20 text-emerald-500 border-emerald-500/30" 
                            : "hover:bg-bg-accent text-text-dim border-transparent hover:border-border-dim"
                        )}
                        title={record.status === 'verified' ? 'Marcar como pendiente' : 'Marcar conciliado'}
                      >
                        <Check size={14} className="stroke-[3]" />
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
            <div className="bg-bg-card border border-border-dim/60 px-4 py-2.5 rounded-lg text-center min-w-[110px]">
               <p className="text-[8px] text-text-dim uppercase font-black tracking-widest">Planificadas</p>
               <p className="text-sm font-black font-mono text-text-main mt-0.5">
                 {totalRefHours.toFixed(1)}h
               </p>
            </div>
            
            <div className="bg-bg-card border border-border-dim/60 px-4 py-2.5 rounded-lg text-center min-w-[110px]">
               <p className="text-[8px] text-text-dim uppercase font-black tracking-widest">Cargadas Def.</p>
               <p className="text-sm font-black font-mono text-text-main mt-0.5">
                 {totalDefHours.toFixed(1)}h
               </p>
            </div>

            <div className="bg-bg-card border border-border-dim/60 px-4 py-2.5 rounded-lg text-center min-w-[110px]">
               <p className="text-[8px] text-text-dim uppercase font-black tracking-widest">Desviación Total</p>
               <p className={cn(
                 "text-sm font-black font-mono mt-0.5",
                 totalDeviation === 0 
                   ? "text-text-main" 
                   : totalDeviation > 0 ? "text-red-400" : "text-emerald-400"
               )}>
                 {totalDeviation === 0 ? '0.0h' : `${totalDeviation > 0 ? '+' : ''}${totalDeviation.toFixed(1)}h`}
               </p>
            </div>

            <div className="bg-bg-card border border-border-dim/60 px-4 py-2.5 rounded-lg text-center min-w-[110px]">
               <p className="text-[8px] text-text-dim uppercase font-black tracking-widest">Progreso Control</p>
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
                "px-8 py-4.5 rounded text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2.5 shadow-xl",
                isFullyVerified 
                  ? "bg-brand-500 text-black border-brand-500 hover:bg-brand-600 shadow-brand-500/15" 
                  : "bg-bg-card border-border-dim text-text-main hover:bg-bg-accent"
              )}
            >
              <Save size={15} /> Guardar Horas Semana {selectedWeek}
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
    </motion.div>
  );
}
