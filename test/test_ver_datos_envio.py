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
        context = browser.new_context()
        try:
            context.grant_permissions(["clipboard-read", "clipboard-write"])
        except Exception as e:
            print("no se pudo otorgar permisos de portapapeles (se prueba igual):", e)
        page = context.new_page()
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

        # la tabla debe mostrar la columna "No." con el folio del envío semilla
        assert page.locator("th:has-text('No.')").first.is_visible(), "columna No. no visible en la tabla"
        assert page.locator("td:has-text('#1')").first.is_visible(), "folio #1 del envío semilla no visible en la tabla"
        print("STEP 1 OK: columna de folio visible en la tabla con el valor del envío semilla")

        # el formulario ya no debe tener campos de SKU ni No. de orden
        assert page.locator("#s-sku").count() == 0, "el campo SKU debería haber sido eliminado del formulario"
        assert page.locator("#s-noOrden").count() == 0, "el campo No. de orden debería haber sido eliminado del formulario"
        print("STEP 2 OK: SKU y No. de orden ya no están en el formulario de nuevo envío")

        # abrir el modal "Ver datos"
        assert page.locator("[data-view-ship]").first.is_visible(), "botón Ver datos no visible"
        page.locator("[data-view-ship]").first.click()
        page.wait_for_timeout(200)

        assert page.locator("h3:has-text('Datos de envío')").is_visible(), "modal de datos de envío no se abrió"
        modal_text = page.locator(".modal").inner_text()

        for campo in ["No. de envío", "Cliente", "Teléfono", "Calle y número", "Colonia", "Ciudad", "Estado", "CP", "Producto"]:
            assert campo in modal_text, "falta el campo '%s' en el modal de datos de envío" % campo
        assert "SKU" not in modal_text, "SKU no debería aparecer en el modal de datos de envío"
        assert "No. orden" not in modal_text, "No. orden no debería aparecer en el modal de datos de envío"
        assert "#1" in modal_text, "el folio del envío semilla no aparece en el modal"
        assert "Cliente Prueba" in modal_text
        assert "Ciudad de México" in modal_text
        assert page.locator("#view-ship-copy").count() == 0, "el botón 'Copiar todo' debería haber sido eliminado"
        print("STEP 3 OK: modal muestra el folio y los campos correctos, sin SKU/No. de orden ni 'Copiar todo'")

        modal_width = page.eval_on_selector(".modal", "el => el.getBoundingClientRect().width")
        assert modal_width > 700, "el modal de datos de envío debería ser más ancho todavía, midió %spx" % modal_width
        print("STEP 4 OK: modal es más ancho (%.0fpx) para facilitar la lectura" % modal_width)

        copy_buttons = page.locator("[data-copy-field-idx]")
        assert copy_buttons.count() >= 5, "se esperaban varios botones de copiar, uno por campo"
        cliente_row = page.locator(".row", has_text="Cliente").filter(has=page.locator("[data-copy-field-idx]")).first
        cliente_row.locator("[data-copy-field-idx]").click()
        page.wait_for_timeout(200)
        toast_text = page.locator("#toast").inner_text()
        assert "opiado" in toast_text or "no se pudo copiar" in toast_text.lower(), "toast inesperado: " + toast_text
        print("STEP 5 OK: copiar un campo individual responde, toast =", toast_text)

        if "opiado" in toast_text:
            clip = page.evaluate("() => navigator.clipboard.readText()")
            assert clip == "Cliente Prueba", "el texto copiado no es solo el valor del campo: " + repr(clip)
            print("STEP 6 OK: el portapapeles contiene solo el valor del campo copiado, no todo el bloque")
        else:
            print("STEP 6 SKIP: portapapeles no disponible en este entorno, se probó el fallback")

        page.click("#view-ship-close")
        page.wait_for_timeout(150)
        assert page.locator("h3:has-text('Datos de envío')").count() == 0, "el modal debió cerrarse"
        print("STEP 7 OK: modal se cierra correctamente")

        # sección "Datos de la guía": no aparece en el formulario de nuevo
        # envío ni en el de editar, solo en "Ver datos"
        assert page.locator("#s-carrier").count() == 0 and page.locator("#s-paqueteria").count() == 0, \
            "la paquetería no debería estar en el formulario de nuevo envío"
        page.locator("[data-view-ship]").first.click()
        page.wait_for_timeout(200)
        assert page.locator("h3:has-text('Datos de la guía')").is_visible(), "falta la sección de datos de la guía"
        assert "no se captura al registrar el envío" in page.locator(".modal").inner_text().lower()
        print("STEP 8 OK: sección 'Datos de la guía' presente solo en Ver datos, con su aviso")

        # paquetería: elegir DHL y capturar número de guía, guardar
        page.select_option("#view-ship-carrier", "DHL")
        page.fill("#view-ship-guia", "1234567890")
        page.click("#view-ship-save-guia")
        page.wait_for_timeout(400)
        toast_guia = page.locator("#toast").inner_text()
        assert "guía" in toast_guia.lower() and "guardad" in toast_guia.lower(), "toast inesperado: " + toast_guia
        print("STEP 9 OK: paquetería y número de guía guardados, toast =", toast_guia)

        # reabrir y confirmar que quedó guardado, y que el select refleja DHL
        page.locator("[data-view-ship]").first.click()
        page.wait_for_timeout(200)
        assert page.eval_on_selector("#view-ship-carrier", "el => el.value") == "DHL"
        assert page.eval_on_selector("#view-ship-guia", "el => el.value") == "1234567890"
        print("STEP 10 OK: al reabrir, la paquetería y el número de guía guardados se ven precargados")

        # paquetería "Otro": debe mostrar el campo de texto manual
        page.select_option("#view-ship-carrier", "Otro")
        assert page.locator("#view-ship-carrier-other").is_visible(), "el campo manual de paquetería debería mostrarse con 'Otro'"
        page.fill("#view-ship-carrier-other", "Paquetería Local")
        page.click("#view-ship-save-guia")
        page.wait_for_timeout(400)
        page.locator("[data-view-ship]").first.click()
        page.wait_for_timeout(200)
        assert page.eval_on_selector("#view-ship-carrier", "el => el.value") == "Otro"
        assert page.eval_on_selector("#view-ship-carrier-other", "el => el.value") == "Paquetería Local"
        print("STEP 11 OK: 'Otro' permite capturar manualmente el nombre de la paquetería y se conserva al reabrir")
        page.click("#view-ship-close")
        page.wait_for_timeout(150)

        browser.close()
    if errors:
        print("\n=== CONSOLE / PAGE ERRORS ===")
        for e in errors: print(" -", e)
        sys.exit(1)
    else:
        print("\nALL VER-DATOS-ENVIO STEPS PASSED, NO CONSOLE ERRORS")

if __name__ == "__main__":
    main()
