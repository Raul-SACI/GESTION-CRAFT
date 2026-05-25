/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Vercel deployment trigger
import React, { useState, useMemo, useEffect, lazy, Suspense, useCallback } from 'react';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Utensils, 
  Users, 
  Package, 
  Star, 
  ClipboardList, 
  Tag,
  Trophy,
  Bell,
  Search,
  ChevronRight,
  Flag,
  Layers,
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
  ClipboardCheck,
  Trash2,
  ListOrdered,
  Settings,
  ArrowUp,
  ArrowDown,
  Landmark,
  Crown,
  Lock
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
  SalesData, 
  PerformanceData,
  Branch,
  StockItem,
  Product
} from './types';
import { supabase } from './lib/supabase';

// Lazy load views for better performance
const SociosDashboardView = lazy(() => import('./components/SociosDashboardView'));
const SalesView = lazy(() => import('./components/SalesView'));
const ConsumoView = lazy(() => import('./components/ConsumoView'));
const HourControlView = lazy(() => import('./components/SueldosView'));
const HourBudgetView = lazy(() => import('./components/HourBudgetView'));
const AprobacionPresupuestosView = lazy(() => import('./components/AprobacionPresupuestosView'));
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
const DecomisosView = lazy(() => import('./components/DecomisosView'));
const PerformanceView = lazy(() => import('./components/PerformanceView'));
const PerformanceAdminView = lazy(() => import('./components/PerformanceAdminView'));
const SupervisionFlagsView = lazy(() => import('./components/SupervisionFlagsView'));
const SupervisionsExecutionView = lazy(() => import('./components/SupervisionsExecutionView'));
const DocumentsView = lazy(() => import('./components/DocumentsView'));
const TablewareView = lazy(() => import('./components/TablewareView'));
const ProductionCenterView = lazy(() => import('./components/ProductionCenterView'));
const ProductionStockControlView = lazy(() => import('./components/ProductionStockControlView'));

import { NewsView } from './components/ExtraViews';
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

import { APIProvider } from '@vis.gl/react-google-maps';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

interface MenuItem { id: string; label: string; icon: any; }

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
  const [activeTab, setActiveTab] = useState('socios_dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);

  React.useEffect(() => {
    if (!isDarkMode) {
      document.documentElement.classList.add('light-mode');
    } else {
      document.documentElement.classList.remove('light-mode');
    }
  }, [isDarkMode]);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [isBranchesLoading, setIsBranchesLoading] = useState(true);
  const [items, setItems] = useState<StockItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [currentUserProfile, setCurrentUserProfile] = useState<any>(null);
  const [availableProfiles, setAvailableProfiles] = useState<any[]>([]);
  const [rolesConfigList, setRolesConfigList] = useState<any[]>([]);
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);

  // Load profiles and roles for switching representation
  const loadAccessControlData = useCallback(async () => {
    try {
      const { data: rolesData } = await supabase.from('roles_config').select('*');
      const { data: profilesData } = await supabase.from('profiles').select('*').order('name');
      
      if (rolesData) setRolesConfigList(rolesData);
      if (profilesData) {
        setAvailableProfiles(profilesData);
        setCurrentUserProfile((prev: any) => {
          if (!prev) {
            return profilesData.find((p: any) => p.id === 'usr-admin') || profilesData[0] || null;
          }
          const latest = profilesData.find((p: any) => p.id === prev.id);
          return latest || prev;
        });
      }
    } catch (e) {
      console.error('Error loading Access Control data in App:', e);
    }
  }, []);

  useEffect(() => {
    loadAccessControlData();
  }, [activeTab, loadAccessControlData]);

  // Fetch items, products and branches from Supabase
  React.useEffect(() => {
    const fetchData = async () => {
      // Fetch Branches
      setIsBranchesLoading(true);
      try {
        const { data: branchesData, error: branchesError } = await supabase
          .from('branches')
          .select('*');
        
        if (branchesError) {
          console.error('Error fetching branches:', branchesError);
        } else if (branchesData && branchesData.length > 0) {
          setBranches(branchesData.map(b => {
            const baseline = getGoogleBaseline(b.name, b.id);
            // Self-healing of outdated values for Barrio Sur and others to display actual ratings
            let r = b.google_rating !== undefined && b.google_rating !== null ? Number(b.google_rating) : undefined;
            let c = b.google_rating_count !== undefined && b.google_rating_count !== null ? Number(b.google_rating_count) : undefined;
            
            if (b.id === 'bs' && (r === 4.5 || r === undefined)) {
              r = 4.9;
              c = 778;
            }
            if (b.id === 'bn' && (r === undefined)) {
              r = 4.7;
              c = 7399;
            }
            if (b.id === 'mt' && (r === undefined)) {
              r = 4.5;
              c = 3410;
            }
            if (b.id === 'pn' && (r === undefined)) {
              r = 4.5;
              c = 1890;
            }
            if (b.id === 'ml' && (r === undefined)) {
              r = 4.4;
              c = 2750;
            }
            
            return {
              id: b.id,
              name: b.name,
              location: b.location === 'San Lorenzo 456, Tucumán' ? 'Batalla de Chacabuco 688, Tucumán' : b.location,
              isActive: b.is_active,
              googleMapsUrl: b.google_maps_url,
              googleReviewUrl: b.google_review_url,
              googlePlaceId: b.google_place_id,
              googleRating: r || baseline.rating,
              googleRatingCount: c || baseline.userRatingCount
            };
          }));
        } else {
          // Fallback defaults
          const defaults: Branch[] = [
            { id: 'bn', name: 'CRAFT Barrio Norte', location: 'Av. Belgrano 123, Tucumán', isActive: true, googleMapsUrl: 'https://www.google.com/maps/place/CRAFT+Barrio+Norte/data=!4m2!3m1!1s0x0:0x1fdb8452ca845bc1?sa=X&ved=1t:2428&ictx=111', googleRating: 4.7, googleRatingCount: 7399 },
            { id: 'bs', name: 'CRAFT Barrio Sur', location: 'Batalla de Chacabuco 688, Tucumán', isActive: true, googleRating: 4.9, googleRatingCount: 778 },
            { id: 'mt', name: 'CRAFT Mercato', location: 'San Lorenzo 207, Yerba Buena, Tucumán', isActive: true, googlePlaceId: 'ChIJz3uE95S6U5YRMmP_V1kY9B0', googleRating: 4.5, googleRatingCount: 3410 },
            { id: 'pn', name: 'CRAFT Perón', location: 'Av. Perón 1000, Yerba Buena', isActive: true, googleRating: 4.5, googleRatingCount: 1890 },
            { id: 'ml', name: 'CRAFT Mate de Luna', location: 'Av. Mate de Luna 2000, Tucumán', isActive: true, googleRating: 4.4, googleRatingCount: 2750 },
          ];
          setBranches(defaults);
        }
      } catch (err) {
        console.error('Branches fetch catch:', err);
      } finally {
        setIsBranchesLoading(false);
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

    const profilesChannel = supabase.channel('profiles_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadAccessControlData)
      .subscribe();

    const rolesChannel = supabase.channel('roles_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roles_config' }, loadAccessControlData)
      .subscribe();

    return () => {
      supabase.removeChannel(itemsChannel);
      supabase.removeChannel(productsChannel);
      supabase.removeChannel(branchesChannel);
      supabase.removeChannel(profilesChannel);
      supabase.removeChannel(rolesChannel);
    };
  }, [loadAccessControlData]);

  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');

  const currentUser = useMemo(() => {
    if (!currentUserProfile) {
      return {
        id: 'usr-admin',
        name: 'ADMINISTRADOR',
        role: 'administrador',
        branch: 'Todas las Sucursales',
        permissions: ['socios_dashboard', 'dashboard', 'stock', 'desempeño', 'vajilla', 'horas', 'novedades', 'decomisos', 'papeles_sucursal', 'cuentas', 'control_horas', 'gestion_sueldos', 'presupuesto_horas', 'agenda', 'supervisiones_operativas', 'produccion_mes', 'produccion_stock_control', 'bank_liabilities', 'tax_liabilities', 'cronograma_pagos', 'finanzas_mensual', 'ventas', 'consumo', 'control_desvios', 'supervision_banderas', 'papeles_administracion', 'aprobacion_presupuestos', 'finanzas_estimado', 'precios', 'p&l', 'performance_admin', 'sucursales', 'usuarios'],
        isReadOnly: false,
        accessScope: 'all_branches' as 'all_branches' | 'single_branch'
      };
    }
    
    const roleId = currentUserProfile.role;
    const roleCfg = rolesConfigList.find((r: any) => r.id === roleId);
    
    return {
      id: currentUserProfile.id,
      name: currentUserProfile.name,
      role: roleId,
      branch: currentUserProfile.branch_name || 'Todas las Sucursales',
      permissions: roleCfg ? roleCfg.allowed_modules : (currentUserProfile.permissions || []),
      isReadOnly: roleCfg ? Boolean(roleCfg.is_read_only) : false,
      accessScope: (roleCfg ? roleCfg.access_scope : 'all_branches') as 'all_branches' | 'single_branch'
    };
  }, [currentUserProfile, rolesConfigList]);

  // Find current user's branch ID
  const currentUserBranchId = useMemo(() => {
    if (!currentUser.branch || currentUser.branch === 'Todas las Sucursales') return 'all';
    const found = branches.find(b => b.name.toUpperCase() === currentUser.branch?.toUpperCase());
    return found ? found.id : 'all';
  }, [currentUser.branch, branches]);

  // Lock selectedBranchId if single_branch role
  useEffect(() => {
    if (currentUser.accessScope === 'single_branch' && currentUserBranchId !== 'all') {
      setSelectedBranchId(currentUserBranchId);
    }
  }, [currentUser, currentUserBranchId, branches, selectedBranchId]);

  // Sidebar Customization State
  const [isReorderingMode, setIsReorderingMode] = useState(false);
  const [menuConfig, setMenuConfig] = useState<Record<string, MenuItem[]>>({
    'Socios': [
      { id: 'socios_dashboard', label: 'Dashboard de Socios', icon: Landmark }
    ],
    'Gestión Sucursal': [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'stock', label: 'Control Stock', icon: Package },
      { id: 'desempeño', label: 'Desempeño', icon: Star },
      { id: 'vajilla', label: 'Vajilla', icon: Utensils },
      { id: 'horas', label: 'Carga de Horas', icon: Clock },
      { id: 'novedades', label: 'Novedades', icon: ClipboardList },
      { id: 'decomisos', label: 'Decomisos diarios', icon: Trash2 },
      { id: 'papeles_sucursal', label: 'Papeles Importantes', icon: FileText },
      { id: 'cuentas', label: 'Cuentas y Contraseñas', icon: Key },
    ],
    'Recursos Humanos': [
      { id: 'control_horas', label: 'Control de Horas', icon: ShieldCheck },
      { id: 'gestion_sueldos', label: 'Maestro de Personal', icon: Users },
    ],
    'Gestión Líderes Operativos': [
      { id: 'presupuesto_horas', label: 'Presupuestador de horas', icon: Calendar },
      { id: 'agenda', label: 'Agenda Supervisores', icon: ClipboardList },
      { id: 'supervisiones_operativas', label: 'Supervisiones', icon: Flag },
    ],
    'Centro de Producción': [
      { id: 'produccion_mes', label: 'Producción del mes', icon: Factory },
      { id: 'produccion_stock_control', label: 'Control de Stock', icon: ClipboardCheck },
    ],
    'Finanzas': [
      { id: 'bank_liabilities', label: 'Pasivos Bancarios', icon: Building2 },
      { id: 'tax_liabilities', label: 'Pasivos Fiscales', icon: Calculator },
      { id: 'cronograma_pagos', label: 'Cronograma de Pagos', icon: Calendar },
      { id: 'finanzas_mensual', label: 'Flujo de Caja Mensual', icon: BarChart3 },
    ],
    'Administración': [
      { id: 'ventas', label: 'Ventas', icon: TrendingUp },
      { id: 'consumo', label: 'CMV Mensual Sucursal', icon: Calculator },
      { id: 'control_desvios', label: 'Control de Desvíos', icon: ShieldCheck },
      { id: 'supervision_banderas', label: 'Supervisiones y Banderas', icon: Flag },
      { id: 'papeles_administracion', label: 'Papeles Importantes', icon: FileText },
    ],
    'Gerencia General': [
      { id: 'aprobacion_presupuestos', label: 'Aprobación de Presupuestos', icon: Layers },
      { id: 'finanzas_estimado', label: 'Flujo de Caja Estimado', icon: TrendingUp },
      { id: 'precios', label: 'Lista de Precios', icon: Tag },
      { id: 'p&l', label: 'Estado de Resultado', icon: BarChart3 },
      { id: 'performance_admin', label: 'Configuración de Premios', icon: Trophy }
    ],
    'Configuración': [
      { id: 'sucursales', label: 'Gestión Sucursales', icon: Building2 },
      { id: 'usuarios', label: 'Usuarios/Roles', icon: Users },
    ]
  });

  // Load menu config from Supabase or LocalStorage
  useEffect(() => {
    const savedConfig = localStorage.getItem('craft_sidebar_order');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        // Map icons back because they are not serializable
        const iconMap: Record<string, any> = {
          socios_dashboard: Landmark,
          dashboard: LayoutDashboard,
          stock: Package,
          desempeño: Star,
          vajilla: Utensils,
          horas: Clock,
          novedades: ClipboardList,
          decomisos: Trash2,
          papeles_sucursal: FileText,
          cuentas: Key,
          control_horas: ShieldCheck,
          gestion_sueldos: Users,
          presupuesto_horas: Calendar,
          agenda: ClipboardList,
          supervisiones_operativas: Flag,
          produccion_mes: Factory,
          produccion_stock_control: ClipboardCheck,
          finanzas_estimado: TrendingUp,
          bank_liabilities: Building2,
          tax_liabilities: Calculator,
          cronograma_pagos: Calendar,
          finanzas_mensual: BarChart3,
          ventas: TrendingUp,
          'p&l': BarChart3,
          consumo: Calculator,
          control_desvios: ShieldCheck,
          supervision_banderas: Flag,
          papeles_administracion: FileText,
          precios: Tag,
          performance_admin: Trophy,
          aprobacion_presupuestos: Layers,
          sucursales: Building2,
          usuarios: Users
        };

        const rehydrated: Record<string, MenuItem[]> = {};
        Object.entries(parsed as Record<string, {id: string, label: string}[]>).forEach(([section, items]) => {
          rehydrated[section] = items.map((item) => ({
            ...item,
            label: item.id === 'gestion_sueldos' ? 'Maestro de Personal' : item.label,
            icon: iconMap[item.id] || ListOrdered
          }));
        });

        // Merge with defaults to ensure new modules are visible even if a custom order was saved
        const merged = { ...menuConfig };
        Object.keys(rehydrated).forEach(section => {
          if (merged[section]) {
            // Start with rehydrated items
            const newItems = [...rehydrated[section]];
            // Find items in default config that are NOT in rehydrated
            const defaultSectionItems = menuConfig[section];
            defaultSectionItems.forEach(defItem => {
              if (!newItems.find(ni => ni.id === defItem.id)) {
                newItems.push(defItem);
              }
            });
            merged[section] = newItems;
          } else {
            merged[section] = rehydrated[section];
          }
        });

        // Ensure missing sections like Gerencia General are present
        Object.keys(menuConfig).forEach(section => {
          if (!merged[section]) {
            merged[section] = menuConfig[section];
          }
        });

        setMenuConfig(merged);
      } catch (e) {
        console.error('Error loading menu config', e);
      }
    }
  }, []);

  const saveMenuConfig = (newConfig: Record<string, MenuItem[]>) => {
    setMenuConfig(newConfig);
    // Persist only IDs and labels (non-serializable icons are excluded)
    const serializable = Object.fromEntries(
      Object.entries(newConfig).map(([section, items]) => [
        section,
        (items as MenuItem[]).map(({ id, label }) => ({ id, label }))
      ])
    );
    localStorage.setItem('craft_sidebar_order', JSON.stringify(serializable));
  };

  const moveModule = (section: string, index: number, direction: 'up' | 'down') => {
    const newItems = [...menuConfig[section]];
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (newIndex < 0 || newIndex >= newItems.length) return;

    [newItems[index], newItems[newIndex]] = [newItems[newIndex], newItems[index]];
    
    saveMenuConfig({
      ...menuConfig,
      [section]: newItems
    });
  };
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchUrl, setNewBranchUrl] = useState('');
  const [newBranchLocation, setNewBranchLocation] = useState('');
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [controlledItemIds, setControlledItemIds] = useState<string[]>(['1', '2', '3', '4']);

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
        google_place_id: updated.googlePlaceId,
        google_rating: updated.googleRating,
        google_rating_count: updated.googleRatingCount
      }, { onConflict: 'id' });

    if (error) {
      console.error('Error upserting branch in Supabase:', error);
      alert(`Error al guardar los cambios: ${error.message || 'Error desconocido'}`);
    } else {
      // Update local state ONLY if success or no real DB configured
      setBranches(prev => prev.map(b => b.id === updated.id ? updated : b));
    }
  };

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
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'stock', label: 'Control Stock', icon: Package },
    { id: 'desempeño', label: 'Desempeño', icon: Star },
    { id: 'vajilla', label: 'Vajilla', icon: Utensils },
    { id: 'horas', label: 'Carga de Horas', icon: Clock },
    { id: 'novedades', label: 'Novedades', icon: ClipboardList },
    { id: 'decomisos', label: 'Decomisos diarios', icon: Trash2 },
    { id: 'papeles_sucursal', label: 'Papeles Importantes', icon: FileText },
    { id: 'cuentas', label: 'Cuentas y Contraseñas', icon: Key },
  ];

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
            <span className="text-[10px] font-semibold text-sidebar-dim uppercase tracking-wider">Navegación</span>
            {!isSidebarCollapsed && (
              <div className="flex gap-1">
                {currentUser.role === 'dueño' && (
                  <button 
                    onClick={() => setIsReorderingMode(!isReorderingMode)}
                    className={cn(
                      "p-1 rounded transition-all",
                      isReorderingMode ? "bg-brand-500 text-black" : "hover:bg-bg-accent text-sidebar-dim hover:text-brand-500"
                    )}
                    title="Configurar Orden de Sidebar"
                  >
                    <ListOrdered size={14} />
                  </button>
                )}
                <button 
                  onClick={() => setIsSidebarCollapsed(true)}
                  className="p-1 hover:bg-bg-accent rounded text-sidebar-dim hover:text-brand-500 transition-all"
                  title="Esconder Menú"
                >
                  <PanelLeftClose size={14} />
                </button>
              </div>
            )}
          </div>

          {Object.entries(menuConfig).map(([sectionName, items]) => {
            const typedItems = items as MenuItem[];
            const filteredItems = typedItems.filter(item => 
              currentUser.role === 'dueño' || currentUser.permissions?.includes(item.id)
            );

            if (filteredItems.length === 0) return null;

            return (
              <React.Fragment key={sectionName}>
                <div className="px-4 mb-2 mt-6 text-[10px] font-semibold text-sidebar-dim uppercase tracking-wider flex justify-between items-center group">
                  {sectionName}
                </div>
                {filteredItems.map((item, index) => (
                  <div key={item.id} className="relative group/item">
                    <button
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
                    {isReorderingMode && currentUser.role === 'dueño' && (
                      <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                        <button 
                          disabled={index === 0}
                          onClick={(e) => { e.stopPropagation(); moveModule(sectionName, index, 'up'); }}
                          className="p-1 bg-bg-sidebar border border-border-dim rounded text-text-dim hover:text-brand-500 hover:border-brand-500 disabled:opacity-0"
                        >
                          <ArrowUp size={10} />
                        </button>
                        <button 
                          disabled={index === filteredItems.length - 1}
                          onClick={(e) => { e.stopPropagation(); moveModule(sectionName, index, 'down'); }}
                          className="p-1 bg-bg-sidebar border border-border-dim rounded text-text-dim hover:text-brand-500 hover:border-brand-500 disabled:opacity-0"
                        >
                          <ArrowDown size={10} />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </React.Fragment>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border bg-sidebar-border/10 relative">
          {showProfileSwitcher && availableProfiles.length > 0 && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-bg-sidebar border border-border-dim rounded-lg shadow-2xl p-2 max-h-60 overflow-y-auto z-50 space-y-1">
              <p className="text-[9px] font-black uppercase text-brand-500 px-2 pb-1.5 border-b border-border-dim mb-1 tracking-widest leading-none">Simulación de Rol</p>
              {availableProfiles.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setCurrentUserProfile(p);
                    setShowProfileSwitcher(false);
                  }}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded transition-all text-[11px] font-bold flex flex-col gap-0.5",
                    currentUserProfile?.id === p.id 
                      ? "bg-brand-500 text-black" 
                      : "text-text-main hover:bg-white/5"
                  )}
                >
                  <span className="truncate uppercase">{p.name || 'Sin Nombre'}</span>
                  <span className={cn(
                    "text-[8px] uppercase font-black tracking-wider leading-none",
                    currentUserProfile?.id === p.id ? "text-black/60" : "text-text-dim"
                  )}>{p.role.replace('_', ' ')} • {p.branch_name || 'Todas'}</span>
                </button>
              ))}
            </div>
          )}
          
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowProfileSwitcher(!showProfileSwitcher)}
              className="w-8 h-8 rounded-full bg-brand-500 hover:scale-105 transition-all text-black font-extrabold text-[10px] uppercase flex items-center justify-center shrink-0 shadow-lg shadow-brand-500/20"
              title="Cambiar Perfil"
            >
              {currentUser.name ? currentUser.name.substring(0, 2).toUpperCase() : 'US'}
            </button>
            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setShowProfileSwitcher(!showProfileSwitcher)}>
              <p className="text-xs font-bold truncate text-sidebar-text leading-tight uppercase font-sans">{currentUser.name}</p>
              <p className="text-[9px] text-brand-500 font-black uppercase tracking-wider mt-0.5">{currentUser.role.replace('_', ' ')}</p>
              <p className="text-[8px] text-sidebar-dim font-bold uppercase tracking-wider mt-0.5">{currentUser.branch}</p>
            </div>
            <button 
              onClick={() => setShowProfileSwitcher(!showProfileSwitcher)}
              className={cn(
                "p-1.5 rounded text-sidebar-dim hover:text-brand-500 hover:bg-white/5 transition-all",
                showProfileSwitcher && "text-brand-500 bg-white/5"
              )}
              title="Seleccionar Usuario"
            >
              <Users size={14} />
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

            {/* Sucursal Activa and Ventas Semanales removed per user requirement */}
            {['dashboard', 'stock', 'desempeño', 'vajilla', 'horas', 'novedades', 'decomisos', 'papeles_sucursal', 'cuentas'].includes(activeTab) && (
              <div className="flex items-center gap-3 bg-bg-card border border-border-dim px-4 py-2 rounded-lg">
                <span className="text-[10px] font-black uppercase text-text-dim tracking-wider">Filtrar por Sucursal:</span>
                <select
                  value={selectedBranchId}
                  onChange={(e) => {
                    if (currentUser.accessScope === 'single_branch' && currentUserBranchId !== 'all') {
                      setSelectedBranchId(currentUserBranchId);
                    } else {
                      setSelectedBranchId(e.target.value);
                    }
                  }}
                  disabled={currentUser.accessScope === 'single_branch'}
                  className={`bg-transparent border-none text-xs font-black uppercase tracking-widest focus:ring-0 outline-none ${
                    currentUser.accessScope === 'single_branch' 
                      ? "text-brand-500/50 cursor-not-allowed opacity-70" 
                      : "text-brand-500 cursor-pointer"
                  }`}
                >
                  {currentUser.accessScope !== 'single_branch' && (
                    <option value="all" className="bg-bg-card font-bold text-text-main">CONSOLIDADO (TODAS)</option>
                  )}
                  {branches
                    .filter(b => currentUser.accessScope !== 'single_branch' || b.id === currentUserBranchId)
                    .map(b => (
                      <option key={b.id} value={b.id} className="bg-bg-card font-bold text-text-main">{b.name}</option>
                    ))}
                </select>
              </div>
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
          {currentUser.isReadOnly && (
            <div className="bg-brand-500/10 text-brand-500 border border-brand-500/20 px-6 py-3 rounded-lg mb-6 flex items-center gap-3 text-xs font-black uppercase tracking-widest animate-pulse">
              <Lock size={16} />
              <span>MODO SOLO LECTURA ACTIVO • LOS CAMBIOS DE ESCRITURA ESTÁN RESTRINGIDOS PARA ESTE PERFIL</span>
            </div>
          )}
          <Suspense fallback={<LoadingState />}>
            <AnimatePresence mode="wait">
              {activeTab === 'socios_dashboard' && (
                <SociosDashboardView branches={branches} />
              )}
              {activeTab === 'dashboard' && (
                <DashboardView 
                  salesComparison={salesComparison} 
                  performance={MOCK_PERFORMANCE}
                  branches={branches}
                  selectedBranchId={selectedBranchId}
                />
              )}
              {activeTab === 'desempeño' && (
                <PerformanceView key="desempeño" branches={branches} selectedBranchId={selectedBranchId} />
              )}
              {activeTab === 'performance_admin' && (
                <PerformanceAdminView branches={branches} selectedBranchId={selectedBranchId} />
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
              {activeTab === 'decomisos' && (
                <DecomisosView 
                  key="decomisos" 
                  branches={branches} 
                  selectedBranchId={selectedBranchId}
                  items={items}
                  products={products}
                />
              )}
              {activeTab === 'precios' && <PriceListView key="precios" />}
              {activeTab === 'gestion_sueldos' && <SalaryManagementView key="gestion_sueldos" branches={branches} />}
              {activeTab === 'vajilla' && <TablewareView key="vajilla" branches={branches} selectedBranchId={selectedBranchId} />}
              {activeTab === 'novedades' && <NewsView key="novedades" branches={branches} selectedBranchId={selectedBranchId} isReadOnly={currentUser.isReadOnly} />}
              {activeTab === 'cuentas' && <PasswordManagementView key="cuentas" />}
              {activeTab === 'papeles_sucursal' && (
                <DocumentsView 
                  key="papeles_sucursal" 
                  mode="encargado" 
                  branchId={selectedBranchId} 
                  branchName={selectedBranchId === 'all' ? 'Todas' : branches.find(b => b.id === selectedBranchId)?.name}
                  branches={branches}
                  onBranchSelect={(id) => setSelectedBranchId(id)}
                  isReadOnly={currentUser.isReadOnly}
                />
              )}
              {activeTab === 'produccion_mes' && <ProductionCenterView key="produccion_mes" />}
              {activeTab === 'produccion_stock_control' && <ProductionStockControlView key="produccion_stock_control" />}
              {activeTab === 'papeles_administracion' && (
                <DocumentsView 
                  key="papeles_administracion" 
                  mode="administracion" 
                  isReadOnly={currentUser.isReadOnly}
                />
              )}
              {activeTab === 'control_horas' && <HrHourControlView key="control_horas" branches={branches} />}
              {activeTab === 'aprobacion_presupuestos' && <AprobacionPresupuestosView key="aprobacion_presupuestos" branches={branches} />}
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

import { useMapsLibrary } from '@vis.gl/react-google-maps';

export function getGoogleBaseline(name: string = '', id: string = '') {
  const normName = name.toUpperCase();
  const normId = id.toLowerCase();
  
  if (normName.includes('BARRIO NORTE') || normId === 'bn') {
    return { rating: 4.7, userRatingCount: 7399 };
  }
  if (normName.includes('BARRIO SUR') || normId === 'bs') {
    return { rating: 4.9, userRatingCount: 778 };
  }
  if (normName.includes('MERCATO') || normId === 'mt') {
    return { rating: 4.5, userRatingCount: 3410 };
  }
  if (normName.includes('PERON') || normName.includes('PERÓN') || normId === 'pn') {
    return { rating: 4.5, userRatingCount: 1890 };
  }
  if (normName.includes('MATE DE LUNA') || normId === 'ml') {
    return { rating: 4.4, userRatingCount: 2750 };
  }
  if (normName.includes('CASCO VIEJO')) {
    return { rating: 4.6, userRatingCount: 6480 };
  }
  if (normName.includes('DEPOSITO') || normName.includes('DEPÓSITO')) {
    return { rating: 4.2, userRatingCount: 34 };
  }
  return { rating: 4.5, userRatingCount: 150 };
}

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
    if (!branch.id) return;

    const fetchData = async () => {
      setData(prev => ({ ...prev, loading: true, error: undefined }));
      try {
        let liveRating: number | undefined = undefined;
        let liveRatingCount: number | undefined = undefined;
        let allReviews: google.maps.places.Review[] = [];

        // Try Google Maps Places API (Real-Time Live) first if googlePlaceId is specified
        if (placesLib && branch.googlePlaceId) {
          try {
            const place = new placesLib.Place({ id: branch.googlePlaceId });
            await place.fetchFields({
              fields: ['rating', 'userRatingCount', 'reviews']
            });

            if (place.rating !== undefined && place.rating !== null) {
              liveRating = place.rating;
            }
            if (place.userRatingCount !== undefined && place.userRatingCount !== null) {
              liveRatingCount = place.userRatingCount;
            }
            if (place.reviews && place.reviews.length > 0) {
              allReviews = place.reviews;
            }
          } catch (apiErr) {
            console.warn("Real-time Places API failed, falling back to database caching", apiErr);
          }
        }

        // Fetch Supabase Reviews to merge or fall back
        const { data: dbReviews } = await supabase
          .from('google_reviews')
          .select('*')
          .eq('branch_id', branch.id);

        let mappedDbReviews: google.maps.places.Review[] = [];
        if (dbReviews && dbReviews.length > 0) {
          mappedDbReviews = dbReviews.map((r: any) => ({
            rating: r.rating,
            text: r.text,
            publishTime: r.publish_time ? new Date(r.publish_time) : undefined,
            authorAttribution: {
              displayName: r.author_display_name,
              photoUri: r.author_photo_url || undefined
            }
          })) as google.maps.places.Review[];

          // If Places API didn't return rating or reviews, take from Database
          if (liveRating === undefined && dbReviews.length > 0) {
            const dbAvg = dbReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / dbReviews.length;
            liveRating = Number(dbAvg.toFixed(1));
          }
          if (liveRatingCount === undefined) {
            liveRatingCount = dbReviews.length;
          }
        }

        // Merge reviews: live Google reviews first, followed by DB reviews (avoiding duplicates by text/author)
        let mergedReviews = [...allReviews];
        const existingTexts = new Set(allReviews.map(r => r.text?.trim().toLowerCase()).filter(Boolean));
        
        for (const dbRev of mappedDbReviews) {
          const normText = dbRev.text?.trim().toLowerCase();
          if (normText && !existingTexts.has(normText)) {
            mergedReviews.push(dbRev);
            existingTexts.add(normText);
          } else if (!normText) {
            mergedReviews.push(dbRev);
          }
        }

        // Sort reviews by date descending if dates exist
        mergedReviews.sort((a, b) => {
          const dateA = a.publishTime ? new Date(a.publishTime).getTime() : 0;
          const dateB = b.publishTime ? new Date(b.publishTime).getTime() : 0;
          return dateB - dateA;
        });

        // Resolve rating and counts with absolute preference for Google Live, then Branch State, then Baseline fallback
        const baseline = getGoogleBaseline(branch.name, branch.id);
        const finalRating = liveRating !== undefined && liveRating !== null ? liveRating : (branch.googleRating || baseline.rating);
        const finalCount = liveRatingCount !== undefined && liveRatingCount !== null ? liveRatingCount : (branch.googleRatingCount || baseline.userRatingCount);

        const critical = mergedReviews.filter(review => (review.rating || 0) <= 4);
        
        const now = new Date();
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(now.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);
        
        const recent = mergedReviews.filter(review => {
          if (!review.text) return false;
          const pubDate = review.publishTime ? new Date(review.publishTime) : null;
          return pubDate && pubDate.getTime() >= sevenDaysAgo.getTime();
        });

        setData({
          rating: finalRating,
          userRatingCount: finalCount,
          allReviews: mergedReviews,
          criticalReviews: critical,
          recentWithText: recent,
          loading: false
        });

        // Auto-persist realtime metrics to Supabase to enable offline coherence
        if (liveRating && liveRatingCount && (liveRating !== branch.googleRating || liveRatingCount !== branch.googleRatingCount)) {
          supabase
            .from('branches')
            .update({
              google_rating: liveRating,
              google_rating_count: liveRatingCount
            })
            .eq('id', branch.id)
            .then(({ error }) => {
              if (error) console.error("Error updates realtime branch stats:", error);
            });
        }
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
  }, [placesLib, branch.googlePlaceId, branch.id, branch.googleRating, branch.googleRatingCount]);

  if (!branch.googlePlaceId && data.allReviews.length === 0) return null;

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
          <GoogleMetricsCard branch={branches.find(b => b.id === selectedBranchId) || branches[0]} />
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
            <GoogleMetricsCard branch={branches.find(b => b.id === selectedBranchId) || branches[0]} />
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

