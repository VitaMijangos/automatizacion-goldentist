import sys
from playwright.sync_api import sync_playwright

URL = "file:///tmp/goldentist_build/test/index.test.html"
errors = []
def on_console(msg):
    if msg.type == "error": errors.append(msg.text)
def on_pageerror(exc): errors.append("PAGEERROR: " + str(exc))


def register_layaway(page, customer, total, deposit):
    page.fill("#l-customerName", customer)
    page.fill("#l-phone", "5544443333")
    page.fill("#l-product", "Kit de prueba")
    page.fill("#l-qty", "1")
    page.fill("#l-date", "2026-09-01")
    page.fill("#l-total", str(total))
    page.fill("#l-deposit", str(deposit))
    page.fill("#l-depositMethod", "Efectivo")
    page.click("#layaway-form button[type=submit]")
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
        # cobertura dedicada de esa pantalla) — entramos con una cuenta del
        # equipo (no admin), ya que este archivo no usa Panel/Catálogo.
        page.fill("#login-email", "vendedora@test.com")
        page.fill("#login-password", "vendedora123")
        page.click("#login-ok")
        page.wait_for_timeout(400)

        page.click("button[data-tab=apartados]")
        page.wait_for_timeout(200)

        # ---------- ventana más ancha ----------
        register_layaway(page, "Clienta Liquidacion", 1000, 400)
        row = page.locator("tr:has-text('Clienta Liquidacion')").first
        assert row.is_visible()
        row.locator("[data-view-layaway]").click()
        page.wait_for_timeout(200)
        box = page.locator(".modal").first.bounding_box()
        assert box is not None and box["width"] > 600, "el modal de apartados debería ser más ancho (720px): %r" % box
        print("STEP 1 OK: el modal de apartados es más ancho (%.0fpx)" % box["width"])

        # ---------- varios abonos seguidos, sin que se cierre el modal ----------
        modal_text = page.locator(".modal").first.inner_text()
        assert "Restante" in modal_text and "600.00" in modal_text, "restante inicial incorrecto: " + modal_text
        # el depósito inicial ya cuenta como el primer abono
        assert "Abonos (1)" in modal_text, "el depósito inicial debería listarse como abono: " + modal_text

        page.fill("#lp-amount", "300")
        page.click("#lp-add")
        page.wait_for_timeout(400)
        assert page.locator(".modal").first.is_visible(), "el modal debería seguir abierto tras el primer abono adicional"
        modal_text = page.locator(".modal").first.inner_text()
        assert "300.00" in modal_text, "restante no se actualizó tras el primer abono: " + modal_text
        assert "Abonos (2)" in modal_text
        print("STEP 2 OK: primer abono adicional — el restante se actualiza en el modal sin cerrarlo")

        # segundo abono seguido, directo sobre el mismo modal ya reabierto
        page.fill("#lp-amount", "200")
        page.click("#lp-add")
        page.wait_for_timeout(400)
        assert page.locator(".modal").first.is_visible(), "el modal debería seguir abierto tras el segundo abono adicional"
        modal_text = page.locator(".modal").first.inner_text()
        assert "100.00" in modal_text, "restante no se actualizó tras el segundo abono: " + modal_text
        assert "Abonos (3)" in modal_text
        assert "Liquidado" not in modal_text, "todavía no debería marcarse como liquidado: " + modal_text
        print("STEP 3 OK: segundo abono seguido registrado sin reabrir manualmente, restante = 100.00")

        # ---------- liquidar por completo: aparece el aviso y se sugiere 'Completado' ----------
        page.fill("#lp-amount", "100")
        page.click("#lp-add")
        page.wait_for_timeout(400)
        modal_text = page.locator(".modal").first.inner_text()
        assert "0.00" in modal_text
        assert "Liquidado" in modal_text, "debería mostrarse el aviso de liquidado: " + modal_text
        assert page.locator("#el-status").input_value() == "completado", "el estatus debería sugerirse como 'Completado' al liquidar"
        print("STEP 4 OK: al cubrir el total aparece el aviso '✅ Liquidado' y se sugiere el estatus 'Completado'")

        # guardar cambios (confirma el estatus sugerido) y cerrar
        page.click("#edit-layaway-save")
        page.wait_for_timeout(400)
        toast = page.locator("#toast").inner_text()
        assert "Apartado actualizado" in toast
        # un apartado completado sale de la vista 'Abiertos' por defecto
        assert page.locator("tr:has-text('Clienta Liquidacion')").count() == 0, \
            "un apartado completado no debería verse en la vista 'Abiertos'"
        page.click("button[data-layaway-filter=todos]")
        page.wait_for_timeout(200)
        row = page.locator("tr:has-text('Clienta Liquidacion')").first
        assert "Completado" in row.inner_text() or "completado" in row.inner_text().lower(), "la fila debería reflejar el estatus completado: " + row.inner_text()
        print("STEP 5 OK: al guardar, el apartado queda marcado como completado")

        # ---------- quitar un abono también refresca el modal sin cerrarlo ----------
        register_layaway(page, "Clienta Quitar Abono", 500, 100)
        row2 = page.locator("tr:has-text('Clienta Quitar Abono')").first
        row2.locator("[data-view-layaway]").click()
        page.wait_for_timeout(200)
        # el depósito inicial (100) ya es el primer abono; restante = 400
        modal_text = page.locator(".modal").first.inner_text()
        assert "400.00" in modal_text, "restante inicial incorrecto: " + modal_text
        assert "Abonos (1)" in modal_text

        page.fill("#lp-amount", "150")
        page.click("#lp-add")
        page.wait_for_timeout(400)
        modal_text = page.locator(".modal").first.inner_text()
        assert "250.00" in modal_text, "restante incorrecto tras el abono: " + modal_text
        assert "Abonos (2)" in modal_text

        # quitar el abono que acabamos de agregar (el más reciente, al final de la lista)
        page.locator("[data-del-payment]").last.click()
        page.wait_for_timeout(400)
        toast2 = page.locator("#toast").inner_text()
        assert "Abono quitado" in toast2, "unexpected toast: " + toast2
        assert page.locator(".modal").first.is_visible(), "el modal debería seguir abierto tras quitar un abono"
        modal_text = page.locator(".modal").first.inner_text()
        assert "400.00" in modal_text, "restante no volvió a subir tras quitar el abono: " + modal_text
        assert "Abonos (1)" in modal_text
        print("STEP 6 OK: quitar un abono también refresca el restante en el modal, sin cerrarlo")

        page.click("#edit-layaway-cancel")
        page.wait_for_timeout(200)
        assert page.locator(".modal-backdrop").count() == 0, "el modal debería cerrarse con 'Cerrar'"
        print("STEP 7 OK: 'Cerrar' sigue cerrando el modal normalmente")

        browser.close()
    if errors:
        print("\n=== CONSOLE / PAGE ERRORS ===")
        for e in errors: print(" -", e)
        sys.exit(1)
    else:
        print("\nALL APARTADOS-LIQUIDACION STEPS PASSED, NO CONSOLE ERRORS")

if __name__ == "__main__":
    main()
