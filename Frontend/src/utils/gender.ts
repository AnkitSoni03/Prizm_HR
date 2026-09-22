// Options for the "Gender" select on Employee forms — drives which
// gender-restricted leave types (e.g. Maternity/Paternity Leave) an
// employee is offered. See Backend's employees.gender and
// leave_types.applicable_gender.
export const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

export const GENDER_LABEL: Record<'male' | 'female' | 'other', string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
};

// Options for the "Applicable To" select on the Leave Type form —
// restricts which employees a leave type is offered to/usable by.
export const APPLICABLE_GENDER_OPTIONS = [
  { value: 'all', label: 'Both / All' },
  { value: 'male', label: 'Male only' },
  { value: 'female', label: 'Female only' },
  { value: 'other', label: 'Other only' },
];

export const APPLICABLE_GENDER_LABELS: Record<string, string> = {
  all: 'Both / All',
  male: 'Male only',
  female: 'Female only',
  other: 'Other only',
};
