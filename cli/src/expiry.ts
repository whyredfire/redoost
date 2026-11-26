export const expiryHelp =
  "expected a date like 2026-12-31 or a time like 2026-12-31T18:00";

const pad = (value: number, width = 2) => String(value).padStart(width, "0");

const rfc3339 = (moment: Date) => {
  const offset = -moment.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const milliseconds = moment.getMilliseconds();
  const fraction = milliseconds ? `.${pad(milliseconds, 3)}` : "";
  const date = `${moment.getFullYear()}-${pad(moment.getMonth() + 1)}-${pad(moment.getDate())}`;
  const time = `${pad(moment.getHours())}:${pad(moment.getMinutes())}:${pad(moment.getSeconds())}${fraction}`;
  const zone = `${sign}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;

  return `${date}T${time}${zone}`;
};

const isDay = (year: number, month: number, day: number) => {
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const datePattern = String.raw`(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})`;

const dayPattern = new RegExp(`^${datePattern}$`, "u");

const timePattern = new RegExp(
  String.raw`^${datePattern}T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2})(?<fraction>\.\d+)?)?(?:(?<sign>[+-])(?<offsetHours>\d{2}):(?<offsetMinutes>\d{2}))?$`,
  "u"
);

const parseTime = (text: string) => {
  const groups = timePattern.exec(
    text.replace(" ", "T").replace("Z", "+00:00")
  )?.groups;

  if (!groups) {
    return null;
  }

  const part = (name: string) => Number(groups[name] ?? 0);
  const [year, month, day] = [part("year"), part("month"), part("day")];
  const [hour, minute, second] = [part("hour"), part("minute"), part("second")];
  const milliseconds = Math.floor(Number(`0${groups.fraction ?? ""}`) * 1000);

  if (!isDay(year, month, day) || hour > 23 || minute > 59 || second > 59) {
    return null;
  }

  if (!groups.sign) {
    return new Date(year, month - 1, day, hour, minute, second, milliseconds);
  }

  const offset =
    (groups.sign === "-" ? -1 : 1) *
    (part("offsetHours") * 60 + part("offsetMinutes"));

  const utc = Date.UTC(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    milliseconds
  );

  return new Date(utc - offset * 60_000);
};

/**
 * When a site goes offline, as the server takes it: a date like 2026-12-31 keeps
 * it online through that day, and a time like 2026-12-31T18:00 is local unless
 * it gives an offset. A local time a clock change skips moves past the change.
 * Null for anything else.
 */
export const expiry = (text: string) => {
  const groups = dayPattern.exec(text)?.groups;

  if (!groups) {
    const moment = parseTime(text);

    return moment ? rfc3339(moment) : null;
  }

  const [year, month, day] = [groups.year, groups.month, groups.day].map(
    Number
  );

  return year && month && day && isDay(year, month, day)
    ? rfc3339(new Date(year, month - 1, day + 1))
    : null;
};
