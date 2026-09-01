/**
 * The one address Soko publishes, in one place.
 *
 * It appears on the terms, the privacy notice and the contact page, and it is
 * where partner applications and order requests are announced. Three copies of
 * an email address is how a site ends up with two live ones and one that
 * bounces, so there is one constant and every surface reads it.
 *
 * Deliberately not an env var: a contact address that can vanish from a
 * deployment is a privacy notice that can silently stop naming anywhere to
 * write to, which is the one thing a privacy notice must always do.
 */
export const SOKO_CONTACT_EMAIL = "richarddaud543@gmail.com";
