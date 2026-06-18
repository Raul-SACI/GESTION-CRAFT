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
  ListPlus
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
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

const MENU_TYPES = [
  { id: 'salon', label: 'Carta Salón', icon: UtensilsCrossed },
  { id: 'celiacos', label: 'Carta Celíacos', icon: Layers },
  { id: 'pedidosya', label: 'Pedidos Ya', icon: FileText }
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

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from('menu_items').select('*');
    // Traer todo el historial para calcular el precio base del año (el más antiguo) por producto
    const { data: history } = await supabase
      .from('menu_price_history')
      .select('menu_item_id, new_price, change_date')
      .order('change_date', { ascending: true });

    // Primer registro (más antiguo) de cada producto = precio base del año
    const baseByItem: Record<string, { price: number; date: string }> = {};
    (history || []).forEach((h: any) => {
      if (!h.menu_item_id) return;
      if (!baseByItem[h.menu_item_id]) {
        baseByItem[h.menu_item_id] = { price: Number(h.new_price), date: h.change_date };
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
    } catch (e) { console.error('Error cargando inflación:', e); }

    if (data) {
      const organized: Record<string, MenuItem[]> = {
        salon: [],
        celiacos: [],
        pedidosya: []
      };
      data.forEach(item => {
        if (organized[item.menu_type]) {
          const base = baseByItem[item.id];
          organized[item.menu_type].push({
            id: item.id,
            category: item.category,
            name: item.name,
            price: item.price,
            lastUpdate: item.last_update,
            basePrice: base ? base.price : null,
            baseDate: base ? base.date : null
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
  const availableCategories = Array.from(new Set((menus[activeMenu] || []).map(i => i.category))).sort();

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

  const menuLabel = MENU_TYPES.find(m => m.id === activeMenu)?.label || '';

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
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-brand-500 text-black px-6 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center gap-2"
          >
            <Plus size={14} /> Agregar Item
          </button>
        </div>

        {/* Resúmenes: aumento promedio de la lista e inflación del año */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 px-6 pb-4">
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

          <div className="bg-bg-accent/40 border border-border-dim rounded-lg p-4">
            <p className="text-[8px] font-black uppercase text-text-dim tracking-widest">Inflación acumulada</p>
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
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-bg-accent border-b border-border-dim">
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Categoría</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Producto</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Precio Inicial<br/><span className="text-[8px] opacity-60">(01/01/2026)</span></th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Precio Actual</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Var. Año</th>
                <th className="px-6 py-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Precio Ideal<br/><span className="text-[8px] opacity-60">(s/inflación)</span></th>
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
                    placeholder="Ej: Entradas, Carnes, Bebidas..."
                    className="w-full bg-bg-accent border border-border-dim rounded px-4 py-3 text-xs text-text-main outline-none focus:border-brand-500"
                    value={newItem.category}
                    onChange={e => setNewItem({...newItem, category: e.target.value})}
                  />
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
            };
          })}
          onClose={() => setShowBuilder(false)}
          onConfirmed={() => fetchData()}
        />
      )}
    </motion.div>
  );
}
