/**
 * Centralized branding configuration.
 *
 * The product is currently named "BundlePilot" but this is a working name.
 * Every user-facing surface (admin UI, theme extension, emails, metafield
 * namespace prefixes excluded — those are permanent identifiers) should read
 * from this file so the name can change with a single edit.
 */
export const BRAND = {
  /** User-facing product name shown in the admin UI, theme editor, etc. */
  name: "BundlePilot",
  /** Short tagline used on empty states / onboarding. */
  tagline: "Quantity breaks and mix & match bundles for Shopify.",
  /** Support/contact email shown in billing and privacy surfaces. */
  supportEmail: "support@bundlepilot.app",
} as const;

/**
 * Namespace used for all app-owned metafields and metaobjects.
 *
 * This is a permanent technical identifier (Shopify metafield namespaces are
 * hard to migrate once merchants have data), so it intentionally does NOT
 * track the `BRAND.name` rename knob above.
 */
export const METAFIELD_NAMESPACE = "bundlepilot";
