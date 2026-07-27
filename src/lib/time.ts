const THIRTY_DAYS_IN_MILLISECONDS = 30 * 24 * 60 * 60 * 1000;

export function getThirtyDaysAgo(reference = new Date()) {
  return new Date(
    reference.getTime() - THIRTY_DAYS_IN_MILLISECONDS,
  ).toISOString();
}
