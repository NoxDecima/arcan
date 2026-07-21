/**
 * Pure planning logic for the contactBook (CoList) → contacts (co.record)
 * migration backfill (contact-robustness slice, spec §5).
 *
 * Policy: per account ID, the LATEST entry wins (freshest displayName/notes)
 * — EXCEPT when duplicate entries disagree on pinnedFingerprint: then the
 * entry with the OLDEST pin is kept (TOFU — never upgrade a pin silently,
 * threat model §6) and the latest differing fingerprint is reported as a
 * conflict for the UI to surface.
 *
 * Pure so it is unit-testable without a Jazz runtime; ArcanAccount.ts maps
 * the returned indexes back onto the live Contact CoValues.
 */

export interface ContactEntryView {
  contactAccountID: string;
  pinnedFingerprint: string;
  addedAtMs: number;
  /** Position in the source contactBook list. */
  index: number;
}

export interface ContactMigrationPlan {
  /** accountID → index (into the input array) of the entry to keep. */
  keepIndexByAccountID: Record<string, number>;
  /** accountID → conflict info, only for fingerprint disagreements. */
  conflictByAccountID: Record<string, { observedFingerprint: string }>;
}

export function planContactMigration(
  entries: ContactEntryView[],
): ContactMigrationPlan {
  const byAccount = new Map<string, ContactEntryView[]>();
  for (const e of entries) {
    const group = byAccount.get(e.contactAccountID);
    if (group) group.push(e);
    else byAccount.set(e.contactAccountID, [e]);
  }

  const keepIndexByAccountID: Record<string, number> = {};
  const conflictByAccountID: Record<
    string,
    { observedFingerprint: string }
  > = {};

  for (const [accountID, group] of byAccount) {
    const fingerprints = new Set(group.map((e) => e.pinnedFingerprint));
    // Latest = max addedAtMs, ties broken by higher list index.
    const latest = group.reduce((a, b) =>
      b.addedAtMs > a.addedAtMs || (b.addedAtMs === a.addedAtMs && b.index > a.index)
        ? b
        : a,
    );
    if (fingerprints.size <= 1) {
      keepIndexByAccountID[accountID] = latest.index;
      continue;
    }
    // Fingerprint disagreement: keep the OLDEST pin (min addedAtMs, ties
    // broken by lower list index) and report the latest differing value.
    const oldest = group.reduce((a, b) =>
      b.addedAtMs < a.addedAtMs || (b.addedAtMs === a.addedAtMs && b.index < a.index)
        ? b
        : a,
    );
    keepIndexByAccountID[accountID] = oldest.index;
    const latestDiffering = group
      .filter((e) => e.pinnedFingerprint !== oldest.pinnedFingerprint)
      .reduce((a, b) =>
        b.addedAtMs > a.addedAtMs || (b.addedAtMs === a.addedAtMs && b.index > a.index)
          ? b
          : a,
      );
    conflictByAccountID[accountID] = {
      observedFingerprint: latestDiffering.pinnedFingerprint,
    };
  }

  return { keepIndexByAccountID, conflictByAccountID };
}
