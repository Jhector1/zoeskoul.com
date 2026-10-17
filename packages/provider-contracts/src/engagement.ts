export type MarketingConsentStatus =
  | "granted"
  | "revoked";

export type MarketingConsentChannel =
  | "email"
  | "sms"
  | "push";

export interface MarketingConsentRecord {
  readonly subjectId: string;
  readonly channel: MarketingConsentChannel;
  readonly purpose: string;
  readonly status: MarketingConsentStatus;
  readonly source: string;
  readonly policyVersion: string | null;
  readonly grantedAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface EngagementSubscriber {
  readonly email: string;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
}

export interface EngagementSubscribersCapabilityHandler {
  subscribe(
    subscriber: EngagementSubscriber,
  ): Promise<{ readonly remoteResourceId: string | null }>;

  unsubscribe(
    subscriber: EngagementSubscriber & {
      readonly remoteResourceId?: string | null;
    },
  ): Promise<void>;
}
