/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'motion/react';
import {
  Factory, Loader2, Calendar, TrendingUp, TrendingDown, Package,
  FileUp, CheckCircle2, Search
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';

interface ProdLog {
  code: string;
  name: string;
  unit: string;
  date: string;
  month: string;
  quantity: number;
}

const prevMonthOf = (ym: string): string => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const fmtQty = (n: number) => (Number.isInteger(n) ? n.toString() : n.toFixed(1));

export default function ProductionCenterView({ isReadOnly = false }: { isReadOnly?: boolean } = {}) {
  const [selectedMonth, setSelectedMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [currentLogs, setCurrentLogs] = useState<ProdLog[]>([]);
  const [prevLogs, setPrevLogs] = useState<ProdLog[]>([]);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const prevMonth = prevMonthOf(selectedMonth);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: curr } = await supabase
        .from('production_logs')
        .select('code, date, month, quantity, production_items(name, unit)')
        .eq('month', selectedMonth);
      const { data: prev } = await supabase
        .from('production_logs')
        .select('code, month, quantity')
        .eq('month', prevMonth);

      const mapCurr: ProdLog[] = (curr || []).map((r: any) => ({
        code: r.code,
        name: r.production_items?.name || r.code,
        unit: r.production_items?.unit || '',
        date: r.date,
        month: r.month,
        quantity: Number(r.quantity) || 0
      }));
      setCurrentLogs(mapCurr);
      setPrevLogs((prev || []).map((r: any) => ({
        code: r.code, name: '', unit: '', date: '', month: r.month, quantity: Number(r.quantity) || 0
      })));
    } catch (e) {
      console.error('Error cargando producción:', e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedMonth]);

  // Agregación por artículo del mes actual
  const articles = useMemo(() => {
    const byCode: Record<string, { code: string; name: string; unit: string; total: number; byDate: Record<string, number> }> = {};
    currentLogs.forEach(l => {
      if (!byCode[l.code]) byCode[l.code] = { code: l.code, name: l.name, unit: l.unit, total: 0, byDate: {} };
      byCode[l.code].total += l.quantity;
      byCode[l.code].byDate[l.date] = (byCode[l.code].byDate[l.date] || 0) + l.quantity;
    });
    const prevByCode: Record<string, number> = {};
    prevLogs.forEach(l => { prevByCode[l.code] = (prevByCode[l.code] || 0) + l.quantity; });

    let list = Object.values(byCode).map(a => ({
      ...a,
      prevTotal: prevByCode[a.code] || 0
    }));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(q) || a.code.includes(q));
    }
    return list.sort((a, b) => b.total - a.total);
  }, [currentLogs, prevLogs, search]);

  // Promedio del % de variación de la producción vs mes anterior
  // (solo artículos con producción el mes anterior, para que el % tenga sentido)
  const avgVariation = useMemo(() => {
    const withPrev = articles.filter(a => a.prevTotal > 0);
    if (withPrev.length === 0) return null;
    const sum = withPrev.reduce((s, a) => s + ((a.total - a.prevTotal) / a.prevTotal) * 100, 0);
    return sum / withPrev.length;
  }, [articles]);

  // Días del mes con producción (para el desglose)
  const daysInMonth = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    return new Date(y, m, 0).getDate();
  }, [selectedMonth]);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

      // Detectar encabezados
      const header = rows[0].map((h: any) => String(h || '').toLowerCase());
      const colFecha = header.findIndex((h: string) => h.includes('fecha'));
      const colCode = header.findIndex((h: string) => h.includes('cód') || h.includes('cod') || h.includes('artículo') && h.includes('cód'));
      const colDesc = header.findIndex((h: string) => h.includes('desc'));
      const colUm = header.findIndex((h: string) => h.includes('u.m') || h.includes('unidad') || h.includes('um'));
      const colCant = header.findIndex((h: string) => h.includes('cantidad'));

      if (colFecha < 0 || colCode < 0 || colCant < 0) {
        alert('No se reconocieron las columnas. Se esperan: Fecha, Cód. Artículo, Desc. artículo, U.M., Cantidad.');
        setImporting(false);
        return;
      }

      // Parsear filas
      const parsed: { code: string; name: string; unit: string; date: string; month: string; quantity: number }[] = [];
      const monthsTouched = new Set<string>();
      for (let i = 1; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r[colCode] === undefined || r[colCode] === null || r[colCode] === '') continue;
        // Fecha: puede venir como Date, número serial de Excel, o string
        let dateStr = '';
        const rawDate = r[colFecha];
        if (rawDate instanceof Date && !isNaN(rawDate.getTime())) {
          dateStr = `${rawDate.getFullYear()}-${String(rawDate.getMonth() + 1).padStart(2, '0')}-${String(rawDate.getDate()).padStart(2, '0')}`;
        } else if (typeof rawDate === 'number') {
          // Serial de Excel: días desde 1899-12-30
          const d = new Date(Math.round((rawDate - 25569) * 86400 * 1000));
          if (!isNaN(d.getTime())) {
            dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
          }
        } else if (typeof rawDate === 'string' && rawDate.trim()) {
          const parts = rawDate.trim().split(/[\/\-\.]/).map(p => p.trim());
          if (parts.length === 3) {
            let y: number, mo: number, da: number;
            if (parts[0].length === 4) {
              // yyyy-mm-dd
              y = +parts[0]; mo = +parts[1]; da = +parts[2];
            } else {
              // dd/mm/yyyy o dd/mm/yy
              da = +parts[0]; mo = +parts[1]; y = +parts[2];
              if (y < 100) y += 2000; // yy -> 20yy
            }
            // Validar rangos
            if (y >= 2000 && y <= 2100 && mo >= 1 && mo <= 12 && da >= 1 && da <= 31) {
              dateStr = `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
            }
          }
        }
        if (!dateStr) continue;
        const month = dateStr.slice(0, 7);
        monthsTouched.add(month);
        parsed.push({
          code: String(r[colCode]).trim(),
          name: colDesc >= 0 ? String(r[colDesc] || '').trim() : String(r[colCode]),
          unit: colUm >= 0 ? String(r[colUm] || '').trim() : '',
          date: dateStr,
          month,
          quantity: parseFloat(String(r[colCant]).replace(',', '.')) || 0
        });
      }

      if (parsed.length === 0) {
        alert('No se encontraron filas válidas en la planilla.');
        setImporting(false);
        return;
      }

      // 1. Upsert de artículos (por código)
      const uniqueArticles: Record<string, { code: string; name: string; unit: string }> = {};
      parsed.forEach(p => { uniqueArticles[p.code] = { code: p.code, name: p.name, unit: p.unit }; });
      const { error: itemsErr } = await supabase
        .from('production_items')
        .upsert(Object.values(uniqueArticles), { onConflict: 'code' });
      if (itemsErr) throw itemsErr;

      // Releer items para mapear code -> id
      const { data: itemsData } = await supabase.from('production_items').select('id, code');
      const codeToId: Record<string, string> = {};
      (itemsData || []).forEach((it: any) => { codeToId[it.code] = it.id; });

      // 2. Borrar los meses que vienen en la planilla (reemplazo)
      for (const m of monthsTouched) {
        await supabase.from('production_logs').delete().eq('month', m);
      }

      // 3. Insertar logs (consolidando por code+date)
      const logMap: Record<string, { item_id: string; code: string; date: string; month: string; quantity: number }> = {};
      parsed.forEach(p => {
        const key = `${p.code}|${p.date}`;
        if (!logMap[key]) logMap[key] = { item_id: codeToId[p.code], code: p.code, date: p.date, month: p.month, quantity: 0 };
        logMap[key].quantity += p.quantity;
      });
      const logsToInsert = Object.values(logMap);
      // Insertar en lotes
      for (let i = 0; i < logsToInsert.length; i += 500) {
        const chunk = logsToInsert.slice(i, i + 500);
        const { error: logErr } = await supabase.from('production_logs').insert(chunk);
        if (logErr) throw logErr;
      }

      alert(`¡Importación exitosa! ${logsToInsert.length} registros de producción cargados (${Object.keys(uniqueArticles).length} artículos).`);
      // Si la planilla es de otro mes, cambiar a ese mes
      const firstMonth = Array.from(monthsTouched)[0];
      if (firstMonth && firstMonth !== selectedMonth) setSelectedMonth(firstMonth);
      else fetchData();
    } catch (err: any) {
      console.error('Error importando producción:', err);
      alert('ATENCIÓN: Error al importar. ' + (err?.message || 'error desconocido'));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/15 p-3 text-brand-500 border border-brand-500/25 rounded-xl">
            <Factory size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-text-main uppercase tracking-tight">Producción del Mes</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">Cantidad producida por artículo · {selectedMonth}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-bg-sidebar border border-border-dim rounded-lg px-3 py-1.5 flex items-center gap-2 font-mono">
            <Calendar size={14} className="text-brand-500" />
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none text-[10px] font-extrabold uppercase text-text-main outline-none cursor-pointer" />
          </div>
          {!isReadOnly && (
            <>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="flex items-center gap-2 bg-brand-500 text-black px-5 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-lg disabled:opacity-60"
              >
                {importing ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />}
                {importing ? 'Importando…' : 'Importar Planilla'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <p className="text-[9px] text-text-dim uppercase font-black tracking-widest">Artículos Producidos</p>
          <p className="text-2xl font-mono font-black text-text-main mt-1">{articles.length}</p>
        </div>
        <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
          <p className="text-[9px] text-text-dim uppercase font-black tracking-widest">Variación Promedio de Producción</p>
          {avgVariation === null ? (
            <p className="text-2xl font-mono font-black text-text-dim mt-1">—</p>
          ) : (
            <p className={cn("text-2xl font-mono font-black mt-1 flex items-center gap-1.5", avgVariation >= 0 ? "text-emerald-500" : "text-red-500")}>
              {avgVariation >= 0 ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
              {avgVariation >= 0 ? '+' : ''}{avgVariation.toFixed(1)}%
            </p>
          )}
          <p className="text-[8px] text-text-dim uppercase font-bold mt-1 opacity-70">Promedio del cambio por artículo vs {prevMonth}</p>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative flex items-center max-w-xs">
        <Search size={14} className="absolute left-3 text-text-dim pointer-events-none" />
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar artículo o código…"
          className="bg-bg-sidebar border border-border-dim rounded-lg pl-9 pr-3 py-2 text-[11px] font-bold text-text-main w-full outline-none focus:border-brand-500/50" />
      </div>

      {/* Tabla de artículos */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-text-dim">
            <Loader2 size={28} className="animate-spin text-brand-500" />
            <p className="mt-3 text-[10px] font-black uppercase tracking-widest">Cargando producción…</p>
          </div>
        ) : articles.length === 0 ? (
          <div className="py-20 flex flex-col items-center justify-center text-text-dim opacity-50">
            <Package size={40} />
            <p className="mt-4 text-[10px] font-black uppercase tracking-widest">No hay producción cargada para {selectedMonth}</p>
            <p className="mt-1 text-[9px] font-bold uppercase">Usá "Importar Planilla" para cargar los datos</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-wider text-text-dim border-b border-border-dim bg-bg-accent/10">
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Artículo</th>
                  <th className="px-4 py-3 text-center">U.M.</th>
                  <th className="px-4 py-3 text-right">Producido (mes)</th>
                  <th className="px-4 py-3 text-right">Mes anterior</th>
                  <th className="px-4 py-3 text-right">Variación</th>
                  <th className="px-4 py-3 text-center">Por día</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim/40">
                {articles.map(a => {
                  const variation = a.prevTotal > 0 ? ((a.total - a.prevTotal) / a.prevTotal) * 100 : null;
                  const isExp = expanded === a.code;
                  return (
                    <React.Fragment key={a.code}>
                      <tr className="text-[11px] font-medium hover:bg-bg-accent/20">
                        <td className="px-4 py-2.5 font-mono text-text-dim">{a.code}</td>
                        <td className="px-4 py-2.5 font-black uppercase text-text-main">{a.name}</td>
                        <td className="px-4 py-2.5 text-center text-text-dim font-bold">{a.unit}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-black text-brand-500">{fmtQty(a.total)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-text-dim">{a.prevTotal > 0 ? fmtQty(a.prevTotal) : '—'}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[10px] font-bold">
                          {variation === null ? <span className="text-text-dim">—</span> :
                            <span className={cn('inline-flex items-center gap-0.5', variation >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                              {variation >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                              {variation >= 0 ? '+' : ''}{variation.toFixed(1)}%
                            </span>}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <button onClick={() => setExpanded(isExp ? null : a.code)}
                            className="text-[9px] font-black uppercase text-brand-500 hover:text-brand-600">
                            {isExp ? 'Ocultar' : 'Ver'}
                          </button>
                        </td>
                      </tr>
                      {isExp && (
                        <tr className="bg-bg-accent/20">
                          <td colSpan={7} className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
                                const dateStr = `${selectedMonth}-${String(day).padStart(2, '0')}`;
                                const qty = a.byDate[dateStr] || 0;
                                return (
                                  <div key={day} className={cn('flex flex-col items-center justify-center rounded border px-1.5 py-1 min-w-[34px]',
                                    qty > 0 ? 'bg-brand-500/10 border-brand-500/30' : 'bg-bg-sidebar border-border-dim/30 opacity-40')}>
                                    <span className="text-[7px] font-black text-text-dim">{day}</span>
                                    <span className={cn('text-[9px] font-mono font-black', qty > 0 ? 'text-brand-500' : 'text-text-dim')}>{qty > 0 ? fmtQty(qty) : '·'}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
