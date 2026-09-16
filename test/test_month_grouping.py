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

        page.click("button[data-tab=envios]")
        page.wait_for_timeout(200)

        # Registrar un envío en un mes anterior (2026-06) para forzar 2 grupos
        page.fill("#s-date", "2026-06-15")
        page.fill("#s-customerName", "Clienta Junio")
        page.fill("#s-phone", "5511112222")
        page.fill("#s-product", "Kit Junio")
        page.fill("#s-qty", "1")
        page.click("#ship-form button[type=submit]")
        page.wait_for_timeout(400)
        print("registered june shipment")

        # debe haber 2 encabezados de mes ahora: Agosto 2026 y Junio 2026
        headers = page.locator("[data-toggle-month]")
        count = headers.count()
        assert count == 2, "expected 2 month groups, got " + str(count)
        print("STEP A OK: 2 month groups exist")

        # El grupo de agosto (mas reciente) debe estar abierto por default,
        # y el de junio (mas viejo, recien creado) debe seguir cerrado --
        # excepto que el submit auto-expande el mes del envio recien creado,
        # asi que junio tambien deberia estar abierto ahora.
        assert page.locator("td:has-text('Clienta Junio')").first.is_visible(), "june row should be visible (auto-expanded on create)"
        print("STEP B OK: newly created june shipment's month auto-expanded")

        # Colapsar el grupo de junio y verificar que la fila desaparece
        june_toggle = page.locator("[data-toggle-month='2026-06']")
        june_toggle.click()
        page.wait_for_timeout(200)
        assert page.locator("td:has-text('Clienta Junio')").count() == 0, "june row should be hidden after collapse"
        print("STEP C OK: collapsing june group hides its rows")

        # Volver a expandir y verificar que reaparece
        june_toggle.click()
        page.wait_for_timeout(200)
        assert page.locator("td:has-text('Clienta Junio')").first.is_visible(), "june row should reappear after expand"
        print("STEP D OK: expanding june group shows its rows again")

        # El grupo de agosto (con el envio semilla) debe seguir visible sin tocarlo
        assert page.locator("td:has-text('Cliente Prueba')").first.is_visible(), "august seed row should remain visible"
        print("STEP E OK: august group unaffected by june toggle")

        browser.close()

    if errors:
        print("\n=== CONSOLE / PAGE ERRORS ===")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    else:
        print("\nALL MONTH-GROUPING STEPS PASSED, NO CONSOLE ERRORS")

if __name__ == "__main__":
    main()
