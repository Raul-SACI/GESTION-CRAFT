import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Upload, FileSpreadsheet, FileText, RefreshCw, AlertTriangle, CheckCircle2,
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Minus, Banknote,
  MessageSquareWarning, Settings2, Store, Tag, BarChart3, Trash2, Info, CalendarDays, Megaphone, Activity
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Branch } from '../types';
import { supabase } from '../lib/supabase';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore - Vite resolves the worker file to a URL
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ── Helpers ──────────────────────────────────────────────────────────────────
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
  if (/,\d{1,2}$/.test(s) || (s.includes('.') && s.includes(','))) {
    s = s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const deriveMarca = (sucursal: string): 'Craft' | 'Craft Café' =>
  /caf[eé]/i.test(sucursal || '') ? 'Craft Café' : 'Craft';

const parseFechaISO = (v: any): string | null => {
  const s = norm(v);
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
};

// Semana fija del negocio a partir del día del mes: 1-7, 8-14, 15-21, 22-fin
const weekOfMonth = (iso: string): 1 | 2 | 3 | 4 => {
  const d = parseInt((iso || '').slice(8, 10), 10);
  if (!d || d <= 7) return 1;
  if (d <= 14) return 2;
  if (d <= 21) return 3;
  return 4;
};
const monthLabel = (mk: string) => { const [y, m] = mk.split('-'); return `${MESES[(parseInt(m, 10) || 1) - 1]} ${y}`; };
const dmy = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
const SEM_RANGO = ['1-7', '8-14', '15-21', '22-fin'];

// ── Semáforos ────────────────────────────────────────────────────────────────
type SemCfg = { verde: number; amarillo: number; dir: 'menor' | 'mayor' };
const DEFAULT_SEMAFOROS: Record<string, SemCfg> = {
  cancelacion: { verde: 2, amarillo: 5, dir: 'menor' },
  reclamos: { verde: 3, amarillo: 6, dir: 'menor' },
  comision: { verde: 18, amarillo: 20, dir: 'menor' },
  ads: { verde: 3, amarillo: 5, dir: 'menor' },
  conectividad: { verde: 5, amarillo: 10, dir: 'menor' },
  prep: { verde: 20, amarillo: 30, dir: 'menor' },
  demorados: { verde: 10, amarillo: 20, dir: 'menor' },
  listos: { verde: 98, amarillo: 95, dir: 'mayor' },
  var_venta: { verde: 0, amarillo: -10, dir: 'mayor' },
};
const SEM_LABEL: Record<string, string> = {
  cancelacion: 'Tasa de cancelación / rechazo (% s/pedidos)',
  reclamos: 'Tasa de reclamos (% s/pedidos)',
  comision: 'Comisión efectiva (% s/venta)',
  ads: '% de inversión en ads (meta, s/venta)',
  conectividad: '% de desconexión (tiempo offline)',
  prep: 'Tiempo de preparación (minutos)',
  demorados: 'Pedidos demorados (% s/pedidos)',
  listos: 'Pedidos marcados como listos (%)',
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
type ComPeriodo = { anio: number; mes: number; semana: number; sucursal: string; marca: string; pedidos: number; venta: number; ticket: number };
type ComDia = { fecha: string; sucursal: string; marca: string; pedidos: number; venta_bruta: number; venta_neta: number };
type AdsDia = { fecha: string; sucursal: string; marca: string; campania: string; clicks: number; ordenes: number; ingresos: number; costo: number };
type ConectDia = { fecha: string; sucursal: string; marca: string; min_no_disp: number; min_prog: number };
type PrepDia = { fecha: string; sucursal: string; marca: string; prep_min: number; demorados: number; total: number };
type OpsPeriodo = { anio: number; mes: number; semana: number; sucursal: string; marca: string; no_disp_seg: number; rechazo: number; espera: number; prep_seg: number; reclamos: number; listos: number };
type Reclamo = { fecha: string; sucursal: string; marca: string; tipo: string; nro_pedido: string | null; motivo: string | null; monto: number };
type Liquidacion = {
  period_start: string; period_end: string;
  ventas_netas: number; ventas_netas_app: number; ventas_netas_fuera: number;
  servicios_pedidosya: number; cargos_operativos: number; publicidad: number;
  pub_gold_vip: number; pub_keywords: number; pub_display: number;
  reintegros: number; ajustes: number; impuestos: number;
  ventas_fuera_app_cobradas: number; total_liquidado: number;
};
type Agg = { pedidos: number; venta: number };

interface Props { branches?: Branch[]; isReadOnly?: boolean; }
const READONLY_MSG = 'Tu rol tiene acceso de SOLO LECTURA. No podés importar ni modificar datos en este módulo.';

class TabErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: any, info: any) { console.error('PedidosYa Informes crash:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="p-5 bg-red-500/5 border border-red-500/20 rounded-xl">
          <div className="flex items-center gap-2 text-red-400 font-black uppercase text-[11px]"><AlertTriangle size={14} /> Se produjo un error al mostrar esta sección</div>
          <pre className="mt-2 text-[11px] font-mono text-red-300 whitespace-pre-wrap break-words">{this.state.error.message}</pre>
          <p className="mt-2 text-[10px] text-text-dim">Cambiá de pestaña y volvé a intentar. Si persiste, avisá con este mensaje.</p>
        </div>
      );
    }
    // @ts-ignore - React.Component provee props en runtime
    return this.props.children;
  }
}

export default function PedidosYaInformesView({ isReadOnly = false }: Props) {
  const [tab, setTab] = useState<'comercial' | 'dia' | 'publicidad' | 'operativo' | 'liquidaciones' | 'reclamos' | 'importar' | 'config'>('comercial');
  const [periodo, setPeriodo] = useState<ComPeriodo[]>([]);
  const [comDia, setComDia] = useState<ComDia[]>([]);
  const [adsDia, setAdsDia] = useState<AdsDia[]>([]);
  const [conect, setConect] = useState<ConectDia[]>([]);
  const [prep, setPrep] = useState<PrepDia[]>([]);
  const [opsPeriodo, setOpsPeriodo] = useState<OpsPeriodo[]>([]);
  const [reclamos, setReclamos] = useState<Reclamo[]>([]);
  const [liquidaciones, setLiquidaciones] = useState<Liquidacion[]>([]);
  const [semaforos, setSemaforos] = useState<Record<string, SemCfg>>(DEFAULT_SEMAFOROS);
  const [loading, setLoading] = useState(false);
  const [month, setMonth] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; });
  const [metrica, setMetrica] = useState<'venta' | 'pedidos' | 'ticket'>('venta');
  const [verPor, setVerPor] = useState<'marca' | 'local'>('marca');

  const [yy, mm] = month.split('-').map(Number);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const start = `${month}-01`;
      const end = `${month}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`;
      const [per, dia, ads, con, prp, ops, rec, liq, cfg] = await Promise.all([
        supabase.from('py_comercial_periodo').select('*').eq('anio', yy).eq('mes', mm),
        supabase.from('py_comercial_dia').select('fecha,sucursal,marca,pedidos,venta_bruta,venta_neta').gte('fecha', start).lte('fecha', end),
        supabase.from('py_ads_dia').select('*').gte('fecha', start).lte('fecha', end),
        supabase.from('py_conectividad_dia').select('*').gte('fecha', start).lte('fecha', end),
        supabase.from('py_prep_dia').select('*').gte('fecha', start).lte('fecha', end),
        supabase.from('py_operativo_periodo').select('*').eq('anio', yy).eq('mes', mm),
        supabase.from('py_reclamos').select('*').gte('fecha', start).lte('fecha', end),
        supabase.from('py_liquidacion').select('*').order('period_start', { ascending: false }),
        supabase.from('py_config').select('*').eq('key', 'semaforos').maybeSingle(),
      ]);
      // PostgREST puede devolver los numeric como texto; forzamos a número.
      const N = (v: any) => { const n = Number(v); return isNaN(n) ? 0 : n; };
      setPeriodo(((per.data as any[]) || []).map(r => ({ ...r, pedidos: N(r.pedidos), venta: N(r.venta), ticket: N(r.ticket) })));
      setComDia(((dia.data as any[]) || []).map(r => ({ ...r, pedidos: N(r.pedidos), venta_bruta: N(r.venta_bruta), venta_neta: N(r.venta_neta) })));
      setAdsDia(((ads.data as any[]) || []).map(r => ({ ...r, clicks: N(r.clicks), ordenes: N(r.ordenes), ingresos: N(r.ingresos), costo: N(r.costo) })));
      setConect(((con.data as any[]) || []).map(r => ({ ...r, min_no_disp: N(r.min_no_disp), min_prog: N(r.min_prog) })));
      setPrep(((prp.data as any[]) || []).map(r => ({ ...r, prep_min: N(r.prep_min), demorados: N(r.demorados), total: N(r.total) })));
      setOpsPeriodo(((ops.data as any[]) || []).map(r => ({ ...r, no_disp_seg: N(r.no_disp_seg), rechazo: N(r.rechazo), espera: N(r.espera), prep_seg: N(r.prep_seg), reclamos: N(r.reclamos), listos: N(r.listos) })));
      setReclamos(((rec.data as any[]) || []).map(r => ({ ...r, monto: N(r.monto) })));
      setLiquidaciones(((liq.data as any[]) || []).map(r => {
        const o: any = { ...r };
        ['ventas_netas', 'ventas_netas_app', 'ventas_netas_fuera', 'servicios_pedidosya', 'cargos_operativos', 'publicidad', 'pub_gold_vip', 'pub_keywords', 'pub_display', 'reintegros', 'ajustes', 'impuestos', 'ventas_fuera_app_cobradas', 'total_liquidado'].forEach(k => { o[k] = N(r[k]); });
        return o;
      }));
      if (cfg.data?.value) setSemaforos({ ...DEFAULT_SEMAFOROS, ...(cfg.data.value as any) });
    } catch (e) {
      console.warn('PedidosYa Informes load error', e);
    } finally {
      setLoading(false);
    }
  }, [month, yy, mm]);
  useEffect(() => { loadAll(); }, [loadAll]);

  const prevMonth = () => { const d = new Date(yy, mm - 2, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };
  const nextMonth = () => { const d = new Date(yy, mm, 1); setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); };

  // ── agregación comercial (por período) ───────────────────────────────────────
  const grupos = useMemo(() => {
    if (verPor === 'marca') return ['Craft', 'Craft Café'];
    return Array.from(new Set(periodo.map(r => r.sucursal))).sort();
  }, [periodo, verPor]);

  // data[grupo] = { weeks:[Agg×4], mes:Agg, mesExplicit:Agg|null }
  const aggData = useMemo(() => {
    const data: Record<string, { weeks: Agg[]; mesExplicit: Agg | null }> = {};
    const ensure = (g: string) => { if (!data[g]) data[g] = { weeks: [{ pedidos: 0, venta: 0 }, { pedidos: 0, venta: 0 }, { pedidos: 0, venta: 0 }, { pedidos: 0, venta: 0 }], mesExplicit: null }; return data[g]; };
    periodo.forEach(r => {
      const g = verPor === 'marca' ? deriveMarca(r.sucursal) : r.sucursal;
      const cell = ensure(g);
      if (r.semana >= 1 && r.semana <= 4) { cell.weeks[r.semana - 1].pedidos += r.pedidos; cell.weeks[r.semana - 1].venta += r.venta; }
      else { (cell.mesExplicit ||= { pedidos: 0, venta: 0 }); cell.mesExplicit.pedidos += r.pedidos; cell.mesExplicit.venta += r.venta; }
    });
    return data;
  }, [periodo, verPor]);

  const mesOf = (cell: { weeks: Agg[]; mesExplicit: Agg | null }): Agg => {
    const wk = cell.weeks.reduce((a, w) => ({ pedidos: a.pedidos + w.pedidos, venta: a.venta + w.venta }), { pedidos: 0, venta: 0 });
    if (wk.pedidos > 0 || wk.venta > 0) return wk;
    return cell.mesExplicit || { pedidos: 0, venta: 0 };
  };

  const totalRow = useMemo(() => {
    const cell = { weeks: [{ pedidos: 0, venta: 0 }, { pedidos: 0, venta: 0 }, { pedidos: 0, venta: 0 }, { pedidos: 0, venta: 0 }], mesExplicit: null as Agg | null };
    periodo.forEach(r => {
      if (r.semana >= 1 && r.semana <= 4) { cell.weeks[r.semana - 1].pedidos += r.pedidos; cell.weeks[r.semana - 1].venta += r.venta; }
      else { (cell.mesExplicit ||= { pedidos: 0, venta: 0 }); cell.mesExplicit.pedidos += r.pedidos; cell.mesExplicit.venta += r.venta; }
    });
    return cell;
  }, [periodo]);

  const metricOf = (a: Agg): number | null => {
    if (!a) return null;
    if (metrica === 'venta') return a.venta || (a.pedidos ? 0 : null);
    if (metrica === 'pedidos') return a.pedidos || null;
    return a.pedidos > 0 ? a.venta / a.pedidos : null;
  };
  const metricFmt = (v: number | null): string => v == null ? '—' : metrica === 'venta' ? fmtK(v) : metrica === 'pedidos' ? fmtNum(v) : fmt(v);

  const lastWeekWithData = useMemo(() => { for (let w = 3; w >= 0; w--) if (totalRow.weeks[w].pedidos > 0 || totalRow.weeks[w].venta > 0) return w; return -1; }, [totalRow]);
  const varPct = (cur: number | null, prev: number | null): number | null => cur == null || prev == null || prev === 0 ? null : ((cur - prev) / prev) * 100;

  const hasData = periodo.length > 0;

  const chartData = useMemo(() => [0, 1, 2, 3].map(w => {
    const e: any = { name: `Sem ${w + 1}` };
    grupos.forEach(g => { const cell = aggData[g]; e[g] = cell ? metricOf(cell.weeks[w]) ?? undefined : undefined; });
    return e;
  }), [aggData, grupos, metrica]);

  const chartColors = ['#ED1C24', '#F59E0B', '#3B82F6', '#10B981', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316'];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1 border-b border-border-dim/60">
        {([
          ['comercial', 'Comercial', BarChart3],
          ['dia', 'Por día', CalendarDays],
          ['publicidad', 'Publicidad', Megaphone],
          ['operativo', 'Operativo', Activity],
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

      {(tab === 'comercial' || tab === 'dia' || tab === 'publicidad' || tab === 'operativo' || tab === 'reclamos') && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 bg-bg-accent/40 p-1 rounded-lg border border-border-dim/80">
            <button onClick={prevMonth} className="p-1.5 hover:bg-bg-sidebar rounded text-text-dim"><ChevronLeft size={15} /></button>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
              className="bg-transparent text-text-main text-[11px] font-black uppercase outline-none w-[120px] text-center cursor-pointer" />
            <button onClick={nextMonth} className="p-1.5 hover:bg-bg-sidebar rounded text-text-dim"><ChevronRight size={15} /></button>
          </div>
          <span className="text-[10px] text-text-dim font-bold uppercase tracking-wider">Semanas del negocio · 1: 1-7 · 2: 8-14 · 3: 15-21 · 4: 22-fin</span>
          {loading && <RefreshCw size={13} className="animate-spin text-rose-500" />}
        </div>
      )}

      <TabErrorBoundary key={tab}>
        {tab === 'comercial' && (
          <ComercialTab hasData={hasData} loading={loading} grupos={grupos} aggData={aggData} totalRow={totalRow} mesOf={mesOf}
            metrica={metrica} setMetrica={setMetrica} verPor={verPor} setVerPor={setVerPor} metricOf={metricOf} metricFmt={metricFmt}
            lastWeekWithData={lastWeekWithData} varPct={varPct} semaforos={semaforos} chartData={chartData} chartColors={chartColors}
            onGoImport={() => setTab('importar')} month={month} />
        )}
        {tab === 'dia' && (
          <DiaSemanaTab comDia={comDia} verPor={verPor} setVerPor={setVerPor} metrica={metrica} setMetrica={setMetrica}
            chartColors={chartColors} onGoImport={() => setTab('importar')} month={month} loading={loading} />
        )}
        {tab === 'publicidad' && (
          <PublicidadTab adsDia={adsDia} periodo={periodo} verPor={verPor} setVerPor={setVerPor}
            semaforos={semaforos} chartColors={chartColors} onGoImport={() => setTab('importar')} month={month} loading={loading} />
        )}
        {tab === 'operativo' && (
          <OperativoTab ops={opsPeriodo} verPor={verPor} setVerPor={setVerPor}
            semaforos={semaforos} onGoImport={() => setTab('importar')} month={month} loading={loading} />
        )}
        {tab === 'liquidaciones' && <LiquidacionesTab liquidaciones={liquidaciones} onGoImport={() => setTab('importar')} />}
        {tab === 'reclamos' && <ReclamosTab reclamos={reclamos} comDia={comDia} semaforos={semaforos} onGoImport={() => setTab('importar')} />}
        {tab === 'importar' && <ImportarTab isReadOnly={isReadOnly} onDone={loadAll} defMonth={month} />}
        {tab === 'config' && <ConfigTab isReadOnly={isReadOnly} semaforos={semaforos} onSaved={setSemaforos} />}
      </TabErrorBoundary>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMERCIAL
// ════════════════════════════════════════════════════════════════════════════
function ComercialTab(props: any) {
  const { hasData, loading, grupos, aggData, totalRow, mesOf, metrica, setMetrica, verPor, setVerPor,
    metricOf, metricFmt, lastWeekWithData, varPct, semaforos, chartData, chartColors, onGoImport, month } = props;

  if (loading && !hasData) return <Loader />;
  if (!hasData) return <Empty onGoImport={onGoImport} msg={`No hay datos comerciales para ${monthLabel(month)}. Importá el resumen de ventas de Pedidos Ya (todos los locales).`} />;

  const metricas: [string, string][] = [['venta', 'Venta'], ['pedidos', 'Pedidos'], ['ticket', 'Ticket prom.']];

  const renderRow = (label: string, cell: { weeks: any[]; mesExplicit: any }, isTotal = false, marca?: string) => {
    const lastW = lastWeekWithData;
    const cur = lastW >= 0 ? metricOf(cell.weeks[lastW]) : null;
    const prev = lastW >= 1 ? metricOf(cell.weeks[lastW - 1]) : null;
    const dv = varPct(cur, prev);
    const sem = semColor(dv, semaforos.var_venta);
    return (
      <tr key={label} className={cn('border-t border-border-dim/30', isTotal ? 'bg-bg-accent/25 font-black' : 'hover:bg-bg-accent/10')}>
        <td className={cn('p-3 text-left whitespace-nowrap text-text-main', isTotal ? '' : 'font-bold')}>
          {marca && <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-2', marca === 'Craft Café' ? 'bg-amber-500' : 'bg-rose-500')} />}
          {label}
        </td>
        {[0, 1, 2, 3].map(w => <td key={w} className="p-3 text-center font-mono tabular-nums text-text-main">{metricFmt(metricOf(cell.weeks[w]))}</td>)}
        <td className="p-3 text-center font-mono tabular-nums font-black text-text-main bg-bg-accent/20">{metricFmt(metricOf(mesOf(cell)))}</td>
        <td className="p-3 text-center">
          {dv == null ? <span className="text-text-dim">—</span> : (
            <span className={cn('inline-flex items-center gap-1 font-mono font-bold text-[11px] px-1.5 py-0.5 rounded border', SEM_BG[sem])}>
              {dv > 0.5 ? <TrendingUp size={12} /> : dv < -0.5 ? <TrendingDown size={12} /> : <Minus size={12} />}{fmtPct(dv)}
            </span>
          )}
        </td>
      </tr>
    );
  };

  const rows: React.ReactNode[] = [];
  if (verPor === 'marca') {
    ['Craft', 'Craft Café'].forEach(g => aggData[g] && rows.push(renderRow(g, aggData[g], false, g)));
  } else {
    const byMarca: Record<string, string[]> = { 'Craft': [], 'Craft Café': [] };
    grupos.forEach((s: string) => byMarca[deriveMarca(s)].push(s));
    (['Craft', 'Craft Café'] as const).forEach(mk => {
      if (byMarca[mk].length === 0) return;
      rows.push(<tr key={`h-${mk}`} className="bg-bg-accent/15"><td colSpan={7} className="px-3 py-1.5 text-left text-[9px] font-black uppercase tracking-widest text-text-dim">{mk}</td></tr>);
      byMarca[mk].forEach(s => aggData[s] && rows.push(renderRow(s, aggData[s], false, mk)));
    });
  }

  return (
    <div className="space-y-5">
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

      <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-lg overflow-x-auto">
        <table className="w-full text-[12px] border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-bg-accent/20 text-text-dim">
              <th className="p-3 text-left text-[9px] font-black uppercase tracking-widest">{verPor === 'marca' ? 'Marca' : 'Local'}</th>
              {SEM_RANGO.map((r, i) => <th key={i} className="p-3 text-center text-[9px] font-black uppercase tracking-widest">Sem {i + 1}<div className="text-[7px] opacity-60 font-bold">{r}</div></th>)}
              <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest bg-bg-accent/30">Mes</th>
              <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest">Δ últ. sem</th>
            </tr>
          </thead>
          <tbody>{rows}{renderRow('TOTAL', totalRow, true)}</tbody>
        </table>
      </div>

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
                tickFormatter={(v) => metrica === 'pedidos' ? fmtNum(v) : fmtK(v)} />
              <Tooltip contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', borderRadius: 8, fontSize: 11 }} formatter={(v: any) => metricFmt(v)} />
              <Legend wrapperStyle={{ fontSize: 10, fontWeight: 'bold' }} />
              {grupos.map((g: string, i: number) => <Line key={g} type="monotone" dataKey={g} stroke={chartColors[i % chartColors.length]} strokeWidth={2.5} dot={{ r: 3 }} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// POR DÍA DE LA SEMANA (fuente: estado de cuenta, por pedido)
// ════════════════════════════════════════════════════════════════════════════
const DOW = [
  { i: 1, l: 'Lun' }, { i: 2, l: 'Mar' }, { i: 3, l: 'Mié' }, { i: 4, l: 'Jue' },
  { i: 5, l: 'Vie' }, { i: 6, l: 'Sáb' }, { i: 0, l: 'Dom' },
];
function DiaSemanaTab({ comDia, verPor, setVerPor, metrica, setMetrica, chartColors, onGoImport, month, loading }: any) {
  if (loading && comDia.length === 0) return <Loader />;
  if (comDia.length === 0) return <Empty onGoImport={onGoImport} msg={`No hay datos por día para ${monthLabel(month)}. Importá el estado de cuenta (Excel) de Pedidos Ya.`} />;

  const metricas: [string, string][] = [['venta', 'Venta'], ['pedidos', 'Pedidos'], ['ticket', 'Ticket prom.']];
  const grupos: string[] = verPor === 'marca' ? ['Craft', 'Craft Café'] : Array.from(new Set(comDia.map((r: ComDia) => r.sucursal))).sort() as string[];

  // data[grupo][dowIndex] = {pedidos, venta}
  type A = { pedidos: number; venta: number };
  const zero = (): A => ({ pedidos: 0, venta: 0 });
  const data: Record<string, Record<number, A>> = {};
  const totByDow: Record<number, A> = {};
  DOW.forEach(d => { totByDow[d.i] = zero(); });
  comDia.forEach((r: ComDia) => {
    const g = verPor === 'marca' ? deriveMarca(r.sucursal) : r.sucursal;
    const [y, m, dd] = r.fecha.split('-').map(Number);
    const dow = new Date(y, m - 1, dd).getDay();
    (data[g] ||= {}); (data[g][dow] ||= zero());
    data[g][dow].pedidos += r.pedidos; data[g][dow].venta += r.venta_bruta;
    totByDow[dow].pedidos += r.pedidos; totByDow[dow].venta += r.venta_bruta;
  });
  const mOf = (a?: A): number | null => !a ? null : metrica === 'venta' ? a.venta : metrica === 'pedidos' ? a.pedidos : (a.pedidos > 0 ? a.venta / a.pedidos : null);
  const mFmt = (v: number | null) => v == null ? '—' : metrica === 'pedidos' ? fmtNum(v) : metrica === 'ticket' ? fmt(v) : fmtK(v);

  const chartData = DOW.map(d => {
    const e: any = { name: d.l };
    grupos.forEach(g => { e[g] = mOf(data[g]?.[d.i]) ?? undefined; });
    return e;
  });

  // día top (por venta total)
  let bestDow = DOW[0], bestVal = -1;
  DOW.forEach(d => { if (totByDow[d.i].venta > bestVal) { bestVal = totByDow[d.i].venta; bestDow = d; } });
  const DOW_FULL: Record<number, string> = { 1: 'Lunes', 2: 'Martes', 3: 'Miércoles', 4: 'Jueves', 5: 'Viernes', 6: 'Sábado', 0: 'Domingo' };

  const renderRow = (label: string, cells: Record<number, A>, isTotal = false, marca?: string) => (
    <tr key={label} className={cn('border-t border-border-dim/30', isTotal ? 'bg-bg-accent/25 font-black' : 'hover:bg-bg-accent/10')}>
      <td className={cn('p-3 text-left whitespace-nowrap text-text-main', isTotal ? '' : 'font-bold')}>
        {marca && <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-2', marca === 'Craft Café' ? 'bg-amber-500' : 'bg-rose-500')} />}{label}
      </td>
      {DOW.map(d => <td key={d.i} className="p-3 text-center font-mono tabular-nums text-text-main">{mFmt(mOf(cells?.[d.i]))}</td>)}
    </tr>
  );

  const rows: React.ReactNode[] = [];
  if (verPor === 'marca') ['Craft', 'Craft Café'].forEach(g => data[g] && rows.push(renderRow(g, data[g], false, g)));
  else {
    const byMarca: Record<string, string[]> = { 'Craft': [], 'Craft Café': [] };
    grupos.forEach(s => byMarca[deriveMarca(s)].push(s));
    (['Craft', 'Craft Café'] as const).forEach(mk => {
      if (!byMarca[mk].length) return;
      rows.push(<tr key={`h-${mk}`} className="bg-bg-accent/15"><td colSpan={8} className="px-3 py-1.5 text-left text-[9px] font-black uppercase tracking-widest text-text-dim">{mk}</td></tr>);
      byMarca[mk].forEach(s => data[s] && rows.push(renderRow(s, data[s], false, mk)));
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-bg-accent/30 p-1 rounded-lg border border-border-dim/60">
          {(['marca', 'local'] as const).map(v => (
            <button key={v} onClick={() => setVerPor(v)} className={cn('px-3 py-1.5 text-[10px] font-black uppercase rounded flex items-center gap-1.5', verPor === v ? 'bg-rose-600 text-white' : 'text-text-dim hover:text-text-main')}>
              {v === 'marca' ? <Tag size={11} /> : <Store size={11} />}{v === 'marca' ? 'Por marca' : 'Por local'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 bg-bg-accent/30 p-1 rounded-lg border border-border-dim/60">
          {metricas.map(([k, l]) => <button key={k} onClick={() => setMetrica(k)} className={cn('px-2.5 py-1.5 text-[10px] font-black uppercase rounded', metrica === k ? 'bg-rose-600 text-white' : 'text-text-dim hover:text-text-main')}>{l}</button>)}
        </div>
        <div className="ml-auto text-[10px] font-black uppercase tracking-wider text-text-dim">Día más fuerte: <span className="text-rose-500">{DOW_FULL[bestDow.i]}</span> · {fmtK(bestVal)}</div>
      </div>

      <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-lg overflow-x-auto">
        <table className="w-full text-[12px] border-collapse min-w-[720px]">
          <thead><tr className="bg-bg-accent/20 text-text-dim">
            <th className="p-3 text-left text-[9px] font-black uppercase tracking-widest">{verPor === 'marca' ? 'Marca' : 'Local'}</th>
            {DOW.map(d => <th key={d.i} className="p-3 text-center text-[9px] font-black uppercase tracking-widest">{d.l}</th>)}
          </tr></thead>
          <tbody>{rows}{renderRow('TOTAL', totByDow, true)}</tbody>
        </table>
      </div>

      <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-lg p-5">
        <h3 className="text-xs font-black text-text-main uppercase tracking-wider flex items-center gap-2 mb-4">
          <CalendarDays size={15} className="text-rose-500" /> {metricas.find(m => m[0] === metrica)?.[1]} por día de la semana
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#30363D55" />
              <XAxis dataKey="name" stroke="#8B949E" fontSize={10} fontWeight="bold" tickLine={false} />
              <YAxis stroke="#8B949E" fontSize={9} tickLine={false} width={55} tickFormatter={(v) => metrica === 'pedidos' ? fmtNum(v) : fmtK(v)} />
              <Tooltip contentStyle={{ backgroundColor: '#161B22', borderColor: '#30363D', borderRadius: 8, fontSize: 11 }} formatter={(v: any) => mFmt(v)} cursor={{ fill: '#ffffff08' }} />
              <Legend wrapperStyle={{ fontSize: 10, fontWeight: 'bold' }} />
              {grupos.map((g, i) => <Bar key={g} dataKey={g} fill={chartColors[i % chartColors.length]} radius={[3, 3, 0, 0]} />)}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <p className="text-[10px] text-text-dim flex items-center gap-1.5"><Info size={12} /> Calculado con la fecha real de cada pedido (estado de cuenta). Cubre los períodos que hayas importado.</p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLICIDAD / ADS (fuente: reporte detallado de campañas, por día)
// ════════════════════════════════════════════════════════════════════════════
type AdsAgg = { costo: number; ingresos: number; ordenes: number };
const zeroAds = (): AdsAgg => ({ costo: 0, ingresos: 0, ordenes: 0 });
function PublicidadTab({ adsDia, periodo, verPor, setVerPor, semaforos, chartColors, onGoImport, month, loading }: any) {
  const [metrica, setMetrica] = useState<'inversion' | 'ventas' | 'roas' | 'pct' | 'ordenes'>('inversion');
  if (loading && adsDia.length === 0) return <Loader />;
  if (adsDia.length === 0) return <Empty onGoImport={onGoImport} msg={`No hay datos de publicidad para ${monthLabel(month)}. Importá el reporte detallado de campañas (Publicidad en la app → Descargar).`} />;

  const grupos: string[] = verPor === 'marca' ? ['Craft', 'Craft Café'] : Array.from(new Set(adsDia.map((r: AdsDia) => r.sucursal))).sort() as string[];

  // ads por grupo × semana (fecha real)
  const ads: Record<string, { weeks: AdsAgg[]; mes: AdsAgg }> = {};
  const ensA = (g: string) => (ads[g] ||= { weeks: [zeroAds(), zeroAds(), zeroAds(), zeroAds()], mes: zeroAds() });
  const addA = (a: AdsAgg, r: AdsDia) => { a.costo += r.costo; a.ingresos += r.ingresos; a.ordenes += r.ordenes; };
  adsDia.forEach((r: AdsDia) => { const g = verPor === 'marca' ? deriveMarca(r.sucursal) : r.sucursal; const w = weekOfMonth(r.fecha) - 1; const c = ensA(g); addA(c.weeks[w], r); addA(c.mes, r); });
  const totalAds = { weeks: [zeroAds(), zeroAds(), zeroAds(), zeroAds()], mes: zeroAds() };
  adsDia.forEach((r: AdsDia) => { const w = weekOfMonth(r.fecha) - 1; addA(totalAds.weeks[w], r); addA(totalAds.mes, r); });

  // venta por grupo × semana (para % inversión)
  const ventaCell: Record<string, { weeks: number[]; mes: number; mesExp: number | null }> = {};
  const ensV = (g: string) => (ventaCell[g] ||= { weeks: [0, 0, 0, 0], mes: 0, mesExp: null });
  periodo.forEach((r: ComPeriodo) => { const g = verPor === 'marca' ? deriveMarca(r.sucursal) : r.sucursal; const c = ensV(g); if (r.semana >= 1 && r.semana <= 4) c.weeks[r.semana - 1] += r.venta; else c.mesExp = (c.mesExp || 0) + r.venta; });
  const ventaOf = (g: string, w: number | 'mes'): number => { const c = ventaCell[g]; if (!c) return 0; if (w === 'mes') { const s = c.weeks.reduce((a, b) => a + b, 0); return s > 0 ? s : (c.mesExp || 0); } return c.weeks[w]; };
  const ventaTotal = (w: number | 'mes'): number => grupos.reduce((s, g) => s + ventaOf(g, w), 0);

  const mOf = (a: AdsAgg, venta: number): number | null => {
    if (!a) return null;
    if (metrica === 'inversion') return a.costo || null;
    if (metrica === 'ventas') return a.ingresos || null;
    if (metrica === 'ordenes') return a.ordenes || null;
    if (metrica === 'roas') return a.costo > 0 ? a.ingresos / a.costo : null;
    return venta > 0 ? (a.costo / venta) * 100 : null; // pct
  };
  const mFmt = (v: number | null): string => v == null ? '—' : metrica === 'roas' ? v.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '×' : metrica === 'pct' ? fmtPct(v) : metrica === 'ordenes' ? fmtNum(v) : fmtK(v);

  const metricas: [string, string][] = [['inversion', 'Inversión'], ['ventas', 'Ventas x ads'], ['roas', 'ROAS'], ['pct', '% inversión'], ['ordenes', 'Órdenes']];

  // totales / heroes
  const invTot = totalAds.mes.costo, ingTot = totalAds.mes.ingresos, ordTot = totalAds.mes.ordenes;
  const roasTot = invTot > 0 ? ingTot / invTot : 0;
  const ventaMesTot = ventaTotal('mes');
  const pctTot = ventaMesTot > 0 ? (invTot / ventaMesTot) * 100 : null;
  const semPct = semColor(pctTot, semaforos.ads);

  // split por campaña (mes)
  const byCamp: Record<string, AdsAgg> = {};
  adsDia.forEach((r: AdsDia) => { const k = r.campania || '—'; (byCamp[k] ||= zeroAds()); byCamp[k].costo += r.costo; byCamp[k].ingresos += r.ingresos; byCamp[k].ordenes += r.ordenes; });
  const campanias = Object.entries(byCamp).sort((a, b) => b[1].costo - a[1].costo);

  const renderRow = (label: string, cell: { weeks: AdsAgg[]; mes: AdsAgg }, g: string | null, isTotal = false, marca?: string) => (
    <tr key={label} className={cn('border-t border-border-dim/30', isTotal ? 'bg-bg-accent/25 font-black' : 'hover:bg-bg-accent/10')}>
      <td className={cn('p-3 text-left whitespace-nowrap text-text-main', isTotal ? '' : 'font-bold')}>
        {marca && <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-2', marca === 'Craft Café' ? 'bg-amber-500' : 'bg-rose-500')} />}{label}
      </td>
      {[0, 1, 2, 3].map(w => {
        const v = mOf(cell.weeks[w], g ? ventaOf(g, w) : ventaTotal(w));
        const sc = metrica === 'pct' ? semColor(v, semaforos.ads) : 'n';
        return <td key={w} className="p-3 text-center font-mono tabular-nums text-text-main">
          {metrica === 'pct' && v != null ? <span className={cn('px-1.5 py-0.5 rounded border', SEM_BG[sc])}>{mFmt(v)}</span> : mFmt(v)}
        </td>;
      })}
      <td className="p-3 text-center font-mono tabular-nums font-black text-text-main bg-bg-accent/20">
        {(() => { const v = mOf(cell.mes, g ? ventaOf(g, 'mes') : ventaTotal('mes')); const sc = metrica === 'pct' ? semColor(v, semaforos.ads) : 'n'; return metrica === 'pct' && v != null ? <span className={cn('px-1.5 py-0.5 rounded border', SEM_BG[sc])}>{mFmt(v)}</span> : mFmt(v); })()}
      </td>
    </tr>
  );

  const rows: React.ReactNode[] = [];
  if (verPor === 'marca') ['Craft', 'Craft Café'].forEach(g => ads[g] && rows.push(renderRow(g, ads[g], g, false, g)));
  else {
    const byMarca: Record<string, string[]> = { 'Craft': [], 'Craft Café': [] };
    grupos.forEach(s => byMarca[deriveMarca(s)].push(s));
    (['Craft', 'Craft Café'] as const).forEach(mk => {
      if (!byMarca[mk].length) return;
      rows.push(<tr key={`h-${mk}`} className="bg-bg-accent/15"><td colSpan={6} className="px-3 py-1.5 text-left text-[9px] font-black uppercase tracking-widest text-text-dim">{mk}</td></tr>);
      byMarca[mk].forEach(s => ads[s] && rows.push(renderRow(s, ads[s], s, false, mk)));
    });
  }

  return (
    <div className="space-y-5">
      {/* heroes */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <HeroCard label="Inversión en ads" value={fmt(invTot)} sub={`${fmtNum(ordTot)} órdenes`} accent="amber" />
        <HeroCard label="Ventas por ads" value={fmt(ingTot)} sub="atribuidas a publicidad" accent="emerald" />
        <HeroCard label="ROAS" value={`${roasTot.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}×`} sub="ventas / inversión" accent="rose" />
        <div className={cn('p-4 rounded-xl border', SEM_BG[semPct])}>
          <div className="text-[9px] font-black uppercase tracking-widest opacity-80">% Inversión s/venta</div>
          <div className="text-2xl font-black font-mono mt-1">{fmtPct(pctTot)}</div>
          <div className="text-[10px] font-bold mt-0.5">meta 3%</div>
        </div>
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-bg-accent/30 p-1 rounded-lg border border-border-dim/60">
          {(['marca', 'local'] as const).map(v => (
            <button key={v} onClick={() => setVerPor(v)} className={cn('px-3 py-1.5 text-[10px] font-black uppercase rounded flex items-center gap-1.5', verPor === v ? 'bg-rose-600 text-white' : 'text-text-dim hover:text-text-main')}>
              {v === 'marca' ? <Tag size={11} /> : <Store size={11} />}{v === 'marca' ? 'Por marca' : 'Por local'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 bg-bg-accent/30 p-1 rounded-lg border border-border-dim/60">
          {metricas.map(([k, l]) => <button key={k} onClick={() => setMetrica(k as any)} className={cn('px-2.5 py-1.5 text-[10px] font-black uppercase rounded', metrica === k ? 'bg-rose-600 text-white' : 'text-text-dim hover:text-text-main')}>{l}</button>)}
        </div>
      </div>

      {/* tabla */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-lg overflow-x-auto">
        <table className="w-full text-[12px] border-collapse min-w-[680px]">
          <thead><tr className="bg-bg-accent/20 text-text-dim">
            <th className="p-3 text-left text-[9px] font-black uppercase tracking-widest">{verPor === 'marca' ? 'Marca' : 'Local'}</th>
            {SEM_RANGO.map((r, i) => <th key={i} className="p-3 text-center text-[9px] font-black uppercase tracking-widest">Sem {i + 1}<div className="text-[7px] opacity-60 font-bold">{r}</div></th>)}
            <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest bg-bg-accent/30">Mes</th>
          </tr></thead>
          <tbody>{rows}{renderRow('TOTAL', totalAds, null, true)}</tbody>
        </table>
      </div>
      {metrica === 'pct' && <p className="text-[10px] text-text-dim flex items-center gap-1.5"><Info size={12} /> % inversión usa la venta del resumen. Si una semana no tiene venta cargada, aparece “—”.</p>}

      {/* split por campaña */}
      <Panel title="Inversión por tipo de campaña (mes)">
        <table className="w-full text-[12px]">
          <thead><tr className="text-text-dim">
            <th className="p-2 text-left text-[9px] uppercase font-black">Campaña</th>
            <th className="p-2 text-right text-[9px] uppercase font-black">Inversión</th>
            <th className="p-2 text-right text-[9px] uppercase font-black">Ventas x ads</th>
            <th className="p-2 text-right text-[9px] uppercase font-black">ROAS</th>
            <th className="p-2 text-center text-[9px] uppercase font-black">Órdenes</th>
          </tr></thead>
          <tbody>
            {campanias.map(([c, v]) => (
              <tr key={c} className="border-t border-border-dim/25">
                <td className="p-2 text-left text-text-main font-bold">{c}</td>
                <td className="p-2 text-right font-mono text-amber-400">{fmt(v.costo)}</td>
                <td className="p-2 text-right font-mono text-emerald-400">{fmt(v.ingresos)}</td>
                <td className="p-2 text-right font-mono text-text-main">{v.costo > 0 ? (v.ingresos / v.costo).toFixed(1) + '×' : '—'}</td>
                <td className="p-2 text-center font-mono text-text-main">{fmtNum(v.ordenes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// OPERATIVO (conectividad + tiempo de preparación)
// ════════════════════════════════════════════════════════════════════════════
function OperativoTab({ ops, verPor, setVerPor, semaforos, onGoImport, month, loading }: any) {
  const [metrica, setMetrica] = useState<'no_disp' | 'rechazo' | 'espera' | 'prep' | 'reclamos' | 'listos'>('prep');
  if (loading && ops.length === 0) return <Loader />;
  if (ops.length === 0) return <Empty onGoImport={onGoImport} msg={`No hay datos operativos para ${monthLabel(month)}. Importá el resumen de Operaciones (Reportes → Operaciones → Descargar).`} />;

  const grupos: string[] = verPor === 'marca' ? ['Craft', 'Craft Café'] : Array.from(new Set(ops.map((r: OpsPeriodo) => r.sucursal))).sort() as string[];

  // acumulador por grupo × semana: suma tiempos y promedia %
  type Acc = { noDisp: number; prepSum: number; rechazo: number; espera: number; reclamos: number; listos: number; n: number };
  const zero = (): Acc => ({ noDisp: 0, prepSum: 0, rechazo: 0, espera: 0, reclamos: 0, listos: 0, n: 0 });
  const add = (a: Acc, r: OpsPeriodo) => { a.noDisp += r.no_disp_seg; a.prepSum += r.prep_seg; a.rechazo += r.rechazo; a.espera += r.espera; a.reclamos += r.reclamos; a.listos += r.listos; a.n += 1; };
  const val = (a: Acc): number | null => {
    if (!a || a.n === 0) return null;
    switch (metrica) {
      case 'no_disp': return a.noDisp / 3600;            // horas
      case 'prep': return (a.prepSum / a.n) / 60;         // minutos promedio
      case 'rechazo': return a.rechazo / a.n;
      case 'espera': return a.espera / a.n;
      case 'reclamos': return a.reclamos / a.n;
      case 'listos': return a.listos / a.n;
    }
  };
  const fmtV = (v: number | null): string => {
    if (v == null) return '—';
    if (metrica === 'no_disp') { const tot = Math.round(v * 60); const h = Math.floor(tot / 60), m = tot % 60; return h > 0 ? `${h}h ${m}m` : `${m}min`; }
    if (metrica === 'prep') return v.toLocaleString('es-AR', { maximumFractionDigits: 1 }) + ' min';
    return fmtPct(v, 2);
  };
  const semKeyOf: Record<string, string | null> = { no_disp: null, rechazo: 'cancelacion', espera: null, prep: 'prep', reclamos: 'reclamos', listos: 'listos' };
  const semKey = semKeyOf[metrica];

  // data[grupo] = { weeks[4], mes }
  const data: Record<string, { weeks: Acc[]; mesExp: Acc | null }> = {};
  const ens = (g: string) => (data[g] ||= { weeks: [zero(), zero(), zero(), zero()], mesExp: null });
  ops.forEach((r: OpsPeriodo) => {
    const g = verPor === 'marca' ? deriveMarca(r.sucursal) : r.sucursal;
    const c = ens(g);
    if (r.semana >= 1 && r.semana <= 4) add(c.weeks[r.semana - 1], r);
    else { (c.mesExp ||= zero()); add(c.mesExp, r); }
  });
  // mes: si hay semanas cargadas, promedia/su­ma esas; si no, usa el import "mes completo"
  const mesOf = (c: { weeks: Acc[]; mesExp: Acc | null }): Acc => {
    const wk = c.weeks.reduce((a, w) => { a.noDisp += w.noDisp; a.prepSum += w.prepSum; a.rechazo += w.rechazo; a.espera += w.espera; a.reclamos += w.reclamos; a.listos += w.listos; a.n += w.n; return a; }, zero());
    return wk.n > 0 ? wk : (c.mesExp || zero());
  };
  const totalCell = (which: number | 'mes'): Acc => {
    const t = zero();
    grupos.forEach(g => { const c = data[g]; if (!c) return; const src = which === 'mes' ? mesOf(c) : c.weeks[which]; t.noDisp += src.noDisp; t.prepSum += src.prepSum; t.rechazo += src.rechazo; t.espera += src.espera; t.reclamos += src.reclamos; t.listos += src.listos; t.n += src.n; });
    return t;
  };

  const metricas: [string, string][] = [['prep', 'Tiempo prep.'], ['no_disp', 'No disponible'], ['rechazo', 'Cancelaciones'], ['espera', 'Espera evit.'], ['reclamos', 'Reclamos'], ['listos', 'Marcados listos']];
  const cellNode = (a: Acc) => { const v = val(a); const sc = semKey ? semColor(v, semaforos[semKey]) : 'n'; return v == null ? <span className="text-text-dim">—</span> : semKey ? <span className={cn('px-1.5 py-0.5 rounded border font-mono', SEM_BG[sc])}>{fmtV(v)}</span> : <span className="font-mono text-text-main">{fmtV(v)}</span>; };
  const renderRow = (label: string, weeks: Acc[], mes: Acc, isTotal = false, marca?: string) => (
    <tr key={label} className={cn('border-t border-border-dim/30', isTotal ? 'bg-bg-accent/25 font-black' : 'hover:bg-bg-accent/10')}>
      <td className={cn('p-3 text-left whitespace-nowrap text-text-main', isTotal ? '' : 'font-bold')}>
        {marca && <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-2', marca === 'Craft Café' ? 'bg-amber-500' : 'bg-rose-500')} />}{label}
      </td>
      {[0, 1, 2, 3].map(w => <td key={w} className="p-3 text-center">{cellNode(weeks[w])}</td>)}
      <td className="p-3 text-center bg-bg-accent/20">{cellNode(mes)}</td>
    </tr>
  );

  const rows: React.ReactNode[] = [];
  if (verPor === 'marca') ['Craft', 'Craft Café'].forEach(g => data[g] && rows.push(renderRow(g, data[g].weeks, mesOf(data[g]), false, g)));
  else {
    const byMarca: Record<string, string[]> = { 'Craft': [], 'Craft Café': [] };
    grupos.forEach(s => byMarca[deriveMarca(s)].push(s));
    (['Craft', 'Craft Café'] as const).forEach(mk => {
      if (!byMarca[mk].length) return;
      rows.push(<tr key={`h-${mk}`} className="bg-bg-accent/15"><td colSpan={6} className="px-3 py-1.5 text-left text-[9px] font-black uppercase tracking-widest text-text-dim">{mk}</td></tr>);
      byMarca[mk].forEach(s => data[s] && rows.push(renderRow(s, data[s].weeks, mesOf(data[s]), false, mk)));
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-bg-accent/30 p-1 rounded-lg border border-border-dim/60">
          {(['marca', 'local'] as const).map(v => (
            <button key={v} onClick={() => setVerPor(v)} className={cn('px-3 py-1.5 text-[10px] font-black uppercase rounded flex items-center gap-1.5', verPor === v ? 'bg-rose-600 text-white' : 'text-text-dim hover:text-text-main')}>
              {v === 'marca' ? <Tag size={11} /> : <Store size={11} />}{v === 'marca' ? 'Por marca' : 'Por local'}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1 bg-bg-accent/30 p-1 rounded-lg border border-border-dim/60">
          {metricas.map(([k, l]) => <button key={k} onClick={() => setMetrica(k as any)} className={cn('px-2.5 py-1.5 text-[10px] font-black uppercase rounded', metrica === k ? 'bg-rose-600 text-white' : 'text-text-dim hover:text-text-main')}>{l}</button>)}
        </div>
      </div>

      <div className="bg-bg-sidebar border border-border-dim rounded-xl shadow-lg overflow-x-auto">
        <table className="w-full text-[12px] border-collapse min-w-[680px]">
          <thead><tr className="bg-bg-accent/20 text-text-dim">
            <th className="p-3 text-left text-[9px] font-black uppercase tracking-widest">{verPor === 'marca' ? 'Marca' : 'Local'}</th>
            {SEM_RANGO.map((r, i) => <th key={i} className="p-3 text-center text-[9px] font-black uppercase tracking-widest">Sem {i + 1}<div className="text-[7px] opacity-60 font-bold">{r}</div></th>)}
            <th className="p-3 text-center text-[9px] font-black uppercase tracking-widest bg-bg-accent/30">Mes</th>
          </tr></thead>
          <tbody>{rows}{renderRow('TOTAL', [totalCell(0), totalCell(1), totalCell(2), totalCell(3)], totalCell('mes'), true)}</tbody>
        </table>
      </div>
      <p className="text-[10px] text-text-dim flex items-center gap-1.5"><Info size={12} />
        {metrica === 'no_disp' ? ' Tiempo total que el local estuvo desconectado (menos es mejor).' :
         metrica === 'prep' ? ' Minutos promedio de preparación.' :
         metrica === 'rechazo' ? ' % de pedidos cancelados/rechazados de forma evitable.' :
         metrica === 'espera' ? ' % de órdenes con tiempo de espera evitable.' :
         metrica === 'reclamos' ? ' % de pedidos con reclamos de clientes.' :
         ' % de pedidos marcados como listos (más es mejor).'} Por marca, los % son promedio de los locales.
      </p>
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
      <div className="flex flex-wrap gap-2">
        {liquidaciones.map((q, i) => (
          <button key={q.period_start} onClick={() => setSel(i)}
            className={cn('px-3 py-2 rounded-lg text-[11px] font-black border transition-colors',
              i === Math.min(sel, liquidaciones.length - 1) ? 'bg-rose-600 text-white border-rose-600' : 'bg-bg-sidebar text-text-dim border-border-dim hover:text-text-main')}>
            {dmy(q.period_start)} – {dmy(q.period_end)}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <HeroCard label="Total liquidado" value={fmt(l.total_liquidado)} sub={`${dmy(l.period_start)} al ${dmy(l.period_end)}`} accent="emerald" />
        <HeroCard label="Comisión efectiva" value={fmtPct(pctVenta(l.servicios_pedidosya))} sub="sobre venta neta" accent="rose" />
        <HeroCard label="Inversión en ads" value={fmtPct(pctVenta(l.publicidad))} sub={`${fmt(l.publicidad)} · meta 3%`} accent="amber" />
      </div>
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
function ReclamosTab({ reclamos, comDia, semaforos, onGoImport }: { reclamos: Reclamo[]; comDia: ComDia[]; semaforos: Record<string, SemCfg>; onGoImport: () => void }) {
  if (reclamos.length === 0 && comDia.length === 0) return <Empty onGoImport={onGoImport} msg="No hay reclamos para este mes. Importá el estado de cuenta (Excel) de Pedidos Ya." />;
  const totalPedidos = comDia.reduce((s, r) => s + r.pedidos, 0);
  const recl = reclamos.filter(r => r.tipo === 'reclamo');
  const reint = reclamos.filter(r => r.tipo === 'reintegro');
  const nRecl = recl.length;
  const montoRecl = recl.reduce((s, r) => s + Math.abs(r.monto), 0);
  const montoReint = reint.reduce((s, r) => s + Math.abs(r.monto), 0);
  const tasa = totalPedidos > 0 ? (nRecl / totalPedidos) * 100 : null;
  const sem = semColor(tasa, semaforos.reclamos);
  const byMotivo: Record<string, { n: number; monto: number }> = {};
  recl.forEach(r => { const k = r.motivo || 'Sin motivo'; (byMotivo[k] ||= { n: 0, monto: 0 }); byMotivo[k].n++; byMotivo[k].monto += Math.abs(r.monto); });
  const motivos = Object.entries(byMotivo).sort((a, b) => b[1].n - a[1].n);
  const bySuc: Record<string, { n: number; monto: number }> = {};
  recl.forEach(r => { (bySuc[r.sucursal] ||= { n: 0, monto: 0 }); bySuc[r.sucursal].n++; bySuc[r.sucursal].monto += Math.abs(r.monto); });
  const sucursales = Object.entries(bySuc).sort((a, b) => b[1].monto - a[1].monto);
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
            <thead><tr className="text-text-dim"><th className="p-2 text-left text-[9px] uppercase font-black">Local</th><th className="p-2 text-center text-[9px] uppercase font-black">Reclamos</th><th className="p-2 text-right text-[9px] uppercase font-black">Costo</th></tr></thead>
            <tbody>{sucursales.length === 0 ? <tr><td colSpan={3} className="p-4 text-center text-text-dim text-[11px]">Sin reclamos</td></tr> :
              sucursales.map(([s, v]) => <tr key={s} className="border-t border-border-dim/25"><td className="p-2 text-left text-text-main">{s}</td><td className="p-2 text-center font-mono text-text-main">{v.n}</td><td className="p-2 text-right font-mono text-red-400">{fmt(v.monto)}</td></tr>)}
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
function ImportarTab({ isReadOnly, onDone, defMonth }: { isReadOnly: boolean; onDone: () => void; defMonth: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dy, dm] = defMonth.split('-').map(Number);
  const [anio, setAnio] = useState(dy);
  const [mes, setMes] = useState(dm);
  const [semana, setSemana] = useState(0); // 0 = mes completo
  useEffect(() => { setAnio(dy); setMes(dm); }, [dy, dm]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (isReadOnly) { alert(READONLY_MSG); return; }
    const arr = Array.from(files);
    const per = semana === 0 ? `${MESES[mes - 1]} ${anio} (mes completo)` : `${MESES[mes - 1]} ${anio} · Semana ${semana} (${SEM_RANGO[semana - 1]})`;
    if (!window.confirm(`¿Importar ${arr.length} archivo(s)?\n\n· ${arr.map(f => f.name).join('\n· ')}\n\nEl RESUMEN DE VENTAS (todos los locales) se cargará en: ${per}.\nEl estado de cuenta / PDF usan sus propias fechas.\n\nReimportar reemplaza esos datos, no los duplica.`)) return;
    setBusy(true); setMsg(null);
    const results: string[] = []; let anyErr = false;
    for (const file of arr) {
      try { results.push(`✓ ${file.name}: ${await importOne(file, { anio, mes, semana })}`); }
      catch (e: any) { anyErr = true; results.push(`✗ ${file.name}: ${e.message || e}`); }
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
          <span className="font-black text-amber-500 uppercase">Antes de importar.</span> La app reconoce cada archivo por su contenido:
          <ul className="mt-2 space-y-1 list-disc pl-4">
            <li><b className="text-text-main">Resumen de ventas – todos los locales</b> (Reportes → Ventas → Descargar) → venta, pedidos y ticket por local. Como no trae fechas, elegí abajo a qué <b>semana</b> corresponde.</li>
            <li><b className="text-text-main">Reporte detallado de campañas</b> (Publicidad en la app → Descargar) → inversión, ROAS y % de ads (usa sus fechas).</li>
            <li><b className="text-text-main">Resumen de Operaciones – todos los locales</b> (Reportes → Operaciones → Descargar) → no disponible, cancelaciones, espera, preparación, reclamos y marcados listos por local. Sin fechas: elegí abajo la <b>semana</b>.</li>
            <li><b className="text-text-main">Estado de cuenta (Excel)</b> → reclamos y detalle por pedido (usa sus fechas).</li>
            <li><b className="text-text-main">Estado de cuenta (PDF)</b> → liquidación / P&amp;L (período domingo a sábado).</li>
          </ul>
        </div>
      </div>

      {/* período para el resumen de ventas */}
      <div className="bg-bg-sidebar border border-border-dim rounded-xl p-4">
        <div className="text-[10px] font-black uppercase tracking-widest text-text-dim mb-2.5">Período del resumen de ventas (todos los locales)</div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={mes} onChange={e => setMes(Number(e.target.value))} className="bg-bg-accent border border-border-dim rounded-lg px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-rose-500">
            {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <input type="number" value={anio} onChange={e => setAnio(Number(e.target.value))} className="w-24 bg-bg-accent border border-border-dim rounded-lg px-3 py-2 text-[11px] font-bold text-text-main outline-none focus:border-rose-500" />
          <div className="flex gap-1 bg-bg-accent/40 p-1 rounded-lg border border-border-dim/60">
            {[0, 1, 2, 3, 4].map(w => (
              <button key={w} onClick={() => setSemana(w)}
                className={cn('px-2.5 py-1.5 text-[10px] font-black uppercase rounded', semana === w ? 'bg-rose-600 text-white' : 'text-text-dim hover:text-text-main')}>
                {w === 0 ? 'Mes' : `Sem ${w}`}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-text-dim font-bold">{semana === 0 ? 'todo el mes' : SEM_RANGO[semana - 1]}</span>
        </div>
      </div>

      <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
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
          msg.kind === 'ok' ? 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300' : 'bg-red-500/5 border-red-500/20 text-red-300')}>
          <div className="flex items-center gap-2 mb-2 font-black uppercase not-italic">
            {msg.kind === 'ok' ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} Resultado de la importación
          </div>
          {msg.text}
        </div>
      )}
    </div>
  );
}

// ── dispatch de importación ──────────────────────────────────────────────────
type ImpCtx = { anio: number; mes: number; semana: number };
async function importOne(file: File, ctx: ImpCtx): Promise<string> {
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'pdf') return importLiquidacionPDF(file);
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheets: Record<string, any[][]> = {};
  wb.SheetNames.forEach(n => { sheets[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }) as any[][]; });
  const first = sheets[wb.SheetNames[0]] || [];
  const headerTxt = first.slice(0, 5).flat().map((c: any) => norm(c).toLowerCase()).join(' ');
  if (headerTxt.includes('monto bruto de la venta') || (headerTxt.includes('sucursal') && headerTxt.includes('venta neta'))) {
    return importEstadoCuentaXLSX(sheets, wb.SheetNames);
  }
  if (headerTxt.includes('retorno de la inversi') || (headerTxt.includes('clicks') && headerTxt.includes('costo') && headerTxt.includes('ingresos'))) {
    return importAdsDetallado(sheets, wb.SheetNames);
  }
  if (headerTxt.includes('tiempo disponible programado') || headerTxt.includes('índice de tiempo de desconexión') || headerTxt.includes('indice de tiempo de desconexion')) {
    return importConectividad(sheets, wb.SheetNames);
  }
  if (headerTxt.includes('tiempo promedio de preparaci')) {
    return importPrep(sheets, wb.SheetNames);
  }
  if (headerTxt.includes('unavailable time') || headerTxt.includes('order rejection rate') || headerTxt.includes('marcados como listos') || headerTxt.includes('preparación promedio') || headerTxt.includes('preparacion promedio')) {
    return importOpsSummary(sheets, wb.SheetNames, ctx);
  }
  if ((headerTxt.includes('restaurant name') || headerTxt.includes('nombre del restaurante') || headerTxt.includes('local')) &&
      (headerTxt.includes('sales') || headerTxt.includes('ventas')) && headerTxt.includes('ticket')) {
    return importResumenVentas(sheets, wb.SheetNames, ctx);
  }
  throw new Error('archivo no reconocido (esperado: resumen de ventas, reporte de campañas, estado de cuenta Excel o PDF).');
}

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

// ── Resumen de Operaciones (opsSummary, todos los locales, por período) ───────
async function importOpsSummary(sheets: Record<string, any[][]>, names: string[], ctx: ImpCtx): Promise<string> {
  const rows = sheets[names[0]] || [];
  const f = findCols(rows, {
    name: ['nombre del restaurante', 'restaurant', 'nombre', 'local'],
    no_disp: ['unavailable time', 'tiempo no disponible', 'hora no disponible'],
    rechazo: ['order rejection', 'rejection rate', 'cancelaciones evitables'],
    espera: ['espera evitable', 'waiting', 'espera'],
    prep: ['preparación promedio', 'preparacion promedio', 'preparaci'],
    reclamos: ['customer complaints', 'complaints', 'pedidos con reclamos'],
    listos: ['marcados como listos', 'marked as ready', 'marcados'],
  });
  if (!f) throw new Error('no reconocí las columnas del resumen de operaciones.');
  const out: OpsPeriodo[] = [];
  for (let i = f.headerRow + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const sucursal = f.idx.name != null ? norm(r[f.idx.name]) : ''; if (!sucursal || /total/i.test(sucursal)) continue;
    out.push({
      anio: ctx.anio, mes: ctx.mes, semana: ctx.semana, sucursal, marca: deriveMarca(sucursal),
      no_disp_seg: f.idx.no_disp != null ? toNum(r[f.idx.no_disp]) : 0,
      rechazo: f.idx.rechazo != null ? toNum(r[f.idx.rechazo]) : 0,
      espera: f.idx.espera != null ? toNum(r[f.idx.espera]) : 0,
      prep_seg: f.idx.prep != null ? toNum(r[f.idx.prep]) : 0,
      reclamos: f.idx.reclamos != null ? toNum(r[f.idx.reclamos]) : 0,
      listos: f.idx.listos != null ? toNum(r[f.idx.listos]) : 0,
    });
  }
  if (out.length === 0) throw new Error('sin filas de locales válidas.');
  await supabase.from('py_operativo_periodo').delete().eq('anio', ctx.anio).eq('mes', ctx.mes).eq('semana', ctx.semana);
  const { error } = await supabase.from('py_operativo_periodo').insert(out);
  if (error) throw new Error('guardando operativo: ' + error.message);
  const per = ctx.semana === 0 ? `${MESES[ctx.mes - 1]} ${ctx.anio} (mes)` : `${MESES[ctx.mes - 1]} ${ctx.anio} · Sem ${ctx.semana}`;
  return `operaciones · ${out.length} locales → ${per}.`;
}

// ── Resumen de ventas (todos los locales, por período) ────────────────────────
async function importResumenVentas(sheets: Record<string, any[][]>, names: string[], ctx: ImpCtx): Promise<string> {
  const rows = sheets[names[0]] || [];
  const f = findCols(rows, {
    name: ['restaurant name', 'nombre del restaurante', 'local'],
    pedidos: ['pedidos', 'orders'], venta: ['sales', 'ventas', 'venta'], ticket: ['ticket promedio', 'ticket'],
  });
  if (!f) throw new Error('no reconocí las columnas del resumen de ventas.');
  const out: ComPeriodo[] = [];
  for (let i = f.headerRow + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const sucursal = norm(r[f.idx.name]); if (!sucursal || /total/i.test(sucursal)) continue;
    const pedidos = f.idx.pedidos != null ? Math.round(toNum(r[f.idx.pedidos])) : 0;
    const venta = f.idx.venta != null ? toNum(r[f.idx.venta]) : 0;
    if (pedidos === 0 && venta === 0) continue;
    const ticket = f.idx.ticket != null ? toNum(r[f.idx.ticket]) : (pedidos > 0 ? venta / pedidos : 0);
    out.push({ anio: ctx.anio, mes: ctx.mes, semana: ctx.semana, sucursal, marca: deriveMarca(sucursal), pedidos, venta, ticket });
  }
  if (out.length === 0) throw new Error('sin filas de locales válidas.');
  await supabase.from('py_comercial_periodo').delete().eq('anio', ctx.anio).eq('mes', ctx.mes).eq('semana', ctx.semana);
  const { error } = await supabase.from('py_comercial_periodo').insert(out);
  if (error) throw new Error('guardando resumen: ' + error.message);
  const per = ctx.semana === 0 ? `${MESES[ctx.mes - 1]} ${ctx.anio} (mes)` : `${MESES[ctx.mes - 1]} ${ctx.anio} · Sem ${ctx.semana}`;
  return `resumen de ventas · ${out.length} locales → ${per}.`;
}

// localiza la fila de encabezado que contiene todos los términos dados
function findHeaderRow(rows: any[][], must: string[], maxRows = 8): { headerRow: number; hdr: string[] } | null {
  for (let i = 0; i < Math.min(rows.length, maxRows); i++) {
    const hdr = (rows[i] || []).map((c: any) => norm(c).toLowerCase());
    if (must.every(m => hdr.some(c => c.includes(m)))) return { headerRow: i, hdr };
  }
  return null;
}

// ── Conectividad / desconexión (offlineDurationPerDay) ────────────────────────
async function importConectividad(sheets: Record<string, any[][]>, names: string[]): Promise<string> {
  const rows = sheets[names[0]] || [];
  const h = findHeaderRow(rows, ['fecha', 'programado']);
  if (!h) throw new Error('no reconocí las columnas de conectividad.');
  const localIdx = h.hdr.findIndex(c => c.includes('local') && !c.includes('id'));
  const fechaIdx = h.hdr.findIndex(c => c.includes('fecha'));
  const noDispIdx = h.hdr.findIndex(c => c.includes('tiempo no disponible') && !c.includes('motivo'));
  const progIdx = h.hdr.findIndex(c => c.includes('programado'));
  const map: Record<string, ConectDia> = {};
  const dates = new Set<string>();
  for (let i = h.headerRow + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const sucursal = localIdx >= 0 ? norm(r[localIdx]) : ''; const fecha = parseFechaISO(fechaIdx >= 0 ? r[fechaIdx] : '');
    if (!sucursal || !fecha) continue;
    dates.add(fecha);
    const a = (map[`${fecha}|${sucursal}`] ||= { fecha, sucursal, marca: deriveMarca(sucursal), min_no_disp: 0, min_prog: 0 });
    a.min_no_disp += noDispIdx >= 0 ? toNum(r[noDispIdx]) : 0;
    a.min_prog += progIdx >= 0 ? toNum(r[progIdx]) : 0;
  }
  const out = Object.values(map);
  if (out.length === 0) throw new Error('sin filas de conectividad válidas.');
  const dateArr = Array.from(dates);
  for (let i = 0; i < dateArr.length; i += 200) await supabase.from('py_conectividad_dia').delete().in('fecha', dateArr.slice(i, i + 200));
  for (let i = 0; i < out.length; i += 400) { const { error } = await supabase.from('py_conectividad_dia').insert(out.slice(i, i + 400)); if (error) throw new Error('guardando conectividad: ' + error.message); }
  const s = dateArr.sort();
  return `conectividad · ${out.length} filas (${dmy(s[0])}–${dmy(s[s.length - 1])}).`;
}

// ── Tiempo de preparación (preparationTimePerDay) ─────────────────────────────
async function importPrep(sheets: Record<string, any[][]>, names: string[]): Promise<string> {
  const rows = sheets[names[0]] || [];
  const h = findHeaderRow(rows, ['fecha', 'preparaci']);
  if (!h) throw new Error('no reconocí las columnas de tiempo de preparación.');
  const localIdx = h.hdr.findIndex(c => c.includes('local') && !c.includes('id'));
  const fechaIdx = h.hdr.findIndex(c => c.includes('fecha'));
  const prepIdx = h.hdr.findIndex(c => c.includes('preparaci'));
  const demIdx = h.hdr.findIndex(c => c.includes('pedidos demorados'));
  const tasaIdx = h.hdr.findIndex(c => c.includes('tasa de pedidos demorados'));
  const map: Record<string, PrepDia> = {};
  const dates = new Set<string>();
  for (let i = h.headerRow + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const sucursal = localIdx >= 0 ? norm(r[localIdx]) : ''; const fecha = parseFechaISO(fechaIdx >= 0 ? r[fechaIdx] : '');
    if (!sucursal || !fecha) continue;
    dates.add(fecha);
    const prep_min = prepIdx >= 0 ? toNum(r[prepIdx]) : 0;
    const dem = demIdx >= 0 ? Math.round(toNum(r[demIdx])) : 0;
    const tasa = tasaIdx >= 0 ? toNum(r[tasaIdx]) : 0;
    const total = tasa > 0 ? Math.round(dem / (tasa / 100)) : 0;
    map[`${fecha}|${sucursal}`] = { fecha, sucursal, marca: deriveMarca(sucursal), prep_min, demorados: dem, total };
  }
  const out = Object.values(map);
  if (out.length === 0) throw new Error('sin filas de preparación válidas.');
  const dateArr = Array.from(dates);
  for (let i = 0; i < dateArr.length; i += 200) await supabase.from('py_prep_dia').delete().in('fecha', dateArr.slice(i, i + 200));
  for (let i = 0; i < out.length; i += 400) { const { error } = await supabase.from('py_prep_dia').insert(out.slice(i, i + 400)); if (error) throw new Error('guardando preparación: ' + error.message); }
  const s = dateArr.sort();
  return `tiempo de preparación · ${out.length} filas (${dmy(s[0])}–${dmy(s[s.length - 1])}).`;
}

// ── Reporte detallado de campañas (ADS, por día) ──────────────────────────────
async function importAdsDetallado(sheets: Record<string, any[][]>, names: string[]): Promise<string> {
  const rows = sheets[names[0]] || [];
  const f = findCols(rows, {
    fecha: ['fecha'], local: ['nombre del local', 'local'], campania: ['añadir producto', 'campaña', 'campania'],
    clicks: ['clicks'], ordenes: ['órdenes', 'ordenes'], ingresos: ['ingresos'], costo: ['costo'],
  });
  if (!f) throw new Error('no reconocí las columnas del reporte de campañas.');
  const map: Record<string, AdsDia> = {};
  const dates = new Set<string>();
  for (let i = f.headerRow + 1; i < rows.length; i++) {
    const r = rows[i]; if (!r) continue;
    const fecha = parseFechaISO(f.idx.fecha != null ? r[f.idx.fecha] : ''); if (!fecha) continue;
    const sucursal = f.idx.local != null ? norm(r[f.idx.local]) : ''; if (!sucursal) continue;
    const campania = f.idx.campania != null ? (norm(r[f.idx.campania]) || '—') : '—';
    dates.add(fecha);
    const key = `${fecha}|${sucursal}|${campania}`;
    const a = (map[key] ||= { fecha, sucursal, marca: deriveMarca(sucursal), campania, clicks: 0, ordenes: 0, ingresos: 0, costo: 0 });
    a.clicks += f.idx.clicks != null ? Math.round(toNum(r[f.idx.clicks])) : 0;
    a.ordenes += f.idx.ordenes != null ? Math.round(toNum(r[f.idx.ordenes])) : 0;
    a.ingresos += f.idx.ingresos != null ? toNum(r[f.idx.ingresos]) : 0;
    a.costo += f.idx.costo != null ? toNum(r[f.idx.costo]) : 0;
  }
  const out = Object.values(map);
  if (out.length === 0) throw new Error('sin filas de campañas válidas.');
  const dateArr = Array.from(dates);
  for (let i = 0; i < dateArr.length; i += 200) await supabase.from('py_ads_dia').delete().in('fecha', dateArr.slice(i, i + 200));
  for (let i = 0; i < out.length; i += 400) { const { error } = await supabase.from('py_ads_dia').insert(out.slice(i, i + 400)); if (error) throw new Error('guardando ads: ' + error.message); }
  const sorted = dateArr.sort();
  const inv = out.reduce((s, r) => s + r.costo, 0);
  return `campañas · ${out.length} filas (${dmy(sorted[0])}–${dmy(sorted[sorted.length - 1])}), inversión ${fmt(inv)}.`;
}

// ── Estado de cuenta XLSX (reclamos + pedidos por día para tasa) ───────────────
async function importEstadoCuentaXLSX(sheets: Record<string, any[][]>, names: string[]): Promise<string> {
  const s1 = sheets[names[0]] || [];
  const found = findCols(s1, {
    sucursal: ['sucursal'], fecha: ['fecha de pedido', 'fecha del pedido', 'fecha'],
    bruto: ['monto bruto de la venta'], neta: ['monto de venta neta', 'venta neta'],
    comision: ['servicio ventas pedidoya ($)', 'servicio ventas pedidosya ($)'],
    pago: ['método de pago', 'metodo de pago'], entrega: ['método de entrega', 'metodo de entrega'],
  });
  if (!found) throw new Error('no reconocí las columnas del estado de cuenta.');
  const { headerRow, idx } = found;
  type Acc = { fecha: string; sucursal: string; marca: string; pedidos: number; venta_bruta: number; venta_neta: number; comision: number; venta_app: number; venta_fuera_app: number; pedidos_app: number; pedidos_fuera_app: number; venta_envio: number; venta_retiro: number; pedidos_envio: number; pedidos_retiro: number; descuentos: number; rechazados: number };
  const map: Record<string, Acc> = {};
  const dates = new Set<string>();
  for (let i = headerRow + 1; i < s1.length; i++) {
    const r = s1[i]; if (!r) continue;
    const sucursal = norm(r[idx.sucursal]); if (!sucursal) continue;
    const fecha = parseFechaISO(r[idx.fecha]); if (!fecha) continue;
    dates.add(fecha);
    const key = `${fecha}|${sucursal}`;
    const a = (map[key] ||= { fecha, sucursal, marca: deriveMarca(sucursal), pedidos: 0, venta_bruta: 0, venta_neta: 0, comision: 0, venta_app: 0, venta_fuera_app: 0, pedidos_app: 0, pedidos_fuera_app: 0, venta_envio: 0, venta_retiro: 0, pedidos_envio: 0, pedidos_retiro: 0, descuentos: 0, rechazados: 0 });
    const bruto = toNum(r[idx.bruto]);
    const neta = idx.neta != null ? toNum(r[idx.neta]) : bruto;
    a.pedidos += 1; a.venta_bruta += bruto; a.venta_neta += neta;
    a.comision += idx.comision != null ? toNum(r[idx.comision]) : 0;
    const pago = idx.pago != null ? norm(r[idx.pago]).toLowerCase() : '';
    if (pago.includes('fuera')) { a.venta_fuera_app += neta; a.pedidos_fuera_app += 1; } else { a.venta_app += neta; a.pedidos_app += 1; }
    const entrega = idx.entrega != null ? norm(r[idx.entrega]).toLowerCase() : '';
    if (entrega.includes('retiro') || entrega.includes('pickup')) { a.venta_retiro += neta; a.pedidos_retiro += 1; } else { a.venta_envio += neta; a.pedidos_envio += 1; }
  }
  const comRows = Object.values(map);
  if (comRows.length === 0) throw new Error('sin filas de pedidos válidas.');

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
      reclamoRows.push({ fecha, sucursal, marca: deriveMarca(sucursal), tipo, nro_pedido: f.idx.nro != null ? norm(r[f.idx.nro]) : null, motivo: f.idx.motivo != null ? norm(r[f.idx.motivo]) : null, monto });
    }
  };
  if (names[1]) parseReclamoSheet(sheets[names[1]], 'reclamo');
  if (names[2]) parseReclamoSheet(sheets[names[2]], 'reintegro');

  const dateArr = Array.from(dates);
  const CHUNK = 400;
  for (let i = 0; i < dateArr.length; i += 200) await supabase.from('py_comercial_dia').delete().in('fecha', dateArr.slice(i, i + 200));
  for (let i = 0; i < comRows.length; i += CHUNK) { const { error } = await supabase.from('py_comercial_dia').insert(comRows.slice(i, i + CHUNK)); if (error) throw new Error('guardando comercial: ' + error.message); }
  if (reclamoRows.length > 0) {
    for (let i = 0; i < dateArr.length; i += 200) await supabase.from('py_reclamos').delete().in('fecha', dateArr.slice(i, i + 200));
    for (let i = 0; i < reclamoRows.length; i += CHUNK) { const { error } = await supabase.from('py_reclamos').insert(reclamoRows.slice(i, i + CHUNK)); if (error) throw new Error('guardando reclamos: ' + error.message); }
  }
  const sorted = dateArr.sort();
  return `estado de cuenta · ${comRows.length} filas (${dmy(sorted[0])}–${dmy(sorted[sorted.length - 1])}), ${reclamoRows.length} reclamos/reintegros.`;
}

// ── Estado de cuenta PDF (liquidación) ────────────────────────────────────────
async function importLiquidacionPDF(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let p = 1; p <= pdf.numPages; p++) { const page = await pdf.getPage(p); const content = await page.getTextContent(); text += ' ' + content.items.map((it: any) => it.str).join(' '); }
  const T = text.replace(/\s+/g, ' ');
  const per = T.match(/del\s+(\d{2}\/\d{2}\/\d{4})\s+al\s+(\d{2}\/\d{2}\/\d{4})/i);
  const period_start = per ? parseFechaISO(per[1]) : null;
  const period_end = per ? parseFechaISO(per[2]) : null;
  if (!period_start || !period_end) throw new Error('no encontré el período en el PDF.');
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
  const upd = (k: string, field: 'verde' | 'amarillo', v: string) => setLocal(prev => ({ ...prev, [k]: { ...prev[k], [field]: parseFloat(v.replace(',', '.')) || 0 } }));
  const save = async () => {
    if (isReadOnly) { alert(READONLY_MSG); return; }
    setSaving(true);
    const { error } = await supabase.from('py_config').upsert({ key: 'semaforos', value: local, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    setSaving(false);
    if (error) { alert('Error al guardar: ' + error.message); return; }
    onSaved(local); alert('Umbrales de semáforos guardados.');
  };
  return (
    <div className="space-y-4 max-w-2xl">
      <p className="text-[11px] text-text-dim"><b className="text-text-main">Verde</b> hasta el primer valor, <b className="text-text-main">amarillo</b> hasta el segundo, <b className="text-text-main">rojo</b> más allá (para variación de venta es al revés: verde por encima).</p>
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
                <td className="p-2 text-center"><input value={String(local[k]?.verde ?? '')} onChange={e => upd(k, 'verde', e.target.value)} className="w-20 px-2 py-1.5 bg-bg-accent border border-border-dim rounded text-center font-mono text-text-main outline-none focus:border-rose-500" /></td>
                <td className="p-2 text-center"><input value={String(local[k]?.amarillo ?? '')} onChange={e => upd(k, 'amarillo', e.target.value)} className="w-20 px-2 py-1.5 bg-bg-accent border border-border-dim rounded text-center font-mono text-text-main outline-none focus:border-rose-500" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider">
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Guardar umbrales
        </button>
        <button onClick={() => setLocal(DEFAULT_SEMAFOROS)} className="flex items-center gap-2 bg-bg-accent hover:bg-bg-accent/70 text-text-dim px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider">
          <Trash2 size={14} /> Restaurar por defecto
        </button>
      </div>
    </div>
  );
}

// ── UI helpers ───────────────────────────────────────────────────────────────
function Loader() { return <div className="flex flex-col items-center justify-center py-20 gap-3"><RefreshCw size={24} className="animate-spin text-rose-500" /><span className="text-[10px] text-text-dim font-black uppercase tracking-widest">Cargando…</span></div>; }
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
