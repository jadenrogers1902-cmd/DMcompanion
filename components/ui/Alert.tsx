interface AlertProps {
  variant?: 'error' | 'success' | 'info'
  message: string
}

const variantClasses = {
  error: 'border-danger/45 bg-danger/10 text-danger',
  success: 'border-success/40 bg-success/10 text-success',
  info: 'border-info/40 bg-info/10 text-info',
}

export function Alert({ variant = 'error', message }: AlertProps) {
  return (
    <div
      role="alert"
      className={`rounded-lg border px-4 py-3 text-sm shadow-[inset_0_1px_rgb(255_255_255/0.025)] ${variantClasses[variant]}`}
    >
      {message}
    </div>
  )
}
