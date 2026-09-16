# Automatización GolDentist

Ayudamos a una empresa de venta de insumos y equipo dental a automatizar sus procesos de ventas, mensajería y logística, y a construir dashboards interactivos para mejorar la toma de decisiones — reemplazando hojas de cálculo dispersas y un formulario estático por una aplicación web en tiempo real, con panel de análisis, filtros por fecha y validación automática de datos.

## Qué resuelve

El equipo de ventas registraba ventas, mensajes de prospección, envíos y apartados en distintas hojas de Google Sheets, sin manera de cruzar la información ni ver tendencias sin armar un reporte a mano. Esta app centraliza los cuatro flujos en una sola base de datos y agrega un **Panel** con gráficas, comparativos por periodo y un rango de fechas personalizado, para que la dirección pueda ver el estado del negocio (ventas, embudo de mensajes atendidos, envíos pendientes, apartados) sin depender de que alguien arme el reporte.

## Funcionalidad principal

- **Ventas**: registro rápido por canal (Facebook, Watti, página web...), artículo y vendedora, agrupado por año/mes.
- **Mensajes**: embudo diario de mensajes atendidos por plataforma, con 9 campos (No respondidos, Valoración iniciada, Propuesta, Pago pendiente, Contactar otra fecha, Leads descartados, Venta cerrada, Fuera del catálogo) y **validación automática**: la app bloquea el guardado si la suma de esas categorías no cuadra exactamente con el total de mensajes atendidos, para que el dato nunca quede inconsistente.
- **Envíos**: folio automático, estado (pendiente/enviado), paquetería y número de guía, con filtros por estado y por rango de fechas.
- **Apartados**: control de anticipos y abonos, con saldo restante calculado en vivo y filtro de abiertos/todos.
- **Panel**: comparativo de Ventas y Mensajes por Hoy / Este mes / Últimos 30 días / Últimos 7 días o un **rango de fechas personalizado** (Desde/Hasta), para aislar un periodo exacto sin contaminación de días fuera de rango.
- **Exportar a CSV** en cada sección, para análisis externo o respaldo.
- **Login obligatorio** para todo el equipo (Supabase Auth), con un rol de administrador separado para gestionar catálogos (canales, vendedoras, artículos).

## Stack técnico

- **Frontend**: JavaScript vanilla (sin framework), una sola página (`index.html`) con CSS y JS integrados — carga rápido y no depende de un proceso de build para desplegarse.
- **Backend**: [Supabase](https://supabase.com) (Postgres + autenticación + API en tiempo real), con seguridad a nivel de fila (Row Level Security) definida en `sql/`.
- **Arquitectura del código fuente**: los módulos más nuevos (por ejemplo Apartados) siguen un patrón MVC (`src/models`, `src/views`, `src/controllers`); el resto vive en `src/core.js`. Un script (`build.py` + `assemble.py`) concatena las piezas y genera el `index.html` final listo para publicarse en cualquier hosting estático.
- **Pruebas**: suite de pruebas end-to-end con Playwright (`test/`) contra un cliente de Supabase simulado (`test/stub_supabase.js`), que cubre login, filtros de fecha, validación de mensajes, exportación CSV y más.

## Estructura del repositorio

```
index.html              → build de producción, listo para publicar
config.example.js       → plantilla de configuración (copiar a config.js con tus credenciales)
src/                     → código fuente (JS)
sql/                     → esquema de base de datos + datos de ejemplo (ficticios)
docs/                    → guía de despliegue y notas de arquitectura
test/                    → pruebas automatizadas (Playwright) con datos simulados
demo/                    → versión de solo lectura de la app, con datos de ejemplo, sin necesidad de crear un proyecto de Supabase
```

## Cómo probarlo localmente (sin base de datos real)

Abre `demo/index.html` directamente en el navegador — usa un cliente de Supabase simulado con datos de ejemplo, así que no necesitas crear ningún proyecto ni credenciales.

## Cómo desplegarlo con tu propia base de datos

Ver la guía paso a paso en [`docs/GUIA_DESPLIEGUE.md`](docs/GUIA_DESPLIEGUE.md): crear un proyecto en Supabase, correr los scripts SQL de `sql/`, configurar `config.js` y publicar `index.html` en cualquier hosting estático (cPanel, Netlify, GitHub Pages, etc.).

## Privacidad

Este repositorio no incluye datos reales de clientes ni credenciales del proyecto en producción. Los archivos en `sql/*_ejemplo*.sql` y `demo/` usan nombres y cifras ficticias solo para fines de demostración.
