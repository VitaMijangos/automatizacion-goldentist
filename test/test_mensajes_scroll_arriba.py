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
        # ventana angosta a propósito, para forzar el scroll horizontal en Mensajes
        page = browser.new_page(viewport={"width": 900, "height": 900})
        page.on("console", on_console)
        page.on("pageerror", on_pageerror)
        page.goto(URL)
        page.wait_for_timeout(300)

        page.fill("#login-email", "vendedora@test.com")
        page.fill("#login-password", "vendedora123")
        page.click("#login-ok")
        page.wait_for_timeout(400)
        page.click("button[data-tab=mensajes]")
        page.wait_for_timeout(300)

        top = page.locator(".msg-scroll-top").first
        bottom = page.locator(".msg-scroll-bottom").first
        assert top.count() == 1 and bottom.count() == 1, "faltan las barras de scroll (arriba/abajo) de Mensajes"
        print("STEP 1 OK: existe una barra de scroll duplicada arriba de la tabla")

        # la barra de arriba debe estar visible sin tener que bajar hasta el
        # final de la tabla (a diferencia de la de abajo, que solo aparece
        # después de todas las filas)
        top_box = top.bounding_box()
        table_box = page.locator(".msg-table").first.bounding_box()
        assert top_box["y"] < table_box["y"], \
            "la barra de scroll de arriba debería estar antes (más arriba) que la tabla misma"
        print("STEP 2 OK: la barra de arriba aparece antes de la tabla, no hay que bajar para encontrarla")

        # mover la barra de ARRIBA debe mover la vista de la tabla (abajo)
        inner_width = page.evaluate("document.querySelector('.msg-scroll-top-inner').offsetWidth")
        client_width = page.evaluate("document.querySelector('.msg-scroll-top').clientWidth")
        assert inner_width > client_width, "la tabla de la vista angosta debería seguir necesitando scroll horizontal"
        page.evaluate("document.querySelector('.msg-scroll-top').scrollLeft = 150")
        page.wait_for_timeout(150)
        bottom_scroll = page.evaluate("document.querySelector('.msg-scroll-bottom').scrollLeft")
        assert bottom_scroll == 150, "al mover la barra de arriba, la de abajo (y la tabla) debería moverse igual, vi: " + str(bottom_scroll)
        print("STEP 3 OK: deslizar la barra de arriba mueve la tabla de abajo")

        # y al revés: mover la de ABAJO debe reflejarse en la de ARRIBA
        page.evaluate("document.querySelector('.msg-scroll-bottom').scrollLeft = 40")
        page.wait_for_timeout(150)
        top_scroll = page.evaluate("document.querySelector('.msg-scroll-top').scrollLeft")
        assert top_scroll == 40, "al mover la tabla de abajo, la barra de arriba debería reflejarlo, vi: " + str(top_scroll)
        print("STEP 4 OK: deslizar la tabla de abajo también mueve la barra de arriba (sincronía en ambos sentidos)")

        # sigue funcionando después de expandir/colapsar meses (se vuelve a renderizar)
        page.click("[data-toggle-msg-month]")
        page.wait_for_timeout(200)
        page.click("[data-toggle-msg-month]")
        page.wait_for_timeout(200)
        top2 = page.locator(".msg-scroll-top").first
        assert top2.count() == 1, "la barra de arriba debería seguir presente después de expandir/colapsar un mes"
        print("STEP 5 OK: la barra de arriba sigue funcionando tras expandir/colapsar un mes")

        browser.close()
    if errors:
        print("\n=== CONSOLE / PAGE ERRORS ===")
        for e in errors: print(" -", e)
        sys.exit(1)
    else:
        print("\nALL MENSAJES-SCROLL-ARRIBA STEPS PASSED, NO CONSOLE ERRORS")

if __name__ == "__main__":
    main()
