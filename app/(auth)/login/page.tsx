import { LoginForm } from '@/components/auth/LoginForm'

const confirmationMessages: Record<string, string> = {
  failed: 'That confirmation link is invalid or expired. Register again to request a new link.',
  missing: 'The confirmation link was incomplete. Open the newest link from your email or register again.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmation?: string | string[] }>
}) {
  const value = (await searchParams).confirmation
  const status = Array.isArray(value) ? value[0] : value
  return <LoginForm confirmationMessage={status ? confirmationMessages[status] ?? null : null} />
}
