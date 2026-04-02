function sanitizeFragment(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toUpperCase();
}

function hasClinicalKeyword(value: string) {
  return /(review|smear|marrow|plasma|follow-up|screening|microscopy|assessment|case)/i.test(value);
}

export function getDisplayPatientCode(patientId: string | null | undefined, patientCode: string | null | undefined) {
  const code = patientCode?.trim() ?? "";

  if (/^(PT-\d+|MM-\d+|PX-PAT-\d+)$/i.test(code)) {
    return code.toUpperCase();
  }

  const suffix = sanitizeFragment(code || patientId || "001").slice(-3) || "001";
  return `PX-PAT-${suffix}`;
}

export function getDisplayPatientName(patientId: string | null | undefined, patientCode: string | null | undefined, patientName: string | null | undefined) {
  const name = patientName?.trim() ?? "";
  if (name.length >= 4) {
    return name;
  }

  const code = getDisplayPatientCode(patientId, patientCode);
  return `Patient ${code.slice(-3)}`;
}

export function getDisplayCaseTitle(caseCode: string | null | undefined, caseTitle: string | null | undefined) {
  const title = caseTitle?.trim() ?? "";

  if (title.length >= 10 && (hasClinicalKeyword(title) || /\s/.test(title))) {
    return title;
  }

  const suffix = sanitizeFragment(caseCode ?? "").slice(-3) || "001";
  return `Microscopy review ${suffix}`;
}
