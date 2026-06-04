/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import {
  Landmark, Loader2, Calendar, Plus, Trash2, ArrowDownToLine,
  Calculator, DollarSign, Save, Building2
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
  const [newW, setNewW] = useState({ branchId: '', amount: '', withdrawalDate: new Date().toISOString().split('T')[0], arrivalDate: '', notes: '' });
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
        withdrawalDate: r.withdrawal_date, arrivalDate: r.arrival_date, notes: r.notes || ''
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
        notes: newW.notes || null
      }).select().single();
      if (error) throw error;
      setWithdrawals(prev => [{
        id: data.id, branchId: data.branch_id, amount: Number(data.amount),
        withdrawalDate: data.withdrawal_date, arrivalDate: data.arrival_date, notes: data.notes || ''
      }, ...prev]);
      setNewW({ branchId: '', amount: '', withdrawalDate: new Date().toISOString().split('T')[0], arrivalDate: '', notes: '' });
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
      const { error } = await supabase.from('treasury_withdrawals').update({ arrival_date: date || null }).eq('id', id);
      if (error) throw error;
      setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, arrivalDate: date || null } : w));
    } catch (err: any) {
      alert('Error al actualizar: ' + (err?.message || ''));
    }
  };

  const branchName = (id: string) => branches.find(b => b.id === id)?.name || id;

  const totalWithdrawals = useMemo(() => withdrawals.reduce((s, w) => s + w.amount, 0), [withdrawals]);
  const totalPending = useMemo(() => withdrawals.filter(w => !w.arrivalDate).reduce((s, w) => s + w.amount, 0), [withdrawals]);

  // ===== ARQUEO =====
  const [arqueoDate, setArqueoDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [pesosCount, setPesosCount] = useState<Record<number, number>>({});
  const [usdCount, setUsdCount] = useState<Record<number, number>>({});
  const [arqueoNotes, setArqueoNotes] = useState('');
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
      } else {
        setPesosCount({});
        setUsdCount({});
        setArqueoNotes('');
      }
    } catch (e) { console.error('Error cargando arqueo:', e); }
    setLoadingA(false);
  };

  useEffect(() => { if (activeTab === 'arqueo') fetchArqueo(); }, [arqueoDate, activeTab]);

  const totalPesos = useMemo(() => PESOS_DENOMS.reduce((s, d) => s + d * (pesosCount[d] || 0), 0), [pesosCount]);
  const totalUsd = useMemo(() => USD_DENOMS.reduce((s, d) => s + d * (usdCount[d] || 0), 0), [usdCount]);

  const handleSaveArqueo = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setSavingA(true);
    try {
      const { error } = await supabase.from('treasury_cash_count').upsert({
        date: arqueoDate,
        pesos_denominations: pesosCount,
        usd_denominations: usdCount,
        total_pesos: totalPesos,
        total_usd: totalUsd,
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

          {/* Form alta retiro */}
          {!isReadOnly && (
            <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
              <h3 className="text-xs font-black uppercase text-brand-500 tracking-wider mb-4 flex items-center gap-2"><Plus size={14} /> Cargar Retiro de Sucursal</h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
                <div>
                  <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Sucursal</label>
                  <select value={newW.branchId} onChange={(e) => setNewW({ ...newW, branchId: e.target.value })}
                    className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1">
                    <option value="">— Elegir —</option>
                    {operativeBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
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
                      <th className="px-4 py-3 text-right">Monto</th>
                      <th className="px-4 py-3">Fecha Retiro</th>
                      <th className="px-4 py-3">Ingreso a Caja</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-dim/40">
                    {withdrawals.map(w => (
                      <tr key={w.id} className="text-[11px] font-medium hover:bg-bg-accent/20 group">
                        <td className="px-4 py-2.5 font-black uppercase text-text-main flex items-center gap-1.5"><Building2 size={12} className="text-text-dim" />{branchName(w.branchId)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-black text-text-main">{fmtPesos(w.amount)}</td>
                        <td className="px-4 py-2.5 font-mono text-text-dim">{w.withdrawalDate.split('-').reverse().join('/')}</td>
                        <td className="px-4 py-2.5">
                          <input type="date" value={w.arrivalDate || ''} disabled={isReadOnly}
                            onChange={(e) => markArrived(w.id, e.target.value)}
                            className="bg-bg-accent border border-border-dim rounded px-2 py-1 text-[10px] font-bold text-text-main outline-none" />
                        </td>
                        <td className="px-4 py-2.5">
                          {w.arrivalDate
                            ? <span className="text-[8px] font-black uppercase text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">Ingresado</span>
                            : <span className="text-[8px] font-black uppercase text-amber-500 bg-amber-500/10 px-2 py-1 rounded">Pendiente</span>}
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
            {!isReadOnly && (
              <button onClick={handleSaveArqueo} disabled={savingA}
                className="bg-brand-500 text-black px-5 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-60 flex items-center gap-2">
                {savingA ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar Arqueo
              </button>
            )}
          </div>

          {loadingA ? (
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
                  <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Observaciones</label>
                  <textarea value={arqueoNotes} disabled={isReadOnly} onChange={(e) => setArqueoNotes(e.target.value)} rows={2}
                    className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] text-text-main outline-none mt-1 resize-none" />
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}
