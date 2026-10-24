// Full-screen spinner shown while the app is starting up. Looks the same as
// the plain-HTML loader in index.html (shown before any JS has loaded), so
// on a slow connection the hand-over from one to the other is seamless.
export function FullScreenLoader({ message }: { message: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page px-4">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
      <div className="text-center text-sm text-ink-muted">{message}</div>
    </div>
  );
}
