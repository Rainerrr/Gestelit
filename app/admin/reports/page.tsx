import { redirect } from "next/navigation";

// Redirect to malfunctions by default
export default function ReportsPage() {
  redirect("/admin/reports/malfunctions");
}
