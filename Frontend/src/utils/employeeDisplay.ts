// employeeCode is optional — Super Admin's minimal "name only" employee
// creation leaves it unset until Company Admin/Brand Admin assigns a real
// one. Every place that shows "Name (CODE)" needs this instead of a bare
// template literal, or a code-less employee shows up as "Name (null)".
export function formatEmployeeLabel(employee: { name: string | null; employeeCode: string | null }): string {
  const name = employee.name ?? 'Unnamed';
  return employee.employeeCode ? `${name} (${employee.employeeCode})` : name;
}
