# SISEP VNA - carga desde chat de WhatsApp

Dos partes:

1. **Página de conversión** (`docs/index.html`, publicada en GitHub Pages): elegís la carpeta del chat, revisás la tabla, resolvés las comunas con la API de USIG y descargás el **JSON** para SISEP y el **Excel** para revisar. Todo corre en tu navegador; el chat y las fotos no se suben a ningún servidor.
2. **Userscript de Tampermonkey** (`sisep_vna_carga.user.js`): en el formulario de SISEP carga el JSON, te pide la carpeta de fotos y completa las filas una tras otra, guardando borradores. Nunca pulsa "Enviar".

## Instalación del script

Abrí `https://raw.githubusercontent.com/search00-sketch/sisep-vna-tampermonkey/main/sisep_vna_carga.user.js` con Tampermonkey instalado y confirmá. Las actualizaciones llegan solas.

## Uso

1. En la página de conversión: elegí la carpeta del chat, revisá la tabla, bajá el JSON.
2. En SISEP (Nueva carga, formulario 37): elegí el JSON y la carpeta de fotos, después "Cargar siguiente fila" o "Cargar todas".

## Desarrollo

- `vna_logic.js`: chat → filas, reglas y contrato JSON (`vna-filas-v1`).
- `vna_usig.js`: dirección → comuna (USIG).
- `vna_form.js`: automatización del formulario de SISEP.
- `vna_ui.js`: panel del userscript.
- `comunas_compacto.json`: polígonos oficiales de comunas.
- `build_userscript.js`: arma `sisep_vna_carga.user.js` y copia los módulos a `docs/`. Correr con `node build_userscript.js`.
- `tests/test_vna.js`: prueba la lógica del chat contra USIG real.

Para publicar una versión: subir `@version` en `build_userscript.js`, construir, probar, commit y push. Para la página, basta con hacer push (GitHub Pages se actualiza solo).

## Limitaciones

- Articulos y Bultos no tienen campo en el formulario: no se cargan.
- Los videos no se cargan (el campo de fotos solo acepta imágenes).
- Filas sin altura no tienen comuna: se resuelven a mano en la página.
