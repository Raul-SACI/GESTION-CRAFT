/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import PaymentCalendar from './PaymentCalendar';
import * as XLSX from 'xlsx';
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
  Download,
  FileSpreadsheet,
  Search
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Branch, ScheduledPayment, FinanceCategory, FinanceEntry } from '../types';
import { supabase } from '../lib/supabase';

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

const DEFAULT_TAX_ENTITIES = [
  { value: "ARCA (AFIP)", label: "ARCA (AFIP)" },
  { value: "Municipalidad YB", label: "Municipalidad YB" },
  { value: "Subsidio de Salud", label: "Subsidio de Salud" },
  { value: "Rentas Tucumán", label: "Rentas Tucumán (DGR)" },
  { value: "ARBA", label: "ARBA" },
  { value: "Sindicato Pastelero", label: "Sindicato Pastelera" }
];

const DEFAULT_TAX_TYPES = [
  { value: "IVA", label: "IVA Débito/Saldos" },
  { value: "F931", label: "Cargas Sociales F931" },
  { value: "Ingresos Brutos", label: "Ingresos Brutos DGR" },
  { value: "Ganancias", label: "Impuesto a las Ganancias" },
  { value: "Multas", label: "Multas / Infracciones" },
  { value: "Tasa de Comercio", label: "Tasa de Comercio TEM YB" }
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
  mode = 'default',
  isReadOnly = false
}: { 
  branches: Branch[], 
  selectedBranchId: string,
  mode?: 'default' | 'bank' | 'tax',
  isReadOnly?: boolean
}) {
  const today = useMemo(() => new Date(), []);
  const lastWeek = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d;
  }, []);

  const [activeSubTab, setActiveSubTab] = useState<'flow' | 'payments'>(mode === 'default' ? 'flow' : 'payments');
  const [periodType, setPeriodType] = useState<'weekly' | 'monthly'>('weekly');
  const [currentDateStr, setCurrentDateStr] = useState('2026-05-24');
  
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

  const savePayments = async (newPayments: ScheduledPayment[]) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setPayments(newPayments);
    localStorage.setItem('craft_scheduled_payments', JSON.stringify(newPayments));
    // Sincronizar con Supabase
    try {
      await supabase.from('payment_schedule').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      const upsert = newPayments.map(p => ({
        provider: p.description,
        date: p.dueDate,
        amount: p.amount,
        status: p.status,
        category: p.category,
        notes: JSON.stringify({ bank: p.bank, entity: p.entity, taxType: p.taxType, installmentNumber: p.installmentNumber })
      }));
      if (upsert.length > 0) await supabase.from('payment_schedule').insert(upsert);
    } catch(e) { console.error('Supabase sync error:', e); }
  };

  // Descargar planilla modelo de importación según el modo (bank / tax)
  const handleDownloadModel = () => {
    let templateData: any[] = [];
    let fileName = 'Modelo_Pasivos.xlsx';
    if (mode === 'bank') {
      fileName = 'Modelo_Pasivos_Bancarios.xlsx';
      templateData = [
        { 'BANCO': 'BBVA', 'FECHA SOLICITUD': '01-03-2026', 'MONTO SOLICITADO': 5400000, 'DESTINO': 'Capital de Trabajo', 'TASA': '85% TNA', 'CUOTA N°': '4 de 12', 'IMPORTE CUOTA': 450000, 'VENCIMIENTO': '20-05-2026' },
        { 'BANCO': 'Santander', 'FECHA SOLICITUD': '15-01-2026', 'MONTO SOLICITADO': 2100000, 'DESTINO': 'Compra de Equipamiento', 'TASA': '90% TNA', 'CUOTA N°': '2 de 6', 'IMPORTE CUOTA': 350000, 'VENCIMIENTO': '18-05-2026' }
      ];
    } else {
      fileName = 'Modelo_Pasivos_Fiscales.xlsx';
      templateData = [
        { 'ENTIDAD': 'ARCA (AFIP)', 'TIPO DE IMPUESTO': 'IVA', 'MONTO TOTAL': 2800000, 'PLAN DE PAGO N°': 'F931', 'CUOTA N°': '1 de 1', 'IMPORTE CUOTA': 2800000, 'VENCIMIENTO': '22-05-2026' },
        { 'ENTIDAD': 'ARCA (AFIP)', 'TIPO DE IMPUESTO': 'Plan de Pago', 'MONTO TOTAL': 600000, 'PLAN DE PAGO N°': 'PLAN ARCA #10', 'CUOTA N°': '10 de 60', 'IMPORTE CUOTA': 120000, 'VENCIMIENTO': '25-05-2026' },
        { 'ENTIDAD': 'Rentas Tucumán', 'TIPO DE IMPUESTO': 'Ingresos Brutos', 'MONTO TOTAL': 450000, 'PLAN DE PAGO N°': 'CORRIENTE', 'CUOTA N°': '1 de 1', 'IMPORTE CUOTA': 450000, 'VENCIMIENTO': '15-05-2026' }
      ];
    }
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, mode === 'bank' ? 'Pasivos Bancarios' : 'Pasivos Fiscales');
    XLSX.writeFile(wb, fileName);
  };

  // Procesa un array de filas (matriz) y mapea las columnas automáticamente
  const processImportRows = (parsed: string[][]) => {
    if (parsed.length === 0) return;
    const headers = parsed[0].map(h => String(h || '').toLowerCase().trim());
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
      mapField('taxType', ['impuesto', 'tributo', 'concepto']);
      mapField('totalAmount', ['importe total', 'monto total', 'total plan']);
      mapField('paymentPlanNumber', ['plan de pagos', 'plan de pago', 'nro plan', 'n° de plan']);
      mapField('installmentNumber', ['cuota', 'nro cuota', 'cuota n']);
      mapField('amount', ['importe cuota', 'monto cuota', 'mensual', 'cuota total', 'importe', 'monto']);
      mapField('dueDate', ['vencimiento', 'fecha vto', 'vto pago', 'fecha_vto']);
    }
    setColumnMapping(idxMap);
    setParsedData(parsed);
  };

  // Leer archivo Excel y convertirlo a matriz de filas
  const handleImportExcelFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });
        const parsed = rows.map(r => (r || []).map((c: any) => String(c == null ? '' : c).trim())).filter(r => r.join('').trim() !== '');
        if (parsed.length <= 1) { alert('El archivo no tiene datos suficientes (encabezado + al menos una fila).'); return; }
        processImportRows(parsed);
      } catch (err: any) {
        alert('Error al leer el Excel: ' + (err?.message || ''));
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const [showBankLoteModal, setShowBankLoteModal] = useState(false);
  const [showTaxLoteModal, setShowTaxLoteModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const [taxEntities, setTaxEntities] = useState<Array<{ value: string; label: string }>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('craft_tax_entities');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Error loading tax entities", e);
        }
      }
    }
    return DEFAULT_TAX_ENTITIES;
  });

  const [taxTypes, setTaxTypes] = useState<Array<{ value: string; label: string }>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('craft_tax_types');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Error loading tax types", e);
        }
      }
    }
    return DEFAULT_TAX_TYPES;
  });

  const saveTaxEntities = (newEntities: Array<{ value: string; label: string }>) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setTaxEntities(newEntities);
    localStorage.setItem('craft_tax_entities', JSON.stringify(newEntities));
  };

  const saveTaxTypes = (newTypes: Array<{ value: string; label: string }>) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setTaxTypes(newTypes);
    localStorage.setItem('craft_tax_types', JSON.stringify(newTypes));
  };

  const [selectedEntity, setSelectedEntity] = useState(() => taxEntities[0]?.value || '');
  const [selectedTaxType, setSelectedTaxType] = useState(() => taxTypes[0]?.value || '');

  const [showAddTaxEntity, setShowAddTaxEntity] = useState(false);
  const [newTaxEntityName, setNewTaxEntityName] = useState('');

  const [showAddTaxType, setShowAddTaxType] = useState(false);
  const [newTaxTypeName, setNewTaxTypeName] = useState('');
  
  // Importer states
  const [importRawText, setImportRawText] = useState('');
  const [parsedData, setParsedData] = useState<{ headers: string[]; rows: any[] } | null>(null);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  
  // Custom batch loader state for generated installments
  const [tempCuotas, setTempCuotas] = useState<Array<{ installmentNumber: string; dueDate: string; amount: number }>>([]);

  const [categories, setCategories] = useState<FinanceCategory[]>(FINANCE_CATEGORIES);
  
  const [entries, setEntries] = useState<FinanceEntry[]>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('craft_finance_entries');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Error loading entries from localStorage", e);
        }
      }
    }
    return [
      { id: 'start', date: '2026-05-24', itemId: 'balance_start', amounts: { efectivo: 5258100, mp: 0, bbva: 850000, santander: 14515000 }, isExecuted: true },
      { id: '1', date: '2026-05-24', itemId: 'ret_suc', amounts: { efectivo: 17400000, mp: 0, bbva: 0, santander: 0 }, isExecuted: true },
      { id: '2', date: '2026-05-24', itemId: 'acr_tarj', amounts: { efectivo: 0, mp: 0, bbva: 0, santander: 11570000 }, isExecuted: true },
    ];
  });

  const [weeklyClosings, setWeeklyClosings] = useState<Record<string, Record<string, number>>>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('craft_weekly_closings');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Error loading weekly closings from localStorage", e);
        }
      }
    }
    // Default initial data for closing balances:
    return {
      '2026-05-17': {
        efectivo: 5258100,
        bbva: 850000,
        santander: 14515000,
        ciudad: 0,
        nacion: 0,
        macro: 0,
        mp: 0
      }
    };
  });

  const saveWeeklyClosings = (newClosings: Record<string, Record<string, number>>) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setWeeklyClosings(newClosings);
    localStorage.setItem('craft_weekly_closings', JSON.stringify(newClosings));
    // Guardar en Supabase como finance_liabilities con type='weekly_closing'
    try {
      supabase.from('finance_liabilities').upsert([{
        type: 'weekly_closing',
        entity_name: 'CIERRE_SEMANAL',
        amount: 0,
        notes: JSON.stringify(newClosings)
      }]).then(() => {});
    } catch(e) {}
  };

  const [dailyBreakdownMode, setDailyBreakdownMode] = useState<'projected' | 'executed'>('projected');
  const [showCloseWeekModal, setShowCloseWeekModal] = useState(false);
  const [closeWeekForm, setCloseWeekForm] = useState<Record<string, number>>({});

  useEffect(() => {
    localStorage.setItem('craft_finance_entries', JSON.stringify(entries));
    // Guardar en Supabase
    if (entries && entries.length > 0) {
      supabase.from('finance_liabilities').upsert([{
        type: 'finance_entries',
        entity_name: 'ENTRIES',
        amount: 0,
        notes: JSON.stringify(entries)
      }]).then(() => {}, () => {});
    }
  }, [entries]);

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
  
  const [startDate, setStartDate] = useState('2026-05-17');
  const [endDate, setEndDate] = useState('2026-05-24');
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
    date: '2026-05-24',
    amounts: ACCOUNTS.reduce((acc, account) => ({ ...acc, [account.id]: 0 }), {}) as Record<string, number>
  });

  // Calculate days of week for current week (Lunes to Domingo)
  const activeWeekRange = useMemo(() => {
    const d = new Date(currentDateStr + 'T12:00:00');
    const day = d.getDay(); // 0 is Sun, 1 is Mon
    const distanceToMonday = day === 0 ? 6 : day - 1;
    const monday = new Date(d);
    monday.setDate(d.getDate() - distanceToMonday);
    
    const daysOfWeek = [];
    const daysOfWeekNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    for (let i = 0; i < 7; i++) {
      const cd = new Date(monday);
      cd.setDate(monday.getDate() + i);
      const dateStr = cd.toISOString().split('T')[0];
      daysOfWeek.push({
        dateStr,
        name: daysOfWeekNames[i],
        shortLabel: `${daysOfWeekNames[i]} ${cd.getDate().toString().padStart(2, '0')}/${(cd.getMonth() + 1).toString().padStart(2, '0')}`
      });
    }
    
    const mondayStr = daysOfWeek[0].dateStr;
    const sundayStr = daysOfWeek[6].dateStr;
    
    return {
      monday: mondayStr,
      sunday: sundayStr,
      days: daysOfWeek,
      label: `Semana del Lunes ${daysOfWeek[0].shortLabel.split(' ')[1]} al Domingo ${daysOfWeek[6].shortLabel.split(' ')[1]}`
    };
  }, [currentDateStr]);

  // Dynamic starting balances computed from the closest preceding closed Sunday
  const weekStartBalances = useMemo(() => {
    const prevSundayObj = new Date(activeWeekRange.monday + 'T12:00:00');
    prevSundayObj.setDate(prevSundayObj.getDate() - 1);
    const prevSundayStr = prevSundayObj.toISOString().split('T')[0];

    // Priority 1: Direct previous Sunday
    if (weeklyClosings[prevSundayStr]) {
      return {
        efectivo: weeklyClosings[prevSundayStr].efectivo || 0,
        bbva: weeklyClosings[prevSundayStr].bbva || 0,
        santander: weeklyClosings[prevSundayStr].santander || 0,
        ciudad: weeklyClosings[prevSundayStr].ciudad || 0,
        nacion: weeklyClosings[prevSundayStr].nacion || 0,
        macro: weeklyClosings[prevSundayStr].macro || 0,
        mp: weeklyClosings[prevSundayStr].mp || 0
      };
    }

    // Priority 2: Closest preceding closed Sunday
    const sortedSundays = Object.keys(weeklyClosings).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    const precedingSunday = sortedSundays.find(sDate => sDate < activeWeekRange.monday);
    if (precedingSunday && weeklyClosings[precedingSunday]) {
      return {
        efectivo: weeklyClosings[precedingSunday].efectivo || 0,
        bbva: weeklyClosings[precedingSunday].bbva || 0,
        santander: weeklyClosings[precedingSunday].santander || 0,
        ciudad: weeklyClosings[precedingSunday].ciudad || 0,
        nacion: weeklyClosings[precedingSunday].nacion || 0,
        macro: weeklyClosings[precedingSunday].macro || 0,
        mp: weeklyClosings[precedingSunday].mp || 0
      };
    }

    // Fallback default values
    return {
      efectivo: 5258100,
      bbva: 850000,
      santander: 14515000,
      ciudad: 0,
      nacion: 0,
      macro: 0,
      mp: 0
    };
  }, [activeWeekRange.monday, weeklyClosings]);

  // Calculate weeks of current month (with overlapping Mon-Sun weeks)
  const activeMonthRange = useMemo(() => {
    const d = new Date(currentDateStr + 'T12:00:00');
    const year = d.getFullYear();
    const month = d.getMonth(); // 0-indexed
    
    const firstDay = new Date(year, month, 1, 12, 0, 0);
    const lastDay = new Date(year, month + 1, 0, 12, 0, 0);
    
    const fDay = firstDay.getDay();
    const diffToMonday = fDay === 0 ? 6 : fDay - 1;
    const startOfFirstWeek = new Date(firstDay);
    startOfFirstWeek.setDate(firstDay.getDate() - diffToMonday);
    
    const weeks = [];
    let currentStart = new Date(startOfFirstWeek);
    while (currentStart <= lastDay) {
      const currentEnd = new Date(currentStart);
      currentEnd.setDate(currentStart.getDate() + 6);
      
      const startStr = currentStart.toISOString().split('T')[0];
      const endStr = currentEnd.toISOString().split('T')[0];
      const label = `Semana ${weeks.length + 1} (${currentStart.getDate().toString().padStart(2, '0')}/${(currentStart.getMonth() + 1).toString().padStart(2, '0')} a ${currentEnd.getDate().toString().padStart(2, '0')}/${(currentEnd.getMonth() + 1).toString().padStart(2, '0')})`;
      
      weeks.push({
        startStr,
        endStr,
        label,
        index: weeks.length
      });
      
      currentStart.setDate(currentStart.getDate() + 7);
    }
    
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    
    return {
      year,
      month,
      monthLabel: `${monthNames[month]} de ${year}`,
      weeks,
      firstDayStr: firstDay.toISOString().split('T')[0],
      lastDayStr: lastDay.toISOString().split('T')[0],
    };
  }, [currentDateStr]);

  // Convert payments/commitments to FinanceEntries dynamically so they are reflected automatically in the estimated cash flow
  const allEntries = useMemo(() => {
    const paymentEntries: FinanceEntry[] = payments.map(p => {
      const bankId = p.bank?.toLowerCase().trim() || '';
      let targetAccount = 'bbva'; // default
      if (bankId.includes('santander')) targetAccount = 'santander';
      else if (bankId.includes('bbva')) targetAccount = 'bbva';
      else if (bankId.includes('macro')) targetAccount = 'macro';
      else if (bankId.includes('ciudad')) targetAccount = 'ciudad';
      else if (bankId.includes('nacion')) targetAccount = 'nacion';
      else if (bankId.includes('mp') || bankId.includes('mercado')) targetAccount = 'mp';
      else if (p.category === 'other') targetAccount = 'efectivo';
      else if (p.category === 'service') targetAccount = 'efectivo';
      
      const itemId = p.category === 'loan' 
        ? 'loan_cuota' 
        : p.category === 'tax' 
          ? (p.taxType?.toUpperCase() === 'F931' ? 'tax_931' : p.taxType?.toUpperCase() === 'IVA' ? 'tax_iva' : p.taxType?.toUpperCase() === 'GANANCIAS' ? 'tax_gan' : 'tax_plans') 
          : p.category === 'service' 
            ? 'serv_other' 
            : 'exp_other';

      let effectiveDate = p.dueDate;
      let descriptionSuffix = "";

      const isLiab = p.category === 'loan' || p.category === 'tax';
      if (isLiab && p.status !== 'paid') {
        // If the liability's due date is helper than the current active week's Monday,
        // we automatically roll it over to this week to prevent forgetting to pay it.
        if (p.dueDate < activeWeekRange.monday) {
          effectiveDate = activeWeekRange.monday;
          const parts = p.dueDate.split('-');
          const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}` : p.dueDate;
          descriptionSuffix = ` (VENCIDO REPROGRAMADO - VTO: ${formattedDate})`;
        }
      }

      return {
        id: `payment-${p.id}`,
        date: effectiveDate,
        itemId: itemId,
        amounts: { [targetAccount]: p.amount },
        isExecuted: p.status === 'paid',
        description: p.description + descriptionSuffix
      };
    });

    return [...entries, ...paymentEntries];
  }, [entries, payments, periodType, activeWeekRange, activeMonthRange]);

  // Filter entries for the selected week / month
  const filteredEntriesForActivePeriod = useMemo(() => {
    if (periodType === 'weekly') {
      const { monday, sunday } = activeWeekRange;
      return allEntries.filter(e => e.date >= monday && e.date <= sunday && e.itemId !== 'balance_start');
    } else {
      const { weeks } = activeMonthRange;
      if (weeks.length === 0) return [];
      const minStart = weeks[0].startStr;
      const maxEnd = weeks[weeks.length - 1].endStr;
      return allEntries.filter(e => e.date >= minStart && e.date <= maxEnd && e.itemId !== 'balance_start');
    }
  }, [allEntries, periodType, activeWeekRange, activeMonthRange]);

  // Group entries by itemId for multidimensional rendering
  const groupedRows = useMemo(() => {
    const data: Record<string, {
      itemId: string;
      dailyValues: number[]; // 7 elements (Lunes to Domingo)
      dailyAccountValues?: Array<Record<string, number>>; // 7 elements (each is accountId -> amt)
      weeklyValues: number[]; // N elements (weeks of month)
      accountValues: Record<string, number>; // accountId -> number
      total: number;
      isExecuted: boolean;
      entriesInPeriod: FinanceEntry[];
    }> = {};

    // Pre-populate with all items in the categories
    categories.forEach(cat => {
      cat.items.forEach(item => {
        data[item.id] = {
          itemId: item.id,
          dailyValues: Array(7).fill(0),
          dailyAccountValues: Array(7).fill(null).map(() => 
            ACCOUNTS.reduce((acc, a) => ({ ...acc, [a.id]: 0 }), {} as Record<string, number>)
          ),
          weeklyValues: Array(activeMonthRange.weeks.length || 5).fill(0),
          accountValues: ACCOUNTS.reduce((acc, a) => ({ ...acc, [a.id]: 0 }), {} as Record<string, number>),
          total: 0,
          isExecuted: true,
          entriesInPeriod: []
        };
      });
    });

    // Aggregate values
    filteredEntriesForActivePeriod.forEach(entry => {
      const row = data[entry.itemId];
      if (!row) return;

      row.entriesInPeriod.push(entry);
      if (!entry.isExecuted) {
        row.isExecuted = false; // mark as false (pending) if any individual entries are pending
      }

      const rowTotal: number = Object.values(entry.amounts).reduce((a: number, b: any) => a + (b as number), 0) as number;
      
      ACCOUNTS.forEach(acc => {
        const amt = (entry.amounts[acc.id] as number) || 0;
        row.accountValues[acc.id] = ((row.accountValues[acc.id] as number) || 0) + amt;
      });

      row.total = ((row.total as number) || 0) + rowTotal;

      if (periodType === 'weekly') {
        const entryDayIndex = activeWeekRange.days.findIndex(d => d.dateStr === entry.date);
        if (entryDayIndex !== -1) {
          row.dailyValues[entryDayIndex] = ((row.dailyValues[entryDayIndex] as number) || 0) + rowTotal;
          ACCOUNTS.forEach(acc => {
            const amt = (entry.amounts[acc.id] as number) || 0;
            if (!row.dailyAccountValues) {
              row.dailyAccountValues = Array(7).fill(null).map(() => 
                ACCOUNTS.reduce((acc, a) => ({ ...acc, [a.id]: 0 }), {} as Record<string, number>)
              );
            }
            row.dailyAccountValues[entryDayIndex][acc.id] = (row.dailyAccountValues[entryDayIndex][acc.id] || 0) + amt;
          });
        }
      } else {
        const entryWeekIndex = activeMonthRange.weeks.findIndex(w => entry.date >= w.startStr && entry.date <= w.endStr);
        if (entryWeekIndex !== -1) {
          row.weeklyValues[entryWeekIndex] = ((row.weeklyValues[entryWeekIndex] as number) || 0) + rowTotal;
        }
      }
    });

    // Override/set the weekly or monthly balance_start row to match weekStartBalances!
    if (data['balance_start']) {
      const sum = Object.values(weekStartBalances).reduce((a: number, b: number) => a + b, 0) as number;
      data['balance_start'].total = sum;
      if (periodType === 'weekly') {
        data['balance_start'].dailyValues[0] = sum; // Put on Monday
        ACCOUNTS.forEach(a => {
          if (!data['balance_start'].dailyAccountValues) {
            data['balance_start'].dailyAccountValues = Array(7).fill(null).map(() => 
              ACCOUNTS.reduce((acc, a) => ({ ...acc, [a.id]: 0 }), {} as Record<string, number>)
            );
          }
          data['balance_start'].dailyAccountValues[0][a.id] = (weekStartBalances as Record<string, number>)[a.id] || 0;
        });
      } else {
        data['balance_start'].weeklyValues[0] = sum; // Put in first week of month
      }
      ACCOUNTS.forEach(a => {
        data['balance_start'].accountValues[a.id] = (weekStartBalances as Record<string, number>)[a.id] || 0;
      });
    }

    return data;
  }, [categories, filteredEntriesForActivePeriod, periodType, activeWeekRange, activeMonthRange, weekStartBalances]);

  // Compute column totals for the footer
  const columnTotals = useMemo(() => {
    const totals = {
      daysIncome: Array(7).fill(0),
      daysExpense: Array(7).fill(0),
      daysAccountIncome: Array(7).fill(null).map(() => 
        ACCOUNTS.reduce((acc, a) => ({ ...acc, [a.id]: 0 }), {} as Record<string, number>)
      ),
      daysAccountExpense: Array(7).fill(null).map(() => 
        ACCOUNTS.reduce((acc, a) => ({ ...acc, [a.id]: 0 }), {} as Record<string, number>)
      ),
      weeksIncome: Array(activeMonthRange.weeks.length || 5).fill(0),
      weeksExpense: Array(activeMonthRange.weeks.length || 5).fill(0),
      accountsIncome: ACCOUNTS.reduce((acc, a) => ({ ...acc, [a.id]: 0 }), {} as Record<string, number>),
      accountsExpense: ACCOUNTS.reduce((acc, a) => ({ ...acc, [a.id]: 0 }), {} as Record<string, number>),
      totalIncome: 0,
      totalExpense: 0
    };

    categories.forEach(cat => {
      const isIncome = cat.type === 'income';
      cat.items.forEach(item => {
        const row = groupedRows[item.id];
        if (!row) return;

        if (isIncome) {
          for (let i = 0; i < 7; i++) {
            totals.daysIncome[i] += row.dailyValues[i];
            if (row.dailyAccountValues && row.dailyAccountValues[i]) {
              ACCOUNTS.forEach(acc => {
                totals.daysAccountIncome[i][acc.id] = (totals.daysAccountIncome[i][acc.id] || 0) + (row.dailyAccountValues?.[i]?.[acc.id] || 0);
              });
            }
          }
          for (let i = 0; i < row.weeklyValues.length; i++) {
            totals.weeksIncome[i] += row.weeklyValues[i];
          }
          ACCOUNTS.forEach(acc => {
            totals.accountsIncome[acc.id] += row.accountValues[acc.id];
          });
          totals.totalIncome += row.total;
        } else {
          for (let i = 0; i < 7; i++) {
            totals.daysExpense[i] += row.dailyValues[i];
            if (row.dailyAccountValues && row.dailyAccountValues[i]) {
              ACCOUNTS.forEach(acc => {
                totals.daysAccountExpense[i][acc.id] = (totals.daysAccountExpense[i][acc.id] || 0) + (row.dailyAccountValues?.[i]?.[acc.id] || 0);
              });
            }
          }
          for (let i = 0; i < row.weeklyValues.length; i++) {
            totals.weeksExpense[i] += row.weeklyValues[i];
          }
          ACCOUNTS.forEach(acc => {
            totals.accountsExpense[acc.id] += row.accountValues[acc.id];
          });
          totals.totalExpense += row.total;
        }
      });
    });

    return totals;
  }, [categories, groupedRows, activeMonthRange.weeks, periodType]);

  // Daily account balances (Estimado / Proyectado - ALL entries)
  const dailyAccountBalancesProjected = useMemo(() => {
    const days = activeWeekRange.days;
    const result: Array<{
      dateStr: string;
      name: string;
      accounts: Record<string, { start: number; income: number; expense: number; end: number }>;
    }> = [];

    const currentBalances = { ...weekStartBalances };

    days.forEach((day) => {
      const dayEntries = allEntries.filter(e => e.date === day.dateStr && e.itemId !== 'balance_start');
      const dayAccData: Record<string, { start: number; income: number; expense: number; end: number }> = {};

      ACCOUNTS.forEach(acc => {
        let incSum = 0;
        let expSum = 0;

        dayEntries.forEach(entry => {
          const amt = (entry.amounts[acc.id] as number) || 0;
          const cat = categories.find(c => c.items.some(i => i.id === entry.itemId));
          if (cat) {
            if (cat.type === 'income') incSum += amt;
            else expSum += amt;
          }
        });

        const start = currentBalances[acc.id] || 0;
        const end = start + incSum - expSum;

        dayAccData[acc.id] = { start, income: incSum, expense: expSum, end };
        currentBalances[acc.id] = end;
      });

      result.push({
        dateStr: day.dateStr,
        name: day.name,
        accounts: dayAccData
      });
    });

    return result;
  }, [activeWeekRange.days, allEntries, weekStartBalances, categories]);

  // Daily account balances (Real / Ejecutado - isExecuted === true)
  const dailyAccountBalancesExecuted = useMemo(() => {
    const days = activeWeekRange.days;
    const result: Array<{
      dateStr: string;
      name: string;
      accounts: Record<string, { start: number; income: number; expense: number; end: number }>;
    }> = [];

    const currentBalances = { ...weekStartBalances };

    days.forEach((day) => {
      const dayEntries = allEntries.filter(e => e.date === day.dateStr && e.itemId !== 'balance_start' && e.isExecuted);
      const dayAccData: Record<string, { start: number; income: number; expense: number; end: number }> = {};

      ACCOUNTS.forEach(acc => {
        let incSum = 0;
        let expSum = 0;

        dayEntries.forEach(entry => {
          const amt = (entry.amounts[acc.id] as number) || 0;
          const cat = categories.find(c => c.items.some(i => i.id === entry.itemId));
          if (cat) {
            if (cat.type === 'income') incSum += amt;
            else expSum += amt;
          }
        });

        const start = currentBalances[acc.id] || 0;
        const end = start + incSum - expSum;

        dayAccData[acc.id] = { start, income: incSum, expense: expSum, end };
        currentBalances[acc.id] = end;
      });

      result.push({
        dateStr: day.dateStr,
        name: day.name,
        accounts: dayAccData
      });
    });

    return result;
  }, [activeWeekRange.days, allEntries, weekStartBalances, categories]);

  const toggleGroupExecution = (itemId: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const row = groupedRows[itemId];
    if (!row || row.entriesInPeriod.length === 0) return;
    const targetState = !row.isExecuted;
    
    const entryIdsToToggle = row.entriesInPeriod.filter(e => !e.id.startsWith('payment-')).map(e => e.id);
    const paymentIdsToToggle = row.entriesInPeriod.filter(e => e.id.startsWith('payment-')).map(e => e.id.replace('payment-', ''));

    if (entryIdsToToggle.length > 0) {
      setEntries(prev => prev.map(e => entryIdsToToggle.includes(e.id) ? { ...e, isExecuted: targetState } : e));
    }
    if (paymentIdsToToggle.length > 0) {
      setPayments(prev => prev.map(p => paymentIdsToToggle.includes(p.id) ? { ...p, status: targetState ? 'paid' : 'pending' } : p));
    }
  };

  const activeEntriesByCat = groupedRows; // fallback alias to avoid missing referencing errors if used downstream

  const hasClosedCurrentWeek = useMemo(() => {
    return !!weeklyClosings[activeWeekRange.sunday];
  }, [weeklyClosings, activeWeekRange.sunday]);

  const viewTitle = mode === 'bank' ? 'Pasivos Bancarios' : mode === 'tax' ? 'Pasivos Fiscales' : 'Flujo de Caja Estimado';
  const ViewIcon = mode === 'bank' ? Building2 : mode === 'tax' ? Calculator : DollarSign;

  const toggleExecution = (entryId: string | undefined) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!entryId) return;
    if (entryId.startsWith('payment-')) {
      const paymentId = entryId.replace('payment-', '');
      const updated = payments.map(p => {
        if (p.id === paymentId) {
          return { ...p, status: (p.status === 'paid' ? 'pending' : 'paid') as 'pending' | 'paid' };
        }
        return p;
      });
      savePayments(updated);
    } else {
      setEntries(prev => prev.map(e => e.id === entryId ? { ...e, isExecuted: !e.isExecuted } : e));
    }
  };

  const [searchQuery, setSearchQuery] = useState('');

  const togglePaymentPaid = (id: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const updated = payments.map(p => {
      if (p.id === id) {
        return { ...p, status: (p.status === 'paid' ? 'pending' : 'paid') as 'pending' | 'paid' };
      }
      return p;
    });
    savePayments(updated);
  };

  const handleDeletePayment = (id: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
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

  const bankEntityStats = useMemo(() => {
    const loanPayments = payments.filter(p => p.category === 'loan');
    const grouped: Record<string, {
      bank: string;
      pendingInstallmentsCount: number;
      installmentAmounts: number[];
      totalPendingAmount: number;
    }> = {};

    loanPayments.forEach(p => {
      const bankName = (p.bank || 'OTROS').trim().toUpperCase();
      if (!grouped[bankName]) {
        grouped[bankName] = {
          bank: bankName,
          pendingInstallmentsCount: 0,
          installmentAmounts: [],
          totalPendingAmount: 0
        };
      }
      
      if (p.status !== 'paid') {
        grouped[bankName].pendingInstallmentsCount += 1;
        grouped[bankName].totalPendingAmount += p.amount;
        if (!grouped[bankName].installmentAmounts.includes(p.amount)) {
          grouped[bankName].installmentAmounts.push(p.amount);
        }
      }
    });

    return Object.values(grouped).sort((a, b) => b.totalPendingAmount - a.totalPendingAmount);
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
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
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
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
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
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
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
            {periodType === 'weekly' && !hasClosedCurrentWeek && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-500 p-5 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <AlertCircle size={20} className="text-red-500 shrink-0" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider">⚠️ COMPROMISO DE CIERRE REQUERIDO</p>
                    <p className="text-[10px] text-text-dim uppercase font-bold mt-1">
                      No se han registrado los Saldos Finales Reales de Cierre para la semana (<span className="text-red-400 font-mono">{activeWeekRange.label}</span>). Carga los saldos de cierre reales de cada medio de cobro.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const lastDayProj = dailyAccountBalancesProjected[6]?.accounts || {};
                    const formInitial: Record<string, number> = {};
                    ACCOUNTS.forEach(a => {
                      formInitial[a.id] = lastDayProj[a.id]?.end || 0;
                    });
                    setCloseWeekForm(formInitial);
                    setShowCloseWeekModal(true);
                  }}
                  className="bg-red-500 text-black font-black text-[9px] uppercase tracking-widest px-4 py-2 rounded hover:bg-red-600 transition-colors w-full sm:w-auto shrink-0"
                >
                  Cargar Saldos de Cierre
                </button>
              </div>
            )}

            {periodType === 'weekly' && hasClosedCurrentWeek && (
              <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-5 rounded-lg flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider">✓ SEMANA CERRADA CON ÉXITO</p>
                    <p className="text-[10px] text-text-dim uppercase font-bold mt-0.5">
                      Saldos Reales de cierre registrados. El saldo final servirá como saldo inicial de la semana entrante.
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const closedVals = weeklyClosings[activeWeekRange.sunday] || {};
                      const formInitial: Record<string, number> = {};
                      ACCOUNTS.forEach(a => {
                        formInitial[a.id] = closedVals[a.id] || 0;
                      });
                      setCloseWeekForm(formInitial);
                      setShowCloseWeekModal(true);
                    }}
                    className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-black text-[9px] uppercase tracking-widest px-4 py-2 rounded hover:bg-emerald-500/30 transition-colors"
                  >
                     Ver / Editar Saldos
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("¿Estás seguro de que deseas reabrir el período de esta semana? Se restablecerán las proyecciones para el saldo inicial de la semana entrante.")) {
                        const newClosings = { ...weeklyClosings };
                        delete newClosings[activeWeekRange.sunday];
                        saveWeeklyClosings(newClosings);
                        alert("La semana ha sido reabierta.");
                      }
                    }}
                    className="bg-red-500/10 hover:bg-red-500/20 text-red-400 font-black text-[9px] uppercase tracking-widest px-4 py-2 rounded border border-red-500/20 transition-all"
                  >
                    Reabrir
                  </button>
                </div>
              </div>
            )}

            <div className="bg-bg-card border border-border-dim rounded-lg overflow-hidden">
                {/* CALENDAR NAVIGATION & VIEW TOGGLES */}
                <div className="p-6 border-b border-border-dim flex flex-wrap justify-between items-center gap-4 bg-bg-card/50">
                  <div className="flex items-center gap-4">
                    <History size={20} className="text-brand-500" />
                    <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Planilla de Flujo de Caja</h3>
                  </div>
                  
                  <div className="flex items-center gap-2 bg-bg-card border border-border-dim p-1 rounded h-[38px]">
                    <button
                      onClick={() => setPeriodType('weekly')}
                      className={cn(
                        "px-3 py-1 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                        periodType === 'weekly' ? "bg-brand-500 text-black shadow-lg" : "text-text-dim hover:text-text-main"
                      )}
                    >
                      Por Semana
                    </button>
                    <button
                      onClick={() => setPeriodType('monthly')}
                      className={cn(
                        "px-3 py-1 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                        periodType === 'monthly' ? "bg-brand-500 text-black shadow-lg" : "text-text-dim hover:text-text-main"
                      )}
                    >
                      Por Mes
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => {
                        const d = new Date(currentDateStr + 'T12:00:00');
                        if (periodType === 'weekly') {
                          d.setDate(d.getDate() - 7);
                        } else {
                          d.setMonth(d.getMonth() - 1);
                        }
                        setCurrentDateStr(d.toISOString().split('T')[0]);
                      }}
                      className="px-3 py-1.5 bg-bg-accent hover:bg-bg-accent/80 border border-border-dim rounded text-[9px] font-black uppercase text-text-main transition-all"
                    >
                      &larr; Anterior
                    </button>

                    <span className="text-[10px] font-mono font-black text-brand-500 bg-bg-accent/60 border border-border-dim px-4 py-1.5 rounded uppercase tracking-widest">
                      {periodType === 'weekly' ? activeWeekRange.label : activeMonthRange.monthLabel}
                    </span>

                    <button
                      onClick={() => {
                        const d = new Date(currentDateStr + 'T12:00:00');
                        if (periodType === 'weekly') {
                          d.setDate(d.getDate() + 7);
                        } else {
                          d.setMonth(d.getMonth() + 1);
                        }
                        setCurrentDateStr(d.toISOString().split('T')[0]);
                      }}
                      className="px-3 py-1.5 bg-bg-accent hover:bg-bg-accent/80 border border-border-dim rounded text-[9px] font-black uppercase text-text-main transition-all"
                    >
                      Siguiente &rarr;
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left border-collapse min-w-[1200px]">
                    {periodType === 'weekly' ? (
                      <thead>
                        <tr className="bg-bg-accent border-b border-border-dim/50">
                          <th rowSpan={2} className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest min-w-[120px] border-b border-border-dim/50">Rubro</th>
                          <th rowSpan={2} className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest min-w-[120px] border-b border-border-dim/50">Subrubro</th>
                          <th rowSpan={2} className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest min-w-[170px] border-b border-border-dim/50">Concepto</th>
                          <th rowSpan={2} className="px-4 py-4 text-center text-[9px] font-black uppercase text-text-dim tracking-widest w-[80px] border-b border-border-dim/50">Ejecución</th>
                          {activeWeekRange.days.map((day) => (
                            <th key={day.dateStr} colSpan={ACCOUNTS.length} className="px-2 py-2 text-center border-r border-l border-border-dim/20 bg-bg-accent/15">
                              <span className="text-[10px] font-black text-brand-500 block">{day.name.toUpperCase()}</span>
                              <span className="text-[8px] font-mono text-text-dim block">{day.dateStr.slice(8, 10)}/{day.dateStr.slice(5, 7)}</span>
                            </th>
                          ))}
                          {ACCOUNTS.map(acc => (
                            <th key={acc.id} rowSpan={2} className="px-3 py-4 text-center min-w-[115px] border-l border-border-dim/25 border-b border-border-dim/50">
                              <div className="flex flex-col items-center gap-1">
                                <acc.icon size={13} className={acc.color} />
                                <span className="text-[8px] font-black uppercase text-text-dim tracking-widest">{acc.name}</span>
                              </div>
                            </th>
                          ))}
                          <th rowSpan={2} className="px-4 py-4 text-right text-[9px] font-black uppercase text-text-dim tracking-widest min-w-[120px] border-l border-border-dim/25 border-b border-border-dim/50">Total</th>
                        </tr>
                        <tr className="bg-bg-accent/45 border-b border-border-dim">
                          {activeWeekRange.days.map((day) => (
                            <React.Fragment key={day.dateStr}>
                              {ACCOUNTS.map(acc => (
                                <th key={acc.id} className="px-1.5 py-1 text-center font-bold text-[7.5px] text-text-dim/80 border-r border-border-dim/10 uppercase tracking-tighter min-w-[55px] bg-bg-accent/5">
                                  {acc.name.replace("BANCO ", "")}
                                </th>
                              ))}
                            </React.Fragment>
                          ))}
                        </tr>
                      </thead>
                    ) : (
                      <thead>
                        <tr className="bg-bg-accent border-b border-border-dim">
                          <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest min-w-[120px]">Rubro</th>
                          <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest min-w-[120px]">Subrubro</th>
                          <th className="px-4 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest min-w-[170px]">Concepto</th>
                          <th className="px-4 py-4 text-center text-[9px] font-black uppercase text-text-dim tracking-widest w-[80px]">Ejecución</th>
                          {activeMonthRange.weeks.map((week) => (
                            <th key={week.startStr} className="px-2 py-4 text-center min-w-[110px] border-r border-border-dim/20 bg-bg-accent/10">
                              <span className="text-[9px] font-black text-brand-500 block">SEM {week.index + 1}</span>
                              <span className="text-[7px] font-mono text-text-dim block">{week.startStr.slice(8, 10)}/{week.startStr.slice(5, 7)} al {week.endStr.slice(8, 10)}/{week.endStr.slice(5, 7)}</span>
                            </th>
                          ))}
                          {ACCOUNTS.map(acc => (
                            <th key={acc.id} className="px-3 py-4 text-center min-w-[115px]">
                              <div className="flex flex-col items-center gap-1">
                                <acc.icon size={13} className={acc.color} />
                                <span className="text-[8px] font-black uppercase text-text-dim tracking-widest">{acc.name}</span>
                              </div>
                            </th>
                          ))}
                          <th className="px-4 py-4 text-right text-[9px] font-black uppercase text-text-dim tracking-widest min-w-[120px]">Total</th>
                        </tr>
                      </thead>
                    )}

                    <tbody className="divide-y divide-border-dim/30 font-medium font-sans">
                      {(() => {
                        let totalRenderedItems = 0;
                        const renderedBlocks = categories.map((cat, catIdx) => {
                          const activeItems = cat.items.filter(item => {
                            const row = groupedRows[item.id];
                            const rowTotal = row ? row.total : 0;
                            return rowTotal !== 0;
                          });

                          if (activeItems.length === 0) return null;
                          totalRenderedItems += activeItems.length;

                          return (
                            <React.Fragment key={cat.id}>
                              {activeItems.map((item, itemIdx) => {
                                const row = groupedRows[item.id] || { dailyValues: Array(7).fill(0), weeklyValues: Array(activeMonthRange.weeks.length || 5).fill(0), accountValues: {}, total: 0, isExecuted: true, entriesInPeriod: [] };
                                const rowTotal = row.total;
                                const isExecuted = row.isExecuted;
                                const entriesCount = row.entriesInPeriod.length;

                                return (
                                  <tr key={item.id} className={cn(
                                    "hover:bg-bg-accent/15 transition-colors group text-[10px]",
                                    !isExecuted && "bg-orange-500/5"
                                  )}>
                                    <td className="px-4 py-3 font-black uppercase text-text-dim/80 tracking-tighter text-[9px]">
                                      {itemIdx === 0 ? cat.name : ""}
                                    </td>
                                    
                                    <td className="px-4 py-3 font-bold uppercase text-text-dim/70 truncate text-[9px]">
                                      {(item as any).subrubro}
                                    </td>

                                    <td className="px-4 py-3">
                                      <div className="flex flex-col">
                                        <span className={cn(
                                          "font-black uppercase tracking-tight text-[10px]",
                                          isExecuted ? "text-text-main" : "text-orange-400"
                                        )}>
                                          {item.name}
                                        </span>
                                        {entriesCount > 0 && (
                                          <span className="text-[8px] font-bold text-text-dim uppercase mt-0.5 opacity-70">
                                            {entriesCount} reg. en período
                                          </span>
                                        )}
                                      </div>
                                    </td>

                                    <td className="px-4 py-3 text-center">
                                      {entriesCount > 0 ? (
                                        <button 
                                          onClick={() => toggleGroupExecution(item.id)}
                                          className={cn(
                                            "p-1.5 rounded-full transition-all scale-90",
                                            isExecuted 
                                              ? "bg-emerald-500 text-black shadow-md" 
                                              : "bg-bg-accent border border-border-dim text-orange-400 hover:text-orange-500"
                                          )}
                                        >
                                          {isExecuted ? <Check size={10} strokeWidth={4} /> : <AlertCircle size={10} strokeWidth={3} />}
                                        </button>
                                      ) : (
                                        <span className="text-text-dim/20">-</span>
                                      )}
                                    </td>

                                    {periodType === 'weekly' ? (
                                      activeWeekRange.days.map((day, dayIdx) => (
                                        <React.Fragment key={day.dateStr}>
                                          {ACCOUNTS.map(acc => {
                                            const val = (row.dailyAccountValues && row.dailyAccountValues[dayIdx] && row.dailyAccountValues[dayIdx][acc.id]) || 0;
                                            return (
                                              <td 
                                                key={acc.id} 
                                                className={cn(
                                                  "px-1.5 py-3 text-center font-mono text-[8.5px] border-r border-border-dim/10",
                                                  dayIdx % 2 === 0 ? "bg-bg-card/20" : "bg-bg-accent/5",
                                                  val !== 0 ? (cat.type === 'income' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold') : 'text-text-dim/15'
                                                )}
                                              >
                                                {val !== 0 ? `$${val.toLocaleString('es-AR')}` : '-'}
                                              </td>
                                            );
                                          })}
                                        </React.Fragment>
                                      ))
                                    ) : (
                                      row.weeklyValues.map((val, idx) => (
                                        <td key={idx} className={cn(
                                          "px-2 py-3 text-center font-mono text-[9px] border-r border-border-dim/10 bg-bg-accent/5",
                                          val !== 0 ? (cat.type === 'income' ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold') : 'text-text-dim/15'
                                        )}>
                                          {val !== 0 ? `$${val.toLocaleString('es-AR')}` : '-'}
                                        </td>
                                      ))
                                    )}

                                    {ACCOUNTS.map(acc => {
                                      const val = row.accountValues[acc.id] || 0;
                                      return (
                                        <td key={acc.id} className={cn(
                                          "px-2 py-3 text-center font-mono text-[9px]",
                                          val !== 0 ? (cat.type === 'income' ? 'text-emerald-500/80 font-bold' : 'text-red-500/80 font-bold') : 'text-text-dim/15'
                                        )}>
                                          {val !== 0 ? `$${val.toLocaleString('es-AR')}` : '-'}
                                        </td>
                                      );
                                    })}

                                    <td className={cn(
                                      "px-4 py-3 text-right font-mono text-[10px] font-black",
                                      rowTotal !== 0 ? (cat.type === 'income' ? 'text-emerald-400' : 'text-red-400') : 'text-text-dim/20'
                                    )}>
                                      {rowTotal !== 0 ? `$${rowTotal.toLocaleString('es-AR')}` : '-'}
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        });

                        if (totalRenderedItems === 0) {
                          const totalCols = periodType === 'weekly'
                            ? 5 + 8 * ACCOUNTS.length
                            : 5 + (activeMonthRange.weeks.length || 5) + ACCOUNTS.length;
                          return (
                            <tr>
                              <td colSpan={totalCols} className="text-center py-12 text-text-dim uppercase font-black tracking-widest text-[9px] bg-bg-card/20 italic">
                                No hay movimientos registrados para este período
                              </td>
                            </tr>
                          );
                        }

                        return renderedBlocks;
                      })()}
                    </tbody>

                     <tfoot className="bg-bg-sidebar/95 backdrop-blur font-black text-text-main border-t-2 border-border-dim text-[9px]">
                      {/* ROW 1: TOTAL INGRESOS */}
                      <tr className="border-b border-border-dim/30 bg-emerald-500/5">
                        <td className="px-4 py-2.5 text-emerald-400 font-black tracking-wider uppercase">Ingresos Totales</td>
                        <td className="px-4 py-2.5"></td>
                        <td className="px-4 py-2.5"></td>
                        <td className="px-4 py-2.5"></td>
                        {periodType === 'weekly' ? (
                          activeWeekRange.days.map((day, dayIdx) => (
                            <React.Fragment key={day.dateStr}>
                              {ACCOUNTS.map(acc => {
                                const val = columnTotals.daysAccountIncome[dayIdx][acc.id] || 0;
                                return (
                                  <td key={acc.id} className="px-1 py-2.5 text-center font-mono text-[8.5px] font-bold border-r border-border-dim/10 bg-emerald-500/5 text-emerald-400">
                                    {val > 0 ? `$${val.toLocaleString('es-AR')}` : '-'}
                                  </td>
                                );
                              })}
                            </React.Fragment>
                          ))
                        ) : (
                          columnTotals.weeksIncome.map((val, idx) => (
                            <td key={idx} className="px-2 py-2.5 text-center font-mono text-emerald-400 font-bold bg-emerald-500/5 border-r border-border-dim/10">
                              {val > 0 ? `$${val.toLocaleString('es-AR')}` : '-'}
                            </td>
                          ))
                        )}
                        {ACCOUNTS.map(acc => {
                          const val = columnTotals.accountsIncome[acc.id] || 0;
                          return (
                            <td key={acc.id} className="px-2 py-2.5 text-center font-mono text-emerald-400 font-extrabold border-l border-border-dim/20">
                              {val > 0 ? `$${val.toLocaleString('es-AR')}` : '-'}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2.5 text-right font-mono text-[10px] text-emerald-400 font-black italic border-l border-border-dim/20">
                          ${columnTotals.totalIncome.toLocaleString('es-AR')}
                        </td>
                      </tr>

                      {/* ROW 2: TOTAL EGRESOS */}
                      <tr className="border-b border-border-dim/30 bg-red-500/5">
                        <td className="px-4 py-2.5 text-red-400 font-black tracking-wider uppercase">Egresos Totales</td>
                        <td className="px-4 py-2.5"></td>
                        <td className="px-4 py-2.5"></td>
                        <td className="px-4 py-2.5"></td>
                        {periodType === 'weekly' ? (
                          activeWeekRange.days.map((day, dayIdx) => (
                            <React.Fragment key={day.dateStr}>
                              {ACCOUNTS.map(acc => {
                                const val = columnTotals.daysAccountExpense[dayIdx][acc.id] || 0;
                                return (
                                  <td key={acc.id} className="px-1 py-2.5 text-center font-mono text-[8.5px] font-bold border-r border-border-dim/10 bg-red-500/5 text-red-400">
                                    {val > 0 ? `$${val.toLocaleString('es-AR')}` : '-'}
                                  </td>
                                );
                              })}
                            </React.Fragment>
                          ))
                        ) : (
                          columnTotals.weeksExpense.map((val, idx) => (
                            <td key={idx} className="px-2 py-2.5 text-center font-mono text-red-400 font-bold bg-red-500/5 border-r border-border-dim/10">
                              {val > 0 ? `$${val.toLocaleString('es-AR')}` : '-'}
                            </td>
                          ))
                        )}
                        {ACCOUNTS.map(acc => {
                          const val = columnTotals.accountsExpense[acc.id] || 0;
                          return (
                            <td key={acc.id} className="px-2 py-2.5 text-center font-mono text-red-400 font-extrabold border-l border-border-dim/20">
                              {val > 0 ? `$${val.toLocaleString('es-AR')}` : '-'}
                            </td>
                          );
                        })}
                        <td className="px-4 py-2.5 text-right font-mono text-[10px] text-red-400 font-black italic border-l border-border-dim/20">
                          ${columnTotals.totalExpense.toLocaleString('es-AR')}
                        </td>
                      </tr>

                      {/* ROW 3: FLUJO NETO */}
                      <tr className="border-b-2 border-border-dim bg-brand-500/5">
                        <td className="px-4 py-3 text-brand-500 font-black tracking-widest uppercase">Flujo de Caja Neto</td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3"></td>
                        {periodType === 'weekly' ? (
                          activeWeekRange.days.map((day, dayIdx) => (
                            <React.Fragment key={day.dateStr}>
                              {ACCOUNTS.map(acc => {
                                const inc = columnTotals.daysAccountIncome[dayIdx][acc.id] || 0;
                                const exp = columnTotals.daysAccountExpense[dayIdx][acc.id] || 0;
                                const startBalanceVal = (groupedRows['balance_start']?.dailyAccountValues && groupedRows['balance_start']?.dailyAccountValues[dayIdx]?.[acc.id]) || 0;
                                const net = (inc - startBalanceVal) - exp;
                                return (
                                  <td key={acc.id} className={cn(
                                    "px-1 py-3 text-center font-mono text-[8.5px] font-bold border-r border-border-dim/10 bg-brand-500/5",
                                    net === 0 ? "text-text-dim/20" : net > 0 ? "text-emerald-400" : "text-red-400"
                                  )}>
                                    {net !== 0 ? `${net < 0 ? '-' : ''}$${Math.abs(net).toLocaleString('es-AR')}` : '-'}
                                  </td>
                                );
                              })}
                            </React.Fragment>
                          ))
                        ) : (
                          columnTotals.weeksIncome.map((inc, idx) => {
                            const exp = columnTotals.weeksExpense[idx];
                            const startBalanceVal = groupedRows['balance_start']?.weeklyValues[idx] || 0;
                            const net = (inc - startBalanceVal) - exp;
                            return (
                              <td key={idx} className={cn(
                                "px-2 py-3 text-center font-mono font-bold bg-brand-500/5 border-r border-border-dim/10",
                                net === 0 ? "text-text-dim/20" : net > 0 ? "text-emerald-400" : "text-red-400"
                              )}>
                                {net !== 0 ? `${net < 0 ? '-' : ''}$${Math.abs(net).toLocaleString('es-AR')}` : '-'}
                              </td>
                            );
                          })
                        )}
                        {ACCOUNTS.map(acc => {
                          const inc = columnTotals.accountsIncome[acc.id] || 0;
                          const exp = columnTotals.accountsExpense[acc.id] || 0;
                          const startBalanceVal = groupedRows['balance_start']?.accountValues[acc.id] || 0;
                          const net = (inc - startBalanceVal) - exp;
                          return (
                            <td key={acc.id} className={cn(
                              "px-2 py-3 text-center font-mono font-black border-l border-border-dim/20",
                              net === 0 ? "text-text-dim/20" : net > 0 ? "text-emerald-400" : "text-red-400"
                            )}>
                              {net !== 0 ? `${net < 0 ? '-' : ''}$${Math.abs(net).toLocaleString('es-AR')}` : '-'}
                            </td>
                          );
                        })}
                        <td className={cn(
                          "px-4 py-3 text-right font-mono text-[9px] font-black border-l border-border-dim/20",
                          ((columnTotals.totalIncome - (groupedRows['balance_start']?.total || 0)) - columnTotals.totalExpense) > 0 ? "text-emerald-400" : "text-red-400"
                        )}>
                          ${((columnTotals.totalIncome - (groupedRows['balance_start']?.total || 0)) - columnTotals.totalExpense).toLocaleString('es-AR')}
                        </td>
                      </tr>

                      {/* ROW 4: SALDO FINAL REAL */}
                      <tr className="border-b border-border-dim/30 bg-bg-card/30 text-[9px]">
                        <td className="px-4 py-3 text-emerald-400 font-sans tracking-wide uppercase font-black pb-4">Saldo Final REAL (Ejecutado)</td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3"></td>
                        <td className="px-4 py-3"></td>
                        {periodType === 'weekly' ? (
                          activeWeekRange.days.map((day, dayIdx) => {
                            const dayData = dailyAccountBalancesExecuted[dayIdx];
                            return (
                              <React.Fragment key={day.dateStr}>
                                {ACCOUNTS.map(acc => {
                                  const accData = dayData?.accounts[acc.id];
                                  const val = accData?.end ?? 0;
                                  return (
                                    <td key={acc.id} className="px-1 py-3 text-center font-mono text-[8.5px] border-r border-border-dim/10 bg-emerald-500/5 text-emerald-400 font-bold">
                                      {val !== 0 ? `$${val.toLocaleString('es-AR')}` : '-'}
                                    </td>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })
                        ) : (
                          activeMonthRange.weeks.map((_, i) => <td key={i} className="px-2 py-3 text-center text-text-dim/10 border-r border-border-dim/10">-</td>)
                        )}
                        {ACCOUNTS.map(acc => {
                          const final = periodType === 'weekly' 
                            ? (((dailyAccountBalancesExecuted[6]?.accounts[acc.id]) as any)?.end || 0) as number
                            : (() => {
                                const income = allEntries.filter(e => e.isExecuted && categories.find(c => c.items.some(i => i.id === e.itemId))?.type === 'income').reduce((sum, e) => sum + ((e.amounts as any)[acc.id] as number), 0);
                                const expense = allEntries.filter(e => e.isExecuted && categories.find(c => c.items.some(i => i.id === e.itemId))?.type === 'expense').reduce((sum, e) => sum + ((e.amounts as any)[acc.id] as number), 0);
                                return ((initialBalances[acc.id] as number) + income - expense) as number;
                              })();
                          return (
                            <td key={acc.id} className="px-2 py-3 text-center font-mono text-[9px] text-emerald-400 font-bold border-l border-border-dim/20 bg-emerald-500/5">
                              ${final.toLocaleString('es-AR')}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3 text-right font-mono text-[9px] text-emerald-400 font-bold bg-emerald-500/5 border-l border-border-dim/20">
                          ${(periodType === 'weekly'
                            ? Object.values(dailyAccountBalancesExecuted[6]?.accounts || {}).reduce((s: number, a: any) => s + (a?.end || 0), 0) as number
                            : (Object.values(initialBalances).reduce((a: number, b: any) => a + (b as number), 0) + 
                               allEntries.filter(e => e.isExecuted).reduce((total: number, e: any) => {
                                 const cat = categories.find(c => c.items.some(i => i.id === e.itemId));
                                 const rowTotal = Object.values(e.amounts).reduce((tot: number, val: any) => tot + (val as number), 0);
                                 const val = (cat?.type === 'income' ? rowTotal : -rowTotal) as number;
                                 return total + val;
                               }, 0))
                          ).toLocaleString('es-AR')}
                        </td>
                      </tr>

                      {/* ROW 5: SALDO PROYECTADO */}
                      <tr className="bg-bg-card/50 text-[9px]">
                        <td className="px-4 py-3.5 text-brand-500 font-sans tracking-wide uppercase font-black pb-4">Saldo PROYECTADO (Cierre esperado)</td>
                        <td className="px-4 py-3.5"></td>
                        <td className="px-4 py-3.5"></td>
                        <td className="px-4 py-3.5"></td>
                        {periodType === 'weekly' ? (
                          activeWeekRange.days.map((day, dayIdx) => {
                            const dayData = dailyAccountBalancesProjected[dayIdx];
                            return (
                              <React.Fragment key={day.dateStr}>
                                {ACCOUNTS.map(acc => {
                                  const accData = dayData?.accounts[acc.id];
                                  const val = accData?.end ?? 0;
                                  return (
                                    <td key={acc.id} className="px-1 py-3.5 text-center font-mono text-[8.5px] border-r border-border-dim/10 bg-brand-500/5 text-brand-500 font-bold font-mono">
                                      {val !== 0 ? `$${val.toLocaleString('es-AR')}` : '-'}
                                    </td>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })
                        ) : (
                          activeMonthRange.weeks.map((_, i) => <td key={i} className="px-2 py-3.5 text-center text-text-dim/10 border-r border-border-dim/10">-</td>)
                        )}
                        {ACCOUNTS.map(acc => {
                          const final = periodType === 'weekly' 
                            ? (((dailyAccountBalancesProjected[6]?.accounts[acc.id]) as any)?.end || 0) as number
                            : (() => {
                                const income = allEntries.filter(e => categories.find(c => c.items.some(i => i.id === e.itemId))?.type === 'income').reduce((sum, e) => sum + ((e.amounts as any)[acc.id] as number), 0);
                                const expense = allEntries.filter(e => categories.find(c => c.items.some(i => i.id === e.itemId))?.type === 'expense').reduce((sum, e) => sum + ((e.amounts as any)[acc.id] as number), 0);
                                return ((initialBalances[acc.id] as number) + income - expense) as number;
                              })();
                          return (
                            <td key={acc.id} className="px-2 py-3.5 text-center font-mono text-[9px] text-brand-500 font-bold border-l border-border-dim/20 bg-brand-500/5">
                              ${final.toLocaleString('es-AR')}
                            </td>
                          );
                        })}
                        <td className="px-4 py-3.5 text-right font-mono text-[9px] text-brand-500 font-bold bg-brand-500/5 border-l border-border-dim/20">
                          ${(periodType === 'weekly'
                            ? Object.values(dailyAccountBalancesProjected[6]?.accounts || {}).reduce((s: number, a: any) => s + (a?.end || 0), 0) as number
                            : (Object.values(initialBalances).reduce((a: number, b: any) => a + (b as number), 0) + 
                               allEntries.reduce((total: number, e: any) => {
                                 const cat = categories.find(c => c.items.some(i => i.id === e.itemId));
                                 const rowTotal = Object.values(e.amounts).reduce((tot: number, val: any) => tot + (val as number), 0);
                                 const val = (cat?.type === 'income' ? rowTotal : -rowTotal) as number;
                                 return total + val;
                               }, 0))
                          ).toLocaleString('es-AR')}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
            </div>

            {periodType === 'weekly' && (
              <div className="bg-bg-card border border-border-dim rounded-lg overflow-hidden p-6 space-y-4 shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-dim pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-brand-500/10 rounded-lg text-brand-500">
                      <Wallet size={18} />
                    </div>
                    <div>
                      <h4 className="text-xs font-black uppercase text-text-main tracking-widest bg-gradient-to-r from-brand-500 to-emerald-400 bg-clip-text text-transparent">Saldos Diarios por Medio de Cobro</h4>
                      <p className="text-[10px] text-text-dim font-bold uppercase mt-0.5">Evolución para cada día de la semana</p>
                    </div>
                  </div>
                  
                  {/* Selector de modo para el Arqueo Diario */}
                  <div className="flex bg-bg-main border border-border-dim p-1 rounded gap-1 self-start">
                    <button
                      type="button"
                      onClick={() => setDailyBreakdownMode('projected')}
                      className={cn(
                        "px-3 py-1.5 rounded text-[8px] font-black uppercase tracking-wider transition-all",
                        dailyBreakdownMode === 'projected' ? "bg-brand-500 text-black shadow font-black" : "text-text-dim hover:text-text-main"
                      )}
                    >
                      Proyectado (Cierre esperado)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDailyBreakdownMode('executed')}
                      className={cn(
                        "px-3 py-1.5 rounded text-[8px] font-black uppercase tracking-wider transition-all",
                        dailyBreakdownMode === 'executed' ? "bg-emerald-500 text-black shadow font-black" : "text-text-dim hover:text-text-main"
                      )}
                    >
                      Real (Solo Ejecutados)
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto w-full">
                  <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead>
                      <tr className="border-b border-border-dim text-[9px] text-text-dim font-black uppercase tracking-wider bg-bg-card/20">
                        <th className="px-4 py-3 min-w-[160px]">Medio de Cobro</th>
                        {activeWeekRange.days.map((day, idx) => (
                          <th key={idx} className="px-3 py-3 text-center border-l border-border-dim/20">
                            <div>{day.name}</div>
                            <div className="text-[8px] font-mono text-brand-500 mt-0.5">{day.shortLabel.split(' ')[1]}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dim/20 text-[10px]">
                      {ACCOUNTS.map(acc => {
                        const accIconColor = acc.color;
                        const IconComp = acc.icon;
                        return (
                          <tr key={acc.id} className="hover:bg-bg-accent/20 transition-all duration-150">
                            <td className="px-4 py-3 font-bold text-text-main flex items-center gap-2">
                              <IconComp size={14} className={accIconColor} />
                              <span className="uppercase tracking-tight text-[9px] font-black">{acc.name}</span>
                            </td>
                            {activeWeekRange.days.map((day, dIdx) => {
                              const dayData = dailyBreakdownMode === 'projected' 
                                ? dailyAccountBalancesProjected[dIdx]?.accounts[acc.id]
                                : dailyAccountBalancesExecuted[dIdx]?.accounts[acc.id];
                              
                              const endBal = dayData?.end || 0;
                              const incAmt = dayData?.income || 0;
                              const expAmt = dayData?.expense || 0;

                              return (
                                <td key={dIdx} className="px-3 py-2.5 text-center border-l border-border-dim/10 bg-bg-accent/5 font-mono">
                                  {/* Saldo Final del Día */}
                                  <div className={cn(
                                    "font-black text-[10px]",
                                    endBal === 0 ? "text-text-dim/40" : endBal > 0 ? "text-text-main" : "text-red-400"
                                  )}>
                                    ${endBal.toLocaleString('es-AR')}
                                  </div>
                                  
                                  {/* Sub-valores de movimientos si los hay */}
                                  <div className="flex items-center justify-center gap-1.5 mt-1 text-[8px] font-extrabold">
                                    {incAmt > 0 && (
                                      <span className="text-emerald-400" title="Ingresos de hoy">
                                        +{incAmt.toLocaleString('es-AR')}
                                      </span>
                                    )}
                                    {expAmt > 0 && (
                                      <span className="text-red-400" title="Egresos de hoy">
                                        -{expAmt.toLocaleString('es-AR')}
                                      </span>
                                    )}
                                    {incAmt === 0 && expAmt === 0 && (
                                      <span className="text-text-dim/20">-</span>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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
                             allEntries.filter(e => e.isExecuted).reduce((total: number, e) => {
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
                    onClick={handleDownloadModel}
                    className="bg-bg-accent border border-border-dim text-text-main hover:border-brand-500/50 px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5"
                  >
                    <Download size={13} /> Modelo
                  </button>
                )}
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

                {/* Consolidado por Entidad Financiera */}
                <div className="bg-bg-card border border-border-dim p-5 rounded-xl shadow-lg space-y-4">
                  <div className="flex items-center justify-between border-b border-border-dim/40 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 bg-brand-500/10 rounded text-brand-500">
                        <Building2 size={14} />
                      </div>
                      <div>
                        <h3 className="text-[10px] font-black uppercase text-text-main tracking-widest">Resumen Consolidado por Entidad Financiera</h3>
                        <p className="text-[8px] text-text-dim font-bold uppercase mt-0.5">Visión integrada de deudas y amortizaciones activas</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-bold text-text-dim uppercase tracking-wider bg-bg-accent px-2 py-1 rounded border border-border-dim/50 font-mono">
                      Entidades registradas: {bankEntityStats.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {bankEntityStats.map(stat => (
                      <div key={stat.bank} className="bg-bg-accent/30 border border-border-dim p-4 rounded-lg relative overflow-hidden group hover:border-brand-500/30 transition-all flex flex-col justify-between min-h-[120px]">
                        <div>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-[11px] font-black uppercase text-brand-500 tracking-wider">
                              {stat.bank}
                            </span>
                            <span className={cn(
                              "text-[8px] font-mono font-black px-2 py-0.5 rounded border",
                              stat.pendingInstallmentsCount > 0 
                                ? "bg-orange-500/10 border-orange-500/20 text-brand-500 animate-pulse"
                                : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                            )}>
                              {stat.pendingInstallmentsCount} {stat.pendingInstallmentsCount === 1 ? 'CUOTA PEND.' : 'CUOTAS PEND.'}
                            </span>
                          </div>

                          <div className="space-y-1">
                            <span className="text-[8px] text-text-dim uppercase font-black tracking-widest block opacity-70">
                              Monto de cada cuota
                            </span>
                            <p className="text-[11px] font-mono font-black text-text-main max-w-full truncate" title={
                              stat.installmentAmounts.length === 0 ? '$0' : 
                              stat.installmentAmounts.map(amt => `$${amt.toLocaleString('es-AR')}`).join(' y ')
                            }>
                              {stat.installmentAmounts.length === 0 ? '-' : 
                               stat.installmentAmounts.map(amt => `$${amt.toLocaleString('es-AR')}`).join(' / ')
                              }
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 pt-2.5 border-t border-border-dim/40 flex justify-between items-end">
                          <div>
                            <span className="text-[8px] text-text-dim uppercase font-black tracking-widest block opacity-70">
                              Monto total pendiente
                            </span>
                            <p className="text-sm font-mono font-black text-emerald-400 italic font-bold">
                              ${stat.totalPendingAmount.toLocaleString('es-AR')}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}

                    {bankEntityStats.length === 0 && (
                      <div className="col-span-full py-6 text-center text-[10px] text-text-dim uppercase font-bold italic">
                        No se encontraron registros de pasivos bancarios por entidad
                      </div>
                    )}
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
                        setSelectedEntity(taxEntities[0]?.value || '');
                        setSelectedTaxType(taxTypes[0]?.value || '');
                        setShowAddTaxEntity(false);
                        setShowAddTaxType(false);
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

      {/* Close Week / Arqueo Real Modal */}
      <AnimatePresence>
        {showCloseWeekModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCloseWeekModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-lg bg-bg-card border border-border-dim rounded-lg shadow-2xl overflow-hidden"
            >
              <div className="p-6 border-b border-border-dim bg-bg-accent/50 flex justify-between items-center">
                 <div>
                   <h3 className="text-xs font-black uppercase tracking-widest text-text-main">Cerrar Semana y Fijar Saldos Reales</h3>
                   <p className="text-[9px] text-text-dim uppercase font-bold mt-1">Domingo - {activeWeekRange.sunday}</p>
                 </div>
                 <button onClick={() => setShowCloseWeekModal(false)}><X size={18} className="text-text-dim" /></button>
              </div>
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto w-full">
                 <p className="text-[10px] text-text-dim uppercase font-bold leading-relaxed">
                   Ingresa los saldos reales de cierre contados al finalizar el domingo. Estos valores se guardarán como el saldo inicial oficial para los reportes y proyecciones de las semanas siguientes.
                 </p>
                 
                 <div className="space-y-3">
                   {ACCOUNTS.map(acc => {
                     const IconComp = acc.icon;
                     return (
                       <div key={acc.id} className="bg-bg-main border border-border-dim rounded-lg p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                         <div className="flex items-center gap-2.5">
                           <IconComp size={16} className={acc.color} />
                           <div>
                             <p className="text-[10px] font-black uppercase tracking-wider text-text-main">{acc.name}</p>
                             <p className="text-[8px] font-mono text-text-dim">Proyectado: ${(dailyAccountBalancesProjected[6]?.accounts[acc.id]?.end || 0).toLocaleString('es-AR')}</p>
                           </div>
                         </div>
                         <div className="flex items-center gap-1.5 self-start sm:self-auto">
                           <span className="text-text-dim font-mono text-xs font-bold">$</span>
                           <input 
                             type="number" 
                             value={closeWeekForm[acc.id] !== undefined ? closeWeekForm[acc.id] : ''}
                             onChange={(e) => {
                               const val = parseFloat(e.target.value);
                               setCloseWeekForm(prev => ({
                                 ...prev,
                                 [acc.id]: isNaN(val) ? 0 : val
                               }));
                             }}
                             className="w-32 bg-bg-card border border-border-dim rounded px-2.5 py-1.5 text-xs text-text-main outline-none focus:border-brand-500 font-mono text-right font-black"
                             placeholder="0"
                           />
                         </div>
                       </div>
                     );
                   })}
                 </div>

                 <div className="p-4 bg-brand-500/5 border border-brand-500/20 rounded-lg">
                    <p className="text-[9px] text-brand-500 font-black uppercase tracking-widest flex items-center gap-2">
                       <AlertCircle size={12} /> Impacto en Saldos Iniciales
                    </p>
                    <p className="text-[9px] text-text-dim mt-1 leading-relaxed font-bold uppercase">
                       Al confirmar el cierre, la semana entrante (<span className="text-brand-500 font-mono">Lunes {(() => {
                         const nextMondayObj = new Date(activeWeekRange.sunday + 'T12:00:00');
                         nextMondayObj.setDate(nextMondayObj.getDate() + 1);
                         return nextMondayObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
                       })()}</span>) se iniciará exactamente con los saldos reales aquí declarados.
                    </p>
                 </div>

                 <div className="flex gap-3 pt-2">
                   <button 
                    onClick={() => setShowCloseWeekModal(false)}
                    className="w-1/2 bg-transparent hover:bg-bg-accent text-text-main border border-border-dim py-3 rounded text-[10px] font-black uppercase tracking-widest transition-all"
                   >
                     Cancelar
                   </button>
                   <button 
                    onClick={() => {
                      const newClosings = {
                        ...weeklyClosings,
                        [activeWeekRange.sunday]: closeWeekForm
                      };
                      saveWeeklyClosings(newClosings);
                      setShowCloseWeekModal(false);
                      alert("¡Saldos de cierre registrados exitosamente! El saldo final servirá como saldo inicial de la semana entrante.");
                    }}
                    className="w-1/2 bg-brand-500 hover:bg-brand-600 text-black py-3 rounded text-[10px] font-black uppercase tracking-widest transition-all shadow-xl shadow-brand-500/10"
                   >
                     Guardar Cierre
                   </button>
                 </div>
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
                    <div className="flex justify-between items-center bg-transparent">
                      <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Entidad Fiscal</label>
                      <button 
                        type="button"
                        onClick={() => {
                          setShowAddTaxEntity(!showAddTaxEntity);
                          setNewTaxEntityName('');
                        }}
                        className="text-[9px] font-black text-brand-500 uppercase tracking-widest hover:text-brand-400 transition-colors"
                      >
                        {showAddTaxEntity ? "[X] Cancelar" : "+ Nueva"}
                      </button>
                    </div>
                    {showAddTaxEntity ? (
                      <div className="flex gap-1">
                        <input 
                          type="text"
                          value={newTaxEntityName}
                          onChange={(e) => setNewTaxEntityName(e.target.value)}
                          placeholder="Nueva entidad..."
                          className="flex-1 bg-bg-accent border border-brand-500 rounded px-2.5 py-1.5 outline-none font-bold text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const trimmed = newTaxEntityName.trim();
                            if (!trimmed) return;
                            if (taxEntities.some(e => e.value.toLowerCase() === trimmed.toLowerCase())) {
                              alert("Esta entidad ya existe.");
                              return;
                            }
                            const newObj = { value: trimmed, label: trimmed };
                            const updated = [...taxEntities, newObj];
                            saveTaxEntities(updated);
                            setSelectedEntity(trimmed);
                            setNewTaxEntityName('');
                            setShowAddTaxEntity(false);
                          }}
                          className="bg-brand-500 hover:bg-brand-600 text-black font-black px-2.5 rounded text-[10px] uppercase"
                        >
                          OK
                        </button>
                      </div>
                    ) : (
                      <select 
                        id="t-entity" 
                        value={selectedEntity}
                        onChange={(e) => setSelectedEntity(e.target.value)}
                        className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 font-bold text-xs"
                      >
                        {taxEntities.map(e => (
                          <option key={e.value} value={e.value}>{e.label}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between items-center bg-transparent">
                      <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Tipo de Impuesto</label>
                      <button 
                        type="button"
                        onClick={() => {
                          setShowAddTaxType(!showAddTaxType);
                          setNewTaxTypeName('');
                        }}
                        className="text-[9px] font-black text-brand-500 uppercase tracking-widest hover:text-brand-400 transition-colors"
                      >
                        {showAddTaxType ? "[X] Cancelar" : "+ Nuevo"}
                      </button>
                    </div>
                    {showAddTaxType ? (
                      <div className="flex gap-1">
                        <input 
                          type="text"
                          value={newTaxTypeName}
                          onChange={(e) => setNewTaxTypeName(e.target.value)}
                          placeholder="Nuevo impuesto..."
                          className="flex-1 bg-bg-accent border border-brand-500 rounded px-2.5 py-1.5 outline-none font-bold text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const trimmed = newTaxTypeName.trim();
                            if (!trimmed) return;
                            if (taxTypes.some(t => t.value.toLowerCase() === trimmed.toLowerCase() || t.label.toLowerCase() === trimmed.toLowerCase())) {
                              alert("Este impuesto ya existe.");
                              return;
                            }
                            const newObj = { value: trimmed, label: trimmed };
                            const updated = [...taxTypes, newObj];
                            saveTaxTypes(updated);
                            setSelectedTaxType(trimmed);
                            setNewTaxTypeName('');
                            setShowAddTaxType(false);
                          }}
                          className="bg-brand-500 hover:bg-brand-600 text-black font-black px-2.5 rounded text-[10px] uppercase"
                        >
                          OK
                        </button>
                      </div>
                    ) : (
                      <select 
                        id="t-taxtype" 
                        value={selectedTaxType}
                        onChange={(e) => setSelectedTaxType(e.target.value)}
                        className="w-full bg-bg-accent border border-border-dim rounded px-4 py-2.5 outline-none focus:border-brand-500 font-bold text-xs"
                      >
                        {taxTypes.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    )}
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
                      const entity = selectedEntity || (taxEntities[0]?.value || '');
                      const taxType = selectedTaxType || (taxTypes[0]?.value || '');
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
                <div className="bg-bg-accent/40 p-4 rounded border border-border-dim/40 leading-relaxed text-text-dim flex flex-wrap justify-between items-center gap-4">
                  <div className="flex-1 min-w-[280px]">
                    <p className="font-bold text-text-main uppercase text-[9px] tracking-widest mb-1">Pasos Rápidos:</p>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>Abra su archivo Excel o Planilla de Google Sheets.</li>
                      <li>Seleccione las columnas deseadas y su contenido con el mouse, luego oprima <strong className="text-brand-500 font-mono">CTRL + C</strong>.</li>
                      <li>Oprima <strong className="text-brand-500 font-mono">CTRL + V</strong> en el cuadro inferior y haga click en <strong className="text-brand-400 font-bold uppercase">Procesar Portapapeles</strong>.</li>
                    </ol>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        let content = "";
                        let filename = "";
                        if (mode === 'bank') {
                          content = "Banco\tFecha Solicitud\tImporte Solicitado\tDestino\tTasa\tCuota\tMonto Cuota\tFecha Vencimiento\n" +
                                    "BBVA Frances\t2026-04-10\t15000000\tReformas Yerba Buena\t72% TNA\t1 de 12\t1750000\t2026-05-10\n" +
                                    "Banco Galicia\t2026-05-01\t8000000\tMaquinaria Salon\t68% TNA\t1 de 6\t1500000\t2026-06-01";
                          filename = "planilla_modelo_bancos.txt";
                        } else {
                          content = "Entidad\tImpuesto\tImporte Total Plan\tNro de Plan\tCuota\tMonto Cuota\tFecha Vencimiento\n" +
                                    "ARCA (AFIP)\tIVA Dec/Saldos\t5000000\tPlan AFIP 4242\t1 de 6\t950000\t2026-06-15\n" +
                                    "Rentas Tucuman\tIngresos Brutos\t2400000\tCORRIENTE\t1 de 1\t2400000\t2026-06-10";
                          filename = "planilla_modelo_impuestos.txt";
                        }
                        const blob = new Blob([content], { type: 'text/tab-separated-values;charset=utf-8' });
                        const link = document.createElement("a");
                        link.href = URL.createObjectURL(blob);
                        link.download = filename;
                        link.click();
                      }}
                      className="bg-brand-500 text-black hover:bg-brand-600 px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest transition-all text-center flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
                    >
                      <FileSpreadsheet size={13} /> Descargar Excel / Planilla Modelo
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        let sample = "";
                        if (mode === 'bank') {
                          sample = "Banco\tFecha Solicitud\tImporte Solicitado\tDestino\tTasa\tCuota\tMonto Cuota\tFecha Vencimiento\n" +
                                   "BBVA Frances\t2026-04-10\t15000000\tReformas Yerba Buena\t72% TNA\t1 de 12\t1750000\t2026-05-10\n" +
                                   "Banco Galicia\t2026-05-01\t8000000\tMaquinaria Salon\t68% TNA\t1 de 6\t1500000\t2026-06-01";
                        } else {
                          sample = "Entidad\tImpuesto\tImporte Total Plan\tNro de Plan\tCuota\tMonto Cuota\tFecha Vencimiento\n" +
                                   "ARCA (AFIP)\tIVA Dec/Saldos\t5000000\tPlan AFIP 4242\t1 de 6\t950000\t2026-06-15\n" +
                                   "Rentas Tucuman\tIngresos Brutos\t2400000\tCORRIENTE\t1 de 1\t2400000\t2026-06-10";
                        }
                        navigator.clipboard.writeText(sample);
                        alert("¡Formato de planilla de ejemplo copiado al portapapeles! Listo para pegar en Excel.");
                      }}
                      className="bg-bg-accent border border-border-dim text-text-main hover:border-brand-500 hover:text-brand-500 px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all text-center cursor-pointer"
                    >
                      Copiar Formato Ejemplo
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">OPCIÓN 1 · SUBIR ARCHIVO EXCEL DIRECTAMENTE</label>
                  <label className="flex items-center justify-center gap-2 bg-brand-500/10 border-2 border-dashed border-brand-500/40 rounded p-4 cursor-pointer hover:bg-brand-500/15 transition-all">
                    <Upload size={16} className="text-brand-500" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-brand-500">Seleccionar archivo .xlsx</span>
                    <input type="file" accept=".xlsx,.xls" onChange={handleImportExcelFile} className="hidden" />
                  </label>
                  <p className="text-[8px] text-text-dim font-bold uppercase opacity-60">Se lee la primera hoja del Excel. Las columnas se reconocen por su nombre.</p>
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">OPCIÓN 2 · ZONA DE PEGO (TEXTO EN FORMATO DE TABULACIÓN)</label>
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

      {/* Calendario de vencimientos (solo pasivos bancarios y fiscales) */}
      {(mode === 'bank' || mode === 'tax') && (
        <PaymentCalendar
          title={mode === 'bank' ? 'Calendario de Pasivos Bancarios' : 'Calendario de Pasivos Fiscales'}
          items={filteredPayments.filter((p: any) => p.dueDate).map((p: any) => ({
            id: p.id,
            label: p.description || 'Pago',
            amount: Number(p.amount) || 0,
            date: p.dueDate,
            status: p.status === 'paid' ? 'paid' : 'pending'
          }))}
        />
      )}

    </motion.div>
  );
}
