import React, { useState, useEffect } from 'react';
import { 
  BarChart3, 
  Settings2, 
  Table2, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle,
  Plus,
  X,
  Search,
  BookOpen,
  Info,
  Trash2,
  Edit2,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Upload,
  Download,
  LayoutDashboard
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { Branch, StockItem, Product } from '../types';
import { supabase } from '../lib/supabase';
import * as XLSX from 'xlsx';

export default function DeviationControlView({ 
  branches, 
  selectedBranchId,
  onBranchChange,
  controlledItemIds: initialControlledItemIds,
  setControlledItemIds: setInitialControlledItemIds,
  items,
  setItems,
  products,
  setProducts
}: { 
  branches: Branch[], 
  selectedBranchId: string,
  onBranchChange?: (id: string) => void,
  controlledItemIds: string[],
  setControlledItemIds: React.Dispatch<React.SetStateAction<string[]>>,
  items: StockItem[],
  setItems: React.Dispatch<React.SetStateAction<StockItem[]>>,
  products: Product[],
  setProducts: React.Dispatch<React.SetStateAction<Product[]>>
}) {
  const [activeTab, setActiveTab] = useState<'selector' | 'recetas' | 'comparativo' | 'gestion' | 'planilla'>('comparativo');
  
  // Persistence State
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [controlledIds, setControlledIds] = useState<string[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recipeViewMode, setRecipeViewMode] = useState<'individual' | 'table'>('individual');
  const [recipeTableSearch, setRecipeTableSearch] = useState('');

  // Daily Logs State
  const [dailyLogs, setDailyLogs] = useState<any[]>([]);
  const [isSavingDaily, setIsSavingDaily] = useState(false);

  // Fetch Daily Logs
  useEffect(() => {
    const fetchDailyLogs = async () => {
      const { data, error } = await supabase
        .from('inventory_logs')
        .select('*')
        .match({ branch_id: selectedBranchId })
        .gte('date', `${selectedMonth}-01`)
        .lte('date', `${selectedMonth}-31`);

      if (data) {
        setDailyLogs(data.map(d => ({
          ...d,
          itemId: d.item_id,
          ei: d.ei,
          purchases: d.compras,
          waste: d.decomisos,
          theoretical_sales: d.ventas_teorico,
          staff_consumption: d.consumo_personal,
          loans: d.prestamos
        })));
      }
    };
    if (selectedBranchId && selectedMonth) {
      fetchDailyLogs();
    }
  }, [selectedBranchId, selectedMonth]);

  const updateDailyLog = async (date: string, itemId: string, field: string, value: number) => {
    // Map field to DB column
    const columnMap: Record<string, string> = {
      purchases: 'compras',
      waste: 'decomisos',
      theoretical_sales: 'ventas_teorico'
    };

    const dbField = columnMap[field];
    if (!dbField) return;

    const { data, error } = await supabase
      .from('inventory_logs')
      .upsert({
        branch_id: selectedBranchId,
        item_id: itemId,
        date,
        [dbField]: value
      }, { onConflict: 'branch_id,item_id,date' })
      .select()
      .single();

    if (data) {
      setDailyLogs(prev => {
        const otherLogs = prev.filter(l => !(l.date === date && l.item_id === itemId));
        return [...otherLogs, {
          ...data,
          itemId: data.item_id,
          purchases: data.compras,
          waste: data.decomisos,
          theoretical_sales: data.ventas_teorico,
          staff_consumption: data.consumo_personal,
          loans: data.prestamos
        }];
      });
    }
  };

  const getWeeks = () => {
    const year = parseInt(selectedMonth.split('-')[0]);
    const month = parseInt(selectedMonth.split('-')[1]);
    const lastDay = new Date(year, month, 0).getDate();
    return [
      { id: 1, label: 'Semana 1', range: '(01-07)', date: `${selectedMonth}-01` },
      { id: 2, label: 'Semana 2', range: '(08-14)', date: `${selectedMonth}-08` },
      { id: 3, label: 'Semana 3', range: '(15-21)', date: `${selectedMonth}-15` },
      { id: 4, label: 'Semana 4', range: '(22-Fin)', date: `${selectedMonth}-22` },
    ];
  };

  const getDatesForWeek = (weekId: number) => {
    const year = parseInt(selectedMonth.split('-')[0]);
    const month = parseInt(selectedMonth.split('-')[1]);
    const lastDay = new Date(year, month, 0).getDate();
    
    let start = 1, end = 7;
    if (weekId === 2) { start = 8; end = 14; }
    else if (weekId === 3) { start = 15; end = 21; }
    else if (weekId === 4) { start = 22; end = lastDay; }

    const dates: string[] = [];
    for (let i = start; i <= end; i++) {
      dates.push(`${selectedMonth}-${String(i).padStart(2, '0')}`);
    }
    return dates;
  };

  // New CRUD state
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [itemForm, setItemForm] = useState({ name: '', unit: '', cost: 0 });
  const [productForm, setProductForm] = useState({ name: '', category: '' });

  const downloadTemplate = (type: 'items' | 'products' | 'recipes') => {
    let data = [];
    let filename = '';

    if (type === 'items') {
      data = [{ 'Nombre': 'EJEMPLO INSUMO', 'Unidad': 'KG', 'Costo': 100 }];
      filename = 'modelo_insumos.xlsx';
    } else if (type === 'products') {
      data = [{ 'Nombre': 'EJEMPLO PRODUCTO', 'Categoria': 'HAMBURGUESAS' }];
      filename = 'modelo_productos.xlsx';
    } else if (type === 'recipes') {
      data = [{ 
        'Nombre del Producto': 'CLASSIC BURGER', 
        'Nombre del insumo': 'CARNE', 
        'Unidad de medida del insumo': 'KG', 
        'Consumo por producto': 0.150 
      }];
      filename = 'modelo_recetas.xlsx';
    }

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, filename);
  };

  const handleImportItems = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const newItems = data.map((row: any) => ({
          name: String(row.Nombre || row.name || '').toUpperCase(),
          unit: String(row.Unidad || row.unit || '').toLowerCase(),
          cost: parseFloat(row.Costo || row.cost || 0)
        })).filter(i => i.name && i.unit);

        if (newItems.length > 0) {
          const { error } = await supabase.from('stock_items').insert(newItems);
          if (error) throw error;
          alert(`Éxito: ${newItems.length} insumos importados.`);
        }
      } catch (err: any) {
        alert('Error al importar insumos: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handleImportProducts = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const newProducts = data.map((row: any) => ({
          name: String(row.Nombre || row.name || '').toUpperCase(),
          category: String(row.Categoria || row.category || 'SIN CATEGORIA').toUpperCase()
        })).filter(p => p.name);

        if (newProducts.length > 0) {
          const { error } = await supabase.from('products').insert(newProducts);
          if (error) throw error;
          alert(`Éxito: ${newProducts.length} productos importados.`);
        }
      } catch (err: any) {
        alert('Error al importar productos: ' + err.message);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  const fetchRecipes = async () => {
    const { data, error } = await supabase
      .from('recipes')
      .select('*');
    
    if (data) {
      const grouped: Record<string, any[]> = {};
      data.forEach(r => {
        if (!grouped[r.product_id]) grouped[r.product_id] = [];
        grouped[r.product_id].push({
          productId: r.product_id,
          itemId: r.item_id,
          quantity: r.quantity
        });
      });
      setRecipes(grouped);
    }
  };

  // Fetch Recipes
  React.useEffect(() => {
    fetchRecipes();
    
    // Default selection
    if (!selectedProductId && products.length > 0) {
      setSelectedProductId(products[0].id);
    }
  }, [products]);

  const handleImportRecipes = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        const recipesMap = new Map<string, any>();
        const productsToClear = new Set<string>();

        data.forEach((row: any) => {
          const prodName = String(row['Nombre del Producto'] || row.Producto || row.product || '').trim().toUpperCase();
          const itemName = String(row['Nombre del insumo'] || row.Insumo || row.item || '').trim().toUpperCase();
          
          let quantityRaw = row['Consumo por producto'] || row.Cantidad || row.quantity || 0;
          let quantity = 0;
          if (typeof quantityRaw === 'number') {
            quantity = quantityRaw;
          } else if (typeof quantityRaw === 'string') {
            quantity = parseFloat(quantityRaw.replace(',', '.'));
          }

          const product = products.find(p => p.name.trim().toUpperCase() === prodName);
          const item = items.find(i => i.name.trim().toUpperCase() === itemName);

          if (product && item && quantity > 0) {
            const compositeKey = `${product.id}-${item.id}`;
            recipesMap.set(compositeKey, {
              product_id: product.id,
              item_id: item.id,
              quantity
            });
            productsToClear.add(product.id);
          }
        });

        const newRecipes = Array.from(recipesMap.values());

        if (newRecipes.length > 0) {
          // 1. Clear existing recipes for products present in the file to avoid duplicates
          const productIdsArray = Array.from(productsToClear);
          const { error: deleteError } = await supabase
            .from('recipes')
            .delete()
            .in('product_id', productIdsArray);
          
          if (deleteError) throw deleteError;

          // 2. Insert new ones
          const { error } = await supabase.from('recipes').insert(newRecipes);
          if (error) throw error;

          await fetchRecipes();
          alert(`Éxito: Se actualizaron las recetas de ${productsToClear.size} productos (${newRecipes.length} ingredientes en total).`);
        } else {
          alert('No se encontraron coincidencias para importar. Verifique que los nombres de productos e insumos coincidan exactamente con los maestros.');
        }
      } catch (err: any) {
        alert('Error al importar recetas: ' + err.message);
      } finally {
        setLoading(false);
        if (e.target) e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  const [recipes, setRecipes] = useState<Record<string, { productId: string, itemId: string, quantity: number }[]>>({});
  
  const flattenedRecipes = React.useMemo(() => {
    const list: { productId: string, itemId: string, quantity: number }[] = [];
    Object.entries(recipes).forEach(([_, lines]) => {
      (lines as any[]).forEach(line => {
        list.push(line);
      });
    });
    return list;
  }, [recipes]);
  const [recipeDisplayUnits, setRecipeDisplayUnits] = useState<Record<string, string>>({}); // key: productId-itemId

  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [recipeSearch, setRecipeSearch] = useState('');

  // Fetch Controlled Items for Month/Branch
  useEffect(() => {
    const fetchMonthlyControls = async () => {
      setIsLoadingHistory(true);
      const { data, error } = await supabase
        .from('monthly_controlled_items')
        .select('item_ids')
        .match({ branch_id: selectedBranchId, month: selectedMonth })
        .maybeSingle();

      if (error) {
        console.error('Error fetching monthly controls:', error);
      }
      
      if (data) {
        setControlledIds(data.item_ids || []);
      } else {
        // If no specific month found, default to the current active selection
        setControlledIds(initialControlledItemIds || []);
      }
      setIsLoadingHistory(false);
    };

    if (selectedBranchId && selectedMonth) {
      fetchMonthlyControls();
    }
  }, [selectedMonth, selectedBranchId, initialControlledItemIds]);

  const saveMonthlyControl = async () => {
    if (!selectedBranchId || selectedBranchId === 'all') {
      alert('Por favor, seleccione una sucursal específica para confirmar el control mensual.');
      return;
    }

    const { error } = await supabase
      .from('monthly_controlled_items')
      .upsert({
        branch_id: selectedBranchId,
        month: selectedMonth,
        item_ids: controlledIds
      }, { onConflict: 'branch_id,month' });

    if (!error) {
      alert(`Control de desvíos para ${selectedMonth} confirmado exitosamente. Ahora puede cargar la planilla semanal.`);
    } else {
      console.error('Error saving monthly control:', error);
      alert(`Error de validación (RLS) en Supabase: ${error.message}. 
      
Para solucionar esto, copie y ejecute el siguiente comando en el SQL Editor de Supabase:
ALTER TABLE monthly_controlled_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public Access" ON monthly_controlled_items FOR ALL USING (true) WITH CHECK (true);`);
    }
  };

  const getSubUnit = (unit: string) => {
    if (unit?.toLowerCase() === 'kg') return 'gr';
    if (unit?.toLowerCase() === 'l') return 'ml';
    return null;
  };

  const getDisplayQuantity = (itemId: string, quantity: number, productId: string) => {
    const item = items.find(i => i.id === itemId);
    const unit = recipeDisplayUnits[`${productId}-${itemId}`] || item?.unit || '';
    if (unit === 'gr' || unit === 'ml') return quantity * 1000;
    return quantity;
  };

  const addIngredientToRecipe = async (productId: string, itemId: string) => {
    const currentRecipe = recipes[productId] || [];
    if (currentRecipe.some(r => r.itemId === itemId)) return;

    const { error } = await supabase
      .from('recipes')
      .insert({ product_id: productId, item_id: itemId, quantity: 1 });

    if (!error) {
       setRecipes(prev => ({
         ...prev,
         [productId]: [...currentRecipe, { productId, itemId, quantity: 1 }]
       }));
    }
  };

  const updateIngredientQuantity = async (productId: string, itemId: string, displayVal: number) => {
    const item = items.find(i => i.id === itemId);
    const unit = recipeDisplayUnits[`${productId}-${itemId}`] || item?.unit || '';
    const quantity = (unit === 'gr' || unit === 'ml') ? displayVal / 1000 : displayVal;

    const { error } = await supabase
      .from('recipes')
      .update({ quantity })
      .match({ product_id: productId, item_id: itemId });

    if (!error) {
      setRecipes(prev => ({
        ...prev,
        [productId]: (prev[productId] || []).map(r => r.itemId === itemId ? { ...r, quantity } : r)
      }));
    }
  };

  const removeIngredientFromRecipe = async (productId: string, itemId: string) => {
    const { error } = await supabase
      .from('recipes')
      .delete()
      .match({ product_id: productId, item_id: itemId });

    if (!error) {
      setRecipes(prev => ({
        ...prev,
        [productId]: (prev[productId] || []).filter(r => r.itemId !== itemId)
      }));
    }
  };

  const validControlledIds = controlledIds.filter(id => items.some(item => item.id === id));

  // 3. Comparison State (Aggregated data from dailyLogs)
  const deviations = validControlledIds.map(id => {
    const itemLogs = dailyLogs.filter(l => l.itemId === id);
    
    // EI is the first available EI of the month
    const sortedLogs = [...itemLogs].sort((a, b) => a.date.localeCompare(b.date));
    const ei = sortedLogs[0]?.ei || 0;
    const ef = sortedLogs[sortedLogs.length - 1]?.ef || 0;
    
    const totals = itemLogs.reduce((acc, log) => ({
      purchases: acc.purchases + (log.purchases || 0),
      loans: acc.loans + (log.loans || 0),
      waste: acc.waste + (log.waste || 0),
      staff_consumption: acc.staff_consumption + (log.staff_consumption || 0),
      theoretical_sales: acc.theoretical_sales + (log.theoretical_sales || 0)
    }), { purchases: 0, loans: 0, waste: 0, staff_consumption: 0, theoretical_sales: 0 });

    const realConsumption = ei + totals.purchases + totals.loans - totals.waste - totals.staff_consumption - ef;
    
    return { 
      itemId: id, 
      real: realConsumption, 
      theo: totals.theoretical_sales 
    };
  });

  const getSemaphoreColor = (diffPercent: number) => {
    if (diffPercent < 3) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    if (diffPercent <= 5) return 'text-orange-500 bg-orange-500/10 border-orange-500/20';
    return 'text-red-500 bg-red-500/10 border-red-500/20';
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-border-dim gap-4">
        <div className="flex items-center gap-3">
          <div className="bg-brand-500/10 p-3 text-brand-500 border border-brand-500/20 rounded-lg shadow-inner">
            <ShieldAlert size={24} />
          </div>
          <div>
            <h2 className="text-xl font-black text-text-main uppercase tracking-tight">Control de Desvíos</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest italic opacity-70">Consola de Control de Administración</p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-bg-sidebar border border-border-dim rounded px-3 py-1.5 shadow-sm">
           <CalendarIcon size={14} className="text-brand-500" />
           <input 
             type="month" 
             value={selectedMonth}
             onChange={(e) => setSelectedMonth(e.target.value)}
             className="bg-transparent text-[11px] font-black uppercase text-text-main outline-none cursor-pointer"
           />
        </div>
        
        <div className="flex bg-bg-sidebar p-1 rounded border border-border-dim shadow-sm self-start md:self-center">
          <TabButton active={activeTab === 'comparativo'} onClick={() => setActiveTab('comparativo')} icon={<BarChart3 size={14} />} label="Resultados" />
          <TabButton active={activeTab === 'planilla'} onClick={() => setActiveTab('planilla')} icon={<Table2 size={14} />} label="Planilla Semanal" />
          <TabButton active={activeTab === 'selector'} onClick={() => setActiveTab('selector')} icon={<Settings2 size={14} />} label="Selector de Insumos" />
          <TabButton active={activeTab === 'recetas'} onClick={() => setActiveTab('recetas')} icon={<BookOpen size={14} />} label="Recetas" />
          <TabButton active={activeTab === 'gestion'} onClick={() => setActiveTab('gestion')} icon={<Settings2 size={14} />} label="Maestros" />
        </div>
      </div>

      {onBranchChange && (
        <div className="flex flex-wrap items-center gap-2 bg-bg-sidebar/50 p-4 rounded border border-border-dim/60">
          <span className="text-[9px] font-black uppercase text-text-dim tracking-widest mr-2">Filtrar Sucursal:</span>
          <button
            onClick={() => onBranchChange('all')}
            className={cn(
              "px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
              selectedBranchId === 'all'
                ? "bg-brand-500 text-black border-brand-500 font-extrabold shadow-md"
                : "bg-bg-accent text-text-dim border-border-dim hover:text-text-main hover:bg-bg-accent/80"
            )}
          >
            Consolidado (Todas)
          </button>
          {branches.map(b => (
            <button
              key={b.id}
              onClick={() => onBranchChange(b.id)}
              className={cn(
                "px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider border transition-all cursor-pointer",
                selectedBranchId === b.id
                  ? "bg-brand-500 text-black border-brand-500 font-extrabold shadow-md"
                  : "bg-bg-accent text-text-dim border-border-dim hover:text-text-main hover:bg-bg-accent/80"
              )}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeTab === 'comparativo' && (
          <motion.div key="comp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SummaryCard 
                  label="Desvíos Críticos (>5%)" 
                  value={deviations.filter(d => d.theo > 0 && Math.abs((d.real - d.theo) / d.theo) > 0.05).length.toString()} 
                  color="text-red-500" 
                  icon={<AlertTriangle size={18} />} 
                />
                <SummaryCard 
                  label="Bajo Control" 
                  value={`${validControlledIds.length}`} 
                  color="text-brand-500" 
                  icon={<CheckCircle2 size={18} />} 
                />
                <SummaryCard 
                  label="Gap Real vs Teo" 
                  value={`${(() => {
                    const totalReal = deviations.reduce((acc, d) => acc + d.real, 0);
                    const totalTheo = deviations.reduce((acc, d) => acc + d.theo, 0);
                    if (totalTheo === 0) return "0%";
                    return ((Math.abs(totalReal - totalTheo) / totalTheo) * 100).toFixed(1) + "%";
                  })()}`} 
                  color="text-orange-500" icon={<BarChart3 size={18} />} 
                />
              </div>

            <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-xl">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="bg-bg-accent border-b border-border-dim text-text-dim uppercase font-black text-left">
                    <th className="px-6 py-4 tracking-widest">Insumo</th>
                    <th className="px-4 py-4 text-center tracking-widest">Consumo Real</th>
                    <th className="px-4 py-4 text-center tracking-widest">Consumo Teórico</th>
                    <th className="px-4 py-4 text-center tracking-widest">Diferencia</th>
                    <th className="px-4 py-4 text-center tracking-widest">Semáforo de Fuga</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim">
                  {deviations.map(dev => {
                    const item = items.find(i => i.id === dev.itemId);
                    const diffUnits = dev.real - dev.theo;
                    const diffPercent = (diffUnits / dev.theo) * 100;
                    const statusClass = getSemaphoreColor(diffPercent);

                    return (
                      <tr key={dev.itemId} className="hover:bg-bg-accent/50 transition-colors group">
                        <td className="px-6 py-4 font-bold text-text-main uppercase tracking-tighter">
                          {item?.name} <span className="text-[9px] text-text-dim opacity-50 ml-2">({item?.unit})</span>
                        </td>
                        <td className="px-4 py-4 text-center font-mono">{dev.real.toLocaleString()}</td>
                        <td className="px-4 py-4 text-center font-mono opacity-60 italic">{dev.theo.toLocaleString()}</td>
                        <td className="px-4 py-4 text-center font-mono font-bold text-text-dim">
                          {diffUnits > 0 ? '+' : ''}{diffUnits.toLocaleString()}
                        </td>
                        <td className="px-4 py-4">
                          <div className={cn("mx-auto w-40 py-1.5 rounded-full border text-center font-black uppercase tracking-widest text-[9px] flex items-center justify-center gap-2", statusClass)}>
                             <span className={cn("w-2 h-2 rounded-full", diffPercent > 5 ? "bg-red-500" : diffPercent > 3 ? "bg-orange-500" : "bg-emerald-500")}></span>
                             {diffPercent.toFixed(1)}% {diffPercent > 5 ? 'FUGA CRÍTICA' : diffPercent > 3 ? 'ESTADO ALERTA' : 'NORMAL'}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="p-4 bg-brand-500/5 border border-brand-500/20 rounded flex items-center gap-4">
               <Info className="text-brand-500" size={24} />
               <p className="text-[10px] uppercase font-bold text-text-main leading-relaxed">
                 <span className="text-brand-500">Semáforo de Desvíos:</span> Verde (Bajo 3%), Amarillo (3-5%), Rojo (Sobre 5%). El desvío indica mercadería no justificada por ventas ni decomisos.
               </p>
            </div>
          </motion.div>
        )}

        {activeTab === 'planilla' && (
          <motion.div key="planilla" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
             <div className="bg-bg-sidebar border border-border-dim rounded-lg overflow-hidden shadow-2xl">
               <div className="p-4 bg-bg-accent border-b border-border-dim flex justify-between items-center whitespace-nowrap">
                  <div>
                    <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest italic">Planilla de Carga Administrativa (Semanal) - {selectedMonth}</h3>
                    <p className="text-[9px] text-text-dim font-bold uppercase mt-1">Semanas: S1 (1-7), S2 (8-14), S3 (15-21), S4 (22-Fin)</p>
                  </div>
                  <div className="flex gap-4 items-center">
                    <div className="flex items-center gap-2">
                       <span className="w-3 h-3 bg-brand-500/20 border border-brand-500 rounded"></span>
                       <span className="text-[9px] font-black text-text-dim uppercase">Admin (Editable)</span>
                    </div>
                    <div className="flex items-center gap-2">
                       <span className="w-3 h-3 bg-bg-accent/50 border border-border-dim rounded"></span>
                       <span className="text-[9px] font-black text-text-dim uppercase">Sucursal (Lectura)</span>
                    </div>
                  </div>
               </div>
               
               <div className="overflow-x-auto overflow-y-auto max-h-[600px]">
                 <table className="w-full border-collapse">
                   <thead className="sticky top-0 z-20 bg-bg-sidebar">
                     <tr className="bg-bg-sidebar border-b border-border-dim text-[9px] font-black uppercase text-text-dim">
                       <th className="px-4 py-3 text-left sticky left-0 bg-bg-sidebar z-30 border-r border-border-dim w-32 min-w-[120px]">Semana</th>
                       {validControlledIds.map(id => {
                         const item = items.find(i => i.id === id);
                         return (
                           <th key={id} colSpan={7} className="px-4 py-3 text-center border-r border-border-dim bg-bg-accent/30 min-w-[520px]">
                             {item?.name}
                           </th>
                         );
                       })}
                     </tr>
                     <tr className="bg-bg-sidebar border-b border-border-dim text-[8px] font-black uppercase text-text-dim">
                        <th className="px-4 py-2 sticky left-0 bg-bg-sidebar z-30 border-r border-border-dim"></th>
                        {validControlledIds.map(id => (
                          <React.Fragment key={id}>
                            <th className="px-2 py-2 text-center opacity-60">EI</th>
                            <th className="px-2 py-2 text-center bg-brand-500/5 text-brand-500">COMPRAS</th>
                            <th className="px-2 py-2 text-center bg-brand-500/5 text-brand-500">DECOMISOS</th>
                            <th className="px-2 py-2 text-center bg-brand-500/5 text-brand-500">VENTAS</th>
                            <th className="px-2 py-2 text-center opacity-60">EF</th>
                            <th className="px-2 py-2 text-center opacity-60">Prést.</th>
                            <th className="px-2 py-2 text-center border-r border-border-dim opacity-60">C.Per</th>
                          </React.Fragment>
                        ))}
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-border-dim">
                     {getWeeks().map((week) => {
                       const dateStr = week.date;
                       return (
                         <tr key={dateStr} className="hover:bg-bg-accent/30 transition-colors text-[10px]">
                           <td className="px-4 py-6 font-mono font-bold text-text-dim sticky left-0 bg-bg-sidebar z-10 border-r border-border-dim text-center">
                              <div className="flex flex-col items-center">
                                <span className="text-brand-500 font-black uppercase text-[11px]">{week.label}</span>
                                <span className="text-[8px] opacity-60 font-black">{week.range}</span>
                              </div>
                           </td>
                           {validControlledIds.map(id => {
                             const weekDates = getDatesForWeek(week.id);
                             const itemWeekLogs = dailyLogs.filter(l => l.itemId === id && weekDates.includes(l.date));
                             const sortedWeekLogs = [...itemWeekLogs].sort((a, b) => a.date.localeCompare(b.date));
                             
                             const firstDayLog = itemWeekLogs.find(l => l.date === weekDates[0]);
                             const ei = firstDayLog ? (firstDayLog.ei || 0) : (sortedWeekLogs[0]?.ei || 0);
                             
                             const lastDayLog = itemWeekLogs.find(l => l.date === weekDates[weekDates.length - 1]);
                             const ef = lastDayLog ? (lastDayLog.ef || 0) : (sortedWeekLogs[sortedWeekLogs.length - 1]?.ef || 0);
                             
                             const purchases = itemWeekLogs.reduce((sum, l) => sum + (l.purchases || 0), 0);
                             const waste = itemWeekLogs.reduce((sum, l) => sum + (l.waste || 0), 0);
                             const theoretical_sales = itemWeekLogs.reduce((sum, l) => sum + (l.theoretical_sales || 0), 0);
                             const loans = itemWeekLogs.reduce((sum, l) => sum + (l.loans || 0), 0);
                             const staff_consumption = itemWeekLogs.reduce((sum, l) => sum + (l.staff_consumption || 0), 0);

                             const log = {
                               ei,
                               ef,
                               purchases,
                               waste,
                               theoretical_sales,
                               loans,
                               staff_consumption
                             };
                             return (
                               <React.Fragment key={id}>
                                 <td className="p-0 border-r border-border-dim/30 bg-bg-accent/20">
                                   <div className="w-full min-w-[70px] p-2 text-center font-mono text-text-dim opacity-60">
                                      {log.ei || 0}
                                   </div>
                                 </td>
                                 <td className="p-0 border-r border-border-dim/30 bg-brand-500/5">
                                   <input 
                                     type="number"
                                     value={log.purchases || ''}
                                     placeholder="0"
                                     onChange={(e) => updateDailyLog(dateStr, id, 'purchases', parseFloat(e.target.value) || 0)}
                                     className="w-full min-w-[70px] h-full p-2 bg-transparent text-center font-mono focus:bg-brand-500/20 outline-none text-brand-500"
                                   />
                                 </td>
                                 <td className="p-0 border-r border-border-dim/30 bg-brand-500/5">
                                   <input 
                                     type="number"
                                     value={log.waste || ''}
                                     placeholder="0"
                                     onChange={(e) => updateDailyLog(dateStr, id, 'waste', parseFloat(e.target.value) || 0)}
                                     className="w-full min-w-[70px] h-full p-2 bg-transparent text-center font-mono focus:bg-brand-500/20 outline-none text-brand-500"
                                   />
                                 </td>
                                 <td className="p-0 border-r border-border-dim/30 bg-brand-500/5">
                                   <input 
                                     type="number"
                                     value={log.theoretical_sales || ''}
                                     placeholder="0"
                                     onChange={(e) => updateDailyLog(dateStr, id, 'theoretical_sales', parseFloat(e.target.value) || 0)}
                                     className="w-full min-w-[70px] h-full p-2 bg-transparent text-center font-mono focus:bg-brand-500/20 outline-none text-brand-500"
                                   />
                                 </td>
                                 <td className="p-0 border-r border-border-dim/30 bg-bg-accent/20">
                                   <div className="w-full min-w-[70px] p-2 text-center font-mono text-text-dim opacity-60">
                                      {log.ef || 0}
                                   </div>
                                 </td>
                                 <td className="p-0 border-r border-border-dim/30 bg-bg-accent/20">
                                   <div className="w-full min-w-[70px] p-2 text-center font-mono text-text-dim opacity-60">
                                      {log.loans || 0}
                                   </div>
                                 </td>
                                 <td className="p-0 border-r border-border-dim bg-bg-accent/20">
                                   <div className="w-full min-w-[70px] p-2 text-center font-mono text-text-dim opacity-60">
                                      {log.staff_consumption || 0}
                                   </div>
                                 </td>
                               </React.Fragment>
                             );
                           })}
                         </tr>
                       );
                     })}
                   </tbody>
                 </table>
               </div>

               {validControlledIds.length === 0 && (
                 <div className="p-12 text-center">
                    <Table2 size={48} className="mx-auto text-text-dim/20 mb-4" />
                    <p className="text-sm font-bold text-text-dim uppercase">No hay insumos seleccionados para este mes</p>
                    <button 
                      onClick={() => setActiveTab('selector')}
                      className="mt-4 text-brand-500 text-[10px] font-black uppercase hover:underline"
                    >
                      Ir al Selector de Insumos
                    </button>
                 </div>
               )}
             </div>
          </motion.div>
        )}

        {activeTab === 'selector' && (
          <motion.div key="selector" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
            <div className="bg-bg-sidebar border border-border-dim p-8 rounded-lg max-w-2xl mx-auto shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-base font-black uppercase text-brand-500 tracking-widest italic">Selector de Insumos</h3>
                  <p className="text-[10px] text-text-dim font-bold uppercase mt-1">Defina los insumos para el control del mes</p>
                </div>
                <div className="px-4 py-1.5 bg-bg-accent border border-border-dim rounded text-brand-500 font-mono font-black text-xs">
                  {validControlledIds.length} SELECCIONADOS
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {items.map(item => (
                  <button
                    key={item.id}
                    onClick={() => {
                        if (controlledIds.includes(item.id)) {
                          setControlledIds(prev => prev.filter(id => id !== item.id));
                        } else {
                          setControlledIds(prev => [...prev, item.id]);
                        }
                    }}
                    className={cn(
                      "flex items-center justify-between p-4 rounded border transition-all text-left uppercase tracking-widest text-[10px] font-black group",
                      controlledIds.includes(item.id) 
                        ? "bg-brand-500/10 border-brand-500 text-brand-500 shadow-lg shadow-brand-500/5" 
                        : "bg-bg-accent border-border-dim text-text-dim hover:border-brand-500/50"
                    )}
                  >
                    <span>{item.name}</span>
                    <div className={cn(
                      "w-4 h-4 rounded flex items-center justify-center border",
                      controlledIds.includes(item.id) ? "bg-brand-500 border-brand-500" : "border-border-dim"
                    )}>
                       {controlledIds.includes(item.id) && <X size={10} className="text-black rotate-45" />}
                    </div>
                  </button>
                ))}
              </div>

              <button 
                onClick={saveMonthlyControl}
                className="w-full mt-8 bg-brand-500 text-black py-4 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all shadow-xl shadow-brand-500/10 font-bold"
              >
                CONFIRMAR CONTROL MENSUAL PARA {selectedMonth}
              </button>
            </div>
          </motion.div>
        )}

        {activeTab === 'recetas' && (
          <motion.div key="recetas" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex gap-2">
                <button 
                  onClick={() => setRecipeViewMode('individual')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded text-[10px] font-black uppercase transition-all",
                    recipeViewMode === 'individual' ? "bg-brand-500 text-black shadow-lg" : "bg-bg-sidebar border border-border-dim text-text-dim hover:border-brand-500/50"
                  )}
                >
                  <LayoutDashboard size={14} />
                  Editor Individual
                </button>
                <button 
                  onClick={() => setRecipeViewMode('table')}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded text-[10px] font-black uppercase transition-all",
                    recipeViewMode === 'table' ? "bg-brand-500 text-black shadow-lg" : "bg-bg-sidebar border border-border-dim text-text-dim hover:border-brand-500/50"
                  )}
                >
                  <Table2 size={14} />
                  Tabla de Recetas
                </button>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => downloadTemplate('recipes')}
                  className="flex items-center gap-2 px-4 py-2 bg-bg-accent border border-border-dim rounded hover:border-brand-500 transition-all text-text-dim hover:text-brand-500 text-[10px] font-black uppercase"
                >
                  <Download size={14} />
                  Modelo
                </button>
                <label className="flex items-center gap-2 px-4 py-2 bg-bg-accent border border-brand-500/20 rounded cursor-pointer hover:border-brand-500 transition-all text-brand-500 text-[10px] font-black uppercase">
                  <Upload size={14} />
                  Importar Recetas
                  <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImportRecipes} />
                </label>
              </div>
            </div>

            {recipeViewMode === 'individual' ? (
              <div className="grid grid-cols-12 gap-6">
                <div className="col-span-12 lg:col-span-4 bg-bg-sidebar border border-border-dim rounded-lg p-6 space-y-4 shadow-xl">
                   <h3 className="text-xs font-black uppercase text-brand-500 tracking-widest border-l-2 border-brand-500 pl-3">Productos Vendidos</h3>
                   <div className="relative">
                     <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                     <input 
                      className="w-full pl-9 pr-4 py-2.5 bg-bg-accent border border-border-dim rounded text-[10px] font-black uppercase tracking-widest outline-none focus:border-brand-500" 
                      placeholder="BUSCAR PRODUCTO..." 
                      onChange={(e) => setRecipeSearch(e.target.value)}
                     />
                   </div>
                   <div className="space-y-1 max-h-[450px] overflow-y-auto custom-scrollbar">
                     {products.filter(p => !recipeSearch || p.name.toLowerCase().includes(recipeSearch.toLowerCase())).map(p => {
                       const hasRecipe = (recipes[p.id]?.length || 0) > 0;
                       return (
                         <button 
                          key={p.id} 
                          onClick={() => setSelectedProductId(p.id)}
                          className={cn(
                            "w-full text-left p-3 rounded transition-colors border-l-2 group relative",
                            selectedProductId === p.id 
                              ? "bg-brand-500/10 border-brand-500" 
                              : "hover:bg-bg-accent border-transparent hover:border-brand-500/50"
                          )}
                         >
                            <div className="flex justify-between items-center">
                               <div className="flex-1 truncate pr-2">
                                  <p className={cn(
                                    "text-[10px] font-black transition-colors uppercase tracking-tight truncate",
                                    selectedProductId === p.id ? "text-brand-500" : "text-text-main group-hover:text-brand-500"
                                  )}>{p.name}</p>
                                  <p className="text-[8px] text-text-dim uppercase font-bold opacity-60 truncate">{p.category}</p>
                               </div>
                               {hasRecipe && (
                                  <div className="shrink-0 flex items-center gap-1.5 px-1.5 py-0.5 rounded-full bg-brand-500/10 border border-brand-500/20">
                                     <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
                                     <span className="text-[7px] font-black text-brand-500 uppercase">{recipes[p.id].length}</span>
                                  </div>
                               )}
                            </div>
                         </button>
                       );
                     })}
                   </div>
                </div>

                <div className="col-span-12 lg:col-span-8 bg-bg-sidebar border border-border-dim rounded-lg p-8 space-y-6 shadow-xl border-t-4 border-t-brand-500">
                  {selectedProductId ? (
                    <>
                      <div className="flex justify-between items-start">
                         <div>
                           <h3 className="text-xl font-black uppercase text-text-main tracking-tight italic">
                             {products.find(p => p.id === selectedProductId)?.name}
                           </h3>
                           <p className="text-[10px] text-text-dim font-bold uppercase tracking-widest mt-1">Configuración de Insumos por Unidad Vendida</p>
                         </div>
                         <button className="p-2.5 bg-bg-accent border border-border-dim rounded text-text-dim hover:text-brand-500 hover:border-brand-500 transition-all">
                            <Settings2 size={16} />
                         </button>
                      </div>

                      <div className="space-y-3">
                         <div className="flex items-center justify-between text-[10px] font-black uppercase text-text-dim tracking-widest pb-3 border-b border-border-dim/50">
                            <span>Insumo Componente</span>
                            <span>Gramos / Unidades</span>
                         </div>
                         {(recipes[selectedProductId] || []).map((line, index) => {
                           const item = items.find(i => i.id === line.itemId);
                           return (
                             <div key={`${line.itemId}-${index}`} className="flex items-center justify-between bg-bg-accent/40 p-4 rounded border border-border-dim group hover:border-brand-500/30 transition-all">
                                <div className="flex items-center gap-3">
                                   <div className="w-10 h-10 rounded bg-bg-sidebar flex items-center justify-center border border-border-dim text-brand-500 shadow-inner">
                                      <Table2 size={18} />
                                   </div>
                                   <div className="flex flex-col">
                                      <span className="text-[11px] font-black text-text-main uppercase tracking-tight">{item?.name}</span>
                                      <span className="text-[8px] text-text-dim uppercase font-bold">Unidad base: {item?.unit}</span>
                                   </div>
                                </div>
                                <div className="flex items-center gap-4">
                                   <div className="flex flex-col items-end gap-1">
                                      <span className="text-[8px] font-black text-text-dim uppercase">Cantidad</span>
                                      <div className="flex items-center bg-bg-sidebar border border-border-dim rounded overflow-hidden shadow-sm">
                                         <input 
                                           type="number" 
                                           step="0.001"
                                           value={getDisplayQuantity(line.itemId, line.quantity, selectedProductId)} 
                                           onChange={(e) => updateIngredientQuantity(selectedProductId, line.itemId, parseFloat(e.target.value) || 0)}
                                           className="w-24 py-2 px-3 text-center text-[12px] font-mono font-black text-brand-500 bg-transparent outline-none focus:bg-brand-500/5 transition-colors" 
                                         />
                                         <button 
                                            onClick={() => {
                                              const sub = getSubUnit(item?.unit || '');
                                              if (sub) {
                                                setRecipeDisplayUnits(prev => ({
                                                  ...prev,
                                                  [`${selectedProductId}-${line.itemId}`]: (recipeDisplayUnits[`${selectedProductId}-${line.itemId}`] || item?.unit) === sub ? (item?.unit || '') : sub
                                                }));
                                              }
                                            }}
                                            className={cn(
                                              "bg-bg-accent px-3 py-2 border-l border-border-dim text-[10px] font-bold transition-colors min-w-[40px]",
                                              getSubUnit(item?.unit || '') ? "cursor-pointer hover:bg-brand-500 hover:text-black" : "cursor-default text-text-dim"
                                            )}
                                         >
                                            {recipeDisplayUnits[`${selectedProductId}-${line.itemId}`] || item?.unit}
                                         </button>
                                      </div>
                                   </div>
                                   <div className="pt-5">
                                     <button 
                                       onClick={() => removeIngredientFromRecipe(selectedProductId, line.itemId)}
                                       className="text-text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all p-2 hover:bg-red-500/10 rounded"
                                       title="Eliminar insumo de receta"
                                     >
                                        <X size={16} />
                                     </button>
                                   </div>
                                </div>
                             </div>
                           );
                         })}
                         
                         <div className="pt-4 space-y-4">
                            <div className="relative">
                              <Plus size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-500" />
                              <select 
                                onChange={(e) => {
                                  if (e.target.value) {
                                    addIngredientToRecipe(selectedProductId, e.target.value);
                                    e.target.value = '';
                                  }
                                }}
                                className="w-full pl-9 pr-4 py-3 bg-bg-accent border-2 border-dashed border-border-dim rounded-lg text-[10px] font-black uppercase tracking-widest text-text-dim hover:border-brand-500 hover:text-brand-500 outline-none transition-all appearance-none cursor-pointer"
                              >
                                 <option value="">VINCULAR NUEVO INSUMO A ESTE PRODUCTO...</option>
                                 {items.filter(i => !(recipes[selectedProductId] || []).some(r => r.itemId === i.id)).map(i => (
                                   <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                                 ))}
                              </select>
                            </div>
                         </div>
                      </div>
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-12">
                       <BookOpen size={48} className="text-border-dim mb-4" />
                       <h3 className="text-lg font-black uppercase text-text-dim tracking-widest">Seleccione un producto</h3>
                       <p className="text-[10px] text-text-dim/60 font-bold uppercase mt-2">Para ver y editar su receta</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-bg-sidebar border border-border-dim rounded-lg shadow-xl overflow-hidden flex flex-col h-[600px]">
                <div className="p-4 border-b border-border-dim bg-bg-accent/20 flex justify-between items-center">
                  <div className="relative w-64">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                    <input 
                      className="w-full pl-9 pr-4 py-2 bg-bg-sidebar border border-border-dim rounded text-[10px] font-black uppercase outline-none focus:border-brand-500" 
                      placeholder="BUSCAR EN TODAS LAS RECETAS..." 
                      onChange={(e) => setRecipeTableSearch(e.target.value)}
                      value={recipeTableSearch}
                    />
                  </div>
                  <div className="text-[10px] font-black text-brand-500 uppercase">
                    {flattenedRecipes.length} INGREDIENTES CARGADOS
                  </div>
                </div>
                <div className="flex-1 overflow-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-bg-sidebar border-b border-border-dim">
                      <tr>
                        <th className="p-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Producto</th>
                        <th className="p-4 text-[10px] font-black uppercase text-text-dim tracking-widest">Insumo</th>
                        <th className="p-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Cantidad</th>
                        <th className="p-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-center">Unidad</th>
                        <th className="p-4 text-[10px] font-black uppercase text-text-dim tracking-widest text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-dim/50">
                      {flattenedRecipes
                        .filter(r => {
                          if (!recipeTableSearch) return true;
                          const p = products.find(prod => prod.id === r.productId);
                          const i = items.find(item => item.id === r.itemId);
                          const search = recipeTableSearch.toLowerCase();
                          return p?.name.toLowerCase().includes(search) || i?.name.toLowerCase().includes(search);
                        })
                        .map((line, idx) => {
                          const product = products.find(p => p.id === line.productId);
                          const item = items.find(i => i.id === line.itemId);
                          return (
                            <tr key={`${line.productId}-${line.itemId}-${idx}`} className="hover:bg-bg-accent/40 transition-colors group">
                              <td className="p-4">
                                <p className="text-[10px] font-black uppercase text-text-main">{product?.name}</p>
                                <p className="text-[8px] text-text-dim uppercase font-bold">{product?.category}</p>
                              </td>
                              <td className="p-4">
                                <p className="text-[10px] font-black uppercase text-brand-500">{item?.name}</p>
                              </td>
                              <td className="p-4 text-center">
                                <input 
                                  type="number" 
                                  step="0.001"
                                  value={getDisplayQuantity(line.itemId, line.quantity, line.productId)} 
                                  onChange={(e) => updateIngredientQuantity(line.productId, line.itemId, parseFloat(e.target.value) || 0)}
                                  className="w-20 py-1 px-2 text-center text-[11px] font-mono font-black text-brand-500 bg-bg-sidebar border border-border-dim rounded outline-none focus:border-brand-500 transition-colors" 
                                />
                              </td>
                              <td className="p-4 text-center">
                                <button 
                                  onClick={() => {
                                    const sub = getSubUnit(item?.unit || '');
                                    if (sub) {
                                      setRecipeDisplayUnits(prev => ({
                                        ...prev,
                                        [`${line.productId}-${line.itemId}`]: (recipeDisplayUnits[`${line.productId}-${line.itemId}`] || item?.unit) === sub ? (item?.unit || '') : sub
                                      }));
                                    }
                                  }}
                                  className={cn(
                                    "px-2 py-1 rounded text-[9px] font-black uppercase transition-all",
                                    getSubUnit(item?.unit || '') ? "bg-bg-accent hover:bg-brand-500 hover:text-black cursor-pointer" : "text-text-dim cursor-default"
                                  )}
                                >
                                  {recipeDisplayUnits[`${line.productId}-${line.itemId}`] || item?.unit}
                                </button>
                              </td>
                              <td className="p-4 text-right">
                                <button 
                                  onClick={() => removeIngredientFromRecipe(line.productId, line.itemId)}
                                  className="text-text-dim hover:text-red-500 transition-all p-2 hover:bg-red-500/10 rounded"
                                >
                                  <X size={14} />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                  {flattenedRecipes.length === 0 && (
                    <div className="p-12 text-center">
                      <p className="text-[10px] text-text-dim font-black uppercase">No hay recetas cargadas aún.</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'gestion' && (
          <motion.div key="gestion" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Insumos Management */}
              <div className="bg-bg-sidebar border border-border-dim rounded-lg p-6 shadow-xl space-y-6">
                <div className="flex items-center justify-between border-b border-border-dim pb-4">
                  <h3 className="text-sm font-black uppercase text-brand-500 tracking-widest">Maestro de Insumos</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => downloadTemplate('items')}
                      className="flex items-center gap-2 px-3 py-1.5 bg-bg-accent border border-border-dim rounded hover:border-brand-500 transition-all text-text-dim hover:text-brand-500 text-[9px] font-black uppercase"
                    >
                      <Download size={14} />
                      Modelo
                    </button>
                    <label className="flex items-center gap-2 px-3 py-1.5 bg-bg-accent border border-brand-500/20 rounded cursor-pointer hover:border-brand-500 transition-all text-brand-500 text-[9px] font-black uppercase">
                      <Upload size={14} />
                      Importar
                      <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImportItems} />
                    </label>
                  </div>
                </div>
                
                {/* Item Form */}
                <div className="bg-bg-accent/40 p-4 rounded border border-brand-500/20 space-y-3">
                   <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-dim uppercase">Nombre</label>
                        <input 
                          value={itemForm.name}
                          onChange={e => setItemForm({...itemForm, name: e.target.value})}
                          className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 uppercase font-black"
                          placeholder="CARNE..."
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-dim uppercase">Unidad</label>
                        <select 
                          value={itemForm.unit}
                          onChange={e => setItemForm({...itemForm, unit: e.target.value})}
                          className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-brand-500 font-black uppercase"
                        >
                          <option value="">Selección...</option>
                          <option value="u">UNIDADES (U)</option>
                          <option value="kg">KILOS (KG)</option>
                          <option value="l">LITROS (L)</option>
                          <option value="bolsa">BOLSAS</option>
                          <option value="pack">PACKS</option>
                        </select>
                      </div>
                   </div>
                   <button 
                    onClick={async () => {
                        if (editingItem) {
                          await supabase.from('stock_items').update(itemForm).eq('id', editingItem.id);
                          setEditingItem(null);
                        } else {
                          await supabase.from('stock_items').insert(itemForm);
                        }
                        setItemForm({ name: '', unit: '', cost: 0 });
                    }}
                    className="w-full bg-brand-500 text-black py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all font-bold"
                   >
                     {editingItem ? 'Guardar Cambios' : 'Agregar Insumo'}
                   </button>
                   {editingItem && (
                     <button onClick={() => { setEditingItem(null); setItemForm({ name: '', unit: '', cost: 0 }); }} className="w-full text-[9px] font-bold text-text-dim uppercase underline">Cancelar Edición</button>
                   )}
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                  {items.map(item => (
                    <div key={item.id} className="flex items-center justify-between p-4 bg-bg-accent/40 rounded border border-border-dim group hover:border-brand-500/30 transition-all">
                      <div>
                        <p className="text-[11px] font-black text-text-main uppercase">{item.name}</p>
                        <p className="text-[9px] text-text-dim font-bold uppercase mt-1">Unidad: {item.unit}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setEditingItem(item);
                            setItemForm({ name: item.name, unit: item.unit, cost: item.cost || 0 });
                          }}
                          className="p-2 text-text-dim hover:text-brand-500 transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={async () => {
                            if (window.confirm('¿Está seguro de eliminar este insumo? Se eliminará de todas las recetas y del control de desvíos.')) {
                              const { error } = await supabase.from('stock_items').delete().eq('id', item.id);
                              if (!error) {
                                setControlledIds(prev => prev.filter(id => id !== item.id));
                              }
                            }
                          }}
                          className="p-2 text-text-dim hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Productos Management */}
              <div className="bg-bg-sidebar border border-border-dim rounded-lg p-6 shadow-xl space-y-6">
                <div className="flex items-center justify-between border-b border-border-dim pb-4">
                  <h3 className="text-sm font-black uppercase text-teal-500 tracking-widest">Maestro de Productos</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => downloadTemplate('products')}
                      className="flex items-center gap-2 px-3 py-1.5 bg-bg-accent border border-border-dim rounded hover:border-teal-500 transition-all text-text-dim hover:text-teal-500 text-[9px] font-black uppercase"
                    >
                      <Download size={14} />
                      Modelo
                    </button>
                    <label className="flex items-center gap-2 px-3 py-1.5 bg-bg-accent border border-teal-500/20 rounded cursor-pointer hover:border-teal-500 transition-all text-teal-500 text-[9px] font-black uppercase">
                      <Upload size={14} />
                      Importar
                      <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImportProducts} />
                    </label>
                  </div>
                </div>

                {/* Product Form */}
                <div className="bg-teal-500/5 p-4 rounded border border-teal-500/20 space-y-3">
                   <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-dim uppercase">Nombre del Plato</label>
                        <input 
                          value={productForm.name}
                          onChange={e => setProductForm({...productForm, name: e.target.value})}
                          className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-teal-500 uppercase font-black"
                          placeholder="CLASSIC..."
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-text-dim uppercase">Categoría</label>
                        <input 
                          value={productForm.category}
                          onChange={e => setProductForm({...productForm, category: e.target.value})}
                          className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[10px] text-text-main outline-none focus:border-teal-500 font-black uppercase"
                          placeholder="HAMBURGUESAS..."
                        />
                      </div>
                   </div>
                   <button 
                    onClick={async () => {
                        if (editingProduct) {
                          await supabase.from('products').update(productForm).eq('id', editingProduct.id);
                          setEditingProduct(null);
                        } else {
                          await supabase.from('products').insert(productForm);
                        }
                        setProductForm({ name: '', category: '' });
                    }}
                    className="w-full bg-teal-500 text-black py-2 rounded text-[10px] font-black uppercase tracking-widest hover:bg-teal-600 transition-all font-bold"
                   >
                     {editingProduct ? 'Guardar Cambios' : 'Agregar Producto'}
                   </button>
                   {editingProduct && (
                     <button onClick={() => { setEditingProduct(null); setProductForm({ name: '', category: '' }); }} className="w-full text-[9px] font-bold text-text-dim uppercase underline">Cancelar Edición</button>
                   )}
                </div>

                <div className="space-y-2 max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                  {products.map(p => (
                    <div key={p.id} className="flex items-center justify-between p-4 bg-bg-accent/40 rounded border border-border-dim group hover:border-teal-500/30 transition-all">
                      <div>
                        <p className="text-[11px] font-black text-text-main uppercase">{p.name}</p>
                        <p className="text-[9px] text-text-dim font-bold uppercase mt-1">Categoría: {p.category}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => {
                            setEditingProduct(p);
                            setProductForm({ name: p.name, category: p.category });
                          }}
                          className="p-2 text-text-dim hover:text-teal-500 transition-colors"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button 
                          onClick={async () => {
                            if (window.confirm('¿Está seguro de eliminar este producto?')) {
                              const { error } = await supabase.from('products').delete().eq('id', p.id);
                              if (!error && selectedProductId === p.id) {
                                setSelectedProductId(null);
                              }
                            }
                          }}
                          className="p-2 text-text-dim hover:text-red-500 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-8 py-3 rounded text-[10px] font-black uppercase tracking-widest transition-all",
        active 
          ? "bg-bg-accent text-brand-500 shadow-md border border-border-dim/50" 
          : "text-text-dim hover:text-text-main"
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function SummaryCard({ label, value, color, icon }: { label: string, value: string, color: string, icon: React.ReactNode }) {
  return (
    <div className="bg-bg-sidebar border border-border-dim p-4 rounded-lg flex items-center justify-between shadow-xl">
      <div>
        <p className="text-[10px] font-black text-text-dim uppercase tracking-widest mb-1">{label}</p>
        <p className={cn("text-2xl font-mono font-black", color)}>{value}</p>
      </div>
      <div className={cn("p-3.5 rounded-full bg-bg-accent border border-border-dim/30 shadow-inner", color)}>
        {icon}
      </div>
    </div>
  );
}
