# GolDentist · Ventas — guía de despliegue

Esta versión de la app ya no guarda los datos dentro de la página (como el
artifact de claude.ai). Ahora usa una base de datos real en **Supabase**
(Postgres gratis) y un archivo `index.html` estático que subes a tu propio
hosting/dominio.

Archivos que recibiste:

- `index.html` — la app completa (diseño + lógica). No necesitas tocarla.
- `config.js` — el único archivo que edito­ tú, con la URL y la llave de tu
  proyecto de Supabase.
- `001_schema.sql` — crea las tablas y las reglas de seguridad (RLS).
- `002_seed_historico.sql` — carga tus 64 ventas y 81 registros de mensajes
  de agosto 2026, verificados contra tus hojas de Google Sheets en vivo
  (REPORTE VENTAS y Reporte Mensajes) el 2026-08-31. Es opcional: si
  prefieres empezar en cero, no lo ejecutes.
- `003_reset_ventas_mensajes.sql` — **solo si ya ejecutaste una versión
  anterior de `002_seed_historico.sql`**: borra ventas y mensajes para
  volver a cargarlos correctamente. Si tu proyecto es nuevo, ignora este
  archivo.
- `004_schema_envios_apartados.sql` — crea las tablas de **Envíos** y
  **Apartados** (nuevo, 2026-08-31). Seguro de correr aunque ya hayas
  ejecutado `001_schema.sql` antes: solo agrega tablas nuevas.
- `005_seed_envios_apartados.sql` — carga el historial de Envíos y
  Apartados de tu hoja "ENVIOS 2026" (136 envíos y 12 apartados con sus
  abonos). Opcional, igual que `002_seed_historico.sql`.
- `006_normalizar_estados.sql` — crea un catálogo con los 32 estados de
  México y hace que el campo "Estado" de Envíos solo pueda tener uno de
  esos 32 valores, tanto en la app (ahora es un menú desplegable, ya no
  texto libre) como en la base de datos (nuevo, 2026-08-31). **Este ya no
  es opcional** si vas a usar Envíos: sin correrlo, el menú de Estado se
  verá vacío.
- `007_no_envio.sql` — quita los campos "SKU" y "No. de orden" de Envíos
  (ya no se capturan) y agrega un folio automático "No. de envío" que se
  asigna solo al registrar cada envío y se reinicia cada año (nuevo,
  2026-09-03). **Tampoco es opcional** si vas a usar Envíos.
- `008_guia_paqueteria.sql` — agrega los campos "Paquetería" y "Número de
  guía" a Envíos, para que quien genera la guía capture ahí esos datos
  (nuevo, 2026-09-03). **Tampoco es opcional** si vas a usar Envíos.
- `010_login_requerido.sql` — hace que **toda** la app pida iniciar sesión
  (antes Ventas/Mensajes/Envíos/Apartados eran públicos) y crea la tabla
  `admins`, que decide quién ve el Panel y puede editar el Catálogo (nuevo,
  2026-09-04). **Tampoco es opcional**: sin este archivo, la app se queda
  esperando conexión — ver la sección dedicada más abajo.
- `GUIA_DESPLIEGUE.md` — este documento.

No hace falta instalar nada ni saber programar: son 4 pasos.

## Paso 1 — Crear el proyecto en Supabase (gratis)

1. Ve a [supabase.com](https://supabase.com) y crea una cuenta (puedes
   entrar con tu correo de Google).
2. Clic en **New project**. Ponle un nombre, por ejemplo `goldentist-ventas`,
   elige una contraseña de base de datos (guárdala, no la necesitarás para
   la app pero sí si algún día quieres conectarte directo a la base) y
   elige la región más cercana (por ejemplo, la de EE.UU. más cercana a
   México si no hay una regional).
3. Espera 1-2 minutos mientras se crea el proyecto.

El plan gratuito de Supabase incluye una base de datos Postgres, backups
automáticos, y autenticación — más que suficiente para este uso. Revisa los
límites actuales del plan gratuito en
[supabase.com/pricing](https://supabase.com/pricing) si tu equipo crece
mucho.

## Paso 2 — Crear las tablas

1. En tu proyecto, ve al menú **SQL Editor** (ícono de `</>`).
2. Clic en **New query**.
3. Abre el archivo `001_schema.sql` que te entregué, copia todo su
   contenido, pégalo en el editor y dale **Run**. Deberías ver
   "Success. No rows returned".
4. (Opcional, recomendado) Repite el mismo proceso con
   `002_seed_historico.sql` para cargar tu historial de agosto 2026. Solo
   ejecútalo **una vez** — si lo corres dos veces duplicará las ventas y
   mensajes (los catálogos no se duplican, pero ventas y mensajes sí).
   - Si ya habías ejecutado una versión anterior de este archivo (antes del
     2026-08-31), primero corre `003_reset_ventas_mensajes.sql` para
     limpiar esos datos, y luego el `002_seed_historico.sql` nuevo — así
     no quedan datos duplicados ni desactualizados.
   - Las ventas de este archivo no traen vendedora asignada (la hoja de
     Google Sheets no la registra por venta), así que verás la columna
     "Vendedora" vacía en el historial cargado. Puedes asignarla venta por
     venta desde la app (botón Editar) si te interesa llevar ese dato hacia
     adelante.
5. Repite el mismo proceso con `004_schema_envios_apartados.sql` (crea las
   tablas de Envíos y Apartados) y, si quieres tu historial cargado, con
   `005_seed_envios_apartados.sql` justo después. También es seguro
   correrlo una sola vez.
6. Por último, corre `006_normalizar_estados.sql` — a diferencia de los
   anteriores, este **no es opcional**: crea el catálogo de los 32 estados
   que usa el menú desplegable de "Estado" en Envíos. Es seguro correrlo
   más de una vez (por ejemplo si ya habías cargado envíos con estados
   escritos a mano) — cualquier variante que reconozca (como "CDMX" o
   "Edomex") la corrige sola, y cualquier valor que no reconozca lo
   conserva en las notas del envío y deja el estado en blanco para que lo
   corrijas desde el menú.
7. Corre `007_no_envio.sql` — tampoco es opcional. Le pone un folio (No.
   de envío) a los envíos que ya tengas cargados, numerando por año, y
   deja todo listo para que los envíos nuevos lo reciban solos.
8. Corre `008_guia_paqueteria.sql` — tampoco es opcional. Agrega los
   campos donde se captura la paquetería y el número de guía una vez que
   se genera el envío.
9. Para terminar, corre `010_login_requerido.sql` — **tampoco es
   opcional**: sin este archivo la app funciona, pero con las reglas
   viejas (públicas); con él, hace que TODA la app pida iniciar sesión.
   Es seguro correrlo más de una vez.

## Paso 3 — Crear una cuenta para cada persona del equipo

Antes, cualquiera con el enlace podía usar Ventas/Mensajes/Envíos/Apartados
sin iniciar sesión, y solo el Panel y el Catálogo pedían una cuenta (que se
trataba como "la" cuenta admin). Ahora **toda la app pide iniciar sesión**:
cada persona de tu equipo (vendedoras, bodega, tú) necesita su propia
cuenta para poder ver o capturar cualquier cosa. El PIN que se usaba hace
tiempo (2468) ya no existe.

**3.1 — Crear una cuenta por persona**

1. En el menú lateral, ve a **Authentication → Users**.
2. Clic en **Add user → Create new user**.
3. Pon el correo de esa persona y una contraseña. Marca **Auto Confirm
   User** para no tener que verificar el correo.
4. Comparte esa contraseña con la persona por un medio seguro (no por
   este chat ni por WhatsApp de preferencia) para que la cambie ella misma
   la primera vez, si quieres.

Repite este paso una vez por cada persona del equipo. No hay límite de
cuentas.

**3.2 — Marcar quién es administrador (ve el Panel y edita el Catálogo)**

Tener una cuenta ya deja entrar a la app, pero **no** te hace
administrador por sí solo — eso lo decide la tabla `admins`, aparte:

1. En **Authentication → Users**, haz clic en la cuenta que quieres volver
   administradora y copia su **UID** (un código largo tipo
   `a1b2c3d4-...`).
2. Ve al **SQL Editor** y corre (reemplazando el UID):

   ```sql
   insert into admins (user_id) values ('PEGA-AQUI-EL-UID')
   on conflict (user_id) do nothing;
   ```

3. Esa cuenta ya puede ver el Panel y editar el Catálogo (canales,
   vendedoras, artículos, plataformas) la próxima vez que inicie sesión.

Si ya tenías una cuenta admin de antes de este cambio (por ejemplo la que
usabas con "🔒 Modo admin"), `010_login_requerido.sql` ya la marcó como
administradora automáticamente si su correo era
`casamedicadental@gmail.com` — no necesitas repetir este paso para ella.

Para quitarle el acceso de administradora a alguien sin borrar su cuenta
(sigue pudiendo capturar Ventas/Mensajes/Envíos/Apartados, solo deja de
ver Panel/Catálogo), corre:

```sql
delete from admins where user_id = 'ESE-UID';
```

## Paso 4 — Conectar la app a tu proyecto

1. En tu proyecto de Supabase, ve a **Project Settings → API**.
2. Copia el valor de **Project URL** (algo como
   `https://abcdefgh.supabase.co`).
3. Copia el valor de **anon public** (una llave larga que empieza con
   `eyJ...`). *No* copies la "service_role key" — esa debe quedarse
   secreta y esta app no la necesita.
4. Abre `config.js` con cualquier editor de texto (incluso el Bloc de
   notas) y reemplaza:

   ```js
   window.SUPABASE_URL = 'https://TU-PROYECTO.supabase.co';
   window.SUPABASE_ANON_KEY = 'TU-LLAVE-ANON-PUBLICA';
   ```

   con tus valores reales, y guarda el archivo.

Nota de seguridad: es normal y esperado que la llave "anon" quede visible
dentro del código que ve cualquier navegador — así funciona Supabase. La
protección real la dan las reglas que ya quedaron creadas en
`001_schema.sql` y, sobre todo, en `010_login_requerido.sql` (RLS): nadie
puede ver ni registrar nada sin haber iniciado sesión con una cuenta que tú
creaste; cualquier cuenta del equipo puede usar Ventas/Mensajes/Envíos/
Apartados, y solo una cuenta marcada en la tabla `admins` puede modificar
el catálogo (canales, vendedoras, artículos, plataformas) o ver el Panel.

## Paso 5 — Subir los archivos a tu hosting

Sube **`index.html`** y **`config.js`** (juntos, en la misma carpeta) a tu
hosting, tal como subirías cualquier página web:

- Si usas **cPanel** (Hostinger, GoDaddy, etc.): entra a **Administrador de
  archivos → public_html** (o la subcarpeta de tu dominio/subdominio) y
  sube ahí los dos archivos.
- Si usas **FTP**: conéctate con tu cliente de FTP (FileZilla, etc.) y
  sube los dos archivos a la carpeta raíz de tu sitio.

Si quieres que la app viva en una dirección tipo
`ventas.tudominio.com`, crea primero ese subdominio desde el panel de tu
hosting y sube ahí los archivos, en vez de la carpeta principal.

Cuando termines, abre esa dirección en tu navegador — deberías ver la app
con tus datos de agosto (si ejecutaste el paso 2 opcional) o vacía (si no).

## Envíos y Apartados (nuevo, 2026-08-31)

Se agregaron dos pestañas nuevas a la app, independientes de "Registrar
venta" (como pediste, ya que Ventas solo sirve para ver qué canal vende
más y no lleva cliente ni número de pedido):

- **Envíos**: para que una vendedora capture los datos de envío de una
  venta por WooCommerce (cliente, teléfono, dirección, producto, SKU) y
  bodega los use para generar la guía. Cada envío tiene un estatus
  Pendiente/Enviado con un botón para marcarlo de un clic; el filtro
  "Pendientes" muestra solo lo que bodega aún debe surtir.
- **Apartados**: para un cliente que deja un anticipo y liquida el resto
  después. Se captura el monto total y (opcionalmente) un depósito
  inicial; desde "Ver / abonar" se pueden ir agregando más abonos conforme
  el cliente va pagando. El monto restante **se calcula solo** (total menos
  la suma de abonos) — no se guarda como número fijo, para que nunca quede
  desactualizado.

Ambas son de captura abierta para cualquier cuenta del equipo (mismo
modelo que Ventas y Mensajes — ver "Login obligatorio" más abajo), y
tienen su propio botón de exportar CSV, además de dos botones más en
Catálogo → Datos para descargar el respaldo completo de cada una.

**Nota sobre MySQL**: mencionaste que vas a migrar la base de datos a
MySQL más adelante porque tu hosting lo incluye, pero todavía no tienes
los accesos. Mientras tanto seguimos usando Supabase (como el resto de la
app) para no detener el trabajo; cuando tengas los datos de conexión de
MySQL, te ayudo a migrar todo (Ventas, Mensajes, Envíos y Apartados
juntos) — MySQL no tiene el equivalente automático de Supabase (API REST
+ RLS integradas), así que esa migración va a necesitar además un
pequeño backend intermedio entre la app y la base de datos; lo planeamos
con calma cuando llegue el momento.

## Estado normalizado en Envíos (nuevo, 2026-08-31)

El campo "Estado" (edo. de la república) de Envíos ya no es texto libre —
ahora es un menú desplegable con los 32 estados de México, y la base de
datos rechaza cualquier valor que no sea uno de esos 32 (o vacío, si aún
no se ha capturado). Antes era normal que "CDMX", "Ciudad de México" y
"Edomex" convivieran como si fueran cosas distintas, lo que hacía casi
imposible, por ejemplo, contar cuántos envíos van a cada estado; ahora
siempre es el mismo texto exacto para el mismo estado.

`006_normalizar_estados.sql` se encarga de dejar tus datos existentes
listos para esto: reconoce las variantes más comunes (CDMX, Edomex, sin
acentos, "Distrito Federal", etc.) y las corrige automáticamente; si
encuentra algún valor que no reconoce, lo guarda dentro de las notas del
envío (para no perder el dato) y deja el estado en blanco, listo para que
lo asignes desde el menú con un clic.

## Folio automático de Envíos (nuevo, 2026-09-03)

Se quitaron los campos "SKU" y "No. de orden" de Envíos — ya no se
capturan en ningún lado (ni en el formulario, ni en el historial, ni en
el CSV). En su lugar, cada envío recibe un **"No. de envío"** automático:
nadie lo escribe a mano, la app se lo asigna solo en cuanto se registra
la venta, y ese número vuelve a empezar en 1 cada vez que cambia el año
(el año se toma de la fecha del envío). Así, el primer envío de 2027 será
el #1, aunque el último de 2026 haya sido el #131.

`007_no_envio.sql` deja esto listo: le pone folio a todos los envíos que
ya tengas cargados (numerándolos por año, en orden de fecha) y a partir
de ahí cualquier envío nuevo lo recibe automáticamente. El folio aparece
como primera columna en la tabla de Envíos y como primer dato en la
ventana "Ver datos".

También se rediseñó esa ventana "Ver datos" a petición de Vita, pensando
en cómo trabaja bodega: ahora es más grande para que los datos se lean
sin esfuerzo, y cada campo (Cliente, Teléfono, Calle y número, Estado,
etc.) tiene su propio botón "Copiar" — así la persona en bodega copia un
dato a la vez y lo va pegando directo en la plataforma de DHL, en lugar
de copiar un bloque completo de texto y tener que separarlo ahí.

## Paquetería y número de guía en Envíos (nuevo, 2026-09-03)

La ventana "Ver datos" se ensanchó todavía más y ahora tiene, hasta abajo,
una segunda sección llamada **"Datos de la guía"** con dos campos nuevos:
**Paquetería** (un menú con DHL, FedEx, Estafeta u "Otro" — si eliges
"Otro" aparece un campo de texto para escribir cualquier otro nombre a
mano) y **Número de guía** (texto libre). A diferencia de todos los demás
datos del envío, estos dos no se capturan al registrar la venta ni
aparecen en el formulario de "Nuevo envío" ni en el de "Editar" — la
persona que arma la guía en la paquetería los llena directamente ahí, en
la misma pantalla donde ya está copiando los demás datos, justo después
de generar la guía y tener el número a la mano. Tienen su propio botón
"Guardar datos de guía", independiente del resto.

`008_guia_paqueteria.sql` agrega las dos columnas necesarias en la base de
datos (`paqueteria` y `no_guia`, ambas de texto libre — no se normalizó
"Paquetería" con un catálogo fijo como Estado, precisamente porque la
opción "Otro" necesita aceptar cualquier texto). Ambos campos también se
agregaron al final del CSV de Envíos, justo antes de Notas.

## Filtros de Envíos: Pendientes / Enviados / Todos, y por fecha (nuevo, 2026-09-03)

La lista de Envíos ahora tiene tres botones de estatus en vez de dos:
**Pendientes**, **Enviados** y **Todos** — antes solo se podía alternar
entre pendientes y todos, sin forma de ver de un vistazo únicamente los ya
enviados. "Todos" sigue ahí para ver la lista completa sin ningún filtro
de estatus.

También se agregó un buscador de fecha con dos campos, **Desde** y
**Hasta**: se puede usar solo uno de los dos (por ejemplo, "Desde" para
ver de esa fecha en adelante, sin límite), los dos iguales para ver un
solo día puntual, o un rango — por ejemplo el primer y el último día del
mes para ver el mes completo, o el lunes y el domingo de una semana. Con
el filtro activo, la lista se muestra en una tabla simple (sin agrupar
por mes). El botón **Quitar filtro** regresa a la vista normal agrupada
por mes, con todos los envíos. El filtro de fecha se puede combinar con
los tres botones de estatus (por ejemplo, "Enviados" + un rango de
fechas).

**El botón "Exportar CSV" de Envíos siempre descarga el respaldo
completo**, sin importar qué esté filtrado en pantalla en ese momento
(antes respetaba los filtros activos) — así el CSV sirve siempre como
respaldo íntegro, independientemente de lo que se esté viendo. Lo mismo
aplica a los botones nuevos de **Exportar CSV** que ahora también están
directamente en las pestañas de **Registrar venta** y **Mensajes**
(antes esa exportación solo existía para el administrador, dentro de
Panel o Catálogo → Datos) — cualquiera del equipo puede bajar el CSV
completo de ventas o de mensajes sin tener que iniciar sesión.

## Ventana de Apartados más ancha y abonos que se ven al momento (nuevo, 2026-09-03)

La ventana "Ver / abonar" de Apartados también se ensanchó (igual que la
de Envíos), para que los campos de "Forma de apartado", "Forma de pago
liquidado", etc. ya no se vean apretados ni con las etiquetas partidas en
dos líneas.

Se corrigió además el problema de que **al registrar un abono, el
"Restante" no se actualizaba en pantalla**: el cálculo siempre estuvo
bien (el total menos la suma de abonos), pero la ventana se cerraba de
inmediato al agregar el abono, así que no había forma de ver el número
nuevo sin volver a abrirla manualmente. Ahora, al agregar (o quitar) un
abono, **la ventana se queda abierta y el Abonado/Restante se actualizan
ahí mismo**, en vivo — lo mismo si el cliente hace un solo abono grande o
varios pagos chicos uno tras otro: se pueden ir agregando seguido, sin
tener que cerrar y volver a abrir la ventana cada vez.

Cuando la suma de los abonos ya cubre el monto total, aparece un aviso
verde de **"✅ Liquidado"** arriba de la lista de abonos, y el menú
"Estatus" se preselecciona automáticamente en **"Completado"** (no se
guarda nada solo por abrir la ventana — es nada más una sugerencia para
que, si ya está liquidado, baste con un clic en "Guardar cambios" para
dejarlo marcado así). Un apartado marcado como "Completado" deja de
aparecer en la vista "Abiertos" de la lista de Apartados, tal como ya
pasaba antes — para volver a verlo, usa el botón "Todos".

No hubo cambios en la base de datos para este ajuste (es solo interfaz):
no se necesita ningún archivo `.sql` nuevo.

## Filtro por fecha también en Apartados (nuevo, 2026-09-03)

Igual que en Envíos, la lista de Apartados ahora tiene un buscador de
fecha con dos campos, **Desde** y **Hasta**: un solo día (llenando los
dos iguales), un rango — por ejemplo el primer y el último día de un mes,
o el lunes y el domingo de una semana —, o dejar cualquiera de los dos
abierto (solo "Desde" = de ahí en adelante; solo "Hasta" = hasta esa
fecha). El botón **Quitar filtro** regresa a ver todos los apartados. El
filtro de fecha se puede combinar con los botones **Abiertos**/**Todos**
que ya existían (por ejemplo, ver los apartados abiertos de un mes en
particular).

A diferencia de Envíos, el botón **Exportar CSV** de Apartados sigue
respetando los filtros activos en pantalla (estatus y ahora también
fecha) — este es el mismo comportamiento que ya tenía antes de este
ajuste, no se cambió.

No hubo cambios en la base de datos (solo interfaz): no se necesita
ningún archivo `.sql` nuevo.

## Login obligatorio para todo el equipo (nuevo, 2026-09-04)

Antes, cualquiera con el enlace podía usar Ventas, Mensajes, Envíos y
Apartados sin iniciar sesión — era una decisión consciente, para que las
vendedoras no tuvieran que manejar una cuenta. A partir de este cambio,
por seguridad, **toda la app pide iniciar sesión**: nadie puede ver ni
capturar nada sin una cuenta que tú hayas creado en Supabase.

- Al abrir la app, ahora lo primero que se ve es una pantalla de "Iniciar
  sesión" (correo y contraseña) — nada más se muestra hasta entrar.
- **Cualquier cuenta del equipo** (vendedora, bodega, etc.) puede, una vez
  adentro, ver y editar Ventas/Mensajes/Envíos/Apartados exactamente igual
  que antes — no hay restricción por persona, cualquiera del equipo sigue
  viendo y corrigiendo el trabajo de los demás como hasta ahora.
- **Panel y Catálogo siguen aparte**: solo las cuentas marcadas como
  administradoras (tabla `admins`, ver Paso 3.2 más arriba) los ven. Tener
  una cuenta del equipo no te vuelve administrador automáticamente.
- Arriba a la derecha, donde antes estaba "🔒 Modo admin", ahora se ve el
  correo de quien inició sesión (con "· Admin" si aplica) y un botón
  **Cerrar sesión**, disponible para cualquiera.

**Qué tienes que hacer**: correr `010_login_requerido.sql` (Paso 2.9) y
crear una cuenta por cada persona del equipo (Paso 3). Si alguien pierde
su contraseña, se la puedes restablecer o recrear su cuenta desde
**Authentication → Users**, igual que con cualquier cuenta.

No hubo cambio de comportamiento dentro de cada sección (Ventas, Mensajes,
Envíos, Apartados siguen funcionando exactamente igual) — el único cambio
es que ahora hace falta haber iniciado sesión para llegar a ellas.

## Después del despliegue

- **Actualizar el catálogo o corregir algo en Supabase directamente**: en
  tu proyecto, el menú **Table Editor** te deja ver y editar cualquier
  tabla como si fuera una hoja de cálculo — útil para una corrección
  puntual sin pasar por la app.
- **Respaldos**: Supabase hace respaldos automáticos en el plan gratuito
  con retención limitada; para un respaldo manual en cualquier momento, ve
  a **Database → Backups**, o exporta una tabla como CSV desde el Table
  Editor (selecciona la tabla → botón de exportar).
- **Agregar una persona nueva al equipo (sin ser administradora)**: repite
  el Paso 3.1 — solo necesita su propia cuenta, no hace falta tocar la
  tabla `admins`.
- **Volver administradora a una cuenta ya existente, o quitarle ese
  acceso**: repite el Paso 3.2 (el `insert` o el `delete` sobre la tabla
  `admins`). No hace falta crear una cuenta nueva para esto.
- **Cambiar la contraseña de cualquier cuenta** (admin o no): Authentication
  → Users → selecciona el usuario → **Send password recovery**, o bórralo y
  créalo de nuevo.
- **Actualizar el diseño o agregar una función nueva**: vuelve a esta
  conversación (o al proyecto de Claude) y pide el cambio; te entregaré un
  `index.html` actualizado para volver a subir (tus datos no se tocan,
  porque ya no viven dentro del HTML sino en Supabase).
