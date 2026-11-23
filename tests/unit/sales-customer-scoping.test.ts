import { beforeEach,describe,expect,it,vi } from "vitest";
const state=vi.hoisted(()=>({calls:[] as unknown[][]}));
vi.mock("@/lib/supabase/client",()=>({createServiceSupabase:()=>({from:(table:string)=>{
 state.calls.push(["from",table]);
 const q:Record<string,unknown>={then:(resolve:(r:unknown)=>unknown)=>Promise.resolve(resolve({data:[],count:0,error:null}))};
 for(const method of ["select","eq","order","range","or"]){q[method]=(...args:unknown[])=>{state.calls.push([method,...args]);return q;};}return q;
}})}));
import {fetchSalesDormantClients,fetchSalesPortfolioClients,fetchSalesUserClients} from "@/lib/data/sales-log";
describe("personal customer scope",()=>{
 beforeEach(()=>{state.calls=[];});
 for(const [name,run] of [["portfolio",fetchSalesPortfolioClients],["dormant queue",fetchSalesDormantClients]] as const){
  it(`${name} stays empty instead of borrowing another user's matching display name`,async()=>{
   await run({salesUserId:"rep-id",salesperson:"Shared display name"});
   expect(state.calls.filter((c)=>c[0]==="from")).toHaveLength(1);
   expect(state.calls).toContainEqual(["eq","account_manager_sales_user_id","rep-id"]);
   expect(state.calls.some((c)=>c[1]==="account_manager")).toBe(false);
  });
 }
 it("autocomplete uses assigned database customers even without activity history",async()=>{
  expect(await fetchSalesUserClients("rep-id",{search:"50123"})).toEqual({ownClients:[],suggestedClients:[]});
  expect(state.calls).toContainEqual(["from","sales_customer_directory"]);
  expect(state.calls).toContainEqual(["eq","account_manager_sales_user_id","rep-id"]);
  expect(state.calls.find((c)=>c[0]==="or")?.[1]).toContain("customer_code.eq.50123");
 });
});
