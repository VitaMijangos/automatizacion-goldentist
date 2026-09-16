# Regenera app.js a partir de src/ (Modelo/Vista/Controlador + núcleo
# compartido) antes de ensamblarlo dentro de index.html, para que nunca se
# entregue una versión desactualizada de app.js si alguien edita solo los
# archivos fuente y olvida correr build.py aparte.
import build
build.build()

with open('/tmp/goldentist_build/head_css.html', encoding='utf-8') as f:
    head_css = f.read()
with open('/tmp/goldentist_build/body_shell.html', encoding='utf-8') as f:
    body_shell = f.read()
with open('/tmp/goldentist_build/app.js', encoding='utf-8') as f:
    app_js = f.read()

html = f"""<!doctype html>
<html lang="es">
<head>
{head_css}
</head>
<body>
{body_shell}

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.52.1/dist/umd/supabase.min.js"></script>
<script src="config.js"></script>
<script>
{app_js}
</script>
</body>
</html>
"""

with open('/tmp/goldentist_build/index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("wrote index.html, bytes:", len(html))
