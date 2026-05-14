import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => {
  const mockChain = () => {
    const chain: Record<string, any> = {};
    const methods = ["select", "insert", "update", "delete", "eq", "neq", "in", "is", "not", "or", "ilike", "order", "limit", "single", "then", "upsert", "gte", "lte"];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    chain.then = vi.fn().mockImplementation((resolve: any) =>
      Promise.resolve({ data: [], error: null }).then(resolve)
    );
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
    return chain;
  };

  return {
    createClient: vi.fn().mockResolvedValue({
      from: vi.fn().mockReturnValue(mockChain()),
      storage: { from: vi.fn().mockReturnValue({ createSignedUrl: vi.fn(), upload: vi.fn() }) },
    }),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn().mockResolvedValue({ userId: "test-user" }),
  currentUser: vi.fn().mockResolvedValue({ fullName: "Test", emailAddresses: [{ emailAddress: "t@t.com" }], imageUrl: null }),
}));

describe("rate-card/actions", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("exports all expected functions", async () => {
    const actions = await import("@/app/(app)/finance/rate-card/actions");
    const expected = [
      "getActiveVersion", "getVersions", "getVersionData",
      "updateItemField", "updateTierField", "updateVersionField",
      "createVersion", "cloneVersion",
      "getChangeLog", "revertChange",
    ];
    for (const name of expected) {
      expect(actions).toHaveProperty(name);
      expect(typeof (actions as Record<string, unknown>)[name]).toBe("function");
    }
  });
});
