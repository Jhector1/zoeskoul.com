export interface CommercePaymentSessionRequest {
  readonly orderId: string;
  readonly amountMinor: number;
  readonly currency: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly idempotencyKey: string;
}

export interface CommercePaymentSession {
  readonly remoteResourceId: string;
  readonly redirectUrl: string | null;
  readonly expiresAt: Date | null;
}

export type CommercePaymentState =
  | "pending"
  | "paid"
  | "failed"
  | "canceled"
  | "expired";

export interface CommercePaymentInspection {
  readonly remoteResourceId: string;
  readonly state: CommercePaymentState;
}

export interface CommerceRefundRequest {
  readonly localPaymentId: string;
  readonly remotePaymentId: string;
  readonly amountMinor: number | null;
  readonly idempotencyKey: string;
}

export interface CommerceRefundResult {
  readonly remoteRefundId: string;
}

export interface CommercePaymentsCapabilityHandler {
  createPaymentSession(
    request: CommercePaymentSessionRequest,
  ): Promise<CommercePaymentSession>;

  inspectPayment(
    remoteResourceId: string,
  ): Promise<CommercePaymentInspection>;

  cancelPayment?(
    remoteResourceId: string,
  ): Promise<CommercePaymentInspection>;

  refundPayment?(
    request: CommerceRefundRequest,
  ): Promise<CommerceRefundResult>;
}

export interface CommerceCheckoutRequest {
  readonly cartId: string;
  readonly idempotencyKey: string;
}

export interface CommerceCheckoutResult {
  readonly orderId: string;
  readonly redirectUrl: string | null;
}

export interface CommerceCheckoutCapabilityHandler {
  beginCheckout(
    request: CommerceCheckoutRequest,
  ): Promise<CommerceCheckoutResult>;
}
