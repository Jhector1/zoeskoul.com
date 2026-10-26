/** Type-only declaration for the read-only JavaScript migration preflight.
 * Maintained alongside check-ai-credit-result-schema-v12j10b.mjs.
 * No database access or runtime behavior is introduced by this file.
 */
export type AiCreditJournalSchemaStage = "pending" | "applied";
export type AiCreditJournalSchemaParity = Readonly<{
  stage: AiCreditJournalSchemaStage;
  applied: number;
  pending: number;
}>;
export declare function verifiedJournalPreflight(): Promise<AiCreditJournalSchemaParity>;
