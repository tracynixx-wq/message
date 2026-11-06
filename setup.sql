create table profiles(
 id uuid primary key references auth.users on delete cascade,
 name text not null, username text unique, bio text default '',
 status_emoji text default '', color text default '#4f46e5', avatar_url text default '',
 theme jsonb default '{}', last_seen timestamptz default now());
create table messages(
 id bigint generated always as identity primary key,
 sender uuid not null default auth.uid() references profiles(id) on delete cascade,
 body text not null, reply_to bigint references messages(id) on delete set null,
 reactions jsonb default '{}', edited boolean default false, read boolean default false,
 created_at timestamptz default now());
alter table profiles enable row level security;
alter table messages enable row level security;
create policy p_read on profiles for select to authenticated using (true);
create policy p_ins on profiles for insert to authenticated with check (id=auth.uid() and (select count(*) from profiles)<2);
create policy p_upd on profiles for update to authenticated using (id=auth.uid());
create policy m_read on messages for select to authenticated using (exists(select 1 from profiles where id=auth.uid()));
create policy m_ins on messages for insert to authenticated with check (sender=auth.uid());
create policy m_upd on messages for update to authenticated using (exists(select 1 from profiles where id=auth.uid()));
create policy m_del on messages for delete to authenticated using (sender=auth.uid());
alter publication supabase_realtime add table messages, profiles;
insert into storage.buckets(id,name,public) values('avatars','avatars',true) on conflict do nothing;
create policy a_read on storage.objects for select using (bucket_id='avatars');
create policy a_ins on storage.objects for insert to authenticated with check (bucket_id='avatars');
create policy a_upd on storage.objects for update to authenticated using (bucket_id='avatars');
