import { SalesClientProfileView } from "../../_components/sales-client-profile";

type PageProps = {
  params: Promise<{ clientRef: string }>;
};

export default async function SalesClientProfilePage({ params }: PageProps) {
  const { clientRef } = await params;
  return <SalesClientProfileView clientRef={clientRef} />;
}
