export declare function selectedDevDatabaseUrl(): string | undefined;
export declare function preflightBillingDevelopmentDatabase(
  raw?: string | undefined,
): Promise<{
  ok: true;
  database: string;
  role: string;
  serverAddress: string | null;
  serverPort: number | null;
  serverStartedAt: string;
}>;
