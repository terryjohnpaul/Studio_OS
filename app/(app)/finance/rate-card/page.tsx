import { connection } from "next/server";
import { getActiveVersion, getVersions, getVersionData, getChangeLog } from "./actions";
import { RateCardClient } from "./_client";
import {
  MOCK_VERSION, MOCK_VERSIONS, MOCK_TIERS, MOCK_ITEMS, MOCK_DELIVERABLES, MOCK_CHANGES
} from "@/lib/rate-card/mock-data";

export default async function RateCardPage() {
  await connection();

  const [activeVersion, versions] = await Promise.all([
    getActiveVersion().catch(() => null),
    getVersions().catch(() => []),
  ]);

  let tiers: Awaited<ReturnType<typeof getVersionData>>["tiers"] = [];
  let items: Awaited<ReturnType<typeof getVersionData>>["items"] = [];
  let deliverables: Awaited<ReturnType<typeof getVersionData>>["deliverables"] = [];
  let changes: Awaited<ReturnType<typeof getChangeLog>> = [];

  if (activeVersion) {
    const [data, log] = await Promise.all([
      getVersionData(activeVersion.id).catch(() => ({ tiers: [], items: [], deliverables: [] })),
      getChangeLog(activeVersion.id).catch(() => []),
    ]);
    tiers = data.tiers;
    items = data.items;
    deliverables = data.deliverables;
    changes = log;
  }

  const useMock = !activeVersion || items.length === 0;

  return (
    <RateCardClient
      initialVersion={useMock ? MOCK_VERSION : activeVersion}
      initialVersions={useMock ? MOCK_VERSIONS : versions}
      initialTiers={useMock ? MOCK_TIERS : tiers}
      initialItems={useMock ? MOCK_ITEMS : items}
      initialDeliverables={useMock ? MOCK_DELIVERABLES : deliverables}
      initialChanges={useMock ? MOCK_CHANGES : changes}
    />
  );
}
