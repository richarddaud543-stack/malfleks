"use client";

import { useId, useRef, useState } from "react";

import { createBrowserSupabase } from "@/lib/supabase-browser";

const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/**
 * A real photo, uploaded straight to Supabase Storage from the browser.
 *
 * Optional and additive to the icon chooser beside it — this can be left
 * empty and the listing is still complete. When a partner does pick a file,
 * it uploads directly (no server round trip for the bytes themselves) to the
 * `product-photos` bucket, scoped under the signed-in partner's own uid —
 * `<uid>/<file>` — which is exactly what the bucket's insert policy checks.
 * `onChange` receives the resulting public URL, or `""` to clear it.
 */
export default function ProductPhotoUpload({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (url: string) => void;
  error?: string;
}) {
  const inputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setLocalError(null);

    if (!ACCEPTED_TYPES.includes(file.type)) {
      setLocalError("Use a JPEG, PNG or WEBP image.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setLocalError("Keep the photo under 5 MB.");
      return;
    }

    const supabase = createBrowserSupabase();
    if (!supabase) {
      setLocalError("Photo upload isn't available right now.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLocalError("Your session expired. Sign in again and retry.");
      return;
    }

    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("product-photos")
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadError) {
      setUploading(false);
      setLocalError("The upload didn't go through. Try again.");
      return;
    }

    const { data } = supabase.storage.from("product-photos").getPublicUrl(path);
    setUploading(false);
    onChange(data.publicUrl);
  }

  const shownError = error ?? localError ?? undefined;

  return (
    <fieldset className="border-0 p-0" data-field="photoUrl">
      <legend className="text-sm font-medium">
        Add a real photo <span className="font-normal text-muted">(optional)</span>
      </legend>
      <p className="mt-1 text-xs text-muted">
        Beyond the symbol above — a real picture of this exact item. JPEG, PNG
        or WEBP, up to 5 MB.
      </p>

      <div className="mt-3">
        {value ? (
          <div className="flex items-center gap-3">
            {/* Plain img, not next/image: this is a partner-uploaded photo
                from a Supabase Storage bucket, not a build-time known set of
                remote hosts to allow-list. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Uploaded product photo"
              className="h-20 w-20 rounded-xl border border-foreground/15 object-cover"
            />
            <button
              type="button"
              onClick={() => {
                onChange("");
                setLocalError(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              className="text-sm text-accent underline decoration-border underline-offset-4"
            >
              Remove photo
            </button>
          </div>
        ) : (
          <label
            htmlFor={inputId}
            className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-foreground/20 px-4 py-6 text-center text-sm text-muted transition-colors hover:border-foreground/40"
          >
            {uploading ? "Uploading…" : "Choose a photo to upload"}
          </label>
        )}
        <input
          ref={fileInputRef}
          id={inputId}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
          className="sr-only"
        />
      </div>

      {shownError && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {shownError}
        </p>
      )}
    </fieldset>
  );
}
