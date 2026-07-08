import { connection } from "next/server";
import { SoWListClient } from "./_list-client";
import { getSows } from "./actions";
import { getActiveVersion, getVersionData } from "../rate-card/actions";
import { MOCK_VERSION, MOCK_TIERS, MOCK_ITEMS } from "@/lib/rate-card/mock-data";

export default async function SoWBuilderPage() {
  await connection();

  const [sows, activeVersion] = await Promise.all([
    getSows().catch(() => []),
    getActiveVersion().catch(() => null),
  ]);

  let version = MOCK_VERSION;
  let tiers = MOCK_TIERS;
  let items = MOCK_ITEMS;

  if (activeVersion) {
    const data = await getVersionData(activeVersion.id).catch(() => null);
    if (data && data.items.length > 0) {
      version = activeVersion;
      tiers = data.tiers;
      items = data.items;
    }
  }

  return (
    <SoWListClient
      initialSows={sows}
      version={version}
      tiers={tiers}
      items={items}
    />
  );
}
