/**
 * HLS proxy worker (Cloudflare Workers)
 * ------------------------------------------------------------------
 * Kullanim:  https://SENIN-WORKER.workers.dev/https://kaynak/stream.m3u8
 *
 * Mevcut worker'inizden farki: bu worker .m3u8 icerigini de YENIDEN
 * YAZAR. Yani playlist icindeki segment (.ts) ve alt-playlist linkleri
 * de otomatik olarak proxy uzerinden gecer. "Summer" gibi linki https
 * olup yine de calismayan kanallarin sebebi genelde budur (segmentler
 * proxy disina cikiyordu, CORS / mixed-content'e takiliyordu).
 *
 * NOT: Cloudflare Workers SADECE su portlara baglanabilir:
 *   80, 443, 2052, 2053, 2082, 2083, 2086, 2087, 2095, 2096,
 *   8080, 8443, 8880
 * Bu yuzden "http://iptv.prosto.tv:7000/..." gibi 7000 PORTLU
 * yayinlar bu worker ile DE acilmaz (asagidaki aciklamaya bakin).
 */
export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors() });
    }

    // Worker domaininden sonraki her sey hedef URL'dir.
    let target = url.pathname.slice(1) + url.search;
    if (!target) {
      return new Response('Kullanim: /https://kaynak/stream.m3u8', { status: 400, headers: cors() });
    }
    if (!/^https?:\/\//i.test(target)) {
      return new Response('Gecersiz hedef URL', { status: 400, headers: cors() });
    }

    let upstream;
    try {
      upstream = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': new URL(target).origin + '/',
          'Accept': '*/*'
        }
      });
    } catch (e) {
      return new Response('Kaynaga ulasilamadi: ' + e, { status: 502, headers: cors() });
    }

    const ct = upstream.headers.get('content-type') || '';
    const isManifest = /mpegurl|x-mpegURL|m3u8/i.test(ct) || /\.m3u8(\?|$)/i.test(target);

    if (isManifest) {
      let body = await upstream.text();
      const dir = target.replace(/[^/]*(\?.*)?$/, '');   // manifest'in klasoru
      const root = url.origin + '/';                       // proxy koku
      body = body.split('\n').map(line => {
        const t = line.trim();
        if (t === '') return line;
        if (t.startsWith('#')) {
          // #EXT-X-KEY / #EXT-X-MAP icindeki URI="..." linklerini de cevir
          return line.replace(/URI="([^"]+)"/g, (m, u) => 'URI="' + root + abs(u, dir) + '"');
        }
        // segment veya alt-playlist satiri
        return root + abs(t, dir);
      }).join('\n');

      return new Response(body, {
        status: upstream.status,
        headers: cors(ct || 'application/vnd.apple.mpegurl')
      });
    }

    // Manifest degilse (segment .ts, key, vs.) oldugu gibi akit
    return new Response(upstream.body, { status: upstream.status, headers: cors(ct) });
  }
};

function abs(u, dir) {
  if (/^https?:\/\//i.test(u)) return u;          // zaten tam URL
  try { return new URL(u, dir).href; }            // goreli -> tam URL
  catch (e) { return dir + u; }
}

function cors(ct) {
  const h = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,HEAD,OPTIONS',
    'Access-Control-Allow-Headers': '*',
    'Cache-Control': 'no-cache'
  };
  if (ct) h['Content-Type'] = ct;
  return h;
}
