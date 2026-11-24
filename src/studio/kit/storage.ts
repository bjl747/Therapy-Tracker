// What the Job Kit keeps in this browser: the One job draft and Recent jobs (localStorage) and the Many jobs list
// (this tab's sessionStorage). They belong to the person who typed them and can hold a link to that person's private
// upload (a pinned "Your photo"), so they are cleared when someone else opens the Job Kit in this browser, and on
// sign-out (hub-only HubStudio.tsx), the same way PDF Studio clears its document (demo test, 2026-11-19).

export const KIT_KEYS = {
  draft: 'studio.kit.draft',
  recent: 'studio.kit.recent',
  many: 'studio.kit.many',
  /** which job a post opened from the Job Kit belongs to (kit/link.ts, this tab's sessionStorage) */
  link: 'studio.kit.link',
  /** whose Job Kit data this browser holds */
  owner: 'studio.kit.owner',
} as const

export function clearKitStorage() {
  try {
    localStorage.removeItem(KIT_KEYS.draft)
    localStorage.removeItem(KIT_KEYS.recent)
    localStorage.removeItem(KIT_KEYS.owner)
  } catch {
    /* private mode */
  }
  try {
    sessionStorage.removeItem(KIT_KEYS.many)
    sessionStorage.removeItem(KIT_KEYS.link)
  } catch {
    /* private mode */
  }
}

/** The Job Kit opened by `owner`: anything left by another person (or by nobody we know of) is cleared first. */
export function claimKitStorage(owner: string) {
  try {
    if (localStorage.getItem(KIT_KEYS.owner) === owner) return
    clearKitStorage()
    localStorage.setItem(KIT_KEYS.owner, owner)
  } catch {
    /* private mode: nothing is kept anyway */
  }
}
