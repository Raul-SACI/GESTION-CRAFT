/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import SalesByBranchTable from './SalesByBranchTable';
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
  Clock,
  Filter,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ChevronRight,
  FileDown
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
import MonthlyRankingTop, { CategoryMultiSelect } from './MonthlyRankingTop';
import { cn } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { AnimatePresence } from 'motion/react';

interface SalesViewProps {
  branches: Branch[];
  selectedBranchId: string;
  products: Product[];
  isReadOnly?: boolean;
}

const SALE_TYPES: SaleType[] = ['Turno Mañana', 'Turno Tarde', 'Pedidos Ya Restó', 'Pedidos Ya Café'];

const calculateWeekFromDate = (dateStr: string): string => {
  if (!dateStr) return 'Semana 1';
  const parts = dateStr.split('-');
  const day = parts.length >= 3 ? parseInt(parts[2], 10) : new Date(dateStr).getUTCDate();
  
  if (isNaN(day)) return 'Semana 1';
  if (day >= 1 && day <= 7) return 'Semana 1';
  if (day >= 8 && day <= 14) return 'Semana 2';
  if (day >= 15 && day <= 21) return 'Semana 3';
  return 'Semana 4'; // Days 22 onwards
};

const getExcelOrCalculatedWeek = (rowWeek: any, dateStr: string): string => {
  if (rowWeek) {
    const raw = String(rowWeek).trim();
    const num = raw.match(/\d+/)?.[0];
    if (num) {
      const parsedNum = parseInt(num, 10);
      if (parsedNum >= 5) {
        return 'Semana 4'; // Coerce Week 5+ to Week 4
      }
      return `Semana ${parsedNum}`;
    }
    return raw;
  }
  return calculateWeekFromDate(dateStr);
};

const findBestBranchMatch = (excelBranch: any, branches: Branch[], selectedBranchId: string): string => {
  if (!excelBranch) return selectedBranchId === 'all' ? (branches[0]?.id || 'bn') : selectedBranchId;
  
  const clean = String(excelBranch).toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, ""); // Keep only lowercase letters and numbers

  const matchByKeywords = (keywords: string[]) => branches.find(b => {
    const bClean = b.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    return keywords.some(k => bClean.includes(k));
  });

  // Alias explícitos de los nombres que vienen en las planillas de ventas.
  // Cada alias apunta a las palabras clave del nombre real de la sucursal en el sistema.
  const ALIASES: { match: string[]; target: string[] }[] = [
    { match: ['bnorte', 'barrionorte'], target: ['barrionorte', 'barrio'] },
    { match: ['bsur', 'barriosur'], target: ['barriosur', 'barrio'] },
    { match: ['shell', 'matedeluna', 'mateluna', 'deluna'], target: ['matedeluna', 'mateluna', 'mate'] },
    { match: ['mercato', 'casco', 'viejo', 'cascoviejo'], target: ['cascoviejo', 'casco', 'viejo'] },
    { match: ['peron'], target: ['peron'] },
    { match: ['almacen', 'produccion'], target: ['almacen', 'produccion'] }
  ];

  for (const alias of ALIASES) {
    if (alias.match.some(m => clean.includes(m))) {
      // Encontrar la sucursal cuyo nombre contiene alguna de las target keywords
      const found = branches.find(b => {
        const bClean = b.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        // Para barrio norte/sur necesitamos distinguir; chequeamos ambas palabras
        if (alias.match.includes('bnorte')) return bClean.includes('barrio') && bClean.includes('norte');
        if (alias.match.includes('bsur')) return bClean.includes('barrio') && bClean.includes('sur');
        return alias.target.some(t => bClean.includes(t));
      });
      if (found) return found.id;
    }
  }

  const match = branches.find(b => {
    const bClean = b.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    return bClean === clean || bClean.includes(clean) || clean.includes(bClean);
  });
  
  if (match) return match.id;
  // Si no matchea con ninguna sucursal conocida (ej: CRAFT FLIP), devolver vacío para descartar.
  return '';
};

export default function SalesView({ branches, selectedBranchId, products, isReadOnly = false }: SalesViewProps) {
  const [localBranchId, setLocalBranchId] = useState<string>(selectedBranchId);
  const [activeSubTab, setActiveSubTab] = useState<'daily' | 'rankings'>('daily');
  const [salesRecords, setSalesRecords] = useState<SalesData[]>([]);
  const [allTicketsData, setAllTicketsData] = useState<any[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);
  // Filtros por columna del historial diario
  const [histFilters, setHistFilters] = useState({ branch: 'all', week: 'all', day: 'all', shift: 'all', medio: 'all', date: '' });
  const [isAdding, setIsAdding] = useState(false);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  
  // Dashboard Filters
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterWeek, setFilterWeek] = useState<string>('all');
  
  // Sync localBranchId with global selection when prop updates
  React.useEffect(() => {
    setLocalBranchId(selectedBranchId);
  }, [selectedBranchId]);

  // Clear selections when filters change
  React.useEffect(() => {
    setSelectedRowIds([]);
  }, [localBranchId, filterMonth, filterWeek]);
  
  // Rankings State
  const [rankings, setRankings] = useState<any[]>([]);
  const [rkFilterProduct, setRkFilterProduct] = useState('');
  const [rkFilterCode, setRkFilterCode] = useState('');
  const [rkFilterCategories, setRkFilterCategories] = useState<string[]>([]);
  const [rkFilterBranch, setRkFilterBranch] = useState('all');
  const [rkFilterPeriod, setRkFilterPeriod] = useState('all');
  const [rkSelected, setRkSelected] = useState<Set<string>>(new Set());
  const [isImportingRanking, setIsImportingRanking] = useState(false);
  const [rankingToImport, setRankingToImport] = useState<{
    branchId: string;
    month: string;
    week: number;
    entries: any[];
  } | null>(null);
  
  // New combined form state for all 4 slots
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [branchId, setBranchId] = useState(selectedBranchId === 'all' ? (branches[0]?.id || '') : selectedBranchId);

  // Product ranking state for the current entry
  const [productRanking, setProductRanking] = useState<ProductRankingEntry[]>([]);
  const [rankingSearch, setRankingSearch] = useState('');

  // Sync branchId with selection when opening the form
  React.useEffect(() => {
    if (localBranchId !== 'all') {
      setBranchId(localBranchId);
    }
  }, [localBranchId, isAdding]);

  // Fetch from Supabase
  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch Sales with pagination to support unlimited rows beyond default 1000 limit
      let allSalesData: any[] = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;
      
      while (hasMore) {
        let salesQuery = supabase
          .from('sales')
          .select('*')
          .order('date', { ascending: false })
          .order('id', { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);
          
        if (localBranchId !== 'all') {
          salesQuery = salesQuery.eq('branch_id', localBranchId);
        }
        
        const { data: salesData, error: salesError } = await salesQuery;
        if (salesError) throw salesError;
        
        if (salesData && salesData.length > 0) {
          allSalesData = [...allSalesData, ...salesData];
          if (salesData.length < pageSize) {
            hasMore = false;
          } else {
            page++;
          }
        } else {
          hasMore = false;
        }
        
        // Safety lock to avoid infinite loops (supports up to 30,000 records)
        if (page > 30) {
          break;
        }
      }

      // Fetch tickets with pagination (16k+ rows, Supabase default limit = 1000)
      let fetchedTickets: any[] = [];
      let tkPage = 0;
      const tkPageSize = 1000;
      let tkHasMore = true;
      while (tkHasMore) {
        let tkQuery = supabase
          .from('sales_tickets')
          .select('branch_id, date, shift, hour, payment_method, gross_sales, net_sales, orders, covers, iva, week_number, day_name, comprobante')
          .order('date', { ascending: false })
          .order('hour', { ascending: true })
          .range(tkPage * tkPageSize, (tkPage + 1) * tkPageSize - 1);
        if (localBranchId !== 'all') tkQuery = tkQuery.eq('branch_id', localBranchId);
        const { data: tkData } = await tkQuery;
        if (tkData && tkData.length > 0) {
          fetchedTickets = [...fetchedTickets, ...tkData];
          tkHasMore = tkData.length === tkPageSize;
          tkPage++;
        } else {
          tkHasMore = false;
        }
        if (tkPage > 50) break; // safety: max 50k tickets
      }
      const ticketsData = fetchedTickets;
      setAllTicketsData(fetchedTickets); // store for hour filter

      if (ticketsData && ticketsData.length > 0) {
        // Group tickets by branch+date+shift to show in historial
        const ticketMap: Record<string, any[]> = {};
        ticketsData.forEach((t: any) => {
          const shiftType = t.shift === 'Mañana' ? 'Turno Mañana' : 'Turno Tarde';
          const key = `${t.branch_id}|${t.date}|${shiftType}`;
          if (!ticketMap[key]) ticketMap[key] = [];
          ticketMap[key].push(t);
        });

        const ticketRecords: SalesData[] = [];
        Object.entries(ticketMap).forEach(([key, tickets]) => {
          const [branchId, date, type] = key.split('|');
          const first = tickets[0];
          // Count payments by type
          const paymentCounts: Record<string, number> = {};
          tickets.forEach((t: any) => {
            paymentCounts[t.payment_method] = (paymentCounts[t.payment_method] || 0) + 1;
          });
          const dominantPayment = Object.entries(paymentCounts).sort((a,b) => b[1]-a[1])[0]?.[0] || 'Efectivo';

          // Calculate real payment breakdown from tickets
          let cashSum = 0, cardSum = 0, pySum = 0;
          tickets.forEach((t: any) => {
            const pm = String(t.payment_method || '').toLowerCase();
            const amount = Number(t.gross_sales || 0);
            if (pm.includes('efectivo')) cashSum += amount;
            else if (pm.includes('pedidos')) pySum += amount;
            else cardSum += amount;
          });

          ticketRecords.push({
            id: `tk|${key}`,
            branchId,
            date,
            type: type as SaleType,
            pesos: tickets.reduce((s: number, t: any) => s + Number(t.gross_sales || 0), 0),
            netSales: tickets.reduce((s: number, t: any) => s + Number(t.net_sales || 0), 0),
            orders: tickets.reduce((s: number, t: any) => s + Number(t.orders || 0), 0),
            covers: tickets.reduce((s: number, t: any) => s + Number(t.covers || 0), 0),
            iva: tickets.reduce((s: number, t: any) => s + Number(t.iva || 0), 0),
            projection: 0,
            week: `Semana ${first.week_number || 1}`,
            dayName: first.day_name || '',
            cash: cashSum,
            card: cardSum,
            qr: pySum,
            hora: (() => {
              const hours = tickets
                .map((t: any) => String(t.hour || '').substring(0, 5))
                .filter((h: string) => h && h !== '00:00')
                .sort();
              if (hours.length === 0) return '—';
              const firstH = hours[0];
              const lastH = hours[hours.length - 1];
              return firstH === lastH ? firstH : `${firstH}-${lastH}`;
            })(),
            medioCobro: dominantPayment,
            productRanking: []
          });
        });

        // Use ticket records if available, otherwise fall back to sales records
        setSalesRecords(ticketRecords.length > 0 ? ticketRecords : allSalesData.map(s => ({
          id: s.id,
          branchId: s.branch_id,
          date: s.date,
          type: s.type as SaleType,
          pesos: Number(s.pesos),
          netSales: Number(s.net_sales),
          orders: s.orders,
          covers: s.covers,
          projection: Number(s.projection || 0),
          week: s.week || calculateWeekFromDate(s.date),
          dayName: s.day_name || new Date(s.date).toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' }),
          cash: Number(s.cash || 0), card: Number(s.card || 0), qr: Number(s.qr || 0),
          iva: Number(s.iva || 0),
          hora: '—', medioCobro: '—', productRanking: []
        })));
      } else {
        setSalesRecords(allSalesData.map(s => ({
          id: s.id,
          branchId: s.branch_id,
          date: s.date,
          type: s.type as SaleType,
          pesos: Number(s.pesos),
          netSales: Number(s.net_sales),
          orders: s.orders,
          covers: s.covers,
          projection: Number(s.projection || 0),
          week: s.week || calculateWeekFromDate(s.date),
          dayName: s.day_name || new Date(s.date).toLocaleDateString('es-ES', { weekday: 'short', timeZone: 'UTC' }),
          cash: Number(s.cash || 0), card: Number(s.card || 0), qr: Number(s.qr || 0),
          iva: Number(s.iva || 0),
          hora: '—', medioCobro: '—', productRanking: []
        })));
      }

      // Fetch Rankings Table with pagination to bypass PostgREST limit
      let allRankingData: any[] = [];
      let rankingPage = 0;
      const rankingPageSize = 1000;
      let rankingHasMore = true;
      
      while (rankingHasMore) {
        let rankingQuery = supabase
          .from('product_rankings')
          .select('*')
          .order('month', { ascending: false })
          .order('week_number', { ascending: false })
          .order('quantity', { ascending: false })
          .range(rankingPage * rankingPageSize, (rankingPage + 1) * rankingPageSize - 1);

        // El Ranking de Artículos tiene su PROPIO filtro de sucursal (rkFilterBranch),
        // independiente del filtro de Control Diario (localBranchId). Por eso acá se
        // traen SIEMPRE todas las sucursales y el filtrado por sucursal se hace en pantalla.

        const { data: rankingData, error: rankingError } = await rankingQuery;
        if (rankingError) throw rankingError;
        
        if (rankingData && rankingData.length > 0) {
          allRankingData = [...allRankingData, ...rankingData];
          if (rankingData.length < rankingPageSize) {
            rankingHasMore = false;
          } else {
            rankingPage++;
          }
        } else {
          rankingHasMore = false;
        }
        
        // Safety lock, up to 30,000 records
        if (rankingPage > 30) {
          break;
        }
      }

      setRankings(allRankingData);
    } catch (err) {
      console.error('Error fetching sales data:', err);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, [localBranchId]);
  
  const [values, setValues] = useState<Record<SaleType, { pesos: number, netSales: number, orders: number, covers: number }>>({
    'Turno Mañana': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
    'Turno Tarde': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
    'Pedidos Ya Restó': { pesos: 0, netSales: 0, orders: 0, covers: 0 },
    'Pedidos Ya Café': { pesos: 0, netSales: 0, orders: 0, covers: 0 }
  });

  const handleSave = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
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
          week: calculateWeekFromDate(entryDate),
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
    if (localBranchId !== 'all') {
      base = base.filter(r => r.branchId === localBranchId);
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
  }, [salesRecords, localBranchId, filterMonth, filterWeek]);

  // Opciones para los desplegables de filtro de la tabla de ranking
  const rkCategoryOptions = useMemo(
    () => Array.from(new Set(rankings.map(r => (r.category || '').trim()).filter(Boolean))).sort(),
    [rankings]
  );
  const rkPeriodOptions = useMemo(
    () => Array.from(new Set(rankings.map(r => `${r.month || ''}${r.week_number ? ` · S${r.week_number}` : ''}`).filter(Boolean))).sort().reverse(),
    [rankings]
  );

  // Tabla de ranking con filtros por columna aplicados
  const filteredRankings = useMemo(() => {
    return rankings.filter(r => {
      if (rkFilterProduct && !(r.product_name || '').toUpperCase().includes(rkFilterProduct.toUpperCase())) return false;
      if (rkFilterCode && !(String(r.product_code || '')).toUpperCase().includes(rkFilterCode.toUpperCase())) return false;
      if (rkFilterCategories.length > 0 && !rkFilterCategories.includes((r.category || '').trim())) return false;
      if (rkFilterBranch !== 'all' && r.branch_id !== rkFilterBranch) return false;
      const period = `${r.month || ''}${r.week_number ? ` · S${r.week_number}` : ''}`;
      if (rkFilterPeriod !== 'all' && period !== rkFilterPeriod) return false;
      return true;
    });
  }, [rankings, rkFilterProduct, rkFilterCode, rkFilterCategories, rkFilterBranch, rkFilterPeriod]);

  // --- Ranking: selección múltiple, eliminación y plantilla modelo ---
  const rkAllFilteredSelected = filteredRankings.length > 0 && filteredRankings.every(r => rkSelected.has(r.id));

  const toggleRkSelectAll = () => {
    setRkSelected(prev => {
      const next = new Set(prev);
      if (rkAllFilteredSelected) {
        filteredRankings.forEach(r => next.delete(r.id));
      } else {
        filteredRankings.forEach(r => { if (r.id) next.add(r.id); });
      }
      return next;
    });
  };

  const toggleRkOne = (id: string) => {
    setRkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const deleteSelectedRankings = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const ids = Array.from(rkSelected);
    if (ids.length === 0) return;
    if (!window.confirm(`¿Eliminar ${ids.length} artículo(s) seleccionado(s) del ranking? Esta acción no se puede deshacer.`)) return;
    setImporting(true);
    try {
      // Borrar en lotes para no exceder límites
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { error } = await supabase.from('product_rankings').delete().in('id', chunk);
        if (error) throw error;
      }
      setRkSelected(new Set());
      await fetchData();
    } catch (e: any) {
      alert('Error al eliminar: ' + (e.message || e));
    }
    setImporting(false);
  };

  // Descarga la planilla modelo con todas las columnas del ranking
  const downloadRankingTemplate = () => {
    const headers = ['Producto', 'Código', 'Rubro', 'Sucursal', 'Mes', 'Semana', 'Cantidad'];
    const ejemplo = [
      { 'Producto': 'LATTE', 'Código': '15', 'Rubro': 'INFUSIONES & CAFETERIA', 'Sucursal': 'CRAFT BARRIO SUR', 'Mes': '2026-06', 'Semana': 1, 'Cantidad': 120 },
      { 'Producto': 'MEDIALUNA DE MANTECA', 'Código': '76', 'Rubro': 'DULCES & PASTELERIA', 'Sucursal': 'CRAFT BARRIO SUR', 'Mes': '2026-06', 'Semana': 1, 'Cantidad': 80 },
    ];
    const ws = XLSX.utils.json_to_sheet(ejemplo, { header: headers });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ranking');
    XLSX.writeFile(wb, 'plantilla_ranking_articulos.xlsx');
  };

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
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    // Trabaja sobre las filas mostradas (displayedRecords) que estén seleccionadas.
    const rowsToDelete = displayedRecords.filter((r: any) => selectedRowIds.includes(r.id));
    if (rowsToDelete.length === 0) return;

    if (window.confirm(`¿Eliminar los ${rowsToDelete.length} registros seleccionados (por sucursal, fecha y turno)? Esta acción es irreversible.`)) {
      try {
        setLoading(true);
        let totalDeleted = 0;
        for (const r of rowsToDelete) {
          const esMañana = String(r.type).includes('Mañana');
          // Borrar por branch+date y filtrar el turno de forma flexible:
          // "Mañana" se borra como Mañana; cualquier otro turno (Tarde/Noche) se borra como NO-Mañana.
          for (const tabla of ['sales', 'sales_tickets']) {
            // Traer los shifts existentes de ese branch+date para decidir cuáles borrar
            const { data: existing } = await supabase
              .from(tabla)
              .select('id, shift')
              .eq('branch_id', r.branchId)
              .eq('date', r.date);
            if (existing && existing.length > 0) {
              const idsToDelete = existing
                .filter((row: any) => {
                  const rowEsMañana = String(row.shift || '').toLowerCase().includes('mañana') || String(row.shift || '').toLowerCase().includes('manana');
                  return esMañana ? rowEsMañana : !rowEsMañana;
                })
                .map((row: any) => row.id);
              // Borrar en chunks
              for (let i = 0; i < idsToDelete.length; i += 100) {
                const chunk = idsToDelete.slice(i, i + 100);
                if (chunk.length > 0) {
                  await supabase.from(tabla).delete().in('id', chunk);
                  totalDeleted += chunk.length;
                }
              }
            }
          }
        }
        setSelectedRowIds([]);
        await fetchData();
        alert(`¡Eliminación completada! Se borraron ${totalDeleted} registros.`);
      } catch (err: any) {
        console.error('Error deleting records:', err);
        alert('Error al eliminar los registros: ' + (err?.message || 'error'));
      } finally {
        setLoading(false);
      }
    }
  };

  const handleClearAllSales = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (window.confirm("⚠️ ADVERTENCIA DE CONTROL TOTAL ⚠️\n\n¿Está absolutamente seguro de que desea eliminar TODAS las ventas y rankings de artículos cargados en el sistema? Esto vaciará permanentemente las tablas de ventas para todos los locales sin poder recuperar los datos cargados. ¿Desea continuar?")) {
      if (window.confirm("CONFIRME DE NUEVO:\n\nEsta acción eliminará TODO el historial inmediatamente de Supabase. Si está importando una planilla de 6000 filas de nuevo, esta es la acción recomendada para iniciar desde cero sin duplicados. ¿Proceder con el vaciado total?")) {
        try {
          setLoading(true);
          
          // Delete all records from sales table
          const { error: salesError } = await supabase
            .from('sales')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
          if (salesError) throw salesError;

          // Delete all records from product_rankings table
          const { error: rankingsError } = await supabase
            .from('product_rankings')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000');
          if (rankingsError) {
            console.warn('Non-blocking ignore of product_rankings delete:', rankingsError);
          }

          setSelectedRowIds([]);
          await fetchData();
          alert('¡Base de datos limpiada con éxito! La tabla se encuentra vacía y lista para recibir la nueva carga de registros sin límites.');
        } catch (err: any) {
          console.error('Error vaciando base de datos:', err);
          alert(`Error al vaciar los registros de ventas: ${err.message || 'Error desconocido'}`);
        } finally {
          setLoading(false);
        }
      }
    }
  };

  const [chartMetric, setChartMetric] = useState<'net' | 'gross' | 'cash' | 'card' | 'qr'>('net');

  // Hourly analysis state
  const [hourFrom, setHourFrom] = useState<string>('00:00');
  const [hourTo, setHourTo] = useState<string>('23:59');
  // Applied values - only update when user clicks "Aplicar"
  const [appliedHourFrom, setAppliedHourFrom] = useState<string>('00:00');
  const [appliedHourTo, setAppliedHourTo] = useState<string>('23:59');

  // Helper: parse "HH:MM" to minutes
  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  // Tickets filtered by hour range - used in ALL charts and historial
  const filteredTicketsByHour = useMemo(() => {
    if (!allTicketsData || allTicketsData.length === 0) return [];
    const from = toMins(appliedHourFrom);
    const to = toMins(appliedHourTo);

    return allTicketsData.filter((t: any) => {
      const h = String(t.hour || '').substring(0, 5);
      if (!h || !h.includes(':')) return false;
      const mins = toMins(h);
      return mins >= from && mins <= to;
    });
  }, [allTicketsData, appliedHourFrom, appliedHourTo]);

  // Re-derive salesRecords from filtered tickets for charts and historial
  const hourFilteredSalesRecords = useMemo(() => {
    if (!filteredTicketsByHour.length) return salesRecords;

    // Apply branch/month filters
    const base = localBranchId !== 'all'
      ? filteredTicketsByHour.filter((t: any) => t.branch_id === localBranchId)
      : filteredTicketsByHour;
    const byMonth = filterMonth !== 'all'
      ? base.filter((t: any) => parseInt(String(t.date || '').substring(5,7)).toString() === filterMonth)
      : base;
    const byWeek = filterWeek !== 'all'
      ? byMonth.filter((t: any) => String(t.week_number) === filterWeek.replace('Semana ',''))
      : byMonth;

    // Group by branch+date+shift
    const ticketMap: Record<string, any[]> = {};
    byWeek.forEach((t: any) => {
      const shiftType = t.shift === 'Mañana' ? 'Turno Mañana' : 'Turno Tarde';
      const key = `${t.branch_id}|${t.date}|${shiftType}`;
      if (!ticketMap[key]) ticketMap[key] = [];
      ticketMap[key].push(t);
    });

    return Object.entries(ticketMap).map(([key, tickets]) => {
      const [branchId, date, type] = key.split('|');
      const first = tickets[0];
      let cashS = 0, cardS = 0, pyS = 0;
      tickets.forEach((t: any) => {
        const pm = String(t.payment_method || '');
        const amt = Number(t.gross_sales || 0);
        if (pm === 'Efectivo') cashS += amt;
        else if (pm === 'Pedidos Ya') pyS += amt;
        else cardS += amt; // Tarjetas/Bancos
      });
      // Órdenes: contar comprobantes ÚNICOS dentro del turno (un comprobante puede venir
      // en varias filas por distintos medios de pago = 1 sola orden). Un duplicado es mismo
      // comprobante en el mismo día/sucursal. Filas sin comprobante: respaldo con campo 'orders'.
      const compSet = new Set<string>();
      let ordersFallback = 0;
      tickets.forEach((t: any) => {
        const comp = (t.comprobante != null && String(t.comprobante).trim() !== '') ? String(t.comprobante).trim() : null;
        if (comp) compSet.add(`${t.branch_id}|${t.date}|${comp}`);
        else ordersFallback += Number(t.orders || 0);
      });
      const ordersCount = compSet.size + ordersFallback;
      return {
        id: `hf|${key}`,
        branchId, date,
        type: type as SaleType,
        pesos: tickets.reduce((s: number, t: any) => s + Number(t.gross_sales || 0), 0),
        netSales: tickets.reduce((s: number, t: any) => s + Number(t.net_sales || 0), 0),
        orders: ordersCount,
        covers: tickets.reduce((s: number, t: any) => s + Number(t.covers || 0), 0),
        iva: tickets.reduce((s: number, t: any) => s + Number(t.iva || 0), 0),
        projection: 0,
        week: `Semana ${first.week_number || 1}`,
        dayName: first.day_name || '',
        cash: cashS, card: cardS, qr: pyS,
        hora: String(first.hour || '').substring(0, 5),
        medioCobro: cashS >= cardS && cashS >= pyS ? 'Efectivo' : pyS >= cardS ? 'Pedidos Ya' : 'Tarjetas/Bancos',
        productRanking: []
      };
    });
  }, [filteredTicketsByHour, salesRecords, localBranchId, filterMonth, filterWeek]);

  // Aplica los filtros de columna del historial sobre la lista mostrada.
  const displayedRecords = useMemo(() => {
    return hourFilteredSalesRecords.filter((r: any) => {
      if (histFilters.branch !== 'all' && r.branchId !== histFilters.branch) return false;
      if (histFilters.week !== 'all' && String(r.week) !== histFilters.week) return false;
      if (histFilters.day !== 'all' && String(r.dayName) !== histFilters.day) return false;
      if (histFilters.shift !== 'all' && String(r.type) !== histFilters.shift) return false;
      if (histFilters.medio !== 'all' && String(r.medioCobro) !== histFilters.medio) return false;
      if (histFilters.date && String(r.date) !== histFilters.date) return false;
      return true;
    });
  }, [hourFilteredSalesRecords, histFilters]);

  // Opciones únicas para los selectores de filtro
  const histOptions = useMemo(() => ({
    weeks: Array.from(new Set(hourFilteredSalesRecords.map((r: any) => String(r.week)))).sort(),
    days: Array.from(new Set(hourFilteredSalesRecords.map((r: any) => String(r.dayName)).filter(Boolean))),
    shifts: Array.from(new Set(hourFilteredSalesRecords.map((r: any) => String(r.type)))),
    medios: Array.from(new Set(hourFilteredSalesRecords.map((r: any) => String(r.medioCobro)).filter(Boolean)))
  }), [hourFilteredSalesRecords]);

  // Selección basada en las filas mostradas (con filtros de columna aplicados)
  const allFilteredIds = useMemo(() => displayedRecords.map((r: any) => r.id), [displayedRecords]);
  const isAllSelected = useMemo(() => {
    if (allFilteredIds.length === 0) return false;
    return allFilteredIds.every(id => selectedRowIds.includes(id));
  }, [allFilteredIds, selectedRowIds]);
  const selectedFilteredCount = useMemo(() => {
    return displayedRecords.filter((r: any) => selectedRowIds.includes(r.id)).length;
  }, [displayedRecords, selectedRowIds]);


  // Chart Data: Weekday Sales (filtered by hour range)

  const groupedDailySales = useMemo(() => {
    const groups: Record<string, any> = {};
    
      hourFilteredSalesRecords.forEach(record => {
        const key = `${record.branchId}-${record.date}`;
        const dateObj = new Date(record.date);
        
        if (!groups[key]) {
          groups[key] = {
            id: key,
            branchId: record.branchId,
            date: record.date,
            // Calculate derive values from date
            week: record.week || calculateWeekFromDate(record.date),
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
        
        // Use pre-calculated payment breakdowns from ticket records
        g.cash += record.cash || 0;
        g.card += record.card || 0;
        g.qr += record.qr || 0;

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
    
    return hourFilteredSalesRecords.reduce((acc, curr) => {
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

  // Chart Data: Weekday Sales (filtered by hour range)
  const weekdayChartData = useMemo(() => {
    const weekdayLabels = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
    const dataMap: Record<string, number> = {};
    weekdayLabels.forEach(d => dataMap[d] = 0);

    hourFilteredSalesRecords.forEach(r => {
      const dateObj = new Date(r.date);
      const dayIndex = dateObj.getUTCDay();
      const targetIndex = dayIndex === 0 ? 6 : dayIndex - 1;
      const target = weekdayLabels[targetIndex];
      const val = chartMetric === 'net' ? r.netSales
                : chartMetric === 'gross' ? r.pesos
                : chartMetric === 'cash' ? r.cash
                : chartMetric === 'card' ? r.card
                : r.qr;
      if (target) dataMap[target] += val;
    });

    return weekdayLabels.map(name => ({ name, value: dataMap[name] }));
  }, [hourFilteredSalesRecords, chartMetric]);

  // Chart Data: Weekly Sales (filtered by hour range)
  const weeklyChartData = useMemo(() => {
    const weekMap: Record<string, number> = {};

    hourFilteredSalesRecords.forEach(r => {
      const week = r.week?.trim() || calculateWeekFromDate(r.date);
      const val = chartMetric === 'net' ? r.netSales
                : chartMetric === 'gross' ? r.pesos
                : chartMetric === 'cash' ? r.cash
                : chartMetric === 'card' ? r.card
                : r.qr;
      weekMap[week] = (weekMap[week] || 0) + val;
    });

    return Object.entries(weekMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  }, [hourFilteredSalesRecords, chartMetric]);

  // Hourly analysis table: filter sales_tickets by hour range
  const hourlyAnalysisData = useMemo(() => {
    if (!allTicketsData || allTicketsData.length === 0) return [];

    const fromMins = parseInt(appliedHourFrom.split(':')[0]) * 60 + parseInt(appliedHourFrom.split(':')[1]);
    const toMins = parseInt(appliedHourTo.split(':')[0]) * 60 + parseInt(appliedHourTo.split(':')[1]);

    // Filter tickets within the hour range
    const filtered = allTicketsData.filter((t: any) => {
      if (!t.hour) return false;
      const h = String(t.hour).substring(0, 5);
      const parts = h.split(':');
      if (parts.length < 2) return false;
      const mins = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      return mins >= fromMins && mins <= toMins;
    });

    // Apply current branch and month filters
    const branchFiltered = localBranchId !== 'all'
      ? filtered.filter((t: any) => t.branch_id === localBranchId)
      : filtered;
    const monthFiltered = filterMonth !== 'all'
      ? branchFiltered.filter((t: any) => {
          const tMonth = String(t.date || '').substring(5, 7);
          return parseInt(tMonth).toString() === filterMonth;
        })
      : branchFiltered;

    // Group by branch + day_name
    const byDay: Record<string, any> = {};
    const dayOrder = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
    
    monthFiltered.forEach((t: any) => {
      const day = t.day_name || '—';
      if (!byDay[day]) byDay[day] = { day, orders: 0, covers: 0, net: 0, gross: 0, count: 0 };
      byDay[day].orders += Number(t.orders || 0);
      byDay[day].covers += Number(t.covers || 0);
      byDay[day].net    += Number(t.net_sales || 0);
      byDay[day].gross  += Number(t.gross_sales || 0);
      byDay[day].count  += 1;
    });

    // Also compute totals row
    const rows = dayOrder
      .filter(d => byDay[d])
      .map(d => ({ ...byDay[d], ticketAvg: byDay[d].orders > 0 ? byDay[d].net / byDay[d].orders : 0 }));

    const total = rows.reduce((acc, r) => ({
      day: 'TOTAL',
      orders: acc.orders + r.orders,
      covers: acc.covers + r.covers,
      net: acc.net + r.net,
      gross: acc.gross + r.gross,
      count: acc.count + r.count,
      ticketAvg: 0
    }), { day: 'TOTAL', orders: 0, covers: 0, net: 0, gross: 0, count: 0, ticketAvg: 0 });
    total.ticketAvg = total.orders > 0 ? total.net / total.orders : 0;

    return [...rows, total];
  }, [allTicketsData, appliedHourFrom, appliedHourTo, localBranchId, filterMonth]);

  // ── Import full ticket detail from system export (SUCURSAL, FECHA, TURNO, HORA, CUBIERTOS, ORDENES, COBRO, Ventas Brutas, Ventas Netas, IVA)
  const handleImportTicketsExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // Build branch map from real branch data passed as props (uses actual Supabase IDs)
    const branchMap: Record<string, string> = {};
    branches.forEach(b => {
      const norm = b.name.toUpperCase().trim();
      branchMap[norm] = b.id;
      // Also map common aliases
      if (norm.includes('BARRIO NORTE')) {
        branchMap['CRAFT BARRIO NORTE'] = b.id;
        branchMap['CRAFT BNORTE'] = b.id;
        branchMap['BNORTE'] = b.id;
      }
      if (norm.includes('BARRIO SUR')) {
        branchMap['CRAFT BARRIO SUR'] = b.id;
        branchMap['CRAFT BSUR'] = b.id;
        branchMap['BSUR'] = b.id;
      }
      if (norm.includes('CASCO VIEJO') || norm.includes('MERCATO')) {
        branchMap['CRAFT CASCO VIEJO'] = b.id;
        branchMap['CRAFT MERCATO'] = b.id;
      }
      if (norm.includes('PERON') || norm.includes('PERÓN')) {
        branchMap['CRAFT PERON'] = b.id;
        branchMap['CRAFT PERÓN'] = b.id;
      }
      if (norm.includes('MATE DE LUNA') || norm.includes('MATE')) {
        branchMap['CRAFT MATE DE LUNA'] = b.id;
        branchMap['CRAFT SHELL'] = b.id;
        branchMap['SHELL'] = b.id;
      }
    });
    const shiftMap: Record<string, string> = {
      'MED': 'Mañana', 'NOC': 'Noche', 'NOC ': 'Noche'
    };
    const normalizePayment = (c: string): string => {
      const u = c.toUpperCase().trim();
      // EFECTIVO
      if (u === 'EFECTIVO' || u === 'CASH' || u.startsWith('EFECTIVO')) return 'Efectivo';
      // PEDIDOS YA - todos los variantes del agregador
      if (
        u.includes('PEYA') ||
        u.includes('PED YA') ||
        u.includes('PAGO ONLINE') ||
        u.includes('PEDIDOS YA') ||
        u.includes('PEDIDOSYA') ||
        u === 'PEDIDOS' ||
        u.startsWith('PEDIDOS')
      ) return 'Pedidos Ya';
      // TARJETAS/BANCOS - AMEX, AMERICAN EXPRESS, CABAL, MASTER, MASTERCARD,
      // NARANJA, QR, VISA, VISA DEBITO, TRANSF. BRIA, FCB, NCB, TIC
      return 'Tarjetas/Bancos';
    };

    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array', cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];
      // raw:true + cellDates:false: everything stays as raw values
      // FECHA = Excel serial number (e.g. 46113), HORA = fraction (e.g. 0.3527=8:28)
      // Ventas = raw number (e.g. 24650) - no Date conversion, no timezone issues
      const rows = XLSX.utils.sheet_to_json(ws, { raw: true }) as any[];

      const dias = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
      const tickets: any[] = [];

      for (const row of rows) {
        const sucursal = String(row['SUCURSAL'] || '').trim().toUpperCase();
        const branchId = branchMap[sucursal];
        if (!branchId) continue;

        // Parse date: with cellDates:false, FECHA is Excel serial number (e.g. 46113)
        // Excel epoch: 1899-12-30. Formula: serial-25569 days from Unix epoch (1970-01-01)
        let dateStr = '';
        const rawDate = row['FECHA'];
        if (typeof rawDate === 'number') {
          // Convert Excel serial to ISO date using UTC to avoid timezone shifts
          const msFromEpoch = Math.round((rawDate - 25569) * 86400 * 1000);
          const d = new Date(msFromEpoch);
          const y = d.getUTCFullYear();
          const m = String(d.getUTCMonth() + 1).padStart(2, '0');
          const day = String(d.getUTCDate()).padStart(2, '0');
          dateStr = `${y}-${m}-${day}`;
        } else if (typeof rawDate === 'string') {
          // Fallback for pre-formatted strings
          const s = rawDate.trim();
          if (s.match(/^\d{4}-\d{2}-\d{2}/)) {
            dateStr = s.substring(0, 10);
          } else if (s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)) {
            // DD/MM/YYYY format (Argentine)
            const parts = s.split('/');
            dateStr = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
          }
        }
        if (!dateStr || dateStr.length < 10) continue;

        // Parse hour: with cellDates:false + raw:true, HORA is a fraction (0.35277 = 8:28)
        let hourStr = '00:00';
        const rawHour = row['HORA'];
        if (typeof rawHour === 'number') {
          // Works for both time fractions (0-1) and full datetime serials
          const timeFraction = rawHour % 1; // Get just the time part
          const totalMins = Math.round(timeFraction * 1440);
          hourStr = `${String(Math.floor(totalMins / 60) % 24).padStart(2,'0')}:${String(totalMins % 60).padStart(2,'0')}`;
        } else if (typeof rawHour === 'string' && rawHour.includes(':')) {
          hourStr = rawHour.substring(0, 5);
        }

        const d = new Date(dateStr + 'T12:00:00');
        const dayName = dias[d.getDay()];
        // Always calculate week from date (1-7=S1, 8-14=S2, 15-21=S3, 22+=S4) - never trust Excel's SEMANA column
        const dayOfMonth = d.getDate();
        const weekNum = dayOfMonth <= 7 ? 1 : dayOfMonth <= 14 ? 2 : dayOfMonth <= 21 ? 3 : 4;
        const shift = shiftMap[String(row['TURNO'] || '').toUpperCase().trim()] || 'Mañana';
        const month = dateStr.substring(0, 7);

        // Find columns trimming spaces (Excel columns may have extra spaces)
        const allRowKeys = Object.keys(row);
        const findCol = (name: string) => {
          const n = name.trim().toLowerCase();
          // 1) coincidencia exacta
          const exact = allRowKeys.find(k => k.trim().toLowerCase() === n);
          if (exact) return exact;
          // 2) que la columna contenga el nombre buscado (ej "MEDIO COBRO" contiene "cobro")
          const contains = allRowKeys.find(k => k.trim().toLowerCase().includes(n));
          return contains || name;
        };
        const brutasKey = findCol('Ventas Brutas');
        const netasKey = findCol('Ventas Netas');
        const ivaKey = findCol('IVA');
        const cubiertosKey = findCol('CUBIERTOS');
        const ordenesKey = findCol('ORDENES');
        const cobroKey = findCol('COBRO');
        // El comprobante viene con encabezado "N° COMP" (puede variar el símbolo: N°, Nº, N).
        // Buscamos de forma robusta: cualquier columna que contenga "comp", priorizando las
        // que además empiecen con "n" (N° COMP / NRO COMP), y con respaldos por si cambia.
        const findComprobanteCol = () => {
          const keys = allRowKeys.map(k => ({ raw: k, norm: k.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '') }));
          // 1) empieza con "n" y contiene "comp"  → "n° comp", "nro comp", "n comp"
          let f = keys.find(k => /^n.*comp/.test(k.norm));
          if (f) return f.raw;
          // 2) contiene "comprobante"
          f = keys.find(k => k.norm.includes('comprobante'));
          if (f) return f.raw;
          // 3) contiene "comp" o "ticket"
          f = keys.find(k => k.norm.includes('comp') || k.norm.includes('ticket'));
          return f ? f.raw : null;
        };
        const comprobanteKey = findComprobanteCol();
        const comprobanteVal = comprobanteKey && row[comprobanteKey] != null ? String(row[comprobanteKey]).trim() : '';

        tickets.push({
          id: `tk-${Date.now()}-${Math.random().toString(36).substr(2,8)}`,
          branch_id: branchId,
          date: dateStr,
          month,
          week_number: weekNum,
          day_name: dayName,
          shift,
          hour: hourStr,
          covers: Math.round(Number(row[cubiertosKey] || 0)),
          orders: Math.round(Number(row[ordenesKey] || 0)),
          comprobante: comprobanteVal || null,
          payment_method: normalizePayment(String(row[cobroKey] || '')),
          gross_sales: Math.round((Number(row[brutasKey]) || 0) * 100) / 100,
          net_sales: Math.round((Number(row[netasKey]) || 0) * 100) / 100,
          iva: Math.round((Number(row[ivaKey]) || 0) * 100) / 100,
        });
      }

      if (!tickets.length) {
        alert('No se encontraron filas válidas. Verificá que el archivo tenga las columnas: SUCURSAL, FECHA, TURNO, HORA, CUBIERTOS, ORDENES, COBRO, Ventas Brutas, Ventas Netas, IVA');
        setLoading(false);
        return;
      }

      // Resumen para confirmar antes de subir: mes(es), semana(s), sucursales y rango de fechas.
      const fechasUnicas = [...new Set(tickets.map(t => t.date))].sort();
      const mesesSet = [...new Set(tickets.map(t => t.month))].sort();
      const semanasSet = [...new Set(tickets.map(t => t.week_number))].sort((a, b) => a - b);
      const branchIdsResumen = [...new Set(tickets.map(t => t.branch_id))];
      const nombrePorId: Record<string, string> = {};
      branches.forEach(b => { nombrePorId[b.id] = b.name; });
      const sucursalesNombres = branchIdsResumen.map(id => nombrePorId[id] || id);
      const mesesTxt = mesesSet.join(', ');
      const semanasTxt = semanasSet.map(s => `S${s}`).join(', ');
      const rangoTxt = fechasUnicas.length === 1
        ? fechasUnicas[0]
        : `${fechasUnicas[0]} a ${fechasUnicas[fechasUnicas.length - 1]}`;

      const confirmMsg =
        `Vas a importar ${tickets.length.toLocaleString()} tickets con estos datos:\n\n` +
        `• Mes: ${mesesTxt}\n` +
        `• Semana(s): ${semanasTxt}\n` +
        `• Sucursal(es): ${sucursalesNombres.join(', ')}\n` +
        `• Fechas: ${rangoTxt} (${fechasUnicas.length} día/s)\n\n` +
        `⚠️ Se REEMPLAZARÁN los tickets que ya existan de esas sucursales en esos días.\n\n` +
        `¿Confirmás la importación?`;

      if (!window.confirm(confirmMsg)) {
        setLoading(false);
        return;
      }

      // Borra solo los DÍAS que vienen en este archivo (no el mes completo),
      // para no pisar ventas de otras semanas ya cargadas.
      const fechasArchivo = [...new Set(tickets.map(t => t.date))];
      const branchIds = [...new Set(tickets.map(t => t.branch_id))];

      for (const branchId of branchIds) {
        // .in() en lotes para no exceder límites de URL si hay muchas fechas
        for (let i = 0; i < fechasArchivo.length; i += 100) {
          const chunk = fechasArchivo.slice(i, i + 100);
          await supabase.from('sales_tickets').delete()
            .eq('branch_id', branchId)
            .in('date', chunk);
        }
      }

      // Insert in batches of 500
      let inserted = 0;
      const batchSize = 500;
      for (let i = 0; i < tickets.length; i += batchSize) {
        const batch = tickets.slice(i, i + batchSize);
        const { error } = await supabase.from('sales_tickets').insert(batch);
        if (error) throw error;
        inserted += batch.length;
      }

      // Also update aggregated sales table (branch+date+type totals)
      // Group tickets by branch_id + date + shift
      const aggMap: Record<string, any> = {};
      for (const t of tickets) {
        const shiftType = t.shift === 'Mañana' ? 'Turno Mañana' : 'Turno Tarde';
        const key = `${t.branch_id}|${t.date}|${shiftType}`;
        if (!aggMap[key]) {
          aggMap[key] = {
            id: crypto.randomUUID(),
            branch_id: t.branch_id,
            date: t.date,
            type: shiftType,
            pesos: 0, net_sales: 0, orders: 0, covers: 0, iva: 0,
            week: `Semana ${t.week_number}`,
            day_name: t.day_name.substring(0, 3).toLowerCase(),
            cash: 0, card: 0, qr: 0, projection: 0,
            product_ranking: []
          };
        }
        aggMap[key].pesos       = Math.round((aggMap[key].pesos + t.gross_sales) * 100) / 100;
        aggMap[key].net_sales   = Math.round((aggMap[key].net_sales + t.net_sales) * 100) / 100;
        aggMap[key].orders      += t.orders;
        aggMap[key].covers      += t.covers;
        aggMap[key].iva         = Math.round((aggMap[key].iva + t.iva) * 100) / 100;
      }
      const aggRecords = Object.values(aggMap);

      // Borra los agregados solo de los DÍAS del archivo (no del mes completo)
      for (const branchId of branchIds) {
        for (let i = 0; i < fechasArchivo.length; i += 100) {
          const chunk = fechasArchivo.slice(i, i + 100);
          await supabase.from('sales').delete()
            .eq('branch_id', branchId)
            .in('date', chunk);
        }
      }
      let aggErrors = 0;
      for (let i = 0; i < aggRecords.length; i += 200) {
        const { error } = await supabase.from('sales').insert(aggRecords.slice(i, i + 200));
        if (error) { console.warn('Error saving aggregated sales:', error.message); aggErrors++; }
      }

      const fechasOrden = [...fechasArchivo].sort();
      const rangoFechas = fechasOrden.length === 1
        ? fechasOrden[0]
        : `${fechasOrden[0]} a ${fechasOrden[fechasOrden.length - 1]}`;

      if (aggErrors > 0) {
        alert(`✅ ${inserted.toLocaleString()} tickets importados (${rangoFechas}).\n\n⚠️ Atención: hubo un problema al actualizar el resumen de ventas (${aggErrors} lote/s). Los tickets se guardaron, pero algunos reportes que usan el resumen podrían no reflejarlo. Reintentá la importación si notás diferencias.`);
      } else {
        alert(`✅ ${inserted.toLocaleString()} tickets importados correctamente (${rangoFechas})`);
      }
    } catch (err: any) {
      console.error('Error importando tickets:', err);
      alert(`Error al importar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportRankingExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws) as any[];

      // Map columns: Código, Nombre, Cantidad, Rubro de la Carta
      const clean = (v: any) => (v === undefined || v === null) ? '' : v.toString().trim();
      const entries = data.map(row => ({
        product_code: clean(row.Código || row.Codigo || row['Cód. Artículo'] || row['Cod. Artículo'] || row['Cód. Articulo'] || row.Code || row.id),
        product_name: clean(row.Nombre || row.Name || row.Producto || row['Artículo'] || row.Articulo),
        quantity: Number(row.Cantidad || row.Quantity || row.Cant || 0),
        category: clean(row['Rubro de la Carta'] || row.Rubro || row.Categoria || row['Categoría'] || row.Category)
      })).filter(e => e.product_name && e.quantity > 0);

      const now = new Date();
      const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      setRankingToImport({
        branchId: selectedBranchId === 'all' ? (branches[0]?.id || '') : selectedBranchId,
        month: defaultMonth,
        week: 1,
        entries
      });
      setIsImportingRanking(true);
    };
    reader.readAsBinaryString(file);
  };

  const confirmRankingImport = async () => {
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    if (!rankingToImport) return;

    // Confirmación explícita antes de guardar
    const branchName = branches.find(b => b.id === rankingToImport.branchId)?.name || rankingToImport.branchId;
    const [y, mo] = rankingToImport.month.split('-');
    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    const monthLabel = `${monthNames[Number(mo) - 1] || mo} ${y || ''}`.trim();
    const ok = window.confirm(
      `¿Estás seguro que deseas importar el ranking para la sucursal ${branchName}, mes ${monthLabel}, semana ${rankingToImport.week}?\n\n` +
      `Se cargarán ${rankingToImport.entries.length} artículos. Si ya existía un ranking para ese período, será reemplazado.`
    );
    if (!ok) return;

    setImporting(true);
    try {
      // Reemplazar: borrar lo existente de esta sucursal + mes + semana
      const { error: delError } = await supabase
        .from('product_rankings')
        .delete()
        .eq('branch_id', rankingToImport.branchId)
        .eq('month', rankingToImport.month)
        .eq('week_number', rankingToImport.week);
      if (delError) throw delError;

      const rows = rankingToImport.entries.map(e => ({
        branch_id: rankingToImport.branchId,
        month: rankingToImport.month,
        week_number: rankingToImport.week,
        product_code: e.product_code,
        product_name: e.product_name,
        quantity: e.quantity,
        category: e.category || null
      }));

      const { error } = await supabase.from('product_rankings').insert(rows);
      if (error) throw error;

      setIsImportingRanking(false);
      setRankingToImport(null);
      fetchData();
    } catch (err: any) {
      console.error('Error importing ranking:', err);
      alert('Error al importar el ranking: ' + (err?.message || 'error desconocido'));
    } finally {
      setImporting(false);
    }
  };

  const handleExportRankingTemplate = () => {
    const templateData = [
      {
        Código: '15',
        Nombre: 'LATTE',
        Cantidad: 1818,
        'Rubro de la Carta': 'INFUSIONES & CAFETERIA'
      },
      {
        Código: '76',
        Nombre: 'MEDIALUNA DE MANTECA',
        Cantidad: 1197,
        'Rubro de la Carta': 'DULCES & PASTELERIA'
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

              // Guard check for US vs Spanish / DD-MM vs MM-DD swap in SheetJS parsing
              if (!matchLoc && !matchUTC) {
                const swappedLocWeekday = getWeekdayFromParsedDate(yyyyLoc, ddLoc, mmLoc); // Swap dd and mm
                if (weekdayMatches(swappedLocWeekday, rowDayVal)) {
                  return `${yyyyLoc}-${String(ddLoc).padStart(2, '0')}-${String(mmLoc).padStart(2, '0')}`;
                }
                const swappedUTCWeekday = getWeekdayFromParsedDate(yyyyUTC, ddUTC, mmUTC); // Swap dd and mm
                if (weekdayMatches(swappedUTCWeekday, rowDayVal)) {
                  return `${yyyyUTC}-${String(ddUTC).padStart(2, '0')}-${String(mmUTC).padStart(2, '0')}`;
                }
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
        // 1. Find branch mapping - utilizing robust abbreviation and keyword matching helpers
        const excelBranch = getValue(row, 'Sucursal') || getValue(row, 'Branch');
        const targetBranchId = findBestBranchMatch(excelBranch, branches, selectedBranchId);

        // Si la sucursal no corresponde a ninguna conocida (ej: CRAFT FLIP), descartar la fila.
        if (!targetBranchId) return;

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

        // Do not scale real transaction figures under 3000 ARS/USD to prevent numeric corruption.

        const orders = parseInteger(getValue(row, 'Ordenes') || getValue(row, 'Orders') || getValue(row, 'Tickets') || 0);
        const covers = parseInteger(getValue(row, 'Cubiertos') || getValue(row, 'Covers') || 0);

        const rowWeek = getValue(row, 'Semana') || getValue(row, 'Week');
        const weekVal = getExcelOrCalculatedWeek(rowWeek, date);

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
    if (isReadOnly) { alert('Tu rol tiene acceso de SOLO LECTURA. No podés modificar datos en este módulo.'); return; }
    setLoading(true);
    try {
      // Prevent duplicates by deleting existing records for standard branch and dates in our list
      const uniqueBranchDates = Array.from(
        new Set(records.map(r => `${r.branch_id}|${r.date}`))
      );

      // Perform deletions concurrently in parallel batches to prevent sequence bottlenecks
      const deletePromises = uniqueBranchDates.map(async (item) => {
        const [bId, dVal] = item.split('|');
        const { error } = await supabase.from('sales').delete().eq('branch_id', bId).eq('date', dVal);
        if (error) throw error;
      });
      await Promise.all(deletePromises);

      // Chunk the inserts to prevent HTTP payload size timeouts/PostgREST/Kong limits
      const chunkSize = 400;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        let { error } = await supabase.from('sales').insert(chunk);
        
        if (error && (error.message.includes('day_name') || error.message.includes('week'))) {
          console.warn('Retrying insert without day_name/week columns due to schema cache error...');
          const cleaned = chunk.map(r => {
            const { day_name, week, ...rest } = r;
            return rest;
          });
          const result = await supabase.from('sales').insert(cleaned);
          error = result.error;
        }

        if (error) {
          console.error('Supabase Error details in chunk:', error);
          throw error;
        }
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
    const branchName = branches.find(b => b.id === selectedBranchId)?.name || 'Barrio Norte';
    const templateData = [
      {
        SUCURSAL: branchName,
        FECHA: '01-04-2026',
        SEMANA: 'Semana 1',
        DIA: 'Mie',
        TURNO: 'Turno Mañana',
        HORA: '08:00',
        COMPROBANTE: '0001-00012345',
        ORDENES: 1,
        CUBIERTOS: 2,
        'MEDIO COBRO': 'Efectivo',
        'VENTAS BRUTAS': 2143397.87,
        'VENTAS NETAS': 1863684.75,
        IVA: 279713.12
      },
      {
        SUCURSAL: branchName,
        FECHA: '01-04-2026',
        SEMANA: 'Semana 1',
        DIA: 'Mie',
        TURNO: 'Turno Mañana',
        HORA: '12:00',
        COMPROBANTE: '0001-00012346',
        ORDENES: 1,
        CUBIERTOS: 3,
        'MEDIO COBRO': 'Tarjeta',
        'VENTAS BRUTAS': 3215096.81,
        'VENTAS NETAS': 2795527.13,
        IVA: 419569.68
      },
      {
        SUCURSAL: branchName,
        FECHA: '01-04-2026',
        SEMANA: 'Semana 1',
        DIA: 'Mie',
        TURNO: 'Turno Tarde',
        HORA: '21:30',
        COMPROBANTE: '0001-00012347',
        ORDENES: 1,
        CUBIERTOS: 4,
        'MEDIO COBRO': 'Efectivo',
        'VENTAS BRUTAS': 1000000,
        'VENTAS NETAS': 869565.22,
        IVA: 130434.78
      },
      {
        SUCURSAL: branchName,
        FECHA: '01-04-2026',
        SEMANA: 'Semana 1',
        DIA: 'Mie',
        TURNO: 'Turno Tarde',
        HORA: '21:30',
        COMPROBANTE: '0001-00012347',
        ORDENES: 0,
        CUBIERTOS: 0,
        'MEDIO COBRO': 'Tarjeta',
        'VENTAS BRUTAS': 500000,
        'VENTAS NETAS': 434782.61,
        IVA: 65217.39
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
            <>
              <label className="bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-6 py-2 rounded text-[10px] font-black uppercase tracking-widest cursor-pointer transition-all flex items-center justify-center gap-2" title="Importa el detalle completo de tickets para análisis por hora, día y medio de cobro">
                <FileUp size={16} /> IMPORTAR TICKETS DETALLE
                <input 
                  type="file" 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                  onChange={handleImportTicketsExcel}
                />
              </label>
              <button 
                onClick={handleClearAllSales}
                className="bg-red-950/40 hover:bg-red-900/50 border border-red-500/30 text-red-400 px-6 py-2 rounded text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm active:scale-95"
                title="Eliminar absolutamente todo el historial de ventas cargado"
              >
                <Trash2 size={16} /> VACIAR BASE DE VENTAS
              </button>
            </>
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
          <SalesByBranchTable branches={branches} />
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
            <select
              value={localBranchId}
              onChange={(e) => setLocalBranchId(e.target.value)}
              className="w-full px-3 py-2 bg-bg-accent border border-border-dim rounded text-text-main text-[10px] font-bold uppercase outline-none focus:border-brand-500 cursor-pointer"
            >
              <option value="all">CONSOLIDADO (TODAS)</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>
              ))}
            </select>
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
            </select>
          </div>

          <button 
            onClick={() => {
              setFilterMonth('all');
              setFilterWeek('all');
              setHourFrom('00:00');
              setHourTo('23:59');
              setAppliedHourFrom('00:00');
              setAppliedHourTo('23:59');
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
                      formatter={(val: number) => {
                        const labels: Record<string,string> = { net: 'Ventas Netas', gross: 'Ventas Brutas', cash: 'Efectivo', card: 'Tarjetas/Bancos', qr: 'Pedidos Ya' };
                        return [`$${val.toLocaleString()}`, labels[chartMetric] || chartMetric];
                      }}
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
                      formatter={(val: number) => {
                        const labels: Record<string,string> = { net: 'Ventas Netas', gross: 'Ventas Brutas', cash: 'Efectivo', card: 'Tarjetas/Bancos', qr: 'Pedidos Ya' };
                        return [`$${val.toLocaleString()}`, labels[chartMetric] || chartMetric];
                      }}
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

      {/* Hourly Analysis Table */}
      <div className="bg-bg-sidebar border border-border-dim rounded overflow-hidden">
        <div className="bg-bg-accent px-4 py-3 border-b border-border-dim flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-brand-500" />
            <h3 className="text-[10px] font-black uppercase tracking-widest text-text-main">Análisis por Franja Horaria</h3>
            <span className="text-[9px] text-text-dim font-bold">({hourlyAnalysisData.filter(r => r.day !== 'TOTAL').length} días con datos)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black text-text-dim uppercase">Desde</span>
            <input
              type="time"
              value={hourFrom}
              onChange={e => setHourFrom(e.target.value)}
              className="bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[10px] font-mono text-text-main outline-none focus:border-amber-500"
            />
            <span className="text-[9px] text-text-dim font-black">–</span>
            <input
              type="time"
              value={hourTo}
              onChange={e => setHourTo(e.target.value)}
              className="bg-bg-card border border-border-dim rounded px-2 py-1.5 text-[10px] font-mono text-text-main outline-none focus:border-amber-500"
            />
            <button
              onClick={() => { setAppliedHourFrom(hourFrom); setAppliedHourTo(hourTo); }}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black text-[9px] font-black uppercase tracking-widest rounded transition-all"
            >
              Aplicar
            </button>
          </div>
        </div>
        {hourlyAnalysisData.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr className="border-b border-border-dim bg-bg-accent/50">
                  <th className="px-4 py-2.5 text-left font-black uppercase text-text-dim tracking-wider">Día</th>
                  <th className="px-4 py-2.5 text-right font-black uppercase text-text-dim tracking-wider">Tickets</th>
                  <th className="px-4 py-2.5 text-right font-black uppercase text-text-dim tracking-wider">Órdenes</th>
                  <th className="px-4 py-2.5 text-right font-black uppercase text-text-dim tracking-wider">Cubiertos</th>
                  <th className="px-4 py-2.5 text-right font-black uppercase text-text-dim tracking-wider">V. Brutas</th>
                  <th className="px-4 py-2.5 text-right font-black uppercase text-text-dim tracking-wider">V. Netas</th>
                  <th className="px-4 py-2.5 text-right font-black uppercase text-text-dim tracking-wider">Ticket Prom.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-dim/30">
                {hourlyAnalysisData.map((row, i) => {
                  const isTotal = row.day === 'TOTAL';
                  return (
                    <tr key={i} className={isTotal ? 'bg-brand-500/10 border-t-2 border-brand-500/30 font-black' : 'hover:bg-bg-accent/30'}>
                      <td className={`px-4 py-2.5 font-black uppercase ${isTotal ? 'text-brand-500' : 'text-text-main'}`}>{row.day}</td>
                      <td className="px-4 py-2.5 text-right text-text-dim">{row.count.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-text-main">{row.orders.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-text-main">{row.covers.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right text-text-dim">${Math.round(row.gross).toLocaleString('es-AR')}</td>
                      <td className={`px-4 py-2.5 text-right ${isTotal ? 'text-brand-500' : 'text-teal-400'}`}>${Math.round(row.net).toLocaleString('es-AR')}</td>
                      <td className="px-4 py-2.5 text-right text-text-dim">${Math.round(row.ticketAvg).toLocaleString('es-AR')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-text-dim text-[10px] uppercase font-black">
            Sin datos para el rango {hourFrom} – {hourTo}. Importá tickets para ver el análisis.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <div className="bg-bg-sidebar border border-border-dim rounded overflow-hidden">
            <div className="bg-bg-accent p-4 border-b border-border-dim flex justify-between items-center bg-zinc-950/20">
               <div className="flex items-center gap-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-text-main">Historial de Ventas Diario</h3>
                  {selectedFilteredCount > 0 ? (
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
                  ) : (
                    <button
                      onClick={handleClearAllSales}
                      className="flex items-center gap-1 bg-red-950/40 hover:bg-red-900/50 border border-red-500/20 text-red-400 font-bold uppercase tracking-widest px-2.5 py-1 rounded text-[8px] cursor-pointer transition-all active:scale-95 shadow-sm"
                      title="Eliminar absolutamente todo el historial de ventas del sistema"
                    >
                      <Trash2 size={10} /> Vaciar Todo el Historial
                    </button>
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
                  <tr className="bg-bg-sidebar border-b border-border-dim">
                    <th className="px-2 py-2"></th>
                    <th className="px-2 py-2">
                      <select value={histFilters.branch} onChange={e => setHistFilters({ ...histFilters, branch: e.target.value })} className="w-full bg-bg-card border border-border-dim rounded px-1 py-1 text-[8px] font-normal normal-case">
                        <option value="all">Todas</option>
                        {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </th>
                    <th className="px-2 py-2">
                      <input type="date" value={histFilters.date} onChange={e => setHistFilters({ ...histFilters, date: e.target.value })} className="w-full bg-bg-card border border-border-dim rounded px-1 py-1 text-[8px] font-mono" />
                    </th>
                    <th className="px-2 py-2">
                      <select value={histFilters.week} onChange={e => setHistFilters({ ...histFilters, week: e.target.value })} className="w-full bg-bg-card border border-border-dim rounded px-1 py-1 text-[8px] font-normal normal-case">
                        <option value="all">Todas</option>
                        {histOptions.weeks.map(w => <option key={w} value={w}>{w}</option>)}
                      </select>
                    </th>
                    <th className="px-2 py-2">
                      <select value={histFilters.day} onChange={e => setHistFilters({ ...histFilters, day: e.target.value })} className="w-full bg-bg-card border border-border-dim rounded px-1 py-1 text-[8px] font-normal normal-case">
                        <option value="all">Todos</option>
                        {histOptions.days.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </th>
                    <th className="px-2 py-2">
                      <select value={histFilters.shift} onChange={e => setHistFilters({ ...histFilters, shift: e.target.value })} className="w-full bg-bg-card border border-border-dim rounded px-1 py-1 text-[8px] font-normal normal-case">
                        <option value="all">Todos</option>
                        {histOptions.shifts.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </th>
                    <th className="px-2 py-2"></th>
                    <th className="px-2 py-2"></th>
                    <th className="px-2 py-2"></th>
                    <th className="px-2 py-2">
                      <select value={histFilters.medio} onChange={e => setHistFilters({ ...histFilters, medio: e.target.value })} className="w-full bg-bg-card border border-border-dim rounded px-1 py-1 text-[8px] font-normal normal-case">
                        <option value="all">Todos</option>
                        {histOptions.medios.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </th>
                    <th className="px-2 py-2"></th>
                    <th className="px-2 py-2"></th>
                    <th className="px-2 py-2"></th>
                    <th className="px-2 py-2">
                      {(histFilters.branch !== 'all' || histFilters.week !== 'all' || histFilters.day !== 'all' || histFilters.shift !== 'all' || histFilters.medio !== 'all' || histFilters.date) && (
                        <button onClick={() => setHistFilters({ branch: 'all', week: 'all', day: 'all', shift: 'all', medio: 'all', date: '' })} className="text-[8px] font-black uppercase text-brand-500 hover:text-brand-600 whitespace-nowrap">Limpiar</button>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-dim font-medium">
                  {displayedRecords.length === 0 ? (
                    <tr>
                      <td colSpan={14} className="px-6 py-20 text-center text-text-dim italic uppercase opacity-50">
                        No hay registros cargados para este periodo
                      </td>
                    </tr>
                  ) : (
                    displayedRecords.map((record) => {
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

              <div className="md:col-span-3 space-y-6">
                 <MonthlyRankingTop branches={branches} />

                 <div className="bg-bg-sidebar border border-border-dim rounded overflow-hidden">
                    <div className="bg-bg-accent p-4 border-b border-border-dim flex justify-between items-center">
                       <h3 className="text-[10px] font-black uppercase tracking-widest text-text-main">Ranking de Artículos por Sucursal</h3>
                       <div className="flex items-center gap-3">
                          {rkSelected.size > 0 && !isReadOnly && (
                            <button onClick={deleteSelectedRankings}
                              className="flex items-center gap-1 bg-red-500/10 text-red-500 border border-red-500/30 px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all">
                              <Trash2 size={12} /> Eliminar ({rkSelected.size})
                            </button>
                          )}
                          <button onClick={downloadRankingTemplate}
                            className="flex items-center gap-1 bg-bg-card text-text-dim border border-border-dim px-3 py-1.5 rounded text-[9px] font-black uppercase tracking-widest hover:text-emerald-500 transition-all">
                            <FileDown size={12} /> Plantilla modelo
                          </button>
                          <span className="text-[9px] font-bold text-text-dim uppercase">Mostrando: {selectedBranchId === 'all' ? 'Todas las Sucursales' : branches.find(b => b.id === selectedBranchId)?.name}</span>
                          {loading && (
                            <span className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-brand-500">
                              <Loader2 className="animate-spin" size={14} /> Cargando…
                            </span>
                          )}
                       </div>
                    </div>
                    <div className="overflow-x-auto relative min-h-[200px]">
                       {loading && (
                         <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-bg-sidebar/70 backdrop-blur-sm">
                            <Loader2 className="animate-spin text-brand-500" size={48} />
                            <p className="mt-3 text-brand-500 text-[11px] font-black uppercase tracking-widest">Cargando datos, aguarde…</p>
                         </div>
                       )}
                       <table className="w-full border-collapse text-[10px]">
                          <thead>
                             <tr className="bg-bg-card border-b border-border-dim text-left text-text-dim font-bold uppercase tracking-widest">
                                <th className="px-3 py-4 text-center">
                                   <input type="checkbox" checked={rkAllFilteredSelected} onChange={toggleRkSelectAll}
                                     className="w-3.5 h-3.5 accent-brand-500 cursor-pointer" title="Seleccionar todos los filtrados" />
                                </th>
                                <th className="px-4 py-4 text-center">#</th>
                                <th className="px-6 py-4">Producto</th>
                                <th className="px-4 py-4 text-center">Código</th>
                                <th className="px-4 py-4">Rubro</th>
                                <th className="px-4 py-4 text-center">Sucursal</th>
                                <th className="px-4 py-4 text-center">Mes / Semana</th>
                                <th className="px-4 py-4 text-right">Cantidad</th>
                                <th className="px-6 py-4"></th>
                             </tr>
                             <tr className="bg-bg-sidebar border-b border-border-dim">
                                <th className="px-2 py-2"></th>
                                <th className="px-2 py-2"></th>
                                <th className="px-3 py-2">
                                   <input
                                     value={rkFilterProduct}
                                     onChange={(e) => setRkFilterProduct(e.target.value)}
                                     placeholder="Buscar…"
                                     className="w-full bg-bg-card border border-border-dim rounded px-2 py-1 text-[9px] font-normal normal-case text-text-main placeholder:text-text-dim/50"
                                   />
                                </th>
                                <th className="px-3 py-2">
                                   <input
                                     value={rkFilterCode}
                                     onChange={(e) => setRkFilterCode(e.target.value)}
                                     placeholder="Cód…"
                                     className="w-full bg-bg-card border border-border-dim rounded px-2 py-1 text-[9px] font-normal normal-case text-text-main placeholder:text-text-dim/50 text-center"
                                   />
                                </th>
                                <th className="px-3 py-2">
                                   <CategoryMultiSelect
                                     options={rkCategoryOptions}
                                     selected={rkFilterCategories}
                                     onChange={setRkFilterCategories}
                                     labelAll="Todos"
                                   />
                                </th>
                                <th className="px-3 py-2">
                                   <select value={rkFilterBranch} onChange={(e) => setRkFilterBranch(e.target.value)}
                                     className="w-full bg-bg-card border border-border-dim rounded px-2 py-1 text-[9px] font-normal normal-case text-text-main">
                                      <option value="all">Todas</option>
                                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                   </select>
                                </th>
                                <th className="px-3 py-2">
                                   <select value={rkFilterPeriod} onChange={(e) => setRkFilterPeriod(e.target.value)}
                                     className="w-full bg-bg-card border border-border-dim rounded px-2 py-1 text-[9px] font-normal normal-case text-text-main">
                                      <option value="all">Todos</option>
                                      {rkPeriodOptions.map(p => <option key={p} value={p}>{p}</option>)}
                                   </select>
                                </th>
                                <th className="px-2 py-2"></th>
                                <th className="px-2 py-2"></th>
                             </tr>
                          </thead>
                          <tbody key={`rk-${rkFilterBranch}-${rkFilterPeriod}-${rkFilterProduct}-${rkFilterCode}-${rkFilterCategories.join(',')}`} className="divide-y divide-border-dim">
                             {loading && rankings.length === 0 ? (
                               <tr>
                                  <td colSpan={9} className="px-6 py-20 text-center text-brand-500 uppercase font-black tracking-widest">
                                     <span className="flex items-center justify-center gap-3">
                                        <Loader2 className="animate-spin" size={20} /> Cargando datos, aguarde…
                                     </span>
                                  </td>
                               </tr>
                             ) : filteredRankings.length === 0 ? (
                               <tr>
                                  <td colSpan={9} className="px-6 py-20 text-center text-text-dim italic uppercase opacity-50">
                                     {rankings.length === 0
                                       ? 'No hay rankings cargados. Use el botón "Importar Ranking" para cargar un Excel.'
                                       : 'Ningún producto coincide con los filtros aplicados.'}
                                  </td>
                               </tr>
                             ) : (
                               filteredRankings.map((r, idx) => (
                                 <tr key={`${r.id || 'noid'}-${r.branch_id || 'nb'}-${r.product_code || 'nc'}-${r.month || 'nm'}-${r.week_number ?? 'nw'}`} className={cn("hover:bg-bg-accent/50 transition-colors group", rkSelected.has(r.id) && "bg-brand-500/5")}>
                                    <td className="px-3 py-4 text-center">
                                       <input type="checkbox" checked={rkSelected.has(r.id)} onChange={() => toggleRkOne(r.id)}
                                         className="w-3.5 h-3.5 accent-brand-500 cursor-pointer" />
                                    </td>
                                    <td className="px-4 py-4 text-center font-black text-text-dim">{idx + 1}</td>
                                    <td className="px-6 py-4">
                                       <span className="font-black text-text-main uppercase">{r.product_name}</span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                       <span className="font-mono text-text-dim bg-bg-card px-2 py-0.5 rounded border border-border-dim text-[9px]">{r.product_code || '---'}</span>
                                    </td>
                                    <td className="px-4 py-4">
                                       <span className="text-text-dim uppercase text-[9px]">{r.category || '—'}</span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                       <span className="text-text-dim uppercase font-bold">{branches.find(b => b.id === r.branch_id)?.name || 'Desconocida'}</span>
                                    </td>
                                    <td className="px-4 py-4 text-center">
                                       <span className="text-text-dim font-mono">{r.month || '—'}{r.week_number ? ` · S${r.week_number}` : ''}</span>
                                    </td>
                                    <td className="px-4 py-4 text-right font-black text-brand-500 text-sm">
                                       {r.quantity.toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                       {!isReadOnly && (
                                         <button onClick={async () => {
                                           if (!window.confirm(`¿Eliminar "${r.product_name}" del ranking?`)) return;
                                           setImporting(true);
                                           try {
                                             const { error } = await supabase.from('product_rankings').delete().eq('id', r.id);
                                             if (error) throw error;
                                             await fetchData();
                                           } catch (e: any) { alert('Error al eliminar: ' + (e.message || e)); }
                                           setImporting(false);
                                         }} className="text-text-dim hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <Trash2 size={14} />
                                       </button>
                                       )}
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

                 <div className="p-6 bg-bg-main border-b border-border-dim grid grid-cols-3 gap-4">
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
                       <label className="text-[9px] font-black text-text-dim uppercase">Mes</label>
                       <input 
                        type="month"
                        value={rankingToImport.month}
                        onChange={(e) => setRankingToImport({...rankingToImport, month: e.target.value})}
                        className="w-full bg-bg-sidebar border border-border-dim rounded px-3 py-2 text-xs font-mono"
                       />
                    </div>
                    <div className="space-y-2">
                       <label className="text-[9px] font-black text-text-dim uppercase">Semana</label>
                       <select 
                        value={rankingToImport.week}
                        onChange={(e) => setRankingToImport({...rankingToImport, week: Number(e.target.value)})}
                        className="w-full bg-bg-sidebar border border-border-dim rounded px-3 py-2 text-xs font-black uppercase text-brand-500"
                       >
                          <option value={1}>Semana 1</option>
                          <option value={2}>Semana 2</option>
                          <option value={3}>Semana 3</option>
                          <option value={4}>Semana 4</option>
                       </select>
                    </div>
                 </div>

                 <div className="flex-1 overflow-y-auto p-0 custom-scrollbar">
                    <table className="w-full border-collapse text-[10px]">
                       <thead className="sticky top-0 z-10 bg-bg-accent shadow-sm">
                          <tr className="text-left text-text-dim font-bold uppercase tracking-widest border-b border-border-dim">
                             <th className="px-6 py-3">Código</th>
                             <th className="px-6 py-3">Nombre del Producto</th>
                             <th className="px-6 py-3 text-right">Cantidad</th>
                             <th className="px-6 py-3">Rubro</th>
                          </tr>
                       </thead>
                       <tbody className="divide-y divide-border-dim/30">
                          {rankingToImport.entries.map((e, idx) => (
                            <tr key={idx} className="hover:bg-bg-accent/30">
                               <td className="px-6 py-3 font-mono text-text-dim">{e.product_code}</td>
                               <td className="px-6 py-3 font-black text-text-main uppercase">{e.product_name}</td>
                               <td className="px-6 py-3 text-right font-black text-brand-500">{e.quantity}</td>
                               <td className="px-6 py-3 text-text-dim uppercase text-[9px]">{e.category || '—'}</td>
                            </tr>
                          ))}
                       </tbody>
                    </table>
                 </div>

                 <div className="p-6 bg-bg-accent border-t border-border-dim flex gap-4">
                    <button 
                      onClick={confirmRankingImport}
                      disabled={importing}
                      className="flex-1 bg-brand-500 text-black py-3 rounded text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 shadow-xl transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-wait"
                    >
                       {importing ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
                       {importing ? 'PROCESANDO, AGUARDE…' : `CONFIRMAR E IMPORTAR ${rankingToImport.entries.length} ARTÍCULOS`}
                    </button>
                    <button 
                      onClick={() => setIsImportingRanking(false)}
                      disabled={importing}
                      className="px-8 py-3 rounded border border-border-dim text-text-dim text-[11px] font-black uppercase tracking-widest hover:bg-bg-sidebar transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                       CANCELAR
                    </button>
                 </div>
              </motion.div>
           </div>
         )}
      </AnimatePresence>

      {/* Overlay global de carga: difumina la pantalla y muestra el spinner al centro */}
      {importing && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm">
          <Loader2 className="animate-spin text-brand-500" size={56} />
          <p className="mt-4 text-white text-sm font-black uppercase tracking-widest">Guardando datos, aguarde…</p>
          <p className="mt-1 text-white/70 text-[11px] uppercase tracking-wide">No cierre ni recargue la página</p>
        </div>
      )}
    </motion.div>
  );
}
