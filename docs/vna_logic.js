// ---------- Lógica pura: chat de WhatsApp → filas del formulario (sin DOM ni red) ----------
// Estructura según la hoja MAPA de "DESARROLLO FORMULARIO SISEP.xlsx" (ítems 4, 5, 8, 15, 16 y 18).

// Operativo → subnivel → zona. Clave '' = el operativo no tiene subnivel.
// Patrulla y Patrulla 4 AM son hojas: no piden zona (la comuna la toma el sistema por geolocalización).
// "Otros" (Evento y Partido) abre en el formulario un campo de texto libre que el script todavía no completa.
const VNA_POLIGONOS = ['Avellaneda', 'Once', 'Retiro', 'Caminito', 'San Telmo', 'Corrientes Cultural',
  'Constitución', 'Liniers', 'Barrio Chino', 'Boulevard Cerviño', 'Parque Centenario',
  'Parque Patricios', 'Parque Los Andes', 'Mataderos', 'Florida', 'Plaza Francia', 'Plaza Serrano',
  'Parque 3 de Febrero', 'Parque Saavedra', 'Obelisco', 'Teatros', 'Parque Mujica', 'Plaza Arenales']
  .map((z) => `${z} Polígono`);

const VNA_MAPA = {
  'Venta ilegal': {
    'Polígono': VNA_POLIGONOS,
    'Patrulla': [],
    'Patrulla 4 AM': [],
  },
  'Evento masivo': {
    '': ['Argentinos Juniors Estadio', 'Boca Juniors Estadio', 'River Plate Estadio', 'Campo Argentino de Polo',
      'Ferro Estadio', 'Huracán Estadio', 'Luna Park', 'Movistar Arena', 'All Boys Estadio', 'Parque de la Ciudad',
      'Riestra Estadio', 'San Lorenzo Estadio', 'Teatro de Flores', 'Vélez Sarsfield Estadio', 'Parque Roca',
      'La Rural', 'Parque Sarmiento', 'Microcentro', 'Otros'],
  },
  'Partido de fútbol': {
    '': ['Argentinos Juniors Estadio', 'Boca Juniors Estadio', 'River Plate Estadio', 'Ferro Estadio',
      'Huracán Estadio', 'All Boys Estadio', 'Riestra Estadio', 'San Lorenzo Estadio', 'Vélez Sarsfield Estadio', 'Otros'],
  },
};
const VNA_SUBNIVELES = ['Polígono', 'Patrulla', 'Patrulla 4 AM'];
const VNA_TIPOS = ['Secuestro', 'No secuestro', 'Acta de intimación'];
const VNA_MAX_FOTOS = 30;

// Clasificación de servicio con subclasificación (ítem 16.12). Solo se usa Relevamiento desde el chat.
// FOOD TRUCK (conexión) y DERIVADO (GOIEP, Ordenamiento, Tránsito) tienen un tercer nivel que el script no completa.
const VNA_SUBCLASIFICACION = {
  'Relevamiento': ['MANTERO', 'PARRILLA', 'PUESTO SIN PERMISO', 'PUESTO CON PERMISO', 'VENDEDOR AMBULANTE',
    'FOOD TRUCK', 'ARTESANO', 'SIN INCIDENCIAS', 'DERIVADO'],
};

// Listas para los desplegables del Excel (ítems 4, 5 y 16 de la hoja MAPA).
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
  if (f.zona === 'Otros') errores.push('"Otros" necesita un campo de texto libre que el script no completa (cargar a mano)');
  if (f.tipo === 'No secuestro') {
    // En Evento y Partido la clasificación la asigna el sistema y la subclasificación tiene otro árbol (disuasión).
    if (f.operativo === 'Evento masivo' || f.operativo === 'Partido de fútbol') {
      errores.push(`No secuestro en ${f.operativo}: la clasificación la asigna el sistema (carga no automatizada)`);
    }
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
