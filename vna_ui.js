// ---------- Panel en SISEP: carga el JSON de la página de conversión + la carpeta de fotos ----------

// Página de conversión (texto del chat → Excel / JSON).
const VNA_URL_CONVERSOR = 'https://search00-sketch.github.io/sisep-vna-tampermonkey/';

// Filas ya cargadas en este navegador: no se vuelven a cargar hasta tocar "Olvidar cargadas".
const VNA_LS_CARGADAS = 'vna_cargadas_v1';

function vnaLeerCargadas() {
  try { return new Set(JSON.parse(localStorage.getItem(VNA_LS_CARGADAS) || '[]')); } catch (e) { return new Set(); }
}

function vnaGuardarCargadas(conjunto) {
  try { localStorage.setItem(VNA_LS_CARGADAS, JSON.stringify([...conjunto])); } catch (e) { /* sin almacenamiento: se pierde al recargar */ }
}

// Identidad de un reporte: no cambia si se corrige dirección, zona o clasificación en el Excel.
const vnaHuella = (f) => [vnaFechaISO(f.fecha), vnaHoraHHMM(f.fecha), f.remitente, f.texto.slice(0, 120)].join('|');

const VNA_ESTADO = {
  filas: [],          // filas a cargar (desde el JSON)
  hechas: new Set(),  // ids cargados u omitidos en esta sesión
  cargadas: vnaLeerCargadas(), // huellas de las filas cargadas en este navegador
  omitidas: new Set(), // ids omitidos por el usuario (también están en hechas)
  errores: new Map(), // id -> mensaje del último error de esa fila
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
#vna-panel{position:fixed;top:8px;left:8px;bottom:8px;width:min(340px,94vw);z-index:99999;overflow:auto;display:none;
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
#vna-panel .pill.err{background:#fbe4e1;color:#a3352a;border-color:#f0b7af}
#vna-panel pre.estado{margin:0;white-space:pre-wrap;font:12px/1.4 'IBM Plex Mono',monospace;color:#5c6b5e;max-height:140px;overflow:auto}
#vna-panel .pausa{display:none;gap:6px;align-items:center;flex-wrap:wrap;padding:6px;border:1px dashed #0f6e5c;border-radius:8px;background:#e2f1ec}
#vna-panel .cabecera{display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:6px}
#vna-panel .cabecera a{font-size:11.5px;font-weight:600;color:#0f6e5c}
#vna-lanzador{position:fixed;left:12px;bottom:12px;z-index:99999;font:600 12px 'IBM Plex Sans',system-ui,sans-serif;
  background:#0f6e5c;color:#fff;border:0;border-radius:999px;padding:8px 14px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3)}
#vna-lanzador.aviso{background:#a3352a}
`;

function vnaInstalarCss() {
  if (vnaEl('vna-css')) return;
  const s = document.createElement('style');
  s.id = 'vna-css';
  s.textContent = VNA_CSS;
  document.head.appendChild(s);
}

// ---------- Tabla y estado ----------

// [clase, texto, detalle] para la tabla
function vnaEstadoFila(f) {
  if (VNA_ESTADO.omitidas.has(f.id)) return ['warn', 'omitida', VNA_ESTADO.errores.get(f.id) || ''];
  if (VNA_ESTADO.hechas.has(f.id)) return ['ok', 'cargada', ''];
  if (VNA_ESTADO.errores.has(f.id)) return ['err', 'error', VNA_ESTADO.errores.get(f.id)];
  const falta = [];
  if (f.fotos.length && !VNA_ESTADO.fotos.size) falta.push('carpeta de fotos');
  else if (f.fotos.some((n) => !VNA_ESTADO.fotos.has(n.toLowerCase()))) falta.push('fotos');
  if (falta.length) return ['warn', 'falta ' + falta.join(', '), ''];
  return ['ok', 'lista', ''];
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
        `<td>${vnaEsc(f.tipo)}</td><td>${vnaEsc(f.zona)}</td>` +
        `<td><span class="pill ${e[0]}" title="${vnaEsc(e[2])}">${vnaEsc(e[1])}</span></td></tr>`;
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

// Muestra u oculta el panel. Oculto, queda el botón VNA (en rojo si hay algo que revisar).
function vnaMostrarPanel(v) {
  const p = vnaEl('vna-panel');
  const l = vnaEl('vna-lanzador');
  if (p) p.style.display = v ? 'block' : 'none';
  if (l) l.style.display = v ? 'none' : 'block';
}

// Pausa la corrida hasta que el usuario elija. conError: ofrece Reintentar y no Continuar.
function vnaPausa(texto, conError = false) {
  return new Promise((ok) => {
    VNA_ESTADO.gate = ok;
    vnaMostrar(texto);
    vnaEl('vna-continuar').style.display = conError ? 'none' : '';
    vnaEl('vna-reintentar').style.display = conError ? '' : 'none';
    vnaEl('vna-hecha').style.display = conError ? '' : 'none';
    vnaEl('vna-pausa').style.display = 'flex';
    vnaMostrarPanel(true); // en la pausa hay que ver los botones
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

  const enviar = vnaEl('vna-enviar').checked; // carga real: tiene prioridad sobre el borrador
  const guardar = !enviar && vnaEl('vna-borrador').checked;
  // Sin borrador ni envío, la revisión es obligatoria: si no, la fila se pierde al cambiar de formulario.
  const revisar = vnaEl('vna-revisar').checked || (!guardar && !enviar);
  if (revisar) {
    const paso = enviar ? 'enviar' : guardar ? 'guardar el borrador' : 'guardar vos el borrador';
    const v = await vnaPausa(`${nombre}: completada. Dirección: ${direccion}\n` +
      `Revisá y tocá CONTINUAR para ${paso}.`);
    if (v === 'frenar') return 'frenada';
    if (v === 'omitir') { VNA_ESTADO.hechas.add(fila.id); VNA_ESTADO.omitidas.add(fila.id); return 'omitida'; }
  }
  if (enviar) {
    await vnaEnviar();
    await vnaSleep(1500);
    // Si SISEP pide una confirmación (botón Confirmar / Aceptar / Sí), se responde a mano antes de seguir.
    const confirmacion = () => Array.from(document.querySelectorAll('button'))
      .some((b) => b.offsetParent !== null && /^(confirmar|aceptar|s[ií])$/i.test(b.textContent.trim()));
    if (confirmacion()) {
      await vnaPausa(`${nombre}: se tocó ENVIAR y SISEP pide confirmación. Confirmala a mano y tocá CONTINUAR.`);
    }
  } else if (guardar) {
    await vnaGuardarBorrador();
    await vnaSleep(2500); // dar tiempo a que se guarde antes de cambiar de formulario
  }
  VNA_ESTADO.hechas.add(fila.id);
  VNA_ESTADO.errores.delete(fila.id);
  VNA_ESTADO.cargadas.add(vnaHuella(fila));
  vnaGuardarCargadas(VNA_ESTADO.cargadas);
  const resultado = enviar ? '\nEnviado.' : guardar ? '\nBorrador guardado.' : '';
  vnaMostrar(`${nombre}: OK\nDirección: ${direccion}${resultado}`);
  return 'ok';
}

// Carga una fila; si falla, la registra y frena la corrida hasta que el usuario decida.
// Devuelve 'ok' | 'omitida' | 'reintentar' | 'frenada'.
async function vnaFilaSegura(fila) {
  try {
    return await vnaUnaFila(fila);
  } catch (e) {
    const numero = VNA_ESTADO.filas.indexOf(fila) + 1;
    VNA_ESTADO.errores.set(fila.id, e.message);
    // El formulario queda como estaba: podés corregir la fila a mano (dirección, guardar o enviar).
    const v = await vnaPausa(`ERROR en fila ${numero} (reporte ${fila.id}):\n${e.message}\n\n` +
      'Corregila a mano en el formulario y tocá "Lo completé a mano: seguir". ' +
      'Reintentar: vuelve a cargar la fila desde un formulario nuevo (se pierde lo que hayas hecho a mano). ' +
      'Omitir: deja la fila sin cargar. Frenar: corta la corrida.', true);
    if (v === 'hecha') {
      VNA_ESTADO.hechas.add(fila.id);
      VNA_ESTADO.errores.delete(fila.id);
      VNA_ESTADO.cargadas.add(vnaHuella(fila));
      vnaGuardarCargadas(VNA_ESTADO.cargadas);
      return 'ok';
    }
    if (v === 'reintentar') return 'reintentar';
    if (v === 'omitir') {
      VNA_ESTADO.hechas.add(fila.id);
      VNA_ESTADO.omitidas.add(fila.id);
      return 'omitida';
    }
    return 'frenada';
  }
}

async function vnaCorrer(soloUna) {
  if (VNA_ESTADO.corriendo) return;
  if (!vnaPendientes().length) { vnaMostrar('Terminaron las filas.'); return; }
  const cantidad = soloUna ? 1 : vnaPendientes().length;
  const enviar = vnaEl('vna-enviar').checked;
  const guardar = !enviar && vnaEl('vna-borrador').checked;
  if (enviar) {
    // Envío real: se pide confirmación aunque sea una sola fila.
    if (!confirm(`ENVÍO REAL: se ENVÍAN ${cantidad} reporte(s) a SISEP. No se puede deshacer desde el script. ¿Seguir?`)) return;
  } else if (!soloUna && !confirm(`Se completan ${cantidad} fila(s) en el formulario ` +
    `${guardar ? 'y se guardan como borrador' : 'sin guardar (revisás cada una)'}. ¿Seguir?`)) return;

  VNA_ESTADO.corriendo = true;
  VNA_ESTADO.frenar = false;
  vnaActualizarBotones();
  try {
    await vnaNuevoFormulario();
    let fila = vnaPendientes()[0];
    while (fila && !VNA_ESTADO.frenar) {
      const r = await vnaFilaSegura(fila);
      vnaRenderTabla();
      if (r === 'frenada') break;
      if (r === 'reintentar') { await vnaNuevoFormulario(); continue; }
      if (soloUna) break;
      await vnaNuevoFormulario();
      fila = vnaPendientes()[0];
    }
    const conError = VNA_ESTADO.errores.size;
    const resumen = conError ? ` Filas con error: ${conError} (ver la tabla).` : '';
    if (VNA_ESTADO.frenar) vnaMostrar('Corrida frenada. Seguí con "Cargar siguiente fila".' + resumen);
    else if (!vnaPendientes().length) vnaMostrar('Terminaron las filas.' + resumen);
    else vnaMostrar('Corrida terminada.' + resumen);
  } catch (e) {
    vnaEl('vna-lanzador')?.classList.add('aviso'); // el botón VNA queda en rojo aunque el panel esté oculto
    vnaMostrar(`ERROR: ${e.message}\nLa corrida se detuvo. Corregí el formulario y volvé a tocar "Cargar todas".`);
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
    '<div class="cabecera"><span class="eyebrow">Venta no autorizada · SISEP</span>' +
      '<span><a href="' + VNA_URL_CONVERSOR + '" target="_blank" rel="noopener">Conversor ↗</a> ' +
      '<button id="vna-ocultar" class="small">Ocultar</button></span></div>' +
    '<h1>Carga desde el Excel <small style="font-size:11px;font-weight:400;opacity:.6">v1.8.0</small></h1>' +
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
      '<label class="check"><input type="checkbox" id="vna-enviar"> ENVIAR en vez de borrador (carga real)</label>' +
      '<label class="check"><input type="checkbox" id="vna-revisar"> Revisar cada fila antes de seguir</label>' +
      '<div>' +
        '<button id="vna-siguiente" class="primary" disabled>Cargar siguiente fila</button>' +
        '<button id="vna-todas" class="primary" disabled>Cargar todas</button>' +
        '<button id="vna-saltar" disabled>Saltar fila</button>' +
        '<button id="vna-frenar" class="danger" disabled>Frenar</button></div>' +
      '<div><button id="vna-olvidar" class="danger">Olvidar cargadas (cargar todo de nuevo)</button></div>' +
      '<div id="vna-pausa" class="pausa"><button id="vna-continuar" class="primary">Continuar</button>' +
        '<button id="vna-hecha" class="primary" style="display:none">Lo completé a mano: seguir</button>' +
        '<button id="vna-reintentar" class="primary" style="display:none">Reintentar fila</button>' +
        '<button id="vna-omitir">Omitir fila</button></div>' +
      '<pre class="estado" id="vna-estado">Elegí el JSON y la carpeta de fotos.</pre></div>';
  document.body.appendChild(p);

  // Botón flotante: el panel empieza oculto para no tapar el formulario.
  const lanzador = document.createElement('button');
  lanzador.id = 'vna-lanzador';
  lanzador.textContent = 'VNA ▸';
  lanzador.addEventListener('click', () => vnaMostrarPanel(true));
  document.body.appendChild(lanzador);
  vnaEl('vna-ocultar').addEventListener('click', () => vnaMostrarPanel(false));

  vnaEl('vna-json').addEventListener('change', async (ev) => {
    const archivo = ev.target.files[0];
    if (!archivo) return;
    try {
      let filas;
      let chat = '';
      if (/\.json$/i.test(archivo.name)) {
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
      // Las que ya se cargaron en este navegador quedan como cargadas y no se repiten.
      VNA_ESTADO.hechas = new Set(filas.filter((f) => VNA_ESTADO.cargadas.has(vnaHuella(f))).map((f) => f.id));
      VNA_ESTADO.omitidas = new Set();
      VNA_ESTADO.errores = new Map();
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
    VNA_ESTADO.omitidas.add(f.id);
    vnaMostrar(`Saltada: reporte ${f.id}.`);
    vnaRenderTabla();
  });
  vnaEl('vna-frenar').addEventListener('click', () => {
    VNA_ESTADO.frenar = true;
    vnaResolverPausa('frenar');
    vnaMostrar('Frenando después de la fila en curso…');
  });
  vnaEl('vna-olvidar').addEventListener('click', () => {
    if (VNA_ESTADO.corriendo) return;
    if (!confirm('Se olvidan las filas ya cargadas en este navegador. La próxima carga vuelve a cargar TODAS. ¿Seguir?')) return;
    VNA_ESTADO.cargadas = new Set();
    vnaGuardarCargadas(VNA_ESTADO.cargadas);
    VNA_ESTADO.hechas = new Set();
    VNA_ESTADO.omitidas = new Set();
    VNA_ESTADO.errores = new Map();
    vnaMostrar('Se olvidaron las cargadas. "Cargar todas" vuelve a cargar todo.');
    vnaRenderTabla();
  });
  vnaEl('vna-continuar').addEventListener('click', () => vnaResolverPausa('continuar'));
  vnaEl('vna-reintentar').addEventListener('click', () => vnaResolverPausa('reintentar'));
  vnaEl('vna-hecha').addEventListener('click', () => vnaResolverPausa('hecha'));
  vnaEl('vna-omitir').addEventListener('click', () => vnaResolverPausa('omitir'));
  vnaRenderTabla();
}

function vnaIniciar() {
  if (!vnaForm() && !location.hash.includes('/app/nuevo/')) return;
  vnaCrearPanel();
}

vnaIniciar();
window.addEventListener('hashchange', vnaIniciar);
