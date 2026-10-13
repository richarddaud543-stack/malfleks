"use client";

import { useId, useState } from "react";

import {
  activateBrand,
  activateCourier,
  type ActivationResult,
} from "@/app/actions/partner-activation";
import { SERVED_CITIES } from "@/lib/partner-application";
import type { ActivatablePartner } from "@/server/partners/activation";

/**
 * The form that puts an approved partner into the catalogue.
 *
 * It asks for the things MalFleks must have confirmed rather than the things the
 * applicant typed, and the ordering is deliberate: the address and the
 * "confirmed with the business" tick sit together, unticked, so publishing an
 * unverified address takes a decision rather than a default. That flag is what
 * the branch page's trust badge reports, and the whole codebase was corrected
 * once already for treating it casually.
 *
 * The partner's own application details are shown above the form, because the
 * admin is copying from a phone call, not from this screen.
 */

const FAILURE: Record<string, string> = {
  forbidden: "Your session expired, or this account is no longer an admin.",
  "not-found": "This partner no longer exists.",
  "wrong-kind": "This partner isn't that kind of partner.",
  "partner-suspended": "This account is suspended, so nothing can go live.",
  "already-live": "This partner is already in the catalogue.",
  "missing-field": "Something required came through empty.",
  "unknown-city": "MalFleks doesn't serve that city yet.",
  "invalid-eta": "Delivery days must be whole numbers, smallest first.",
  "name-taken":
    "That name is already taken in the catalogue. Give it a distinct one.",
  "licence-not-checked":
    "Their driving licence hasn't been checked yet. Open the rider's page, read it, and press \"Documents checked\" first.",
  unavailable: "We couldn't reach the database. Nothing was changed.",
};

export default function PartnerActivationCard({
  partner,
  brands,
}: {
  partner: ActivatablePartner;
  brands: { id: string; name: string }[];
}) {
  const fieldId = useId();
  const isBrand = partner.kind === "brand";

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  // Brand fields
  const [brandId, setBrandId] = useState("");
  const [brandName, setBrandName] = useState(partner.displayName);
  const [category, setCategory] = useState("electronics");
  const [branchName, setBranchName] = useState(
    `${partner.displayName} — ${partner.city}`,
  );
  const [addressLine, setAddressLine] = useState(partner.address ?? "");
  const [phone, setPhone] = useState(partner.phone);
  const [hours, setHours] = useState("");
  const [deliveryOffered, setDeliveryOffered] = useState(false);
  const [verified, setVerified] = useState(false);

  // Courier fields
  const [agentName, setAgentName] = useState(partner.displayName);
  const [regions, setRegions] = useState<string[]>([]);
  const [etaMin, setEtaMin] = useState("1");
  const [etaMax, setEtaMax] = useState("2");

  const [city, setCity] = useState(partner.city);

  async function submit() {
    setBusy(true);
    setFailure(null);

    try {
      let result: ActivationResult;
      if (isBrand) {
        result = await activateBrand(partner.partnerId, {
          brandId: brandId || null,
          brandName,
          category,
          branchName,
          city,
          addressLine: addressLine.trim() || null,
          phone: phone.trim() || null,
          hours: hours.trim() || null,
          deliveryOffered,
          verified,
        });
      } else {
        result = await activateCourier(partner.partnerId, {
          name: agentName,
          city,
          regionsServed: regions,
          etaMinDays: Number(etaMin),
          etaMaxDays: Number(etaMax),
          phone: phone.trim() || null,
          verified,
        });
      }

      if (!result.ok) setFailure(FAILURE[result.reason] ?? FAILURE.unavailable);
    } catch {
      // The request itself failed (offline, a deploy mid-flight): nothing was changed.
      setFailure(FAILURE.unavailable);
    } finally {
      setBusy(false);
    }
    // On success the server revalidates and this card disappears from the list.
  }

  const field =
    "w-full rounded-xl border border-foreground/15 bg-surface-2 px-4 py-2.5 text-sm text-foreground outline-none transition-colors placeholder:text-muted hover:border-foreground/30";

  return (
    <li className="glass-card rounded-2xl px-5 py-5 sm:px-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg font-medium">
            {partner.displayName}
          </p>
          <p className="mt-1 text-sm text-muted">
            {isBrand ? "Brand branch" : "Courier"} · {partner.city} ·{" "}
            {partner.contactName} · {partner.phone}
          </p>
          {partner.address && (
            <p className="mt-1 text-sm text-muted">
              They gave: {partner.address}
            </p>
          )}
        </div>
        {!open && !isBrand && !partner.documentsChecked ? (
          // A rider is not sent to anyone's door before their licence is read.
          <a href={`/admin/partners/${partner.partnerId}`} className="text-sm font-medium text-accent hover:underline">
            Check their driving licence first →
          </a>
        ) : (
          !open && (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="btn-pill btn-lime px-5 py-2 text-sm"
            >
              {isBrand ? "Put on the map" : "Add to delivery"}
            </button>
          )
        )}
      </div>

      {open && (
        <div className="mt-6 grid gap-4">
          <p className="text-xs text-muted">
            This publishes to the live site. Only fill in an address and hours
            you have confirmed with the business.
          </p>

          {isBrand ? (
            <>
              <label className="text-sm font-medium" htmlFor={`${fieldId}-brand`}>
                Brand
              </label>
              <select
                id={`${fieldId}-brand`}
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                className={field}
              >
                <option value="">Create a new brand…</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>

              {brandId === "" && (
                <>
                  <input
                    aria-label="New brand name"
                    value={brandName}
                    onChange={(e) => setBrandName(e.target.value)}
                    placeholder="Brand name"
                    className={field}
                  />
                  <select
                    aria-label="Category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className={field}
                  >
                    <option value="automotive">Automotive</option>
                    <option value="electronics">Electronics</option>
                    <option value="telecom">Telecom</option>
                  </select>
                </>
              )}

              <input
                aria-label="Branch name"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
                placeholder="Branch name"
                className={field}
              />
              <select
                aria-label="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={field}
              >
                {SERVED_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <input
                aria-label="Street address (only if confirmed)"
                value={addressLine}
                onChange={(e) => setAddressLine(e.target.value)}
                placeholder="Street address — leave blank if unconfirmed"
                className={field}
              />
              <input
                aria-label="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Public phone number"
                className={field}
              />
              <input
                aria-label="Opening hours"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="Opening hours — leave blank if unconfirmed"
                className={field}
              />

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={deliveryOffered}
                  onChange={(e) => setDeliveryOffered(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                This branch delivers with its own vehicles
              </label>
              <p className="-mt-2 text-xs text-muted">
                Leave unticked and orders route to a courier covering{" "}
                {city}. If no courier covers it yet, customers are told the
                order can&apos;t be routed rather than being taken for a ride.
              </p>
            </>
          ) : (
            <>
              <input
                aria-label="Courier name"
                value={agentName}
                onChange={(e) => setAgentName(e.target.value)}
                placeholder="Courier name"
                className={field}
              />
              <select
                aria-label="Home city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={field}
              >
                {SERVED_CITIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <fieldset className="border-0 p-0">
                <legend className="text-sm font-medium">
                  Also covers{" "}
                  <span className="font-normal text-muted">(optional)</span>
                </legend>
                <div className="mt-2 flex flex-wrap gap-3">
                  {SERVED_CITIES.filter((c) => c !== city).map((c) => (
                    <label key={c} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={regions.includes(c)}
                        onChange={(e) =>
                          setRegions(
                            e.target.checked
                              ? [...regions, c]
                              : regions.filter((r) => r !== c),
                          )
                        }
                        className="accent-[var(--accent)]"
                      />
                      {c}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <input
                  aria-label="Fastest delivery in days"
                  inputMode="numeric"
                  value={etaMin}
                  onChange={(e) => setEtaMin(e.target.value)}
                  className={field}
                />
                <input
                  aria-label="Slowest delivery in days"
                  inputMode="numeric"
                  value={etaMax}
                  onChange={(e) => setEtaMax(e.target.value)}
                  className={field}
                />
              </div>
              <p className="-mt-2 text-xs text-muted">
                Days from pickup. 0 means same day.
              </p>
              <input
                aria-label="Phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Public phone number — leave blank if there isn't one"
                className={field}
              />
            </>
          )}

          <label className="flex items-start gap-3 rounded-xl border border-foreground/15 px-4 py-3 text-sm">
            <input
              type="checkbox"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
              className="mt-1 accent-[var(--accent)]"
            />
            <span>
              I have confirmed these details with the business itself.
              <span className="mt-1 block text-xs text-muted">
                This is what the &quot;Verified&quot; badge on the live site
                means. Leave it unticked if you are going from the application
                form alone — the page then tells visitors to check before
                travelling.
              </span>
            </span>
          </label>

          {failure && (
            <p
              role="alert"
              className="rounded-xl border border-red-600/40 bg-red-600/5 px-4 py-3 text-sm text-muted"
            >
              {failure}
            </p>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="btn-pill btn-lime px-6 py-2.5 text-sm disabled:opacity-60"
            >
              {busy ? "Publishing…" : "Publish to the live site"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="btn-pill btn-ink px-6 py-2.5 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
