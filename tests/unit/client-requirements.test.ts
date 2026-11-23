import {describe,it,expect} from 'vitest';
import {buildFollowUpCalendar,calendarText} from '@/lib/calendar';
import {validateSalesBusinessPlan} from '@/lib/ai/query/plan';
import {validateOperationTask,validateSupplierCapability} from '@/lib/data/operations';
describe('client requirement boundaries',()=>{
 it('exports Hebrew all-day events with stable IDs, exclusive end date and cancellation',()=>{
  const event={id:'fixture-1',date:'2026-12-31',customerName:'לקוח בדיקה',nextAction:'לחזור ללקוח',updatedAt:'2026-11-23T10:00:00Z'};
  const first=buildFollowUpCalendar([event],new Date('2026-11-23T11:00:00Z'));
  expect(first).toContain('DTEND;VALUE=DATE:20270101');expect(first).toContain('UID:fixture-1@gestelit');
  const second=buildFollowUpCalendar([{...event,date:'2027-01-02',cancelled:true}]);expect(second).toContain('UID:fixture-1@gestelit');expect(second).toContain('STATUS:CANCELLED');expect(second).toContain('DTSTART;VALUE=DATE:20270102');
 });
 it('escapes injected ICS properties and folds Hebrew at UTF-8 boundaries',()=>{
  const text=buildFollowUpCalendar([{id:'safe',date:'2026-11-23',customerName:'אבג'.repeat(80),nextAction:'hello\r\nATTENDEE:private@example.com'}]);
  expect(text).not.toContain('\r\nATTENDEE:');expect(text).not.toContain('\ufffd');for(const line of text.split('\r\n'))expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  expect(calendarText('a,b;c\\d')).toBe('a\\,b\\;c\\\\d');
 });
 it('does not export impossible dates',()=>expect(buildFollowUpCalendar([{id:'bad',date:'2026-02-30'}])).not.toContain('BEGIN:VEVENT'));
 it.each([{dataset:'sales_orders',viewer_id:'someone_else'},{dataset:'sales_customers',scope:'team'},{dataset:'sales_users'},{dataset:'sales_invoices',columns:['password_hash']},{dataset:'sales_invoices',measures:[{op:'sum',column:'total_amount'}]}])('rejects unsafe business query %j',plan=>expect(()=>validateSalesBusinessPlan(plan)).toThrow());
 it('allows currency-separated invoice ranking and production counts',()=>{
  expect(validateSalesBusinessPlan({dataset:'sales_invoices',groupBy:['currency','customer_name'],measures:[{op:'sum',column:'total_amount'}]})).toBeTruthy();
  expect(validateSalesBusinessPlan({dataset:'sales_orders',measures:[{op:'count'}]})).toBeTruthy();
 });
 it('validates workflow transitions and price validity',()=>{
  expect(()=>validateOperationTask({title:'משימה',status:'invented'})).toThrow('INVALID_TASK');
  expect(()=>validateSupplierCapability({supplier_code:1,service_name:'הדפסה',unit:'יחידה',unit_price:-1,currency:'ILS'})).toThrow();
  expect(()=>validateSupplierCapability({supplier_code:1,service_name:'הדפסה',unit:'יחידה',currency:'ILS',valid_from:'2026-12-01',valid_until:'2026-11-01'})).toThrow();
  expect(validateOperationTask({title:'בדיקת תחזוקה',status:'in_progress',category:'maintenance'}).status).toBe('in_progress');
 });
});
