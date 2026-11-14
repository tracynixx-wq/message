create or replace function public.list_my_auth_sessions()
returns table (id uuid, created_at timestamptz, updated_at timestamptz, user_agent text, ip text, is_current boolean)
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_uid uuid := auth.uid(); v_current uuid := nullif(auth.jwt() ->> 'session_id', '')::uuid;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode = '28000'; end if;
 return query select s.id,s.created_at,s.updated_at,s.user_agent,host(s.ip)::text,(s.id=v_current)
 from auth.sessions s where s.user_id=v_uid and (s.not_after is null or s.not_after>now())
 order by (s.id=v_current) desc,s.updated_at desc nulls last;
end; $$;
create or replace function public.revoke_my_auth_session(p_session_id uuid)
returns boolean language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_uid uuid:=auth.uid(); v_current uuid:=nullif(auth.jwt()->>'session_id','')::uuid; v_deleted integer;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if p_session_id is null or p_session_id=v_current then raise exception 'Cannot revoke the current session here' using errcode='22023'; end if;
 delete from auth.sessions where id=p_session_id and user_id=v_uid;
 get diagnostics v_deleted=row_count; return v_deleted=1;
end; $$;
create or replace function public.revoke_other_auth_sessions()
returns integer language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_uid uuid:=auth.uid(); v_current uuid:=nullif(auth.jwt()->>'session_id','')::uuid; v_deleted integer;
begin
 if v_uid is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if v_current is null then raise exception 'Current session could not be identified' using errcode='28000'; end if;
 delete from auth.sessions where user_id=v_uid and id<>v_current;
 get diagnostics v_deleted=row_count; return v_deleted;
end; $$;
revoke all on function public.list_my_auth_sessions() from public, anon;
revoke all on function public.revoke_my_auth_session(uuid) from public, anon;
revoke all on function public.revoke_other_auth_sessions() from public, anon;
grant execute on function public.list_my_auth_sessions() to authenticated;
grant execute on function public.revoke_my_auth_session(uuid) to authenticated;
grant execute on function public.revoke_other_auth_sessions() to authenticated;
