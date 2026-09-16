#!/usr/bin/env python3
"""
Concatena las fuentes de app.js a partir de src/ (Modelo/Vista/Controlador
+ el núcleo compartido) en un solo archivo `app.js`, en la carpeta build.

Por qué existe este paso y por qué el resultado sigue siendo un solo
archivo: el código fuente ya está organizado en Modelo/Vista/Controlador
para que sea más fácil de mantener, pero la app se entrega como HTML
estático (sin servidor, sin build tools) para que el usuario solo tenga
que subir un archivo a su hosting por FTP/cPanel. Este script hace ese
"pegado" una sola vez aquí, no en el navegador del usuario ni en su
servidor — nada cambia en cómo se despliega la app.

El orden de concatenación no afecta el comportamiento: todo el contenido
queda dentro de la misma función autoejecutable (IIFE) que ya traía
app.js, y en JavaScript las declaraciones `function nombre(){...}` quedan
disponibles en todo ese ámbito sin importar en qué parte del archivo
final aparezcan (hoisting) — por eso el Modelo puede ir después del
núcleo aunque el núcleo ya llame a sus funciones, por ejemplo.
"""
import io
import os

BASE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(BASE, 'src')

# Orden de las piezas: núcleo compartido (sin la línea final que cierra
# la IIFE) + Modelo(s) + Vista(s) + Controlador(es) de cada sección ya
# migrada a MVC + el cierre de la IIFE al final.
PIECES = [
    'core.js',
    'models/layaway.model.js',
    'views/layaway.view.js',
    'controllers/layaway.controller.js',
    'core-footer.js',
]

def build():
    parts = []
    for name in PIECES:
        path = os.path.join(SRC, name)
        with io.open(path, encoding='utf-8') as f:
            parts.append(f.read())
    app_js = '\n'.join(parts)
    out_path = os.path.join(BASE, 'app.js')
    with io.open(out_path, 'w', encoding='utf-8') as f:
        f.write(app_js)
    print('wrote', out_path, '(%d bytes, %d pieces)' % (len(app_js), len(PIECES)))
    return app_js

if __name__ == '__main__':
    build()
