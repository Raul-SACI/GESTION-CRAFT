import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log("Fetching all sales from database...");
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

  console.log(`Loaded ${allSales.length} records.`);

  // Group by calculated vs database week
  const weekGroups: Record<string, { gross: number, net: number, count: number, dates: Set<string> }> = {};
  for (const r of allSales) {
    const week = r.week || 'no-week';
    if (!weekGroups[week]) {
      weekGroups[week] = { gross: 0, net: 0, count: 0, dates: new Set() };
    }
    const valGross = Number(r.pesos || 0);
    const valNet = Number(r.net_sales || 0);
    
    weekGroups[week].gross += valGross;
    weekGroups[week].net += valNet;
    weekGroups[week].count++;
    weekGroups[week].dates.add(r.date);
  }

  console.log("\nTotals by 'week' column stored in database:");
  for (const [w, data] of Object.entries(weekGroups)) {
    const sortedDates = Array.from(data.dates).sort();
    console.log(`${w}:`);
    console.log(`  Gross: $${data.gross.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`);
    console.log(`  Net:   $${data.net.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`);
    console.log(`  Count: ${data.count}`);
    console.log(`  Dates: ${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]} (${sortedDates.length} unique dates)`);
  }
}

run();
