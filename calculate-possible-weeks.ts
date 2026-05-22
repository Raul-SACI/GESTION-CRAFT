import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log("Fetching all sales from database for daily breakdown...");
  let allSales: any[] = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('sales')
      .select('*')
      .order('date', { ascending: false })
      .range(page * pageSize, (page + 1) * pageSize - 1);

    if (error) {
      console.error("Error:", error);
      break;
    }

    if (data && data.length > 0) {
      allSales = [...allSales, ...data];
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    } else {
      hasMore = false;
    }
  }

  // Group by day number of April 2026 (assuming all are April 2026 since dates were 2026-04-XX)
  const dailyTotals: Record<number, { gross: number, net: number }> = {};
  for (let i = 1; i <= 31; i++) {
    dailyTotals[i] = { gross: 0, net: 0 };
  }

  for (const r of allSales) {
    const parts = r.date.split('-');
    const day = parseInt(parts[2], 10);
    const valGross = Number(r.pesos || 0);
    const valNet = Number(r.net_sales || 0);
    if (!isNaN(day)) {
      dailyTotals[day].gross += valGross;
      dailyTotals[day].net += valNet;
    }
  }

  console.log("Daily Totals:");
  for (let i = 1; i <= 30; i++) {
    console.log(`Day ${i}: Gross: $${dailyTotals[i].gross.toFixed(2)}, Net: $${dailyTotals[i].net.toFixed(2)}`);
  }

  // Let's test different definitions of weeks!
  // Definition 1: Current code
  // Week 1: 1-7, Week 2: 8-14, Week 3: 15-20, Week 4: 21-31
  console.log("\n--- TEST 1: Current Code (1-7, 8-14, 15-20, 21-31) ---");
  printWeekSums(dailyTotals, [
    { name: "Semana 1", days: range(1, 7) },
    { name: "Semana 2", days: range(8, 14) },
    { name: "Semana 3", days: range(15, 20) },
    { name: "Semana 4", days: range(21, 31) }
  ]);

  // Definition 2: Week 3 ends at 21, Week 4 starts at 22
  console.log("\n--- TEST 2: (1-7, 8-14, 15-21, 22-31) ---");
  printWeekSums(dailyTotals, [
    { name: "Semana 1", days: range(1, 7) },
    { name: "Semana 2", days: range(8, 14) },
    { name: "Semana 3", days: range(15, 21) },
    { name: "Semana 4", days: range(22, 31) }
  ]);

  // Definition 3: Week 3 is 15-22, Week 4 is 23-31?
  console.log("\n--- TEST 3: (1-7, 8-14, 15-22, 23-31) ---");
  printWeekSums(dailyTotals, [
    { name: "Semana 1", days: range(1, 7) },
    { name: "Semana 2", days: range(8, 14) },
    { name: "Semana 3", days: range(15, 22) },
    { name: "Semana 4", days: range(23, 31) }
  ]);
}

function range(start: number, end: number): number[] {
  const arr = [];
  for (let i = start; i <= end; i++) arr.push(i);
  return arr;
}

function printWeekSums(dailyTotals: Record<number, { gross: number, net: number }>, weeks: { name: string, days: number[] }[]) {
  for (const w of weeks) {
    let gross = 0;
    let net = 0;
    for (const d of w.days) {
      gross += dailyTotals[d]?.gross || 0;
      net += dailyTotals[d]?.net || 0;
    }
    console.log(`${w.name} (Days ${w.days[0]}-${w.days[w.days.length - 1]}):`);
    console.log(`  Gross: $${gross.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`);
    console.log(`  Net:   $${net.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`);
  }
}

run();
