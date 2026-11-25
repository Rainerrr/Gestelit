// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { JobCompletionDialog } from "@/components/work/job-completion-dialog";
afterEach(cleanup);
it("describes station completion and does not offer already finished products", () => {
  const common = { jobId: "j", customerName: "QA", name: "מוצר", plannedQuantity: 10, completedScrap: 0, jobItemStepId: "s" };
  render(<JobCompletionDialog open completedJobItemName="מוצר בדיקה" availableJobItems={[
    { ...common, id: "done", jobNumber: "DONE", completedGood: 10 },
    { ...common, id: "next", jobNumber: "NEXT", completedGood: 0 },
  ]} onComplete={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "השלב בתחנה הושלם" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /DONE/ })).toBeNull();
  expect(screen.getByRole("button", { name: /NEXT/ })).toBeTruthy();
});
