import { describe, expect, it } from "vitest";
import { newestFirst, type Note } from "./notes";

const note = (id: string, updated_at: string, pinned = false): Note => ({
  id,
  title: "",
  content: "",
  category: null,
  pinned,
  created_at: updated_at,
  updated_at,
});

const ids = (ns: Note[]) => ns.map((n) => n.id);

describe("newestFirst", () => {
  it("puts the most recently edited note first", () => {
    const ns = [note("old", "2026-01-01T00:00:00Z"), note("new", "2026-03-01T00:00:00Z"), note("mid", "2026-02-01T00:00:00Z")];
    expect(ids(newestFirst(ns))).toEqual(["new", "mid", "old"]);
  });

  it("keeps pinned notes above newer unpinned ones", () => {
    const ns = [note("new", "2026-03-01T00:00:00Z"), note("pinned-old", "2026-01-01T00:00:00Z", true), note("pinned-new", "2026-02-01T00:00:00Z", true)];
    expect(ids(newestFirst(ns))).toEqual(["pinned-new", "pinned-old", "new"]);
  });

  it("does not mutate the original array", () => {
    const ns = [note("a", "2026-01-01T00:00:00Z"), note("b", "2026-02-01T00:00:00Z")];
    newestFirst(ns);
    expect(ids(ns)).toEqual(["a", "b"]);
  });

  it("handles an empty list", () => {
    expect(newestFirst([])).toEqual([]);
  });
});
