-- ============================================================
-- GolDentist · Ventas — folio automático de Envíos + quitar SKU/No. orden
-- (2026-09-03)
-- Ejecutar en el SQL Editor de Supabase, DESPUÉS de 006_normalizar_estados.sql.
-- Seguro de correr más de una vez.
-- ============================================================

-- ---------- Quitar SKU y No. orden ----------
-- Ya no se capturan desde la app (se pidió quitarlos de todos lados). El
-- No. orden queda reemplazado por el folio automático de abajo.
alter table shipments drop column if exists sku;
alter table shipments drop column if exists no_orden;

-- ---------- Folio automático "No. de envío", reiniciado cada año ----------
-- No lo captura nadie a mano: se asigna solo al registrar el envío, y
-- empieza otra vez en 1 cuando cambia el año (el año se toma de la fecha
-- del envío, la misma columna "date" que ya se usa para agrupar por mes).
--
-- "envio_year" es una columna calculada (no se guarda un valor aparte que
-- se pueda desincronizar de "date"), y junto con el índice único de abajo
-- garantiza que nunca haya dos envíos del mismo año con el mismo folio.

alter table shipments add column if not exists no_envio integer;
alter table shipments add column if not exists envio_year integer
  generated always as (extract(year from date)::int) stored;

create unique index if not exists shipments_no_envio_year_uidx
  on shipments (envio_year, no_envio);

-- Le pone folio a los envíos que ya existan y todavía no tengan uno
-- (por ejemplo, los 136 del historial de 005): los numera en orden de
-- fecha dentro de cada año, empezando en 1.
with numbered as (
  select id, row_number() over (partition by envio_year order by date, id) as rn
  from shipments
  where no_envio is null
)
update shipments s set no_envio = n.rn
from numbered n
where s.id = n.id;

-- A partir de aquí, cualquier envío nuevo (o editado sin folio) recibe
-- uno automáticamente antes de guardarse.
--
-- Nota: si dos personas registran un envío en el mismo instante exacto,
-- hay una posibilidad remota (típica de este patrón "MAX + 1") de que
-- ambos intenten tomar el mismo folio; el índice único de arriba evita
-- que se guarden duplicados — en ese caso rarísimo, a quien le rechace el
-- guardado solo tiene que intentar de nuevo.
create or replace function shipments_assign_no_envio() returns trigger as $$
begin
  if new.no_envio is null then
    select coalesce(max(no_envio), 0) + 1 into new.no_envio
      from shipments
      where extract(year from date)::int = extract(year from new.date)::int;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_shipments_no_envio on shipments;
create trigger trg_shipments_no_envio
  before insert on shipments
  for each row execute function shipments_assign_no_envio();
