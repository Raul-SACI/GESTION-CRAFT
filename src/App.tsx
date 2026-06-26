/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Vercel deployment trigger v2 - 20260529013455
import React, { useState, useMemo, useEffect, lazy, Suspense, useCallback } from 'react';
import { 
  LayoutDashboard, 
  TrendingUp, 
  Utensils, 
  Users, 
  IdCard,
  Package, 
  ShoppingCart,
  Star, 
  ClipboardList, 
  Tag,
  Trophy,
  Bell,
  Search,
  X,
  ChevronRight,
  RefreshCw,
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
  Scale,
  Factory,
  ClipboardCheck,
  Ticket,
  StickyNote,
  Trash2,
  ListOrdered,
  Settings,
  ArrowUp,
  ArrowDown,
  Landmark,
  Gift,
  Crown,
  Lock,
  Unlock,
  Eye,
  EyeOff
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
import { supabase, realSupabaseClient, isMissingCredentials } from './lib/supabase';

// Lazy load views for better performance
const SociosDashboardView = lazy(() => import('./components/SociosDashboardView'));
const CajaCentralView = lazy(() => import('./components/CajaCentralView'));
const PaymentRemindersView = lazy(() => import('./components/PaymentRemindersView'));
const TasksView = lazy(() => import('./components/TasksView'));
const MantPanelView = lazy(() => import('./components/MantPanelView'));
const MantInventoryView = lazy(() => import('./components/MantInventoryView'));
const MantTasksView = lazy(() => import('./components/MantTasksView'));
const MantPreventiveView = lazy(() => import('./components/MantPreventiveView'));
const MantValorizationView = lazy(() => import('./components/MantValorizationView'));
const MantCostsView = lazy(() => import('./components/MantCostsView'));
const MantConfigView = lazy(() => import('./components/MantConfigView'));
const PublicQRView = lazy(() => import('./components/PublicQRView'));
const GiftCardView = lazy(() => import('./components/GiftCardView'));
const GiftCardBranchView = lazy(() => import('./components/GiftCardBranchView'));
const PersonalNotesView = lazy(() => import('./components/PersonalNotesView'));
const SalesView = lazy(() => import('./components/SalesView'));
const ConsumoView = lazy(() => import('./components/ConsumoView'));
const HourControlView = lazy(() => import('./components/SueldosView'));
const HourBudgetView = lazy(() => import('./components/HourBudgetView'));
const AprobacionPresupuestosView = lazy(() => import('./components/AprobacionPresupuestosView'));
const StockView = lazy(() => import('./components/StockView'));
const UsersView = lazy(() => import('./components/UsersView'));
const EmployeesView = lazy(() => import('./components/EmployeesView'));
const BranchManagementView = lazy(() => import('./components/BranchManagementView'));
const FinanceView = lazy(() => import('./components/FinanceView'));
const ProfitLossView = lazy(() => import('./components/ProfitLossView'));
const OrdersView = lazy(() => import('./components/OrdersView'));
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
const InternalOrdersView = lazy(() => import('./components/InternalOrdersView'));
const InternalOrdersReceptionView = lazy(() => import('./components/InternalOrdersReceptionView'));
const PerformanceView = lazy(() => import('./components/PerformanceView'));
const PerformanceAdminView = lazy(() => import('./components/PerformanceAdminView'));
const SupervisionFlagsView = lazy(() => import('./components/SupervisionFlagsView'));
const SupervisionsExecutionView = lazy(() => import('./components/SupervisionsExecutionView'));
const DocumentsView = lazy(() => import('./components/DocumentsView'));
const TablewareView = lazy(() => import('./components/TablewareView'));
const ProductionCenterView = lazy(() => import('./components/ProductionCenterView'));
const ProductionStockControlView = lazy(() => import('./components/ProductionStockControlView'));
const PedidosYaView = lazy(() => import('./components/PedidosYaView'));
const EncargadoDashboardView = lazy(() => import('./components/EncargadoDashboardView'));

import { NewsView } from './components/ExtraViews';
import { Key, ShieldCheck, FileText, Database, BookOpen } from 'lucide-react';

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
  // Detección del QR público: si la URL tiene ?bien=ID, se muestra la vista pública del QR
  // (escaneo de un bien de mantenimiento) en lugar del login/app normal.
  const [qrBienId, setQrBienId] = useState<string | null>(() => {
    try { return new URLSearchParams(window.location.search).get('bien'); } catch { return null; }
  });

  const [activeTab, setActiveTab] = useState('home');
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
  const [selectedLoginProfileId, setSelectedLoginProfileId] = useState<string>('');

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem('active_profile_id');
    if (currentUserProfile) {
      sessionStorage.removeItem(`unlocked_profile_${currentUserProfile.id}`);
    }
    setCurrentUserProfile(null);
    setSelectedLoginProfileId('');
    setTypedUnlockPassword('');
    setShowProfileSwitcher(false);
  }, [currentUserProfile]);

  // Access and Password Verification System
  const [profilePendingUnlock, setProfilePendingUnlock] = useState<any | null>(null);
  const [typedUnlockPassword, setTypedUnlockPassword] = useState('');
  const [showUnlockPassValue, setShowUnlockPassValue] = useState(false);
  const [unlockError, setUnlockError] = useState('');
  const [refreshUnlockTrigger, setRefreshUnlockTrigger] = useState(0);

  const isCurrentProfileLocked = useMemo(() => {
    if (!currentUserProfile) return true;
    return sessionStorage.getItem(`unlocked_profile_${currentUserProfile.id}`) !== 'true';
  }, [currentUserProfile, refreshUnlockTrigger]);

  // Load profiles and roles for switching representation
  const loadAccessControlData = useCallback(async () => {
    try {
      const { data: rolesData } = await supabase.from('roles_config').select('*');
      const { data: profilesData } = await supabase.from('profiles').select('*').order('name');
      
      if (rolesData) setRolesConfigList(rolesData);
      if (profilesData) {
        // Filtrado en memoria: descarta entradas inválidas (sin id) para la UI.
        // NOTA: ya no se borran usuarios de la base automáticamente. Cualquier
        // eliminación debe hacerse de forma manual y con confirmación explícita.
        const cleanProfiles = profilesData.filter((p: any) => p && p.id);

        // Maintain real Supabase profiles if credentials are configured
        setAvailableProfiles(cleanProfiles);
        setCurrentUserProfile((prev: any) => {
          const storedId = sessionStorage.getItem('active_profile_id');
          if (storedId) {
            const matched = cleanProfiles.find((p: any) => p.id === storedId);
            if (matched && sessionStorage.getItem(`unlocked_profile_${matched.id}`) === 'true') {
              return matched;
            }
          }
          if (prev) {
            const latest = cleanProfiles.find((p: any) => p.id === prev.id);
            if (latest && sessionStorage.getItem(`unlocked_profile_${latest.id}`) === 'true') {
              return latest;
            }
          }
          return null;
        });
      }
    } catch (e) {
      console.error('Error loading Access Control data in App:', e);
    }
  }, []);

  useEffect(() => {
    loadAccessControlData();
  }, [activeTab, isCurrentProfileLocked, loadAccessControlData]);

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
            
            if (b.id === 'bs' && (r === 4.5 || r === 4.6 || r === undefined || c === 5)) {
              r = 4.9;
              c = 778;
            }
            if (b.id === 'bn' && (r === undefined || r === 4.5 || c === 5)) {
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
          cost: i.cost,
          category: i.category,
          code: i.code
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
        id: 'usr-guest',
        name: 'INVITADO',
        role: 'guest',
        branch: 'Todas las Sucursales',
        permissions: [],
        isReadOnly: true,
        accessScope: 'all_branches' as 'all_branches' | 'single_branch' | 'multi_branch'
      };
    }
    
    const roleId = currentUserProfile.role;
    const roleCfg = rolesConfigList.find((r: any) => r.id === roleId);
    
    let allowedModules = roleCfg ? roleCfg.allowed_modules : {};
    // Normalizar a Record<string, 'edit' | 'view'>
    let modulesRecord: Record<string, 'edit' | 'view'> = {};
    if (Array.isArray(allowedModules)) {
      allowedModules.forEach((m: string) => { modulesRecord[m] = 'edit'; });
    } else {
      modulesRecord = allowedModules as Record<string, 'edit' | 'view'>;
    }
    // Lista de IDs con acceso (para compatibilidad)
    const allowed = Object.keys(modulesRecord);

    // El alcance viene del rol, PERO si el usuario tiene varias sucursales asignadas
    // individualmente (branch_ids con 2+), se lo trata como multi_branch sin importar el rol.
    // Esto permite que un usuario puntual (ej. un cajero) elija entre sus sucursales
    // sin cambiar el alcance de todos los que comparten su rol.
    const userBranchIds = (currentUserProfile.branch_ids || []) as string[];
    const roleScope = (roleCfg ? roleCfg.access_scope : 'all_branches') as 'all_branches' | 'single_branch' | 'multi_branch';
    const effectiveScope = (userBranchIds.length >= 2 && roleScope !== 'all_branches') ? 'multi_branch' : roleScope;

    return {
      id: currentUserProfile.id,
      name: currentUserProfile.name,
      role: roleId,
      branch: currentUserProfile.branch_name || 'Todas las Sucursales',
      branchId: currentUserProfile.branch_id || null,
      branchIds: userBranchIds,
      permissions: allowed,
      modulePermissions: modulesRecord,
      isReadOnly: roleCfg ? Boolean(roleCfg.is_read_only) : false,
      accessScope: effectiveScope,
      canSeePayments: currentUserProfile.can_see_payments === true
    };
  }, [currentUserProfile, rolesConfigList]);

  // Calcular si el módulo activo es solo lectura para el usuario actual
  const isCurrentTabReadOnly = useMemo(() => {
    if (currentUser.role === 'administrador' || currentUser.role === 'dueño') return false;
    if (currentUser.isReadOnly) return true;
    const modulePerms = currentUser.modulePermissions as Record<string, 'edit' | 'view'> | undefined;
    if (!modulePerms || Object.keys(modulePerms).length === 0) return false;
    const perm = modulePerms[activeTab];
    if (!perm) return false;
    return perm === 'view';
  }, [currentUser, activeTab]);

  // Tabs que son puramente de visualización/simulación (no escriben datos):
  // en estos, el modo solo-lectura NO debe bloquear los filtros ni la navegación.
  // También se incluyen módulos que YA respetan isReadOnly internamente (bloquean sus
  // propios guardados), por lo que el overlay global es innecesario en ellos.
  const VIEW_ONLY_TABS = [
    'dashboard', 'socios_dashboard', 'performance_admin',
    'papeles_sucursal', 'novedades',
    'stock', 'vajilla', 'horas', 'decomisos', 'cuentas',
    'gestion_sueldos', 'consumo', 'pedidos_ya',
    'finanzas_estimado', 'bank_liabilities', 'tax_liabilities', 'legal_liabilities',
    'finanzas_mensual', 'p&l', 'ordenes', 'cronograma_pagos',
    'control_horas', 'presupuesto_horas', 'aprobacion_presupuestos', 'precios',
    'control_desvios', 'produccion_mes', 'produccion_stock_control', 'pedidos_recepcion', 'decomisos_deposito',
    'papeles_administracion', 'supervision_banderas', 'registro_supervision',
    'supervisiones_operativas', 'agenda', 'control_agendas', 'sucursales', 'usuarios', 'empleados',
    'ventas', 'caja_central', 'recordatorios_pago', 'tareas', 'notas_personales',
    'mant_panel', 'mant_inventario', 'mant_tareas', 'mant_preventivo', 'mant_valorizacion', 'mant_costos', 'mant_config',
    'mkt_giftcard', 'mkt_cuentas', 'mkt_drive', 'giftcards_sucursal'
  ];
  const showReadOnlyOverlay = isCurrentTabReadOnly && !VIEW_ONLY_TABS.includes(activeTab);

  // Find current user's branch ID
  const currentUserBranchId = useMemo(() => {
    // 1) Preferir el branch_id del perfil (exacto e infalible)
    if ((currentUser as any).branchId) {
      const byId = branches.find(b => b.id === (currentUser as any).branchId);
      if (byId) return byId.id;
    }
    // 2) Respaldo: cruzar por nombre, tolerando el prefijo "CRAFT" y mayúsculas/espacios
    if (!currentUser.branch || currentUser.branch === 'Todas las Sucursales') return 'all';
    const normBranch = (s: string) => s.toUpperCase().replace(/^CRAFT\s+/, '').trim();
    const target = normBranch(currentUser.branch);
    const found = branches.find(b => normBranch(b.name) === target);
    return found ? found.id : 'all';
  }, [currentUser, branches]);

  // Lock selectedBranchId if single_branch role
  useEffect(() => {
    if (currentUser.accessScope === 'single_branch' && currentUserBranchId !== 'all') {
      setSelectedBranchId(currentUserBranchId);
    } else if (currentUser.accessScope === 'multi_branch') {
      const allowed = (currentUser as any).branchIds || [];
      // Si la sucursal actual no está entre las permitidas, ir a la primera asignada
      if (allowed.length > 0 && !allowed.includes(selectedBranchId)) {
        setSelectedBranchId(allowed[0]);
      }
    }
  }, [currentUser, currentUserBranchId, branches, selectedBranchId]);

  // Sidebar Customization State
  const [isReorderingMode, setIsReorderingMode] = useState(false);
  const [moduleSearch, setModuleSearch] = useState('');
  const [menuConfig, setMenuConfig] = useState<Record<string, MenuItem[]>>({
    'Agenda Personal': [
      { id: 'tareas', label: 'Tareas Pendientes', icon: ClipboardCheck },
      { id: 'notas_personales', label: 'Notas Personales', icon: StickyNote }
    ],
    'Socios': [
      { id: 'socios_dashboard', label: 'Dashboard de Socios', icon: Landmark }
    ],
    'Gestión Sucursal': [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'stock', label: 'Control Stock', icon: Package },
      { id: 'vajilla', label: 'Vajilla', icon: Utensils },
      { id: 'horas', label: 'Carga de Horas', icon: Clock },
      { id: 'novedades', label: 'Novedades', icon: ClipboardList },
      { id: 'decomisos', label: 'Decomisos diarios', icon: Trash2 },
      { id: 'pedidos_internos', label: 'Pedidos Internos', icon: ShoppingCart },
      { id: 'papeles_sucursal', label: 'Papeles Importantes', icon: FileText },
      { id: 'cuentas', label: 'Cuentas y Contraseñas', icon: Key },
      { id: 'giftcards_sucursal', label: 'Gift Cards', icon: Gift },
    ],
    'Recursos Humanos': [
      { id: 'control_horas', label: 'Control de Horas', icon: ShieldCheck },
      { id: 'gestion_sueldos', label: 'Maestro de Personal', icon: Users },
    ],
    'Gestión Líderes Operativos': [
      { id: 'presupuesto_horas', label: 'Presupuestador de horas', icon: Calendar },
      { id: 'agenda', label: 'Agenda Supervisores', icon: ClipboardList },
      { id: 'supervisiones_operativas', label: 'Supervisiones', icon: Flag },
      { id: 'registro_supervision', label: 'Registro de Supervisión', icon: ClipboardCheck },
    ],
    'Centro de Producción': [
      { id: 'produccion_mes', label: 'Producción del mes', icon: Factory },
      { id: 'produccion_stock_control', label: 'Control de Stock', icon: ClipboardCheck },
      { id: 'pedidos_recepcion', label: 'Pedidos Internos', icon: ShoppingCart },
      { id: 'decomisos_deposito', label: 'Decomisos Depósito', icon: Trash2 },
    ],
    'Finanzas': [
      { id: 'bank_liabilities', label: 'Pasivos Bancarios', icon: Building2 },
      { id: 'tax_liabilities', label: 'Pasivos Fiscales', icon: Calculator },
      { id: 'legal_liabilities', label: 'Pasivos Legales', icon: Scale },
      { id: 'cronograma_pagos', label: 'Cronograma de Pagos', icon: Calendar },
      { id: 'finanzas_estimado', label: 'Flujo de Caja Estimado', icon: TrendingUp },
      { id: 'finanzas_mensual', label: 'Flujo de Caja Mensual', icon: BarChart3 },
    ],
    'Tesorería': [
      { id: 'caja_central', label: 'Caja Central', icon: Landmark },
      { id: 'recordatorios_pago', label: 'Recordatorios de Pago', icon: Bell },
    ],
    'Administración': [
      { id: 'ventas', label: 'Ventas', icon: TrendingUp },
      { id: 'consumo', label: 'CMV Mensual Sucursal', icon: Calculator },
      { id: 'control_desvios', label: 'Control de Desvíos', icon: ShieldCheck },
      { id: 'maestros', label: 'Maestros', icon: Database },
      { id: 'recetas', label: 'Recetas', icon: BookOpen },
      { id: 'supervision_banderas', label: 'Supervisiones y Banderas', icon: Flag },
      { id: 'pedidos_ya', label: 'Pedidos Ya', icon: Star },
      { id: 'papeles_administracion', label: 'Papeles Importantes', icon: FileText },
    ],
    'Gerencia General': [
      { id: 'aprobacion_presupuestos', label: 'Aprobación de Presupuestos', icon: Layers },
      { id: 'control_agendas', label: 'Agenda Supervisores', icon: ClipboardList },
      { id: 'precios', label: 'Lista de Precios', icon: Tag },
      { id: 'p&l', label: 'Estado de Resultado', icon: BarChart3 },
      { id: 'ordenes', label: 'Tickets / Órdenes', icon: Ticket },
      { id: 'performance_admin', label: 'Configuración de Premios', icon: Trophy }
    ],
    'Mantenimiento': [
      { id: 'mant_panel', label: 'Panel de Control', icon: BarChart3 },
      { id: 'mant_inventario', label: 'Inventario', icon: Package },
      { id: 'mant_tareas', label: 'Tareas', icon: ClipboardCheck },
      { id: 'mant_preventivo', label: 'Plan Preventivo', icon: Calendar },
      { id: 'mant_valorizacion', label: 'Valorización de Activos', icon: Landmark },
      { id: 'mant_costos', label: 'Costos', icon: DollarSign },
      { id: 'mant_config', label: 'Configuración', icon: Settings },
    ],
    'Marketing & Comercial': [
      { id: 'mkt_giftcard', label: 'Gift Card', icon: Gift },
      { id: 'mkt_cuentas', label: 'Cuentas y Contraseñas', icon: Key },
      { id: 'mkt_drive', label: 'Drive MKT', icon: FileText },
    ],
    'Configuración': [
      { id: 'sucursales', label: 'Gestión Sucursales', icon: Building2 },
      { id: 'usuarios', label: 'Usuarios/Roles', icon: Users },
      // DESACTIVADO temporalmente: el modulo "Empleados" (EmployeesView) comparte la tabla
      // employees del Maestro de Personal y usa la columna inexistente "active" (la correcta es "is_active"),
      // lo que rompia datos. Se desconecta del menu hasta retomar el Fichaje con QR.
      // Para reactivarlo: descomentar esta linea Y alinear EmployeesView a is_active.
      // { id: 'empleados', label: 'Empleados', icon: IdCard },
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
          caja_central: Landmark,
          recordatorios_pago: Bell,
          dashboard: LayoutDashboard,
          tareas: ClipboardCheck,
          notas_personales: StickyNote,
          stock: Package,
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
          registro_supervision: ClipboardCheck,
          produccion_mes: Factory,
          produccion_stock_control: ClipboardCheck,
          decomisos_deposito: Trash2,
          finanzas_estimado: TrendingUp,
          bank_liabilities: Building2,
          tax_liabilities: Calculator,
          legal_liabilities: Scale,
          cronograma_pagos: Calendar,
          finanzas_mensual: BarChart3,
          ventas: TrendingUp,
          'p&l': BarChart3,
          ordenes: Ticket,
          consumo: Calculator,
          control_desvios: ShieldCheck,
          supervision_banderas: Flag,
          pedidos_ya: Star,
          papeles_administracion: FileText,
          precios: Tag,
          performance_admin: Trophy,
          aprobacion_presupuestos: Layers,
          control_agendas: ClipboardList,
          sucursales: Building2,
          usuarios: Users,
          empleados: IdCard
        };

        const rehydrated: Record<string, MenuItem[]> = {};
        Object.entries(parsed as Record<string, {id: string, label: string}[]>).forEach(([section, items]) => {
          rehydrated[section] = items
            .filter((item) => item.id !== 'registro_visitas')
            .map((item) => ({
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

        // 'tareas' y 'notas_personales' viven solo en 'Agenda Personal' (quitarlos de secciones viejas guardadas)
        Object.keys(merged).forEach(section => {
          if (section !== 'Agenda Personal') {
            merged[section] = merged[section].filter(it => it.id !== 'tareas' && it.id !== 'notas_personales');
          }
        });
        if (!merged['Agenda Personal']) merged['Agenda Personal'] = [];
        // Asegurar que existan ambos items en Agenda Personal
        if (!merged['Agenda Personal'].find(it => it.id === 'tareas')) {
          merged['Agenda Personal'].push({ id: 'tareas', label: 'Tareas Pendientes', icon: iconMap['tareas'] || ListOrdered });
        }
        if (!merged['Agenda Personal'].find(it => it.id === 'notas_personales')) {
          merged['Agenda Personal'].push({ id: 'notas_personales', label: 'Notas Personales', icon: iconMap['notas_personales'] || StickyNote });
        }

        // 'finanzas_estimado' (Flujo de Caja Estimado) ahora vive en 'Finanzas'.
        // Quitarlo de cualquier otra sección de un orden guardado viejo y asegurarlo en Finanzas.
        Object.keys(merged).forEach(section => {
          if (section !== 'Finanzas') {
            merged[section] = merged[section].filter(it => it.id !== 'finanzas_estimado');
          }
        });
        if (merged['Finanzas'] && !merged['Finanzas'].find(it => it.id === 'finanzas_estimado')) {
          // Insertar antes de "Flujo de Caja Mensual" si existe, si no al final
          const idxMensual = merged['Finanzas'].findIndex(it => it.id === 'finanzas_mensual');
          const item = { id: 'finanzas_estimado', label: 'Flujo de Caja Estimado', icon: iconMap['finanzas_estimado'] || TrendingUp };
          if (idxMensual >= 0) merged['Finanzas'].splice(idxMensual, 0, item);
          else merged['Finanzas'].push(item);
        }

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

  const handleDeleteBranch = async (branchId: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar esta sucursal? Esta acción es irreversible y eliminará todos sus registros asociados.')) {
      return;
    }
    try {
      // Delete from Supabase
      const { error } = await supabase
        .from('branches')
        .delete()
        .eq('id', branchId);

      if (error) throw error;

      // Update local state
      setBranches(prev => prev.filter(b => b.id !== branchId));
    } catch (err: any) {
      console.error('Error deleting branch:', err);
      alert(`Error al eliminar la sucursal: ${err.message || 'Error desconocido'}`);
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
    { id: 'vajilla', label: 'Vajilla', icon: Utensils },
    { id: 'horas', label: 'Carga de Horas', icon: Clock },
    { id: 'novedades', label: 'Novedades', icon: ClipboardList },
    { id: 'decomisos', label: 'Decomisos diarios', icon: Trash2 },
    { id: 'pedidos_internos', label: 'Pedidos Internos', icon: ShoppingCart },
    { id: 'papeles_sucursal', label: 'Papeles Importantes', icon: FileText },
    { id: 'cuentas', label: 'Cuentas y Contraseñas', icon: Key },
  ];

  // Si se escaneó un QR de mantenimiento (?bien=ID), mostrar la vista pública
  // antes del login/app normal.
  if (qrBienId) {
    return (
      <Suspense fallback={<LoadingState />}>
        <PublicQRView
          bienId={qrBienId}
          onClose={() => {
            setQrBienId(null);
            try { window.history.replaceState({}, '', window.location.pathname); } catch { /* noop */ }
          }}
        />
      </Suspense>
    );
  }

  if (isCurrentProfileLocked) {
    const activeLoginProfileForForm = currentUserProfile || availableProfiles.find(p => p.id === selectedLoginProfileId);
    const hasNoPasswordSet = activeLoginProfileForForm && (!activeLoginProfileForForm.password || activeLoginProfileForForm.password.trim() === '');

    return (
      <div className="flex h-screen w-screen bg-[#0e1117] items-center justify-center p-4 font-sans text-text-main relative overflow-hidden" id="full-lock-screen">
        {/* Subtle background nodes or meshes */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-500/5 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="w-full max-w-sm bg-bg-sidebar border border-border-dim rounded p-8 shadow-2xl relative z-10 text-center space-y-6">
          <div className="mx-auto bg-brand-500/10 w-16 h-16 rounded-full border border-brand-500/20 flex items-center justify-center text-brand-500 relative">
            <Lock className="w-6 h-6 animate-pulse" />
            <div className="absolute inset-0 rounded-full border border-brand-500/10 animate-ping" />
          </div>

          <div className="space-y-1.5">
            <h1 className="text-brand-500 font-extrabold text-2xl tracking-tighter italic animate-bounce">CRAFT<span className="text-white">.</span></h1>
            <h2 className="text-[10px] font-black uppercase text-text-dim tracking-widest leading-none">
              Control de Seguridad y Acceso
            </h2>
          </div>

          {currentUserProfile ? (
            <div className="bg-bg-accent/40 border border-border-dim rounded p-4 text-center">
              <p className="text-[10px] font-black uppercase text-brand-500 tracking-wider">Perfil Activo</p>
              <p className="text-[13px] font-black text-text-main uppercase mt-1 tracking-tight">{currentUserProfile.name}</p>
              <p className="text-[8px] font-black text-text-dim uppercase mt-1 tracking-wider border-t border-border-dim/45 pt-1.5 leading-none">
                En calidad de: {currentUserProfile.role.replace('_', ' ')}
              </p>
            </div>
          ) : (
            <div className="space-y-2 text-left">
              <label className="text-[9px] font-black text-text-dim uppercase tracking-wider block">Seleccionar Colaborador / Perfil</label>
              <select
                value={selectedLoginProfileId}
                onChange={(e) => {
                  setSelectedLoginProfileId(e.target.value);
                  if (unlockError) setUnlockError('');
                }}
                className="w-full px-3 py-3 bg-bg-accent border border-border-dim rounded text-text-main text-xs outline-none focus:border-brand-500 uppercase font-bold"
              >
                <option value="">-- SELECCIONE SU USUARIO --</option>
                {availableProfiles.map((p) => (
                  <option key={p.id} value={p.id} className="bg-bg-sidebar text-text-main uppercase">
                    {p.name} ({p.role.replace('_', ' ').toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
          )}

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              const profileToUnlock = currentUserProfile || availableProfiles.find(p => p.id === selectedLoginProfileId);
              
              if (!profileToUnlock) {
                setUnlockError('Por favor, selecciona tu perfil o usuario de la lista.');
                return;
              }

              const expectedPass = (profileToUnlock.password || '').trim();
              const enteredPass = typedUnlockPassword.trim();

              if (enteredPass === expectedPass) {
                // Limpiar menú guardado para que cada usuario vea solo sus módulos
                localStorage.removeItem('craft_sidebar_order');
                sessionStorage.setItem(`unlocked_profile_${profileToUnlock.id}`, 'true');
                sessionStorage.setItem('active_profile_id', profileToUnlock.id);
                setCurrentUserProfile(profileToUnlock);
                setActiveTab('home'); // Al iniciar sesión, mostrar pantalla de bienvenida con el logo
                setTypedUnlockPassword('');
                setUnlockError('');
                setRefreshUnlockTrigger(prev => prev + 1);
              } else {
                setUnlockError('Contraseña o clave de acceso incorrecta.');
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5 text-left">
              <label className="text-[9px] font-black text-text-dim uppercase tracking-wider block">Clave o PIN de Acceso</label>
              <div className="relative">
                <input 
                  type={showUnlockPassValue ? "text" : "password"}
                  value={typedUnlockPassword}
                  onChange={(e) => {
                    setTypedUnlockPassword(e.target.value);
                    if (unlockError) setUnlockError('');
                  }}
                  autoFocus
                  className="w-full px-4 py-3 bg-bg-accent border border-border-dim rounded text-text-main text-xs text-center outline-none focus:border-brand-500 font-mono text-base tracking-widest"
                  placeholder="••••••••"
                  maxLength={32}
                />
                <button 
                  type="button"
                  onClick={() => setShowUnlockPassValue(!showUnlockPassValue)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main p-1 rounded"
                >
                  {showUnlockPassValue ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>

              {hasNoPasswordSet && (
                <p className="text-amber-400 text-[9px] font-black uppercase tracking-wider mt-1 text-center bg-amber-500/10 py-1.5 rounded border border-amber-500/20">
                  💡 Este usuario no tiene clave. Pulse para validar.
                </p>
              )}

              {unlockError && (
                <p className="text-red-400 text-[9.5px] uppercase font-bold tracking-wide mt-1 text-center">
                  ⚠️ {unlockError}
                </p>
              )}
            </div>

            <button 
              type="submit"
              className="w-full bg-brand-500 hover:bg-brand-600 text-black py-3 rounded text-[11px] font-black uppercase tracking-widest transition-all font-mono shadow-lg shadow-brand-500/10 cursor-pointer"
            >
              INICIAR SESIÓN / VALIDAR
            </button>
          </form>

          {/* Switch profiles directly from lock screen, only if they already have one active */}
          {currentUserProfile && (
            <div className="border-t border-border-dim/50 pt-4">
              <button 
                type="button"
                onClick={() => setShowProfileSwitcher(true)}
                className="text-[9.5px] font-black text-brand-500 hover:underline uppercase tracking-widest cursor-pointer inline-flex items-center gap-1.5"
              >
                <Users size={12} /> Cambiar de Perfil / Usuario
              </button>
            </div>
          )}
        </div>

        {/* Since the profile switcher might be requested, render it on absolute layout over lock screen */}
        {showProfileSwitcher && availableProfiles.length > 0 && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowProfileSwitcher(false)} />
            <div className="relative w-full max-w-sm bg-bg-sidebar border border-border-dim rounded shadow-2xl p-6 space-y-4">
              <div className="flex justify-between items-center border-b border-border-dim pb-3">
                <span className="text-[10px] font-black uppercase text-brand-500 tracking-widest">Simulación de Rol</span>
                <span className="text-[9px] text-text-dim uppercase font-bold cursor-pointer hover:text-text-main" onClick={() => setShowProfileSwitcher(false)}>Cerrar</span>
              </div>
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {availableProfiles.map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      if (p.password && sessionStorage.getItem(`unlocked_profile_${p.id}`) !== 'true') {
                        setProfilePendingUnlock(p);
                        setTypedUnlockPassword('');
                        setUnlockError('');
                        setShowProfileSwitcher(false);
                      } else {
                        setCurrentUserProfile(p);
                        setShowProfileSwitcher(false);
                      }
                    }}
                    className={cn(
                      "w-full text-left px-4 py-3 rounded transition-all text-xs font-bold border flex justify-between items-center bg-transparent cursor-pointer",
                      currentUserProfile?.id === p.id 
                        ? "bg-brand-500 text-black border-brand-500" 
                        : "text-text-main hover:bg-white/5 border-border-dim/40"
                    )}
                  >
                    <div className="flex flex-col gap-0.5">
                      <span className="uppercase tracking-tight">{p.name || 'Sin Nombre'}</span>
                      <span className={cn(
                        "text-[8px] uppercase font-black tracking-wider leading-none",
                        currentUserProfile?.id === p.id ? "text-black/60" : "text-text-dim"
                      )}>{p.role.replace('_', ' ')} • {p.branch_name || 'Todas'}</span>
                    </div>
                    {p.password && (
                      <Lock size={12} className={currentUserProfile?.id === p.id ? "text-black/60 shrink-0" : "text-brand-500 shrink-0"} />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Profile Switcher Password Prompt (Pending Switch) */}
        {profilePendingUnlock && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/85 backdrop-blur-md" onClick={() => setProfilePendingUnlock(null)} />
            <div className="relative w-full max-w-xs bg-bg-card border border-border-dim rounded shadow-2xl p-6 text-center space-y-4 z-10">
              <div className="bg-brand-500/10 w-12 h-12 rounded-full mx-auto flex items-center justify-center text-brand-500">
                <Lock size={18} className="animate-pulse" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-brand-500 tracking-wider">Validación Requerida</p>
                <p className="text-xs font-black text-text-main uppercase mt-1">{profilePendingUnlock.name}</p>
              </div>

              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (typedUnlockPassword.trim() === profilePendingUnlock.password) {
                    localStorage.removeItem('craft_sidebar_order');
                    sessionStorage.setItem(`unlocked_profile_${profilePendingUnlock.id}`, 'true');
                    setCurrentUserProfile(profilePendingUnlock);
                    setProfilePendingUnlock(null);
                    setTypedUnlockPassword('');
                    setUnlockError('');
                    setRefreshUnlockTrigger(prev => prev + 1);
                  } else {
                    setUnlockError('Contraseña incorrecta.');
                  }
                }}
                className="space-y-3"
              >
                <div className="relative">
                  <input 
                    type={showUnlockPassValue ? "text" : "password"}
                    value={typedUnlockPassword}
                    onChange={(e) => {
                      setTypedUnlockPassword(e.target.value);
                      if (unlockError) setUnlockError('');
                    }}
                    autoFocus
                    className="w-full px-3 py-2.5 bg-bg-accent border border-border-dim rounded text-text-main text-xs text-center outline-none focus:border-brand-500 font-mono"
                    placeholder="Contraseña"
                    maxLength={32}
                  />
                  <button 
                    type="button"
                    onClick={() => setShowUnlockPassValue(!showUnlockPassValue)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main p-1 rounded"
                  >
                    {showUnlockPassValue ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                {unlockError && (
                  <p className="text-red-400 text-[9px] uppercase font-bold tracking-wide">
                    ⚠️ {unlockError}
                  </p>
                )}

                <div className="flex gap-2 pt-2">
                  <button 
                    type="submit"
                    className="flex-1 bg-brand-500 hover:bg-brand-600 text-black py-2 rounded text-[10px] font-black uppercase tracking-widest font-mono shadow cursor-pointer"
                  >
                    Ingresar
                  </button>
                  <button 
                    type="button"
                    onClick={() => setProfilePendingUnlock(null)}
                    className="px-3 py-2 rounded border border-border-dim text-text-dim text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-bg-main font-sans text-text-main">
      {/* Sidebar */}
      <aside
        className={cn(
          "border-r border-sidebar-border bg-bg-sidebar flex flex-col fixed h-full z-20 transition-all duration-300",
          isSidebarCollapsed ? "w-0 -translate-x-full overflow-hidden" : "w-56 translate-x-0"
        )}
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
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

          {/* Buscador de módulos */}
          {!isSidebarCollapsed && (
            <div className="px-4 mb-3">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-sidebar-dim" />
                <input
                  value={moduleSearch}
                  onChange={(e) => setModuleSearch(e.target.value)}
                  placeholder="Buscar módulo..."
                  className="w-full bg-bg-accent/40 border border-sidebar-border rounded-md pl-8 pr-7 py-1.5 text-[11px] text-sidebar-text placeholder:text-sidebar-dim outline-none focus:border-brand-500/50 transition-all"
                />
                {moduleSearch && (
                  <button onClick={() => setModuleSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-sidebar-dim hover:text-brand-500" title="Limpiar">
                    <X size={13} />
                  </button>
                )}
              </div>
            </div>
          )}

          {Object.entries(menuConfig).map(([sectionName, items]) => {
            const typedItems = items as MenuItem[];
            const permittedItems = typedItems.filter(item => {
              // Usuarios/Roles solo visible para administrador
              if (item.id === 'usuarios' || item.id === 'sucursales') {
                return currentUser.role === 'administrador' || currentUser.role === 'dueño';
              }
              if (currentUser.role === 'administrador' || currentUser.role === 'dueño') return true;
              if (!currentUser.permissions || currentUser.permissions.length === 0) return false;
              return currentUser.permissions.includes(item.id);
            });

            // Filtro del buscador de módulos (por nombre, sin acentos)
            const norm = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const q = norm(moduleSearch.trim());
            const filteredItems = q
              ? permittedItems.filter(item => norm(item.label).includes(q))
              : permittedItems;

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
          {currentUser.role === 'administrador' && showProfileSwitcher && availableProfiles.length > 0 && (
            <div className="absolute bottom-full left-4 right-4 mb-2 bg-bg-sidebar border border-border-dim rounded-lg shadow-2xl p-2 max-h-60 overflow-y-auto z-50 space-y-1">
              <p className="text-[9px] font-black uppercase text-brand-500 px-2 pb-1.5 border-b border-border-dim mb-1 tracking-widest leading-none">Simulación de Rol</p>
              {availableProfiles.map((p: any) => (
                <button
                  key={p.id}
                  onClick={() => {
                    if (p.password && sessionStorage.getItem(`unlocked_profile_${p.id}`) !== 'true') {
                      setProfilePendingUnlock(p);
                      setTypedUnlockPassword('');
                      setUnlockError('');
                    } else {
                      setCurrentUserProfile(p);
                      setShowProfileSwitcher(false);
                    }
                  }}
                  className={cn(
                    "w-full text-left px-2 py-1.5 rounded transition-all text-[11px] font-bold flex items-center justify-between gap-2",
                    currentUserProfile?.id === p.id 
                      ? "bg-brand-500 text-black" 
                      : "text-text-main hover:bg-white/5"
                  )}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="truncate uppercase">{p.name || 'Sin Nombre'}</span>
                    <span className={cn(
                      "text-[8px] uppercase font-black tracking-wider leading-none",
                      currentUserProfile?.id === p.id ? "text-black/60" : "text-text-dim"
                    )}>{p.role.replace('_', ' ')} • {p.branch_name || 'Todas'}</span>
                  </div>
                  {p.password && (
                    <Lock size={11} className={currentUserProfile?.id === p.id ? "text-black/65 shrink-0" : "text-brand-500 shrink-0"} />
                  )}
                </button>
              ))}
            </div>
          )}
          
          <div className="flex items-center gap-2">
            <button 
              disabled={currentUser.role !== 'administrador'}
              onClick={() => currentUser.role === 'administrador' && setShowProfileSwitcher(!showProfileSwitcher)}
              className={cn(
                "w-8 h-8 rounded-full bg-brand-500 text-black font-extrabold text-[10px] uppercase flex items-center justify-center shrink-0 shadow-lg shadow-brand-500/20",
                currentUser.role === 'administrador' && "hover:scale-105 cursor-pointer"
              )}
              title={currentUser.role === 'administrador' ? "Cambiar Perfil" : undefined}
            >
              {currentUser.name ? currentUser.name.substring(0, 2).toUpperCase() : 'US'}
            </button>
            <div 
              className={cn("flex-1 min-w-0", currentUser.role === 'administrador' && "cursor-pointer")} 
              onClick={() => currentUser.role === 'administrador' && setShowProfileSwitcher(!showProfileSwitcher)}
            >
              <p className="text-xs font-bold truncate text-sidebar-text leading-tight uppercase font-sans text-left">{currentUser.name}</p>
              <p className="text-[9px] text-brand-500 font-black uppercase tracking-wider mt-0.5 text-left">{currentUser.role.replace('_', ' ')}</p>
              <p className="text-[8px] text-sidebar-dim font-bold uppercase tracking-wider mt-0.5 text-left">{currentUser.branch}</p>
            </div>
            {currentUser.role === 'administrador' && (
              <button 
                onClick={() => setShowProfileSwitcher(!showProfileSwitcher)}
                className={cn(
                  "p-1.5 rounded text-sidebar-dim hover:text-brand-500 hover:bg-white/5 transition-all cursor-pointer",
                  showProfileSwitcher && "text-brand-500 bg-white/5"
                )}
                title="Seleccionar Usuario"
              >
                <Users size={14} />
              </button>
            )}
            <button 
              onClick={handleLogout}
              className="p-1.5 rounded text-red-500 hover:text-red-650 hover:bg-red-500/10 transition-all cursor-pointer"
              title="Cerrar Sesión"
              id="logout-button"
            >
              <LogOut size={14} className="stroke-[2.5]" />
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
        <header
          className="bg-bg-sidebar border-b border-border-dim sticky top-0 z-30 px-6 flex items-center justify-between"
          style={{ paddingTop: 'env(safe-area-inset-top, 0px)', minHeight: '5rem' }}
        >
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
            {['dashboard', 'stock', 'vajilla', 'horas', 'novedades', 'decomisos', 'pedidos_internos', 'papeles_sucursal', 'cuentas', 'decomisos_deposito'].includes(activeTab) && (
              <div className="flex items-center gap-3 bg-bg-card border border-border-dim px-4 py-2 rounded-lg">
                <span className="text-[10px] font-black uppercase text-text-dim tracking-wider">Filtrar por Sucursal:</span>
                <select
                  value={selectedBranchId}
                  onChange={(e) => {
                    if (currentUser.accessScope === 'single_branch' && currentUserBranchId !== 'all') {
                      setSelectedBranchId(currentUserBranchId);
                    } else if (currentUser.accessScope === 'multi_branch') {
                      // Solo permitir elegir entre sus sucursales asignadas
                      const allowed = (currentUser as any).branchIds || [];
                      if (allowed.includes(e.target.value)) setSelectedBranchId(e.target.value);
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
                  {currentUser.accessScope === 'all_branches' && (
                    <option value="all" className="bg-bg-card font-bold text-text-main">CONSOLIDADO (TODAS)</option>
                  )}
                  {branches
                    .filter(b => {
                      if (currentUser.accessScope === 'single_branch') return b.id === currentUserBranchId;
                      if (currentUser.accessScope === 'multi_branch') return ((currentUser as any).branchIds || []).includes(b.id);
                      return true;
                    })
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
          </div>
        </header>

        {/* Dynamic View */}
        <div className="p-6 flex-1">
          {isCurrentTabReadOnly && (
            <div className="bg-brand-500/10 text-brand-500 border border-brand-500/20 px-6 py-3 rounded-lg mb-6 flex items-center gap-3 text-xs font-black uppercase tracking-widest">
              <Lock size={16} />
              <span>
                {VIEW_ONLY_TABS.includes(activeTab)
                  ? 'MODO CONSULTA • PODÉS FILTRAR Y NAVEGAR, PERO NO MODIFICAR DATOS'
                  : 'MODO SOLO LECTURA ACTIVO • ESTE MÓDULO ES DE VISUALIZACIÓN ÚNICAMENTE'}
              </span>
            </div>
          )}
          <div className="relative">
            {showReadOnlyOverlay && (
              <div 
                className="absolute inset-0 z-50 cursor-not-allowed"
                style={{ background: 'transparent' }}
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
                onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
                title="Módulo en modo solo lectura"
              />
            )}
          <Suspense fallback={<LoadingState />}>
            <AnimatePresence mode="wait">
              {activeTab === 'home' && (
                <motion.div
                  key="home"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center min-h-[70vh] text-center select-none"
                >
                  <h1 className="text-6xl md:text-8xl font-black italic tracking-tighter text-brand-500 leading-none">
                    CRAFT<span className="text-text-main">.</span>
                  </h1>
                  <p className="mt-3 text-sm md:text-base font-black uppercase tracking-[0.3em] text-text-dim">
                    Sistemas &amp; Control
                  </p>
                  <p className="mt-8 text-[11px] font-bold uppercase tracking-widest text-text-dim/60">
                    Seleccioná un módulo del menú para comenzar
                  </p>
                </motion.div>
              )}
              {activeTab === 'mant_panel' && (
                <MantPanelView />
              )}
              {activeTab === 'mant_inventario' && (
                <MantInventoryView />
              )}
              {activeTab === 'mant_tareas' && (
                <MantTasksView currentUser={{ name: currentUser.name }} />
              )}
              {activeTab === 'mant_preventivo' && (
                <MantPreventiveView />
              )}
              {activeTab === 'mant_valorizacion' && (
                <MantValorizationView />
              )}
              {activeTab === 'mant_costos' && (
                <MantCostsView />
              )}
              {activeTab === 'mant_config' && (
                <MantConfigView />
              )}
              {activeTab === 'mkt_giftcard' && (
                <GiftCardView key="mkt_giftcard" currentUser={{ name: currentUser.name }} isReadOnly={isCurrentTabReadOnly} />
              )}
              {activeTab === 'mkt_cuentas' && (
                <PasswordManagementView key="mkt_cuentas" section="marketing" isReadOnly={isCurrentTabReadOnly} />
              )}
              {activeTab === 'mkt_drive' && (
                <DocumentsView
                  key="mkt_drive"
                  mode="encargado"
                  branchId="__mkt__"
                  branchName="Marketing"
                  branches={branches}
                  onBranchSelect={() => { /* fijo en MKT */ }}
                  isReadOnly={isCurrentTabReadOnly}
                />
              )}
              {activeTab === 'socios_dashboard' && (
                <SociosDashboardView branches={branches} />
              )}
              {activeTab === 'tareas' && (
                <TasksView
                  branches={branches}
                  currentUser={{ ...currentUser, branchId: currentUserBranchId }}
                  isReadOnly={isCurrentTabReadOnly}
                  canCreate={currentUser.role === 'administrador' || currentUser.role === 'dueño' || (currentUser.modulePermissions as any)?.tareas === 'edit'}
                />
              )}
              {activeTab === 'notas_personales' && (
                <PersonalNotesView
                  currentUser={{ id: currentUser.id || currentUser.name, name: currentUser.name }}
                  isReadOnly={isCurrentTabReadOnly}
                />
              )}
              {activeTab === 'caja_central' && (
                <CajaCentralView branches={branches} isReadOnly={isCurrentTabReadOnly} />
              )}
              {activeTab === 'recordatorios_pago' && (
                <PaymentRemindersView isReadOnly={isCurrentTabReadOnly} />
              )}
              {activeTab === 'dashboard' && (
                <EncargadoDashboardView 
                  branches={branches}
                  selectedBranchId={selectedBranchId}
                  onBranchChange={currentUser.accessScope === 'single_branch' ? undefined : setSelectedBranchId}
                  onNavigateToTab={setActiveTab}
                  isReadOnly={isCurrentTabReadOnly}
                  currentUser={{ ...currentUser, branchId: currentUserBranchId }}
                />
              )}

              {activeTab === 'performance_admin' && (
                <PerformanceAdminView branches={branches} selectedBranchId={selectedBranchId} />
              )}
              {activeTab === 'ventas' && <SalesView branches={branches} selectedBranchId={selectedBranchId} products={products} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'consumo' && <ConsumoView key="consumo" branches={branches} selectedBranchId={selectedBranchId} onBranchChange={setSelectedBranchId} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'presupuesto_horas' && <HourBudgetView key="presupuesto" branches={branches} selectedBranchId={selectedBranchId} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'horas' && <HourControlView key="horas" branches={branches} selectedBranchId={selectedBranchId} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'stock' && (
                <StockView 
                  key="stock" 
                  branches={branches} 
                  selectedBranchId={selectedBranchId} 
                  userRole={currentUser.role} 
                  controlledItemIds={controlledItemIds}
                  items={items}
                  isReadOnly={isCurrentTabReadOnly}
                />
              )}
              {activeTab === 'usuarios' && <UsersView key="usuarios" branches={branches} selectedBranchId={selectedBranchId} onUsersChanged={loadAccessControlData} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'empleados' && <EmployeesView key="empleados" branches={branches} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'p&l' && <ProfitLossView key="p&l" branches={branches} selectedBranchId={selectedBranchId} onBranchChange={setSelectedBranchId} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'ordenes' && <OrdersView key="ordenes" branches={branches} selectedBranchId={selectedBranchId} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'finanzas_estimado' && <FinanceView key="finanzas_estimado" branches={branches} selectedBranchId={selectedBranchId} mode="default" isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'bank_liabilities' && <FinanceView key="bank_liabilities" branches={branches} selectedBranchId={selectedBranchId} mode="bank" isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'tax_liabilities' && <FinanceView key="tax_liabilities" branches={branches} selectedBranchId={selectedBranchId} mode="tax" isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'legal_liabilities' && <FinanceView key="legal_liabilities" branches={branches} selectedBranchId={selectedBranchId} mode="legal" isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'cronograma_pagos' && <PaymentScheduleView key="cronograma_pagos" isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'finanzas_mensual' && <MonthlyCashFlowView key="finanzas_mensual" isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'control_desvios' && (
                <DeviationControlView 
                  key="control_desvios" 
                  branches={branches} 
                  selectedBranchId={selectedBranchId} 
                  onBranchChange={setSelectedBranchId}
                  controlledItemIds={controlledItemIds}
                  setControlledItemIds={setControlledItemIds}
                  items={items}
                  setItems={setItems}
                  products={products}
                  setProducts={setProducts}
                  currentUserRole={currentUser.role}
                  isReadOnly={isCurrentTabReadOnly}
                />
              )}
              {(activeTab === 'maestros' || activeTab === 'recetas') && (
                <DeviationControlView 
                  key={activeTab}
                  forcedTab={activeTab === 'maestros' ? 'gestion' : 'recetas'}
                  branches={branches} 
                  selectedBranchId={selectedBranchId} 
                  onBranchChange={setSelectedBranchId}
                  controlledItemIds={controlledItemIds}
                  setControlledItemIds={setControlledItemIds}
                  items={items}
                  setItems={setItems}
                  products={products}
                  setProducts={setProducts}
                  currentUserRole={currentUser.role}
                  isReadOnly={isCurrentTabReadOnly}
                />
              )}
              {activeTab === 'supervision_banderas' && <SupervisionFlagsView key="supervision_banderas" branches={branches} initialViewMode="admin" hideToggle={true} currentUserRole={currentUser.role} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'pedidos_ya' && <PedidosYaView key="pedidos_ya" branches={branches} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'registro_supervision' && <SupervisionFlagsView key="registro_supervision" branches={branches} initialViewMode="supervisor" hideToggle={true} customTitle="Registro de Supervisión" currentUserName={currentUser.name} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'supervisiones_operativas' && <SupervisionsExecutionView key="supervisiones_operativas" branches={branches} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'agenda' && <SupervisorAgendaView key="agenda" branches={branches} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'control_agendas' && <SupervisorAgendaView key="control_agendas" branches={branches} mode="control" isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'decomisos' && (
                <DecomisosView 
                  key="decomisos" 
                  branches={branches} 
                  selectedBranchId={selectedBranchId}
                  items={items}
                  products={products}
                  isReadOnly={isCurrentTabReadOnly}
                />
              )}
              {activeTab === 'pedidos_internos' && (
                <InternalOrdersView
                  key="pedidos_internos"
                  branches={branches}
                  selectedBranchId={selectedBranchId}
                  items={items}
                  currentUser={currentUserProfile}
                  isReadOnly={isCurrentTabReadOnly}
                />
              )}
              {activeTab === 'precios' && <PriceListView key="precios" isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'gestion_sueldos' && <SalaryManagementView key="gestion_sueldos" branches={branches} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'vajilla' && <TablewareView key="vajilla" branches={branches} selectedBranchId={selectedBranchId} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'novedades' && <NewsView key="novedades" branches={branches} selectedBranchId={selectedBranchId} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'cuentas' && <PasswordManagementView key="cuentas" isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'giftcards_sucursal' && (
                <GiftCardBranchView
                  key="giftcards_sucursal"
                  branchName={selectedBranchId === 'all' ? undefined : branches.find(b => b.id === selectedBranchId)?.name}
                  isReadOnly={isCurrentTabReadOnly}
                />
              )}
              {activeTab === 'papeles_sucursal' && (
                <DocumentsView 
                  key="papeles_sucursal" 
                  mode="encargado" 
                  branchId={selectedBranchId} 
                  branchName={selectedBranchId === 'all' ? 'Todas' : branches.find(b => b.id === selectedBranchId)?.name}
                  branches={branches}
                  onBranchSelect={(id) => setSelectedBranchId(id)}
                  isReadOnly={isCurrentTabReadOnly}
                />
              )}
              {activeTab === 'produccion_mes' && <ProductionCenterView key="produccion_mes" isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'pedidos_recepcion' && <InternalOrdersReceptionView key="pedidos_recepcion" branches={branches} />}
              {activeTab === 'decomisos_deposito' && (
                <DecomisosView
                  key="decomisos_deposito"
                  branches={branches}
                  selectedBranchId="n4ncoary3"
                  items={items}
                  products={products}
                  onlyInsumos={true}
                  isReadOnly={isCurrentTabReadOnly}
                />
              )}
              {activeTab === 'produccion_stock_control' && (
                <StockView 
                  key="produccion_stock_control"
                  branches={branches}
                  selectedBranchId="n4ncoary3"
                  userRole={currentUser.role}
                  controlledItemIds={controlledItemIds}
                  items={items}
                  isReadOnly={isCurrentTabReadOnly}
                />
              )}
              {activeTab === 'papeles_administracion' && (
                <DocumentsView 
                  key="papeles_administracion" 
                  mode="administracion" 
                  isReadOnly={isCurrentTabReadOnly}
                />
              )}
              {activeTab === 'control_horas' && <HrHourControlView key="control_horas" branches={branches} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'aprobacion_presupuestos' && <AprobacionPresupuestosView key="aprobacion_presupuestos" branches={branches} isReadOnly={isCurrentTabReadOnly} />}
              {activeTab === 'sucursales' && (
                <BranchManagementView 
                  branches={branches} 
                  onUpdateBranch={handleUpdateBranch} 
                  onAddBranchClick={() => setShowAddBranch(true)}
                  onDeleteBranch={handleDeleteBranch}
                  isReadOnly={isCurrentTabReadOnly}
                />
              )}
            </AnimatePresence>
          </Suspense>
          </div>

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

          {/* Profile Switcher Password Prompt (Pending Switch) */}
          <AnimatePresence>
            {profilePendingUnlock && (
              <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setProfilePendingUnlock(null)}
                  className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                  id="unlock-switcher-overlay"
                />
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="relative w-full max-w-xs bg-bg-card border border-border-dim rounded-lg shadow-2xl p-6 text-center space-y-4 z-10"
                  id="unlock-switcher-content"
                >
                  <div className="bg-brand-500/10 w-12 h-12 rounded-full mx-auto flex items-center justify-center text-brand-500 border border-brand-500/20">
                    <Lock size={18} className="animate-pulse" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase text-brand-500 tracking-wider">Validación de Perfil</p>
                    <p className="text-xs font-black text-text-main uppercase mt-1">{profilePendingUnlock.name}</p>
                  </div>

                  <form 
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (typedUnlockPassword.trim() === profilePendingUnlock.password) {
                        localStorage.removeItem('craft_sidebar_order');
                        sessionStorage.setItem(`unlocked_profile_${profilePendingUnlock.id}`, 'true');
                        setCurrentUserProfile(profilePendingUnlock);
                        setProfilePendingUnlock(null);
                        setTypedUnlockPassword('');
                        setUnlockError('');
                        setRefreshUnlockTrigger(prev => prev + 1);
                      } else {
                        setUnlockError('Contraseña incorrecta.');
                      }
                    }}
                    className="space-y-3"
                  >
                    <div className="relative">
                      <input 
                        type={showUnlockPassValue ? "text" : "password"}
                        value={typedUnlockPassword}
                        onChange={(e) => {
                          setTypedUnlockPassword(e.target.value);
                          if (unlockError) setUnlockError('');
                        }}
                        autoFocus
                        className="w-full px-3 py-2.5 bg-bg-accent border border-border-dim rounded text-text-main text-xs text-center outline-none focus:border-brand-500 font-mono"
                        placeholder="Contraseña"
                        maxLength={32}
                      />
                      <button 
                        type="button"
                        onClick={() => setShowUnlockPassValue(!showUnlockPassValue)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-text-dim hover:text-text-main p-1 rounded"
                      >
                        {showUnlockPassValue ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                    {unlockError && (
                      <p className="text-red-400 text-[9px] uppercase font-bold tracking-wide">
                        ⚠️ {unlockError}
                      </p>
                    )}

                    <div className="flex gap-2 pt-2">
                      <button 
                        type="submit"
                        className="flex-1 bg-brand-500 hover:bg-brand-600 text-black py-2 rounded text-[10px] font-black uppercase tracking-widest font-mono shadow cursor-pointer"
                      >
                        Ingresar
                      </button>
                      <button 
                        type="button"
                        onClick={() => setProfilePendingUnlock(null)}
                        className="px-3 py-2 rounded border border-border-dim text-text-dim text-[10px] font-black uppercase tracking-widest hover:bg-bg-accent cursor-pointer"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
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

export function getGoogleBaselineReviews(name: string = '', branchId: string = ''): google.maps.places.Review[] {
  return [];
  const normName = name.toUpperCase();
  const bId = branchId.toLowerCase();
  const now = new Date();
  
  const d = (daysAgo: number) => {
    const date = new Date();
    date.setDate(now.getDate() - daysAgo);
    return date;
  };

  let list: { author: string; rating: number; text: string; daysAgo: number }[] = [];

  if (normName.includes('BARRIO NORTE') || bId === 'bn') {
    list = [
      { author: "Facundo Soria", rating: 5, text: "Excelente atención y ambiente en Barrio Norte. Las IPAs artesanales súper frías y las hamburguesas impecables hoy.", daysAgo: 1 },
      { author: "Sofía Martínez", rating: 5, text: "Excelente lugar para ir con amigos. Las cervezas artesanales son espectaculares y la comida sale súper rápido. Muy buena atención en Barrio Norte.", daysAgo: 2 },
      { author: "Juani Silva", rating: 5, text: "Me encanta la ambientación de Barrio Norte. La hamburguesa Craft con papas es mi favorita. Volveré sin dudas.", daysAgo: 4 },
      { author: "Mariano Gómez", rating: 4, text: "Muy buena birra, pero los fines de semana se llena muchísimo y hay que esperar mesa. La comida vale totalmente la pena.", daysAgo: 5 },
      { author: "Lucía Pérez", rating: 5, text: "La atención es de diez, las chicas súper predispuestas. Excelente variedad de canillas.", daysAgo: 6 },
      { author: "Bautista Herrera", rating: 3, text: "La cerveza espectacular pero la música estaba demasiado fuerte adentro. El deck de afuera excelente.", daysAgo: 12 }
    ];
  } else if (normName.includes('BARRIO SUR') || bId === 'bs') {
    list = [
      { author: "Estanislao Bach", rating: 5, text: "Increíble cómo cuidan cada detalle en Barrio Sur. La comida riquísima y la música en el volumen perfecto hoy lunes.", daysAgo: 1 },
      { author: "Emilia Ruiz", rating: 5, text: "Un ambiente íntimo y espectacular. La música de fondo y la iluminación son perfectas para parejas. Las papas bravas son de otro planeta.", daysAgo: 2 },
      { author: "Ramiro Díaz", rating: 5, text: "La sucursal de Barrio Sur es re tranquila y acogedora. La atención de las chicas es excelente siempre de buen humor.", daysAgo: 3 },
      { author: "Carolina Vanni", rating: 5, text: "Hermosa noche de otoño. La cerveza IPA roja estaba helada y riquísima. Totalmente recomendado.", daysAgo: 5 },
      { author: "Mateo Fernández", rating: 4, text: "Muy pintoresco el local de Barrio Sur. Pocas mesas pero una atención sumamente personalizada.", daysAgo: 8 }
    ];
  } else if (normName.includes('MERCATO') || bId === 'mt') {
    list = [
      { author: "Gastón Paz", rating: 5, text: "Excelente propuesta en el Mercato, ideal para arrancar la semana. Cerveza tirada de primer nivel y la atención de de diez.", daysAgo: 1 },
      { author: "Valentina Luna", rating: 5, text: "Ubicado en el Mercato, ideal para almorzar o tomar algo después de pasear. La pizza napolitana que hacen es tremenda.", daysAgo: 2 },
      { author: "Gonzalo Ruiz", rating: 5, text: "Espectacular ambiente en el Mercato para pasar la tarde. Excelente atención y las papas fritas rústicas de primera.", daysAgo: 3 },
      { author: "Federico Ortega", rating: 4, text: "Buenísima la atención en Mercato. El estilo industrial del local le da un toque único.", daysAgo: 6 },
      { author: "Agustina Carrizo", rating: 3, text: "La comida riquísima pero tardaron un poco en traernos la cuenta. Igual volveríamos por la excelente IPA.", daysAgo: 9 }
    ];
  } else if (normName.includes('PERON') || normName.includes('PERÓN') || bId === 'pn') {
    list = [
      { author: "Milagros Ortiz", rating: 5, text: "Muy lindo el deck de la sucursal Perón para relajarse mirando el cerro. Excelente trato y comida exquisita hoy.", daysAgo: 1 },
      { author: "Santiago Peralta", rating: 5, text: "Sucursal amplia en la Perón. Súper cómoda para ir en familia o grupos grandes. Las rabas estaban sumamente crocantes y ricas.", daysAgo: 2 },
      { author: "Martina Soria", rating: 4, text: "Me gusta mucho el deck de afuera. Buen lugar para relajarse mirando los cerros. Los precios están acordes a la gran calidad.", daysAgo: 4 },
      { author: "Tomás Albarracín", rating: 5, text: "Un bar con toda la onda en el norte de Yerba Buena. Las IPAs son sin dudas de las mejores de la provincia.", daysAgo: 5 },
      { author: "Candela Mansilla", rating: 5, text: "Hermoso lugar, cerveza bien helada y excelente música. Muy recomendable para descontracturar.", daysAgo: 7 }
    ];
  } else if (normName.includes('MATE DE LUNA') || bId === 'ml') {
    list = [
      { author: "Paula Giménez", rating: 5, text: "Hermoso el patio de Mate de Luna para estar al aire libre. Muy ricas papas con cheddar y las pintas súper heladas hoy.", daysAgo: 1 },
      { author: "Esteban Córdoba", rating: 5, text: "Excelente ubicación y súper accesibilidad sobre Mate de Luna. Lugar con muchísimo estilo. Las picadas abundantes y variadas.", daysAgo: 2 },
      { author: "Virginia Medina", rating: 4, text: "Buen servicio y las mejores pintas de la zona. Se puede estacionar súper fácil en las inmediaciones.", daysAgo: 4 },
      { author: "Marcos Juárez", rating: 5, text: "Los tragos y la cerveza artesanal de primer nivel. Un ambiente genial con buena música y atención rápida.", daysAgo: 5 },
      { author: "Camila Navarro", rating: 5, text: "Tiene un patio trasero hermoso para las noches de calor en Mate de Luna. Muy ricas papas y hamburguesas.", daysAgo: 8 }
    ];
  } else {
    list = [
      { author: "Gabriel Torres", rating: 5, text: "Gran experiencia general, atención rápida y la cerveza artesanal muy fresca como siempre. Para volver seguido.", daysAgo: 2 },
      { author: "Daniela Sosa", rating: 4, text: "Muy buena la comida y el ambiente relajado del local. Lindo deck al aire libre.", daysAgo: 5 }
    ];
  }

  return list.map((r, i) => ({
    rating: r.rating,
    text: r.text,
    publishTime: d(r.daysAgo) as any,
    authorAttribution: {
      displayName: r.author,
      photoUri: undefined
    }
  })) as any as google.maps.places.Review[];
}

export function adjustReviewDateToCurrentYear(pubTime: any) {
  if (!pubTime) return new Date();
  
  let date: Date;
  if (pubTime instanceof Date) {
    date = pubTime;
  } else if (typeof pubTime === 'number') {
    date = new Date(pubTime < 100000000000 ? pubTime * 1000 : pubTime);
  } else {
    date = new Date(pubTime);
  }
  
  if (isNaN(date.getTime())) {
    return new Date();
  }
  
  return date;
}

const GoogleMetricsCard: React.FC<{ 
  branch: Branch;
  startDate?: string;
  endDate?: string;
}> = ({ branch }) => {
  const [data, setData] = useState<{
    rating?: number;
    userRatingCount?: number;
    error?: string;
    loading: boolean;
  }>({ loading: false });

  const placesLib = useMapsLibrary('places');

  useEffect(() => {
    if (!branch.id) return;

    const fetchData = async () => {
      setData(prev => ({ ...prev, loading: true, error: undefined }));
      try {
        let liveRating: number | undefined = undefined;
        let liveRatingCount: number | undefined = undefined;

        // Try Google Maps Places API (Real-Time Live) first if googlePlaceId is specified
        if (placesLib && branch.googlePlaceId) {
          try {
            const place = new placesLib.Place({ id: branch.googlePlaceId });
            await place.fetchFields({
              fields: ['rating', 'userRatingCount']
            });

            if (place.rating !== undefined && place.rating !== null) {
              liveRating = place.rating;
            }
            if (place.userRatingCount !== undefined && place.userRatingCount !== null) {
              liveRatingCount = place.userRatingCount;
            }
          } catch (apiErr) {
            console.warn("Real-time Places API failed, falling back to database caching", apiErr);
          }
        }

        // Fetch Supabase Reviews to count/calculate average if Google API didn't return rating
        if (liveRating === undefined || liveRatingCount === undefined) {
          const { data: dbReviews } = await supabase
            .from('google_reviews')
            .select('rating')
            .eq('branch_id', branch.id);

          if (dbReviews && dbReviews.length > 0) {
            if (liveRating === undefined) {
              const dbAvg = dbReviews.reduce((sum: number, r: any) => sum + r.rating, 0) / dbReviews.length;
              liveRating = Number(dbAvg.toFixed(1));
            }
            if (liveRatingCount === undefined) {
              liveRatingCount = dbReviews.length;
            }
          }
        }

        // Resolve rating and counts with absolute preference for Google Live, then Branch State, then Baseline fallback
        const baseline = getGoogleBaseline(branch.name, branch.id);
        const finalRating = liveRating !== undefined && liveRating !== null ? liveRating : (branch.googleRating || baseline.rating);
        const finalCount = liveRatingCount !== undefined && liveRatingCount !== null ? liveRatingCount : (branch.googleRatingCount || baseline.userRatingCount);

        setData({
          rating: finalRating,
          userRatingCount: finalCount,
          loading: false
        });

        // Auto-persist realtime metrics to Supabase to enable offline coherence
        if (liveRating !== undefined && liveRatingCount !== undefined && (liveRating !== branch.googleRating || liveRatingCount !== branch.googleRatingCount)) {
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
          setData(prev => ({ ...prev, loading: false, error: 'ID de Google inválido (Edítelo en Gestión de Sucursales).' }));
        } else {
          setData(prev => ({ ...prev, loading: false, error: 'Error al cargar datos de Google.' }));
        }
      }
    };

    fetchData();
  }, [placesLib, branch.googlePlaceId, branch.id, branch.googleRating, branch.googleRatingCount]);

  const renderStars = (rating: number, size = 11, colorClass = "text-yellow-500 fill-yellow-500") => (
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

  if (!branch.googlePlaceId && !data.rating) return null;

  return (
    <Card className="h-32 border-l-4 border-yellow-500 flex flex-col justify-between p-4 bg-bg-sidebar/30 hover:border-yellow-400 transition-all">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black text-text-dim uppercase tracking-wider">{branch.name}</span>
        <div className="flex items-center gap-1 text-[8px] font-black uppercase text-yellow-500 bg-yellow-500/10 px-1.5 py-0.5 rounded tracking-widest">
          <Star size={8} className="fill-yellow-500" /> Google Maps
        </div>
      </div>

      {data.loading ? (
        <div className="animate-pulse space-y-2 py-1">
          <div className="h-6 bg-bg-accent rounded w-1/3" />
          <div className="h-3 bg-bg-accent rounded w-1/2" />
        </div>
      ) : data.error ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[8px] text-red-400 leading-normal uppercase font-bold italic line-clamp-2">{data.error}</p>
        </div>
      ) : (
        <div className="flex justify-between items-end mt-1">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-mono font-bold text-text-main">{data.rating ? data.rating.toFixed(1) : '--'}</span>
              <span className="text-[10px] text-text-dim font-mono font-semibold">/ 5.0</span>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              {renderStars(data.rating || 0, 11)}
            </div>
          </div>
          <div className="text-right">
            <span className="text-xl font-mono font-black text-text-main block leading-none">{data.userRatingCount || 0}</span>
            <span className="text-[8px] text-text-dim font-bold uppercase tracking-wider block mt-0.5">Reseñas Totales</span>
          </div>
        </div>
      )}
    </Card>
  );
};

function DashboardView({ salesComparison: initialSalesComparison, performance, branches, selectedBranchId }: { salesComparison: any, performance: PerformanceData, branches: Branch[], selectedBranchId: string }) {
  const [startDate, setStartDate] = useState('2026-05-01');
  const [endDate, setEndDate] = useState('2026-05-25');

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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
        {selectedBranchId === 'all' ? (
          branches.map(branch => (
            <GoogleMetricsCard key={branch.id} branch={branch} />
          ))
        ) : (
          <div className="col-span-full">
            <GoogleMetricsCard branch={branches.find(b => b.id === selectedBranchId) || branches[0]} />
          </div>
        )}
        {branches.length === 0 && (
          <div className="col-span-full p-8 text-center border-2 border-dashed border-border-dim rounded-lg">
            <p className="text-[10px] font-bold text-text-dim uppercase">No hay sucursales configuradas</p>
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

