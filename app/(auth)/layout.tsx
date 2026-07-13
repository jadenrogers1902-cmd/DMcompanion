export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 py-12">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(circle at 50% 12%, rgb(184 167 255 / 0.18), transparent 30rem), radial-gradient(circle at 18% 88%, rgb(103 232 194 / 0.07), transparent 24rem)',
        }}
      />
      <div className="pointer-events-none absolute top-[-18rem] h-[34rem] w-[34rem] rounded-full border border-accent/10" aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm">
        {/* Logo / App name */}
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-accent/45 bg-accent/10 shadow-[0_0_32px_rgb(184_167_255/0.12)]">
            <svg
              className="h-6 w-6 text-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              />
            </svg>
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-wide text-content">DM Companion</h1>
          <p className="mt-1 text-sm text-faint">Campaign management for adventurers</p>
        </div>
        {children}
      </div>
    </div>
  )
}
