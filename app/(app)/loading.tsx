export default function AppLoading() {
  return (
    <div className="min-h-full px-4 sm:px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6 h-6 w-40 animate-pulse rounded bg-control" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-32 animate-pulse rounded-xl border border-border bg-panel"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
