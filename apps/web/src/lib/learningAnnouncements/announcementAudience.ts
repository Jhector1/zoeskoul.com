export function uniqueAnnouncementRecipientUserIds(
  rows: ReadonlyArray<{ userId: string }>,
) {
  return Array.from(
    new Set(
      rows
        .map((row) => row.userId.trim())
        .filter(Boolean),
    ),
  ).sort();
}
