// Safe to import in the browser: the Your PC page shows these choices.

/** How long a device can stay connected, picked when it is paired. */
export const KEEP_OPTIONS = [
  { value: "1h", label: "1 hour", seconds: 60 * 60 },
  { value: "1d", label: "1 day", seconds: 24 * 60 * 60 },
  { value: "7d", label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { value: "30d", label: "30 days", seconds: 30 * 24 * 60 * 60 },
  { value: "forever", label: "Until I disconnect", seconds: null },
] as const

export type KeepOption = (typeof KEEP_OPTIONS)[number]["value"]
