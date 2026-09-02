import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import NotificationCheck from "./NotificationCheck";

/**
 * The panel exists because notification failures are silent by design.
 *
 * `sendNotification` swallows every error so a mail outage can never take an
 * order down with it — which is right, and which means a wrong key looks
 * exactly like a working one until a shop applies, hears nothing for four days
 * and gives up. These tests hold the two things that make the panel worth
 * having: it says plainly when nothing is being sent, and when a send is
 * refused it names the fix rather than saying "something went wrong".
 *
 * `fireEvent`, not `user-event` — the latter is not installed, matching
 * `ApplicationReviewCard.test.tsx`.
 */

const sendTestNotification = vi.fn();
vi.mock("@/app/actions/notification-test", () => ({
  sendTestNotification: () => sendTestNotification(),
}));

describe("NotificationCheck", () => {
  it("says nothing is being sent when no provider is configured", () => {
    render(<NotificationCheck configured={false} provider={null} to="a@b.c" />);

    expect(screen.getByText(/Nothing is being sent/)).toBeVisible();
    // And is clear that the rest of the site is fine, so nobody goes hunting.
    expect(screen.getByText(/Everything else works normally/)).toBeVisible();
  });

  it("names the provider and the address when it is configured", () => {
    render(
      <NotificationCheck configured provider="brevo" to="owner@example.com" />,
    );

    expect(screen.getByText("brevo")).toBeVisible();
    expect(screen.getByText("owner@example.com")).toBeVisible();
  });

  it("confirms a successful send, and says where to look if it doesn't arrive", async () => {
    sendTestNotification.mockResolvedValue({
      ok: true,
      provider: "brevo",
      to: "owner@example.com",
    });

    render(
      <NotificationCheck configured provider="brevo" to="owner@example.com" />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Send a test notification" }),
    );

    expect(await screen.findByText(/Sent to/)).toBeVisible();
    expect(screen.getByText(/spam folder/)).toBeVisible();
  });

  // The case that will actually happen: Brevo refuses an unverified sender.
  it("explains a rejection as a key or an unverified sender", async () => {
    sendTestNotification.mockResolvedValue({
      ok: false,
      reason: "rejected",
      provider: "brevo",
      to: "owner@example.com",
    });

    render(
      <NotificationCheck configured provider="brevo" to="owner@example.com" />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Send a test notification" }),
    );

    expect(await screen.findByText("The provider refused it")).toBeVisible();
    expect(screen.getByText(/six-digit code/)).toBeVisible();
  });

  it("distinguishes a network failure from a misconfiguration", async () => {
    sendTestNotification.mockResolvedValue({
      ok: false,
      reason: "failed",
      provider: "brevo",
      to: "owner@example.com",
    });

    render(
      <NotificationCheck configured provider="brevo" to="owner@example.com" />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Send a test notification" }),
    );

    // Two different fixes: one is a setting, the other is a retry.
    expect(
      await screen.findByText("Couldn't reach the provider"),
    ).toBeVisible();
    expect(screen.getByText(/try again in a moment/)).toBeVisible();
  });

  it("points at the empty-string trap when nothing is configured", async () => {
    sendTestNotification.mockResolvedValue({
      ok: false,
      reason: "not-configured",
      provider: null,
      to: null,
    });

    render(<NotificationCheck configured={false} provider={null} to="a@b.c" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Send a test notification" }),
    );

    expect(await screen.findByText("No provider configured")).toBeVisible();
    expect(screen.getByText(/empty string/)).toBeVisible();
  });
});
