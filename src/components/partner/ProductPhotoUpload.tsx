"use client";

import { useEffect, useId, useRef, useState } from "react";

import {
  PHOTO_INPUT_ACCEPT,
  PHOTO_MESSAGES,
  ownsPhotoPath,
  photoObjectPath,
  type PhotoOutputFormat,
} from "@/lib/photo-prep";
import { preparePhoto } from "@/lib/photo-prep-browser";
import {
  MAX_PRODUCT_PHOTOS,
  PRODUCT_PHOTO_BUCKET,
  productPhotoPath,
} from "@/lib/product-photo";
import { cleanPhotoBackgroundAction, type CleanPhotoResult } from "@/app/actions/partner-ai";
import { createBrowserSupabase } from "@/lib/supabase-browser";
import { useLocale } from "@/i18n/client";
import { PARTNER } from "@/i18n/copy/partner";

/** Set as a notice when there is no room for the cleaned copy; shown in the reader's language. */
const REMOVE_FIRST = "Remove a photo first — the cleaned copy is added beside the original, and a listing can have 6.";

const CLEAN_MESSAGES: Record<Exclude<CleanPhotoResult, { ok: true }>["reason"], string> = {
  "signed-out": "Your session expired. Sign in again and retry.",
  unavailable: "Background cleaning isn't available right now. Your photo is fine as it is.",
  "not-a-partner": "Background cleaning is for active partners only.",
  "rate-limited": "That's a lot of photos in one hour. Try again later.",
  "invalid-photo": "We couldn't read that photo. Remove it and add it again.",
  "provider-failed": "We couldn't clean that photo just now. Your original is unchanged.",
  "not-faithful": "The cleaned copy changed how the item looks, so we did not use it. Your original is unchanged.",
  paused: "Background cleaning is switched off at the moment. Your photo is fine as it is.",
};

/**
 * Real photos of the item, uploaded straight to Supabase Storage from the
 * browser. Up to six; the first is the main one.
 *
 * Optional and additive to the icon chooser beside it — this can be left
 * empty and the listing is still complete. Files go directly (no server round
 * trip for the bytes themselves) to the `product-photos` bucket, under the
 * signed-in partner's own uid — `<uid>/<file>` — which is exactly what the
 * bucket's insert policy checks. `onChange` receives the public URLs of the
 * photos that finished uploading, main one first.
 *
 * ## Shrunk before it is sent
 *
 * Partners list from phones, on mobile data, and a phone camera produces
 * 4–12 MB files. Every photo is resized in the browser (longest side 1600px)
 * and re-encoded before upload, which turns a minute of upload on a patchy
 * connection into a few seconds and keeps the product page light for the
 * buyer too. Nothing else is done to it — see the honesty rule in
 * `photo-prep.ts`.
 *
 * ## One tile per photo, each with its own state
 *
 * preparing → uploading → done, or failed. A failed *upload* keeps the
 * already-prepared file and offers "Try again", because the usual cause is
 * the connection dropping and making someone re-pick and re-shrink the photo
 * for that is the kind of friction that ends with a listing that has no
 * photos. A photo that cannot be used at all (too small, not a photo) says
 * why and offers only "Remove".
 *
 * ## Removing cleans up
 *
 * Taking a photo off the listing also deletes the file just uploaded, when it
 * sits in this partner's own folder. Best effort: if the delete fails the
 * photo is still gone from the listing, which is what was asked for, and an
 * orphaned file costs a little storage rather than anything a customer sees.
 */

type PhotoStatus = "preparing" | "uploading" | "done" | "failed";

interface PhotoItem {
  id: string;
  /** The file's own name, for labels while it has no position yet. */
  name: string;
  /** Shown straight away, before anything is uploaded. Revoked on removal. */
  previewUrl: string | null;
  status: PhotoStatus;
  error?: string;
  /** Only an upload failure can be retried; a rejected photo cannot. */
  retryable?: boolean;
  /** The public URL, once uploaded. */
  url?: string;
  /** The object path in the bucket, once uploaded — what removal deletes. */
  path?: string;
}

interface Prepared {
  blob: Blob;
  format: PhotoOutputFormat;
}

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Photos that count towards the limit: everything except a rejected one. */
function activeCount(items: PhotoItem[]): number {
  return items.filter((item) => item.status !== "failed" || item.retryable).length;
}

function isBusy(items: PhotoItem[]): boolean {
  return items.some((item) => item.status === "preparing" || item.status === "uploading");
}

function uploadedUrls(items: PhotoItem[]): string[] {
  return items.flatMap((item) => (item.status === "done" && item.url ? [item.url] : []));
}

export default function ProductPhotoUpload({
  value,
  onChange,
  onBusyChange,
  error,
  cleanBackground = false,
}: {
  /**
   * Offer "Clean background" on uploaded photos. Only true when the
   * deployment has a key for it; see `src/server/ai/listing-help.ts`.
   */
  cleanBackground?: boolean;
  /** Uploaded photo URLs, main one first. */
  value: string[];
  onChange: (urls: string[]) => void;
  /**
   * Told when photos start and stop being prepared or uploaded, so the form
   * can hold "Send for review" until they are in. Sending mid-upload would
   * file the listing without the photo the partner is watching upload.
   */
  onBusyChange?: (busy: boolean) => void;
  error?: string;
}) {
  const inputId = useId();
  const copy = PARTNER[useLocale()].photos;
  const hintId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [items, setItems] = useState<PhotoItem[]>(() =>
    value.map((url) => ({ id: newId(), name: "", previewUrl: null, status: "done", url })),
  );
  const [notice, setNotice] = useState<string | null>(null);
  /** The photo whose background is being cleaned right now, if any. One at a time. */
  const [cleaningId, setCleaningId] = useState<string | null>(null);

  // Uploads finish long after the render that started them. Everything an
  // async step needs is read through a ref so it sees the present, not the
  // moment the file was picked:
  //
  // - `itemsRef`: the current list, so a finishing upload does not write back
  //   a copy from before two other photos were added.
  // - `onChangeRef`: the parent's *current* handler. The form's handler closes
  //   over its own state, so calling a stale one would overwrite whatever the
  //   partner typed into the description while the photo was uploading.
  const itemsRef = useRef<PhotoItem[]>(items);
  const onChangeRef = useRef(onChange);
  const onBusyChangeRef = useRef(onBusyChange);
  const lastBusyRef = useRef(false);
  const preparedRef = useRef(new Map<string, Prepared>());
  const lastSentRef = useRef(value.join("\n"));

  useEffect(() => {
    onChangeRef.current = onChange;
    onBusyChangeRef.current = onBusyChange;
  });

  // Object URLs are not garbage collected; each one pins its file in memory
  // until revoked. Removal revokes its own, and this covers leaving the page.
  useEffect(() => {
    const prepared = preparedRef.current;
    return () => {
      for (const item of itemsRef.current) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
      prepared.clear();
    };
  }, []);

  function commit(update: (current: PhotoItem[]) => PhotoItem[]) {
    const next = update(itemsRef.current);
    itemsRef.current = next;
    setItems(next);

    const urls = uploadedUrls(next);
    const key = urls.join("\n");
    if (key !== lastSentRef.current) {
      lastSentRef.current = key;
      onChangeRef.current(urls);
    }

    const busy = isBusy(next);
    if (busy !== lastBusyRef.current) {
      lastBusyRef.current = busy;
      onBusyChangeRef.current?.(busy);
    }
  }

  function patch(id: string, change: Partial<PhotoItem>) {
    commit((current) => current.map((item) => (item.id === id ? { ...item, ...change } : item)));
  }

  async function upload(id: string) {
    const prepared = preparedRef.current.get(id);
    // Removed while it was being prepared — nothing left to upload for.
    if (!prepared || !itemsRef.current.some((item) => item.id === id)) return;

    patch(id, { status: "uploading", error: undefined, retryable: undefined });

    const supabase = createBrowserSupabase();
    if (!supabase) {
      patch(id, { status: "failed", error: PHOTO_MESSAGES.unavailable, retryable: true });
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        patch(id, { status: "failed", error: PHOTO_MESSAGES.signedOut, retryable: true });
        return;
      }

      // A fresh name on every attempt: a retry after a half-finished upload
      // must not collide with whatever the first attempt left behind
      // (`upsert: false`).
      const path = photoObjectPath(user.id, newId(), prepared.format);
      const { error: uploadError } = await supabase.storage
        .from(PRODUCT_PHOTO_BUCKET)
        .upload(path, prepared.blob, {
          contentType: prepared.format.contentType,
          upsert: false,
        });

      if (uploadError) {
        patch(id, { status: "failed", error: PHOTO_MESSAGES.uploadFailed, retryable: true });
        return;
      }

      const { data } = supabase.storage.from(PRODUCT_PHOTO_BUCKET).getPublicUrl(path);

      if (!itemsRef.current.some((item) => item.id === id)) {
        // Removed while the upload was in flight: do not leave the file
        // behind with nothing pointing at it.
        void supabase.storage.from(PRODUCT_PHOTO_BUCKET).remove([path]).catch(() => {});
        return;
      }

      preparedRef.current.delete(id);
      patch(id, { status: "done", url: data.publicUrl, path });
    } catch {
      // A dropped connection surfaces as a thrown fetch error, not as
      // `uploadError`. Same message, same retry.
      patch(id, { status: "failed", error: PHOTO_MESSAGES.uploadFailed, retryable: true });
    }
  }

  async function addFiles(files: File[]): Promise<string[]> {
    setNotice(null);

    const room = MAX_PRODUCT_PHOTOS - activeCount(itemsRef.current);
    const accepted = files.slice(0, Math.max(0, room));
    if (accepted.length < files.length) setNotice(PHOTO_MESSAGES.tooMany);
    if (accepted.length === 0) return [];

    const added = accepted.map((file) => ({
      file,
      item: {
        id: newId(),
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        status: "preparing",
      } satisfies PhotoItem,
    }));
    commit((current) => [...current, ...added.map((entry) => entry.item)]);

    // One at a time, on purpose. Decoding a 12-megapixel photo takes tens of
    // megabytes of memory; doing six at once is how a low-end phone's browser
    // tab gets killed halfway through a listing.
    for (const { file, item } of added) {
      const result = await preparePhoto(file);
      if (!itemsRef.current.some((existing) => existing.id === item.id)) continue;

      if (!result.ok) {
        // The preview is dropped as well: for a file the browser could not
        // open it would be a broken-image box.
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
        patch(item.id, {
          status: "failed",
          error: result.message,
          retryable: false,
          previewUrl: null,
        });
        continue;
      }

      preparedRef.current.set(item.id, { blob: result.blob, format: result.format });
      await upload(item.id);
    }
    return added.map((entry) => entry.item.id);
  }

  /**
   * The same photo on a plain white background, added as a NEW photo.
   *
   * The original is never replaced or deleted: it stays in the listing, so a
   * shopper can always see the photo as the partner took it. The cleaned copy
   * comes back from the server as bytes and goes through `addFiles` like a
   * photo picked from the gallery -- same checks, same re-encode, same upload
   * -- and takes the original's place as main photo only if the original was
   * the main one.
   */
  async function clean(id: string) {
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!item?.url || cleaningId) return;
    if (activeCount(itemsRef.current) >= MAX_PRODUCT_PHOTOS) {
      setNotice(REMOVE_FIRST);
      return;
    }

    setNotice(null);
    setCleaningId(id);
    try {
      const wasMain = itemsRef.current.find((entry) => entry.status === "done")?.id === id;
      const result = await cleanPhotoBackgroundAction(item.url);
      if (!result.ok) {
        setNotice(CLEAN_MESSAGES[result.reason]);
        return;
      }
      const bytes = Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0));
      const extension = result.contentType === "image/png" ? "png" : result.contentType === "image/webp" ? "webp" : "jpg";
      const file = new File([bytes], `cleaned-background.${extension}`, { type: result.contentType });
      const [cleanedId] = await addFiles([file]);
      const added = itemsRef.current.find((entry) => entry.id === cleanedId);
      if (wasMain && added?.status === "done") makeMain(added.id);
    } catch {
      setNotice(CLEAN_MESSAGES["provider-failed"]);
    } finally {
      setCleaningId(null);
    }
  }

  function remove(id: string) {
    const item = itemsRef.current.find((entry) => entry.id === id);
    if (!item) return;

    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    preparedRef.current.delete(id);
    commit((current) => current.filter((entry) => entry.id !== id));
    setNotice(null);

    // Delete the uploaded file too, so files nobody listed do not pile up in
    // the bucket. Only inside this partner's own folder, and best effort —
    // see the note at the top of this file.
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
    const path = item.path ?? (item.url ? productPhotoPath(item.url, supabaseUrl) : null);
    if (!path) return;

    void (async () => {
      try {
        const supabase = createBrowserSupabase();
        if (!supabase) return;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user || !ownsPhotoPath(path, user.id)) return;
        await supabase.storage.from(PRODUCT_PHOTO_BUCKET).remove([path]);
      } catch {
        // Ignored on purpose.
      }
    })();
  }

  function makeMain(id: string) {
    commit((current) => {
      const chosen = current.find((item) => item.id === id);
      if (!chosen) return current;
      return [chosen, ...current.filter((item) => item.id !== id)];
    });
  }

  /**
   * The messages are set in English where things go wrong (some of them in
   * code shared with the server); this finds the same message in the
   * reader's language. Anything it does not recognise is shown as it is.
   */
  function inLanguage(message: string | undefined): string | undefined {
    if (!message) return message;
    for (const key of Object.keys(PHOTO_MESSAGES) as (keyof typeof PHOTO_MESSAGES)[]) {
      if (PHOTO_MESSAGES[key] === message) return copy.messages[key];
    }
    for (const key of Object.keys(CLEAN_MESSAGES) as (keyof typeof CLEAN_MESSAGES)[]) {
      if (CLEAN_MESSAGES[key] === message) return copy.clean[key];
    }
    return message === REMOVE_FIRST ? copy.removeFirst : message;
  }

  const shownError = error ?? inLanguage(notice ?? undefined);
  const full = activeCount(items) >= MAX_PRODUCT_PHOTOS;
  const busy = isBusy(items);
  const mainId = items.find((item) => item.status === "done")?.id;

  // Small, quiet, and 44px tall: these are tapped with a thumb.
  const tileButton =
    "min-h-11 w-full rounded-lg border border-foreground/15 px-2 text-xs font-medium transition-colors hover:border-foreground/40";

  return (
    <fieldset className="border-0 p-0">
      <legend className="text-sm font-medium">
        {copy.legend} <span className="font-normal text-muted">{copy.optional}</span>
      </legend>
      <p id={hintId} className="mt-1 text-xs text-muted">
        {copy.hint(MAX_PRODUCT_PHOTOS)}
      </p>

      {items.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item, index) => {
            const label = copy.photoN(index + 1);
            const isMain = item.id === mainId;
            const preview = item.previewUrl ?? item.url ?? null;

            return (
              <li
                key={item.id}
                data-status={item.status}
                className={`flex flex-col gap-2 rounded-xl border p-2 ${
                  item.status === "failed" ? "border-red-600/50" : "border-foreground/15"
                }`}
              >
                <div className="relative aspect-square overflow-hidden rounded-lg bg-white">
                  {preview ? (
                    // A plain img: before upload this is a `blob:` URL from
                    // the partner's own device, which the image optimiser can
                    // never fetch. `object-contain`, like every other photo
                    // frame — the partner sees the whole photo, as the buyer
                    // will.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preview}
                      alt={copy.yours(label, item.name ?? "")}
                      className={`h-full w-full object-contain ${
                        item.status === "done" ? "" : "opacity-60"
                      }`}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center px-2 text-center text-xs text-muted">
                      {item.name || copy.photo}
                    </span>
                  )}
                  {isMain && (
                    <span className="absolute left-1.5 top-1.5 rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background">
                      {copy.main}
                    </span>
                  )}
                </div>

                {/* `role="status"` so a screen reader hears each photo's
                    progress without the partner having to go looking. */}
                <p role="status" className="min-h-4 text-xs text-muted">
                  {item.status === "preparing" && copy.preparing}
                  {item.status === "uploading" && copy.uploading}
                  {item.status === "done" && copy.uploaded}
                </p>
                {item.status === "failed" && item.error && (
                  <p role="alert" className="text-xs text-red-600">
                    {inLanguage(item.error)}
                  </p>
                )}

                <div className="mt-auto grid gap-1.5">
                  {item.status === "failed" && item.retryable && (
                    <button
                      type="button"
                      onClick={() => void upload(item.id)}
                      aria-label={copy.retryLabel(label)}
                      className={`${tileButton} border-accent text-accent`}
                    >
                      {copy.retry}
                    </button>
                  )}
                  {item.status === "done" && !isMain && (
                    <button
                      type="button"
                      onClick={() => makeMain(item.id)}
                      aria-label={copy.makeMainLabel(label)}
                      className={tileButton}
                    >
                      {copy.makeMain}
                    </button>
                  )}
                  {cleanBackground && item.status === "done" && (
                    <button
                      type="button"
                      onClick={() => void clean(item.id)}
                      disabled={cleaningId !== null || full}
                      aria-label={copy.cleanLabel(label)}
                      className={`${tileButton} disabled:cursor-not-allowed disabled:opacity-55`}
                    >
                      {cleaningId === item.id ? copy.cleaning : copy.cleanAction}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    aria-label={copy.removeLabel(label)}
                    className={`${tileButton} text-muted`}
                  >
                    {copy.remove}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-3">
        {!full && (
          <label
            htmlFor={inputId}
            // `focus-within` because the real control is the visually hidden
            // input inside this label's reach; without it a keyboard user
            // tabs onto something with no visible focus at all.
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-foreground/20 px-4 py-6 text-center text-sm text-muted transition-colors focus-within:border-accent hover:border-foreground/40"
          >
            {items.length === 0 ? copy.chooseFirst : copy.addMore}
            <input
              ref={fileInputRef}
              id={inputId}
              data-field="photoUrls"
              type="file"
              multiple
              accept={PHOTO_INPUT_ACCEPT}
              aria-describedby={hintId}
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                // Cleared straight away so picking the same file again (after
                // removing it, say) still fires a change event.
                event.target.value = "";
                if (files.length > 0) void addFiles(files);
              }}
              className="sr-only"
            />
          </label>
        )}
        {full && (
          <p className="text-xs text-muted">
            {copy.full}
          </p>
        )}
      </div>

      {shownError && (
        <p className="mt-2 text-xs text-red-600" role="alert">
          {shownError}
        </p>
      )}
      {busy && (
        <p className="mt-2 text-xs text-muted">
          {copy.keepFilling}
        </p>
      )}

      {/* What marketplaces that live on their photos ask sellers for. Short,
          because nobody reads a photography guide on the way to listing a
          phone — and specific, because "take good photos" helps no one. */}
      <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">
        {copy.tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
        {cleanBackground && (
          <li>
            {copy.cleanTip}
          </li>
        )}
      </ul>
    </fieldset>
  );
}
