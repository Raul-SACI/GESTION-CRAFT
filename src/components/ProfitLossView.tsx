/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { BarChart3, Calendar, FileUp, Loader2, Save } from 'lucide-react';
import * as XLSX from 'xlsx';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';
import { supabase } from '../lib/supabase';
import {
  PL_STRUCTURE, SUBTOTAL_COMPONENTS, GANANCIA_BRUTA_COMPONENTS,
  OPERATIVA_COMPONENTS, OPERATIVA_NETA_COMPONENTS, FINAL_COMPONENTS,
  normalizeLabel, LABEL_TO_KEY
} from './plStructure';

interface LineValues {
  projPesos: number; projUsd: number;
  realPesos: number; realUsd: number;
}
type LinesMap = Record<string, LineValues>;

const emptyLine = (): LineValues => ({ projPesos: 0, projUsd: 0, realPesos: 0, realUsd: 0 });

const fmtMoney = (n: number, usd = false) => {
  if (!n) return '-';
  const abs = Math.abs(n);
  const s = (usd ? 'US$' : '$') + abs.toLocaleString('es-AR', { maximumFractionDigits: 0 });
  return n < 0 ? `-${s}` : s;
};

export default function ProfitLossView({
  branches, selectedBranchId, onBranchChange, isReadOnly = false
}: {
  branches: Branch[]; selectedBranchId: string; onBranchChange?: (id: string) => void; isReadOnly?: boolean;
}) {
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [scope, setScope] = useState<string>('consolidated');
  const [lines, setLines] = useState<LinesMap>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);

  const operativeBranches = useMemo(() => branches.filter(b => !/almac/i.test(b.name)), [branches]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('income_statements').select('*')
        .eq('month', selectedMonth).eq('scope', scope).maybeSingle();
      const map: LinesMap = {};
      if (data && data.lines) {
        const arr = typeof data.lines === 'string' ? JSON.parse(data.lines) : data.lines;
        (arr || []).forEach((l: any) => { map[l.key] = { projPesos: l.projPesos || 0, projUsd: l.projUsd || 0, realPesos: l.realPesos || 0, realUsd: l.realUsd || 0 }; });
      }
      setLines(map);
    } catch (e) { console.error('Error cargando P&L:', e); setLines({}); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedMonth, scope]);

  const computed = useMemo(() => {
    const get = (k: string): LineValues => lines[k] || emptyLine();
    const result: LinesMap = {};
    PL_STRUCTURE.forEach(def => { if (def.type === 'input') result[def.key] = get(def.key); });
    const sumKeys = (keys: string[], field: keyof LineValues) => keys.reduce((s, k) => s + (result[k]?.[field] || 0), 0);
    Object.entries(SUBTOTAL_COMPONENTS).forEach(([key, comps]) => {
      result[key] = { projPesos: sumKeys(comps, 'projPesos'), projUsd: sumKeys(comps, 'projUsd'), realPesos: sumKeys(comps, 'realPesos'), realUsd: sumKeys(comps, 'realUsd') };
    });
    result['ganancia_bruta'] = { projPesos: sumKeys(GANANCIA_BRUTA_COMPONENTS, 'projPesos'), projUsd: sumKeys(GANANCIA_BRUTA_COMPONENTS, 'projUsd'), realPesos: sumKeys(GANANCIA_BRUTA_COMPONENTS, 'realPesos'), realUsd: sumKeys(GANANCIA_BRUTA_COMPONENTS, 'realUsd') };
    result['ganancia_operativa'] = { projPesos: sumKeys(OPERATIVA_COMPONENTS, 'projPesos'), projUsd: sumKeys(OPERATIVA_COMPONENTS, 'projUsd'), realPesos: sumKeys(OPERATIVA_COMPONENTS, 'realPesos'), realUsd: sumKeys(OPERATIVA_COMPONENTS, 'realUsd') };
    result['ganancia_operativa_neta'] = { projPesos: sumKeys(OPERATIVA_NETA_COMPONENTS, 'projPesos'), projUsd: sumKeys(OPERATIVA_NETA_COMPONENTS, 'projUsd'), realPesos: sumKeys(OPERATIVA_NETA_COMPONENTS, 'realPesos'), realUsd: sumKeys(OPERATIVA_NETA_COMPONENTS, 'realUsd') };
    result['ganancia_final'] = { projPesos: sumKeys(FINAL_COMPONENTS, 'projPesos'), projUsd: sumKeys(FINAL_COMPONENTS, 'projUsd'), realPesos: sumKeys(FINAL_COMPONENTS, 'realPesos'), realUsd: sumKeys(FINAL_COMPONENTS, 'realUsd') };
    return result;
  }, [lines]);

  const ventasNetasProj = computed['ventas_netas']?.projPesos || 0;
  const ventasNetasReal = computed['ventas_netas']?.realPesos || 0;
  const pct = (val: number, base: number) => base !== 0 ? (val / base) * 100 : 0;

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
        const newLines: LinesMap = {};
        const parseNum = (v: any): number => {
          if (v === null || v === undefined || v === '') return 0;
          if (typeof v === 'number') return v;
          const cleaned = String(v).replace(/[$\s]/g, '').replace(/\./g, '').replace(/,/g, '.').replace(/[^0-9.\-]/g, '');
          const n = parseFloat(cleaned);
          return isNaN(n) ? 0 : n;
        };
        rows.forEach(row => {
          if (!row || !row[0]) return;
          const key = LABEL_TO_KEY[normalizeLabel(String(row[0]))];
          if (!key) return;
          const projPesos = parseNum(row[1]);
          const projUsd = parseNum(row[2]);
          const realPesos = parseNum(row[4]);
          const realUsd = parseNum(row[5]);
          if (!newLines[key]) newLines[key] = emptyLine();
          newLines[key].projPesos += projPesos;
          newLines[key].projUsd += projUsd;
          newLines[key].realPesos += realPesos;
          newLines[key].realUsd += realUsd;
        });
        if (Object.keys(newLines).length === 0) {
          alert('No se reconoció ninguna línea del Excel. Verificá que la primera columna tenga los nombres de los conceptos.');
        } else {
          setLines(newLines);
          alert(`Se importaron ${Object.keys(newLines).length} líneas. Revisá y guardá para persistir.`);
        }
      } catch (err: any) {
        alert('Error al leer el Excel: ' + (err?.message || ''));
      }
      setImporting(false);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleSave = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    setSaving(true);
    try {
      const arr = PL_STRUCTURE.filter(d => d.type === 'input').map(d => ({
        key: d.key,
        projPesos: lines[d.key]?.projPesos || 0, projUsd: lines[d.key]?.projUsd || 0,
        realPesos: lines[d.key]?.realPesos || 0, realUsd: lines[d.key]?.realUsd || 0
      }));
      const { error } = await supabase.from('income_statements').upsert({
        month: selectedMonth, scope, lines: arr, updated_at: new Date().toISOString()
      }, { onConflict: 'month,scope' });
      if (error) throw error;
      alert('Estado de Resultados guardado correctamente.');
    } catch (err: any) {
      alert('Error al guardar: ' + (err?.message || ''));
    }
    setSaving(false);
  };

  const scopeName = scope === 'consolidated' ? 'Consolidado (Todas)' : (branches.find(b => b.id === scope)?.name || scope);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-20">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-bg-sidebar p-5 rounded-xl border border-border-dim shadow-xl">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500/15 p-3 text-brand-500 border border-brand-500/25 rounded-xl"><BarChart3 size={24} /></div>
          <div>
            <h2 className="text-lg font-black text-text-main uppercase tracking-tight">Estado de Resultados</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest">Proyectado vs Real · {scopeName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={scope} onChange={(e) => setScope(e.target.value)}
            className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-[11px] font-black uppercase text-text-main outline-none">
            <option value="consolidated">Consolidado (Todas)</option>
            {operativeBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <div className="bg-bg-accent border border-border-dim rounded px-3 py-1.5 flex items-center gap-2">
            <Calendar size={14} className="text-brand-500" />
            <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none text-[11px] font-black uppercase text-text-main outline-none" />
          </div>
          {!isReadOnly && (
            <>
              <label className={cn("bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] font-black uppercase text-text-main cursor-pointer hover:border-brand-500/50 transition-all flex items-center gap-2", importing && "opacity-60 pointer-events-none")}>
                {importing ? <Loader2 size={14} className="animate-spin" /> : <FileUp size={14} />} Importar Excel
                <input type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" disabled={importing} />
              </label>
              <button onClick={handleSave} disabled={saving}
                className="bg-brand-500 text-black px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-60 flex items-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Guardar
              </button>
            </>
          )}
        </div>
      </div>

      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-bg-accent/40 border-b border-border-dim text-[9px] font-black uppercase text-text-dim tracking-wider">
                  <th className="px-4 py-3" rowSpan={2}>Concepto</th>
                  <th className="px-4 py-2 text-center border-l border-border-dim" colSpan={3}>Proyectado</th>
                  <th className="px-4 py-2 text-center border-l border-border-dim" colSpan={3}>Real</th>
                  <th className="px-4 py-3 text-center border-l border-border-dim" rowSpan={2}>Var. %</th>
                </tr>
                <tr className="bg-bg-accent/40 border-b border-border-dim text-[8px] font-black uppercase text-text-dim tracking-wider">
                  <th className="px-3 py-1.5 text-right border-l border-border-dim">$</th>
                  <th className="px-3 py-1.5 text-right">USD</th>
                  <th className="px-3 py-1.5 text-right">%</th>
                  <th className="px-3 py-1.5 text-right border-l border-border-dim">$</th>
                  <th className="px-3 py-1.5 text-right">USD</th>
                  <th className="px-3 py-1.5 text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {PL_STRUCTURE.map(def => {
                  if (def.type === 'header') {
                    return (
                      <tr key={def.key} className="bg-bg-accent/20 border-b border-border-dim/40">
                        <td colSpan={8} className="px-4 py-2 text-[10px] font-black uppercase text-brand-500 tracking-widest">{def.label}</td>
                      </tr>
                    );
                  }
                  const v = computed[def.key] || emptyLine();
                  const projP = v.projPesos, realP = v.realPesos;
                  const projPctV = pct(projP, ventasNetasProj);
                  const realPctV = pct(realP, ventasNetasReal);
                  const varPct = projP !== 0 ? ((realP - projP) / Math.abs(projP)) * 100 : 0;
                  const isSub = def.type === 'subtotal';
                  return (
                    <tr key={def.key} className={cn("border-b border-border-dim/30 text-[11px]",
                      isSub ? "bg-bg-accent/15 font-black" : "font-medium hover:bg-bg-accent/10",
                      def.bold && "bg-brand-500/5")}>
                      <td className={cn("px-4 py-2 text-text-main", def.indent && "pl-8", def.bold ? "font-black uppercase" : isSub ? "font-black uppercase text-[10px]" : "")}>
                        {def.label}
                      </td>
                      <td className={cn("px-3 py-2 text-right font-mono", projP < 0 ? "text-red-400" : "text-text-main")}>{fmtMoney(projP)}</td>
                      <td className={cn("px-3 py-2 text-right font-mono text-text-dim")}>{fmtMoney(v.projUsd, true)}</td>
                      <td className="px-3 py-2 text-right font-mono text-text-dim">{projPctV ? projPctV.toFixed(1) + '%' : '-'}</td>
                      <td className={cn("px-3 py-2 text-right font-mono border-l border-border-dim/30", realP < 0 ? "text-red-400" : "text-text-main")}>{fmtMoney(realP)}</td>
                      <td className={cn("px-3 py-2 text-right font-mono text-text-dim")}>{fmtMoney(v.realUsd, true)}</td>
                      <td className="px-3 py-2 text-right font-mono text-text-dim">{realPctV ? realPctV.toFixed(1) + '%' : '-'}</td>
                      <td className={cn("px-3 py-2 text-right font-mono border-l border-border-dim/30 font-bold",
                        Math.abs(varPct) < 0.05 ? "text-text-dim" : varPct > 0 ? "text-emerald-400" : "text-red-400")}>
                        {projP !== 0 && realP !== 0 ? (varPct > 0 ? '+' : '') + varPct.toFixed(1) + '%' : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-[9px] text-text-dim font-bold uppercase text-center opacity-60">
        Los subtotales y resultados se calculan automáticamente. Importá el Excel y guardá para persistir en el sistema.
      </p>
    </motion.div>
  );
}
