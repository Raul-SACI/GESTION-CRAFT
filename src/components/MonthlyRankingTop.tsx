/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { TrendingUp, TrendingDown, Loader2, Trophy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';

interface MonthlyRankingTopProps {
  branches: Branch[];
  // Si se pasa, fija la sucursal y oculta el selector interno (modo embebido).
  fixedBranchId?: string;
}

interface RankingRow {
  branch_id: string;
  product_name: string;
  product_code?: string;
  category?: string;
  quantity: number;
  month: string;
  week_number: number;
}

interface AggregatedProduct {
  product_name: string;
  product_code?: string;
  category?: string;
  total: number;
}

export default function MonthlyRankingTop({ branches, fixedBranchId }: MonthlyRankingTopProps) {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedBranch, setSelectedBranch] = useState(fixedBranchId || 'all');
  const [selectedCategory, setSelectedCategory] = useState('all');

  useEffect(() => {
    if (fixedBranchId) setSelectedBranch(fixedBranchId);
  }, [fixedBranchId]);

  useEffect(() => {
    const fetchRankings = async () => {
      setLoading(true);
      try {
        let all: RankingRow[] = [];
        let page = 0;
        const pageSize = 1000;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from('product_rankings')
            .select('branch_id, product_name, product_code, category, quantity, month, week_number')
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (error) throw error;
          if (data && data.length > 0) {
            all = [...all, ...(data as RankingRow[])];
            if (data.length < pageSize) hasMore = false;
            else page++;
          } else {
            hasMore = false;
          }
          if (page > 30) break;
        }
        setRows(all);
      } catch (e) {
        console.error('Error cargando rankings mensuales:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchRankings();
  }, []);

  // Lista de meses disponibles (descendente), y selección por defecto al más reciente.
  const availableMonths = useMemo(() => {
    const months = Array.from(new Set(rows.map(r => r.month).filter(Boolean))).sort().reverse();
    return months;
  }, [rows]);

  useEffect(() => {
    if (!selectedMonth && availableMonths.length > 0) {
      setSelectedMonth(availableMonths[0]);
    }
  }, [availableMonths, selectedMonth]);

  // Rubros disponibles según el mes y sucursal seleccionados.
  const availableCategories = useMemo(() => {
    const cats = rows
      .filter(r => r.month === selectedMonth && (selectedBranch === 'all' || r.branch_id === selectedBranch))
      .map(r => (r.category || '').trim())
      .filter(Boolean);
    return Array.from(new Set(cats)).sort();
  }, [rows, selectedMonth, selectedBranch]);

  // Si el rubro seleccionado ya no existe al cambiar mes/sucursal, vuelve a "Todos".
  useEffect(() => {
    if (selectedCategory !== 'all' && !availableCategories.includes(selectedCategory)) {
      setSelectedCategory('all');
    }
  }, [availableCategories, selectedCategory]);

  // Agrega por producto sumando las semanas del mes seleccionado (y sucursal/rubro si aplica).
  const aggregated = useMemo(() => {
    const filtered = rows.filter(r =>
      r.month === selectedMonth &&
      (selectedBranch === 'all' || r.branch_id === selectedBranch) &&
      (selectedCategory === 'all' || (r.category || '').trim() === selectedCategory)
    );
    const map: Record<string, AggregatedProduct> = {};
    filtered.forEach(r => {
      const key = (r.product_code || '') + '|' + r.product_name;
      if (!map[key]) {
        map[key] = {
          product_name: r.product_name,
          product_code: r.product_code,
          category: r.category,
          total: 0
        };
      }
      map[key].total += Number(r.quantity) || 0;
    });
    return Object.values(map);
  }, [rows, selectedMonth, selectedBranch, selectedCategory]);

  const top10 = useMemo(
    () => [...aggregated].sort((a, b) => b.total - a.total).slice(0, 10),
    [aggregated]
  );
  const bottom10 = useMemo(
    () => [...aggregated].sort((a, b) => a.total - b.total).slice(0, 10),
    [aggregated]
  );

  const monthLabel = (m: string) => {
    if (!m) return '—';
    const [y, mo] = m.split('-');
    const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    return `${names[Number(mo) - 1] || mo} ${y}`;
  };

  const RankTable = ({ title, data, variant }: { title: string; data: AggregatedProduct[]; variant: 'top' | 'bottom' }) => (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-3">
        {variant === 'top'
          ? <TrendingUp size={16} className="text-emerald-500" />
          : <TrendingDown size={16} className="text-red-500" />}
        <h4 className="text-[11px] font-black uppercase tracking-widest text-text-main">{title}</h4>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border-dim">
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr className="bg-bg-card text-left text-text-dim font-bold uppercase tracking-widest border-b border-border-dim">
              <th className="px-3 py-2 text-center">#</th>
              <th className="px-3 py-2">Producto</th>
              <th className="px-3 py-2">Rubro</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-dim/40">
            {data.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-text-dim italic opacity-50 uppercase">Sin datos</td></tr>
            ) : data.map((p, i) => (
              <tr key={(p.product_code || '') + p.product_name} className="hover:bg-bg-accent/40">
                <td className="px-3 py-2 text-center font-black text-text-dim">{i + 1}</td>
                <td className="px-3 py-2 font-black text-text-main uppercase">{p.product_name}</td>
                <td className="px-3 py-2 text-text-dim uppercase text-[9px]">{p.category || '—'}</td>
                <td className={cn(
                  "px-3 py-2 text-right font-black text-sm",
                  variant === 'top' ? "text-emerald-500" : "text-red-500"
                )}>{p.total.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-brand-500" />
          <h3 className="text-sm font-black uppercase tracking-widest text-text-main">
            Ranking Mensual de Productos
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!fixedBranchId && (
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="bg-bg-card border border-border-dim rounded px-3 py-1.5 text-[10px] font-black uppercase text-brand-500"
            >
              <option value="all">Consolidado (Todas)</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-bg-card border border-border-dim rounded px-3 py-1.5 text-[10px] font-black uppercase text-brand-500"
          >
            <option value="all">Todos los Rubros</option>
            {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-bg-card border border-border-dim rounded px-3 py-1.5 text-[10px] font-mono"
          >
            {availableMonths.length === 0 && <option value="">—</option>}
            {availableMonths.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-text-dim gap-2">
          <Loader2 className="animate-spin" size={18} /> <span className="text-[10px] uppercase font-bold">Cargando…</span>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          <RankTable title="10 Más Vendidos" data={top10} variant="top" />
          <RankTable title="10 Menos Vendidos" data={bottom10} variant="bottom" />
        </div>
      )}
    </div>
  );
}

// Pequeño helper local para evitar dependencia externa de cn.
function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}
