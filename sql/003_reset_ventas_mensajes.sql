-- ============================================================
-- GolDentist · Ventas -- SOLO usar si ya ejecutaste la versión
-- anterior (incorrecta) de 002_seed_historico.sql en tu proyecto
-- de Supabase, y quieres reemplazar esos datos por los correctos.
--
-- Esto borra TODAS las ventas y TODOS los registros de mensajes
-- (no toca canales, vendedoras, artículos ni plataformas).
-- Después de correr este archivo, ejecuta el nuevo
-- 002_seed_historico.sql para volver a cargar los datos, ya
-- corregidos.
--
-- Si nunca corriste 002_seed_historico.sql (o tu proyecto está
-- recién creado), NO necesitas este archivo: solo corre el nuevo
-- 002_seed_historico.sql directamente.
-- ============================================================

truncate table sales restart identity;
truncate table messages restart identity;
