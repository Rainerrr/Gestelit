import { describe,it,expect } from "vitest";
import { normalizeSalesClientRef } from "@/lib/data/sales-client-reference";
describe("customer profile deep links",()=>{
 it("normalizes encoded page params before the API encodes them",()=>{
  for (const ref of ["bina:50200","local:3c1c8859-cd6f-4119-b8de-a18172457aac"]) {
   expect(normalizeSalesClientRef(ref)).toBe(ref);
   expect(normalizeSalesClientRef(encodeURIComponent(ref))).toBe(ref);
   expect(encodeURIComponent(normalizeSalesClientRef(encodeURIComponent(ref))!)).not.toContain("%253A");
  }
 });
 it("rejects malformed and ambiguous identities",()=>{
  for(const ref of ["%xx","local:unknown","bina:12/other","bina%253A12"]) expect(normalizeSalesClientRef(ref)).toBeNull();
 });
});
