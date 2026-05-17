/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  UserPlus, 
  CheckCircle2, 
  Plus, 
  X,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';

interface SupervisorAgendaEntry {
  id: string;
  supervisorId: string;
  date: string; // ISO date
  branchId: string;
  startTime: string;
  endTime: string;
  status: 'pending' | 'confirmed';
}

interface Supervisor {
  id: string;
  name: string;
}

const DAYS_OF_WEEK = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export default function SupervisorAgendaView({ branches }: { branches: Branch[] }) {
  const [supervisors, setSupervisors] = useState<Supervisor[]>([
    { id: '1', name: 'Juan Carlos Pérez' },
    { id: '2', name: 'Marta Rodriguez' },
    { id: '3', name: 'Roberto Gómez' },
  ]);
  
  const [agendas, setAgendas] = useState<SupervisorAgendaEntry[]>([
    { id: 'a1', supervisorId: '1', date: '2024-05-15', branchId: 'bn', startTime: '09:00', endTime: '13:00', status: 'confirmed' },
    { id: 'a2', supervisorId: '2', date: '2024-05-15', branchId: 'bs', startTime: '10:00', endTime: '14:00', status: 'pending' },
  ]);

  const [showAddSupervisor, setShowAddSupervisor] = useState(false);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newSupervisorName, setNewSupervisorName] = useState('');
  
  const [error, setError] = useState<string | null>(null);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState('');
  const [newEntries, setNewEntries] = useState([{
    id: Date.now().toString(),
    date: new Date().toISOString().split('T')[0],
    branchId: '',
    startTime: '09:00',
    endTime: '13:00'
  }]);

  const isOverlapping = (s1: string, e1: string, s2: string, e2: string) => {
    return s1 < e2 && s2 < e1;
  };

  const handleAddSupervisor = () => {
    if (!newSupervisorName.trim()) return;
    const newSup: Supervisor = {
      id: Math.random().toString(36).substr(2, 9),
      name: newSupervisorName
    };
    setSupervisors([...supervisors, newSup]);
    setNewSupervisorName('');
    setShowAddSupervisor(false);
  };

  const handleAddNewRow = () => {
    setNewEntries([...newEntries, {
      id: Date.now().toString() + Math.random(),
      date: new Date().toISOString().split('T')[0],
      branchId: '',
      startTime: '09:00',
      endTime: '13:00'
    }]);
    setError(null);
  };

  const handleRemoveRow = (id: string) => {
    if (newEntries.length > 1) {
      setNewEntries(newEntries.filter(e => e.id !== id));
    }
    setError(null);
  };

  const handleUpdateEntryRow = (id: string, field: string, value: string) => {
    setNewEntries(newEntries.map(e => e.id === id ? { ...e, [field]: value } : e));
    setError(null);
  };

  const handleAddEntry = () => {
    if (!selectedSupervisorId) return;
    
    const validEntries = newEntries.filter(e => e.branchId && e.date);
    if (validEntries.length === 0) return;

    // Check for overlaps with existing agendas
    for (const e of validEntries) {
      const overlap = agendas.find(a => 
        a.date === e.date && 
        a.branchId === e.branchId && 
        isOverlapping(a.startTime, a.endTime, e.startTime, e.endTime)
      );

      if (overlap) {
        const branch = branches.find(b => b.id === e.branchId)?.name;
        const supervisor = supervisors.find(s => s.id === overlap.supervisorId)?.name;
        setError(`Conflicto: ${supervisor} ya está agendado en ${branch} el día ${e.date} en ese horario.`);
        return;
      }

      // Check for overlaps within the new batch itself
      const internalOverlap = validEntries.find(e2 => 
        e2.id !== e.id && 
        e2.date === e.date && 
        e2.branchId === e.branchId && 
        isOverlapping(e.startTime, e.endTime, e2.startTime, e2.endTime)
      );

      if (internalOverlap) {
        const branch = branches.find(b => b.id === e.branchId)?.name;
        setError(`Conflicto Interno: Has cargado dos visitas a ${branch} que se superponen el mismo día.`);
        return;
      }
    }

    const formattedEntries: SupervisorAgendaEntry[] = validEntries.map(e => ({
      id: Math.random().toString(36).substr(2, 9),
      supervisorId: selectedSupervisorId,
      date: e.date,
      branchId: e.branchId,
      startTime: e.startTime,
      endTime: e.endTime,
      status: 'pending'
    }));

    setAgendas([...agendas, ...formattedEntries]);
    setShowAddEntry(false);
    setError(null);
    // Reset form
    setNewEntries([{
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      branchId: '',
      startTime: '09:00',
      endTime: '13:00'
    }]);
  };

  const handleConfirmEntry = (id: string) => {
    setAgendas(agendas.map(a => a.id === id ? { ...a, status: 'confirmed' } : a));
  };

  // Get current week dates
  const today = new Date();
  const weekStart = new Date(today);
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  weekStart.setDate(diff);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  return (
    <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-2xl mt-12">
      <div className="p-6 border-b border-border-dim bg-bg-accent/30 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <ClipboardList className="text-brand-500" size={24} />
          <div>
            <h2 className="text-sm font-black uppercase text-text-main tracking-widest leading-none">Agenda Semanal Supervisores</h2>
            <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 opacity-70">Cronograma de visitas y auditorías</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowAddSupervisor(true)}
            className="flex items-center gap-2 bg-bg-card border border-border-dim px-4 py-2 rounded text-[10px] font-black uppercase text-text-dim hover:text-brand-500 transition-all"
          >
            <UserPlus size={14} /> Gestionar Supervisores
          </button>
          <button 
            onClick={() => setShowAddEntry(true)}
            className="flex items-center gap-2 bg-brand-500 text-black px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10"
          >
            <Plus size={14} /> Cargar Agenda
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-bg-accent border-b border-border-dim">
              <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest w-48 sticky left-0 bg-bg-accent z-10">Supervisor</th>
              {weekDates.map((date, idx) => (
                <th key={date} className="px-4 py-4 text-center border-l border-border-dim/30">
                  <span className="block text-[9px] font-black text-brand-500 uppercase tracking-tighter">{DAYS_OF_WEEK[idx]}</span>
                  <span className="block text-xs font-mono text-text-main mt-1">{date.split('-')[2]}/{date.split('-')[1]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-dim/50">
            {supervisors.map(supervisor => (
              <tr key={supervisor.id} className="hover:bg-bg-accent/10 transition-colors">
                <td className="px-6 py-6 font-bold text-text-main text-[11px] uppercase tracking-tight sticky left-0 bg-bg-sidebar z-10 border-r border-border-dim/50">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-brand-500" />
                    {supervisor.name}
                  </div>
                </td>
                {weekDates.map(date => {
                  const entry = agendas.find(a => a.supervisorId === supervisor.id && a.date === date);
                  const branch = branches.find(b => b.id === entry?.branchId);
                  
                  return (
                    <td key={date} className="px-4 py-4 border-l border-border-dim/30 min-w-[150px]">
                      {entry ? (
                        <div className={cn(
                          "p-3 rounded-lg border flex flex-col gap-2 relative group",
                          entry.status === 'confirmed' 
                            ? "bg-emerald-500/5 border-emerald-500/20" 
                            : "bg-amber-500/5 border-amber-500/20"
                        )}>
                          <div className="flex items-start justify-between">
                            <span className="text-[10px] font-black uppercase text-text-main tracking-tight leading-tight">
                              {branch?.name || '---'}
                            </span>
                            {entry.status === 'confirmed' ? (
                              <CheckCircle2 size={12} className="text-emerald-500" />
                            ) : (
                              <button 
                                onClick={() => handleConfirmEntry(entry.id)}
                                className="opacity-0 group-hover:opacity-100 bg-emerald-500/20 text-emerald-400 p-1 rounded transition-all hover:bg-emerald-500 hover:text-black"
                                title="Confirmar Visita"
                              >
                                <CheckCircle2 size={10} />
                              </button>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-3 text-[9px] font-bold text-text-dim">
                            <div className="flex items-center gap-1">
                              <Clock size={10} />
                              {entry.startTime} - {entry.endTime}
                            </div>
                          </div>
                          
                          <div className={cn(
                            "text-[8px] font-black uppercase px-2 py-0.5 rounded self-start tracking-tighter",
                            entry.status === 'confirmed' ? "text-emerald-500 bg-emerald-500/10" : "text-amber-500 bg-amber-500/10"
                          )}>
                            {entry.status === 'confirmed' ? 'Confirmado' : 'Pendiente Rev.'}
                          </div>
                          
                          <button 
                            onClick={() => setAgendas(agendas.filter(a => a.id !== entry.id))}
                            className="absolute -top-1 -right-1 w-5 h-5 bg-bg-card border border-border-dim rounded-full flex items-center justify-center text-text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-4 text-text-dim/20 hover:text-text-dim/40 transition-colors">
                           <MapPin size={16} strokeWidth={1.5} />
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Info */}
      <div className="p-4 bg-bg-accent/30 border-t border-border-dim text-[9px] font-bold uppercase text-text-dim flex justify-between items-center">
        <div className="flex gap-4">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Agenda Confirmada
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            Pendiente de Gerencia
          </div>
        </div>
        <p className="italic">* El Gerente General debe revisar y confirmar cada visita semanalmente.</p>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showAddSupervisor && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddSupervisor(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-sm bg-bg-card border border-border-dim rounded-lg shadow-2xl p-6"
            >
              <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest mb-6">Gestión de Supervisores</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Nombre Completo</label>
                  <input 
                    type="text" 
                    value={newSupervisorName}
                    onChange={(e) => setNewSupervisorName(e.target.value)}
                    className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500"
                    placeholder="Ej: Marcelo Suarez"
                  />
                </div>
                <div className="pt-4 border-t border-border-dim">
                  <p className="text-[9px] font-bold text-text-dim mb-3 uppercase">Supervisores en Nómina</p>
                  <div className="space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
                    {supervisors.map(sup => (
                      <div key={sup.id} className="flex items-center justify-between bg-bg-accent p-2 rounded">
                        <span className="text-[10px] font-bold text-text-main">{sup.name}</span>
                        <button 
                          onClick={() => setSupervisors(supervisors.filter(s => s.id !== sup.id))}
                          className="text-text-dim hover:text-red-500"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button 
                  onClick={handleAddSupervisor}
                  className="flex-1 bg-brand-500 text-black py-3 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all"
                >
                  Confirmar Alta
                </button>
                <button 
                  onClick={() => setShowAddSupervisor(false)}
                  className="px-6 py-3 rounded border border-border-dim text-text-dim text-[10px] font-black uppercase tracking-widest"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showAddEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddEntry(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl bg-bg-card border border-border-dim rounded-lg shadow-2xl p-6"
            >
              <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest mb-6 border-l-2 border-brand-500 pl-4">Cargar Nueva Agenda</h3>
              
              <div className="space-y-6">
                <div className="space-y-2 max-w-xs">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Supervisor</label>
                  <select 
                    value={selectedSupervisorId}
                    onChange={(e) => setSelectedSupervisorId(e.target.value)}
                    className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-bold uppercase"
                  >
                    <option value="">Seleccionar Supervisor...</option>
                    {supervisors.map(sup => (
                      <option key={sup.id} value={sup.id}>{sup.name}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                  {newEntries.map((row, index) => (
                    <div key={row.id} className="p-4 bg-bg-accent/50 border border-border-dim rounded-lg space-y-4 relative group/row animate-in fade-in slide-in-from-top-2 duration-300">
                      <div className="flex justify-between items-center bg-bg-accent -mx-4 -mt-4 px-4 py-2 border-b border-border-dim rounded-t-lg">
                        <span className="text-[9px] font-black text-brand-500 uppercase">Visita #{index + 1}</span>
                        {newEntries.length > 1 && (
                          <button 
                            onClick={() => handleRemoveRow(row.id)}
                            className="text-text-dim hover:text-red-500 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        )}
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-text-dim uppercase">Fecha</label>
                          <input 
                            type="date"
                            value={row.date}
                            onChange={(e) => handleUpdateEntryRow(row.id, 'date', e.target.value)}
                            className="w-full bg-bg-card border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-text-dim uppercase">Sucursal</label>
                          <select 
                            value={row.branchId}
                            onChange={(e) => handleUpdateEntryRow(row.id, 'branchId', e.target.value)}
                            className="w-full bg-bg-card border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-bold uppercase"
                          >
                            <option value="">Seleccionar...</option>
                            {branches.map(b => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-text-dim uppercase">Desde</label>
                          <input 
                            type="time"
                            value={row.startTime}
                            onChange={(e) => handleUpdateEntryRow(row.id, 'startTime', e.target.value)}
                            className="w-full bg-bg-card border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-mono"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-[10px] font-bold text-text-dim uppercase">Hasta</label>
                          <input 
                            type="time"
                            value={row.endTime}
                            onChange={(e) => handleUpdateEntryRow(row.id, 'endTime', e.target.value)}
                            className="w-full bg-bg-card border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  ))}

                  <button 
                    onClick={handleAddNewRow}
                    className="w-full py-4 border-2 border-dashed border-border-dim rounded-lg text-text-dim hover:text-brand-500 hover:border-brand-500/50 hover:bg-brand-500/5 transition-all flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest"
                  >
                    <Plus size={14} /> Agregar Otra Visita
                  </button>
                </div>
              </div>

              {error && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3"
                >
                  <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
                  <p className="text-[10px] font-bold text-red-500 uppercase tracking-tight">{error}</p>
                </motion.div>
              )}

              <div className="mt-8 flex gap-3 border-t border-border-dim pt-6">
                <button 
                  onClick={handleAddEntry}
                  disabled={!selectedSupervisorId}
                  className="flex-1 bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed text-black py-4 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10"
                >
                  Guardar Toda la Agenda
                </button>
                <button 
                  onClick={() => setShowAddEntry(false)}
                  className="px-8 py-4 rounded border border-border-dim text-text-dim text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
