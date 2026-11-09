/** YYYY-MM-DD in the user's local time, for <input type="date">. */
export const toDateInput = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** A date chosen in the form means "by the end of that day" in the user's time zone. */
export const fromDateInput = (value: string): string => new Date(`${value}T23:59:00`).toISOString();
