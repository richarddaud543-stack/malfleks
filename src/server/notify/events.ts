import { resolveAdminUrl, resolveSiteUrl } from "@/lib/site-url";
import { getPrisma } from "@/server/db/client";
import { logServerError } from "@/server/error-log";
import {
  applicationApprovedMessage,
  applicationRejectedMessage,
  autoPayoutAttentionAdminMessage,
  deliveryProblemAdminMessage,
  branchNewOrderMessage,
  orderCancelledMessage,
  orderDeliveredMessage,
  orderPaidPartnerMessage,
  orderRequestMessage,
  partnerActivatedMessage,
  partnerStatusMessage,
  payoutSentMessage,
  productPublishedMessage,
  productSentBackMessage,
  refundDueAdminMessage,
  refundRecordedMessage,
  sendCustomerEmail,
  sendNotification,
  sendPartnerEmail,
} from "./email";

/**
 * Who is told what, and when.
 *
 * `email.ts` knows how to word a message and how to hand it to a provider.
 * This module knows the other half: which event concerns whom, and where
 * their address comes from. Until 3 Oct 2026 the answer to "who is told" was
 * "MalFleks's own inbox, and the customer twice" -- a partner learned their
 * application was approved, that an order was waiting on them, or that they
 * had been paid, only by signing in and looking. Every step that needs a
 * person to act now tells that person.
 *
 * ## The rules every function here keeps
 *
 * **Called after the database commit, by the caller that saw it succeed.**
 * Nothing here runs inside a transaction, and nothing here is called for an
 * outcome that was not `ok` -- so a repeat of an action that already happened
 * (a second approve, a second confirm, a webhook delivered twice) sends
 * nothing, because the guarded write underneath it matched no rows.
 *
 * **Never throws, never blocks the action.** Every function goes through
 * `afterCommit`, which catches everything and writes it to the error log. An
 * order that was confirmed stays confirmed whether or not an email API
 * answered a moment later.
 *
 * **Reads what to say from the database, not from the caller.** Each takes an
 * id and re-reads the row, so the email states what was actually recorded --
 * the stored reason, the stored amount -- rather than whatever a form field
 * held on its way in.
 *
 * ## Where a partner's address comes from
 *
 * `Partner` has no email column. A partner exists only because an admin
 * approved a `PartnerApplication` (`Partner.applicationId`, unique), and that
 * application's `email` was taken from the applicant's verified session, never
 * from the form -- the same account that then became the `PartnerUser`. So the
 * application's address *is* the address of the person who signs in as this
 * partner. A partner with no usable address on file is skipped silently: the
 * same information is on their partner page, and MalFleks's own inbox is told
 * about every order regardless.
 */

/**
 * Run a notification after a commit: never throws, logs what went wrong.
 *
 * The one helper every send in this codebase's newer paths goes through, so
 * "a failed email never fails the action" is a property of one function
 * rather than of every call site remembering its own try/catch.
 */
export async function afterCommit(context: string, work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    await logServerError(context, error);
  }
}

type SendResult = { sent: true } | { sent: false; reason: string };

/**
 * A provider that refused or could not be reached is worth a line in the error
 * log; "nobody to send to" and "no provider configured" are normal states and
 * are not.
 */
async function logIfUndelivered(context: string, what: string, result: SendResult): Promise<void> {
  if (result.sent || result.reason === "no-address" || result.reason === "not-configured") return;
  await logServerError(context, new Error(`Could not email ${what}: ${result.reason}`));
}

function firstName(fullName: string): string | null {
  return fullName.trim().split(/\s+/)[0] || null;
}

// ---------------------------------------------------------------------------
// Finding a partner's address
// ---------------------------------------------------------------------------

export interface PartnerContact {
  partnerId: string;
  kind: string;
  status: string;
  displayName: string;
  contactName: string;
  /** `PartnerApplication.email`, or null when there is none on file. */
  email: string | null;
}

type PartnerKey = { id: string } | { branchId: string } | { agentId: string };

/** The partner behind a branch, a courier or a partner id, with the address they applied from. */
export async function partnerContact(key: PartnerKey): Promise<PartnerContact | null> {
  const db = getPrisma();
  const partner = await db.partner.findFirst({
    where: key,
    // A branch or courier maps to one partner. Should a second ever point at
    // the same row, the oldest is the one that was put on the map.
    orderBy: { approvedAt: "asc" },
    select: { id: true, kind: true, status: true, displayName: true, contactName: true, applicationId: true },
  });
  if (!partner) return null;

  const application = await db.partnerApplication.findUnique({
    where: { id: partner.applicationId },
    select: { email: true },
  });

  return {
    partnerId: partner.id,
    kind: partner.kind,
    status: partner.status,
    displayName: partner.displayName,
    contactName: partner.contactName,
    email: application?.email?.trim() || null,
  };
}

/**
 * The partner to write to about an order, or null.
 *
 * A suspended partner is not sent order mail: they cannot act on it (see
 * `branch-decisions.ts`), and MalFleks's own inbox is told about every order
 * anyway, so the order is not lost -- it is handled by the person who can.
 */
async function activePartnerFor(key: PartnerKey | null): Promise<PartnerContact | null> {
  if (!key) return null;
  const contact = await partnerContact(key);
  return contact && contact.status === "active" && contact.email ? contact : null;
}

// ---------------------------------------------------------------------------
// Partner applications
// ---------------------------------------------------------------------------

/** After an application is approved or rejected: tell the applicant, with the reason for a rejection. */
export function notifyApplicationDecision(applicationId: string): Promise<void> {
  return afterCommit("notify-application-decision", async () => {
    const application = await getPrisma().partnerApplication.findUnique({
      where: { id: applicationId },
      select: { status: true, kind: true, email: true, businessName: true, contactName: true, decisionNote: true },
    });
    if (!application || application.status === "pending") return;

    const siteUrl = resolveSiteUrl();
    const { subject, body } =
      application.status === "approved"
        ? applicationApprovedMessage({
            contactName: application.contactName,
            businessName: application.businessName,
            kind: application.kind,
            siteUrl,
          })
        : applicationRejectedMessage({
            contactName: application.contactName,
            businessName: application.businessName,
            reason: application.decisionNote,
            siteUrl,
          });
    await logIfUndelivered(
      "notify-application-decision",
      `the ${application.status} decision for application ${applicationId}`,
      await sendPartnerEmail(application.email, subject, body),
    );
  });
}

/** After a branch is put on the map or a courier is added to the routing. */
export function notifyPartnerActivated(partnerId: string): Promise<void> {
  return afterCommit("notify-partner-activated", async () => {
    const contact = await partnerContact({ id: partnerId });
    if (!contact?.email) return;
    const { subject, body } = partnerActivatedMessage({
      contactName: contact.contactName,
      businessName: contact.displayName,
      kind: contact.kind,
      siteUrl: resolveSiteUrl(),
    });
    await logIfUndelivered("notify-partner-activated", `partner ${partnerId} that they are live`, await sendPartnerEmail(contact.email, subject, body));
  });
}

/** After a suspend or a reactivate. Sent to a suspended partner too -- it is the one message they must get. */
export function notifyPartnerStatus(partnerId: string): Promise<void> {
  return afterCommit("notify-partner-status", async () => {
    const [contact, partner] = await Promise.all([
      partnerContact({ id: partnerId }),
      getPrisma().partner.findUnique({ where: { id: partnerId }, select: { status: true, statusNote: true } }),
    ]);
    if (!contact?.email || !partner) return;
    const { subject, body } = partnerStatusMessage({
      status: partner.status === "active" ? "active" : "suspended",
      businessName: contact.displayName,
      reason: partner.statusNote,
      siteUrl: resolveSiteUrl(),
    });
    await logIfUndelivered("notify-partner-status", `partner ${partnerId} their new status`, await sendPartnerEmail(contact.email, subject, body));
  });
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

/** After a submission is published or sent back: tell the partner who submitted it. */
export function notifyProductDecision(submissionId: string): Promise<void> {
  return afterCommit("notify-product-decision", async () => {
    const submission = await getPrisma().productSubmission.findUnique({
      where: { id: submissionId },
      select: { status: true, name: true, partnerId: true, decisionNote: true, publishedProductId: true },
    });
    if (!submission || submission.status === "pending" || !submission.partnerId) return;

    const contact = await partnerContact({ id: submission.partnerId });
    if (!contact?.email) return;

    const siteUrl = resolveSiteUrl();
    const { subject, body } =
      submission.status === "published"
        ? productPublishedMessage({ productName: submission.name, productId: submission.publishedProductId, siteUrl })
        : productSentBackMessage({ productName: submission.name, reason: submission.decisionNote, siteUrl });
    await logIfUndelivered("notify-product-decision", `the decision on submission ${submissionId}`, await sendPartnerEmail(contact.email, subject, body));
  });
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/**
 * A new order: MalFleks's inbox always, and the branch when it has a partner.
 *
 * The branch half is what makes "Waiting for the branch" on the customer's
 * page true. Before it, the branch found out about an order when somebody at
 * MalFleks rang them.
 *
 * Both are attempted even if one fails -- they go to different people.
 */
export async function notifyOfNewOrder(
  reference: string,
  { tellBranch, awaitingPayment = false }: { tellBranch: boolean; awaitingPayment?: boolean },
): Promise<void> {
  await afterCommit("notify-of-order", async () => {
    const { subject, body } = orderRequestMessage({ reference, adminUrl: resolveAdminUrl(), awaitingPayment });
    await sendNotification(subject, body);
  });

  if (!tellBranch) return;
  await afterCommit("notify-branch-of-order", async () => {
    const order = await getPrisma().order.findUnique({
      where: { reference },
      select: { status: true, branchId: true, productName: true, quantity: true },
    });
    // Only an order still waiting on the branch is worth this email.
    if (!order || order.status !== "pending") return;

    const branch = await activePartnerFor(order.branchId ? { branchId: order.branchId } : null);
    if (!branch) return;

    const message = branchNewOrderMessage({
      reference,
      productName: order.productName,
      quantity: order.quantity,
      siteUrl: resolveSiteUrl(),
    });
    await logIfUndelivered("notify-branch-of-order", `the branch about order ${reference}`, await sendPartnerEmail(branch.email, message.subject, message.body));
  });
}

/**
 * The customer has paid: tell whoever has to move the goods.
 *
 * On a brand route the branch delivers. On an agent route the courier is told
 * to collect and deliver, and the branch is told to hand it over. Called by
 * `capturePayment` for the one call that actually captured, after its
 * transaction has committed -- a second webhook delivery never reaches it.
 */
export function notifyPartnersOfPayment(paymentId: string): Promise<void> {
  return afterCommit("notify-partners-of-payment", async () => {
    const payment = await getPrisma().orderPayment.findUnique({
      where: { id: paymentId },
      select: {
        status: true,
        order: {
          select: {
            reference: true,
            status: true,
            productName: true,
            quantity: true,
            branchId: true,
            agentId: true,
            branchName: true,
            routeKind: true,
            routeCarrier: true,
          },
        },
      },
    });
    if (!payment || payment.status !== "captured") return;
    const { order } = payment;
    // Paid after it was already delivered or cancelled: there is nothing left
    // for a partner to do, and "deliver now" would be wrong.
    if (order.status !== "confirmed") return;

    const siteUrl = resolveSiteUrl();
    const base = {
      reference: order.reference,
      productName: order.productName,
      quantity: order.quantity,
      branchName: order.branchName,
      carrier: order.routeCarrier,
      siteUrl,
    };
    const byCourier = order.routeKind === "agent";

    const [branch, courier] = await Promise.all([
      activePartnerFor(order.branchId ? { branchId: order.branchId } : null),
      byCourier ? activePartnerFor(order.agentId ? { agentId: order.agentId } : null) : null,
    ]);

    const sends: Promise<void>[] = [];
    if (branch) {
      const message = orderPaidPartnerMessage({ ...base, role: byCourier ? "hand-over" : "deliver" });
      sends.push(
        sendPartnerEmail(branch.email, message.subject, message.body).then((r) =>
          logIfUndelivered("notify-partners-of-payment", `the branch that ${order.reference} is paid`, r),
        ),
      );
    }
    if (courier) {
      const message = orderPaidPartnerMessage({ ...base, role: "collect" });
      sends.push(
        sendPartnerEmail(courier.email, message.subject, message.body).then((r) =>
          logIfUndelivered("notify-partners-of-payment", `the courier that ${order.reference} is paid`, r),
        ),
      );
    }
    await Promise.all(sends);
  });
}

/**
 * The order was cancelled: tell the customer, with the reason, and say plainly
 * whether any money is involved.
 *
 * "Paid" is read here, from the payments table, at send time.
 */
export function notifyOrderCancelled(orderId: string): Promise<void> {
  return afterCommit("notify-order-cancelled", async () => {
    const order = await getPrisma().order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        reference: true,
        productName: true,
        decisionNote: true,
        customerFullName: true,
        customerEmail: true,
        payments: { where: { status: "captured" }, select: { id: true }, take: 1 },
      },
    });
    if (!order || order.status !== "cancelled") return;

    const { subject, body } = orderCancelledMessage({
      firstName: firstName(order.customerFullName),
      reference: order.reference,
      productName: order.productName,
      reason: order.decisionNote,
      paid: order.payments.length > 0,
      siteUrl: resolveSiteUrl(),
    });
    await logIfUndelivered("notify-order-cancelled", `the customer that ${order.reference} was cancelled`, await sendCustomerEmail(order.customerEmail, subject, body));

    // A cancelled order that was paid for is money MalFleks now owes back.
    // Since a branch can decline a paid order itself, nobody at MalFleks
    // necessarily saw it happen -- so the inbox is told, every time.
    if (order.payments.length > 0) {
      // Imported here, not at the top: refund-send.ts reaches back into this
      // module to tell the customer when the refund has gone.
      const { refundWillBeAutomatic } = await import("@/server/money/refund-send");
      const automatic = await refundWillBeAutomatic(orderId);
      const notice = refundDueAdminMessage({ reference: order.reference, productName: order.productName, reason: order.decisionNote, adminUrl: resolveAdminUrl(), automatic });
      await logIfUndelivered("notify-order-cancelled", `MalFleks that ${order.reference} needs a refund`, await sendNotification(notice.subject, notice.body));
    }
  });
}

/** The order was marked delivered: thank the customer and leave them the record. */
export function notifyOrderDelivered(orderId: string): Promise<void> {
  return afterCommit("notify-order-delivered", async () => {
    const order = await getPrisma().order.findUnique({
      where: { id: orderId },
      select: { status: true, reference: true, productName: true, customerFullName: true, customerEmail: true },
    });
    if (!order || order.status !== "fulfilled") return;

    const { subject, body } = orderDeliveredMessage({
      firstName: firstName(order.customerFullName),
      reference: order.reference,
      productName: order.productName,
      siteUrl: resolveSiteUrl(),
    });
    await logIfUndelivered("notify-order-delivered", `the customer that ${order.reference} was delivered`, await sendCustomerEmail(order.customerEmail, subject, body));
  });
}

// ---------------------------------------------------------------------------
// Money -- told about, never touched
// ---------------------------------------------------------------------------

/**
 * A refund was recorded: tell the customer how much and under what reference.
 *
 * The amount and reference are the ones the admin just recorded, passed in by
 * the action that recorded them: a `LedgerEntry` keeps the reference inside a
 * free-text note, and parsing it back out to save two arguments would be the
 * more fragile choice.
 */
export function notifyRefundRecorded(orderId: string, amountTZS: number, refundReference: string): Promise<void> {
  return afterCommit("notify-refund-recorded", async () => {
    const order = await getPrisma().order.findUnique({
      where: { id: orderId },
      select: { reference: true, customerFullName: true, customerEmail: true },
    });
    if (!order) return;

    const { subject, body } = refundRecordedMessage({
      firstName: firstName(order.customerFullName),
      reference: order.reference,
      amountTZS,
      refundReference: refundReference.trim(),
      siteUrl: resolveSiteUrl(),
    });
    await logIfUndelivered("notify-refund-recorded", `the customer about the refund on ${order.reference}`, await sendCustomerEmail(order.customerEmail, subject, body));
  });
}

/** A payout batch was recorded as sent: tell the branch or courier it was for. */
export function notifyPayoutSent(batchId: string): Promise<void> {
  return afterCommit("notify-payout-sent", async () => {
    const batch = await getPrisma().payoutBatch.findUnique({
      where: { id: batchId },
      select: { status: true, payeeType: true, payeeId: true, totalTZS: true, providerRef: true, entries: { select: { orderId: true } } },
    });
    if (!batch || batch.status !== "paid" || !batch.providerRef) return;

    // Suspended or not: money that was sent is theirs to know about.
    const contact = await partnerContact(batch.payeeType === "agent" ? { agentId: batch.payeeId } : { branchId: batch.payeeId });
    if (!contact?.email) return;

    const { subject, body } = payoutSentMessage({
      amountTZS: batch.totalTZS,
      payoutReference: batch.providerRef,
      orderCount: new Set(batch.entries.map((e) => e.orderId)).size,
      siteUrl: resolveSiteUrl(),
    });
    await logIfUndelivered("notify-payout-sent", `partner ${contact.partnerId} about payout ${batchId}`, await sendPartnerEmail(contact.email, subject, body));
  });
}

// ---------------------------------------------------------------------------
// Things only MalFleks can settle
// ---------------------------------------------------------------------------

/**
 * A delivery the customer's code could not confirm: the partner reported a
 * problem, or the order locked after too many wrong codes. MalFleks's inbox is
 * told, because until an admin acts nobody is paid and the customer's money
 * stays held.
 */
export function notifyDeliveryNeedsAdmin(orderId: string, why: "reported" | "locked"): Promise<void> {
  return afterCommit("notify-delivery-needs-admin", async () => {
    const order = await getPrisma().order.findUnique({
      where: { id: orderId },
      select: { reference: true, productName: true, deliveryCode: { select: { problemNote: true } } },
    });
    if (!order) return;
    const { subject, body } = deliveryProblemAdminMessage({
      reference: order.reference,
      productName: order.productName,
      why,
      note: order.deliveryCode?.problemNote ?? null,
      adminUrl: resolveAdminUrl(),
    });
    await logIfUndelivered("notify-delivery-needs-admin", `MalFleks that ${order.reference} needs settling`, await sendNotification(subject, body));
  });
}

/** An automatic payout that came back: tell MalFleks's inbox, with what ClickPesa said. */
export function notifyAutoPayoutNeedsAttention(batchId: string): Promise<void> {
  return afterCommit("notify-auto-payout-attention", async () => {
    const batch = await getPrisma().payoutBatch.findUnique({
      where: { id: batchId },
      select: { payeeType: true, payeeId: true, totalTZS: true, failureNote: true },
    });
    if (!batch) return;
    const contact = await partnerContact(batch.payeeType === "agent" ? { agentId: batch.payeeId } : { branchId: batch.payeeId });
    const { subject, body } = autoPayoutAttentionAdminMessage({
      payee: contact?.displayName ?? (batch.payeeType === "agent" ? "a courier" : "a branch"),
      amountTZS: batch.totalTZS,
      note: batch.failureNote,
      adminUrl: resolveAdminUrl(),
    });
    await logIfUndelivered("notify-auto-payout-attention", `MalFleks about payout ${batchId}`, await sendNotification(subject, body));
  });
}
