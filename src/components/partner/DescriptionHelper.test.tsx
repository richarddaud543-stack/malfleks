import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const draftDescriptionAction = vi.fn();
vi.mock("@/app/actions/partner-ai", () => ({
  draftDescriptionAction: (...args: unknown[]) => draftDescriptionAction(...args),
}));

import DescriptionHelper from "./DescriptionHelper";

const FACTS = { name: "FreePods 4", category: "Audio", notes: "New, sealed.", specs: [], photoUrl: null };

beforeEach(() => draftDescriptionAction.mockReset());

describe("DescriptionHelper", () => {
  it("shows the draft for the partner to read, and writes nothing until they choose to use it", async () => {
    draftDescriptionAction.mockResolvedValue({ ok: true, description: "New, sealed wireless earbuds." });
    const onUse = vi.fn();
    render(<DescriptionHelper facts={() => FACTS} onUse={onUse} />);

    fireEvent.click(screen.getByRole("button", { name: "Help me write this" }));

    expect(await screen.findByTestId("description-draft")).toHaveTextContent("New, sealed wireless earbuds.");
    expect(draftDescriptionAction).toHaveBeenCalledWith(FACTS);
    expect(screen.getByText(/written by AI from what you typed/i)).toBeVisible();
    expect(onUse).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    expect(onUse).toHaveBeenCalledWith("New, sealed wireless earbuds.");
  });

  it("can be discarded without touching the form", async () => {
    draftDescriptionAction.mockResolvedValue({ ok: true, description: "A draft." });
    const onUse = vi.fn();
    render(<DescriptionHelper facts={() => FACTS} onUse={onUse} />);

    fireEvent.click(screen.getByRole("button", { name: "Help me write this" }));
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));

    expect(onUse).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Help me write this" })).toBeVisible();
  });

  it("says what to do when there is not enough to write from", async () => {
    draftDescriptionAction.mockResolvedValue({ ok: false, reason: "not-enough" });
    render(<DescriptionHelper facts={() => FACTS} onUse={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Help me write this" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/add a few facts first/i);
  });
});
