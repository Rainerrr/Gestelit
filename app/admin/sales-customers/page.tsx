"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { UsersRound } from "lucide-react";
import { AdminLayout } from "@/app/admin/_components/admin-layout";
import { AdminPageHeader } from "@/app/admin/_components/admin-page-header";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Customer = { client_ref: string; customer_code: number | null; customer_name: string; salesperson: string | null; account_manager: string | null; account_manager_sales_user_id: string | null };
type User = { id: string; full_name: string };
export default function SalesCustomersPage() {
  useAdminGuard();
  const [search, setSearch] = useState("");
  const [owner, setOwner] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ rows: Customer[]; users: User[]; count: number }>({ rows: [], users: [], count: 0 });
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/admin/sales-customers?${new URLSearchParams({ search, owner, offset: String(offset) })}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        setData(await response.json());
      } catch { if (!controller.signal.aborted) setMessage("לא הצלחנו לטעון את הלקוחות. נסו שוב."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [search, owner, offset, revision]);
  return <AdminLayout header={<AdminPageHeader icon={UsersRound} title="לקוחות ושיוך לצוות" actions={<Link href="/admin/sales-daily-log" className="text-sm underline">חזרה ליומן מכירות</Link>} />}>
    <section dir="rtl" className="space-y-5">
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">לקוחות מתוך מסד הנתונים ונתוני BINA המסונכרנים. כל נציג רואה את התיק המשויך אליו. שמות נציגים שלא זוהו נשארים לבדיקה; שיוך ידני נשמר בהיסטוריה.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input aria-label="חיפוש לקוח" placeholder="חיפוש לפי שם לקוח, קוד או נציג" value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} className="max-w-xl" />
        <select aria-label="סינון לפי נציג" className="rounded-lg border bg-card p-2" value={owner} onChange={(e) => { setOwner(e.target.value); setOffset(0); }}>
          <option value="">כל הלקוחות</option><option value="unassigned">ממתינים לשיוך</option>
          {data.users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
        </select>
      </div>
      <div role="status" className="text-sm">{message || (loading ? "טוען לקוחות…" : `${data.count.toLocaleString("he-IL")} לקוחות`)}</div>
      <div className="grid gap-3 lg:grid-cols-2">{!loading && data.rows.map((c) => <CustomerRow key={`${c.client_ref}-${c.account_manager_sales_user_id}`} customer={c} users={data.users} onSaved={() => { setMessage(`השיוך של ${c.customer_name} נשמר`); setRevision((v) => v + 1); }} onError={setMessage} />)}</div>
      {!loading && data.rows.length === 0 && <p className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">לא נמצאו לקוחות התואמים לחיפוש.</p>}
      <div className="flex items-center justify-between"><Button variant="outline" disabled={loading || offset===0} onClick={() => setOffset((v) => Math.max(0,v-30))}>הקודם</Button><span className="text-sm"><bdi>{data.count ? offset+1 : 0}–{Math.min(offset+30,data.count)}</bdi> מתוך {data.count}</span><Button variant="outline" disabled={loading || offset+30>=data.count} onClick={() => setOffset((v) => v+30)}>הבא</Button></div>
    </section>
  </AdminLayout>;
}
function CustomerRow({customer:c,users,onSaved,onError}:{customer:Customer;users:User[];onSaved:()=>void;onError:(s:string)=>void}) {
  const [selected,setSelected]=useState(c.account_manager_sales_user_id ?? "");
  const [saving,setSaving]=useState(false);
  async function save() {
    setSaving(true);
    try {
      const response=await fetch("/api/admin/sales-customers",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientRef:c.client_ref,salesUserId:selected,expectedOwner:c.account_manager_sales_user_id})});
      if(!response.ok){onError(response.status===409 ? "השיוך השתנה בינתיים. רעננו את הרשימה לפני שמירה." : "השיוך לא נשמר. נסו שוב.");return;}
      onSaved();
    } catch {onError("לא הצלחנו לשמור את השיוך.");} finally {setSaving(false);}
  }
  return <article className="space-y-3 rounded-xl border bg-card p-4">
    <div><h2 className="font-semibold">{c.customer_name}</h2><p className="mt-1 text-xs text-muted-foreground">קוד לקוח: <bdi>{c.customer_code ?? "לקוח מקומי"}</bdi> · {c.account_manager_sales_user_id ? `משויך: ${c.account_manager}` : "ממתין לשיוך"}</p>{c.salesperson && <p className="mt-1 text-xs text-muted-foreground">נציג במקור: {c.salesperson}</p>}</div>
    <div className="flex flex-wrap gap-2"><select aria-label={`שיוך ${c.customer_name}`} value={selected} onChange={(e)=>setSelected(e.target.value)} disabled={saving} className="min-w-0 flex-1 rounded-lg border bg-background p-2 text-sm"><option value="" disabled>בחירת נציג</option>{users.map((u)=><option key={u.id} value={u.id}>{u.full_name}</option>)}</select><Button onClick={()=>void save()} disabled={saving || !selected || selected===c.account_manager_sales_user_id}>{saving ? "שומר…" : "שמירת שיוך"}</Button></div>
  </article>;
}
