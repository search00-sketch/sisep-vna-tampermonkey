// Arma el userscript único para Tampermonkey y copia los módulos a docs/ (página de conversión).
// Uso: node build_userscript.js
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const leer = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

// Tampermonkey compara la versión (@version) con este archivo y actualiza solo.
const URL_SCRIPT = 'https://raw.githubusercontent.com/search00-sketch/sisep-vna-tampermonkey/main/sisep_vna_carga.user.js';

const cabecera = `// ==UserScript==
// @name         SISEP VNA - carga desde Excel de la página (borrador)
// @namespace    local.vna
// @version      1.6.1
// @description  Carga en el formulario VENTA NO AUTORIZADA las filas del Excel exportado por el conversor WhatsApp → SISEP, con las fotos de la carpeta. El panel empieza oculto. Solo guarda borradores; nunca pulsa Enviar. Solo guarda borradores; nunca pulsa "Enviar".
// @match        https://sisep.seguridadciudad.gob.ar/v3.0/apps/formularios/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// @updateURL    ${URL_SCRIPT}
// @downloadURL  ${URL_SCRIPT}
// @run-at       document-idle
// ==/UserScript==
`;

const cuerpo = [
  '(function () {',
  "'use strict';",
  leer('vna_logic.js'),
  leer('vna_form.js'),
  leer('vna_ui.js'),
  '})();',
].join('\n');

const salida = path.join(dir, 'sisep_vna_carga.user.js');
fs.writeFileSync(salida, cabecera + '\n' + cuerpo + '\n', 'utf8');
console.log('Escrito', salida, 'bytes', fs.statSync(salida).size);

// Módulos para la página de conversión (GitHub Pages en docs/).
const docs = path.join(dir, 'docs');
fs.mkdirSync(docs, { recursive: true });
['vna_logic.js'].forEach((f) => {
  fs.copyFileSync(path.join(dir, f), path.join(docs, f));
});
console.log('Módulos copiados a docs/');
