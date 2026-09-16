-- ============================================================
-- GolDentist · Ventas — Envíos y Apartados (2026-08-31)
-- Ejecutar en el SQL Editor de Supabase, DESPUÉS de 001_schema.sql.
-- Seguro de correr en un proyecto que ya tiene 001_schema.sql aplicado:
-- solo agrega tablas nuevas, no toca channels/sellers/articles/sales/messages.
-- ============================================================

-- ---------- Envíos ----------
-- Cuando se hace una venta por WooCommerce, una vendedora captura aquí los
-- datos de envío para que bodega genere las guías. Es un registro
-- independiente de "sales" (sales no guarda cliente ni número de pedido).

create table if not exists shipments (
  id bigint generated always as identity primary key,
  venta_id text not null default '',       -- "ID VENTA" de WooCommerce
  no_orden text not null default '',       -- folio interno secuencial (opcional)
  customer_name text not null default '',
  phone text not null default '',
  email text not null default '',
  street text not null default '',         -- calle y número
  neighborhood text not null default '',   -- colonia
  city text not null default '',           -- ciudad / localidad
  state text not null default '',          -- edo
  zip text not null default '',
  country text not null default 'MEXICO',
  product text not null default '',
  sku text not null default '',
  qty integer not null default 1,
  date date not null,
  notes text not null default '',
  status text not null default 'pendiente', -- 'pendiente' | 'enviado'
  created_at timestamptz not null default now()
);

create index if not exists shipments_date_idx on shipments (date);
create index if not exists shipments_status_idx on shipments (status);

-- ---------- Apartados ----------
-- Clientes que dejan un anticipo y liquidan el resto despues. "layaways" es
-- el apartado en si (cliente, producto, monto total); "layaway_payments" son
-- los abonos individuales (puede haber varios a lo largo del tiempo). El
-- saldo restante se calcula en la app como total_amount - suma(abonos), no
-- se guarda por separado para que nunca quede desincronizado.

create table if not exists layaways (
  id bigint generated always as identity primary key,
  customer_name text not null default '',
  phone text not null default '',
  product text not null default '',
  qty integer not null default 1,
  date date not null,
  total_amount numeric(12,2) not null default 0,
  deposit_method text not null default '',        -- forma de apartado
  status text not null default 'apartado',        -- 'apartado' | 'pendiente' | 'completado'
  settle_payment_method text not null default '', -- forma de pago con la que liquidó
  settle_date date,                                -- fecha de liquidación
  notes text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists layaways_date_idx on layaways (date);
create index if not exists layaways_status_idx on layaways (status);

create table if not exists layaway_payments (
  id bigint generated always as identity primary key,
  layaway_id bigint not null references layaways(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  date date,
  note text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists layaway_payments_layaway_idx on layaway_payments (layaway_id);

-- ---------- RLS ----------
-- Mismo modelo que sales/messages: lectura y escritura abiertas (sin login)
-- para todo el equipo; no son catálogos, así que no se restringen a admin.

alter table shipments enable row level security;
alter table layaways enable row level security;
alter table layaway_payments enable row level security;

create policy "read shipments" on shipments for select using (true);
create policy "insert shipments" on shipments for insert with check (true);
create policy "update shipments" on shipments for update using (true) with check (true);
create policy "delete shipments" on shipments for delete using (true);

create policy "read layaways" on layaways for select using (true);
create policy "insert layaways" on layaways for insert with check (true);
create policy "update layaways" on layaways for update using (true) with check (true);
create policy "delete layaways" on layaways for delete using (true);

create policy "read layaway_payments" on layaway_payments for select using (true);
create policy "insert layaway_payments" on layaway_payments for insert with check (true);
create policy "update layaway_payments" on layaway_payments for update using (true) with check (true);
create policy "delete layaway_payments" on layaway_payments for delete using (true);
