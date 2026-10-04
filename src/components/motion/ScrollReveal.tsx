/**
 * A plain wrapper. It used to fade its contents in as they scrolled into view.
 *
 * That reveal was done in JavaScript: every wrapped block was sent to the
 * browser hidden (`opacity: 0`) and shown once the script had loaded. On a
 * slow phone the first screen of every page stayed blank until then --
 * measured on the live site at about 2.3 seconds of a 5 second first paint,
 * on a server that answers in a tenth of a second.
 *
 * A CSS-only, scroll-driven fade was tried in its place (4 Oct 2026). It
 * fixed the delay but left whatever sat at the bottom edge of the screen
 * half-faded until the reader scrolled, which is harder to read and failed
 * the contrast check. So the content is now simply there. A shop people pay
 * through should be readable before it is animated.
 *
 * The component and its `delay` prop are kept so the twenty-odd call sites
 * did not have to change with it; new code has no reason to use either.
 */
export default function ScrollReveal({
  children,
  className,
}: {
  children: React.ReactNode;
  /** No longer used. */
  delay?: number;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}
