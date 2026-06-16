interface AlertProps {
  variant?: 'error' | 'success' | 'info'
  message: string
}

const variantClasses = {
  error: 'bg-red-900/30 border-red-800/60 text-red-300',
  success: 'bg-emerald-900/30 border-emerald-800/60 text-emerald-300',
  info: 'bg-blue-900/30 border-blue-800/60 text-blue-300',
}

export function Alert({ variant = 'error', message }: AlertProps) {
  return (
    <div
      role="alert"
      className={`rounded-lg border px-4 py-3 text-sm ${variantClasses[variant]}`}
    >
      {message}
    </div>
  )
}
