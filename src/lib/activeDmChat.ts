/**
 * Module-singleton ref tracking which friend's ChatPanel is currently open
 * (or null when no panel is open). Written by ChatPanel on mount/unmount,
 * read by useNotifications + sendDirectMessage so that incoming
 * direct-message notifications don't bump the bell badge for a
 * conversation the user is already watching.
 *
 * Not React state — using a plain object keeps every importer pointing at
 * the same memory cell without re-render coupling, which is exactly what
 * we want for a cross-cutting "is this view active?" signal.
 */
export const activeDmChatRef: { current: string | null } = { current: null };
