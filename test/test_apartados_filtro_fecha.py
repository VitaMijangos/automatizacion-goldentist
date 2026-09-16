import sys
from playwright.sync_api import sync_playwright

URL = "file:///tmp/goldentist_build/test/index.test.html"
errors = []
def on_console(msg):
    if msg.type == "error": errors.append(msg.text)
def on_pageerror(exc): errors.append("PAGEERROR: " + str(exc))


def register_layaway(page, date, customer, total=1000, deposit=0):
    page.fill("#l-customerName", customer)
    page.fill("#l-phone", "5566667777")
    page.fill("#l-product", "Producto de prueba")
    page.fill("#l-qty", "1")
    page.fill("#l-date", date)
    page.fill("#l-total", str(total))
    page.fill("#l-deposit", str(deposit))
    page.click("#layaway-form button[type=submit]")
    page.wait_for_timeout(400)


def apply_date_filter(page, date_from="", date_to=""):
    page.fill("#layaway-date-from", date_from)
    page.fill("#layaway-date-to", date_to)
    page.click("#layaway-date-filter-apply")
    page.wait_for_timeout(200)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", headless=True)
        page = browser.new_page()
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

        page.click("button[data-tab=apartados]")
        page.wait_for_timeout(200)
        page.click("button[data-layaway-filter=todos]")
        page.wait_for_timeout(200)

        # cuatro apartados nuevos: dos dentro de septiembre 2026, uno el
        # primero del mes y otro en octubre (fuera de rango)
        register_layaway(page, "2026-09-01", "Apartado Inicio Mes")
        register_layaway(page, "2026-09-15", "Apartado Filtro Fecha")
        register_layaway(page, "2026-09-16", "Apartado Otro Dia")
        register_layaway(page, "2026-10-05", "Apartado Octubre")
        print("STEP 1 OK: cuatro apartados de prueba registrados")

        assert page.locator("#layaway-date-from").count() == 1 and page.locator("#layaway-date-to").count() == 1, \
            "faltan los campos 'Desde'/'Hasta' del filtro de fecha en Apartados"

        # ---------- un solo día ----------
        apply_date_filter(page, "2026-09-15", "2026-09-15")
        assert page.locator("td:has-text('Apartado Filtro Fecha')").first.is_visible()
        assert page.locator("td:has-text('Apartado Inicio Mes')").count() == 0
        assert page.locator("td:has-text('Apartado Otro Dia')").count() == 0
        print("STEP 2 OK: Desde=Hasta filtra un solo día")

        # ---------- rango (mes completo) ----------
        apply_date_filter(page, "2026-09-01", "2026-09-30")
        assert page.locator("td:has-text('Apartado Inicio Mes')").first.is_visible()
        assert page.locator("td:has-text('Apartado Filtro Fecha')").first.is_visible()
        assert page.locator("td:has-text('Apartado Otro Dia')").first.is_visible()
        assert page.locator("td:has-text('Apartado Octubre')").count() == 0, \
            "un apartado de octubre no debería verse al filtrar solo septiembre"
        print("STEP 3 OK: un rango Desde/Hasta muestra el mes completo")

        # ---------- rango abierto (solo Desde) ----------
        apply_date_filter(page, "2026-09-16", "")
        assert page.locator("td:has-text('Apartado Otro Dia')").first.is_visible()
        assert page.locator("td:has-text('Apartado Octubre')").first.is_visible()
        assert page.locator("td:has-text('Apartado Filtro Fecha')").count() == 0
        print("STEP 4 OK: solo 'Desde' muestra ese día en adelante")

        # ---------- rango abierto (solo Hasta) ----------
        apply_date_filter(page, "", "2026-09-01")
        assert page.locator("td:has-text('Apartado Inicio Mes')").first.is_visible()
        assert page.locator("td:has-text('Apartado Filtro Fecha')").count() == 0
        print("STEP 5 OK: solo 'Hasta' muestra hasta ese día")

        # ---------- rango inválido ----------
        apply_date_filter(page, "2026-09-20", "2026-09-01")
        toast_invalid = page.locator("#toast").inner_text()
        assert "posterior" in toast_invalid.lower() or "desde" in toast_invalid.lower(), "toast inesperado: " + toast_invalid
        assert page.locator("td:has-text('Apartado Inicio Mes')").first.is_visible()
        print("STEP 6 OK: 'Desde' posterior a 'Hasta' se rechaza y no cambia el filtro")

        # ---------- fecha sin apartados ----------
        apply_date_filter(page, "2020-01-01", "2020-01-31")
        assert "No hay apartados en ese rango de fechas" in page.locator("#view-apartados").inner_text()
        print("STEP 7 OK: un rango sin apartados muestra el mensaje correcto")

        # ---------- quitar filtro ----------
        assert page.locator("#layaway-date-filter-clear").count() == 1
        page.click("#layaway-date-filter-clear")
        page.wait_for_timeout(200)
        assert page.locator("#layaway-date-filter-clear").count() == 0
        assert page.locator("td:has-text('Apartado Octubre')").first.is_visible(), \
            "al quitar el filtro deberían verse todos los apartados de nuevo"
        print("STEP 8 OK: 'Quitar filtro' regresa a ver todos los apartados")

        # ---------- se combina con Abiertos/Todos, y el CSV sigue respetando los filtros ----------
        page.click("button[data-layaway-filter=abiertos]")
        apply_date_filter(page, "2026-09-01", "2026-09-30")
        page.wait_for_timeout(200)
        with page.expect_download() as dl_info:
            page.click("#export-apartados-csv")
        content = open(dl_info.value.path(), "rb").read().decode("utf-8-sig")
        assert "Apartado Inicio Mes" in content
        assert "Apartado Octubre" not in content, "el CSV de Apartados debería seguir respetando los filtros activos"
        print("STEP 9 OK: el filtro de fecha se combina con Abiertos/Todos, y el CSV respeta ambos filtros")

        browser.close()
    if errors:
        print("\n=== CONSOLE / PAGE ERRORS ===")
        for e in errors: print(" -", e)
        sys.exit(1)
    else:
        print("\nALL APARTADOS-FILTRO-FECHA STEPS PASSED, NO CONSOLE ERRORS")

if __name__ == "__main__":
    main()
