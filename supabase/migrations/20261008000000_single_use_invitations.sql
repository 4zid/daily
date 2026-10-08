-- Una invitación sirve para una sola cuenta, también si esa cuenta después se borra.
--
-- Al borrar la cuenta del paciente, invitations.used_by queda en null (on delete set null)
-- y, como las comprobaciones solo miraban used_by, el link volvía a ser válido hasta vencer:
-- cualquiera con el mensaje original podía crear otra cuenta vinculada a ese terapeuta.
-- used_at no se borra con la cuenta: ahora también marca que la invitación ya se usó.
--
-- Solo cambia esa comprobación en las tres funciones; el resto queda igual que en
-- 20261006224443_initial_schema.sql.

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := new.raw_user_meta_data ->> 'role';
  v_name text := left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120);
  v_code text := upper(btrim(coalesce(new.raw_user_meta_data ->> 'invite_code', '')));
  v_inv public.invitations%rowtype;
begin
  if v_role = 'therapist' then
    insert into public.profiles (id, role, full_name) values (new.id, 'therapist', v_name);
  elsif v_role = 'patient' then
    select * into v_inv from public.invitations i where i.code = v_code for update;
    if not found or v_inv.used_at is not null or v_inv.used_by is not null or v_inv.expires_at < now() then
      raise exception 'invitacion_invalida' using errcode = 'P0001';
    end if;
    insert into public.profiles (id, role, full_name) values (new.id, 'patient', v_name);
    insert into public.care_links (patient_id, therapist_id) values (new.id, v_inv.therapist_id);
    update public.invitations set used_by = new.id, used_at = now() where code = v_inv.code;
  end if;
  -- Sin rol (por ejemplo, un usuario creado desde el panel) no se crea perfil
  -- y la cuenta no puede leer ni escribir nada.
  return new;
end;
$$;

-- Para la pantalla de invitación: a quién pertenece el código y si sigue vigente.
create or replace function public.get_invitation(p_code text)
returns table (therapist_name text, valid boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.full_name, (i.used_at is null and i.used_by is null and i.expires_at > now())
  from public.invitations i
  join public.profiles p on p.id = i.therapist_id
  where i.code = upper(btrim(p_code));
$$;

-- Un paciente con cuenta acepta la invitación de otro terapeuta (cambio de terapeuta).
create or replace function public.accept_invitation(p_code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invitations%rowtype;
begin
  if private.my_role() is distinct from 'patient' then
    raise exception 'solo_pacientes' using errcode = 'P0001';
  end if;
  select * into v_inv from public.invitations i where i.code = upper(btrim(p_code)) for update;
  if not found or v_inv.used_at is not null or v_inv.used_by is not null or v_inv.expires_at < now() then
    raise exception 'invitacion_invalida' using errcode = 'P0001';
  end if;
  insert into public.care_links (patient_id, therapist_id)
    values ((select auth.uid()), v_inv.therapist_id)
    on conflict (patient_id) do update set therapist_id = excluded.therapist_id, created_at = now();
  update public.invitations set used_by = (select auth.uid()), used_at = now() where code = v_inv.code;
end;
$$;

-- "create or replace" conserva los permisos de cada función; se repiten por claridad.
revoke all on function public.get_invitation(text) from public;
grant execute on function public.get_invitation(text) to anon, authenticated;
revoke all on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;
