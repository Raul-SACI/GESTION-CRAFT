/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  Plus, 
  Search, 
  MoreVertical, 
  Calendar,
  Save,
  Calculator,
  Building2,
  Users,
  FileUp,
  Download,
  Trash2,
  BarChart3,
  Filter,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ChevronRight
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell
} from 'recharts';
import * as XLSX from 'xlsx';
import { SalesData, Branch, SaleType, Product, ProductRankingEntry } from '../types';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { AnimatePresence } from 'motion/react';

interface SalesViewProps {
  branches: Branch[];
  selectedBranchId: string;
  products: Product[];
}

const SALE_TYPES: SaleType[] = ['Turno Mañana', 'Turno Tarde', 'Pedidos Ya Restó', 'Pedidos Ya Café'];

export default function SalesView({ branches, selectedBranchId, products }: SalesViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'daily' | 'rankings'>('daily');
  const [salesRecords, setSalesRecords] = useState<SalesData[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // Dashboard Filters
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterWeek, setFilterWeek] = useState<string>('all');
  
  // Clear selections when filters change
  React.useEffect(() => {
    setSelectedRowIds([]);
  }, [selectedBranchId, filterMonth, filterWeek]);
  
  // Rankings State
  const [rankings, setRankings] = useState<any[]>([]);
  const [isImportingRanking, setIsImportingRanking] = useState(false);
  const [rankingToImport, setRankingToImport] = useState<{
    branchId: string;
    date: string;
    entries: any[];
  } | null>(null);
  
  // New combined form state for all 4 slots
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [branchId, setBranchId] = useState(selectedBranchId === 'all' ? (branches[0]?.id || '') : selectedBranchId);

  // Product ranking state for the current entry
  const [productRanking, setProductRanking] = useState<ProductRankingEntry[]>([]);
  const [rankingSearch, setRankingSearch] = useState('');

  // Sync branchId with global selection when opening the form
  React.useEffect(() => {
    if (selectedBranchId !== 'all') {
      setBranchId(selectedBranchId);
    }
  }, [selectedBranchId, isAdding]);

  // Fetch from Supabase
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Sales
      let salesQuery = supabase.from('sales').select('*').order('date', { ascending: false });
      if (selectedBranchId !== 'all') {
        salesQuery = salesQuery.eq('branch_id', selectedBranchId);
      }
      const { data: salesData } = await salesQuery;
      if (salesData) {
        setSalesRecords(salesData.map(s => ({
          id: s.id,
          branchId: s.branch_id,
          date: s.date,
          type: s.type as SaleType,
          pesos: Number(s.pesos),
          netSales: Number(s.net_sales),
          orders: s.orders,
          covers: s.covers,
          projection: Number(s.projection || 0),
          // Calculate these frontend-side to avoid schema dependency
          week: s.week || `Semana ${Math.ceil(new Date(s.date).getUTCDate() / 7)}`,
          dayName: s.day_name || new Date(s.date).toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' }),
          cash: Number(s.cash || 0),
          card: Number(s.card || 0),
          qr: Number(s.qr || 0),
          iva: Number(s.iva || 0),
          hora: s.product_ranking && typeof s.product_ranking === 'object' && !Array.isArray(s.product_ranking)
            ? (s.product_ranking as any).hora || '08:00'
            : '08:00',
          medioCobro: s.product_ranking && typeof s.product_ranking === 'object' && !Array.isArray(s.product_ranking)
            ? (s.product_ranking as any).medio_cobro || 'Efectivo'
            : 'Efectivo',
          productRanking: s.product_ranking && typeof s.product_ranking === 'object' && !Array.isArray(s.product_ranking)
            ? (s.product_ranking as any).items || []
            : (Array.isArray(s.product_ranking) ? s.product_ranking : [])
        })));
      }

      // Fetch Rankings Table (independent table if it exists, or from sales)
      // For now we'll assume a dedicated table 'product_rankings' is better for large imports
      let rankingQuery = supabase.from('product_rankings').select('*').order('date', { ascending: false });
      if (selectedBranchId !== 'all') {
        rankingQuery = rankingQuery.eq('branch_id', selectedBranchId);
      }
      const { data: rankingData } = await rankingQuery;
      if (rankingData) {
        setRankings(rankingData);
      }
    } catch (err) {
      console.error('Error fetching sales data:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, [selectedBranchId]);
  
  const [values, setValues] = useState<Record<SaleType, { pesos: number, netSales: number, orders: number, covers: number }>>({
    'Turno Mañana': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
    'Turno Tarde': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
    'Pedidos Ya Restó': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
    'Pedidos Ya Café': { pesos: 0, netSales: 0, orders: 0, covers: 0 }
  });

  const handleSave = async () => {
    setLoading(true);
    try {
      // Delete existing records for this branch/date to avoid duplicates when editing
      await supabase.from('sales').delete().eq('branch_id', branchId).eq('date', entryDate);

      const newRecords = SALE_TYPES.map(type => {
        const v = values[type];
        return {
          branch_id: branchId,
          date: entryDate,
          type,
          pesos: v.pesos,
          net_sales: v.netSales,
          orders: v.orders,
          covers: v.covers,
          projection: v.pesos * 30,
          week: `Semana ${Math.ceil(new Date(entryDate).getUTCDate() / 7)}`,
          day_name: new Date(entryDate).toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' }),
          cash: 0, 
          card: 0,
          qr: 0,
          iva: 0,
          product_ranking: type === 'Turno Mañana' ? productRanking : []
        };
      }).filter(r => r.pesos > 0 || r.orders > 0);

      let { error } = await supabase.from('sales').insert(newRecords);

      if (error && (error.message.includes('day_name') || error.message.includes('week'))) {
        console.warn('Retrying save without day_name/week columns due to schema cache error...');
        const cleaned = newRecords.map(r => {
          const { day_name, week, ...rest } = r;
          return rest;
        });
        const result = await supabase.from('sales').insert(cleaned);
        error = result.error;
      }

      if (error) throw error;

      setIsAdding(false);
      setProductRanking([]);
      setValues({
        'Turno Mañana': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
        'Turno Tarde': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
        'Pedidos Ya Restó': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
        'Pedidos Ya Café': { pesos: 0, netSales: 0, orders: 0, covers: 0 }
      });
      fetchData();
    } catch (err) {
      console.error('Error saving sales:', err);
      alert('Error al guardar los datos.');
    } finally {
      setLoading(false);
    }
  };

  const addRankingItem = (productId: string) => {
    if (productRanking.find(r => r.productId === productId)) return;
    setProductRanking([...productRanking, { productId, quantity: 0, amount: 0 }]);
    setRankingSearch('');
  };

  const updateRankingItem = (productId: string, field: 'quantity' | 'amount', val: number) => {
    setProductRanking(prev => prev.map(r => r.productId === productId ? { ...r, [field]: val } : r));
  };

  const updateVal = (type: SaleType, field: 'pesos' | 'netSales' | 'orders' | 'covers', val: number) => {
    if (type.includes('Pedidos Ya') && field === 'covers') return;
    setValues(prev => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: val
      }
    }));
  };

  // Calculate totals and group for table
  const filteredSales = useMemo(() => {
    let base = salesRecords;
    if (selectedBranchId !== 'all') {
      base = base.filter(r => r.branchId === selectedBranchId);
    }

    if (filterMonth !== 'all') {
      base = base.filter(r => {
        if (!r.date) return false;
        const parts = r.date.split('-');
        if (parts.length < 2) return false;
        const monthNum = parseInt(parts[1], 10);
        return monthNum.toString() === filterMonth;
      });
    }

    if (filterWeek !== 'all') {
      base = base.filter(r => {
        const weekNum = r.week?.match(/\d+/)?.[0];
        return weekNum === filterWeek;
      });
    }

    return base;
  }, [salesRecords, selectedBranchId, filterMonth, filterWeek]);

  const allFilteredIds = useMemo(() => filteredSales.map(r => r.id), [filteredSales]);
  const isAllSelected = useMemo(() => {
    if (allFilteredIds.length === 0) return false;
    return allFilteredIds.every(id => selectedRowIds.includes(id));
  }, [allFilteredIds, selectedRowIds]);

  const selectedFilteredCount = useMemo(() => {
    return filteredSales.filter(r => selectedRowIds.includes(r.id)).length;
  }, [filteredSales, selectedRowIds]);

  const handleSelectAllToggle = () => {
    if (isAllSelected) {
      setSelectedRowIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedRowIds(prev => {
        const otherIds = prev.filter(id => !allFilteredIds.includes(id));
        return [...otherIds, ...allFilteredIds];
      });
    }
  };

  const handleRowSelectToggle = (id: string) => {
    setSelectedRowIds(prev => 
      prev.includes(id) ? prev.filter(rowId => rowId !== id) : [...prev, id]
    );
  };

  const handleDeleteSelected = async () => {
    const selectedIdsInFilter = allFilteredIds.filter(id => selectedRowIds.includes(id));
    if (selectedIdsInFilter.length === 0) return;

    if (window.confirm(`¿Está seguro de que desea eliminar los ${selectedIdsInFilter.length} registros seleccionados? Esta acción es irreversible.`)) {
      try {
        setLoading(true);
        const { error } = await supabase
          .from('sales')
          .delete()
          .in('id', selectedIdsInFilter);
        if (error) throw error;
        
        setSelectedRowIds(prev => prev.filter(id => !selectedIdsInFilter.includes(id)));
        await fetchData();
        alert('¡Registros eliminados con éxito!');
      } catch (err) {
        console.error('Error deleting records in batch:', err);
        alert('Error al intentar eliminar los registros seleccionados.');
      } finally {
        setLoading(false);
      }
    }
  };

  const groupedDailySales = useMemo(() => {
    const groups: Record<string, any> = {};
    
      filteredSales.forEach(record => {
        const key = `${record.branchId}-${record.date}`;
        const dateObj = new Date(record.date);
        
        if (!groups[key]) {
          groups[key] = {
            id: key,
            branchId: record.branchId,
            date: record.date,
            // Calculate derive values from date
            week: record.week || `Semana ${Math.ceil(dateObj.getUTCDate() / 7)}`,
            dayName: record.dayName || dateObj.toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' }),
            cash: 0,
            card: 0,
            qr: 0,
            iva: 0,
            gross: 0,
            net: 0,
            orders: {
              'Turno Mañana': 0,
              'Turno Tarde': 0,
              'Pedidos Ya Restó': 0,
              'Pedidos Ya Café': 0
            },
            covers: {
              'Turno Mañana': 0,
              'Turno Tarde': 0
            }
          };
        }
        
        const g = groups[key];
        g.gross += record.pesos;
        g.net += record.netSales;
        
        // Dynamically classify payment attributes of sales for correct daily charts
        const normMedio = String(record.medioCobro || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const normType = String(record.type || '').toLowerCase();
        
        const isEfectivo = normMedio.includes('efectivo') || normMedio === 'cash';
        const isPedidosYa = normMedio.includes('pago online deb') || normMedio.includes('pedidos ya') || normType.includes('pedidos ya') || normMedio.includes('online');
        
        if (isEfectivo) {
          g.cash += record.pesos;
        } else if (isPedidosYa) {
          g.qr += record.pesos;
        } else {
          g.card += record.pesos;
        }

        if (record.iva) g.iva += record.iva;
        
        if (g.orders.hasOwnProperty(record.type)) {
          g.orders[record.type] = record.orders;
        }
        if (g.covers.hasOwnProperty(record.type)) {
          g.covers[record.type] = record.covers;
        }
      });

    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredSales]);

  const handleEditGroup = (day: any) => {
    setEntryDate(day.date);
    setBranchId(day.branchId);

    const findRecord = (type: SaleType) => {
      return filteredSales.find(s => s.branchId === day.branchId && s.date === day.date && s.type === type);
    };

    setValues({
      'Turno Mañana': { 
        pesos: findRecord('Turno Mañana')?.pesos || 0,
        netSales: findRecord('Turno Mañana')?.netSales || 0,
        orders: findRecord('Turno Mañana')?.orders || 0,
        covers: findRecord('Turno Mañana')?.covers || 0
      },
      'Turno Tarde': { 
        pesos: findRecord('Turno Tarde')?.pesos || 0,
        netSales: findRecord('Turno Tarde')?.netSales || 0,
        orders: findRecord('Turno Tarde')?.orders || 0,
        covers: findRecord('Turno Tarde')?.covers || 0
      },
      'Pedidos Ya Restó': { 
        pesos: findRecord('Pedidos Ya Restó')?.pesos || 0,
        netSales: findRecord('Pedidos Ya Restó')?.netSales || 0,
        orders: findRecord('Pedidos Ya Restó')?.orders || 0,
        covers: 0
      },
      'Pedidos Ya Café': { 
        pesos: findRecord('Pedidos Ya Café')?.pesos || 0,
        netSales: findRecord('Pedidos Ya Café')?.netSales || 0,
        orders: findRecord('Pedidos Ya Café')?.orders || 0,
        covers: 0
      }
    });
    // For ranking, we take it from the morning shift if available
    const morningShift = findRecord('Turno Mañana');
    if (morningShift?.productRanking) {
      setProductRanking(morningShift.productRanking);
    }
    setIsAdding(true);
  };

  const totals = useMemo(() => {
    const init = {
      'Turno Mañana': 0,
      'Turno Tarde': 0,
      'Pedidos Ya Restó': 0,
      'Pedidos Ya Café': 0,
      totalGross: 0,
      totalNet: 0,
      orders: 0,
      covers: 0,
      cash: 0,
      card: 0,
      qr: 0,
      pedidosYaOrders: 0,
      ordersByType: {
        'Turno Mañana': 0,
        'Turno Tarde': 0,
        'Pedidos Ya Restó': 0,
        'Pedidos Ya Café': 0
      },
      coversByType: {
        'Turno Mañana': 0,
        'Turno Tarde': 0
      }
    };
    
    return filteredSales.reduce((acc, curr) => {
      acc[curr.type] += curr.pesos;
      // All records contribute to gross/net totals
      acc.totalGross += curr.pesos;
      acc.totalNet += curr.netSales || 0;
      
      acc.orders += curr.orders;
      acc.covers += curr.covers;

      // Determine payment classification dynamically
      const normMedio = String(curr.medioCobro || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const normType = String(curr.type || '').toLowerCase();
      
      const isEfectivo = normMedio.includes('efectivo') || normMedio === 'cash';
      const isPedidosYa = normMedio.includes('pago online deb') || normMedio.includes('pedidos ya') || normType.includes('pedidos ya') || normMedio.includes('online');
      
      if (isEfectivo) {
        acc.cash += curr.pesos;
      } else if (isPedidosYa) {
        acc.qr += curr.pesos; // qr column represents 'Pedidos Ya'
      } else {
        acc.card += curr.pesos; // card represents Tarjetas/Bancos (all remaining payment forms)
      }

      if (isPedidosYa) {
        acc.pedidosYaOrders += curr.orders;
      }

      acc.ordersByType[curr.type] += curr.orders;
      if (curr.type === 'Turno Mañana' || curr.type === 'Turno Tarde') {
        acc.coversByType[curr.type] += curr.covers;
      }

      return acc;
    }, init);
  }, [filteredSales]);

  const monthlyProjection = useMemo(() => {
    const today = new Date();
    // Use selected month if filter is active, otherwise default to current month
    const targetMonth = filterMonth !== 'all' ? parseInt(filterMonth) - 1 : today.getUTCMonth();
    const targetYear = today.getUTCFullYear();
    
    let targetRecords = groupedDailySales;
    
    // If no month filter is active, we specifically target current month for the projection
    if (filterMonth === 'all') {
      targetRecords = groupedDailySales.filter(day => {
        if (!day.date) return false;
        const parts = day.date.split('-');
        if (parts.length < 2) return false;
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1; // 0-indexed month
        return m === today.getUTCMonth() && y === today.getUTCFullYear();
      });
    }
    
    if (targetRecords.length === 0) return 0;
    
    const totalNetMonth = targetRecords.reduce((sum, day) => sum + day.net, 0);
    const uniqueDays = new Set(targetRecords.map(r => r.date)).size;
    
    if (uniqueDays === 0) return 0;
    
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    return (totalNetMonth / uniqueDays) * daysInMonth;
  }, [groupedDailySales, filterMonth]);

  const paymentPercentages = useMemo(() => {
    const totalPayments = totals.cash + totals.card + totals.qr;
    if (totalPayments === 0) return { cash: 0, card: 0, qr: 0 };
    return {
      cash: (totals.cash / totalPayments) * 100,
      card: (totals.card / totalPayments) * 100,
      qr: (totals.qr / totalPayments) * 100
    };
  }, [totals]);

  const [chartMetric, setChartMetric] = useState<'net' | 'gross' | 'cash' | 'card' | 'qr'>('net');

  // Chart Data: Weekday Sales
  const weekdayChartData = useMemo(() => {
    const weekdayLabels = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const dataMap: Record<string, number> = {};
    weekdayLabels.forEach(d => dataMap[d] = 0);

    groupedDailySales.forEach(day => {
      const dateObj = new Date(day.date);
      const dayIndex = dateObj.getUTCDay(); 
      const targetIndex = (dayIndex === 0) ? 6 : dayIndex - 1;
      const target = weekdayLabels[targetIndex];
      
      const val = chartMetric === 'net' ? day.net 
                : chartMetric === 'gross' ? day.gross
                : chartMetric === 'cash' ? day.cash
                : chartMetric === 'card' ? day.card
                : day.qr;
      
      if (target) dataMap[target] += val;
    });

    return weekdayLabels.map(name => ({ name, value: dataMap[name] }));
  }, [groupedDailySales, chartMetric]);

  // Chart Data: Weekly Sales
  const weeklyChartData = useMemo(() => {
    const weekMap: Record<string, number> = {};
    
    groupedDailySales.forEach(day => {
      if (day.week) {
        const week = day.week.trim();
        const val = chartMetric === 'net' ? day.net 
                  : chartMetric === 'gross' ? day.gross
                  : chartMetric === 'cash' ? day.cash
                  : chartMetric === 'card' ? day.card
                  : day.qr;
        
        weekMap[week] = (weekMap[week] || 0) + val;
      }
    });

    return Object.entries(weekMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [groupedDailySales, chartMetric]);

  const handleImportRankingExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      // Map columns: Código, Nombre, Cantidad, [Importe]
      const entries = data.map(row => ({
        product_code: row.Código || row.Code || row.id || '',
        product_name: row.Nombre || row.Name || row.Producto || '',
        quantity: Number(row.Cantidad || row.Quantity || row.Cant || 0),
        amount: Number(row.Importe || row.Amount || row.Precio || 0)
      })).filter(e => e.product_name && e.quantity > 0);

      setRankingToImport({
        branchId: selectedBranchId === 'all' ? (branches[0]?.id || '') : selectedBranchId,
        date: new Date().toISOString().split('T')[0],
        entries
      });
      setIsImportingRanking(true);
    };
    reader.readAsBinaryString(file);
  };

  const confirmRankingImport = async () => {
    if (!rankingToImport) return;
    setLoading(true);
    try {
      const rows = rankingToImport.entries.map(e => ({
        branch_id: rankingToImport.branchId,
        date: rankingToImport.date,
        product_code: e.product_code,
        product_name: e.product_name,
        quantity: e.quantity,
        amount: e.amount
      }));

      const { error } = await supabase.from('product_rankings').insert(rows);
      if (error) throw error;

      setIsImportingRanking(false);
      setRankingToImport(null);
      fetchData();
    } catch (err) {
      console.error('Error importing ranking:', err);
      alert('Error al importar el ranking.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportRankingTemplate = () => {
    const templateData = [
      {
        Código: 'P001',
        Nombre: 'CAFÉ LATTE',
        Cantidad: 150,
        Importe: 450000
      },
      {
        Código: 'P002',
        Nombre: 'AVOCADO TOAST',
        Cantidad: 85,
        Importe: 320000
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo Ranking");
    XLSX.writeFile(wb, "Modelo_Ranking_Articulos.xlsx");
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataBuffer = evt.target?.result;
      const wb = XLSX.read(dataBuffer, { type: 'array', cellDates: true });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      // Set raw: false to retrieve cellular formatted string values, preserving Spanish currency layout
      const data = XLSX.utils.sheet_to_json(ws, { raw: false }) as any[];

      const recordsToInsert: any[] = [];

      // Helper to find a value by key ignoring case and multiple spaces
      const getValue = (row: any, keyPattern: string) => {
        const normalize = (s: string) => s.toLowerCase()
          .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
          .replace(/\s+/g, ' ')
          .trim();
        const target = normalize(keyPattern);
        const rowKey = Object.keys(row).find(k => normalize(k) === target);
        return rowKey ? row[rowKey] : undefined;
      };

      const mapTurno = (turnoStr: string): SaleType => {
        const norm = String(turnoStr || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (norm.includes('manana') || norm === 'm' || norm === 'med' || norm.includes('morning') || norm.includes('mediodia') || norm.includes('medio')) return 'Turno Mañana';
        if (norm.includes('tarde') || norm === 't' || norm.includes('afternoon') || norm.includes('noche') || norm === 'noc') return 'Turno Tarde';
        if (norm.includes('resto') || norm.includes('pedidos ya resto') || norm.includes('py resto')) return 'Pedidos Ya Restó';
        if (norm.includes('cafe') || norm.includes('pedidos ya cafe') || norm.includes('py cafe')) return 'Pedidos Ya Café';
        return 'Turno Mañana'; // Fallback
      };

      // Robust currency parser for Spanish and English formatted strings
      const parseCurrency = (val: any): number => {
        if (val === undefined || val === null) return 0;
        if (typeof val === 'number') {
          return val;
        }
        
        let str = String(val).trim().replace(/[$]/g, '').trim();
        
        // Handle BOTH dot and comma formats
        if (str.includes('.') && str.includes(',')) {
          // e.g. "20.371,90"
          if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
            // Spanish style: 20.371,90 -> remove dots, replace comma with dot
            str = str.replace(/\./g, '').replace(',', '.');
          } else {
            // English style: 20,371.90 -> remove commas
            str = str.replace(/,/g, '');
          }
        } else if (str.includes(',')) {
          // Only comma: "24650,50" -> change comma to dot
          str = str.replace(',', '.');
        } else if (str.includes('.')) {
          // Only period: "24.650" or "110.000"
          // If exactly 3 digits follow the dot, it is a Spanish thousands separator
          const parts = str.split('.');
          if (parts.length === 2 && parts[1].length === 3) {
            str = str.replace(/\./g, '');
          }
        }
        
        const num = Number(str.replace(/\s/g, '')) || 0;
        return num;
      };

      const parseInteger = (val: any): number => {
        const num = parseCurrency(val);
        return Math.round(num);
      };

      const parseSafeDate = (val: any, rowContext?: any): string => {
        if (!val) return '';
        
        const getRowDayName = (r: any): string => {
          if (!r) return '';
          const dVal = getValue(r, 'Dia') || getValue(r, 'Day') || getValue(r, 'Día') || '';
          return String(dVal).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        };

        const getWeekdayFromParsedDate = (yyyy: number, mm: number, dd: number): number => {
          // mm is 1-indexed
          return new Date(yyyy, mm - 1, dd).getDay();
        };

        const weekdayMatches = (dayNum: number, dayNameStr: string): boolean => {
          if (!dayNameStr) return false;
          const esDays = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
          const esFullDays = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
          const enDays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
          const target = dayNameStr.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          
          return target.includes(esDays[dayNum]) || 
                 target.includes(esFullDays[dayNum]) || 
                 target.includes(enDays[dayNum]);
        };

        // 1. If it's a JS Date object (thanks to cellDates: true)
        if (val instanceof Date) {
          const yyyyUTC = val.getUTCFullYear();
          const mmUTC = val.getUTCMonth() + 1;
          const ddUTC = val.getUTCDate();
          const weekdayUTC = val.getUTCDay();

          const yyyyLoc = val.getFullYear();
          const mmLoc = val.getMonth() + 1;
          const ddLoc = val.getDate();
          const weekdayLoc = val.getDay();

          if (rowContext) {
            const rowDayVal = getRowDayName(rowContext);
            if (rowDayVal) {
              const matchUTC = weekdayMatches(weekdayUTC, rowDayVal);
              const matchLoc = weekdayMatches(weekdayLoc, rowDayVal);

              if (matchUTC && !matchLoc) {
                return `${yyyyUTC}-${String(mmUTC).padStart(2, '0')}-${String(ddUTC).padStart(2, '0')}`;
              }
              if (matchLoc && !matchUTC) {
                return `${yyyyLoc}-${String(mmLoc).padStart(2, '0')}-${String(ddLoc).padStart(2, '0')}`;
              }
            }
          }

          // Default fallback: Local timezone is generally safest for SheetJS parsed cells
          // as they are parsed with local timezone bias of the user's browser.
          return `${yyyyLoc}-${String(mmLoc).padStart(2, '0')}-${String(ddLoc).padStart(2, '0')}`;
        }
        
        // 2. If it's a number
        if (typeof val === 'number') {
          const dateObj = new Date(Math.round((val - 25569) * 86400 * 1000));
          const yyyy = dateObj.getUTCFullYear();
          const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
          const dd = String(dateObj.getUTCDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        }
        
        // 3. If it's a string
        if (typeof val === 'string') {
          const s = val.trim().split(/\s+/)[0];
          
          // Match standard YYYY-MM-DD
          const ymdMatch = s.match(/^(\d{4})[/\-](\d{1,2})[/\-](\d{1,2})$/);
          if (ymdMatch) {
            return `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}`;
          }
          
          // Match D/M/Y or M/D/Y (with 2 or 4 digit year)
          const dmyMatch = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})$/);
          if (dmyMatch) {
            const part1 = parseInt(dmyMatch[1]);
            const part2 = parseInt(dmyMatch[2]);
            let yearStr = dmyMatch[3];
            if (yearStr.length === 2) {
              yearStr = '20' + yearStr;
            }
            const year = parseInt(yearStr);
            
            // Check if one parts is > 12, resolving ambiguity immediately
            if (part1 > 12) {
              // part1 is Day, part2 is Month (DD/MM/YYYY)
              return `${year}-${String(part2).padStart(2, '0')}-${String(part1).padStart(2, '0')}`;
            }
            if (part2 > 12) {
              // part2 is Day, part1 is Month (MM/DD/YYYY)
              return `${year}-${String(part1).padStart(2, '0')}-${String(part2).padStart(2, '0')}`;
            }
            
            // Ambiguous date (both <= 12, e.g. 1/4/2026 or 4/1/2026)
            // Let's use row context (weekday) to resolve
            if (rowContext) {
              const rowDayVal = getRowDayName(rowContext);
              if (rowDayVal) {
                // Interpretation A: DD/MM/YYYY (first part is day, second is month)
                const dayA = part1;
                const monthA = part2;
                const weekdayA = getWeekdayFromParsedDate(year, monthA, dayA);
                const matchA = weekdayMatches(weekdayA, rowDayVal);
                
                // Interpretation B: MM/DD/YYYY (first part is month, second is day)
                const dayB = part2;
                const monthB = part1;
                const weekdayB = getWeekdayFromParsedDate(year, monthB, dayB);
                const matchB = weekdayMatches(weekdayB, rowDayVal);
                
                if (matchA && !matchB) {
                  return `${year}-${String(monthA).padStart(2, '0')}-${String(dayA).padStart(2, '0')}`;
                }
                if (matchB && !matchA) {
                  return `${year}-${String(monthB).padStart(2, '0')}-${String(dayB).padStart(2, '0')}`;
                }
              }
            }
            
            // Default to standard Spanish/Argentine format: DD/MM/YYYY
            return `${year}-${String(part2).padStart(2, '0')}-${String(part1).padStart(2, '0')}`;
          }
        }
        
        try {
          const parsed = new Date(val);
          if (!isNaN(parsed.getTime())) {
            const yyyy = parsed.getFullYear();
            const mm = String(parsed.getMonth() + 1).padStart(2, '0');
            const dd = String(parsed.getDate()).padStart(2, '0');
            return `${yyyy}-${mm}-${dd}`;
          }
        } catch (e) {}
        
        return '';
      };

      data.forEach(row => {
        // 1. Find branch mapping - be more flexible with names
        const excelBranch = getValue(row, 'Sucursal') || getValue(row, 'Branch');
        let targetBranchId = selectedBranchId;
        if (excelBranch) {
          const normalizedExcel = String(excelBranch).toLowerCase().trim();
          const foundBranch = branches.find(b => {
            const normalizedName = b.name.toLowerCase().trim();
            return normalizedName === normalizedExcel || 
                   normalizedName.includes(normalizedExcel) || 
                   normalizedExcel.includes(normalizedName);
          });
          if (foundBranch) targetBranchId = foundBranch.id;
        }

        if (targetBranchId === 'all') {
          targetBranchId = branches[0]?.id || 'bn';
        }

        // 2. Parse Date (D/M/YYYY or DD/MM/YYYY standard Spanish format)
        const dateInput = getValue(row, 'Fecha') || getValue(row, 'Date');
        let date = parseSafeDate(dateInput, row);

        if (!date) {
          date = new Date().toISOString().split('T')[0];
        }

        // 3. Turno mapping
        const rawTurno = getValue(row, 'Turno') || getValue(row, 'Shift') || 'Turno Mañana';
        const type = mapTurno(String(rawTurno));

        let gross = parseCurrency(getValue(row, 'Ventas Brutas') || getValue(row, 'Bruto') || getValue(row, 'Gross') || 0);
        let net = parseCurrency(getValue(row, 'Ventas Netas') || getValue(row, 'Neto') || getValue(row, 'Net') || 0);
        let tax = parseCurrency(getValue(row, 'IVA') || getValue(row, 'Tax') || 0);

        // Fail-safe protection against US/English decimal scaling slips (e.g. 24.65 instead of 24650.00)
        if (gross > 0 && gross < 3000) {
          gross = gross * 1000;
        }
        if (net > 0 && net < 3000) {
          net = net * 1000;
        }
        if (tax > 0 && tax < 1000) {
          tax = tax * 1000;
        }

        const orders = parseInteger(getValue(row, 'Ordenes') || getValue(row, 'Orders') || getValue(row, 'Tickets') || 0);
        const covers = parseInteger(getValue(row, 'Cubiertos') || getValue(row, 'Covers') || 0);

        const rowWeek = getValue(row, 'Semana') || getValue(row, 'Week');
        const weekVal = rowWeek ? String(rowWeek) : `Semana ${Math.ceil(new Date(date).getUTCDate() / 7)}`;

        const rowDay = getValue(row, 'Dia') || getValue(row, 'Day') || getValue(row, 'Día');
        const dayVal = rowDay ? String(rowDay) : new Date(date).toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' });

        const rawHora = getValue(row, 'Hora') || getValue(row, 'Hour') || '08:00';
        const horaVal = String(rawHora).trim();

        // Support 'Cobro' header as well as standard 'Medio Cobro'
        const rawMedio = getValue(row, 'Cobro') || getValue(row, 'Medio Cobro') || getValue(row, 'MedioPago') || getValue(row, 'Payment') || 'Efectivo';
        const medioCobroVal = String(rawMedio).trim();
        const normMedio = medioCobroVal.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

        let cash = 0;
        let card = 0;
        let qr = 0;
        let finalMedioStyle = "Tarjetas/Bancos";

        if (normMedio.includes('pago online deb') || normMedio.includes('pedidos ya') || normMedio.includes('online')) {
          finalMedioStyle = "Pedidos Ya";
          qr = gross;
        } else if (normMedio.includes('efectivo') || normMedio === 'cash') {
          finalMedioStyle = "EFECTIVO";
          cash = gross;
        } else {
          finalMedioStyle = "Tarjetas/Bancos";
          card = gross;
        }

        recordsToInsert.push({
          branch_id: targetBranchId,
          date: date,
          type: type,
          pesos: gross,
          net_sales: net,
          orders: orders,
          covers: covers,
          projection: gross * 30,
          week: weekVal,
          day_name: dayVal,
          cash: cash,
          card: card,
          qr: qr,
          iva: tax,
          product_ranking: {
            hora: horaVal,
            medio_cobro: finalMedioStyle,
            items: []
          }
        });
      });

      if (recordsToInsert.length > 0) {
        confirmManualImport(recordsToInsert);
      } else {
        alert("No se encontraron registros válidos en la planilla. Verifique los nombres de las sucursales y las columnas.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const confirmManualImport = async (records: any[]) => {
    setLoading(true);
    try {
      // Prevent duplicates by deleting existing records for standard branch and dates in our list
      const uniqueBranchDates = Array.from(
        new Set(records.map(r => `${r.branch_id}|${r.date}`))
      );

      for (const item of uniqueBranchDates) {
        const [bId, dVal] = item.split('|');
        await supabase.from('sales').delete().eq('branch_id', bId).eq('date', dVal);
      }

      // Use tolerant insert to handle potential schema cache issues with new columns
      let { error } = await supabase.from('sales').insert(records);
      
      if (error && (error.message.includes('day_name') || error.message.includes('week'))) {
        console.warn('Retrying insert without day_name/week columns due to schema cache error...');
        const cleaned = records.map(r => {
          const { day_name, week, ...rest } = r;
          return rest;
        });
        const result = await supabase.from('sales').insert(cleaned);
        error = result.error;
      }

      if (error) {
        console.error('Supabase Error details:', error);
        throw error;
      }
      alert(`Importación exitosa: ${records.length} registros cargados.`);
      fetchData();
    } catch (err: any) {
      console.error('Error in manual import:', err);
      alert(`Error al guardar los registros importados: ${err.message || 'Error desconocido'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleExportTemplate = () => {
    const templateData = [
      {
        SUCURSAL: branches.find(b => b.id === selectedBranchId)?.name || 'Barrio Norte',
        FECHA: '01-04-2026',
        SEMANA: 'Semana 1',
        DIA: 'Mie',
        TURNO: 'Turno Mañana',
        HORA: '08:00',
        ORDENES: 10,
        CUBIERTOS: 100,
        'MEDIO COBRO': 'Efectivo',
        'VENTAS BRUTAS': 2143397.87,
        'VENTAS NETAS': 1863684.75,
        IVA: 279713.12
      },
      {
        SUCURSAL: branches.find(b => b.id === selectedBranchId)?.name || 'Barrio Norte',
        FECHA: '01-04-2026',
        SEMANA: 'Semana 1',
        DIA: 'Mie',
        TURNO: 'Turno Mañana',
        HORA: '12:00',
        ORDENES: 15,
        CUBIERTOS: 150,
        'MEDIO COBRO': 'Tarjeta',
        'VENTAS BRUTAS': 3215096.81,
        'VENTAS NETAS': 2795527.13,
        IVA: 419569.68
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo Carga Mensual");
    XLSX.writeFile(wb, "Modelo_Carga_Ventas_Completo.xlsx");
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 bg-bg-sidebar p-6 rounded border border-border-dim shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-brand-500 p-3 rounded text-black shadow-lg shadow-brand-500/20">
            <TrendingUp size={24} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-text-main tracking-tight uppercase">Administración de Ventas</h2>
            <p className="text-text-dim text-[10px] font-bold uppercase tracking-widest text-brand-500/80">Control de Ingresos y Rankings</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-bg-accent p-1 rounded border border-border-dim mr-4">
             <button 
              onClick={() => setActiveSubTab('daily')}
              className={cn(
                "px-4 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                activeSubTab === 'daily' ? "bg-brand-500 text-black shadow-lg" : "text-text-dim hover:text-text-main"
              )}
             >
                Control Diario
             </button>
             <button 
              onClick={() => setActiveSubTab('rankings')}
              className={cn(
                "px-4 py-1.5 rounded text-[9px] font-black uppercase tracking-widest transition-all",
                activeSubTab === 'rankings' ? "bg-brand-500 text-black shadow-lg" : "text-text-dim hover:text-text-main"
              )}
             >
                Ranking Artículos
             </button>
          </div>

          <button 
            onClick={activeSubTab === 'daily' ? handleExportTemplate : handleExportRankingTemplate}
            className="bg-bg-accent hover:bg-bg-card border border-border-dim text-text-dim px-6 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
          >
            <Download size={16} /> MODELO
          </button>
          
          {activeSubTab === 'daily' ? (
            <label className="bg-bg-accent hover:bg-bg-card border border-border-dim text-text-dim px-6 py-2 rounded text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center justify-center gap-2">
              <FileUp size={16} /> IMPORTAR VENTAS
              <input 
                type="file" 
                accept=".xlsx, .xls, .csv" 
                className="hidden" 
                onChange={handleImportExcel}
              />
            </label>
          ) : (
            <label className="bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 text-brand-500 px-6 py-2 rounded text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center justify-center gap-2">
              <FileUp size={16} /> IMPORTAR RANKING
              <input 
                type="file" 
                accept=".xlsx, .xls, .csv" 
                className="hidden" 
                onChange={handleImportRankingExcel}
              />
            </label>
          )}

          {!isAdding && activeSubTab === 'daily' && (
            <button 
              onClick={() => setIsAdding(true)}
              className="bg-brand-500 hover:bg-brand-600 text-black px-6 py-2 rounded text-[10px] font-black uppercase tracking-widest shadow-xl transition-all flex items-center justify-center gap-2"
            >
              <Plus size={16} /> CARGAR DÍA
            </button>
          )}
        </div>
      </div>

      {activeSubTab === 'daily' ? (
        <>
          {isAdding && (
            <div className="bg-bg-sidebar border border-brand-500/30 p-8 rounded shadow-2xl space-y-8">
          <div className="flex flex-col md:flex-row gap-6 pb-6 border-b border-border-dim">
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Sucursal</label>
              <select 
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full px-4 py-3 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 uppercase font-bold"
              >
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 space-y-2">
              <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Fecha de Venta</label>
              <input 
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full px-4 py-3 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {SALE_TYPES.map(type => (
              <div key={type} className="space-y-4 bg-bg-accent p-6 rounded border border-border-dim/50">
                <div className="flex items-center justify-between border-b border-border-dim/30 pb-2">
                   <h4 className={cn(
                     "text-[10px] font-black uppercase tracking-widest",
                     type.includes('Pedidos Ya') ? "text-red-400" : "text-brand-500"
                   )}>{type}</h4>
                </div>
                <div className="grid grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-text-dim uppercase opacity-50">Venta Bruta</label>
                    <input 
                      type="number"
                      value={values[type].pesos || ''}
                      onChange={(e) => updateVal(type, 'pesos', Number(e.target.value))}
                      placeholder="$ 0.00"
                      className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[11px] text-text-main font-mono outline-none focus:border-brand-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-text-dim uppercase opacity-50">Venta Neta</label>
                    <input 
                      type="number"
                      value={values[type].netSales || ''}
                      onChange={(e) => updateVal(type, 'netSales', Number(e.target.value))}
                      placeholder="$ 0.00"
                      className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[11px] text-text-main font-mono outline-none focus:border-brand-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-text-dim uppercase opacity-50">Tickets</label>
                    <input 
                      type="number"
                      value={values[type].orders || ''}
                      onChange={(e) => updateVal(type, 'orders', Number(e.target.value))}
                      placeholder="0"
                      className="w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[11px] text-text-main font-mono outline-none focus:border-brand-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[8px] font-bold text-text-dim uppercase opacity-50">Cubiertos</label>
                    <input 
                      type="number"
                      disabled={type.includes('Pedidos Ya')}
                      value={type.includes('Pedidos Ya') ? '' : (values[type].covers || '')}
                      onChange={(e) => updateVal(type, 'covers', Number(e.target.value))}
                      placeholder={type.includes('Pedidos Ya') ? "N/A" : "0"}
                      className={cn(
                        "w-full bg-bg-card border border-border-dim rounded px-3 py-2 text-[11px] text-text-main font-mono outline-none focus:border-brand-500",
                        type.includes('Pedidos Ya') && "opacity-30 cursor-not-allowed bg-bg-sidebar"
                      )}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-4 bg-bg-accent p-6 rounded border border-border-dim/50">
             <div className="flex items-center justify-between border-b border-border-dim/30 pb-2">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-brand-500">Ranking de Productos Vendidos</h4>
             </div>
             
             <div className="flex gap-4">
                <div className="flex-1 relative">
                   <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
                   <input 
                    type="text"
                    placeholder="BUSCAR PRODUCTO PARA RANKING..."
                    value={rankingSearch}
                    onChange={e => setRankingSearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-bg-main border border-border-dim rounded text-[11px] text-text-main outline-none focus:border-brand-500 uppercase font-black"
                   />
                   {rankingSearch && (
                     <div className="absolute top-full left-0 w-full mt-1 bg-bg-sidebar border border-border-dim rounded shadow-2xl z-20 max-h-48 overflow-y-auto">
                        {products.filter(p => p.name.toLowerCase().includes(rankingSearch.toLowerCase())).map(p => (
                          <button 
                            key={p.id}
                            onClick={() => addRankingItem(p.id)}
                            className="w-full text-left px-4 py-2 text-[10px] font-black uppercase text-text-main hover:bg-bg-accent"
                          >
                            {p.name}
                          </button>
                        ))}
                     </div>
                   )}
                </div>
             </div>

             <div className="space-y-2">
                {productRanking.map(entry => {
                  const p = products.find(prod => prod.id === entry.productId);
                  return (
                    <div key={entry.productId} className="flex items-center gap-4 bg-bg-main p-3 rounded border border-border-dim group">
                       <span className="flex-1 text-[10px] font-black uppercase text-text-main">{p?.name}</span>
                       <div className="w-32 space-y-1">
                          <label className="text-[7px] font-bold text-text-dim uppercase opacity-50">Cantidad</label>
                          <input 
                            type="number"
                            value={entry.quantity || ''}
                            onChange={(e) => updateRankingItem(entry.productId, 'quantity', Number(e.target.value))}
                            placeholder="Cant."
                            className="w-full bg-bg-card border border-border-dim rounded px-3 py-1.5 text-[10px] text-text-main font-mono outline-none focus:border-brand-500"
                          />
                       </div>
                       <div className="w-32 space-y-1">
                          <label className="text-[7px] font-bold text-text-dim uppercase opacity-50">Importe ($)</label>
                          <input 
                            type="number"
                            value={entry.amount || ''}
                            onChange={(e) => updateRankingItem(entry.productId, 'amount', Number(e.target.value))}
                            placeholder="Importe"
                            className="w-full bg-bg-card border border-border-dim rounded px-3 py-1.5 text-[10px] text-text-main font-mono outline-none focus:border-brand-500"
                          />
                       </div>
                       <button 
                        onClick={() => setProductRanking(prev => prev.filter(r => r.productId !== entry.productId))}
                        className="p-1.5 text-text-dim hover:text-red-500 group-hover:opacity-100 transition-all"
                       >
                          <Trash2 size={14} />
                       </button>
                    </div>
                  );
                })}
             </div>
          </div>

          <div className="pt-6 border-t border-border-dim flex gap-4">
            <button 
              onClick={handleSave}
              className="flex-1 bg-brand-500 text-black py-4 rounded text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all flex items-center justify-center gap-2"
            >
              <Save size={16} /> CONFIRMAR CARGA DEL DÍA
            </button>
            <button 
              onClick={() => setIsAdding(false)}
              className="px-10 py-4 rounded border border-border-dim text-text-dim text-[11px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
            >
              CANCELAR
            </button>
          </div>
        </div>
      )}

      {activeSubTab === 'daily' && (
        <div className="bg-bg-sidebar border border-border-dim p-4 rounded flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest flex items-center gap-2">
              <Building2 size={10} className="text-brand-500" /> Sucursal Activa
            </label>
            <div className="px-3 py-2 bg-bg-accent border border-border-dim rounded text-text-main text-[10px] font-bold uppercase truncate">
              {branches.find(b => b.id === selectedBranchId)?.name || 'CONSOLIDADO (TODAS)'}
            </div>
          </div>

          <div className="w-40 space-y-1.5">
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest flex items-center gap-2">
              <Calendar size={10} className="text-teal-500" /> Mes
            </label>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="w-full px-3 py-2 bg-bg-accent border border-border-dim rounded text-text-main text-[10px] font-bold uppercase outline-none focus:border-teal-500"
            >
              <option value="all">TODOS LOS MESES</option>
              <option value="1">ENERO</option>
              <option value="2">FEBRERO</option>
              <option value="3">MARZO</option>
              <option value="4">ABRIL</option>
              <option value="5">MAYO</option>
              <option value="6">JUNIO</option>
              <option value="7">JULIO</option>
              <option value="8">AGOSTO</option>
              <option value="9">SEPTIEMBRE</option>
              <option value="10">OCTUBRE</option>
              <option value="11">NOVIEMBRE</option>
              <option value="12">DICIEMBRE</option>
            </select>
          </div>

          <div className="w-40 space-y-1.5">
            <label className="text-[9px] font-black uppercase text-text-dim tracking-widest flex items-center gap-2">
              <Filter size={10} className="text-brand-500" /> Semana
            </label>
            <select
              value={filterWeek}
              onChange={(e) => setFilterWeek(e.target.value)}
              className="w-full px-3 py-2 bg-bg-accent border border-border-dim rounded text-text-main text-[10px] font-bold uppercase outline-none focus:border-brand-500"
            >
              <option value="all">TODAS</option>
              <option value="1">SEMANA 1</option>
              <option value="2">SEMANA 2</option>
              <option value="3">SEMANA 3</option>
              <option value="4">SEMANA 4</option>
              <option value="5">SEMANA 5</option>
            </select>
          </div>

          <button 
            onClick={() => {
              setFilterMonth('all');
              setFilterWeek('all');
            }}
            className="px-4 py-2 border border-border-dim text-[9px] font-black uppercase text-text-dim hover:text-red-500 hover:border-red-500 transition-colors"
          >
            LIMPIAR
          </button>
        </div>
      )}

      {/* Stats Summary - New Layout according to mappings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Row 1: Payment Methods */}
        <div className="bg-bg-sidebar border border-emerald-500/20 p-5 rounded group hover:border-emerald-500/50 transition-all flex flex-col justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-2 text-emerald-500">Venta Total en Efectivo</p>
            <p className="text-xl font-mono font-black text-text-main italic">
              ${totals.cash.toLocaleString()}
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-border-dim">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[8px] font-black uppercase text-text-dim">Porcentaje</span>
              <span className="text-[10px] font-mono font-black text-emerald-500">{paymentPercentages.cash.toFixed(1)}%</span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
               <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: `${paymentPercentages.cash}%` }} />
            </div>
          </div>
        </div>
        <div className="bg-bg-sidebar border border-blue-500/20 p-5 rounded group hover:border-blue-500/50 transition-all flex flex-col justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-2 text-blue-500">Venta Total Tarjetas/Bancos</p>
            <p className="text-xl font-mono font-black text-text-main italic">
              ${totals.card.toLocaleString()}
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-border-dim">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[8px] font-black uppercase text-text-dim">Porcentaje</span>
              <span className="text-[10px] font-mono font-black text-blue-500">{paymentPercentages.card.toFixed(1)}%</span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
               <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${paymentPercentages.card}%` }} />
            </div>
          </div>
        </div>
        <div className="bg-bg-sidebar border border-red-500/20 p-5 rounded group hover:border-red-500/50 transition-all flex flex-col justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-2 text-red-500">Venta Total Pedidos Ya</p>
            <p className="text-xl font-mono font-black text-text-main italic">
              ${totals.qr.toLocaleString()}
            </p>
          </div>
          <div className="mt-4 pt-4 border-t border-border-dim">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[8px] font-black uppercase text-text-dim">Porcentaje</span>
              <span className="text-[10px] font-mono font-black text-red-500">{paymentPercentages.qr.toFixed(1)}%</span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden">
               <div className="h-full bg-red-500 transition-all duration-1000" style={{ width: `${paymentPercentages.qr}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Row 2: Operational Stats per Type */}
        <div className="bg-bg-sidebar border border-brand-500/20 p-5 rounded group hover:border-brand-500/50 transition-all">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-2 text-brand-500">Turno Mañana</p>
          <div className="flex flex-col">
            <p className="text-lg font-mono font-black text-text-main leading-tight italic">
              {totals.ordersByType['Turno Mañana']} <span className="text-[9px] opacity-40 not-italic uppercase">Ordenes</span>
            </p>
            <p className="text-[10px] font-mono text-text-dim/70">
              {totals.coversByType['Turno Mañana']} <span className="opacity-40 uppercase">Cubiertos</span>
            </p>
          </div>
        </div>

        <div className="bg-bg-sidebar border border-brand-500/20 p-5 rounded group hover:border-brand-500/50 transition-all">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-2 text-brand-500">Turno Tarde</p>
          <div className="flex flex-col">
            <p className="text-lg font-mono font-black text-text-main leading-tight italic">
              {totals.ordersByType['Turno Tarde']} <span className="text-[9px] opacity-40 not-italic uppercase">Ordenes</span>
            </p>
            <p className="text-[10px] font-mono text-text-dim/70">
              {totals.coversByType['Turno Tarde']} <span className="opacity-40 uppercase">Cubiertos</span>
            </p>
          </div>
        </div>

        <div className="bg-bg-sidebar border border-red-500/20 p-5 rounded group hover:border-red-500/50 transition-all">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-2 text-red-500">Ordenes Pedidos Ya</p>
          <p className="text-xl font-mono font-black text-text-main italic">
            {totals.pedidosYaOrders} <span className="text-[9px] opacity-40 not-italic uppercase">Tickets</span>
          </p>
        </div>

        <div className="bg-bg-sidebar border border-brand-500/20 p-5 rounded group hover:border-brand-500/50 transition-all">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-2 text-brand-500">Ordenes Locales (M+T)</p>
          <p className="text-xl font-mono font-black text-text-main italic">
            {totals.ordersByType['Turno Mañana'] + totals.ordersByType['Turno Tarde']} <span className="text-[9px] opacity-40 not-italic uppercase">Tickets</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Row 3: Totals & Projection */}
        <div className="bg-bg-sidebar border border-brand-500/20 p-5 rounded relative overflow-hidden group">
          <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform">
            <TrendingUp size={80} className="text-brand-500" />
          </div>
          <p className="text-[9px] font-black text-text-dim uppercase tracking-[0.2em] mb-2">Ventas Brutas Totales</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-mono font-black text-brand-500">${totals.totalGross.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-bg-sidebar border border-teal-500/20 p-5 rounded relative overflow-hidden group">
          <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform">
            <Calculator size={80} className="text-teal-500" />
          </div>
          <p className="text-[9px] font-black text-text-dim uppercase tracking-[0.2em] mb-2">Ventas Netas Totales</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-mono font-black text-teal-400">${totals.totalNet.toLocaleString()}</p>
          </div>
        </div>
        <div className="bg-bg-sidebar border border-brand-500/20 p-5 rounded relative overflow-hidden group">
          <div className="absolute -right-2 -bottom-2 opacity-5 group-hover:scale-110 transition-transform">
            <TrendingUp size={80} className="text-brand-500" />
          </div>
          <p className="text-[9px] font-black text-text-dim uppercase tracking-[0.2em] mb-2">Proyección Neta Mensual</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-mono font-black text-brand-500">${monthlyProjection.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
          </div>
        </div>
        <div className="bg-bg-sidebar border border-border-dim p-5 rounded">
          <p className="text-[9px] font-black text-text-dim uppercase tracking-[0.2em] mb-2">Cubiertos Totales</p>
          <p className="text-3xl font-mono font-black text-text-main">{totals.covers.toLocaleString()}</p>
        </div>
      </div>

      {/* Charts Section */}
      <div className="bg-bg-sidebar border border-border-dim rounded overflow-hidden">
        <div className="bg-bg-accent px-4 py-3 border-b border-border-dim flex flex-wrap gap-2 items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 size={14} className="text-brand-500" />
            <h3 className="text-[10px] font-black uppercase tracking-widest text-text-main">Analítica de Ventas</h3>
          </div>
          <div className="flex gap-1">
            {[
              { id: 'net', label: 'Ventas Netas', color: 'teal' },
              { id: 'gross', label: 'Ventas Brutas', color: 'brand' },
              { id: 'cash', label: 'Efectivo', color: 'emerald' },
              { id: 'card', label: 'Tarjetas/Bancos', color: 'blue' },
              { id: 'qr', label: 'Pedidos Ya', color: 'indigo' }
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => setChartMetric(m.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-[2px] text-[9px] font-bold uppercase transition-all tracking-tighter border",
                  chartMetric === m.id 
                    ? "bg-text-main text-bg-sidebar border-text-main shadow-lg"
                    : "bg-bg-accent text-text-dim border-border-dim hover:border-text-dim"
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6">
          <div className="space-y-4">
             <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-text-dim">Por Día de la Semana</span>
             </div>
             <div className="h-[250px]">
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekdayChartData} margin={{ top: 10, right: 10, left: 20, bottom: 20 }}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                     <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#888', fontSize: 9, fontWeight: 700 }}
                      dy={10}
                     />
                     <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#888', fontSize: 9 }}
                      tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                     />
                     <Tooltip 
                      cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                      contentStyle={{ 
                        backgroundColor: '#000', 
                        border: '1px solid #444', 
                        borderRadius: '4px',
                        padding: '12px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                      }}
                      itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                      labelStyle={{ color: '#aaa', fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      formatter={(val: number) => [`$${val.toLocaleString()}`, chartMetric.toUpperCase()]}
                     />
                     <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                        {weekdayChartData.map((entry, index) => (
                          <Cell 
                            key={`cell-${index}`} 
                            fill={
                              chartMetric === 'net' ? '#2dd4bf' :
                              chartMetric === 'gross' ? '#f59e0b' :
                              chartMetric === 'cash' ? '#10b981' :
                              chartMetric === 'card' ? '#3b82f6' :
                              '#ef4444'
                            } 
                          />
                        ))}
                     </Bar>
                  </BarChart>
               </ResponsiveContainer>
             </div>
          </div>

          <div className="space-y-4">
             <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-wider text-text-dim">Por Número de Semana</span>
             </div>
             <div className="h-[250px]">
               <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyChartData} margin={{ top: 10, right: 10, left: 20, bottom: 20 }}>
                     <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                     <XAxis 
                      dataKey="name" 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#888', fontSize: 9, fontWeight: 700 }}
                      dy={10}
                     />
                     <YAxis 
                      axisLine={false} 
                      tickLine={false} 
                      tick={{ fill: '#888', fontSize: 9 }}
                      tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                     />
                     <Tooltip 
                      cursor={{ fill: 'rgba(255,255,255,0.02)' }}
                      contentStyle={{ 
                        backgroundColor: '#000', 
                        border: '1px solid #444', 
                        borderRadius: '4px',
                        padding: '12px',
                        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                      }}
                      itemStyle={{ color: '#fff', fontSize: '12px', fontWeight: 'bold' }}
                      labelStyle={{ color: '#aaa', fontSize: '10px', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      formatter={(val: number) => [`$${val.toLocaleString()}`, chartMetric.toUpperCase()]}
                     />
                     <Bar dataKey="value" radius={[4, 4, 0, 0]} fill={
                        chartMetric === 'net' ? '#2dd4bf' :
                        chartMetric === 'gross' ? '#f59e0b' :
                        chartMetric === 'cash' ? '#10b981' :
                        chartMetric === 'card' ? '#3b82f6' :
                        '#ef4444'
                     } />
                  </BarChart>
               </ResponsiveContainer>
             </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="bg-bg-sidebar border border-border-dim rounded overflow-hidden">
            <div className="bg-bg-accent p-4 border-b border-border-dim flex justify-between items-center bg-zinc-950/20">
               <div className="flex items-center gap-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-text-main">Historial de Ventas Diario</h3>
                  {selectedFilteredCount > 0 && (
                     <div className="flex items-center gap-2">
                       <span className="bg-red-500/10 text-red-500 border border-red-500/25 px-2 py-1 rounded text-[8px] font-black uppercase tracking-wider flex items-center gap-1">
                         <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                         {selectedFilteredCount} Seleccionados
                       </span>
                       <button
                         onClick={handleDeleteSelected}
                         className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest px-3 py-1.5 rounded text-[8px] border border-red-500/30 transition-all cursor-pointer shadow-sm active:scale-95"
                         title="Eliminar todos los registros seleccionados"
                       >
                         <Trash2 size={10} /> Eliminar Seleccionados
                       </button>
                     </div>
                  )}
               </div>
               {loading && <Loader2 className="animate-spin text-brand-500" size={14} />}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[9px]">
                <thead>
                  <tr className="bg-bg-accent border-b border-border-dim text-left text-text-dim font-black uppercase tracking-widest">
                    <th className="px-4 py-3 w-10 text-center">
                      <input 
                        type="checkbox"
                        checked={isAllSelected}
                        onChange={handleSelectAllToggle}
                        className="rounded border border-border-dim text-brand-500 focus:ring-brand-500 bg-bg-sidebar w-3.5 h-3.5 cursor-pointer"
                        title="Seleccionar todo"
                      />
                    </th>
                    <th className="px-4 py-3 min-w-[120px]">Sucursal</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-2 py-3">Semana</th>
                    <th className="px-2 py-3">Día</th>
                    <th className="px-3 py-3">Turno</th>
                    <th className="px-2 py-3 text-center">Hora</th>
                    <th className="px-3 py-3 text-right">Ordenes</th>
                    <th className="px-3 py-3 text-right">Cubiertos</th>
                    <th className="px-3 py-3 text-left">Medio Cobro</th>
                    <th className="px-3 py-3 text-right">V. Brutas</th>
                    <th className="px-3 py-3 text-right">V. Netas</th>
                    <th className="px-3 py-3 text-right">IVA</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim font-medium">
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="px-6 py-20 text-center text-text-dim italic uppercase opacity-50">
                        No hay registros cargados para este periodo
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((record) => {
                      const isSelected = selectedRowIds.includes(record.id);
                      return (
                        <tr key={record.id} className={cn(
                          "hover:bg-bg-accent/50 transition-colors group",
                          isSelected && "bg-brand-500/5 hover:bg-brand-500/10"
                        )}>
                          <td className="px-4 py-3 text-center w-10">
                            <input 
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleRowSelectToggle(record.id)}
                              className="rounded border border-border-dim text-brand-500 focus:ring-brand-500 bg-bg-sidebar w-3.5 h-3.5 cursor-pointer"
                            />
                          </td>
                          <td className="px-4 py-3 font-black text-brand-500 uppercase">
                            {branches.find(b => b.id === record.branchId)?.name || record.branchId}
                          </td>
                          <td className="px-4 py-3 font-mono text-text-main">{record.date}</td>
                          <td className="px-2 py-3 text-text-dim uppercase">{record.week}</td>
                          <td className="px-2 py-3 text-text-dim uppercase">{record.dayName}</td>
                          <td className="px-3 py-3 text-left text-text-dim/80">{record.type}</td>
                          <td className="px-2 py-3 text-center font-mono">{record.hora || '08:00'}</td>
                          <td className="px-3 py-3 text-right font-mono">{record.orders.toLocaleString()}</td>
                          <td className="px-3 py-3 text-right font-mono">{record.covers.toLocaleString()}</td>
                          <td className="px-3 py-3 text-left font-mono font-bold text-indigo-400">{record.medioCobro || 'Efectivo'}</td>
                          <td className="px-3 py-3 text-right font-mono font-black text-text-main">
                            ${record.pesos.toLocaleString()}
                          </td>
                          <td className="px-3 py-3 text-right font-mono font-black text-teal-400">
                            ${record.netSales.toLocaleString()}
                          </td>
                          <td className="px-3 py-3 text-right font-mono text-text-dim/70">
                            ${(record.iva || 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button 
                                onClick={() => handleEditGroup({ branchId: record.branchId, date: record.date })}
                                className="text-text-dim/40 hover:text-brand-500 transition-colors p-1"
                                title="Editar"
                              >
                                <FileUp size={14} />
                              </button>
                              <button 
                                onClick={async () => {
                                  if (confirm('¿Está seguro de eliminar esta venta?')) {
                                    try {
                                      const { error } = await supabase
                                        .from('sales')
                                        .delete()
                                        .eq('id', record.id);
                                      if (error) throw error;
                                      
                                      setSelectedRowIds(prev => prev.filter(rowId => rowId !== record.id));
                                      fetchData();
                                    } catch (err) {
                                      console.error('Error deleting record:', err);
                                      alert('Error al eliminar el registro.');
                                    }
                                  }
                                }}
                                className="text-text-dim/40 hover:text-red-500 transition-colors p-1"
                                title="Eliminar"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-bg-accent border border-border-dim p-6 rounded relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-5">
                <Calculator size={60} />
             </div>
             <h4 className="text-[10px] font-bold uppercase tracking-widest text-text-dim mb-4">Información de Proyección</h4>
             <p className="text-[10px] text-text-dim leading-relaxed italic opacity-70">
                La proyección mensual se estima multiplicando la venta diaria por la cantidad de días del mes. Este dato ayuda a prever el cumplimiento de objetivos de facturación.
             </p>
             <div className="mt-6 pt-6 border-t border-border-dim">
                <div className="flex items-center gap-2 text-brand-500 mb-2 font-black text-[9px] uppercase">
                   <Building2 size={14} /> Distribución de Carga
                </div>
                <div className="space-y-3">
                   {branches.map(b => (
                      <div key={b.id} className="flex items-center justify-between">
                         <span className="text-[9px] text-text-dim font-bold uppercase">{b.name}</span>
                         <div className="w-24 h-1 bg-bg-card rounded-full overflow-hidden">
                            <div className="h-full bg-border-dim" style={{ width: '30%' }}></div>
                         </div>
                      </div>
                   ))}
                </div>
             </div>
          </div>

          <div className="bg-brand-500/5 border border-brand-500/20 p-6 rounded text-center">
             <Users size={24} className="text-brand-500 mx-auto mb-3" />
             <p className="text-[10px] font-bold text-text-main uppercase tracking-widest mb-1">Ratio de Tickets</p>
             <p className="text-2xl font-mono font-bold text-brand-500">
                {totals.orders > 0 ? (totals.pesos / totals.orders).toLocaleString(undefined, { maximumFractionDigits: 0 }) : 0}
             </p>
             <p className="text-[9px] text-text-dim uppercase mt-1">Gasto promedio por ticket</p>
          </div>
        </div>
      </div>
      </>
      ) : (
        <div className="space-y-6">
           <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="md:col-span-1 space-y-4">
                 <div className="bg-bg-sidebar border border-border-dim p-6 rounded space-y-4">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-brand-500 border-b border-border-dim pb-2">Resumen Ranking</h3>
                    <div className="space-y-4">
                       <div className="p-4 bg-bg-accent rounded border border-border-dim">
                          <p className="text-[8px] font-bold text-text-dim uppercase mb-1">Registros Cargados</p>
                          <p className="text-2xl font-mono font-black text-text-main">{rankings.length}</p>
                       </div>
                       <div className="p-4 bg-bg-accent rounded border border-border-dim">
                          <p className="text-[8px] font-bold text-text-dim uppercase mb-1">Sucursales con Datos</p>
                          <p className="text-2xl font-mono font-black text-text-main">
                             {new Set(rankings.map(r => r.branch_id)).size}
                          </p>
                       </div>
                    </div>
                 </div>

                 <div className="bg-brand-500/5 border border-brand-500/20 p-6 rounded">
                    <div className="flex items-center gap-2 text-brand-500 mb-2">
                       <Filter size={14} />
                       <span className="text-[10px] font-black uppercase">Filtro Rápido</span>
                    </div>
                    <p className="text-[9px] text-text-dim leading-relaxed uppercase font-bold">
                       Use el selector de sucursal arriba para ver el ranking específico de un punto de venta.
                    </p>
                 </div>
              </div>

              <div className="md:col-span-3">
                 <div className="bg-bg-sidebar border border-border-dim rounded overflow-hidden">
                    <div className="bg-bg-accent p-4 border-b border-border-dim flex justify-between items-center">
                       <h3 className="text-[10px] font-black uppercase tracking-widest text-text-main">Ranking de Artículos por Sucursal</h3>
                       <div className="flex items-center gap-4">
                          <span className="text-[9px] font-bold text-text-dim uppercase">Mostrando: {selectedBranchId === 'all' ? 'Todas las Sucursales' : branches.find(b => b.id === selectedBranchId)?.name}</span>
                          {loading && <Loader2 className="animate-spin text-brand-500" size={14} />}
                       </div>
                    </div>
                    <div className="overflow-x-auto">
                       <table className="w-full border-collapse text-[10px]">
                          <thead>
                             <tr className="bg-bg-card border-b border-border-dim text-left text-text-dim font-bold uppercase tracking-widest">
                                <th className="px-6 py-4">Producto</th>
                                <th className="px-4 py-4 text-center">Código</th>
                                <th className="px-4 py-4 text-center">Sucursal</th>
                                <th className="px-4 py-4 text-center">Fecha/Mes</th>
                                <th className="px-4 py-4 text-right">Cantidad</th>
                                <th className="px-4 py-4 text-right">Importe</th>
                                <th className="px-6 py-4"></th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-border-dim">
                             {rankings.length === 0 ? (
                               <tr>
                                  <td colSpan={7} className="px-6 py-20 text-center text-text-dim italic uppercase opacity-50">
                                     No hay rankings cargados. Use el botón "Importar Ranking" para cargar un Excel.
                                  </td>
                               </tr>
                             ) : (
                               rankings.map((r, idx) => (
                                 <tr key={r.id || idx} className="hover:bg-bg-accent/50 transition-colors group">
                                    <td className="px-6 py-4">
                                       <span className="font-black text-text-main uppercase">{r.product_name}</span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                       <span className="font-mono text-text-dim bg-bg-card px-2 py-0.5 rounded border border-border-dim text-[9px]">{r.product_code || '---'}</span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                       <span className="text-text-dim uppercase font-bold">{branches.find(b => b.id === r.branch_id)?.name || 'Desconocida'}</span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                       <span className="text-text-dim font-mono">{r.date}</span>
                                    </td>
                                    <td className="px-4 py-4 text-right font-black text-brand-500 text-sm">
                                       {r.quantity.toLocaleString()}
                                    </td>
                                    <td className="px-4 py-4 text-right font-mono font-bold text-text-main">
                                       ${r.amount?.toLocaleString() || 0}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                       <button className="text-text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <Trash2 size={14} />
                                       </button>
                                    </td>
                                 </tr>
                               ))
                             )}
                          </tbody>
                       </table>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* Ranking Import Modal */}
      <AnimatePresence>
         {isImportingRanking && rankingToImport && (
           <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-bg-sidebar border border-border-dim rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden"
              >
                 <div className="p-6 border-b border-border-dim bg-bg-accent flex justify-between items-center">
                    <div>
                       <h3 className="text-sm font-black text-brand-500 uppercase tracking-widest flex items-center gap-2">
                          <CheckCircle2 size={18} /> Previsualización de Importación
                       </h3>
                       <p className="text-[10px] text-text-dim font-bold uppercase mt-1">Verifique los datos antes de confirmar</p>
                    </div>
                    <button onClick={() => setIsImportingRanking(false)} className="text-text-dim hover:text-text-main">
                       <X size={20} />
                    </button>
                 </div>

                 <div className="p-6 bg-bg-main border-b border-border-dim grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                       <label className="text-[9px] font-black text-text-dim uppercase">Sucursal de Destino</label>
                       <select 
                        value={rankingToImport.branchId}
                        onChange={(e) => setRankingToImport({...rankingToImport, branchId: e.target.value})}
                        className="w-full bg-bg-sidebar border border-border-dim rounded px-3 py-2 text-xs font-black uppercase text-brand-500"
                       >
                          {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                       </select>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[9px] font-black text-text-dim uppercase">Fecha del Ranking</label>
                       <input 
                        type="date"
                        value={rankingToImport.date}
                        onChange={(e) => setRankingToImport({...rankingToImport, date: e.target.value})}
                        className="w-full bg-bg-sidebar border border-border-dim rounded px-3 py-2 text-xs font-mono"
                       />
                    </div>
                 </div>

                 <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                    <table className="w-full border-collapse text-[10px]">
                       <thead className="sticky top-0 z-10 bg-bg-accent shadow-sm">
                          <tr className="text-left text-text-dim font-bold uppercase tracking-widest border-b border-border-dim">
                             <th className="px-6 py-3">Código</th>
                             <th className="px-6 py-3">Nombre del Producto</th>
                             <th className="px-6 py-3 text-right">Cantidad</th>
                             <th className="px-6 py-3 text-right">Importe</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-border-dim/30">
                          {rankingToImport.entries.map((e, idx) => (
                            <tr key={idx} className="hover:bg-bg-accent/30">
                               <td className="px-6 py-3 font-mono text-text-dim">{e.product_code}</td>
                               <td className="px-6 py-3 font-black text-text-main uppercase">{e.product_name}</td>
                               <td className="px-6 py-3 text-right font-black text-brand-500">{e.quantity}</td>
                               <td className="px-6 py-3 text-right font-mono text-text-dim">${e.amount?.toLocaleString()}</td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>

                 <div className="p-6 bg-bg-accent border-t border-border-dim flex gap-4">
                    <button 
                      onClick={confirmRankingImport}
                      disabled={loading}
                      className="flex-1 bg-brand-500 text-black py-3 rounded text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 shadow-xl transition-all flex items-center justify-center gap-2"
                    >
                       {loading ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                       CONFIRMAR E IMPORTAR {rankingToImport.entries.length} ARTÍCULOS
                    </button>
                    <button 
                      onClick={() => setIsImportingRanking(false)}
                      className="px-8 py-3 rounded border border-border-dim text-text-dim text-[11px] font-black uppercase tracking-widest hover:bg-bg-sidebar transition-all"
                    >
                       CANCELAR
                    </button>
                 </div>
              </motion.div>
           </div>
         )}
      </AnimatePresence>
    </motion.div>
  );
}
