-- Atomic multi-user group/channel addition with one fresh shared key.
create or replace function public.rotate_group_add_members_key(p_conv_id uuid,p_user_ids uuid[],p_wrapped_keys jsonb)
returns void language plpgsql security definer
set search_path=pg_catalog,public,pg_temp as $$
declare v_actor uuid:=auth.uid(); v_kind text; v_role text; v_expected integer; v_supplied integer; v_new_count integer;
begin
 if v_actor is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_user_ids is null or cardinality(p_user_ids)<1 or array_position(p_user_ids,null) is not null or jsonb_typeof(p_wrapped_keys)<>'object' then
  raise exception 'Invalid key rotation request' using errcode='22023';
 end if;
 if (select count(distinct x) from unnest(p_user_ids) x)<>cardinality(p_user_ids) then raise exception 'Duplicate users in request' using errcode='22023'; end if;
 select kind into v_kind from public.convs where id=p_conv_id for update;
 if not found or v_kind not in ('group','channel') then raise exception 'Group or channel not found' using errcode='P0002'; end if;
 select role into v_role from public.members where conv_id=p_conv_id and user_id=v_actor;
 if v_role is null or v_role not in ('owner','admin') then raise exception 'Not allowed to manage members' using errcode='42501'; end if;
 if v_actor=any(p_user_ids) or exists(select 1 from public.members m where m.conv_id=p_conv_id and m.user_id=any(p_user_ids)) then
  raise exception 'A requested user is already a member' using errcode='23505';
 end if;
 select count(*) into v_expected from public.members where conv_id=p_conv_id;
 v_new_count:=cardinality(p_user_ids);
 select count(*) into v_supplied from jsonb_each(p_wrapped_keys) e where jsonb_typeof(e.value)='string' and length(e.value #>> '{}')>20;
 if v_expected<1 or v_supplied<>v_expected+v_new_count or (select count(*) from jsonb_object_keys(p_wrapped_keys))<>v_expected+v_new_count then
  raise exception 'A fresh wrapped key is required for every current and new member' using errcode='22023';
 end if;
 if exists(select 1 from public.members m where m.conv_id=p_conv_id and not(p_wrapped_keys ? m.user_id::text))
  or exists(select 1 from unnest(p_user_ids) x where not(p_wrapped_keys ? x::text)) then
  raise exception 'Missing wrapped key for a member' using errcode='22023';
 end if;
 update public.members m set wrapped_key=p_wrapped_keys->>m.user_id::text,wrapped_by=v_actor where m.conv_id=p_conv_id;
 insert into public.members(conv_id,user_id,role,wrapped_by,wrapped_key)
 select p_conv_id,x,'member',v_actor,p_wrapped_keys->>x::text from unnest(p_user_ids) x;
end $$;
revoke all on function public.rotate_group_add_members_key(uuid,uuid[],jsonb) from public,anon;
grant execute on function public.rotate_group_add_members_key(uuid,uuid[],jsonb) to authenticated;
