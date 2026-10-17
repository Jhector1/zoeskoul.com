export const COMMERCE_CAPABILITIES = [
  "commerce.catalog",
  "commerce.inventory",
  "commerce.cart",
  "commerce.orders",
  "commerce.checkout",
  "commerce.payments",
  "commerce.refunds",
  "commerce.customers",
  "commerce.fulfillment",
] as const;

export type CommerceCapability =
  (typeof COMMERCE_CAPABILITIES)[number];

export const ENGAGEMENT_CAPABILITIES = [
  "engagement.contacts",
  "engagement.subscribers",
  "engagement.segments",
  "engagement.campaigns",
  "engagement.automations",
] as const;

export type EngagementCapability =
  (typeof ENGAGEMENT_CAPABILITIES)[number];

export const MESSAGING_CAPABILITIES = [
  "messaging.email.transactional",
  "messaging.email.marketing",
  "messaging.sms",
  "messaging.push",
] as const;

export type MessagingCapability =
  (typeof MESSAGING_CAPABILITIES)[number];

export type ZoeProviderCapability =
  | CommerceCapability
  | EngagementCapability
  | MessagingCapability;
