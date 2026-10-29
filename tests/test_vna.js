const fs = require('fs');
const vm = require('vm');
const dir = __dirname + '/..';
const comunas = JSON.parse(fs.readFileSync(dir + '/comunas_compacto.json', 'utf8'));
const code = fs.readFileSync(dir + '/vna_logic.js', 'utf8') + '\n' + fs.readFileSync(dir + '/vna_usig.js', 'utf8');
const ctx = { COMUNAS: comunas, console, URLSearchParams, JSON, Map, Set };
vm.createContext(ctx);
vm.runInContext(code, ctx);
const chat = fs.readFileSync(process.argv[2], 'utf8');
const mensajes = ctx.vnaLeerMensajes(chat, true);
const reportes = ctx.vnaAgrupar(mensajes, 30);
const filas = reportes.map((r) => ctx.vnaPrepararFila(r, 'Venta ilegal', 'Patrulla'));
const si = filas.filter((f) => f.incluir);
const cuenta = {};
filas.forEach((f) => { const k = f.tipo || '(sin tipo)'; cuenta[k] = (cuenta[k] || 0) + 1; });
console.log('mensajes', mensajes.length, 'filas', filas.length, 'incluir SI', si.length, JSON.stringify(cuenta));
const fotos = filas.filter((f) => f.incluir).reduce((s, f) => s + f.fotos.length, 0);
console.log('fotos en filas SI', fotos);
const resolver = ctx.vnaCrearResolutor(async (url) => {
  const r = await fetch(url);
  return await r.text();
}, comunas);
(async () => {
  for (const f of si.filter((x) => x.necesitaZona)) {
    f.zona = await resolver(f.direccion);
  }
  const sinZona = si.filter((f) => f.necesitaZona && !f.zona);
  console.log('con zona', si.filter((f) => f.zona).length, 'sin zona', sinZona.length);
  for (const f of si) console.log(f.id, '|', f.direccion, '|', f.tipo || '-', '|', f.zona || '-');
})();
