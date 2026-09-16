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

        page.fill("#login-email", "vendedora@test.com")
        page.fill("#login-password", "vendedora123")
        page.click("#login-ok")
        page.wait_for_timeout(400)

        page.click("button[data-tab=mensajes]")
        page.wait_for_timeout(200)

        # ---------- todos los campos visibles en la tabla ----------
        headers = [h.strip().lower() for h in page.locator("#view-mensajes table thead th").all_inner_texts()]
        expected = ["fecha","plataforma","atendidos","no resp.","valoración","propuesta",
                    "pago pend.","contactar","descartados","venta cerrada","fuera catálogo","coincide"]
        for col in expected:
            assert col in headers, "falta la columna '"+col+"' en la tabla de Mensajes, headers: "+str(headers)
        print("STEP 1 OK: la tabla de Mensajes ahora muestra las 9 columnas de datos (antes solo 3)")

        # ---------- aviso en vivo mientras se llena el formulario ----------
        page.fill("#m-date", "2026-08-15")
        page.select_option("#m-platform", "INSTAGRAM")
        page.fill("#m-atendidos", "200")
        page.wait_for_timeout(150)
        sum_txt = page.locator("#m-sum-check").inner_text()
        assert "no coincide" in sum_txt.lower() or "⚠️" in sum_txt, "debería avisar que 0 no coincide con 200, vi: " + sum_txt
        print("STEP 2 OK: al escribir Atendidos=200 sin llenar el resto, el aviso marca que no coincide")

        page.fill("#m-noResp", "150")
        page.fill("#m-valoracion", "20")
        page.fill("#m-propuesta", "10")
        page.fill("#m-ventaCerrada", "20")
        page.wait_for_timeout(150)
        sum_txt2 = page.locator("#m-sum-check").inner_text()
        assert "coincide" in sum_txt2.lower() and "no coincide" not in sum_txt2.lower(), \
            "150+20+10+20=200 debería coincidir con Atendidos, vi: " + sum_txt2
        print("STEP 3 OK: al completar 150+20+10+20=200, el aviso confirma que coincide")

        # ---------- no deja guardar si la suma no cuadra ----------
        page.fill("#m-ventaCerrada", "5")  # ahora suma 185, ya no cuadra con 200
        page.wait_for_timeout(150)
        page.click("#msg-form button[type=submit]")
        page.wait_for_timeout(300)
        toast_txt = page.locator("#toast").inner_text()
        assert "suma" in toast_txt.lower() and "200" in toast_txt, "debería rechazar el guardado por la suma incorrecta, toast: " + toast_txt
        assert page.locator("#view-mensajes td:has-text('200')").count() == 0, "no debería haberse guardado el registro con suma incorrecta"
        print("STEP 4 OK: si la suma no coincide, no se guarda y se avisa por qué")

        # ---------- corrige y sí guarda ----------
        page.fill("#m-ventaCerrada", "20")
        page.wait_for_timeout(150)
        page.click("#msg-form button[type=submit]")
        page.wait_for_timeout(400)
        toast_txt2 = page.locator("#toast").inner_text()
        assert "Registro de mensajes guardado" in toast_txt2, "unexpected toast: " + toast_txt2
        assert page.locator("#view-mensajes td:has-text('200')").first.is_visible()
        print("STEP 5 OK: al corregir la suma, el registro se guarda normalmente")

        # ---------- 'Coincide': ✅ en la fila nueva (suma correcta), ⚠️ en la semilla (no cuadra: 5 atendidos vs 2) ----------
        row_new = page.locator("#view-mensajes tr:has(td:has-text('200'))").first
        assert "✅" in row_new.inner_text(), "la fila recién guardada (suma correcta) debería mostrar ✅ en Coincide"
        row_seed = page.locator("#view-mensajes tr:has(td:has-text('01/08/2026'))").first
        assert "⚠️" in row_seed.inner_text(), \
            "el registro semilla (atendidos=5, suma de las 8 categorías=2) debería marcarse como no coincidente"
        print("STEP 6 OK: 'Coincide' muestra ✅ en la fila correcta y ⚠️ en la fila semilla que no cuadra")

        browser.close()
    if errors:
        print("\n=== CONSOLE / PAGE ERRORS ===")
        for e in errors: print(" -", e)
        sys.exit(1)
    else:
        print("\nALL MENSAJES-SUMA-CAMPOS STEPS PASSED, NO CONSOLE ERRORS")

if __name__ == "__main__":
    main()
