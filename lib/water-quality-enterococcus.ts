/**
 * CKAN beach water dataset includes multiple analytes; we only use Enterococcus
 * for "latest" station values — matches /api/history and the ML model.
 */
export function recordIsEnterococcus(record: any): boolean {
  const raw =
    record?.Analyte ??
    record?.analyte ??
    record?.["Analyte"] ??
    record?.["analyte"];
  if (raw == null || raw === "") return false;
  return String(raw).trim().toLowerCase() === "enterococcus";
}
