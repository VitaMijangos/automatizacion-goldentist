-- ============================================================
-- GolDentist · Ventas — normalizar "Estado" en Envíos (2026-08-31)
-- Ejecutar en el SQL Editor de Supabase, DESPUÉS de 004_schema_envios_apartados.sql
-- (y de 005_seed_envios_apartados.sql, si ya lo corriste). Seguro de correr
-- más de una vez: crea el catálogo si no existe, normaliza variantes de
-- escritura comunes y solo agrega la relación (foreign key) si todavía no
-- existe.
-- ============================================================

-- ---------- Catálogo de los 32 estados de México ----------
-- Mismo patrón que channels/sellers/articles/message_platforms: una tabla
-- de catálogo con nombres únicos. A diferencia de esas, esta lista es fija
-- (no cambia con el negocio), así que no se expone un botón para
-- agregar/quitar estados desde la app — solo se usa para llenar el <select>
-- de "Estado" en Envíos y, con la relación de abajo, para que la base de
-- datos rechace cualquier valor que no sea uno de los 32 estados reales.

create table if not exists mx_states (
  id bigint generated always as identity primary key,
  name text not null unique
);

insert into mx_states (name) values
  ('Aguascalientes'), ('Baja California'), ('Baja California Sur'),
  ('Campeche'), ('Chiapas'), ('Chihuahua'), ('Ciudad de México'),
  ('Coahuila'), ('Colima'), ('Durango'), ('Estado de México'),
  ('Guanajuato'), ('Guerrero'), ('Hidalgo'), ('Jalisco'), ('Michoacán'),
  ('Morelos'), ('Nayarit'), ('Nuevo León'), ('Oaxaca'), ('Puebla'),
  ('Querétaro'), ('Quintana Roo'), ('San Luis Potosí'), ('Sinaloa'),
  ('Sonora'), ('Tabasco'), ('Tamaulipas'), ('Tlaxcala'), ('Veracruz'),
  ('Yucatán'), ('Zacatecas')
on conflict (name) do nothing;

alter table mx_states enable row level security;
drop policy if exists "read mx_states" on mx_states;
create policy "read mx_states" on mx_states for select using (true);

-- ---------- Normalizar shipments.state contra el catálogo ----------

-- 0) Antes que nada, permitir NULL en la columna (hasta ahora era
--    "not null default ''"). Sin este paso, los UPDATE de abajo que ponen
--    state = null fallarían. Un envío sin estado capturado ahora se
--    representa como "sin dato" (NULL), no como una cadena vacía que
--    técnicamente no es ningún estado real.
alter table shipments alter column state drop default;
alter table shipments alter column state drop not null;

-- 1) Variantes de escritura comunes -> nombre oficial del catálogo. Esto
--    cubre lo que alguien podría teclear a mano en el campo libre que
--    existía antes (abreviaturas, sin acentos, nombre viejo "Distrito
--    Federal", etc.). El historial importado de la hoja de cálculo (136
--    envíos) ya usaba los 32 nombres oficiales tal cual, así que estas
--    variantes solo aplican a registros capturados a mano después.
update shipments set state = 'Ciudad de México'
  where state in ('CDMX','Cdmx','cdmx','Distrito Federal','D.F.','DF','Ciudad de Mexico');
update shipments set state = 'Estado de México'
  where state in ('Edomex','EdoMex','edomex','México','Mexico','Estado de Mexico');
update shipments set state = 'Nuevo León' where state = 'Nuevo Leon';
update shipments set state = 'Michoacán' where state = 'Michoacan';
update shipments set state = 'Querétaro' where state = 'Queretaro';
update shipments set state = 'San Luis Potosí' where state = 'San Luis Potosi';
update shipments set state = 'Yucatán' where state = 'Yucatan';

-- 2) Cualquier valor que después de lo anterior siga sin coincidir con el
--    catálogo (por ejemplo un error de captura) se conserva en las notas
--    del envío -- para no perder el dato -- y el campo Estado se deja en
--    blanco, listo para corregirlo desde la app con el nuevo selector.
update shipments
  set notes = trim(both ' ' from (notes || ' [Estado original: ' || state || ']')),
      state = null
  where state is not null and state <> '' and state not in (select name from mx_states);

-- 3) "" (vacío) pasa a ser NULL.
update shipments set state = null where state = '';

-- ---------- Relación (foreign key) ----------
-- A partir de aquí, Postgres ya no deja guardar en shipments.state ningún
-- valor que no sea uno de los 32 nombres de mx_states (o NULL, para "sin
-- capturar"). Esa es la normalización real: ya no es posible que la base
-- de datos termine con "Edomex", "CDMX" y "Ciudad de México" conviviendo
-- como si fueran cosas distintas.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shipments_state_fkey'
  ) then
    alter table shipments
      add constraint shipments_state_fkey foreign key (state) references mx_states(name);
  end if;
end $$;
