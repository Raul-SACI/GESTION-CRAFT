/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'encargado' | 'supervisor' | 'administrativo' | 'dueño';

export type SaleType = 'Turno Mañana' | 'Turno Tarde' | 'Pedidos Ya Restó' | 'Pedidos Ya Café';

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
  productRanking?: ProductRankingEntry[];
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

// 5. Desempeño
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
