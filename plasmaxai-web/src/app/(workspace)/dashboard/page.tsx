import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { getDashboardData } from "@/lib/supabase/workspace-data";

export default async function DashboardPage() {
  const data = await getDashboardData();

  return <DashboardOverview data={data} />;
}
