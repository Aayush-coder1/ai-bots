import type { Automation } from "@/db/schema"

// When an automation runs next. Schedules are written in the user's own time
// zone ("every day at 08:00 in Asia/Kolkata") and stored as a UTC instant.
// Safe to import in the browser: the form previews the next run with it.

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const

/** The scheduler looks for due automations this often (trigger/automation.ts). */
export const TICK_MINUTES = 10
export const MAX_AUTOMATIONS = 10

type Schedule = Pick<
  Automation,
  "frequency" | "minuteOfDay" | "dayOfWeek" | "timezone"
>

export function isValidTimeZone(timeZone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone })
    return true
  } catch {
    return false
  }
}

/** The wall-clock date and time of an instant in a time zone. */
function wallClock(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date)
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value)
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  }
}

/** The instant at which a time zone's clock shows the given date and time. */
function zonedToUtc(
  year: number,
  month: number,
  day: number,
  minuteOfDay: number,
  timeZone: string
) {
  const wanted = Date.UTC(year, month - 1, day, 0, minuteOfDay)
  let guess = wanted
  // Twice: the first pass can land on the other side of a clock change.
  for (let pass = 0; pass < 2; pass++) {
    const shown = wallClock(new Date(guess), timeZone)
    const shownAsUtc = Date.UTC(
      shown.year,
      shown.month - 1,
      shown.day,
      shown.hour,
      shown.minute,
      shown.second
    )
    guess += wanted - shownAsUtc
  }
  return new Date(guess)
}

/** The first run strictly after `from`. */
export function nextRunAt(schedule: Schedule, from = new Date()): Date {
  const timeZone = isValidTimeZone(schedule.timezone)
    ? schedule.timezone
    : "UTC"
  const minuteOfDay = Math.min(Math.max(schedule.minuteOfDay, 0), 1439)

  if (schedule.frequency === "hourly") {
    // Every hour, at the minute the time of day names (08:15 -> xx:15).
    const next = new Date(from)
    next.setUTCSeconds(0, 0)
    next.setUTCMinutes(minuteOfDay % 60)
    if (next.getTime() <= from.getTime()) {
      next.setUTCHours(next.getUTCHours() + 1)
    }
    return next
  }

  const today = wallClock(from, timeZone)
  for (let offset = 0; offset <= 8; offset++) {
    // Noon UTC keeps the calendar arithmetic clear of any day boundary.
    const day = new Date(
      Date.UTC(today.year, today.month - 1, today.day + offset, 12)
    )
    if (
      schedule.frequency === "weekly" &&
      day.getUTCDay() !== schedule.dayOfWeek
    ) {
      continue
    }
    const candidate = zonedToUtc(
      day.getUTCFullYear(),
      day.getUTCMonth() + 1,
      day.getUTCDate(),
      minuteOfDay,
      timeZone
    )
    if (candidate.getTime() > from.getTime()) {
      return candidate
    }
  }
  // Unreachable: within nine days there is always a matching day.
  return new Date(from.getTime() + 24 * 60 * 60 * 1000)
}

export function minuteOfDayFromTime(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

export function timeFromMinuteOfDay(minuteOfDay: number) {
  const hours = Math.floor(minuteOfDay / 60)
  const minutes = minuteOfDay % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

/** "Every day at 08:00", "Every Monday at 09:30", "Every hour at :15". */
export function describeSchedule(schedule: Schedule) {
  const time = timeFromMinuteOfDay(schedule.minuteOfDay)
  if (schedule.frequency === "hourly") {
    return `Every hour at :${time.slice(3)}`
  }
  if (schedule.frequency === "weekly") {
    return `Every ${DAY_NAMES[schedule.dayOfWeek] ?? "week"} at ${time}`
  }
  return `Every day at ${time}`
}
