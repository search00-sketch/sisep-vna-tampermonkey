// ---------- Dirección → comuna, online, con la API de USIG (Buenos Aires) ----------
// httpGet(url) -> Promise<string>. En Tampermonkey usa GM_xmlhttpRequest (sin CORS).

const VNA_USIG = 'https://ws.usig.buenosaires.gob.ar/rest';
const VNA_RE_CALLE_ALTURA = /^(.*?)\s+(\d{1,5})\s*$/;
const VNA_RE_INTERSECCION = /\s+y\s+/i;

function vnaSepararCalleAltura(direccion) {
  // USIG usa el nombre oficial abreviado: "Avenida Saenz" → "Av Saenz".
  const d = direccion.trim().replace(/^(avenida|av\.?)\s+/i, 'Av ');
  const m = d.match(VNA_RE_CALLE_ALTURA);
  return m ? [m[1].trim(), m[2]] : [d, ''];
}

async function vnaGeocodificar(httpGet, direccion) {
  const [calle, altura] = vnaSepararCalleAltura(direccion);
  if (!altura && !VNA_RE_INTERSECCION.test(calle)) return null;
  const qs = new URLSearchParams({ calle, altura, desambiguar: '1' }).toString();
  const datos = JSON.parse(await httpGet(`${VNA_USIG}/normalizar_y_geocodificar_direcciones?${qs}`));
  const norm = datos.Normalizacion || {};
  if (norm.TipoResultado !== 'DireccionNormalizada' || !datos.GeoCodificacion) return null;
  return { x: Number(datos.GeoCodificacion.x), y: Number(datos.GeoCodificacion.y) };
}

async function vnaGkbaALonLat(httpGet, x, y) {
  const qs = new URLSearchParams({ x: String(x), y: String(y), output: 'lonlat' }).toString();
  const datos = JSON.parse(await httpGet(`${VNA_USIG}/convertir_coordenadas?${qs}`));
  if (datos.tipo_resultado !== 'Ok') return null;
  return { lon: Number(datos.resultado.x), lat: Number(datos.resultado.y) };
}

// Crea un resolutor con caché en memoria. Si no hay conexión no guarda nada y devuelve '' (se reintenta).
function vnaCrearResolutor(httpGet, comunas) {
  const cache = new Map();
  return async function comunaDe(direccion) {
    if (!direccion) return '';
    if (cache.has(direccion)) return cache.get(direccion);
    let resultado = '';
    try {
      const gk = await vnaGeocodificar(httpGet, direccion);
      if (gk) {
        const ll = await vnaGkbaALonLat(httpGet, gk.x, gk.y);
        if (ll) resultado = vnaComunaDePunto(ll.lon, ll.lat, comunas);
      }
    } catch (e) {
      return '';
    }
    cache.set(direccion, resultado);
    return resultado;
  };
}
