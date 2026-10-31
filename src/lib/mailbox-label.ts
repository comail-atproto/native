/**
 * Localizes the display name of special-use mailboxes (port of the webmail's
 * `lib/mailbox-label.ts`, #404).
 *
 * Mail servers (e.g. Stalwart) always create system folders with English
 * names — "Inbox", "Sent", "Junk" — regardless of the account locale. JMAP
 * exposes the special-use semantics via the mailbox `role`, so we map that
 * role onto a translated label. Folders without a recognized role — i.e.
 * user-created folders — keep their server name untouched.
 *
 * The keys live under the `sidebar.mailboxes` namespace; `junk`, `flagged`
 * and `all` reuse the existing `spam`/`starred`/`all_mail` keys so every
 * locale already has a translation.
 */
const ROLE_TRANSLATION_KEY: Record<string, string> = {
  inbox: 'inbox',
  sent: 'sent',
  drafts: 'drafts',
  trash: 'trash',
  archive: 'archive',
  junk: 'spam',
  spam: 'spam',
  important: 'important',
  flagged: 'starred',
  all: 'all_mail',
};

type Translate = (key: string, fallback?: string) => string;

/**
 * The localized name for a mailbox, or its raw server name when the role is
 * unknown/absent. `t` is the root-scoped translate function.
 */
export function localizeMailboxName(
  role: string | undefined | null,
  name: string,
  t: Translate,
): string {
  if (!role) return name;
  const key = ROLE_TRANSLATION_KEY[role];
  return key ? t(`sidebar.mailboxes.${key}`, name) : name;
}
