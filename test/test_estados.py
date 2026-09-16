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

        # Toda la app ahora pide login (ver test_login_obligatorio.py para la
        # cobertura dedicada de esa pantalla) — entramos con una cuenta del
        # equipo (no admin), ya que este archivo no usa Panel/Catálogo.
        page.fill("#login-email", "vendedora@test.com")
        page.fill("#login-password", "vendedora123")
        page.click("#login-ok")
        page.wait_for_timeout(400)

        page.click("button[data-tab=envios]")
        page.wait_for_timeout(200)

        # el campo Estado ahora es un <select>, no un <input> de texto
        tag = page.eval_on_selector("#s-state", "el => el.tagName")
        assert tag == "SELECT", "expected #s-state to be a SELECT, got " + tag
        print("STEP 1 OK: #s-state is a <select>")

        options = page.eval_on_selector_all("#s-state option", "els => els.map(e => e.textContent)")
        assert len(options) == 33, "expected 33 options (blank + 32 estados), got " + str(len(options))  # 32 + placeholder
        assert "Ciudad de México" in options and "Jalisco" in options and "Zacatecas" in options
        print("STEP 2 OK: 32 estados + placeholder present in dropdown, count =", len(options))

        # abrir edición del envío semilla (Estado = Ciudad de México) y verificar
        # que el select viene con el valor correcto ya seleccionado
        page.locator("[data-edit-ship]").first.click()
        page.wait_for_timeout(200)
        selected = page.eval_on_selector("#es-state", "el => el.value")
        assert selected == "Ciudad de México", "expected pre-selected state, got " + repr(selected)
        print("STEP 3 OK: edit modal pre-selects seed shipment's estado =", selected)
        page.click(".modal-backdrop >> text=Cancelar") if page.locator(".modal-backdrop >> text=Cancelar").count() else page.keyboard.press("Escape")

        browser.close()
    if errors:
        print("\n=== CONSOLE / PAGE ERRORS ===")
        for e in errors: print(" -", e)
        sys.exit(1)
    else:
        print("\nALL ESTADOS STEPS PASSED, NO CONSOLE ERRORS")

if __name__ == "__main__":
    main()
