export function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return (
    year > 0 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function calendarDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function localDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function currentWeek(today: Date, weekStartsOn: 0 | 1 = 1): Date[] {
  const monday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  monday.setDate(monday.getDate() - ((monday.getDay() - weekStartsOn + 7) % 7));
  return Array.from(
    { length: 7 },
    (_, offset) =>
      new Date(
        monday.getFullYear(),
        monday.getMonth(),
        monday.getDate() + offset,
      ),
  );
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("ru", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
    .format(date)
    .replace(" г.", "");
}

export function isoWeek(date: Date): number {
  const thursday = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 3 - ((date.getDay() + 6) % 7),
  );
  const dayOfYear =
    (Date.UTC(thursday.getFullYear(), thursday.getMonth(), thursday.getDate()) -
      Date.UTC(thursday.getFullYear(), 0, 1)) /
    86_400_000;
  return Math.floor(dayOfYear / 7) + 1;
}
