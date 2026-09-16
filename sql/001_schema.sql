-- ============================================================
-- GolDentist · Ventas — esquema de base de datos (Supabase / Postgres)
-- Ejecutar completo, una sola vez, en el SQL Editor de tu proyecto Supabase.
-- ============================================================

-- ---------- Tablas de catálogo ----------

create table if not exists channels (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists sellers (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists articles (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists message_platforms (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

-- ---------- Ventas ----------

create table if not exists sales (
  id bigint generated always as identity primary key,
  date date not null,
  channel text not null,
  article text not null,
  qty integer not null check (qty > 0),
  seller text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists sales_date_idx on sales (date);
create index if not exists sales_channel_idx on sales (channel);

-- ---------- Mensajes (embudo diario por plataforma) ----------

create table if not exists messages (
  id bigint generated always as identity primary key,
  date date not null,
  platform text not null,
  atendidos integer not null default 0,
  no_resp integer not null default 0,
  valoracion integer not null default 0,
  propuesta integer not null default 0,
  pago_pendiente integer not null default 0,
  contactar_otra integer not null default 0,
  descartados integer not null default 0,
  venta_cerrada integer not null default 0,
  fuera_catalogo integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists messages_date_idx on messages (date);
create index if not exists messages_platform_idx on messages (platform);

-- ============================================================
-- Row Level Security (RLS)
--
-- Modelo de permisos (mismo espíritu que la app original, donde cualquiera
-- con el enlace podía registrar/editar/eliminar ventas y mensajes, y el PIN
-- solo ocultaba botones en pantalla sin ser una barrera real):
--
--   - Lectura: pública para todo (igual que antes, todo el equipo veía todo).
--   - Ventas y mensajes: cualquiera puede insertar/editar/eliminar, sin login
--     (así lo pidió el negocio: cualquiera del equipo registra desde su
--     celular sin fricción). Esto es una decisión consciente, no un descuido.
--   - Catálogo (canales, vendedoras, artículos, plataformas): SOLO un admin
--     con sesión iniciada (Supabase Auth) puede agregar o quitar. Esta es la
--     mejora real de seguridad respecto al PIN anterior, que cualquiera
--     podía saltarse desde las herramientas de desarrollador del navegador.
-- ============================================================

alter table channels enable row level security;
alter table sellers enable row level security;
alter table articles enable row level security;
alter table message_platforms enable row level security;
alter table sales enable row level security;
alter table messages enable row level security;

-- Lectura pública en todas las tablas
create policy "read channels" on channels for select using (true);
create policy "read sellers" on sellers for select using (true);
create policy "read articles" on articles for select using (true);
create policy "read platforms" on message_platforms for select using (true);
create policy "read sales" on sales for select using (true);
create policy "read messages" on messages for select using (true);

-- Ventas: abierto para insertar/editar/eliminar (sin login), igual que antes
create policy "insert sales" on sales for insert with check (true);
create policy "update sales" on sales for update using (true) with check (true);
create policy "delete sales" on sales for delete using (true);

-- Mensajes: abierto para insertar/editar/eliminar (sin login), igual que antes
create policy "insert messages" on messages for insert with check (true);
create policy "update messages" on messages for update using (true) with check (true);
create policy "delete messages" on messages for delete using (true);

-- Catálogo: solo admin autenticado (cualquier cuenta que crees en Supabase Auth
-- cuenta como "admin" — ver la guía de despliegue para crear ese usuario)
create policy "admin write channels" on channels for insert with check (auth.role() = 'authenticated');
create policy "admin update channels" on channels for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin delete channels" on channels for delete using (auth.role() = 'authenticated');

create policy "admin write sellers" on sellers for insert with check (auth.role() = 'authenticated');
create policy "admin update sellers" on sellers for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin delete sellers" on sellers for delete using (auth.role() = 'authenticated');

create policy "admin write articles" on articles for insert with check (auth.role() = 'authenticated');
create policy "admin update articles" on articles for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin delete articles" on articles for delete using (auth.role() = 'authenticated');

create policy "admin write platforms" on message_platforms for insert with check (auth.role() = 'authenticated');
create policy "admin update platforms" on message_platforms for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "admin delete platforms" on message_platforms for delete using (auth.role() = 'authenticated');
