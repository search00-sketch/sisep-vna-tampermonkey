// Registro de errores de la carga VNA, para seguimiento en Google Drive.
//
// Cómo ponerlo en marcha (una sola vez):
// 1. En Google Drive: Nuevo > Hoja de cálculo. Ponele de nombre "Errores VNA".
// 2. En esa hoja: Extensiones > Apps Script. Borrá el contenido que aparezca y pegá este archivo. Guardá.
// 3. Implementar > Nueva implementación > Tipo: Aplicación web.
//    Ejecutar como: Yo.   Quién tiene acceso: Cualquier persona.   Implementar.
// 4. Copiá la URL que aparece y pegala en vna_ui.js, en VNA_URL_REGISTRO. Después recompilá el userscript.
//
// Cada error de carga agrega una fila a la hoja "Errores". La columna "Estado" (Pendiente / En revisión / Resuelto)
// se completa a mano para hacer el seguimiento. Sugerencia: poner esa columna como lista desplegable.

const NOMBRE_HOJA = 'Errores';
const ENCABEZADOS = ['Registrado', 'Versión', 'Reporte', 'Fecha del reporte', 'Operativo', 'Tipo',
  'Dirección', 'Acta', 'Error', 'Estado', 'Comentario'];

function doPost(e) {
  const datos = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(NOMBRE_HOJA) || ss.insertSheet(NOMBRE_HOJA);
  if (hoja.getLastRow() === 0) {
    hoja.appendRow(ENCABEZADOS);
    hoja.setFrozenRows(1);
  }
  hoja.appendRow([new Date(), datos.version, datos.id, datos.fechaReporte, datos.operativo, datos.tipo,
    datos.direccion, datos.acta, datos.error, 'Pendiente', '']);
  return ContentService.createTextOutput('ok');
}
