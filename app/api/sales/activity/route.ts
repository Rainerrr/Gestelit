import { NextResponse } from "next/server";
import { requireSalesSessionUser } from "@/lib/auth/sales-session";
import {
  createSalesActivityAttachment,
  createSalesActivityForUser,
  fetchSalesUserActivities,
  fetchSalesUserSummary,
  type SalesActivityInput,
} from "@/lib/data/sales-log";
import { uploadSalesAttachmentToStorage } from "@/lib/utils/storage";
import { normalizeSalesInteger, normalizeSalesText } from "@/lib/data/sales-log-utils";
import { salesListParams } from "@/app/api/admin/sales-daily-log/_route-utils";

export const dynamic = "force-dynamic";

function formText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function formNumberOrNull(formData: FormData, key: string) {
  const value = formText(formData, key);
  return value ? value : null;
}

function formJsonRecord(formData: FormData, key: string) {
  const value = formText(formData, key);
  if (!value) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function formPayload(formData: FormData): Omit<SalesActivityInput, "salesperson" | "sales_user_id" | "portal_submitted_at"> {
  return {
    event_type: formText(formData, "event_type") as SalesActivityInput["event_type"],
    event_at: formText(formData, "event_at") || null,
    customer_name: formText(formData, "customer_name"),
    customer_code: normalizeSalesInteger(formText(formData, "customer_code")),
    local_client_id: formText(formData, "local_client_id") || null,
    contact_person: formText(formData, "contact_person"),
    raw_note: formText(formData, "raw_note"),
    ai_summary: formText(formData, "ai_summary"),
    ai_next_action: formText(formData, "ai_next_action"),
    next_action_date: formText(formData, "next_action_date"),
    estimated_revenue: formNumberOrNull(formData, "estimated_revenue"),
    actual_revenue: formNumberOrNull(formData, "actual_revenue"),
    currency: formText(formData, "currency") || "ILS",
    status: (formText(formData, "status") || "open") as SalesActivityInput["status"],
    source: (formText(formData, "source") || "manual") as SalesActivityInput["source"],
    metadata: {
      ...formJsonRecord(formData, "metadata"),
      portalComment: normalizeSalesText(formText(formData, "portal_comment"), 1000),
    },
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireSalesSessionUser();
    const [activities, summary] = await Promise.all([
      fetchSalesUserActivities(user.id, salesListParams(request)),
      fetchSalesUserSummary(user.id),
    ]);
    return NextResponse.json({ user, ...activities, summary });
  } catch {
    return NextResponse.json({ error: "SALES_UNAUTHORIZED" }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireSalesSessionUser();
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ error: "INVALID_PAYLOAD" }, { status: 400 });
    }

    const files = formData
      .getAll("attachments")
      .filter((item): item is File => item instanceof File && item.size > 0)
      .slice(0, 5);

    const activity = await createSalesActivityForUser(user, formPayload(formData));
    const attachments = [];

    for (const file of files) {
      const uploaded = await uploadSalesAttachmentToStorage(file, {
        pathPrefix: `${user.id}/${activity.id}`,
      });
      attachments.push(await createSalesActivityAttachment({
        salesActivityId: activity.id,
        salesUserId: user.id,
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        storageBucket: "sales-activity-attachments",
        storagePath: uploaded.path,
        publicUrl: uploaded.publicUrl,
      }));
    }

    return NextResponse.json({ activity: { ...activity, attachments } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "SALES_ACTIVITY_CREATE_FAILED";
    const status = message === "SALES_UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
