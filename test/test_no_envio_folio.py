import sys
from playwright.sync_api import sync_playwright

URL = "file:///tmp/goldentist_build/test/index.test.html"
errors = []
def on_console(msg):
    if msg.type == "error": errors.append(msg.text)
def on_pageerror(exc): errors.append("PAGEERROR: " + str(exc))

def register(page, date, name):
    page.fill("#s-date", date)
    page.fill("#s-customerName", name)
    page.fill("#s-product", "Producto de prueba")
    page.click("#ship-form button[type=submit]")
    page.wait_for_timeout(350)

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
        page.click("button[data-tab=envios]")
        page.wait_for_timeout(200)

        # semilla ya es #1 en 2026. Registramos 2 más en 2026 (deben ser #2 y #3)
        # y uno en 2027 (debe reiniciar en #1).
        register(page, "2026-09-03", "Clienta Dos")
        register(page, "2026-09-03", "Clienta Tres")
        register(page, "2027-01-05", "Clienta Cuatro 2027")
        page.click('[data-ship-filter="todos"]')
        page.wait_for_timeout(200)

        def folio_de(nombre):
            row = page.locator("tr", has_text=nombre)
            return row.locator("td").first.inner_text()

        f2 = folio_de("Clienta Dos")
        f3 = folio_de("Clienta Tres")
        f4 = folio_de("Clienta Cuatro 2027")
        assert f2 == "#2", "esperaba #2 para Clienta Dos, obtuve " + f2
        assert f3 == "#3", "esperaba #3 para Clienta Tres, obtuve " + f3
        assert f4 == "#1", "esperaba #1 (reinicio de año) para Clienta Cuatro 2027, obtuve " + f4
        print("STEP 1 OK: folios consecutivos en 2026 (#2, #3) y reinicio correcto en 2027 (#1)")

        browser.close()
    if errors:
        print("\n=== CONSOLE / PAGE ERRORS ===")
        for e in errors: print(" -", e)
        sys.exit(1)
    else:
        print("\nALL NO-ENVIO-FOLIO STEPS PASSED, NO CONSOLE ERRORS")

if __name__ == "__main__":
    main()
