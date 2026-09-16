-- ============================================================
-- GolDentist · Ventas — datos de la guía en Envíos (Paquetería + No. de guía)
-- (2026-09-03)
-- Ejecutar en el SQL Editor de Supabase, DESPUÉS de 007_no_envio.sql.
-- Seguro de correr más de una vez.
-- ============================================================

-- Estos dos campos no se capturan al registrar el envío (los llena
-- después quien genera la guía en la paquetería), así que se agregan
-- como columnas normales, sin "not null" ni valor por default.
--
-- "paqueteria" es texto libre a propósito: la app ofrece un menú con
-- DHL / FedEx / Estafeta / Otro, pero "Otro" permite escribir cualquier
-- nombre a mano, así que no aplica normalizarlo con un catálogo fijo
-- como se hizo con Estado.
alter table shipments add column if not exists paqueteria text;
alter table shipments add column if not exists no_guia text;
