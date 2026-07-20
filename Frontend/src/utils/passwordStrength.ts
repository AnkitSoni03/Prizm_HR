// Client-side mirror of the same rule enforced server-side in
// auth.controller.js::validatePasswordStrength — kept in one place since
// ActivatePage, ResetPasswordPage, and ChangePasswordCard all need it.
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Password must include at least one letter and one number.';
  }
  return null;
}
