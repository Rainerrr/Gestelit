// @vitest-environment jsdom
import React, { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  PipelineFlowEditor,
  type PipelineStation,
} from "@/components/admin/pipeline-flow-editor";
import { WorkflowAiPanel } from "@/components/admin/workflow-ai-panel";
import type { Station } from "@/lib/types";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const catalog = [
  { id: "a", name: "דפוס", code: "P", station_type: "print", is_active: true },
  { id: "b", name: "אריזה", code: "B", station_type: "pack", is_active: true },
] as Station[];
function Editor({ locked = false }: { locked?: boolean }) {
  const [steps, setSteps] = useState<PipelineStation[]>([
    { id: "a", station: catalog[0], position: 1 },
  ]);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  return (
    <PipelineFlowEditor
      stations={steps}
      onStationsChange={setSteps}
      availableStations={catalog}
      isLocked={locked}
      firstProductFlags={flags}
      onToggleFirstProductQA={(id) => setFlags((f) => ({ ...f, [id]: !f[id] }))}
    />
  );
}
describe("workflow editor", () => {
  it("adds a station, reorders it, and restores the previous route", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "הוספת תחנה אריזה" }));
    fireEvent.click(screen.getByRole("button", { name: "הקדמת אריזה" }));
    expect(
      screen.getAllByRole("button", { name: /בחירת תחנה/ })[0].textContent,
    ).toContain("אריזה");
    fireEvent.click(screen.getByRole("button", { name: "ביטול שינוי" }));
    expect(
      screen.getAllByRole("button", { name: /בחירת תחנה/ })[0].textContent,
    ).toContain("דפוס");
  });
  it("configures a selected station agent and removes it explicitly", () => {
    render(<Editor />);
    fireEvent.click(screen.getByRole("button", { name: "בחירת תחנה דפוס" }));
    fireEvent.click(screen.getByRole("button", { name: "הוספת סוכן AI" }));
    fireEvent.change(screen.getByRole("textbox", { name: "שם הסוכן" }), {
      target: { value: "בודק דפוס" },
    });
    expect(
      screen.getByRole("button", { name: "בחירת תחנה דפוס" }).textContent,
    ).toContain("בודק דפוס");
    fireEvent.click(screen.getByRole("button", { name: "הסרת הסוכן" }));
    expect(screen.queryByRole("textbox", { name: "הוראות לסוכן" })).toBeNull();
  });
  it("locks station, approval, and agent mutations once production starts", () => {
    render(<Editor locked />);
    expect(
      screen.queryByRole("button", { name: "הוספת תחנה אריזה" }),
    ).toBeNull();
    expect(
      (
        screen.getByRole("button", {
          name: "אישור מוצר ראשון בתחנה דפוס",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "בחירת תחנה דפוס" }));
    expect(
      (
        screen.getByRole("button", {
          name: "הוספת סוכן AI",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
  it("ignores canceled late model responses", async () => {
    let resolve!: (value: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      ),
    );
    const apply = vi.fn();
    render(
      <WorkflowAiPanel
        stations={[]}
        flags={{}}
        context="דפוס"
        onApply={apply}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /עוזר תכנון AI/ }));
    fireEvent.click(screen.getByRole("button", { name: "הצע תהליך" }));
    fireEvent.click(screen.getByRole("button", { name: /^ביטול$/ }));
    await act(async () =>
      resolve({
        ok: true,
        json: async () => ({
          plan: {
            name: "late",
            summary: "late",
            steps: [],
            warnings: [],
            handoff: [],
          },
        }),
      }),
    );
    expect(screen.queryByText("late")).toBeNull();
    expect(apply).not.toHaveBeenCalled();
  });
  it("requires explicit apply and blocks stale drafts after the route changes", async () => {
    const plan = {
      name: "טיוטה",
      summary: "המלצה",
      steps: [
        { stationId: "a", reason: "דפוס", requiresFirstProductApproval: false },
      ],
      warnings: [],
      handoff: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ plan }) }),
    );
    const apply = vi.fn();
    const ui = render(
      <WorkflowAiPanel
        stations={[]}
        flags={{}}
        context="דפוס"
        onApply={apply}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /עוזר תכנון AI/ }));
    fireEvent.click(screen.getByRole("button", { name: "הצע תהליך" }));
    await waitFor(() => expect(screen.getByText("המלצה")).toBeTruthy());
    expect(apply).not.toHaveBeenCalled();
    ui.rerender(
      <WorkflowAiPanel
        stations={[{ id: "b" }]}
        flags={{}}
        context="דפוס"
        onApply={apply}
      />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "החלף את הרצף בטיוטה המוצעת",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
