# SISEP VNA - carga desde chat de WhatsApp (Tampermonkey)

Userscript que lee un chat exportado de WhatsApp, asigna la comuna de cada dirección con la API de USIG (Buenos Aires) y completa el formulario "VENTA NO AUTORIZADA" de SISEP. Solo guarda borradores; nunca pulsa "Enviar".

## Instalación

1. Instalá Tampermonkey en Chrome.
2. Abrí `https://raw.githubusercontent.com/search00-sketch/sisep-vna-tampermonkey/main/sisep_vna_carga.user.js` y confirmá la instalación.
3. Las actualizaciones llegan solas: Tampermonkey revisa la versión (`@version`) y la reemplaza.

## Uso

1. Abrí el formulario nuevo de SISEP con la sesión iniciada.
2. En el panel: elegí Operativo, Subnivel, el `.txt` del chat y las fotos.
3. Pulsá "Cargar siguiente fila". "Saltar fila" descarta la fila actual.

## Desarrollo

- Fuentes: `vna_logic.js` (chat → filas), `vna_usig.js` (dirección → comuna), `vna_form.js` (formulario), `vna_ui.js` (panel).
- `comunas_compacto.json`: polígonos oficiales de comunas (CABA_comunas.geojson), embebidos en el script.
- Construir: `node build_userscript.js` genera `sisep_vna_carga.user.js`.
- Probar la lógica: `node tests/test_vna.js "ruta/al/chat.txt"` (necesita conexión a USIG).
- Para publicar una versión: subir `@version`, construir, probar y hacer commit.

## Limitaciones conocidas

- Articulos y Bultos no tienen campo en el formulario: no se cargan.
- Los videos no se cargan (el campo de fotos solo acepta imágenes).
- Filas sin altura no tienen comuna y hay que resolverlas a mano.
