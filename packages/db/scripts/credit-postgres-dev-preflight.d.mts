/** Types for the V12I.4D read-only development database guard. */
export declare function selectedDevDatabaseUrl(): string | undefined;
export declare function preflightDevelopmentCreditAcceptance(
  raw: string | undefined,
  options?: { confirmed?: boolean },
): Promise<{
  ok: true;
  database: string;
  role: string;
  serverAddress: string | null;
  serverPort: number | null;
  serverStartedAt: string;
}>;
