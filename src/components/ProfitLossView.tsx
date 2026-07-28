/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'motion/react';
import { BarChart3, Calendar, FileUp, FileDown, FileSpreadsheet, FileText, Loader2, Save } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { cn } from '@/src/lib/utils';
import { Branch } from '../types';
import { supabase } from '../lib/supabase';
import ProfitLossProjector from './ProfitLossProjector';
import ProfitLossKPIs from './ProfitLossKPIs';
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

/**
 * Celda de dinero editable: muestra el valor con formato ($222.107.261) cuando no
 * está enfocada, y al hacer clic muestra el número crudo para editar cómodamente.
 */
function EditableMoneyCell({ value, onChange }: { value: number; onChange: (raw: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  if (editing) {
    return (
      <input
        type="number"
        autoFocus
        value={draft}
        onChange={(e) => { setDraft(e.target.value); onChange(e.target.value); }}
        onBlur={() => setEditing(false)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
        placeholder="0"
        className="w-28 bg-transparent border border-brand-500 rounded px-1 py-0.5 text-right font-mono text-[11px] text-text-main outline-none"
      />
    );
  }
  return (
    <span
      onClick={() => { setDraft(value ? String(value) : ''); setEditing(true); }}
      className="cursor-text hover:bg-brand-500/10 rounded px-1 py-0.5 transition-colors inline-block min-w-[60px]"
      title="Clic para editar"
    >
      {fmtMoney(value)}
    </span>
  );
}

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
  const [tab, setTab] = useState<'statement' | 'project' | 'kpis' | 'yearly'>('statement');
  // Datos por mes del año en curso (para la vista comparativa)
  const [yearlyData, setYearlyData] = useState<Record<string, LinesMap>>({});
  const [yearlyLoading, setYearlyLoading] = useState(false);

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

  // Carga todos los meses del año en curso (mismo scope) para la vista comparativa
  const loadYearly = async () => {
    setYearlyLoading(true);
    try {
      const year = selectedMonth.slice(0, 4);
      const { data } = await supabase.from('income_statements').select('*')
        .eq('scope', scope)
        .gte('month', `${year}-01`)
        .lte('month', `${year}-12`);
      const byMonth: Record<string, LinesMap> = {};
      (data || []).forEach((rec: any) => {
        const arr = typeof rec.lines === 'string' ? JSON.parse(rec.lines) : rec.lines;
        const map: LinesMap = {};
        (arr || []).forEach((l: any) => { map[l.key] = { projPesos: l.projPesos || 0, projUsd: l.projUsd || 0, realPesos: l.realPesos || 0, realUsd: l.realUsd || 0 }; });
        byMonth[rec.month] = map;
      });
      setYearlyData(byMonth);
    } catch (e) { console.error('Error cargando año:', e); setYearlyData({}); }
    setYearlyLoading(false);
  };

  useEffect(() => { if (tab === 'yearly') loadYearly(); }, [tab, scope, selectedMonth]);

  // Computa inputs + subtotales para un mapa de líneas dado (reutilizable por mes)
  const computeFromLines = (srcLines: LinesMap): LinesMap => {
    const get = (k: string): LineValues => srcLines[k] || emptyLine();
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
  };

  const computed = useMemo(() => computeFromLines(lines), [lines]);

  const ventasNetasProj = computed['ventas_netas']?.projPesos || 0;
  const ventasNetasReal = computed['ventas_netas']?.realPesos || 0;
  const pct = (val: number, base: number) => base !== 0 ? (val / base) * 100 : 0;

  // Descarga una planilla modelo (mismo formato que espera el importador) para completar y subir.
  const descargarPlantilla = () => {
    const header = ['Concepto', 'Proyectado $', 'Proyectado USD', '', 'Real $', 'Real USD'];
    const aoa: any[][] = [header];
    PL_STRUCTURE.forEach(d => {
      // Encabezados y subtotales se muestran como referencia (se recalculan solos al importar).
      const esCalculado = d.type !== 'input';
      aoa.push([
        d.label,
        esCalculado ? '(se calcula)' : '',
        '', '',
        esCalculado ? '(se calcula)' : '',
        '',
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 42 }, { wch: 14 }, { wch: 14 }, { wch: 3 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'EERR');
    XLSX.writeFile(wb, `plantilla_EERR_${selectedMonth}.xlsx`);
  };

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
          // Si Excel ya lo entrega como número, usarlo tal cual (no tocar decimales)
          if (typeof v === 'number') return isNaN(v) ? 0 : v;
          let str = String(v).trim().replace(/US\$|\$|\s/g, '');
          const neg = str.includes('-') || /^\(.*\)$/.test(str);
          str = str.replace(/[()%]/g, '');
          const hasComma = str.includes(',');
          const hasDot = str.includes('.');
          if (hasComma && hasDot) {
            // el separador que aparece más a la derecha es el decimal
            if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
              str = str.replace(/\./g, '').replace(',', '.'); // argentino 1.234,56
            } else {
              str = str.replace(/,/g, ''); // US 1,234.56
            }
          } else if (hasComma) {
            const parts = str.split(',');
            if (parts.length > 1 && parts[parts.length - 1].length === 3) {
              str = str.replace(/,/g, ''); // miles
            } else {
              str = str.replace(',', '.'); // decimal
            }
          } else if (hasDot) {
            const parts = str.split('.');
            const lastLen = parts[parts.length - 1].length;
            if (parts.length > 2 || lastLen === 3) {
              str = str.replace(/\./g, ''); // miles
            }
          }
          str = str.replace(/[^0-9.]/g, '');
          let n = parseFloat(str);
          if (isNaN(n)) return 0;
          if (neg) n = -Math.abs(n);
          return n;
        };
        // Keys que son subtotales (se recalculan, no se importan directo)
        const subtotalKeys = new Set(PL_STRUCTURE.filter(d => d.type === 'subtotal').map(d => d.key));
        let otrosIngresosHeaderSeen = false;
        rows.forEach(row => {
          if (!row || !row[0]) return;
          const norm = normalizeLabel(String(row[0]));
          let key = LABEL_TO_KEY[norm];
          // "Otros Ingresos" aparece 2 veces: 1ra = subtotal (header), 2da = línea interna
          if (norm === 'otros ingresos') {
            if (!otrosIngresosHeaderSeen) { otrosIngresosHeaderSeen = true; return; } // 1ra: subtotal, ignorar
            key = 'otros_ingresos_2'; // 2da: línea interna
          }
          if (!key) return;
          // No importar subtotales: se recalculan a partir de las líneas input
          if (subtotalKeys.has(key)) return;
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
          // Guardar automáticamente lo importado para que no se pierda al refrescar
          persistLines(newLines);
          alert(`Se importaron ${Object.keys(newLines).length} líneas y se guardaron en el sistema.`);
        }
      } catch (err: any) {
        alert('Error al leer el Excel: ' + (err?.message || ''));
      }
      setImporting(false);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  // Persiste un set de líneas en Supabase (usado por guardar manual e import automático)
  const persistLines = async (linesToSave: LinesMap, silent = false): Promise<boolean> => {
    try {
      const arr = PL_STRUCTURE.filter(d => d.type === 'input').map(d => ({
        key: d.key,
        projPesos: linesToSave[d.key]?.projPesos || 0, projUsd: linesToSave[d.key]?.projUsd || 0,
        realPesos: linesToSave[d.key]?.realPesos || 0, realUsd: linesToSave[d.key]?.realUsd || 0
      }));
      const { error } = await supabase.from('income_statements').upsert({
        month: selectedMonth, scope, lines: arr, updated_at: new Date().toISOString()
      }, { onConflict: 'month,scope' });
      if (error) throw error;
      return true;
    } catch (err: any) {
      alert('Error al guardar: ' + (err?.message || ''));
      return false;
    }
  };

  // Editar manualmente una línea input (proyectado o real)
  const updateLine = (key: string, field: 'projPesos' | 'projUsd' | 'realPesos' | 'realUsd', value: string) => {
    if (isReadOnly) return;
    const num = value === '' || value === '-' ? 0 : Number(value);
    setLines(prev => {
      const cur = prev[key] || { projPesos: 0, projUsd: 0, realPesos: 0, realUsd: 0 };
      return { ...prev, [key]: { ...cur, [field]: isNaN(num) ? 0 : num } };
    });
  };

  const handleSave = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    setSaving(true);
    const ok = await persistLines(lines);
    if (ok) alert('Estado de Resultados guardado correctamente.');
    setSaving(false);
  };

  // ───────────── Exportaciones (Estado de Resultados y Meses del Año) ─────────────
  const MES_ABBR = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const scopeNameExp = scope === 'consolidated' ? 'Consolidado (Todas)' : (branches.find(b => b.id === scope)?.name || scope);
  const nMoney = (n: number) => (n === 0 ? 0 : Math.round(n));
  const money = (n: number) => (n === 0 ? '-' : (n < 0 ? '-' : '') + '$' + Math.abs(Math.round(n)).toLocaleString('es-AR'));

  // Filas del Estado de Resultados: [Concepto, Proy $, Proy USD, Proy %, Real $, Real USD, Real %, Var %]
  const buildStatementRows = () => {
    const rows: { label: string; isHeader: boolean; vals: (string | number)[] }[] = [];
    PL_STRUCTURE.forEach(def => {
      if (def.type === 'header') { rows.push({ label: def.label, isHeader: true, vals: [] }); return; }
      const v = computed[def.key] || emptyLine();
      const projPctV = pct(v.projPesos, ventasNetasProj);
      const realPctV = pct(v.realPesos, ventasNetasReal);
      const varPct = v.projPesos !== 0 && v.realPesos !== 0 ? ((v.realPesos - v.projPesos) / Math.abs(v.projPesos)) * 100 : null;
      rows.push({
        label: (def.indent ? '   ' : '') + def.label, isHeader: false,
        vals: [
          nMoney(v.projPesos), nMoney(v.projUsd), projPctV ? projPctV.toFixed(1) + '%' : '-',
          nMoney(v.realPesos), nMoney(v.realUsd), realPctV ? realPctV.toFixed(1) + '%' : '-',
          varPct !== null ? (varPct > 0 ? '+' : '') + varPct.toFixed(1) + '%' : '-',
        ],
      });
    });
    return rows;
  };

  const exportStatementExcel = () => {
    const header = ['Concepto', 'Proyectado $', 'Proyectado USD', 'Proy. % s/Ventas', 'Real $', 'Real USD', 'Real % s/Ventas', 'Variación %'];
    const aoa: any[][] = [
      [`Estado de Resultados · ${scopeNameExp} · ${selectedMonth}`],
      [], header,
    ];
    buildStatementRows().forEach(r => aoa.push(r.isHeader ? [r.label] : [r.label.trim(), ...r.vals]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 40 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'EERR');
    XLSX.writeFile(wb, `EERR_${scopeNameExp.replace(/\s+/g, '_')}_${selectedMonth}.xlsx`);
  };

  const exportStatementPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(13); doc.text('Estado de Resultados', 14, 14);
    doc.setFontSize(9); doc.text(`${scopeNameExp} · ${selectedMonth}`, 14, 20);
    const body = buildStatementRows().map(r => r.isHeader
      ? [{ content: r.label, colSpan: 8, styles: { fontStyle: 'bold', fillColor: [245, 230, 230], textColor: [193, 18, 31] } as any }]
      : [r.label.trim(), ...r.vals.map(v => typeof v === 'number' ? money(v) : v)]);
    autoTable(doc, {
      head: [['Concepto', 'Proy. $', 'Proy. USD', 'Proy. %', 'Real $', 'Real USD', 'Real %', 'Var. %']],
      body: body as any, startY: 25, styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [193, 18, 31], fontSize: 7 },
      columnStyles: { 0: { cellWidth: 60 }, 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' }, 7: { halign: 'right' } },
    });
    doc.save(`EERR_${scopeNameExp.replace(/\s+/g, '_')}_${selectedMonth}.pdf`);
  };

  // Filas de Meses del Año (Real): [Concepto, ...meses, Acumulado]
  const buildYearlyData = () => {
    const monthsLoaded = Object.keys(yearlyData).sort();
    const computedByMonth: Record<string, LinesMap> = {};
    monthsLoaded.forEach(m => { computedByMonth[m] = computeFromLines(yearlyData[m]); });
    const cols = ['Concepto', ...monthsLoaded.map(m => MES_ABBR[parseInt(m.slice(5, 7)) - 1]), 'Acumulado'];
    const rows: { label: string; isHeader: boolean; vals: number[] }[] = [];
    PL_STRUCTURE.forEach(def => {
      if (def.type === 'header') { rows.push({ label: def.label, isHeader: true, vals: [] }); return; }
      const monthVals = monthsLoaded.map(m => computedByMonth[m][def.key]?.realPesos || 0);
      const acc = monthVals.reduce((s, n) => s + n, 0);
      rows.push({ label: (def.indent ? '   ' : '') + def.label, isHeader: false, vals: [...monthVals, acc] });
    });
    return { cols, rows, monthsLoaded };
  };

  const exportYearlyExcel = () => {
    const { cols, rows } = buildYearlyData();
    const aoa: any[][] = [[`Estado de Resultados por mes (Real) · ${scopeNameExp} · Año ${selectedMonth.slice(0, 4)}`], [], cols];
    rows.forEach(r => aoa.push(r.isHeader ? [r.label] : [r.label.trim(), ...r.vals.map(nMoney)]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 40 }, ...cols.slice(1).map(() => ({ wch: 16 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Meses');
    XLSX.writeFile(wb, `EERR_meses_${scopeNameExp.replace(/\s+/g, '_')}_${selectedMonth.slice(0, 4)}.xlsx`);
  };

  const exportYearlyPDF = () => {
    const { cols, rows } = buildYearlyData();
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(13); doc.text('Estado de Resultados por mes (Real)', 14, 14);
    doc.setFontSize(9); doc.text(`${scopeNameExp} · Año ${selectedMonth.slice(0, 4)}`, 14, 20);
    const body = rows.map(r => r.isHeader
      ? [{ content: r.label, colSpan: cols.length, styles: { fontStyle: 'bold', fillColor: [245, 230, 230], textColor: [193, 18, 31] } as any }]
      : [r.label.trim(), ...r.vals.map(money)]);
    autoTable(doc, {
      head: [cols], body: body as any, startY: 25, styles: { fontSize: 7, cellPadding: 1.5 },
      headStyles: { fillColor: [193, 18, 31], fontSize: 7 },
      columnStyles: { 0: { cellWidth: 48 } },
    });
    doc.save(`EERR_meses_${scopeNameExp.replace(/\s+/g, '_')}_${selectedMonth.slice(0, 4)}.pdf`);
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
              <button onClick={descargarPlantilla}
                className="bg-bg-accent border border-border-dim rounded px-3 py-2 text-[10px] font-black uppercase text-text-main hover:border-brand-500/50 transition-all flex items-center gap-2">
                <FileDown size={14} /> Plantilla
              </button>
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
          {(tab === 'statement' || tab === 'yearly') && (
            <>
              <button onClick={tab === 'yearly' ? exportYearlyExcel : exportStatementExcel}
                className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 rounded px-3 py-2 text-[10px] font-black uppercase hover:bg-emerald-500/20 transition-all flex items-center gap-2">
                <FileSpreadsheet size={14} /> Excel
              </button>
              <button onClick={tab === 'yearly' ? exportYearlyPDF : exportStatementPDF}
                className="bg-red-500/10 border border-red-500/30 text-red-600 rounded px-3 py-2 text-[10px] font-black uppercase hover:bg-red-500/20 transition-all flex items-center gap-2">
                <FileText size={14} /> PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex gap-2">
        <button onClick={() => setTab('statement')}
          className={cn("px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest border transition-all",
            tab === 'statement' ? "bg-brand-500 text-black border-brand-500" : "bg-bg-accent text-text-dim border-border-dim hover:text-text-main")}>
          Estado de Resultados
        </button>
        {scope === 'consolidated' && (
          <button onClick={() => setTab('project')}
            className={cn("px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest border transition-all",
              tab === 'project' ? "bg-brand-500 text-black border-brand-500" : "bg-bg-accent text-text-dim border-border-dim hover:text-text-main")}>
            Proyectar
          </button>
        )}
        <button onClick={() => setTab('kpis')}
          className={cn("px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest border transition-all",
            tab === 'kpis' ? "bg-brand-500 text-black border-brand-500" : "bg-bg-accent text-text-dim border-border-dim hover:text-text-main")}>
          KPIs
        </button>
        <button onClick={() => setTab('yearly')}
          className={cn("px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest border transition-all",
            tab === 'yearly' ? "bg-brand-500 text-black border-brand-500" : "bg-bg-accent text-text-dim border-border-dim hover:text-text-main")}>
          Meses del Año
        </button>
      </div>

      {tab === 'kpis' ? (
        <ProfitLossKPIs scope={scope} selectedMonth={selectedMonth} />
      ) : tab === 'project' && scope === 'consolidated' ? (
        <ProfitLossProjector scope={scope} targetMonth={selectedMonth} isReadOnly={isReadOnly} onProjectionGenerated={fetchData} />
      ) : tab === 'yearly' ? (
        <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
          {yearlyLoading ? (
            <div className="py-20 flex justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>
          ) : (() => {
            const monthsLoaded = Object.keys(yearlyData).sort();
            if (monthsLoaded.length === 0) {
              return <div className="py-16 text-center text-text-dim text-[11px] font-black uppercase">No hay datos cargados para el año {selectedMonth.slice(0,4)}</div>;
            }
            const MES_ABBR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
            const computedByMonth: Record<string, LinesMap> = {};
            monthsLoaded.forEach(m => { computedByMonth[m] = computeFromLines(yearlyData[m]); });
            const fmtCell = (n: number) => n === 0 ? '-' : '$' + Math.round(n).toLocaleString('es-AR');
            return (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead>
                    <tr className="bg-bg-accent/40 border-b border-border-dim">
                      <th className="px-4 py-3 text-[10px] font-black uppercase text-text-dim tracking-widest sticky left-0 bg-bg-accent/40">Concepto (Real)</th>
                      {monthsLoaded.map(m => (
                        <th key={m} className="px-4 py-3 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">
                          {MES_ABBR[parseInt(m.slice(5,7)) - 1]}
                        </th>
                      ))}
                      <th className="px-4 py-3 text-[10px] font-black uppercase text-brand-500 tracking-widest text-right border-l-2 border-brand-500/40 bg-brand-500/5">
                        Acumulado
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {PL_STRUCTURE.map(def => {
                      if (def.type === 'header') {
                        return (
                          <tr key={def.key} className="bg-brand-500/5">
                            <td colSpan={monthsLoaded.length + 2} className="px-4 py-2 text-[10px] font-black uppercase text-brand-500 tracking-widest">{def.label}</td>
                          </tr>
                        );
                      }
                      const isSub = def.type === 'subtotal';
                      return (
                        <tr key={def.key} className={cn("border-b border-border-dim/30", isSub && "bg-bg-accent/20 font-black")}>
                          <td className={cn("px-4 py-2 text-[11px] sticky left-0 bg-bg-sidebar", isSub ? "font-black text-text-main uppercase" : "text-text-dim")} style={{ paddingLeft: `${16 + (def.indent || 0) * 16}px` }}>
                            {def.label}
                          </td>
                          {monthsLoaded.map(m => {
                            const val = computedByMonth[m][def.key]?.realPesos || 0;
                            return (
                              <td key={m} className={cn("px-4 py-2 text-right font-mono text-[11px]", val < 0 ? "text-red-400" : isSub ? "text-text-main" : "text-text-dim")}>
                                {fmtCell(val)}
                              </td>
                            );
                          })}
                          {(() => {
                            const acc = monthsLoaded.reduce((s, m) => s + (computedByMonth[m][def.key]?.realPesos || 0), 0);
                            return (
                              <td className={cn("px-4 py-2 text-right font-mono text-[11px] font-black border-l-2 border-brand-500/40 bg-brand-500/5",
                                acc < 0 ? "text-red-400" : "text-text-main")}>
                                {fmtCell(acc)}
                              </td>
                            );
                          })()}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      ) : (
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        {loading ? (
          <div className="py-20 flex justify-center"><Loader2 size={28} className="animate-spin text-brand-500" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-bg-accent/40 border-b border-border-dim text-[9px] font-black uppercase text-text-dim tracking-wider">
                  <th className="px-4 py-3" rowSpan={2}>Concepto</th>
                  <th className="px-4 py-2 text-center border-l border-border-dim bg-bg-accent/30 text-text-dim" colSpan={3}>Proyectado</th>
                  <th className="px-4 py-2 text-center border-l-2 border-brand-500/40 text-brand-500" colSpan={3}>Real</th>
                  <th className="px-4 py-3 text-center border-l border-border-dim" rowSpan={2}>Var. %</th>
                </tr>
                <tr className="bg-bg-accent/40 border-b border-border-dim text-[8px] font-black uppercase text-text-dim tracking-wider">
                  <th className="px-3 py-1.5 text-right border-l border-border-dim bg-bg-accent/30">$</th>
                  <th className="px-3 py-1.5 text-right bg-bg-accent/30">USD</th>
                  <th className="px-3 py-1.5 text-right bg-bg-accent/30">%</th>
                  <th className="px-3 py-1.5 text-right border-l-2 border-brand-500/40">$</th>
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
                      <td className={cn("px-3 py-2 text-right font-mono bg-bg-accent/20", projP < 0 ? "text-red-400" : "text-text-main")}>
                        {def.type === 'input' && !isReadOnly ? (
                          <EditableMoneyCell value={lines[def.key]?.projPesos || 0} onChange={(raw) => updateLine(def.key, 'projPesos', raw)} />
                        ) : fmtMoney(projP)}
                      </td>
                      <td className={cn("px-3 py-2 text-right font-mono text-text-dim bg-bg-accent/20")}>{fmtMoney(v.projUsd, true)}</td>
                      <td className="px-3 py-2 text-right font-mono text-text-dim bg-bg-accent/20">{projPctV ? projPctV.toFixed(1) + '%' : '-'}</td>
                      <td className={cn("px-3 py-2 text-right font-mono border-l-2 border-brand-500/40", realP < 0 ? "text-red-400" : "text-text-main")}>
                        {def.type === 'input' && !isReadOnly ? (
                          <EditableMoneyCell value={lines[def.key]?.realPesos || 0} onChange={(raw) => updateLine(def.key, 'realPesos', raw)} />
                        ) : fmtMoney(realP)}
                      </td>
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
      )}
      {tab === 'statement' && (
      <p className="text-[9px] text-text-dim font-bold uppercase text-center opacity-60">
        Podés editar manualmente cada renglón del PROYECTADO y del REAL (o cargar el Real importando el Excel). Los subtotales se recalculan solos. Acordate de tocar GUARDAR para persistir los cambios.
      </p>
      )}
    </motion.div>
  );
}
