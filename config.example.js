/* GolDentist · Ventas — configuración de conexión a Supabase
   ------------------------------------------------------------
   1. Crea tu proyecto en https://supabase.com (ver docs/GUIA_DESPLIEGUE.md).
   2. En el proyecto: Project Settings -> API.
   3. Copia "Project URL" y pégalo abajo en SUPABASE_URL.
   4. Copia la llave "anon public" y pégala abajo en SUPABASE_ANON_KEY.
   5. Guarda este archivo como "config.js" (sin ".example") junto a index.html.

   La llave "anon" está pensada para ser pública (viaja dentro del HTML que
   ve cualquier navegador) — la seguridad real la dan las políticas RLS
   definidas en sql/001_schema.sql y sql/004_schema_envios_apartados.sql,
   no el secreto de esta llave. NUNCA pongas aquí la "service_role key": esa
   sí debe mantenerse secreta y esta app no la necesita. */

window.SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
window.SUPABASE_ANON_KEY = 'TU-LLAVE-ANON-PUBLICA';
