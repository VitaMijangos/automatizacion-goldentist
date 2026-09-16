import sys
from playwright.sync_api import sync_playwright

URL = "file:///tmp/goldentist_build/test/index.test.html"
errors = []
def on_console(msg):
    if msg.type == "error": errors.append(msg.text)
def on_pageerror(exc): errors.append("PAGEERROR: " + str(exc))

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", headless=True)
        page = browser.new_page()
        page.on("console", on_console)
        page.on("pageerror", on_pageerror)
        page.goto(URL)
        page.wait_for_timeout(300)

        # ---------- sin sesion: solo se ve la pantalla de login ----------
        assert page.locator("#login-gate").is_visible(), "el login-gate deberia verse sin sesion"
        assert not page.locator("#root").is_visible(), "el root no deberia verse sin sesion"
        assert page.locator("text=Registrar venta").count() == 0 or not page.locator("text=Registrar venta").first.is_visible()
        print("STEP 1 OK: sin sesion, solo se ve login-gate")

        # ---------- credenciales incorrectas ----------
        page.fill("#login-email", "quien@test.com")
        page.fill("#login-password", "mal")
        page.click("#login-ok")
        page.wait_for_timeout(300)
        assert "incorrectos" in page.locator("#login-err").inner_text()
        assert page.locator("#login-gate").is_visible()
        print("STEP 2 OK: credenciales incorrectas rechazadas, sigue en login-gate")

        # ---------- cuenta de equipo (no admin): ve datos, NO ve Panel/Catalogo ----------
        page.fill("#login-email", "vendedora@test.com")
        page.fill("#login-password", "vendedora123")
        page.click("#login-ok")
        page.wait_for_timeout(400)
        assert not page.locator("#login-gate").is_visible(), "tras login deberia ocultarse login-gate"
        assert page.locator("#root").is_visible()
        assert page.locator("text=Registrar venta").first.is_visible()
        assert page.locator("td:has-text('Kit NSK PRO')").first.is_visible(), "debe ver los datos (sales)"
        assert page.locator("#tab-panel-btn").is_hidden(), "cuenta de equipo no deberia ver Panel"
        assert page.locator("#tab-catalogo-btn").is_hidden(), "cuenta de equipo no deberia ver Catalogo"
        assert "vendedora@test.com" in page.locator("#session-email").inner_text()
        print("STEP 3 OK: cuenta de equipo entra, ve datos, no ve Panel/Catalogo")

        # ---------- cerrar sesion vuelve al login-gate ----------
        page.click("#logout-btn")
        page.wait_for_timeout(300)
        assert page.locator("#login-gate").is_visible()
        assert not page.locator("#root").is_visible()
        print("STEP 4 OK: cerrar sesion regresa al login-gate")

        # ---------- cuenta admin: ve Panel y Catalogo ----------
        page.fill("#login-email", "admin@test.com")
        page.fill("#login-password", "secret123")
        page.click("#login-ok")
        page.wait_for_timeout(400)
        assert page.locator("#tab-panel-btn").is_visible(), "la cuenta admin deberia ver Panel"
        assert page.locator("#tab-catalogo-btn").is_visible(), "la cuenta admin deberia ver Catalogo"
        assert "Admin" in page.locator("#session-email").inner_text()
        print("STEP 5 OK: cuenta admin ve Panel y Catalogo")

        # ---------- admin SI puede escribir en el catalogo ----------
        page.click("button[data-tab=catalogo]")
        page.wait_for_timeout(200)
        page.fill("#new-channel", "WHATSAPP_TEST")
        page.click("#add-channel")
        page.wait_for_timeout(300)
        assert page.locator("text=WHATSAPP_TEST").first.is_visible(), "el admin deberia poder agregar un canal"
        print("STEP 6 OK: la cuenta admin puede escribir en el catalogo")

        browser.close()
    if errors:
        print("\n=== CONSOLE / PAGE ERRORS ===")
        for e in errors: print(" -", e)
        sys.exit(1)
    else:
        print("\nALL LOGIN SMOKE STEPS PASSED, NO CONSOLE ERRORS")

if __name__ == "__main__":
    main()
