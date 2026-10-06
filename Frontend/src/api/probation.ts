import { apiClient } from './client';

// One Probation/Intern period that's ending soon (within 3 days) or already
// ended while the employee is still Probation/Intern. `relation` says why the
// caller sees it: their own ('self'), one they can edit ('admin' — can
// change the Employment Type), or someone they manage ('team').
export interface ProbationAlert {
  employeeId: string;
  name: string | null;
  employeeCode: string | null;
  employmentType: 'probation' | 'intern';
  dateOfJoining: string;
  probationPeriodDays: number;
  endDate: string;
  // Negative once the end date has passed.
  daysRemaining: number;
  companyName: string | null;
  brandName: string | null;
  relation: 'self' | 'admin' | 'team';
}

export async function listProbationAlerts(): Promise<ProbationAlert[]> {
  const { data } = await apiClient.get<{ data: ProbationAlert[] }>('/employees/probation-alerts');
  return data.data;
}
