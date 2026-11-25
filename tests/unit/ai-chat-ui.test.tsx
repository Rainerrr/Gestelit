// @vitest-environment jsdom
import React, { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AssistantChat, type AssistantAnswer, type AssistantRequest } from "@/components/ai/assistant-chat";
beforeEach(() => {
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as unknown as typeof window.matchMedia;
  HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
function deferred() { let resolve!: (answer: AssistantAnswer) => void; const promise = new Promise<AssistantAnswer>((done) => { resolve = done; }); return { promise, resolve }; }
const base = { title: "עוזר", screen: "מסך א", context: { search: "A" }, prompts: [], embedded: true };
function send(message: string) { fireEvent.change(screen.getByRole("textbox", { name: "הודעה לעוזר" }), { target: { value: message } }); fireEvent.click(screen.getByRole("button", { name: "שליחת הודעה" })); }
describe("conversation lifecycle", () => {
  it("renders an arriving answer after a parent/context rerender and resolves follow-ups with latest context", async () => {
    const pending = deferred(); const first = vi.fn(() => pending.promise); const second = vi.fn<(input: AssistantRequest) => Promise<AssistantAnswer>>().mockResolvedValue({ answer: "תשובת המשך" });
    const ui = render(<StrictMode><AssistantChat {...base} request={first} /></StrictMode>);
    send("מה כמות פקעה28505?");
    ui.rerender(<StrictMode><AssistantChat {...base} context={{ search: "B" }} request={second} /></StrictMode>);
    await act(async () => pending.resolve({ answer: "הכמות היא800", sessionId: "persisted-session" }));
    expect(screen.getByRole("log").textContent).toContain("הכמות היא800");
    expect(screen.queryByRole("status")).toBeNull();
    send("מה הצעד הבא שלה?");
    await waitFor(() => expect(screen.getByText("תשובת המשך")).toBeTruthy());
    expect(second.mock.calls[0]?.[0]).toMatchObject({ sessionId: "persisted-session", context: { search: "B" }, history: [{ role: "user", content: "מה כמות פקעה28505?" }, { role: "assistant", content: "הכמות היא800" }] });
  });
  it("keeps canceled drafts and ignores a late answer after a new request", async () => {
    const old = deferred(); const request = vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValueOnce({ answer: "תשובה חדשה" });
    render(<AssistantChat {...base} request={request} />);
    send("שאלה שנעצרה"); fireEvent.click(screen.getByRole("button", { name: "עצירת הבדיקה" }));
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("שאלה שנעצרה");
    send("שאלה חדשה"); await waitFor(() => expect(screen.getByText("תשובה חדשה")).toBeTruthy());
    await act(async () => old.resolve({ answer: "תשובה ישנה שאסור להציג" }));
    expect(screen.queryByText("תשובה ישנה שאסור להציג")).toBeNull();
  });
  it("preserves admin session and messages across page remounts", async () => {
    const request = vi.fn().mockResolvedValue({ answer: "תשובה שמורה", sessionId: "session-1" });
    const ui = render(<AssistantChat {...base} storageKey="ui-test-admin-remount" request={request} />);
    send("שאלה ראשונה"); await waitFor(() => expect(screen.getByText("תשובה שמורה")).toBeTruthy());
    ui.unmount(); render(<AssistantChat {...base} storageKey="ui-test-admin-remount" context={{ search: "new-page" }} request={request} />);
    expect(screen.getByText("תשובה שמורה")).toBeTruthy(); send("המשך");
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(request.mock.calls[1][0]).toMatchObject({ sessionId: "session-1", context: { search: "new-page" } });
  });
});
