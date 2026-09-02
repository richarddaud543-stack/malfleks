import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The guard every admin Server Action runs.
 *
 * A Server Action is a public HTTP endpoint: knowing its id is enough to POST
 * to it from anywhere, on any hostname the deployment answers on. So the thing
 * worth pinning here is not "an admin gets through" — it is that each of the
 * four conditions refuses *on its own*, and in particular that a genuine admin
 * with a valid session is still refused when the request did not arrive on the
 * admin hostname. Otherwise moving the console to its own address would be a
 * change to the pages only, with every write it performs still reachable from
 * the public site.
 */

const isAuthConfigured = vi.fn();
const adminRoutesAvailable = vi.fn();
const verifySession = vi.fn();
const isAdminUser = vi.fn();

vi.mock("./config", () => ({ isAuthConfigured: () => isAuthConfigured() }));
vi.mock("./host", () => ({ adminRoutesAvailable: () => adminRoutesAvailable() }));
vi.mock("./dal", () => ({ verifySession: () => verifySession() }));
vi.mock("./admin", () => ({
  isAdminUser: (session: unknown) => isAdminUser(session),
}));

const { adminSession } = await import("./admin-session");

const ADMIN = { uid: "u1", email: "owner@example.com", admin: true };

describe("adminSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isAuthConfigured.mockReturnValue(true);
    adminRoutesAvailable.mockResolvedValue(true);
    verifySession.mockResolvedValue(ADMIN);
    isAdminUser.mockReturnValue(true);
  });

  it("returns the session when every condition holds", async () => {
    await expect(adminSession()).resolves.toEqual(ADMIN);
  });

  it("refuses a real admin arriving on the wrong hostname", async () => {
    // The case that makes the separate admin site mean anything.
    adminRoutesAvailable.mockResolvedValue(false);
    await expect(adminSession()).resolves.toBeNull();
  });

  it("checks the hostname before spending a session lookup", async () => {
    adminRoutesAvailable.mockResolvedValue(false);
    await adminSession();
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("refuses when auth is not configured at all", async () => {
    // A supported deployment state, not a broken one — and it must not fall
    // through to a session check that would throw.
    isAuthConfigured.mockReturnValue(false);
    await expect(adminSession()).resolves.toBeNull();
    expect(verifySession).not.toHaveBeenCalled();
  });

  it("refuses a signed-out visitor", async () => {
    verifySession.mockResolvedValue(null);
    await expect(adminSession()).resolves.toBeNull();
  });

  it("refuses a signed-in non-admin", async () => {
    isAdminUser.mockReturnValue(false);
    await expect(adminSession()).resolves.toBeNull();
  });
});
