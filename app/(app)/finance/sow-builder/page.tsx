import { SoWListClient } from "./_list-client";
import { MOCK_VERSION, MOCK_TIERS, MOCK_ITEMS } from "@/lib/rate-card/mock-data";

export default function SoWBuilderPage() {
  return (
    <SoWListClient
      version={MOCK_VERSION}
      tiers={MOCK_TIERS}
      items={MOCK_ITEMS}
    />
  );
}
