/**
 * OpenFootball spelling variants → canonical club name.
 *
 * Keys and values are whitespace-normalized names (see normalizeClubName). The canonical name is the
 * spelling used by the most recent season file, so the slug stays stable when older files are imported.
 * Fix spelling drift here, never in prisma/seed/data/.
 *
 * Format: "Variant Spelling": "Canonical Name FC",
 */
export const CLUB_ALIASES: Readonly<Record<string, string>> = {};
