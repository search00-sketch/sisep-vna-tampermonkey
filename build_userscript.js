// Arma el userscript único para Tampermonkey: encabezado + polígonos de comunas + módulos.
// Uso: node build_userscript.js
const fs = require('fs');
const path = require('path');

const dir = __dirname;
// Tampermonkey compara la versión (@version) con este archivo y actualiza solo.
const URL_SCRIPT = 'https://raw.githubusercontent.com/search00-sketch/sisep-vna-tampermonkey/main/sisep_vna_carga.user.js';
const leer = (f) => fs.readFileSync(path.join(dir, f), 'utf8');

const comunas = JSON.parse(leer('comunas_compacto.json')).map((c) => ({ c: c.c, p: c.p }));

const cabecera = `// ==UserScript==
// @name         SISEP VNA - carga desde chat de WhatsApp (borrador)
// @namespace    local.vna
// @version      0.4.0
// @description  Lee el chat exportado de WhatsApp, asigna comuna con la API de USIG y completa el formulario VNA. Solo guarda borradores; nunca pulsa "Enviar".
// @match        https://sisep.seguridadciudad.gob.ar/v3.0/apps/formularios/*
// @connect      ws.usig.buenosaires.gob.ar
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// @updateURL    ${URL_SCRIPT}
// @downloadURL  ${URL_SCRIPT}
// @grant        GM_xmlhttpRequest
// @run-at       document-idle
// ==/UserScript==
`;

const cuerpo = [
  '(function () {',
  "'use strict';",
  `const VNA_COMUNAS = ${JSON.stringify(comunas)};`,
  leer('vna_logic.js'),
  leer('vna_usig.js'),
  leer('vna_form.js'),
  leer('vna_ui.js'),
  '})();',
].join('\n');

const salida = path.join(dir, 'sisep_vna_carga.user.js');
fs.writeFileSync(salida, cabecera + '\n' + cuerpo + '\n', 'utf8');
console.log('Escrito', salida, 'bytes', fs.statSync(salida).size);
