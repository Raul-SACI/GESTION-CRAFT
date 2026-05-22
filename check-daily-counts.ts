import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log("Fetching ALL sales from database using pagination...");
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

  // Count rows per day
  const dailyStats: Record<string, { count: number, gross: number, net: number, types: string[] }> = {};
  for (const r of allSales) {
    const dStr = r.date;
    if (!dailyStats[dStr]) {
      dailyStats[dStr] = { count: 0, gross: 0, net: 0, types: [] };
    }
    dailyStats[dStr].count++;
    dailyStats[dStr].gross += Number(r.pesos || 0);
    dailyStats[dStr].net += Number(r.net_sales || 0);
    dailyStats[dStr].types.push(r.type);
  }

  const sortedDays = Object.keys(dailyStats).sort();
  console.log("\nDaily Stats in DB:");
  for (const d of sortedDays) {
    const s = dailyStats[d];
    console.log(`${d}: Count=${s.count}, Gross=$${s.gross.toLocaleString('es-ES')}, Net=$${s.net.toLocaleString('es-ES')}`);
    // Print frequency of types
    const typesFreq: Record<string, number> = {};
    for (const t of s.types) {
      typesFreq[t] = (typesFreq[t] || 0) + 1;
    }
    console.log(`  Shifts:`, typesFreq);
  }
}

run();
