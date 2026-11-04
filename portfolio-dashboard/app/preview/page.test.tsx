import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardView } from "@/components/dashboard/DashboardView";
import PreviewPage from "./page";

const { notFound } = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("next/navigation", () => ({ notFound }));

const props = (state?: string) => ({ searchParams: Promise.resolve(state ? { state } : {}) });

afterEach(() => {
  vi.unstubAllEnvs();
  notFound.mockClear();
});

describe("/preview", () => {
  it("is a 404 in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(PreviewPage(props())).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("is a 404 in production whatever the state parameter", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(PreviewPage(props("degraded"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it.each([
    [undefined, 9, 0],
    ["degraded", 9, 3],
    ["empty", 0, 1],
    ["bogus", 9, 0],
  ])("renders the %s sample outside production", async (state, positions, failures) => {
    vi.stubEnv("NODE_ENV", "development");
    const el = await PreviewPage(props(state));
    expect(notFound).not.toHaveBeenCalled();
    expect(el.type).toBe(DashboardView);
    expect(el.props.dashboard.positions).toHaveLength(positions);
    expect(el.props.dashboard.failures).toHaveLength(failures);
  });
});
