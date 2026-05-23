/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
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
  StickyNote,
  Building2,
  Calculator,
  Trash2,
  Upload,
  FileSpreadsheet,
  Search
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
  { id: 'efectivo', name: 'EFECTIVO', icon: Banknote, color: 'text-brand-500' },
  { id: 'bbva', name: 'BANCO BBVA', icon: CreditCard, color: 'text-blue-600' },
  { id: 'santander', name: 'BANCO SANTANDER', icon: CreditCard, color: 'text-red-500' },
  { id: 'ciudad', name: 'BANCO CIUDAD', icon: CreditCard, color: 'text-sky-500' },
  { id: 'nacion', name: 'BANCO NACION', icon: CreditCard, color: 'text-blue-400' },
  { id: 'macro', name: 'BANCO MACRO', icon: CreditCard, color: 'text-indigo-600' },
  { id: 'mp', name: 'MERCADO PAGO', icon: Wallet, color: 'text-blue-400' },
];

const FINANCE_CATEGORIES = [
  { 
    id: 'balance_initial', 
    name: 'SALDO INICIAL', 
    type: 'income',
    items: [
      { id: 'balance_start', name: 'SALDO INICIAL', subrubro: 'SALDO INICIAL' }
    ]
  },
  { 
    id: 'income_estim', 
    name: 'INGRESOS ESTIMADOS', 
    type: 'income',
    items: [
      { id: 'ret_suc', name: 'RETIROS SUCURSALES', subrubro: 'RETIROS' },
      { id: 'acr_tarj', name: 'ACREDITACIONES TARJETAS', subrubro: 'INGRESO POR VENTAS' },
      { id: 'acr_py', name: 'ACREDITACIONES PEDIDOS YA', subrubro: 'INGRESO POR VENTAS' },
      { id: 'loan_inc', name: 'ACREDITACION DE PRÉSTAMOS', subrubro: 'PRESTAMOS' },
      { id: 'inc_others', name: 'OTROS', subrubro: 'OTROS' },
      { id: 'aportes', name: 'APORTE DE SOCIOS', subrubro: 'APORTES' }
    ]
  },
  { 
    id: 'expense_estim', 
    name: 'EGRESOS ESTIMADOS', 
    type: 'expense',
    items: [
      { id: 'prov_fri', name: 'PAGOS VIERNES', subrubro: 'PAGOS A PROVEEDORES' },
      { id: 'prov_ant', name: 'ANTICIPOS A PROVEEDORES', subrubro: 'PAGOS A PROVEEDORES' },
      { id: 'prov_pend', name: 'PAGO DE SALDOS PENDIENTES', subrubro: 'PAGOS A PROVEEDORES' },
      { id: 'prov_maxi', name: 'MAXICONSUMO', subrubro: 'PAGOS A PROVEEDORES' },
      { id: 'prov_gomez', name: 'GOMEZ PARDO', subrubro: 'PAGOS A PROVEEDORES' },
      { id: 'prov_verd', name: 'VERDURAS', subrubro: 'PAGOS A PROVEEDORES' },
      { id: 'prov_other', name: 'OTROS', subrubro: 'PAGOS A PROVEEDORES' },
      { id: 'serv_agua', name: 'AGUA', subrubro: 'SERVICIOS' },
      { id: 'serv_gas', name: 'GAS', subrubro: 'SERVICIOS' },
      { id: 'serv_luz', name: 'LUZ', subrubro: 'SERVICIOS' },
      { id: 'serv_alarm', name: 'ALARMA', subrubro: 'SERVICIOS' },
      { id: 'serv_other', name: 'OTROS', subrubro: 'SERVICIOS' },
      { id: 'hon_abog_1', name: 'HONORARIOS ABOGADOS', subrubro: 'HONORARIOS' },
      { id: 'hon_cont', name: 'HONORARIOS CONTADOR', subrubro: 'HONORARIOS' },
      { id: 'hon_abog_2', name: 'HONORARIOS ABOGADA', subrubro: 'HONORARIOS' },
      { id: 'hon_domo', name: 'HONORARIOS DOMO', subrubro: 'HONORARIOS' },
      { id: 'hon_franco', name: 'HONORARIOS FRANCO MKT', subrubro: 'HONORARIOS' },
      { id: 'hon_rrhh', name: 'HONORARIOS RRHH', subrubro: 'HONORARIOS' },
      { id: 'hon_other', name: 'OTROS', subrubro: 'HONORARIOS' },
      { id: 'suel_oper', name: 'SUELDOS OPERATIVOS', subrubro: 'SUELDOS' },
      { id: 'suel_enc', name: 'SUELDOS ENCARGADOS', subrubro: 'SUELDOS' },
      { id: 'suel_comp', name: 'SUELDOS COMPARTIDOS', subrubro: 'SUELDOS' },
      { id: 'suel_soc', name: 'SUELDOS SOCIOS', subrubro: 'SUELDOS' },
      { id: 'suel_var', name: 'VARIABLES', subrubro: 'SUELDOS' },
      { id: 'suel_liq', name: 'LIQUIDACION FINAL', subrubro: 'SUELDOS' },
      { id: 'suel_other', name: 'OTROS', subrubro: 'SUELDOS' },
      { id: 'alq_rent', name: 'ALQUILER', subrubro: 'ALQUILERES' },
      { id: 'alq_exp', name: 'EXPENSAS', subrubro: 'ALQUILERES' },
      { id: 'tax_931', name: 'F931', subrubro: 'IMPUESTOS LABORALES' },
      { id: 'tax_salud', name: 'SALUD PUBLICA', subrubro: 'IMPUESTOS LABORALES' },
      { id: 'tax_lab_other', name: 'OTROS', subrubro: 'IMPUESTOS LABORALES' },
      { id: 'tax_mun', name: 'MUNICIPALES', subrubro: 'IMPUESTOS FISCALES' },
      { id: 'tax_iva', name: 'IVA', subrubro: 'IMPUESTOS FISCALES' },
      { id: 'tax_gan', name: 'GANANCIAS', subrubro: 'IMPUESTOS FISCALES' },
      { id: 'tax_plans', name: 'PLANES', subrubro: 'IMPUESTOS FISCALES' },
      { id: 'tax_fisc_other', name: 'OTROS', subrubro: 'IMPUESTOS FISCALES' },
      { id: 'loan_bank', name: 'PRESTAMO BANCARIO', subrubro: 'PRESTAMOS' },
      { id: 'loan_cuota', name: 'CUOTA FINANCIERA', subrubro: 'PRESTAMOS' },
      { id: 'echeq_deb', name: 'DEBITOS E-CHEQ EMITIDOS', subrubro: 'E-CHEQ EMITIDOS' },
      { id: 'maint', name: 'MANTENIMIENTO', subrubro: 'MANTENIMIENTO' },
      { id: 'exp_other', name: 'OTROS', subrubro: 'OTROS' }
    ]
  },
  {
    id: 'dividends',
    name: 'DIVIDENDOS',
    type: 'expense',
    items: [
      { id: 'div_manuel', name: 'DIVIDENDOS MANUEL', subrubro: 'DIVIDENDOS' },
      { id: 'div_raul', name: 'DIVIDENDOS RAUL', subrubro: 'DIVIDENDOS' },
      { id: 'div_franco', name: 'DIVIDENDOS FRANCO', subrubro: 'DIVIDENDOS' }
    ]
  },
  {
    id: 'investments',
    name: 'INVERSIONES',
    type: 'expense',
    items: [
      { id: 'inv_mach', name: 'COMPRA DE MAQUINARIA', subrubro: 'COMPRA DE MAQUINARIA' },
      { id: 'inv_food', name: 'FOOD TEAM', subrubro: 'FOOD TEAM' },
      { id: 'inv_works', name: 'OBRAS EN CURSO', subrubro: 'OBRAS EN CURSO' }
    ]
  }
];

const INITIAL_PAYMENTS: ScheduledPayment[] = [
  { 
    id: '1', 
    description: 'CUOTA PRÉSTAMO BBVA #4/12', 
    dueDate: '2024-05-20', 
    amount: 450000, 
    status: 'pending', 
    category: 'loan',
    bank: 'BBVA',
    requestDate: '2024-01-15',
    requestedAmount: 5400000,
    destination: 'Capital de Trabajo',
    rate: 'TNA 85%',
    installmentNumber: '4 de 12',
    installmentAmount: 450000
  },
  { 
    id: '2', 
    description: 'SALDO F931 AFORO', 
    dueDate: '2024-05-22', 
    amount: 2800000, 
    status: 'pending', 
    category: 'tax',
    entity: 'ARCA',
    taxType: 'F931',
    totalAmount: 2800000,
    paymentPlanNumber: 'F931-Directo',
    installmentCount: 1,
    installmentNumber: '1 de 1',
    installmentAmount: 2800000
  },
  { id: '3', description: 'ALQUILER BARRIO NORTE', dueDate: '2024-05-15', amount: 1200000, status: 'paid', category: 'other' },
  { 
    id: '4', 
    description: 'PLAN DE PAGO ARCA #10 - C1', 
    dueDate: '2024-05-25', 
    amount: 120000, 
    status: 'pending', 
    category: 'tax',
    entity: 'ARCA',
    taxType: 'IVA',
    totalAmount: 600000,
    paymentPlanNumber: 'PLAN ARCA 2024-A',
    installmentCount: 5,
    installmentNumber: '1 de 5',
    installmentAmount: 120000
  },
  { 
    id: '5', 
    description: 'PRÉSTAMO SANTANDER CUOTA 2/6', 
    dueDate: '2024-05-18', 
    amount: 350000, 
    status: 'pending', 
    category: 'loan',
    bank: 'SANTANDER',
    requestDate: '2024-03-10',
    requestedAmount: 2100000,
    destination: 'Adquisición Vajilla y Mobiliario',
    rate: 'TNA 92%',
    installmentNumber: '2 de 6',
    installmentAmount: 350000
  }
];

export default function FinanceView({ 
  branches, 
  selectedBranchId, 
  mode = 'default' 
}: { 
  branches: Branch[], 
  selectedBranchId: string,
  mode?: 'default' | 'bank' | 'tax'
}) {
  const today = useMemo(() => new Date(), []);
  const lastWeek = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  }, []);

  const [activeSubTab, setActiveSubTab] = useState<'flow' | 'payments'>(mode === 'default' ? 'flow' : 'payments');
  const [periodType, setPeriodType] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  
  const [payments, setPayments] = useState<ScheduledPayment[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('craft_scheduled_payments');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Error loading payments from localStorage", e);
        }
      }
    }
    return INITIAL_PAYMENTS;
  });

  const savePayments = (newPayments: ScheduledPayment[]) => {
    setPayments(newPayments);
    localStorage.setItem('craft_scheduled_payments', JSON.stringify(newPayments));
  };

  const [showBankLoteModal, setShowBankLoteModal] = useState(false);
  const [showTaxLoteModal, setShowTaxLoteModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  
  // Importer states
  const [importRawText, setImportRawText] = useState('');
  const [parsedData, setParsedData] = useState<{ headers: string[]; rows: any[] } | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  
  // Custom batch loader state for generated installments
  const [tempCuotas, setTempCuotas] = useState<Array<{ installmentNumber: string; dueDate: string; amount: number }>>([]);

  const [categories, setCategories] = useState<FinanceCategory[]>(FINANCE_CATEGORIES);
  
  const [entries, setEntries] = useState<FinanceEntry[]>([
    { id: 'start', date: today.toISOString().split('T')[0], itemId: 'balance_start', amounts: { efectivo: 5258100, mp: 0, bbva: 850000, santander: 14515000 }, isExecuted: true },
    { id: '1', date: today.toISOString().split('T')[0], itemId: 'ret_suc', amounts: { efectivo: 17400000, mp: 0, bbva: 0, santander: 0 }, isExecuted: true },
    { id: '2', date: today.toISOString().split('T')[0], itemId: 'acr_tarj', amounts: { efectivo: 0, mp: 0, bbva: 0, santander: 11570000 }, isExecuted: true },
  ]);

  // Global initial balances are 0 now because we use the 'balance_start' entry row
  const initialBalances: Record<string, number> = useMemo(() => {
    return ACCOUNTS.reduce((acc, account) => ({ ...acc, [account.id]: 0 }), {});
  }, []);

  // Filter payments based on mode
  const filteredPayments = useMemo(() => {
    if (mode === 'bank') return payments.filter(p => p.category === 'loan');
    if (mode === 'tax') return payments.filter(p => p.category === 'tax');
    return payments;
  }, [payments, mode]);

  const [notes, setNotes] = useState<TreasuryNote[]>([
    { id: '1', text: 'Recordar que los días 15 de cada mes vence el alquiler de la sucursal Barrio Norte.', color: 'border-brand-500' },
    { id: '2', text: 'La cuota del préstamo BBVA tiene débito automático de la cuenta corriente.', color: 'border-blue-500' },
  ]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  
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

  // Get all unique items present in entries for selected period
  const activeEntriesByCat = useMemo(() => {
    const grouped: Record<string, FinanceEntry[]> = {};
    
    entries.forEach(entry => {
      const cat = FINANCE_CATEGORIES.find(c => c.items.some(i => i.id === entry.itemId));
      if (cat) {
        if (!grouped[cat.id]) grouped[cat.id] = [];
        grouped[cat.id].push(entry);
      }
    });

    return grouped;
  }, [entries]);

  const viewTitle = mode === 'bank' ? 'Pasivos Bancarios' : mode === 'tax' ? 'Pasivos Fiscales' : 'Flujo de Caja Estimado';
  const ViewIcon = mode === 'bank' ? Building2 : mode === 'tax' ? Calculator : DollarSign;

  const toggleExecution = (entryId: string | undefined) => {
    if (!entryId) return;
    setEntries(prev => prev.map(e => e.id === entryId ? { ...e, isExecuted: !e.isExecuted } : e));
  };

  const [searchQuery, setSearchQuery] = useState('');

  const togglePaymentPaid = (id: string) => {
    const updated = payments.map(p => {
      if (p.id === id) {
        return { ...p, status: (p.status === 'paid' ? 'pending' : 'paid') as 'pending' | 'paid' };
      }
      return p;
    });
    savePayments(updated);
  };

  const handleDeletePayment = (id: string) => {
    savePayments(payments.filter(p => p.id !== id));
  };

  const searchedPayments = useMemo(() => {
    if (!searchQuery) return filteredPayments;
    const q = searchQuery.toLowerCase();
    return filteredPayments.filter(p => {
      return (
        p.description?.toLowerCase().includes(q) ||
        p.bank?.toLowerCase().includes(q) ||
        p.destination?.toLowerCase().includes(q) ||
        p.rate?.toString().toLowerCase().includes(q) ||
        p.entity?.toLowerCase().includes(q) ||
        p.taxType?.toLowerCase().includes(q) ||
        p.paymentPlanNumber?.toLowerCase().includes(q)
      );
    });
  }, [filteredPayments, searchQuery]);

  const bankStats = useMemo(() => {
    const loanPayments = payments.filter(p => p.category === 'loan');
    const totalPending = loanPayments.filter(p => p.status !== 'paid').reduce((sum, p) => sum + p.amount, 0);
    const totalPaid = loanPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
    const countPending = loanPayments.filter(p => p.status !== 'paid').length;
    const countPaid = loanPayments.filter(p => p.status === 'paid').length;
    return { totalPending, totalPaid, countPending, countPaid };
  }, [payments]);

  const taxStats = useMemo(() => {
    const taxPayments = payments.filter(p => p.category === 'tax');
    const totalPending = taxPayments.filter(p => p.status !== 'paid').reduce((sum, p) => sum + p.amount, 0);
    const totalPaid = taxPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);
    const countPending = taxPayments.filter(p => p.status !== 'paid').length;
    const countPaid = taxPayments.filter(p => p.status === 'paid').length;
    return { totalPending, totalPaid, countPending, countPaid };
  }, [payments]);

  const handleAddPayment = (payment: Partial<ScheduledPayment>) => {
    const newPay: ScheduledPayment = {
      id: `pay_${Date.now()}`,
      description: payment.description || 'Nuevo Pago',
      dueDate: payment.dueDate || new Date().toISOString().split('T')[0],
      amount: payment.amount || 0,
      status: 'pending',
      category: payment.category || 'other'
    };
    savePayments([...payments, newPay]);
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
            <ViewIcon className="text-brand-500" size={24} />
            {viewTitle}
          </h2>
          <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest mt-1">
            {mode === 'default' ? 'Cash flow semanal y cronograma de obligaciones' : 'Listado de compromisos y cuotas pendientes'}
          </p>
        </div>

        {mode === 'default' && (
          <div className="flex bg-bg-card border border-border-dim p-1 rounded">
            <button 
              onClick={() => setActiveSubTab('flow')}
              className={cn(
                "px-6 py-2 text-[10px] font-black uppercase tracking-widest rounded transition-all",
                activeSubTab === 'flow' ? "bg-brand-500 text-black shadow-lg" : "text-sidebar-dim hover:text-text-main"
              )}
            >
              Flujo de Caja
            </button>
            <button 
              onClick={() => setActiveSubTab('payments')}
              className={cn(
                "px-6 py-2 text-[10px] font-black uppercase tracking-widest rounded transition-all",
                activeSubTab === 'payments' ? "bg-brand-500 text-black shadow-lg" : "text-sidebar-dim hover:text-text-main"
              )}
            >
              Cronograma de Pagos
            </button>
          </div>
        )}

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
                        <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest min-w-[120px]">Rubro</th>
                        <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest min-w-[120px]">Subrubro</th>
                        <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest min-w-[200px]">Concepto</th>
                        <th className="px-4 py-4 text-center text-[9px] font-black uppercase text-text-dim tracking-widest">Ejecución</th>
                        {ACCOUNTS.map(acc => (
                          <th key={acc.id} className="px-4 py-4 text-center min-w-[120px]">
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
                      {(Object.entries(activeEntriesByCat) as [string, FinanceEntry[]][]).map(([catId, catEntries]) => {
                        const cat = FINANCE_CATEGORIES.find(c => c.id === catId);
                        if (!cat) return null;

                        return (
                          <React.Fragment key={cat.id}>
                            {catEntries.map((entry, idx) => {
                              const item = cat.items.find(i => i.id === entry.itemId);
                              if (!item) return null;

                              const amounts = entry.amounts;
                              const totalRow = Object.values(amounts).reduce((a: number, b: any) => a + (b as number), 0);
                              const isExecuted = entry.isExecuted;
                              
                              return (
                                <tr key={entry.id} className={cn(
                                  "hover:bg-bg-accent/30 transition-colors group text-[10px]",
                                  !isExecuted && "opacity-60"
                                )}>
                                  <td className="px-4 py-2 font-black uppercase text-text-dim/50 tracking-tighter">
                                    {idx === 0 ? cat.name : ''}
                                  </td>
                                  <td className="px-4 py-2 font-bold uppercase text-text-dim/80">
                                    {(item as any).subrubro}
                                  </td>
                                  <td className="px-4 py-2">
                                    <span className={cn(
                                      "font-bold uppercase transition-colors",
                                      isExecuted ? "text-text-main" : "text-text-dim italic"
                                    )}>
                                      {item.name}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 text-center">
                                     <button 
                                      onClick={() => toggleExecution(entry.id)}
                                      className={cn(
                                        "p-1.5 rounded-full transition-all scale-75 hover:scale-95",
                                        isExecuted 
                                          ? "bg-emerald-500 text-black shadow-lg" 
                                          : "bg-bg-accent text-text-dim hover:text-brand-500 border border-border-dim"
                                      )}
                                     >
                                        {isExecuted ? <Check size={10} strokeWidth={4} /> : <Circle size={10} />}
                                     </button>
                                  </td>
                                  {ACCOUNTS.map(acc => (
                                    <td key={acc.id} className={cn(
                                      "px-4 py-2 text-center text-[10px] font-bold",
                                      (amounts as any)[acc.id] !== 0 ? (cat.type === 'income' ? 'text-emerald-400' : 'text-red-400') : 'text-text-dim opacity-10'
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
                                    "px-6 py-2 text-right text-[10px] font-black",
                                    totalRow !== 0 ? (cat.type === 'income' ? 'text-emerald-400' : 'text-red-400') : 'text-text-dim opacity-10'
                                  )}>
                                     {totalRow !== 0 ? `$${Math.abs(totalRow as number).toLocaleString()}` : '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </React.Fragment>
                        );
                      })}
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
            {/* SEARCH AND CONTROL BAR */}
            <div className="flex flex-wrap justify-between items-center gap-4 bg-bg-card border border-border-dim p-4 rounded-xl shadow-md">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={mode === 'bank' ? "BUSCAR POR BANCO, DESTINO..." : mode === 'tax' ? "BUSCAR POR ENTIDAD, IMPUESTO..." : "BUSCAR OBLIGACIONES..."}
                  className="w-full bg-bg-accent border border-border-dim rounded pl-10 pr-4 py-2.5 text-xs text-text-main outline-none focus:border-brand-500 uppercase font-black"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[10px] text-text-dim uppercase font-black tracking-widest bg-bg-accent px-3 py-1.5 rounded border border-border-dim/60 font-mono">
                  {searchedPayments.length} Obligaciones
                </span>
                {(mode === 'bank' || mode === 'tax') && (
                  <button 
                    onClick={() => {
                      setImportRawText('');
                      setParsedData(null);
                      setShowImportModal(true);
                    }}
                    className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
                  >
                    <Upload size={13} /> Importar Excel/CSV
                  </button>
                )}
              </div>
            </div>

            {mode === 'bank' ? (
              /* =========================================================================
                 PASIVOS BANCARIOS (MODE = BANK)
                 ========================================================================= */
              <div className="space-y-6">
                {/* Visual Stats Bento */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-bg-card border border-border-dim p-6 rounded-xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                      <DollarSign size={54} className="text-brand-500" />
                    </div>
                    <p className="text-[9px] text-text-dim uppercase font-black tracking-widest">Deuda Pendiente Bancaria</p>
                    <p className="text-2xl font-mono font-black text-brand-500 mt-1 italic">${bankStats.totalPending.toLocaleString('es-AR')}</p>
                    <p className="text-[8px] text-text-dim mt-2 uppercase font-bold">Por vencer a lo largo del cronograma</p>
                  </div>
                  <div className="bg-bg-card border border-border-dim p-6 rounded-xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                      <CheckCircle2 size={54} className="text-emerald-500" />
                    </div>
                    <p className="text-[9px] text-text-dim uppercase font-black tracking-widest font-bold">Total Amortizado (Pagado)</p>
                    <p className="text-2xl font-mono font-black text-emerald-400 mt-1 italic">${bankStats.totalPaid.toLocaleString('es-AR')}</p>
                    <p className="text-[8px] text-text-dim mt-2 uppercase font-bold">Cuotas canceladas irrevocablemente</p>
                  </div>
                  <div className="bg-bg-card border border-border-dim p-6 rounded-xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                      <Clock size={54} className="text-[#8B949E]" />
                    </div>
                    <p className="text-[9px] text-text-dim uppercase font-black tracking-widest font-black">Rendimiento de Cuotas</p>
                    <p className="text-2xl font-mono font-black text-text-main mt-1 italic">
                      {bankStats.countPaid} / {bankStats.countPending + bankStats.countPaid}
                    </p>
                    <p className="text-[8px] text-text-dim mt-2 uppercase font-bold">Cuotas pagadas del total registrado</p>
                  </div>
                </div>

                {/* Main widescreen Table */}
                <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden shadow-2xl">
                  <div className="p-6 border-b border-border-dim flex flex-wrap justify-between items-center gap-4 bg-bg-accent/10">
                    <div className="flex items-center gap-3">
                      <Building2 size={22} className="text-brand-500 animate-pulse" />
                      <div>
                        <h3 className="text-xs font-black uppercase text-text-main tracking-widest">Cartera de Pasivos Bancarios</h3>
                        <p className="text-[9px] text-text-dim font-bold uppercase mt-0.5">Control de Préstamos y cuotas de financiamiento comercial</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setTempCuotas([]);
                        setShowBankLoteModal(true);
                      }}
                      className="bg-brand-500 hover:bg-brand-600 text-black px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-1.5"
                    >
                      <Plus size={14} strokeWidth={3} /> Cargar Préstamo en Cuotas
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                      <thead>
                        <tr className="bg-bg-accent/40 border-b border-border-dim text-[9px] font-black text-text-dim uppercase tracking-wider">
                          <th className="px-5 py-4">Banco</th>
                          <th className="px-5 py-4 text-center">Solicitud</th>
                          <th className="px-5 py-4 text-right">Solicitado</th>
                          <th className="px-5 py-4">Destino</th>
                          <th className="px-5 py-4 text-center">Tasa TNA/TEM</th>
                          <th className="px-5 py-4 text-center">N° Cuota</th>
                          <th className="px-5 py-4 text-right">Importe Cuota</th>
                          <th className="px-5 py-4 text-center">Vencimiento</th>
                          <th className="px-5 py-4 text-center">Estado Pago</th>
                          <th className="px-5 py-4 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-dim/50 font-mono text-[11px]">
                        {searchedPayments.length === 0 ? (
                          <tr>
                            <td colSpan={10} className="text-center py-12 text-text-dim uppercase font-black tracking-widest text-[10px]">
                              No se encontraron pasivos bancarios registrados
                            </td>
                          </tr>
                        ) : (
                          searchedPayments.map(pay => (
                            <tr key={pay.id} className="hover:bg-bg-accent/10 transition-colors">
                              <td className="px-5 py-3.5 font-black text-text-main uppercase">{pay.bank || 'MOCK BANCO'}</td>
                              <td className="px-5 py-3.5 text-center text-text-dim">
                                {pay.requestDate ? new Date(pay.requestDate + 'T12:00:00').toLocaleDateString('es-AR') : 'S/D'}
                              </td>
                              <td className="px-5 py-3.5 text-right text-text-dim">
                                {pay.requestedAmount ? `$${pay.requestedAmount.toLocaleString('es-AR')}` : 'S/D'}
                              </td>
                              <td className="px-5 py-3.5 text-text-dim max-w-[180px] truncate" title={pay.destination || pay.description}>
                                {pay.destination || pay.description}
                              </td>
                              <td className="px-5 py-3.5 text-center text-text-dim font-bold">{pay.rate || 'S/D'}</td>
                              <td className="px-5 py-3.5 text-center text-brand-500 font-black">{pay.installmentNumber || '1 de 1'}</td>
                              <td className="px-5 py-3.5 text-right font-black text-text-main">${pay.amount.toLocaleString('es-AR')}</td>
                              <td className="px-5 py-3.5 text-center text-text-main font-bold">
                                {new Date(pay.dueDate + 'T12:00:00').toLocaleDateString('es-AR')}
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <button
                                  onClick={() => togglePaymentPaid(pay.id)}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-tighter border transition-all",
                                    pay.status === 'paid' 
                                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                                      : "bg-orange-500/10 border-orange-500/20 text-brand-500 animate-pulse"
                                  )}
                                >
                                  {pay.status === 'paid' ? (
                                    <>
                                      <CheckCircle2 size={12} /> PAGADA
                                    </>
                                  ) : (
                                    <>
                                      <Clock size={12} /> PENDIENTE
                                    </>
                                  )}
                                </button>
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <button
                                  onClick={() => handleDeletePayment(pay.id)}
                                  className="text-text-dim hover:text-red-500 transition-colors p-1"
                                  title="Eliminar cuota"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : mode === 'tax' ? (
              /* =========================================================================
                 PASIVOS FISCALES (MODE = TAX)
                 ========================================================================= */
              <div className="space-y-6">
                {/* Visual Stats Bento */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-bg-card border border-border-dim p-6 rounded-xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                      <DollarSign size={54} className="text-brand-500" />
                    </div>
                    <p className="text-[9px] text-text-dim uppercase font-black tracking-widest">Impuestos Pendientes</p>
                    <p className="text-2xl font-mono font-black text-brand-500 mt-1 italic">${taxStats.totalPending.toLocaleString('es-AR')}</p>
                    <p className="text-[8px] text-text-dim mt-2 uppercase font-bold">Total a devengar en planes y vencimientos</p>
                  </div>
                  <div className="bg-bg-card border border-border-dim p-6 rounded-xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                      <CheckCircle2 size={54} className="text-emerald-500" />
                    </div>
                    <p className="text-[9px] text-text-dim uppercase font-black tracking-widest font-bold">Impuestos Abonados</p>
                    <p className="text-2xl font-mono font-black text-emerald-400 mt-1 italic">${taxStats.totalPaid.toLocaleString('es-AR')}</p>
                    <p className="text-[8px] text-text-dim mt-2 uppercase font-bold">Carga tributaria ingresada/pagada</p>
                  </div>
                  <div className="bg-bg-card border border-border-dim p-6 rounded-xl shadow-lg relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-4 opacity-5">
                      <Clock size={54} className="text-[#8B949E]" />
                    </div>
                    <p className="text-[9px] text-text-dim uppercase font-black tracking-widest font-black">Cumplimiento Planes</p>
                    <p className="text-2xl font-mono font-black text-text-main mt-1 italic">
                      {taxStats.countPaid} / {taxStats.countPending + taxStats.countPaid}
                    </p>
                    <p className="text-[8px] text-text-dim mt-2 uppercase font-bold">Vencimientos liquidados con éxito</p>
                  </div>
                </div>

                {/* Main widescreen Table */}
                <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden shadow-2xl">
                  <div className="p-6 border-b border-border-dim flex flex-wrap justify-between items-center gap-4 bg-bg-accent/10">
                    <div className="flex items-center gap-3">
                      <Calculator size={22} className="text-brand-500 animate-pulse" />
                      <div>
                        <h3 className="text-xs font-black uppercase text-text-main tracking-widest">Planes Fiscales e Impuestos</h3>
                        <p className="text-[9px] text-text-dim font-bold uppercase mt-0.5">Control fiscal integral nacional, provincial y municipal (ARCA, ARBA, etc.)</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => {
                        setTempCuotas([]);
                        setShowTaxLoteModal(true);
                      }}
                      className="bg-brand-500 hover:bg-brand-600 text-black px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all shadow-lg flex items-center gap-1.5"
                    >
                      <Plus size={14} strokeWidth={3} /> Cargar Plan en Lote
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse whitespace-nowrap">
                      <thead>
                        <tr className="bg-bg-accent/40 border-b border-border-dim text-[9px] font-black text-text-dim uppercase tracking-wider">
                          <th className="px-5 py-4">Entidad</th>
                          <th className="px-5 py-4">Impuesto (Tasa)</th>
                          <th className="px-5 py-4 text-right">Importe Total Plan</th>
                          <th className="px-5 py-4 text-center">N° de Plan</th>
                          <th className="px-5 py-4 text-center">N° de Cuota</th>
                          <th className="px-5 py-4 text-right">Importe de Cuota</th>
                          <th className="px-5 py-4 text-center">Vencimiento Pago</th>
                          <th className="px-5 py-4 text-center">Estado Pago</th>
                          <th className="px-5 py-4 text-center">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-dim/50 font-mono text-[11px]">
                        {searchedPayments.length === 0 ? (
                          <tr>
                            <td colSpan={9} className="text-center py-12 text-text-dim uppercase font-black tracking-widest text-[10px]">
                              No se encontraron pasivos fiscales registrados
                            </td>
                          </tr>
                        ) : (
                          searchedPayments.map(pay => (
                            <tr key={pay.id} className="hover:bg-bg-accent/10 transition-colors">
                              <td className="px-5 py-3.5 font-black text-text-main uppercase">{pay.entity || 'AFIP / ARCA'}</td>
                              <td className="px-5 py-3.5 font-bold text-brand-400 uppercase">{pay.taxType || pay.description}</td>
                              <td className="px-5 py-3.5 text-right text-text-dim">
                                {pay.totalAmount ? `$${pay.totalAmount.toLocaleString('es-AR')}` : 'S/D'}
                              </td>
                              <td className="px-5 py-3.5 text-center text-text-dim font-bold">{pay.paymentPlanNumber || 'CORRIENTE'}</td>
                              <td className="px-5 py-3.5 text-center text-brand-500 font-black">{pay.installmentNumber || '1 de 1'}</td>
                              <td className="px-5 py-3.5 text-right font-black text-text-main">${pay.amount.toLocaleString('es-AR')}</td>
                              <td className="px-5 py-3.5 text-center text-text-main font-bold">
                                {new Date(pay.dueDate + 'T12:00:00').toLocaleDateString('es-AR')}
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <button
                                  onClick={() => togglePaymentPaid(pay.id)}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-tighter border transition-all",
                                    pay.status === 'paid' 
                                      ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                                      : "bg-orange-500/10 border-orange-500/20 text-brand-500 animate-pulse"
                                  )}
                                >
                                  {pay.status === 'paid' ? (
                                    <>
                                      <CheckCircle2 size={12} /> PAGADA
                                    </>
                                  ) : (
                                    <>
                                      <Clock size={12} /> PENDIENTE
                                    </>
                                  )}
                                </button>
                              </td>
                              <td className="px-5 py-3.5 text-center">
                                <button
                                  onClick={() => handleDeletePayment(pay.id)}
                                  className="text-text-dim hover:text-red-500 transition-colors p-1"
                                  title="Eliminar cuota fiscal"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
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
                  {filteredPayments.map(pay => (
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
                          ${filteredPayments.filter(p => p.status !== 'paid').reduce((a, b) => a + b.amount, 0).toLocaleString()}
                        </p>
                      </div>
                      <p className="text-[9px] text-text-dim uppercase font-bold mb-1">
                         {filteredPayments.filter(p => p.status !== 'paid').length} Pagos
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
            )}
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
              className="relative w-full max-w-4xl max-h-[85vh] bg-bg-card border border-border-dim rounded-lg shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-border-dim flex justify-between items-center bg-bg-accent/50 shrink-0">
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

              <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar">
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
                        <option key={item.id} value={item.id}>
                          {(item as any).subrubro} - {item.name}
                        </option>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    {ACCOUNTS.map(account => {
                      const value = newEntry.amounts[account.id] || 0;
                      // Format display as $ 25.000.000
                      const displayValue = value === 0 ? '' : value.toLocaleString('es-AR');
                      
                      return (
                        <div key={account.id} className="bg-bg-accent/40 p-5 rounded border border-border-dim flex flex-col gap-3 group focus-within:border-brand-500 transition-all">
                          <div className="flex items-center gap-3">
                            <div className={cn("p-1.5 bg-bg-card rounded shadow-sm", account.color)}>
                              <account.icon size={14} />
                            </div>
                            <p className="text-[9px] font-black uppercase text-text-dim tracking-widest">{account.name}</p>
                          </div>
                          <div className="relative flex items-center">
                            <span className="text-text-dim text-xl font-mono mr-2 opacity-30">$</span>
                            <input 
                              type="text"
                              inputMode="numeric"
                              className={cn(
                                "w-full bg-transparent border-none p-0 text-2xl font-mono font-black outline-none focus:ring-0",
                                value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-text-main"
                              )}
                              placeholder="0"
                              value={displayValue}
                              onChange={(e) => {
                                // Remove non-numeric characters
                                const raw = e.target.value.replace(/\D/g, '');
                                const numValue = parseInt(raw) || 0;
                                
                                setNewEntry({
                                  ...newEntry, 
                                  amounts: { ...newEntry.amounts, [account.id]: numValue }
                                });
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="p-6 bg-bg-accent/50 border-t border-border-dim flex justify-end gap-3 shrink-0">
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
                    await new Promise(resolve => setTimeout(resolve, 800));
                    
                    const entry: FinanceEntry = {
                      id: `entry_${Date.now()}`,
                      date: new Date().toISOString().split('T')[0],
                      itemId: newEntry.itemId,
                      amounts: newEntry.amounts,
                      isExecuted: false,
                      description: newEntry.description
                    };

                    setEntries([...entries, entry]);
                    setIsSaving(false);
                    setShowEntryModal(false);
                    setNewEntry({
                      description: '',
                      categoryId: FINANCE_CATEGORIES[0].id,
                      itemId: FINANCE_CATEGORIES[0].items[0].id,
                      type: 'expense' as 'income' | 'expense',
                      amounts: ACCOUNTS.reduce((acc, account) => ({ ...acc, [account.id]: 0 }), {}) as Record<string, number>
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

      {/* =========================================================================
         MODAL: CARGA DE PRÉSTAMOS BANCARIOS EN LOTE (CUOTAS)
         ========================================================================= */}
      <AnimatePresence>
        {showBankLoteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBankLoteModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-4xl max-h-[90vh] bg-bg-card border border-border-dim rounded-xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-border-dim bg-bg-accent/40 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <Building2 className="text-brand-500 animate-pulse" size={20} />
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-text-main">Cargar Financiamiento Comercial</h3>
                    <p className="text-[9px] text-text-dim font-bold uppercase mt-0.5">Generación automática de cuotas consecutivas amortizadas</p>
                  </div>
                </div>
                <button onClick={() => setShowBankLoteModal(false)} className="text-text-dim hover:text-text-main transition-colors p-1">
                  <X size={18} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto space-y-6 custom-scrollbar text-[11px]">
                {/* Form parameters */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Entidad (Banco)</label>
                    <input 
                      id="b-bank" 
                      type="text" 
                      placeholder="Ej: BBVA Frances" 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 font-mono text-xs uppercase" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Fecha de Solicitud</label>
                    <input 
                      id="b-reqdate" 
                      type="date" 
                      defaultValue={new Date().toISOString().split('T')[0]} 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 font-mono text-xs" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Importe Solicitado ($)</label>
                    <input 
                      id="b-requested" 
                      type="number" 
                      placeholder="15000000" 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 font-mono text-xs" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Tasa (TNA / TEM)</label>
                    <input 
                      id="b-rate" 
                      type="text" 
                      placeholder="Ej: 72% TNA" 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 font-mono text-xs font-bold" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2 space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Destino de Fondos</label>
                    <input 
                      id="b-destination" 
                      type="text" 
                      placeholder="Ej: Compra de Hornos y reformas Salón Yerba Buena" 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 text-xs font-bold" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Cuotas a Pagar</label>
                    <input 
                      id="b-installments" 
                      type="number" 
                      placeholder="12" 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 font-mono text-xs font-black text-brand-500" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Importe de Cada Cuota ($)</label>
                    <input 
                      id="b-instamount" 
                      type="number" 
                      placeholder="1750000" 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 font-mono text-xs font-black text-emerald-400" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Fecha Primer Vencimiento</label>
                    <input 
                      id="b-firstdue" 
                      type="date" 
                      defaultValue={new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().split('T')[0]} 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 font-mono text-xs text-brand-400" 
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => {
                        const bank = (document.getElementById('b-bank') as HTMLInputElement).value || 'BANCO';
                        const reqDate = (document.getElementById('b-reqdate') as HTMLInputElement).value;
                        const requested = parseFloat((document.getElementById('b-requested') as HTMLInputElement).value) || 0;
                        const rate = (document.getElementById('b-rate') as HTMLInputElement).value || 'S/D';
                        const dest = (document.getElementById('b-destination') as HTMLInputElement).value || 'Préstamo';
                        const count = parseInt((document.getElementById('b-installments') as HTMLInputElement).value) || 0;
                        const instAmt = parseFloat((document.getElementById('b-instamount') as HTMLInputElement).value) || 0;
                        const firstDue = (document.getElementById('b-firstdue') as HTMLInputElement).value;

                        if (count <= 0 || instAmt <= 0) {
                          alert('Indique una cantidad de cuotas e importe válidos.');
                          return;
                        }

                        // Generate installments
                        const list: any[] = [];
                        let currentDate = new Date(firstDue + 'T12:00:00');
                        for (let i = 1; i <= count; i++) {
                          const dateString = currentDate.toISOString().split('T')[0];
                          list.push({
                            id: `temp_${Date.now()}_${i}`,
                            bank,
                            requestDate: reqDate,
                            requestedAmount: requested,
                            destination: dest,
                            rate,
                            installmentNumber: `${i} de ${count}`,
                            amount: instAmt,
                            dueDate: dateString,
                            status: 'pending',
                            category: 'loan'
                          });
                          // Increment by exactly 1 month
                          currentDate.setMonth(currentDate.getMonth() + 1);
                        }
                        setTempCuotas(list);
                      }}
                      className="bg-bg-accent hover:bg-bg-accent/80 border border-border-dim/80 text-text-main w-full py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                      Previsualizar Cronograma Amortizado
                    </button>
                  </div>
                </div>

                {/* Preview Table */}
                {tempCuotas.length > 0 && (
                  <div className="border border-border-dim/60 rounded-xl overflow-hidden shadow-lg bg-bg-accent/10">
                    <div className="p-4 bg-bg-accent/40 border-b border-border-dim font-black uppercase text-[9px] tracking-widest text-[#8B949E]">
                      HAGA DOBLE CLICK PARA EDITAR FECHAS O MONTOS SI DESEA CORREGIR DESVÍOS DEL PLAN COMERCIAL
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                      <table className="w-full text-left font-mono text-[11px] whitespace-nowrap">
                        <thead>
                          <tr className="bg-bg-accent/60 text-[9px] font-black text-text-dim uppercase border-b border-border-dim">
                            <th className="px-5 py-3">N° Cuota</th>
                            <th className="px-5 py-3">Prestamista</th>
                            <th className="px-5 py-3 text-right">Monto ($ ARS)</th>
                            <th className="px-5 py-3 text-center">Fecha de Pago (Vencimiento)</th>
                            <th className="px-5 py-3 text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-dim/40">
                          {tempCuotas.map((cuota, idx) => (
                            <tr key={cuota.id}>
                              <td className="px-5 py-2 font-black text-brand-500">{cuota.installmentNumber}</td>
                              <td className="px-5 py-2 uppercase font-bold text-text-dim">{cuota.bank}</td>
                              <td className="px-5 py-2 text-right">
                                <input 
                                  type="number" 
                                  value={cuota.amount}
                                  onChange={(e) => {
                                    const updated = [...tempCuotas];
                                    updated[idx].amount = parseFloat(e.target.value) || 0;
                                    setTempCuotas(updated);
                                  }}
                                  className="bg-bg-accent/60 outline-none text-right font-black border border-border-dim/40 rounded px-2.5 py-1 text-[11px] w-24 focus:border-brand-500" 
                                />
                              </td>
                              <td className="px-5 py-2 text-center text-text-dim">
                                <input 
                                  type="date" 
                                  value={cuota.dueDate}
                                  onChange={(e) => {
                                    const updated = [...tempCuotas];
                                    updated[idx].dueDate = e.target.value;
                                    setTempCuotas(updated);
                                  }}
                                  className="bg-bg-accent/60 outline-none text-center font-bold border border-border-dim/40 rounded px-2.5 py-1 text-[11px] focus:border-brand-500 text-brand-400" 
                                />
                              </td>
                              <td className="px-5 py-2 text-center">
                                <button 
                                  onClick={() => setTempCuotas(tempCuotas.filter(c => c.id !== cuota.id))}
                                  className="text-text-dim hover:text-red-500 transition-colors"
                                >
                                  Quitar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-bg-accent/50 border-t border-border-dim flex justify-end gap-3 shrink-0">
                <button 
                  onClick={() => setShowBankLoteModal(false)}
                  className="px-6 py-2.5 rounded text-[10px] font-black uppercase tracking-widest text-[#8B949E] hover:text-text-main transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    if (tempCuotas.length === 0) {
                      alert('Debe previsualizar e instanciar al menos una cuota.');
                      return;
                    }
                    const updated = [...payments, ...tempCuotas.map(c => ({
                      ...c,
                      id: `pay_${Date.now()}_${Math.random()}`
                    }))];
                    savePayments(updated);
                    setShowBankLoteModal(false);
                  }}
                  className="bg-brand-500 hover:bg-brand-600 font-black text-black px-8 py-2.5 rounded text-[10px] uppercase tracking-widest transition-all"
                >
                  Confirmar e Importar {tempCuotas.length} Cuotas
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =========================================================================
         MODAL: CARGA DE PLANES FISCALES EN LOTE
         ========================================================================= */}
      <AnimatePresence>
        {showTaxLoteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTaxLoteModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-4xl max-h-[90vh] bg-bg-card border border-border-dim rounded-xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-border-dim bg-bg-accent/40 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <Calculator className="text-emerald-400 animate-pulse" size={20} />
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-text-main">Cargar Plan de Pagos Fiscal</h3>
                    <p className="text-[9px] text-text-dim font-bold uppercase mt-0.5">Control tributario sistemático para obligaciones AFIP, Rentas, Comuna, etc.</p>
                  </div>
                </div>
                <button onClick={() => setShowTaxLoteModal(false)} className="text-text-dim hover:text-text-main transition-colors p-1">
                  <X size={18} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto space-y-6 custom-scrollbar text-[11px]">
                {/* Form fields */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Entidad Fiscal</label>
                    <select id="t-entity" className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 font-bold text-xs">
                      <option value="ARCA (AFIP)">ARCA (AFIP)</option>
                      <option value="Municipalidad YB">Municipalidad YB</option>
                      <option value="Subsidio de Salud">Subsidio de Salud</option>
                      <option value="Rentas Tucumán">Rentas Tucumán (DGR)</option>
                      <option value="ARBA">ARBA</option>
                      <option value="Sindicato Pastelero">Sindicato Pastelera</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Tipo de Impuesto</label>
                    <select id="t-taxtype" className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 font-bold text-xs">
                      <option value="IVA">IVA Débito/Saldos</option>
                      <option value="F931">Cargas Sociales F931</option>
                      <option value="Ingresos Brutos">Ingresos Brutos DGR</option>
                      <option value="Ganancias">Impuesto a las Ganancias</option>
                      <option value="Multas">Multas / Infracciones</option>
                      <option value="Tasa de Comercio">Tasa de Comercio TEM YB</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Importe Total del Plan ($)</label>
                    <input 
                      id="t-total" 
                      type="number" 
                      placeholder="8500000" 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 font-mono text-xs" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">N° Plan de Pagos / Expediente</label>
                    <input 
                      id="t-plannumber" 
                      type="text" 
                      placeholder="Ej: Plan 4242132" 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 font-mono text-xs uppercase font-bold" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Cantidad de Cuotas</label>
                    <input 
                      id="t-installments" 
                      type="number" 
                      placeholder="6" 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 font-mono text-xs font-black text-brand-500" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Importe de la Cuota ($)</label>
                    <input 
                      id="t-instamount" 
                      type="number" 
                      placeholder="1450000" 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 font-mono text-xs font-black text-emerald-400" 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Primer Vencimiento de Cuota</label>
                    <input 
                      id="t-firstdue" 
                      type="date" 
                      defaultValue={new Date().toISOString().split('T')[0]} 
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 font-mono text-xs text-brand-400" 
                    />
                  </div>
                </div>

                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      const entity = (document.getElementById('t-entity') as HTMLSelectElement).value;
                      const taxType = (document.getElementById('t-taxtype') as HTMLSelectElement).value;
                      const totalAmount = parseFloat((document.getElementById('t-total') as HTMLInputElement).value) || 0;
                      const planNumber = (document.getElementById('t-plannumber') as HTMLInputElement).value || 'EXP-TEMP';
                      const count = parseInt((document.getElementById('t-installments') as HTMLInputElement).value) || 0;
                      const instAmt = parseFloat((document.getElementById('t-instamount') as HTMLInputElement).value) || 0;
                      const firstDue = (document.getElementById('t-firstdue') as HTMLInputElement).value;

                      if (count <= 0 || instAmt <= 0) {
                        alert('Indique cuotas e importes válidos para el fraccionamiento fiscal.');
                        return;
                      }

                      const list: any[] = [];
                      let currentDate = new Date(firstDue + 'T12:00:00');
                      for (let i = 1; i <= count; i++) {
                        const dateString = currentDate.toISOString().split('T')[0];
                        list.push({
                          id: `temp_tax_${Date.now()}_${i}`,
                          entity,
                          taxType,
                          description: `${taxType} - Plan de Pagos`,
                          totalAmount,
                          paymentPlanNumber: planNumber,
                          installmentNumber: `${i} de ${count}`,
                          amount: instAmt,
                          dueDate: dateString,
                          status: 'pending',
                          category: 'tax'
                        });
                        currentDate.setMonth(currentDate.getMonth() + 1);
                      }
                      setTempCuotas(list);
                    }}
                    className="bg-bg-accent hover:bg-bg-accent/80 border border-border-dim/80 text-text-main px-6 py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all w-full"
                  >
                    Calcular Amortización Fiscal / Generar
                  </button>
                </div>

                {/* Temp Tax List */}
                {tempCuotas.length > 0 && (
                  <div className="border border-border-dim/60 rounded-xl overflow-hidden shadow-lg bg-bg-accent/10">
                    <div className="p-4 bg-bg-accent/40 border-b border-border-dim font-black uppercase text-[9px] tracking-widest text-[#8B949E]">
                      REVISE LAS CUOTAS GENERADAS Y EDITE FECHAS ANTES DE CONFIRMAR EN LA CARTERA PRINCIPAL
                    </div>
                    <div className="max-h-[300px] overflow-y-auto">
                      <table className="w-full text-left font-mono text-[11px] whitespace-nowrap">
                        <thead>
                          <tr className="bg-bg-accent/60 text-[9px] font-black text-text-dim uppercase border-b border-border-dim">
                            <th className="px-5 py-3">Impuesto / Tributo</th>
                            <th className="px-5 py-3">Plan N°</th>
                            <th className="px-5 py-3">Número Cuota</th>
                            <th className="px-5 py-3 text-right">Monto Cuota ($)</th>
                            <th className="px-5 py-3 text-center">Fecha de Pago (Vto)</th>
                            <th className="px-5 py-3 text-center">Acciones</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-dim/40">
                          {tempCuotas.map((cuota, idx) => (
                            <tr key={cuota.id}>
                              <td className="px-5 py-2 uppercase font-black text-brand-400">{cuota.taxType}</td>
                              <td className="px-5 py-2 text-text-dim">{cuota.paymentPlanNumber}</td>
                              <td className="px-5 py-2 text-center text-text-main font-bold">{cuota.installmentNumber}</td>
                              <td className="px-5 py-2 text-right">
                                <input 
                                  type="number" 
                                  value={cuota.amount}
                                  onChange={(e) => {
                                    const updated = [...tempCuotas];
                                    updated[idx].amount = parseFloat(e.target.value) || 0;
                                    setTempCuotas(updated);
                                  }}
                                  className="bg-bg-accent/60 outline-none text-right font-black border border-border-dim/40 rounded px-2.5 py-1 text-[11px] w-24 focus:border-brand-500" 
                                />
                              </td>
                              <td className="px-5 py-2 text-center">
                                <input 
                                  type="date" 
                                  value={cuota.dueDate}
                                  onChange={(e) => {
                                    const updated = [...tempCuotas];
                                    updated[idx].dueDate = e.target.value;
                                    setTempCuotas(updated);
                                  }}
                                  className="bg-bg-accent/60 outline-none text-center font-bold border border-border-dim/40 rounded px-2.5 py-1 text-[11px] focus:border-brand-500 text-brand-400" 
                                />
                              </td>
                              <td className="px-5 py-2 text-center">
                                <button 
                                  onClick={() => setTempCuotas(tempCuotas.filter(c => c.id !== cuota.id))}
                                  className="text-text-dim hover:text-red-500 transition-colors"
                                >
                                  Quitar
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-bg-accent/50 border-t border-border-dim flex justify-end gap-3 shrink-0">
                <button 
                  onClick={() => setShowTaxLoteModal(false)}
                  className="px-6 py-2.5 rounded text-[10px] font-black uppercase tracking-widest text-[#8B949E] hover:text-text-main transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    if (tempCuotas.length === 0) {
                      alert('Instancie primero las cuotas del plan fiscal.');
                      return;
                    }
                    const updated = [...payments, ...tempCuotas.map(c => ({
                      ...c,
                      id: `pay_${Date.now()}_${Math.random()}`
                    }))];
                    savePayments(updated);
                    setShowTaxLoteModal(false);
                  }}
                  className="bg-brand-500 hover:bg-brand-600 font-black text-black px-8 py-2.5 rounded text-[10px] uppercase tracking-widest transition-all"
                >
                  Registrar e Ingresar {tempCuotas.length} Cuotas
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* =========================================================================
         MODAL: IMPORTACIÓN COMPLETA DESDE EXCEL / PORTAPAPELES (CLIPBOARD TEXT TXT)
         ========================================================================= */}
      <AnimatePresence>
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowImportModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              className="relative w-full max-w-4xl max-h-[90vh] bg-bg-card border border-border-dim rounded-xl shadow-2xl overflow-hidden flex flex-col"
            >
              <div className="p-6 border-b border-border-dim bg-bg-accent/40 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="text-emerald-400" size={20} />
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-text-main">Asistente de Importación Excel / CSV</h3>
                    <p className="text-[9px] text-text-dim font-bold uppercase mt-0.5">Copie y pegue directamente las celdas de sus planillas de cálculo</p>
                  </div>
                </div>
                <button onClick={() => setShowImportModal(false)} className="text-text-dim hover:text-text-main transition-colors p-1">
                  <X size={18} />
                </button>
              </div>

              <div className="p-8 overflow-y-auto space-y-6 custom-scrollbar text-[11px]">
                <div className="bg-bg-accent/40 p-4 rounded border border-border-dim/40 leading-relaxed text-text-dim">
                  <p className="font-bold text-text-main uppercase text-[9px] tracking-widest mb-1">Pasos Rápidos:</p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>Abra su archivo Excel o Planilla de Google Sheets.</li>
                    <li>Seleccione las columnas deseadas y su contenido con el mouse, luego oprima <strong className="text-brand-500 font-mono">CTRL + C</strong>.</li>
                    <li>Oprima <strong className="text-brand-500 font-mono">CTRL + V</strong> en el cuadro inferior y haga click en <strong className="text-brand-400 font-bold uppercase">Procesar Portapapeles</strong>.</li>
                  </ol>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">ZONA DE PEGO (TEXTO EN FORMATO DE TABULACIÓN)</label>
                  <textarea 
                    value={importRawText}
                    onChange={(e) => setImportRawText(e.target.value)}
                    placeholder="Banco	Fecha Solicitud	Importe Solicitado	Destino	Tasa	Cuota	Monto Cuota	Fecha Vencimiento&#10;BBVA	2024-04-10	10000000	Reformas	85%	1 de 6	1800000	2024-05-10&#10;BBVA	2024-04-10	10000000	Reformas	85%	2 de 6	1800000	2024-06-10"
                    className="w-full bg-bg-accent border border-border-dim rounded p-4 font-mono text-xs text-text-main h-44 outline-none focus:border-brand-500"
                  />
                </div>

                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => {
                      if (!importRawText.trim()) {
                        alert('Por favor copie y pegue su hoja de datos primero.');
                        return;
                      }
                      const rows = importRawText.split('\n').map(r => r.trim()).filter(Boolean);
                      const parsed = rows.map(r => r.split('\t').map(cell => cell.trim()));
                      if (parsed.length === 0) return;
                      
                      // Identify column indexes automatically
                      const headers = parsed[0].map(h => h.toLowerCase().trim());
                      const idxMap: Record<string, number> = {};
                      
                      const mapField = (field: string, synonyms: string[]) => {
                        const index = headers.findIndex(h => synonyms.some(syn => h.includes(syn)));
                        if (index !== -1) idxMap[field] = index;
                      };

                      if (mode === 'bank') {
                        mapField('bank', ['banco', 'entidad', 'prestamo']);
                        mapField('requestDate', ['solicitud', 'fecha sol']);
                        mapField('requestedAmount', ['solicitado', 'importe sol', 'monto prestamo']);
                        mapField('destination', ['destino', 'uso']);
                        mapField('rate', ['tasa', 'tna', 'tem', 'porcent']);
                        mapField('installmentNumber', ['cuota', 'nro cuota']);
                        mapField('amount', ['importe cuota', 'monto cuota', 'mensual', 'importe', 'monto']);
                        mapField('dueDate', ['vencimiento', 'fecha vto', 'vto pago', 'fecha_vto']);
                      } else {
                        mapField('entity', ['entidad', 'organismo', 'arca', 'afip', 'rentas']);
                        mapField('taxType', ['impuesto', 'tasa', 'tributo', 'concepto']);
                        mapField('totalAmount', ['importe total', 'monto total', 'total plan']);
                        mapField('paymentPlanNumber', ['plan de pagos', 'plan de pago', 'nro plan', 'n° de plan']);
                        mapField('installmentNumber', ['cuota', 'nro cuota', 'cuota n']);
                        mapField('amount', ['importe cuota', 'monto cuota', 'mensual', 'cuota total', 'importe', 'monto']);
                        mapField('dueDate', ['vencimiento', 'fecha vto', 'vto pago', 'fecha_vto']);
                      }
                      
                      setColumnMapping(idxMap);
                      setParsedData(parsed);
                    }}
                    className="bg-bg-accent hover:bg-bg-accent/80 border border-border-dim/80 text-text-main px-6 py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all w-full"
                  >
                    Procesar Portapapeles y Asignar Columnas
                  </button>
                </div>

                {parsedData && (
                  <div className="space-y-4">
                    <p className="font-black uppercase text-[9px] text-[#8B949E] tracking-widest border-b border-border-dim pb-2">
                      Filas Detectadas para Importar ({parsedData.length - 1} registros detectados, ignorando Cabecera)
                    </p>
                    <div className="max-h-[250px] overflow-y-auto border border-border-dim/60 rounded-xl">
                      <table className="w-full text-left font-mono text-[10px]">
                        <thead>
                          <tr className="bg-bg-accent/60 text-text-dim uppercase border-b border-border-dim">
                            {parsedData[0].map((header, idx) => (
                              <th key={idx} className="px-3 py-2 text-center">
                                <span className="block text-[8px] opacity-60 text-text-dim text-center">Encabezado</span>
                                <span className="block font-black text-text-main text-[11px] mb-1.5 uppercase">{header}</span>
                                <select
                                  value={Object.keys(columnMapping).find(k => columnMapping[k] === idx) || 'ignore'}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    const updated = { ...columnMapping };
                                    if (val === 'ignore') {
                                      Object.keys(updated).forEach(k => { if (updated[k] === idx) delete updated[k]; });
                                    } else {
                                      updated[val] = idx;
                                    }
                                    setColumnMapping(updated);
                                  }}
                                  className="bg-bg-card border border-border-dim text-[9px] uppercase font-bold text-brand-500 rounded px-1.5 py-0.5 outline-none focus:border-brand-500 max-w-[120px]"
                                >
                                  <option value="ignore">Ignorar Columna</option>
                                  {mode === 'bank' ? (
                                    <>
                                      <option value="bank">Banco</option>
                                      <option value="requestDate">Fecha Solicitud</option>
                                      <option value="requestedAmount">Importe Solicitado</option>
                                      <option value="destination">Destino</option>
                                      <option value="rate">Tasa</option>
                                      <option value="installmentNumber">Cuota N°</option>
                                      <option value="amount">Monto Cuota</option>
                                      <option value="dueDate">Vencimiento</option>
                                    </>
                                  ) : (
                                    <>
                                      <option value="entity">Entidad</option>
                                      <option value="taxType">Impuesto</option>
                                      <option value="totalAmount">Importe Total Plan</option>
                                      <option value="paymentPlanNumber">N° de Plan</option>
                                      <option value="installmentNumber">Cuota N°</option>
                                      <option value="amount">Monto Cuota</option>
                                      <option value="dueDate">Vencimiento</option>
                                    </>
                                  )}
                                </select>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-dim/40 max-h-[140px] overflow-y-auto">
                          {parsedData.slice(1, 10).map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-bg-accent/10 whitespace-nowrap">
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className="px-3 py-1.5 text-center text-text-dim select-all">
                                  {cell || <span className="opacity-20">-</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                          {parsedData.length > 10 && (
                            <tr>
                              <td colSpan={parsedData[0].length} className="text-center py-2 text-[9px] uppercase text-brand-500 font-bold tracking-widest italic bg-bg-accent/20">
                                ... y {parsedData.length - 11} filas más se importarán con estos mapas de columna ...
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 bg-bg-accent/50 border-t border-border-dim flex justify-end gap-3 shrink-0">
                <button 
                  onClick={() => setShowImportModal(false)}
                  className="px-6 py-2.5 rounded text-[10px] font-black uppercase tracking-widest text-[#8B949E] hover:text-text-main transition-all"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => {
                    if (!parsedData || parsedData.length <= 1) {
                      alert('Primero cargue y procese el portapapeles.');
                      return;
                    }
                    if (columnMapping['amount'] === undefined || columnMapping['dueDate'] === undefined) {
                      alert('Las columnas de "Importe de la cuota" y "Vencimiento" son obligatorias para sincronizar vencimientos.');
                      return;
                    }

                    const listToImport: any[] = [];
                    const rows = parsedData.slice(1);
                    
                    rows.forEach((row, rIdx) => {
                      if (row.length === 0 || row.join('').trim() === '') return;
                      
                      const getValue = (field: string) => {
                        const index = columnMapping[field];
                        return index !== undefined ? row[index] : '';
                      };

                      const parsedAmount = parseFloat((getValue('amount') || '').replace(/[^0-9.-]+/g, '')) || 0;
                      // Try to fix due date format
                      let parsedDue = getValue('dueDate') || '';
                      if (parsedDue.includes('/')) {
                        const parts = parsedDue.split('/');
                        if (parts[2]?.length === 4) {
                          // dd/mm/yyyy -> yyyy-mm-dd
                          parsedDue = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                        }
                      }

                      if (mode === 'bank') {
                        const bank = getValue('bank') || 'MOCK BANCO';
                        const reqDate = getValue('requestDate') || new Date().toISOString().split('T')[0];
                        const reqAmount = parseFloat((getValue('requestedAmount') || '').replace(/[^0-9.-]+/g, '')) || 0;
                        const destination = getValue('destination') || 'Financiamiento General';
                        const rate = getValue('rate') || 'S/D';
                        const instNum = getValue('installmentNumber') || '1 de 1';

                        listToImport.push({
                          id: `imported_${Date.now()}_${rIdx}_${Math.random()}`,
                          bank,
                          requestDate: reqDate,
                          requestedAmount: reqAmount,
                          destination,
                          rate,
                          installmentNumber: instNum,
                          amount: parsedAmount,
                          dueDate: parsedDue,
                          status: 'pending',
                          category: 'loan'
                        });
                      } else {
                        const entity = getValue('entity') || 'ARCA (AFIP)';
                        const taxType = getValue('taxType') || 'Otros Tributos';
                        const totalAmount = parseFloat((getValue('totalAmount') || '').replace(/[^0-9.-]+/g, '')) || 0;
                        const planNum = getValue('paymentPlanNumber') || 'CORRIENTE';
                        const instNum = getValue('installmentNumber') || '1 de 1';

                        listToImport.push({
                          id: `imported_${Date.now()}_${rIdx}_${Math.random()}`,
                          entity,
                          taxType,
                          description: `${taxType} - Plan de Pagos`,
                          totalAmount,
                          paymentPlanNumber: planNum,
                          installmentNumber: instNum,
                          amount: parsedAmount,
                          dueDate: parsedDue,
                          status: 'pending',
                          category: 'tax'
                        });
                      }
                    });

                    const updated = [...payments, ...listToImport];
                    savePayments(updated);
                    setShowImportModal(false);
                    alert(`Éxito: Se importaron ${listToImport.length} vencimientos a su cronograma de obligaciones.`);
                  }}
                  className="bg-brand-500 hover:bg-brand-600 font-black text-black px-8 py-2.5 rounded text-[10px] uppercase tracking-widest transition-all"
                >
                  Importar y Guardar {parsedData ? parsedData.length - 1 : 0} Registros
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </motion.div>
  );
}
