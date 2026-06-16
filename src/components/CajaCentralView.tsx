/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Landmark, Loader2, Calendar, Plus, Trash2, ArrowDownToLine,
  Calculator, DollarSign, Save, Building2, Paperclip, FileText, ImageIcon, X, Eye
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';
import { supabase } from '../lib/supabase';

interface CajaCentralViewProps {
  branches: Branch[];
  isReadOnly?: boolean;
}

interface Withdrawal {
  id: string;
  branchId: string;
  amount: number;
  withdrawalDate: string;
  arrivalDate: string | null;
  shift: string;
  status: string; // 'pending' | 'arrived' | 'reentered'
  reentryReason: string;
  notes: string;
}

const PESOS_DENOMS = [100, 200, 500, 1000, 2000, 10000, 20000, 50000, 100000];
const USD_DENOMS = [10, 20, 50, 100];

const fmtPesos = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');
const fmtUsd = (n: number) => 'US$' + Math.round(n).toLocaleString('es-AR');

export default function CajaCentralView({ branches, isReadOnly = false }: CajaCentralViewProps) {
  const [activeTab, setActiveTab] = useState<'retiros' | 'arqueo'>('retiros');
  const operativeBranches = useMemo(() => branches.filter(b => !/almac/i.test(b.name)), [branches]);

  // ===== RETIROS =====
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loadingW, setLoadingW] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [newW, setNewW] = useState({ branchId: '', amount: '', withdrawalDate: new Date().toISOString().split('T')[0], arrivalDate: '', shift: 'Mañana', notes: '' });
  const [savingW, setSavingW] = useState(false);

  const fetchWithdrawals = async () => {
    setLoadingW(true);
    try {
      const [y, m] = selectedMonth.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const { data } = await supabase
        .from('treasury_withdrawals')
        .select('*')
        .gte('withdrawal_date', `${selectedMonth}-01`)
        .lte('withdrawal_date', `${selectedMonth}-${String(lastDay).padStart(2, '0')}`)
        .order('withdrawal_date', { ascending: false });
      setWithdrawals((data || []).map((r: any) => ({
        id: r.id, branchId: r.branch_id, amount: Number(r.amount) || 0,
        withdrawalDate: r.withdrawal_date, arrivalDate: r.arrival_date, shift: r.shift || '',
        status: r.status || (r.arrival_date ? 'arrived' : 'pending'),
        reentryReason: r.reentry_reason || '',
        notes: r.notes || ''
      })));
    } catch (e) { console.error('Error cargando retiros:', e); }
    setLoadingW(false);
  };

  useEffect(() => { fetchWithdrawals(); }, [selectedMonth]);

  const handleAddWithdrawal = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!newW.branchId) { alert('Seleccioná la sucursal de origen del retiro.'); return; }
    if (!newW.amount || Number(newW.amount) <= 0) { alert('Ingresá un monto válido.'); return; }
    if (!newW.withdrawalDate) { alert('Ingresá la fecha del retiro.'); return; }
    setSavingW(true);
    try {
      const { data, error } = await supabase.from('treasury_withdrawals').insert({
        branch_id: newW.branchId,
        amount: Number(newW.amount),
        withdrawal_date: newW.withdrawalDate,
        arrival_date: newW.arrivalDate || null,
        shift: newW.shift || null,
        status: newW.arrivalDate ? 'arrived' : 'pending',
        notes: newW.notes || null
      }).select().single();
      if (error) throw error;
      setWithdrawals(prev => [{
        id: data.id, branchId: data.branch_id, amount: Number(data.amount),
        withdrawalDate: data.withdrawal_date, arrivalDate: data.arrival_date, shift: data.shift || '',
        status: data.status || (data.arrival_date ? 'arrived' : 'pending'), reentryReason: data.reentry_reason || '',
        notes: data.notes || ''
      }, ...prev]);
      setNewW({ branchId: '', amount: '', withdrawalDate: new Date().toISOString().split('T')[0], arrivalDate: '', shift: 'Mañana', notes: '' });
    } catch (err: any) {
      alert('Error al guardar el retiro: ' + (err?.message || 'error desconocido'));
    }
    setSavingW(false);
  };

  const handleDeleteWithdrawal = async (id: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!window.confirm('¿Eliminar este retiro?')) return;
    try {
      const { error } = await supabase.from('treasury_withdrawals').delete().eq('id', id);
      if (error) throw error;
      setWithdrawals(prev => prev.filter(w => w.id !== id));
    } catch (err: any) {
      alert('Error al eliminar: ' + (err?.message || ''));
    }
  };

  const markArrived = async (id: string, date: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    try {
      const newStatus = date ? 'arrived' : 'pending';
      const { error } = await supabase.from('treasury_withdrawals').update({ arrival_date: date || null, status: newStatus }).eq('id', id);
      if (error) throw error;
      setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, arrivalDate: date || null, status: newStatus } : w));
    } catch (err: any) {
      alert('Error al actualizar: ' + (err?.message || ''));
    }
  };

  // Cambiar el estado del retiro: pending / arrived / reentered (reingresado en sucursal)
  const changeStatus = async (id: string, newStatus: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    let reentryReason = '';
    if (newStatus === 'reentered') {
      const reason = window.prompt('¿Para qué se reingresó el dinero en la sucursal? (ej. pago a proveedor X)');
      if (reason === null) return; // canceló
      reentryReason = reason.trim();
    }
    try {
      const updates: any = { status: newStatus };
      if (newStatus === 'reentered') updates.reentry_reason = reentryReason;
      if (newStatus === 'arrived' && !withdrawals.find(w => w.id === id)?.arrivalDate) {
        updates.arrival_date = new Date().toISOString().split('T')[0];
      }
      if (newStatus === 'pending') { updates.arrival_date = null; updates.reentry_reason = null; }
      const { error } = await supabase.from('treasury_withdrawals').update(updates).eq('id', id);
      if (error) throw error;
      setWithdrawals(prev => prev.map(w => w.id === id ? {
        ...w, status: newStatus,
        reentryReason: newStatus === 'reentered' ? reentryReason : (newStatus === 'pending' ? '' : w.reentryReason),
        arrivalDate: updates.arrival_date !== undefined ? updates.arrival_date : w.arrivalDate
      } : w));
    } catch (err: any) {
      alert('Error al cambiar el estado: ' + (err?.message || ''));
    }
  };

  const branchName = (id: string) => branches.find(b => b.id === id)?.name || id;

  const totalWithdrawals = useMemo(() => withdrawals.reduce((s, w) => s + w.amount, 0), [withdrawals]);
  const totalPending = useMemo(() => withdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + w.amount, 0), [withdrawals]);

  // Pendiente de ingreso agrupado por sucursal
  const pendingByBranch = useMemo(() => {
    const map: Record<string, number> = {};
    withdrawals.filter(w => w.status === 'pending').forEach(w => {
      map[w.branchId] = (map[w.branchId] || 0) + w.amount;
    });
    return Object.entries(map)
      .map(([branchId, amount]) => ({ branchId, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [withdrawals]);

  // Ingresados a caja central (status 'arrived'): por sucursal, por día
  const arrivedWithdrawals = useMemo(() => withdrawals.filter(w => w.status === 'arrived'), [withdrawals]);
  const totalArrived = useMemo(() => arrivedWithdrawals.reduce((s, w) => s + w.amount, 0), [arrivedWithdrawals]);
  const totalReentered = useMemo(() => withdrawals.filter(w => w.status === 'reentered').reduce((s, w) => s + w.amount, 0), [withdrawals]);

  const arrivedByBranch = useMemo(() => {
    const map: Record<string, number> = {};
    arrivedWithdrawals.forEach(w => { map[w.branchId] = (map[w.branchId] || 0) + w.amount; });
    return Object.entries(map).map(([branchId, amount]) => ({ branchId, amount })).sort((a, b) => b.amount - a.amount);
  }, [arrivedWithdrawals]);

  // Ingresados por día (según fecha de ingreso a caja)
  const arrivedByDay = useMemo(() => {
    const map: Record<string, number> = {};
    arrivedWithdrawals.forEach(w => {
      const d = w.arrivalDate || w.withdrawalDate;
      if (d) map[d] = (map[d] || 0) + w.amount;
    });
    return Object.entries(map).map(([date, amount]) => ({ date, amount })).sort((a, b) => b.date.localeCompare(a.date));
  }, [arrivedWithdrawals]);

  // ===== ARQUEO =====
  const [arqueoDate, setArqueoDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [pesosCount, setPesosCount] = useState<Record<number, number>>({});
  const [usdCount, setUsdCount] = useState<Record<number, number>>({});
  const [arqueoNotes, setArqueoNotes] = useState('');
  const [accountingBalance, setAccountingBalance] = useState<string>('');
  const [attachmentPath, setAttachmentPath] = useState<string | null>(null);
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [loadingA, setLoadingA] = useState(false);
  const [savingA, setSavingA] = useState(false);

  const fetchArqueo = async () => {
    setLoadingA(true);
    try {
      const { data } = await supabase
        .from('treasury_cash_count')
        .select('*')
        .eq('date', arqueoDate)
        .maybeSingle();
      if (data) {
        setPesosCount(data.pesos_denominations || {});
        setUsdCount(data.usd_denominations || {});
        setArqueoNotes(data.notes || '');
        setAccountingBalance(data.accounting_balance != null ? String(data.accounting_balance) : '');
        setAttachmentPath(data.attachment_path || null);
        if (data.attachment_path) {
          const { data: urlData } = await supabase.storage.from('documents').createSignedUrl(data.attachment_path, 3600);
          setAttachmentUrl(urlData?.signedUrl || null);
        } else {
          setAttachmentUrl(null);
        }
      } else {
        setPesosCount({});
        setUsdCount({});
        setArqueoNotes('');
        setAccountingBalance('');
        setAttachmentPath(null);
        setAttachmentUrl(null);
      }
    } catch (e) { console.error('Error cargando arqueo:', e); }
    setLoadingA(false);
  };

  useEffect(() => { if (activeTab === 'arqueo') fetchArqueo(); }, [arqueoDate, activeTab]);

  const totalPesos = useMemo(() => PESOS_DENOMS.reduce((s, d) => s + d * (pesosCount[d] || 0), 0), [pesosCount]);
  const totalUsd = useMemo(() => USD_DENOMS.reduce((s, d) => s + d * (usdCount[d] || 0), 0), [usdCount]);
  // Diferencia entre arqueo real (pesos) y saldo según contabilidad
  const accBalanceNum = useMemo(() => accountingBalance === '' ? null : Number(accountingBalance), [accountingBalance]);
  // Caja central no opera sábados ni domingos → no hay arqueo esos días
  const isWeekend = useMemo(() => {
    const d = new Date(arqueoDate + 'T12:00:00').getDay();
    return d === 0 || d === 6;
  }, [arqueoDate]);
  const difference = useMemo(() => accBalanceNum === null ? null : totalPesos - accBalanceNum, [totalPesos, accBalanceNum]);
  const hasDifference = difference !== null && Math.abs(difference) > 0.001;

  const handleSaveArqueo = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    // Si hay diferencia con el saldo contable, la observación es obligatoria
    if (hasDifference && !arqueoNotes.trim()) {
      alert('Hay una diferencia entre el arqueo y el saldo según contabilidad. Es obligatorio cargar una observación/justificación para guardar.');
      return;
    }
    setSavingA(true);
    try {
      const { error } = await supabase.from('treasury_cash_count').upsert({
        date: arqueoDate,
        pesos_denominations: pesosCount,
        usd_denominations: usdCount,
        total_pesos: totalPesos,
        total_usd: totalUsd,
        accounting_balance: accBalanceNum,
        attachment_path: attachmentPath,
        notes: arqueoNotes || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'date' });
      if (error) throw error;
      alert('Arqueo guardado correctamente.');
    } catch (err: any) {
      alert('Error al guardar el arqueo: ' + (err?.message || 'error desconocido'));
    }
    setSavingA(false);
  };

  // Subir comprobante (foto/PDF) del arqueo del día
  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    // Validar tipo: solo imágenes o PDF
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      alert('Solo se permiten imágenes (foto) o archivos PDF.');
      return;
    }
    // Validar tamaño (máx 10 MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('El archivo es muy grande (máximo 10 MB).');
      return;
    }
    setUploadingFile(true);
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `arqueos/${arqueoDate}_${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file);
      if (upErr) throw upErr;
      // Guardar el path en el arqueo del día (upsert para no perder lo ya cargado)
      const { error: dbErr } = await supabase.from('treasury_cash_count').upsert({
        date: arqueoDate,
        pesos_denominations: pesosCount,
        usd_denominations: usdCount,
        total_pesos: totalPesos,
        total_usd: totalUsd,
        accounting_balance: accBalanceNum,
        attachment_path: path,
        notes: arqueoNotes || null,
        updated_at: new Date().toISOString()
      }, { onConflict: 'date' });
      if (dbErr) throw dbErr;
      setAttachmentPath(path);
      const { data: urlData } = await supabase.storage.from('documents').createSignedUrl(path, 3600);
      setAttachmentUrl(urlData?.signedUrl || null);
      alert('Comprobante subido correctamente.');
    } catch (err: any) {
      alert('Error al subir el comprobante: ' + (err?.message || 'error desconocido'));
    }
    setUploadingFile(false);
    e.target.value = '';
  };

  const handleRemoveAttachment = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!attachmentPath) return;
    if (!window.confirm('¿Quitar el comprobante adjunto de este arqueo?')) return;
    try {
      await supabase.storage.from('documents').remove([attachmentPath]);
      await supabase.from('treasury_cash_count').update({ attachment_path: null }).eq('date', arqueoDate);
      setAttachmentPath(null);
      setAttachmentUrl(null);
    } catch (err: any) {
      alert('Error al quitar el comprobante: ' + (err?.message || ''));
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="bg-brand-500/15 p-3 text-brand-500 border border-brand-500/25 rounded-xl">
          <Landmark size={24} />
        </div>
        <div>
          <h2 className="text-xl font-black text-text-main uppercase tracking-tight">Caja Central</h2>
          <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">Tesorería · Retiros de sucursales y arqueo diario</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-border-dim">
        <button onClick={() => setActiveTab('retiros')}
          className={cn("px-4 py-2.5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2",
            activeTab === 'retiros' ? "border-brand-500 text-brand-500" : "border-transparent text-text-dim hover:text-text-main")}>
          <ArrowDownToLine size={14} /> Retiros de Sucursales
        </button>
        <button onClick={() => setActiveTab('arqueo')}
          className={cn("px-4 py-2.5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all flex items-center gap-2",
            activeTab === 'arqueo' ? "border-brand-500 text-brand-500" : "border-transparent text-text-dim hover:text-text-main")}>
          <Calculator size={14} /> Arqueo Diario
        </button>
      </div>

      {activeTab === 'retiros' ? (
        <>
          {/* KPIs retiros */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
              <p className="text-[9px] text-text-dim uppercase font-black tracking-widest">Total Retirado (mes)</p>
              <p className="text-2xl font-mono font-black text-text-main mt-1">{fmtPesos(totalWithdrawals)}</p>
            </div>
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
              <p className="text-[9px] text-text-dim uppercase font-black tracking-widest">Pendiente de Ingreso</p>
              <p className="text-2xl font-mono font-black text-amber-500 mt-1">{fmtPesos(totalPending)}</p>
              <p className="text-[8px] text-text-dim uppercase font-bold mt-1 opacity-70">Retiros sin fecha de ingreso</p>
            </div>
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
              <p className="text-[9px] text-text-dim uppercase font-black tracking-widest">Registros del Mes</p>
              <p className="text-2xl font-mono font-black text-brand-500 mt-1">{withdrawals.length}</p>
            </div>
          </div>

          {/* Pendiente de ingreso por sucursal */}
          {pendingByBranch.length > 0 && (
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
              <h3 className="text-xs font-black uppercase text-amber-500 tracking-wider mb-4 flex items-center gap-2"><Building2 size={14} /> Pendiente de Ingreso por Sucursal</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {pendingByBranch.map(p => (
                  <div key={p.branchId} className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-4">
                    <p className="text-[9px] font-black uppercase text-text-main truncate">{branchName(p.branchId)}</p>
                    <p className="text-lg font-mono font-black text-amber-500 mt-1">{fmtPesos(p.amount)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ingresados a Caja Central: por sucursal y por día */}
          {(arrivedByBranch.length > 0 || arrivedByDay.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
                <h3 className="text-xs font-black uppercase text-emerald-500 tracking-wider mb-4 flex items-center gap-2"><Building2 size={14} /> Ingresado por Sucursal · {selectedMonth.split('-').reverse().join('/')}</h3>
                {arrivedByBranch.length === 0 ? (
                  <p className="text-[10px] text-text-dim uppercase font-bold opacity-50">Sin ingresos este mes</p>
                ) : (
                  <div className="space-y-2">
                    {arrivedByBranch.map(p => (
                      <div key={p.branchId} className="flex items-center justify-between bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-4 py-2.5">
                        <span className="text-[10px] font-black uppercase text-text-main truncate">{branchName(p.branchId)}</span>
                        <span className="text-sm font-mono font-black text-emerald-500">{fmtPesos(p.amount)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-4 py-2 border-t border-border-dim mt-2 pt-3">
                      <span className="text-[10px] font-black uppercase text-text-dim">Total ingresado</span>
                      <span className="text-sm font-mono font-black text-text-main">{fmtPesos(totalArrived)}</span>
                    </div>
                  </div>
                )}
              </div>
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
                <h3 className="text-xs font-black uppercase text-emerald-500 tracking-wider mb-4 flex items-center gap-2"><Calendar size={14} /> Ingresado por Día</h3>
                {arrivedByDay.length === 0 ? (
                  <p className="text-[10px] text-text-dim uppercase font-bold opacity-50">Sin ingresos este mes</p>
                ) : (
                  <div className="space-y-2 max-h-[220px] overflow-y-auto">
                    {arrivedByDay.map(d => (
                      <div key={d.date} className="flex items-center justify-between bg-bg-accent/30 border border-border-dim/40 rounded-lg px-4 py-2">
                        <span className="text-[10px] font-mono font-bold text-text-main">{d.date.split('-').reverse().join('/')}</span>
                        <span className="text-[12px] font-mono font-black text-emerald-500">{fmtPesos(d.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Form alta retiro */}
          {!isReadOnly && (
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
              <h3 className="text-xs font-black uppercase text-brand-500 tracking-wider mb-4 flex items-center gap-2"><Plus size={14} /> Cargar Retiro de Sucursal</h3>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                <div>
                  <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Sucursal</label>
                  <select value={newW.branchId} onChange={(e) => setNewW({ ...newW, branchId: e.target.value })}
                    className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1">
                    <option value="">— Elegir —</option>
                    {operativeBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Turno</label>
                  <select value={newW.shift} onChange={(e) => setNewW({ ...newW, shift: e.target.value })}
                    className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1">
                    <option value="Mañana">Mañana</option>
                    <option value="Tarde">Tarde</option>
                  </select>
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Monto ($)</label>
                  <input type="number" value={newW.amount} onChange={(e) => setNewW({ ...newW, amount: e.target.value })} placeholder="0"
                    className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1 font-mono" />
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Fecha Retiro</label>
                  <input type="date" value={newW.withdrawalDate} onChange={(e) => setNewW({ ...newW, withdrawalDate: e.target.value })}
                    className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1" />
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Ingreso a Caja (opcional)</label>
                  <input type="date" value={newW.arrivalDate} onChange={(e) => setNewW({ ...newW, arrivalDate: e.target.value })}
                    className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1" />
                </div>
                <div>
                  <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Observaciones (opcional)</label>
                  <input type="text" value={newW.notes} onChange={(e) => setNewW({ ...newW, notes: e.target.value })}
                    placeholder="Notas relevantes del retiro..."
                    className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1" />
                </div>
                <button onClick={handleAddWithdrawal} disabled={savingW}
                  className="bg-brand-500 text-black px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5">
                  {savingW ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Agregar
                </button>
              </div>
            </div>
          )}

          {/* Tabla retiros */}
          <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-border-dim">
              <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Retiros Registrados</h3>
              <div className="bg-bg-accent border border-border-dim rounded-lg px-3 py-1.5 flex items-center gap-2 font-mono">
                <Calendar size={14} className="text-brand-500" />
                <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
                  className="bg-transparent border-none text-[10px] font-extrabold uppercase text-text-main outline-none cursor-pointer" />
              </div>
            </div>
            {loadingW ? (
              <div className="py-16 flex items-center justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>
            ) : withdrawals.length === 0 ? (
              <div className="py-16 text-center text-text-dim text-[10px] font-black uppercase tracking-widest opacity-50">No hay retiros registrados este mes</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[9px] font-black uppercase tracking-wider text-text-dim border-b border-border-dim bg-bg-accent/10">
                      <th className="px-4 py-3">Sucursal</th>
                      <th className="px-4 py-3">Turno</th>
                      <th className="px-4 py-3 text-right">Monto</th>
                      <th className="px-4 py-3">Fecha Retiro</th>
                      <th className="px-4 py-3">Ingreso a Caja</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Observaciones</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dim/40">
                    {withdrawals.map(w => (
                      <tr key={w.id} className="text-[11px] font-medium hover:bg-bg-accent/20 group">
                        <td className="px-4 py-2.5 font-black uppercase text-text-main flex items-center gap-1.5"><Building2 size={12} className="text-text-dim" />{branchName(w.branchId)}</td>
                        <td className="px-4 py-2.5">
                          {w.shift
                            ? <span className={cn("text-[8px] font-black uppercase px-2 py-1 rounded", w.shift === 'Mañana' ? "text-amber-500 bg-amber-500/10" : "text-indigo-500 bg-indigo-500/10")}>{w.shift}</span>
                            : <span className="text-text-dim text-[9px]">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono font-black text-text-main">{fmtPesos(w.amount)}</td>
                        <td className="px-4 py-2.5 font-mono text-text-dim">{w.withdrawalDate.split('-').reverse().join('/')}</td>
                        <td className="px-4 py-2.5">
                          <input type="date" value={w.arrivalDate || ''} disabled={isReadOnly}
                            onChange={(e) => markArrived(w.id, e.target.value)}
                            className="bg-bg-accent border border-border-dim rounded px-2 py-1 text-[10px] font-bold text-text-main outline-none" />
                        </td>
                        <td className="px-4 py-2.5">
                          {isReadOnly ? (
                            <span className={cn("text-[8px] font-black uppercase px-2 py-1 rounded",
                              w.status === 'arrived' ? "text-emerald-500 bg-emerald-500/10" :
                              w.status === 'reentered' ? "text-blue-500 bg-blue-500/10" : "text-amber-500 bg-amber-500/10")}>
                              {w.status === 'arrived' ? 'Ingresado' : w.status === 'reentered' ? 'Reingresado' : 'Pendiente'}
                            </span>
                          ) : (
                            <select value={w.status} onChange={(e) => changeStatus(w.id, e.target.value)}
                              className={cn("border rounded px-2 py-1 text-[9px] font-black uppercase outline-none",
                                w.status === 'arrived' ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/30" :
                                w.status === 'reentered' ? "text-blue-500 bg-blue-500/10 border-blue-500/30" : "text-amber-500 bg-amber-500/10 border-amber-500/30")}>
                              <option value="pending">Pendiente</option>
                              <option value="arrived">Ingresado</option>
                              <option value="reentered">Reingresado en Sucursal</option>
                            </select>
                          )}
                          {w.status === 'reentered' && w.reentryReason && (
                            <p className="text-[8px] text-blue-400 font-bold mt-1 max-w-[160px] truncate" title={w.reentryReason}>↳ {w.reentryReason}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-text-dim max-w-[200px]">
                          {w.notes ? <span className="text-[10px]" title={w.notes}>{w.notes}</span> : <span className="text-text-dim/40">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {!isReadOnly && (
                            <button onClick={() => handleDeleteWithdrawal(w.id)} className="text-text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-1">
                              <Trash2 size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* ARQUEO */}
          <div className="flex items-center justify-between">
            <div className="bg-bg-sidebar border border-border-dim rounded-lg px-3 py-1.5 flex items-center gap-2 font-mono">
              <Calendar size={14} className="text-brand-500" />
              <input type="date" value={arqueoDate} onChange={(e) => setArqueoDate(e.target.value)}
                className="bg-transparent border-none text-[10px] font-extrabold uppercase text-text-main outline-none cursor-pointer" />
            </div>
            {!isReadOnly && !isWeekend && (
              <button onClick={handleSaveArqueo} disabled={savingA}
                className="bg-brand-500 text-black px-5 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-60 flex items-center gap-2">
                {savingA ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar Arqueo
              </button>
            )}
          </div>

          {isWeekend ? (
            <div className="bg-amber-500/8 border border-amber-500/30 rounded-xl p-8 flex flex-col items-center justify-center text-center gap-2">
              <Calendar size={28} className="text-amber-500" />
              <p className="text-sm font-black uppercase text-amber-500 tracking-wider">No hay arqueo este día</p>
              <p className="text-[11px] text-text-dim font-bold uppercase">La Caja Central no opera sábados ni domingos. Elegí un día hábil para cargar el arqueo.</p>
            </div>
          ) : loadingA ? (
            <div className="py-16 flex items-center justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* PESOS */}
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-black uppercase text-text-main tracking-wider flex items-center gap-2"><DollarSign size={15} className="text-emerald-500" /> Pesos</h3>
                  <span className="text-lg font-mono font-black text-emerald-500">{fmtPesos(totalPesos)}</span>
                </div>
                <div className="space-y-2">
                  {PESOS_DENOMS.map(d => (
                    <div key={d} className="flex items-center gap-3">
                      <span className="text-[11px] font-mono font-bold text-text-dim w-24">{fmtPesos(d)}</span>
                      <span className="text-text-dim text-[10px]">×</span>
                      <input type="number" min="0" value={pesosCount[d] || ''} disabled={isReadOnly}
                        onChange={(e) => setPesosCount({ ...pesosCount, [d]: parseInt(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-20 bg-bg-accent border border-border-dim rounded px-2 py-1.5 text-[11px] font-bold text-text-main outline-none font-mono text-center" />
                      <span className="text-[11px] font-mono font-black text-text-main ml-auto">{fmtPesos(d * (pesosCount[d] || 0))}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* DÓLARES */}
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xs font-black uppercase text-text-main tracking-wider flex items-center gap-2"><DollarSign size={15} className="text-blue-500" /> Dólares</h3>
                  <span className="text-lg font-mono font-black text-blue-500">{fmtUsd(totalUsd)}</span>
                </div>
                <div className="space-y-2">
                  {USD_DENOMS.map(d => (
                    <div key={d} className="flex items-center gap-3">
                      <span className="text-[11px] font-mono font-bold text-text-dim w-24">{fmtUsd(d)}</span>
                      <span className="text-text-dim text-[10px]">×</span>
                      <input type="number" min="0" value={usdCount[d] || ''} disabled={isReadOnly}
                        onChange={(e) => setUsdCount({ ...usdCount, [d]: parseInt(e.target.value) || 0 })}
                        placeholder="0"
                        className="w-20 bg-bg-accent border border-border-dim rounded px-2 py-1.5 text-[11px] font-bold text-text-main outline-none font-mono text-center" />
                      <span className="text-[11px] font-mono font-black text-text-main ml-auto">{fmtUsd(d * (usdCount[d] || 0))}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-border-dim">
                  <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Observaciones {hasDifference && <span className="text-red-500">* (obligatoria por diferencia)</span>}</label>
                  <textarea value={arqueoNotes} disabled={isReadOnly} onChange={(e) => setArqueoNotes(e.target.value)} rows={2}
                    className={cn("w-full bg-bg-accent border rounded px-2 py-2 text-[11px] text-text-main outline-none mt-1 resize-none",
                      hasDifference && !arqueoNotes.trim() ? "border-red-500/60" : "border-border-dim")} />
                </div>
              </div>
            </div>
          )}

          {/* Saldo según contabilidad y diferencia */}
          {!loadingA && (
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
              <h3 className="text-xs font-black uppercase text-text-main tracking-wider mb-4 flex items-center gap-2"><Calculator size={15} className="text-brand-500" /> Conciliación de Pesos</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-bg-accent/30 border border-border-dim/50 rounded-lg p-4">
                  <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Arqueo Real (Pesos)</p>
                  <p className="text-xl font-mono font-black text-emerald-500 mt-1">{fmtPesos(totalPesos)}</p>
                </div>
                <div className="bg-bg-accent/30 border border-border-dim/50 rounded-lg p-4">
                  <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Saldo según Contabilidad</label>
                  {isReadOnly ? (
                    <p className="text-xl font-mono font-black text-text-main mt-1">{accBalanceNum === null ? '—' : fmtPesos(accBalanceNum)}</p>
                  ) : (
                    <>
                      <input type="number" value={accountingBalance} disabled={isReadOnly}
                        onChange={(e) => setAccountingBalance(e.target.value)} placeholder="0"
                        className="w-full bg-transparent border-none text-xl font-mono font-black text-text-main outline-none mt-1 p-0" />
                      {accBalanceNum !== null && accBalanceNum > 0 && (
                        <p className="text-[10px] font-mono font-bold text-text-dim mt-0.5">{fmtPesos(accBalanceNum)}</p>
                      )}
                    </>
                  )}
                </div>
                <div className={cn("border rounded-lg p-4",
                  difference === null ? "bg-bg-accent/30 border-border-dim/50" :
                  hasDifference ? "bg-red-500/10 border-red-500/30" : "bg-emerald-500/10 border-emerald-500/30")}>
                  <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Diferencia</p>
                  <p className={cn("text-xl font-mono font-black mt-1",
                    difference === null ? "text-text-dim" : hasDifference ? "text-red-500" : "text-emerald-500")}>
                    {difference === null ? '—' : (difference > 0 ? '+' : '') + fmtPesos(difference)}
                  </p>
                  {hasDifference && <p className="text-[8px] text-red-500 font-bold uppercase mt-1">{difference! > 0 ? 'Sobrante en arqueo' : 'Faltante en arqueo'}</p>}
                  {difference !== null && !hasDifference && <p className="text-[8px] text-emerald-500 font-bold uppercase mt-1">Sin diferencias</p>}
                </div>
              </div>

              {/* Comprobante del día (foto / PDF) */}
              <div className="mt-5 pt-5 border-t border-border-dim">
                <div className="flex items-center gap-2 mb-3">
                  <Paperclip size={14} className="text-brand-500" />
                  <h4 className="text-[10px] font-black uppercase text-text-main tracking-widest">Comprobante del Día (foto o PDF)</h4>
                </div>
                {attachmentPath ? (
                  <div className="flex items-center gap-3 bg-bg-accent/30 border border-border-dim/50 rounded-lg p-3">
                    {attachmentPath.toLowerCase().endsWith('.pdf')
                      ? <FileText size={20} className="text-red-500 shrink-0" />
                      : <ImageIcon size={20} className="text-blue-500 shrink-0" />}
                    <span className="text-[10px] font-bold text-text-main truncate flex-1">{attachmentPath.split('/').pop()}</span>
                    {attachmentUrl && (
                      <a href={attachmentUrl} target="_blank" rel="noopener noreferrer"
                        className="text-[9px] font-black uppercase text-brand-500 hover:text-brand-600 flex items-center gap-1 px-2 py-1 border border-brand-500/20 rounded">
                        <Eye size={12} /> Ver
                      </a>
                    )}
                    {!isReadOnly && (
                      <button onClick={handleRemoveAttachment} className="text-text-dim hover:text-red-500 p-1"><X size={14} /></button>
                    )}
                  </div>
                ) : !isReadOnly ? (
                  <label className={cn("flex items-center justify-center gap-2 border border-dashed border-border-dim rounded-lg py-4 cursor-pointer hover:border-brand-500/50 hover:bg-bg-accent/20 transition-all",
                    uploadingFile && "opacity-60 pointer-events-none")}>
                    {uploadingFile ? <Loader2 size={16} className="animate-spin text-brand-500" /> : <Paperclip size={16} className="text-text-dim" />}
                    <span className="text-[10px] font-black uppercase text-text-dim tracking-widest">{uploadingFile ? 'Subiendo…' : 'Adjuntar foto o PDF del detalle de caja'}</span>
                    <input type="file" accept="image/*,application/pdf" onChange={handleUploadAttachment} className="hidden" disabled={uploadingFile} />
                  </label>
                ) : (
                  <p className="text-[10px] text-text-dim uppercase font-bold opacity-50">Sin comprobante adjunto</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
