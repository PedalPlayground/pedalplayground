-- Moderation: an account's activity, for the editor's Moderation tab (safe to re-run). Needs the moderation migration.
--
-- One timeline, newest first: joined, last sign-in, boards created and changed, comments, likes, reports they sent and
-- reports about them, and catalog suggestions. Private boards show without their name or link.

create or replace function public.moderation_activity(target uuid, max_items int default 150)
returns table (
  kind text,
  happened_at timestamptz,
  title text,
  detail text,
  board_slug text
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.is_catalog_editor() then
    raise exception 'editors_only' using errcode = '42501';
  end if;
  return query
  select * from (
    select 'joined'::text, u.created_at, 'Joined'::text, null::text, null::text
      from auth.users u where u.id = target
    union all
    select 'signed_in', u.last_sign_in_at, 'Last signed in', null, null
      from auth.users u where u.id = target and u.last_sign_in_at is not null
    union all
    select 'board_created', p.created_at,
           case when p.is_public then p.name else 'A private board' end,
           case when p.in_gallery then 'In the gallery' when p.is_public then 'Shared by link' else 'Private' end,
           case when p.is_public then p.slug end
      from public.playgrounds p where p.owner_user_id = target
    union all
    -- A change at least an hour after it was made, so a new board isn't listed twice.
    select 'board_updated', p.updated_at,
           case when p.is_public then p.name else 'A private board' end,
           null, case when p.is_public then p.slug end
      from public.playgrounds p where p.owner_user_id = target and p.updated_at > p.created_at + interval '1 hour'
    union all
    select 'comment', c.created_at, coalesce(p.name, 'A board'), c.body, p.slug
      from public.board_comments c left join public.playgrounds p on p.id = c.playground_id
     where c.user_id = target
    union all
    select 'like', l.created_at, coalesce(p.name, 'A board'), null, p.slug
      from public.gallery_likes l left join public.playgrounds p on p.id = l.playground_id
     where l.user_id = target
    union all
    select 'report_sent', r.created_at, coalesce(r.target_text, r.target_kind), r.reason || ' · ' || r.status, null
      from public.content_reports r where r.reporter_id = target
    union all
    select 'reported', r.created_at, coalesce(r.target_text, r.target_kind), r.reason || ' · ' || r.status, null
      from public.content_reports r where r.target_user_id = target
    union all
    select 'suggestion', s.created_at, s.brand || ' ' || s.name, s.status, null
      from public.catalog_submissions s where s.submitted_by = target
  ) a
  order by 2 desc nulls last
  limit least(greatest(max_items, 1), 500);
end;
$$;
revoke execute on function public.moderation_activity(uuid, int) from public, anon;
grant execute on function public.moderation_activity(uuid, int) to authenticated;
