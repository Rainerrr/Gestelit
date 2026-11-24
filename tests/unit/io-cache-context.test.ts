import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedFor, clearMemoryCache } from "@/lib/server/memory-cache";
import { mergeScreenContext } from "@/lib/ai/screen-context";
afterEach(() => { clearMemoryCache(); vi.useRealTimers(); });
describe("I/O reduction without stale cross-screen context", () => {
 it("coalesces pending reads even after the TTL and expires after completion", async () => {
  vi.useFakeTimers(); let finish!: (n:number)=>void;
  const load=vi.fn(()=>new Promise<number>(resolve=>{finish=resolve;}));
  const first=cachedFor("x",100,load); await Promise.resolve();
  vi.advanceTimersByTime(200); const second=cachedFor("x",100,load);
  expect(second).toBe(first); finish(7); expect(await first).toBe(7);
  expect(await cachedFor("x",100,load)).toBe(7); expect(load).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(101); expect(await cachedFor("x",100,async()=>8)).toBe(8);
 });
 it("does not let an invalidated failed request remove new data", async () => {
  let fail!: (e:Error)=>void;
  const old=cachedFor("bina:x",100,()=>new Promise((_,reject)=>{fail=reject;}));
  const caught=old.catch(()=>null); await Promise.resolve(); clearMemoryCache("bina:");
  expect(await cachedFor("bina:x",100,async()=>9)).toBe(9);
  fail(Error("offline")); await caught;
  expect(await cachedFor("bina:x",100,async()=>10)).toBe(9);
 });
 it("uses current controls without losing the selected job or accepting credentials", () => {
  const context=mergeScreenContext({pathname:"/admin/jobs/1",selectedEntity:{workOrderId:"123"}},
    {filters:{dateFrom:"2026-11-01"},selectedEntity:{stationId:"cut"},token:"secret"},
    {dateFrom:"2024-11-01",search:"נייר"});
  expect(context.filters).toEqual({dateFrom:"2026-11-01",search:"נייר"});
  expect(context.selectedEntity).toEqual({workOrderId:"123",stationId:"cut"});
  expect(context).not.toHaveProperty("token");
 });
});
