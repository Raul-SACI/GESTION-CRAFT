/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  Calendar, 
  FileSpreadsheet, 
  Trash2, 
  Plus, 
  Zap, 
  X, 
  HelpCircle,
  DollarSign
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';

interface HrMonthlyPayrollViewProps {
  branches: Branch[];
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
}

function getPositionRateFromMaestro(roleId: string, roleLabel: string): number {
  const saved = localStorage.getItem('craft_salary_positions');
  if (saved) {
    try {
      const positions = JSON.parse(saved);
      const hourly = positions.filter((p: any) => p.type === 'hourly');
      const exact = hourly.find((p: any) => p.title.toLowerCase().trim() === roleLabel.toLowerCase().trim());
      if (exact) return exact.baseValue;
      const approx = hourly.find((p: any) =>
        p.title.toLowerCase().includes(roleLabel.toLowerCase()) ||
        roleLabel.toLowerCase().includes(p.title.toLowerCase())
      );
      if (approx) return approx.baseValue;
    } catch(e) {}
  }
  return 0;
}

export default function HrMonthlyPayrollView({ branches, selectedMonth, setSelectedMonth }: HrMonthlyPayrollViewProps) {
  const [payrollItems, setPayrollItems] = useState<any[]>([]);
  const [payrollFilterBranch, setPayrollFilterBranch] = useState<string>('all');
  const selectedBranch = payrollFilterBranch; // alias used in sync functions
  const [showAddPayrollModal, setShowAddPayrollModal] = useState(false);
  const [newPayrollItem, setNewPayrollItem] = useState({
    employeeName: '',
    branchId: '',
    positionLabel: 'Cocinero',
    salaryType: 'hourly' as 'hourly' | 'monthly',
    hoursWorked: 0,
    baseRateOrSalary: 3200,
    holidayDaysCount: 0,
    additionalBonus: 0,
    novedades: '',
    amountTransfer: 0,
    amountCash: 0
  });

  const payrollBranches = [
    ...branches.map(b => ({ id: b.id, name: b.name })),
    { id: 'admin', name: 'Administración' },
    { id: 'deposito', name: 'Depósito Central' }
  ];

  // Load monthly payroll records from Supabase (fallback to localStorage)
  useEffect(() => {
    const loadPayroll = async () => {
      try {
        let query = supabase
          .from('hr_monthly_payroll')
          .select('*')
          .eq('month', selectedMonth);
        if (payrollFilterBranch !== 'all') {
          query = query.eq('branch_id', payrollFilterBranch);
        }
        const { data, error } = await query;

        if (!error && data && data.length > 0) {
          // Filter out fake/invalid records:
          // - no position (SIN CARGO)  
          // - employee_name same as position_name (means it was set from puesto, not real person)
          const valid = data.filter((r: any) => {
            if (!r.position_name || r.position_name === 'Sin cargo' || r.position_name === 'SIN CARGO') return false;
            const empUpper = (r.employee_name || '').toUpperCase().trim();
            const posUpper = (r.position_name || '').toUpperCase().trim();
            // If employee name equals position name, it's fake data
            if (empUpper === posUpper) return false;
            return true;
          });
          if (valid.length === 0) { setPayrollItems([]); return; }
          // Map Supabase columns back to payrollItem shape
          const mapped = valid.map((r: any) => ({
            id: r.id || `db-${r.branch_id}-${r.position_name}-${Date.now()}`,
            branchId: r.branch_id,
            branchName: branches.find(b => b.id === r.branch_id)?.name || r.branch_id,
            employeeName: r.employee_name || r.position_name,
            positionLabel: r.position_name,
            salaryType: r.total_hours > 0 ? 'hourly' : 'monthly',
            hoursWorked: r.total_hours || 0,
            baseRateOrSalary: r.hourly_rate || r.gross_salary || 0,
            holidayDaysCount: r.holiday_days || 0,
            additionalBonus: r.bonus || 0,
            novedades: r.notes || '',
            totalToCollect: r.net_salary || r.gross_salary || 0,
            amountTransfer: r.amount_transfer ?? (r.net_salary || 0),
            amountCash: r.amount_cash ?? 0,
          }));
          setPayrollItems(mapped);
          return;
        }
      } catch (e) {
        console.error('Error loading payroll from Supabase:', e);
      }
      // Fallback to localStorage - but filter fake data
      const key = `hr_monthly_payroll_${selectedMonth}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          const clean = parsed.filter((i: any) => i.positionLabel && i.positionLabel !== 'Sin cargo');
          setPayrollItems(clean);
        } catch(e) { setPayrollItems([]); }
      } else {
        setPayrollItems([]);
      }
    };
    loadPayroll();
  }, [selectedMonth, payrollFilterBranch, branches]);

  // Handle inline updates of fields
  const handleUpdatePayrollField = async (itemId: string, field: string, value: any) => {
    const updated = payrollItems.map(item => {
      if (item.id === itemId) {
        const newItem = { ...item, [field]: value };
        // Recalculate total to collect based on contract type
        let computed = 0;
        const hours = parseFloat(newItem.hoursWorked) || 0;
        const rateOrSueldo = parseFloat(newItem.baseRateOrSalary) || 0;
        const holidays = parseInt(newItem.holidayDaysCount) || 0;
        const bonus = parseFloat(newItem.additionalBonus) || 0;

        if (newItem.salaryType === 'hourly') {
          // Pay hours + Double pay premium for Holiday hours (equivalent to +8 hours of pay per holiday worked)
          computed = (hours * rateOrSueldo) + (holidays * 8 * rateOrSueldo) + bonus;
        } else {
          // Pay Monthly + Divisor 25 double holiday day extra pay (+1 extra day factor)
          computed = rateOrSueldo + (holidays * (rateOrSueldo / 25)) + bonus;
        }
        newItem.totalToCollect = computed;
        return newItem;
      }
      return item;
    });
    setPayrollItems(updated);
    localStorage.setItem(`hr_monthly_payroll_${selectedMonth}`, JSON.stringify(updated));
    // Supabase sync
    try {
      const upsertData = updated.map((p: any) => ({
        branch_id: selectedBranch || 'all',
        month: selectedMonth,
        employee_name: p.employeeName || p.name || 'Sin nombre',
        position_name: p.position || p.positionName || 'Sin cargo',
        total_hours: p.totalHours || p.hours || 0,
        hourly_rate: p.hourlyRate || p.rate || 0,
        gross_salary: p.grossSalary || p.totalAmount || 0,
        deductions: p.deductions || 0,
        net_salary: p.netSalary || p.total || 0,
        status: p.status || 'draft',
        notes: p.notes || ''
      }));
      if (upsertData.length > 0) {
        await supabase.from('hr_monthly_payroll').delete().eq('branch_id', selectedBranch || 'all').eq('month', selectedMonth);
        await supabase.from('hr_monthly_payroll').insert(upsertData);
      }
    } catch(e) { console.error('Error sync payroll:', e); }
  };

  // Sync: auto-generate payroll items from hour_logs (has real employee names + hours)
  const handleSyncWithWeeklyControl = async () => {
    try {
      // Read from hour_logs - has employee_name, position, hours_actual per day
      let query = supabase
        .from('hour_logs')
        .select('branch_id, employee_name, position, position_id, hours_actual, week_number, month')
        .eq('month', selectedMonth);
      if (payrollFilterBranch !== 'all') {
        query = query.eq('branch_id', payrollFilterBranch);
      }
      const { data: hourLogs, error } = await query;

      if (error) throw error;
      if (!hourLogs || hourLogs.length === 0) {
        alert('No se hallaron horas cargadas para este mes. El encargado debe confirmar días en Carga de Horas primero.');
        return;
      }

      // Group by branch + employee_name + position and sum hours_actual across all days
      const groupMap: Record<string, any> = {};
      hourLogs.forEach((log: any) => {
        if (!log.hours_actual || Number(log.hours_actual) === 0) return;
        const empName = (log.employee_name || '').trim().toUpperCase();
        const posId = log.position_id || log.position || 'unknown';
        const posLabel = log.position || log.position_id || 'Sin cargo';
        const key = `${log.branch_id}|${empName}|${posId}`;
        if (!groupMap[key]) {
          groupMap[key] = {
            branchId: log.branch_id,
            branchName: branches.find(b => b.id === log.branch_id)?.name || log.branch_id,
            positionId: posId,
            positionLabel: posLabel,
            employeeName: empName || posLabel.toUpperCase(),
            hourlyRate: 0,
            totalHours: 0,
          };
        }
        groupMap[key].totalHours += Number(log.hours_actual);
      });

      const newItems = Object.values(groupMap).map((g: any) => {
        const rate = g.hourlyRate || getPositionRateFromMaestro(g.positionId, g.positionLabel);
        const computed = Math.round(g.totalHours * rate);
        return {
          id: `sync-${g.branchId}-${g.employeeName?.replace(/\s+/g,'-')}-${g.positionId}-${selectedMonth}`,
          branchId: g.branchId,
          branchName: g.branchName,
          employeeName: g.employeeName || g.positionLabel.toUpperCase(),
          positionLabel: g.positionLabel,
          salaryType: 'hourly',
          hoursWorked: g.totalHours,
          baseRateOrSalary: rate,
          holidayDaysCount: 0,
          additionalBonus: 0,
          novedades: '',
          totalToCollect: computed,
          amountTransfer: computed,
          amountCash: 0,
        };
      });

      if (newItems.length === 0) {
        alert('Todos los registros auditados tienen 0 horas. Guardá las horas en Control Semanal primero.');
        return;
      }

      // Keep existing monthly-salary items, replace hourly items with fresh sync
      const existingMonthly = payrollItems.filter((i: any) => i.salaryType === 'monthly');
      const merged = [...existingMonthly, ...newItems];
      setPayrollItems(merged);
      localStorage.setItem(`hr_monthly_payroll_${selectedMonth}`, JSON.stringify(merged));

      // Save to Supabase
      try {
        const upsertData = merged.map((p: any) => ({
          id: p.id,
          branch_id: p.branchId,
          month: selectedMonth,
          employee_name: p.employeeName,
          position_name: p.positionLabel,
          total_hours: p.hoursWorked || 0,
          hourly_rate: p.baseRateOrSalary || 0,
          gross_salary: p.totalToCollect || 0,
          net_salary: p.totalToCollect || 0,
          holiday_days: p.holidayDaysCount || 0,
          bonus: p.additionalBonus || 0,
          notes: p.novedades || '',
          amount_transfer: p.amountTransfer ?? p.totalToCollect ?? 0,
          amount_cash: p.amountCash ?? 0,
          status: 'draft',
        }));
        await supabase.from('hr_monthly_payroll')
          .delete()
          .eq('month', selectedMonth)
          .eq('branch_id', payrollFilterBranch !== 'all' ? payrollFilterBranch : upsertData[0]?.branch_id);
        await supabase.from('hr_monthly_payroll').insert(upsertData);
      } catch(e) { console.error('Error saving payroll to Supabase:', e); }

      alert(`Sincronización exitosa: ${newItems.length} puestos generados desde Control Semanal.`);
    } catch (err: any) {
      console.error('Error syncing with weekly control:', err);
      alert(`Error al sincronizar: ${err.message}`);
    }
  };

  // Export payroll list to CSV text/spreadsheet
  const handleExportPayrollCSV = (mode: 'branch' | 'consolidated' = 'branch') => {
    const filtered = mode === 'consolidated'
      ? payrollItems
      : payrollItems.filter(item => payrollFilterBranch === 'all' || item.branchId === payrollFilterBranch);

    if (filtered.length === 0) {
      alert('No hay registros en la liquidación para exportar.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // Group by branch for multi-sheet export
    const byBranch: Record<string, any[]> = {};
    filtered.forEach(item => {
      const key = item.branchName || item.branchId || 'Sin sucursal';
      if (!byBranch[key]) byBranch[key] = [];
      byBranch[key].push(item);
    });

    const buildSheet = (items: any[], title: string) => {
      const headerRow = ['SUCURSAL', 'NOMBRE / PUESTO', 'PUESTO', 'TIPO', 'HS REALES', 'VALOR HS ($)', 'FERIADOS', 'BONOS ($)', 'NOVEDADES', 'TRANSFERENCIA ($)', 'EFECTIVO ($)', 'TOTAL A COBRAR ($)'];
      const dataRows = items.map(item => [
        item.branchName,
        item.employeeName,
        item.positionLabel,
        item.salaryType === 'hourly' ? 'POR HORA' : 'MENSUAL',
        item.salaryType === 'hourly' ? item.hoursWorked : '',
        item.salaryType === 'hourly' ? item.baseRateOrSalary : '',
        item.holidayDaysCount || 0,
        item.additionalBonus || 0,
        item.novedades || '',
        item.amountTransfer ?? item.totalToCollect ?? 0,
        item.amountCash ?? 0,
        item.totalToCollect,
      ]);

      // Totals row
      const totalHours = items.filter(i => i.salaryType === 'hourly').reduce((s, i) => s + (i.hoursWorked || 0), 0);
      const totalTransfer = items.reduce((s, i) => s + (i.amountTransfer ?? i.totalToCollect ?? 0), 0);
      const totalCash = items.reduce((s, i) => s + (i.amountCash ?? 0), 0);
      const totalPayout = items.reduce((s, i) => s + i.totalToCollect, 0);
      const totalsRow = ['TOTAL', '', '', '', totalHours, '', '', '', '', totalTransfer, totalCash, totalPayout];

      const wsData = [headerRow, ...dataRows, [], totalsRow];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      // Column widths
      ws['!cols'] = [
        {wch:22},{wch:28},{wch:18},{wch:12},{wch:10},{wch:12},
        {wch:10},{wch:12},{wch:30},{wch:18},{wch:14},{wch:18}
      ];
      return ws;
    };

    if (mode === 'consolidated') {
      // One sheet per branch + consolidated sheet
      Object.entries(byBranch).forEach(([branchName, items]) => {
        const safeName = branchName.replace(/[:\/?*[\]]/g, '').substring(0, 31);
        XLSX.utils.book_append_sheet(wb, buildSheet(items, branchName), safeName);
      });
      // Consolidated sheet
      XLSX.utils.book_append_sheet(wb, buildSheet(filtered, 'CONSOLIDADO'), 'CONSOLIDADO');
    } else {
      const branchName = filtered[0]?.branchName || 'Sucursal';
      XLSX.utils.book_append_sheet(wb, buildSheet(filtered, branchName), branchName.substring(0, 31));
    }

    const label = mode === 'consolidated' ? 'CONSOLIDADO' : (filtered[0]?.branchName || payrollFilterBranch);
    XLSX.writeFile(wb, `liquidacion_${selectedMonth}_${label}.xlsx`);
    return; // early return - no more code needed below
    const rows: string[] = []; // unused but keeps TS happy
    
    const content = [headers, ...rows].join('\n');
    const blob = new Blob([content], { type: 'text/tab-separated-values;charset=utf-8' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `liquidacion_mensual_${selectedMonth}_${payrollFilterBranch}.txt`;
    link.click();
  };

  const filteredItems = payrollItems.filter(item => payrollFilterBranch === 'all' || item.branchId === payrollFilterBranch);

  return (
    <div className="space-y-6">
      {/* STATISTICS CARDS GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 shadow-xl">
          <span className="text-[8px] font-black uppercase text-text-dim tracking-widest block mb-1">Total Liquidado Bruto</span>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-black font-mono text-brand-500">
              ${filteredItems.reduce((sum, item) => sum + item.totalToCollect, 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </span>
            <span className="text-[9px] font-bold text-text-dim uppercase font-mono">ARS</span>
          </div>
          <span className="text-[8.5px] font-bold uppercase text-text-dim mt-2 block">Sueldos del mes de {selectedMonth.split('-')[1]}/{selectedMonth.split('-')[0]}</span>
        </div>

        <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 shadow-xl">
          <span className="text-[8px] font-black uppercase text-text-dim tracking-widest block mb-1">Liquidaciones Activas</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black font-mono text-text-main">
              {filteredItems.length}
            </span>
            <span className="text-[9px] font-bold text-text-dim uppercase">Personas</span>
          </div>
          <span className="text-[8.5px] font-bold uppercase text-text-dim mt-2 block">
            {filteredItems.filter(item => item.salaryType === 'monthly').length} Mensuales • {filteredItems.filter(item => item.salaryType === 'hourly').length} Jornaleros
          </span>
        </div>

        <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 shadow-xl">
          <span className="text-[8px] font-black uppercase text-text-dim tracking-widest block mb-1">Horas Reales Acumuladas</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black font-mono text-text-main">
              {filteredItems.reduce((sum, item) => sum + (item.hoursWorked || 0), 0).toFixed(1)}h
            </span>
            <span className="text-[9px] font-bold text-text-dim uppercase">Cargadas</span>
          </div>
          <span className="text-[8.5px] font-bold uppercase text-brand-500 tracking-wider mt-2 block font-sans">Exclusivo por hora</span>
        </div>

        <div className="bg-bg-sidebar border border-border-dim rounded-lg p-5 shadow-xl">
          <span className="text-[8px] font-black uppercase text-text-dim tracking-widest block mb-1">Feriados Trabajados (Novedad)</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-black font-mono text-amber-500">
              {filteredItems.reduce((sum, item) => sum + (item.holidayDaysCount || 0), 0)} días
            </span>
            <span className="text-[9px] font-bold text-text-dim uppercase">Feriados</span>
          </div>
          <span className="text-[8.5px] font-bold uppercase text-text-dim mt-2 block">Adicionados a la liquidación</span>
        </div>
      </div>

      {/* FILTER AND ACTION CONTROLS */}
      <div className="bg-bg-sidebar border border-border-dim rounded-lg p-6 shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4 flex-1">
          <div className="space-y-1 min-w-[200px]">
            <label className="text-[9px] font-black text-text-dim uppercase tracking-widest block">Filtrar por Sucursal / Sector</label>
            <select 
              value={payrollFilterBranch}
              onChange={e => setPayrollFilterBranch(e.target.value)}
              className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-xs font-bold text-text-main outline-none focus:border-brand-500 transition-all uppercase w-full cursor-pointer"
            >
              <option value="all">TODAS LAS SUCURSALES / SECTORES</option>
              {payrollBranches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[9px] font-black text-text-dim uppercase tracking-widest block">Mes Operativo</label>
            <input 
              type="month"
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-xs text-brand-500 font-mono font-bold outline-none focus:border-brand-500 transition-all uppercase cursor-pointer"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button 
            onClick={handleSyncWithWeeklyControl}
            className="px-4 py-3 bg-[#1F2937]/80 hover:bg-[#1F2937]/100 border border-border-dim text-brand-500 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer shadow-md"
            title="Importa automágicamente la suma de las horas reales de las 4 semanas auditadas de este mes"
          >
            <Zap size={13} className="text-brand-500 fill-brand-500" /> Sincronizar Horas Reales
          </button>

          <button 
            onClick={() => handleExportPayrollCSV('branch')}
            className="px-4 py-3 bg-bg-accent border border-border-dim text-text-dim hover:text-text-main rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer"
          >
            <FileSpreadsheet size={13} /> Exportar Sucursal
          </button>
          <button 
            onClick={() => handleExportPayrollCSV('consolidated')}
            className="px-4 py-3 bg-bg-accent border border-border-dim text-text-dim hover:text-teal-400 hover:border-teal-500/40 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer"
          >
            <FileSpreadsheet size={13} /> Exportar Consolidado
          </button>
        </div>
      </div>

      {/* PAYROLL DETAILS MAIN SPREADSHEET */}
      <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1240px]">
            <thead>
              <tr className="bg-bg-accent/40 border-b border-border-dim">
                <th className="px-5 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest">Sucursal / Origen</th>
                <th className="px-5 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest">Nombre Completo</th>
                <th className="px-5 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest">Puesto</th>
                <th className="px-5 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Tipo Contrato</th>
                <th className="px-5 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Total Horas Reales</th>
                <th className="px-5 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Sueldo Base / Valor Hs</th>
                <th className="px-5 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Feriados Trab. (Días)</th>
                <th className="px-5 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Bonos / Adicionales ($)</th>
                <th className="px-5 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest">Novedades / Observación</th>
                <th className="px-5 py-4 text-[9px] font-black uppercase text-teal-500 tracking-widest text-right">Transferencia ($)</th>
                <th className="px-5 py-4 text-[9px] font-black uppercase text-amber-500 tracking-widest text-right">Efectivo ($)</th>
                <th className="px-5 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-right">Monto Líquido a Cobrar</th>
                <th className="px-5 py-4 text-[9px] font-black uppercase text-text-dim tracking-widest text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim/40 text-xs">
              {filteredItems.map(item => {
                const isHourly = item.salaryType === 'hourly';

                return (
                  <tr key={item.id} className="hover:bg-bg-accent/5 transition-all text-[11px]">
                    {/* Branch Label */}
                    <td className="px-5 py-4 uppercase font-bold text-text-dim">
                      {item.branchName}
                    </td>

                    {/* Employee Name */}
                    <td className="px-5 py-4 uppercase font-black text-text-main tracking-wider font-sans">
                      {item.employeeName}
                    </td>

                    {/* Position Label */}
                    <td className="px-5 py-4 uppercase font-bold text-text-dim">
                      {item.positionLabel}
                    </td>

                    {/* Salary Type BADGES */}
                    <td className="px-5 py-4 text-center">
                      {isHourly ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 text-[8px] font-black uppercase border border-amber-500/20">
                          POR HORA
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[8px] font-black uppercase border border-purple-500/20">
                          MENSUALIZADO
                        </span>
                      )}
                    </td>

                    {/* Hours worked input */}
                    <td className="px-5 py-4 text-center">
                      {isHourly ? (
                        <div className="inline-flex items-center justify-center gap-1.5">
                          <input 
                            type="number"
                            value={item.hoursWorked}
                            onChange={e => handleUpdatePayrollField(item.id, 'hoursWorked', parseFloat(e.target.value) || 0)}
                            className="w-16 bg-bg-accent/60 text-center font-mono font-bold text-text-main border border-border-dim/50 rounded py-1 text-xs focus:border-brand-500 focus:bg-bg-accent transition-all outline-none"
                            placeholder="0"
                          />
                          <span className="text-[10px] text-text-dim font-bold">hs</span>
                        </div>
                      ) : (
                        <span className="text-text-dim/40 font-mono font-semibold">Mensual Fijo</span>
                      )}
                    </td>

                    {/* Base Rate / Salary */}
                    <td className="px-5 py-4 text-center">
                      <div className="inline-flex items-center gap-1">
                        <span className="text-text-dim font-bold">$</span>
                        <input 
                          type="number"
                          value={item.baseRateOrSalary}
                          onChange={e => handleUpdatePayrollField(item.id, 'baseRateOrSalary', parseFloat(e.target.value) || 0)}
                          className="w-22 bg-bg-accent/60 text-center font-mono font-bold text-text-main border border-border-dim/50 rounded py-1 text-xs focus:border-brand-500 focus:bg-bg-accent transition-all outline-none"
                          placeholder="0"
                        />
                        {isHourly && <span className="text-[9px] text-text-dim font-semibold">/h</span>}
                      </div>
                    </td>

                    {/* Holidays worked */}
                    <td className="px-5 py-4 text-center">
                      <input 
                        type="number"
                        value={item.holidayDaysCount || 0}
                        onChange={e => handleUpdatePayrollField(item.id, 'holidayDaysCount', parseInt(e.target.value) || 0)}
                        className="w-12 bg-bg-accent/60 text-center font-mono font-bold text-brand-500 border border-border-dim/50 rounded py-1 text-xs focus:border-brand-500 focus:bg-bg-accent transition-all outline-none"
                        placeholder="0"
                        min="0"
                      />
                    </td>

                    {/* Additional Bonus adjustment */}
                    <td className="px-5 py-4 text-center">
                      <div className="inline-flex items-center gap-1">
                        <span className="text-text-dim font-bold">$</span>
                        <input 
                          type="number"
                          value={item.additionalBonus || 0}
                          onChange={e => handleUpdatePayrollField(item.id, 'additionalBonus', parseFloat(e.target.value) || 0)}
                          className="w-18 bg-bg-accent/60 text-center font-mono font-bold text-emerald-400 border border-border-dim/50 rounded py-1 text-xs focus:border-brand-500 focus:bg-bg-accent transition-all outline-none"
                          placeholder="0"
                        />
                      </div>
                    </td>

                    {/* Novedades comments */}
                    <td className="px-5 py-4 min-w-[220px]">
                      <input 
                        type="text"
                        value={item.novedades || ''}
                        onChange={e => handleUpdatePayrollField(item.id, 'novedades', e.target.value)}
                        placeholder="Ej. Trabajó feriado, guardias..."
                        className="w-full bg-transparent border-b border-border-dim/40 hover:border-border-dim focus:border-brand-500 text-[10.5px] text-text-main px-1 py-1 focus:text-text-main outline-none transition-all"
                      />
                    </td>

                    {/* Transferencia */}
                    <td className="px-3 py-4 text-right">
                      <input
                        type="number"
                        value={item.amountTransfer ?? item.totalToCollect ?? 0}
                        onChange={e => handleUpdatePayrollField(item.id, 'amountTransfer', parseFloat(e.target.value) || 0)}
                        className="w-32 bg-bg-accent border border-teal-500/30 rounded px-2 py-1 text-[10px] font-mono text-teal-400 outline-none focus:border-teal-500 text-right"
                      />
                    </td>

                    {/* Efectivo */}
                    <td className="px-3 py-4 text-right">
                      <input
                        type="number"
                        value={item.amountCash ?? 0}
                        onChange={e => handleUpdatePayrollField(item.id, 'amountCash', parseFloat(e.target.value) || 0)}
                        className="w-32 bg-bg-accent border border-amber-500/30 rounded px-2 py-1 text-[10px] font-mono text-amber-400 outline-none focus:border-amber-500 text-right"
                      />
                    </td>

                    {/* Calculated total payout */}
                    <td className="px-5 py-4 text-right">
                      <div className="font-mono font-black text-brand-400 text-xs text-right">
                        ${Math.round(item.totalToCollect).toLocaleString('es-AR')}
                      </div>
                      <div className="text-[8px] text-text-dim uppercase font-bold text-right tracking-widest mt-1 leading-none font-sans">
                        {isHourly ? (
                          <span>{item.hoursWorked} hs x ${item.baseRateOrSalary} {item.holidayDaysCount > 0 ? `+ ${item.holidayDaysCount} f.` : ''}</span>
                        ) : (
                          <span>Sueldo Fijo Mensual {item.holidayDaysCount > 0 ? `+ ${item.holidayDaysCount} f.` : ''}</span>
                        )}
                      </div>
                    </td>

                    {/* Trash remove row */}
                    <td className="px-5 py-4 text-center">
                      <button 
                        onClick={async () => {
                          const conf = window.confirm(`¿Está seguro que desea levantar a ${item.employeeName} de las liquidaciones de este mes?`);
                          if (!conf) return;
                          const updated = payrollItems.filter(p => p.id !== item.id);
                          setPayrollItems(updated);
                          localStorage.setItem(`hr_monthly_payroll_${selectedMonth}`, JSON.stringify(updated));
    // Supabase sync
    try {
      const upsertData = updated.map((p: any) => ({
        branch_id: selectedBranch || 'all',
        month: selectedMonth,
        employee_name: p.employeeName || p.name || 'Sin nombre',
        position_name: p.position || p.positionName || 'Sin cargo',
        total_hours: p.totalHours || p.hours || 0,
        hourly_rate: p.hourlyRate || p.rate || 0,
        gross_salary: p.grossSalary || p.totalAmount || 0,
        deductions: p.deductions || 0,
        net_salary: p.netSalary || p.total || 0,
        status: p.status || 'draft',
        notes: p.notes || ''
      }));
      if (upsertData.length > 0) {
        await supabase.from('hr_monthly_payroll').delete().eq('branch_id', selectedBranch || 'all').eq('month', selectedMonth);
        await supabase.from('hr_monthly_payroll').insert(upsertData);
      }
    } catch(e) { console.error('Error sync payroll:', e); }
                        }}
                        className="p-2 text-text-dim hover:text-red-400 hover:bg-red-500/10 rounded transition-all cursor-pointer"
                        title="Eliminar de la planilla"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={11} className="py-16 text-center text-text-dim text-[11px] font-semibold uppercase tracking-widest bg-bg-accent/15">
                    No se registran datos cargados en esta sucursal o sector para el lapso de {selectedMonth}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* BOTTOM MATRIX TOTALS */}
        <div className="p-6 bg-bg-accent/40 border-t border-border-dim/60 flex flex-wrap justify-between items-center gap-6 text-[11px]">
          <div className="flex flex-wrap gap-4">
            <div className="bg-bg-card border border-border-dim px-4 py-2.5 rounded-lg text-center min-w-[125px]">
              <p className="text-[8px] text-text-dim uppercase font-black tracking-widest">Base Mensuales</p>
              <p className="text-xs font-black font-mono text-text-main mt-0.5">
                ${filteredItems.filter(i => i.salaryType === 'monthly').reduce((sum, item) => sum + item.baseRateOrSalary, 0).toLocaleString('es-AR')}
              </p>
            </div>

            <div className="bg-bg-card border border-border-dim px-4 py-2.5 rounded-lg text-center min-w-[125px]">
              <p className="text-[8px] text-text-dim uppercase font-black tracking-widest">Base Jornaleros</p>
              <p className="text-xs font-black font-mono text-text-main mt-0.5">
                ${filteredItems.filter(i => i.salaryType === 'hourly').reduce((sum, item) => sum + (item.hoursWorked * item.baseRateOrSalary), 0).toLocaleString('es-AR')}
              </p>
            </div>

            <div className="bg-bg-card border border-border-dim px-4 py-2.5 rounded-lg text-center min-w-[125px]">
              <p className="text-[8px] text-text-dim uppercase font-black tracking-widest">Eventos & Premios</p>
              <p className="text-xs font-black font-mono text-amber-400 mt-0.5">
                ${filteredItems.reduce((sum, item) => {
                  let holidayPremium = 0;
                  const rateOrSueldo = item.baseRateOrSalary;
                  const holidays = item.holidayDaysCount;
                  if (item.salaryType === 'hourly') {
                    holidayPremium = holidays * 8 * rateOrSueldo;
                  } else {
                    holidayPremium = holidays * (rateOrSueldo / 25);
                  }
                  return sum + holidayPremium + (item.additionalBonus || 0);
                }, 0).toLocaleString('es-AR')}
              </p>
            </div>

            <div className="bg-bg-card border border-border-dim px-4 py-2.5 rounded-lg text-center min-w-[130px]">
              <p className="text-[8px] text-text-dim uppercase font-black tracking-widest text-[#8B949E]">Consolidado Bruto</p>
              <p className="text-sm font-black font-mono text-brand-500 mt-0.5">
                ${filteredItems.reduce((sum, item) => sum + item.totalToCollect, 0).toLocaleString('es-AR')}
              </p>
            </div>
          </div>

          <div className="text-[9px] uppercase font-bold text-text-dim tracking-tight">
            Los datos introducidos se persisten automáticamente en tiempo real.
          </div>
        </div>
      </div>

      {/* INFO EXPLANATORY RULES */}
      <div className="bg-brand-500/[0.02] border border-brand-500/20 rounded-lg p-6">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-brand-500 mb-2 flex items-center gap-2">
          <HelpCircle size={14} /> Fórmulas legales aplicadas en Liquidación
        </h4>
        <ul className="text-[11px] text-text-main leading-relaxed space-y-1 bg-opacity-10 pl-2">
          <li>• <span className="font-bold">Personal Jornalero (Por Hora)</span>: <code className="font-mono text-brand-400 bg-bg-accent/40 px-1 rounded">Sueldo = (Horas reales * Valor Hora Base) + (Feriados trabajados * 8 horas * Valor Hora Base) + Adicionales</code>. El jornal del feriado se calcula abonando jornada doble (8 hs adicionales continuas por jornada).</li>
          <li>• <span className="font-bold">Personal Mensualizado (Fijo)</span>: <code className="font-mono text-brand-400 bg-bg-accent/40 px-1 rounded">Sueldo = Sueldo Base + (Feriados trabajados * (Sueldo Base / 25)) + Adicionales</code>. Por ley, el día de feriado trabajado se liquida con el plus divisorio de 25 por jornal continuo, sumando el valor íntegro extra al sueldo neto.</li>
        </ul>
      </div>

      {/* MODAL: ADD PAYROLL ELEMENT */}
      <AnimatePresence>
        {showAddPayrollModal && (
          <div className="fixed inset-0 z-55 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddPayrollModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-bg-card border border-border-dim rounded-lg shadow-2xl overflow-hidden z-55"
            >
              <div className="p-6 border-b border-border-dim bg-bg-accent/50 flex justify-between items-center bg-bg-card">
                 <h3 className="text-xs font-black uppercase tracking-widest text-text-main">Agregar Colaborador a Liquidación</h3>
                 <button onClick={() => setShowAddPayrollModal(false)} className="text-text-dim hover:text-text-main transition-colors"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4 text-[11px] max-h-[80vh] overflow-y-auto">
                 <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Nombre Completo de la Persona</label>
                    <input 
                      type="text" 
                      value={newPayrollItem.employeeName}
                      onChange={e => setNewPayrollItem({ ...newPayrollItem, employeeName: e.target.value.toUpperCase() })}
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 uppercase font-bold" 
                      placeholder="Ej. LUCAS GONZALEZ"
                    />
                 </div>
                 
                 <div className="grid grid-cols-2 gap-4 font-sans">
                   <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Sucursal / Unidad</label>
                      <select 
                        value={newPayrollItem.branchId}
                        onChange={e => {
                          const id = e.target.value;
                          setNewPayrollItem({ ...newPayrollItem, branchId: id });
                        }}
                        className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main font-bold outline-none focus:border-brand-500 cursor-pointer"
                      >
                        {payrollBranches.map(b => (
                          <option key={b.id} value={b.id}>{b.name}</option>
                        ))}
                      </select>
                   </div>
                   <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Puesto / Función</label>
                      <input 
                        type="text" 
                        value={newPayrollItem.positionLabel}
                        onChange={e => setNewPayrollItem({ ...newPayrollItem, positionLabel: e.target.value })}
                        className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 font-bold" 
                        placeholder="Ej. Administrativo, Mozos, Cocinero"
                      />
                   </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Modalidad Contrato</label>
                      <select 
                        value={newPayrollItem.salaryType}
                        onChange={e => {
                          const type = e.target.value as 'hourly' | 'monthly';
                          const defaultRate = type === 'hourly' ? 3000 : 750000;
                          setNewPayrollItem({ ...newPayrollItem, salaryType: type, baseRateOrSalary: defaultRate });
                        }}
                        className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main font-bold uppercase outline-none focus:border-brand-500 cursor-pointer"
                      >
                        <option value="hourly">Jornal (POR HORA)</option>
                        <option value="monthly">Mensual Fijo (SALARIO)</option>
                      </select>
                   </div>
                   <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">
                        {newPayrollItem.salaryType === 'hourly' ? 'Sueldo Valor Hora ($)' : 'Sueldo Fijo Mensual ($)'}
                      </label>
                      <input 
                        type="number" 
                        value={newPayrollItem.baseRateOrSalary}
                        onChange={e => setNewPayrollItem({ ...newPayrollItem, baseRateOrSalary: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs font-mono font-bold text-text-main outline-none focus:border-brand-500" 
                      />
                   </div>
                 </div>

                 {newPayrollItem.salaryType === 'hourly' && (
                   <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-text-dim font-mono">Horas Reales Trabajadas (hs)</label>
                      <input 
                        type="number" 
                        value={newPayrollItem.hoursWorked === 0 ? '' : newPayrollItem.hoursWorked}
                        onChange={e => setNewPayrollItem({ ...newPayrollItem, hoursWorked: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs font-mono font-bold text-text-main outline-none focus:border-brand-500" 
                        placeholder="Ej. 160"
                      />
                   </div>
                 )}

                 <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-text-dim font-sans">Feriados Trabajados (Días)</label>
                      <input 
                        type="number" 
                        value={newPayrollItem.holidayDaysCount === 0 ? '' : newPayrollItem.holidayDaysCount}
                        onChange={e => setNewPayrollItem({ ...newPayrollItem, holidayDaysCount: parseInt(e.target.value) || 0 })}
                        className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs font-mono font-bold text-text-main outline-none focus:border-brand-500" 
                        placeholder="Cantidad de días"
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Adicionales / Bonos ($)</label>
                      <input 
                        type="number" 
                        value={newPayrollItem.additionalBonus === 0 ? '' : newPayrollItem.additionalBonus}
                        onChange={e => setNewPayrollItem({ ...newPayrollItem, additionalBonus: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs font-mono font-bold text-text-main outline-none focus:border-brand-500" 
                        placeholder="Ej. 15000"
                      />
                   </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-text-dim">Novedades / Comentarios</label>
                    <textarea 
                      value={newPayrollItem.novedades}
                      onChange={e => setNewPayrollItem({ ...newPayrollItem, novedades: e.target.value })}
                      className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500 resize-none h-18 font-sans" 
                      placeholder="Ej. Carga de novedades operativas acá..."
                    />
                 </div>

                 <button 
                  onClick={async () => {
                    if (!newPayrollItem.employeeName.trim()) {
                      alert('Ingrese el nombre de la persona a liquidar.');
                      return;
                    }
                    
                    const branchObj = payrollBranches.find(b => b.id === newPayrollItem.branchId);
                    const bName = branchObj ? branchObj.name : 'Administración';
                    
                    let computed = 0;
                    const hoursVal = newPayrollItem.hoursWorked;
                    const rateVal = newPayrollItem.baseRateOrSalary;
                    const holidayVal = newPayrollItem.holidayDaysCount;
                    const bonusVal = newPayrollItem.additionalBonus;
                    
                    if (newPayrollItem.salaryType === 'hourly') {
                      computed = (hoursVal * rateVal) + (holidayVal * 8 * rateVal) + bonusVal;
                    } else {
                      computed = rateVal + (holidayVal * (rateVal / 25)) + bonusVal;
                    }

                    const newItem = {
                      id: `payitem_${Date.now()}_${Math.random()}`,
                      branchId: newPayrollItem.branchId,
                      branchName: bName,
                      employeeName: newPayrollItem.employeeName,
                      positionLabel: newPayrollItem.positionLabel,
                      salaryType: newPayrollItem.salaryType,
                      hoursWorked: hoursVal,
                      baseRateOrSalary: rateVal,
                      holidayDaysCount: holidayVal,
                      additionalBonus: bonusVal,
                      novedades: newPayrollItem.novedades,
                      totalToCollect: computed
                    };

                    const updated = [...payrollItems, newItem];
                    setPayrollItems(updated);
                    localStorage.setItem(`hr_monthly_payroll_${selectedMonth}`, JSON.stringify(updated));
    // Supabase sync
    try {
      const upsertData = updated.map((p: any) => ({
        branch_id: selectedBranch || 'all',
        month: selectedMonth,
        employee_name: p.employeeName || p.name || 'Sin nombre',
        position_name: p.position || p.positionName || 'Sin cargo',
        total_hours: p.totalHours || p.hours || 0,
        hourly_rate: p.hourlyRate || p.rate || 0,
        gross_salary: p.grossSalary || p.totalAmount || 0,
        deductions: p.deductions || 0,
        net_salary: p.netSalary || p.total || 0,
        status: p.status || 'draft',
        notes: p.notes || ''
      }));
      if (upsertData.length > 0) {
        await supabase.from('hr_monthly_payroll').delete().eq('branch_id', selectedBranch || 'all').eq('month', selectedMonth);
        await supabase.from('hr_monthly_payroll').insert(upsertData);
      }
    } catch(e) { console.error('Error sync payroll:', e); }
                    
                    setNewPayrollItem({
                      employeeName: '',
                      branchId: '1',
                      positionLabel: 'Cocinero',
                      salaryType: 'hourly',
                      hoursWorked: 0,
                      baseRateOrSalary: 3200,
                      holidayDaysCount: 0,
                      additionalBonus: 0,
                      novedades: ''
                    });
                    
                    setShowAddPayrollModal(false);
                  }}
                  className="w-full bg-brand-500 hover:bg-brand-600 text-black py-3 rounded text-[10px] font-black uppercase tracking-widest transition-all shadow-lg cursor-pointer font-black font-sans"
                 >
                   Agregar a Planilla Liquidación
                 </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
