import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ row: null as Record<string,unknown> | null, calls: [] as unknown[][] }));
vi.mock("@/lib/supabase/client", () => ({createServiceSupabase: () => ({from: (table: string) => {
 state.calls.push(["from",table]);
 const query = {select: (value: string) => { state.calls.push(["select",value]); return query; },
 eq: (key: string,value: string) => {state.calls.push(["eq",key,value]);return query;},
 maybeSingle: async () => ({data:state.row,error:null})};return query;
}})}));
import { resolveSalesActivityCustomer } from "@/lib/data/sales-customer-ownership";
describe("sales customer ownership", () => {
 beforeEach(()=>{state.calls=[];state.row={customer_code:50200,local_client_id:null,customer_name:"שם מהמסד",account_manager_sales_user_id:"rep-a"};});
 it("uses the database name and code, never the submitted label",async()=>{
  expect(await resolveSalesActivityCustomer("rep-a",{customer_code:50200,customer_name:"forged"})).toEqual({customer_code:50200,local_client_id:null,customer_name:"שם מהמסד"});
  expect(state.calls).toContainEqual(["eq","client_ref","bina:50200"]);
 });
 it("rejects another representative's customer even with a valid customer code",async()=>{
  await expect(resolveSalesActivityCustomer("rep-b",{customer_code:50200})).rejects.toThrow("SALES_CLIENT_FORBIDDEN");
 });
 it("rejects an unassigned customer",async()=>{
  state.row!.account_manager_sales_user_id=null;
  await expect(resolveSalesActivityCustomer("rep-a",{customer_code:50200})).rejects.toThrow("SALES_CLIENT_FORBIDDEN");
 });
 it("rejects free text instead of silently creating a customer",async()=>{
  await expect(resolveSalesActivityCustomer("rep-a",{customer_name:"new"})).rejects.toThrow("SALES_CLIENT_SELECTION_REQUIRED");
  expect(state.calls).toEqual([]);
 });
 it("rejects mixed identities and deleted customers",async()=>{
  await expect(resolveSalesActivityCustomer("rep-a",{customer_code:50200,local_client_id:"local"})).rejects.toThrow("SALES_CLIENT_IDENTITY_INVALID");
  state.row=null;
  await expect(resolveSalesActivityCustomer("rep-a",{customer_code:50200})).rejects.toThrow("SALES_CLIENT_FORBIDDEN");
 });
 it("resolves local customers through their stable identity",async()=>{
  state.row={customer_code:null,local_client_id:"local-1",customer_name:"חדש",account_manager_sales_user_id:"rep-a"};
  expect((await resolveSalesActivityCustomer("rep-a",{local_client_id:"local-1"})).local_client_id).toBe("local-1");
  expect(state.calls).toContainEqual(["eq","client_ref","local:local-1"]);
 });
});
