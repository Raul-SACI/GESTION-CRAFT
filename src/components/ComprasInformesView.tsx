/**
 * SPDX-License-Identifier: Apache-2.0
 * COMPRAS & STOCK · Informes de Compras
 * -----------------------------------------------------------------------------
 * Importa los dos reportes de TANGO (Ranking por artículo y Ranking de
 * proveedores), guarda la serie mes a mes y permite:
 *   - Resumen del período (KPIs, top artículos, top proveedores, riesgo).
 *   - Evolución mensual del gasto y del precio unitario por artículo.
 *   - Cotizaciones del top de artículos por gasto: precio actual (automático =
 *     total/cantidad de Tango) vs cotizaciones de la competencia, con el ahorro
 *     potencial del mes.
 * Los códigos coinciden con stock_items.code (Maestro de Insumos), así que la
 * reconciliación es automática.
 */
import { useState, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  ShoppingCart, Upload, Loader2, TrendingUp, TrendingDown, AlertTriangle,
  Trash2, Plus, CheckCircle2, Package, Percent, Building2, DollarSign, RefreshCw
} from 'lucide-react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Cell
} from 'recharts';
import * as XLSX from 'xlsx';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';

type Quote = { proveedor: string; precio: number };
type ArtRow = { code: string; description: string; cantidad: number; total: number; pct_participacion: number; pct_acumulado: number };
type ProvRow = { razon_social: string; total_neto: number; total: number; pct_participacion: number; pct_acumulado: number };
type CotizRow = { code: string; description: string; precio_actual: number; quotes: Quote[]; revisado_por: string };

const BRAND = '#ED1C24';
const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-AR');
const fmt2 = (n: number) => '$' + (n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const norm = (v: any) => String(v ?? '').trim();
const toNum = (v: any): number => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/[^0-9.,-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

// Mes 'YYYY-MM' -> etiqueta 'Ago 2026'
const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const periodLabel = (p: string) => {
  const [y, m] = p.split('-');
  return `${MES[(parseInt(m, 10) || 1) - 1]} ${y}`;
};

export default function ComprasInformesView({ isReadOnly = false }: { isReadOnly?: boolean }) {
  const [tab, setTab] = useState<'resumen' | 'evolucion' | 'cotizaciones' | 'importar'>('resumen');
  const [periods, setPeriods] = useState<string[]>([]);
  const [period, setPeriod] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(false);

  const [arts, setArts] = useState<ArtRow[]>([]);
  const [provs, setProvs] = useState<ProvRow[]>([]);
  const [cotiz, setCotiz] = useState<CotizRow[]>([]);
  const [stockCodes, setStockCodes] = useState<Set<string>>(new Set());
  const [stockNames, setStockNames] = useState<Map<string, string>>(new Map());

  // Serie completa (para evolución): total por período y precio unitario por código
  const [serie, setSerie] = useState<{ period: string; total: number; byCode: Record<string, { cantidad: number; total: number }> }[]>([]);
  const [inflMap, setInflMap] = useState<Record<string, number>>({}); // mes 'YYYY-MM' -> % mensual (EERR)
  const [menuHist, setMenuHist] = useState<any[]>([]);                 // menu_price_history
  const [menuItems, setMenuItems] = useState<any[]>([]);               // menu_items (precio actual)
  const [selCodes, setSelCodes] = useState<Set<string> | null>(null);  // artículos elegidos en Evolución
  const [evoSearch, setEvoSearch] = useState('');
  const [showInflDetail, setShowInflDetail] = useState(false);

  // ── Carga de períodos disponibles ──────────────────────────────────────────
  const loadPeriods = useCallback(async () => {
    const { data } = await supabase.from('compras_articulos_import').select('period');
    const uniq = Array.from(new Set((data as any[] || []).map(r => r.period))).sort().reverse();
    setPeriods(uniq);
    if (uniq.length && !uniq.includes(period)) setPeriod(uniq[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { loadPeriods(); }, [loadPeriods]);

  // ── Carga del período seleccionado ─────────────────────────────────────────
  const loadPeriod = useCallback(async () => {
    if (!period) return;
    setLoading(true);
    try {
      const [{ data: a }, { data: p }, { data: c }, { data: st }] = await Promise.all([
        supabase.from('compras_articulos_import').select('*').eq('period', period).order('total', { ascending: false }),
        supabase.from('compras_proveedores_import').select('*').eq('period', period).order('total', { ascending: false }),
        supabase.from('compras_cotizaciones').select('*').eq('period', period),
        supabase.from('stock_items').select('code, name'),
      ]);
      setArts((a as ArtRow[]) || []);
      setProvs((p as ProvRow[]) || []);
      setCotiz(((c as any[]) || []).map(r => ({ code: r.code, description: r.description, precio_actual: r.precio_actual, quotes: r.quotes || [], revisado_por: r.revisado_por || '' })));
      const codes = new Set<string>();
      const names = new Map<string, string>();
      (st as any[] || []).forEach(s => { const k = norm(s.code); if (k) { codes.add(k); names.set(k, s.name); } });
      setStockCodes(codes);
      setStockNames(names);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { loadPeriod(); }, [loadPeriod]);

  // ── Serie histórica (evolución) ────────────────────────────────────────────
  const loadSerie = useCallback(async () => {
    const [{ data }, { data: infl }, { data: mh }, { data: mi }] = await Promise.all([
      supabase.from('compras_articulos_import').select('period, code, cantidad, total'),
      supabase.from('monthly_inflation').select('month, inflation_pct'),
      supabase.from('menu_price_history').select('menu_item_id, old_price, new_price, change_date'),
      supabase.from('menu_items').select('id, price, menu_type'),
    ]);
    const byPeriod: Record<string, { period: string; total: number; byCode: Record<string, { cantidad: number; total: number }> }> = {};
    (data as any[] || []).forEach(r => {
      const pr = r.period;
      if (!byPeriod[pr]) byPeriod[pr] = { period: pr, total: 0, byCode: {} };
      byPeriod[pr].total += toNum(r.total);
      byPeriod[pr].byCode[norm(r.code)] = { cantidad: toNum(r.cantidad), total: toNum(r.total) };
    });
    setSerie(Object.values(byPeriod).sort((x, y) => x.period.localeCompare(y.period)));
    const im: Record<string, number> = {};
    (infl as any[] || []).forEach(r => { im[r.month] = Number(r.inflation_pct) || 0; });
    setInflMap(im);
    setMenuHist((mh as any[]) || []);
    setMenuItems((mi as any[]) || []);
  }, []);

  useEffect(() => { if (tab === 'evolucion') loadSerie(); }, [tab, loadSerie, periods]);

  // ── Reconciliación con el Maestro de Insumos ───────────────────────────────
  const recon = useMemo(() => {
    let linked = 0; const unmatched: ArtRow[] = [];
    arts.forEach(a => { if (stockCodes.has(norm(a.code))) linked++; else unmatched.push(a); });
    return { linked, unmatched };
  }, [arts, stockCodes]);

  // ── KPIs del período ───────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalGasto = arts.reduce((s, a) => s + toNum(a.total), 0);
    const nProv = provs.length;
    const top5prov = provs.slice(0, 5).reduce((s, p) => s + toNum(p.pct_participacion), 0);
    const top1prov = provs[0];
    return { totalGasto, nArt: arts.length, nProv, top5prov, top1prov };
  }, [arts, provs]);

  // ── IMPORTACIÓN ────────────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  const [impPeriod, setImpPeriod] = useState(period);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  useEffect(() => { setImpPeriod(period); }, [period]);

  const readSheet = (file: File): Promise<any[][]> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target?.result, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        resolve(XLSX.utils.sheet_to_json(ws, { header: 1, raw: true }) as any[][]);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });

  // Localiza la fila de encabezado buscando palabras clave, devuelve índices de columnas
  const findCols = (rows: any[][], want: Record<string, string[]>) => {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = (rows[i] || []).map(c => norm(c).toLowerCase());
      const idx: Record<string, number> = {};
      let hits = 0;
      for (const key in want) {
        const j = row.findIndex(c => want[key].some(w => c.includes(w)));
        if (j >= 0) { idx[key] = j; hits++; }
      }
      if (hits >= Math.ceil(Object.keys(want).length * 0.6)) return { headerRow: i, idx };
    }
    return null;
  };

  const importArticulos = async (file: File) => {
    if (isReadOnly) { alert('Tu rol es de SOLO LECTURA.'); return; }
    if (!impPeriod) { setMsg({ kind: 'err', text: 'Elegí el mes del reporte antes de importar.' }); return; }
    if (!window.confirm(`¿Subir el RANKING DE ARTÍCULOS para ${periodLabel(impPeriod)}?\n\nArchivo: ${file.name}\nSi ese mes ya tenía datos, se reemplazan.`)) return;
    setBusy(true); setMsg(null);
    try {
      const rows = await readSheet(file);
      const found = findCols(rows, {
        code: ['cód', 'cod', 'artículo', 'articulo'], description: ['descrip'],
        cantidad: ['cantidad'], total: ['total'],
        pct_participacion: ['participación', 'participacion'], pct_acumulado: ['acumulado'],
      });
      if (!found) throw new Error('No reconocí las columnas del "Ranking por artículo". Verificá que sea ese reporte de Tango.');
      const { headerRow, idx } = found;
      const parsed: any[] = [];
      for (let i = headerRow + 1; i < rows.length; i++) {
        const r = rows[i]; if (!r) continue;
        const code = norm(r[idx.code]);
        const desc = norm(r[idx.description]);
        if (!code && !desc) continue;
        if (!code) continue; // filas de total/subtotal sin código
        parsed.push({
          period: impPeriod, code, description: desc,
          cantidad: toNum(r[idx.cantidad]), total: toNum(r[idx.total]),
          pct_participacion: toNum(r[idx.pct_participacion]), pct_acumulado: toNum(r[idx.pct_acumulado]),
        });
      }
      if (!parsed.length) throw new Error('No encontré filas de datos en el archivo.');
      // Reemplaza el período: borra e inserta
      await supabase.from('compras_articulos_import').delete().eq('period', impPeriod);
      const CHUNK = 500;
      for (let i = 0; i < parsed.length; i += CHUNK) {
        const { error } = await supabase.from('compras_articulos_import').insert(parsed.slice(i, i + CHUNK));
        if (error) throw error;
      }
      // Refresca precio_actual de las cotizaciones existentes de ese período
      await refreshCotizPrecios(impPeriod, parsed);
      setMsg({ kind: 'ok', text: `Ranking de artículos importado: ${parsed.length} filas para ${periodLabel(impPeriod)}.` });
      await loadPeriods();
      setPeriod(impPeriod);
      await loadPeriod();
    } catch (e: any) {
      setMsg({ kind: 'err', text: 'Error al importar artículos: ' + (e.message || e) });
    } finally {
      setBusy(false);
    }
  };

  const importProveedores = async (file: File) => {
    if (isReadOnly) { alert('Tu rol es de SOLO LECTURA.'); return; }
    if (!impPeriod) { setMsg({ kind: 'err', text: 'Elegí el mes del reporte antes de importar.' }); return; }
    if (!window.confirm(`¿Subir el RANKING DE PROVEEDORES para ${periodLabel(impPeriod)}?\n\nArchivo: ${file.name}\nSi ese mes ya tenía datos, se reemplazan.`)) return;
    setBusy(true); setMsg(null);
    try {
      const rows = await readSheet(file);
      const found = findCols(rows, {
        razon_social: ['razón', 'razon', 'proveedor', 'social'],
        total_neto: ['neto'], total: ['total'],
        pct_participacion: ['participación', 'participacion'], pct_acumulado: ['acumulado'],
      });
      if (!found) throw new Error('No reconocí las columnas del "Ranking de proveedores". Verificá que sea ese reporte de Tango.');
      const { headerRow, idx } = found;
      const parsed: any[] = [];
      const seen = new Set<string>();
      for (let i = headerRow + 1; i < rows.length; i++) {
        const r = rows[i]; if (!r) continue;
        const rs = norm(r[idx.razon_social]);
        if (!rs) continue;
        if (seen.has(rs.toLowerCase())) continue; seen.add(rs.toLowerCase());
        parsed.push({
          period: impPeriod, razon_social: rs,
          total_neto: idx.total_neto != null ? toNum(r[idx.total_neto]) : null,
          total: toNum(r[idx.total]),
          pct_participacion: toNum(r[idx.pct_participacion]), pct_acumulado: toNum(r[idx.pct_acumulado]),
        });
      }
      if (!parsed.length) throw new Error('No encontré filas de datos en el archivo.');
      await supabase.from('compras_proveedores_import').delete().eq('period', impPeriod);
      const { error } = await supabase.from('compras_proveedores_import').insert(parsed);
      if (error) throw error;
      setMsg({ kind: 'ok', text: `Ranking de proveedores importado: ${parsed.length} filas para ${periodLabel(impPeriod)}.` });
      await loadPeriods();
      setPeriod(impPeriod);
      await loadPeriod();
    } catch (e: any) {
      setMsg({ kind: 'err', text: 'Error al importar proveedores: ' + (e.message || e) });
    } finally {
      setBusy(false);
    }
  };

  // Actualiza el precio_actual (=total/cantidad) de las cotizaciones ya cargadas
  const refreshCotizPrecios = async (per: string, parsedArts: any[]) => {
    const { data } = await supabase.from('compras_cotizaciones').select('id, code').eq('period', per);
    const rows = (data as any[]) || [];
    if (!rows.length) return;
    const byCode: Record<string, number> = {};
    parsedArts.forEach(a => { byCode[a.code] = a.cantidad > 0 ? a.total / a.cantidad : 0; });
    for (const r of rows) {
      const precio = byCode[norm(r.code)];
      if (precio != null) await supabase.from('compras_cotizaciones').update({ precio_actual: precio, updated_at: new Date().toISOString() }).eq('id', r.id);
    }
  };

  const borrarPeriodo = async () => {
    if (isReadOnly) return;
    if (!window.confirm(`¿Borrar TODA la importación de ${periodLabel(period)} (artículos, proveedores y cotizaciones)?`)) return;
    setBusy(true);
    try {
      await Promise.all([
        supabase.from('compras_articulos_import').delete().eq('period', period),
        supabase.from('compras_proveedores_import').delete().eq('period', period),
        supabase.from('compras_cotizaciones').delete().eq('period', period),
      ]);
      await loadPeriods();
      await loadPeriod();
      setMsg({ kind: 'ok', text: `Período ${periodLabel(period)} borrado.` });
    } finally { setBusy(false); }
  };

  // ── COTIZACIONES (top N por gasto) ─────────────────────────────────────────
  const [topN, setTopN] = useState(10);
  const artByCode = useMemo(() => {
    const m: Record<string, ArtRow> = {};
    arts.forEach(a => { m[norm(a.code)] = a; });
    return m;
  }, [arts]);

  // Top artículos por gasto que aún están vinculados a un insumo del maestro
  const topArts = useMemo(() => arts.slice(0, topN), [arts, topN]);

  const cotizByCode = useMemo(() => {
    const m: Record<string, CotizRow> = {};
    cotiz.forEach(c => { m[norm(c.code)] = c; });
    return m;
  }, [cotiz]);

  const cotizRows = useMemo(() => topArts.map(a => {
    const code = norm(a.code);
    const c = cotizByCode[code];
    const precioActual = a.cantidad > 0 ? a.total / a.cantidad : 0;
    const quotes: Quote[] = c?.quotes?.length ? c.quotes : [];
    const validos = quotes.filter(q => q.precio > 0);
    const mejor = validos.length ? Math.min(...validos.map(q => q.precio)) : null;
    const mejorProv = mejor != null ? (validos.find(q => q.precio === mejor)?.proveedor || '') : '';
    const ahorroUnit = mejor != null && mejor < precioActual ? precioActual - mejor : 0;
    const ahorroMes = ahorroUnit * a.cantidad;
    return { code, description: a.description, cantidad: a.cantidad, precioActual, quotes, mejor, mejorProv, ahorroUnit, ahorroMes, revisado_por: c?.revisado_por || '' };
  }), [topArts, cotizByCode]);

  const ahorroTotal = useMemo(() => cotizRows.reduce((s, r) => s + r.ahorroMes, 0), [cotizRows]);

  const [savingCode, setSavingCode] = useState<string | null>(null);
  const guardarCotiz = async (code: string, description: string, precioActual: number, quotes: Quote[], revisado_por: string) => {
    if (isReadOnly) return;
    setSavingCode(code);
    try {
      const clean = quotes.filter(q => norm(q.proveedor) || q.precio > 0).map(q => ({ proveedor: norm(q.proveedor), precio: toNum(q.precio) }));
      const { error } = await supabase.from('compras_cotizaciones').upsert({
        period, code, description, precio_actual: precioActual, quotes: clean, revisado_por: norm(revisado_por), updated_at: new Date().toISOString(),
      }, { onConflict: 'period,code' });
      if (error) throw error;
      // refresca en memoria
      setCotiz(prev => {
        const rest = prev.filter(c => norm(c.code) !== code);
        return [...rest, { code, description, precio_actual: precioActual, quotes: clean, revisado_por: norm(revisado_por) }];
      });
    } catch (e: any) {
      alert('Error al guardar cotización: ' + (e.message || e));
    } finally { setSavingCode(null); }
  };

  // Estado local editable de cada fila de cotización
  const [draft, setDraft] = useState<Record<string, { quotes: Quote[]; revisado_por: string }>>({});
  const getDraft = (code: string, base: CotizRow | undefined) => {
    if (draft[code]) return draft[code];
    return { quotes: base?.quotes?.length ? base.quotes : [{ proveedor: '', precio: 0 }], revisado_por: base?.revisado_por || '' };
  };
  const setDraftFor = (code: string, val: { quotes: Quote[]; revisado_por: string }) => setDraft(d => ({ ...d, [code]: val }));

  const hasData = arts.length > 0 || provs.length > 0;

  // ── Datos de gráficas ──────────────────────────────────────────────────────
  const evoData = useMemo(() => serie.map(s => ({ name: periodLabel(s.period), Gasto: Math.round(s.total) })), [serie]);
  const topBar = useMemo(() => arts.slice(0, 12).map(a => ({ name: (a.description || a.code).slice(0, 16), Gasto: Math.round(toNum(a.total)) })), [arts]);

  // Descripción por código (de cualquier período), para etiquetar en Evolución
  const descByCode = useMemo(() => {
    const m: Record<string, string> = {};
    arts.forEach(a => { m[norm(a.code)] = a.description || a.code; });
    return m;
  }, [arts]);

  // Rango de análisis: primer y último período con datos
  const span = useMemo(() => {
    if (serie.length < 2) return null;
    return { first: serie[0].period, last: serie[serie.length - 1].period };
  }, [serie]);

  // Inflación de compras = aumento del PRECIO UNITARIO de cada insumo (primer vs último
  // mes con datos), PONDERADO por la CANTIDAD TOTAL comprada en todo el rango. La cantidad
  // se valoriza a precio base (constante) para poder sumar insumos con distinta unidad
  // (kg, unidades, bandejas). Es puro precio: si baja el volumen de un mes, no lo afecta.
  const comprasInfl = useMemo(() => {
    if (!span) return null;
    const first = serie[0].byCode, last = serie[serie.length - 1].byCode;
    // Cantidad total comprada por código en todo el rango cargado
    const qtyTotal: Record<string, number> = {};
    serie.forEach(s => { for (const c in s.byCode) qtyTotal[c] = (qtyTotal[c] || 0) + s.byCode[c].cantidad; });
    let wsum = 0; const items: { infl: number; w: number }[] = [];
    for (const code in first) {
      const A = first[code], B = last[code];
      if (!B || A.cantidad <= 0 || B.cantidad <= 0) continue;
      const puA = A.total / A.cantidad, puB = B.total / B.cantidad;
      if (puA <= 0) continue;
      const w = puA * (qtyTotal[code] || 0); // cantidad total, valuada a precio base
      if (w <= 0) continue;
      wsum += w;
      items.push({ infl: puB / puA - 1, w });
    }
    if (wsum <= 0) return null;
    return items.reduce((s, it) => s + (it.w / wsum) * it.infl, 0) * 100;
  }, [serie, span]);

  // Detalle mes a mes de la inflación oficial dentro del rango (para el modal de verificación)
  const eerrDetail = useMemo(() => {
    if (!span) return [] as { month: string; pct: number | null }[];
    const rows: { month: string; pct: number | null }[] = [];
    let [y, m] = span.first.split('-').map(Number);
    while (true) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      rows.push({ month: key, pct: inflMap[key] != null ? inflMap[key] : null });
      if (key === span.last) break;
      m++; if (m > 12) { m = 1; y++; }
      if (y > 3000) break;
    }
    return rows;
  }, [span, inflMap]);

  // Inflación oficial acumulada del rango INCLUSIVE (igual criterio que Lista de Precios / EERR)
  const eerrInfl = useMemo(() => {
    if (!eerrDetail.length) return null;
    let f = 1; let any = false;
    eerrDetail.forEach(r => { if (r.pct != null) any = true; f *= (1 + (r.pct || 0) / 100); });
    return any ? (f - 1) * 100 : null;
  }, [eerrDetail]);

  // Aumento PROMEDIO de la Carta Salón: precio actual vs primer precio registrado por
  // producto (mismo criterio que el módulo Lista de Precios, que mostraba +20.1%).
  const cartaInfl = useMemo(() => {
    if (!menuItems.length) return null;
    const baseByItem: Record<string, number> = {};
    [...menuHist].sort((a, b) => String(a.change_date).localeCompare(String(b.change_date)))
      .forEach(h => { if (h.menu_item_id && baseByItem[h.menu_item_id] == null) baseByItem[h.menu_item_id] = Number(h.new_price); });
    const withBase = menuItems.filter(mi => mi.menu_type === 'salon' && baseByItem[mi.id] > 0);
    if (!withBase.length) return null;
    const sum = withBase.reduce((s, mi) => s + ((Number(mi.price) - baseByItem[mi.id]) / baseByItem[mi.id]) * 100, 0);
    return sum / withBase.length;
  }, [menuHist, menuItems]);

  // Variación nominal del gasto total (primer vs último período)
  const gastoVar = useMemo(() => {
    if (!span) return null;
    const a = serie[0].total, b = serie[serie.length - 1].total;
    return a > 0 ? (b / a - 1) * 100 : null;
  }, [serie, span]);

  // Variación REAL del gasto total: deflacta el gasto del último mes al poder adquisitivo
  // del primer mes usando la inflación acumulada del período. Aísla el efecto precios.
  const gastoVarReal = useMemo(() => {
    if (!span || eerrInfl == null) return null;
    const a = serie[0].total, b = serie[serie.length - 1].total;
    if (a <= 0) return null;
    const bReal = b / (1 + eerrInfl / 100);
    return (bReal / a - 1) * 100;
  }, [serie, span, eerrInfl]);

  // Selección de artículos a mostrar en la tabla (default: top 8 por gasto del período actual)
  const defaultSel = useMemo(() => new Set<string>(arts.slice(0, 8).map(a => norm(a.code))), [arts]);
  const effSel: Set<string> = selCodes ?? defaultSel;
  const toggleCode = (code: string) => {
    const next = new Set(effSel);
    if (next.has(code)) next.delete(code); else next.add(code);
    setSelCodes(next);
  };
  const setTopSel = (n: number) => setSelCodes(new Set(arts.slice(0, n).map(a => norm(a.code))));

  // Filas de la tabla de evolución (artículos seleccionados), con impacto $ sobre el gasto
  const precioEvo = useMemo(() => {
    const rows = Array.from(effSel).map(code => {
      const puntos = serie.map(s => {
        const d = s.byCode[code];
        return d && d.cantidad > 0 ? Math.round(d.total / d.cantidad) : null;
      });
      const A = serie[0]?.byCode[code];
      const L = serie[serie.length - 1]?.byCode[code];
      const first = puntos.find(v => v != null) ?? null;
      const last = [...puntos].reverse().find(v => v != null) ?? null;
      const varPct = first != null && last != null && first > 0 ? ((last - first) / first) * 100 : null;
      // Impacto $/mes = (precio último − precio primero) × cantidad del último mes
      const impacto = (A && L && A.cantidad > 0 && L.cantidad > 0)
        ? ((L.total / L.cantidad) - (A.total / A.cantidad)) * L.cantidad : null;
      return { code, desc: descByCode[code] || code, puntos, last, varPct, impacto };
    });
    // Ordena por impacto absoluto descendente (los que más mueven el gasto, arriba)
    return rows.sort((a, b) => Math.abs(b.impacto ?? 0) - Math.abs(a.impacto ?? 0));
  }, [effSel, serie, descByCode]);

  const impactoTotal = useMemo(() => precioEvo.reduce((s, r) => s + (r.impacto ?? 0), 0), [precioEvo]);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-black uppercase tracking-tight text-text-main flex items-center gap-2">
            <ShoppingCart className="text-brand-500" size={22} /> Informes de Compras
          </h1>
          <p className="text-[11px] text-text-dim font-bold uppercase tracking-wider">Compras &amp; Stock · datos de TANGO</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-black uppercase text-text-dim">Período</span>
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="bg-bg-sidebar border border-border-dim rounded-md px-3 py-2 text-[11px] font-bold text-text-main">
            {periods.length === 0 && <option value={period}>{periodLabel(period)}</option>}
            {periods.map(p => <option key={p} value={p}>{periodLabel(p)}</option>)}
          </select>
        </div>
      </div>

      {/* Pestañas */}
      <div className="flex gap-1 p-1 bg-bg-sidebar border border-border-dim rounded-lg w-fit shadow-sm flex-wrap">
        {([['resumen', 'Resumen'], ['evolucion', 'Evolución'], ['cotizaciones', 'Cotizaciones (Top)'], ['importar', 'Importar']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn('px-4 py-2 rounded-md text-[10px] font-black uppercase tracking-widest transition-all',
              tab === k ? 'bg-brand-500 text-black shadow' : 'text-text-dim hover:text-text-main')}>{l}</button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-brand-500" size={32} /></div>
      ) : (
        <>
          {/* ───────────────── RESUMEN ───────────────── */}
          {tab === 'resumen' && (
            !hasData ? (
              <EmptyState onImport={() => setTab('importar')} />
            ) : (
              <div className="space-y-6">
                {/* KPIs */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Kpi icon={<DollarSign size={16} />} label="Gasto total del mes" value={fmt(kpis.totalGasto)} sub={`${kpis.nArt} artículos`} />
                  <Kpi icon={<Building2 size={16} />} label="Proveedores" value={String(kpis.nProv)} sub={kpis.top1prov ? `Top: ${kpis.top1prov.razon_social}` : ''} />
                  <Kpi icon={<Percent size={16} />} label="Concentración top 5 prov." value={`${kpis.top5prov.toFixed(1)}%`} sub="del gasto total" warn={kpis.top5prov > 60} />
                  <Kpi icon={<CheckCircle2 size={16} />} label="Vinculados al maestro" value={`${recon.linked}/${arts.length}`} sub={`${recon.unmatched.length} sin insumo`} warn={recon.unmatched.length > 0} />
                </div>

                {/* Top artículos */}
                <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
                  <h3 className="text-xs font-black uppercase text-brand-500 tracking-wider mb-4">Top artículos por gasto · {periodLabel(period)}</h3>
                  <div className="h-64 -ml-2">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topBar} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-dim)" horizontal={false} />
                        <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={110} />
                        <Tooltip formatter={(v: any) => fmt(v)} />
                        <Bar dataKey="Gasto" radius={[0, 4, 4, 0]}>
                          {topBar.map((_, i) => <Cell key={i} fill={i < topN ? BRAND : '#f59e0b'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Top proveedores + riesgo */}
                <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm overflow-hidden">
                  <h3 className="text-xs font-black uppercase text-brand-500 tracking-wider mb-1">Proveedores por gasto</h3>
                  <p className="text-[9px] text-text-dim font-bold uppercase mb-4">% de participación y acumulado</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[9px] font-black uppercase tracking-wider text-text-dim border-b border-border-dim">
                          <th className="px-3 py-2">#</th><th className="px-3 py-2">Proveedor</th>
                          <th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">% Part.</th><th className="px-3 py-2 text-right">% Acum.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-dim">
                        {provs.slice(0, 15).map((p, i) => (
                          <tr key={p.razon_social} className="text-[11px] font-medium hover:bg-bg-accent/30">
                            <td className="px-3 py-2 text-text-dim font-mono">{i + 1}</td>
                            <td className="px-3 py-2 font-bold uppercase text-text-main">{p.razon_social}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">{fmt(toNum(p.total))}</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums">{toNum(p.pct_participacion).toFixed(1)}%</td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-text-dim">{toNum(p.pct_acumulado).toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {recon.unmatched.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2 text-amber-600"><AlertTriangle size={15} /><span className="text-[11px] font-black uppercase">{recon.unmatched.length} artículo(s) sin insumo en el maestro</span></div>
                    <p className="text-[10px] text-text-dim mb-2">Suelen ser conceptos de gasto (no insumos) o artículos nuevos. Códigos: {recon.unmatched.slice(0, 12).map(u => u.code).join(', ')}{recon.unmatched.length > 12 ? '…' : ''}</p>
                  </div>
                )}
              </div>
            )
          )}

          {/* ───────────────── EVOLUCIÓN ───────────────── */}
          {tab === 'evolucion' && (
            serie.length === 0 ? <EmptyState onImport={() => setTab('importar')} /> : (
              <div className="space-y-6">
                {/* KPIs comparativos del rango cargado */}
                {span ? (
                  <>
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                      <Kpi icon={<TrendingUp size={16} />} label="Inflación de compras" value={comprasInfl != null ? `${comprasInfl > 0 ? '+' : ''}${comprasInfl.toFixed(1)}%` : '—'} sub="precio unit. · pond. x cantidad" warn={comprasInfl != null && eerrInfl != null && comprasInfl > eerrInfl} />
                      <Kpi icon={<Percent size={16} />} label="Inflación oficial (EERR)" value={eerrInfl != null ? `${eerrInfl > 0 ? '+' : ''}${eerrInfl.toFixed(1)}%` : '— sin carga'} sub="acumulada · ver detalle" onClick={() => setShowInflDetail(true)} />
                      <Kpi icon={<DollarSign size={16} />} label="Aumento de carta" value={cartaInfl != null ? `${cartaInfl > 0 ? '+' : ''}${cartaInfl.toFixed(1)}%` : '— sin datos'} sub="Carta Salón · vs precio inicial" />
                      <Kpi icon={<ShoppingCart size={16} />} label="Gasto total nominal" value={gastoVar != null ? `${gastoVar > 0 ? '+' : ''}${gastoVar.toFixed(1)}%` : '—'} sub="primer vs último mes" />
                      <Kpi icon={<TrendingDown size={16} />} label="Gasto total real" value={gastoVarReal != null ? `${gastoVarReal > 0 ? '+' : ''}${gastoVarReal.toFixed(1)}%` : '— sin inflación'} sub="deflactado por inflación" warn={gastoVarReal != null && gastoVarReal > 0} />
                    </div>
                    {/* Veredicto */}
                    {comprasInfl != null && (
                      <div className={cn('rounded-xl px-4 py-3 border text-[11px] font-bold flex items-start gap-2',
                        (eerrInfl != null && comprasInfl > eerrInfl) || (cartaInfl != null && comprasInfl > cartaInfl)
                          ? 'bg-amber-500/10 border-amber-500/30 text-amber-600' : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600')}>
                        <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                        <span>
                          {periodLabel(span.first)} → {periodLabel(span.last)}: el precio de nuestros insumos subió <b>{comprasInfl.toFixed(1)}%</b> (ponderado por cantidad)
                          {eerrInfl != null && <> vs inflación oficial <b>{eerrInfl.toFixed(1)}%</b> ({comprasInfl > eerrInfl ? `compramos ${(comprasInfl - eerrInfl).toFixed(1)} pts por encima` : `${(eerrInfl - comprasInfl).toFixed(1)} pts por debajo`})</>}
                          {cartaInfl != null && <> · carta subió <b>{cartaInfl.toFixed(1)}%</b> ({comprasInfl > cartaInfl ? 'el costo sube más rápido que el precio de venta — presiona el margen' : 'la carta acompaña el costo'})</>}.
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="rounded-xl px-4 py-3 border border-border-dim bg-bg-sidebar text-[11px] text-text-dim font-bold">Cargá al menos 2 meses para ver inflación y comparativas.</div>
                )}

                <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
                  <h3 className="text-xs font-black uppercase text-brand-500 tracking-wider mb-4">Gasto total de compras · mes a mes</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={evoData} margin={{ left: 4, right: 16, top: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-dim)" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} />
                        <Tooltip formatter={(v: any) => fmt(v)} />
                        <Line type="monotone" dataKey="Gasto" stroke={BRAND} strokeWidth={2.5} dot={{ r: 3 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between flex-wrap gap-3 mb-1">
                    <h3 className="text-xs font-black uppercase text-brand-500 tracking-wider">Precio unitario por artículo · evolución</h3>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-black uppercase text-text-dim mr-1">Elegir top</span>
                      {[8, 15, 25, 50].map(n => (
                        <button key={n} onClick={() => setTopSel(n)} className="px-2 py-1 rounded text-[9px] font-black uppercase bg-bg-accent border border-border-dim text-text-dim hover:text-brand-500 hover:border-brand-500">{n}</button>
                      ))}
                    </div>
                  </div>
                  <p className="text-[9px] text-text-dim font-bold uppercase mb-3">Precio = total ÷ cantidad de cada mes · {effSel.size} artículo(s) · ordenado por impacto en el gasto</p>

                  {/* Selector de artículos */}
                  <details className="mb-4 group">
                    <summary className="cursor-pointer text-[10px] font-black uppercase text-brand-500 select-none flex items-center gap-1">
                      <Package size={13} /> Elegir artículos a analizar ({effSel.size})
                    </summary>
                    <div className="mt-3 border border-border-dim rounded-lg p-3 bg-bg-accent/40">
                      <input value={evoSearch} onChange={e => setEvoSearch(e.target.value)} placeholder="Buscar artículo…"
                        className="w-full bg-bg-sidebar border border-border-dim rounded-md px-3 py-2 text-[11px] font-bold mb-3" />
                      <div className="max-h-60 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1">
                        {arts.filter(a => { const q = evoSearch.trim().toLowerCase(); return !q || (a.description || '').toLowerCase().includes(q) || norm(a.code).includes(q); }).map(a => {
                          const code = norm(a.code); const on = effSel.has(code);
                          return (
                            <label key={code} className="flex items-center gap-2 py-1 cursor-pointer text-[11px]">
                              <input type="checkbox" checked={on} onChange={() => toggleCode(code)} className="accent-brand-500" />
                              <span className={cn('font-bold uppercase truncate', on ? 'text-text-main' : 'text-text-dim')}>{a.description || code}</span>
                              <span className="ml-auto text-[9px] font-mono text-text-dim shrink-0">{fmt(toNum(a.total))}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </details>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[9px] font-black uppercase tracking-wider text-text-dim border-b border-border-dim">
                          <th className="px-3 py-2">Artículo</th>
                          {serie.map(s => <th key={s.period} className="px-3 py-2 text-right">{periodLabel(s.period)}</th>)}
                          <th className="px-3 py-2 text-right">Var. total</th>
                          <th className="px-3 py-2 text-right">Impacto $/mes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-dim">
                        {precioEvo.map(row => (
                          <tr key={row.code} className="text-[11px] font-medium hover:bg-bg-accent/30">
                            <td className="px-3 py-2 font-bold uppercase text-text-main">{row.desc}</td>
                            {row.puntos.map((v, i) => <td key={i} className="px-3 py-2 text-right font-mono tabular-nums">{v != null ? fmt(v) : <span className="text-text-dim">—</span>}</td>)}
                            <td className="px-3 py-2 text-right font-mono font-bold tabular-nums">
                              {row.varPct != null ? (
                                <span className={row.varPct > 0 ? 'text-red-500' : 'text-emerald-500'}>{row.varPct > 0 ? '+' : ''}{row.varPct.toFixed(1)}%</span>
                              ) : <span className="text-text-dim">—</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold tabular-nums">
                              {row.impacto != null ? (
                                <span className={row.impacto > 0 ? 'text-red-500' : 'text-emerald-500'}>{row.impacto > 0 ? '+' : ''}{fmt(row.impacto)}</span>
                              ) : <span className="text-text-dim">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="text-[11px] font-black border-t-2 border-border-dim">
                          <td className="px-3 py-2.5 uppercase text-brand-500" colSpan={serie.length + 2}>Impacto total sobre el gasto (seleccionados)</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums"><span className={impactoTotal > 0 ? 'text-red-500' : 'text-emerald-500'}>{impactoTotal > 0 ? '+' : ''}{fmt(impactoTotal)}</span></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="text-[8px] text-text-dim font-bold uppercase mt-3 opacity-70">Var. = último vs primer mes con datos. Impacto $/mes = (precio último − precio primero) × cantidad del último mes: cuánto pesa ese cambio de precio en el gasto real. Rojo = encarece / cuesta más.</p>
                </div>
              </div>
            )
          )}

          {/* ───────────────── COTIZACIONES ───────────────── */}
          {tab === 'cotizaciones' && (
            arts.length === 0 ? <EmptyState onImport={() => setTab('importar')} /> : (
              <div className="space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className={cn('p-4 rounded-xl border flex items-center gap-4', ahorroTotal > 0 ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-bg-sidebar border-border-dim')}>
                    <div className={cn('p-2 rounded-lg', ahorroTotal > 0 ? 'bg-emerald-500/20 text-emerald-500' : 'bg-bg-accent text-text-dim')}><TrendingDown size={20} /></div>
                    <div>
                      <div className="text-[9px] font-black uppercase text-text-dim tracking-widest">Ahorro potencial del mes</div>
                      <div className={cn('text-2xl font-mono font-black', ahorroTotal > 0 ? 'text-emerald-500' : 'text-text-main')}>{fmt(ahorroTotal)}</div>
                      <div className="text-[9px] text-text-dim">si compramos cada insumo a la mejor cotización cargada</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-text-dim">Top</span>
                    <select value={topN} onChange={e => setTopN(parseInt(e.target.value))} className="bg-bg-sidebar border border-border-dim rounded-md px-2 py-1.5 text-[11px] font-bold">
                      {[10, 15, 20, 30].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-3">
                  {cotizRows.map(r => {
                    const d = getDraft(r.code, cotizByCode[r.code]);
                    const validos = d.quotes.filter(q => q.precio > 0);
                    const mejorLive = validos.length ? Math.min(...validos.map(q => q.precio)) : null;
                    return (
                      <div key={r.code} className="bg-bg-sidebar border border-border-dim rounded-xl p-4 shadow-sm">
                        <div className="flex items-start justify-between flex-wrap gap-3 mb-3">
                          <div>
                            <div className="text-[13px] font-black uppercase text-text-main flex items-center gap-2">
                              <Package size={14} className="text-brand-500" /> {r.description || r.code}
                            </div>
                            <div className="text-[10px] text-text-dim font-mono">Cód {r.code} · {r.cantidad.toLocaleString('es-AR')} u/mes · pagado <b className="text-text-main">{fmt2(r.precioActual)}</b>/u</div>
                          </div>
                          {r.ahorroMes > 0 && (
                            <div className="text-right">
                              <div className="text-[9px] font-black uppercase text-emerald-500">Ahorro</div>
                              <div className="text-sm font-mono font-black text-emerald-500">{fmt(r.ahorroMes)}</div>
                            </div>
                          )}
                        </div>

                        {/* Cotizaciones */}
                        <div className="space-y-2">
                          {d.quotes.map((q, qi) => {
                            const esMejor = q.precio > 0 && mejorLive != null && q.precio === mejorLive;
                            const dif = q.precio > 0 && r.precioActual > 0 ? ((q.precio - r.precioActual) / r.precioActual) * 100 : null;
                            return (
                              <div key={qi} className="flex items-center gap-2">
                                <input placeholder="Proveedor" value={q.proveedor} disabled={isReadOnly}
                                  onChange={e => { const qs = [...d.quotes]; qs[qi] = { ...qs[qi], proveedor: e.target.value }; setDraftFor(r.code, { ...d, quotes: qs }); }}
                                  className="flex-1 min-w-0 bg-bg-accent border border-border-dim rounded-md px-2 py-1.5 text-[11px] font-bold" />
                                <div className="relative">
                                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-text-dim">$</span>
                                  <input type="number" placeholder="Precio" value={q.precio || ''} disabled={isReadOnly}
                                    onChange={e => { const qs = [...d.quotes]; qs[qi] = { ...qs[qi], precio: toNum(e.target.value) }; setDraftFor(r.code, { ...d, quotes: qs }); }}
                                    className={cn('w-28 bg-bg-accent border rounded-md pl-5 pr-2 py-1.5 text-[11px] font-mono tabular-nums', esMejor ? 'border-emerald-500 text-emerald-600 font-black' : 'border-border-dim')} />
                                </div>
                                <span className={cn('text-[10px] font-mono w-16 text-right', dif == null ? 'text-text-dim' : dif < 0 ? 'text-emerald-500' : 'text-red-500')}>
                                  {dif != null ? `${dif > 0 ? '+' : ''}${dif.toFixed(0)}%` : ''}
                                </span>
                                {esMejor && <span className="text-[8px] font-black uppercase bg-emerald-500/20 text-emerald-600 px-1.5 py-0.5 rounded">Mejor</span>}
                                {!isReadOnly && (
                                  <button onClick={() => { const qs = d.quotes.filter((_, x) => x !== qi); setDraftFor(r.code, { ...d, quotes: qs.length ? qs : [{ proveedor: '', precio: 0 }] }); }}
                                    className="text-text-dim hover:text-red-500 p-1"><Trash2 size={13} /></button>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            {!isReadOnly && (
                              <button onClick={() => setDraftFor(r.code, { ...d, quotes: [...d.quotes, { proveedor: '', precio: 0 }] })}
                                className="flex items-center gap-1 text-[10px] font-bold text-brand-500 hover:text-brand-600"><Plus size={13} /> Agregar cotización</button>
                            )}
                            <input placeholder="Revisado por…" value={d.revisado_por} disabled={isReadOnly}
                              onChange={e => setDraftFor(r.code, { ...d, revisado_por: e.target.value })}
                              className="bg-transparent border-b border-border-dim px-1 py-0.5 text-[10px] text-text-dim w-32" />
                          </div>
                          {!isReadOnly && (
                            <button onClick={() => guardarCotiz(r.code, r.description, r.precioActual, d.quotes, d.revisado_por)} disabled={savingCode === r.code}
                              className="flex items-center gap-1.5 bg-brand-500/10 text-brand-500 border border-brand-500/40 hover:bg-brand-500/20 rounded-md px-3 py-1.5 text-[10px] font-black uppercase tracking-wider">
                              {savingCode === r.code ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />} Guardar
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          )}

          {/* ───────────────── IMPORTAR ───────────────── */}
          {tab === 'importar' && (
            <div className="space-y-5 max-w-3xl">
              <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
                <h3 className="text-xs font-black uppercase text-brand-500 tracking-wider mb-3">Mes del reporte</h3>
                <p className="text-[11px] text-text-dim mb-3">Los archivos de Tango no traen el mes adentro, así que elegilo acá antes de importar. Volver a importar un mes <b>reemplaza</b> lo cargado de ese mes.</p>
                <input type="month" value={impPeriod} onChange={e => { setImpPeriod(e.target.value); setMsg(null); }}
                  className="bg-bg-accent border border-border-dim rounded-md px-3 py-2 text-[12px] font-bold text-text-main" />
              </div>

              {msg && (
                <div className={cn('rounded-lg px-4 py-3 text-[11px] font-bold border', msg.kind === 'ok' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600' : 'bg-red-500/10 border-red-500/30 text-red-500')}>{msg.text}</div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <ImportCard title="Ranking por artículo" desc="Reporte de Tango: Cód. Artículo · Descripción · Cantidad · Total · % Participación · % Acumulado" busy={busy} disabled={isReadOnly || !impPeriod}
                  onFile={importArticulos} />
                <ImportCard title="Ranking de proveedores" desc="Reporte de Tango: Razón social · Total neto · Total · % Participación · % Acumulado" busy={busy} disabled={isReadOnly || !impPeriod}
                  onFile={importProveedores} />
              </div>

              {hasData && !isReadOnly && (
                <button onClick={borrarPeriodo} disabled={busy} className="flex items-center gap-1.5 text-[10px] font-bold text-red-500 hover:text-red-600">
                  <Trash2 size={13} /> Borrar importación de {periodLabel(period)}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal: detalle de la inflación oficial mes a mes */}
      {showInflDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowInflDetail(false)}>
          <div className="bg-bg-main border border-border-dim rounded-xl shadow-xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-black uppercase text-brand-500 tracking-wider">Inflación oficial · detalle</h3>
              <button onClick={() => setShowInflDetail(false)} className="text-text-dim hover:text-text-main text-lg leading-none">×</button>
            </div>
            <p className="text-[10px] text-text-dim font-bold uppercase mb-4">Cargada en Estado de Resultado (monthly_inflation) · {span ? `${periodLabel(span.first)} → ${periodLabel(span.last)}` : ''}</p>
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-wider text-text-dim border-b border-border-dim">
                  <th className="px-2 py-2">Mes</th><th className="px-2 py-2 text-right">Inflación mensual</th><th className="px-2 py-2 text-right">Acumulado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim">
                {(() => { let f = 1; return eerrDetail.map(r => { f *= (1 + (r.pct || 0) / 100); return (
                  <tr key={r.month} className="text-[11px] font-medium">
                    <td className="px-2 py-2 font-bold uppercase text-text-main">{periodLabel(r.month)}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums">{r.pct != null ? `${r.pct.toFixed(1)}%` : <span className="text-amber-500">sin carga</span>}</td>
                    <td className="px-2 py-2 text-right font-mono tabular-nums text-text-dim">{`${((f - 1) * 100).toFixed(1)}%`}</td>
                  </tr>
                ); }); })()}
              </tbody>
              <tfoot>
                <tr className="text-[11px] font-black border-t-2 border-border-dim">
                  <td className="px-2 py-2.5 uppercase text-brand-500" colSpan={2}>Acumulado del período</td>
                  <td className="px-2 py-2.5 text-right font-mono tabular-nums">{eerrInfl != null ? `${eerrInfl > 0 ? '+' : ''}${eerrInfl.toFixed(1)}%` : '—'}</td>
                </tr>
              </tfoot>
            </table>
            <p className="text-[8px] text-text-dim font-bold uppercase mt-3 opacity-70">Se compone cada mes cargado del rango, de enero al último con compras. Un mes "sin carga" cuenta como 0% — cargalo en Estado de Resultado para que sume.</p>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ── Subcomponentes ───────────────────────────────────────────────────────────
function Kpi({ icon, label, value, sub, warn, onClick }: { icon: ReactNode; label: string; value: string; sub?: string; warn?: boolean; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={cn('p-4 rounded-xl border transition-all', warn ? 'bg-amber-500/10 border-amber-500/30' : 'bg-bg-sidebar border-border-dim', onClick && 'cursor-pointer hover:border-brand-500/50 hover:shadow-sm')}>
      <div className="flex items-center gap-1.5 text-text-dim mb-1">{icon}<span className="text-[9px] font-black uppercase tracking-widest">{label}</span></div>
      <div className="text-xl font-mono font-black text-text-main">{value}</div>
      {sub && <div className={cn('text-[9px] font-bold uppercase truncate', onClick ? 'text-brand-500' : 'text-text-dim')}>{sub}</div>}
    </div>
  );
}

function ImportCard({ title, desc, busy, disabled, onFile }: { title: string; desc: string; busy: boolean; disabled?: boolean; onFile: (f: File) => void }) {
  return (
    <div className="bg-bg-sidebar border border-border-dim rounded-xl p-5 shadow-sm">
      <h4 className="text-[12px] font-black uppercase text-text-main mb-1">{title}</h4>
      <p className="text-[10px] text-text-dim mb-4 leading-relaxed">{desc}</p>
      <label className={cn('flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-6 cursor-pointer transition-all',
        disabled ? 'border-border-dim opacity-50 cursor-not-allowed' : 'border-brand-500/40 hover:bg-brand-500/5 text-brand-500')}>
        {busy ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
        <span className="text-[11px] font-black uppercase tracking-wider">{busy ? 'Procesando…' : 'Subir Excel'}</span>
        <input type="file" accept=".xlsx,.xls" disabled={disabled || busy} className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.currentTarget.value = ''; }} />
      </label>
    </div>
  );
}

function EmptyState({ onImport }: { onImport: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 bg-bg-sidebar border border-border-dim rounded-2xl mb-4"><ShoppingCart className="text-text-dim" size={36} /></div>
      <h3 className="text-sm font-black uppercase text-text-main">Sin datos para este período</h3>
      <p className="text-[11px] text-text-dim max-w-sm mt-1 mb-4">Importá los reportes de Tango (Ranking por artículo y Ranking de proveedores) para ver indicadores, evolución y cotizaciones.</p>
      <button onClick={onImport} className="flex items-center gap-2 bg-brand-500 text-black rounded-md px-4 py-2 text-[11px] font-black uppercase tracking-wider"><Upload size={14} /> Importar reportes</button>
    </div>
  );
}
