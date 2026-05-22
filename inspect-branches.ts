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
      .select('date, pesos, net_sales, branch_id')
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

  const branchSummary: Record<string, { count: number, gross: number, net: number }> = {};
  for (const r of allSales) {
    const bid = r.branch_id || 'unknown';
    if (!branchSummary[bid]) branchSummary[bid] = { count: 0, gross: 0, net: 0 };
    branchSummary[bid].count++;
    branchSummary[bid].gross += Number(r.pesos || 0);
    branchSummary[bid].net += Number(r.net_sales || 0);
  }

  console.log("\nSummary by Branch ID:");
  console.log(branchSummary);
}

run();
