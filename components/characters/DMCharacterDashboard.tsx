import Link from 'next/link'
import { hpColor } from '@/lib/utils/character'
import type { CharacterWithOwner } from '@/lib/types/database'

interface DMCharacterDashboardProps {
  campaignId: string
  characters: CharacterWithOwner[]
}

function ConditionChips({ conditions }: { conditions: { id: string; name: string }[] }) {
  if (conditions.length === 0) {
    return <span className="text-xs text-faint">—</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {conditions.map((c) => (
        <span
          key={c.id}
          className="text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-300 border border-orange-500/30"
        >
          {c.name}
        </span>
      ))}
    </div>
  )
}

export function DMCharacterDashboard({ campaignId, characters }: DMCharacterDashboardProps) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-4 py-3 font-medium text-faint text-xs uppercase tracking-wider">Character</th>
              <th className="px-4 py-3 font-medium text-faint text-xs uppercase tracking-wider">Player</th>
              <th className="px-4 py-3 font-medium text-faint text-xs uppercase tracking-wider">Class / Lvl</th>
              <th className="px-3 py-3 font-medium text-faint text-xs uppercase tracking-wider text-center">HP</th>
              <th className="px-3 py-3 font-medium text-faint text-xs uppercase tracking-wider text-center">Temp</th>
              <th className="px-3 py-3 font-medium text-faint text-xs uppercase tracking-wider text-center">AC</th>
              <th className="px-3 py-3 font-medium text-faint text-xs uppercase tracking-wider text-center">Speed</th>
              <th className="px-3 py-3 font-medium text-faint text-xs uppercase tracking-wider text-center">Pass. Perc</th>
              <th className="px-4 py-3 font-medium text-faint text-xs uppercase tracking-wider">Conditions</th>
            </tr>
          </thead>
          <tbody>
            {characters.map((c) => (
              <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-hover/50 transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/campaigns/${campaignId}/characters/${c.id}`}
                    className="font-medium text-content hover:text-accent-hover"
                  >
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-muted">{c.profiles?.display_name ?? '—'}</td>
                <td className="px-4 py-3 text-muted">
                  {c.class ? `${c.class} ${c.level}` : `Lvl ${c.level}`}
                </td>
                <td className="px-3 py-3 text-center">
                  <span className={`font-semibold ${hpColor(c.current_hp, c.max_hp)}`}>
                    {c.current_hp}
                  </span>
                  <span className="text-faint">/{c.max_hp}</span>
                </td>
                <td className="px-3 py-3 text-center text-blue-400">
                  {c.temp_hp > 0 ? c.temp_hp : <span className="text-faint">—</span>}
                </td>
                <td className="px-3 py-3 text-center text-muted">{c.armor_class}</td>
                <td className="px-3 py-3 text-center text-muted">{c.speed}ft</td>
                <td className="px-3 py-3 text-center text-muted">{c.passive_perception}</td>
                <td className="px-4 py-3">
                  <ConditionChips conditions={c.character_conditions} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col gap-3">
        {characters.map((c) => (
          <Link
            key={c.id}
            href={`/campaigns/${campaignId}/characters/${c.id}`}
            className="block p-4 rounded-xl bg-panel border border-border hover:border-border-strong transition-colors"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="font-semibold text-content">{c.name}</p>
                <p className="text-xs text-faint">
                  {c.profiles?.display_name ?? '—'} · {c.class ? `${c.class} ${c.level}` : `Lvl ${c.level}`}
                </p>
              </div>
              <div className="text-right">
                <span className={`text-lg font-bold ${hpColor(c.current_hp, c.max_hp)}`}>
                  {c.current_hp}
                </span>
                <span className="text-sm text-faint">/{c.max_hp}</span>
                {c.temp_hp > 0 && <span className="text-xs text-blue-400 block">+{c.temp_hp} temp</span>}
              </div>
            </div>
            <div className="flex gap-4 text-xs text-muted mb-2">
              <span>AC {c.armor_class}</span>
              <span>{c.speed}ft</span>
              <span>PP {c.passive_perception}</span>
            </div>
            <ConditionChips conditions={c.character_conditions} />
          </Link>
        ))}
      </div>
    </>
  )
}
