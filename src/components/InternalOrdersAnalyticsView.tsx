/**
 * Análisis de Pedidos Internos.
 * Solo lectura: lee internal_orders + internal_order_items y calcula KPIs.
 */
import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, BarChart3, Loader2, Calendar, Package, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface Props { branches: Branch[]; onBack: () => void; }
interface OrderRow { id: string; branch_id: string; order_type: string; order_date: string; delivery_date: string; status?: string; }
interface ItemRow { order_id: string; item_name: string; category: string | null; quantity: number; received: boolean | null; received_qty: number | null; }

const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const monthLabel = (m: string) => { const [y, mm] = m.split('-'); return `${meses[parseInt(mm,10)-1]} ${y}`; };
const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 });

export default function InternalOrdersAnalyticsView({ branches, onBack }: Props) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [branchFilter, setBranchFilter] = useState('all');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [dayMode, setDayMode] = useState<'pedidas' | 'recibidas'>('pedidas');

  const branchName = (id: string) => branches.find(b => b.id === id)?.name || id;

  useEffect(() => {
    setLoading(true);
    (async () => {
      const start = `${month}-01`;
      const [y, m] = month.split('-').map(Number);
      const end = `${month}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
      // Pedidos del mes (por fecha de pedido) - paginado por robustez
      const ords: OrderRow[] = [];
      let fromO = 0;
      const PAGE_O = 1000;
      while (true) {
        const { data: ordersData, error } = await supabase
          .from('internal_orders')
          .select('id, branch_id, order_type, order_date, delivery_date, status')
          .gte('order_date', start).lte('order_date', end)
          .range(fromO, fromO + PAGE_O - 1);
        if (error || !ordersData || ordersData.length === 0) break;
        ords.push(...(ordersData as OrderRow[]));
        if (ordersData.length < PAGE_O) break;
        fromO += PAGE_O;
      }
      setOrders(ords);
      // Items de esos pedidos (paginado para superar el límite de 1000 filas de Supabase)
      if (ords.length > 0) {
        const ids = ords.map(o => o.id);
        const allItems: ItemRow[] = [];
        const CHUNK = 200; // pedir por lotes de order_ids para no armar un IN gigante
        for (let c = 0; c < ids.length; c += CHUNK) {
          const idsChunk = ids.slice(c, c + CHUNK);
          let from = 0;
          const PAGE = 1000;
          // paginar dentro de cada lote por si un lote supera 1000 items
          while (true) {
            const { data: itemsData, error } = await supabase
              .from('internal_order_items')
              .select('order_id, item_name, category, quantity, received, received_qty')
              .in('order_id', idsChunk)
              .range(from, from + PAGE - 1);
            if (error || !itemsData || itemsData.length === 0) break;
            allItems.push(...(itemsData as ItemRow[]));
            if (itemsData.length < PAGE) break;
            from += PAGE;
          }
        }
        setItems(allItems);
      } else {
        setItems([]);
      }
      setLoading(false);
    })();
  }, [month]);

  // Filtrar por sucursal
  const fOrders = useMemo(() => branchFilter === 'all' ? orders : orders.filter(o => o.branch_id === branchFilter), [orders, branchFilter]);
  const fOrderIds = useMemo(() => new Set(fOrders.map(o => o.id)), [fOrders]);
  const fItems = useMemo(() => items.filter(i => fOrderIds.has(i.order_id)), [items, fOrderIds]);

  // KPIs generales
  const kpis = useMemo(() => {
    const totalPedidos = fOrders.length;
    const recibidos = fOrders.filter(o => o.status === 'recibido');
    // Pedidos con faltantes: algún item no recibido o parcial
    const idsConFaltante = new Set<string>();
    fItems.forEach(it => {
      const order = fOrders.find(o => o.id === it.order_id);
      if (order?.status !== 'recibido') return;
      const noRec = it.received === false;
      const parcial = it.received !== false && it.received_qty != null && Number(it.received_qty) !== Number(it.quantity);
      if (noRec || parcial) idsConFaltante.add(it.order_id);
    });
    const completos = recibidos.length - idsConFaltante.size;
    // Unidades pedidas vs recibidas (sobre pedidos recibidos)
    let pedidas = 0, recibidasU = 0;
    fItems.forEach(it => {
      pedidas += Number(it.quantity) || 0;
      const order = fOrders.find(o => o.id === it.order_id);
      if (order?.status === 'recibido') {
        recibidasU += it.received === false ? 0 : (it.received_qty != null ? Number(it.received_qty) : Number(it.quantity));
      }
    });
    // Cumplimiento: recibido / pedido SOLO sobre pedidos recibidos
    let pedidasRec = 0;
    fItems.forEach(it => {
      const order = fOrders.find(o => o.id === it.order_id);
      if (order?.status === 'recibido') pedidasRec += Number(it.quantity) || 0;
    });
    const cumplimiento = pedidasRec > 0 ? (recibidasU / pedidasRec) * 100 : null;
    return { totalPedidos, recibidos: recibidos.length, completos, conFaltantes: idsConFaltante.size, pedidas, recibidasU, cumplimiento };
  }, [fOrders, fItems]);

  // Ranking artículos más pedidos
  // Ranking artículos MÁS RECIBIDOS (cantidad realmente recibida, tal cual se cargó)
  const topPedidos = useMemo(() => {
    const map: Record<string, number> = {};
    fItems.forEach(it => {
      const order = fOrders.find(o => o.id === it.order_id);
      if (order?.status !== 'recibido') return; // solo cuenta lo efectivamente recibido
      const rec = it.received === false ? 0 : (it.received_qty != null ? Number(it.received_qty) : Number(it.quantity));
      if (rec > 0) map[it.item_name] = (map[it.item_name] || 0) + rec;
    });
    return Object.entries(map).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 20);
  }, [fItems, fOrders]);

  // Ranking artículos con más faltantes (pedido - recibido, sobre recibidos)
  const topFaltantes = useMemo(() => {
    const map: Record<string, number> = {};
    fItems.forEach(it => {
      const order = fOrders.find(o => o.id === it.order_id);
      if (order?.status !== 'recibido') return;
      const rec = it.received === false ? 0 : (it.received_qty != null ? Number(it.received_qty) : Number(it.quantity));
      const falta = (Number(it.quantity) || 0) - rec;
      if (falta > 0) map[it.item_name] = (map[it.item_name] || 0) + falta;
    });
    return Object.entries(map).map(([name, qty]) => ({ name, qty })).sort((a, b) => b.qty - a.qty).slice(0, 20);
  }, [fItems, fOrders]);

  // Lista de insumos que aparecen en los pedidos filtrados (para el selector)
  const itemNames = useMemo(() => {
    return Array.from(new Set(fItems.map(i => i.item_name))).sort((a: string, b: string) => a.localeCompare(b));
  }, [fItems]);

  // Serie por día del insumo elegido (pedidas o recibidas según el modo)
  const porDia = useMemo(() => {
    if (!selectedItem) return [];
    const fechaDe: Record<string, string> = {};
    fOrders.forEach(o => { fechaDe[o.id] = o.order_date; });
    const map: Record<string, number> = {};
    fItems.forEach(it => {
      if (it.item_name !== selectedItem) return;
      const fecha = fechaDe[it.order_id];
      if (!fecha) return;
      const d = fecha.split('-')[2];
      let val = 0;
      if (dayMode === 'pedidas') {
        val = Number(it.quantity) || 0;
      } else {
        const order = fOrders.find(o => o.id === it.order_id);
        if (order?.status === 'recibido') {
          val = it.received === false ? 0 : (it.received_qty != null ? Number(it.received_qty) : Number(it.quantity));
        }
      }
      map[d] = (map[d] || 0) + val;
    });
    return Object.entries(map).map(([dia, valor]) => ({ dia, valor })).sort((a, b) => parseInt(a.dia, 10) - parseInt(b.dia, 10));
  }, [fOrders, fItems, selectedItem, dayMode]);

  // Desglose por sucursal / tipo / estado
  const porSucursal = useMemo(() => {
    const map: Record<string, number> = {};
    fOrders.forEach(o => { map[o.branch_id] = (map[o.branch_id] || 0) + 1; });
    return Object.entries(map).map(([id, n]) => ({ name: branchName(id), n })).sort((a, b) => b.n - a.n);
  }, [fOrders]);
  const porTipo = useMemo(() => {
    const c = fOrders.filter(o => o.order_type === 'compras').length;
    const p = fOrders.filter(o => o.order_type !== 'compras').length;
    return { compras: c, produccion: p };
  }, [fOrders]);
  const porEstado = useMemo(() => {
    const map: Record<string, number> = {};
    fOrders.forEach(o => { const s = o.status || 'pendiente'; map[s] = (map[s] || 0) + 1; });
    return map;
  }, [fOrders]);

  const realBranches = branches.filter(b => b.id && b.id !== 'all');

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-bg-card border border-border-dim rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="text-text-dim hover:text-brand-500 p-1" title="Volver"><ArrowLeft size={18} /></button>
            <BarChart3 size={20} className="text-brand-500" />
            <div>
              <h2 className="text-base font-black uppercase text-text-main tracking-wide">Análisis de Pedidos</h2>
              <p className="text-[10px] text-text-dim font-bold uppercase">{branchFilter === 'all' ? 'Todas las sucursales' : branchName(branchFilter)} · {monthLabel(month)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)}
              className="bg-bg-sidebar border border-border-dim rounded-lg px-3 py-2 text-[10px] font-extrabold uppercase text-text-main outline-none cursor-pointer">
              <option value="all">Todas las sucursales</option>
              {realBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <div className="bg-bg-sidebar border border-border-dim rounded-lg px-3 py-1.5 flex items-center gap-2 font-mono">
              <Calendar size={14} className="text-brand-500" />
              <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                className="bg-transparent border-none text-[10px] font-extrabold uppercase text-text-main outline-none cursor-pointer" />
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-text-dim"><Loader2 size={24} className="animate-spin mx-auto" /></div>
      ) : fOrders.length === 0 ? (
        <div className="bg-bg-card border border-border-dim rounded-xl p-16 text-center text-[11px] font-bold uppercase text-text-dim tracking-widest">
          No hay pedidos en el período seleccionado
        </div>
      ) : (
        <>
          {/* Tarjetas resumen */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-bg-card border border-border-dim rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-1"><Package size={12} className="text-brand-500" /><p className="text-[8px] font-black uppercase tracking-widest text-text-dim">Pedidos del mes</p></div>
              <p className="text-2xl font-mono font-black text-text-main">{kpis.totalPedidos}</p>
            </div>
            <div className="bg-bg-card border border-border-dim rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-1"><CheckCircle2 size={12} className="text-emerald-500" /><p className="text-[8px] font-black uppercase tracking-widest text-text-dim">Recibidos completos</p></div>
              <p className="text-2xl font-mono font-black text-emerald-500">{kpis.completos}</p>
              <p className="text-[8px] font-bold text-text-dim mt-0.5">de {kpis.recibidos} recibidos</p>
            </div>
            <div className="bg-bg-card border border-border-dim rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-1"><AlertTriangle size={12} className="text-red-500" /><p className="text-[8px] font-black uppercase tracking-widest text-text-dim">Con faltantes</p></div>
              <p className="text-2xl font-mono font-black text-red-500">{kpis.conFaltantes}</p>
            </div>
            <div className="bg-bg-card border border-border-dim rounded-xl p-4">
              <div className="flex items-center gap-1.5 mb-1"><TrendingUp size={12} className="text-brand-500" /><p className="text-[8px] font-black uppercase tracking-widest text-text-dim">Cumplimiento</p></div>
              <p className="text-2xl font-mono font-black text-text-main">{kpis.cumplimiento != null ? `${fmt(kpis.cumplimiento)}%` : '—'}</p>
              <p className="text-[8px] font-bold text-text-dim mt-0.5">recibido vs pedido</p>
            </div>
          </div>

          {/* Pedidos vs recibidos (unidades) */}
          <div className="bg-bg-card border border-border-dim rounded-xl p-5">
            <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-3">Unidades pedidas vs recibidas</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-bg-accent/30 rounded-lg p-4">
                <p className="text-[8px] font-black uppercase tracking-widest text-text-dim">Pedidas</p>
                <p className="text-xl font-mono font-black text-text-main">{fmt(kpis.pedidas)}</p>
              </div>
              <div className="bg-bg-accent/30 rounded-lg p-4">
                <p className="text-[8px] font-black uppercase tracking-widest text-text-dim">Recibidas (sobre recibidos)</p>
                <p className="text-xl font-mono font-black text-emerald-500">{fmt(kpis.recibidasU)}</p>
              </div>
            </div>
          </div>

          {/* Evolución por día de un insumo elegido */}
          <div className="bg-bg-card border border-border-dim rounded-xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Evolución por día de un insumo</h3>
              <div className="flex flex-wrap items-center gap-2">
                {/* Toggle pedidas / recibidas */}
                <div className="flex gap-1 bg-bg-accent/40 rounded-lg p-1">
                  <button onClick={() => setDayMode('pedidas')}
                    className={`px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all ${dayMode === 'pedidas' ? 'bg-brand-500 text-black' : 'text-text-dim'}`}>
                    Pedidas
                  </button>
                  <button onClick={() => setDayMode('recibidas')}
                    className={`px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all ${dayMode === 'recibidas' ? 'bg-brand-500 text-black' : 'text-text-dim'}`}>
                    Recibidas
                  </button>
                </div>
                {/* Selector de insumo */}
                <select value={selectedItem} onChange={e => setSelectedItem(e.target.value)}
                  className="bg-bg-sidebar border border-border-dim rounded-lg px-3 py-2 text-[10px] font-extrabold uppercase text-text-main outline-none cursor-pointer max-w-[220px]">
                  <option value="">Elegí un insumo...</option>
                  {itemNames.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </div>
            {!selectedItem ? (
              <div className="py-16 text-center text-[11px] font-bold uppercase text-text-dim tracking-widest">Elegí un insumo para ver su evolución diaria</div>
            ) : porDia.length === 0 ? (
              <div className="py-16 text-center text-[11px] font-bold uppercase text-text-dim tracking-widest">Sin {dayMode} de "{selectedItem}" en el período</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={porDia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#8883" />
                  <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="valor" name={dayMode === 'pedidas' ? 'Pedidas' : 'Recibidas'} fill="#e31e24" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Rankings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-bg-card border border-border-dim rounded-xl p-5">
              <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-3">Top 20 más recibidos</h3>
              {topPedidos.length === 0 ? <p className="text-[10px] text-text-dim">Sin datos</p> : (
                <div className="space-y-1.5">
                  {topPedidos.map((r, i) => (
                    <div key={r.name} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-text-main font-bold truncate"><span className="text-text-dim font-mono mr-2">{i+1}.</span>{r.name}</span>
                      <span className="font-mono font-black text-brand-500 shrink-0">{fmt(r.qty)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="bg-bg-card border border-border-dim rounded-xl p-5">
              <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-3">Top 20 con más faltantes</h3>
              {topFaltantes.length === 0 ? <p className="text-[10px] text-text-dim">Sin faltantes registrados</p> : (
                <div className="space-y-1.5">
                  {topFaltantes.map((r, i) => (
                    <div key={r.name} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="text-text-main font-bold truncate"><span className="text-text-dim font-mono mr-2">{i+1}.</span>{r.name}</span>
                      <span className="font-mono font-black text-red-500 shrink-0">-{fmt(r.qty)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Desgloses */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-bg-card border border-border-dim rounded-xl p-5">
              <h3 className="text-[10px] font-black uppercase text-text-main tracking-widest mb-3">Por sucursal</h3>
              <div className="space-y-1.5">
                {porSucursal.map(s => (
                  <div key={s.name} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-text-main font-bold truncate">{s.name}</span>
                    <span className="font-mono font-black text-text-main shrink-0">{s.n}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-bg-card border border-border-dim rounded-xl p-5">
              <h3 className="text-[10px] font-black uppercase text-text-main tracking-widest mb-3">Por tipo</h3>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex items-center justify-between"><span className="text-text-main font-bold">Compras</span><span className="font-mono font-black text-text-main">{porTipo.compras}</span></div>
                <div className="flex items-center justify-between"><span className="text-text-main font-bold">Producción</span><span className="font-mono font-black text-text-main">{porTipo.produccion}</span></div>
              </div>
            </div>
            <div className="bg-bg-card border border-border-dim rounded-xl p-5">
              <h3 className="text-[10px] font-black uppercase text-text-main tracking-widest mb-3">Por estado</h3>
              <div className="space-y-1.5 text-[11px]">
                {Object.entries(porEstado).map(([est, n]) => (
                  <div key={est} className="flex items-center justify-between"><span className="text-text-main font-bold capitalize">{est}</span><span className="font-mono font-black text-text-main">{n}</span></div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
