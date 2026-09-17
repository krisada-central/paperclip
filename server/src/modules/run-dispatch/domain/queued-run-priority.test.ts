import { describe, expect, it } from "vitest";
import {
  QUEUE_PRIORITY_AGE_STEP_MS,
  agedPriorityRank,
  allowsTerminalStatusBypass,
  issueRunPriorityRank,
} from "./queued-run-priority.js";

describe("issueRunPriorityRank", () => {
  it.each([
    ["critical", 0],
    ["high", 1],
    ["medium", 2],
    ["low", 3],
    [null, 4],
    [undefined, 4],
    ["unknown", 4],
  ] as const)("%s → %s", (priority, rank) => {
    expect(issueRunPriorityRank(priority)).toBe(rank);
  });
});

describe("agedPriorityRank", () => {
  const now = new Date("2026-09-17T12:00:00.000Z");

  it("matches the base rank when the wake is fresh", () => {
    expect(
      agedPriorityRank("low", new Date("2026-09-17T11:59:00.000Z"), now),
    ).toBe(3);
  });

  it("promotes low by one step after one age window (external: 2h step)", () => {
    // Would fail against a no-aging comparator that always returns base 3.
    expect(
      agedPriorityRank(
        "low",
        new Date(now.getTime() - QUEUE_PRIORITY_AGE_STEP_MS),
        now,
      ),
    ).toBe(2);
  });

  it("lets a 6h-old low sort ahead of a fresh medium", () => {
    const agedLow = agedPriorityRank(
      "low",
      new Date(now.getTime() - 3 * QUEUE_PRIORITY_AGE_STEP_MS),
      now,
    );
    const freshMedium = agedPriorityRank(
      "medium",
      new Date(now.getTime() - 60_000),
      now,
    );
    expect(agedLow).toBe(0);
    expect(freshMedium).toBe(2);
    expect(agedLow).toBeLessThan(freshMedium);
  });

  it("caps aging so low cannot climb past critical-equivalent", () => {
    expect(
      agedPriorityRank(
        "low",
        new Date(now.getTime() - 10 * QUEUE_PRIORITY_AGE_STEP_MS),
        now,
      ),
    ).toBe(0);
  });

  it("does not let a 2h-old low overtake a fresh high", () => {
    const agedLow = agedPriorityRank(
      "low",
      new Date(now.getTime() - QUEUE_PRIORITY_AGE_STEP_MS),
      now,
    );
    const freshHigh = agedPriorityRank("high", now, now);
    expect(agedLow).toBe(2);
    expect(freshHigh).toBe(1);
    expect(agedLow).toBeGreaterThan(freshHigh);
  });
});

describe("allowsTerminalStatusBypass", () => {
  it("keeps resume intent on a terminal issue", () => {
    expect(
      allowsTerminalStatusBypass({
        resumeIntent: true,
        wakeCommentIdPresent: false,
        wakeReason: "issue_assigned",
      }),
    ).toBe(true);
  });

  it("rejects a bare comment id on an assignment wake (fails on old wakeCommentId-only rule)", () => {
    expect(
      allowsTerminalStatusBypass({
        resumeIntent: false,
        wakeCommentIdPresent: true,
        wakeReason: "issue_assigned",
      }),
    ).toBe(false);
  });

  it("rejects execution_review_requested even when a comment id is present", () => {
    expect(
      allowsTerminalStatusBypass({
        resumeIntent: false,
        wakeCommentIdPresent: true,
        wakeReason: "execution_review_requested",
      }),
    ).toBe(false);
  });

  it("keeps issue_comment_mentioned when a comment id is present", () => {
    expect(
      allowsTerminalStatusBypass({
        resumeIntent: false,
        wakeCommentIdPresent: true,
        wakeReason: "issue_comment_mentioned",
      }),
    ).toBe(true);
  });

  it("rejects a comment id with a null wake reason", () => {
    expect(
      allowsTerminalStatusBypass({
        resumeIntent: false,
        wakeCommentIdPresent: true,
        wakeReason: null,
      }),
    ).toBe(false);
  });
});
