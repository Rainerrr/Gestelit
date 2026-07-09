import { Buffer } from "buffer";
import { createServiceSupabase } from "@/lib/supabase/client";

type UploadResult = {
  path: string;
  publicUrl: string;
};

const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB
const SALES_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const SALES_ATTACHMENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export async function uploadImageToStorage(
  file: File,
  options: { bucket: string; pathPrefix: string },
): Promise<UploadResult> {
  if (!file.type.startsWith("image/")) {
    throw new Error("INVALID_FILE_TYPE");
  }

  if (file.size > IMAGE_MAX_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }

  const supabase = createServiceSupabase();
  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.name.split(".").pop();
  const safeExtension = extension ? `.${extension}` : "";
  const fileName = `${crypto.randomUUID()}${safeExtension}`;
  const objectPath = `${options.pathPrefix}/${Date.now()}-${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(options.bucket)
    .upload(objectPath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`UPLOAD_FAILED:${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(options.bucket).getPublicUrl(objectPath);

  return { path: objectPath, publicUrl };
}

export async function uploadSalesAttachmentToStorage(
  file: File,
  options: { pathPrefix: string },
): Promise<UploadResult> {
  if (!SALES_ATTACHMENT_TYPES.has(file.type)) {
    throw new Error("INVALID_FILE_TYPE");
  }

  if (file.size > SALES_ATTACHMENT_MAX_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }

  const supabase = createServiceSupabase();
  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.name.split(".").pop();
  const safeExtension = extension ? `.${extension}` : "";
  const fileName = `${crypto.randomUUID()}${safeExtension}`;
  const objectPath = `${options.pathPrefix}/${Date.now()}-${fileName}`;
  const bucket = "sales-activity-attachments";

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(objectPath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`UPLOAD_FAILED:${uploadError.message}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(bucket).getPublicUrl(objectPath);

  return { path: objectPath, publicUrl };
}


