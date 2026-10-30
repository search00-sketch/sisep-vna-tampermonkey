// ==UserScript==
// @name         SISEP VNA - carga desde Excel de la página (borrador)
// @namespace    local.vna
// @version      1.2.1
// @description  Carga en el formulario VENTA NO AUTORIZADA las filas del Excel (o JSON) exportado por la página WhatsApp → SISEP, con las fotos de la carpeta. Solo guarda borradores; nunca pulsa "Enviar".
// @match        https://sisep.seguridadciudad.gob.ar/v3.0/apps/formularios/*
// @require      https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js
// @updateURL    https://raw.githubusercontent.com/search00-sketch/sisep-vna-tampermonkey/main/sisep_vna_carga.user.js
// @downloadURL  https://raw.githubusercontent.com/search00-sketch/sisep-vna-tampermonkey/main/sisep_vna_carga.user.js
// @run-at       document-idle
// ==/UserScript==

(function () {
'use strict';
// ---------- Lógica pura: chat de WhatsApp → filas del formulario (sin DOM ni red) ----------
// Estructura según la hoja MAPA de "DESARROLLO SISEP ACTUALIZADO.xlsx" (ítems 4, 5, 8, 15 y 16).

// Operativo → subnivel → zona. Clave '' = el operativo no tiene subnivel.
// Patrulla y Patrulla 4 AM son hojas: no piden zona (la comuna la toma el sistema por geolocalización).
const VNA_MAPA = {
  'Venta ilegal': {
    'Polígono': ['Avellaneda', 'Once', 'Retiro', 'Caminito', 'San Telmo', 'Corrientes Cultural',
      'Constitución', 'Liniers', 'Barrio Chino', 'Boulevard Cerviño', 'Parque Centenario',
      'Parque Patricios', 'Parque Los Andes', 'Mataderos', 'Florida', 'Plaza Francia', 'Plaza Serrano',
      'Parque 3 de Febrero', 'Parque Saavedra', 'Obelisco', 'Teatros', 'Parque Mujica', 'Plaza Arenales'],
    'Patrulla': [],
    'Patrulla 4 AM': [],
  },
  'Evento masivo': {
    '': ['Argentinos Juniors Estadio', 'Boca Juniors Estadio', 'River Plate Estadio', 'Campo Argentino de Polo',
      'Ferro Estadio', 'Huracán Estadio', 'Luna Park', 'Movistar Arena', 'All Boys Estadio', 'Parque de la Ciudad',
      'Riestra Estadio', 'San Lorenzo Estadio', 'Teatro de Flores', 'Vélez Sarsfield Estadio', 'Parque Roca',
      'La Rural', 'Parque Sarmiento', 'Microcentro'],
  },
  'Partido de fútbol': {
    '': ['Argentinos Juniors Estadio', 'Boca Juniors Estadio', 'River Plate Estadio', 'Ferro Estadio',
      'Huracán Estadio', 'All Boys Estadio', 'Riestra Estadio', 'San Lorenzo Estadio', 'Vélez Sarsfield Estadio'],
  },
};
const VNA_SUBNIVELES = ['Polígono', 'Patrulla', 'Patrulla 4 AM'];
const VNA_TIPOS = ['Secuestro', 'No secuestro', 'Acta de intimación'];
const VNA_MAX_FOTOS = 30;

// Clasificación de servicio con subclasificación (ítem 15). Solo se usa Relevamiento desde el chat.
const VNA_SUBCLASIFICACION = {
  'Relevamiento': ['MANTERO', 'PARRILLA', 'PUESTO SIN PERMISO', 'PUESTO CON PERMISO', 'VENDEDOR AMBULANTE',
    'FOOD TRUCK', 'ARTESANO', 'SIN INCIDENCIAS', 'DERIVADO'],
};

// Listas para los desplegables del Excel (ítems 4, 5 y 15 de la hoja MAPA).
const VNA_CLASIFICACIONES = ['Agresión', 'Consulta fiscalía', 'Derivado', 'Desalojo', 'Evento', 'Partido de fútbol',
  'Hoja de ruta', 'Punto crónico', 'Reclamo', 'SAME', 'Fuera de operatoria', 'Relevamiento'];
const VNA_ZONAS = [...new Set(Object.values(VNA_MAPA).flatMap((g) => Object.values(g).flat()))];

// Palabras del chat → subclasificación de Relevamiento. Lo que no coincide queda vacío (hay que elegirlo).
const VNA_REGLAS_SUB = [
  [/sin incidencias?/i, 'SIN INCIDENCIAS'],
  [/parrilla/i, 'PARRILLA'],
  [/mantero/i, 'MANTERO'],
  [/vendedor(es)? ambulante|vendedor(es)?\b/i, 'VENDEDOR AMBULANTE'],
  [/food ?truck/i, 'FOOD TRUCK'],
  [/artesan/i, 'ARTESANO'],
  [/puesto con permiso/i, 'PUESTO CON PERMISO'],
  [/puesto/i, 'PUESTO SIN PERMISO'],
];

function vnaSubRelevamiento(texto) {
  for (const [re, sub] of VNA_REGLAS_SUB) {
    if (re.test(texto)) return sub;
  }
  return '';
}

const VNA_HORA = '\\d{1,2}:\\d{2}(?::\\d{2})?(?:\\s?[ap]\\.?\\s?m\\.?)?';
const VNA_RE_ANDROID = new RegExp('^(\\d{1,2}/\\d{1,2}/\\d{2,4}), (' + VNA_HORA + ') - (.*)$', 'i');
const VNA_RE_IOS = new RegExp('^\\[(\\d{1,2}/\\d{1,2}/\\d{2,4}), (' + VNA_HORA + ')\\] (.*)$', 'i');
const VNA_RE_INVISIBLES = /[‎‏‪-‮⁦-⁩﻿]/g;
const VNA_RE_ADJUNTO = /archivo adjunto|file attached|<adjunto:|<attached:/i;
const VNA_RE_ARCHIVO = /([^\s<>():]+\.[A-Za-z0-9]{2,5})/;
const VNA_RE_RUIDO = /^<?(multimedia omitido|media omitted|mensaje eliminado|this message was deleted)/i;
const VNA_RE_EDITADO = /\s*<Se editó este mensaje\.?>/i;
const VNA_RE_ACTA = /\bAS\d{5,}\b/;
const VNA_RE_ARTICULOS = /Art[ií]culos?:\s*(\d+)/i;
const VNA_RE_BULTOS = /Bultos?:\s*(\d+)/i;
const VNA_RE_DIRECCION = /\d|^(av\.?|avenida|calle)\s/i;
const VNA_RE_SIN_INCIDENCIAS = /sin incidencias?/i;
const VNA_RE_EXPLICATIVO = /secuest|dep[oó]sito|descarg/i;
// "Dirección (observación) texto extra" → [dirección, observación, texto extra]
const VNA_RE_PARENTESIS = /^(.*?)\s*\(([^)]*)\)\s*(.*)$/;
const VNA_EXT_IMAGEN = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.gif'];

function vnaFechaHora(fecha, hora, dmy) {
  let [d, m, y] = fecha.split('/').map(Number);
  if (!dmy) { const t = d; d = m; m = t; }
  if (y < 100) y += 2000;
  const h = hora.trim().toLowerCase().replace(/\./g, '').replace(/ /g, '');
  const mt = h.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(am|pm)?/);
  let hh = Number(mt[1]);
  const mi = Number(mt[2]);
  const ss = Number(mt[3] || 0);
  if (mt[4] === 'pm' && hh < 12) hh += 12;
  if (mt[4] === 'am' && hh === 12) hh = 0;
  return new Date(y, m - 1, d, hh, mi, ss);
}

// Devuelve mensajes de usuario. Las líneas sin encabezado se pegan al mensaje anterior.
function vnaLeerMensajes(texto, dmy = true) {
  const mensajes = [];
  let ultimo = null;
  for (const crudo of texto.replace(/^﻿/, '').split(/\r?\n/)) {
    const linea = crudo.replace(VNA_RE_INVISIBLES, '').replace(/\s+$/, '');
    const m = linea.match(VNA_RE_ANDROID) || linea.match(VNA_RE_IOS);
    if (m) {
      const dt = vnaFechaHora(m[1], m[2], dmy);
      const autor = m[3].match(/^([^:]+?): ([\s\S]*)$/);
      if (autor) {
        ultimo = { dt, remitente: autor[1].trim(), texto: autor[2] };
        mensajes.push(ultimo);
      } else {
        ultimo = null; // mensaje de sistema
      }
    } else if (ultimo) {
      ultimo.texto += '\n' + linea;
    }
  }
  return mensajes;
}

// [nombreArchivo | null, pieDeFoto]
function vnaSepararAdjunto(texto) {
  const lineas = texto.split('\n');
  if (VNA_RE_ADJUNTO.test(lineas[0])) {
    const m = lineas[0].match(VNA_RE_ARCHIVO);
    if (m) return [m[1], lineas.slice(1).join('\n').trim()];
  }
  return [null, texto.trim()];
}

const vnaLimpiarLinea = (s) => s.replace(/\*/g, '').trim();

function vnaClasificar(texto, conFotos) {
  const datos = { tipo: '', clasif: '', direccion: '', observacion: '', acta: '', articulos: '', bultos: '' };
  const limpio = texto.replace(VNA_RE_EDITADO, '').trim();
  const lineas = limpio.split('\n').map(vnaLimpiarLinea).filter(Boolean);
  if (lineas.length) {
    // Los encabezados van en mayúsculas; "Secuestro de…" en un pie de foto no cuenta.
    const primera = lineas[0];
    let resto = null;
    if (primera.startsWith('SECUESTRO')) {
      datos.tipo = 'Secuestro';
      resto = primera.slice('SECUESTRO'.length).trim();
    } else if (primera.startsWith('RELEVAMIENTO')) {
      datos.tipo = 'No secuestro';
      datos.clasif = 'Relevamiento';
      resto = primera.slice('RELEVAMIENTO'.length).trim();
    }
    if (resto !== null) {
      if (resto) datos.direccion = resto;
      else if (lineas.length > 1) datos.direccion = lineas[1];
    }
  }
  if (!datos.tipo && conFotos && VNA_RE_SIN_INCIDENCIAS.test(limpio)) {
    // Foto de control de un punto con "Sin incidencias": es un relevamiento.
    datos.tipo = 'No secuestro';
    datos.clasif = 'Relevamiento';
  }
  if (!datos.direccion) {
    // Pie de foto que parece dirección (tiene altura o empieza con Av/Calle).
    for (const linea of lineas) {
      if (linea.length <= 80 && VNA_RE_DIRECCION.test(linea) && !VNA_RE_EXPLICATIVO.test(linea)) {
        datos.direccion = linea;
        break;
      }
    }
  }
  // "Av. Warnes 2175 (estación paternal)": lo de paréntesis es observación.
  const p = datos.direccion.match(VNA_RE_PARENTESIS);
  if (p) {
    datos.direccion = p[1].trim();
    datos.observacion = [p[2].trim(), p[3].trim()].filter(Boolean).join(' ');
  }
  const a = limpio.match(VNA_RE_ACTA);
  if (a) datos.acta = a[0];
  const ar = limpio.match(VNA_RE_ARTICULOS);
  if (ar) datos.articulos = ar[1];
  const b = limpio.match(VNA_RE_BULTOS);
  if (b) datos.bultos = b[1];
  return datos;
}

// Agrupa mensajes en reportes: las fotos del mismo remitente dentro de la ventana van al reporte abierto.
function vnaAgrupar(mensajes, ventanaMin) {
  const reportes = [];
  const abiertos = new Map(); // remitente -> { rep, dt }
  const ventana = ventanaMin * 60 * 1000;
  const nuevo = (dt, remitente, texto) => {
    const rep = { id: reportes.length + 1, dt, remitente, texto, fotos: [], videos: [] };
    reportes.push(rep);
    return rep;
  };
  for (const msg of mensajes) {
    const [archivo, pie] = vnaSepararAdjunto(msg.texto);
    const rem = msg.remitente;
    const dt = msg.dt;
    if (archivo === null) {
      if (VNA_RE_RUIDO.test(pie)) continue;
      const rep = nuevo(dt, rem, pie.replace(VNA_RE_EDITADO, '').trim());
      abiertos.set(rem, { rep, dt });
      continue;
    }
    const ab = abiertos.get(rem);
    let rep;
    if (pie || !ab || dt - ab.dt > ventana) {
      rep = nuevo(dt, rem, pie.replace(VNA_RE_EDITADO, '').trim());
    } else {
      rep = ab.rep;
    }
    abiertos.set(rem, { rep, dt });
    const ext = archivo.slice(archivo.lastIndexOf('.')).toLowerCase();
    if (VNA_EXT_IMAGEN.includes(ext)) rep.fotos.push(archivo);
    else rep.videos.push(archivo);
  }
  return reportes;
}

// Reglas de filas. Devuelve el objeto fila; la zona se completa a mano (solo Polígono).
function vnaPrepararFila(rep, operativo, subnivel) {
  const tieneFotos = rep.fotos.length > 0;
  const d = vnaClasificar(rep.texto, tieneFotos);
  let observacion = d.observacion;
  // Foto sin ningún texto: explicativa, no se carga (regla confirmada).
  if (!rep.texto && tieneFotos) observacion = 'Explicativa (foto sin texto)';
  // Foto con dirección y sin encabezado: relevamiento (regla confirmada).
  if (!d.tipo && tieneFotos && d.direccion) {
    d.tipo = 'No secuestro';
    d.clasif = 'Relevamiento';
  }
  // Sin dirección no se carga (depósito, explicativas, sin texto).
  const incluir = !!d.direccion && (!!d.tipo || tieneFotos);
  // Relevamiento: subclasificación según el texto. Secuestro: en SISEP solo se completa el Nº de acta.
  const subclasif = d.clasif === 'Relevamiento' ? vnaSubRelevamiento(rep.texto) : '';
  return {
    id: rep.id,
    incluir,
    fecha: rep.dt,
    direccion: d.direccion,
    observacion,
    operativo,
    subnivel: incluir ? subnivel : '',
    zona: '',
    necesitaZona: incluir && operativo === 'Venta ilegal' && subnivel === 'Polígono',
    tipo: d.tipo,
    clasif: d.clasif,
    subclasif,
    acta: d.acta,
    articulos: d.articulos,
    bultos: d.bultos,
    fotos: rep.fotos,
    videos: rep.videos,
    remitente: rep.remitente,
    texto: rep.texto,
  };
}

function vnaFechaISO(dt) {
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

function vnaHoraHHMM(dt) {
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

// Valida una fila antes de tocar el formulario. nombresFotos: Set de nombres en minúsculas cargados.
function vnaValidarFila(f, nombresFotos) {
  const errores = [];
  const grupo = VNA_MAPA[f.operativo];
  if (!grupo) {
    errores.push(`Operativo inválido: "${f.operativo}"`);
  } else {
    const clave = grupo[''] ? '' : (f.subnivel || '');
    const zonas = grupo[clave];
    if (!zonas) errores.push(`Subnivel inválido para ${f.operativo}: "${f.subnivel}"`);
    else if (zonas.length && !zonas.includes(f.zona)) {
      errores.push(f.zona ? `Zona inválida: "${f.zona}"` : 'Falta la zona');
    }
  }
  if (!VNA_TIPOS.includes(f.tipo)) errores.push(`Tipo de procedimiento inválido: "${f.tipo}"`);
  if (f.tipo === 'Secuestro' && !f.acta) errores.push('Falta el Nº de acta de secuestro');
  if (f.tipo === 'No secuestro') {
    if (!f.clasif) errores.push('Falta la clasificación de servicio');
    const subs = VNA_SUBCLASIFICACION[f.clasif];
    if (subs && !subs.includes(f.subclasif)) {
      errores.push(f.subclasif ? `Subclasificación inválida: "${f.subclasif}"` : `Falta la subclasificación de ${f.clasif}`);
    }
  }
  if (!f.direccion) errores.push('Falta la dirección');
  if (f.fotos.length > VNA_MAX_FOTOS) errores.push(`Más de ${VNA_MAX_FOTOS} fotos (${f.fotos.length})`);
  const faltan = f.fotos.filter((n) => !nombresFotos.has(n.toLowerCase()));
  if (faltan.length) errores.push(`Fotos no cargadas en el panel: ${faltan.join(', ')}`);
  return errores;
}

// ---------- Contrato JSON entre la página de conversión y el script de SISEP ----------
// Versión "vna-filas-v2": incluye la subclasificación.

const VNA_SCHEMA = 'vna-filas-v2';
const VNA_SCHEMAS_ACEPTADOS = ['vna-filas-v1', 'vna-filas-v2'];

function vnaFechaLocalISO(dt) {
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}T${p(dt.getHours())}:${p(dt.getMinutes())}:00`;
}

// todas: filas de vnaPrepararFila (con zona y tipo ya resueltos en la página)
function vnaFilasAJson(todas, meta) {
  return {
    schema: VNA_SCHEMA,
    generado: new Date().toISOString(),
    chat: meta.chat || '',
    filas: todas.map((f) => ({
      id: f.id,
      incluir: !!f.incluir,
      fecha: vnaFechaLocalISO(f.fecha),
      direccion: f.direccion,
      observacion: f.observacion,
      operativo: f.operativo,
      subnivel: f.subnivel,
      zona: f.zona,
      tipo: f.tipo,
      clasif: f.clasif,
      subclasif: f.subclasif || '',
      acta: f.acta,
      articulos: f.articulos,
      bultos: f.bultos,
      fotos: f.fotos,
      videos: f.videos,
      remitente: f.remitente,
      texto: f.texto,
    })),
  };
}

// Devuelve las filas a cargar (incluir = true) con fecha como Date, listas para vnaCargarFila.
function vnaFilasDesdeJson(obj) {
  if (!obj || !VNA_SCHEMAS_ACEPTADOS.includes(obj.schema) || !Array.isArray(obj.filas)) {
    throw new Error('El archivo no es una exportación de la página (schema inválido)');
  }
  return obj.filas
    .filter((f) => f.incluir)
    .map((f) => Object.assign({}, f, { subclasif: f.subclasif || '', fecha: new Date(f.fecha) }));
}

// ---------- Excel (hoja "Reportes" exportada por la página) → filas ----------
// objs: filas tal como las lee SheetJS (sheet_to_json). ssf: XLSX.SSF (opcional, para fechas como número).

function vnaTexto(v) {
  return v == null ? '' : String(v).trim();
}

function vnaFechaCelda(v, ssf) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'number' && ssf) {
    const d = ssf.parse_date_code(v);
    return new Date(d.y, d.m - 1, d.d);
  }
  const m = vnaTexto(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1])) : null;
}

function vnaHoraCelda(v) {
  if (v instanceof Date) return [v.getHours(), v.getMinutes()];
  if (typeof v === 'number') {
    const total = Math.round((v - Math.floor(v)) * 1440);
    return [Math.floor(total / 60) % 24, total % 60];
  }
  const m = vnaTexto(v).match(/^(\d{1,2}):(\d{2})/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}

function vnaSeparar(s) {
  return vnaTexto(s).split(';').map((x) => x.trim()).filter(Boolean);
}

function vnaFilasDesdeHoja(objs, ssf) {
  const filas = [];
  objs.forEach((r) => {
    if (!/^si$/i.test(vnaTexto(r['Incluir']))) return;
    const fecha = vnaFechaCelda(r['Fecha'], ssf);
    const hora = vnaHoraCelda(r['Hora']);
    if (!fecha || !hora) {
      throw new Error(`Reporte ${vnaTexto(r['ID'])}: fecha u hora no válidas (usar dd/mm/aaaa y hh:mm)`);
    }
    fecha.setHours(hora[0], hora[1], 0, 0);
    filas.push({
      id: r['ID'],
      incluir: true,
      fecha,
      direccion: vnaTexto(r['Dirección']),
      observacion: vnaTexto(r['Observación']),
      operativo: vnaTexto(r['Operativo']),
      subnivel: vnaTexto(r['Subnivel']),
      zona: vnaTexto(r['Zona']),
      tipo: vnaTexto(r['Tipo de procedimiento']),
      clasif: vnaTexto(r['Clasificación de servicio']),
      subclasif: vnaTexto(r['Subclasificación']),
      acta: vnaTexto(r['Nº de acta de secuestro']),
      articulos: vnaTexto(r['Artículos']),
      bultos: vnaTexto(r['Bultos']),
      fotos: vnaSeparar(r['Fotos']),
      videos: vnaSeparar(r['Videos (no se cargan)']),
      remitente: vnaTexto(r['Remitente']),
      texto: vnaTexto(r['Texto']),
    });
  });
  return filas;
}

// ---------- Automatización del formulario (solo DOM). Nunca pulsa "Enviar". ----------

const VNA_TIMEOUT = 5000;
const vnaSleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function vnaEsperar(fn, ms = VNA_TIMEOUT) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await vnaSleep(150);
  }
  return null;
}

const vnaLimpiarTexto = (s) => s.replace(/\*/g, '').replace(/\s+/g, ' ').trim();
// Las etiquetas traen el texto del icono delante ("image Galería", "photo_camera Cámara").
const vnaEsEtiqueta = (l, texto) => {
  const t = vnaLimpiarTexto(l.textContent);
  return t === texto || t.endsWith(' ' + texto);
};

const vnaForm = () => document.querySelector('form');
const vnaEtiquetas = () => (vnaForm() ? Array.from(vnaForm().querySelectorAll('label')) : []);

function vnaEtiqueta(texto) {
  const l = vnaEtiquetas().find((x) => vnaEsEtiqueta(x, texto));
  if (!l) throw new Error(`No encuentro el campo "${texto}"`);
  return l;
}

// Control (input) que sigue a una etiqueta, antes de la siguiente etiqueta.
function vnaControlDespues(label, selector = 'input') {
  const todos = Array.from(vnaForm().querySelectorAll('label, input'));
  const i = todos.indexOf(label);
  for (let j = i + 1; j < todos.length; j++) {
    if (todos[j].tagName === 'LABEL') return null;
    if (todos[j].matches(selector)) return todos[j];
  }
  return null;
}

function vnaControl(texto, selector = 'input') {
  const c = vnaControlDespues(vnaEtiqueta(texto), selector);
  if (!c) throw new Error(`No encuentro el control de "${texto}"`);
  return c;
}

// Etiquetas de la cascada: las que están entre "Operativo" y "Tipo de procedimiento".
function vnaEtiquetasCascada() {
  const todas = vnaEtiquetas();
  const ini = todas.findIndex((x) => vnaEsEtiqueta(x, 'Operativo'));
  const fin = todas.findIndex((x) => vnaEsEtiqueta(x, 'Tipo de procedimiento'));
  if (ini < 0 || fin < 0) return [];
  return todas.slice(ini + 1, fin);
}

function vnaSetValue(el, valor) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(el, valor);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// El desplegable reacciona a mousedown/mouseup/click, no solo a click().
function vnaPulsar(el) {
  ['mousedown', 'mouseup', 'click'].forEach((t) =>
    el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true })));
}

function vnaOpcionVisible(texto) {
  return Array.from(document.querySelectorAll('[role="option"]'))
    .find((o) => o.offsetParent !== null && vnaNormalizar(o.textContent.trim()) === vnaNormalizar(texto)) || null;
}

async function vnaElegirOpcion(input, valor) {
  input.focus();
  vnaPulsar(input);
  const opcion = await vnaEsperar(() => vnaOpcionVisible(valor));
  if (!opcion) throw new Error(`No encuentro la opción "${valor}" en el desplegable`);
  vnaPulsar(opcion);
  await vnaSleep(300);
}

const vnaNormalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Escribe la dirección y elige la sugerencia que contiene el nombre de la calle.
async function vnaElegirDireccion(input, texto) {
  input.focus();
  vnaSetValue(input, texto);
  const calle = vnaNormalizar(texto.replace(/\d.*$/, '').replace(/^(av\.?|avenida|calle)\s+/i, '').trim());
  if (!calle) throw new Error(`No se reconoce la calle en "${texto}"`);
  const sugerencia = await vnaEsperar(() => Array.from(document.querySelectorAll('[role="option"]'))
    .find((o) => o.offsetParent !== null && vnaNormalizar(o.textContent).includes(calle)) || null);
  if (!sugerencia) throw new Error(`Ninguna sugerencia de dirección coincide con "${calle}"`);
  const elegido = sugerencia.textContent.trim();
  vnaPulsar(sugerencia);
  await vnaSleep(300);
  return elegido;
}

function vnaAdjuntarFotos(inputFile, archivos) {
  const dt = new DataTransfer();
  archivos.forEach((f) => dt.items.add(f));
  inputFile.files = dt.files;
  inputFile.dispatchEvent(new Event('change', { bubbles: true }));
}

// Carga una fila completa en el formulario abierto. fila: salida de vnaPrepararFila + zona.
async function vnaCargarFila(fila, archivosPorNombre) {
  if (!vnaForm()) throw new Error('No está abierto el formulario de VNA');

  vnaSetValue(vnaControl('Fecha', 'input[type="date"]'), vnaFechaISO(fila.fecha));
  vnaSetValue(vnaControl('Horario', 'input[type="time"]'), vnaHoraHHMM(fila.fecha));
  const direccion = await vnaElegirDireccion(vnaControl('Dirección y altura'), fila.direccion);

  await vnaElegirOpcion(vnaControl('Operativo'), fila.operativo);
  const pasos = [fila.subnivel, fila.zona].filter(Boolean);
  for (let i = 0; i < pasos.length; i++) {
    const cascada = await vnaEsperar(() => {
      const c = vnaEtiquetasCascada();
      return c.length > i ? c : null;
    });
    if (!cascada) throw new Error(`No apareció el desplegable ${i + 1} de la cascada (esperaba "${pasos[i]}")`);
    await vnaElegirOpcion(vnaControlDespues(cascada[i]), pasos[i]);
  }
  await vnaSleep(300);
  if (vnaEtiquetasCascada().length !== pasos.length) {
    throw new Error(`La cascada tiene ${vnaEtiquetasCascada().length} niveles y se esperaban ${pasos.length}`);
  }

  await vnaElegirOpcion(vnaControl('Tipo de procedimiento'), fila.tipo);
  await vnaSleep(400); // aparecen los subcampos del tipo

  if (fila.tipo === 'Secuestro' && fila.acta) {
    vnaSetValue(vnaControl('Nº de acta de secuestro'), fila.acta);
  }
  if (fila.tipo === 'No secuestro' && fila.clasif) {
    await vnaElegirOpcion(vnaControl('Clasificación de servicio'), fila.clasif);
    if (fila.subclasif) {
      // La subclasificación aparece como un desplegable nuevo con el nombre de la clasificación elegida.
      const sub = await vnaEsperar(() => vnaEtiquetas().find((l) => vnaEsEtiqueta(l, fila.clasif) && vnaControlDespues(l)), 5000);
      if (!sub) throw new Error('No apareció el desplegable de ' + fila.clasif);
      await vnaElegirOpcion(vnaControlDespues(sub), fila.subclasif);
    }
  }

  if (fila.fotos.length) {
    const archivos = fila.fotos.map((n) => archivosPorNombre.get(n.toLowerCase()));
    vnaAdjuntarFotos(vnaControl('Galería', 'input[type="file"]'), archivos);
    await vnaSleep(500);
  }
  return { direccion };
}

// Solo guarda borrador si la casilla está marcada. Nunca pulsa "Enviar".
function vnaGuardarBorrador() {
  const boton = Array.from(document.querySelectorAll('button'))
    .find((b) => b.textContent.includes('Guardar borrador'));
  if (!boton) throw new Error('No encuentro el botón "Guardar borrador"');
  boton.click();
}

// ---------- Panel en SISEP: carga el JSON de la página de conversión + la carpeta de fotos ----------

const VNA_ESTADO = {
  filas: [],          // filas a cargar (desde el JSON)
  hechas: new Set(),  // ids cargados u omitidos en esta sesión
  corriendo: false,
  frenar: false,
  gate: null,         // resolución de la pausa "revisar cada fila"
  fotos: new Map(),   // nombre en minúsculas -> File
  nombreJson: '',
};

const vnaEl = (id) => document.getElementById(id);
const vnaPendientes = () => VNA_ESTADO.filas.filter((f) => !VNA_ESTADO.hechas.has(f.id));

function vnaMostrar(texto) {
  const e = vnaEl('vna-estado');
  if (e) e.textContent = texto;
}

const vnaEsc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const VNA_CSS = `
#vna-panel{position:fixed;top:8px;right:8px;bottom:8px;width:min(560px,96vw);z-index:99999;overflow:auto;
  background:#f4f6f3;color:#1c231f;font:13px/1.35 'IBM Plex Sans',system-ui,sans-serif;border-radius:12px;padding:14px;
  box-shadow:0 8px 30px rgba(0,0,0,.35);box-sizing:border-box;border:1px solid #d3d8cd}
@media (prefers-color-scheme: dark){#vna-panel{background:#151b16;color:#e7ede6;border-color:#374035}}
#vna-panel *{box-sizing:border-box}
#vna-panel .eyebrow{text-transform:uppercase;letter-spacing:.09em;font-size:11px;font-weight:600;color:#0f6e5c}
#vna-panel h1{margin:2px 0 8px;font-size:18px;font-weight:700}
#vna-panel .card{background:#fff;border:1px solid #d3d8cd;border-radius:10px;padding:10px;margin-bottom:10px}
@media (prefers-color-scheme: dark){#vna-panel .card{background:#1c231e;border-color:#374035}}
#vna-panel .card h2{margin:0 0 6px;font-size:13px;font-weight:600}
#vna-panel .hint{font-size:11px;color:#8a9689}
#vna-panel .dropzone{border:1.5px dashed #d3d8cd;border-radius:8px;padding:12px;text-align:center;color:#5c6b5e;display:block;cursor:pointer;font-size:12px}
#vna-panel .dropzone:hover{border-color:#0f6e5c;background:#e2f1ec}
#vna-panel .fname{margin-top:4px;font-weight:600;font-size:11.5px;word-break:break-all}
#vna-panel button{font:inherit;font-size:12px;font-weight:600;padding:6px 10px;border-radius:7px;border:1px solid #d3d8cd;background:#eaede6;color:#1c231f;cursor:pointer;margin:2px}
#vna-panel button.primary{background:#0f6e5c;border-color:#0f6e5c;color:#fff}
#vna-panel button.danger{color:#a3352a}
#vna-panel button:disabled{opacity:.45;cursor:not-allowed}
#vna-panel label.check{display:flex;gap:6px;align-items:center;font-size:12px;margin:3px 0}
#vna-panel table{border-collapse:collapse;width:100%;font-size:11.5px}
#vna-panel th{text-align:left;font-size:10px;text-transform:uppercase;color:#5c6b5e;padding:4px;border-bottom:1px solid #d3d8cd}
#vna-panel td{padding:4px;border-bottom:1px solid #d3d8cd;vertical-align:top}
#vna-panel .table-wrap{max-height:230px;overflow:auto;border:1px solid #d3d8cd;border-radius:8px}
#vna-panel .pill{display:inline-block;padding:1px 7px;border-radius:100px;font-size:10px;font-weight:600;border:1px solid transparent}
#vna-panel .pill.ok{background:#e0f3e2;color:#1e6b34;border-color:#b7ddb9}
#vna-panel .pill.warn{background:#fdf1d6;color:#8a5a09;border-color:#f0d693}
#vna-panel pre.estado{margin:0;white-space:pre-wrap;font:12px/1.4 'IBM Plex Mono',monospace;color:#5c6b5e;max-height:140px;overflow:auto}
#vna-panel .pausa{display:none;gap:6px;align-items:center;flex-wrap:wrap;padding:6px;border:1px dashed #0f6e5c;border-radius:8px;background:#e2f1ec}
`;

function vnaInstalarCss() {
  if (vnaEl('vna-css')) return;
  const s = document.createElement('style');
  s.id = 'vna-css';
  s.textContent = VNA_CSS;
  document.head.appendChild(s);
}

// ---------- Tabla y estado ----------

function vnaEstadoFila(f) {
  if (VNA_ESTADO.hechas.has(f.id)) return ['ok', 'cargada'];
  const falta = [];
  if (f.fotos.length && !VNA_ESTADO.fotos.size) falta.push('carpeta de fotos');
  else if (f.fotos.some((n) => !VNA_ESTADO.fotos.has(n.toLowerCase()))) falta.push('fotos');
  if (falta.length) return ['warn', 'falta ' + falta.join(', ')];
  return ['ok', 'lista'];
}

function vnaRenderTabla() {
  const t = vnaEl('vna-tbody');
  if (!t) return;
  if (!VNA_ESTADO.filas.length) {
    t.innerHTML = '<tr><td colspan="6">Elegí el JSON exportado desde la página.</td></tr>';
  } else {
    t.innerHTML = VNA_ESTADO.filas.map((f, i) => {
      const e = vnaEstadoFila(f);
      const fecha = f.fecha.toLocaleDateString('es-AR') + ' ' + f.fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      return `<tr><td>${i + 1}</td><td>${vnaEsc(fecha)}</td><td>${vnaEsc(f.direccion)}</td>` +
        `<td>${vnaEsc(f.tipo)}</td><td>${vnaEsc(f.zona)}</td><td><span class="pill ${e[0]}">${vnaEsc(e[1])}</span></td></tr>`;
    }).join('');
  }
  vnaActualizarBotones();
}

function vnaActualizarBotones() {
  const hay = vnaPendientes().length > 0;
  const libre = !VNA_ESTADO.corriendo;
  const set = (id, v) => { const e = vnaEl(id); if (e) e.disabled = v; };
  set('vna-siguiente', !hay || !libre);
  set('vna-todas', !hay || !libre);
  set('vna-saltar', !hay || !libre);
  set('vna-frenar', !VNA_ESTADO.corriendo);
}

// ---------- Carga ----------

// Abre un formulario nuevo: sale a la lista y vuelve (así se limpia lo que quedó cargado).
async function vnaNuevoFormulario() {
  location.hash = '#/app/lista';
  await vnaSleep(800);
  location.hash = '#/app/nuevo/37';
  const ok = await vnaEsperar(() => vnaForm() && vnaEtiquetas().length > 3, 10000);
  if (!ok) throw new Error('No se abrió el formulario nuevo');
  await vnaSleep(500);
}

function vnaPausa(texto) {
  return new Promise((ok) => {
    VNA_ESTADO.gate = ok;
    vnaMostrar(texto);
    vnaEl('vna-pausa').style.display = 'flex';
  });
}

function vnaResolverPausa(valor) {
  if (!VNA_ESTADO.gate) return;
  const g = VNA_ESTADO.gate;
  VNA_ESTADO.gate = null;
  vnaEl('vna-pausa').style.display = 'none';
  g(valor);
}

// Carga una fila. Devuelve 'ok', 'omitida' o 'frenada'.
async function vnaUnaFila(fila) {
  const numero = VNA_ESTADO.filas.indexOf(fila) + 1;
  const nombre = `Fila ${numero} de ${VNA_ESTADO.filas.length} (reporte ${fila.id})`;
  const errores = vnaValidarFila(fila, new Set(VNA_ESTADO.fotos.keys()));
  if (errores.length) throw new Error(`${nombre}: ${errores.join(' | ')}`);

  vnaMostrar(`${nombre}: cargando…`);
  const { direccion } = await vnaCargarFila(fila, VNA_ESTADO.fotos);

  const guardar = vnaEl('vna-borrador').checked;
  // Sin borrador automático, la revisión es obligatoria: si no, la fila se pierde al cambiar de formulario.
  const revisar = vnaEl('vna-revisar').checked || !guardar;
  if (revisar) {
    const v = await vnaPausa(`${nombre}: completada. Dirección: ${direccion}\n` +
      (guardar ? 'Revisá y tocá CONTINUAR para guardar el borrador.' : 'Guardá vos el borrador y tocá CONTINUAR.'));
    if (v === 'frenar') return 'frenada';
    if (v === 'omitir') { VNA_ESTADO.hechas.add(fila.id); return 'omitida'; }
  }
  if (guardar) {
    vnaGuardarBorrador();
    await vnaSleep(2500); // dar tiempo a que se guarde antes de cambiar de formulario
  }
  VNA_ESTADO.hechas.add(fila.id);
  vnaMostrar(`${nombre}: OK\nDirección: ${direccion}${guardar ? '\nBorrador guardado.' : ''}`);
  return 'ok';
}

async function vnaCorrer(soloUna) {
  if (VNA_ESTADO.corriendo) return;
  if (!vnaPendientes().length) { vnaMostrar('Terminaron las filas.'); return; }
  const cantidad = soloUna ? 1 : vnaPendientes().length;
  const guardar = vnaEl('vna-borrador').checked;
  if (!soloUna && !confirm(`Se completan ${cantidad} fila(s) en el formulario ` +
    `${guardar ? 'y se guardan como borrador' : 'sin guardar (revisás cada una)'}. ¿Seguir?`)) return;

  VNA_ESTADO.corriendo = true;
  VNA_ESTADO.frenar = false;
  vnaActualizarBotones();
  try {
    await vnaNuevoFormulario();
    let fila = vnaPendientes()[0];
    while (fila && !VNA_ESTADO.frenar) {
      const r = await vnaUnaFila(fila);
      vnaRenderTabla();
      if (r === 'frenada' || soloUna) break;
      await vnaNuevoFormulario();
      fila = vnaPendientes()[0];
    }
    if (VNA_ESTADO.frenar) vnaMostrar('Corrida frenada. Seguí con "Cargar siguiente fila".');
    else if (!vnaPendientes().length) vnaMostrar('Terminaron las filas.');
  } catch (e) {
    vnaMostrar(`ERROR: ${e.message}\nLa corrida se detuvo. Corregí el formulario o usá "Saltar fila" y volvé a cargar.`);
  } finally {
    VNA_ESTADO.corriendo = false;
    VNA_ESTADO.frenar = false;
    vnaResolverPausa('frenar');
    vnaRenderTabla();
  }
}

// ---------- Panel ----------

function vnaCrearPanel() {
  if (vnaEl('vna-panel')) return;
  vnaInstalarCss();
  const p = document.createElement('div');
  p.id = 'vna-panel';
  p.innerHTML =
    '<span class="eyebrow">Venta no autorizada · SISEP</span>' +
    '<h1>Carga desde el Excel <small style="font-size:11px;font-weight:400;opacity:.6">v1.1.0</small></h1>' +
    '<div class="card"><h2>1 · Excel corregido (o JSON)</h2>' +
      '<input type="file" id="vna-json" accept=".xlsx,.xls,.json" style="width:100%">' +
      '<div class="hint" id="vna-json-nombre"></div></div>' +
    '<div class="card"><h2>2 · Carpeta de fotos</h2>' +
      '<label class="dropzone" for="vna-fotos">Elegí la CARPETA con las fotos del chat<div class="fname" id="vna-fotos-n"></div>' +
      '<input type="file" id="vna-fotos" webkitdirectory multiple style="display:none"></label></div>' +
    '<div class="card"><h2>Filas</h2><div class="table-wrap"><table>' +
      '<thead><tr><th>#</th><th>Fecha</th><th>Dirección</th><th>Tipo</th><th>Zona</th><th>Estado</th></tr></thead>' +
      '<tbody id="vna-tbody"></tbody></table></div></div>' +
    '<div class="card"><h2>Carga en SISEP</h2>' +
      '<label class="check"><input type="checkbox" id="vna-borrador" checked> Guardar borrador al cargar</label>' +
      '<label class="check"><input type="checkbox" id="vna-revisar" checked> Revisar cada fila antes de seguir</label>' +
      '<div>' +
        '<button id="vna-siguiente" class="primary" disabled>Cargar siguiente fila</button>' +
        '<button id="vna-todas" class="primary" disabled>Cargar todas</button>' +
        '<button id="vna-saltar" disabled>Saltar fila</button>' +
        '<button id="vna-frenar" class="danger" disabled>Frenar</button></div>' +
      '<div id="vna-pausa" class="pausa"><button id="vna-continuar" class="primary">Continuar</button>' +
        '<button id="vna-omitir">Omitir fila</button></div>' +
      '<pre class="estado" id="vna-estado">Elegí el JSON y la carpeta de fotos.</pre></div>';
  document.body.appendChild(p);

  vnaEl('vna-json').addEventListener('change', async (ev) => {
    const archivo = ev.target.files[0];
    if (!archivo) return;
    try {
      let filas;
      let chat = '';
      if (/.json$/i.test(archivo.name)) {
        const obj = JSON.parse(await archivo.text());
        filas = vnaFilasDesdeJson(obj);
        chat = obj.chat || '';
      } else {
        if (typeof XLSX === 'undefined') throw new Error('falta la librería de Excel: instalá el script con Tampermonkey');
        const wb = XLSX.read(await archivo.arrayBuffer(), { type: 'array', cellDates: true });
        const objs = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true });
        filas = vnaFilasDesdeHoja(objs, XLSX.SSF);
      }
      VNA_ESTADO.filas = filas;
      VNA_ESTADO.hechas = new Set();
      VNA_ESTADO.nombreJson = archivo.name;
      vnaEl('vna-json-nombre').textContent = `${archivo.name} · ${VNA_ESTADO.filas.length} filas a cargar` +
        (chat ? ` · chat ${chat}` : '');
      vnaMostrar(VNA_ESTADO.filas.length ? 'Listo. Elegí la carpeta de fotos y cargá.' : 'El JSON no tiene filas para cargar.');
      vnaRenderTabla();
    } catch (e) {
      vnaMostrar('No pude leer el JSON: ' + e.message);
    }
  });

  vnaEl('vna-fotos').addEventListener('change', (ev) => {
    VNA_ESTADO.fotos = new Map();
    Array.from(ev.target.files)
      .filter((f) => /\.(jpe?g|png|webp|heic|gif)$/i.test(f.name))
      .forEach((f) => VNA_ESTADO.fotos.set(f.name.toLowerCase(), f));
    vnaEl('vna-fotos-n').textContent = `${VNA_ESTADO.fotos.size} fotos`;
    vnaRenderTabla();
  });

  vnaEl('vna-siguiente').addEventListener('click', () => vnaCorrer(true));
  vnaEl('vna-todas').addEventListener('click', () => vnaCorrer(false));
  vnaEl('vna-saltar').addEventListener('click', () => {
    const f = vnaPendientes()[0];
    if (VNA_ESTADO.corriendo || !f) return;
    VNA_ESTADO.hechas.add(f.id);
    vnaMostrar(`Saltada: reporte ${f.id}.`);
    vnaRenderTabla();
  });
  vnaEl('vna-frenar').addEventListener('click', () => {
    VNA_ESTADO.frenar = true;
    vnaResolverPausa('frenar');
    vnaMostrar('Frenando después de la fila en curso…');
  });
  vnaEl('vna-continuar').addEventListener('click', () => vnaResolverPausa('continuar'));
  vnaEl('vna-omitir').addEventListener('click', () => vnaResolverPausa('omitir'));
  vnaRenderTabla();
}

function vnaIniciar() {
  if (!vnaForm() && !location.hash.includes('/app/nuevo/')) return;
  vnaCrearPanel();
}

vnaIniciar();
window.addEventListener('hashchange', vnaIniciar);

})();
