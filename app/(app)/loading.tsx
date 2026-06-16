export default function AppLoading() {
  return (
    <div className="min-h-full px-4 sm:px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="h-6 w-40 rounded bg-zinc-800 animate-pulse mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((item) => (
            <div
              key={item}
              className="h-32 rounded-xl border border-zinc-800 bg-zinc-900 animate-pulse"
            />
          ))}
        </div>
      </div>
    </div>
  )
}
