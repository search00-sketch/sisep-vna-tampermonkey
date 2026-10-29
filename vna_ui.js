// ---------- Panel y flujo principal ----------

// Pedidos HTTP con GM_xmlhttpRequest: no depende de CORS ni de archivos locales.
function vnaHttpGet(url) {
  return new Promise((ok, fail) => GM_xmlhttpRequest({
    method: 'GET',
    url,
    timeout: 20000,
    onload: (r) => (r.status >= 200 && r.status < 300 ? ok(r.responseText) : fail(new Error('HTTP ' + r.status))),
    onerror: () => fail(new Error('Sin conexión con USIG')),
    ontimeout: () => fail(new Error('USIG no respondió a tiempo')),
  }));
}

const VNA_ESTADO = {
  todas: [],          // todos los reportes (para vista previa y Excel)
  filas: [],          // solo los que se cargan (Incluir = SI)
  indice: 0,
  corriendo: false,
  frenar: false,
  gate: null,         // resolución de la pausa "revisar cada fila"
  fotos: new Map(),   // nombre en minúsculas -> File
  textoChat: null,
  resolverComuna: null,
};

const vnaEl = (id) => document.getElementById(id);

function vnaMostrar(texto) {
  const e = vnaEl('vna-estado');
  if (e) e.textContent = texto;
}

function vnaActualizarBotones() {
  const hay = VNA_ESTADO.filas.length > 0;
  const libre = !VNA_ESTADO.corriendo;
  vnaEl('vna-siguiente').disabled = !hay || !libre;
  vnaEl('vna-todas').disabled = !hay || !libre;
  vnaEl('vna-saltar').disabled = !hay || !libre;
  vnaEl('vna-excel').disabled = VNA_ESTADO.todas.length === 0;
  vnaEl('vna-vista').disabled = VNA_ESTADO.todas.length === 0;
  vnaEl('vna-frenar').disabled = !VNA_ESTADO.corriendo;
}

// ---------- Análisis del chat ----------

function vnaPrepararTodo() {
  if (VNA_ESTADO.textoChat == null) return;
  const op = vnaEl('vna-operativo').value;
  const sub = vnaEl('vna-subnivel').value;
  const reportes = vnaAgrupar(vnaLeerMensajes(VNA_ESTADO.textoChat, true), 30);
  VNA_ESTADO.todas = reportes.map((r) => vnaPrepararFila(r, op, sub));
  VNA_ESTADO.filas = VNA_ESTADO.todas.filter((f) => f.incluir);
  VNA_ESTADO.indice = 0;
  vnaActualizarBotones();
  vnaResolverZonas().then(() => {
    const sinZona = VNA_ESTADO.filas.filter((f) => f.necesitaZona && !f.zona).length;
    vnaMostrar(`Reportes: ${VNA_ESTADO.todas.length} · a cargar: ${VNA_ESTADO.filas.length} · sin comuna: ${sinZona}\n` +
      'Revisá con "Vista previa" o bajá el Excel. Después "Cargar todas" o "Cargar siguiente fila".');
    vnaActualizarVista();
    vnaActualizarBotones();
  });
}

async function vnaResolverZonas() {
  const pendientes = VNA_ESTADO.todas.filter((f) => f.incluir && f.necesitaZona);
  if (!pendientes.length) return;
  if (!VNA_ESTADO.resolverComuna) {
    VNA_ESTADO.resolverComuna = vnaCrearResolutor(vnaHttpGet, VNA_COMUNAS);
  }
  let n = 0;
  for (const f of pendientes) {
    n++;
    vnaMostrar(`Resolviendo comunas con USIG: ${n} de ${pendientes.length}…`);
    f.zona = await VNA_ESTADO.resolverComuna(f.direccion);
  }
}

// ---------- Vista previa y Excel ----------

const vnaEsc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function vnaRevisar(f) {
  if (!f.incluir) return '';
  const falta = [];
  if (!f.tipo) falta.push('tipo');
  if (f.necesitaZona && !f.zona) falta.push('zona');
  return falta.join(', ');
}

const VNA_COLUMNAS_EXCEL = ['ID', 'Incluir', 'Fecha', 'Hora', 'Dirección', 'Observación', 'Operativo',
  'Subnivel', 'Zona', 'Tipo de procedimiento', 'Clasificación de servicio', 'Nº de acta de secuestro',
  'Artículos', 'Bultos', 'Cant. fotos', 'Fotos', 'Videos (no se cargan)', 'Remitente', 'Texto', 'Revisar'];

function vnaFilaExcel(f) {
  const p = (n) => String(n).padStart(2, '0');
  return [
    f.id,
    f.incluir ? 'SI' : 'NO',
    `${p(f.fecha.getDate())}/${p(f.fecha.getMonth() + 1)}/${f.fecha.getFullYear()}`,
    `${p(f.fecha.getHours())}:${p(f.fecha.getMinutes())}`,
    f.direccion,
    f.observacion,
    f.incluir ? f.operativo : '',
    f.subnivel,
    f.zona,
    f.tipo,
    f.clasif,
    f.acta,
    f.articulos,
    f.bultos,
    f.fotos.length,
    f.fotos.join('; '),
    f.videos.join('; '),
    f.remitente,
    f.texto,
    vnaRevisar(f),
  ];
}

function vnaActualizarVista() {
  const caja = vnaEl('vna-tabla');
  if (!caja || caja.style.display === 'none') return;
  const filas = VNA_ESTADO.todas.map((f) => {
    const cab = f.incluir ? '' : ' style="color:#888"';
    return `<tr${cab}><td>${f.id}</td><td>${vnaEsc(f.fecha.toLocaleDateString('es-AR'))} ${vnaEsc(f.fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }))}</td>` +
      `<td>${vnaEsc(f.direccion)}</td><td>${vnaEsc(f.tipo)}</td><td>${vnaEsc(f.zona)}</td>` +
      `<td>${f.fotos.length}</td><td>${vnaEsc(vnaRevisar(f))}</td></tr>`;
  }).join('');
  caja.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:11px">' +
    '<tr><th>ID</th><th>Fecha/hora</th><th>Dirección</th><th>Tipo</th><th>Zona</th><th>Fotos</th><th>Revisar</th></tr>' +
    filas + '</table>';
}

function vnaDescargarExcel() {
  if (typeof XLSX === 'undefined') {
    vnaMostrar('Falta la librería de Excel: instalá el script con Tampermonkey (no funciona pegado en consola).');
    return;
  }
  const datos = [VNA_COLUMNAS_EXCEL, ...VNA_ESTADO.todas.map(vnaFilaExcel)];
  const ws = XLSX.utils.aoa_to_sheet(datos);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Reportes');
  XLSX.writeFile(wb, 'reportes_vna.xlsx');
}

// ---------- Carga en el formulario ----------

// Abre un formulario nuevo: sale a la lista y vuelve (así se limpia lo que quedó cargado).
async function vnaNuevoFormulario() {
  location.hash = '#/app/lista';
  await vnaSleep(800);
  location.hash = '#/app/nuevo/37';
  const ok = await vnaEsperar(() => vnaForm() && vnaEtiquetas().length > 3, 10000);
  if (!ok) throw new Error('No se abrió el formulario nuevo');
  await vnaSleep(500);
}

// Pausa hasta que el usuario elija Continuar, Omitir o Frenar.
function vnaPausa(texto) {
  return new Promise((ok) => {
    VNA_ESTADO.gate = ok;
    vnaMostrar(texto);
    vnaEl('vna-pausa').style.display = 'block';
  });
}

function vnaResolverPausa(valor) {
  if (!VNA_ESTADO.gate) return;
  const g = VNA_ESTADO.gate;
  VNA_ESTADO.gate = null;
  vnaEl('vna-pausa').style.display = 'none';
  g(valor);
}

// Carga la fila actual. Devuelve 'ok', 'omitida' o 'frenada'.
async function vnaUnaFila() {
  const fila = VNA_ESTADO.filas[VNA_ESTADO.indice];
  const nombre = `Fila ${VNA_ESTADO.indice + 1} de ${VNA_ESTADO.filas.length} (reporte ${fila.id})`;
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
    if (v === 'omitir') { VNA_ESTADO.indice++; return 'omitida'; }
  }
  if (guardar) {
    vnaGuardarBorrador();
    await vnaSleep(2500); // dar tiempo a que se guarde antes de cambiar de formulario
  }
  VNA_ESTADO.indice++;
  vnaMostrar(`${nombre}: OK\nDirección: ${direccion}${guardar ? '\nBorrador guardado.' : ''}`);
  return 'ok';
}

// Corre una o varias filas, una tras otra. Se detiene al primer error o al pedir Frenar.
async function vnaCorrer(soloUna) {
  if (VNA_ESTADO.corriendo || VNA_ESTADO.filas.length === 0) return;
  if (VNA_ESTADO.indice >= VNA_ESTADO.filas.length) {
    vnaMostrar('Terminaron las filas.');
    return;
  }
  const cantidad = soloUna ? 1 : VNA_ESTADO.filas.length - VNA_ESTADO.indice;
  const guardar = vnaEl('vna-borrador').checked;
  if (!soloUna && !confirm(`Se completan ${cantidad} fila(s) en el formulario ` +
    `${guardar ? 'y se guardan como borrador' : 'sin guardar (revisás cada una)'}. ¿Seguir?`)) return;

  VNA_ESTADO.corriendo = true;
  VNA_ESTADO.frenar = false;
  vnaActualizarBotones();
  try {
    await vnaNuevoFormulario();
    while (VNA_ESTADO.indice < VNA_ESTADO.filas.length && !VNA_ESTADO.frenar) {
      const r = await vnaUnaFila();
      if (r === 'frenada') break;
      if (soloUna) break;
      if (VNA_ESTADO.indice < VNA_ESTADO.filas.length) await vnaNuevoFormulario();
    }
    if (VNA_ESTADO.frenar) vnaMostrar('Corrida frenada. Seguí con "Cargar siguiente fila".');
    else if (VNA_ESTADO.indice >= VNA_ESTADO.filas.length) vnaMostrar('Terminaron las filas.');
  } catch (e) {
    vnaMostrar(`ERROR: ${e.message}\nLa corrida se detuvo en la fila ${VNA_ESTADO.indice + 1}. ` +
      'Corregí el formulario o usá "Saltar fila" y volvé a cargar.');
  } finally {
    VNA_ESTADO.corriendo = false;
    VNA_ESTADO.frenar = false;
    vnaResolverPausa('frenar');
    vnaActualizarBotones();
  }
}

// ---------- Panel ----------

function vnaCrearPanel() {
  if (vnaEl('vna-panel')) return;
  const p = document.createElement('div');
  p.id = 'vna-panel';
  p.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;background:#fff;color:#111;' +
    'border:1px solid #888;border-radius:8px;padding:10px;width:380px;max-height:90vh;overflow:auto;' +
    'font:13px system-ui,sans-serif;box-shadow:0 2px 10px rgba(0,0,0,.3)';
  p.innerHTML =
    '<b>VNA · carga desde WhatsApp</b>' +
    '<div style="margin-top:6px">Operativo: <select id="vna-operativo">' +
      '<option>Venta ilegal</option><option>Evento masivo</option><option>Partido de fútbol</option></select> ' +
      'Subnivel: <select id="vna-subnivel"><option value="Patrulla">Patrulla</option><option value="">(ninguno)</option></select></div>' +
    '<div style="margin-top:6px">1) Carpeta del chat (con el .txt y las fotos): ' +
      '<input type="file" id="vna-carpeta" webkitdirectory multiple></div>' +
    '<label style="display:block;margin-top:6px"><input type="checkbox" id="vna-borrador" checked> Guardar borrador al cargar</label>' +
    '<label style="display:block"><input type="checkbox" id="vna-revisar" checked> Revisar cada fila antes de seguir</label>' +
    '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' +
      '<button id="vna-vista" disabled>Vista previa</button>' +
      '<button id="vna-excel" disabled>Descargar Excel</button>' +
    '</div>' +
    '<div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap">' +
      '<button id="vna-siguiente" disabled>Cargar siguiente fila</button>' +
      '<button id="vna-todas" disabled>Cargar todas</button>' +
      '<button id="vna-saltar" disabled>Saltar fila</button>' +
      '<button id="vna-frenar" disabled>Frenar</button>' +
    '</div>' +
    '<div id="vna-pausa" style="display:none;margin-top:8px">' +
      '<button id="vna-continuar">Continuar</button> <button id="vna-omitir">Omitir fila</button></div>' +
    '<div id="vna-tabla" style="display:none;margin-top:8px;max-height:220px;overflow:auto"></div>' +
    '<div id="vna-estado" style="margin-top:8px;white-space:pre-wrap;max-height:160px;overflow:auto">Elegí la carpeta del chat.</div>';
  document.body.appendChild(p);

  vnaEl('vna-carpeta').addEventListener('change', async (ev) => {
    const archivos = Array.from(ev.target.files);
    const txt = archivos.find((f) => /\.txt$/i.test(f.name) && /whatsapp|chat/i.test(f.name))
      || archivos.find((f) => /\.txt$/i.test(f.name));
    if (!txt) {
      vnaMostrar('No encuentro el .txt del chat en la carpeta elegida.');
      return;
    }
    VNA_ESTADO.textoChat = await txt.text();
    VNA_ESTADO.fotos = new Map();
    archivos.filter((f) => /\.(jpe?g|png|webp|heic|gif)$/i.test(f.name))
      .forEach((f) => VNA_ESTADO.fotos.set(f.name.toLowerCase(), f));
    vnaMostrar(`Chat: ${txt.name}\nFotos en la carpeta: ${VNA_ESTADO.fotos.size}`);
    vnaPrepararTodo();
  });
  vnaEl('vna-operativo').addEventListener('change', () => { if (VNA_ESTADO.textoChat != null) vnaPrepararTodo(); });
  vnaEl('vna-subnivel').addEventListener('change', () => { if (VNA_ESTADO.textoChat != null) vnaPrepararTodo(); });
  vnaEl('vna-vista').addEventListener('click', () => {
    const tabla = vnaEl('vna-tabla');
    const abrir = tabla.style.display === 'none';
    tabla.style.display = abrir ? 'block' : 'none';
    if (abrir) vnaActualizarVista();
  });
  vnaEl('vna-excel').addEventListener('click', vnaDescargarExcel);
  vnaEl('vna-siguiente').addEventListener('click', () => vnaCorrer(true));
  vnaEl('vna-todas').addEventListener('click', () => vnaCorrer(false));
  vnaEl('vna-saltar').addEventListener('click', () => {
    if (VNA_ESTADO.corriendo || VNA_ESTADO.indice >= VNA_ESTADO.filas.length) return;
    const fila = VNA_ESTADO.filas[VNA_ESTADO.indice];
    VNA_ESTADO.indice++;
    vnaMostrar(`Saltada: reporte ${fila.id}.\nSiguiente: ${VNA_ESTADO.indice < VNA_ESTADO.filas.length ? 'fila ' + (VNA_ESTADO.indice + 1) : 'ninguna'}`);
    vnaActualizarBotones();
  });
  vnaEl('vna-frenar').addEventListener('click', () => {
    VNA_ESTADO.frenar = true;
    vnaResolverPausa('frenar');
    vnaMostrar('Frenando después de la fila en curso…');
  });
  vnaEl('vna-continuar').addEventListener('click', () => vnaResolverPausa('continuar'));
  vnaEl('vna-omitir').addEventListener('click', () => vnaResolverPausa('omitir'));
  vnaActualizarBotones();
}

function vnaIniciar() {
  if (!vnaForm() && !location.hash.includes('/app/nuevo/')) return;
  vnaCrearPanel();
}

vnaIniciar();
window.addEventListener('hashchange', vnaIniciar);
