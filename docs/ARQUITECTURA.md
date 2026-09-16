# Arquitectura del código — GolDentist Ventas

Este documento explica cómo quedó organizado el código fuente después de
empezar a reestructurarlo en **MVC (Modelo — Vista — Controlador)**, un
patrón de diseño de software donde cada pieza del código tiene una sola
responsabilidad:

- **Modelo**: los datos, las reglas de negocio, y quién habla con la base
  de datos. No sabe nada de HTML ni del navegador.
- **Vista**: funciones que reciben datos ya listos y devuelven HTML como
  texto. No saben de dónde vinieron esos datos ni qué hacer cuando el
  usuario haga clic en algo.
- **Controlador**: el "pegamento". Escucha lo que hace el usuario, le
  pide datos al Modelo, le pide HTML a la Vista, y decide qué pasa
  después (por ejemplo, volver a pintar la pantalla o mostrar un aviso).

Antes de este cambio, todo (acceso a datos, HTML y manejo de clics)
vivía mezclado dentro de las mismas funciones en un solo archivo
`app.js` de más de 2,000 líneas. Eso funciona, pero cada vez que se
necesitaba tocar una sección había que leer y entender todo junto — y
si algún día se migra la base de datos de Supabase a MySQL (ver
`GUIA_DESPLIEGUE.md`), ese cambio quedaría regado por todo el archivo en
vez de estar en un solo lugar.

## Qué se hizo (piloto: solo la sección Apartados)

Se reorganizó **una sola sección, Apartados**, como prueba de concepto,
antes de tocar el resto de la app. El resto (Ventas, Mensajes, Envíos,
Panel/Catálogo) sigue exactamente igual que antes, dentro de
`src/core.js`, a la espera de decidir si conviene aplicarles el mismo
tratamiento.

### Mapa de archivos

```
src/
  core.js                        (compartido: helpers, acceso a Supabase,
                                   router de pestañas, y TODAS las
                                   secciones que aún no se migraron a MVC)
  core-footer.js                 (cierre de la función que envuelve toda
                                   la app — ver "Cómo se arma app.js")
  models/
    layaway.model.js             (Modelo de Apartados)
  views/
    layaway.view.js               (Vista de Apartados)
  controllers/
    layaway.controller.js         (Controlador de Apartados)
build.py                          (concatena src/ y genera app.js)
assemble.py                       (usa app.js para armar index.html)
```

### Qué quedó en cada capa (Apartados)

**Modelo** (`src/models/layaway.model.js`):
- `layawayAbonado(l)`, `layawayRestante(l)`, `layawayIsLiquidado(l)` —
  las reglas de negocio (cuánto se ha abonado, cuánto falta, si ya se
  liquidó).
- `layawayStatusLabel/Color`, `rowToLayaway`, `rowToPayment` — vocabulario
  del negocio y el mapeo de una fila de Supabase a un objeto que el
  resto de la app entiende.
- `layawaysByStatusFilter`, `layawaysByDateRange` — filtrar una lista
  según el estatus o el rango de fechas.
- `exportLayawaysCsv` — arma el CSV (sigue siendo datos, no HTML).
- `LayawayRepo` — el único lugar que llama a `supabaseClient` para
  `layaways`/`layaway_payments` (crear, agregar/quitar abono, editar,
  eliminar). **Esta es la pieza clave pensando en la futura migración a
  MySQL**: el día que se cambie de Supabase a un backend propio, el
  cambio real debería quedar contenido aquí adentro, sin tocar la Vista
  ni el Controlador.

**Vista** (`src/views/layaway.view.js`):
- `layawayFormHtml`, `layawayRowHtml`, `layawayListCardHtml`,
  `renderApartadosViewHtml` — arman el HTML de la pantalla de la lista.
- `layawayModalHtml`, `layawayPaymentItemHtml` — arman el HTML de la
  ventana "Ver / abonar".
- Ninguna de estas funciones lee `STATE` ni ninguna variable global de
  filtro — reciben todo como parámetro. Eso es lo que las hace "puras":
  mismos datos de entrada, siempre el mismo HTML de salida, sin
  sorpresas.

**Controlador** (`src/controllers/layaway.controller.js`):
- `renderApartados()` — se ejecuta cuando el usuario entra a la pestaña
  Apartados. Junta los datos (le pide al Modelo la lista ya filtrada),
  arma el HTML (se lo pide a la Vista), lo pone en pantalla, y conecta
  los botones y el formulario.
- `openLayawayModal(l)` — abre la ventana "Ver / abonar": le pide el
  HTML a la Vista y conecta "Agregar abono", "Quitar" y "Guardar
  cambios", cada uno llamando al Modelo (`LayawayRepo`) y volviendo a
  abrir la ventana con los datos frescos cuando corresponde.
- También vive aquí el estado de "qué filtro está activo ahorita"
  (`LAYAWAY_FILTER`, `LAYAWAY_DATE_FROM`, `LAYAWAY_DATE_TO`) — no es un
  dato del negocio, es una decisión de qué se está mostrando en este
  momento, por eso no está en el Modelo.

### Cómo se arma `app.js` (y por qué la entrega no cambia)

La app se sigue entregando como **un solo archivo `index.html`** que se
sube por FTP/cPanel, exactamente igual que antes — nada de esto le pide
al usuario instalar herramientas ni correr un build en su hosting.

Lo que cambió es cómo se arma ese archivo en esta conversación, antes de
entregarlo:

1. `build.py` concatena, en este orden, `core.js` + el Modelo + la Vista
   + el Controlador de Apartados + `core-footer.js`, y escribe el
   resultado en `app.js`.
2. `assemble.py` llama a `build.py` automáticamente y luego arma
   `index.html` incluyendo ese `app.js` dentro de un `<script>`, igual
   que siempre.

El orden de concatenación no afecta en nada el funcionamiento: todo el
código queda dentro de la misma función que envuelve toda la app (por
eso existe `core-footer.js`, que solo trae el `})();` que la cierra), y
en JavaScript las funciones declaradas con `function nombre(){...}`
están disponibles en todo ese bloque sin importar en qué parte del
archivo final quedaron — por eso, por ejemplo, `core.js` puede llamar a
`renderApartados()` aunque esa función esté definida más adelante, en el
archivo del Controlador.

## Verificación

Después del cambio se corrieron las 10 suites de Playwright que ya
existían (`run_test.py`, `run_test_csv.py`,
`run_test_envios_apartados.py`, `test_envios_filtros.py`,
`test_estados.py`, `test_month_grouping.py`, `test_no_envio_folio.py`,
`test_ver_datos_envio.py`, `test_apartados_liquidacion.py`,
`test_apartados_filtro_fecha.py`) — las 10 pasaron sin errores de
consola, confirmando que la reorganización no cambió ningún
comportamiento visible de la app.

## Qué falta (si se decide seguir)

Esta es solo la primera sección. Si el resultado convence, el mismo
patrón se puede aplicar al resto, sección por sección, en este orden
sugerido (de más simple a más compleja): Mensajes, Envíos, Ventas
("Registrar venta"), y por último Panel/Catálogo (la más grande y con
más piezas compartidas). Cada sección seguiría el mismo proceso: extraer
su Modelo, su Vista y su Controlador a `src/`, correr las 10 suites de
Playwright para confirmar que nada cambió, y solo entonces seguir con la
siguiente.
