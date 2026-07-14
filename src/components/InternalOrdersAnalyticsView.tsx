/**
 * Análisis de Pedidos Internos.
 * Solo lectura: lee internal_orders + internal_order_items y calcula KPIs.
 */
import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, BarChart3, Loader2, Calendar, Package, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Branch } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { cn } from '@/src/lib/utils';

interface Props { branches: Branch[]; onBack: () => void; }
interface OrderRow { id: string; branch_id: string; order_type: string; order_date: string; delivery_date: string; status?: string; }
interface ItemRow { order_id: string; item_name: string; category: string | null; quantity: number; received: boolean | null; received_qty: number | null; unit_cost: number | null; }
interface SaleRow { branch_id: string; date: string; net_sales: number | null; }

const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const monthLabel = (m: string) => { const [y, mm] = m.split('-'); return `${meses[parseInt(mm,10)-1]} ${y}`; };
const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 1 });

export default function InternalOrdersAnalyticsView({ branches, onBack }: Props) {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [branchFilter, setBranchFilter] = useState('all');
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [prevOrders, setPrevOrders] = useState<OrderRow[]>([]);
  const [prevItems, setPrevItems] = useState<ItemRow[]>([]);
  const [sales, setSales] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<string>('');
  const [dayMode, setDayMode] = useState<'pedidas' | 'recibidas'>('pedidas');
  const [modoComparacion, setModoComparacion] = useState<'mismos-dias' | 'mes-completo'>('mismos-dias');

  const branchName = (id: string) => branches.find(b => b.id === id)?.name || id;

  useEffect(() => {
    setLoading(true);
    (async () => {
      const rangoDe = (ym: string) => {
        const [yy, mm] = ym.split('-').map(Number);
        return { start: `${ym}-01`, end: `${ym}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}` };
      };
      const prevMonthOf = (ym: string) => {
        const [yy, mm] = ym.split('-').map(Number);
        const d = new Date(yy, mm - 2, 1);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      };

      // Trae pedidos + items de un mes (paginado)
      const fetchMes = async (ym: string): Promise<{ ords: OrderRow[]; its: ItemRow[] }> => {
        const { start, end } = rangoDe(ym);
        const ords: OrderRow[] = [];
        let fromO = 0;
        const PAGE_O = 1000;
        while (true) {
          const { data, error } = await supabase
            .from('internal_orders')
            .select('id, branch_id, order_type, order_date, delivery_date, status')
            .gte('order_date', start).lte('order_date', end)
            .range(fromO, fromO + PAGE_O - 1);
          if (error || !data || data.length === 0) break;
          ords.push(...(data as OrderRow[]));
          if (data.length < PAGE_O) break;
          fromO += PAGE_O;
        }
        const its: ItemRow[] = [];
        if (ords.length > 0) {
          const ids = ords.map(o => o.id);
          const CHUNK = 200;
          for (let c = 0; c < ids.length; c += CHUNK) {
            const idsChunk = ids.slice(c, c + CHUNK);
            let from = 0;
            const PAGE = 1000;
            while (true) {
              const { data, error } = await supabase
                .from('internal_order_items')
                .select('order_id, item_name, category, quantity, received, received_qty, unit_cost')
                .in('order_id', idsChunk)
                .range(from, from + PAGE - 1);
              if (error || !data || data.length === 0) break;
              its.push(...(data as ItemRow[]));
              if (data.length < PAGE) break;
              from += PAGE;
            }
          }
        }
        return { ords, its };
      };

      // Trae ventas netas de un mes por sucursal y fecha
      const fetchVentas = async (ym: string): Promise<SaleRow[]> => {
        const { start, end } = rangoDe(ym);
        const all: SaleRow[] = [];
        let page = 0;
        while (page < 50) {
          const { data, error } = await supabase
            .from('sales_tickets')
            .select('branch_id, date, net_sales')
            .gte('date', start).lte('date', end)
            .range(page * 1000, (page + 1) * 1000 - 1);
          if (error || !data || data.length === 0) break;
          all.push(...(data as SaleRow[]));
          if (data.length < 1000) break;
          page++;
        }
        return all;
      };

      const prevM = prevMonthOf(month);
      const [cur, prev, ventasCur] = await Promise.all([
        fetchMes(month),
        fetchMes(prevM),
        fetchVentas(month)
      ]);

      setOrders(cur.ords);
      setItems(cur.its);
      setPrevOrders(prev.ords);
      setPrevItems(prev.its);
      setSales(ventasCur);
      setLoading(false);
    })();
  }, [month]);

  // Filtrar por sucursal
  const fOrders = useMemo(() => branchFilter === 'all' ? orders : orders.filter(o => o.branch_id === branchFilter), [orders, branchFilter]);
  const fOrderIds = useMemo(() => new Set(fOrders.map(o => o.id)), [fOrders]);
  const fItems = useMemo(() => items.filter(i => fOrderIds.has(i.order_id)), [items, fOrderIds]);

  // === PLATA GASTADA (sobre lo RECIBIDO) ===
  // Valor recibido de un item: precio congelado × cantidad efectivamente recibida
  const valorRecibido = (it: ItemRow, ord?: OrderRow) => {
    if (!ord || ord.status !== 'recibido') return 0;
    if (it.received === false) return 0;
    const qty = it.received_qty != null ? Number(it.received_qty) : Number(it.quantity);
    return (Number(it.unit_cost) || 0) * (qty || 0);
  };

  const gastoMes = useMemo(() => {
    let total = 0;
    let sinPrecio = 0;
    const diasConPedido = new Set<string>();
    fItems.forEach(it => {
      const ord = fOrders.find(o => o.id === it.order_id);
      const v = valorRecibido(it, ord);
      total += v;
      if (ord && v > 0) diasConPedido.add(ord.delivery_date || ord.order_date);
      if (ord?.status === 'recibido' && it.received !== false && !(Number(it.unit_cost) > 0)) sinPrecio++;
    });
    return { total, sinPrecio, dias: diasConPedido.size };
  }, [fItems, fOrders]);

  // Ventas netas del mes (misma sucursal / todas)
  const ventasRows = useMemo(
    () => branchFilter === 'all' ? sales : sales.filter(s => s.branch_id === branchFilter),
    [sales, branchFilter]
  );
  const ventasNetas = useMemo(() => ventasRows.reduce((a, s) => a + (Number(s.net_sales) || 0), 0), [ventasRows]);

  // Último día del mes con ventas cargadas (para recortar el gasto al mismo período)
  const ultimoDiaConVentas = useMemo(() => {
    if (ventasRows.length === 0) return 0;
    return Math.max(...ventasRows.map(s => parseInt(String(s.date).slice(8, 10), 10)));
  }, [ventasRows]);

  // === % SOBRE VENTAS: mismo período en ambos lados ===
  // Gasto recortado: solo pedidos ENTREGADOS hasta el último día con ventas
  const gastoHastaVentas = useMemo(() => {
    if (ultimoDiaConVentas === 0) return 0;
    let total = 0;
    fItems.forEach(it => {
      const ord = fOrders.find(o => o.id === it.order_id);
      if (!ord) return;
      const fecha = ord.delivery_date || ord.order_date; // fecha de entrada de la mercadería
      const dia = parseInt(String(fecha).slice(8, 10), 10);
      if (dia > ultimoDiaConVentas) return;
      total += valorRecibido(it, ord);
    });
    return total;
  }, [fItems, fOrders, ultimoDiaConVentas]);

  const pctSobreVentas = ventasNetas > 0 ? (gastoHastaVentas / ventasNetas) * 100 : null;

  // === vs MES ANTERIOR: siempre misma cantidad de días en ambos meses ===
  const fPrevOrders = useMemo(() => branchFilter === 'all' ? prevOrders : prevOrders.filter(o => o.branch_id === branchFilter), [prevOrders, branchFilter]);
  const fPrevOrderIds = useMemo(() => new Set(fPrevOrders.map(o => o.id)), [fPrevOrders]);
  const fPrevItems = useMemo(() => prevItems.filter(i => fPrevOrderIds.has(i.order_id)), [prevItems, fPrevOrderIds]);

  // Gasto de un conjunto, limitado a los días 1..corte (por fecha de entrega)
  const gastoHastaDia = (ords: OrderRow[], its: ItemRow[], corte: number) => {
    let total = 0;
    its.forEach(it => {
      const ord = ords.find(o => o.id === it.order_id);
      if (!ord) return;
      const fecha = ord.delivery_date || ord.order_date;
      const dia = parseInt(String(fecha).slice(8, 10), 10);
      if (dia > corte) return;
      total += valorRecibido(it, ord);
    });
    return total;
  };

  // Día de corte: hasta qué día comparamos (si es el mes en curso, hasta hoy)
  const diaCorte = useMemo(() => {
    const hoy = new Date();
    const esMesActual = month === `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`;
    if (esMesActual) return hoy.getDate();
    const dias = fOrders.map(o => parseInt(o.order_date.split('-')[2], 10));
    return dias.length > 0 ? Math.max(...dias) : 31;
  }, [month, fOrders]);

  // Comparativa justa: ambos meses hasta el mismo día
  const gastoActualComparable = useMemo(() => gastoHastaDia(fOrders, fItems, diaCorte), [fOrders, fItems, diaCorte]);
  const gastoPrev = useMemo(() => gastoHastaDia(fPrevOrders, fPrevItems, diaCorte), [fPrevOrders, fPrevItems, diaCorte]);

  // Comparativa por DÍA DE LA SEMANA (lunes vs lunes) en plata
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const porDiaSemana = useMemo(() => {
    const acum = (ords: OrderRow[], its: ItemRow[]) => {
      const m: number[] = [0, 0, 0, 0, 0, 0, 0];
      its.forEach(it => {
        const ord = ords.find(o => o.id === it.order_id);
        if (!ord) return;
        const v = valorRecibido(it, ord);
        if (v === 0) return;
        const [yy, mm, dd] = ord.order_date.split('-').map(Number);
        const dow = new Date(yy, mm - 1, dd).getDay();
        m[dow] += v;
      });
      return m;
    };
    const cur = acum(fOrders, fItems);
    const prv = acum(fPrevOrders, fPrevItems);
    // Ordenar Lunes→Domingo
    const orden = [1, 2, 3, 4, 5, 6, 0];
    return orden.map(d => ({ dia: DIAS[d].slice(0, 3), actual: cur[d], anterior: prv[d] }));
  }, [fOrders, fItems, fPrevOrders, fPrevItems]);

  // Comparativa por SEMANA del mes en plata
  const porSemana = useMemo(() => {
    const acum = (ords: OrderRow[], its: ItemRow[]) => {
      const m: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
      its.forEach(it => {
        const ord = ords.find(o => o.id === it.order_id);
        if (!ord) return;
        const v = valorRecibido(it, ord);
        if (v === 0) return;
        const dia = parseInt(ord.order_date.split('-')[2], 10);
        const wk = dia <= 7 ? 1 : dia <= 14 ? 2 : dia <= 21 ? 3 : 4;
        m[wk] += v;
      });
      return m;
    };
    const cur = acum(fOrders, fItems);
    const prv = acum(fPrevOrders, fPrevItems);
    return [1, 2, 3, 4].map(w => ({ semana: `Sem ${w}`, actual: cur[w], anterior: prv[w] }));
  }, [fOrders, fItems, fPrevOrders, fPrevItems]);

  const fmtM = (n: number) => '$' + Math.round(n).toLocaleString('es-AR');

  // === COMPARATIVO POR INSUMO: mismos días transcurridos ===
  const comparativoInsumos = useMemo(() => {
    // Acumula pedidas/recibidas por insumo. Si modo='mismos-dias', solo hasta el día de corte.
    const acum = (ords: OrderRow[], its: ItemRow[], limitarDias: boolean) => {
      const m: Record<string, { pedidas: number; recibidas: number }> = {};
      its.forEach(it => {
        const ord = ords.find(o => o.id === it.order_id);
        if (!ord) return;
        const dia = parseInt(ord.order_date.split('-')[2], 10);
        if (limitarDias && dia > diaCorte) return;
        if (!m[it.item_name]) m[it.item_name] = { pedidas: 0, recibidas: 0 };
        m[it.item_name].pedidas += Number(it.quantity) || 0;
        if (ord.status === 'recibido') {
          m[it.item_name].recibidas += it.received === false
            ? 0
            : (it.received_qty != null ? Number(it.received_qty) : Number(it.quantity) || 0);
        }
      });
      return m;
    };
    // El mes actual SIEMPRE se limita al día de corte (no hay datos futuros igual).
    // El mes anterior se limita solo en modo 'mismos-dias'.
    const cur = acum(fOrders, fItems, true);
    const prv = acum(fPrevOrders, fPrevItems, modoComparacion === 'mismos-dias');
    const nombres = new Set([...Object.keys(cur), ...Object.keys(prv)]);
    const filas = Array.from(nombres).map(name => {
      const c = cur[name] || { pedidas: 0, recibidas: 0 };
      const p = prv[name] || { pedidas: 0, recibidas: 0 };
      const varPedidas = p.pedidas > 0 ? ((c.pedidas - p.pedidas) / p.pedidas) * 100 : (c.pedidas > 0 ? null : 0);
      return {
        name,
        pedidasActual: c.pedidas, pedidasPrev: p.pedidas,
        recibidasActual: c.recibidas, recibidasPrev: p.recibidas,
        varPedidas,
        magnitud: varPedidas === null ? Infinity : Math.abs(varPedidas)
      };
    });
    return filas.sort((a, b) => b.magnitud - a.magnitud);
  }, [fOrders, fItems, fPrevOrders, fPrevItems, diaCorte, modoComparacion]);

  // ¿El mes anterior tiene pedidos en el rango comparado? (para avisar si no hay con qué comparar)
  const prevSinDatosEnRango = useMemo(() => {
    if (fPrevOrders.length === 0) return false; // no hay nada en todo el mes: otro caso
    const enRango = fPrevOrders.filter(o => parseInt(o.order_date.split('-')[2], 10) <= diaCorte);
    return enRango.length === 0;
  }, [fPrevOrders, diaCorte]);

  // Primer día con pedidos del mes anterior (para el mensaje de aviso)
  const primerDiaPrev = useMemo(() => {
    if (fPrevOrders.length === 0) return null;
    return Math.min(...fPrevOrders.map(o => parseInt(o.order_date.split('-')[2], 10)));
  }, [fPrevOrders]);

  const [showAllInsumos, setShowAllInsumos] = useState(false);
  const fmtQ = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 });
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
    const [yy, mm] = month.split('-').map(Number);
    const diasSemana = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return Object.entries(map)
      .map(([dia, valor]) => {
        const nd = parseInt(dia, 10);
        const fecha = new Date(yy, mm - 1, nd);
        const label = `${dia}/${String(mm).padStart(2, '0')} ${diasSemana[fecha.getDay()]}`;
        return { dia, valor, label };
      })
      .sort((a, b) => parseInt(a.dia, 10) - parseInt(b.dia, 10));
  }, [fOrders, fItems, selectedItem, dayMode, month]);

  // Totales del insumo elegido: pedidas y recibidas (recibidas solo sobre pedidos recibidos)
  const totalesInsumo = useMemo(() => {
    if (!selectedItem) return { pedidas: 0, recibidas: 0 };
    let pedidas = 0, recibidas = 0;
    fItems.forEach(it => {
      if (it.item_name !== selectedItem) return;
      pedidas += Number(it.quantity) || 0;
      const order = fOrders.find(o => o.id === it.order_id);
      if (order?.status === 'recibido') {
        recibidas += it.received === false ? 0 : (it.received_qty != null ? Number(it.received_qty) : Number(it.quantity));
      }
    });
    return { pedidas, recibidas };
  }, [fItems, fOrders, selectedItem]);

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

          {/* === PLATA GASTADA EN PEDIDOS === */}
          <div className="bg-bg-card border border-border-dim rounded-xl p-5">
            <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-3">Gasto en pedidos (sobre lo recibido)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-bg-accent/30 rounded-lg p-4">
                <p className="text-[8px] font-black uppercase tracking-widest text-text-dim">Gastado este mes (total)</p>
                <p className="text-xl font-mono font-black text-text-main">{fmtM(gastoMes.total)}</p>
                <p className="text-[7px] font-bold uppercase text-text-dim opacity-70 mt-1">
                  {gastoMes.dias} {gastoMes.dias === 1 ? 'día' : 'días'} con mercadería recibida
                </p>
                {gastoMes.sinPrecio > 0 && (
                  <p className="text-[7px] font-bold uppercase text-amber-500 mt-0.5">{gastoMes.sinPrecio} ítems recibidos sin precio cargado</p>
                )}
              </div>
              <div className="bg-bg-accent/30 rounded-lg p-4">
                <p className="text-[8px] font-black uppercase tracking-widest text-text-dim">% sobre ventas netas</p>
                {pctSobreVentas !== null ? (
                  <p className={cn("text-xl font-mono font-black", pctSobreVentas > 40 ? "text-red-500" : pctSobreVentas > 30 ? "text-amber-500" : "text-emerald-500")}>
                    {pctSobreVentas.toFixed(1)}%
                  </p>
                ) : (
                  <p className="text-xl font-mono font-black text-text-dim">—</p>
                )}
                {ultimoDiaConVentas > 0 ? (
                  <p className="text-[7px] font-bold uppercase text-text-dim opacity-70 mt-1 leading-relaxed">
                    Días 1 al {ultimoDiaConVentas} (donde hay ventas cargadas)<br />
                    {fmtM(gastoHastaVentas)} sobre {fmtM(ventasNetas)}
                  </p>
                ) : (
                  <p className="text-[7px] font-bold uppercase text-amber-500 mt-1">Sin ventas cargadas este mes</p>
                )}
              </div>
              <div className="bg-bg-accent/30 rounded-lg p-4">
                <p className="text-[8px] font-black uppercase tracking-widest text-text-dim">vs Mes anterior</p>
                {gastoPrev > 0 ? (
                  <>
                    <p className={cn("text-xl font-mono font-black", gastoActualComparable > gastoPrev ? "text-red-500" : "text-emerald-500")}>
                      {gastoActualComparable >= gastoPrev ? '+' : ''}{(((gastoActualComparable - gastoPrev) / gastoPrev) * 100).toFixed(1)}%
                    </p>
                    <p className="text-[7px] font-bold uppercase text-text-dim opacity-70 mt-1 leading-relaxed">
                      Días 1 al {diaCorte} de ambos meses<br />
                      {fmtM(gastoActualComparable)} vs {fmtM(gastoPrev)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-xl font-mono font-black text-text-dim">—</p>
                    <p className="text-[7px] font-bold uppercase text-text-dim opacity-70 mt-1">Sin datos valorizados el mes anterior (días 1 al {diaCorte})</p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Comparativas contra el mes anterior (en plata) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-bg-card border border-border-dim rounded-xl p-5">
              <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-3">Gasto por día de la semana</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={porDiaSemana}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#8883" />
                  <XAxis dataKey="dia" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => fmtM(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="anterior" name="Mes anterior" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Este mes" fill="#e31e24" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-bg-card border border-border-dim rounded-xl p-5">
              <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest mb-3">Gasto por semana del mes</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={porSemana}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#8883" />
                  <XAxis dataKey="semana" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: any) => fmtM(Number(v))} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="anterior" name="Mes anterior" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Este mes" fill="#e31e24" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Comparativo por insumo (mismos días transcurridos) */}
          <div className="bg-bg-card border border-border-dim rounded-xl p-5">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
              <h3 className="text-[11px] font-black uppercase text-text-main tracking-widest">Cantidades por insumo vs mes anterior</h3>
              <div className="flex items-center gap-1 bg-bg-accent/40 p-0.5 rounded-lg">
                <button onClick={() => setModoComparacion('mismos-dias')}
                  className={cn("px-2.5 py-1 rounded text-[8px] font-black uppercase tracking-wider transition-all",
                    modoComparacion === 'mismos-dias' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main")}>
                  Días 1 al {diaCorte}
                </button>
                <button onClick={() => setModoComparacion('mes-completo')}
                  className={cn("px-2.5 py-1 rounded text-[8px] font-black uppercase tracking-wider transition-all",
                    modoComparacion === 'mes-completo' ? "bg-brand-500 text-black" : "text-text-dim hover:text-text-main")}>
                  vs mes anterior completo
                </button>
              </div>
            </div>
            <p className="text-[8px] font-bold uppercase text-text-dim mb-3 opacity-70">
              {modoComparacion === 'mismos-dias'
                ? `Comparación justa: días 1 al ${diaCorte} de ambos meses. Ordenado por mayor variación.`
                : `Este mes (días 1 al ${diaCorte}) contra el mes anterior COMPLETO. Ojo: no son períodos equivalentes.`}
            </p>

            {/* Aviso: el mes anterior no tiene pedidos en el rango comparado */}
            {modoComparacion === 'mismos-dias' && prevSinDatosEnRango && (
              <div className="mb-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 flex items-start gap-2">
                <AlertTriangle size={13} className="text-amber-500 shrink-0 mt-0.5" />
                <p className="text-[9px] font-bold text-amber-600 uppercase leading-relaxed">
                  El mes anterior no tiene pedidos en los días 1 al {diaCorte}
                  {primerDiaPrev ? ` (los pedidos arrancaron el día ${primerDiaPrev})` : ''}.
                  Por eso todos los insumos figuran como <span className="text-blue-500">NUEVO</span>: no hay con qué compararlos.
                  Probá con <span className="text-text-main">"vs mes anterior completo"</span>.
                </p>
              </div>
            )}
            {comparativoInsumos.length === 0 ? (
              <p className="text-[10px] text-text-dim uppercase font-bold text-center py-6">Sin datos para comparar.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[9px] font-black uppercase tracking-wider text-text-dim border-b border-border-dim">
                        <th className="px-3 py-2">Insumo</th>
                        <th className="px-3 py-2 text-right">Pedidas (mes act.)</th>
                        <th className="px-3 py-2 text-right">Pedidas ({modoComparacion === 'mismos-dias' ? 'mes ant.' : 'mes ant. completo'})</th>
                        <th className="px-3 py-2 text-right">Variación</th>
                        <th className="px-3 py-2 text-right">Recibidas (act.)</th>
                        <th className="px-3 py-2 text-right">Recibidas (ant.)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dim">
                      {(showAllInsumos ? comparativoInsumos : comparativoInsumos.slice(0, 20)).map(r => (
                        <tr key={r.name} className="text-[10px] hover:bg-bg-accent/30">
                          <td className="px-3 py-2 font-bold text-text-main uppercase">{r.name}</td>
                          <td className="px-3 py-2 text-right font-mono font-black text-text-main">{fmtQ(r.pedidasActual)}</td>
                          <td className="px-3 py-2 text-right font-mono text-text-dim">{fmtQ(r.pedidasPrev)}</td>
                          <td className="px-3 py-2 text-right font-mono font-black">
                            {r.varPedidas === null
                              ? <span className="text-blue-500 text-[9px]">NUEVO</span>
                              : r.pedidasActual === 0 && r.pedidasPrev > 0
                                ? <span className="text-text-dim text-[9px]">NO PEDIDO</span>
                                : <span className={r.varPedidas >= 0 ? 'text-red-500' : 'text-emerald-500'}>
                                    {r.varPedidas >= 0 ? '+' : ''}{r.varPedidas.toFixed(1)}%
                                  </span>}
                          </td>
                          <td className="px-3 py-2 text-right font-mono text-text-main">{fmtQ(r.recibidasActual)}</td>
                          <td className="px-3 py-2 text-right font-mono text-text-dim">{fmtQ(r.recibidasPrev)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {comparativoInsumos.length > 20 && (
                  <button onClick={() => setShowAllInsumos(v => !v)}
                    className="mt-3 w-full text-[9px] font-black uppercase tracking-widest text-brand-500 hover:text-brand-600 py-2">
                    {showAllInsumos ? 'Ver menos' : `Ver los ${comparativoInsumos.length} insumos`}
                  </button>
                )}
              </>
            )}
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
            ) : (
              <>
                {/* Totales del insumo elegido */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-bg-accent/30 rounded-lg p-4">
                    <p className="text-[8px] font-black uppercase tracking-widest text-text-dim">Pedidas ({selectedItem})</p>
                    <p className="text-xl font-mono font-black text-text-main">{fmt(totalesInsumo.pedidas)}</p>
                  </div>
                  <div className="bg-bg-accent/30 rounded-lg p-4">
                    <p className="text-[8px] font-black uppercase tracking-widest text-text-dim">Recibidas (sobre recibidos)</p>
                    <p className="text-xl font-mono font-black text-emerald-500">{fmt(totalesInsumo.recibidas)}</p>
                  </div>
                </div>
                {porDia.length === 0 ? (
                  <div className="py-16 text-center text-[11px] font-bold uppercase text-text-dim tracking-widest">Sin {dayMode} de "{selectedItem}" en el período</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={porDia}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#8883" />
                      <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={0} angle={-35} textAnchor="end" height={50} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Bar dataKey="valor" name={dayMode === 'pedidas' ? 'Pedidas' : 'Recibidas'} fill="#e31e24" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </>
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
