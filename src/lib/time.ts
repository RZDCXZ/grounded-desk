const THIRTY_DAYS_IN_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

export function getThirtyDaysAgo(reference = new Date()) {
  return new Date(
    reference.getTime() - THIRTY_DAYS_IN_MILLISECONDS,
  ).toISOString();
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
