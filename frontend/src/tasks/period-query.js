// Date pickers select full days in the same local timezone used for display.
// The API contract continues to receive inclusive ISO UTC instants.
export function periodQuery(filters) {
  const entries = Object.entries(filters).filter(([, value]) => value !== '' && value != null);
  return new URLSearchParams(entries.map(([key, value]) => {
    if ((key === 'periodStart' || key === 'periodEnd') && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return [key, new Date(`${value}T${key === 'periodStart' ? '00:00:00.000' : '23:59:59.999'}`).toISOString()];
    }
    return [key, value];
  }));
}
