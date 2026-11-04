import { notFound } from "next/navigation";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { degradedDashboard, emptyDashboard, sampleDashboard } from "@/lib/testing/sampleDashboard";

/** Development-only gallery of the dashboard on synthetic data: /preview?state=empty|degraded */
export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { state } = await searchParams;
  const dashboard =
    state === "empty" ? emptyDashboard() : state === "degraded" ? degradedDashboard() : sampleDashboard();
  return <DashboardView dashboard={dashboard} />;
}
