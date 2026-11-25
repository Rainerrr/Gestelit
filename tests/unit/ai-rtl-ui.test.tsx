// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AnswerText } from "@/components/ai/answer-text";
import { DateRangePicker, parseCalendarInput } from "@/components/ui/date-range-picker";
import { shiftMonth } from "@/components/ui/hebrew-calendar";
import { readableHebrewDates, hebrewTimestamp } from "@/lib/format/hebrew";
afterEach(cleanup);
describe("Hebrew operational answers", () => {
  it("turns legacy job separators into readable fields without changing quantities or identifiers", () => {
    const { container } = render(<AnswerText text={'נכנסו 25 עבודות:\n- 28518 | ישקר בעמ | כמות BINA: 2,000 | תאריך אספקה: 10.12.2026\n- 28517 | PIX ELINIR | כמות BINA: 12,000 | תאריך אספקה: 26.11.2026'}/>);
    expect(container.textContent).not.toContain("|");
    expect(container.querySelectorAll("dl")).toHaveLength(2);
    expect(container.textContent).toContain("10 בדצמבר 2026");
    expect([...container.querySelectorAll('bdi[dir="ltr"]')].map(el => el.textContent)).toEqual(expect.arrayContaining(["28518", "2,000", "PIX ELINIR", "12,000"]));
  });
  it("separates a live model's mixed pipe and em-dash job format into labeled cards", () => {
    const { container } = render(<AnswerText text={'**עבודות להכנה**\n- **28516 | ישפאר מוצרי צריכה בעמ** — כמות BINA: **100,000** — תאריך אספקה: **24 בנובמבר 2026**\n- **28504 | PIX ELINIR** — כמות BINA: **5,000** — תאריך אספקה: **30 בנובמבר 2026**'}/>);
    expect(container.querySelectorAll("dl")).toHaveLength(2);
    expect(container.textContent).not.toMatch(/[|—]/);
    expect(screen.getAllByText("תאריך אספקה")).toHaveLength(2);
    expect(container.textContent).toContain("100,000");
    expect(container.textContent).toContain("24 בנובמבר 2026");
  });
  it("renders a list after an introductory line and keeps untrusted HTML inert", () => {
    const { container } = render(<AnswerText text={'מומלץ לבדוק:\n- תחנה CD5\n- <img src=x onerror=alert(1)>\n\n| תחנה | עבודות |\n| --- | --- |\n| H08 | 5 |'}/>);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("group", { name: "נתוני ההשוואה" }).textContent).toContain("H08");
    expect(container.querySelector("img")).toBeNull();
  });
  it("keeps supplier names with literal asterisks inside bold text and reads Hebrew date ranges in order", () => {
    const { container } = render(<AnswerText text={'**אינפיניה שיווק וסחר בעמ *נייר חדרה (8)** בתקופה 15–21 בנובמבר 2026'}/>);
    expect(container.querySelector("strong")?.textContent).toBe("אינפיניה שיווק וסחר בעמ *נייר חדרה (8)");
    expect(container.textContent).not.toContain("**");
    expect(container.textContent).toContain("15 עד 21 בנובמבר 2026");
  });
  it("normalizes unambiguous dates while preserving invalid dates and business numbers", () => {
    expect(readableHebrewDates("15–21.11.2026; 2026-11-24; 31.02.2026; 100,000")).toBe("15 עד 21 בנובמבר 2026; 24 בנובמבר 2026; 31.02.2026; 100,000");
    expect(hebrewTimestamp("2026-11-22T07:21:00Z")).toBe("22 בנובמבר 2026 בשעה 09:21");
  });
});
describe("date selection", () => {
  it("rejects impossible dates and shifts January 31 to February rather than March", () => {
    expect(parseCalendarInput("31/02/2026")).toBeUndefined();
    expect(parseCalendarInput("29/02/2028")?.getDate()).toBe(29);
    expect(shiftMonth(new Date(2026, 0, 31), 1).getMonth()).toBe(1);
  });
  it("never submits stale dates when an edited date is invalid or the range is reversed", () => {
    const change = vi.fn();
    render(<DateRangePicker value={{ from: new Date(2026, 0, 10), to: new Date(2026, 0, 20) }} onChange={change} allowFutureDates/>);
    fireEvent.click(screen.getByRole("button", { name: /בחירת תקופה/ }));
    const apply = screen.getByRole("button", { name: "הצגת התקופה" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("מתאריך"), { target: { value: "31/02/2026" } });
    expect(apply.disabled).toBe(true); fireEvent.click(apply); expect(change).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("מתאריך"), { target: { value: "21/01/2026" } });
    expect(apply.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("עד תאריך"), { target: { value: "22/01/2026" } });
    expect(apply.disabled).toBe(false); fireEvent.click(apply);
    expect(change).toHaveBeenCalledWith({ from: new Date(2026, 0, 21), to: new Date(2026, 0, 22) });
  });
});
