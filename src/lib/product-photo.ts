/**
 * The one shape check a product photo URL must pass, shared by the browser
 * form (`ProductPhotoUpload`, for an early error) and the server
 * (`submitProduct`, the copy that counts).
 *
 * `Product.photoUrl` is optional and additive to the icon — see the note on
 * that column — but when it is set, it must actually be a public URL under
 * this project's own `product-photos` Supabase Storage bucket, never an
 * arbitrary external image. The upload widget only ever produces URLs of this
 * shape (from `supabase.storage.from("product-photos").getPublicUrl(...)`),
 * so this check exists to catch a forged or hand-edited value arriving at the
 * server, not to validate a well-behaved upload.
 */
export function isValidProductPhotoUrl(url: string, supabaseUrl: string): boolean {
  if (!supabaseUrl) return false;
  const prefix = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/product-photos/`;
  return url.startsWith(prefix) && url.length > prefix.length;
}
