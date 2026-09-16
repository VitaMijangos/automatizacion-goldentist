-- ============================================================
-- GolDentist · Ventas — Login obligatorio para todo el equipo (2026-09-04)
-- Ejecutar en el SQL Editor de Supabase, DESPUÉS de 001..009.
--
-- Cambia el modelo de acceso: antes, cualquiera con el enlace podía usar
-- Ventas/Mensajes/Envíos/Apartados sin iniciar sesión, y solo "Catálogo" y
-- "Panel" pedían una cuenta (la única que existía se trataba como "admin").
-- A partir de ahora TODO el equipo necesita su propia cuenta (Supabase
-- Auth, una por persona) para poder ver o capturar cualquier cosa en la
-- app. Una vez adentro, cualquier cuenta del equipo puede ver/editar
-- Ventas/Mensajes/Envíos/Apartados igual que antes (sin restricción por
-- persona) — Panel y Catálogo se quedan reservados solo para quien esté
-- marcado como administrador en la tabla nueva `admins`.
--
-- Seguro de correr más de una vez: cada política se borra por su propio
-- nombre nuevo (además del nombre viejo que reemplaza) antes de recrearse.
-- ============================================================

-- ---------- Tabla de administradores ----------
-- Determina quién ve el Panel y puede editar el Catálogo. Se llena a mano
-- desde el SQL Editor (que corre como superusuario, sin pasar por RLS):
--   insert into admins (user_id) values ('<uuid de esa persona>')
--   on conflict (user_id) do nothing;
-- El uuid se copia de Authentication → Users → columna "UID".

create table if not exists admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table admins enable row level security;
drop policy if exists "leer mi propia fila de admins" on admins;
create policy "leer mi propia fila de admins" on admins
  for select using (auth.uid() = user_id);

-- Si ya existe la cuenta admin original (casamedicadental@gmail.com), la
-- marca como administradora automáticamente, para no tener que buscar su
-- uuid a mano. Si esa cuenta no existe todavía en este proyecto, el insert
-- simplemente no agrega ninguna fila (no falla).
insert into admins (user_id)
select id from auth.users where email = 'casamedicadental@gmail.com'
on conflict (user_id) do nothing;

-- ---------- Ventas / Mensajes / Envíos / Apartados: ahora requieren sesión ----------
-- Se reemplazan las políticas "abierto para todos" (using (true)) por
-- "cualquier cuenta del equipo con sesión iniciada" (auth.role() =
-- 'authenticated'), igual para las cinco tablas. Sigue sin haber
-- restricción por persona: cualquiera del equipo ve y edita todo, como
-- hasta ahora — el único cambio es que ya hace falta haber iniciado sesión.

drop policy if exists "read sales" on sales;
drop policy if exists "insert sales" on sales;
drop policy if exists "update sales" on sales;
drop policy if exists "delete sales" on sales;
drop policy if exists "team read sales" on sales;
drop policy if exists "team insert sales" on sales;
drop policy if exists "team update sales" on sales;
drop policy if exists "team delete sales" on sales;
create policy "team read sales" on sales for select using (auth.role() = 'authenticated');
create policy "team insert sales" on sales for insert with check (auth.role() = 'authenticated');
create policy "team update sales" on sales for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "team delete sales" on sales for delete using (auth.role() = 'authenticated');

drop policy if exists "read messages" on messages;
drop policy if exists "insert messages" on messages;
drop policy if exists "update messages" on messages;
drop policy if exists "delete messages" on messages;
drop policy if exists "team read messages" on messages;
drop policy if exists "team insert messages" on messages;
drop policy if exists "team update messages" on messages;
drop policy if exists "team delete messages" on messages;
create policy "team read messages" on messages for select using (auth.role() = 'authenticated');
create policy "team insert messages" on messages for insert with check (auth.role() = 'authenticated');
create policy "team update messages" on messages for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "team delete messages" on messages for delete using (auth.role() = 'authenticated');

drop policy if exists "read shipments" on shipments;
drop policy if exists "insert shipments" on shipments;
drop policy if exists "update shipments" on shipments;
drop policy if exists "delete shipments" on shipments;
drop policy if exists "team read shipments" on shipments;
drop policy if exists "team insert shipments" on shipments;
drop policy if exists "team update shipments" on shipments;
drop policy if exists "team delete shipments" on shipments;
create policy "team read shipments" on shipments for select using (auth.role() = 'authenticated');
create policy "team insert shipments" on shipments for insert with check (auth.role() = 'authenticated');
create policy "team update shipments" on shipments for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "team delete shipments" on shipments for delete using (auth.role() = 'authenticated');

drop policy if exists "read layaways" on layaways;
drop policy if exists "insert layaways" on layaways;
drop policy if exists "update layaways" on layaways;
drop policy if exists "delete layaways" on layaways;
drop policy if exists "team read layaways" on layaways;
drop policy if exists "team insert layaways" on layaways;
drop policy if exists "team update layaways" on layaways;
drop policy if exists "team delete layaways" on layaways;
create policy "team read layaways" on layaways for select using (auth.role() = 'authenticated');
create policy "team insert layaways" on layaways for insert with check (auth.role() = 'authenticated');
create policy "team update layaways" on layaways for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "team delete layaways" on layaways for delete using (auth.role() = 'authenticated');

drop policy if exists "read layaway_payments" on layaway_payments;
drop policy if exists "insert layaway_payments" on layaway_payments;
drop policy if exists "update layaway_payments" on layaway_payments;
drop policy if exists "delete layaway_payments" on layaway_payments;
drop policy if exists "team read layaway_payments" on layaway_payments;
drop policy if exists "team insert layaway_payments" on layaway_payments;
drop policy if exists "team update layaway_payments" on layaway_payments;
drop policy if exists "team delete layaway_payments" on layaway_payments;
create policy "team read layaway_payments" on layaway_payments for select using (auth.role() = 'authenticated');
create policy "team insert layaway_payments" on layaway_payments for insert with check (auth.role() = 'authenticated');
create policy "team update layaway_payments" on layaway_payments for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "team delete layaway_payments" on layaway_payments for delete using (auth.role() = 'authenticated');

-- ---------- Catálogos: lectura ahora requiere sesión; escritura sigue solo admin ----------
-- Antes la lectura era pública (using (true)); ahora exige sesión iniciada.
-- La escritura ya exigía "authenticated", pero como ahora CUALQUIER cuenta
-- del equipo también cumple "authenticated", hay que exigir además
-- pertenecer a la tabla `admins` (antes solo existía una cuenta, así que
-- "authenticated" y "admin" eran lo mismo — ya no).

drop policy if exists "read channels" on channels;
drop policy if exists "admin write channels" on channels;
drop policy if exists "admin update channels" on channels;
drop policy if exists "admin delete channels" on channels;
drop policy if exists "team read channels" on channels;
create policy "team read channels" on channels for select using (auth.role() = 'authenticated');
create policy "admin write channels" on channels for insert with check (exists (select 1 from admins where user_id = auth.uid()));
create policy "admin update channels" on channels for update using (exists (select 1 from admins where user_id = auth.uid())) with check (exists (select 1 from admins where user_id = auth.uid()));
create policy "admin delete channels" on channels for delete using (exists (select 1 from admins where user_id = auth.uid()));

drop policy if exists "read sellers" on sellers;
drop policy if exists "admin write sellers" on sellers;
drop policy if exists "admin update sellers" on sellers;
drop policy if exists "admin delete sellers" on sellers;
drop policy if exists "team read sellers" on sellers;
create policy "team read sellers" on sellers for select using (auth.role() = 'authenticated');
create policy "admin write sellers" on sellers for insert with check (exists (select 1 from admins where user_id = auth.uid()));
create policy "admin update sellers" on sellers for update using (exists (select 1 from admins where user_id = auth.uid())) with check (exists (select 1 from admins where user_id = auth.uid()));
create policy "admin delete sellers" on sellers for delete using (exists (select 1 from admins where user_id = auth.uid()));

drop policy if exists "read articles" on articles;
drop policy if exists "admin write articles" on articles;
drop policy if exists "admin update articles" on articles;
drop policy if exists "admin delete articles" on articles;
drop policy if exists "team read articles" on articles;
create policy "team read articles" on articles for select using (auth.role() = 'authenticated');
create policy "admin write articles" on articles for insert with check (exists (select 1 from admins where user_id = auth.uid()));
create policy "admin update articles" on articles for update using (exists (select 1 from admins where user_id = auth.uid())) with check (exists (select 1 from admins where user_id = auth.uid()));
create policy "admin delete articles" on articles for delete using (exists (select 1 from admins where user_id = auth.uid()));

drop policy if exists "read platforms" on message_platforms;
drop policy if exists "admin write platforms" on message_platforms;
drop policy if exists "admin update platforms" on message_platforms;
drop policy if exists "admin delete platforms" on message_platforms;
drop policy if exists "team read platforms" on message_platforms;
create policy "team read platforms" on message_platforms for select using (auth.role() = 'authenticated');
create policy "admin write platforms" on message_platforms for insert with check (exists (select 1 from admins where user_id = auth.uid()));
create policy "admin update platforms" on message_platforms for update using (exists (select 1 from admins where user_id = auth.uid())) with check (exists (select 1 from admins where user_id = auth.uid()));
create policy "admin delete platforms" on message_platforms for delete using (exists (select 1 from admins where user_id = auth.uid()));

drop policy if exists "read mx_states" on mx_states;
drop policy if exists "team read mx_states" on mx_states;
create policy "team read mx_states" on mx_states for select using (auth.role() = 'authenticated');
