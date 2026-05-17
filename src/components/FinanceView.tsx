/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  DollarSign, 
  Wallet, 
  Calendar, 
  ArrowUpRight, 
  ArrowDownRight, 
  History, 
  Plus, 
  AlertCircle,
  CreditCard,
  Banknote,
  PiggyBank,
  CheckCircle2,
  Clock,
  BarChart,
  X,
  RefreshCcw,
  Tag,
  Settings,
  Circle,
  Check,
  Bell,
  StickyNote
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Branch, ScheduledPayment, FinanceCategory, FinanceEntry } from '../types';

interface Reminder {
  id: string;
  title: string;
  date: string;
  time: string;
}

interface TreasuryNote {
  id: string;
  text: string;
  color: string;
}

interface Account {
  id: string;
  name: string;
  icon: React.ElementType;
  color: string;
}

const ACCOUNTS: Account[] = [
  { id: 'caja', name: 'Caja Cent', icon: Banknote, color: 'text-brand-500' },
  { id: 'mp', name: 'Mercado Pago', icon: Wallet, color: 'text-blue-400' },
  { id: 'bbva', name: 'BBVA', icon: CreditCard, color: 'text-blue-600' },
  { id: 'santander', name: 'Santander', icon: CreditCard, color: 'text-red-500' },
];

const FINANCE_CATEGORIES = [
  { 
    id: 'income_ord', 
    name: 'Ingresos Ordinarios', 
    type: 'income',
    items: [
      { id: 'ret_suc', name: 'Retiros de Sucursales' },
      { id: 'acr_tarj', name: 'Acreditaciones Tarjetas' },
      { id: 'acr_vent', name: 'Acreditaciones por Ventas' },
      { id: 'acr_py', name: 'Acreditaciones Pedidos Ya' }
    ]
  },
  { 
    id: 'rents', 
    name: 'Alquileres', 
    type: 'expense',
    items: [
      { id: 'rent_bn', name: 'Alquiler Barrio Norte' },
      { id: 'rent_peron', name: 'Alquiler Peron' },
      { id: 'expensas', name: 'Expensas' }
    ]
  },
  { 
    id: 'services', 
    name: 'Servicios y Contrataciones', 
    type: 'expense',
    items: [
      { id: 'soft_maxi', name: 'Software (Maxirest)' },
      { id: 'energy', name: 'Consumo Energía' },
      { id: 'gas', name: 'Consumo Gas' },
      { id: 'honorarios', name: 'Honorarios' }
    ]
  }
];

const INITIAL_PAYMENTS: ScheduledPayment[] = [
  { id: '1', description: 'Cuota Préstamo BBVA #4/12', dueDate: '2024-05-20', amount: 450000, status: 'pending', category: 'loan' },
  { id: '2', description: 'Aportes y Contribuciones F931', dueDate: '2024-05-22', amount: 2800000, status: 'pending', category: 'tax' },
  { id: '3', description: 'Alquiler Barrio Norte', dueDate: '2024-05-15', amount: 1200000, status: 'paid', category: 'other' },
];

export default function FinanceView({ branches, selectedBranchId }: { branches: Branch[], selectedBranchId: string }) {
  const [activeSubTab, setActiveSubTab] = useState<'flow' | 'payments'>('flow');
  const [periodType, setPeriodType] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  const [payments, setPayments] = useState<ScheduledPayment[]>(INITIAL_PAYMENTS);
  const [categories, setCategories] = useState<FinanceCategory[]>(FINANCE_CATEGORIES);
  const [notes, setNotes] = useState<TreasuryNote[]>([
    { id: '1', text: 'Recordar que los días 15 de cada mes vence el alquiler de la sucursal Barrio Norte.', color: 'border-brand-500' },
    { id: '2', text: 'La cuota del préstamo BBVA tiene débito automático de la cuenta corriente.', color: 'border-blue-500' },
  ]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  
  const today = new Date();
  const lastWeek = new Date();
  lastWeek.setDate(today.getDate() - 7);
  
  const [startDate, setStartDate] = useState(lastWeek.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(today.toISOString().split('T')[0]);
  const [showEntryModal, setShowEntryModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newEntry, setNewEntry] = useState({
    description: '',
    categoryId: FINANCE_CATEGORIES[0].id,
    itemId: FINANCE_CATEGORIES[0].items[0].id,
    type: 'expense' as 'income' | 'expense',
    amounts: ACCOUNTS.reduce((acc, account) => ({ ...acc, [account.id]: 0 }), {}) as Record<string, number>
  });

  const [entries, setEntries] = useState<FinanceEntry[]>([
    { id: '1', date: today.toISOString().split('T')[0], itemId: 'ret_suc', amounts: { caja: 17400000, mp: 0, bbva: 0, santander: 0 }, isExecuted: true },
    { id: '2', date: today.toISOString().split('T')[0], itemId: 'acr_tarj', amounts: { caja: 0, mp: 0, bbva: 0, santander: 11570000 }, isExecuted: true },
    { id: '3', date: today.toISOString().split('T')[0], itemId: 'honorarios', amounts: { caja: 0, mp: 0, bbva: 0, santander: 0 }, isExecuted: false },
    { id: '4', date: today.toISOString().split('T')[0], itemId: 'rent_bn', amounts: { caja: 3000000, mp: 0, bbva: 0, santander: 980000 }, isExecuted: true },
    { id: '5', date: today.toISOString().split('T')[0], itemId: 'rent_peron', amounts: { caja: 2000000, mp: 0, bbva: 0, santander: 600000 }, isExecuted: false },
  ]);

  // Mock data for initial balances
  const initialBalances: Record<string, number> = { caja: 5258100, mp: 0, bbva: 0, santander: 14515000 };

  const toggleExecution = (entryId: string | undefined) => {
    if (!entryId) return;
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, isExecuted: !e.isExecuted } : e));
  };

  const handleAddPayment = (payment: Partial<ScheduledPayment>) => {
    const newPay: ScheduledPayment = {
      id: `pay_${Date.now()}`,
      description: payment.description || 'Nuevo Pago',
      dueDate: payment.dueDate || new Date().toISOString().split('T')[0],
      amount: payment.amount || 0,
      status: 'pending',
      category: payment.category || 'other'
    };
    setPayments([...payments, newPay]);
    setShowPaymentModal(false);
  };

  const handleAddNote = (text: string) => {
    const colors = ['border-brand-500', 'border-blue-500', 'border-emerald-500', 'border-amber-500'];
    const newNote: TreasuryNote = {
      id: `note_${Date.now()}`,
      text,
      color: colors[notes.length % colors.length]
    };
    setNotes([...notes, newNote]);
    setShowNoteModal(false);
  };

  const handleAddReminder = async (reminder: Omit<Reminder, 'id'>) => {
    const newRem: Reminder = {
      id: `rem_${Date.now()}`,
      ...reminder
    };
    
    // Notification permission check
    if ('Notification' in window) {
      if (Notification.permission !== 'granted') {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          new Notification("Recordatorio Programado", {
            body: `Se ha programado una alerta para: ${reminder.title}`,
            icon: '/logo.png'
          });
        }
      } else {
        new Notification("Recordatorio Programado", {
          body: `Se ha programado una alerta para: ${reminder.title}`,
        });
      }
    }

    setReminders([...reminders, newRem]);
    setShowReminderModal(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-xl font-bold text-text-main uppercase tracking-tight italic flex items-center gap-2">
            <DollarSign className="text-brand-500" size={24} />
            Gestión Financiera
          </h2>
          <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest mt-1">Cash flow semanal y cronograma de obligaciones</p>
        </div>

        <div className="flex bg-bg-card border border-border-dim p-1 rounded">
          <button 
            onClick={() => setActiveSubTab('flow')}
            className={cn(
              "px-6 py-2 text-[10px] font-black uppercase tracking-widest rounded transition-all",
              activeSubTab === 'flow' ? "bg-brand-500 text-black shadow-lg" : "text-text-dim hover:text-text-main"
            )}
          >
            Flujo de Caja
          </button>
          <button 
            onClick={() => setActiveSubTab('payments')}
            className={cn(
              "px-6 py-2 text-[10px] font-black uppercase tracking-widest rounded transition-all",
              activeSubTab === 'payments' ? "bg-brand-500 text-black shadow-lg" : "text-text-dim hover:text-text-main"
            )}
          >
            Cronograma de Pagos
          </button>
        </div>

        {activeSubTab === 'flow' && (
          <div className="flex gap-3">
            <button 
              onClick={() => setShowConfigModal(true)}
              className="bg-bg-card hover:bg-bg-accent border border-border-dim text-text-dim px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
            >
              <Settings size={14} /> GESTIONAR RUBROS
            </button>
            <button 
              onClick={() => setShowEntryModal(true)}
              className="bg-brand-500 hover:bg-brand-600 text-black px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest shadow-xl transition-all flex items-center gap-2"
            >
              <Plus size={14} /> NUEVA LÍNEA
            </button>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === 'flow' ? (
          <motion.div 
            key="flow"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            className="space-y-6"
          >
            <div className="bg-bg-card border border-border-dim rounded-lg overflow-hidden">
                <div className="p-6 border-b border-border-dim flex flex-wrap justify-between items-center gap-4">
                  <div className="flex items-center gap-4">
                    <History size={20} className="text-brand-500" />
                    <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Planilla de Flujo de Caja</h3>
                  </div>
                  
                  <div className="flex items-center gap-2 bg-bg-card border border-border-dim p-1 rounded h-[38px]">
                    {(['daily', 'weekly', 'monthly'] as const).map(type => (
                      <button
                        key={type}
                        onClick={() => setPeriodType(type)}
                        className={cn(
                          "px-3 py-1 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                          periodType === type ? "bg-brand-500 text-black shadow-lg" : "text-text-dim hover:text-text-main"
                        )}
                      >
                        {type === 'daily' ? 'Día' : type === 'weekly' ? 'Semana' : 'Mes'}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-3 bg-bg-accent border border-border-dim rounded px-3 py-1.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-black text-text-dim uppercase">Desde</span>
                      <input 
                        type="date" 
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="bg-transparent border-none text-[10px] font-mono text-text-main outline-none focus:ring-0 p-0"
                      />
                    </div>
                    <div className="w-px h-3 bg-border-dim mx-1" />
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] font-black text-text-dim uppercase">Hasta</span>
                      <input 
                        type="date" 
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="bg-transparent border-none text-[10px] font-mono text-text-main outline-none focus:ring-0 p-0"
                      />
                    </div>
                  </div>
               </div>

               <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-bg-accent border-b border-border-dim">
                        <th className="px-6 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest min-w-[250px]">Detalle de Rubros / Items</th>
                        <th className="px-4 py-4 text-center text-[9px] font-black uppercase text-text-dim tracking-widest">Ejecución</th>
                        {ACCOUNTS.map(acc => (
                          <th key={acc.id} className="px-4 py-4 text-center min-w-[140px]">
                            <div className="flex flex-col items-center gap-1">
                              <acc.icon size={14} className={acc.color} />
                              <span className="text-[9px] font-black uppercase text-text-dim tracking-widest">{acc.name}</span>
                            </div>
                          </th>
                        ))}
                        <th className="px-6 py-4 text-right text-[9px] font-black uppercase text-text-dim tracking-widest">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dim font-mono">
                      {/* Initial Balances Row */}
                      <tr className="bg-brand-500/5 font-black italic">
                        <td className="px-6 py-3">
                          <span className="text-[10px] uppercase text-brand-500">Saldos Iniciales de Fondos</span>
                        </td>
                        <td className="px-4 py-3"></td>
                        {ACCOUNTS.map(acc => (
                          <td key={acc.id} className="px-4 py-3 text-center text-xs text-brand-500">
                             ${(initialBalances[acc.id] as number).toLocaleString()}
                          </td>
                        ))}
                        <td className="px-6 py-3 text-right text-xs text-brand-500">
                           ${Object.values(initialBalances).reduce((a: number, b: any) => a + (b as number), 0).toLocaleString()}
                        </td>
                      </tr>

                      {categories.map((cat) => (
                        <React.Fragment key={cat.id}>
                          {/* Category Header */}
                          <tr className="bg-bg-accent/40">
                            <td colSpan={ACCOUNTS.length + 3} className="px-6 py-2">
                               <span className="text-[9px] font-black uppercase text-text-main tracking-widest opacity-60">
                                 {cat.name}
                               </span>
                            </td>
                          </tr>
                          {/* Items */}
                          {cat.items.map((item) => {
                            const entry = entries.find(e => e.itemId === item.id);
                            const amounts = entry?.amounts || ACCOUNTS.reduce((acc, a) => ({ ...acc, [a.id]: 0 }), {});
                            const totalRow = Object.values(amounts).reduce((a: number, b: any) => a + (b as number), 0);
                            const isExecuted = entry?.isExecuted;
                            
                            return (
                              <tr key={item.id} className={cn(
                                "hover:bg-bg-accent/30 transition-colors group",
                                !isExecuted && "opacity-40 grayscale-[0.5]"
                              )}>
                                <td className="px-6 py-2.5 pl-10">
                                  <span className={cn(
                                    "text-[10px] font-bold uppercase transition-colors",
                                    isExecuted ? "text-text-main" : "text-text-dim italic"
                                  )}>
                                    {item.name} {!isExecuted && <span className="text-[8px] opacity-60">(Presupuestado)</span>}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-center">
                                   <button 
                                    onClick={() => toggleExecution(entry?.id)}
                                    className={cn(
                                      "p-1.5 rounded-full transition-all scale-90 hover:scale-110",
                                      isExecuted 
                                        ? "bg-emerald-500/20 text-emerald-500 shadow-lg shadow-emerald-500/20" 
                                        : "bg-bg-accent text-text-dim hover:text-brand-500"
                                    )}
                                    title={isExecuted ? "Confirmado (REAL)" : "Pendiente (PRESUPUESTADO)"}
                                   >
                                      {isExecuted ? <Check size={14} /> : <Circle size={14} />}
                                   </button>
                                </td>
                                {ACCOUNTS.map(acc => (
                                  <td key={acc.id} className={cn(
                                    "px-4 py-2.5 text-center text-xs font-bold",
                                    (amounts as any)[acc.id] !== 0 ? (cat.type === 'income' ? 'text-emerald-400' : 'text-red-400') : 'text-text-dim opacity-20'
                                  )}>
                                    {(amounts as any)[acc.id] !== 0 ? (
                                      <span className="flex items-center justify-center gap-1">
                                        {(amounts as any)[acc.id] < 0 ? '-' : ''}
                                        <span className="opacity-40">$</span>
                                        {Math.abs((amounts as any)[acc.id]).toLocaleString()}
                                      </span>
                                    ) : '-'}
                                  </td>
                                ))}
                                <td className={cn(
                                  "px-6 py-2.5 text-right text-xs font-black",
                                  totalRow !== 0 ? (cat.type === 'income' ? 'text-emerald-400' : 'text-red-400') : 'text-text-dim opacity-20'
                                )}>
                                   {totalRow !== 0 ? `$${Math.abs(totalRow as number).toLocaleString()}` : '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </tbody>
                    <tfoot className="bg-bg-main/80 backdrop-blur font-black text-text-main border-t-2 border-border-dim">
                      {/* REAL Footer Row */}
                      <tr className="border-b border-border-dim/30">
                        <td className="px-6 py-3 uppercase tracking-widest text-[9px] text-emerald-400 italic">Saldo Final REAL (Ejecutado)</td>
                        <td className="px-4 py-3"></td>
                        {ACCOUNTS.map(acc => {
                           const income = entries.filter(e => e.isExecuted && categories.find(c => c.items.some(i => i.id === e.itemId))?.type === 'income').reduce((sum, e) => sum + ((e.amounts as any)[acc.id] as number), 0);
                           const expense = entries.filter(e => e.isExecuted && categories.find(c => c.items.some(i => i.id === e.itemId))?.type === 'expense').reduce((sum, e) => sum + ((e.amounts as any)[acc.id] as number), 0);
                           const final = (initialBalances[acc.id] as number) + income - expense;
                           return (
                             <td key={acc.id} className="px-4 py-3 text-center font-mono text-xs text-emerald-400">
                               ${final.toLocaleString()}
                             </td>
                           );
                        })}
                        <td className="px-6 py-3 text-right font-mono text-xs text-emerald-400">
                           ${(Object.values(initialBalances).reduce((a: number, b: any) => a + (b as number), 0) + 
                             entries.filter(e => e.isExecuted).reduce((total: number, e) => {
                               const cat = categories.find(c => c.items.some(i => i.id === e.itemId));
                               const rowTotal = Object.values(e.amounts).reduce((a: number, b: any) => a + (b as number), 0);
                               const val = (cat?.type === 'income' ? rowTotal : -rowTotal) as number;
                               return total + val;
                             }, 0)).toLocaleString()}
                        </td>
                      </tr>
                      {/* PROYECTADO Footer Row */}
                      <tr>
                        <td className="px-6 py-4 uppercase tracking-widest text-[9px] text-brand-500">Saldo PROYECTADO (Cierre esperado)</td>
                        <td className="px-4 py-4"></td>
                        {ACCOUNTS.map(acc => {
                           const income = entries.filter(e => categories.find(c => c.items.some(i => i.id === e.itemId))?.type === 'income').reduce((sum, e) => sum + ((e.amounts as any)[acc.id] as number), 0);
                           const expense = entries.filter(e => categories.find(c => c.items.some(i => i.id === e.itemId))?.type === 'expense').reduce((sum, e) => sum + ((e.amounts as any)[acc.id] as number), 0);
                           const final = (initialBalances[acc.id] as number) + income - expense;
                           return (
                             <td key={acc.id} className="px-4 py-4 text-center font-mono text-sm text-brand-500">
                               ${final.toLocaleString()}
                             </td>
                           );
                        })}
                        <td className="px-6 py-4 text-right font-mono text-sm text-brand-500">
                           ${(Object.values(initialBalances).reduce((a: number, b: any) => a + (b as number), 0) + 
                             entries.reduce((total: number, e) => {
                               const cat = categories.find(c => c.items.some(i => i.id === e.itemId));
                               const rowTotal = Object.values(e.amounts).reduce((a: number, b: any) => a + (b as number), 0);
                               const val = (cat?.type === 'income' ? rowTotal : -rowTotal) as number;
                               return total + val;
                             }, 0)).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
               <div className="md:col-span-3 p-6 bg-brand-500/5 border border-brand-500/20 rounded-lg flex items-center gap-4">
                 <div className="p-3 bg-brand-500/10 rounded-full text-brand-500">
                    <AlertCircle size={24} />
                 </div>
                 <div>
                    <p className="text-[10px] font-black uppercase text-brand-500 tracking-widest">Información de Tesorería</p>
                    <p className="text-xs text-text-dim mt-1">
                      Los ítems <span className="text-text-main font-bold">tildados</span> impactan en el <span className="text-emerald-400 font-bold underline">Saldo Real</span>. 
                      Los pendientes se consideran presupuestados y solo afectan a la proyección.
                    </p>
                 </div>
               </div>
               <div className="bg-bg-card border border-border-dim p-6 rounded-lg text-center flex flex-col justify-center">
                  <p className="text-[9px] font-black uppercase text-text-dim tracking-widest mb-1">Saldo Real (Hoy)</p>
                  <p className="text-2xl font-mono font-black text-emerald-400 italic tracking-tighter">
                    ${(Object.values(initialBalances).reduce((a: number, b: any) => a + (b as number), 0) + 
                             entries.filter(e => e.isExecuted).reduce((total: number, e) => {
                               const cat = categories.find(c => c.items.some(i => i.id === e.itemId));
                               const rowTotal = Object.values(e.amounts).reduce((a: number, b: any) => a + (b as number), 0);
                               const val = (cat?.type === 'income' ? rowTotal : -rowTotal) as number;
                               return total + val;
                             }, 0)).toLocaleString()}
                  </p>
               </div>
            </div>
          </motion.div>
        ) : (
          <motion.div 
            key="payments"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-bg-card border border-border-dim rounded-lg overflow-hidden">
                <div className="p-6 border-b border-border-dim flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Clock size={20} className="text-brand-500" />
                    <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Cronograma de Obligaciones</h3>
                  </div>
                  <button 
                    onClick={() => setShowPaymentModal(true)}
                    className="text-brand-500 hover:text-brand-600 text-[10px] font-black uppercase flex items-center gap-2"
                  >
                    <Plus size={14} /> AGREGAR PAGO
                  </button>
                </div>
                <div className="divide-y divide-border-dim">
                  {payments.map(pay => (
                    <div key={pay.id} className="p-6 flex items-center justify-between hover:bg-bg-accent/30 transition-colors group">
                       <div className="flex items-center gap-4">
                          <div className={cn(
                            "p-2 rounded border",
                            pay.status === 'paid' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500" :
                            pay.status === 'overdue' ? "bg-red-500/10 border-red-500/20 text-red-500" :
                            "bg-brand-500/10 border-brand-500/20 text-brand-500"
                          )}>
                             {pay.status === 'paid' ? <CheckCircle2 size={16} /> : <Clock size={16} />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-text-main uppercase tracking-tighter">{pay.description}</p>
                            <div className="flex items-center gap-3 mt-1">
                               <span className="text-[9px] font-bold text-text-dim uppercase tracking-widest flex items-center gap-1">
                                  <Calendar size={10} /> {new Date(pay.dueDate).toLocaleDateString()}
                               </span>
                               <span className="text-[9px] font-bold text-text-dim uppercase tracking-widest px-2 py-0.5 bg-bg-accent rounded">
                                  {pay.category}
                               </span>
                            </div>
                          </div>
                       </div>
                       <div className="text-right">
                          <p className="text-lg font-mono font-black text-text-main">${pay.amount.toLocaleString()}</p>
                          <span className={cn(
                            "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded",
                            pay.status === 'paid' ? "text-emerald-500" : "text-brand-500"
                          )}>
                            {pay.status === 'paid' ? 'Pagado' : 'Pendiente'}
                          </span>
                       </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-bg-card border border-brand-500/20 rounded-lg p-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5">
                    <BarChart size={60} className="text-brand-500" />
                  </div>
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#8B949E] mb-4">Resumen de Obligaciones</h4>
                  <div className="space-y-4">
                    <div className="flex justify-between items-end">
                      <div>
                        <p className="text-[9px] text-text-dim uppercase font-bold opacity-60">Total Pendiente</p>
                        <p className="text-2xl font-mono font-black text-brand-500 leading-tight italic tracking-tighter">
                          ${payments.filter(p => p.status !== 'paid').reduce((a, b) => a + b.amount, 0).toLocaleString()}
                        </p>
                      </div>
                      <p className="text-[9px] text-text-dim uppercase font-bold mb-1">
                         {payments.filter(p => p.status !== 'paid').length} Pagos
                      </p>
                    </div>
                    <div className="pt-4 border-t border-border-dim">
                        <div className="flex justify-between items-center text-[10px]">
                           <span className="text-text-dim uppercase font-bold tracking-widest">Próximo Vencimiento</span>
                           <span className="text-brand-500 font-mono font-bold">20/05/2024</span>
                        </div>
                        <p className="text-xs text-text-main font-bold mt-1 uppercase tracking-tighter">Préstamo BBVA Cuota 4</p>
                    </div>
                  </div>
                </div>

                <div className="bg-bg-card border border-border-dim rounded-lg p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-main flex items-center gap-2">
                       <AlertCircle size={14} className="text-brand-500" /> Notas de Tesorería
                    </h4>
                    <button 
                      onClick={() => setShowNoteModal(true)}
                      className="text-text-dim hover:text-brand-500 transition-colors"
                      title="Agregar Nota"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="space-y-3">
                     {notes.map(note => (
                       <div key={note.id} className={cn("p-3 bg-bg-accent rounded border-l-2 relative group", note.color)}>
                          <p className="text-[10px] text-text-main leading-relaxed pr-6">
                            {note.text}
                          </p>
                          <button 
                            onClick={() => setNotes(notes.filter(n => n.id !== note.id))}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-text-dim hover:text-red-500 transition-all"
                          >
                            <X size={10} />
                          </button>
                       </div>
                     ))}
                  </div>
                </div>

                <div className="bg-bg-card border border-border-dim rounded-lg p-6">
                   <div className="flex justify-between items-center mb-4">
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-main flex items-center gap-2">
                       <Bell size={14} className="text-brand-500" /> Alertas y Recordatorios
                    </h4>
                    <button 
                      onClick={() => setShowReminderModal(true)}
                      className="text-text-dim hover:text-brand-500 transition-colors"
                      title="Programar Alerta"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                  <div className="space-y-2">
                     {reminders.length === 0 ? (
                       <p className="text-[9px] text-text-dim italic text-center py-4 bg-bg-accent/50 rounded border border-dashed border-border-dim">No hay alertas programadas</p>
                     ) : (
                       reminders.map(rem => (
                         <div key={rem.id} className="flex items-center justify-between p-2.5 bg-bg-accent rounded border border-border-dim">
                            <div className="flex items-center gap-3">
                               <Bell size={12} className="text-brand-500" />
                               <div>
                                  <p className="text-[10px] font-bold text-text-main uppercase tracking-tighter">{rem.title}</p>
                                  <p className="text-[8px] text-text-dim uppercase font-bold">{rem.date} @ {rem.time}</p>
                               </div>
                            </div>
                            <button 
                              onClick={() => setReminders(reminders.filter(r => r.id !== rem.id))}
                              className="text-text-dim hover:text-red-500 transition-colors"
                            >
                               <X size={12} />
                            </button>
                         </div>
                       ))
                     )}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Config Modal (Rubros/Items) */}
      <AnimatePresence>
        {showConfigModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowConfigModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-2xl bg-bg-card border border-border-dim rounded-lg shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-border-dim flex justify-between items-center bg-bg-accent/50">
                 <div className="flex items-center gap-3">
                   <Settings className="text-brand-500" size={20} />
                   <div>
                     <h3 className="text-sm font-black uppercase tracking-widest text-text-main">Configuración de Rubros e Items</h3>
                     <p className="text-[10px] text-text-dim uppercase font-bold text-wrap">Define las categorías de ingresos y egresos de tu flujo</p>
                   </div>
                 </div>
                 <button onClick={() => setShowConfigModal(false)} className="text-text-dim hover:text-text-main transition-colors">
                   <X size={20} />
                 </button>
              </div>

              <div className="p-6 h-[500px] overflow-y-auto space-y-8 bg-bg-main/30">
                {categories.map((cat, catIdx) => (
                  <div key={cat.id} className="bg-bg-card border border-border-dim rounded-lg p-4 relative group">
                    <div className="flex items-center justify-between mb-4 border-b border-border-dim pb-4">
                       <div className="flex items-center gap-3">
                         <div className={cn(
                           "px-2 py-0.5 rounded text-[8px] font-black uppercase",
                           cat.type === 'income' ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                         )}>
                            {cat.type === 'income' ? 'Ingreso' : 'Egreso'}
                         </div>
                         <input 
                          type="text"
                          value={cat.name}
                          onChange={(e) => {
                            const newCats = [...categories];
                            newCats[catIdx].name = e.target.value;
                            setCategories(newCats);
                          }}
                          className="bg-transparent border-none text-[11px] font-black uppercase text-text-main outline-none focus:text-brand-500"
                         />
                       </div>
                       <button 
                        onClick={() => {
                          setCategories(categories.filter((_, i) => i !== catIdx));
                        }}
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-500 transition-all"
                       >
                         <X size={14} />
                       </button>
                    </div>

                    <div className="space-y-2">
                       {cat.items.map((item, itemIdx) => (
                         <div key={item.id} className="flex items-center gap-3 bg-bg-accent rounded p-2 group/item">
                           <Tag size={12} className="text-text-dim" />
                           <input 
                            type="text"
                            value={item.name}
                            onChange={(e) => {
                              const newCats = [...categories];
                              newCats[catIdx].items[itemIdx].name = e.target.value;
                              setCategories(newCats);
                            }}
                            className="flex-1 bg-transparent border-none text-[10px] font-bold text-text-dim outline-none focus:text-text-main"
                           />
                           <button 
                            onClick={() => {
                              const newCats = [...categories];
                              newCats[catIdx].items = newCats[catIdx].items.filter((_, i) => i !== itemIdx);
                              setCategories(newCats);
                            }}
                            className="opacity-0 group-hover/item:opacity-100 text-text-dim hover:text-red-400 transition-all"
                           >
                            <X size={12} />
                           </button>
                         </div>
                       ))}
                       <button 
                        onClick={() => {
                          const newCats = [...categories];
                          newCats[catIdx].items.push({ id: `item_${Date.now()}`, name: 'NUEVO ITEM', categoryId: cat.id });
                          setCategories(newCats);
                        }}
                        className="w-full py-2 border border-dashed border-border-dim rounded text-[9px] font-black uppercase text-text-dim hover:text-brand-500 hover:border-brand-500 transition-all flex items-center justify-center gap-2"
                       >
                         <Plus size={12} /> AGREGAR ITEM
                       </button>
                    </div>
                  </div>
                ))}

                <div className="flex gap-4">
                  <button 
                    onClick={() => {
                      const id = `cat_${Date.now()}`;
                      setCategories([...categories, { id, name: 'NUEVO RUBRO INGRESO', type: 'income', items: [] }]);
                    }}
                    className="flex-1 py-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg text-[10px] font-black uppercase text-emerald-400 hover:bg-emerald-500/10 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus size={16} /> NUEVO RUBRO INGRESO
                  </button>
                  <button 
                    onClick={() => {
                      const id = `cat_${Date.now()}`;
                      setCategories([...categories, { id, name: 'NUEVO RUBRO EGRESO', type: 'expense', items: [] }]);
                    }}
                    className="flex-1 py-4 bg-red-500/5 border border-red-500/20 rounded-lg text-[10px] font-black uppercase text-red-500 hover:bg-red-500/10 transition-all flex items-center justify-center gap-2"
                  >
                    <Plus size={16} /> NUEVO RUBRO EGRESO
                  </button>
                </div>
              </div>

              <div className="p-6 bg-bg-accent/50 border-t border-border-dim flex justify-end">
                 <button 
                  onClick={() => setShowConfigModal(false)}
                  className="bg-brand-500 hover:bg-brand-600 text-black px-10 py-3 rounded text-[10px] font-black uppercase tracking-widest shadow-xl transition-all"
                 >
                   Guardar Configuración
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Note Modal */}
      <AnimatePresence>
        {showNoteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNoteModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-bg-card border border-border-dim rounded-lg shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-border-dim bg-bg-accent/50 flex justify-between items-center">
                 <h3 className="text-xs font-black uppercase tracking-widest text-text-main">Nueva Nota de Tesorería</h3>
                 <button onClick={() => setShowNoteModal(false)}><X size={18} className="text-text-dim" /></button>
              </div>
              <div className="p-6 space-y-4">
                 <textarea 
                  className="w-full h-32 bg-bg-accent border border-border-dim rounded p-4 text-xs text-text-main outline-none focus:border-brand-500 resize-none"
                  placeholder="Escribe la nota aquí..."
                  id="note-text"
                 />
                 <button 
                  onClick={() => {
                    const text = (document.getElementById('note-text') as HTMLTextAreaElement).value;
                    if (text) handleAddNote(text);
                  }}
                  className="w-full bg-brand-500 hover:bg-brand-600 text-black py-3 rounded text-[10px] font-black uppercase tracking-widest transition-all"
                 >
                   Guardar Nota
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Payment Modal */}
      <AnimatePresence>
        {showPaymentModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPaymentModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-bg-card border border-border-dim rounded-lg shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-border-dim bg-bg-accent/50">
                 <h3 className="text-xs font-black uppercase tracking-widest text-text-main">Programar Nueva Obligación</h3>
              </div>
              <div className="p-6 space-y-4">
                 <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-text-dim">Descripción</label>
                    <input id="pay-desc" type="text" className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500" />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-text-dim">Monto ($)</label>
                      <input id="pay-amount" type="number" className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-mono" />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-text-dim">Vencimiento</label>
                      <input id="pay-date" type="date" className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-mono" />
                   </div>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-text-dim">Categoría</label>
                    <select id="pay-cat" className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-black uppercase">
                       <option value="loan">Préstamo</option>
                       <option value="tax">Impuestos</option>
                       <option value="services">Servicios</option>
                       <option value="other">Otros</option>
                    </select>
                 </div>
                 <button 
                  onClick={() => {
                    const desc = (document.getElementById('pay-desc') as HTMLInputElement).value;
                    const amount = parseFloat((document.getElementById('pay-amount') as HTMLInputElement).value);
                    const date = (document.getElementById('pay-date') as HTMLInputElement).value;
                    const cat = (document.getElementById('pay-cat') as HTMLSelectElement).value;
                    if (desc && amount && date) {
                      handleAddPayment({ description: desc, amount, dueDate: date, category: cat as any });
                    }
                  }}
                  className="w-full bg-brand-500 hover:bg-brand-600 text-black py-3 rounded text-[10px] font-black uppercase tracking-widest transition-all"
                 >
                   Programar Pago
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* New Reminder Modal */}
      <AnimatePresence>
        {showReminderModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReminderModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-bg-card border border-border-dim rounded-lg shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-border-dim bg-bg-accent/50 flex justify-between items-center">
                 <h3 className="text-xs font-black uppercase tracking-widest text-text-main">Programar Alerta PUSH</h3>
                 <button onClick={() => setShowReminderModal(false)}><X size={18} className="text-text-dim" /></button>
              </div>
              <div className="p-6 space-y-4">
                 <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-text-dim">Título de la Alerta</label>
                    <input id="rem-title" type="text" className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500" placeholder="Ej: Vencimiento Alquiler" />
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-text-dim">Fecha</label>
                      <input id="rem-date" type="date" className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-mono" />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase text-text-dim">Hora</label>
                      <input id="rem-time" type="time" className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-mono" />
                   </div>
                 </div>
                 <div className="p-4 bg-brand-500/5 border border-brand-500/20 rounded-lg">
                    <p className="text-[9px] text-brand-500 font-bold uppercase tracking-widest flex items-center gap-2">
                       <AlertCircle size={12} /> Nota sobre Notificaciones
                    </p>
                    <p className="text-[9px] text-text-dim mt-1 leading-relaxed">
                       Las alertas PUSH requieren que el navegador tenga permiso para enviar notificaciones. Si es la primera vez, el sistema solicitará autorización.
                    </p>
                 </div>
                 <button 
                  onClick={() => {
                    const title = (document.getElementById('rem-title') as HTMLInputElement).value;
                    const date = (document.getElementById('rem-date') as HTMLInputElement).value;
                    const time = (document.getElementById('rem-time') as HTMLInputElement).value;
                    if (title && date && time) {
                      handleAddReminder({ title, date, time });
                    }
                  }}
                  className="w-full bg-brand-500 hover:bg-brand-600 text-black py-3 rounded text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-brand-500/10"
                 >
                   Activar Alerta
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Entry Modal */}
      <AnimatePresence>
        {showEntryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEntryModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-xl bg-bg-card border border-border-dim rounded-lg shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-border-dim flex justify-between items-center bg-bg-accent/50">
                 <div className="flex items-center gap-3">
                   <div className="p-2 bg-brand-500/10 rounded-full text-brand-500">
                     <Plus size={20} />
                   </div>
                   <div>
                     <h3 className="text-sm font-black uppercase tracking-widest text-text-main">Nuevo Movimiento de Flujo</h3>
                     <p className="text-[10px] text-text-dim uppercase font-bold">Carga manual de ingresos o egresos proyectados</p>
                   </div>
                 </div>
                 <button onClick={() => setShowEntryModal(false)} className="text-text-dim hover:text-text-main transition-colors">
                   <X size={20} />
                 </button>
              </div>

              <div className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-dim flex items-center gap-2">
                      <Tag size={12} className="text-brand-500" /> Rubro (Categoría)
                    </label>
                    <select 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 uppercase font-black appearance-none"
                      value={newEntry.categoryId}
                      onChange={(e) => {
                        const cat = categories.find(c => c.id === e.target.value);
                        setNewEntry({
                          ...newEntry, 
                          categoryId: e.target.value,
                          type: cat?.type || 'expense',
                          itemId: cat?.items[0].id || ''
                        });
                      }}
                    >
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-dim">Concepto / Item</label>
                    <select 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 uppercase font-black appearance-none"
                      value={newEntry.itemId}
                      onChange={(e) => setNewEntry({...newEntry, itemId: e.target.value})}
                    >
                      {categories.find(c => c.id === newEntry.categoryId)?.items.map(item => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-dim">Fecha del Movimiento</label>
                    <input 
                      type="date"
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-mono"
                      defaultValue={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-text-dim">Notas Adicionales</label>
                    <input 
                      type="text"
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 placeholder:opacity-30"
                      placeholder="Referencia opcional..."
                      value={newEntry.description}
                      onChange={(e) => setNewEntry({...newEntry, description: e.target.value})}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-text-dim border-b border-border-dim pb-2 block">
                    Distribución por Cuentas ($ ARS)
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    {ACCOUNTS.map(account => (
                      <div key={account.id} className="bg-bg-accent p-4 rounded border border-border-dim flex items-center gap-4">
                        <div className={cn("p-2 bg-bg-card rounded", account.color)}>
                          <account.icon size={18} />
                        </div>
                        <div className="flex-1">
                          <p className="text-[9px] font-black uppercase text-text-dim mb-1">{account.name}</p>
                          <input 
                            type="number"
                            className="w-full bg-transparent border-none p-0 text-lg font-mono font-black text-text-main outline-none focus:ring-0"
                            placeholder="0"
                            value={newEntry.amounts[account.id] || ''}
                            onChange={(e) => setNewEntry({
                              ...newEntry, 
                              amounts: { ...newEntry.amounts, [account.id]: parseFloat(e.target.value) || 0 }
                            })}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-bg-accent/50 border-t border-border-dim flex justify-end gap-3">
                 <button 
                  onClick={() => setShowEntryModal(false)}
                  className="px-6 py-2.5 rounded text-[10px] font-black uppercase tracking-widest text-text-dim hover:text-text-main transition-all"
                 >
                   Cancelar
                 </button>
                 <button 
                  onClick={async () => {
                    setIsSaving(true);
                    // Simulate API call
                    await new Promise(resolve => setTimeout(resolve, 1500));
                    
                    setIsSaving(false);
                    setShowEntryModal(false);
                    setNewEntry({
                      description: '',
                      categoryId: categories[0].id,
                      itemId: categories[0].items[0].id,
                      type: 'expense',
                      amounts: ACCOUNTS.reduce((acc, account) => ({ ...acc, [account.id]: 0 }), {})
                    });
                  }}
                  disabled={isSaving}
                  className={cn(
                    "bg-brand-500 hover:bg-brand-600 text-black px-8 py-2.5 rounded text-[10px] font-black uppercase tracking-widest shadow-xl transition-all flex items-center gap-2",
                    isSaving && "opacity-70 cursor-not-allowed"
                  )}
                 >
                   {isSaving ? (
                     <>
                       <div className="w-3 h-3 border-2 border-black/20 border-t-black rounded-full animate-spin" />
                       PROCESANDO...
                     </>
                   ) : "Confirmar Movimiento"}
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
