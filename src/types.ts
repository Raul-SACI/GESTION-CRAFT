/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = string;

export type SaleType = 'Turno Mañana' | 'Turno Tarde' | 'Pedidos Ya Restó' | 'Pedidos Ya Café';

export interface RoleConfig {
  id: string;
  name: string;
  description: string;
  allowed_modules: string[];
  is_read_only: boolean;
  access_scope: 'all_branches' | 'single_branch';
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  branch?: string;
  permissions?: string[];
}

export interface Branch {
  id: string;
  name: string;
  location?: string;
  staffCount?: number;
  isActive: boolean;
  googleMapsUrl?: string;
  googleReviewUrl?: string;
  googlePlaceId?: string;
}

// 0. Base Entities
export interface StockItem {
  id: string;
  name: string;
  unit: string;
  cost?: number;
}

export interface Product {
  id: string;
  name: string;
  category: string;
}

export interface ProductRankingEntry {
  productId: string;
  quantity: number;
  amount: number;
}

// 1. Ventas
export interface SalesData {
  id: string;
  branchId: string;
  date: string; // ISO Date for daily entries
  pesos: number;
  netSales: number;
  orders: number;
  covers: number; // Cubiertos
  type: SaleType;
  projection?: number; // Monthly projection calculated on entry
  week?: string; // Week number/name from import
  dayName?: string; // Day name (Mie, Jue, etc)
  productRanking?: ProductRankingEntry[];
  hora?: string;
  medioCobro?: string;
  // Payment Breakdown (Optional, specifically for imports)
  cash?: number;
  card?: number;
  qr?: number;
  iva?: number;
}

// 2. Consumo (CMV Mensual)
export interface ConsumptionDetail {
  id: string;
  periodStart: string;
  periodEnd: string;
  documentNumber: string; // Puede ser un resumen o referencia
  details: string;
  amount: number;
}

export interface MonthlyCMV {
  id: string;
  branchId: string;
  month: string; // YYYY-MM
  initialExistence: number;
  finalExistence: number;
  purchases: ConsumptionDetail[];
  internalMovements: ConsumptionDetail[];
  totalCMV: number; // calculated: EI + TotalPurchases + TotalMovements - EF
}

// 3. Sueldos y Presupuestos
export interface SalaryRoleData {
  hoursBudgeted: number;
  hoursReal: number;
  hourDeviation: number; // Added deviation in hours
  hourlyRate: number;
}

export interface DailySalaryData {
  id: string;
  branchId: string;
  date: string; // Changed to daily
  roles: {
    [key: string]: SalaryRoleData;
  };
  totalProjection?: number; // Monthly projection
}

// 4. Control de Stock
export interface StockItemControl {
  id: string;
  branchId: string;
  month: string; // YYYY-MM
  itemName: string;
  ei: number;
  movementsPurchases: number;
  ef: number;
  cmv: number;
  loans: number;
  discard: number; // Decomiso
  personalConsumption: number;
  theoreticalConsumption: number;
  deviationUnits: number;
  deviationPesos: number;
  deviationPercentage: number;
}

// 5. Desempeño (Flexible Dynamic System)
export interface PerformanceTier {
  id: string;
  threshold: number; // The boundary value (e.g. 31, 30, 4.5)
  prize: number; // Money to award if achieved
}

export interface PerformanceVariable {
  id: string;
  name: string; // e.g. "CMV Definitivo", "Calificación Google"
  unit: string; // e.g. "%", "★", "HS"
  isLowerBetter: boolean; // true for CMV/Deviations, false for Scores/Sales
  tiers: PerformanceTier[];
}

export interface PerformanceRoleConfig {
  id: string;
  branchId: string;
  month: string; // YYYY-MM
  role: 'encargado' | 'jefe_cocina';
  variables: PerformanceVariable[];
  salesGoal: number; // Required for some calculations
  redFlagPenalty: number;
}

export interface PerformanceVariableResult {
  variableId: string;
  variableName: string;
  actualValue: number;
  achievedPrize: number;
  achievedTierId?: string;
}

export interface PerformanceReport {
  id: string;
  branchId: string;
  month: string;
  role: 'encargado' | 'jefe_cocina';
  results: PerformanceVariableResult[];
  actualSales: number;
  redFlagsCount: number;
  totalCalculatedPrize: number;
}

export interface PerformanceTargets {
  id: string;
  branchId: string;
  month: string; // YYYY-MM
  targetCmv: number; // e.g. 28.5 (percent)
  targetStockDeviation: number; // e.g. 1.5 (percent)
  targetHourDeviation: number; // e.g. 5 (hours)
  targetGoogleScore: number; // e.g. 4.5
  targetPedidosYaScore: number; // e.g. 4.7
  salesGoal: number; // in pesos
  bonusPercentage: number; // % over sales if goal met
  redFlagPenalty: number; // amount to deduct per red flag
}

export interface PerformanceResult {
  id: string;
  branchId: string;
  month: string;
  actualCmv: number;
  actualStockDeviation: number;
  actualHourDeviation: number;
  actualGoogleScore: number;
  actualPedidosYaScore: number;
  actualSales: number;
  redFlagsCount: number;
  calculatedBonus: number;
  isAchieved: {
    cmv: boolean;
    stock: boolean;
    hours: boolean;
    google: boolean;
    pedidosYa: boolean;
    sales: boolean;
  };
}

export interface PerformanceData {
  id: string;
  branchId: string;
  weekStarting: string;
  googleScore: number;
  googleComments: number;
  pedidosYaRating: number; // General or Resto
  pedidosYaCafeRating?: number;
  pedidosYaNegativeComments: number;
  pedidosYaDelayMinutes: number;
  
  // New dashboard metrics
  monthlyProjection?: number;
  netSalesVsPreviousMonth?: number; // percentage
  ordersVsPreviousMonth?: number; // percentage (Compras + Movimientos vs mes anterior)
  monthlyOrdersAmount?: number; // Sum of Compras + Movimientos
  criticalStockDeviations?: number; // count
  criticalTablewareDeviations?: number; // count
  criticalHourDeviations?: number; // count (total)
  hourlyDeviationsByPosition?: Record<string, number>; // deviation by position name
  currentFlags?: {
    red: number;
    yellow: number;
    green: number;
  };
}

// 6. Supervision Flags
export interface SupervisionFlag {
  id: string;
  branchId: string;
  date: string;
  color: 'red' | 'yellow' | 'green';
  category: string;
  description: string;
  supervisorName: string;
}

// 7. Vajilla
export interface TablewareItem {
  id: string;
  branchId: string;
  category: string;
  name: string;
  idealStock: number;
  criticalStock: number;
}

export interface TablewareWeeklyCheck {
  id: string;
  branchId: string;
  itemId: string;
  date: string; // Week start
  initialStock: number;
  finalStock: number;
  breakages: number; // initial - final
}

// 7. Novedades
export interface DailyReport {
  id: string;
  branchId: string;
  date: string;
  content: string;
  author: string;
}

// 8. Finanzas (Cash Flow & Payments)
export interface FinanceItem {
  id: string;
  name: string;
  categoryId: string;
}

export interface FinanceCategory {
  id: string;
  name: string;
  type: 'income' | 'expense';
  items: FinanceItem[];
}

export interface FinanceEntry {
  id: string;
  date: string; // ISO Date
  itemId: string;
  amounts: {
    [accountId: string]: number;
  };
  isExecuted?: boolean; // Tildar si se cumplió
  description?: string;
}

export interface CashFlowDay {
  date: string;
  entries: FinanceEntry[];
  openingBalances: Record<string, number>;
}

export interface ScheduledPayment {
  id: string;
  description: string;
  dueDate: string;
  amount: number;
  status: 'pending' | 'paid' | 'overdue';
  category: 'loan' | 'tax' | 'service' | 'other';
  // Additional Bank Liabilities fields
  bank?: string;
  requestDate?: string;
  requestedAmount?: number;
  destination?: string;
  rate?: string | number;
  installmentNumber?: string | number;
  installmentAmount?: number;
  // Additional Fiscal Liabilities fields
  entity?: string;
  taxType?: string;
  totalAmount?: number;
  paymentPlanNumber?: string;
  installmentCount?: number;
}

// 9. Estado de Resultado (P&L)
export interface PLRecord {
  category: string;
  group: string;
  projectedPesos: number;
  projectedUsd: number;
  projectedPercent: number;
  realPesos: number;
  realUsd: number;
  realPercent: number;
  isHeader?: boolean;
  isTotal?: boolean;
}

export interface PLMonthlyData {
  month: string;
  branchId: string;
  records: PLRecord[];
}

// 10. Centro de Producción
export interface ProductionItem {
  id: string;
  name: string;
  unit: string;
  category: string;
}

export interface ProductionLog {
  id: string;
  itemId: string;
  date: string; // ISO Date
  quantity: number;
  batchNumber?: string;
  notes?: string;
}

export interface ProductionSupply {
  id: string;
  name: string;
  unit: string;
  isActive: boolean;
}

export interface ProductionStockControl {
  id: string;
  supplyId: string;
  weekRange: '1 al 7' | '8 al 14' | '15 al 21' | '22 al 31';
  month: string; // YYYY-MM
  initialExistence: number;
  productionPurchases: number;
  internalMovements: number;
  wastage: number;
  personalConsumption: number;
  recovery: number;
  staffPurchases: number;
  finalExistence: number;
}

export interface DailyWastage {
  id: string;
  branchId: string;
  date: string;
  type: 'insumo' | 'producto';
  referenceId: string;
  quantity: number;
  reason?: string;
  cost?: number;
}
