/**
 * SPDX-License-Identifier: Apache-2.0
 * Pestaña "Proyectar" del Estado de Resultados:
 * - Trae automáticamente el EERR completo del mismo mes del año anterior (ventas Y costos)
 * - Inflación % (campo fijo) + variables globales (clima, feriados, etc.)
 * - Proyectado = año anterior x (1 + inflación% + suma variables%)
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Plus, Trash2, Wand2, Percent, TrendingUp, AlertCircle } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import { PL_STRUCTURE } from './plStructure';

interface Props {
  scope: string;
  targetMonth: string;
  isReadOnly?: boolean;
  onProjectionGenerated?: () => void;
}

interface PVar { id: string; name: string; impactPct: number; }
type LineRow = { key: string; realPesos: number; realUsd: number };

const fmt = (n: number) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-AR');
const prevYearMonth = (m: string) => { const [y, mm] = m.split('-'); return `${parseInt(y) - 1}-${mm}`; };

export default function ProfitLossProjector({ scope, targetMonth, isReadOnly = false, onProjectionGenerated }: Props) {
  const [variables, setVariables] = useState<PVar[]>([]);
  const [activeVars, setActiveVars] = useState<Set<string>>(new Set());
  const [inflation, setInflation] = useState<string>('');
  const [baseLines, setBaseLines] = useState<Record<string, LineRow>>({});
  const [baseFound, setBaseFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newVar, setNewVar] = useState({ name: '', impactPct: '' });

  const baseMonth = prevYearMonth(targetMonth);

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: vars } = await supabase.from('pl_projection_variables').select('*').order('created_at');
      setVariables((vars || []).map((v: any) => ({ id: v.id, name: v.name, impactPct: Number(v.impact_pct) || 0 })));
      // Traer el EERR completo del mismo mes del año anterior
      const { data: prev } = await supabase.from('income_statements').select('*')
        .eq('month', baseMonth).eq('scope', scope).maybeSingle();
      const map: Record<string, LineRow> = {};
      if (prev && prev.lines) {
        const arr = typeof prev.lines === 'string' ? JSON.parse(prev.lines) : prev.lines;
        (arr || []).forEach((l: any) => { map[l.key] = { key: l.key, realPesos: l.realPesos || 0, realUsd: l.realUsd || 0 }; });
        setBaseFound((arr || []).some((l: any) => l.realPesos));
      } else {
        setBaseFound(false);
      }
      setBaseLines(map);
    } catch (e) { console.error('Error proyector:', e); }
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [scope, targetMonth]);

  const addVariable = async () => {
    if (isReadOnly) return;
    if (!newVar.name.trim()) { alert('Poné un nombre a la variable.'); return; }
    try {
      const { data, error } = await supabase.from('pl_projection_variables')
        .insert({ name: newVar.name.trim(), impact_pct: Number(newVar.impactPct) || 0 }).select().single();
      if (error) throw error;
      setVariables(prev => [...prev, { id: data.id, name: data.name, impactPct: Number(data.impact_pct) || 0 }]);
      setNewVar({ name: '', impactPct: '' });
    } catch (err: any) { alert('Error: ' + (err?.message || '')); }
  };

  const deleteVariable = async (id: string) => {
    if (isReadOnly) return;
    try {
      await supabase.from('pl_projection_variables').delete().eq('id', id);
      setVariables(prev => prev.filter(v => v.id !== id));
      setActiveVars(prev => { const n = new Set(prev); n.delete(id); return n; });
    } catch (err: any) { alert('Error: ' + (err?.message || '')); }
  };

  const inflationPct = Number(inflation) || 0;
  const varsImpact = useMemo(() => variables.filter(v => activeVars.has(v.id)).reduce((s, v) => s + v.impactPct, 0), [variables, activeVars]);
  const totalFactor = 1 + (inflationPct + varsImpact) / 100;

  // Base de ventas del año anterior (para mostrar resumen)
  const baseVentas = (baseLines['ventas_1']?.realPesos || 0) + (baseLines['ventas_2']?.realPesos || 0);
  const projVentas = baseVentas * totalFactor;

  const generateProjection = async () => {
    if (isReadOnly) return;
    if (!baseFound) { alert(`No hay datos cargados de ${baseMonth}. Cargá primero el Estado de Resultados de ese mes.`); return; }
    if (!window.confirm(`Se va a generar el PROYECTADO de ${targetMonth} aplicando ${(inflationPct + varsImpact).toFixed(1)}% sobre el real de ${baseMonth} (sobrescribe el proyectado actual). ¿Continuar?`)) return;
    setGenerating(true);
    try {
      // Conservar el real que ya estuviera cargado para targetMonth
      const { data: existing } = await supabase.from('income_statements').select('*')
        .eq('month', targetMonth).eq('scope', scope).maybeSingle();
      const existingArr = existing ? (typeof existing.lines === 'string' ? JSON.parse(existing.lines) : existing.lines) || [] : [];
      const existingMap: Record<string, any> = {};
      existingArr.forEach((l: any) => { existingMap[l.key] = l; });

      const inputDefs = PL_STRUCTURE.filter(d => d.type === 'input');
      const newLines = inputDefs.map(d => {
        const base = baseLines[d.key];
        const projPesos = base ? base.realPesos * totalFactor : 0;
        const projUsd = base ? base.realUsd * totalFactor : 0;
        return {
          key: d.key,
          projPesos: Math.round(projPesos),
          projUsd: Math.round(projUsd),
          realPesos: existingMap[d.key]?.realPesos || 0,
          realUsd: existingMap[d.key]?.realUsd || 0
        };
      });

      const { error } = await supabase.from('income_statements').upsert({
        month: targetMonth, scope, lines: newLines, updated_at: new Date().toISOString()
      }, { onConflict: 'month,scope' });
      if (error) throw error;
      alert(`Proyección de ${targetMonth} generada: real de ${baseMonth} ajustado +${(inflationPct + varsImpact).toFixed(1)}%.`);
      if (onProjectionGenerated) onProjectionGenerated();
    } catch (err: any) {
      alert('Error al generar proyección: ' + (err?.message || ''));
    }
    setGenerating(false);
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>;

  return (
    <div className="space-y-6">
      {/* Base del año anterior (automática) */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp size={16} className="text-brand-500" />
          <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Base · Estado de Resultados de {baseMonth}</h3>
        </div>
        {baseFound ? (
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Ventas Netas {baseMonth}</p>
              <p className="text-lg font-mono font-black text-text-main mt-1">{fmt(baseVentas)}</p>
            </div>
            <p className="text-[10px] text-text-dim font-bold uppercase">Se toman todas las líneas (ventas y costos) de ese mes como base. El sistema las trae automáticamente.</p>
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-amber-500/8 border border-amber-500/30 rounded-lg p-3">
            <AlertCircle size={16} className="text-amber-500 shrink-0" />
            <p className="text-[11px] font-bold text-text-main">No hay datos de {baseMonth} cargados. Importá o cargá el Estado de Resultados de ese mes para poder proyectar.</p>
          </div>
        )}
      </div>

      {/* Inflación */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Percent size={16} className="text-brand-500" />
          <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Inflación</h3>
        </div>
        <p className="text-[10px] text-text-dim font-bold uppercase mb-3">Ajuste por inflación acumulada del período (se aplica a todas las líneas: ventas y costos).</p>
        <div className="w-48">
          <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Inflación %</label>
          <input type="number" value={inflation} onChange={(e) => setInflation(e.target.value)} disabled={isReadOnly} placeholder="Ej: 40"
            className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[14px] font-mono font-black text-text-main outline-none mt-1" />
        </div>
      </div>

      {/* Variables */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Percent size={16} className="text-brand-500" />
          <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Otras Variables de Proyección</h3>
        </div>
        <p className="text-[10px] text-text-dim font-bold uppercase mb-3">Tildá las que aplican a {targetMonth} (clima, feriados, eventos, etc.). Suman/restan sobre la inflación.</p>
        <div className="space-y-2 mb-4">
          {variables.length === 0 ? (
            <p className="text-[10px] text-text-dim uppercase font-bold opacity-50">No hay variables. Creá la primera abajo.</p>
          ) : variables.map(v => (
            <div key={v.id} className="flex items-center gap-3 bg-bg-accent/30 border border-border-dim/40 rounded px-3 py-2">
              <input type="checkbox" checked={activeVars.has(v.id)} disabled={isReadOnly}
                onChange={(e) => setActiveVars(prev => { const n = new Set(prev); e.target.checked ? n.add(v.id) : n.delete(v.id); return n; })}
                className="w-4 h-4 accent-brand-500" />
              <span className="text-[11px] font-bold text-text-main flex-1">{v.name}</span>
              <span className={cn("text-[11px] font-mono font-black", v.impactPct >= 0 ? "text-emerald-500" : "text-red-500")}>
                {v.impactPct > 0 ? '+' : ''}{v.impactPct}%
              </span>
              {!isReadOnly && (
                <button onClick={() => deleteVariable(v.id)} className="text-text-dim hover:text-red-500 p-1"><Trash2 size={13} /></button>
              )}
            </div>
          ))}
        </div>
        {!isReadOnly && (
          <div className="flex gap-2 items-end border-t border-border-dim/40 pt-3">
            <div className="flex-1">
              <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Nueva variable</label>
              <input type="text" value={newVar.name} onChange={(e) => setNewVar({ ...newVar, name: e.target.value })}
                placeholder="Ej: Clima favorable, Feriado largo…" className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-bold text-text-main outline-none mt-1" />
            </div>
            <div className="w-24">
              <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Impacto %</label>
              <input type="number" value={newVar.impactPct} onChange={(e) => setNewVar({ ...newVar, impactPct: e.target.value })}
                placeholder="±%" className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[11px] font-mono font-bold text-text-main outline-none mt-1" />
            </div>
            <button onClick={addVariable} className="bg-bg-accent border border-border-dim text-text-main px-3 py-2.5 rounded hover:border-brand-500/50 transition-all"><Plus size={14} /></button>
          </div>
        )}
      </div>

      {/* Resumen y generar */}
      <div className="bg-brand-500/5 border border-brand-500/20 rounded-xl p-5">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
          <div><p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Inflación</p><p className="text-sm font-mono font-black text-text-main mt-1">{inflationPct > 0 ? '+' : ''}{inflationPct}%</p></div>
          <div><p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Variables</p><p className={cn("text-sm font-mono font-black mt-1", varsImpact >= 0 ? "text-emerald-500" : "text-red-500")}>{varsImpact > 0 ? '+' : ''}{varsImpact.toFixed(1)}%</p></div>
          <div><p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Ajuste Total</p><p className="text-sm font-mono font-black text-brand-500 mt-1">+{(inflationPct + varsImpact).toFixed(1)}%</p></div>
          <div><p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Ventas Proyectadas</p><p className="text-sm font-mono font-black text-text-main mt-1">{fmt(projVentas)}</p></div>
          <div className="flex items-end">
            {!isReadOnly && (
              <button onClick={generateProjection} disabled={generating || !baseFound}
                className="w-full bg-brand-500 text-black px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Generar
              </button>
            )}
          </div>
        </div>
        <p className="text-[9px] text-text-dim font-bold uppercase opacity-70">
          El proyectado se calcula tomando cada línea del Estado de Resultados real de {baseMonth} y ajustándola por el % total (inflación + variables). Después podés ajustarlo manualmente e importar el real cuando lo tengas.
        </p>
      </div>
    </div>
  );
}
