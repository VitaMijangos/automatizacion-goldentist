-- ============================================================
-- GolDentist · Ventas — datos de EJEMPLO (ficticios) para Envíos y Apartados
-- ------------------------------------------------------------
-- Este archivo NO contiene información real de ningún cliente. Nombres,
-- teléfonos, correos y direcciones son inventados, solo para mostrar cómo
-- se ve la app con datos cargados.
--
-- Ejecutar (opcional) después de 004_schema_envios_apartados.sql, en el
-- SQL Editor de tu propio proyecto de Supabase.
-- ============================================================

insert into shipments
  (venta_id, no_orden, customer_name, phone, email, street, neighborhood, city, state, zip, country, product, sku, qty, date, notes, status)
values
  ('1001', '1', 'Cliente de Ejemplo Uno', '5500000001', 'ejemplo1@correo.com', 'Calle Ficticia 123', 'Colonia Centro', 'Ciudad de México', 'Ciudad de México', '01000', 'MEXICO', 'Kit de diagnóstico dental', 'SKU-001', 2, '2026-08-03', '', 'enviado'),
  ('1002', '2', 'Cliente de Ejemplo Dos', '5500000002', 'ejemplo2@correo.com', 'Av. Imaginaria 456', 'Colonia Ejemplo', 'Guadalajara', 'Jalisco', '44100', 'MEXICO', 'Unidad de rayos X portátil', 'SKU-002', 1, '2026-08-05', '', 'pendiente'),
  ('1003', '3', 'Cliente de Ejemplo Tres', '5500000003', 'ejemplo3@correo.com', 'Blvd. Demostración 789', 'Colonia Muestra', 'Monterrey', 'Nuevo León', '64000', 'MEXICO', 'Autoclave de mesa', 'SKU-003', 1, '2026-08-10', '', 'enviado');

insert into layaways
  (customer_name, phone, product, qty, date, total_amount, deposit_method, status, settle_payment_method, settle_date, notes)
values
  ('Cliente de Ejemplo Cuatro', '5500000004', 'Unidad de rayos X portátil', 1, '2026-08-09', 59990, 'Transferencia', 'completado', 'Transferencia', '2026-08-11', '');

insert into layaway_payments (layaway_id, amount, date, note)
select id, 18000, '2026-08-09', 'Depósito inicial' from layaways where customer_name = 'Cliente de Ejemplo Cuatro'
union all
select id, 41990, '2026-08-11', 'Liquidación' from layaways where customer_name = 'Cliente de Ejemplo Cuatro';
