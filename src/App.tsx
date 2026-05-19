/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI } from "@google/genai";
import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps';

// Vercel deployment trigger
import React, { useState, useMemo, useEffect, lazy, Suspense, Component } from 'react';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Utensils, 
  Users, 
  Package, 
  Star, 
  ClipboardList, 
  Tag,
  Bell,
  Search,
  ChevronRight,
  Flag,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Coffee,
  MoreVertical,
  LogOut,
  Calendar,
  Loader2,
  Clock,
  ExternalLink,
  Building2,
  MapPin,
  AlertCircle,
  BarChart3,
  DollarSign,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Calculator,
  Factory,
  ClipboardCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart,
  Area
} from 'recharts';
import { cn } from '@/src/lib/utils';
import { 
  UserRole, 
  User,
  SalesData, 
  PerformanceData,
  Branch,
  StockItem,
  Product
} from './types';
import { supabase } from './lib/supabase';

// Lazy load views for better performance
const SalesView = lazy(() => import('./components/SalesView'));
const ConsumoView = lazy(() => import('./components/ConsumoView'));
const HourControlView = lazy(() => import('./components/SueldosView'));
const HourBudgetView = lazy(() => import('./components/HourBudgetView'));
const StockView = lazy(() => import('./components/StockView'));
const UsersView = lazy(() => import('./components/UsersView'));
const BranchManagementView = lazy(() => import('./components/BranchManagementView'));
const FinanceView = lazy(() => import('./components/FinanceView'));
const ProfitLossView = lazy(() => import('./components/ProfitLossView'));
const SupervisorAgendaView = lazy(() => import('./components/SupervisorAgendaView'));
const PriceListView = lazy(() => import('./components/PriceListView'));
const SalaryManagementView = lazy(() => import('./components/SalaryManagementView'));
const PasswordManagementView = lazy(() => import('./components/PasswordManagementView'));
const HrHourControlView = lazy(() => import('./components/HrHourControlView'));
const EstimatedCashFlowView = lazy(() => import('./components/EstimatedCashFlowView'));
const PaymentScheduleView = lazy(() => import('./components/PaymentScheduleView'));
const MonthlyCashFlowView = lazy(() => import('./components/MonthlyCashFlowView'));
const DeviationControlView = lazy(() => import('./components/DeviationControlView'));
const SupervisionFlagsView = lazy(() => import('./components/SupervisionFlagsView'));
const SupervisionsExecutionView = lazy(() => import('./components/SupervisionsExecutionView'));
const DocumentsView = lazy(() => import('./components/DocumentsView'));
const TablewareView = lazy(() => import('./components/TablewareView'));
const ProductionCenterView = lazy(() => import('./components/ProductionCenterView'));
const ProductionStockControlView = lazy(() => import('./components/ProductionStockControlView'));
import LoginView from './components/LoginView';

import { PerformanceView, NewsView } from './components/ExtraViews';
import { Key, ShieldCheck, FileText } from 'lucide-react';

// --- MOCK DATA ---
const MOCK_SALES: SalesData[] = [
  { id: '1', branchId: 'bn', date: '2024-04-01', pesos: 1250000, netSales: 1125000, orders: 450, covers: 900, type: 'Turno Mañana' },
  { id: '2', branchId: 'bn', date: '2024-04-08', pesos: 1320000, netSales: 1188000, orders: 480, covers: 960, type: 'Turno Tarde' },
  { id: '3', branchId: 'bn', date: '2024-05-01', pesos: 1450000, netSales: 1305000, orders: 510, covers: 1020, type: 'Turno Mañana' },
  { id: '4', branchId: 'bn', date: '2024-05-08', pesos: 1380000, netSales: 1242000, orders: 495, covers: 990, type: 'Turno Tarde' },
];

const MOCK_PERFORMANCE: PerformanceData = {
  id: 'p1',
  branchId: 'Norte',
  weekStarting: '2024-05-08',
  googleScore: 4.7,
  googleComments: 124,
  pedidosYaRating: 4.5,
  pedidosYaCafeRating: 4.2,
  pedidosYaNegativeComments: 2,
  pedidosYaDelayMinutes: 22,
  monthlyProjection: 45000000,
  netSalesVsPreviousMonth: 12.5,
  ordersVsPreviousMonth: -5.2,
  monthlyOrdersAmount: 3200000,
  criticalStockDeviations: 3,
  criticalTablewareDeviations: 1,
  criticalHourDeviations: 2,
  hourlyDeviationsByPosition: {
    'COCINA': 12,
    'SALÓN': -4,
    'DELIVERY': 8,
    'LIMPIEZA': 2
  },
  currentFlags: {
    red: 1,
    yellow: 3,
    green: 12
  }
};

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

// --- COMPONENTS ---

const ApiKeySplash = () => (
  <div className="flex items-center justify-center min-h-screen bg-bg-main p-8">
    <div className="max-w-xl w-full glass-card p-12 text-center border-2 border-brand-500/20 shadow-2xl">
      <div className="w-20 h-20 bg-brand-500/10 rounded-full flex items-center justify-center mx-auto mb-8">
        <Key className="text-brand-500 animate-pulse" size={40} />
      </div>
      <h2 className="text-2xl font-black text-text-main uppercase tracking-tighter mb-4 italic italic">
        Google Maps API Key Required
      </h2>
      <p className="text-text-dim text-sm leading-relaxed mb-8">
        Para integrar las calificaciones de Google automáticamente, se requiere una clave de API válida.
      </p>
      <div className="space-y-4 text-left bg-bg-accent p-6 rounded-lg border border-border-dim mb-8">
        <p className="text-[11px] font-bold text-text-main uppercase">Instrucciones de Configuración:</p>
        <ol className="text-[10px] space-y-3 text-text-dim list-decimal pl-4 font-medium uppercase tracking-wider">
          <li>Obtén tu API Key en <a href="https://console.cloud.google.com/google/maps-apis/start" target="_blank" rel="noopener" className="text-brand-500 underline">Google Cloud Console</a>.</li>
          <li>Abre <strong>Configuración</strong> (icono de engranaje ⚙️, arriba a la derecha).</li>
          <li>Selecciona <strong>Secrets</strong>.</li>
          <li>Agrega <code>GOOGLE_MAPS_PLATFORM_KEY</code> como nombre.</li>
          <li>Pega tu clave como valor y presiona <strong>Enter</strong>.</li>
        </ol>
      </div>
      <div className="p-4 bg-brand-500/5 rounded border border-brand-500/20">
        <p className="text-[9px] text-brand-500 font-bold uppercase italic">
          La aplicación se reconstruirá automáticamente después de agregar el secreto.
        </p>
      </div>
    </div>
  </div>
);

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export default function App() {
  if (!hasValidKey) {
    return <ApiKeySplash />;
  }

  return (
    <APIProvider apiKey={API_KEY} version="weekly">
      <AppContent />
    </APIProvider>
  );
}

const Card: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className }) => (
  <div className={cn("glass-card p-6", className)}>
    {children}
  </div>
);

const LoadingState = () => (
  <div className="flex flex-col items-center justify-center py-20 animate-pulse">
    <Loader2 className="animate-spin text-brand-600 mb-4" size={48} />
    <p className="text-neutral-500 font-medium tracking-wide">Cargando tablero...</p>
  </div>
);

function AppContent() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userPermissions, setUserPermissions] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isBranchesLoading, setIsBranchesLoading] = useState(true);
  const [items, setItems] = useState<StockItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchUrl, setNewBranchUrl] = useState('');
  const [newBranchLocation, setNewBranchLocation] = useState('');
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [controlledItemIds, setControlledItemIds] = useState<string[]>(['1', '2', '3', '4']);

  useEffect(() => {
    if (currentUser) {
      const fetchPermissions = async () => {
        const { data } = await supabase
          .from('role_permissions')
          .select('modules')
          .eq('role', currentUser.role)
          .single();
        
        if (data) {
          setUserPermissions(data.modules || []);
        } else if (currentUser.role === 'dueño') {
          // Grant all access to owner by default
          setUserPermissions(['dashboard', 'ventas', 'balance', 'cmv', 'desvios', 'supervision', 'documentos', 'precios', 'sucursales', 'usuarios', 'finanzas', 'sueldos', 'produccion', 'vajilla', 'horas', 'novedades', 'papeles_sucursal', 'cuentas']);
        }
      };
      fetchPermissions();
    }
  }, [currentUser]);

  const hasPermission = (moduleId: string) => {
    if (!currentUser) return false;
    if (currentUser.role === 'dueño') return true;
    return userPermissions.includes(moduleId);
  };

  React.useEffect(() => {
    if (!isDarkMode) {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  }, [isDarkMode]);

  // Fetch items, products and branches from Supabase
  React.useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch Branches
        setIsBranchesLoading(true);
        const { data: branchesData, error: branchesError } = await supabase
          .from('branches')
          .select('*');
        
        if (branchesError) {
          console.error('Error fetching branches:', branchesError);
        } else if (branchesData && branchesData.length > 0) {
          setBranches(branchesData.map(b => ({
            id: b.id,
            name: b.name,
            location: b.location,
            isActive: b.is_active,
            googleMapsUrl: b.google_maps_url,
            googleReviewUrl: b.google_review_url,
            googlePlaceId: b.google_place_id
          })));
        } else {
          // Fallback defaults
          const defaults: Branch[] = [
            { id: 'bn', name: 'Barrio Norte', location: 'Av. Belgrano 123, Tucumán', isActive: true, googleMapsUrl: 'https://www.google.com/maps/place/CRAFT+Barrio+Norte/data=!4m2!3m1!1s0x0:0x1fdb8452ca845bc1?sa=X&ved=1t:2428&ictx=111' },
            { id: 'bs', name: 'Barrio Sur', location: 'San Lorenzo 456, Tucumán', isActive: true },
            { id: 'mt', name: 'Casco Viejo', location: 'San Lorenzo 207, Yerba Buena, Tucumán', isActive: true, googlePlaceId: 'ChIJz3uE95S6U5YRMmP_V1kY9B0' },
            { id: 'pn', name: 'Perón', location: 'Av. Perón 1000, Yerba Buena', isActive: true },
            { id: 'ml', name: 'Mate de Luna', location: 'Av. Mate de Luna 2000, Tucumán', isActive: true },
          ];
          setBranches(defaults);
        }

        // Fetch Items
        const { data: itemsData, error: itemsError } = await supabase
          .from('stock_items')
          .select('*')
          .order('name');
        
        if (itemsError) console.error('Error fetching items:', itemsError);
        if (itemsData) {
          setItems(itemsData.map(i => ({
            id: i.id,
            name: i.name,
            unit: i.unit,
            cost: i.cost
          })));
        }

        // Fetch Products
        const { data: productsData, error: productsError } = await supabase
          .from('products')
          .select('*')
          .order('name');
        
        if (productsError) console.error('Error fetching products:', productsError);
        if (productsData) {
          setProducts(productsData.map(p => ({
            id: p.id,
            name: p.name,
            category: p.category
          })));
        }
      } catch (err) {
        console.error('Global data fetch catch:', err);
      } finally {
        setIsBranchesLoading(false);
      }
    };

    fetchData();

    // Listen for changes
    const itemsChannel = supabase.channel('stock_items_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stock_items' }, fetchData)
      .subscribe();

    const productsChannel = supabase.channel('products_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, fetchData)
      .subscribe();

    const branchesChannel = supabase.channel('branches_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'branches' }, fetchData)
      .subscribe();

    return () => {
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(productsChannel);
      supabase.removeChannel(branchesChannel);
    };
  }, []);

  useEffect(() => {
    if (currentUser && currentUser.branchId) {
      setSelectedBranchId(currentUser.branchId);
    }
  }, [currentUser]);

  // Calculate comparison KPI for "Ventas" (Week 1 May vs Week 1 April)
  const salesComparison = useMemo(() => {
    const week1April = MOCK_SALES.find(s => s.date === '2024-04-01')?.pesos || 1;
    const week1May = MOCK_SALES.find(s => s.date === '2024-05-01')?.pesos || 1;
    const diff = ((week1May - week1April) / week1April) * 100;
    return {
      current: week1May,
      previous: week1April,
      diff: diff.toFixed(1),
      isUp: diff > 0
    };
  }, []);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, permission: 'dashboard' },
    { id: 'ventas', label: 'Ventas', icon: TrendingUp, permission: 'ventas' },
    { id: 'balance', label: 'Estado Resultado', icon: BarChart3, permission: 'balance' },
    { id: 'cmv', label: 'CMV Mensual', icon: Package, permission: 'cmv' },
    { id: 'desvios', label: 'Control Desvíos', icon: AlertCircle, permission: 'desvios' },
    { id: 'supervision', label: 'Supervisión', icon: ClipboardCheck, permission: 'supervision' },
    { id: 'horas', label: 'Carga de Horas', icon: Clock, permission: 'horas' },
  ].filter(item => hasPermission(item.permission));

  if (!currentUser) {
    return <LoginView onLogin={setCurrentUser} />;
  }

  const handleAddBranch = async () => {
    if (!newBranchName.trim()) return;
    const newBranch: Branch = {
      id: Math.random().toString(36).substr(2, 9),
      name: newBranchName,
      location: newBranchLocation,
      isActive: true,
      googleMapsUrl: newBranchUrl || undefined
    };

    // Save to Supabase
    const { error } = await supabase
      .from('branches')
      .insert([{
        id: newBranch.id,
        name: newBranch.name,
        location: newBranch.location,
        is_active: newBranch.isActive,
        google_maps_url: newBranch.googleMapsUrl
      }]);

    if (error) {
      console.error('Error adding branch to Supabase:', error);
      alert(`Error al agregar sucursal: ${error.message}`);
      // Fallback update state anyway if it's just a local run
      setBranches(prev => [...prev, newBranch]);
    } else {
      setBranches(prev => [...prev, newBranch]);
    }

    setNewBranchName('');
    setNewBranchUrl('');
    setNewBranchLocation('');
    setShowAddBranch(false);
  };

  const handleUpdateBranch = async (updated: Branch) => {
    // Upsert to Supabase
    const { error } = await supabase
      .from('branches')
      .upsert({
        id: updated.id,
        name: updated.name,
        location: updated.location,
        is_active: updated.isActive,
        google_maps_url: updated.googleMapsUrl,
        google_review_url: updated.googleReviewUrl,
        google_place_id: updated.googlePlaceId
      }, { onConflict: 'id' });

    if (error) {
      console.error('Error upserting branch in Supabase:', error);
      alert(`Error al guardar los cambios: ${error.message || 'Error desconocido'}`);
    } else {
      // Update local state ONLY if success or no real DB configured
      setBranches(prev => prev.map(b => b.id === updated.id ? updated : b));
    }
  };

  return (
    <div className="flex min-h-screen bg-bg-main font-sans text-text-main">
      {/* Sidebar */}
      <aside className={cn(
        "border-r border-sidebar-border bg-bg-sidebar flex flex-col fixed h-full z-20 transition-all duration-300",
        isSidebarCollapsed ? "w-0 -translate-x-full overflow-hidden" : "w-56 translate-x-0"
      )}>
        <div className="p-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <h1 className="text-brand-500 font-extrabold text-2xl tracking-tighter italic">CRAFT<span className="text-sidebar-text">.</span></h1>
          </div>
          <p className="text-[10px] uppercase tracking-widest text-sidebar-dim opacity-70 mt-1">Sistemas & Control</p>
        </div>

        <nav className="flex-1 py-4 space-y-0.5 overflow-y-auto custom-scrollbar">
          <div className="px-4 mb-2 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-sidebar-dim uppercase tracking-wider">Gestión Sucursal</span>
            {!isSidebarCollapsed && (
              <button 
                onClick={() => setIsSidebarCollapsed(true)}
                className="p-1 hover:bg-bg-accent rounded text-sidebar-dim hover:text-brand-500 transition-all"
                title="Esconder Menú"
              >
                <PanelLeftClose size={14} />
              </button>
            )}
          </div>
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                activeTab === item.id 
                  ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                  : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
              )}
            >
              <item.icon size={16} className={cn(
                "transition-colors",
                activeTab === item.id ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
              )} />
              {item.label}
            </button>
          ))}

          <div className="px-4 mb-2 mt-6 text-[10px] font-semibold text-sidebar-dim uppercase tracking-wider">Recursos Humanos</div>
          <button
            onClick={() => setActiveTab('control_horas')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
              activeTab === 'control_horas' 
                ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
            )}
          >
            <ShieldCheck size={16} className={cn(
              "transition-colors",
              activeTab === 'control_horas' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
            )} />
            Control de Horas
          </button>
          {currentUser.role === 'dueño' && (
            <button
              onClick={() => setActiveTab('gestion_sueldos')}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                activeTab === 'gestion_sueldos' 
                  ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                  : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
              )}
            >
              <Users size={16} className={cn(
                "transition-colors",
                activeTab === 'gestion_sueldos' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
              )} />
              Sueldos
            </button>
          )}

          {(currentUser.role === 'dueño' || currentUser.role === 'supervisor') && (
            <>
              <div className="px-4 mb-2 mt-6 text-[10px] font-semibold text-sidebar-dim uppercase tracking-wider">Gestión Líderes Operativos</div>
              <button
                onClick={() => setActiveTab('presupuesto_horas')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                  activeTab === 'presupuesto_horas' 
                    ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                    : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                )}
              >
                <Calendar size={16} className={cn(
                  "transition-colors",
                  activeTab === 'presupuesto_horas' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                )} />
                Presupuestador de horas
              </button>
              <button
                onClick={() => setActiveTab('agenda')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                  activeTab === 'agenda' 
                    ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                    : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                )}
              >
                <ClipboardList size={16} className={cn(
                  "transition-colors",
                  activeTab === 'agenda' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                )} />
                Agenda Supervisores
              </button>
              <button
                onClick={() => setActiveTab('supervisiones_operativas')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                  activeTab === 'supervisiones_operativas' 
                    ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                    : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                )}
              >
                <Flag size={16} className={cn(
                  "transition-colors",
                  activeTab === 'supervisiones_operativas' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                )} />
                Supervisiones
              </button>
            </>
          )}

          <div className="px-4 mb-2 mt-6 text-[10px] font-semibold text-sidebar-dim uppercase tracking-wider">Mantenimiento</div>

          <div className="px-4 mb-2 mt-6 text-[10px] font-semibold text-sidebar-dim uppercase tracking-wider">Centro de Producción</div>
          <button
            onClick={() => setActiveTab('produccion_mes')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
              activeTab === 'produccion_mes' 
                ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
            )}
          >
            <Factory size={16} className={cn(
              "transition-colors",
              activeTab === 'produccion_mes' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
            )} />
            Producción del mes
          </button>
          <button
            onClick={() => setActiveTab('produccion_stock_control')}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
              activeTab === 'produccion_stock_control' 
                ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
            )}
          >
            <ClipboardCheck size={16} className={cn(
              "transition-colors",
              activeTab === 'produccion_stock_control' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
            )} />
            Control de Stock
          </button>

          {currentUser.role === 'dueño' && (
            <>
              <div className="px-4 mb-2 mt-6 text-[10px] font-semibold text-sidebar-dim uppercase tracking-wider">Finanzas</div>
              <button
                onClick={() => setActiveTab('finanzas_estimado')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                  activeTab === 'finanzas_estimado' 
                    ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                    : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                )}
              >
                <TrendingUp size={16} className={cn(
                  "transition-colors",
                  activeTab === 'finanzas_estimado' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                )} />
                Flujo de Caja Estimado
              </button>
              <button
                onClick={() => setActiveTab('bank_liabilities')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                  activeTab === 'bank_liabilities' 
                    ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                    : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                )}
              >
                <Building2 size={16} className={cn(
                  "transition-colors",
                  activeTab === 'bank_liabilities' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                )} />
                Pasivos Bancarios
              </button>
              <button
                onClick={() => setActiveTab('tax_liabilities')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                  activeTab === 'tax_liabilities' 
                    ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                    : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                )}
              >
                <Calculator size={16} className={cn(
                  "transition-colors",
                  activeTab === 'tax_liabilities' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                )} />
                Pasivos Fiscales
              </button>
              <button
                onClick={() => setActiveTab('cronograma_pagos')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                  activeTab === 'cronograma_pagos' 
                    ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                    : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                )}
              >
                <Calendar size={16} className={cn(
                  "transition-colors",
                  activeTab === 'cronograma_pagos' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                )} />
                Cronograma de Pagos
              </button>
              <button
                onClick={() => setActiveTab('finanzas_mensual')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                  activeTab === 'finanzas_mensual' 
                    ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                    : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                )}
              >
                <BarChart3 size={16} className={cn(
                  "transition-colors",
                  activeTab === 'finanzas_mensual' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                )} />
                Flujo de Caja Mensual
              </button>

              <div className="mt-4 pt-4 border-t border-sidebar-border/30">
                <div className="px-4 mb-2 text-[10px] font-semibold text-sidebar-dim uppercase tracking-wider">Administración</div>
                <button
                  onClick={() => setActiveTab('ventas')}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                    activeTab === 'ventas' 
                      ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                      : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                  )}
                >
                  <TrendingUp size={16} className={cn(
                    "transition-colors",
                    activeTab === 'ventas' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                  )} />
                  Ventas
                </button>
                <button
                  onClick={() => setActiveTab('p&l')}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                    activeTab === 'p&l' 
                      ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                      : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                  )}
                >
                  <BarChart3 size={16} className={cn(
                    "transition-colors",
                    activeTab === 'p&l' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                  )} />
                  Estado de Resultado
                </button>
                <button
                  onClick={() => setActiveTab('consumo')}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                    activeTab === 'consumo' 
                      ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                      : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                  )}
                >
                  <Calculator size={16} className={cn(
                    "transition-colors",
                    activeTab === 'consumo' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                  )} />
                  CMV Mensual Sucursal
                </button>
                <button
                  onClick={() => setActiveTab('control_desvios')}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                    activeTab === 'control_desvios' 
                      ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                      : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                  )}
                >
                  <ShieldCheck size={16} className={cn(
                    "transition-colors",
                    activeTab === 'control_desvios' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                  )} />
                  Control de Desvíos
                </button>
                <button
                  onClick={() => setActiveTab('supervision_banderas')}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                    activeTab === 'supervision_banderas' 
                      ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                      : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                  )}
                >
                  <Flag size={16} className={cn(
                    "transition-colors",
                    activeTab === 'supervision_banderas' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                  )} />
                  Supervisiones y Banderas
                </button>
                <button
                onClick={() => setActiveTab('papeles_administracion')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                  activeTab === 'papeles_administracion' 
                    ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                    : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                )}
              >
                <FileText size={16} className={cn(
                  "transition-colors",
                  activeTab === 'papeles_administracion' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                )} />
                Papeles Importantes
              </button>
              <button
                onClick={() => setActiveTab('precios')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                  activeTab === 'precios' 
                    ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                    : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                )}
              >
                <Tag size={16} className={cn(
                  "transition-colors",
                  activeTab === 'precios' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                )} />
                Lista de Precios
              </button>

              <div className="px-4 mb-2 mt-6 text-[10px] font-semibold text-sidebar-dim uppercase tracking-wider">Configuración</div>
              <button
                onClick={() => setActiveTab('sucursales')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                  activeTab === 'sucursales' 
                    ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                    : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                )}
              >
                <Building2 size={16} className={cn(
                  "transition-colors",
                  activeTab === 'sucursales' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                )} />
                Gestión Sucursales
              </button>
              <button
                onClick={() => setActiveTab('usuarios')}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-2 text-sm font-medium transition-all group relative text-left",
                  activeTab === 'usuarios' 
                    ? "bg-brand-500/10 text-brand-500 border-r-2 border-brand-500" 
                    : "text-sidebar-dim hover:bg-bg-accent hover:text-sidebar-text"
                )}
              >
                <Users size={16} className={cn(
                  "transition-colors",
                  activeTab === 'usuarios' ? "text-brand-500" : "text-sidebar-dim group-hover:text-sidebar-text"
                )} />
                Usuarios/Roles
              </button>
            </div>
          </>
        )}
      </nav>

        <div className="p-4 border-t border-sidebar-border bg-sidebar-border/10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-black font-bold text-xs uppercase shadow-lg shadow-brand-500/20">
              {currentUser.firstName[0]}{currentUser.lastName[0]}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate text-sidebar-text leading-tight uppercase tracking-tight">
                {currentUser.firstName} {currentUser.lastName}
              </p>
              <p className="text-[10px] text-sidebar-dim font-bold uppercase tracking-wider mt-0.5 opacity-60">
                {branches.find(b => b.id === currentUser.branchId)?.name || 'Global / Dueño'}
              </p>
            </div>
            <button 
              onClick={() => setCurrentUser(null)}
              className="text-sidebar-dim hover:text-red-500 transition-colors p-1"
              title="Cerrar Sesión"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className={cn(
        "flex-1 min-w-0 flex flex-col transition-all duration-300",
        isSidebarCollapsed ? "ml-0" : "ml-56"
      )}>
        {/* Header */}
        <header className="h-20 bg-bg-sidebar border-b border-border-dim sticky top-0 z-30 px-6 flex items-center justify-between">
          <div className="flex gap-8 items-center">
            {isSidebarCollapsed && (
              <button 
                onClick={() => setIsSidebarCollapsed(false)}
                className="p-2 hover:bg-bg-accent rounded text-text-dim hover:text-brand-500 transition-all"
                title="Mostrar Menú"
              >
                <PanelLeftOpen size={20} />
              </button>
            )}

            {!['finanzas_estimado', 'cronograma_pagos', 'finanzas_mensual'].includes(activeTab) && (
              <>
                <div className="flex flex-col">
                  <span className="text-[10px] text-text-dim uppercase font-bold tracking-tighter">Sucursal Activa</span>
                  <div className="flex items-center gap-3 mt-0.5">
                    <select 
                      value={selectedBranchId}
                      disabled={!!currentUser.branchId && currentUser.role !== 'dueño'}
                      onChange={(e) => setSelectedBranchId(e.target.value)}
                      className={cn(
                        "bg-bg-accent border border-border-dim rounded px-3 py-1.5 text-[11px] font-black uppercase text-brand-500 outline-none focus:border-brand-500/50 shadow-inner",
                        !!currentUser.branchId && currentUser.role !== 'dueño' && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <option value="all">CONSOLIDADO (TODAS)</option>
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    {selectedBranchId !== 'all' && branches.find(b => b.id === selectedBranchId)?.googleMapsUrl && (
                      <a 
                        href={branches.find(b => b.id === selectedBranchId)?.googleMapsUrl} 
                        target="_blank" 
                        rel="noreferrer"
                        className="text-text-dim hover:text-brand-500 transition-colors"
                      >
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                </div>
                <div className="hidden lg:flex flex-col border-l border-border-dim/30 pl-8">
                  <span className="text-[10px] text-text-dim uppercase font-bold tracking-tighter">Ventas Semanales</span>
                  <span className="text-sm font-mono text-text-main tracking-tight mt-0.5">
                    ${salesComparison.current.toLocaleString()} 
                    <span className={cn("text-[10px] ml-2", salesComparison.isUp ? "text-emerald-500" : "text-red-500")}>
                      {salesComparison.isUp ? '+' : ''}{salesComparison.diff}%
                    </span>
                  </span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 hover:bg-bg-accent rounded text-text-dim hover:text-brand-500 transition-all flex items-center gap-2"
              title={isDarkMode ? "Cambiar a Modo Claro" : "Cambiar a Modo Oscuro"}
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
              <span className="text-[10px] font-bold uppercase hidden sm:inline">{isDarkMode ? 'Claro' : 'Oscuro'}</span>
            </button>

            <div className="bg-red-500/10 text-red-500 px-3 py-1 rounded border border-red-500/20 hidden lg:flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
              <span className="text-[11px] font-bold uppercase">2 Alertas Críticas</span>
            </div>
            {!['finanzas_estimado', 'cronograma_pagos', 'finanzas_mensual'].includes(activeTab) && (
              <button className="bg-brand-500 text-black font-bold text-xs px-4 py-2 rounded hover:bg-brand-600 transition-colors">
                CARGA RÁPIDA
              </button>
            )}
          </div>
        </header>

        {/* Dynamic View */}
        <div className="p-6 flex-1">
          <Suspense fallback={<LoadingState />}>
            <AnimatePresence mode="wait">
              {activeTab === 'dashboard' && (
                <DashboardView 
                  salesComparison={salesComparison} 
                  performance={MOCK_PERFORMANCE}
                  branches={branches}
                  selectedBranchId={selectedBranchId}
                />
              )}
              {activeTab === 'ventas' && <SalesView branches={branches} selectedBranchId={selectedBranchId} products={products} />}
              {activeTab === 'consumo' && <ConsumoView key="consumo" branches={branches} selectedBranchId={selectedBranchId} />}
              {activeTab === 'presupuesto_horas' && <HourBudgetView key="presupuesto" branches={branches} selectedBranchId={selectedBranchId} />}
              {activeTab === 'horas' && <HourControlView key="horas" branches={branches} selectedBranchId={selectedBranchId} />}
              {activeTab === 'stock' && (
                <StockView 
                  key="stock" 
                  branches={branches} 
                  selectedBranchId={selectedBranchId} 
                  userRole={currentUser.role} 
                  controlledItemIds={controlledItemIds}
                  items={items}
                />
              )}
              {activeTab === 'usuarios' && <UsersView key="usuarios" branches={branches} selectedBranchId={selectedBranchId} />}
              {activeTab === 'p&l' && <ProfitLossView key="p&l" branches={branches} selectedBranchId={selectedBranchId} />}
              {activeTab === 'finanzas_estimado' && <FinanceView key="finanzas_estimado" branches={branches} selectedBranchId={selectedBranchId} mode="default" />}
              {activeTab === 'bank_liabilities' && <FinanceView key="bank_liabilities" branches={branches} selectedBranchId={selectedBranchId} mode="bank" />}
              {activeTab === 'tax_liabilities' && <FinanceView key="tax_liabilities" branches={branches} selectedBranchId={selectedBranchId} mode="tax" />}
              {activeTab === 'cronograma_pagos' && <PaymentScheduleView key="cronograma_pagos" />}
              {activeTab === 'finanzas_mensual' && <MonthlyCashFlowView key="finanzas_mensual" />}
              {activeTab === 'control_desvios' && (
                <DeviationControlView 
                  key="control_desvios" 
                  branches={branches} 
                  selectedBranchId={selectedBranchId} 
                  controlledItemIds={controlledItemIds}
                  setControlledItemIds={setControlledItemIds}
                  items={items}
                  setItems={setItems}
                  products={products}
                  setProducts={setProducts}
                />
              )}
              {activeTab === 'supervision_banderas' && <SupervisionFlagsView key="supervision_banderas" branches={branches} />}
              {activeTab === 'supervisiones_operativas' && <SupervisionsExecutionView key="supervisiones_operativas" branches={branches} />}
              {activeTab === 'agenda' && <SupervisorAgendaView key="agenda" branches={branches} />}
              {activeTab === 'precios' && <PriceListView key="precios" />}
              {activeTab === 'gestion_sueldos' && <SalaryManagementView key="gestion_sueldos" />}
              {activeTab === 'vajilla' && <TablewareView key="vajilla" branches={branches} selectedBranchId={selectedBranchId} />}
              {activeTab === 'novedades' && <NewsView key="novedades" branches={branches} selectedBranchId={selectedBranchId} />}
              {activeTab === 'cuentas' && <PasswordManagementView key="cuentas" />}
              {activeTab === 'papeles_sucursal' && (
                <DocumentsView 
                  key="papeles_sucursal" 
                  mode="encargado" 
                  branchId={selectedBranchId} 
                  branchName={selectedBranchId === 'all' ? 'Todas' : branches.find(b => b.id === selectedBranchId)?.name}
                  branches={branches}
                  onBranchSelect={(id) => setSelectedBranchId(id)}
                />
              )}
              {activeTab === 'produccion_mes' && <ProductionCenterView key="produccion_mes" />}
              {activeTab === 'produccion_stock_control' && <ProductionStockControlView key="produccion_stock_control" />}
              {activeTab === 'papeles_administracion' && (
                <DocumentsView 
                  key="papeles_administracion" 
                  mode="administracion" 
                />
              )}
              {activeTab === 'control_horas' && <HrHourControlView key="control_horas" branches={branches} />}
              {activeTab === 'sucursales' && (
                <BranchManagementView 
                  branches={branches} 
                  onUpdateBranch={handleUpdateBranch} 
                  onAddBranchClick={() => setShowAddBranch(true)}
                />
              )}
            </AnimatePresence>
          </Suspense>

          {/* Add Branch Modal */}
          <AnimatePresence>
            {showAddBranch && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-bg-sidebar border border-border-dim p-8 rounded-lg w-full max-w-md shadow-2xl"
                >
                  <h3 className="text-sm font-black text-brand-500 uppercase tracking-widest mb-6 border-l-2 border-brand-500 pl-4">Nueva Sucursal</h3>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Nombre de la Sucursal</label>
                      <input 
                        type="text"
                        value={newBranchName}
                        onChange={(e) => setNewBranchName(e.target.value)}
                        placeholder="Ejem: Barrio Norte"
                        className="w-full px-4 py-3 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 uppercase font-bold"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider">URL Google Maps (Opcional)</label>
                      <input 
                        type="text"
                        value={newBranchUrl}
                        onChange={(e) => setNewBranchUrl(e.target.value)}
                        placeholder="https://google.com/maps/..."
                        className="w-full px-4 py-3 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 font-mono"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Ubicación / Dirección</label>
                      <input 
                        type="text"
                        value={newBranchLocation}
                        onChange={(e) => setNewBranchLocation(e.target.value)}
                        placeholder="Ejem: Av. Belgrano 123"
                        className="w-full px-4 py-3 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 uppercase font-bold"
                      />
                    </div>

                    {/* Branch List */}
                    <div className="pt-4 border-t border-border-dim">
                       <p className="text-[9px] font-bold text-text-dim uppercase mb-2">Sucursales Actuales</p>
                       <div className="space-y-1">
                          {branches.map(b => (
                            <div key={b.id} className="text-[10px] font-mono text-text-main flex items-center gap-2">
                               <div className="w-1 h-1 rounded-full bg-brand-500" />
                               {b.name}
                            </div>
                          ))}
                       </div>
                    </div>
                  </div>

                  <div className="mt-8 flex gap-3">
                    <button 
                      onClick={handleAddBranch}
                      className="flex-1 bg-brand-500 text-black py-2.5 rounded text-[11px] font-black uppercase tracking-widest hover:bg-brand-600 transition-all"
                    >
                      Confirmar Alta
                    </button>
                    <button 
                      onClick={() => setShowAddBranch(false)}
                      className="px-6 py-2.5 rounded border border-border-dim text-text-dim text-[11px] font-black uppercase tracking-widest hover:bg-bg-accent transition-all"
                    >
                      Cerrar
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

// --- SUB-VIEWS ---

const GoogleMetricsCard: React.FC<{ branch: Branch }> = ({ branch }) => {
  const [data, setData] = useState<{
    rating?: number;
    userRatingCount?: number;
    allReviews: google.maps.places.Review[];
    criticalReviews: google.maps.places.Review[];
    recentWithText: google.maps.places.Review[];
    error?: string;
    loading: boolean;
  }>({ allReviews: [], criticalReviews: [], recentWithText: [], loading: false });

  const [activeView, setActiveView] = useState<'summary' | 'all' | 'critical' | 'recent'>('summary');

  const placesLib = useMapsLibrary('places');

  useEffect(() => {
    if (!placesLib || !branch?.googlePlaceId) return;

    const fetchData = async () => {
      setData(prev => ({ ...prev, loading: true, error: undefined }));
      try {
        const place = new placesLib.Place({ id: branch.googlePlaceId });
        await place.fetchFields({
          fields: ['rating', 'userRatingCount', 'reviews']
        });

        const now = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const all = place.reviews || [];
        
        const critical = all.filter(review => (review.rating || 0) <= 4);
        
        const recent = all.filter(review => {
          if (!review.text) return false;
          const hasText = review.text.toString().trim().length > 0;
          
          // Debugging date comparison
          const pubDate = review.publishTime ? new Date(review.publishTime) : null;
          const isRecent = pubDate && pubDate.getTime() >= sevenDaysAgo.getTime();
          
          return hasText && isRecent;
        });

        setData({
          rating: place.rating || undefined,
          userRatingCount: place.userRatingCount || undefined,
          allReviews: all,
          criticalReviews: critical,
          recentWithText: recent,
          loading: false
        });
      } catch (err: any) {
        console.error('Error fetching Google metrics:', err);
        const errorMsg = err.message || '';
        if (errorMsg.includes('NOT_FOUND') || errorMsg.includes('invalid') || errorMsg.includes('Place ID')) {
          setData(prev => ({ ...prev, loading: false, error: 'ID de Google inválido o expirado. Por favor, actualice el ID en Gestión de Sucursales.' }));
        } else {
          setData(prev => ({ ...prev, loading: false, error: 'Error al cargar datos de Google (Verifica la conexión y el ID).' }));
        }
      }
    };

    fetchData();
  }, [placesLib, branch?.googlePlaceId]);

  if (!branch?.googlePlaceId) return null;

  const renderStars = (rating: number, size = 8, colorClass = "text-yellow-500 fill-yellow-500") => (
    <div className="flex gap-0.5">
      {[...Array(5)].map((_, i) => (
        <Star 
          key={i} 
          size={size} 
          className={cn(i < Math.floor(rating) ? colorClass : "text-text-dim/20")} 
        />
      ))}
    </div>
  );

  const ReviewList = ({ reviews, emptyMsg, showLimitNote = false }: { reviews: google.maps.places.Review[], emptyMsg: string, showLimitNote?: boolean }) => (
    <div className="space-y-2 mt-3 max-h-48 overflow-y-auto custom-scrollbar pr-1">
      {showLimitNote && (
        <div className="p-2 bg-blue-500/5 border border-blue-500/10 rounded mb-2">
          <p className="text-[7px] text-blue-500 uppercase font-black leading-tight">
            Nota: Google API limita la respuesta a los 5 comentarios más relevantes. Si un comentario nuevo no aparece, es por esta restricción de Google.
          </p>
        </div>
      )}
      {reviews.length === 0 ? (
        <p className="text-[9px] text-text-dim italic text-center py-4">{emptyMsg}</p>
      ) : (
        reviews.map((rev, i) => {
          const pubDate = rev.publishTime ? new Date(rev.publishTime) : null;
          return (
            <div key={i} className="p-2 bg-bg-accent/50 border border-border-dim rounded group hover:border-brand-500/30 transition-all">
              <div className="flex justify-between items-start mb-1">
                <div className="flex flex-col">
                  <span className="text-[9px] font-bold text-text-main line-clamp-1">{rev.authorAttribution?.displayName || 'Usuario Google'}</span>
                  {renderStars(rev.rating || 0, 7)}
                </div>
                <span className="text-[7px] text-text-dim whitespace-nowrap">{pubDate?.toLocaleDateString()}</span>
              </div>
              {rev.text && (
                <p className="text-[9px] text-text-dim leading-tight italic mt-1 line-clamp-3">"{rev.text}"</p>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <Card className="h-full border-l-4 border-yellow-500 flex flex-col p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-col">
          <span className="text-[10px] font-black text-text-dim uppercase tracking-wider">{branch.name}</span>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-text-main">{data.rating || '--'}</span>
            {renderStars(data.rating || 0, 10)}
          </div>
        </div>
        <div className="flex gap-1 bg-bg-accent p-0.5 rounded border border-border-dim">
          {[
            { id: 'summary', icon: LayoutDashboard, label: 'Resumen' },
            { id: 'all', icon: Star, label: 'Todas' },
            { id: 'critical', icon: AlertCircle, label: 'Críticas' },
            { id: 'recent', icon: Clock, label: '7d Texto' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveView(tab.id as any)}
              className={cn(
                "p-1.5 rounded transition-all group relative",
                activeView === tab.id ? "bg-brand-500 text-black shadow-lg" : "text-text-dim hover:text-text-main"
              )}
              title={tab.label}
            >
              <tab.icon size={12} />
              {activeView === tab.id && (
                 <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-black text-white text-[7px] px-1 rounded uppercase font-bold whitespace-nowrap shadow-xl">
                   {tab.label}
                 </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {data.loading ? (
        <div className="animate-pulse space-y-3 py-4">
          <div className="h-4 bg-bg-accent rounded w-3/4" />
          <div className="h-12 bg-bg-accent rounded w-full" />
          <div className="h-12 bg-bg-accent rounded w-full" />
        </div>
      ) : data.error ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
          <AlertCircle size={24} className="text-red-500 mb-2" />
          <p className="text-[10px] text-text-dim font-medium uppercase leading-tight italic">{data.error}</p>
        </div>
      ) : (
        <div className="flex-1">
          {activeView === 'summary' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div className="p-3 bg-bg-accent rounded text-center border border-border-dim">
                  <p className="text-[8px] font-black text-text-dim uppercase">Total</p>
                  <p className="text-lg font-mono font-bold text-text-main leading-none mt-1">{data.userRatingCount || 0}</p>
                  <p className="text-[7px] text-text-dim uppercase mt-1">Reseñas</p>
                </div>
                <div className="p-3 bg-red-500/5 rounded text-center border border-red-500/20">
                  <p className="text-[8px] font-black text-red-500 uppercase">Alertas</p>
                  <p className="text-lg font-mono font-bold text-red-500 leading-none mt-1">{data.criticalReviews.length}</p>
                  <p className="text-[7px] text-text-dim uppercase mt-1">Críticas</p>
                </div>
              </div>
              {data.recentWithText.length > 0 && (
                <div className="p-2 border-2 border-dashed border-brand-500/20 rounded-lg animate-pulse-slow">
                  <p className="text-[8px] font-black text-brand-500 uppercase flex items-center gap-1 mb-1">
                    <Clock size={10} /> Nuevos Comentarios (7d): {data.recentWithText.length}
                  </p>
                  <p className="text-[8px] text-text-dim italic line-clamp-1">"{data.recentWithText[0].text}"</p>
                </div>
              )}
            </div>
          )}

          {activeView === 'all' && (
            <ReviewList reviews={data.allReviews} emptyMsg="No hay reseñas disponibles." showLimitNote={true} />
          )}

          {activeView === 'critical' && (
            <ReviewList reviews={data.criticalReviews} emptyMsg="¡Excelente! No hay reseñas críticas registradas." showLimitNote={true} />
          )}

          {activeView === 'recent' && (
            <ReviewList reviews={data.recentWithText} emptyMsg="Sin comentarios con texto en los últimos 7 días." showLimitNote={true} />
          )}
        </div>
      )}
    </Card>
  );
};

function DashboardView({ salesComparison: initialSalesComparison, performance, branches, selectedBranchId }: { salesComparison: any, performance: PerformanceData, branches: Branch[], selectedBranchId: string }) {
  // Filter sales data for the chart and KPIs
  const filteredSales = useMemo(() => {
    if (selectedBranchId === 'all') return MOCK_SALES;
    return MOCK_SALES.filter(s => s.branchId === selectedBranchId);
  }, [selectedBranchId]);

  // Recalculate comparison based on view mode (simple mock logic)
  const currentSalesComparison = useMemo(() => {
    const week1April = filteredSales.find(s => s.date === '2024-04-01')?.pesos || 1;
    const week1May = filteredSales.find(s => s.date === '2024-05-01')?.pesos || 1;
    const diff = ((week1May - week1April) / week1April) * 100;
    return {
      current: week1May,
      previous: week1April,
      diff: diff.toFixed(1),
      isUp: diff > 0
    };
  }, [filteredSales]);

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {/* KPI Cards Row - Part 1: Sales & Performance */}
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-dim border-b border-border-dim pb-2 flex items-center gap-2">
        <TrendingUp size={12} className="text-brand-500" />
        Ventas & Proyecciones
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="flex flex-col justify-between group h-32 border-l-4 border-brand-500">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Ventas Netas vs Mes Ant.</span>
            <div className={cn(
              "text-[10px] font-mono px-2 py-0.5 rounded",
              (performance.netSalesVsPreviousMonth || 0) > 0 ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"
            )}>
              {performance.netSalesVsPreviousMonth && (performance.netSalesVsPreviousMonth > 0 ? '+' : '')}{performance.netSalesVsPreviousMonth}%
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-mono font-bold text-text-main">${currentSalesComparison.current.toLocaleString()}</h2>
            <p className="text-[9px] text-text-dim uppercase mt-1 italic font-bold">VENTAS ACTUALES (SEMANA)</p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between group h-32 border-l-4 border-emerald-600">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Pedidos vs Mes Ant.</span>
            <div className={cn(
              "text-[10px] font-mono px-2 py-0.5 rounded",
              (performance.ordersVsPreviousMonth || 0) > 0 ? "text-emerald-400 bg-emerald-500/10" : "text-red-400 bg-red-500/10"
            )}>
              {performance.ordersVsPreviousMonth && (performance.ordersVsPreviousMonth > 0 ? '+' : '')}{performance.ordersVsPreviousMonth}%
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-mono font-bold text-text-main">${(performance.monthlyOrdersAmount || 0).toLocaleString()}</h2>
            <p className="text-[9px] text-text-dim uppercase mt-1 italic font-bold">COMPRAS + MOVIMIENTOS (MES)</p>
          </div>
        </Card>

        <Card className="flex flex-col justify-between group h-32 border-l-4 border-blue-500">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Proyección Mensual</span>
            <TrendingUp size={14} className="text-blue-500" />
          </div>
          <div>
            <h2 className="text-2xl font-mono font-bold text-text-main">${(performance.monthlyProjection || 0).toLocaleString()}</h2>
            <p className="text-[9px] text-text-dim uppercase mt-1 italic font-bold">ESTIMADO FIN DE MES</p>
          </div>
        </Card>

        {selectedBranchId === 'all' ? (
          <Card className="h-32 border-l-4 border-yellow-500 flex flex-col justify-center items-center bg-yellow-500/5">
             <Star size={24} className="text-yellow-500 mb-1" />
             <p className="text-[10px] font-black text-text-dim uppercase">Métricas Google</p>
             <p className="text-[8px] text-text-dim italic">Ver desglose abajo</p>
          </Card>
        ) : (
          branches.length > 0 && <GoogleMetricsCard branch={branches.find(b => b.id === selectedBranchId) || branches[0]} />
        )}
      </div>

      {/* Google Maps Performance Row */}
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-dim border-b border-border-dim pb-2 flex items-center gap-2 mt-8">
        <MapPin size={12} className="text-yellow-500" />
        Reputación en Google Maps
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {selectedBranchId === 'all' ? (
          branches.filter(b => b.googlePlaceId).map(branch => (
            <GoogleMetricsCard key={branch.id} branch={branch} />
          ))
        ) : (
          <div className="col-span-full">
            {branches.length > 0 && <GoogleMetricsCard branch={branches.find(b => b.id === selectedBranchId) || branches[0]} />}
          </div>
        )}
        {branches.filter(b => b.googlePlaceId).length === 0 && (
          <div className="col-span-full p-8 text-center border-2 border-dashed border-border-dim rounded-lg">
            <p className="text-[10px] font-bold text-text-dim uppercase">No hay sucursales vinculadas a Google Maps</p>
            <p className="text-[9px] text-text-dim italic mt-1">Configura el Place ID en Gestión Sucursales</p>
          </div>
        )}
      </div>

      {/* Ratings Row */}
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-dim border-b border-border-dim pb-2 flex items-center gap-2 mt-8">
        <Star size={12} className="text-brand-500" />
        Calificaciones Delivery
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="h-32 border-l-4 border-red-500 relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Pedidos Ya Restó</span>
            <div className="bg-red-500 text-white text-[8px] px-1.5 py-0.5 rounded font-black">PY</div>
          </div>
          <div className="flex items-center gap-4">
            <h2 className="text-3xl font-mono font-black text-text-main">{performance.pedidosYaRating}</h2>
            <div className="flex-1">
              <div className="flex justify-between text-[9px] text-text-dim mb-1 font-bold uppercase">
                <span>Alertas: {performance.pedidosYaNegativeComments}</span>
                <span>Demora: {performance.pedidosYaDelayMinutes}m</span>
              </div>
              <div className="w-full bg-bg-accent h-1.5 rounded-full overflow-hidden">
                <div className="bg-red-500 h-full" style={{ width: `${(performance.pedidosYaRating / 5) * 100}%` }} />
              </div>
            </div>
          </div>
        </Card>

        <Card className="h-32 border-l-4 border-orange-500 relative overflow-hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Pedidos Ya Café</span>
            <Coffee size={14} className="text-orange-500" />
          </div>
          <div className="flex items-center gap-4">
            <h2 className="text-3xl font-mono font-black text-text-main">{performance.pedidosYaCafeRating}</h2>
            <div className="flex-1">
              <div className="flex justify-between text-[9px] text-text-dim mb-1 font-bold uppercase">
                <span>Rating Café</span>
                <span>/ 5.0</span>
              </div>
              <div className="w-full bg-bg-accent h-1.5 rounded-full overflow-hidden">
                <div className="bg-orange-500 h-full" style={{ width: `${((performance.pedidosYaCafeRating || 0) / 5) * 100}%` }} />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Critical Deviations Row */}
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-dim border-b border-border-dim pb-2 flex items-center gap-2 mt-8">
        <Bell size={12} className="text-red-500 animate-pulse" />
        Desvíos Críticos (Alertas)
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={cn(
          "h-32 flex flex-col justify-between border-l-4",
          (performance.criticalStockDeviations || 0) > 0 ? "border-red-600 bg-red-500/5" : "border-emerald-500"
        )}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Desvíos Stock</span>
            <Package size={14} className={(performance.criticalStockDeviations || 0) > 0 ? "text-red-600" : "text-emerald-500"} />
          </div>
          <div>
            <h2 className={cn(
              "text-3xl font-mono font-black",
              (performance.criticalStockDeviations || 0) > 0 ? "text-red-600" : "text-emerald-500"
            )}>
              {performance.criticalStockDeviations}
            </h2>
            <p className="text-[9px] text-text-dim uppercase mt-1 font-bold">INSUMOS FUERA DE TOLERANCIA</p>
          </div>
        </Card>

        <Card className={cn(
          "h-32 flex flex-col justify-between border-l-4",
          (performance.criticalTablewareDeviations || 0) > 0 ? "border-red-600 bg-red-500/5" : "border-emerald-500"
        )}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Desvíos Vajilla</span>
            <Utensils size={14} className={(performance.criticalTablewareDeviations || 0) > 0 ? "text-red-600" : "text-emerald-500"} />
          </div>
          <div>
            <h2 className={cn(
              "text-3xl font-mono font-black",
              (performance.criticalTablewareDeviations || 0) > 0 ? "text-red-600" : "text-emerald-500"
            )}>
              {performance.criticalTablewareDeviations}
            </h2>
            <p className="text-[9px] text-text-dim uppercase mt-1 font-bold">FALTANTES CRÍTICOS SEMANA</p>
          </div>
        </Card>

        <Card className={cn(
          "h-32 flex flex-col justify-between border-l-4",
          (performance.criticalHourDeviations || 0) > 0 ? "border-red-600 bg-red-500/5" : "border-emerald-500"
        )}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold text-text-dim uppercase tracking-wider">Desvíos Horas por Puesto</span>
            <Clock size={14} className={(performance.criticalHourDeviations || 0) > 0 ? "text-red-600" : "text-emerald-500"} />
          </div>
          <div className="space-y-1">
            {performance.hourlyDeviationsByPosition && Object.entries(performance.hourlyDeviationsByPosition).map(([pos, dev]) => (
              <div key={pos} className="flex justify-between items-center bg-bg-card/50 px-2 py-0.5 rounded border border-border-dim/30">
                <span className="text-[8px] font-black text-text-dim uppercase truncate mr-2">{pos}</span>
                <span className={cn(
                  "text-[9px] font-mono font-black",
                  dev > 0 ? "text-red-500" : dev < 0 ? "text-emerald-500" : "text-text-dim"
                )}>
                  {dev > 0 ? '+' : ''}{dev}h
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>
      
      {/* Supervision Flags Row */}
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-dim border-b border-border-dim pb-2 flex items-center gap-2 mt-8">
        <Flag size={12} className="text-brand-500" />
        Banderas de Supervisión (Estado Operativo)
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {selectedBranchId === 'all' ? (
          branches.map(branch => (
            <Card key={branch.id} className="h-24 flex items-center justify-between p-4 group hover:border-brand-500/50 transition-all">
              <div>
                <p className="text-[8px] font-black text-text-dim uppercase tracking-widest mb-1">{branch.name}</p>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                    <span className="text-[10px] font-mono font-bold text-red-500">1</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-yellow-500 shadow-[0_0_8px_rgba(234,179,8,0.5)]" />
                    <span className="text-[10px] font-mono font-bold text-yellow-500">2</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-[10px] font-mono font-bold text-emerald-500">8</span>
                  </div>
                </div>
              </div>
              <ChevronRight size={14} className="text-text-dim opacity-0 group-hover:opacity-100 transition-all" />
            </Card>
          ))
        ) : (
          <React.Fragment>
            <div className="col-span-full grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="h-32 flex flex-col items-center justify-center border-b-4 border-red-500 bg-red-500/5 group hover:scale-[1.02] transition-transform">
                <Flag size={20} className="text-red-500 mb-2 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                <h2 className="text-3xl font-mono font-black text-red-500">{performance.currentFlags?.red || 0}</h2>
                <p className="text-[10px] font-black text-text-dim uppercase mt-1">BANDERAS ROJAS</p>
              </Card>
              <Card className="h-32 flex flex-col items-center justify-center border-b-4 border-yellow-500 bg-yellow-500/5 group hover:scale-[1.02] transition-transform">
                <Flag size={20} className="text-yellow-500 mb-2 drop-shadow-[0_0_10px_rgba(234,179,8,0.5)]" />
                <h2 className="text-3xl font-mono font-black text-yellow-500">{performance.currentFlags?.yellow || 0}</h2>
                <p className="text-[10px] font-black text-text-dim uppercase mt-1">BANDERAS AMARILLAS</p>
              </Card>
              <Card className="h-32 flex flex-col items-center justify-center border-b-4 border-emerald-500 bg-emerald-500/5 group hover:scale-[1.02] transition-transform">
                <Flag size={20} className="text-emerald-500 mb-2 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
                <h2 className="text-3xl font-mono font-black text-emerald-500">{performance.currentFlags?.green || 0}</h2>
                <p className="text-[10px] font-black text-text-dim uppercase mt-1">BANDERAS VERDES</p>
              </Card>
            </div>
          </React.Fragment>
        )}
      </div>

      {/* Main Stats Row - Chart moved down */}
      <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-text-dim border-b border-border-dim pb-2 flex items-center gap-2 mt-8">
        <BarChart3 size={12} className="text-brand-500" />
        Evolución de Ventas
      </h3>
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 lg:col-span-12 p-4">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xs font-bold uppercase text-text-dim border-l-2 border-brand-500 pl-2">Análisis de Ventas Semanal</h3>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={filteredSales}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-dim)" opacity={0.5} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fill: 'var(--text-dim)', fontWeight: 600 }}
                  tickFormatter={(val) => `DIA ${val.split('-')[2]}`}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{ fontSize: 9, fill: 'var(--text-dim)', fontVariantNumeric: 'tabular-nums' }}
                  tickFormatter={(val) => `$${val/1000}k`}
                />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'var(--bg-card)', borderRadius: '4px', border: '1px solid var(--border-dim)', padding: '8px' }}
                  itemStyle={{ fontWeight: 700, fontSize: '12px', color: '#f97316' }}
                  labelStyle={{ color: 'var(--text-dim)', fontSize: '10px', textTransform: 'uppercase' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="pesos" 
                  stroke="#f97316" 
                  strokeWidth={2} 
                  fillOpacity={0.1} 
                  fill="#f97316" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </motion.div>
  );
}

