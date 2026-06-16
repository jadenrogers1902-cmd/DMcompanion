-- Phase 7: Story tools, player journal, handouts, and recaps

-- Private campaign handout files. Rows in public.handouts decide whether
-- players should receive signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'handouts',
  'handouts',
  false,
  15728640,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'application/pdf',
    'text/plain'
  ]
)
on conflict (id) do nothing;

create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  status text not null default 'active' check (status in ('hidden', 'active', 'completed', 'failed')),
  description text,
  player_visible_description text,
  dm_notes text,
  related_npc_ids uuid[] not null default '{}',
  related_location_ids uuid[] not null default '{}',
  rewards text,
  visible_to_players boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  description text,
  player_visible_notes text,
  dm_notes text,
  map_id uuid references public.maps(id) on delete set null,
  visible_to_players boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.npcs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  name text not null,
  role text,
  location_id uuid references public.locations(id) on delete set null,
  relationship_to_party text,
  player_visible_notes text,
  dm_notes text,
  portrait_url text,
  linked_token_id uuid references public.tokens(id) on delete set null,
  visible_to_players boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  content text,
  visibility text not null default 'dm' check (visibility in ('dm', 'shared')),
  quest_id uuid references public.quests(id) on delete set null,
  npc_id uuid references public.npcs(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  map_id uuid references public.maps(id) on delete set null,
  encounter_id uuid references public.encounters(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.session_recaps (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  session_title text not null,
  session_date date,
  what_happened text,
  important_npcs text,
  locations_visited text,
  loot_gained text,
  quest_updates text,
  open_threads text,
  next_session_start text,
  dm_follow_up_notes text,
  visible_to_players boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.handouts (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  title text not null,
  description text,
  storage_path text not null,
  file_type text,
  file_size integer,
  is_revealed boolean not null default false,
  quest_id uuid references public.quests(id) on delete set null,
  npc_id uuid references public.npcs(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  session_recap_id uuid references public.session_recaps(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quests_campaign_id_idx on public.quests(campaign_id);
create index if not exists quests_visible_idx on public.quests(campaign_id, visible_to_players);
create index if not exists npcs_campaign_id_idx on public.npcs(campaign_id);
create index if not exists npcs_visible_idx on public.npcs(campaign_id, visible_to_players);
create index if not exists locations_campaign_id_idx on public.locations(campaign_id);
create index if not exists locations_visible_idx on public.locations(campaign_id, visible_to_players);
create index if not exists notes_campaign_id_idx on public.notes(campaign_id);
create index if not exists notes_visibility_idx on public.notes(campaign_id, visibility);
create index if not exists handouts_campaign_id_idx on public.handouts(campaign_id);
create index if not exists handouts_revealed_idx on public.handouts(campaign_id, is_revealed);
create index if not exists session_recaps_campaign_id_idx on public.session_recaps(campaign_id);
create index if not exists session_recaps_visible_idx on public.session_recaps(campaign_id, visible_to_players);

create trigger update_quests_updated_at
  before update on public.quests
  for each row execute function public.update_updated_at();

create trigger update_npcs_updated_at
  before update on public.npcs
  for each row execute function public.update_updated_at();

create trigger update_locations_updated_at
  before update on public.locations
  for each row execute function public.update_updated_at();

create trigger update_notes_updated_at
  before update on public.notes
  for each row execute function public.update_updated_at();

create trigger update_handouts_updated_at
  before update on public.handouts
  for each row execute function public.update_updated_at();

create trigger update_session_recaps_updated_at
  before update on public.session_recaps
  for each row execute function public.update_updated_at();

alter table public.quests enable row level security;
alter table public.npcs enable row level security;
alter table public.locations enable row level security;
alter table public.notes enable row level security;
alter table public.handouts enable row level security;
alter table public.session_recaps enable row level security;

-- Quests
create policy "DMs can manage quests"
  on public.quests for all
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

create policy "Players can view visible quests"
  on public.quests for select
  using (public.is_campaign_member(campaign_id) and visible_to_players = true);

-- NPCs
create policy "DMs can manage npcs"
  on public.npcs for all
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

create policy "Players can view visible npcs"
  on public.npcs for select
  using (public.is_campaign_member(campaign_id) and visible_to_players = true);

-- Locations
create policy "DMs can manage locations"
  on public.locations for all
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

create policy "Players can view visible locations"
  on public.locations for select
  using (public.is_campaign_member(campaign_id) and visible_to_players = true);

-- Notes
create policy "DMs can manage notes"
  on public.notes for all
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

create policy "Players can view shared notes"
  on public.notes for select
  using (public.is_campaign_member(campaign_id) and visibility = 'shared');

-- Handouts
create policy "DMs can manage handouts"
  on public.handouts for all
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

create policy "Players can view revealed handouts"
  on public.handouts for select
  using (public.is_campaign_member(campaign_id) and is_revealed = true);

-- Session recaps
create policy "DMs can manage session recaps"
  on public.session_recaps for all
  using (public.is_campaign_dm(campaign_id))
  with check (public.is_campaign_dm(campaign_id));

create policy "Players can view shared session recaps"
  on public.session_recaps for select
  using (public.is_campaign_member(campaign_id) and visible_to_players = true);

-- Storage policies. The first path segment must be the campaign id.
create policy "Campaign members can read handout files"
  on storage.objects for select
  using (
    bucket_id = 'handouts'
    and public.is_campaign_member((storage.foldername(name))[1]::uuid)
  );

create policy "DMs can upload handout files"
  on storage.objects for insert
  with check (
    bucket_id = 'handouts'
    and public.is_campaign_dm((storage.foldername(name))[1]::uuid)
  );

create policy "DMs can update handout files"
  on storage.objects for update
  using (
    bucket_id = 'handouts'
    and public.is_campaign_dm((storage.foldername(name))[1]::uuid)
  )
  with check (
    bucket_id = 'handouts'
    and public.is_campaign_dm((storage.foldername(name))[1]::uuid)
  );

create policy "DMs can delete handout files"
  on storage.objects for delete
  using (
    bucket_id = 'handouts'
    and public.is_campaign_dm((storage.foldername(name))[1]::uuid)
  );

grant select, insert, update, delete on public.quests to authenticated;
grant select, insert, update, delete on public.npcs to authenticated;
grant select, insert, update, delete on public.locations to authenticated;
grant select, insert, update, delete on public.notes to authenticated;
grant select, insert, update, delete on public.handouts to authenticated;
grant select, insert, update, delete on public.session_recaps to authenticated;
