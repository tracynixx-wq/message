-- Reproducible backend hardening applied to the live Message project on 2026-11-14.
-- Run only after reviewing the target project's existing schema and backups.

create table if not exists public.member_key_history (
 id bigint generated always as identity primary key,
 conv_id uuid not null references public.convs(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 wrapped_by uuid not null references auth.users(id),
 wrapped_key text not null,
 created_at timestamptz not null default now()
);
create index if not exists member_key_history_user_conv_idx
 on public.member_key_history(user_id,conv_id,created_at desc);
create index if not exists member_key_history_conv_idx on public.member_key_history(conv_id);
create index if not exists member_key_history_wrapped_by_idx on public.member_key_history(wrapped_by);
alter table public.member_key_history enable row level security;
drop policy if exists member_key_history_read_own on public.member_key_history;
create policy member_key_history_read_own on public.member_key_history
 for select to authenticated using (user_id=(select auth.uid()));
revoke all on public.member_key_history from anon,authenticated;
grant select on public.member_key_history to authenticated;
grant usage,select on sequence public.member_key_history_id_seq to authenticated;

create or replace function public.rotate_group_member_key(p_conv_id uuid,p_user_id uuid,p_wrapped_keys jsonb)
returns void language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_kind text; v_role text; v_expected integer; v_supplied integer;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_user_id is null or p_user_id=v_actor or jsonb_typeof(p_wrapped_keys)<>'object' then raise exception 'Invalid key rotation request' using errcode='22023'; end if;
 select kind into v_kind from public.convs where id=p_conv_id for update;
 if not found or v_kind not in ('group','channel') then raise exception 'Group or channel not found' using errcode='P0002'; end if;
 select role into v_role from public.members where conv_id=p_conv_id and user_id=v_actor;
 if v_role is null or v_role not in ('owner','admin') then raise exception 'Not allowed to manage members' using errcode='42501'; end if;
 if not exists(select 1 from public.members where conv_id=p_conv_id and user_id=p_user_id) then raise exception 'Member not found' using errcode='P0002'; end if;
 if exists(select 1 from public.members where conv_id=p_conv_id and user_id=p_user_id and role='owner') then raise exception 'Owner cannot be removed' using errcode='42501'; end if;
 if v_role='admin' and exists(select 1 from public.members where conv_id=p_conv_id and user_id=p_user_id and role='admin') then raise exception 'Admins cannot remove other admins' using errcode='42501'; end if;
 select count(*) into v_expected from public.members where conv_id=p_conv_id and user_id<>p_user_id;
 select count(*) into v_supplied from jsonb_each(p_wrapped_keys) e where jsonb_typeof(e.value)='string' and length(e.value #>> '{}')>20;
 if v_expected=0 or v_supplied<>v_expected then raise exception 'A new wrapped key is required for every remaining member' using errcode='22023'; end if;
 if exists(select 1 from public.members m where m.conv_id=p_conv_id and m.user_id<>p_user_id and not(p_wrapped_keys ? m.user_id::text)) then raise exception 'Missing wrapped key for a remaining member' using errcode='22023'; end if;
 insert into public.member_key_history(conv_id,user_id,wrapped_by,wrapped_key)
 select conv_id,user_id,wrapped_by,wrapped_key from public.members where conv_id=p_conv_id;
 update public.members m set wrapped_key=p_wrapped_keys->>m.user_id::text,wrapped_by=v_actor where m.conv_id=p_conv_id and m.user_id<>p_user_id;
 delete from public.members where conv_id=p_conv_id and user_id=p_user_id;
end $$;
revoke all on function public.rotate_group_member_key(uuid,uuid,jsonb) from public,anon;
grant execute on function public.rotate_group_member_key(uuid,uuid,jsonb) to authenticated;

create or replace function public.rotate_group_add_member_key(p_conv_id uuid,p_user_id uuid,p_wrapped_keys jsonb)
returns void language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_kind text; v_role text; v_expected integer; v_supplied integer;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_user_id is null or jsonb_typeof(p_wrapped_keys)<>'object' then raise exception 'Invalid key rotation request' using errcode='22023'; end if;
 select kind into v_kind from public.convs where id=p_conv_id for update;
 if not found or v_kind not in ('group','channel') then raise exception 'Group or channel not found' using errcode='P0002'; end if;
 select role into v_role from public.members where conv_id=p_conv_id and user_id=v_actor;
 if v_role is null or v_role not in ('owner','admin') then raise exception 'Not allowed to manage members' using errcode='42501'; end if;
 if exists(select 1 from public.members where conv_id=p_conv_id and user_id=p_user_id) then raise exception 'User is already a member' using errcode='23505'; end if;
 select count(*) into v_expected from public.members where conv_id=p_conv_id;
 select count(*) into v_supplied from jsonb_each(p_wrapped_keys) e where jsonb_typeof(e.value)='string' and length(e.value #>> '{}')>20;
 if v_expected<1 or v_supplied<>v_expected+1 then raise exception 'A fresh wrapped key is required for every member' using errcode='22023'; end if;
 if exists(select 1 from public.members m where m.conv_id=p_conv_id and not(p_wrapped_keys ? m.user_id::text)) or not(p_wrapped_keys ? p_user_id::text) then raise exception 'Missing wrapped key' using errcode='22023'; end if;
 insert into public.member_key_history(conv_id,user_id,wrapped_by,wrapped_key)
 select conv_id,user_id,wrapped_by,wrapped_key from public.members where conv_id=p_conv_id;
 update public.members m set wrapped_key=p_wrapped_keys->>m.user_id::text,wrapped_by=v_actor where m.conv_id=p_conv_id;
 insert into public.members(conv_id,user_id,role,wrapped_by,wrapped_key) values(p_conv_id,p_user_id,'member',v_actor,p_wrapped_keys->>p_user_id::text);
end $$;
revoke all on function public.rotate_group_add_member_key(uuid,uuid,jsonb) from public,anon;
grant execute on function public.rotate_group_add_member_key(uuid,uuid,jsonb) to authenticated;

alter function public.can_post(uuid) set search_path=pg_catalog,public,pg_temp;
alter function public.find_user(text) set search_path=pg_catalog,public,pg_temp;
alter function public.is_admin(uuid) set search_path=pg_catalog,public,pg_temp;
alter function public.is_member(uuid) set search_path=pg_catalog,public,pg_temp;
alter function public.is_owner(uuid) set search_path=pg_catalog,public,pg_temp;
alter function public.mark_read(uuid) set search_path=pg_catalog,public,pg_temp;
alter function public.member_flag(uuid,text,boolean) set search_path=pg_catalog,public,pg_temp;
alter function public.notify_msg() set search_path=pg_catalog,public,pg_temp;
alter function public.notify_push() set search_path=pg_catalog,public,pg_temp;
alter function public.pin_msg(uuid,bigint) set search_path=pg_catalog,public,pg_temp;
alter function public.purge_secret() set search_path=pg_catalog,public,pg_temp;
alter function public.react(bigint,text) set search_path=pg_catalog,public,pg_temp;
revoke execute on function public.can_post(uuid) from public,anon;
revoke execute on function public.find_user(text) from public,anon;
revoke execute on function public.is_admin(uuid) from public,anon;
revoke execute on function public.is_member(uuid) from public,anon;
revoke execute on function public.is_owner(uuid) from public,anon;
revoke execute on function public.mark_read(uuid) from public,anon;
revoke execute on function public.member_flag(uuid,text,boolean) from public,anon;
revoke execute on function public.notify_msg() from public,anon,authenticated;
revoke execute on function public.notify_push() from public,anon,authenticated;
revoke execute on function public.pin_msg(uuid,bigint) from public,anon;
revoke execute on function public.purge_secret() from public,anon;
revoke execute on function public.react(bigint,text) from public,anon;
grant execute on function public.can_post(uuid) to authenticated;
grant execute on function public.find_user(text) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_owner(uuid) to authenticated;
grant execute on function public.mark_read(uuid) to authenticated;
grant execute on function public.member_flag(uuid,text,boolean) to authenticated;
grant execute on function public.pin_msg(uuid,bigint) to authenticated;
grant execute on function public.purge_secret() to authenticated;
grant execute on function public.react(bigint,text) to authenticated;

do $$
declare p record; q text; w text; stmt text;
begin
 for p in select schemaname,tablename,policyname,qual,with_check from pg_policies
  where schemaname='public' and (coalesce(qual,'') like '%auth.uid()%' or coalesce(with_check,'') like '%auth.uid()%')
 loop
  q:=case when p.qual is null then null else replace(p.qual,'auth.uid()','(select auth.uid())') end;
  w:=case when p.with_check is null then null else replace(p.with_check,'auth.uid()','(select auth.uid())') end;
  stmt:=format('alter policy %I on %I.%I',p.policyname,p.schemaname,p.tablename);
  if q is not null then stmt:=stmt||format(' using (%s)',q); end if;
  if w is not null then stmt:=stmt||format(' with check (%s)',w); end if;
  execute stmt;
 end loop;
end $$;

create index if not exists chats_user1_idx on public.chats(user1);
create index if not exists chats_user2_idx on public.chats(user2);
create index if not exists convs_owner_idx on public.convs(owner);
create index if not exists convs_pinned_id_idx on public.convs(pinned_id);
create index if not exists gifts_from_user_idx on public.gifts(from_user);
create index if not exists gifts_to_user_idx on public.gifts(to_user);
create index if not exists messages_chat_id_idx on public.messages(chat_id);
create index if not exists messages_reply_to_idx on public.messages(reply_to);
create index if not exists messages_sender_idx on public.messages(sender);
create index if not exists msgs_sender_idx on public.msgs(sender);
create index if not exists push_subs_user_id_idx on public.push_subs(user_id);

create table if not exists public.stories (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 kind text not null check(kind in ('img','txt')),
 path text, caption text, bg integer not null default 0 check(bg between 0 and 5),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default(now()+interval '24 hours'),
 constraint stories_img_path_check check((kind='img' and path is not null) or (kind='txt' and path is null))
);
create index if not exists stories_expires_at_idx on public.stories(expires_at);
create index if not exists stories_user_created_idx on public.stories(user_id,created_at desc);
create table if not exists public.story_views (
 story_id uuid not null references public.stories(id) on delete cascade,
 viewer_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(story_id,viewer_id)
);
create index if not exists story_views_viewer_idx on public.story_views(viewer_id);
alter table public.stories enable row level security;
alter table public.story_views enable row level security;
revoke all on public.stories,public.story_views from anon;
grant select,insert,delete on public.stories to authenticated;
grant select,insert,update on public.story_views to authenticated;
drop policy if exists stories_visible_to_dm_contacts on public.stories;
create policy stories_visible_to_dm_contacts on public.stories for select to authenticated using (
 user_id=(select auth.uid()) or exists(
  select 1 from public.convs c
  join public.members mine on mine.conv_id=c.id and mine.user_id=(select auth.uid())
  join public.members peer on peer.conv_id=c.id and peer.user_id=stories.user_id
  where c.kind='dm'
 )
);
drop policy if exists stories_insert_own on public.stories;
create policy stories_insert_own on public.stories for insert to authenticated with check(user_id=(select auth.uid()));
drop policy if exists stories_delete_own on public.stories;
create policy stories_delete_own on public.stories for delete to authenticated using(user_id=(select auth.uid()));
drop policy if exists story_views_read_allowed on public.story_views;
create policy story_views_read_allowed on public.story_views for select to authenticated using(
 viewer_id=(select auth.uid()) or exists(select 1 from public.stories s where s.id=story_views.story_id and s.user_id=(select auth.uid()))
);
drop policy if exists story_views_insert_self on public.story_views;
create policy story_views_insert_self on public.story_views for insert to authenticated with check(
 viewer_id=(select auth.uid()) and exists(select 1 from public.stories s where s.id=story_views.story_id)
);
drop policy if exists story_views_update_self on public.story_views;
create policy story_views_update_self on public.story_views for update to authenticated using(viewer_id=(select auth.uid())) with check(viewer_id=(select auth.uid()));

insert into storage.buckets(id,name,public) values('stories','stories',false)
on conflict(id) do update set public=false;
drop policy if exists stories_storage_read_visible on storage.objects;
create policy stories_storage_read_visible on storage.objects for select to authenticated using(
 bucket_id='stories' and exists(select 1 from public.stories s where s.path=storage.objects.name)
);
drop policy if exists stories_storage_insert_own on storage.objects;
create policy stories_storage_insert_own on storage.objects for insert to authenticated with check(
 bucket_id='stories' and split_part(name,'/',1)=(select auth.uid())::text and name like (select auth.uid())::text||'/story-%'
);
drop policy if exists stories_storage_delete_own on storage.objects;
create policy stories_storage_delete_own on storage.objects for delete to authenticated using(
 bucket_id='stories' and split_part(name,'/',1)=(select auth.uid())::text and name like (select auth.uid())::text||'/story-%'
);
