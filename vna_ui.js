// ---------- Panel y flujo principal (visual igual a la web "WhatsApp → Urbetrack") ----------

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
  todas: [],          // todos los reportes (tabla, Excel)
  filas: [],          // los que se cargan (Incluir = SI)
  hechas: new Set(),  // ids ya cargados u omitidos en esta sesión
  corriendo: false,
  frenar: false,
  gate: null,         // resolución de la pausa "revisar cada fila"
  fotos: new Map(),   // nombre en minúsculas -> File
  textoChat: null,
  resolverComuna: null,
};

const vnaEl = (id) => document.getElementById(id);
const vnaPendientes = () => VNA_ESTADO.filas.filter((f) => !VNA_ESTADO.hechas.has(f.id));

function vnaMostrar(texto) {
  const e = vnaEl('vna-estado');
  if (e) e.textContent = texto;
}

// ---------- Estilo: el mismo de la web de Urbetrack, dentro de #vna-panel ----------

const VNA_CSS = `
#vna-panel{--bg:#f4f6f3;--surface:#fff;--surface-2:#eaede6;--surface-3:#dfe3da;--border:#d3d8cd;
  --text:#1c231f;--text-muted:#5c6b5e;--text-faint:#8a9689;--accent:#0f6e5c;--accent-hover:#0b5646;
  --accent-soft:#e2f1ec;--accent-contrast:#fff;--ok-bg:#e0f3e2;--ok-text:#1e6b34;--ok-border:#b7ddb9;
  --warn-bg:#fdf1d6;--warn-text:#8a5a09;--warn-border:#f0d693;--danger-bg:#fbe4e1;--danger-text:#a3352a;
  --danger-border:#f0bcb4;--shadow:0 1px 2px rgba(20,30,20,.04),0 4px 16px rgba(20,30,20,.06);--radius:10px;
  position:fixed;top:8px;right:8px;bottom:8px;width:min(980px,96vw);z-index:99999;overflow:auto;
  background:var(--bg);color:var(--text);font:13px/1.35 'IBM Plex Sans',system-ui,sans-serif;
  border-radius:12px;padding:18px;box-shadow:0 8px 30px rgba(0,0,0,.35);box-sizing:border-box}
@media (prefers-color-scheme: dark){#vna-panel{--bg:#151b16;--surface:#1c231e;--surface-2:#242c25;
  --surface-3:#2c352d;--border:#374035;--text:#e7ede6;--text-muted:#a3b0a1;--text-faint:#77857a;
  --accent:#4fbf9f;--accent-hover:#6fd0b3;--accent-soft:#213730;--accent-contrast:#0c1512;
  --ok-bg:#1c3823;--ok-text:#8fd89f;--ok-border:#2e5738;--warn-bg:#3a3016;--warn-text:#f0c975;
  --warn-border:#5c4c22;--danger-bg:#3a1f1c;--danger-text:#f0a196;--danger-border:#5c332c;
  --shadow:0 1px 2px rgba(0,0,0,.3),0 4px 20px rgba(0,0,0,.35)}}
#vna-panel *{box-sizing:border-box}
#vna-panel .mono{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums}
#vna-panel .top{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap}
#vna-panel .eyebrow{text-transform:uppercase;letter-spacing:.09em;font-size:11px;font-weight:600;color:var(--accent)}
#vna-panel h1{margin:2px 0 0;font-size:22px;font-weight:700;letter-spacing:-.01em}
#vna-panel .sub{color:var(--text-muted);font-size:12.5px;max-width:60ch;margin:4px 0 0}
#vna-panel .steps{display:flex;gap:6px;align-items:center;font-size:12px;color:var(--text-faint);flex-wrap:wrap}
#vna-panel .step{display:flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--border);border-radius:100px;background:var(--surface)}
#vna-panel .step.active{color:var(--text);border-color:var(--accent);background:var(--accent-soft)}
#vna-panel .step .n{width:16px;height:16px;border-radius:50%;background:var(--surface-3);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600}
#vna-panel .step.active .n{background:var(--accent);color:var(--accent-contrast)}
#vna-panel .grid{display:grid;grid-template-columns:300px 1fr;gap:16px;align-items:start}
#vna-panel .col{display:flex;flex-direction:column;gap:14px;min-width:0}
#vna-panel .card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);box-shadow:var(--shadow)}
#vna-panel .card-head{padding:12px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;gap:10px}
#vna-panel .card-head h2{margin:0;font-size:14px;font-weight:600}
#vna-panel .hint{font-size:11.5px;color:var(--text-faint)}
#vna-panel .card-body{padding:14px;display:flex;flex-direction:column;gap:10px}
#vna-panel .dropzone{border:1.5px dashed var(--border);border-radius:8px;padding:18px 12px;text-align:center;color:var(--text-muted);font-size:12.5px;cursor:pointer;display:block}
#vna-panel .dropzone:hover{border-color:var(--accent);background:var(--accent-soft)}
#vna-panel .dropzone .fname{margin-top:6px;font-weight:600;color:var(--text);font-size:12px;word-break:break-all}
#vna-panel label.field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--text-muted)}
#vna-panel label.check{display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--text)}
#vna-panel select,#vna-panel input[type=text]{font:inherit;font-size:12.5px;padding:6px 8px;border-radius:7px;border:1px solid var(--border);background:var(--surface);color:var(--text);width:100%}
#vna-panel select:focus,#vna-panel input:focus,#vna-panel button:focus-visible{outline:2px solid var(--accent);outline-offset:1px}
#vna-panel button{font:inherit;font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:7px;border:1px solid var(--border);background:var(--surface-2);color:var(--text);cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
#vna-panel button:hover{background:var(--surface-3)}
#vna-panel button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-contrast)}
#vna-panel button.primary:hover{background:var(--accent-hover);border-color:var(--accent-hover)}
#vna-panel button.small{padding:4px 8px;font-size:11.5px}
#vna-panel button.danger{color:var(--danger-text)}
#vna-panel button:disabled{opacity:.45;cursor:not-allowed}
#vna-panel .stat-strip{display:flex;gap:8px;flex-wrap:wrap}
#vna-panel .stat{flex:1;min-width:110px;background:var(--surface-2);border:1px solid var(--border);border-radius:8px;padding:9px 11px}
#vna-panel .stat .num{font-size:19px;font-weight:700;font-family:'IBM Plex Mono',monospace}
#vna-panel .stat .lbl{font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em}
#vna-panel .stat.ok .num{color:var(--ok-text)}
#vna-panel .stat.warn .num{color:var(--warn-text)}
#vna-panel .table-wrap{overflow:auto;border:1px solid var(--border);border-radius:8px;max-height:420px}
#vna-panel table{border-collapse:collapse;width:100%;font-size:12px;min-width:860px}
#vna-panel thead th{position:sticky;top:0;background:var(--surface-2);text-align:left;font-weight:600;padding:7px 8px;border-bottom:1px solid var(--border);white-space:nowrap;font-size:10.5px;text-transform:uppercase;letter-spacing:.03em;color:var(--text-muted);z-index:1}
#vna-panel tbody td{padding:5px 8px;border-bottom:1px solid var(--border);vertical-align:middle}
#vna-panel tbody tr:last-child td{border-bottom:none}
#vna-panel tbody tr:hover{background:var(--surface-2)}
#vna-panel tbody tr.off{opacity:.55}
#vna-panel td input[type=text]{padding:3px 6px;font-size:11.5px;min-width:130px}
#vna-panel td select{padding:3px 5px;font-size:11.5px}
#vna-panel td.num{font-family:'IBM Plex Mono',monospace;white-space:nowrap}
#vna-panel .pill{display:inline-flex;align-items:center;padding:2px 8px;border-radius:100px;font-size:10.5px;font-weight:600;white-space:nowrap;border:1px solid transparent}
#vna-panel .pill.ok{background:var(--ok-bg);color:var(--ok-text);border-color:var(--ok-border)}
#vna-panel .pill.warn{background:var(--warn-bg);color:var(--warn-text);border-color:var(--warn-border)}
#vna-panel .pill.bad{background:var(--danger-bg);color:var(--danger-text);border-color:var(--danger-border)}
#vna-panel .file-cell{font-size:10.5px;color:var(--text-faint);font-family:'IBM Plex Mono',monospace}
#vna-panel .toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
#vna-panel .toolbar .left{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#vna-panel .skipped-list{display:flex;flex-direction:column;gap:5px;max-height:180px;overflow-y:auto}
#vna-panel .skipped-item{display:flex;gap:8px;align-items:baseline;font-size:12px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:var(--surface-2)}
#vna-panel .skipped-item .when{color:var(--text-faint);font-family:'IBM Plex Mono',monospace;font-size:11px;white-space:nowrap}
#vna-panel .skipped-item .cap{color:var(--text-muted);flex:1}
#vna-panel .empty{padding:20px;text-align:center;color:var(--text-faint);font-size:12.5px}
#vna-panel pre.estado{margin:0;white-space:pre-wrap;font:12px/1.4 'IBM Plex Mono',monospace;color:var(--text-muted);max-height:150px;overflow:auto}
#vna-panel .pausa{display:none;gap:8px;align-items:center;flex-wrap:wrap;padding:8px;border:1px dashed var(--accent);border-radius:8px;background:var(--accent-soft)}
@media (max-width:900px){#vna-panel .grid{grid-template-columns:1fr}}
`;

function vnaInstalarCss() {
  if (vnaEl('vna-css')) return;
  const s = document.createElement('style');
  s.id = 'vna-css';
  s.textContent = VNA_CSS;
  document.head.appendChild(s);
}

// ---------- Análisis del chat ----------

function vnaPrepararTodo() {
  if (VNA_ESTADO.textoChat == null) return;
  const op = vnaEl('vna-operativo').value;
  const sub = vnaEl('vna-subnivel').value;
  const reportes = vnaAgrupar(vnaLeerMensajes(VNA_ESTADO.textoChat, true), 30);
  VNA_ESTADO.todas = reportes.map((r) => vnaPrepararFila(r, op, sub));
  VNA_ESTADO.hechas = new Set();
  vnaRecalcularFilas();
  vnaRenderTodo();
  vnaResolverZonas().then(() => {
    vnaRecalcularFilas();
    vnaRenderTodo();
    const sinZona = VNA_ESTADO.filas.filter((f) => f.necesitaZona && !f.zona).length;
    vnaMostrar(`Reportes: ${VNA_ESTADO.todas.length} · a cargar: ${VNA_ESTADO.filas.length} · sin comuna: ${sinZona}\n` +
      'Revisá la tabla. Después "Cargar siguiente fila" o "Cargar todas".');
  });
}

function vnaRecalcularFilas() {
  VNA_ESTADO.filas = VNA_ESTADO.todas.filter((f) => f.incluir);
}

async function vnaResolverZonas() {
  const pendientes = VNA_ESTADO.todas.filter((f) => f.incluir && f.necesitaZona && !f.zona);
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

// ---------- Tabla, resumen y Excel ----------

const vnaEsc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function vnaRevisar(f) {
  if (!f.incluir) return '';
  const falta = [];
  if (!f.tipo) falta.push('tipo');
  if (f.necesitaZona && !f.zona) falta.push('zona');
  return falta.join(', ');
}

function vnaEstadoDe(f) {
  if (VNA_ESTADO.hechas.has(f.id)) return ['ok', 'cargada'];
  if (!f.incluir) return ['bad', 'no se carga'];
  const r = vnaRevisar(f);
  if (r) return ['warn', 'revisar: ' + r];
  return ['ok', 'lista'];
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

const VNA_OPCIONES_TIPO = ['', 'Secuestro', 'No secuestro', 'Acta de intimación'];

function vnaRenderTabla() {
  const cuerpo = vnaEl('vna-tbody');
  if (!cuerpo) return;
  if (!VNA_ESTADO.todas.length) {
    cuerpo.innerHTML = '<tr><td colspan="10"><div class="empty">Elegí la carpeta del chat para ver los reportes.</div></td></tr>';
    return;
  }
  const bloqueado = VNA_ESTADO.corriendo ? ' disabled' : '';
  cuerpo.innerHTML = VNA_ESTADO.todas.map((f, i) => {
    const [clase, texto] = vnaEstadoDe(f);
    const opciones = VNA_OPCIONES_TIPO.map((t) =>
      `<option value="${vnaEsc(t)}"${t === (f.tipo || '') ? ' selected' : ''}>${t || '(sin tipo)'}</option>`).join('');
    return `<tr class="${f.incluir ? '' : 'off'}" data-i="${i}">` +
      `<td><input type="checkbox" data-f="incluir"${f.incluir ? ' checked' : ''}${bloqueado}></td>` +
      `<td class="num">${f.id}</td>` +
      `<td class="num">${vnaEsc(f.fecha.toLocaleDateString('es-AR'))} ${vnaEsc(f.fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }))}</td>` +
      `<td><input type="text" data-f="direccion" value="${vnaEsc(f.direccion)}"${bloqueado}></td>` +
      `<td><select data-f="tipo"${bloqueado}>${opciones}</select></td>` +
      `<td><input type="text" data-f="zona" value="${vnaEsc(f.zona)}"${bloqueado}></td>` +
      `<td class="num">${f.fotos.length}</td>` +
      `<td class="file-cell">${vnaEsc(f.observacion)}</td>` +
      `<td><span class="pill ${clase}">${vnaEsc(texto)}</span></td>` +
      '</tr>';
  }).join('');
}

function vnaRenderResumen() {
  const todas = VNA_ESTADO.todas;
  const filas = VNA_ESTADO.filas;
  const sinZona = filas.filter((f) => f.necesitaZona && !f.zona).length;
  const secuestros = filas.filter((f) => f.tipo === 'Secuestro').length;
  const conFoto = filas.reduce((s, f) => s + f.fotos.length, 0);
  const set = (id, v) => { const e = vnaEl(id); if (e) e.textContent = v; };
  set('vna-st-total', todas.length);
  set('vna-st-ok', filas.length);
  set('vna-st-warn', sinZona);
  set('vna-st-sec', secuestros);
  set('vna-st-foto', conFoto);
  set('vna-hint-filas', `${filas.length} filas a cargar · ${VNA_ESTADO.hechas.size} hechas`);
}

function vnaRenderSinDireccion() {
  const lista = vnaEl('vna-sin-dir');
  if (!lista) return;
  const items = VNA_ESTADO.todas.filter((f) => !f.incluir && f.fotos.length > 0);
  lista.innerHTML = items.length ? items.map((f) => {
    const hora = `${String(f.fecha.getHours()).padStart(2, '0')}:${String(f.fecha.getMinutes()).padStart(2, '0')}`;
    return `<div class="skipped-item"><span class="when">${vnaEsc(f.fecha.toLocaleDateString('es-AR'))} ${hora}</span>` +
      `<span class="cap">${vnaEsc(f.texto || '(sin texto)')} · ${f.fotos.length} foto(s)</span></div>`;
  }).join('') : '<div class="empty" style="padding:12px">Nada por ahora.</div>';
}

function vnaRenderTodo() {
  vnaRenderResumen();
  vnaRenderTabla();
  vnaRenderSinDireccion();
  vnaActualizarBotones();
  vnaActualizarPasos();
}

function vnaActualizarBotones() {
  const hay = vnaPendientes().length > 0;
  const libre = !VNA_ESTADO.corriendo;
  const set = (id, valor) => { const e = vnaEl(id); if (e) e.disabled = valor; };
  set('vna-excel', VNA_ESTADO.todas.length === 0);
  set('vna-siguiente', !hay || !libre);
  set('vna-todas', !hay || !libre);
  set('vna-saltar', !hay || !libre);
  set('vna-frenar', !VNA_ESTADO.corriendo);
}

function vnaActualizarPasos() {
  const paso = VNA_ESTADO.textoChat == null ? 1 : (VNA_ESTADO.hechas.size || VNA_ESTADO.corriendo ? 3 : 2);
  [1, 2, 3].forEach((n) => {
    const e = vnaEl('vna-paso' + n);
    if (e) e.classList.toggle('active', n === paso);
  });
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

// Corre una o varias filas, una tras otra. Se detiene al primer error o al pedir Frenar.
async function vnaCorrer(soloUna) {
  if (VNA_ESTADO.corriendo) return;
  if (!vnaPendientes().length) {
    vnaMostrar('Terminaron las filas.');
    return;
  }
  const cantidad = soloUna ? 1 : vnaPendientes().length;
  const guardar = vnaEl('vna-borrador').checked;
  if (!soloUna && !confirm(`Se completan ${cantidad} fila(s) en el formulario ` +
    `${guardar ? 'y se guardan como borrador' : 'sin guardar (revisás cada una)'}. ¿Seguir?`)) return;

  VNA_ESTADO.corriendo = true;
  VNA_ESTADO.frenar = false;
  vnaRenderTodo();
  try {
    await vnaNuevoFormulario();
    let fila = vnaPendientes()[0];
    while (fila && !VNA_ESTADO.frenar) {
      const r = await vnaUnaFila(fila);
      vnaRenderTodo();
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
    vnaRenderTodo();
  }
}

// ---------- Panel ----------

function vnaCrearPanel() {
  if (vnaEl('vna-panel')) return;
  vnaInstalarCss();
  const p = document.createElement('div');
  p.id = 'vna-panel';
  p.innerHTML =
    '<div class="top">' +
      '<div><span class="eyebrow">Venta no autorizada · SISEP</span>' +
      '<h1>WhatsApp → SISEP <small style="font-size:11px;font-weight:400;opacity:.6">versión 0.4.0</small></h1>' +
      '<p class="sub">Convertí el chat de WhatsApp en reportes, revisá la tabla y cargá en el formulario una fila tras otra.</p></div>' +
      '<div class="steps">' +
        '<div class="step" id="vna-paso1"><span class="n">1</span> Carpeta</div>' +
        '<div class="step" id="vna-paso2"><span class="n">2</span> Revisar</div>' +
        '<div class="step" id="vna-paso3"><span class="n">3</span> Cargar</div>' +
      '</div>' +
    '</div>' +
    '<div class="grid"><div class="col">' +
      '<div class="card"><div class="card-head"><h2>1 · Carpeta del chat</h2><span class="hint">.txt y fotos</span></div>' +
        '<div class="card-body">' +
          '<label class="dropzone" for="vna-carpeta">Elegí la carpeta del chat (con el .txt y las fotos)' +
            '<div class="fname" id="vna-fname"></div>' +
            '<input type="file" id="vna-carpeta" webkitdirectory multiple style="display:none"></label>' +
        '</div></div>' +
      '<div class="card"><div class="card-head"><h2>2 · Perfil de operativo</h2></div>' +
        '<div class="card-body">' +
          '<label class="field"><span>Operativo</span><select id="vna-operativo">' +
            '<option>Venta ilegal</option><option>Evento masivo</option><option>Partido de fútbol</option></select></label>' +
          '<label class="field"><span>Subnivel</span><select id="vna-subnivel">' +
            '<option value="Patrulla">Patrulla</option><option value="">(ninguno)</option></select></label>' +
          '<label class="check"><input type="checkbox" id="vna-borrador" checked> Guardar borrador al cargar</label>' +
          '<label class="check"><input type="checkbox" id="vna-revisar" checked> Revisar cada fila antes de seguir</label>' +
        '</div></div>' +
      '<div class="card"><div class="card-head"><h2>Carga en SISEP</h2></div>' +
        '<div class="card-body">' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
            '<button id="vna-siguiente" class="primary" disabled>Cargar siguiente fila</button>' +
            '<button id="vna-todas" class="primary" disabled>Cargar todas</button>' +
            '<button id="vna-saltar" class="small" disabled>Saltar fila</button>' +
            '<button id="vna-frenar" class="small danger" disabled>Frenar</button>' +
          '</div>' +
          '<div id="vna-pausa" class="pausa">' +
            '<button id="vna-continuar" class="primary small">Continuar</button>' +
            '<button id="vna-omitir" class="small">Omitir fila</button></div>' +
          '<pre class="estado" id="vna-estado">Elegí la carpeta del chat.</pre>' +
        '</div></div>' +
    '</div><div class="col">' +
      '<div class="card"><div class="card-head"><h2>Resumen</h2><span class="hint" id="vna-hint-filas"></span></div>' +
        '<div class="card-body"><div class="stat-strip">' +
          '<div class="stat"><div class="num mono" id="vna-st-total">0</div><div class="lbl">Reportes</div></div>' +
          '<div class="stat ok"><div class="num mono" id="vna-st-ok">0</div><div class="lbl">A cargar</div></div>' +
          '<div class="stat warn"><div class="num mono" id="vna-st-warn">0</div><div class="lbl">Sin comuna</div></div>' +
          '<div class="stat"><div class="num mono" id="vna-st-sec">0</div><div class="lbl">Secuestros</div></div>' +
          '<div class="stat"><div class="num mono" id="vna-st-foto">0</div><div class="lbl">Fotos</div></div>' +
        '</div></div></div>' +
      '<div class="card"><div class="card-head"><h2>Reportes</h2><span class="hint">editá dirección, tipo o zona antes de cargar</span></div>' +
        '<div class="card-body">' +
          '<div class="toolbar"><div class="left">' +
            '<button id="vna-excel" class="primary small" disabled>⬇ Exportar Excel (.xlsx)</button>' +
          '</div></div>' +
          '<div class="table-wrap"><table>' +
            '<thead><tr><th>Cargar</th><th>ID</th><th>Fecha y hora</th><th>Dirección</th><th>Tipo</th><th>Zona</th><th>Fotos</th><th>Observación</th><th>Estado</th></tr></thead>' +
            '<tbody id="vna-tbody"></tbody></table></div>' +
        '</div></div>' +
      '<div class="card"><div class="card-head"><h2>Mensajes con foto sin dirección</h2>' +
        '<span class="hint">no se cargan; si corresponde, agregalos a mano</span></div>' +
        '<div class="card-body"><div class="skipped-list" id="vna-sin-dir"></div></div></div>' +
    '</div></div>';
  document.body.appendChild(p);

  vnaEl('vna-carpeta').addEventListener('change', async (ev) => {
    const archivos = Array.from(ev.target.files);
    const txt = archivos.find((f) => /\.txt$/i.test(f.name) && /whatsapp|chat/i.test(f.name))
      || archivos.find((f) => /\.txt$/i.test(f.name));
    if (!txt) {
      vnaMostrar('No encuentro el .txt del chat en la carpeta elegida.');
      return;
    }
    vnaEl('vna-fname').textContent = `${txt.name} · ${archivos.length} archivos`;
    VNA_ESTADO.textoChat = await txt.text();
    VNA_ESTADO.fotos = new Map();
    archivos.filter((f) => /\.(jpe?g|png|webp|heic|gif)$/i.test(f.name))
      .forEach((f) => VNA_ESTADO.fotos.set(f.name.toLowerCase(), f));
    vnaMostrar(`Fotos en la carpeta: ${VNA_ESTADO.fotos.size}`);
    vnaPrepararTodo();
  });
  vnaEl('vna-operativo').addEventListener('change', () => { if (VNA_ESTADO.textoChat != null) vnaPrepararTodo(); });
  vnaEl('vna-subnivel').addEventListener('change', () => { if (VNA_ESTADO.textoChat != null) vnaPrepararTodo(); });

  // Edición en la tabla: incluir, dirección, tipo y zona.
  const tbody = vnaEl('vna-tbody');
  tbody.addEventListener('change', async (ev) => {
    const tr = ev.target.closest('tr');
    if (!tr || VNA_ESTADO.corriendo) return;
    const f = VNA_ESTADO.todas[Number(tr.dataset.i)];
    const campo = ev.target.dataset.f;
    if (campo === 'incluir') f.incluir = ev.target.checked;
    if (campo === 'direccion') { f.direccion = ev.target.value.trim(); f.zona = ''; }
    if (campo === 'tipo') {
      f.tipo = ev.target.value;
      if (f.tipo === 'No secuestro' && !f.clasif) f.clasif = 'Relevamiento';
      if (f.tipo !== 'No secuestro') f.clasif = '';
    }
    if (campo === 'zona') f.zona = ev.target.value.trim();
    vnaRecalcularFilas();
    vnaRenderTodo();
    if (campo === 'direccion' && f.incluir && f.necesitaZona && f.direccion) {
      if (!VNA_ESTADO.resolverComuna) VNA_ESTADO.resolverComuna = vnaCrearResolutor(vnaHttpGet, VNA_COMUNAS);
      vnaMostrar(`Resolviendo la comuna de "${f.direccion}"…`);
      f.zona = await VNA_ESTADO.resolverComuna(f.direccion);
      vnaRecalcularFilas();
      vnaRenderTodo();
      vnaMostrar(f.zona ? `Comuna: ${f.zona}` : 'No pude resolver la comuna: revisá la dirección o escribí la zona.');
    }
  });

  vnaEl('vna-excel').addEventListener('click', vnaDescargarExcel);
  vnaEl('vna-siguiente').addEventListener('click', () => vnaCorrer(true));
  vnaEl('vna-todas').addEventListener('click', () => vnaCorrer(false));
  vnaEl('vna-saltar').addEventListener('click', () => {
    const f = vnaPendientes()[0];
    if (VNA_ESTADO.corriendo || !f) return;
    VNA_ESTADO.hechas.add(f.id);
    vnaMostrar(`Saltada: reporte ${f.id}.`);
    vnaRenderTodo();
  });
  vnaEl('vna-frenar').addEventListener('click', () => {
    VNA_ESTADO.frenar = true;
    vnaResolverPausa('frenar');
    vnaMostrar('Frenando después de la fila en curso…');
  });
  vnaEl('vna-continuar').addEventListener('click', () => vnaResolverPausa('continuar'));
  vnaEl('vna-omitir').addEventListener('click', () => vnaResolverPausa('omitir'));
  vnaRenderTodo();
}

function vnaIniciar() {
  if (!vnaForm() && !location.hash.includes('/app/nuevo/')) return;
  vnaCrearPanel();
}

vnaIniciar();
window.addEventListener('hashchange', vnaIniciar);
