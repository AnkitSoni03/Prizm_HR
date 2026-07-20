import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { forgotPassword } from '../../api/auth';

// Always shows the same success message regardless of whether the email
// matched an account (see auth.controller.js::forgotPassword) — the request
// itself is fire-and-forget from the caller's point of view, so there's
// nothing here to branch on besides a network/validation error.
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await forgotPassword(email);
      setIsSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-21 w-21 items-center justify-center overflow-hidden rounded-xl bg-sidebar">
            <img
              src="/HRMS%20Logo.png"
              alt="HRMS logo"
              className="h-16 w-16 object-cover object-top"
            />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-ink">Forgot your password?</p>
            <p className="text-sm text-ink-muted">
              Enter your email and we&apos;ll send you a reset link.
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-8 shadow-sm">
          {isSubmitted ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <CheckCircle2 className="h-10 w-10 text-success" strokeWidth={1.5} />
              <p className="text-sm text-ink">
                If an account exists for <span className="font-medium">{email}</span>, we&apos;ve
                sent a password reset link. It expires in 10 minutes.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {error && (
                <div className="rounded-xl border border-danger/20 bg-danger/10 px-3 py-2.5 text-sm text-danger">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-ink">
                  Email
                </label>
                <div className="relative">
                  <Mail
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                    strokeWidth={1.75}
                  />
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    className="w-full rounded-xl border border-border py-2 pl-10 pr-3 text-sm text-ink placeholder:text-ink-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSubmitting ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          )}

          <Link
            to="/login"
            className="mt-5 flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
            Back to sign in
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-ink-muted">
          © {new Date().getFullYear()} Sri Sai Group. All rights reserved.
        </p>
      </div>
    </div>
  );
}
