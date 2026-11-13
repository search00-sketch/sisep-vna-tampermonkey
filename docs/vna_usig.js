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

// Punto → número de comuna, por geometría (no por nombre de calle). Regla par-impar sobre todos los anillos
// de la comuna, así que sirve tanto para polígonos con huecos como para partes separadas.
// Devuelve '' si el punto no cae en ninguna comuna (por ejemplo, fuera de CABA).
function vnaComunaDePunto(lon, lat, comunas) {
  for (const comuna of comunas) {
    let dentro = false;
    for (const anillo of comuna.p) {
      for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
        const [xi, yi] = anillo[i];
        const [xj, yj] = anillo[j];
        if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
      }
    }
    if (dentro) return comuna.c;
  }
  return '';
}

// Reglas de zona por comuna (brief de SISEP). Solo se controlan las zonas listadas: las demás no tienen regla.
const VNA_REGLAS_ZONA_COMUNA = {
  'Once': [3],
  'Retiro': [1],
  'Teatros': [1],
  'Liniers': [9],
  'Parque Los Andes': [15],
  'Plaza Francia': [2],
  'Avellaneda': [7, 10],
};

// true si la zona corresponde a la comuna, false si no corresponde, null si la zona no tiene regla o falta la comuna.
function vnaZonaCorrespondeComuna(zona, comuna) {
  const comunas = VNA_REGLAS_ZONA_COMUNA[zona];
  if (!comunas || comuna === '' || comuna == null) return null;
  return comunas.includes(Number(comuna));
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
