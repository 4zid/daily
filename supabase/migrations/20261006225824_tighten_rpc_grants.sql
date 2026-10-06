-- Supabase otorga EXECUTE a anon por defecto en las funciones nuevas de public.
revoke execute on function public.accept_invitation(text) from anon;
revoke execute on function public.patient_weeks(uuid) from anon;
-- get_invitation sí es pública: la pantalla de invitación la usa antes de registrarse.

create index invitations_used_by_idx on public.invitations (used_by);
