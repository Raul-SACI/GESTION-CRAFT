/**
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Tag, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  Save, 
  X, 
  FileText,
  DollarSign,
  UtensilsCrossed,
  Layers,
  FileSpreadsheet,
  Loader2,
  ListPlus,
  Download,
  TrendingUp,
  Store
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';
import PriceListBuilder from './PriceListBuilder';

interface MenuItem {
  id: string;
  category: string;
  name: string;
  price: number;
  lastUpdate: string;
  basePrice?: number | null;   // primer precio del año (enero), para la variación acumulada
  baseDate?: string | null;
  previousPrice?: number | null;  // precio que tenía justo antes del último cambio
  previousDate?: string | null;   // fecha en que se dejó ese precio anterior
  externalCode?: string | null;   // código del artículo en el sistema del restaurante (Maxirest)
}

const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

// Redondea a un valor comercial "lindo" según la magnitud del precio
const redondeoComercial = (n: number): number => {
  if (n <= 0) return 0;
  if (n < 1000) return Math.round(n / 50) * 50;        // < $1.000 → múltiplos de 50
  if (n < 10000) return Math.round(n / 100) * 100;     // < $10.000 → múltiplos de 100
  return Math.round(n / 500) * 500;                    // >= $10.000 → múltiplos de 500
};

// Formatea YYYY-MM-DD a DD/MM/AAAA
const fmtFecha = (iso: string | null | undefined): string => {
  if (!iso) return '-';
  const [y, m, d] = String(iso).split('-');
  if (!y || !m || !d) return String(iso);
  return `${d}/${m}/${y}`;
};

// Solo 2 cartas. Los productos SIN GLUTEN son una categoría más dentro de Salón y Pedidos Ya.
const MENU_TYPES = [
  { id: 'salon', label: 'Carta Salón', icon: UtensilsCrossed },
  { id: 'pedidosya', label: 'Pedidos Ya', icon: FileText }
];

// Columnas disponibles para el PDF de una carta (el usuario elige cuáles incluir)
const PDF_COL_DEFS: { key: string; label: string; pedidosyaOnly?: boolean }[] = [
  { key: 'categoria', label: 'Categoría' },
  { key: 'producto', label: 'Producto' },
  { key: 'inicial', label: 'Precio Enero' },
  { key: 'anterior', label: 'Precio Anterior' },
  { key: 'actual', label: 'Precio Actual' },
  { key: 'idealPY', label: 'Precio Ideal PY (comisión)', pedidosyaOnly: true },
  { key: 'varAnio', label: 'Variación del año %' },
  { key: 'ideal', label: 'Precio Ideal (s/inflación)' },
  { key: 'sugerido', label: 'Precio Sugerido (ponderado)' },
  { key: 'varSug', label: 'Variación sugerida %' },
  { key: 'ultima', label: 'Última actualización' },
];

export default function PriceListView({ isReadOnly = false }: { isReadOnly?: boolean } = {}) {
  const [activeMenu, setActiveMenu] = useState('salon');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [loading, setLoading] = useState(true);

  // Persistence State
  const [menus, setMenus] = useState<Record<string, MenuItem[]>>({
    salon: [],
    celiacos: [],
    pedidosya: []
  });

  const [newItem, setNewItem] = useState({
    category: '',
    name: '',
    price: 0
  });

  // Inflación acumulada del año (ene a último mes cargado), leída de monthly_inflation
  const [yearInflation, setYearInflation] = useState<number | null>(null);
  const [showBuilder, setShowBuilder] = useState(false);
  const [inflationPeriod, setInflationPeriod] = useState<string>('');
  // Detalle mes a mes de la inflación cargada (tabla monthly_inflation)
  const [inflationRows, setInflationRows] = useState<any[]>([]);
  const [showInflationModal, setShowInflationModal] = useState(false);
  // Unidades vendidas por producto (de product_rankings), para ponderar por facturación
  const [unitsByProduct, setUnitsByProduct] = useState<Record<string, number>>({});
  const [showWeightedModal, setShowWeightedModal] = useState(false);
  const [newInflMonth, setNewInflMonth] = useState('');
  const [newInflPct, setNewInflPct] = useState('');
  // Comisión de la plataforma (Pedidos Ya), editable y guardada en Supabase (tabla pricing_settings)
  const [pyCommission, setPyCommission] = useState<number>(10);
  // Categorías creadas a mano (tabla menu_categories), por tipo de carta. Se suman a las de los productos.
  const [managedCats, setManagedCats] = useState<Record<string, string[]>>({ salon: [], celiacos: [], pedidosya: [] });
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  // ─── Simulador de venta ───
  const [showSimModal, setShowSimModal] = useState(false);
  const [simLoading, setSimLoading] = useState(false);
  const [simLoaded, setSimLoaded] = useState(false);
  const [simBranches, setSimBranches] = useState<{ id: string; name: string }[]>([]);
  // Venta neta por mes y sucursal: netByMonthBranch[mes][branch_id] = total
  const [netByMonthBranch, setNetByMonthBranch] = useState<Record<string, Record<string, number>>>({});
  // Unidades por sucursal y código: unitsByBranchCode[branch_id][code] = unidades
  const [unitsByBranchCode, setUnitsByBranchCode] = useState<Record<string, Record<string, number>>>({});
  const [simBranch, setSimBranch] = useState<string>('all');
  const [simMonth, setSimMonth] = useState<string>('');

  // Selector de columnas para el PDF de una carta
  const [showPdfColsModal, setShowPdfColsModal] = useState(false);
  const [pdfCols, setPdfCols] = useState<Record<string, boolean>>({
    categoria: true, producto: true, inicial: true, anterior: true, actual: true,
    idealPY: true, varAnio: true, ideal: false, sugerido: true, varSug: true, ultima: false,
  });

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('menu_items').select('*');
    // Traer todo el historial para calcular el precio base del año (el más antiguo) por producto
    const { data: history } = await supabase
      .from('menu_price_history')
      .select('menu_item_id, old_price, new_price, change_date')
      .order('change_date', { ascending: true });

    // Primer registro (más antiguo) de cada producto = precio base del año
    const baseByItem: Record<string, { price: number; date: string }> = {};
    // Último cambio de precio de cada producto: su old_price = el precio anterior al actual
    const prevByItem: Record<string, { price: number; date: string }> = {};
    (history || []).forEach((h: any) => {
      if (!h.menu_item_id) return;
      if (!baseByItem[h.menu_item_id]) {
        baseByItem[h.menu_item_id] = { price: Number(h.new_price), date: h.change_date };
      }
      // Como el historial viene en orden ascendente, la última pasada con old_price
      // válido queda como el precio anterior más reciente.
      if (h.old_price !== null && h.old_price !== undefined) {
        prevByItem[h.menu_item_id] = { price: Number(h.old_price), date: h.change_date };
      }
    });

    // Inflación acumulada del año en curso: compone los meses cargados desde enero (monthly_inflation)
    try {
      const year = String(new Date().getFullYear());
      const { data: infl } = await supabase.from('monthly_inflation').select('*');
      const monthsThisYear = (infl || [])
        .filter((r: any) => String(r.month).startsWith(year))
        .sort((a: any, b: any) => String(a.month).localeCompare(String(b.month)));
      if (monthsThisYear.length > 0) {
        let factor = 1;
        monthsThisYear.forEach((r: any) => { factor *= (1 + (Number(r.inflation_pct) || 0) / 100); });
        setYearInflation((factor - 1) * 100);
        const first = monthsThisYear[0].month.split('-')[1];
        const last = monthsThisYear[monthsThisYear.length - 1].month.split('-')[1];
        setInflationPeriod(`${MONTHS_ES[parseInt(first) - 1]} a ${MONTHS_ES[parseInt(last) - 1]}`);
      }
      // Detalle mes a mes (para el modal)
      setInflationRows((infl || []).sort((a: any, b: any) => String(b.month).localeCompare(String(a.month))));
    } catch (e) { console.error('Error cargando inflación:', e); }

    // Ranking de unidades vendidas (para ponderar el aumento por facturación)
    try {
      const { data: rk } = await supabase
        .from('product_rankings')
        .select('product_name, quantity');
      const acum: Record<string, number> = {};
      (rk || []).forEach((r: any) => {
        const key = String(r.product_name || '').trim().toUpperCase();
        if (!key) return;
        acum[key] = (acum[key] || 0) + (Number(r.quantity) || 0);
      });
      setUnitsByProduct(acum);
    } catch (e) { console.error('Error cargando ranking:', e); }

    // Comisión de Pedidos Ya (si la tabla todavía no existe, se mantiene el default 10)
    try {
      const { data: ps } = await supabase
        .from('pricing_settings')
        .select('commission_pct')
        .eq('menu_type', 'pedidosya');
      if (ps && ps.length > 0 && ps[0].commission_pct != null) {
        setPyCommission(Number(ps[0].commission_pct));
      }
    } catch (e) { console.error('Error cargando comisión Pedidos Ya:', e); }

    // Categorías creadas a mano (si la tabla todavía no existe, se ignora)
    try {
      const { data: cats } = await supabase.from('menu_categories').select('menu_type, name');
      if (cats) {
        const grouped: Record<string, string[]> = { salon: [], celiacos: [], pedidosya: [] };
        cats.forEach((c: any) => {
          const mt = String(c.menu_type || '');
          const nm = String(c.name || '').trim().toUpperCase();
          if (!grouped[mt]) grouped[mt] = [];
          if (nm && !grouped[mt].includes(nm)) grouped[mt].push(nm);
        });
        setManagedCats(grouped);
      }
    } catch (e) { console.error('Error cargando categorías administradas:', e); }

    if (data) {
      const organized: Record<string, MenuItem[]> = {
        salon: [],
        celiacos: [],
        pedidosya: []
      };
      data.forEach(item => {
        if (organized[item.menu_type]) {
          const base = baseByItem[item.id];
          const prev = prevByItem[item.id];
          organized[item.menu_type].push({
            id: item.id,
            category: item.category,
            name: item.name,
            price: item.price,
            lastUpdate: item.last_update,
            basePrice: base ? base.price : null,
            baseDate: base ? base.date : null,
            previousPrice: prev ? prev.price : null,
            previousDate: prev ? prev.date : null,
            externalCode: item.external_code ?? null
          });
        }
      });
      setMenus(organized);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Registra un cambio de precio en el historial (Supabase). old_price null = precio inicial.
  const logPriceChange = async (params: {
    menuItemId: string; menuType: string; category: string; itemName: string;
    oldPrice: number | null; newPrice: number; date: string;
  }) => {
    try {
      await supabase.from('menu_price_history').insert([{
        menu_item_id: params.menuItemId,
        menu_type: params.menuType,
        category: params.category,
        item_name: params.itemName,
        old_price: params.oldPrice,
        new_price: params.newPrice,
        change_date: params.date
      }]);
    } catch (e) { console.error('Error registrando historial de precio:', e); }
  };

  // Guarda la comisión de Pedidos Ya en Supabase (upsert por menu_type)
  const savePyCommission = async (val: number) => {
    const clean = isFinite(val) && val >= 0 && val < 100 ? val : 0;
    setPyCommission(clean);
    try {
      await supabase.from('pricing_settings').upsert({ menu_type: 'pedidosya', commission_pct: clean });
    } catch (e) { console.error('Error guardando comisión Pedidos Ya:', e); }
  };

  // Factor para "inflar" el precio y que, tras la comisión, quede el precio ideal por inflación.
  // Solo aplica en la solapa Pedidos Ya. Ej: comisión 10% → 1/(1-0.10) = 1.111
  const pyGrossFactor = (activeMenu === 'pedidosya' && pyCommission > 0 && pyCommission < 100)
    ? 1 / (1 - pyCommission / 100)
    : 1;

  // ─── Simulador de venta: carga de sucursales, ventas netas y ranking por sucursal ───
  const loadSimData = async () => {
    setSimLoading(true);
    try {
      const { data: br } = await supabase.from('branches').select('id, name');
      setSimBranches((br || []).map((b: any) => ({ id: String(b.id), name: String(b.name || b.id) })));

      // Venta neta por mes y sucursal (paginado: la tabla puede superar 1000 filas)
      const net: Record<string, Record<string, number>> = {};
      for (let page = 0, size = 1000; ; page++) {
        const { data, error } = await supabase.from('sales').select('branch_id, date, net_sales').range(page * size, (page + 1) * size - 1);
        if (error) break;
        (data || []).forEach((r: any) => {
          const mes = String(r.date || '').slice(0, 7);
          const b = String(r.branch_id || '');
          if (!mes || !b) return;
          if (!net[mes]) net[mes] = {};
          net[mes][b] = (net[mes][b] || 0) + (Number(r.net_sales) || 0);
        });
        if (!data || data.length < size) break;
      }
      setNetByMonthBranch(net);

      // Unidades por sucursal y código (paginado)
      const units: Record<string, Record<string, number>> = {};
      for (let page = 0, size = 1000; ; page++) {
        const { data, error } = await supabase.from('product_rankings').select('branch_id, product_code, quantity').range(page * size, (page + 1) * size - 1);
        if (error) break;
        (data || []).forEach((r: any) => {
          const b = String(r.branch_id || '');
          const code = String(r.product_code || '').trim();
          if (!b || !code) return;
          if (!units[b]) units[b] = {};
          units[b][code] = (units[b][code] || 0) + (Number(r.quantity) || 0);
        });
        if (!data || data.length < size) break;
      }
      setUnitsByBranchCode(units);

      // Mes por defecto: el más reciente con datos
      const meses = Object.keys(net).sort();
      if (meses.length > 0) setSimMonth(prev => prev || meses[meses.length - 1]);
      setSimLoaded(true);
    } catch (e) { console.error('Error cargando datos de simulación:', e); }
    setSimLoading(false);
  };

  useEffect(() => {
    if (showSimModal && !simLoaded && !simLoading) loadSimData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSimModal]);

  // ─── Carga de inflación mensual (tabla monthly_inflation) ───
  const guardarInflacion = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!/^\d{4}-\d{2}$/.test(newInflMonth)) { alert('Elegí un mes válido.'); return; }
    const pct = parseFloat(String(newInflPct).replace(',', '.'));
    if (isNaN(pct)) { alert('Ingresá un porcentaje válido (ej. 2,5).'); return; }
    const { error } = await supabase.from('monthly_inflation').upsert({
      month: newInflMonth,
      inflation_pct: pct
    }, { onConflict: 'month' });
    if (error) { alert('Error al guardar: ' + error.message); return; }
    setNewInflPct('');
    await fetchData();
  };

  const borrarInflacion = async (month: string) => {
    if (isReadOnly) return;
    if (!window.confirm(`¿Eliminar la inflación cargada de ${month}?`)) return;
    await supabase.from('monthly_inflation').delete().eq('month', month);
    await fetchData();
  };

  const mesLabel = (m: string) => {
    const [y, mo] = String(m).split('-');
    return `${MONTHS_ES[parseInt(mo) - 1] || mo} ${y}`;
  };

  const handleAddItem = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!newItem.name || newItem.price <= 0) return;
    
    const { data, error } = await supabase.from('menu_items').insert([{
      menu_type: activeMenu,
      category: newItem.category.toUpperCase(),
      name: newItem.name.toUpperCase(),
      price: newItem.price,
      last_update: new Date().toISOString().split('T')[0]
    }]).select().single();

    if (data) {
      // Registrar el precio inicial como primer punto del historial
      await logPriceChange({
        menuItemId: data.id, menuType: activeMenu, category: data.category,
        itemName: data.name, oldPrice: null, newPrice: data.price, date: data.last_update
      });
      setMenus({
        ...menus,
        [activeMenu]: [...menus[activeMenu], {
          id: data.id,
          category: data.category,
          name: data.name,
          price: data.price,
          lastUpdate: data.last_update
        }]
      });
      setShowAddModal(false);
      setNewItem({ category: '', name: '', price: 0 });
    }
  };

  const handleUpdatePrice = async (id: string, newPrice: number) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const today = new Date().toISOString().split('T')[0];
    const current = menus[activeMenu].find(i => i.id === id);
    // Si el precio no cambió, no registramos nada
    if (current && current.price === newPrice) { setEditingItem(null); return; }
    const { error } = await supabase
      .from('menu_items')
      .update({ price: newPrice, last_update: today })
      .eq('id', id);

    if (!error) {
      // Registrar el cambio en el historial
      if (current) {
        await logPriceChange({
          menuItemId: id, menuType: activeMenu, category: current.category,
          itemName: current.name, oldPrice: current.price, newPrice, date: today
        });
      }
      setMenus({
        ...menus,
        [activeMenu]: menus[activeMenu].map(item => 
          item.id === id ? { ...item, price: newPrice, lastUpdate: today } : item
        )
      });
    }
    setEditingItem(null);
  };

  const handleDeleteItem = async (id: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!confirm('¿Eliminar este plato?')) return;
    const { error } = await supabase.from('menu_items').delete().eq('id', id);
    if (!error) {
      setMenus({
        ...menus,
        [activeMenu]: menus[activeMenu].filter(i => i.id !== id)
      });
    }
  };

  // Categorías disponibles en la lista activa (para el filtro desplegable)
  const availableCategories = Array.from(new Set([
    ...(menus[activeMenu] || []).map(i => i.category),
    ...(managedCats[activeMenu] || []),
  ])).filter(Boolean).sort();

  // Crea una categoría a mano (guardada en Supabase). Solo se usa en la solapa Pedidos Ya.
  const addCategory = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    const clean = newCatName.trim().toUpperCase();
    if (!clean) return;
    const yaExiste = (managedCats[activeMenu] || []).includes(clean)
      || (menus[activeMenu] || []).some(i => String(i.category).toUpperCase() === clean);
    if (yaExiste) { alert('Esa categoría ya existe.'); return; }
    try {
      const { error } = await supabase.from('menu_categories').insert([{ menu_type: activeMenu, name: clean }]);
      if (error) throw error;
      setManagedCats(prev => ({ ...prev, [activeMenu]: [...(prev[activeMenu] || []), clean] }));
      setNewCatName('');
    } catch (e: any) { alert('Error al crear la categoría: ' + (e.message || e)); }
  };

  // Quita una categoría creada a mano. Los productos que ya la usen la conservan.
  const deleteCategory = async (name: string) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA.'); return; }
    if (!window.confirm(`¿Quitar la categoría "${name}" de la lista? Los productos que ya la tengan asignada la conservan.`)) return;
    try {
      const { error } = await supabase.from('menu_categories').delete().eq('menu_type', activeMenu).eq('name', name);
      if (error) throw error;
      setManagedCats(prev => ({ ...prev, [activeMenu]: (prev[activeMenu] || []).filter(c => c !== name) }));
    } catch (e: any) { alert('Error al quitar la categoría: ' + (e.message || e)); }
  };

  const filteredItems = (menus[activeMenu] || []).filter(item => {
    // Filtro por categoría
    if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
    // Buscador (nombre o categoría)
    if (search) {
      const q = search.toLowerCase();
      if (!item.name.toLowerCase().includes(q) && !item.category.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  // Aumento promedio de la lista activa: solo productos con precio base (enero) > 0
  const listAvgIncrease = (() => {
    const withBase = (menus[activeMenu] || []).filter(i => i.basePrice && i.basePrice > 0);
    if (withBase.length === 0) return null;
    const sum = withBase.reduce((acc, i) => acc + ((i.price - (i.basePrice as number)) / (i.basePrice as number)) * 100, 0);
    return { avg: sum / withBase.length, count: withBase.length };
  })();

  // Aumento PONDERADO POR FACTURACIÓN: cada producto pesa según cuánto factura
  // (unidades vendidas × precio actual), no todos por igual.
  // Devuelve también la brecha contra la inflación y el aumento sugerido para emparejarla.
  const weightedIncrease = (() => {
    const items = (menus[activeMenu] || []).filter(i => i.basePrice && i.basePrice > 0);
    if (items.length === 0) return null;

    let totalFactActual = 0;   // facturación con precios de hoy
    let totalFactBase = 0;     // la misma cantidad, a precios de enero
    let conVentas = 0, sinVentas = 0;
    const detalle: Array<{ name: string; units: number; price: number; base: number; pct: number; fact: number }> = [];

    items.forEach(i => {
      const units = unitsByProduct[String(i.name).trim().toUpperCase()] || 0;
      if (units > 0) conVentas++; else sinVentas++;
      if (units <= 0) return;
      const base = i.basePrice as number;
      const factActual = units * i.price;
      const factBase = units * base;
      totalFactActual += factActual;
      totalFactBase += factBase;
      detalle.push({
        name: i.name, units, price: i.price, base,
        pct: ((i.price - base) / base) * 100,
        fact: factActual
      });
    });

    if (totalFactBase <= 0) return null;

    // Aumento real ponderado: cuánto creció la facturación por precio (a igual volumen)
    const ponderado = ((totalFactActual - totalFactBase) / totalFactBase) * 100;
    // Brecha vs inflación y aumento necesario para emparejarla
    const infl = yearInflation ?? 0;
    const brecha = ponderado - infl;
    // Para alcanzar la inflación desde el nivel de precios actual
    const aumentoSugerido = ((1 + infl / 100) / (1 + ponderado / 100) - 1) * 100;

    detalle.sort((a, b) => b.fact - a.fact);
    return { ponderado, infl, brecha, aumentoSugerido, conVentas, sinVentas, detalle, totalFact: totalFactActual };
  })();

  const menuLabel = MENU_TYPES.find(m => m.id === activeMenu)?.label || '';

  // Cambio de precio de la última carta por código (precio anterior → actual), tomando Salón/Celíacos
  const priceChangeByCode = (() => {
    const m: Record<string, { old: number; new: number }> = {};
    const add = (it: MenuItem) => {
      if (!it.externalCode) return;
      const code = String(it.externalCode).trim();
      if (!code || m[code]) return;
      if (it.previousPrice && it.previousPrice > 0) m[code] = { old: it.previousPrice, new: it.price };
    };
    (menus.salon || []).forEach(add);
    (menus.celiacos || []).forEach(add);
    return m;
  })();

  // Meses disponibles (con venta neta cargada), del más nuevo al más viejo
  const simMonths = Object.keys(netByMonthBranch).sort().reverse();

  // Resultado de la simulación para la sucursal y el mes elegidos
  const simResult = (() => {
    if (!simMonth || !netByMonthBranch[simMonth]) return null;
    const monthData = netByMonthBranch[simMonth];
    const base = simBranch === 'all'
      ? Object.values(monthData).reduce((a: number, b: number) => a + b, 0)
      : (monthData[simBranch] || 0);

    // Mix de unidades: de la sucursal elegida, o de toda la cadena
    let unitsMap: Record<string, number> = {};
    if (simBranch === 'all') {
      Object.values(unitsByBranchCode).forEach(bm => {
        Object.entries(bm).forEach(([c, u]) => { unitsMap[c] = (unitsMap[c] || 0) + u; });
      });
    } else {
      unitsMap = unitsByBranchCode[simBranch] || {};
    }

    // % ponderado del último cambio de carta: Σ u·(nuevo-viejo) / Σ u·viejo
    let num = 0, den = 0, matched = 0, unidades = 0;
    Object.entries(unitsMap).forEach(([code, u]) => {
      const pc = priceChangeByCode[code];
      if (!pc || pc.old <= 0 || u <= 0) return;
      num += u * (pc.new - pc.old);
      den += u * pc.old;
      matched++; unidades += u;
    });
    const pct = den > 0 ? (num / den) * 100 : 0;
    const simulado = base * (1 + pct / 100);
    return { base, pct, simulado, diff: simulado - base, matched, unidades };
  })();

  // ─── EXPORTACIÓN ───
  const fechaHoy = () => {
    const d = new Date();
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };

  // Items de la carta activa, respetando el filtro de categoría, ordenados alfabéticamente
  // por categoría y, dentro de cada una, por producto (para que los exportados salgan prolijos).
  const itemsParaExportar = () => {
    const items = menus[activeMenu] || [];
    const filtrados = categoryFilter === 'all' ? items : items.filter(i => i.category === categoryFilter);
    return [...filtrados].sort((a, b) =>
      String(a.category || '').localeCompare(String(b.category || ''), 'es') ||
      String(a.name || '').localeCompare(String(b.name || ''), 'es'));
  };

  // Valor formateado de una columna del PDF para un producto
  const valorColumnaPDF = (i: MenuItem, key: string): string => {
    const ajuste = weightedIncrease ? weightedIncrease.aumentoSugerido : null;
    const sug = ajuste !== null ? redondeoComercial(i.price * (1 + ajuste / 100)) : null;
    switch (key) {
      case 'categoria': return i.category || '-';
      case 'producto': return i.name;
      case 'inicial': return i.basePrice ? `$${i.basePrice.toLocaleString('es-AR')}` : '-';
      case 'anterior': return i.previousPrice ? `$${i.previousPrice.toLocaleString('es-AR')}` : '-';
      case 'actual': return `$${i.price.toLocaleString('es-AR')}`;
      case 'idealPY': {
        const v = (i.basePrice && i.basePrice > 0 && yearInflation !== null)
          ? redondeoComercial(i.basePrice * (1 + yearInflation / 100) * pyGrossFactor) : null;
        return v !== null ? `$${v.toLocaleString('es-AR')}` : '-';
      }
      case 'varAnio': return i.basePrice ? `${(((i.price - i.basePrice) / i.basePrice) * 100).toFixed(1)}%` : '-';
      case 'ideal': {
        const v = (i.basePrice && i.basePrice > 0 && yearInflation !== null)
          ? redondeoComercial(i.basePrice * (1 + yearInflation / 100)) : null;
        return v !== null ? `$${v.toLocaleString('es-AR')}` : '-';
      }
      case 'sugerido': return sug !== null ? `$${sug.toLocaleString('es-AR')}` : '-';
      case 'varSug': {
        const vs = sug !== null && i.price > 0 ? ((sug - i.price) / i.price) * 100 : null;
        return vs !== null ? `${vs >= 0 ? '+' : ''}${vs.toFixed(1)}%` : '-';
      }
      case 'ultima': return fmtFecha(i.lastUpdate);
      default: return '';
    }
  };

  const exportarCartaPDF = () => {
    const items = itemsParaExportar();
    if (items.length === 0) { alert('No hay productos para exportar.'); return; }
    // Columnas elegidas por el usuario (las de pedidosya solo aplican en esa carta)
    const cols = PDF_COL_DEFS.filter(c => pdfCols[c.key] && (!c.pedidosyaOnly || activeMenu === 'pedidosya'));
    if (cols.length === 0) { alert('Elegí al menos una columna para el PDF.'); return; }

    const doc = new jsPDF();
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('LISTA DE PRECIOS', 14, 18);
    doc.setFontSize(12);
    doc.text(menuLabel.toUpperCase(), 14, 26);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Generado: ${fechaHoy()}`, 14, 33);
    if (categoryFilter !== 'all') doc.text(`Categoría: ${categoryFilter}`, 14, 38);

    let y = categoryFilter !== 'all' ? 44 : 40;
    if (listAvgIncrease) {
      doc.text(`Aumento promedio del año: ${listAvgIncrease.avg >= 0 ? '+' : ''}${listAvgIncrease.avg.toFixed(1)}%`, 14, y); y += 5;
    }
    if (yearInflation !== null) {
      doc.text(`Inflación acumulada (${inflationPeriod}): +${yearInflation.toFixed(1)}%`, 14, y); y += 5;
    }
    if (weightedIncrease) {
      doc.setFont('helvetica', 'bold');
      doc.text(`Ajuste sugerido (ponderado): ${weightedIncrease.aumentoSugerido > 0 ? '+' : ''}${weightedIncrease.aumentoSugerido.toFixed(1)}%`, 14, y);
      doc.setFont('helvetica', 'normal'); y += 5;
    }

    autoTable(doc, {
      startY: y + 3,
      head: [cols.map(c => c.key === 'idealPY' ? `Precio Ideal PY (com. ${pyCommission}%)` : c.label)],
      body: items.map(i => cols.map(c => valorColumnaPDF(i, c.key))),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });
    doc.save(`Lista_Precios_${menuLabel.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
    setShowPdfColsModal(false);
  };

  // Arma una tabla unificada de ambas cartas: una fila por producto, con precio Salón y precio Pedidos Ya.
  // Cruza el mismo producto entre cartas por código (o nombre). Los celíacos entran con su precio en Salón.
  const buildUnified = () => {
    type Row = { category: string; name: string; salon: number | null; py: number | null };
    const map = new Map<string, Row>();
    const keyOf = (it: MenuItem) => it.externalCode ? `C:${String(it.externalCode).trim()}` : `N:${String(it.name).trim().toUpperCase()}`;
    const addPrecio = (it: MenuItem, campo: 'salon' | 'py') => {
      const k = keyOf(it);
      let r = map.get(k);
      if (!r) { r = { category: it.category, name: it.name, salon: null, py: null }; map.set(k, r); }
      if (r[campo] === null) r[campo] = it.price;
      if (!r.category && it.category) r.category = it.category;
    };
    (menus.salon || []).forEach(it => addPrecio(it, 'salon'));
    (menus.celiacos || []).forEach(it => addPrecio(it, 'salon')); // celíacos: su precio va en la columna Salón
    (menus.pedidosya || []).forEach(it => addPrecio(it, 'py'));
    return Array.from(map.values()).sort((a, b) =>
      (a.category || '').localeCompare(b.category || '') || a.name.localeCompare(b.name));
  };

  const exportar3CartasPDF = () => {
    const filas = buildUnified();
    if (filas.length === 0) { alert('No hay productos para exportar.'); return; }
    const doc = new jsPDF();
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('LISTA DE PRECIOS · SALÓN Y PEDIDOS YA', 14, 18);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Generado: ${fechaHoy()} · ${filas.length} productos`, 14, 26);
    autoTable(doc, {
      startY: 32,
      head: [['Categoría', 'Producto', 'Precio Salón', 'Precio Pedidos Ya']],
      body: filas.map(r => [
        r.category || '-', r.name,
        r.salon != null ? `$${r.salon.toLocaleString('es-AR')}` : '-',
        r.py != null ? `$${r.py.toLocaleString('es-AR')}` : '-',
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });
    doc.save(`Lista_Precios_Ambas_Cartas_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportar3CartasExcel = () => {
    const filas = buildUnified();
    if (filas.length === 0) { alert('No hay productos para exportar.'); return; }
    const aoa: any[][] = [
      ['LISTA DE PRECIOS · SALÓN Y PEDIDOS YA'],
      ['Generado', fechaHoy()],
      [],
      ['Categoría', 'Producto', 'Precio Salón', 'Precio Pedidos Ya'],
    ];
    filas.forEach(r => aoa.push([r.category || '', r.name, r.salon ?? '', r.py ?? '']));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cartas');
    XLSX.writeFile(wb, `Lista_Precios_Ambas_Cartas_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // Descarga las 2 versiones (PDF y Excel) de la tabla unificada de las 3 cartas
  const exportar3Cartas = () => {
    exportar3CartasPDF();
    exportar3CartasExcel();
  };

  const exportarCartaExcel = () => {
    const items = itemsParaExportar();
    if (items.length === 0) { alert('No hay productos para exportar.'); return; }
    const aoa: any[][] = [
      ['LISTA DE PRECIOS · ' + menuLabel.toUpperCase()],
      ['Generado', fechaHoy()],
    ];
    if (listAvgIncrease) aoa.push(['Aumento promedio del año', `${listAvgIncrease.avg.toFixed(1)}%`]);
    if (yearInflation !== null) aoa.push(['Inflación acumulada', `${yearInflation.toFixed(1)}%`, inflationPeriod]);
    if (weightedIncrease) aoa.push(['Ajuste sugerido (ponderado)', `${weightedIncrease.aumentoSugerido.toFixed(1)}%`]);
    aoa.push([]);
    aoa.push([
      'Categoría', 'Producto', 'Precio Enero', 'Precio Anterior', 'Precio Actual',
      ...(activeMenu === 'pedidosya' ? [`Precio Ideal PY (com. ${pyCommission}%)`] : []),
      'Var. %', 'Precio Sugerido', 'Var. Sugerida %'
    ]);

    const ajuste = weightedIncrease ? weightedIncrease.aumentoSugerido : null;
    items.forEach(i => {
      const sug = ajuste !== null ? redondeoComercial(i.price * (1 + ajuste / 100)) : null;
      const varSug = sug !== null && i.price > 0 ? ((sug - i.price) / i.price) * 100 : null;
      const idealPY = (activeMenu === 'pedidosya' && i.basePrice && i.basePrice > 0 && yearInflation !== null)
        ? redondeoComercial(i.basePrice * (1 + yearInflation / 100) * pyGrossFactor) : null;
      aoa.push([
        i.category, i.name,
        i.basePrice ?? '', i.previousPrice ?? '', i.price,
        ...(activeMenu === 'pedidosya' ? [idealPY ?? ''] : []),
        i.basePrice ? Number((((i.price - i.basePrice) / i.basePrice) * 100).toFixed(1)) : '',
        sug ?? '',
        varSug !== null ? Number(varSug.toFixed(1)) : ''
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, menuLabel.slice(0, 30) || 'Carta');
    XLSX.writeFile(wb, `Lista_Precios_${menuLabel.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const exportarAjustePDF = () => {
    if (!weightedIncrease) { alert('No hay datos de ajuste ponderado.'); return; }
    const doc = new jsPDF();
    doc.setFontSize(16); doc.setFont('helvetica', 'bold');
    doc.text('AJUSTE SUGERIDO PONDERADO', 14, 18);
    doc.setFontSize(11);
    doc.text(menuLabel.toUpperCase(), 14, 26);
    doc.setFontSize(9); doc.setFont('helvetica', 'normal');
    doc.text(`Generado: ${fechaHoy()}`, 14, 33);
    doc.text(`Aumento ponderado por facturación: ${weightedIncrease.ponderado >= 0 ? '+' : ''}${weightedIncrease.ponderado.toFixed(1)}%`, 14, 40);
    doc.text(`Inflación acumulada: +${weightedIncrease.infl.toFixed(1)}%`, 14, 45);
    doc.text(`Brecha: ${weightedIncrease.brecha >= 0 ? '+' : ''}${weightedIncrease.brecha.toFixed(1)} pts`, 14, 50);
    doc.setFont('helvetica', 'bold');
    doc.text(`AJUSTE SUGERIDO: ${weightedIncrease.aumentoSugerido > 0 ? '+' : ''}${weightedIncrease.aumentoSugerido.toFixed(1)}%`, 14, 57);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.text(`${weightedIncrease.conVentas} productos con ventas · ${weightedIncrease.sinVentas} sin ventas (no ponderan)`, 14, 63);

    autoTable(doc, {
      startY: 68,
      head: [['Producto', 'Unid.', 'Enero', 'Hoy', 'Sugerido', 'Var. sug. %', 'Var. %', 'Peso %']],
      body: weightedIncrease.detalle.map(d => {
        const sug = redondeoComercial(d.price * (1 + weightedIncrease.aumentoSugerido / 100));
        const varSug = d.price > 0 ? ((sug - d.price) / d.price) * 100 : 0;
        return [
          d.name,
          d.units.toLocaleString('es-AR'),
          `$${d.base.toLocaleString('es-AR')}`,
          `$${d.price.toLocaleString('es-AR')}`,
          `$${sug.toLocaleString('es-AR')}`,
          `${varSug >= 0 ? '+' : ''}${varSug.toFixed(1)}%`,
          `${d.pct.toFixed(1)}%`,
          `${((d.fact / weightedIncrease.totalFact) * 100).toFixed(1)}%`
        ];
      }),
      styles: { fontSize: 7.5, cellPadding: 1.8 },
      headStyles: { fillColor: [220, 38, 38], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [245, 245, 245] }
    });
    doc.save(`Ajuste_Ponderado_${menuLabel.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const exportarAjusteExcel = () => {
    if (!weightedIncrease) { alert('No hay datos de ajuste ponderado.'); return; }
    const aoa: any[][] = [
      ['AJUSTE SUGERIDO PONDERADO · ' + menuLabel.toUpperCase()],
      ['Generado', fechaHoy()],
      [],
      ['Aumento ponderado por facturación', `${weightedIncrease.ponderado.toFixed(1)}%`],
      ['Inflación acumulada', `${weightedIncrease.infl.toFixed(1)}%`],
      ['Brecha (pts)', Number(weightedIncrease.brecha.toFixed(1))],
      ['AJUSTE SUGERIDO', `${weightedIncrease.aumentoSugerido.toFixed(1)}%`],
      ['Productos con ventas', weightedIncrease.conVentas],
      ['Productos sin ventas', weightedIncrease.sinVentas],
      [],
      ['Producto', 'Unidades', 'Precio Enero', 'Precio Hoy', 'Precio Sugerido', 'Var. Sugerida %', 'Var. %', 'Peso %']
    ];
    weightedIncrease.detalle.forEach(d => {
      const sug = redondeoComercial(d.price * (1 + weightedIncrease.aumentoSugerido / 100));
      const varSug = d.price > 0 ? ((sug - d.price) / d.price) * 100 : 0;
      aoa.push([
        d.name, d.units, d.base, d.price, sug,
        Number(varSug.toFixed(1)),
        Number(d.pct.toFixed(1)),
        Number(((d.fact / weightedIncrease.totalFact) * 100).toFixed(1))
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ajuste Ponderado');
    XLSX.writeFile(wb, `Ajuste_Ponderado_${menuLabel.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-wrap justify-between items-end gap-4">
        <div>
          <h2 className="text-xl font-black uppercase text-text-main tracking-widest flex items-center gap-2">
            <Tag className="text-brand-500" size={24} /> Lista de Precios
          </h2>
          <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1 opacity-70">
            Gestión centralizada de cartas y valores comerciales
          </p>
        </div>

        <div className="flex bg-bg-accent rounded-lg p-1 border border-border-dim shadow-inner">
          {MENU_TYPES.map(type => (
            <button
              key={type.id}
              onClick={() => { setActiveMenu(type.id); setCategoryFilter('all'); }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all",
                activeMenu === type.id 
                  ? "bg-brand-500 text-black shadow-lg" 
                  : "text-text-dim hover:text-text-main"
              )}
            >
              <type.icon size={14} />
              {type.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            className="flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all"
            onClick={() => setShowBuilder(true)}
          >
            <ListPlus size={14} /> Armar nueva lista
          </button>
        </div>
      </div>

      <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-2xl relative min-h-[400px]">
        {loading && (
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px] z-50 flex items-center justify-center">
            <Loader2 className="text-brand-500 animate-spin" size={32} />
          </div>
        )}
        <div className="p-4 border-b border-border-dim bg-bg-accent/30 flex flex-wrap justify-between items-center gap-4">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={16} />
            <input 
              type="text"
              placeholder="Buscar por producto o categoría..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-bg-accent border border-border-dim rounded-full pl-10 pr-4 py-2 text-xs text-text-main outline-none focus:border-brand-500"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-bg-accent border border-border-dim rounded-full px-4 py-2 text-[10px] font-black uppercase text-text-main outline-none focus:border-brand-500 cursor-pointer"
          >
            <option value="all">Todas las categorías</option>
            {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {activeMenu === 'pedidosya' && (
            <button onClick={() => setShowCategoriesModal(true)}
              className="bg-bg-accent border border-border-dim text-text-main px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest hover:border-brand-500/50 hover:text-brand-500 transition-all flex items-center gap-1.5"
              title="Crear o quitar categorías de Pedidos Ya">
              <ListPlus size={14} /> Categorías
            </button>
          )}
          <button onClick={() => setShowPdfColsModal(true)}
            className="bg-bg-accent border border-border-dim text-text-main px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:border-red-500/50 hover:text-red-500 transition-all flex items-center gap-1.5"
            title="Descargar esta carta en PDF (elegís las columnas)">
            <Download size={13} /> PDF
          </button>
          <button onClick={exportarCartaExcel}
            className="bg-bg-accent border border-border-dim text-text-main px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:border-emerald-500/50 hover:text-emerald-500 transition-all flex items-center gap-1.5"
            title="Descargar esta carta en Excel">
            <Download size={13} /> Excel
          </button>
          <button onClick={exportar3Cartas}
            className="bg-bg-accent border border-border-dim text-text-main px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:border-brand-500/50 hover:text-brand-500 transition-all flex items-center gap-1.5"
            title="Descargar ambas cartas juntas (PDF y Excel) con precio Salón y Pedidos Ya por producto">
            <Layers size={13} /> Ambas Cartas
          </button>
          <button onClick={() => setShowSimModal(true)}
            className="bg-bg-accent border border-border-dim text-text-main px-4 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:border-emerald-500/50 hover:text-emerald-500 transition-all flex items-center gap-1.5"
            title="Estimar la venta con los precios nuevos, tomando la venta neta de un mes por sucursal">
            <TrendingUp size={13} /> Simular Venta
          </button>
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-brand-500 text-black px-6 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center gap-2"
          >
            <Plus size={14} /> Agregar Item
          </button>
        </div>

        {/* Resúmenes: aumento promedio de la lista e inflación del año */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 px-6 pb-4">
          <div className="bg-bg-accent/40 border border-border-dim rounded-lg p-4">
            <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Aumento promedio · {menuLabel}</p>
            {listAvgIncrease ? (
              <>
                <p className={cn("text-xl font-black font-mono mt-1", listAvgIncrease.avg >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {listAvgIncrease.avg >= 0 ? '+' : ''}{listAvgIncrease.avg.toFixed(1)}%
                </p>
                <p className="text-[8px] text-text-dim uppercase">en lo que va del año · {listAvgIncrease.count} productos</p>
              </>
            ) : (
              <p className="text-sm text-text-dim italic mt-1">Sin datos de enero</p>
            )}
          </div>

          <div onClick={() => { setShowInflationModal(true); if (!newInflMonth) { const d = new Date(); setNewInflMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); } }}
            className="bg-bg-accent/40 border border-border-dim rounded-lg p-4 cursor-pointer hover:border-amber-500/50 transition-all group">
            <div className="flex items-center justify-between">
              <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Inflación acumulada</p>
              <span className="text-[7px] font-black uppercase text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity">Ver detalle →</span>
            </div>
            {yearInflation !== null ? (
              <>
                <p className="text-xl font-black font-mono mt-1 text-amber-500">+{yearInflation.toFixed(1)}%</p>
                <p className="text-[8px] text-text-dim uppercase">{inflationPeriod} (del Estado de Resultado)</p>
              </>
            ) : (
              <p className="text-sm text-text-dim italic mt-1">Sin inflación cargada</p>
            )}
          </div>

          <div className="bg-bg-accent/40 border border-border-dim rounded-lg p-4">
            <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Precios vs Inflación</p>
            {listAvgIncrease && yearInflation !== null ? (() => {
              const diff = listAvgIncrease.avg - yearInflation;
              const over = diff >= 0;
              return (
                <>
                  <p className={cn("text-xl font-black font-mono mt-1", over ? "text-red-500" : "text-emerald-500")}>
                    {over ? '+' : ''}{diff.toFixed(1)} pts
                  </p>
                  <p className="text-[8px] text-text-dim uppercase">
                    {over ? 'los precios subieron MÁS que la inflación' : 'los precios subieron MENOS que la inflación'}
                  </p>
                </>
              );
            })() : (
              <p className="text-sm text-text-dim italic mt-1">Faltan datos</p>
            )}
          </div>

          {/* Aumento ponderado por facturación (según ranking de ventas) */}
          <div onClick={() => weightedIncrease && setShowWeightedModal(true)}
            className={cn("bg-bg-accent/40 border border-border-dim rounded-lg p-4 transition-all group",
              weightedIncrease && "cursor-pointer hover:border-brand-500/50")}>
            <div className="flex items-center justify-between">
              <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Ajuste sugerido (ponderado)</p>
              {weightedIncrease && (
                <span className="text-[7px] font-black uppercase text-brand-500 opacity-0 group-hover:opacity-100 transition-opacity">Ver detalle →</span>
              )}
            </div>
            {weightedIncrease ? (
              <>
                <p className={cn("text-xl font-black font-mono mt-1",
                  weightedIncrease.aumentoSugerido > 0.5 ? "text-amber-500" : "text-emerald-500")}>
                  {weightedIncrease.aumentoSugerido > 0 ? '+' : ''}{weightedIncrease.aumentoSugerido.toFixed(1)}%
                </p>
                <p className="text-[8px] text-text-dim uppercase">
                  {weightedIncrease.aumentoSugerido > 0.5
                    ? 'para emparejar la inflación'
                    : 'la carta ya cubre la inflación'}
                </p>
              </>
            ) : (
              <p className="text-sm text-text-dim italic mt-1">Sin ranking de ventas</p>
            )}
          </div>
        </div>

        {/* Barra de comisión: solo en Pedidos Ya */}
        {activeMenu === 'pedidosya' && (
          <div className="mx-6 mb-4 flex flex-wrap items-center gap-3 bg-brand-500/5 border border-brand-500/30 rounded-lg px-4 py-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-brand-500">Comisión Pedidos Ya</span>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                max={99}
                step={0.5}
                defaultValue={pyCommission}
                key={pyCommission}
                onBlur={(e) => savePyCommission(parseFloat(e.target.value))}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                disabled={isReadOnly}
                className="w-20 bg-bg-card border border-brand-500/50 rounded px-2 py-1 text-right text-[13px] font-mono font-black text-brand-500 outline-none focus:border-brand-500 disabled:opacity-60"
              />
              <span className="text-[13px] font-black text-brand-500">%</span>
            </div>
            <span className="text-[9px] font-bold text-text-dim uppercase tracking-wide">
              El "Precio Ideal Pedidos Ya" se calcula para que, tras esta comisión, te quede el precio ideal por inflación.
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg-accent border-b border-border-dim">
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Categoría</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Producto</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Precio Inicial<br/><span className="text-[8px] opacity-60">(01/01/2026)</span></th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Precio Anterior<br/><span className="text-[8px] opacity-60">(antes del último cambio)</span></th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Precio Actual</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Var. Año</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Precio Ideal<br/><span className="text-[8px] opacity-60">(s/inflación)</span></th>
                {activeMenu === 'pedidosya' && (
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-brand-500 tracking-widest text-right">Precio Ideal PY<br/><span className="text-[8px] opacity-60">(s/infl. + comisión {pyCommission}%)</span></th>
                )}
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Última Act.</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-dim/50">
              {filteredItems.map(item => (
                <tr key={item.id} className="hover:bg-bg-accent/10 transition-colors group">
                  <td className="px-6 py-4">
                    <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-bg-accent border border-border-dim text-text-dim">
                      {item.category}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[11px] font-bold text-text-main uppercase">{item.name}</td>
                  <td className="px-6 py-4 text-right">
                    {item.basePrice ? (
                      <span className="text-[12px] font-mono text-text-dim">${item.basePrice.toLocaleString('es-AR')}</span>
                    ) : (
                      <span className="text-[10px] font-mono text-text-dim/50 italic">s/d</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {item.previousPrice ? (
                      <div>
                        <p className="text-[12px] font-mono text-text-dim">${item.previousPrice.toLocaleString('es-AR')}</p>
                        {item.previousDate && (
                          <p className="text-[8px] font-mono text-text-dim/60">{fmtFecha(item.previousDate)}</p>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] font-mono text-text-dim/50 italic">s/d</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {editingItem?.id === item.id ? (
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-brand-500 font-mono text-xs">$</span>
                        <input 
                          type="number"
                          autoFocus
                          defaultValue={item.price}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleUpdatePrice(item.id, parseFloat((e.target as HTMLInputElement).value));
                            if (e.key === 'Escape') setEditingItem(null);
                          }}
                          onBlur={(e) => handleUpdatePrice(item.id, parseFloat(e.target.value))}
                          className="w-24 bg-bg-accent border border-brand-500 rounded px-2 py-1 text-right text-xs text-brand-500 font-mono outline-none"
                        />
                      </div>
                    ) : (
                      <span className="text-[14px] font-black font-mono text-brand-500">
                        ${item.price.toLocaleString('es-AR')}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {item.basePrice && item.basePrice > 0 ? (() => {
                      const varPct = ((item.price - item.basePrice) / item.basePrice) * 100;
                      const up = varPct >= 0;
                      return (
                        <span className={cn("text-[11px] font-black font-mono", up ? "text-emerald-500" : "text-red-500")}>
                          {up ? '+' : ''}{varPct.toFixed(1)}%
                        </span>
                      );
                    })() : (
                      <span className="text-[10px] text-text-dim/50 italic">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    {item.basePrice && item.basePrice > 0 && yearInflation !== null ? (() => {
                      const ideal = redondeoComercial(item.basePrice * (1 + yearInflation / 100));
                      const diff = ideal - item.price;            // >0 = debería subir; <0 = está por encima
                      const faltaSubir = diff > 0;
                      return (
                        <div>
                          <p className="text-[13px] font-black font-mono text-text-main">${ideal.toLocaleString('es-AR')}</p>
                          {Math.abs(diff) >= 1 ? (
                            <p className={cn("text-[8px] font-bold uppercase", faltaSubir ? "text-amber-500" : "text-emerald-500")}>
                              {faltaSubir ? `falta +$${diff.toLocaleString('es-AR')}` : `ya supera +$${Math.abs(diff).toLocaleString('es-AR')}`}
                            </p>
                          ) : (
                            <p className="text-[8px] font-bold uppercase text-emerald-500">empatado</p>
                          )}
                        </div>
                      );
                    })() : (
                      <span className="text-[10px] text-text-dim/50 italic">—</span>
                    )}
                  </td>
                  {activeMenu === 'pedidosya' && (
                    <td className="px-6 py-4 text-right">
                      {item.basePrice && item.basePrice > 0 && yearInflation !== null ? (() => {
                        const idealPY = redondeoComercial(item.basePrice * (1 + yearInflation / 100) * pyGrossFactor);
                        const diff = idealPY - item.price;   // >0 = debería subir; <0 = ya está por encima
                        const faltaSubir = diff > 0;
                        return (
                          <div>
                            <p className="text-[13px] font-black font-mono text-brand-500">${idealPY.toLocaleString('es-AR')}</p>
                            {Math.abs(diff) >= 1 ? (
                              <p className={cn("text-[8px] font-bold uppercase", faltaSubir ? "text-amber-500" : "text-emerald-500")}>
                                {faltaSubir ? `falta +$${diff.toLocaleString('es-AR')}` : `ya supera +$${Math.abs(diff).toLocaleString('es-AR')}`}
                              </p>
                            ) : (
                              <p className="text-[8px] font-bold uppercase text-emerald-500">empatado</p>
                            )}
                          </div>
                        );
                      })() : (
                        <span className="text-[10px] text-text-dim/50 italic">—</span>
                      )}
                    </td>
                  )}
                  <td className="px-6 py-4 text-center">
                    <span className="text-[10px] font-mono text-text-dim">{fmtFecha(item.lastUpdate)}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => setEditingItem(item)}
                        className="p-1.5 hover:text-brand-500 transition-colors"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button 
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredItems.length === 0 && (
            <div className="py-12 flex flex-col items-center justify-center text-text-dim/50 opacity-20">
               <Tag size={48} />
               <p className="text-[10px] uppercase font-black tracking-widest mt-4">Sin productos en esta categoría</p>
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md bg-bg-card border border-border-dim rounded-lg shadow-2xl p-6"
            >
              <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest mb-6 border-l-2 border-brand-500 pl-4">
                Agregar a {MENU_TYPES.find(t => t.id === activeMenu)?.label}
              </h3>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Categoría</label>
                  <input
                    type="text"
                    list="cat-suggestions"
                    placeholder="Ej: Entradas, Carnes, Bebidas..."
                    className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500"
                    value={newItem.category}
                    onChange={e => setNewItem({...newItem, category: e.target.value})}
                  />
                  <datalist id="cat-suggestions">
                    {availableCategories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Nombre del Producto</label>
                  <input 
                    type="text" 
                    placeholder="Nombre completo"
                    className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500"
                    value={newItem.name}
                    onChange={e => setNewItem({...newItem, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-text-dim uppercase">Precio Sugerido ($)</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" size={14} />
                    <input 
                      type="number" 
                      placeholder="0.00"
                      className="w-full bg-bg-accent border border-border-dim rounded pl-8 pr-4 py-3 text-xs text-text-main font-mono outline-none focus:border-brand-500"
                      value={newItem.price || ''}
                      onChange={e => setNewItem({...newItem, price: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-8 flex gap-3">
                <button 
                  onClick={handleAddItem}
                  className="flex-1 bg-brand-500 text-black py-4 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10"
                >
                  Confirmar Registro
                </button>
                <button 
                  onClick={() => setShowAddModal(false)}
                  className="px-8 py-4 rounded border border-border-dim text-text-dim text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal: simulador de venta */}
      {showSimModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowSimModal(false)}>
          <div className="bg-bg-sidebar border border-border-dim rounded-xl w-full max-w-lg shadow-2xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border-dim flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-text-main flex items-center gap-2"><TrendingUp size={16} className="text-emerald-500" /> Simular venta con la carta nueva</h3>
                <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest mt-0.5">Venta neta de un mes × el aumento de la última carta</p>
              </div>
              <button onClick={() => setShowSimModal(false)} className="text-text-dim hover:text-text-main"><X size={20} /></button>
            </div>

            {simLoading ? (
              <div className="p-10 flex flex-col items-center gap-3">
                <Loader2 size={32} className="animate-spin text-emerald-500" />
                <p className="text-[11px] font-bold text-text-dim uppercase tracking-widest">Cargando ventas y ranking…</p>
              </div>
            ) : (
              <div className="p-5 space-y-4">
                {/* Selectores */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1 flex items-center gap-1"><Store size={11} /> Sucursal</label>
                    <select value={simBranch} onChange={e => setSimBranch(e.target.value)} className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-emerald-500">
                      <option value="all">Todas (cadena)</option>
                      {simBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Mes</label>
                    <select value={simMonth} onChange={e => setSimMonth(e.target.value)} className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[11px] text-text-main outline-none focus:border-emerald-500">
                      {simMonths.length === 0 && <option value="">Sin datos</option>}
                      {simMonths.map(mes => {
                        const [y, m] = mes.split('-');
                        return <option key={mes} value={mes}>{MONTHS_ES[parseInt(m) - 1]} {y}</option>;
                      })}
                    </select>
                  </div>
                </div>

                {/* Resultado */}
                {simResult ? (
                  <>
                    <div className="grid grid-cols-1 gap-2">
                      <div className="bg-bg-accent/40 border border-border-dim rounded-lg p-4 flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase text-text-dim tracking-widest">Venta neta real del mes</span>
                        <span className="text-lg font-black font-mono text-text-main">${Math.round(simResult.base).toLocaleString('es-AR')}</span>
                      </div>
                      <div className="bg-bg-accent/40 border border-border-dim rounded-lg p-4 flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase text-text-dim tracking-widest">Aumento ponderado de la carta</span>
                        <span className="text-lg font-black font-mono text-amber-500">{simResult.pct >= 0 ? '+' : ''}{simResult.pct.toFixed(1)}%</span>
                      </div>
                      <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-lg p-4 flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase text-emerald-500 tracking-widest">Venta estimada con la carta nueva</span>
                        <span className="text-xl font-black font-mono text-emerald-500">${Math.round(simResult.simulado).toLocaleString('es-AR')}</span>
                      </div>
                      <div className="bg-bg-accent/40 border border-border-dim rounded-lg p-4 flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase text-text-dim tracking-widest">Diferencia estimada</span>
                        <span className="text-lg font-black font-mono text-emerald-500">+${Math.round(simResult.diff).toLocaleString('es-AR')} <span className="text-[11px]">({simResult.base > 0 ? '+' : ''}{simResult.base > 0 ? ((simResult.diff / simResult.base) * 100).toFixed(1) : '0'}%)</span></span>
                      </div>
                    </div>

                    <p className="text-[9px] text-text-dim leading-relaxed">
                      Estimación a <b>volumen constante</b> (se asume vender lo mismo que ese mes). El % surge de {simResult.matched} productos cruzados por código,
                      ponderados por unidades vendidas{simBranch === 'all' ? ' de toda la cadena' : ' de la sucursal'}. Es un aproximado para dimensionar el impacto, no un valor exacto.
                    </p>
                  </>
                ) : (
                  <p className="text-[11px] text-text-dim italic text-center py-6">No hay venta neta cargada para ese mes/sucursal.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: elegir columnas del PDF */}
      {showPdfColsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowPdfColsModal(false)}>
          <div className="bg-bg-sidebar border border-border-dim rounded-xl w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border-dim flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-text-main">Columnas del PDF · {menuLabel}</h3>
                <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest mt-0.5">Elegí qué columnas incluir en el PDF</p>
              </div>
              <button onClick={() => setShowPdfColsModal(false)} className="text-text-dim hover:text-text-main"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
              {PDF_COL_DEFS.filter(c => !c.pedidosyaOnly || activeMenu === 'pedidosya').map(c => (
                <label key={c.key} className="flex items-center gap-2.5 bg-bg-card border border-border-dim/50 rounded px-3 py-2 cursor-pointer hover:border-brand-500/40">
                  <input
                    type="checkbox"
                    checked={!!pdfCols[c.key]}
                    onChange={e => setPdfCols(prev => ({ ...prev, [c.key]: e.target.checked }))}
                    className="accent-brand-500 w-4 h-4"
                  />
                  <span className="text-[11px] font-bold text-text-main uppercase">{c.label}</span>
                </label>
              ))}
            </div>
            <div className="p-4 border-t border-border-dim flex justify-end gap-2">
              <button onClick={() => setShowPdfColsModal(false)} className="px-3 py-2 rounded text-[9px] font-black uppercase tracking-widest text-text-dim border border-border-dim hover:text-text-main">Cancelar</button>
              <button onClick={exportarCartaPDF} className="flex items-center gap-1.5 bg-brand-500 text-white px-4 py-2 rounded text-[9px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all">
                <Download size={13} /> Generar PDF
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: administrar categorías de Pedidos Ya */}
      {showCategoriesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setShowCategoriesModal(false)}>
          <div className="bg-bg-sidebar border border-border-dim rounded-xl w-full max-w-md shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-border-dim flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-text-main">Categorías · Pedidos Ya</h3>
                <p className="text-[9px] font-bold text-text-dim uppercase tracking-widest mt-0.5">Creá o quitá categorías para clasificar tus productos</p>
              </div>
              <button onClick={() => setShowCategoriesModal(false)} className="text-text-dim hover:text-text-main"><X size={20} /></button>
            </div>

            {/* Alta */}
            <div className="p-4 border-b border-border-dim flex items-end gap-2 bg-bg-accent/20">
              <div className="flex-1">
                <label className="text-[9px] font-black uppercase text-text-dim tracking-widest block mb-1">Nueva categoría</label>
                <input
                  type="text"
                  placeholder="Ej: PROMOS PEDIDOS YA"
                  value={newCatName}
                  onChange={e => setNewCatName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addCategory(); }}
                  disabled={isReadOnly}
                  className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[11px] text-text-main uppercase outline-none focus:border-brand-500 disabled:opacity-60"
                />
              </div>
              <button onClick={addCategory} disabled={isReadOnly || !newCatName.trim()}
                className="flex items-center gap-1.5 bg-brand-500 text-white px-3 py-2 rounded text-[9px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all disabled:opacity-40">
                <Plus size={13} /> Agregar
              </button>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
              {availableCategories.length === 0 ? (
                <p className="text-[10px] text-text-dim font-bold uppercase text-center py-4">Todavía no hay categorías</p>
              ) : availableCategories.map(cat => {
                const esCreada = (managedCats['pedidosya'] || []).includes(cat);
                const enUso = (menus['pedidosya'] || []).some(i => String(i.category).toUpperCase() === cat);
                return (
                  <div key={cat} className="flex items-center justify-between gap-2 bg-bg-card border border-border-dim/50 rounded px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Tag size={12} className="text-text-dim" />
                      <span className="text-[11px] font-bold text-text-main uppercase">{cat}</span>
                      {enUso && <span className="text-[7px] font-black uppercase px-1.5 py-0.5 rounded bg-bg-accent border border-border-dim text-text-dim">en uso</span>}
                    </div>
                    {esCreada ? (
                      <button onClick={() => deleteCategory(cat)} className="text-text-dim hover:text-red-500" title="Quitar categoría"><Trash2 size={13} /></button>
                    ) : (
                      <span className="text-[7px] font-black uppercase text-text-dim/50">de productos</span>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-4 py-2 border-t border-border-dim">
              <p className="text-[8px] text-text-dim uppercase tracking-wide">Las que dicen "de productos" salen solas de los ítems cargados y no se pueden quitar desde acá.</p>
            </div>
          </div>
        </div>
      )}

      {showBuilder && (
        <PriceListBuilder
          menuType={activeMenu}
          menuLabel={menuLabel}
          isReadOnly={isReadOnly}
          items={(menus[activeMenu] || []).map(item => {
            const sugerido = (item.basePrice && item.basePrice > 0 && yearInflation !== null)
              ? redondeoComercial(item.basePrice * (1 + yearInflation / 100))
              : item.price;
            return {
              id: item.id, category: item.category, name: item.name,
              precioActual: item.price, precioInicial: item.basePrice,
              precioSugerido: sugerido,
              externalCode: item.externalCode ?? null,
            };
          })}
          onClose={() => setShowBuilder(false)}
          onConfirmed={() => fetchData()}
        />
      )}
      {/* Modal: análisis ponderado por facturación */}
      {showWeightedModal && weightedIncrease && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowWeightedModal(false)}>
          <div className="bg-bg-card border border-border-dim rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border-dim flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-brand-500">Ajuste ponderado por facturación</h3>
                <p className="text-[8px] font-bold uppercase text-text-dim mt-0.5">
                  {menuLabel} · cada producto pesa según cuánto factura
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={exportarAjustePDF}
                  className="bg-bg-accent border border-border-dim px-3 py-1.5 rounded text-[9px] font-black uppercase text-text-main hover:border-red-500/50 hover:text-red-500 transition-all flex items-center gap-1">
                  <Download size={11} /> PDF
                </button>
                <button onClick={exportarAjusteExcel}
                  className="bg-bg-accent border border-border-dim px-3 py-1.5 rounded text-[9px] font-black uppercase text-text-main hover:border-emerald-500/50 hover:text-emerald-500 transition-all flex items-center gap-1">
                  <Download size={11} /> Excel
                </button>
                <button onClick={() => setShowWeightedModal(false)} className="text-text-dim hover:text-text-main text-lg font-black ml-1">✕</button>
              </div>
            </div>

            {/* Resumen */}
            <div className="px-5 py-4 bg-bg-accent/30 border-b border-border-dim grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <p className="text-[7px] font-black uppercase text-text-dim tracking-widest">Aumento ponderado</p>
                <p className="text-base font-mono font-black text-text-main">{weightedIncrease.ponderado >= 0 ? '+' : ''}{weightedIncrease.ponderado.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-[7px] font-black uppercase text-text-dim tracking-widest">Inflación</p>
                <p className="text-base font-mono font-black text-amber-500">+{weightedIncrease.infl.toFixed(1)}%</p>
              </div>
              <div>
                <p className="text-[7px] font-black uppercase text-text-dim tracking-widest">Brecha</p>
                <p className={cn("text-base font-mono font-black", weightedIncrease.brecha >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {weightedIncrease.brecha >= 0 ? '+' : ''}{weightedIncrease.brecha.toFixed(1)} pts
                </p>
              </div>
              <div>
                <p className="text-[7px] font-black uppercase text-text-dim tracking-widest">Ajuste sugerido</p>
                <p className="text-base font-mono font-black text-brand-500">
                  {weightedIncrease.aumentoSugerido > 0 ? '+' : ''}{weightedIncrease.aumentoSugerido.toFixed(1)}%
                </p>
              </div>
            </div>

            <div className="px-5 py-3 bg-brand-500/5 border-b border-border-dim">
              <p className="text-[10px] font-bold text-text-main leading-relaxed">
                {weightedIncrease.aumentoSugerido > 0.5 ? (
                  <>Aplicando un <strong>{weightedIncrease.aumentoSugerido.toFixed(1)}%</strong> parejo a toda la carta,
                  la facturación por precios igualaría la inflación acumulada del año.</>
                ) : (
                  <>La carta ya subió al ritmo de la inflación (o más), ponderando por lo que realmente se vende.</>
                )}
              </p>
              <p className="text-[8px] font-bold uppercase text-text-dim mt-1.5">
                {weightedIncrease.conVentas} productos con ventas · {weightedIncrease.sinVentas} sin ventas (no ponderan)
              </p>
            </div>

            {/* Detalle por producto */}
            <div className="overflow-y-auto">
              <table className="w-full text-[10px]">
                <thead className="sticky top-0 bg-bg-accent">
                  <tr className="text-text-dim font-black uppercase tracking-widest border-b border-border-dim">
                    <th className="px-4 py-2.5 text-left">Producto</th>
                    <th className="px-3 py-2.5 text-right">Unid.</th>
                    <th className="px-3 py-2.5 text-right">Enero</th>
                    <th className="px-3 py-2.5 text-right">Hoy</th>
                    <th className="px-3 py-2.5 text-right text-brand-500">Sugerido</th>
                    <th className="px-3 py-2.5 text-right text-brand-500">Var. sug.</th>
                    <th className="px-3 py-2.5 text-right">Var.</th>
                    <th className="px-3 py-2.5 text-right">Peso</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim/40">
                  {weightedIncrease.detalle.map((d, i) => {
                    const peso = (d.fact / weightedIncrease.totalFact) * 100;
                    // Precio objetivo: se aplica el ajuste sugerido y se redondea a valor comercial
                    const sugerido = redondeoComercial(d.price * (1 + weightedIncrease.aumentoSugerido / 100));
                    return (
                      <tr key={i} className="hover:bg-bg-accent/30">
                        <td className="px-4 py-2 font-bold uppercase text-text-main">{d.name}</td>
                        <td className="px-3 py-2 text-right font-mono text-text-dim">{d.units.toLocaleString('es-AR')}</td>
                        <td className="px-3 py-2 text-right font-mono text-text-dim">${d.base.toLocaleString('es-AR')}</td>
                        <td className="px-3 py-2 text-right font-mono text-text-main">${d.price.toLocaleString('es-AR')}</td>
                        <td className="px-3 py-2 text-right font-mono font-black text-brand-500">
                          ${sugerido.toLocaleString('es-AR')}
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-text-dim">
                          {d.price > 0 ? `${((sugerido - d.price) / d.price * 100) >= 0 ? '+' : ''}${((sugerido - d.price) / d.price * 100).toFixed(1)}%` : '-'}
                        </td>
                        <td className={cn("px-3 py-2 text-right font-mono font-black", d.pct >= weightedIncrease.infl ? "text-emerald-500" : "text-amber-500")}>
                          {d.pct >= 0 ? '+' : ''}{d.pct.toFixed(1)}%
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-black text-brand-500">{peso.toFixed(1)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Modal: detalle y carga de inflación mensual */}
      {showInflationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setShowInflationModal(false)}>
          <div className="bg-bg-card border border-border-dim rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-border-dim flex items-center justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-amber-500">Inflación mensual cargada</h3>
                <p className="text-[8px] font-bold uppercase text-text-dim mt-0.5">Fuente del cálculo acumulado</p>
              </div>
              <button onClick={() => setShowInflationModal(false)} className="text-text-dim hover:text-text-main text-lg font-black">✕</button>
            </div>

            {/* Alta de un mes */}
            {!isReadOnly && (
              <div className="px-5 py-4 border-b border-border-dim bg-bg-accent/30 space-y-2">
                <p className="text-[9px] font-black uppercase tracking-widest text-text-dim">Cargar / actualizar un mes</p>
                <div className="flex gap-2 flex-wrap">
                  <input type="month" value={newInflMonth} onChange={e => setNewInflMonth(e.target.value)}
                    className="flex-1 min-w-[130px] bg-bg-card border border-border-dim rounded px-3 py-2 text-[11px] font-mono font-bold text-text-main outline-none focus:border-amber-500" />
                  <input type="text" inputMode="decimal" value={newInflPct} onChange={e => setNewInflPct(e.target.value)}
                    placeholder="% (ej. 2,5)"
                    className="flex-1 min-w-[110px] bg-bg-card border border-border-dim rounded px-3 py-2 text-[11px] font-mono font-bold text-text-main outline-none focus:border-amber-500" />
                  <button onClick={guardarInflacion}
                    className="bg-amber-500 hover:bg-amber-600 text-black rounded px-4 py-2 text-[9px] font-black uppercase transition-all">
                    Guardar
                  </button>
                </div>
                <p className="text-[8px] font-bold uppercase text-text-dim opacity-70">
                  Si el mes ya existe, se actualiza el valor.
                </p>
              </div>
            )}

            {/* Listado */}
            <div className="overflow-y-auto p-4 space-y-1.5">
              {inflationRows.length === 0 ? (
                <p className="text-center text-[10px] font-bold uppercase text-text-dim py-8">No hay meses cargados.</p>
              ) : inflationRows.map(r => (
                <div key={r.month} className="flex items-center justify-between bg-bg-sidebar border border-border-dim rounded px-3 py-2">
                  <span className="text-[11px] font-black uppercase text-text-main">{mesLabel(r.month)}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] font-mono font-black text-amber-500">
                      {Number(r.inflation_pct) >= 0 ? '+' : ''}{Number(r.inflation_pct).toFixed(1)}%
                    </span>
                    {!isReadOnly && (
                      <button onClick={() => borrarInflacion(r.month)} className="text-text-dim hover:text-red-500 text-[10px] font-black">✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
