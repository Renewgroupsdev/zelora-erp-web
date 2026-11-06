/**
 * A follow-up / appointment note is stored as one line: the slot that was booked, then what the telecaller typed
 * ("Next follow-up on 2026-11-07 10:00 AM. testing data"). Shown in a card it reads better in two lines:
 *
 *   Next follow-up on 2026-11-07 10:00 AM.
 *   Reminder: testing data
 *
 * A note without that slot prefix comes back unchanged (`head` empty, everything in `reminder`).
 */
export interface SplitCallNote {
  /** "Next follow-up on 2026-11-07 10:00 AM." - empty when the note has no slot prefix. */
  head: string;
  /** What the telecaller typed ('' when they typed nothing). */
  reminder: string;
}

const SLOT_PREFIX = /^((?:Next follow-up on|Appointment booked for)\s+\S+\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AaPp][Mm])?\.)\s*([\s\S]*)$/;

export function splitCallNote(notes: string | null | undefined): SplitCallNote {
  const text = (notes ?? '').trim();
  const match = SLOT_PREFIX.exec(text);
  return match ? { head: match[1], reminder: match[2].trim() } : { head: '', reminder: text };
}
