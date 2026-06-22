/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { TrendingUp, TrendingDown, Loader2, Trophy, ChevronDown, Check, Search, X } from 'lucide-react';
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

// Normaliza un rubro/categoría para unificar variantes con errores de tipeo o acentos.
// Ej: "INFUCIONES & CAFETERIA" y "INFUSIONES & CAFETERÍA" -> mismo rubro.
function normalizeCategory(cat?: string): string {
  if (!cat) return '';
  let s = cat.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quita acentos
    .replace(/\s+/g, ' ').trim();
  // Correcciones conocidas de tipeo
  s = s.replace(/infuciones/g, 'infusiones');
  return s;
}

// Etiqueta "linda" de un rubro ya normalizado (Title Case con & respetado).
function prettyCategory(normalized: string): string {
  if (!normalized) return '—';
  return normalized.split(' ').map(w => w === '&' ? '&' : (w.charAt(0).toUpperCase() + w.slice(1))).join(' ');
}

// Normaliza el nombre de producto para agrupar el mismo artículo aunque difiera en mayúsculas/acentos.
function normalizeProductName(name?: string): string {
  if (!name) return '';
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

export default function MonthlyRankingTop({ branches, fixedBranchId }: MonthlyRankingTopProps) {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedBranch, setSelectedBranch] = useState(fixedBranchId || 'all');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState('');

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

  // Rubros disponibles según el mes y sucursal seleccionados (normalizados para unificar variantes).
  const availableCategories = useMemo(() => {
    const cats = rows
      .filter(r => r.month === selectedMonth && (selectedBranch === 'all' || r.branch_id === selectedBranch))
      .map(r => prettyCategory(normalizeCategory(r.category)))
      .filter(c => c && c !== '—');
    return Array.from(new Set(cats)).sort();
  }, [rows, selectedMonth, selectedBranch]);

  // Quita de la selección los rubros que ya no existen al cambiar mes/sucursal.
  useEffect(() => {
    setSelectedCategories(prev => prev.filter(c => availableCategories.includes(c)));
  }, [availableCategories]);

  // Agrega por producto sumando las semanas del mes seleccionado (y sucursal/rubros si aplica).
  // Si no hay rubros marcados, se consideran TODOS.
  const aggregated = useMemo(() => {
    const filtered = rows.filter(r =>
      r.month === selectedMonth &&
      (selectedBranch === 'all' || r.branch_id === selectedBranch) &&
      (selectedCategories.length === 0 || selectedCategories.includes(prettyCategory(normalizeCategory(r.category)))) &&
      (productSearch.trim() === '' || (r.product_name || '').toLowerCase().includes(productSearch.trim().toLowerCase()))
    );
    const map: Record<string, AggregatedProduct> = {};
    filtered.forEach(r => {
      // Agrupar por nombre de producto normalizado para unificar el mismo artículo
      // aunque venga con distinto código o variante de rubro.
      const key = normalizeProductName(r.product_name);
      if (!map[key]) {
        map[key] = {
          product_name: r.product_name,
          product_code: r.product_code,
          category: prettyCategory(normalizeCategory(r.category)),
          total: 0
        };
      }
      map[key].total += Number(r.quantity) || 0;
    });
    return Object.values(map);
  }, [rows, selectedMonth, selectedBranch, selectedCategories, productSearch]);

  const top10 = useMemo(
    () => [...aggregated].sort((a, b) => b.total - a.total).slice(0, 10),
    [aggregated]
  );
  const bottom10 = useMemo(
    () => [...aggregated].sort((a, b) => a.total - b.total).slice(0, 10),
    [aggregated]
  );
  // Ranking completo ordenado de mayor a menor
  const rankingCompleto = useMemo(
    () => [...aggregated].sort((a, b) => b.total - a.total),
    [aggregated]
  );
  // Toggle de la tabla destacada: 10 más vendidos o 10 menos vendidos
  const [destacado, setDestacado] = useState<'top' | 'bottom'>('top');

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
      <div className="overflow-x-auto overflow-y-auto max-h-[500px] rounded-lg border border-border-dim">
        <table className="w-full border-collapse text-[10px]">
          <thead className="sticky top-0">
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
          <div className="relative flex items-center">
            <Search size={13} className="absolute left-2.5 text-text-dim pointer-events-none" />
            <input
              type="text"
              value={productSearch}
              onChange={(e) => setProductSearch(e.target.value)}
              placeholder="Buscar producto…"
              className="bg-bg-card border border-border-dim rounded pl-8 pr-7 py-1.5 text-[10px] font-bold text-text-main w-44 outline-none focus:border-brand-500/50"
            />
            {productSearch && (
              <button onClick={() => setProductSearch('')} className="absolute right-2 text-text-dim hover:text-brand-500">
                <X size={12} />
              </button>
            )}
          </div>
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
          <CategoryMultiSelect
            options={availableCategories}
            selected={selectedCategories}
            onChange={setSelectedCategories}
          />
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
          {/* Tabla 1: ranking completo */}
          <RankTable title={`Ranking Completo (${rankingCompleto.length})`} data={rankingCompleto} variant="top" />

          {/* Tabla 2: destacado con toggle */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                {destacado === 'top'
                  ? <TrendingUp size={16} className="text-emerald-500" />
                  : <TrendingDown size={16} className="text-red-500" />}
                <h4 className="text-[11px] font-black uppercase tracking-widest text-text-main">
                  {destacado === 'top' ? '10 Más Vendidos' : '10 Menos Vendidos'}
                </h4>
              </div>
              <div className="flex gap-1 bg-bg-accent rounded-lg p-1">
                <button onClick={() => setDestacado('top')}
                  className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                    destacado === 'top' ? "bg-emerald-500 text-white" : "text-text-dim hover:text-text-main")}>
                  10 Más
                </button>
                <button onClick={() => setDestacado('bottom')}
                  className={cn("px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                    destacado === 'bottom' ? "bg-red-500 text-white" : "text-text-dim hover:text-text-main")}>
                  10 Menos
                </button>
              </div>
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
                  {(destacado === 'top' ? top10 : bottom10).length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-8 text-center text-text-dim italic opacity-50 uppercase">Sin datos</td></tr>
                  ) : (destacado === 'top' ? top10 : bottom10).map((p, i) => (
                    <tr key={(p.product_code || '') + p.product_name} className="hover:bg-bg-accent/40">
                      <td className="px-3 py-2 text-center font-black text-text-dim">{i + 1}</td>
                      <td className="px-3 py-2 font-black text-text-main uppercase">{p.product_name}</td>
                      <td className="px-3 py-2 text-text-dim uppercase text-[9px]">{p.category || '—'}</td>
                      <td className={cn("px-3 py-2 text-right font-black text-sm", destacado === 'top' ? "text-emerald-500" : "text-red-500")}>{p.total.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Selector múltiple de rubros con panel de checkboxes desplegable. Exportado para reuso.
export function CategoryMultiSelect({
  options,
  selected,
  onChange,
  labelAll = 'Todos los Rubros'
}: {
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
  labelAll?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggle = (val: string) => {
    if (selected.includes(val)) onChange(selected.filter(v => v !== val));
    else onChange([...selected, val]);
  };

  const label = selected.length === 0
    ? labelAll
    : selected.length === 1
      ? selected[0]
      : `${selected.length} rubros`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-bg-card border border-border-dim rounded px-3 py-1.5 text-[10px] font-black uppercase text-brand-500 max-w-[220px]"
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={12} className="shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 max-h-72 overflow-y-auto bg-bg-sidebar border border-border-dim rounded-lg shadow-2xl p-1">
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full text-left px-3 py-2 text-[10px] font-black uppercase text-text-dim hover:bg-bg-accent rounded"
          >
            Limpiar selección
          </button>
          {options.length === 0 && (
            <div className="px-3 py-2 text-[10px] text-text-dim italic uppercase opacity-50">Sin rubros</div>
          )}
          {options.map(opt => {
            const checked = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                className="w-full flex items-center gap-2 px-3 py-2 text-[10px] font-bold uppercase text-text-main hover:bg-bg-accent rounded text-left"
              >
                <span className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center shrink-0",
                  checked ? "bg-brand-500 border-brand-500" : "border-border-dim"
                )}>
                  {checked && <Check size={11} className="text-black" />}
                </span>
                <span className="truncate">{opt}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Pequeño helper local para evitar dependencia externa de cn.
function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

// deploy trigger: 2026-06-02T00:44:18Z
