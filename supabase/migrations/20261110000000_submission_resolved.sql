-- Admin queue: a "resolved" outcome for submissions an editor has dealt with some other way (fixed by hand,
-- already in the catalog, a question answered), so they leave the queue without counting as approved or rejected.
-- Safe to run more than once.

alter table public.catalog_submissions drop constraint if exists catalog_submissions_status_check;
alter table public.catalog_submissions
  add constraint catalog_submissions_status_check
  check (status in ('pending', 'needs_changes', 'approved', 'rejected', 'resolved'));

-- Sends a submission back to its author with a note, rejects it, or marks it resolved (the note is optional then).
create or replace function public.review_catalog_submission(submission_id uuid, decision text, note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_catalog_editor() then
    raise exception 'Only catalog editors can review submissions.' using errcode = '42501';
  end if;
  if review_catalog_submission.decision not in ('needs_changes', 'rejected', 'resolved') then
    raise exception 'Decision must be needs_changes, rejected or resolved.' using errcode = '22023';
  end if;
  -- Parameters are qualified: catalog_submissions has its own "note" column (the submitter's).
  update public.catalog_submissions s
     set status = review_catalog_submission.decision,
         editor_note = coalesce(nullif(left(review_catalog_submission.note, 1000), ''), s.editor_note),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where s.id = review_catalog_submission.submission_id and s.status in ('pending', 'needs_changes');
  if not found then
    raise exception 'Submission not found, or already decided.' using errcode = 'P0002';
  end if;
end;
$$;
