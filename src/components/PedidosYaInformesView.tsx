import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Upload, FileSpreadsheet, FileText, RefreshCw, AlertTriangle, CheckCircle2,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Banknote,
  MessageSquareWarning, Settings2, Store, Tag, BarChart3, Trash2, Info
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Branch } from '../types';
import { supabase } from '../lib/supabase';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - Vite resolves the worker file to a URL
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// Cargamos XLSX de forma perezosa (solo cuando se importa) para no engordar el bundle inicial.

// ── Helpers ──────────────────────────────────────────────────────────────────
const BRAND = '#ED1C24';
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const norm = (v: any) => String(v ?? '').trim();
const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-AR');
const fmtK = (n: number) => {
  const a = Math.abs(n || 0);
  if (a >= 1_000_000) return '$' + (n / 1_000_000).toLocaleString('es-AR', { maximumFractionDigits: 1 }) + 'M';
  if (a >= 1_000) return '$' + (n / 1_000).toLocaleString('es-AR', { maximumFractionDigits: 0 }) + 'k';
  return '$' + Math.round(n || 0).toLocaleString('es-AR');
};
const fmtNum = (n: number) => Math.round(n || 0).toLocaleString('es-AR');
const fmtPct = (n: number | null, dec = 1) => n == null || isNaN(n) ? '—' : n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + '%';

const toNum = (v: any): number => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  let s = String(v).replace(/[^0-9.,-]/g, '');
  // formato ES "25.881.232,26" -> saca puntos de miles, coma decimal
  if (/,\d{1,2}$/.test(s) || (s.includes('.') && s.includes(','))) {
    s = s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

// Nombre de sucursal -> marca
const deriveMarca = (sucursal: string): 'Craft' | 'Craft Café' =>
  /caf[eé]/i.test(sucursal || '') ? 'Craft Café' : 'Craft';

// Fecha 'DD/MM/YYYY' o 'YYYY-MM-DD' -> 'YYYY-MM-DD'
const parseFechaISO = (v: any): string | null => {
  const s = norm(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
};

// Semana fija del negocio a partir del día del mes
const weekOfMonth = (iso: string): 1 | 2 | 3 | 4 => {
  const d = parseInt(iso.slice(8, 10), 10);
  if (d <= 7) return 1;
  if (d <= 14) return 2;
  if (d <= 21) return 3;
  return 4;
};

const monthKey = (iso: string) => iso.slice(0, 7);
const monthLabel = (mk: string) => {
  const [y, m] = mk.split('-');
  return `${MESES[(parseInt(m, 10) || 1) - 1]} ${y}`;
};
const dmy = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

// ── Semáforos ────────────────────────────────────────────────────────────────
type SemCfg = { verde: number; amarillo: number; dir: 'menor' | 'mayor' };
const DEFAULT_SEMAFOROS: Record<string, SemCfg> = {
  cancelacion: { verde: 2, amarillo: 5, dir: 'menor' },
  reclamos: { verde: 3, amarillo: 6, dir: 'menor' },
  comision: { verde: 18, amarillo: 20, dir: 'menor' },
  var_venta: { verde: 0, amarillo: -10, dir: 'mayor' },
};
const SEM_LABEL: Record<string, string> = {
  cancelacion: 'Tasa de cancelación / rechazo (% s/pedidos)',
  reclamos: 'Tasa de reclamos (% s/pedidos)',
  comision: 'Comisión efectiva (% s/venta bruta)',
  var_venta: 'Variación de venta vs semana anterior (%)',
};
const semColor = (value: number | null, cfg?: SemCfg): 'g' | 'y' | 'r' | 'n' => {
  if (value == null || isNaN(value) || !cfg) return 'n';
  if (cfg.dir === 'menor') return value <= cfg.verde ? 'g' : value <= cfg.amarillo ? 'y' : 'r';
  return value >= cfg.verde ? 'g' : value >= cfg.amarillo ? 'y' : 'r';
};
const SEM_BG: Record<string, string> = {
  g: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  y: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  r: 'bg-red-500/15 text-red-400 border-red-500/25',
  n: 'bg-bg-accent/40 text-text-dim border-border-dim/40',
};

// ── Tipos ────────────────────────────────────────────────────────────────────
type ComDia = {
  fecha: string; sucursal: string; marca: string;
  pedidos: number; venta_bruta: number; venta_neta: number; comision: number;
  venta_app: number; venta_fuera_app: number; pedidos_app: number; pedidos_fuera_app: number;
  venta_envio: number; venta_retiro: number; pedidos_envio: number; pedidos_retiro: number;
  descuentos: number; rechazados: number;
};
type Reclamo = { fecha: string; sucursal: string; marca: string; tipo: string; nro_pedido: string | null; motivo: string | null; monto: number };
type Liquidacion = {
  period_start: string; period_end: string;
  ventas_netas: number; ventas_netas_app: number; ventas_netas_fuera: number;
  servicios_pedidosya: number; cargos_operativos: number; publicidad: number;
  pub_gold_vip: number; pub_keywords: number; pub_display: number;
  reintegros: number; ajustes: number; impuestos: number;
  ventas_fuera_app_cobradas: number; total_liquidado: number;
};

interface Props { branches?: Branch[]; isReadOnly?: boolean; }

const READONLY_MSG = 'Tu rol tiene acceso de SOLO LECTURA. No podés importar ni modificar datos en este módulo.';

export default function PedidosYaInformesView({ isReadOnly = false }: Props) {
  const [tab, setTab] = useState<'comercial' | 'liquidaciones' | 'reclamos' | 'importar' | 'config'>('comercial');

  // datos
  const [comercial, setComercial] = useState<ComDia[]>([]);
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [semaforos, setSemaforos] = useState<Record<string, SemCfg>>(DEFAULT_SEMAFOROS);
  const [loading, setLoading] = useState(false);

  // selección
  const [month, setMonth] = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [metrica, setMetrica] = useState<'venta' | 'pedidos' | 'ticket' | 'pct_app' | 'pct_envio' | 'comision'>('venta');
  const [verPor, setVerPor] = useState<'marca' | 'local'>('marca');

  // ── carga de datos ──────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const start = `${month}-01`;
      const [yy, mm] = month.split('-').map(Number);
      const end = `${month}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`;

      const [com, rec, liq, cfg] = await Promise.all([
        supabase.from('py_comercial_dia').select('*').gte('fecha', start).lte('fecha', end),
        supabase.from('py_reclamos').select('*').gte('fecha', start).lte('fecha', end),
        supabase.from('py_liquidacion').select('*').order('period_start', { ascending: false }),
        supabase.from('py_config').select('*').eq('key', 'semaforos').maybeSingle(),
      ]);
      setComercial((com.data as ComDia[]) || []);
      setReclamos((rec.data as Reclamo[]) || []);
      setLiquidaciones((liq.data as Liquidacion[]) || []);
      if (cfg.data?.value) setSemaforos({ ...DEFAULT_SEMAFOROS, ...(cfg.data.value as any) });
    } catch (e) {
      console.warn('PedidosYa Informes load error', e);
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const prevMonth = () => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m - 2, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const nextMonth = () => { const [y, m] = month.split('-').map(Number); const d = new Date(y, m, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };

  // ── agregación comercial por grupo × semana ──────────────────────────────────
  type Agg = { pedidos: number; venta_bruta: number; venta_neta: number; comision: number; venta_app: number; venta_envio: number; rechazados: number };
  const emptyAgg = (): Agg => ({ pedidos: 0, venta_bruta: 0, venta_neta: 0, comision: 0, venta_app: 0, venta_envio: 0, rechazados: 0 });
  const addAgg = (a: Agg, r: ComDia) => { a.pedidos += r.pedidos; a.venta_bruta += r.venta_bruta; a.venta_neta += r.venta_neta; a.comision += r.comision; a.venta_app += r.venta_app; a.venta_envio += r.venta_envio; a.rechazados += r.rechazados; };

  const grupos = useMemo(() => {
    if (verPor === 'marca') return ['Craft', 'Craft Café'];
    const set = new Set(comercial.map(r => r.sucursal));
    return Array.from(set).sort();
  }, [comercial, verPor]);

  // data[grupo][semana 0..3] = Agg ; y total mensual
  const aggData = useMemo(() => {
    const data: Record<string, { weeks: Agg[]; mes: Agg }> = {};
    const ensure = (g: string) => { if (!data[g]) data[g] = { weeks: [emptyAgg(), emptyAgg(), emptyAgg(), emptyAgg()], mes: emptyAgg() }; return data[g]; };
    comercial.forEach(r => {
      const g = verPor === 'marca' ? deriveMarca(r.sucursal) : r.sucursal;
      const w = weekOfMonth(r.fecha) - 1;
      const cell = ensure(g);
      addAgg(cell.weeks[w], r);
      addAgg(cell.mes, r);
    });
    return data;
  }, [comercial, verPor]);

  const totalRow = useMemo(() => {
    const t = { weeks: [emptyAgg(), emptyAgg(), emptyAgg(), emptyAgg()], mes: emptyAgg() };
    comercial.forEach(r => { const w = weekOfMonth(r.fecha) - 1; addAgg(t.weeks[w], r); addAgg(t.mes, r); });
    return t;
  }, [comercial]);

  const metricOf = (a: Agg): number | null => {
    switch (metrica) {
      case 'venta': return a.venta_neta;
      case 'pedidos': return a.pedidos;
      case 'ticket': return a.pedidos > 0 ? a.venta_neta / a.pedidos : null;
      case 'pct_app': return a.venta_neta > 0 ? (a.venta_app / a.venta_neta) * 100 : null;
      case 'pct_envio': return a.venta_neta > 0 ? (a.venta_envio / a.venta_neta) * 100 : null;
      case 'comision': return a.venta_bruta > 0 ? (a.comision / a.venta_bruta) * 100 : null;
    }
  };
  const metricFmt = (v: number | null): string => {
    if (v == null) return '—';
    if (metrica === 'venta') return fmtK(v);
    if (metrica === 'pedidos') return fmtNum(v);
    if (metrica === 'ticket') return fmt(v);
    return fmtPct(v);
  };

  // última semana con datos y variación vs la anterior
  const lastWeekWithData = useMemo(() => {
    for (let w = 3; w >= 0; w--) if (totalRow.weeks[w].pedidos > 0 || totalRow.weeks[w].venta_neta > 0) return w;
    return -1;
  }, [totalRow]);

  const varPct = (cur: number | null, prev: number | null): number | null =>
    cur == null || prev == null || prev === 0 ? null : ((cur - prev) / prev) * 100;

  const hasData = comercial.length > 0;

  const chartData = useMemo(() => {
    return [0, 1, 2, 3].map(w => {
      const e: any = { name: `Sem ${w + 1}` };
      grupos.forEach(g => { const cell = aggData[g]; e[g] = cell ? metricOf(cell.weeks[w]) ?? undefined : undefined; });
      return e;
    });
  }, [aggData, grupos, metrica]);

  const chartColors = ['#ED1C24', '#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316'];

  return (
    <div className="space-y-5">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border-dim/60">
        {([
          ['comercial', 'Comercial', BarChart3],
          ['liquidaciones', 'Liquidaciones', Banknote],
          ['reclamos', 'Reclamos', MessageSquareWarning],
          ['importar', 'Importar', Upload],
          ['config', 'Semáforos', Settings2],
        ] as const).map(([k, l, Icon]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={cn('flex items-center gap-1.5 px-3.5 py-2.5 text-[11px] font-black uppercase tracking-wider rounded-t-lg transition-colors',
              tab === k ? 'text-rose-500 border-b-2 border-rose-500 bg-rose-500/5' : 'text-text-dim hover:text-text-main')}>
            <Icon size={13} /> {l}
          </button>
        ))}
      </div>

      {/* Month selector (comercial / reclamos) */}
      {(tab === 'comercial' || tab === 'reclamos') && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-bg-accent/40 p-1 rounded-lg border border-border-dim/80">
            <button onClick={prevMonth} className="p-1.5 hover:bg-bg-sidebar rounded text-text-dim"><ChevronLeft size={15} /></button>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="bg-transparent text-text-main text-[11px] font-black uppercase outline-none w-[120px] text-center cursor-pointer" />
            <button onClick={nextMonth} className="p-1.5 hover:bg-bg-sidebar rounded text-text-dim"><ChevronRight size={15} /></button>
          </div>
          <span className="text-[10px] text-text-dim font-bold uppercase tracking-wider">
            Semanas del negocio · 1: 1-7 · 2: 8-14 · 3: 15-21 · 4: 22-fin
          </span>
          {loading && <RefreshCw size={13} className="animate-spin text-rose-500" />}
        </div>
      )}

      {tab === 'comercial' && (
        <ComercialTab
          hasData={hasData} loading={loading} grupos={grupos} aggData={aggData} totalRow={totalRow}
          metrica={metrica} setMetrica={setMetrica} verPor={verPor} setVerPor={setVerPor}
          metricOf={metricOf} metricFmt={metricFmt} lastWeekWithData={lastWeekWithData} varPct={varPct}
          semaforos={semaforos} chartData={chartData} chartColors={chartColors} grouposMarca={verPor === 'local'}
          onGoImport={() => setTab('importar')} month={month}
        />
      )}
      {tab === 'liquidaciones' && <LiquidacionesTab liquidaciones={liquidaciones} onGoImport={() => setTab('importar')} />}
      {tab === 'reclamos' && <ReclamosTab reclamos={reclamos} comercial={comercial} semaforos={semaforos} onGoImport={() => setTab('importar')} />}
      {tab === 'importar' && <ImportarTab isReadOnly={isReadOnly} onDone={loadAll} />}
      {tab === 'config' && <ConfigTab isReadOnly={isReadOnly} semaforos={semaforos} onSaved={(s) => setSemaforos(s)} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMERCIAL
// ════════════════════════════════════════════════════════════════════════════
function ComercialTab(props: any) {
  const { hasData, loading, grupos, aggData, totalRow, metrica, setMetrica, verPor, setVerPor,
    metricOf, metricFmt, lastWeekWithData, varPct, semaforos, chartData, chartColors, onGoImport, month } = props;

  if (loading && !hasData) return <Loader />;
  if (!hasData) return <Empty onGoImport={onGoImport} msg={`No hay datos comerciales para ${monthLabel(month)}.`} />;

  const metricas: [string, string][] = [
    ['venta', 'Venta neta'], ['pedidos', 'Pedidos'], ['ticket', 'Ticket prom.'],
    ['pct_app', '% pago en app'], ['pct_envio', '% envío PeYa'], ['comision', '% comisión'],
  ];

  // fila render
  const renderRow = (label: string, cell: { weeks: any[]; mes: any }, isTotal = false, marca?: string) => {
    const lastW = lastWeekWithData;
    const cur = lastW >= 0 ? metricOf(cell.weeks[lastW]) : null;
    const prev = lastW >= 1 ? metricOf(cell.weeks[lastW - 1]) : null;
    const dv = varPct(cur, prev);
    // semáforo sobre comisión (si esa métrica) o variación de venta
    let sem: 'g' | 'y' | 'r' | 'n' = 'n';
    if (metrica === 'comision') sem = semColor(metricOf(cell.mes), semaforos.comision);
    return (
      <tr key={label} className={cn('border-t border-border-dim/30', isTotal ? 'bg-bg-accent/25 font-black' : 'hover:bg-bg-accent/10')}>
        <td className={cn('p-3 text-left whitespace-nowrap', isTotal ? 'text-text-main' : 'text-text-main font-bold')}>
          {marca && <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-2', marca === 'Craft Café' ? 'bg-amber-500' : 'bg-rose-500')} />}
          {label}
        </td>
        {[0, 1, 2, 3].map(w => {
          const v = metricOf(cell.weeks[w]);
          return <td key={w} className="p-3 text-center font-mono tabular-nums text-text-main">{metricFmt(v)}</td>;
        })}
        <td className="p-3 text-center font-mono tabular-nums font-black text-text-main bg-bg-accent/20">{metricFmt(metricOf(cell.mes))}</td>
        <td className="p-3 text-center">
          {dv == null ? <span className="text-text-dim">—</span> : (
            <span className={cn('inline-flex items-center gap-1 font-mono font-bold text-[11px]', dv > 0.5 ? 'text-emerald-400' : dv < -0.5 ? 'text-red-400' : 'text-text-dim')}>
              {dv > 0.5 ? <TrendingUp size={12} /> : dv < -0.5 ? <TrendingDown size={12} /> : <Minus size={12} />}
              {fmtPct(dv)}
            </span>
          )}
        </td>
        {metrica === 'comision' && <td className="p-2 text-center"><span className={cn('inline-block w-3 h-3 rounded-full border', SEM_BG[sem])} /></td>}
      </tr>
    );
  };

  // orden de filas
  const rows: React.ReactNode[] = [];
  if (verPor === 'marca') {
    ['Craft', 'Craft Café'].forEach(g => aggData[g] && rows.push(renderRow(g, aggData[g], false, g)));
  } else {
    // agrupar sucursales por marca
    const byMarca: Record<string, string[]> = { 'Craft': [], 'Craft Café': [] };
    grupos.forEach((s: string) => byMarca[deriveMarca(s)].push(s));
    (['Craft', 'Craft Café'] as const).forEach(mk => {
      if (byMarca[mk].length === 0) return;
      rows.push(<tr key={`h-${mk}`} className="bg-bg-accent/15"><td colSpan={metrica === 'comision' ? 8 : 7} className="px-3 py-1.5 text-left text-[9px] font-black uppercase tracking-widest text-text-dim">{mk}</td></tr>);
      byMarca[mk].forEach(s => aggData[s] && rows.push(renderRow(s, aggData[s], false, mk)));
    });
  }

  return (
    <div className="space-y-5">
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-bg-accent/30 p-1 rounded-lg border border-border-dim/60">
          {(['marca', 'local'] as const).map(v => (
            <button key={v} onClick={() => setVerPor(v)}
              className={cn('px-3 py-1.5 text-[10px] font-black uppercase rounded flex items-center gap-1.5', verPor === v ? 'bg-rose-600 text-white' : 'text-text-dim hover:text-text-main')}>
              {v === 'marca' ? <Tag size={11} /> : <Store size={11} />}{v === 'marca' ? 'Por marca' : 'Por local'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 bg-bg-accent/30 p-1 rounded-lg border border-border-dim/60">
          {metricas.map(([k, l]) => (
            <button key={k} onClick={() => setMetrica(k)}
              className={cn('px-2.5 py-1.5 text-[10px] font-black uppercase rounded', metrica === k ? 'bg-rose-600 text-white' : 'text-text-dim hover:text-text-main')}>{l}</button>
          ))}
        </div>
      </div>

      {/* tabla */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-lg overflow-x-auto">
        <table className="w-full text-[12px] border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-bg-accent/20 text-text-dim">
              <th className="p-3 text-left text-[9px] font-black uppercase tracking-widest">{verPor === 'marca' ? 'Marca' : 'Local'}</th>
              {['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'].map(s => <th key={s} className="p-3 text-center text-[9px] font-black uppercase tracking-widest">{s}</th>)}
              <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest bg-bg-accent/30">Mes</th>
              <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest">Δ últ. sem</th>
              {metrica === 'comision' && <th className="p-2 text-center text-[9px] font-black uppercase tracking-widest">Alerta</th>}
            </tr>
          </thead>
          <tbody>
            {rows}
            {renderRow('TOTAL', totalRow, true)}
          </tbody>
        </table>
      </div>

      {/* chart */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-lg p-5">
        <h3 className="text-xs font-black text-text-main uppercase tracking-wider flex items-center gap-2 mb-4">
          <TrendingUp size={15} className="text-rose-500" /> Evolución semanal · {metricas.find(m => m[0] === metrica)?.[1]}
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363D55" />
              <XAxis dataKey="name" stroke="#8B949E" fontSize={10} fontWeight="bold" tickLine={false} />
              <YAxis stroke="#8B949E" fontSize={9} tickLine={false} width={55}
                tickFormatter={(v) => metrica === 'venta' ? fmtK(v) : metrica === 'pedidos' ? fmtNum(v) : metrica === 'ticket' ? fmtK(v) : `${Math.round(v)}%`} />
              <Tooltip contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', borderRadius: 8, fontSize: 11 }}
                formatter={(v: any) => metricFmt(v)} />
              <Legend wrapperStyle={{ fontSize: 10, fontWeight: 'bold' }} />
              {grupos.map((g: string, i: number) => (
                <Line key={g} type="monotone" dataKey={g} stroke={chartColors[i % chartColors.length]} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LIQUIDACIONES (P&L)
// ════════════════════════════════════════════════════════════════════════════
function LiquidacionesTab({ liquidaciones, onGoImport }: { liquidaciones: Liquidacion[]; onGoImport: () => void }) {
  const [sel, setSel] = useState(0);
  useEffect(() => { setSel(0); }, [liquidaciones.length]);
  if (liquidaciones.length === 0) return <Empty onGoImport={onGoImport} msg="No hay liquidaciones cargadas. Importá el PDF del estado de cuenta de Pedidos Ya." />;
  const l = liquidaciones[Math.min(sel, liquidaciones.length - 1)];

  const pctVenta = (n: number) => l.ventas_netas > 0 ? (Math.abs(n) / l.ventas_netas) * 100 : 0;
  const rows: [string, number, boolean?][] = [
    ['Ventas netas', l.ventas_netas],
    ['— con pago en la app', l.ventas_netas_app, true],
    ['— con pago fuera de la app', l.ventas_netas_fuera, true],
    ['Servicios PedidosYa (comisión)', -Math.abs(l.servicios_pedidosya)],
    ['Cargos operativos', -Math.abs(l.cargos_operativos)],
    ['Publicidad en la app', -Math.abs(l.publicidad)],
    ['— Gold Vip', -Math.abs(l.pub_gold_vip), true],
    ['— Keywords', -Math.abs(l.pub_keywords), true],
    ['— Display', -Math.abs(l.pub_display), true],
    ['Reintegros', l.reintegros],
    ['Ajustes de liquidación', l.ajustes],
    ['Impuestos y retenciones', -Math.abs(l.impuestos)],
    ['Ventas cobradas fuera de la app', -Math.abs(l.ventas_fuera_app_cobradas)],
  ];

  return (
    <div className="space-y-4">
      {/* selector de período */}
      <div className="flex flex-wrap gap-2">
        {liquidaciones.map((q, i) => (
          <button key={q.period_start} onClick={() => setSel(i)}
            className={cn('px-3 py-2 rounded-lg text-[11px] font-black border transition-colors',
              i === Math.min(sel, liquidaciones.length - 1) ? 'bg-rose-600 text-white border-rose-600' : 'bg-bg-sidebar text-text-dim border-border-dim hover:text-text-main')}>
            {dmy(q.period_start)} – {dmy(q.period_end)}
          </button>
        ))}
      </div>

      {/* hero */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HeroCard label="Total liquidado" value={fmt(l.total_liquidado)} sub={`${dmy(l.period_start)} al ${dmy(l.period_end)}`} accent="emerald" />
        <HeroCard label="Comisión efectiva" value={fmtPct(pctVenta(l.servicios_pedidosya))} sub="sobre venta neta" accent="rose" />
        <HeroCard label="Inversión en ads" value={fmtPct(pctVenta(l.publicidad))} sub={`${fmt(l.publicidad)} · meta 3%`} accent="amber" />
      </div>

      {/* P&L */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-lg overflow-x-auto">
        <table className="w-full text-[13px] min-w-[520px]">
          <thead><tr className="bg-bg-accent/20 text-text-dim">
            <th className="p-3 text-left text-[9px] font-black uppercase tracking-widest">Concepto</th>
            <th className="p-3 text-right text-[9px] font-black uppercase tracking-widest">Monto</th>
            <th className="p-3 text-right text-[9px] font-black uppercase tracking-widest">% s/venta</th>
          </tr></thead>
          <tbody>
            {rows.map(([label, val, sub], i) => (
              <tr key={i} className={cn('border-t border-border-dim/25', sub ? 'text-text-dim' : 'text-text-main font-bold')}>
                <td className={cn('p-2.5 text-left', sub && 'pl-8 italic text-[12px]')}>{label}</td>
                <td className={cn('p-2.5 text-right font-mono tabular-nums', val < 0 ? 'text-red-400' : sub ? '' : 'text-emerald-400')}>{val < 0 ? '−' : ''}{fmt(Math.abs(val))}</td>
                <td className="p-2.5 text-right font-mono tabular-nums text-text-dim text-[11px]">{val !== 0 && !sub ? fmtPct(pctVenta(val)) : ''}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-rose-500/40 bg-bg-accent/25 font-black text-text-main">
              <td className="p-3 text-left uppercase text-[12px]">Total liquidado</td>
              <td className="p-3 text-right font-mono tabular-nums text-emerald-400">{fmt(l.total_liquidado)}</td>
              <td className="p-3 text-right font-mono tabular-nums text-text-dim text-[11px]">{fmtPct(pctVenta(l.total_liquidado))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="text-[10px] text-text-dim flex items-center gap-1.5"><Info size={12} /> Liquidación tal como la paga Pedidos Ya (período domingo a sábado).</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// RECLAMOS
// ════════════════════════════════════════════════════════════════════════════
function ReclamosTab({ reclamos, comercial, semaforos, onGoImport }: { reclamos: Reclamo[]; comercial: ComDia[]; semaforos: Record<string, SemCfg>; onGoImport: () => void }) {
  if (reclamos.length === 0 && comercial.length === 0) return <Empty onGoImport={onGoImport} msg="No hay reclamos ni datos para este mes." />;

  const totalPedidos = comercial.reduce((s, r) => s + r.pedidos, 0);
  const recl = reclamos.filter(r => r.tipo === 'reclamo');
  const reint = reclamos.filter(r => r.tipo === 'reintegro');
  const nRecl = recl.length;
  const montoRecl = recl.reduce((s, r) => s + Math.abs(r.monto), 0);
  const montoReint = reint.reduce((s, r) => s + Math.abs(r.monto), 0);
  const tasa = totalPedidos > 0 ? (nRecl / totalPedidos) * 100 : null;
  const sem = semColor(tasa, semaforos.reclamos);

  // por motivo
  const byMotivo: Record<string, { n: number; monto: number }> = {};
  recl.forEach(r => { const k = r.motivo || 'Sin motivo'; (byMotivo[k] ||= { n: 0, monto: 0 }); byMotivo[k].n++; byMotivo[k].monto += Math.abs(r.monto); });
  const motivos = Object.entries(byMotivo).sort((a, b) => b[1].n - a[1].n);

  // por sucursal
  const bySuc: Record<string, number> = {};
  recl.forEach(r => { bySuc[r.sucursal] = (bySuc[r.sucursal] || 0) + 1; });
  const sucursales = Object.entries(bySuc).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className={cn('p-4 rounded-xl border', SEM_BG[sem])}>
          <div className="text-[9px] font-black uppercase tracking-widest opacity-80">Tasa de reclamos</div>
          <div className="text-2xl font-black font-mono mt-1">{fmtPct(tasa)}</div>
          <div className="text-[10px] font-bold mt-0.5">{nRecl} de {fmtNum(totalPedidos)} pedidos</div>
        </div>
        <HeroCard label="Costo por reclamos" value={fmt(montoRecl)} sub={`${nRecl} reclamos`} accent="red" />
        <HeroCard label="Reintegros a favor" value={fmt(montoReint)} sub={`${reint.length} reintegros`} accent="emerald" />
        <HeroCard label="Impacto neto" value={fmt(montoReint - montoRecl)} sub="reintegros − reclamos" accent="rose" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Reclamos por motivo">
          <table className="w-full text-[12px]">
            <thead><tr className="text-text-dim"><th className="p-2 text-left text-[9px] uppercase font-black">Motivo</th><th className="p-2 text-center text-[9px] uppercase font-black">Cant.</th><th className="p-2 text-right text-[9px] uppercase font-black">Costo</th></tr></thead>
            <tbody>{motivos.length === 0 ? <tr><td colSpan={3} className="p-4 text-center text-text-dim text-[11px]">Sin reclamos</td></tr> :
              motivos.map(([m, v]) => <tr key={m} className="border-t border-border-dim/25"><td className="p-2 text-left text-text-main">{m}</td><td className="p-2 text-center font-mono text-text-main">{v.n}</td><td className="p-2 text-right font-mono text-red-400">{fmt(v.monto)}</td></tr>)}
            </tbody>
          </table>
        </Panel>
        <Panel title="Reclamos por local">
          <table className="w-full text-[12px]">
            <thead><tr className="text-text-dim"><th className="p-2 text-left text-[9px] uppercase font-black">Local</th><th className="p-2 text-center text-[9px] uppercase font-black">Reclamos</th></tr></thead>
            <tbody>{sucursales.length === 0 ? <tr><td colSpan={2} className="p-4 text-center text-text-dim text-[11px]">Sin reclamos</td></tr> :
              sucursales.map(([s, n]) => <tr key={s} className="border-t border-border-dim/25"><td className="p-2 text-left text-text-main">{s}</td><td className="p-2 text-center font-mono text-text-main">{n}</td></tr>)}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// IMPORTAR
// ════════════════════════════════════════════════════════════════════════════
function ImportarTab({ isReadOnly, onDone }: { isReadOnly: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (isReadOnly) { alert(READONLY_MSG); return; }
    const arr = Array.from(files);
    const names = arr.map(f => f.name).join('\n· ');
    if (!window.confirm(`¿Importar ${arr.length} archivo(s) de Pedidos Ya?\n\n· ${names}\n\nLos días/períodos que ya estuvieran cargados se reemplazan con estos datos.`)) return;
    setBusy(true); setMsg(null);
    const results: string[] = [];
    let anyErr = false;
    for (const file of arr) {
      try {
        const r = await importOne(file);
        results.push(`✓ ${file.name}: ${r}`);
      } catch (e: any) {
        anyErr = true;
        results.push(`✗ ${file.name}: ${e.message || e}`);
      }
    }
    setBusy(false);
    setMsg({ kind: anyErr ? 'err' : 'ok', text: results.join('\n') });
    if (inputRef.current) inputRef.current.value = '';
    onDone();
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 flex gap-3">
        <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
        <div className="text-[11px] text-text-dim leading-relaxed">
          <span className="font-black text-amber-500 uppercase">Antes de importar.</span> Subí los archivos que exporta Pedidos Ya. La app reconoce cada uno por su contenido:
          <ul className="mt-2 space-y-1 list-disc pl-4">
            <li><b className="text-text-main">Estado de cuenta (Excel)</b> → venta, comisión, medios de pago, entrega y reclamos por local (calendario del negocio 1-7, 8-14…).</li>
            <li><b className="text-text-main">Estado de cuenta (PDF)</b> → liquidación / P&amp;L de toda la cuenta (período domingo a sábado).</li>
          </ul>
          <p className="mt-2">Podés arrastrar varios archivos juntos. Reimportar un mismo período reemplaza sus datos, no los duplica.</p>
        </div>
      </div>

      {/* dropzone */}
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
        className={cn('flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl py-14 cursor-pointer transition-colors',
          busy ? 'border-rose-500/40 bg-rose-500/5 pointer-events-none' : 'border-border-dim hover:border-rose-500/60 hover:bg-rose-500/5')}>
        <input ref={inputRef} type="file" accept=".xlsx,.xls,.pdf" multiple className="hidden" disabled={busy} onChange={(e) => handleFiles(e.target.files)} />
        {busy ? <RefreshCw size={30} className="animate-spin text-rose-500" /> : <Upload size={30} className="text-rose-500" />}
        <div className="text-center">
          <div className="text-sm font-black text-text-main uppercase tracking-wide">{busy ? 'Procesando…' : 'Arrastrá o hacé clic para subir'}</div>
          <div className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 flex items-center gap-2 justify-center">
            <FileSpreadsheet size={12} /> .xlsx / .xls <span className="opacity-40">·</span> <FileText size={12} /> .pdf
          </div>
        </div>
      </label>

      {msg && (
        <div className={cn('rounded-xl p-4 text-[11px] font-mono whitespace-pre-wrap border',
          msg.kind === 'ok' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300' :
          msg.kind === 'err' ? 'bg-red-500/5 border-red-500/20 text-red-300' : 'bg-bg-accent/30 border-border-dim text-text-dim')}>
          <div className="flex items-center gap-2 mb-2 font-black uppercase not-italic">
            {msg.kind === 'ok' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} Resultado de la importación
          </div>
          {msg.text}
        </div>
      )}
    </div>
  );
}

// ── parser: decide tipo de archivo y despacha ────────────────────────────────
async function importOne(file: File): Promise<string> {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'pdf') return importLiquidacionPDF(file);
  // Excel (incluye .xls que en realidad es xlsx)
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheets: Record<string, any[][]> = {};
  wb.SheetNames.forEach(n => { sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) as any[][]; });
  const first = sheets[wb.SheetNames[0]] || [];
  const headerTxt = (first.slice(0, 5).flat().map((c: any) => norm(c).toLowerCase()).join(' '));
  if (headerTxt.includes('monto bruto de la venta') || (headerTxt.includes('sucursal') && headerTxt.includes('venta neta'))) {
    return importEstadoCuentaXLSX(sheets, wb.SheetNames);
  }
  throw new Error('archivo no reconocido para esta etapa (esperado: estado de cuenta Excel o PDF).');
}

// localizar fila de encabezado + índices por palabras clave
function findCols(rows: any[][], want: Record<string, string[]>, maxRows = 8) {
  for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
    const row = (rows[i] || []).map((c: any) => norm(c).toLowerCase());
    const idx: Record<string, number> = {};
    let hits = 0;
    for (const key in want) {
      const j = row.findIndex(c => want[key].some(w => c.includes(w)));
      if (j >= 0) { idx[key] = j; hits++; }
    }
    if (hits >= Math.ceil(Object.keys(want).length * 0.5)) return { headerRow: i, idx };
  }
  return null;
}

// ── Estado de cuenta XLSX (hoja1 pedidos, hoja2 reclamos, hoja3 reintegros) ────
async function importEstadoCuentaXLSX(sheets: Record<string, any[][]>, names: string[]): Promise<string> {
  const s1 = sheets[names[0]] || [];
  const found = findCols(s1, {
    sucursal: ['sucursal'], fecha: ['fecha de pedido', 'fecha del pedido', 'fecha'],
    bruto: ['monto bruto de la venta'], neta: ['monto de venta neta', 'venta neta'],
    comision: ['servicio ventas pedidoya ($)', 'servicio ventas pedidosya ($)'],
    descLocal: ['descuento otorgado por el local'], pago: ['método de pago', 'metodo de pago'],
    entrega: ['método de entrega', 'metodo de entrega'],
  });
  if (!found) throw new Error('no reconocí las columnas del estado de cuenta.');
  const { headerRow, idx } = found;

  // agregación por (fecha, sucursal)
  type Acc = ComDia;
  const map: Record<string, Acc> = {};
  const dates = new Set<string>();
  for (let i = headerRow + 1; i < s1.length; i++) {
    const r = s1[i]; if (!r) continue;
    const sucursal = norm(r[idx.sucursal]); if (!sucursal) continue;
    const fecha = parseFechaISO(r[idx.fecha]); if (!fecha) continue;
    dates.add(fecha);
    const key = `${fecha}|${sucursal}`;
    const a = (map[key] ||= {
      fecha, sucursal, marca: deriveMarca(sucursal), pedidos: 0, venta_bruta: 0, venta_neta: 0, comision: 0,
      venta_app: 0, venta_fuera_app: 0, pedidos_app: 0, pedidos_fuera_app: 0,
      venta_envio: 0, venta_retiro: 0, pedidos_envio: 0, pedidos_retiro: 0, descuentos: 0, rechazados: 0,
    });
    const bruto = toNum(r[idx.bruto]);
    const neta = idx.neta != null ? toNum(r[idx.neta]) : bruto;
    a.pedidos += 1;
    a.venta_bruta += bruto;
    a.venta_neta += neta;
    a.comision += idx.comision != null ? toNum(r[idx.comision]) : 0;
    a.descuentos += idx.descLocal != null ? toNum(r[idx.descLocal]) : 0;
    const pago = idx.pago != null ? norm(r[idx.pago]).toLowerCase() : '';
    if (pago.includes('fuera')) { a.venta_fuera_app += neta; a.pedidos_fuera_app += 1; }
    else { a.venta_app += neta; a.pedidos_app += 1; }
    const entrega = idx.entrega != null ? norm(r[idx.entrega]).toLowerCase() : '';
    if (entrega.includes('retiro') || entrega.includes('pickup')) { a.venta_retiro += neta; a.pedidos_retiro += 1; }
    else { a.venta_envio += neta; a.pedidos_envio += 1; }
  }
  const comRows = Object.values(map);
  if (comRows.length === 0) throw new Error('sin filas de pedidos válidas.');

  // reclamos (hoja 2) y reintegros (hoja 3)
  const reclamoRows: Reclamo[] = [];
  const parseReclamoSheet = (rows: any[][], tipo: 'reclamo' | 'reintegro') => {
    if (!rows || rows.length === 0) return;
    const f = findCols(rows, {
      nro: ['número de pedido', 'numero de pedido'], sucursal: ['sucursal'],
      fecha: ['fecha del pedido', 'fecha de pedido', 'fecha'], motivo: ['motivo'],
      monto: tipo === 'reclamo' ? ['cargos por reclamos de los usuarios', 'cargos por reclamos'] : ['monto neto a reintegrar'],
    });
    if (!f) return;
    for (let i = f.headerRow + 1; i < rows.length; i++) {
      const r = rows[i]; if (!r) continue;
      const sucursal = f.idx.sucursal != null ? norm(r[f.idx.sucursal]) : '';
      const fecha = parseFechaISO(f.idx.fecha != null ? r[f.idx.fecha] : '');
      if (!sucursal || !fecha) continue;
      const monto = f.idx.monto != null ? toNum(r[f.idx.monto]) : 0;
      if (monto === 0) continue;
      reclamoRows.push({
        fecha, sucursal, marca: deriveMarca(sucursal), tipo,
        nro_pedido: f.idx.nro != null ? norm(r[f.idx.nro]) : null,
        motivo: f.idx.motivo != null ? norm(r[f.idx.motivo]) : null, monto,
      });
    }
  };
  if (names[1]) parseReclamoSheet(sheets[names[1]], 'reclamo');
  if (names[2]) parseReclamoSheet(sheets[names[2]], 'reintegro');

  // guardar: reemplaza por fechas
  const dateArr = Array.from(dates);
  const CHUNK = 400;
  for (let i = 0; i < dateArr.length; i += 200) {
    await supabase.from('py_comercial_dia').delete().in('fecha', dateArr.slice(i, i + 200));
  }
  for (let i = 0; i < comRows.length; i += CHUNK) {
    const { error } = await supabase.from('py_comercial_dia').insert(comRows.slice(i, i + CHUNK));
    if (error) throw new Error('guardando comercial: ' + error.message);
  }
  if (reclamoRows.length > 0) {
    for (let i = 0; i < dateArr.length; i += 200) {
      await supabase.from('py_reclamos').delete().in('fecha', dateArr.slice(i, i + 200));
    }
    for (let i = 0; i < reclamoRows.length; i += CHUNK) {
      const { error } = await supabase.from('py_reclamos').insert(reclamoRows.slice(i, i + CHUNK));
      if (error) throw new Error('guardando reclamos: ' + error.message);
    }
  }
  const d0 = dateArr.sort()[0], d1 = dateArr.sort()[dateArr.length - 1];
  return `estado de cuenta · ${comRows.length} filas (${dmy(d0)}–${dmy(d1)}), ${reclamoRows.length} reclamos/reintegros.`;
}

// ── Estado de cuenta PDF (resumen de liquidación) ─────────────────────────────
async function importLiquidacionPDF(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    text += ' ' + content.items.map((it: any) => it.str).join(' ');
  }
  const T = text.replace(/\s+/g, ' ');

  // período
  const per = T.match(/del\s+(\d{2}\/\d{2}\/\d{4})\s+al\s+(\d{2}\/\d{2}\/\d{4})/i);
  const period_start = per ? parseFechaISO(per[1]) : null;
  const period_end = per ? parseFechaISO(per[2]) : null;
  if (!period_start || !period_end) throw new Error('no encontré el período en el PDF.');

  // valor que sigue a una etiqueta: "Etiqueta ... ARS -1.234,56"
  const val = (labels: string[]): number => {
    for (const lab of labels) {
      const re = new RegExp(lab.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*ARS\\s*(-?[\\d.]+,\\d{2})', 'i');
      const m = T.match(re);
      if (m) return toNum(m[1]);
    }
    return 0;
  };

  const l: Liquidacion = {
    period_start, period_end,
    ventas_netas: val(['Ventas netas']),
    ventas_netas_app: val(['Ventas netas con pago en la aplicación', 'pago en la aplicación']),
    ventas_netas_fuera: val(['Ventas netas con pago por fuera de la aplicación']),
    servicios_pedidosya: Math.abs(val(['Servicio por ventas en PedidosYa', 'Servicios PedidosYa'])),
    cargos_operativos: Math.abs(val(['Cargos operativos'])),
    publicidad: Math.abs(val(['Publicidad dentro de la aplicación'])),
    pub_gold_vip: Math.abs(val(['Campaña gold vip', 'gold vip'])),
    pub_keywords: Math.abs(val(['Campaña keywords', 'keywords'])),
    pub_display: Math.abs(val(['Display ads'])),
    reintegros: val(['Reintegros']),
    ajustes: val(['Ajustes de liquidación']),
    impuestos: Math.abs(val(['Impuestos y Retenciones'])),
    ventas_fuera_app_cobradas: Math.abs(val(['Ventas con pago fuera de la App cobradas', 'Ventas con pago por fuera de la aplicación ya cobradas'])),
    total_liquidado: val(['Total liquidado del', 'Total liquidado', 'Subtotal']),
  };
  if (l.ventas_netas === 0 && l.total_liquidado === 0) throw new Error('no pude leer los montos del PDF (¿es el estado de cuenta?).');

  const { error } = await supabase.from('py_liquidacion').upsert(l, { onConflict: 'period_start' });
  if (error) throw new Error('guardando liquidación: ' + error.message);
  return `liquidación ${dmy(period_start)}–${dmy(period_end)} · total ${fmt(l.total_liquidado)}.`;
}

// ════════════════════════════════════════════════════════════════════════════
// CONFIG SEMÁFOROS
// ════════════════════════════════════════════════════════════════════════════
function ConfigTab({ isReadOnly, semaforos, onSaved }: { isReadOnly: boolean; semaforos: Record<string, SemCfg>; onSaved: (s: Record<string, SemCfg>) => void }) {
  const [local, setLocal] = useState<Record<string, SemCfg>>(semaforos);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setLocal(semaforos); }, [semaforos]);

  const upd = (k: string, field: 'verde' | 'amarillo', v: string) => {
    setLocal(prev => ({ ...prev, [k]: { ...prev[k], [field]: parseFloat(v.replace(',', '.')) || 0 } }));
  };
  const save = async () => {
    if (isReadOnly) { alert(READONLY_MSG); return; }
    setSaving(true);
    const { error } = await supabase.from('py_config').upsert({ key: 'semaforos', value: local, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSaving(false);
    if (error) { alert('Error al guardar: ' + error.message); return; }
    onSaved(local);
    alert('Umbrales de semáforos guardados.');
  };
  const reset = () => setLocal(DEFAULT_SEMAFOROS);

  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-[11px] text-text-dim">Definí los umbrales de cada semáforo. <b className="text-text-main">Verde</b> hasta el primer valor, <b className="text-text-main">amarillo</b> hasta el segundo, <b className="text-text-main">rojo</b> más allá (para variación de venta es al revés: verde por encima).</p>
      <div className="bg-bg-sidebar border border-border-dim rounded-xl overflow-hidden">
        <table className="w-full text-[12px]">
          <thead><tr className="bg-bg-accent/20 text-text-dim">
            <th className="p-3 text-left text-[9px] font-black uppercase tracking-widest">Indicador</th>
            <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest text-emerald-400">Verde ≤</th>
            <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest text-amber-400">Amarillo ≤</th>
          </tr></thead>
          <tbody>
            {Object.keys(SEM_LABEL).map(k => (
              <tr key={k} className="border-t border-border-dim/25">
                <td className="p-3 text-left text-text-main font-bold">{SEM_LABEL[k]}</td>
                <td className="p-2 text-center">
                  <input value={String(local[k]?.verde ?? '')} onChange={e => upd(k, 'verde', e.target.value)}
                    className="w-20 px-2 py-1.5 bg-bg-accent border border-border-dim rounded text-center font-mono text-text-main outline-none focus:border-rose-500" />
                </td>
                <td className="p-2 text-center">
                  <input value={String(local[k]?.amarillo ?? '')} onChange={e => upd(k, 'amarillo', e.target.value)}
                    className="w-20 px-2 py-1.5 bg-bg-accent border border-border-dim rounded text-center font-mono text-text-main outline-none focus:border-rose-500" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider">
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Guardar umbrales
        </button>
        <button onClick={reset} className="flex items-center gap-2 bg-bg-accent hover:bg-bg-accent/70 text-text-dim px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider">
          <Trash2 size={14} /> Restaurar por defecto
        </button>
      </div>
    </div>
  );
}

// ── UI helpers ───────────────────────────────────────────────────────────────
function Loader() {
  return <div className="flex flex-col items-center justify-center py-20 gap-3"><RefreshCw size={24} className="animate-spin text-rose-500" /><span className="text-[10px] text-text-dim font-black uppercase tracking-widest">Cargando…</span></div>;
}
function Empty({ onGoImport, msg }: { onGoImport: () => void; msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="p-4 bg-bg-accent/40 rounded-2xl"><Upload size={28} className="text-text-dim" /></div>
      <p className="text-[12px] text-text-dim font-bold max-w-sm">{msg}</p>
      <button onClick={onGoImport} className="bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider">Ir a Importar</button>
    </div>
  );
}
function HeroCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: 'emerald' | 'rose' | 'amber' | 'red' }) {
  const col = { emerald: 'text-emerald-400', rose: 'text-rose-400', amber: 'text-amber-400', red: 'text-red-400' }[accent];
  return (
    <div className="p-4 bg-bg-sidebar border border-border-dim rounded-xl shadow-lg">
      <div className="text-[9px] font-black text-text-dim uppercase tracking-widest">{label}</div>
      <div className={cn('text-2xl font-black font-mono mt-1', col)}>{value}</div>
      {sub && <div className="text-[10px] text-text-dim font-bold mt-0.5">{sub}</div>}
    </div>
  );
}
function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-lg overflow-x-auto">
      <div className="px-4 py-3 border-b border-border-dim/50 text-[10px] font-black uppercase tracking-widest text-text-main">{title}</div>
      <div className="p-2">{children}</div>
    </div>
  );
}
