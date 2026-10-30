// Excel de revisión con desplegables (listas de validación) para evitar errores de tipeo.
// Requiere ExcelJS (se pasa como parámetro para poder probarlo también en Node).
// VNA_TURNOS viene de vna_logic.js.

function vnaColumnaLetra(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// filas: objetos de vnaPrepararFila (con revisar ya calculado). Devuelve un Workbook de ExcelJS.
function vnaExcelWorkbook(ExcelJS, filas, revisar) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Reportes');
  const listas = wb.addWorksheet('Listas', { state: 'hidden' });

  const LISTAS = {
    Incluir: ['SI', 'NO'],
    Operativo: VNA_MAPA ? Object.keys(VNA_MAPA) : [],
    Subnivel: VNA_SUBNIVELES.concat(['']).filter((x, i, a) => a.indexOf(x) === i),
    Turno: [''].concat(VNA_TURNOS),
    Zona: VNA_ZONAS,
    Tipo: VNA_TIPOS,
    Clasificacion: VNA_CLASIFICACIONES,
    Subclasificacion: VNA_SUBCLASIFICACION['Relevamiento'],
  };
  const refs = {};
  Object.keys(LISTAS).forEach((clave, i) => {
    const col = i + 1;
    listas.getCell(1, col).value = clave;
    LISTAS[clave].forEach((v, k) => { listas.getCell(k + 2, col).value = v; });
    const L = vnaColumnaLetra(col);
    refs[clave] = `Listas!$${L}$2:$${L}$${LISTAS[clave].length + 1}`;
  });

  const cab = ['ID', 'Incluir', 'Fecha', 'Hora', 'Dirección', 'Observación', 'Operativo', 'Subnivel', 'Turno', 'Zona',
    'Tipo de procedimiento', 'Clasificación de servicio', 'Subclasificación', 'Nº de acta de secuestro', 'Artículos',
    'Bultos', 'Cant. fotos', 'Fotos', 'Videos (no se cargan)', 'Remitente', 'Texto', 'Revisar'];
  const letra = (nombre) => vnaColumnaLetra(cab.indexOf(nombre) + 1);
  ws.addRow(cab);
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  filas.forEach((f) => {
    const p = (n) => String(n).padStart(2, '0');
    ws.addRow([
      f.id,
      f.incluir ? 'SI' : 'NO',
      `${p(f.fecha.getDate())}/${p(f.fecha.getMonth() + 1)}/${f.fecha.getFullYear()}`,
      `${p(f.fecha.getHours())}:${p(f.fecha.getMinutes())}`,
      f.direccion,
      f.observacion,
      f.incluir ? f.operativo : '',
      f.subnivel,
      f.turno,
      f.zona,
      f.tipo,
      f.clasif,
      f.subclasif,
      f.acta,
      f.articulos,
      f.bultos,
      f.fotos.length,
      f.fotos.join('; '),
      f.videos.join('; '),
      f.remitente,
      f.texto,
      revisar(f),
    ]);
  });

  // Desplegables: Operativo, Subnivel, Zona, Tipo, Clasificación, Subclasificación, Incluir.
  // Zona, Clasificación y Subclasificación avisan pero permiten otro valor (warning); el resto no.
  const estricto = { Incluir: true, Operativo: true, Subnivel: true, Tipo: true };
  const columnas = { Incluir: 'Incluir', Operativo: 'Operativo', Subnivel: 'Subnivel', Turno: 'Turno', Zona: 'Zona',
    Tipo: 'Tipo de procedimiento', Clasificacion: 'Clasificación de servicio', Subclasificacion: 'Subclasificación' };
  const ultima = filas.length + 1;
  Object.keys(columnas).forEach((clave) => {
    const L = letra(columnas[clave]);
    const val = {
      type: 'list',
      allowBlank: true,
      formulae: [refs[clave]],
      showErrorMessage: true,
      errorTitle: 'Valor no válido',
      error: 'Elegí una opción de la lista (o dejá la celda vacía).',
      errorStyle: estricto[clave] ? 'stop' : 'warning',
    };
    for (let r = 2; r <= ultima; r++) ws.getCell(`${L}${r}`).dataValidation = val;
  });

  ws.columns.forEach((c, i) => {
    c.width = [7, 9, 12, 8, 36, 30, 18, 14, 22, 22, 20, 24, 22, 20, 10, 9, 10, 50, 30, 22, 60, 22][i] || 14;
  });
  return wb;
}
