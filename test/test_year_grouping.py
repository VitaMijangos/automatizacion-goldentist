import sys
from playwright.sync_api import sync_playwright

URL = "file:///tmp/goldentist_build/test/index.test.html"

errors = []
def on_console(msg):
    if msg.type == "error":
        errors.append(msg.text)
def on_pageerror(exc):
    errors.append("PAGEERROR: " + str(exc))

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

        # ---------- Ventas: agrupado por año y por mes ----------
        registrar_view = page.locator("#view-registrar")
        assert registrar_view.locator("h2:has-text('2026')").is_visible(), "el año 2026 (unico, con la venta semilla) deberia estar abierto por default"
        assert registrar_view.locator("h3:has-text('Agosto')").is_visible(), "el mes de la venta semilla deberia estar abierto por default"

        # Registrar una venta de otro año (2025) para forzar un segundo grupo de año
        page.fill("#f-date", "2025-03-10")
        page.select_option("#f-channel", "FACEBOOK")
        page.fill("#f-article", "Kit NSK PRO")
        page.fill("#f-qty", "1")
        page.select_option("#f-seller-select", "Diana Flores")
        page.click("#sale-form button[type=submit]")
        page.wait_for_timeout(300)

        assert registrar_view.locator("h2:has-text('2025')").is_visible(), "el año recien creado (2025) deberia auto-abrirse"
        assert registrar_view.locator("h2:has-text('2026')").is_visible(), "el año 2026 deberia seguir abierto, sin verse afectado"
        assert registrar_view.locator("h3:has-text('Marzo')").is_visible(), "el mes de la venta recien creada deberia auto-abrirse"
        print("STEP 1 OK: Ventas agrupa por año y por mes, con el año/mes nuevo auto-expandido al registrar")

        # Colapsar el año 2025 debe ocultar su venta sin afectar 2026
        y2025_toggle = registrar_view.locator("[data-toggle-sale-year='2025']")
        y2025_toggle.click()
        page.wait_for_timeout(200)
        assert registrar_view.locator("h3:has-text('Marzo')").count() == 0, "al colapsar el año 2025 su mes deberia dejar de verse"
        assert registrar_view.locator("td:has-text('Kit NSK PRO')").first.is_visible(), "2026 no deberia verse afectado al colapsar 2025"
        print("STEP 2 OK: colapsar un año oculta sus meses sin afectar los demás años")

        # Volver a expandir el año 2025
        y2025_toggle.click()
        page.wait_for_timeout(200)
        assert registrar_view.locator("h3:has-text('Marzo')").is_visible(), "el mes deberia reaparecer al reexpandir el año"
        print("STEP 3 OK: reexpandir el año vuelve a mostrar sus meses")

        # ---------- Mensajes: agrupado por año y por mes ----------
        page.click("button[data-tab=mensajes]")
        page.wait_for_timeout(200)
        mensajes_view = page.locator("#view-mensajes")
        assert mensajes_view.locator("h2:has-text('2026')").is_visible()
        assert mensajes_view.locator("h3:has-text('Agosto')").is_visible()

        page.fill("#m-date", "2024-11-05")
        page.select_option("#m-platform", "INSTAGRAM")
        page.click("#msg-form button[type=submit]")
        page.wait_for_timeout(300)

        assert mensajes_view.locator("h2:has-text('2024')").is_visible(), "el año recien creado (2024) deberia auto-abrirse"
        assert mensajes_view.locator("h3:has-text('Noviembre')").is_visible()
        print("STEP 4 OK: Mensajes agrupa por año y por mes, con el año/mes nuevo auto-expandido al registrar")

        y2024_toggle = mensajes_view.locator("[data-toggle-msg-year='2024']")
        y2024_toggle.click()
        page.wait_for_timeout(200)
        assert mensajes_view.locator("h3:has-text('Noviembre')").count() == 0
        assert mensajes_view.locator("h3:has-text('Agosto')").is_visible(), "2026 no deberia verse afectado"
        print("STEP 5 OK: colapsar un año en Mensajes no afecta los demás años")

        # ---------- Envíos: el nivel de año nuevo agrupa los meses existentes ----------
        page.click("button[data-tab=envios]")
        page.wait_for_timeout(200)
        envios_view = page.locator("#view-envios")
        assert envios_view.locator("h2:has-text('2026')").is_visible()
        assert envios_view.locator("h3:has-text('Agosto')").is_visible()

        # Registrar un envío de otro año (2027) para forzar un segundo grupo de año
        page.fill("#s-date", "2027-01-20")
        page.fill("#s-customerName", "Cliente 2027")
        page.fill("#s-phone", "5599998888")
        page.fill("#s-product", "Kit 2027")
        page.fill("#s-qty", "1")
        page.click("#ship-form button[type=submit]")
        page.wait_for_timeout(300)

        assert envios_view.locator("h2:has-text('2027')").is_visible(), "el año recien creado (2027) deberia auto-abrirse"
        assert envios_view.locator("td:has-text('Cliente 2027')").first.is_visible()
        print("STEP 6 OK: Envíos también agrupa por año (además del mes que ya tenía) y auto-expande el año nuevo")

        # Colapsar el año 2027 recien creado debe ocultar su envío, sin afectar 2026
        y2027_toggle = envios_view.locator("[data-toggle-ship-year='2027']")
        y2027_toggle.click()
        page.wait_for_timeout(200)
        assert envios_view.locator("td:has-text('Cliente 2027')").count() == 0
        assert envios_view.locator("td:has-text('Cliente Prueba')").first.is_visible(), "2026 no deberia verse afectado"
        print("STEP 7 OK: colapsar un año en Envíos oculta sus meses sin afectar los demás años")

        # ---------- Apartados: agrupado por año y por mes ----------
        page.click("button[data-tab=apartados]")
        page.wait_for_timeout(200)
        page.click("button[data-layaway-filter=todos]")
        page.wait_for_timeout(200)
        apartados_view = page.locator("#view-apartados")
        assert apartados_view.locator("h2:has-text('2026')").is_visible()
        assert apartados_view.locator("h3:has-text('Agosto')").is_visible()

        # Registrar un apartado de otro año (2024) para forzar un segundo grupo de año
        page.fill("#l-customerName", "Cliente Apartado 2024")
        page.fill("#l-product", "Kit 2024")
        page.fill("#l-qty", "1")
        page.fill("#l-date", "2024-05-12")
        page.fill("#l-total", "5000")
        page.click("#layaway-form button[type=submit]")
        page.wait_for_timeout(300)

        assert apartados_view.locator("h2:has-text('2024')").is_visible(), "el año recien creado (2024) deberia auto-abrirse"
        assert apartados_view.locator("h2:has-text('2026')").is_visible(), "el año 2026 deberia seguir abierto, sin verse afectado"
        assert apartados_view.locator("h3:has-text('Mayo')").is_visible(), "el mes del apartado recien creado deberia auto-abrirse"
        assert apartados_view.locator("td:has-text('Cliente Apartado 2024')").first.is_visible()
        print("STEP 8 OK: Apartados agrupa por año y por mes, con el año/mes nuevo auto-expandido al registrar")

        y2024_toggle = apartados_view.locator("[data-toggle-layaway-year='2024']")
        y2024_toggle.click()
        page.wait_for_timeout(200)
        assert apartados_view.locator("td:has-text('Cliente Apartado 2024')").count() == 0
        assert apartados_view.locator("h3:has-text('Agosto')").is_visible(), "2026 no deberia verse afectado"
        print("STEP 9 OK: colapsar un año en Apartados oculta sus meses sin afectar los demás años")

        y2024_toggle.click()
        page.wait_for_timeout(200)
        assert apartados_view.locator("td:has-text('Cliente Apartado 2024')").first.is_visible(), "el apartado deberia reaparecer al reexpandir el año"
        print("STEP 10 OK: reexpandir el año en Apartados vuelve a mostrar sus meses")

        browser.close()

    if errors:
        print("\n=== CONSOLE / PAGE ERRORS ===")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    else:
        print("\nALL YEAR-GROUPING STEPS PASSED, NO CONSOLE ERRORS")

if __name__ == "__main__":
    main()
