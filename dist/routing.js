/**
 * Coordinates in this module are WGS84 (the browser GPS / OpenStreetMap system).
 * Amap navigation URLs use GCJ-02, so only the handoff coordinates are converted.
 *
 * Sources, checked 2026-10-30:
 * https://routing.openstreetmap.de/about.html (FOSSGIS policy and real car/foot profiles)
 * https://project-osrm.org/docs/v26.5.0/http (OSRM response format)
 * https://lbs.amap.com/api/uri-api/guide/travel/route
 * https://lbs.amap.com/api/uri-api/guide/search/search
 * https://developer.amap.com/api/uri-api/gettingstarted (GCJ-02 default)
 * https://developer.apple.com/documentation/mapkit/unified-map-urls
 * https://www.shanghaiairport.com/ensh/czc/index.html (Shanghai metered taxi tariff)
 * https://jtw.sh.gov.cn/zsk/20220119/df77a6e1817b4a269464fe575c572ebb.html
 * https://jtw.sh.gov.cn/zxzfxx/20180605/0010-2372.html (Line 10 station order)
 * https://www.yugarden.com.cn/page/articleView/traffic.html (Yuyuan Lines 10/14)
 * https://www.shairport.com/gdjt/ (Pudong airport Line 2)
 * https://isc.sjtu.edu.cn/ueditor/net/upload/2017-06-23/3905c9ac-a562-4e1c-b89c-275d2c5fd03c.pdf
 */

import { getMetroRoute, crossesRiver } from './metro-routing.js';

const ROUTING_BASE = 'https://routing.openstreetmap.de';
const ROUTING_SOURCE = 'https://routing.openstreetmap.de/about.html';
const FARE_SOURCE = 'https://www.shanghaiairport.com/ensh/czc/index.html';
const MODE_NAMES = new Set(['taxi', 'walk', 'transit']);
const cache = new Map();
let requestQueue = Promise.resolve();
let lastRequestAt = 0;

function point(p) {
  if (!p || !Number.isFinite(p.lng) || !Number.isFinite(p.lat) ||
      Math.abs(p.lng) > 180 || Math.abs(p.lat) > 90) {
    throw new TypeError('유효한 경도·위도의 출발지와 도착지를 선택해 주세요.');
  }
  return p;
}

function modeCheck(mode) {
  if (!MODE_NAMES.has(mode)) throw new TypeError('이동 방법을 선택해 주세요.');
}

function abortError(signal) {
  return signal?.reason || new DOMException('요청을 취소했습니다.', 'AbortError');
}

function checkAbort(signal) {
  if (signal?.aborted) throw abortError(signal);
}

/** Great-circle distance, in kilometres. Never a road distance. */
export function haversine(a, b) {
  point(a); point(b);
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

/** Standard approximate WGS84 -> GCJ-02 transform for mainland map handoffs. */
export function wgs84ToGcj02(value) {
  const { lng, lat } = point(value);
  if (lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271) return { lng, lat };
  const x = lng - 105, y = lat - 35, pi = Math.PI;
  let dLat = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  dLat += (20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2 / 3;
  dLat += (20 * Math.sin(y * pi) + 40 * Math.sin(y / 3 * pi)) * 2 / 3;
  dLat += (160 * Math.sin(y / 12 * pi) + 320 * Math.sin(y * pi / 30)) * 2 / 3;
  let dLng = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  dLng += (20 * Math.sin(6 * x * pi) + 20 * Math.sin(2 * x * pi)) * 2 / 3;
  dLng += (20 * Math.sin(x * pi) + 40 * Math.sin(x / 3 * pi)) * 2 / 3;
  dLng += (150 * Math.sin(x / 12 * pi) + 300 * Math.sin(x / 30 * pi)) * 2 / 3;
  const rad = lat / 180 * pi, sin = Math.sin(rad);
  const magic = 1 - 0.00669342162296594323 * sin * sin, sqrt = Math.sqrt(magic);
  dLat = dLat * 180 / ((6378245 * (1 - 0.00669342162296594323)) / (magic * sqrt) * pi);
  dLng = dLng * 180 / (6378245 / sqrt * Math.cos(rad) * pi);
  return { lng: lng + dLng, lat: lat + dLat };
}

function amapPoint(value, fallback) {
  const p = wgs84ToGcj02(value);
  const name = String(value.cn || value.zh || value.name || fallback).replace(/,/g, ' ');
  return `${p.lng.toFixed(6)},${p.lat.toFixed(6)},${name}`;
}

/** Null origin asks the mobile Amap app to use its own current location. */
export function amapRouteUrl(origin, destination, mode = 'taxi') {
  modeCheck(mode);
  const query = new URLSearchParams({
    to: amapPoint(destination, '도착지'),
    mode: { taxi: 'car', walk: 'walk', transit: 'bus' }[mode],
    policy: mode === 'taxi' ? '1' : '0',
    src: 'shanghai-trip-map', callnative: '1',
  });
  if (origin) query.set('from', amapPoint(origin, '출발지'));
  return `https://uri.amap.com/navigation?${query}`;
}

export function amapSearchUrl(query) {
  return `https://uri.amap.com/search?${new URLSearchParams({
    keyword: String(query).trim(), city: '上海', view: 'list',
    src: 'shanghai-trip-map', callnative: '1',
  })}`;
}

/** Apple unified URLs use latitude,longitude and accept WGS84 directly. */
export function appleMapsUrl(origin, destination, mode = 'taxi') {
  modeCheck(mode); point(destination);
  const query = new URLSearchParams({
    destination: `${destination.lat.toFixed(6)},${destination.lng.toFixed(6)}`,
    mode: { taxi: 'driving', walk: 'walking', transit: 'transit' }[mode],
  });
  if (origin) { point(origin); query.set('source', `${origin.lat.toFixed(6)},${origin.lng.toFixed(6)}`); }
  return `https://maps.apple.com/directions?${query}`;
}

// Daytime normal/electric metered taxis, including the published +/-5% band.
// These figures exclude waiting, tolls, holidays and the 23:00–05:00 surcharge.
function taxiFare(distanceKm) {
  const normalKm = Math.max(0, Math.min(distanceKm, 15) - 3);
  const longKm = Math.max(0, distanceKm - 15);
  const distanceFare = normalKm * 2.7 + longKm * 2.7 * 1.5;
  return { min: Math.max(14, Math.floor((14 + distanceFare) * 0.95)), max: Math.ceil((16 + distanceFare) * 1.05), currency: 'CNY' };
}

const fareNote = '주간 일반·전기 택시 미터요금 추정. 대기·통행료·휴일·야간 할증은 제외하며 실제 결제액은 달라집니다. 보행구역·터널 인근은 실제 승하차 지점을 고덕지도에서 선택하세요.';

// Station centres are WGS84, checked against the primary OSM dataset, 2026-10-30.
// These are NOT entrance coordinates and are used only to match a planning hint.
const hintStations = {
  pvg: { lng: 121.801757, lat: 31.152342 }, // OSM way 230069192
  nanjing: { lng: 121.4792291, lat: 31.2391239 }, // OSM node 468916502 (Line 2)
  yuyuan: { lng: 121.4828695, lat: 31.2299254 }, // OSM node 5306444965
  jiaotong: { lng: 121.4304645, lat: 31.2040391 }, // OSM node 5306444959 (Line 10)
  xintiandi: { lng: 121.4699438, lat: 31.2180993 }, // OSM node 5306444964 (Line 10)
};
const line10Source = 'https://jtw.sh.gov.cn/zxzfxx/20180605/0010-2372.html';
const line2Source = 'https://isc.sjtu.edu.cn/ueditor/net/upload/2017-06-23/3905c9ac-a562-4e1c-b89c-275d2c5fd03c.pdf';
const plannedTransit = [
  { from: 'pvg', to: 'nanjing', text: '푸동공항 T1·T2 연결 지하철역 → 2호선 → 南京东路(난징동루역).', sourceUrl: line2Source },
  { from: 'nanjing', to: 'pvg', text: '南京东路(난징동루역) → 2호선 공항 방면 → 푸동공항 T1·T2 연결 지하철역. 공항까지 가는 열차인지 행선지를 확인하세요.', sourceUrl: line2Source },
  { from: 'yuyuan', to: 'jiaotong', text: '豫园(예원역) → 10호선 老西门·新天地 방면 → 交通大学(자오퉁대학역). 이 구간은 같은 10호선으로 이어져요.', sourceUrl: line10Source },
  { from: 'jiaotong', to: 'yuyuan', text: '交通大学(자오퉁대학역) → 10호선 上海图书馆·新天地 방면 → 豫园(예원역). 이 구간은 같은 10호선으로 이어져요.', sourceUrl: line10Source },
  { from: 'xintiandi', to: 'yuyuan', text: '一大会址·新天地(신천지역) → 10호선 → 老西门 → 豫园(예원역).', sourceUrl: line10Source },
  { from: 'yuyuan', to: 'xintiandi', text: '豫园(예원역) → 10호선 → 老西门 → 一大会址·新天地(신천지역).', sourceUrl: line10Source },
];

function transitPlan(origin, destination) {
  if (origin.accuracy > 500 || destination.accuracy > 500) return null;
  const plan = plannedTransit.find(p => haversine(origin, hintStations[p.from]) <= 0.5 && haversine(destination, hintStations[p.to]) <= 0.5);
  if (!plan) return null;
  return {
    text: `사전 계획 힌트 · 실시간 조회 아님. ${plan.text} 역까지·역에서의 도보, 이용 출입구, 열차 행선지·운행 여부와 소요시간은 고덕지도에서 확인하세요. 위 시간·거리는 이 노선의 조회 결과가 아닌 거리 기반 추정이에요.`,
    sourceUrl: plan.sourceUrl,
  };
}

function instruction(step) {
  const m = step.maneuver || {};
  const road = step.name ? ` ${step.name}` : '';
  const modifiers = { left: '좌회전', right: '우회전', 'slight left': '왼쪽으로 완만히 이동', 'slight right': '오른쪽으로 완만히 이동', 'sharp left': '왼쪽으로 크게 회전', 'sharp right': '오른쪽으로 크게 회전', straight: '직진', uturn: '유턴' };
  const action = modifiers[m.modifier] || '계속 이동';
  if (m.type === 'depart') return `${road.trim() || '현재 지점'}에서 출발`;
  if (m.type === 'arrive') return '도착지 인근에 도착 · 실제 출입구 확인';
  if (step.mode === 'ferry') return `${road.trim() || '페리'} 이용 · 운항 여부 별도 확인`;
  if (m.type === 'roundabout' || m.type === 'rotary') return `회전교차로${m.exit ? ` ${m.exit}번째 출구` : ''}${road}`;
  if (m.type === 'merge') return `${road || '도로'}에 합류`;
  if (m.type === 'on ramp') return `${road || '진입로'}로 진입`;
  if (m.type === 'off ramp') return `${road || '출구'}로 빠져나가기`;
  if (m.type === 'fork') return `갈림길에서 ${action}${road}`;
  if (m.type === 'new name' || m.type === 'notification') return `${road.trim() || '길'}을 따라 계속 이동`;
  if (m.type === 'continue') return `${action}${road}`;
  return `${action}${road}`;
}

function estimate(origin, destination, mode, reason = '') {
  const directKm = haversine(origin, destination);
  const plan = mode === 'transit' ? transitPlan(origin, destination) : null;
  const factor = mode === 'walk' ? 1.3 : 1.4;
  const distanceKm = directKm * factor;
  let low, high;
  if (mode === 'walk') {
    low = Math.ceil(directKm * 1.15 / 5 * 60);
    high = Math.ceil(directKm * 1.6 / 3.5 * 60);
  } else if (mode === 'taxi') {
    low = Math.ceil(5 + directKm * 1.2 / 40 * 60);
    high = Math.ceil(12 + directKm * 1.8 / 20 * 60);
  } else {
    low = Math.ceil((10 + directKm * 1.2 / 35 * 60) / 5) * 5;
    high = Math.ceil((30 + directKm * 1.7 / 18 * 60) / 5) * 5;
  }
  return {
    distanceKm,
    durationMin: Math.round((low + high) / 2),
    durationRangeMin: [low, high],
    geometry: null,
    steps: [],
    sourceLabel: mode === 'transit' ? '대중교통 계획용 추정 · 실제 노선 미조회' : '경로 조회 불가 · 거리 기반 추정',
    sourceUrl: mode === 'transit' ? (plan?.sourceUrl || 'https://lbs.amap.com/api/uri-api/guide/travel/route') : ROUTING_SOURCE,
    estimated: true,
    distanceKind: 'estimate',
    note: `${reason ? `${reason} ` : ''}직선거리 ${directKm.toFixed(1)}km에 우회·이동속도 가정을 적용한 일정 검토용 범위입니다. 실제 경로·다리·통행 가능 여부는 확인되지 않았습니다.${mode === 'taxi' ? ` ${fareNote}` : ''}`,
    fare: mode === 'taxi' ? taxiFare(distanceKm) : null,
    fareNote: mode === 'taxi' ? fareNote : null,
    fareSource: mode === 'taxi' ? FARE_SOURCE : null,
    amapUrl: amapRouteUrl(origin, destination, mode),
    ...(mode === 'transit' ? { transitHint: plan?.text || '고덕지도에서 승차역, 노선, 환승, 출구, 배차와 막차 시간을 확인하세요. 이 화면은 실제 대중교통 노선을 계산하지 않습니다.' } : {}),
  };
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    checkAbort(signal);
    const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(done, ms);
    const abort = () => { clearTimeout(timer); reject(abortError(signal)); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

// FOSSGIS permits at most one request per second. Serialise request starts.
async function requestSlot(signal) {
  const next = requestQueue.catch(() => {}).then(async () => {
    checkAbort(signal);
    const pause = Math.max(0, 1050 - (Date.now() - lastRequestAt));
    if (pause) await delay(pause, signal);
    checkAbort(signal);
    lastRequestAt = Date.now();
  });
  requestQueue = next;
  return next;
}

// Two small foot-profile matrices validate metro access/egress on real paths.
// The same public-service queue as car/walk routing enforces <=1 request/second.
async function metroFootAccess(value, candidates, { reverse=false, signal }={}) {
  checkAbort(signal);
  const controller=new AbortController();
  const abort=()=>controller.abort(abortError(signal));
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>controller.abort(new DOMException('Route timeout','TimeoutError')),9000);
  try {
    await requestSlot(controller.signal);
    const points=[value,...candidates];
    const coords=points.map(p=>`${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
    const indexes=candidates.map((_,i)=>i+1).join(';');
    const params=new URLSearchParams({sources:reverse?indexes:'0',destinations:reverse?'0':indexes,annotations:'distance,duration'});
    const response=await fetch(`${ROUTING_BASE}/routed-foot/table/v1/driving/${coords}?${params}`,{signal:controller.signal});
    if(!response.ok)throw new Error('Foot access unavailable');
    const data=await response.json();
    if(data.code!=='Ok'||!Array.isArray(data.distances)||!Array.isArray(data.durations))throw new Error('No foot matrix');
    return candidates.map((station,i)=>{
      const distanceM=reverse?data.distances[i]?.[0]:data.distances[0]?.[i];
      const seconds=reverse?data.durations[i]?.[0]:data.durations[0]?.[i];
      const snaps=reverse?[data.sources?.[i],data.destinations?.[0]]:[data.sources?.[0],data.destinations?.[i]];
      const requested=reverse?[station,value]:[value,station];
      if(!Number.isFinite(distanceM)||!Number.isFinite(seconds)||snaps.some((s,j)=>!s||!Number.isFinite(s.distance)||s.distance>400||!Array.isArray(s.location)||s.location.length!==2||!s.location.every(Number.isFinite)||crossesRiver(requested[j],{lng:s.location[0],lat:s.location[1]})))return {valid:false};
      return {valid:true,verified:true,distanceM,durationMin:seconds/60};
    });
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

function validateRoute(data, origin, destination, mode) {
  const route = data?.routes?.[0];
  if (data?.code !== 'Ok' || !route || !Number.isFinite(route.distance) || route.distance < 0 ||
      !Number.isFinite(route.duration) || route.duration < 0 || route.geometry?.type !== 'LineString' ||
      !Array.isArray(route.geometry.coordinates) || route.geometry.coordinates.length < 2) return null;
  if (!route.geometry.coordinates.every(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && Math.abs(p[0]) <= 180 && Math.abs(p[1]) <= 90)) return null;
  const first = route.geometry.coordinates[0], last = route.geometry.coordinates.at(-1);
  // Avoid showing routes snapped to a distant city or the wrong side of a river.
  if (haversine(origin, { lng: first[0], lat: first[1] }) > (mode === 'walk' ? 0.4 : 1.2) ||
      haversine(destination, { lng: last[0], lat: last[1] }) > (mode === 'walk' ? 0.4 : 1.2)) return null;
  const steps = route.legs?.flatMap(leg => leg.steps || []) || [];
  if (!steps.length) return null;
  const expected = mode === 'walk' ? 'walking' : 'driving';
  if (steps.some(step => step.mode && step.mode !== expected && step.mode !== 'ferry')) return null;
  return { route, steps };
}

/**
 * A fetched geometry is an OSM road/path route, never a fabricated straight line.
 * estimated=false means the route was fetched, NOT that ETA/fare is guaranteed.
 * An external abort rejects; network/timeout/no-route failures return marked estimates.
 */
export async function getRoute(origin, destination, mode, { signal } = {}) {
  point(origin); point(destination); modeCheck(mode); checkAbort(signal);
  const key = `${mode}|${origin.lng.toFixed(5)},${origin.lat.toFixed(5)}|${destination.lng.toFixed(5)},${destination.lat.toFixed(5)}`;
  const existing = cache.get(key);
  if (existing && Date.now() - existing.at < 15 * 60 * 1000) return existing.value;
  if(mode==='transit') {
    const result=await getMetroRoute(origin,destination,{signal,accessRouter:metroFootAccess});
    const value={...result,amapUrl:amapRouteUrl(origin,destination,mode)};
    if(result.transit.available){cache.set(key,{at:Date.now(),value});if(cache.size>50)cache.delete(cache.keys().next().value);}
    return value;
  }
  if (haversine(origin, destination) > 300) {
    throw new RangeError('출발지와 도착지가 300km 이상 떨어져 있습니다. 상하이에 도착 전이라면 일정 속 장소를 출발지로 선택해 주세요.');
  }
  const controller = new AbortController();
  const externalAbort = () => controller.abort(abortError(signal));
  signal?.addEventListener('abort', externalAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(new DOMException('Route timeout', 'TimeoutError')), 12000);
  try {
    await requestSlot(controller.signal);
    // OSRM's path profile token is not the transport selector. The server prefix is.
    const profile = mode === 'walk' ? 'foot' : 'car';
    const coords = `${origin.lng.toFixed(6)},${origin.lat.toFixed(6)};${destination.lng.toFixed(6)},${destination.lat.toFixed(6)}`;
    const response = await fetch(`${ROUTING_BASE}/routed-${profile}/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=true&alternatives=false`, { signal: controller.signal });
    if (!response.ok) throw new Error(`Route HTTP ${response.status}`);
    const valid = validateRoute(await response.json(), origin, destination, mode);
    if (!valid) throw new Error('No valid route');
    const { route, steps } = valid;
    const distanceKm = route.distance / 1000;
    const hasFerry = steps.some(step => step.mode === 'ferry');
    const value = {
      distanceKm,
      durationMin: Math.max(1, Math.round(route.duration / 60)),
      geometry: route.geometry,
      steps: steps.map(step => ({ instruction: instruction(step), distanceM: Math.round(step.distance || 0), durationMin: Math.round((step.duration || 0) / 6) / 10 })),
      sourceLabel: mode === 'walk' ? 'OpenStreetMap 실제 보행 경로' : 'OpenStreetMap 실제 도로 경로 · 교통 미반영',
      sourceUrl: ROUTING_SOURCE,
      estimated: false,
      distanceKind: 'route',
      note: `시간은 ${mode === 'walk' ? '평균 보행속도' : '도로 속도'} 기반 예상이며 현장 통제·신호·혼잡은 반영하지 않습니다. 출입구와 최신 길안내는 고덕지도에서 확인하세요.${hasFerry ? ' 페리 구간이 포함됩니다. 운항시간·요금을 별도로 확인하세요.' : ''}${mode === 'taxi' ? ` ${fareNote}` : ''}`,
      fare: mode === 'taxi' ? taxiFare(distanceKm) : null,
      fareNote: mode === 'taxi' ? fareNote : null,
      fareSource: mode === 'taxi' ? FARE_SOURCE : null,
      amapUrl: amapRouteUrl(origin, destination, mode),
    };
    cache.set(key, { at: Date.now(), value });
    if (cache.size > 50) cache.delete(cache.keys().next().value);
    return value;
  } catch (error) {
    if (signal?.aborted) throw abortError(signal);
    return estimate(origin, destination, mode, error?.name === 'TimeoutError' ? '경로 서버 응답이 지연되었습니다.' : '경로 서버에서 유효한 길을 가져오지 못했습니다.');
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', externalAbort);
  }
}
