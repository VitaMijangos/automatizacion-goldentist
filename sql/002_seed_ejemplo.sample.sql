-- ============================================================
-- GolDentist · Ventas — datos de EJEMPLO (ficticios) para Ventas y Mensajes
-- ------------------------------------------------------------
-- Este archivo NO contiene información real de ningún cliente ni negocio.
-- Es una muestra pequeña, con nombres y cifras inventadas, pensada para que
-- cualquiera pueda levantar el proyecto y ver cómo se ve con datos cargados,
-- sin depender de información sensible.
--
-- Ejecutar (opcional) después de 001_schema.sql, en el SQL Editor de tu
-- propio proyecto de Supabase.
-- ============================================================

-- Catálogos

insert into channels (name) values
  ('FACEBOOK'),
  ('WATTI'),
  ('PÁGINA WEB')
on conflict (name) do nothing;

insert into sellers (name) values
  ('Vendedora Uno'),
  ('Vendedora Dos')
on conflict (name) do nothing;

insert into articles (name) values
  ('Kit de diagnóstico dental'),
  ('Unidad de rayos X portátil'),
  ('Autoclave de mesa')
on conflict (name) do nothing;

insert into message_platforms (name) values
  ('INSTAGRAM'),
  ('FACEBOOK'),
  ('WATTI')
on conflict (name) do nothing;

-- Ventas de ejemplo

insert into sales (date, channel, article, qty, seller) values
  ('2026-08-03', 'FACEBOOK', 'Kit de diagnóstico dental', 2, 'Vendedora Uno'),
  ('2026-08-05', 'WATTI', 'Unidad de rayos X portátil', 1, 'Vendedora Dos'),
  ('2026-08-10', 'PÁGINA WEB', 'Autoclave de mesa', 1, 'Vendedora Uno'),
  ('2026-08-14', 'FACEBOOK', 'Kit de diagnóstico dental', 3, 'Vendedora Dos'),
  ('2026-08-20', 'WATTI', 'Kit de diagnóstico dental', 1, 'Vendedora Uno');

-- Mensajes de ejemplo (embudo diario por plataforma) — la suma de las 8
-- categorías siempre cuadra con "atendidos", igual que exige la app.

insert into messages
  (date, platform, atendidos, no_resp, valoracion, propuesta, pago_pendiente, contactar_otra, descartados, venta_cerrada, fuera_catalogo)
values
  ('2026-08-03', 'INSTAGRAM', 12, 3, 2, 2, 1, 1, 1, 1, 1),
  ('2026-08-05', 'WATTI',      8, 1, 1, 1, 1, 1, 1, 1, 1),
  ('2026-08-10', 'FACEBOOK',  10, 2, 2, 1, 1, 1, 1, 1, 1),
  ('2026-08-14', 'INSTAGRAM', 15, 4, 2, 2, 2, 1, 2, 1, 1);
