/**
 * SPDX-License-Identifier: Apache-2.0
 * Pestaña "Proyectar" del Estado de Resultados:
 * - Base histórica de ventas (mismo mes del año anterior)
 * - Variables globales (nombre + % impacto)
 * - Genera proyección: ventas = base x (1 + suma % activas); costos = % histórico sobre ventas
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Plus, Trash2, Wand2, Save, TrendingUp, Percent } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';
import { PL_STRUCTURE, SUBTOTAL_COMPONENTS } from './plStructure';

interface Props {
  scope: string;
  targetMonth: string;      // mes que se quiere proyectar (YYYY-MM)
  isReadOnly?: boolean;
  onProjectionGenerated?: () => void; // refrescar la tabla principal
}

interface PVar { id: string; name: string; impactPct: number; }

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');
// mismo mes del año anterior
const prevYearMonth = (m: string) => { const [y, mm] = m.split('-'); return `${parseInt(y) - 1}-${mm}`; };

export default function ProfitLossProjector({ scope, targetMonth, isReadOnly = false, onProjectionGenerated }: Props) {
  const [variables, setVariables] = useState<PVar[]>([]);
  const [activeVars, setActiveVars] = useState<Set<string>>(new Set());
  const [histV1, setHistV1] = useState<string>('');
  const [histV2, setHistV2] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [newVar, setNewVar] = useState({ name: '', impactPct: '' });

  const baseMonth = prevYearMonth(targetMonth);

  const loadAll = async () => {
    setLoading(true);
    try {
      const { data: vars } = await supabase.from('pl_projection_variables').select('*').order('created_at');
      setVariables((vars || []).map((v: any) => ({ id: v.id, name: v.name, impactPct: Number(v.impact_pct) || 0 })));
      const { data: hist } = await supabase.from('pl_historical_sales').select('*')
        .eq('month_ref', baseMonth).eq('scope', scope).maybeSingle();
      setHistV1(hist ? String(hist.ventas_1 || '') : '');
      setHistV2(hist ? String(hist.ventas_2 || '') : '');
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

  const saveHistorical = async () => {
    if (isReadOnly) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('pl_historical_sales').upsert({
        month_ref: baseMonth, scope, ventas_1: Number(histV1) || 0, ventas_2: Number(histV2) || 0, updated_at: new Date().toISOString()
      }, { onConflict: 'month_ref,scope' });
      if (error) throw error;
      alert('Base histórica guardada.');
    } catch (err: any) { alert('Error al guardar base: ' + (err?.message || '')); }
    setSaving(false);
  };

  const totalImpact = useMemo(() => {
    return variables.filter(v => activeVars.has(v.id)).reduce((s, v) => s + v.impactPct, 0);
  }, [variables, activeVars]);

  const baseV1 = Number(histV1) || 0;
  const baseV2 = Number(histV2) || 0;
  const baseTotal = baseV1 + baseV2;
  const factor = 1 + totalImpact / 100;
  const projV1 = baseV1 * factor;
  const projV2 = baseV2 * factor;
  const projVentas = projV1 + projV2;

  // Generar proyección: ventas proyectadas + costos como % histórico del último real
  const generateProjection = async () => {
    if (isReadOnly) return;
    if (baseTotal <= 0) { alert('Cargá primero la base histórica de ventas del año anterior.'); return; }
    if (!window.confirm(`Esto va a generar el PROYECTADO de ${targetMonth} (sobrescribe el proyectado actual de ese mes). ¿Continuar?`)) return;
    setGenerating(true);
    try {
      // 1. Traer el último real disponible para sacar % de costos sobre ventas
      const { data: existing } = await supabase.from('income_statements').select('*')
        .eq('month', targetMonth).eq('scope', scope).maybeSingle();

      // Buscar un real de referencia: el del propio mes si tiene, sino el más reciente
      let refLines: any[] = [];
      const { data: recent } = await supabase.from('income_statements').select('*')
        .eq('scope', scope).order('month', { ascending: false }).limit(12);
      const withReal = (recent || []).find((r: any) => {
        const arr = typeof r.lines === 'string' ? JSON.parse(r.lines) : r.lines;
        return (arr || []).some((l: any) => l.realPesos && l.key === 'ventas_1');
      });
      if (withReal) refLines = typeof withReal.lines === 'string' ? JSON.parse(withReal.lines) : withReal.lines;

      const refMap: Record<string, any> = {};
      refLines.forEach((l: any) => { refMap[l.key] = l; });
      const refVentas = (refMap['ventas_1']?.realPesos || 0) + (refMap['ventas_2']?.realPesos || 0);

      // 2. Armar líneas proyectadas
      const inputDefs = PL_STRUCTURE.filter(d => d.type === 'input');
      const newLines = inputDefs.map(d => {
        const prev = existing ? ((typeof existing.lines === 'string' ? JSON.parse(existing.lines) : existing.lines) || []).find((x: any) => x.key === d.key) : null;
        let projPesos = 0;
        if (d.key === 'ventas_1') projPesos = projV1;
        else if (d.key === 'ventas_2') projPesos = projV2;
        else if (refVentas > 0 && refMap[d.key]) {
          // costo como % histórico sobre ventas reales de referencia
          const ratio = (refMap[d.key].realPesos || 0) / refVentas;
          projPesos = ratio * projVentas;
        }
        return {
          key: d.key,
          projPesos: Math.round(projPesos),
          projUsd: 0,
          // conservar el real que ya estuviera cargado
          realPesos: prev?.realPesos || 0,
          realUsd: prev?.realUsd || 0
        };
      });

      const { error } = await supabase.from('income_statements').upsert({
        month: targetMonth, scope, lines: newLines, updated_at: new Date().toISOString()
      }, { onConflict: 'month,scope' });
      if (error) throw error;
      alert(`Proyección de ${targetMonth} generada. Ventas proyectadas: ${fmt(projVentas)}.` + (refVentas > 0 ? ' Costos estimados según % histórico.' : ' (No había un real de referencia para estimar costos; quedaron en 0.)'));
      if (onProjectionGenerated) onProjectionGenerated();
    } catch (err: any) {
      alert('Error al generar proyección: ' + (err?.message || ''));
    }
    setGenerating(false);
  };

  if (loading) return <div className="py-16 flex justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>;

  return (
    <div className="space-y-6">
      {/* Base histórica */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-brand-500" />
          <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Base Histórica · Ventas de {baseMonth}</h3>
        </div>
        <p className="text-[10px] text-text-dim font-bold uppercase mb-3">Cargá las ventas del mismo mes del año anterior (base para proyectar {targetMonth})</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Ventas 1 ($)</label>
            <input type="number" value={histV1} onChange={(e) => setHistV1(e.target.value)} disabled={isReadOnly} placeholder="0"
              className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[12px] font-mono font-bold text-text-main outline-none mt-1" />
            {baseV1 > 0 && <p className="text-[9px] text-text-dim font-mono mt-0.5">{fmt(baseV1)}</p>}
          </div>
          <div>
            <label className="text-[8px] font-black uppercase text-text-dim tracking-widest">Ventas 2 ($)</label>
            <input type="number" value={histV2} onChange={(e) => setHistV2(e.target.value)} disabled={isReadOnly} placeholder="0"
              className="w-full bg-bg-accent border border-border-dim rounded px-2 py-2 text-[12px] font-mono font-bold text-text-main outline-none mt-1" />
            {baseV2 > 0 && <p className="text-[9px] text-text-dim font-mono mt-0.5">{fmt(baseV2)}</p>}
          </div>
          {!isReadOnly && (
            <button onClick={saveHistorical} disabled={saving}
              className="bg-bg-accent border border-border-dim text-text-main px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:border-brand-500/50 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar Base
            </button>
          )}
        </div>
      </div>

      {/* Variables */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Percent size={16} className="text-brand-500" />
          <h3 className="text-xs font-black uppercase text-text-main tracking-wider">Variables de Proyección</h3>
        </div>
        <p className="text-[10px] text-text-dim font-bold uppercase mb-3">Tildá las que aplican a {targetMonth}. Cada una ajusta las ventas por su % de impacto.</p>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div><p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Base Ventas {baseMonth}</p><p className="text-sm font-mono font-black text-text-main mt-1">{fmt(baseTotal)}</p></div>
          <div><p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Impacto Variables</p><p className={cn("text-sm font-mono font-black mt-1", totalImpact >= 0 ? "text-emerald-500" : "text-red-500")}>{totalImpact > 0 ? '+' : ''}{totalImpact.toFixed(1)}%</p></div>
          <div><p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Ventas Proyectadas</p><p className="text-sm font-mono font-black text-brand-500 mt-1">{fmt(projVentas)}</p></div>
          <div className="flex items-end">
            {!isReadOnly && (
              <button onClick={generateProjection} disabled={generating || baseTotal <= 0}
                className="w-full bg-brand-500 text-black px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />} Generar Proyección
              </button>
            )}
          </div>
        </div>
        <p className="text-[9px] text-text-dim font-bold uppercase opacity-70">
          Las ventas se proyectan desde la base × (1 + impacto). Los costos se estiman como su % histórico sobre ventas del último mes con datos reales. Después podés ajustar el proyectado manualmente y cargar el real cuando lo tengas.
        </p>
      </div>
    </div>
  );
}
