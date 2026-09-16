import sys
from playwright.sync_api import sync_playwright

URL = "file:///tmp/goldentist_build/test/index.test.html"
errors = []
def on_console(msg):
    if msg.type == "error": errors.append(msg.text)
def on_pageerror(exc): errors.append("PAGEERROR: " + str(exc))


def register_sale(page, date, channel, qty):
    page.click("button[data-tab=registrar]")
    page.wait_for_timeout(150)
    page.fill("#f-date", date)
    page.select_option("#f-channel", channel)
    page.fill("#f-article", "Kit NSK PRO")
    page.fill("#f-qty", str(qty))
    page.select_option("#f-seller-select", "Diana Flores")
    page.click("#sale-form button[type=submit]")
    page.wait_for_timeout(300)
    toast_txt = page.locator("#toast").inner_text()
    assert "Venta registrada" in toast_txt, "no se pudo registrar la venta de prueba, toast: " + toast_txt


def register_message(page, date, platform, atendidos):
    page.click("button[data-tab=mensajes]")
    page.wait_for_timeout(150)
    page.fill("#m-date", date)
    page.select_option("#m-platform", platform)
    page.fill("#m-atendidos", str(atendidos))
    page.fill("#m-noResp", str(atendidos))
    page.click("#msg-form button[type=submit]")
    page.wait_for_timeout(300)
    toast_txt = page.locator("#toast").inner_text()
    assert "Registro de mensajes guardado" in toast_txt, "no se pudo registrar el mensaje de prueba, toast: " + toast_txt


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", headless=True)
        page = browser.new_page()
        page.on("console", on_console)
        page.on("pageerror", on_pageerror)
        page.goto(URL)
        page.wait_for_timeout(300)

        # Panel es solo para admins.
        page.fill("#login-email", "admin@test.com")
        page.fill("#login-password", "secret123")
        page.click("#login-ok")
        page.wait_for_timeout(400)

        # Seed ya trae: venta 2026-08-01 FACEBOOK qty=2, mensaje 2026-08-01
        # INSTAGRAM atendidos=5. Agregamos más de agosto y una de septiembre
        # con cantidades bien distintas, para poder verificar por número
        # exacto que septiembre nunca se cuela al filtrar solo agosto.
        register_sale(page, "2026-08-10", "FACEBOOK", 4)
        register_sale(page, "2026-08-25", "WATTI", 3)
        register_sale(page, "2026-09-05", "WATTI", 20)
        register_message(page, "2026-08-10", "INSTAGRAM", 11)
        register_message(page, "2026-09-05", "INSTAGRAM", 22)
        print("STEP 1 OK: ventas y mensajes de agosto y septiembre registrados")

        # ---------- Ventas: abrir Panel y elegir 'Rango personalizado' ----------
        page.click("button[data-tab=panel]")
        page.wait_for_timeout(300)
        assert page.locator("#filt-range option[value=custom]").count() == 1, \
            "falta la opción 'Rango personalizado' en el filtro de Rango de Ventas"

        page.select_option("#filt-range", "custom")
        page.wait_for_timeout(200)
        assert page.locator("#filt-date-from").count() == 1 and page.locator("#filt-date-to").count() == 1, \
            "no aparecieron los campos Desde/Hasta al elegir 'Rango personalizado'"
        print("STEP 2 OK: al elegir 'Rango personalizado' aparecen los campos Desde/Hasta")

        # Caso real de la usuaria: agosto completo, sin mezclar septiembre.
        page.fill("#filt-date-from", "2026-08-01")
        page.wait_for_timeout(150)
        page.fill("#filt-date-to", "2026-08-31")
        page.wait_for_timeout(200)
        stat_values = page.locator(".stat .value").all_inner_texts()
        assert "3" in stat_values, "se esperaban 3 ventas de agosto (seed + 2 nuevas) en 'Ventas registradas', vi: " + str(stat_values)
        assert "9" in stat_values, "se esperaban 9 unidades vendidas en agosto (2+4+3), vi: " + str(stat_values)
        assert "20" not in stat_values, "la venta de septiembre (qty=20) no debería verse al filtrar solo agosto"
        print("STEP 3 OK: Ventas — Desde=2026-08-01/Hasta=2026-08-31 muestra solo agosto (aislado de septiembre)")

        # Validación Desde > Hasta
        page.fill("#filt-date-from", "2026-08-20")
        page.wait_for_timeout(150)
        page.fill("#filt-date-to", "2026-08-01")
        page.wait_for_timeout(200)
        toast_txt = page.locator("#toast").inner_text()
        assert "posterior" in toast_txt.lower() or "desde" in toast_txt.lower(), "toast inesperado: " + toast_txt
        print("STEP 4 OK: 'Desde' posterior a 'Hasta' se rechaza con un aviso, en Ventas")

        # ---------- El filtro se comparte con Mensajes (misma PANEL_FILTERS) ----------
        page.click("button[data-panel-view=mensajes]")
        page.wait_for_timeout(300)
        assert page.locator("#filt-msg-range").input_value() == "custom", \
            "el rango 'custom' debería seguir seleccionado al cambiar a la pestaña Mensajes (PANEL_FILTERS compartido)"
        print("STEP 5 OK: al cambiar a Mensajes, sigue seleccionado 'Rango personalizado' (filtro compartido)")

        page.fill("#filt-msg-date-from", "2026-08-01")
        page.wait_for_timeout(150)
        page.fill("#filt-msg-date-to", "2026-08-31")
        page.wait_for_timeout(200)
        msg_stat_values = page.locator(".stat .value").all_inner_texts()
        assert "16" in msg_stat_values, "se esperaban 16 mensajes atendidos en agosto (5+11), vi: " + str(msg_stat_values)
        assert "22" not in msg_stat_values, "el mensaje de septiembre (atendidos=22) no debería verse al filtrar solo agosto"
        print("STEP 6 OK: Mensajes — el rango personalizado también aísla agosto")

        # ---------- Exportar CSV respeta el rango personalizado ----------
        with page.expect_download() as dl_info:
            page.click("#export-mensajes-csv")
        content = open(dl_info.value.path(), "rb").read().decode("utf-8-sig")
        assert "2026-09-05" not in content, "el CSV de Mensajes debería respetar el rango personalizado (sin septiembre)"
        assert "2026-08-10" in content, "el CSV de Mensajes debería incluir el registro de agosto dentro del rango"
        print("STEP 7 OK: 'Exportar CSV' respeta el rango personalizado, en Mensajes")

        # ---------- Volver a 'Todo' quita el filtro ----------
        page.select_option("#filt-msg-range", "todo")
        page.wait_for_timeout(200)
        assert page.locator("#filt-msg-date-from").count() == 0, \
            "los campos Desde/Hasta deberían desaparecer al volver a 'Todo'"
        print("STEP 8 OK: volver a 'Todo' oculta los campos Desde/Hasta")

        browser.close()
    if errors:
        print("\n=== CONSOLE / PAGE ERRORS ===")
        for e in errors: print(" -", e)
        sys.exit(1)
    else:
        print("\nALL PANEL-RANGO-PERSONALIZADO STEPS PASSED, NO CONSOLE ERRORS")

if __name__ == "__main__":
    main()
