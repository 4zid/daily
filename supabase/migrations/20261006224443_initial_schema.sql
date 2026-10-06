-- ═══════════════════════ Esquema de daily ═══════════════════════
-- Pacientes y terapeutas. Cada paciente está vinculado a un terapeuta:
-- solo puede registrarse con una invitación del terapeuta.

create schema if not exists private;

-- ─────────── Tipos y tablas ───────────

create type public.user_role as enum ('patient', 'therapist');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  full_name text not null default '' check (char_length(full_name) <= 120),
  created_at timestamptz not null default now()
);

create table public.invitations (
  code text primary key,
  therapist_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  patient_label text not null default '' check (char_length(patient_label) <= 120),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz
);
create index invitations_therapist_idx on public.invitations (therapist_id);

-- Un terapeuta por paciente (la clave es el paciente).
create table public.care_links (
  patient_id uuid primary key references public.profiles (id) on delete cascade,
  therapist_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index care_links_therapist_idx on public.care_links (therapist_id);

create table public.day_logs (
  patient_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  mood smallint check (mood between 1 and 5),
  reflection text check (char_length(reflection) <= 4000),
  updated_at timestamptz not null default now(),
  primary key (patient_id, date)
);

create table public.entries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  date date not null,
  start_time text not null check (start_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  end_time text check (end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  activity text not null check (char_length(activity) between 1 and 200),
  category text not null default 'otro'
    check (category in ('trabajo', 'comidas', 'movimiento', 'ocio', 'vinculos', 'autocuidado', 'descanso', 'tareas', 'otro')),
  pleasure smallint check (pleasure between 1 and 10),
  control smallint check (control between 1 and 10),
  notes text check (char_length(notes) <= 1000),
  source text not null default 'manual' check (source in ('manual', 'ia')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index entries_patient_date_idx on public.entries (patient_id, date);

create table public.therapist_notes (
  therapist_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  patient_id uuid not null references public.profiles (id) on delete cascade,
  week date not null,
  note text not null default '' check (char_length(note) <= 10000),
  updated_at timestamptz not null default now(),
  primary key (therapist_id, patient_id, week)
);
create index therapist_notes_patient_idx on public.therapist_notes (patient_id);

-- ─────────── Funciones internas (no expuestas por la API) ───────────

create or replace function private.new_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  result text := '';
begin
  -- 10 caracteres de 32 posibles (sin I, O, 0 ni 1): unos 50 bits al azar.
  for i in 0..9 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

alter table public.invitations alter column code set default private.new_invite_code();

create or replace function private.my_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid());
$$;

create or replace function private.is_therapist_of(p_patient uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.care_links l
    where l.patient_id = p_patient and l.therapist_id = (select auth.uid())
  );
$$;

create or replace function private.is_my_therapist(p_therapist uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.care_links l
    where l.patient_id = (select auth.uid()) and l.therapist_id = p_therapist
  );
$$;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger day_logs_touch before update on public.day_logs
  for each row execute function private.touch_updated_at();
create trigger entries_touch before update on public.entries
  for each row execute function private.touch_updated_at();
create trigger therapist_notes_touch before update on public.therapist_notes
  for each row execute function private.touch_updated_at();

-- Alta de usuarios: crea el perfil. Un paciente necesita una invitación
-- válida y queda vinculado a ese terapeuta en el mismo momento.
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
    if not found or v_inv.used_by is not null or v_inv.expires_at < now() then
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ─────────── Funciones públicas (RPC) ───────────

-- Para la pantalla de invitación: a quién pertenece el código y si sigue vigente.
create or replace function public.get_invitation(p_code text)
returns table (therapist_name text, valid boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.full_name, (i.used_by is null and i.expires_at > now())
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
  if not found or v_inv.used_by is not null or v_inv.expires_at < now() then
    raise exception 'invitacion_invalida' using errcode = 'P0001';
  end if;
  insert into public.care_links (patient_id, therapist_id)
    values ((select auth.uid()), v_inv.therapist_id)
    on conflict (patient_id) do update set therapist_id = excluded.therapist_id, created_at = now();
  update public.invitations set used_by = (select auth.uid()), used_at = now() where code = v_inv.code;
end;
$$;

-- Semanas (lunes) con registros de un paciente y cuántas actividades tiene cada una.
-- security invoker: las reglas de acceso de las tablas se aplican igual.
create or replace function public.patient_weeks(p_patient uuid)
returns table (week date, entries bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select date_trunc('week', x.d)::date as week, sum(x.c)::bigint as entries
  from (
    select e.date as d, 1 as c from public.entries e where e.patient_id = p_patient
    union all
    select l.date, 0 from public.day_logs l
      where l.patient_id = p_patient and (l.mood is not null or l.reflection is not null)
  ) x
  group by 1
  order by 1 desc;
$$;

-- ─────────── Permisos ───────────

revoke all on schema private from public;
grant usage on schema private to authenticated;
revoke all on all functions in schema private from public;
grant execute on function private.my_role() to authenticated;
grant execute on function private.is_therapist_of(uuid) to authenticated;
grant execute on function private.is_my_therapist(uuid) to authenticated;
grant execute on function private.new_invite_code() to authenticated;

revoke all on function public.get_invitation(text) from public;
grant execute on function public.get_invitation(text) to anon, authenticated;
revoke all on function public.accept_invitation(text) from public;
grant execute on function public.accept_invitation(text) to authenticated;
revoke all on function public.patient_weeks(uuid) from public;
grant execute on function public.patient_weeks(uuid) to authenticated;

revoke all on public.profiles, public.invitations, public.care_links, public.day_logs,
  public.entries, public.therapist_notes from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select, delete on public.invitations to authenticated;
grant insert (patient_label) on public.invitations to authenticated;
grant select on public.care_links to authenticated;
grant select, insert, update, delete on public.day_logs to authenticated;
grant select, insert, update, delete on public.entries to authenticated;
grant select, insert, update, delete on public.therapist_notes to authenticated;

-- ─────────── Reglas de acceso por fila ───────────

alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.care_links enable row level security;
alter table public.day_logs enable row level security;
alter table public.entries enable row level security;
alter table public.therapist_notes enable row level security;

-- Perfiles: el propio, el de mis pacientes y el de mi terapeuta.
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_therapist_of(id) or private.is_my_therapist(id));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Invitaciones: solo las crea, ve y borra (si no se usaron) su terapeuta.
create policy invitations_select_own on public.invitations for select to authenticated
  using (therapist_id = (select auth.uid()));
create policy invitations_insert_therapist on public.invitations for insert to authenticated
  with check (therapist_id = (select auth.uid()) and private.my_role() = 'therapist');
create policy invitations_delete_unused on public.invitations for delete to authenticated
  using (therapist_id = (select auth.uid()) and used_by is null);

-- Vínculos: los ven el paciente y su terapeuta. Solo se crean desde las funciones.
create policy care_links_select on public.care_links for select to authenticated
  using (patient_id = (select auth.uid()) or therapist_id = (select auth.uid()));

-- Días y actividades: el paciente escribe lo suyo; su terapeuta solo lee.
create policy day_logs_select on public.day_logs for select to authenticated
  using (patient_id = (select auth.uid()) or private.is_therapist_of(patient_id));
create policy day_logs_insert on public.day_logs for insert to authenticated
  with check (patient_id = (select auth.uid()) and private.my_role() = 'patient');
create policy day_logs_update on public.day_logs for update to authenticated
  using (patient_id = (select auth.uid())) with check (patient_id = (select auth.uid()));
create policy day_logs_delete on public.day_logs for delete to authenticated
  using (patient_id = (select auth.uid()));

create policy entries_select on public.entries for select to authenticated
  using (patient_id = (select auth.uid()) or private.is_therapist_of(patient_id));
create policy entries_insert on public.entries for insert to authenticated
  with check (patient_id = (select auth.uid()) and private.my_role() = 'patient');
create policy entries_update on public.entries for update to authenticated
  using (patient_id = (select auth.uid())) with check (patient_id = (select auth.uid()));
create policy entries_delete on public.entries for delete to authenticated
  using (patient_id = (select auth.uid()));

-- Notas de sesión: solo el terapeuta, y solo de sus pacientes.
create policy therapist_notes_all on public.therapist_notes for all to authenticated
  using (therapist_id = (select auth.uid()) and private.is_therapist_of(patient_id))
  with check (therapist_id = (select auth.uid()) and private.is_therapist_of(patient_id));
