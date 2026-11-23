import { describe, expect, it, vi } from "vitest";
import { upsertBinaBatches } from "@/lib/bina/sync-batches";
describe("BINA ingestion under reporting load", () => {
 it("splits timed-out writes without losing or duplicating sibling IDs", async () => {
  const saved: number[] = [];
  const result = await upsertBinaBatches(Array.from({length:225}, (_,i)=>i), async rows => {
   if(rows.length>25) return {error:{message:"canceling statement due to statement timeout",code:"57014"}};
   saved.push(...rows); return {error:null};
  });
  expect(result).toEqual({upserted:225,error:null});
  expect(saved).toEqual(Array.from({length:225}, (_,i)=>i));
 });
 it("reports exactly the committed prefix when a later batch fails", async () => {
  const write=vi.fn().mockResolvedValueOnce({error:null}).mockResolvedValue({error:{message:"constraint failed",code:"23514"}});
  const result=await upsertBinaBatches(Array.from({length:250}),write);
  expect(result).toEqual({upserted:100,error:{message:"constraint failed",code:"23514"}});
  expect(write).toHaveBeenCalledTimes(2);
 });
});
