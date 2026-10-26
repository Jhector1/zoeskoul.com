/** Types for the read-only disposable Postgres guard (runtime is native MJS). */
export declare function validateCreditAcceptanceUrl(raw: string | undefined): string;
export declare function preflightCreditAcceptance(raw: string | undefined): Promise<{
  ok: true;
  database: string;
  schema: "public";
  isolated: true;
  empty: true;
}>;
export declare function bootstrapCreditAcceptancePreflight(raw: string | undefined): Promise<{ok: true; database: string; empty: true}>;
