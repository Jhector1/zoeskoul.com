export interface TransactionalEmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text?: string;
  readonly html?: string;
  readonly fromEmail: string;
  readonly fromName?: string;
}

export type TransactionalEmailDeliveryResult =
  | {
      readonly delivered: true;
      readonly remoteMessageId: string | null;
    }
  | {
      readonly delivered: false;
      readonly reason: string;
    };

export interface TransactionalEmailCapabilityHandler {
  send(
    message: TransactionalEmailMessage,
  ): Promise<TransactionalEmailDeliveryResult>;
}
