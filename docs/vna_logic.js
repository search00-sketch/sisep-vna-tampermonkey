// ---------- Lógica pura: chat de WhatsApp → filas del formulario (sin DOM ni red) ----------

const VNA_MAPA = {
  'Venta ilegal': {
    'Polígono': ['Avellaneda', 'Once', 'Retiro', 'Caminito', 'San Telmo', 'Corrientes Cultural', 'Constitución', 'Liniers', 'Barrio Chino', 'Boulevard Cerviño', 'Parque Centenario', 'Parque Patricios', 'Parque Los Andes', 'Mataderos', 'Florida', 'Plaza Francia', 'Plaza Serrano', 'Parque 3 de Febrero', 'Parque Saavedra', 'Obelisco', 'Teatros'],
    'Patrulla': ['Comuna 1', 'Comuna 2', 'Comuna 3', 'Comuna 4', 'Comuna 5', 'Comuna 6', 'Comuna 7', 'Comuna 8', 'Comuna 9', 'Comuna 10', 'Comuna 11', 'Comuna 12', 'Comuna 13', 'Comuna 14', 'Comuna 15'],
  },
  'Evento masivo': {
    '': ['Comuna 1', 'Comuna 2', 'Comuna 3', 'Comuna 4', 'Comuna 5', 'Comuna 6', 'Comuna 7', 'Comuna 8', 'Comuna 9', 'Comuna 10', 'Comuna 11', 'Comuna 12', 'Comuna 13', 'Comuna 14', 'Comuna 15', 'Argentinos Juniors Estadio', 'Boca Juniors Estadio', 'River Plate Estadio', 'Campo Argentino de Polo', 'Ferro Estadio', 'Huracán Estadio', 'Luna Park', 'Movistar Arena', 'All Boys Estadio', 'Parque de la Ciudad', 'Riestra Estadio', 'San Lorenzo Estadio', 'Teatro de Flores', 'Vélez Sarsfield Estadio', 'Parque Roca', 'La Rural', 'Parque Sarmiento', 'Microcentro'],
  },
  'Partido de fútbol': {
    '': ['Argentinos Juniors Estadio', 'Boca Juniors Estadio', 'River Plate Estadio', 'Ferro Estadio', 'Huracán Estadio', 'All Boys Estadio', 'Riestra Estadio', 'San Lorenzo Estadio', 'Vélez Sarsfield Estadio'],
  },
};
const VNA_TIPOS = ['Secuestro', 'No secuestro', 'Acta de intimación'];
const VNA_MAX_FOTOS = 30;

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

// Reglas de filas (idénticas al conversor Python). Devuelve el objeto fila sin Zona todavía.
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
  const necesitaZona = incluir && operativo === 'Venta ilegal' && subnivel === 'Patrulla';
  return {
    id: rep.id,
    incluir,
    fecha: rep.dt,
    direccion: d.direccion,
    observacion,
    operativo,
    subnivel: incluir ? subnivel : '',
    zona: '',
    necesitaZona,
    tipo: d.tipo,
    clasif: d.clasif,
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
    else if (f.zona && !zonas.includes(f.zona)) errores.push(`Zona inválida: "${f.zona}"`);
    else if (!f.zona) errores.push('Falta la zona');
  }
  if (!VNA_TIPOS.includes(f.tipo)) errores.push(`Tipo de procedimiento inválido: "${f.tipo}"`);
  if (!f.direccion) errores.push('Falta la dirección');
  if (f.fotos.length > VNA_MAX_FOTOS) errores.push(`Más de ${VNA_MAX_FOTOS} fotos (${f.fotos.length})`);
  const faltan = f.fotos.filter((n) => !nombresFotos.has(n.toLowerCase()));
  if (faltan.length) errores.push(`Fotos no cargadas en el panel: ${faltan.join(', ')}`);
  return errores;
}

// Ubicación de un punto en el polígono de comunas (ray casting). anillo: [[lon, lat], ...]
function vnaEnAnillo(lon, lat, anillo) {
  let dentro = false;
  for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
    const [xi, yi] = anillo[i];
    const [xj, yj] = anillo[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

function vnaComunaDePunto(lon, lat, comunas) {
  for (const c of comunas) {
    for (const anillo of c.p) {
      if (vnaEnAnillo(lon, lat, anillo)) return `Comuna ${c.c}`;
    }
  }
  return '';
}

// ---------- Contrato JSON entre la página de conversión y el script de SISEP ----------
// Versión "vna-filas-v1": la página exporta; el script solo lee.

const VNA_SCHEMA = 'vna-filas-v1';

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
  if (!obj || obj.schema !== VNA_SCHEMA || !Array.isArray(obj.filas)) {
    throw new Error('El archivo no es una exportación de la página (schema ' + VNA_SCHEMA + ')');
  }
  return obj.filas
    .filter((f) => f.incluir)
    .map((f) => Object.assign({}, f, { fecha: new Date(f.fecha) }));
}
