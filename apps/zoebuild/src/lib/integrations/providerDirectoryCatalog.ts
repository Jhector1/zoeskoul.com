/**
 * Public presentation metadata ONLY. This is not a provider registration,
 * capability implementation, credential store, or proof of connectivity.
 * Every actionable connection state must come from its owning backend.
 */
export type ProviderDirectoryCategory =
  | "commerce"
  | "payments"
  | "marketing"
  | "databases"
  | "seo";

export type ProviderPresentation = Readonly<{
  id: string;
  name: string;
  description: string;
  initials: string;
  simpleIconSlug?: string;
}>;

export const PROVIDER_PRESENTATIONS: Readonly<Record<ProviderDirectoryCategory, readonly ProviderPresentation[]>> = {
  commerce: [
    { id: "zoebuild-native", name: "Zoé Store", description: "Native products, inventory, cart, checkout and orders.", initials: "Z" },
    { id: "shopify", name: "Shopify", description: "Connect your Shopify store with merchant authorization.", initials: "S", simpleIconSlug: "shopify" },
    { id: "woocommerce", name: "WooCommerce", description: "Commerce for WordPress storefronts.", initials: "W", simpleIconSlug: "woocommerce" },
    { id: "bigcommerce", name: "BigCommerce", description: "External commerce platform.", initials: "B", simpleIconSlug: "bigcommerce" },
    { id: "square", name: "Square", description: "Commerce and point-of-sale platform.", initials: "Sq", simpleIconSlug: "square" },
  ],
  payments: [
    { id: "stripe", name: "Stripe", description: "Online payments with separately managed test and live connections.", initials: "S", simpleIconSlug: "stripe" },
    { id: "paypal", name: "PayPal", description: "Online payment service.", initials: "P", simpleIconSlug: "paypal" },
    { id: "square", name: "Square", description: "Payments and merchant services.", initials: "Sq", simpleIconSlug: "square" },
  ],
  marketing: [
    { id: "resend", name: "Resend", description: "Transactional email service.", initials: "R", simpleIconSlug: "resend" },
    { id: "sendgrid", name: "SendGrid", description: "Email delivery provider.", initials: "Sg", simpleIconSlug: "sendgrid" },
    { id: "mailgun", name: "Mailgun", description: "Email delivery and routing.", initials: "Mg", simpleIconSlug: "mailgun" },
    { id: "mailchimp", name: "Mailchimp", description: "Email marketing campaigns.", initials: "Mc", simpleIconSlug: "mailchimp" },
    { id: "klaviyo", name: "Klaviyo", description: "Marketing automation.", initials: "K", simpleIconSlug: "klaviyo" },
  ],
  databases: [
    { id: "neon", name: "Neon", description: "Serverless PostgreSQL.", initials: "N", simpleIconSlug: "neon" },
    { id: "supabase", name: "Supabase", description: "PostgreSQL, storage and backend services.", initials: "S", simpleIconSlug: "supabase" },
    { id: "firebase", name: "Firebase", description: "Firestore and Realtime Database.", initials: "F", simpleIconSlug: "firebase" },
    { id: "turso", name: "Turso", description: "SQLite-compatible database services.", initials: "T", simpleIconSlug: "turso" },
    { id: "planetscale", name: "PlanetScale", description: "Managed relational databases.", initials: "P", simpleIconSlug: "planetscale" },
    { id: "mongodb-atlas", name: "MongoDB Atlas", description: "Managed document database.", initials: "M", simpleIconSlug: "mongodb" },
  ],
  seo: [
    { id: "google-analytics", name: "Google Analytics", description: "Website analytics and measurement.", initials: "GA", simpleIconSlug: "googleanalytics" },
    { id: "posthog", name: "PostHog", description: "Product analytics.", initials: "PH", simpleIconSlug: "posthog" },
    { id: "plausible", name: "Plausible", description: "Privacy-conscious site analytics.", initials: "P", simpleIconSlug: "plausibleanalytics" },
  ],
};
