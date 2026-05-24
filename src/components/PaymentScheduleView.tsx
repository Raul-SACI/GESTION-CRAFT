/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calendar, 
  DollarSign, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  Filter, 
  Plus, 
  Edit2, 
  Trash2, 
  X, 
  Building2, 
  Calculator, 
  HelpCircle,
  FileSpreadsheet
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { ScheduledPayment } from '../types';

// Constants to translate categories
const CATEGORY_LABELS: Record<string, { label: string; bg: string; text: string; border: string }> = {
  loan: { label: 'Pasivo Bancario', bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  tax: { label: 'Pasivo Fiscal', bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  service: { label: 'Servicios', bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  other: { label: 'Otros / Alquileres / Insumos', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' }
};

const SEED_PAYMENTS: ScheduledPayment[] = [
  { id: 'loan-bbva', description: 'CUOTA PRÉSTAMO BBVA #4/12', dueDate: '2026-05-20', amount: 450000, status: 'pending', category: 'loan', bank: 'BBVA', installmentNumber: '4 de 12' },
  { id: 'tax-f931', description: 'SALDO F931 AFORO', dueDate: '2026-05-22', amount: 2800000, status: 'pending', category: 'tax', entity: 'ARCA', taxType: 'F931' },
  { id: 'other-alq-bn', description: 'ALQUILER BARRIO NORTE', dueDate: '2026-05-15', amount: 1200000, status: 'paid', category: 'other' },
  { id: 'tax-plan-arca', description: 'PLAN DE PAGO ARCA #10 - C1', dueDate: '2026-05-25', amount: 120000, status: 'pending', category: 'tax', entity: 'ARCA', taxType: 'IVA', installmentNumber: '1 de 5' },
  { id: 'loan-santander', description: 'PRÉSTAMO SANTANDER CUOTA 2/6', dueDate: '2026-05-18', amount: 350000, status: 'pending', category: 'loan', bank: 'SANTANDER', installmentNumber: '2 de 6' },
  { id: 'sched-1', description: 'Distribuidora Norte (Insumos)', dueDate: '2026-05-24', amount: 150000, status: 'pending', category: 'other' },
  { id: 'sched-2', description: 'EDET (Luz)', dueDate: '2026-05-28', amount: 85000, status: 'pending', category: 'service' },
  { id: 'sched-3', description: 'Alquiler Centro', dueDate: '2026-05-21', amount: 450000, status: 'paid', category: 'other' },
  { id: 'sched-4', description: 'SAT (Agua)', dueDate: '2026-05-30', amount: 12000, status: 'pending', category: 'service' },
  { id: 'sched-5', description: 'Proveedor Carnes', dueDate: '2026-05-18', amount: 280000, status: 'paid', category: 'other' },
];

export default function PaymentScheduleView() {
  const [payments, setPayments] = useState<ScheduledPayment[]>([]);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterWeekOnly, setFilterWeekOnly] = useState(true);

  // Modal Control States
  const [showModal, setShowModal] = useState(false);
  const [editingPayment, setEditingPayment] = useState<ScheduledPayment | null>(null);

  // Form Fields State
  const [formDescription, setFormDescription] = useState('');
  const [formAmount, setFormAmount] = useState<number>(0);
  const [formDueDate, setFormDueDate] = useState('');
  const [formCategory, setFormCategory] = useState<'loan' | 'tax' | 'service' | 'other'>('other');
  const [formStatus, setFormStatus] = useState<'pending' | 'paid' | 'overdue'>('pending');
  const [formBank, setFormBank] = useState('');
  const [formEntity, setFormEntity] = useState('');
  const [formTaxType, setFormTaxType] = useState('');
  const [formInstallment, setFormInstallment] = useState('');

  // Load payments from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('craft_scheduled_payments');
    if (saved) {
      try {
        setPayments(JSON.parse(saved));
      } catch (e) {
        console.error('Error loading payments', e);
        setPayments(SEED_PAYMENTS);
      }
    } else {
      setPayments(SEED_PAYMENTS);
      localStorage.setItem('craft_scheduled_payments', JSON.stringify(SEED_PAYMENTS));
    }
  }, []);

  const savePayments = (updatedList: ScheduledPayment[]) => {
    setPayments(updatedList);
    localStorage.setItem('craft_scheduled_payments', JSON.stringify(updatedList));
  };

  // Check if date belongs to the current week (Argentine Mon-Sun)
  const isDateInCurrentWeek = (dateStr: string) => {
    if (!dateStr) return false;
    const itemDate = new Date(dateStr + 'T12:00:00');
    const today = new Date('2026-05-24T12:00:00'); // Consistent with prompt metadata (May 24, 2026 is Sunday)
    
    // Get Monday of this week
    const currentDay = today.getDay(); // 0 is Sun, 1 is Mon
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const sWeek = new Date(today);
    sWeek.setDate(today.getDate() - distanceToMonday);
    sWeek.setHours(0, 0, 0, 0);

    const eWeek = new Date(sWeek);
    eWeek.setDate(sWeek.getDate() + 6);
    eWeek.setHours(23, 59, 59, 999);

    return itemDate >= sWeek && itemDate <= eWeek;
  };

  // Get start/end string for current week display
  const weekRangeString = useMemo(() => {
    const today = new Date('2026-05-24T12:00:00');
    const currentDay = today.getDay();
    const distanceToMonday = currentDay === 0 ? 6 : currentDay - 1;
    const sWeek = new Date(today);
    sWeek.setDate(today.getDate() - distanceToMonday);
    
    const eWeek = new Date(sWeek);
    eWeek.setDate(sWeek.getDate() + 6);

    const format = (d: Date) => `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    return `${format(sWeek)} al ${format(eWeek)}`;
  }, []);

  // Filtered Payments list
  const processedPayments = useMemo(() => {
    let list = [...payments];

    // Filter by week
    if (filterWeekOnly) {
      list = list.filter(p => isDateInCurrentWeek(p.dueDate));
    }

    // Filter by search string
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p => 
        p.description.toLowerCase().includes(q) || 
        (p.bank && p.bank.toLowerCase().includes(q)) || 
        (p.entity && p.entity.toLowerCase().includes(q)) ||
        (p.taxType && p.taxType.toLowerCase().includes(q))
      );
    }

    // Filter by category
    if (filterCategory !== 'all') {
      list = list.filter(p => p.category === filterCategory);
    }

    // Sort by Due Date
    return list.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [payments, search, filterCategory, filterWeekOnly]);

  // Dashboard Stats Calculations
  const stats = useMemo(() => {
    // Stat computation relative to search or filter? Or absolute total? Let's compute relative to the active filters so values update
    const totalPending = processedPayments
      .filter(p => p.status !== 'paid')
      .reduce((sum, p) => sum + p.amount, 0);

    const totalPaid = processedPayments
      .filter(p => p.status === 'paid')
      .reduce((sum, p) => sum + p.amount, 0);

    const pendingCount = processedPayments.filter(p => p.status !== 'paid').length;

    // Find next pending dueDate
    const pendingWithDates = processedPayments
      .filter(p => p.status !== 'paid' && p.dueDate)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    let nextDueDateStr = '-_-_';
    if (pendingWithDates.length > 0) {
      const nd = new Date(pendingWithDates[0].dueDate + 'T12:00:00');
      nextDueDateStr = `${nd.getDate().toString().padStart(2, '0')}/${(nd.getMonth() + 1).toString().padStart(2, '0')}`;
    }

    return {
      totalPending,
      totalPaid,
      pendingCount,
      nextDueDateStr
    };
  }, [processedPayments]);

  const openAddModal = () => {
    setEditingPayment(null);
    setFormDescription('');
    setFormAmount(0);
    setFormDueDate('2026-05-24');
    setFormCategory('other');
    setFormStatus('pending');
    setFormBank('');
    setFormEntity('');
    setFormTaxType('');
    setFormInstallment('');
    setShowModal(true);
  };

  const openEditModal = (p: ScheduledPayment) => {
    setEditingPayment(p);
    setFormDescription(p.description);
    setFormAmount(p.amount);
    setFormDueDate(p.dueDate);
    setFormCategory(p.category);
    setFormStatus(p.status);
    setFormBank(p.bank || '');
    setFormEntity(p.entity || '');
    setFormTaxType(p.taxType || '');
    setFormInstallment(p.installmentNumber ? String(p.installmentNumber) : '');
    setShowModal(true);
  };

  const handleSaveCommitment = () => {
    if (!formDescription.trim() || formAmount <= 0 || !formDueDate) {
      alert('Por favor complete la descripción, un monto válido y la fecha de vencimiento.');
      return;
    }

    const payload: ScheduledPayment = {
      id: editingPayment ? editingPayment.id : 'commit_' + Math.random().toString(36).substring(2, 9),
      description: formDescription,
      dueDate: formDueDate,
      amount: Number(formAmount),
      category: formCategory,
      status: formStatus,
    };

    if (formCategory === 'loan') {
      payload.bank = formBank.trim().toUpperCase() || 'OTROS';
      if (formInstallment.trim()) {
        payload.installmentNumber = formInstallment.trim();
        payload.installmentAmount = Number(formAmount);
      }
    } else if (formCategory === 'tax') {
      payload.entity = formEntity.trim().toUpperCase() || 'ARCA';
      payload.taxType = formTaxType.trim().toUpperCase() || 'VARIOS';
    }

    let newList = [];
    if (editingPayment) {
      newList = payments.map(p => p.id === editingPayment.id ? { ...p, ...payload } : p);
    } else {
      newList = [...payments, payload];
    }

    savePayments(newList);
    setShowModal(false);
  };

  const handleDeleteCommitment = (id: string) => {
    if (window.confirm('¿Está seguro de eliminar este compromiso de pago?')) {
      const newList = payments.filter(p => p.id !== id);
      savePayments(newList);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Title block */}
      <div className="flex flex-wrap justify-between items-end gap-4 border-b border-border-dim pb-4">
        <div>
          <h2 className="text-xl font-black uppercase text-text-main tracking-widest flex items-center gap-2">
            <Calendar className="text-brand-500" size={24} /> Cronograma de Pagos
          </h2>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 opacity-70">
            Agenda unificada de obligaciones financieras, vencimientos bancarios, tributos e insumos
          </p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={openAddModal}
            className="bg-brand-500 text-black px-5 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10 flex items-center gap-2"
          >
            <Plus size={14} /> Registrar Compromiso
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Pendiente', value: `$${stats.totalPending.toLocaleString('es-AR')}`, color: 'text-brand-500', icon: Clock, desc: 'Suma de compromisos no pagados' },
          { label: 'Próximo Vencimiento', value: stats.nextDueDateStr, color: 'text-orange-500', icon: Calendar, desc: 'Próxima cuota o impuesto' },
          { label: 'Pagos Realizados', value: `$${stats.totalPaid.toLocaleString('es-AR')}`, color: 'text-emerald-500', icon: CheckCircle2, desc: 'Suma de cancelaciones hechas' },
          { label: 'Compromisos Filtrados', value: String(processedPayments.length), color: 'text-text-main', icon: AlertCircle, desc: 'Suma de registros en vista actual' },
        ].map((stat, i) => (
          <div key={i} className="bg-bg-sidebar border border-border-dim/80 p-4 rounded-xl flex flex-col justify-between">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] font-black text-text-dim uppercase tracking-wider">{stat.label}</span>
              <stat.icon size={13} className={stat.color} />
            </div>
            <div>
              <p className={cn("text-lg font-mono font-black", stat.color)}>{stat.value}</p>
              <p className="text-[8px] text-text-dim mt-0.5 uppercase tracking-wide opacity-65">{stat.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Interactive Controls & Filters */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {/* Week switch */}
            <button
              onClick={() => setFilterWeekOnly(!filterWeekOnly)}
              className={cn(
                "px-4 py-2 rounded text-[10px] font-black uppercase tracking-wider border transition-all flex items-center gap-2",
                filterWeekOnly 
                  ? "bg-brand-500/10 border-brand-500/40 text-brand-500" 
                  : "bg-bg-accent border-border-dim text-text-dim hover:text-text-main"
              )}
            >
              <Calendar size={13} />
              {filterWeekOnly ? `Semana Actual: ${weekRangeString}` : "Ver Todos los Vencimientos"}
            </button>

            {/* Custom Category dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-text-dim uppercase tracking-wider">Filtro:</span>
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-[10px] font-bold uppercase text-text-main outline-none focus:border-brand-500"
              >
                <option value="all">Todas las Categorías</option>
                <option value="loan">Pasivos Bancarios</option>
                <option value="tax">Pasivos Fiscales</option>
                <option value="service">Servicios</option>
                <option value="other">Otros / Insumos_Alquileres</option>
              </select>
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
            <input 
              type="text" 
              placeholder="BUSCAR COMPROMISO..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-bg-accent border border-border-dim rounded-full pl-9 pr-4 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 uppercase font-black"
            />
            {search && (
              <button 
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Table representation */}
        <div className="border border-border-dim/60 rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg-accent/40 border-b border-border-dim">
                <th className="px-6 py-3.5 text-[10px] font-black uppercase text-text-dim tracking-widest">Compromiso / Acreedor</th>
                <th className="px-6 py-3.5 text-[10px] font-black uppercase text-text-dim tracking-widest">Clasificación</th>
                <th className="px-6 py-3.5 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">F. Vencimiento</th>
                <th className="px-6 py-3.5 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Monto</th>
                <th className="px-6 py-3.5 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Estado</th>
                <th className="px-6 py-3.5 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim/30 font-medium">
              {processedPayments.map(p => {
                const labelConf = CATEGORY_LABELS[p.category] || CATEGORY_LABELS.other;
                const isWeirdLoan = p.category === 'loan';
                const isWeirdTax = p.category === 'tax';
                
                return (
                  <tr key={p.id} className="hover:bg-bg-accent/15 transition-colors group">
                    <td className="px-6 py-4">
                      <p className="text-[11px] font-black text-text-main uppercase tracking-tight">{p.description}</p>
                      <div className="flex gap-2 items-center mt-1">
                        <span className="text-[8px] font-bold text-text-dim uppercase">ID: {p.id}</span>
                        {isWeirdLoan && p.bank && (
                          <span className="text-[8px] bg-blue-500/10 text-blue-400 border border-blue-500/20 px-1 rounded uppercase font-black">
                            ENTIDAD: {p.bank}
                          </span>
                        )}
                        {isWeirdTax && p.entity && (
                          <span className="text-[8px] bg-red-500/10 text-red-500 border border-red-500/20 px-1 rounded uppercase font-black">
                            TIPO: {p.taxType || 'FISCAL'} ({p.entity})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn("text-[8px] font-black uppercase px-2 py-0.5 rounded border tracking-wider", labelConf.bg, labelConf.text, labelConf.border)}>
                        {labelConf.label}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-xs font-mono font-bold text-text-main">
                      {p.dueDate}
                    </td>
                    <td className="px-6 py-4 text-right text-xs font-mono font-black text-text-main italic">
                      ${p.amount.toLocaleString('es-AR')}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => {
                          const updated = payments.map(item => 
                            item.id === p.id 
                              ? { ...item, status: (item.status === 'paid' ? 'pending' : 'paid') as any } 
                              : item
                          );
                          savePayments(updated);
                        }}
                        className={cn(
                          "inline-flex items-center gap-1 px-2.5 py-0.5 rounded border text-[9px] font-black uppercase tracking-tighter cursor-pointer select-none transition-all",
                          p.status === 'paid' 
                            ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/25" 
                            : "bg-orange-500/10 border-orange-500/20 text-orange-400 hover:bg-orange-500/25 animate-pulse"
                        )}
                      >
                        {p.status === 'paid' ? 'PAGADO' : 'PENDIENTE'}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex justify-center items-center gap-1.5">
                        <button 
                          onClick={() => openEditModal(p)}
                          className="p-1 border border-border-dim/60 hover:border-brand-500/50 rounded hover:text-brand-500 text-text-dim transition-all"
                          title="Editar"
                        >
                          <Edit2 size={11} />
                        </button>
                        <button 
                          onClick={() => handleDeleteCommitment(p.id)}
                          className="p-1 border border-border-dim/60 hover:border-red-500/50 rounded hover:text-red-500 text-text-dim transition-all"
                          title="Eliminar"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {processedPayments.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-xs text-text-dim uppercase font-bold italic">
                    Sin compromisos registrados {filterWeekOnly ? 'para la semana actual' : 'en la consulta'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit/Add Commitment Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-bg-sidebar border border-border-dim p-6 rounded-xl w-full max-w-lg shadow-2xl relative"
            >
              <button 
                onClick={() => setShowModal(false)}
                className="absolute right-4 top-4 text-text-dim hover:text-red-500 transition-colors"
              >
                <X size={18} />
              </button>

              <h3 className="text-sm font-black text-brand-500 uppercase tracking-widest mb-6 border-l-2 border-brand-500 pl-3">
                {editingPayment ? 'Editar Compromiso de Pago' : 'Nuevo Compromiso de Pago'}
              </h3>

              <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
                {/* description */}
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Concepto o Proveedor</label>
                  <input 
                    type="text"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Ejem: EDET (Luz) o CUOTA BBVA #5/12"
                    className="w-full px-3 py-2 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 uppercase font-black"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Category */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Clasificación</label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as any)}
                      className="w-full px-3 py-2 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-bold uppercase"
                    >
                      <option value="other">Otros / Insumos / Alquiler</option>
                      <option value="loan">Pasivos Bancarios (Préstamo)</option>
                      <option value="tax">Pasivos Fiscales (Impuesto)</option>
                      <option value="service">Servicios</option>
                    </select>
                  </div>

                  {/* Status */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Estado Inicial</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as any)}
                      className="w-full px-3 py-2 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-bold uppercase"
                    >
                      <option value="pending">PENDIENTE</option>
                      <option value="paid">PAGADO (EJECUTADO)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Monto */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Monto de la Obligación ($)</label>
                    <input 
                      type="number"
                      value={formAmount || ''}
                      onChange={(e) => setFormAmount(Number(e.target.value))}
                      placeholder="Monto total cobrado"
                      className="w-full px-3 py-2 bg-bg-accent border border-border-dim rounded text-text-main text-xs font-mono outline-none focus:border-brand-500 font-bold"
                    />
                  </div>

                  {/* Vencimiento */}
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-text-dim uppercase tracking-wider">Fecha de Vencimiento</label>
                    <input 
                      type="date"
                      value={formDueDate}
                      onChange={(e) => setFormDueDate(e.target.value)}
                      className="w-full px-3 py-2 bg-bg-accent border border-border-dim rounded text-text-main text-xs font-mono outline-none focus:border-brand-500 font-bold"
                    />
                  </div>
                </div>

                {/* Sub-form fields based on selected category */}
                {formCategory === 'loan' && (
                  <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg space-y-3">
                    <p className="text-[9px] text-blue-400 font-black uppercase tracking-wider">Información de Entidad Bancaria</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[8px] font-black text-text-dim uppercase block mb-1">Banco Acreedor</label>
                        <input 
                          type="text"
                          value={formBank}
                          onChange={(e) => setFormBank(e.target.value)}
                          placeholder="BBVA / SANTANDER / MACRO"
                          className="w-full px-2.5 py-1.5 bg-bg-sidebar border border-border-dim rounded text-text-main text-xs outline-none focus:border-blue-500 uppercase font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[8px] font-black text-text-dim uppercase block mb-1">Couta N° (Referencia)</label>
                        <input 
                          type="text"
                          value={formInstallment}
                          onChange={(e) => setFormInstallment(e.target.value)}
                          placeholder="Ejem: 4 de 12"
                          className="w-full px-2.5 py-1.5 bg-bg-sidebar border border-border-dim rounded text-text-main text-xs outline-none focus:blue-500 uppercase font-bold"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {formCategory === 'tax' && (
                  <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg space-y-3">
                    <p className="text-[9px] text-red-400 font-black uppercase tracking-wider">Información Impositiva</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[8px] font-black text-text-dim uppercase block mb-1">Ente Recaudador</label>
                        <input 
                          type="text"
                          value={formEntity}
                          onChange={(e) => setFormEntity(e.target.value)}
                          placeholder="ARCA / RENTAS / MUN."
                          className="w-full px-2.5 py-1.5 bg-bg-sidebar border border-border-dim rounded text-text-main text-xs outline-none focus:border-red-500 uppercase font-bold"
                        />
                      </div>
                      <div>
                        <label className="text-[8px] font-black text-text-dim uppercase block mb-1">Tipo de Impuesto</label>
                        <input 
                          type="text"
                          value={formTaxType}
                          onChange={(e) => setFormTaxType(e.target.value)}
                          placeholder="Ejem: F931 / IVA / INGRESOS BRUTOS"
                          className="w-full px-2.5 py-1.5 bg-bg-sidebar border border-border-dim rounded text-text-main text-xs outline-none focus:border-red-500 uppercase font-bold"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8 flex gap-3">
                <button 
                  onClick={handleSaveCommitment}
                  className="flex-1 bg-brand-500 text-black py-2.5 rounded text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all font-bold"
                >
                  {editingPayment ? 'Guardar Cambios' : 'Confirmar Registro'}
                </button>
                <button 
                  onClick={() => setShowModal(false)}
                  className="px-6 py-2.5 rounded border border-border-dim text-text-dim text-[11px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
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
