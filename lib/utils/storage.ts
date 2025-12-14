import { Buffer } from "buffer";
import { createServiceSupabase } from "@/lib/supabase/client";

type UploadResult = {
  path: string;
  publicUrl: string;
};

const IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5MB

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



