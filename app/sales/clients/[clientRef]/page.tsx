import { notFound } from "next/navigation";
import { normalizeSalesClientRef } from "@/lib/data/sales-client-reference";
import { SalesClientProfileView } from "../../_components/sales-client-profile";

type PageProps = {
  params: Promise<{ clientRef: string }>;
};

export default async function SalesClientProfilePage({ params }: PageProps) {
  const { clientRef } = await params;
  const normalized = normalizeSalesClientRef(clientRef);
  if (!normalized) notFound();
  return <SalesClientProfileView clientRef={normalized} />;
}
