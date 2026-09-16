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

        # ---------- Envios ----------
        page.click("button[data-tab=envios]")
        page.wait_for_timeout(200)
        assert page.locator("text=Nuevo envío").is_visible(), "shipment form not visible"
        assert page.locator("td:has-text('Cliente Prueba')").first.is_visible(), "seed shipment not rendered"
        print("STEP 1 OK: envios tab renders with seed data")

        page.fill("#s-date", "2026-08-31")
        page.fill("#s-customerName", "Nueva Clienta Envio")
        page.fill("#s-phone", "5599998888")
        page.fill("#s-product", "Kit W&H Led")
        page.fill("#s-qty", "2")
        page.fill("#s-street", "Av Siempre Viva 123")
        page.fill("#s-city", "Guadalajara")
        page.click("#ship-form button[type=submit]")
        page.wait_for_timeout(400)
        toast1 = page.locator("#toast").inner_text()
        assert "Envío registrado" in toast1, "unexpected toast: " + toast1
        assert page.locator("td:has-text('Nueva Clienta Envio')").first.is_visible()
        print("STEP 2 OK: shipment registered, toast =", toast1)

        # toggle status pendiente -> enviado
        first_toggle = page.locator("[data-toggle-ship]").first
        first_toggle.click()
        page.wait_for_timeout(400)
        toast2 = page.locator("#toast").inner_text()
        assert "enviado" in toast2.lower(), "unexpected toast: " + toast2
        print("STEP 3 OK: shipment status toggled, toast =", toast2)

        # edit a shipment
        first_edit = page.locator("[data-edit-ship]").first
        first_edit.click()
        page.wait_for_timeout(200)
        page.fill("#es-notes", "Nota de prueba")
        page.click("#edit-ship-save")
        page.wait_for_timeout(400)
        toast3 = page.locator("#toast").inner_text()
        assert "Envío actualizado" in toast3, "unexpected toast: " + toast3
        print("STEP 4 OK: shipment edited, toast =", toast3)

        # CSV export
        with page.expect_download() as dl_info:
            page.click("#export-ventas-envios-csv")
        download = dl_info.value
        content = open(download.path(), "rb").read().decode("utf-8-sig")
        assert download.suggested_filename.startswith("envios_goldentist_")
        assert "No. envío;Fecha;ID venta;Cliente" in content, content[:200]
        assert "Estatus;Paquetería;No. de guía;Notas" in content, content[:400]
        print("STEP 5 OK: shipments CSV exported ->", download.suggested_filename)

        # delete a shipment
        first_del = page.locator("[data-del-ship]").first
        first_del.click()
        page.wait_for_timeout(200)
        page.click("#confirm-yes")
        page.wait_for_timeout(400)
        print("STEP 6 OK: shipment deleted without JS error")

        # ---------- Apartados ----------
        page.click("button[data-tab=apartados]")
        page.wait_for_timeout(200)
        assert page.locator("text=Nuevo apartado").is_visible(), "layaway form not visible"
        assert page.locator("td:has-text('Cliente Apartado')").first.is_visible(), "seed layaway not rendered"
        print("STEP 7 OK: apartados tab renders with seed data")

        page.fill("#l-customerName", "Nueva Clienta Apartado")
        page.fill("#l-phone", "5533334444")
        page.fill("#l-product", "Kit NSK PRO")
        page.fill("#l-qty", "1")
        page.fill("#l-date", "2026-08-31")
        page.fill("#l-total", "10000")
        page.fill("#l-deposit", "2000")
        page.fill("#l-depositMethod", "Transferencia")
        page.click("#layaway-form button[type=submit]")
        page.wait_for_timeout(500)
        toast4 = page.locator("#toast").inner_text()
        assert "Apartado registrado" in toast4, "unexpected toast: " + toast4
        row = page.locator("tr:has-text('Nueva Clienta Apartado')").first
        assert row.is_visible()
        assert "8000.00" in row.inner_text() or "8,000.00" in row.inner_text(), "remaining balance not computed: " + row.inner_text()
        print("STEP 8 OK: layaway registered with initial deposit, toast =", toast4)

        # open detail modal, add another abono — el modal NO se cierra: se
        # vuelve a abrir solo con los datos frescos, para poder seguir
        # agregando abonos sin perder el lugar
        row.locator("[data-view-layaway]").click()
        page.wait_for_timeout(200)
        assert page.locator(".modal").first.is_visible(), "el modal de apartado debería abrirse"
        page.fill("#lp-amount", "3000")
        page.fill("#lp-note", "Segundo abono")
        page.click("#lp-add")
        page.wait_for_timeout(400)
        toast5 = page.locator("#toast").inner_text()
        assert "Abono agregado" in toast5, "unexpected toast: " + toast5
        assert page.locator(".modal").first.is_visible(), "el modal debería seguir abierto tras agregar un abono"
        modal_text = page.locator(".modal").first.inner_text()
        assert "5000.00" in modal_text or "5,000.00" in modal_text, "el modal no muestra el restante actualizado: " + modal_text
        assert "Abonos (2)" in modal_text, "el modal debería listar los 2 abonos: " + modal_text
        row2 = page.locator("tr:has-text('Nueva Clienta Apartado')").first
        assert "5000.00" in row2.inner_text() or "5,000.00" in row2.inner_text(), "remaining balance after 2nd abono wrong: " + row2.inner_text()
        print("STEP 9 OK: second abono added, el modal sigue abierto con el restante recalculado en vivo, toast =", toast5)

        # el modal ya está abierto (con los datos frescos): editar el
        # estatus a completado ahí mismo, sin tener que reabrirlo
        page.select_option("#el-status", "completado")
        page.click("#edit-layaway-save")
        page.wait_for_timeout(400)
        toast6 = page.locator("#toast").inner_text()
        assert "Apartado actualizado" in toast6, "unexpected toast: " + toast6
        print("STEP 10 OK: layaway status updated, toast =", toast6)

        # CSV export
        with page.expect_download() as dl_info2:
            page.click("#export-apartados-csv")
        download2 = dl_info2.value
        content2 = open(download2.path(), "rb").read().decode("utf-8-sig")
        assert download2.suggested_filename.startswith("apartados_goldentist_")
        assert "Fecha;Cliente;Teléfono;Producto" in content2, content2[:200]
        print("STEP 11 OK: layaways CSV exported ->", download2.suggested_filename)

        browser.close()

    if errors:
        print("\n=== CONSOLE / PAGE ERRORS ===")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    else:
        print("\nALL ENVIOS/APARTADOS STEPS PASSED, NO CONSOLE ERRORS")


if __name__ == "__main__":
    main()
