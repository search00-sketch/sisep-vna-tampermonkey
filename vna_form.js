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
    el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window })));
}

function vnaOpcionVisible(texto) {
  return Array.from(document.querySelectorAll('[role="option"]'))
    .find((o) => o.offsetParent !== null && o.textContent.trim() === texto) || null;
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
