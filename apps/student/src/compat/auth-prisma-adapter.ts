export function PrismaAdapter(
  client: unknown,
): Record<string, unknown> {
  return {
    client,
  };
}
