import sys
from playwright.sync_api import sync_playwright

URL = "file:///tmp/goldentist_build/test/index.test.html"
errors = []
def on_console(msg):
    if msg.type == "error": errors.append(msg.text)
def on_pageerror(exc): errors.append("PAGEERROR: " + str(exc))

def register_shipment(page, date, customer, product):
    page.fill("#s-date", date)
    page.fill("#s-customerName", customer)
    page.fill("#s-phone", "5511112222")
    page.fill("#s-product", product)
    page.fill("#s-qty", "1")
    page.fill("#s-street", "Calle de prueba 1")
    page.fill("#s-city", "CDMX")
    page.click("#ship-form button[type=submit]")
    page.wait_for_timeout(400)

def apply_date_filter(page, date_from="", date_to=""):
    page.fill("#ship-date-from", date_from)
    page.fill("#ship-date-to", date_to)
    page.click("#ship-date-filter-apply")
    page.wait_for_timeout(200)

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", headless=True)
        context = browser.new_context()
        try:
            context.grant_permissions(["clipboard-read", "clipboard-write"])
        except Exception:
            pass
        page = context.new_page()
        page.on("console", on_console)
        page.on("pageerror", on_pageerror)
        page.goto(URL)
        page.wait_for_timeout(300)

        # Toda la app ahora pide login (ver test_login_obligatorio.py para la
        # cobertura dedicada de esa pantalla) — entramos con una cuenta del
        # equipo (no admin), ya que este archivo no usa Panel/Catálogo.
        page.fill("#login-email", "vendedora@test.com")
        page.fill("#login-password", "vendedora123")
        page.click("#login-ok")
        page.wait_for_timeout(400)

        page.click("button[data-tab=envios]")
        page.wait_for_timeout(200)

        # cuatro envíos nuevos: dos dentro de septiembre 2026, uno el primero
        # del mes y otro en octubre (fuera de rango) para probar límites
        page.click("button[data-ship-filter=todos]")
        page.wait_for_timeout(200)
        register_shipment(page, "2026-09-01", "Cliente Inicio Mes", "Producto Inicio")
        register_shipment(page, "2026-09-15", "Cliente Filtro Fecha", "Producto Fecha")
        register_shipment(page, "2026-09-16", "Cliente Enviado Prueba", "Producto Enviado")
        register_shipment(page, "2026-10-05", "Cliente Octubre", "Producto Octubre")

        row_enviado = page.locator("tr", has_text="Cliente Enviado Prueba").first
        row_enviado.locator("[data-toggle-ship]").click()
        page.wait_for_timeout(400)
        print("STEP 1 OK: cuatro envíos de prueba registrados (uno marcado como enviado)")

        # ---------- filtro de estatus: Pendientes / Enviados / Todos ----------
        assert page.locator("button[data-ship-filter=enviados]").count() == 1, "falta el botón 'Enviados'"
        page.click("button[data-ship-filter=pendientes]")
        page.wait_for_timeout(200)
        assert page.locator("td:has-text('Cliente Filtro Fecha')").first.is_visible()
        assert page.locator("td:has-text('Cliente Prueba')").first.is_visible(), "el envío semilla (pendiente) debería verse"
        assert page.locator("td:has-text('Cliente Enviado Prueba')").count() == 0, "el envío marcado como enviado no debería verse en Pendientes"
        print("STEP 2 OK: 'Pendientes' excluye el envío marcado como enviado")

        page.click("button[data-ship-filter=enviados]")
        page.wait_for_timeout(200)
        assert page.locator("td:has-text('Cliente Enviado Prueba')").first.is_visible(), "el envío enviado debería verse en 'Enviados'"
        assert page.locator("td:has-text('Cliente Filtro Fecha')").count() == 0, "un envío pendiente no debería verse en 'Enviados'"
        print("STEP 3 OK: 'Enviados' muestra solo los marcados como enviados")

        page.click("button[data-ship-filter=todos]")
        page.wait_for_timeout(200)
        assert page.locator("td:has-text('Cliente Filtro Fecha')").first.is_visible()
        assert page.locator("td:has-text('Cliente Enviado Prueba')").first.is_visible()
        print("STEP 4 OK: 'Todos' muestra pendientes y enviados juntos, y sigue disponible 'ver todos'")

        # ---------- filtro de fecha: un solo día ----------
        assert page.locator("#ship-date-from").count() == 1 and page.locator("#ship-date-to").count() == 1, \
            "faltan los campos 'Desde'/'Hasta' del filtro de fecha"
        apply_date_filter(page, "2026-09-15", "2026-09-15")
        assert page.locator("td:has-text('Cliente Filtro Fecha')").first.is_visible(), "no aparece el envío del día filtrado"
        assert page.locator("td:has-text('Cliente Inicio Mes')").count() == 0
        assert page.locator("td:has-text('Cliente Enviado Prueba')").count() == 0
        assert page.locator("#view-envios h3:has-text('Septiembre')").count() == 0, "con filtro de fecha activo no debería verse el encabezado de mes (vista plana)"
        print("STEP 5 OK: Desde=Hasta filtra un solo día, en tabla plana sin agrupar por mes")

        # ---------- filtro de fecha: rango (el mes completo) ----------
        apply_date_filter(page, "2026-09-01", "2026-09-30")
        assert page.locator("td:has-text('Cliente Inicio Mes')").first.is_visible()
        assert page.locator("td:has-text('Cliente Filtro Fecha')").first.is_visible()
        assert page.locator("td:has-text('Cliente Enviado Prueba')").first.is_visible()
        assert page.locator("td:has-text('Cliente Octubre')").count() == 0, "un envío de octubre no debería verse al filtrar solo septiembre"
        assert page.locator("td:has-text('Cliente Prueba')").count() == 0, "el envío semilla de agosto no debería verse al filtrar septiembre"
        print("STEP 6 OK: un rango Desde/Hasta muestra el mes completo (los 3 envíos de septiembre, ninguno fuera de rango)")

        # ---------- filtro de fecha: rango abierto (solo Desde) ----------
        apply_date_filter(page, "2026-09-16", "")
        assert page.locator("td:has-text('Cliente Enviado Prueba')").first.is_visible()
        assert page.locator("td:has-text('Cliente Octubre')").first.is_visible()
        assert page.locator("td:has-text('Cliente Filtro Fecha')").count() == 0, "un envío anterior al 'Desde' no debería verse"
        print("STEP 7 OK: solo 'Desde' muestra ese día en adelante, sin límite superior")

        # ---------- filtro de fecha: rango abierto (solo Hasta) ----------
        apply_date_filter(page, "", "2026-09-01")
        assert page.locator("td:has-text('Cliente Prueba')").first.is_visible(), "el envío semilla de agosto debería verse (es anterior al 'Hasta')"
        assert page.locator("td:has-text('Cliente Inicio Mes')").first.is_visible()
        assert page.locator("td:has-text('Cliente Filtro Fecha')").count() == 0, "un envío posterior al 'Hasta' no debería verse"
        print("STEP 8 OK: solo 'Hasta' muestra hasta ese día, sin límite inferior")

        # ---------- rango inválido: Desde posterior a Hasta ----------
        apply_date_filter(page, "2026-09-20", "2026-09-01")
        toast_invalid = page.locator("#toast").inner_text()
        assert "posterior" in toast_invalid.lower() or "desde" in toast_invalid.lower(), "toast inesperado: " + toast_invalid
        # el filtro no debió cambiar: se sigue viendo lo del paso anterior (solo Hasta=2026-09-01)
        assert page.locator("td:has-text('Cliente Prueba')").first.is_visible()
        print("STEP 9 OK: 'Desde' posterior a 'Hasta' se rechaza con un aviso y no cambia el filtro")

        # fecha sin envíos: mensaje de vacío
        apply_date_filter(page, "2020-01-01", "2020-01-31")
        assert "No hay envíos en ese rango de fechas" in page.locator("#view-envios").inner_text()
        print("STEP 10 OK: un rango sin envíos muestra el mensaje correcto")

        # quitar filtro de fecha regresa a la vista agrupada por mes (con
        # esto se confirma que sigue disponible ver todos los envíos)
        assert page.locator("#ship-date-filter-clear").count() == 1
        page.click("#ship-date-filter-clear")
        page.wait_for_timeout(200)
        envios_view = page.locator("#view-envios")
        assert envios_view.locator("h2:has-text('2026')").first.is_visible(), "al quitar el filtro debería regresar la vista agrupada por año/mes"
        assert envios_view.locator("h3:has-text('Septiembre')").is_visible(), "al quitar el filtro debería regresar la vista agrupada por año/mes"
        assert envios_view.locator("h3:has-text('Octubre')").is_visible()
        assert envios_view.locator("h3:has-text('Agosto')").is_visible()
        print("STEP 11 OK: 'Quitar filtro' regresa a ver todos los envíos, agrupados por mes")

        # ---------- exportar CSV: siempre completo, sin importar filtros ----------
        page.click("button[data-ship-filter=pendientes]")
        apply_date_filter(page, "2026-09-15", "2026-09-15")
        page.wait_for_timeout(200)
        with page.expect_download() as dl_info:
            page.click("#export-ventas-envios-csv")
        content = open(dl_info.value.path(), "rb").read().decode("utf-8-sig")
        for nombre in ["Cliente Prueba", "Cliente Inicio Mes", "Cliente Filtro Fecha", "Cliente Enviado Prueba", "Cliente Octubre"]:
            assert nombre in content, "'%s' debería estar en el CSV aunque no esté en la vista filtrada" % nombre
        print("STEP 12 OK: 'Exportar CSV' descarga todos los envíos aunque la vista esté filtrada por estatus y fecha")

        browser.close()
    if errors:
        print("\n=== CONSOLE / PAGE ERRORS ===")
        for e in errors: print(" -", e)
        sys.exit(1)
    else:
        print("\nALL ENVIOS-FILTROS STEPS PASSED, NO CONSOLE ERRORS")

if __name__ == "__main__":
    main()
