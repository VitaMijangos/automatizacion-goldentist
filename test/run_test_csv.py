import sys
from playwright.sync_api import sync_playwright

URL = "file:///tmp/goldentist_build/test/index.test.html"

errors = []


def on_console(msg):
    if msg.type == "error":
        errors.append(msg.text)


def on_pageerror(exc):
    errors.append("PAGEERROR: " + str(exc))


def login(page, email, password):
    page.fill("#login-email", email)
    page.fill("#login-password", password)
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

        # log in as admin
        login(page, "admin@test.com", "secret123")

        # --- Panel > Ventas: export CSV ---
        page.click("button[data-tab=panel]")
        page.wait_for_timeout(300)
        with page.expect_download() as dl_info:
            page.click("#export-ventas-csv")
        download = dl_info.value
        path = download.path()
        content = open(path, "rb").read().decode("utf-8-sig")
        assert download.suggested_filename.startswith("ventas_goldentist_"), download.suggested_filename
        assert "Fecha;Canal;Artículo;Cantidad;Vendedora" in content, content[:200]
        assert "Kit NSK PRO" in content
        print("STEP 1 OK: ventas CSV downloaded ->", download.suggested_filename)
        print("  first lines:", content.splitlines()[:3])

        # --- Panel > Mensajes: export CSV ---
        page.click("[data-panel-view=mensajes]")
        page.wait_for_timeout(300)
        with page.expect_download() as dl_info2:
            page.click("#export-mensajes-csv")
        download2 = dl_info2.value
        content2 = open(download2.path(), "rb").read().decode("utf-8-sig")
        assert download2.suggested_filename.startswith("mensajes_goldentist_")
        assert "Fecha;Plataforma;Atendidos" in content2, content2[:200]
        assert "INSTAGRAM" in content2
        print("STEP 2 OK: mensajes CSV downloaded ->", download2.suggested_filename)
        print("  first lines:", content2.splitlines()[:3])

        # --- Catalogo > Datos: export all sales / messages ---
        page.click("button[data-tab=catalogo]")
        page.wait_for_timeout(300)
        with page.expect_download() as dl_info3:
            page.click("#export-all-sales-csv")
        download3 = dl_info3.value
        assert "completo" in download3.suggested_filename
        print("STEP 3 OK: export-all ventas ->", download3.suggested_filename)

        with page.expect_download() as dl_info4:
            page.click("#export-all-messages-csv")
        download4 = dl_info4.value
        assert "completo" in download4.suggested_filename
        print("STEP 4 OK: export-all mensajes ->", download4.suggested_filename)

        # --- Registrar venta: también hay un botón de exportar, con una cuenta
        # del equipo que NO es admin (antes esto se probaba sin sesión; ahora
        # toda la app pide login, pero el botón sigue sin requerir ser admin) ---
        page.click("#logout-btn")
        page.wait_for_timeout(300)
        assert page.locator("#login-gate").is_visible(), "debería regresar al login al cerrar sesión"
        login(page, "vendedora@test.com", "vendedora123")
        assert page.locator("#tab-panel-btn").is_hidden(), "la cuenta de equipo no debería ver Panel"
        page.click("button[data-tab=registrar]")
        page.wait_for_timeout(200)
        assert page.locator("#export-sales-tab-csv").is_visible(), "el botón de exportar debería verse en Registrar venta sin ser admin"
        with page.expect_download() as dl_info5:
            page.click("#export-sales-tab-csv")
        download5 = dl_info5.value
        content5 = open(download5.path(), "rb").read().decode("utf-8-sig")
        assert download5.suggested_filename.startswith("ventas_goldentist_")
        assert "Kit NSK PRO" in content5
        print("STEP 5 OK: botón de exportar en la pestaña Registrar venta ->", download5.suggested_filename)

        # --- Mensajes: también hay un botón de exportar, sin ser admin ---
        page.click("button[data-tab=mensajes]")
        page.wait_for_timeout(200)
        assert page.locator("#export-messages-tab-csv").is_visible(), "el botón de exportar debería verse en Mensajes sin ser admin"
        with page.expect_download() as dl_info6:
            page.click("#export-messages-tab-csv")
        download6 = dl_info6.value
        content6 = open(download6.path(), "rb").read().decode("utf-8-sig")
        assert download6.suggested_filename.startswith("mensajes_goldentist_")
        assert "INSTAGRAM" in content6
        print("STEP 6 OK: botón de exportar en la pestaña Mensajes ->", download6.suggested_filename)

        browser.close()

    if errors:
        print("\n=== CONSOLE / PAGE ERRORS ===")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    else:
        print("\nALL CSV STEPS PASSED, NO CONSOLE ERRORS")


if __name__ == "__main__":
    main()
