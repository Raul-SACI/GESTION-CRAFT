/**
 * SPDX-License-Identifier: Apache-2.0
 *
 * Resumen consolidado por entidad de Pasivos (Bancarios / Fiscales / Legales),
 * para mostrar en el Dashboard de Socios en modo SOLO LECTURA.
 *
 * Replica la misma logica de consolidacion y el mismo formato visual de tarjetas
 * que usa FinanceView en cada modulo de Pasivos, leyendo de la misma fuente:
 * finance_liabilities -> type='scheduled_payments' -> notes (JSON array de pagos).
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Building2, Calculator, Scale, Loader2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';

interface Payment {
  id: string;
  amount: number;
  status: string;        // 'paid' = pagado; cualquier otro = pendiente
  category: string;      // 'loan' (bancario) | 'tax' (fiscal) | 'legal'
  bank?: string;
  entity?: string;
  destination?: string;
  rate?: string | number;
  requestedAmount?: number;
  installmentNumber?: string | number;
  loanNumber?: string;
  taxType?: string;
  totalAmount?: number;
  paymentPlanNumber?: string;
}

const fmtMoney = (n: number) => `$${Math.round(n).toLocaleString('es-AR')}`;

// Parsea "11 de 12" -> 12 (el total de cuotas)
const totalFromInst = (raw: any): number => {
  const nums = String(raw || '').match(/\d+/g);
  return nums && nums.length >= 2 ? parseInt(nums[1]) : 0;
};

export default function LiabilitiesConsolidatedSection() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('finance_liabilities')
          .select('type, notes')
          .eq('type', 'scheduled_payments');
        let parsed: Payment[] = [];
        if (data && data.length > 0 && data[0].notes) {
          try {
            const arr = JSON.parse(data[0].notes);
            if (Array.isArray(arr)) parsed = arr;
          } catch (e) { /* ignore */ }
        }
        if (!cancelled) setPayments(parsed);
      } catch (e) {
        console.error('Error cargando pasivos:', e);
      }
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // Consolidado Bancario (por banco + numero de prestamo)
  const bankStats = useMemo(() => {
    const loans = payments.filter(p => p.category === 'loan');
    const grouped: Record<string, any> = {};
    loans.forEach(p => {
      const bank = (p.bank || 'OTROS').trim().toUpperCase();
      const loanNum = String((p as any).loanNumber || '1').trim();
      const key = `${bank}#${loanNum}`;
      if (!grouped[key]) {
        grouped[key] = {
          bank, loanNumber: loanNum,
          requestedAmount: p.requestedAmount || 0,
          destination: p.destination || 'S/D',
          rate: p.rate || 'S/D',
          totalInstallments: totalFromInst(p.installmentNumber),
          pendingInstallmentsCount: 0,
          installmentAmounts: [] as number[],
          totalPendingAmount: 0,
        };
      }
      const t = totalFromInst(p.installmentNumber);
      if (t > grouped[key].totalInstallments) grouped[key].totalInstallments = t;
      if ((!grouped[key].requestedAmount || grouped[key].requestedAmount === 0) && p.requestedAmount) grouped[key].requestedAmount = p.requestedAmount;
      if (grouped[key].destination === 'S/D' && p.destination) grouped[key].destination = p.destination;
      if (grouped[key].rate === 'S/D' && p.rate) grouped[key].rate = p.rate;
      if (p.status !== 'paid') {
        grouped[key].pendingInstallmentsCount += 1;
        grouped[key].totalPendingAmount += p.amount;
        if (!grouped[key].installmentAmounts.includes(p.amount)) grouped[key].installmentAmounts.push(p.amount);
      }
    });
    return Object.values(grouped).sort((a: any, b: any) => b.totalPendingAmount - a.totalPendingAmount);
  }, [payments]);

  // Consolidado Fiscal / Legal (por entidad + plan)
  const entityStats = (cat: 'tax' | 'legal') => {
    const items = payments.filter(p => p.category === cat);
    const grouped: Record<string, any> = {};
    items.forEach(p => {
      const entity = (p.entity || 'OTROS').trim().toUpperCase();
      const plan = String(p.paymentPlanNumber || 'CORRIENTE').trim();
      const key = `${entity}#${plan}`;
      if (!grouped[key]) {
        grouped[key] = {
          entity, plan,
          taxType: p.taxType || 'S/D',
          totalAmount: p.totalAmount || 0,
          pendingCount: 0,
          totalInstallments: totalFromInst(p.installmentNumber),
          installmentAmounts: [] as number[],
          totalPendingAmount: 0,
        };
      }
      const t = totalFromInst(p.installmentNumber);
      if (t > grouped[key].totalInstallments) grouped[key].totalInstallments = t;
      if ((!grouped[key].totalAmount || grouped[key].totalAmount === 0) && p.totalAmount) grouped[key].totalAmount = p.totalAmount;
      if (grouped[key].taxType === 'S/D' && p.taxType) grouped[key].taxType = p.taxType;
      if (p.status !== 'paid') {
        grouped[key].pendingCount += 1;
        grouped[key].totalPendingAmount += p.amount;
        if (!grouped[key].installmentAmounts.includes(p.amount)) grouped[key].installmentAmounts.push(p.amount);
      }
    });
    return Object.values(grouped).sort((a: any, b: any) => b.totalPendingAmount - a.totalPendingAmount);
  };

  const taxStats = useMemo(() => entityStats('tax'), [payments]);
  const legalStats = useMemo(() => entityStats('legal'), [payments]);

  if (loading) {
    return (
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-8 flex items-center justify-center gap-3">
        <Loader2 className="animate-spin text-brand-500" size={16} />
        <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">Cargando pasivos consolidados…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* PASIVOS BANCARIOS */}
      <div className="bg-bg-card border border-border-dim p-5 rounded-xl shadow-lg space-y-4">
        <div className="flex items-center justify-between border-b border-border-dim/40 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-brand-500/10 rounded text-brand-500"><Building2 size={14} /></div>
            <div>
              <h3 className="text-[10px] font-black uppercase text-text-main tracking-widest">Pasivos Bancarios · Resumen Consolidado por Entidad</h3>
              <p className="text-[8px] text-text-dim font-bold uppercase mt-0.5">Visión integrada de deudas y amortizaciones activas</p>
            </div>
          </div>
          <span className="text-[9px] font-bold text-text-dim uppercase tracking-wider bg-bg-accent px-2 py-1 rounded border border-border-dim/50 font-mono">
            Entidades registradas: {bankStats.length}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {bankStats.map((stat: any) => (
            <div key={`${stat.bank}#${stat.loanNumber}`} className="bg-bg-accent/30 border border-border-dim p-4 rounded-lg flex flex-col justify-between min-h-[180px]">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-[11px] font-black uppercase text-brand-500 tracking-wider">
                    {stat.bank}{stat.loanNumber ? ` · Préstamo ${stat.loanNumber}` : ''}
                  </span>
                  <span className={cn(
                    "text-[8px] font-mono font-black px-2 py-0.5 rounded border",
                    stat.pendingInstallmentsCount > 0 ? "bg-orange-500/10 border-orange-500/20 text-brand-500" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                  )}>
                    {stat.pendingInstallmentsCount} {stat.pendingInstallmentsCount === 1 ? 'CUOTA PEND.' : 'CUOTAS PEND.'}
                  </span>
                </div>
                <div className="space-y-1">
                  <span className="text-[8px] text-text-dim uppercase font-black tracking-widest block opacity-70">Monto de cada cuota</span>
                  <p className="text-[11px] font-mono font-black text-text-main max-w-full truncate">
                    {stat.installmentAmounts.length === 0 ? '-' : stat.installmentAmounts.map((a: number) => fmtMoney(a)).join(' / ')}
                  </p>
                </div>
                <div className="mt-2.5 pt-2.5 border-t border-border-dim/40 grid grid-cols-2 gap-x-3 gap-y-1.5">
                  <div>
                    <span className="text-[7px] text-text-dim uppercase font-black tracking-widest block opacity-70">Monto solicitado</span>
                    <p className="text-[10px] font-mono font-bold text-text-main truncate">{stat.requestedAmount ? fmtMoney(stat.requestedAmount) : 'S/D'}</p>
                  </div>
                  <div>
                    <span className="text-[7px] text-text-dim uppercase font-black tracking-widest block opacity-70">Tasa</span>
                    <p className="text-[10px] font-mono font-bold text-text-main truncate">{stat.rate || 'S/D'}</p>
                  </div>
                  <div>
                    <span className="text-[7px] text-text-dim uppercase font-black tracking-widest block opacity-70">Destino</span>
                    <p className="text-[10px] font-bold text-text-main truncate" title={stat.destination}>{stat.destination || 'S/D'}</p>
                  </div>
                  <div>
                    <span className="text-[7px] text-text-dim uppercase font-black tracking-widest block opacity-70">Cuotas (pend. / total)</span>
                    <p className="text-[10px] font-mono font-bold text-text-main">{stat.pendingInstallmentsCount} / {stat.totalInstallments || '?'}</p>
                  </div>
                </div>
              </div>
              <div className="mt-3 pt-2.5 border-t border-border-dim/40">
                <span className="text-[8px] text-text-dim uppercase font-black tracking-widest block opacity-70">Monto total pendiente</span>
                <p className="text-sm font-mono font-black text-emerald-400 italic">{fmtMoney(stat.totalPendingAmount)}</p>
              </div>
            </div>
          ))}
          {bankStats.length === 0 && (
            <div className="col-span-full py-6 text-center text-[10px] text-text-dim uppercase font-bold italic">
              No se encontraron registros de pasivos bancarios por entidad
            </div>
          )}
        </div>
      </div>

      {/* PASIVOS FISCALES */}
      <EntityPlanGrid
        stats={taxStats}
        title="Pasivos Fiscales · Resumen Consolidado por Entidad y Plan"
        subtitle="Visión integrada de planes de pago y deudas activas"
        typeLabel="Impuesto / Concepto"
        icon={<Calculator size={14} />}
        emptyMsg="No se encontraron registros fiscales por entidad y plan"
      />

      {/* PASIVOS LEGALES */}
      <EntityPlanGrid
        stats={legalStats}
        title="Pasivos Legales · Resumen Consolidado por Juicio"
        subtitle="Visión integrada de juicios y cuotas pendientes"
        typeLabel="Juicio / Carátula"
        icon={<Scale size={14} />}
        emptyMsg="No se encontraron registros legales por juicio"
      />
    </div>
  );
}

// Grid de tarjetas para Fiscal/Legal (misma estructura que FinanceView)
function EntityPlanGrid({ stats, title, subtitle, typeLabel, icon, emptyMsg }: {
  stats: any[]; title: string; subtitle: string; typeLabel: string; icon: React.ReactNode; emptyMsg: string;
}) {
  return (
    <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-lg space-y-4">
      <div className="flex items-center justify-between border-b border-border-dim/40 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-brand-500/10 rounded text-brand-500">{icon}</div>
          <div>
            <h3 className="text-[10px] font-black uppercase text-text-main tracking-widest">{title}</h3>
            <p className="text-[8px] text-text-dim font-bold uppercase mt-0.5">{subtitle}</p>
          </div>
        </div>
        <span className="text-[9px] font-bold text-text-dim uppercase tracking-wider bg-bg-accent px-2 py-1 rounded border border-border-dim/50 font-mono">
          Entidades registradas: {stats.length}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat: any) => (
          <div key={`${stat.entity}#${stat.plan}`} className="bg-bg-accent/30 border border-border-dim p-4 rounded-lg flex flex-col justify-between min-h-[180px]">
            <div>
              <div className="flex justify-between items-start gap-2 mb-2">
                <span className="text-[11px] font-black uppercase text-brand-500 tracking-wider leading-tight">
                  {stat.entity}<br /><span className="text-[9px] text-text-dim">Plan: {stat.plan}</span>
                </span>
                <span className={cn(
                  "text-[8px] font-mono font-black px-2 py-0.5 rounded border shrink-0",
                  stat.pendingCount > 0 ? "bg-orange-500/10 border-orange-500/20 text-brand-500" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                )}>
                  {stat.pendingCount} {stat.pendingCount === 1 ? 'CUOTA PEND.' : 'CUOTAS PEND.'}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-[8px] text-text-dim uppercase font-black tracking-widest block opacity-70">Monto de cada cuota</span>
                <p className="text-[11px] font-mono font-black text-text-main truncate">
                  {stat.installmentAmounts.length === 0 ? '-' : stat.installmentAmounts.map((a: number) => fmtMoney(a)).join(' / ')}
                </p>
              </div>
              <div className="mt-2.5 pt-2.5 border-t border-border-dim/40 grid grid-cols-2 gap-x-3 gap-y-1.5">
                <div>
                  <span className="text-[7px] text-text-dim uppercase font-black tracking-widest block opacity-70">Importe total</span>
                  <p className="text-[10px] font-mono font-bold text-text-main truncate">{stat.totalAmount ? fmtMoney(stat.totalAmount) : 'S/D'}</p>
                </div>
                <div>
                  <span className="text-[7px] text-text-dim uppercase font-black tracking-widest block opacity-70">{typeLabel}</span>
                  <p className="text-[10px] font-bold text-text-main truncate" title={stat.taxType}>{stat.taxType || 'S/D'}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-[7px] text-text-dim uppercase font-black tracking-widest block opacity-70">Cuotas (pend. / total)</span>
                  <p className="text-[10px] font-mono font-bold text-text-main">{stat.pendingCount} / {stat.totalInstallments || '?'}</p>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-2.5 border-t border-border-dim/40">
              <span className="text-[8px] text-text-dim uppercase font-black tracking-widest block opacity-70">Monto total pendiente</span>
              <p className="text-sm font-mono font-black text-emerald-400 italic">{fmtMoney(stat.totalPendingAmount)}</p>
            </div>
          </div>
        ))}
        {stats.length === 0 && (
          <div className="col-span-full py-6 text-center text-[10px] text-text-dim uppercase font-bold italic">
            {emptyMsg}
          </div>
        )}
      </div>
    </div>
  );
}
