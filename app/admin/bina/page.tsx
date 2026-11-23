import { BinaDashboard } from "./_components/bina-dashboard";

export default async function BinaPage({ searchParams }: { searchParams: Promise<{ binaId?: string; preset?: string }> }) {
  const params = await searchParams;
  return <BinaDashboard initialBinaId={typeof params.binaId === "string" ? params.binaId : undefined} initialPresetId={typeof params.preset === "string" ? params.preset : undefined} />;
}
