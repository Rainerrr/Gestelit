import { WorkflowStudio } from "./workflow-studio";
export default async function WorkflowsPage({ searchParams }: { searchParams: Promise<{ binaId?: string }> }) {
  const params = await searchParams;
  return <WorkflowStudio binaId={typeof params.binaId === "string" ? params.binaId : undefined} />;
}
