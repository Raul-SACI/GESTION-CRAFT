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
  Loader2
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { supabase } from '../lib/supabase';

interface MenuItem {
  id: string;
  category: string;
  name: string;
  price: number;
  lastUpdate: string;
  basePrice?: number | null;   // primer precio del año (enero), para la variación acumulada
  baseDate?: string | null;
}

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

  const filteredItems = (menus[activeMenu] || []).filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) ||
    item.category.toLowerCase().includes(search.toLowerCase())
  );

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
              onClick={() => setActiveMenu(type.id)}
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
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all"
            onClick={() => window.print()}
          >
            <FileSpreadsheet size={14} /> Excel
          </button>
          <button 
            className="flex items-center gap-2 px-4 py-2 bg-brand-500/10 text-brand-500 border border-brand-500/20 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-500/20 transition-all"
            onClick={() => window.print()}
          >
            <FileText size={14} /> PDF
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
          <button 
            onClick={() => setShowAddModal(true)}
            className="bg-brand-500 text-black px-6 py-2.5 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center gap-2"
          >
            <Plus size={14} /> Agregar Item
          </button>
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
    </motion.div>
  );
}
