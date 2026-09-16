import sys
from playwright.sync_api import sync_playwright

URL = "file:///tmp/goldentist_build/test/index.test.html"

errors = []
console_msgs = []


def on_console(msg):
    console_msgs.append((msg.type, msg.text))
    if msg.type == "error":
        errors.append(msg.text)


def on_pageerror(exc):
    errors.append("PAGEERROR: " + str(exc))


def login_admin(page):
    page.fill("#login-email", "admin@test.com")
    page.fill("#login-password", "secret123")
    page.click("#login-ok")
    page.wait_for_timeout(400)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", headless=True)
        page = browser.new_page()
        page.on("console", on_console)
        page.on("pageerror", on_pageerror)

        page.goto(URL)
        page.wait_for_timeout(300)

        # Toda la app ahora pide login (ver test_login_obligatorio.py para la
        # cobertura dedicada de esa pantalla); aquí entramos ya como admin
        # porque este archivo también prueba Panel/Catálogo más abajo.
        login_admin(page)

        assert page.locator("text=Registrar venta").first.is_visible(), "tab registrar not visible"
        assert page.locator("td:has-text('Kit NSK PRO')").first.is_visible(), "seed sale not rendered"
        print("STEP 1 OK: initial render + seed data visible")

        # --- Register a new sale ---
        page.fill("#f-date", "2026-08-31")
        page.select_option("#f-channel", "WATTI")
        page.fill("#f-article", "Kit NSK PRO")
        page.fill("#f-qty", "3")
        page.select_option("#f-seller-select", "Diana Flores")
        page.click("#sale-form button[type=submit]")
        page.wait_for_timeout(400)
        assert page.locator(".toast.show").inner_text().strip() != "", "no toast after sale submit"
        toast_txt = page.locator("#toast").inner_text()
        assert "Venta registrada" in toast_txt, "unexpected toast: " + toast_txt
        print("STEP 2 OK: sale registered, toast =", toast_txt)

        # --- Edit the newest sale (first row, most recent date) ---
        page.wait_for_timeout(200)
        first_edit_btn = page.locator("[data-edit]").first
        first_edit_btn.click()
        page.wait_for_timeout(200)
        page.fill("#e-qty", "7")
        page.click("#edit-save")
        page.wait_for_timeout(400)
        toast_txt2 = page.locator("#toast").inner_text()
        assert "Venta actualizada" in toast_txt2, "unexpected toast: " + toast_txt2
        assert page.locator("td:has-text('7')").first.is_visible()
        print("STEP 3 OK: sale edited, toast =", toast_txt2)

        # --- Delete the newest sale ---
        first_del_btn = page.locator("[data-del]").first
        first_del_btn.click()
        page.wait_for_timeout(200)
        page.click("#confirm-yes")
        page.wait_for_timeout(400)
        print("STEP 4 OK: sale deleted without JS error")

        # --- Messages tab: register a message record ---
        page.click("button[data-tab=mensajes]")
        page.wait_for_timeout(200)
        page.fill("#m-date", "2026-08-31")
        page.select_option("#m-platform", "INSTAGRAM")
        page.fill("#m-atendidos", "10")
        page.fill("#m-noResp", "10")
        page.click("#msg-form button[type=submit]")
        page.wait_for_timeout(400)
        toast_txt3 = page.locator("#toast").inner_text()
        assert "Registro de mensajes guardado" in toast_txt3, "unexpected toast: " + toast_txt3
        print("STEP 5 OK: message registered, toast =", toast_txt3)

        # --- Admin ya tiene sesión iniciada desde el arranque: Panel/Catálogo
        # ya deberían estar visibles sin ningún paso extra ---
        assert page.locator("#tab-panel-btn").is_visible(), "panel tab should be visible for the admin account"
        assert page.locator("#tab-catalogo-btn").is_visible(), "catalogo tab should be visible for the admin account"
        print("STEP 6 OK: admin account already sees Panel/Catálogo tabs")

        # --- Catalog: add a channel while authenticated ---
        page.click("button[data-tab=catalogo]")
        page.wait_for_timeout(200)
        page.fill("#new-channel", "WHATSAPP")
        page.click("#add-channel")
        page.wait_for_timeout(400)
        toast_txt4 = page.locator("#toast").inner_text()
        assert "Canal agregado" in toast_txt4, "unexpected toast: " + toast_txt4
        assert page.locator(".catlist .item:has-text('WHATSAPP')").is_visible()
        print("STEP 7 OK: catalog channel added while authenticated, toast =", toast_txt4)

        # --- Panel view renders without error ---
        page.click("button[data-tab=panel]")
        page.wait_for_timeout(300)
        assert page.locator("text=Ventas registradas").is_visible()
        print("STEP 8 OK: panel renders")

        # --- Logout ---
        page.click("#logout-btn")
        page.wait_for_timeout(300)
        assert page.locator("#login-gate").is_visible(), "login gate should reappear after logout"
        print("STEP 9 OK: logout returns to the login gate")

        browser.close()

    if errors:
        print("\n=== CONSOLE / PAGE ERRORS ===")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    else:
        print("\nALL STEPS PASSED, NO CONSOLE ERRORS")


if __name__ == "__main__":
    main()
