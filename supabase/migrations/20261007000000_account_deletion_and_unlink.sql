-- La persona puede borrar su cuenta y todos sus datos (cascada desde auth.users).
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'sin_sesion';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- El paciente o su terapeuta pueden terminar el vínculo. Las notas de sesión
-- de ese terapeuta sobre ese paciente se borran con el vínculo.
create or replace function public.end_care_link(p_patient uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_therapist uuid;
begin
  select therapist_id into v_therapist from public.care_links where patient_id = p_patient;
  if v_therapist is null then
    return;
  end if;
  if auth.uid() is distinct from p_patient and auth.uid() is distinct from v_therapist then
    raise exception 'sin_permiso';
  end if;
  delete from public.therapist_notes where therapist_id = v_therapist and patient_id = p_patient;
  delete from public.care_links where patient_id = p_patient;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
revoke execute on function public.end_care_link(uuid) from public, anon;
grant execute on function public.delete_my_account() to authenticated;
grant execute on function public.end_care_link(uuid) to authenticated;
