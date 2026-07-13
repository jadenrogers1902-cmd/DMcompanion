import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/nav/Sidebar'
import { MobileNav } from '@/components/nav/MobileNav'
import { ConnectionStatus } from '@/components/ui/ConnectionStatus'
import { ActionQueueNotificationWidget } from '@/components/actions/ActionQueueNotificationWidget'
import { PlayerRollRequestPopup } from '@/components/actions/PlayerRollRequestPopup'
import { PartyMessageListener } from '@/components/party/PartyMessageListener'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-content">
      <Sidebar profile={profile} />

      <main className="relative min-w-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_85%_0%,rgb(184_167_255/0.06),transparent_28rem)] pb-20 md:pb-0">
        {children}
      </main>

      <ConnectionStatus />
      <ActionQueueNotificationWidget userId={user.id} />
      <PlayerRollRequestPopup userId={user.id} />
      <PartyMessageListener userId={user.id} />
      <MobileNav profile={profile} />
    </div>
  )
}
