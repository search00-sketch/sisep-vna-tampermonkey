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

const VNA_ESTADO = { filas: [], indice: 0, ocupado: false, fotos: new Map(), resolverComuna: null };

function vnaMostrar(texto) {
  const e = document.getElementById('vna-estado');
  if (e) e.textContent = texto;
}

function vnaPrepararTodo() {
  const chat = VNA_ESTADO.textoChat;
  if (chat == null) return;
  const op = document.getElementById('vna-operativo').value;
  const sub = document.getElementById('vna-subnivel').value;
  const mensajes = vnaLeerMensajes(chat, true);
  const reportes = vnaAgrupar(mensajes, 30);
  const todas = reportes.map((r) => vnaPrepararFila(r, op, sub));
  VNA_ESTADO.filas = todas.filter((f) => f.incluir);
  VNA_ESTADO.indice = 0;
  vnaResolverZonas().then(() => {
    const sinZona = VNA_ESTADO.filas.filter((f) => f.necesitaZona && !f.zona).length;
    vnaMostrar(`Filas a cargar: ${VNA_ESTADO.filas.length} (de ${todas.length} reportes)\n` +
      `Sin comuna resuelta: ${sinZona}\n` +
      'Elegí las fotos y pulsá "Cargar siguiente fila".');
    document.getElementById('vna-siguiente').disabled = VNA_ESTADO.filas.length === 0;
    document.getElementById('vna-saltar').disabled = VNA_ESTADO.filas.length === 0;
  });
}

async function vnaResolverZonas() {
  const pendientes = VNA_ESTADO.filas.filter((f) => f.necesitaZona);
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

async function vnaSiguienteFila() {
  if (VNA_ESTADO.ocupado) return;
  if (VNA_ESTADO.indice >= VNA_ESTADO.filas.length) {
    vnaMostrar('Terminaron las filas.');
    return;
  }
  VNA_ESTADO.ocupado = true;
  const boton = document.getElementById('vna-siguiente');
  boton.disabled = true;
  const fila = VNA_ESTADO.filas[VNA_ESTADO.indice];
  const nombre = `Fila ${VNA_ESTADO.indice + 1} de ${VNA_ESTADO.filas.length} (reporte ${fila.id})`;
  try {
    const nombresCargados = new Set(VNA_ESTADO.fotos.keys());
    const errores = vnaValidarFila(fila, nombresCargados);
    if (errores.length) throw new Error(errores.join(' | '));
    vnaMostrar(`${nombre}: cargando…`);
    const { direccion } = await vnaCargarFila(fila, VNA_ESTADO.fotos);
    const borrador = document.getElementById('vna-borrador').checked;
    if (borrador) vnaGuardarBorrador();
    VNA_ESTADO.indice++;
    vnaMostrar(`${nombre}: OK\nDirección elegida: ${direccion}\n` +
      (borrador ? 'Borrador guardado.' : 'Revisá y guardá vos.') +
      `\nSiguiente: ${VNA_ESTADO.indice < VNA_ESTADO.filas.length ? 'fila ' + (VNA_ESTADO.indice + 1) : 'ninguna'}`);
  } catch (e) {
    vnaMostrar(`${nombre}: ERROR\n${e.message}\nNo se avanzó. Reintentá después de corregir, o usá "Saltar fila".`);
  } finally {
    VNA_ESTADO.ocupado = false;
    boton.disabled = VNA_ESTADO.indice >= VNA_ESTADO.filas.length;
  }
}

// Salta la fila actual sin cargarla (p. ej. una fila sin comuna o sin dirección).
function vnaSaltarFila() {
  if (VNA_ESTADO.ocupado || VNA_ESTADO.indice >= VNA_ESTADO.filas.length) return;
  const fila = VNA_ESTADO.filas[VNA_ESTADO.indice];
  VNA_ESTADO.indice++;
  vnaMostrar(`Saltada: reporte ${fila.id} (${fila.direccion || 'sin dirección'}).\n` +
    `Siguiente: ${VNA_ESTADO.indice < VNA_ESTADO.filas.length ? 'fila ' + (VNA_ESTADO.indice + 1) : 'ninguna'}`);
  document.getElementById('vna-siguiente').disabled = VNA_ESTADO.indice >= VNA_ESTADO.filas.length;
}

function vnaCrearPanel() {
  if (document.getElementById('vna-panel')) return;
  const p = document.createElement('div');
  p.id = 'vna-panel';
  p.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:99999;background:#fff;color:#111;' +
    'border:1px solid #888;border-radius:8px;padding:10px;width:320px;font:13px system-ui,sans-serif;' +
    'box-shadow:0 2px 10px rgba(0,0,0,.3)';
  p.innerHTML =
    '<b>VNA · carga desde WhatsApp</b>' +
    '<div style="margin-top:6px">Operativo: <select id="vna-operativo">' +
      '<option>Venta ilegal</option><option>Evento masivo</option><option>Partido de fútbol</option></select></div>' +
    '<div style="margin-top:6px">Subnivel: <select id="vna-subnivel">' +
      '<option value="Patrulla">Patrulla</option><option value="">(ninguno)</option></select></div>' +
    '<div style="margin-top:6px">1) Chat exportado (.txt): <input type="file" id="vna-chat" accept=".txt,text/plain"></div>' +
    '<div style="margin-top:6px">2) Fotos del chat: <input type="file" id="vna-fotos" accept="image/*" multiple></div>' +
    '<label style="display:block;margin-top:6px"><input type="checkbox" id="vna-borrador"> Guardar borrador al cargar</label>' +
    '<div style="margin-top:8px"><button id="vna-siguiente" style="padding:6px 10px" disabled>Cargar siguiente fila</button> ' +
      '<button id="vna-saltar" style="padding:6px 10px" disabled>Saltar fila</button></div>' +
    '<div id="vna-estado" style="margin-top:8px;white-space:pre-wrap;max-height:180px;overflow:auto">Elegí el chat y las fotos.</div>';
  document.body.appendChild(p);

  document.getElementById('vna-chat').addEventListener('change', async (ev) => {
    const archivo = ev.target.files[0];
    if (!archivo) return;
    VNA_ESTADO.textoChat = await archivo.text();
    vnaPrepararTodo();
  });
  document.getElementById('vna-operativo').addEventListener('change', vnaPrepararTodo);
  document.getElementById('vna-subnivel').addEventListener('change', vnaPrepararTodo);
  document.getElementById('vna-fotos').addEventListener('change', (ev) => {
    VNA_ESTADO.fotos.clear();
    Array.from(ev.target.files).forEach((f) => VNA_ESTADO.fotos.set(f.name.toLowerCase(), f));
    vnaMostrar(`Fotos cargadas en el panel: ${VNA_ESTADO.fotos.size}`);
  });
  document.getElementById('vna-siguiente').addEventListener('click', vnaSiguienteFila);
  document.getElementById('vna-saltar').addEventListener('click', vnaSaltarFila);
}

function vnaIniciar() {
  if (!vnaForm() && !location.hash.includes('/app/nuevo/')) return;
  vnaCrearPanel();
}

vnaIniciar();
window.addEventListener('hashchange', vnaIniciar);
