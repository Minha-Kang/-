// Place names are entities, not sentences to machine-translate.
// https://www.mediawiki.org/wiki/API:Cross-site_requests (origin=* / anonymous CORS)
// https://www.mediawiki.org/wiki/API:Search_and_discovery (Wikibase entity API)
// https://www.wikidata.org/wiki/Property:P625 (Earth coordinates)
import {knownNameFor,normalizeSearch,resolveKnownQuery} from './search-language.js';
import {places as tripPlaces} from './data.js';

const korean = /[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]/u;
const chinese = /[\u3400-\u9fff]/u;
const lookupCache = new Map();
const referenceCache = new Map();
const MAX_AGE = 10 * 60 * 1000;
const safeText = value => typeof value === 'string' && value.length <= 240 && !/[<>\u0000-\u001f]/u.test(value) ? value.trim() : '';
const abortError = () => new DOMException('장소 확인을 취소했어요.', 'AbortError');
const inRegion = point => Number.isFinite(point?.longitude) && Number.isFinite(point?.latitude) && point.longitude >= 120.1 && point.longitude <= 122.2 && point.latitude >= 30.3 && point.latitude <= 32.1;
const distance = (a,b) => Math.hypot((a.lng-b.lng)*Math.cos((a.lat+b.lat)*Math.PI/360),a.lat-b.lat)*111.2;

function labels(entity,language) {
  return [entity.labels?.[language]?.value,...(entity.aliases?.[language] || []).map(item=>item.value)].map(safeText).filter(Boolean);
}

function queryIdentity(query) {
  const direct = knownNameFor(query,tripPlaces);
  if (direct) return {term:direct.cn,known:direct};
  const plan = resolveKnownQuery(query,tripPlaces);
  if (!plan.needsTranslation) {
    const exact = knownNameFor(plan.query,tripPlaces) || knownNameFor(plan.query.replace(/^上海\s+/u,''),tripPlaces);
    if (exact) return {term:exact.cn,known:exact};
  }
  return {term:query,known:null};
}

/**
 * Returns actual named entities with Chinese labels AND Earth coordinates in
 * the Shanghai/Wuzhen search box. Missing coordinates / far-away names / human
 * entities are rejected. A result is a selectable candidate, not an entrance.
 * The complete operation has one 8.5-second deadline, including all requests.
 */
export async function lookupPlaceEntities(query,{signal,fetchImpl=fetch,timeoutMs=8500,cache=true}={}) {
  const input = safeText(String(query ?? '').normalize('NFKC'));
  if (!input) return [];
  if (signal?.aborted) throw abortError();
  const {term,known} = queryIdentity(input);
  if (known?.type === 'brand') return []; // A brand HQ is not a Shanghai shop.
  const cacheKey = normalizeSearch(term);
  const existing = cache && lookupCache.get(cacheKey);
  if (existing && Date.now()-existing.at<MAX_AGE) return existing.value.map(item=>({...item}));
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  const timer = setTimeout(abort,Math.min(9000,Math.max(1,timeoutMs)));
  const language = korean.test(term) ? 'ko' : chinese.test(term) ? 'zh' : 'en';
  async function api(host,parameters) {
    if (controller.signal.aborted) throw abortError();
    const params = new URLSearchParams({...parameters,format:'json',origin:'*'});
    const response = await fetchImpl(`https://${host}/w/api.php?${params}`,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if (!response.ok) throw new Error('place-source-unavailable');
    const data = await response.json();
    if (data.error) throw new Error('place-source-unavailable');
    return data;
  }
  try {
    const hits = new Map();
    const wikiTitles = new Map();
    const searchItems = async () => {
      const data = await api('www.wikidata.org',{action:'wbsearchentities',search:term,language,uselang:language,type:'item',limit:'8'});
      for (const hit of data.search || []) if (/^Q\d+$/u.test(hit.id)) hits.set(hit.id,safeText(hit.match?.text || hit.label));
    };
    const searchWiki = async () => {
      const data = await api(`${language}.wikipedia.org`,{action:'query',generator:'search',gsrsearch:term,gsrlimit:'5',gsrnamespace:'0',prop:'pageprops|coordinates',coprimary:'primary'});
      for (const page of Object.values(data.query?.pages || {})) {
        const id=page.pageprops?.wikibase_item;
        if (!/^Q\d+$/u.test(id || '') || Object.hasOwn(page.pageprops || {},'disambiguation')) continue;
        const title=safeText(page.title);
        if (!hits.has(id)) hits.set(id,title);
        const point=(page.coordinates || []).find(value=>value.globe==='earth' && inRegion({longitude:value.lon,latitude:value.lat}));
        wikiTitles.set(id,{language,title,point:point && {longitude:point.lon,latitude:point.lat}});
      }
    };
    // Wikipedia finds conventional Korean names not stored as Wikidata aliases.
    const searches = await Promise.allSettled([searchItems(),searchWiki()]);
    if (controller.signal.aborted) throw abortError();
    if (!hits.size) {
      if (searches.every(result=>result.status==='rejected')) throw new Error('place-source-unavailable');
      return [];
    }
    const data = await api('www.wikidata.org',{action:'wbgetentities',ids:[...hits.keys()].slice(0,12).join('|'),props:'labels|aliases|claims|sitelinks',languages:'ko|zh-hans|zh|en',sitefilter:'kowiki|zhwiki'});
    const termKey=normalizeSearch(term),inputKey=normalizeSearch(input);
    const found=[];
    for (const entity of Object.values(data.entities || {})) {
      if (!/^Q\d+$/u.test(entity.id || '') || entity.missing !== undefined) continue;
      if ((entity.claims?.P31 || []).some(claim=>claim.mainsnak?.datavalue?.value?.id==='Q5')) continue;
      const wikiTitle=wikiTitles.get(entity.id);
      const wdCoord=(entity.claims?.P625 || []).filter(claim=>claim.rank!=='deprecated').sort((a,b)=>(a.rank==='preferred'?0:1)-(b.rank==='preferred'?0:1)).map(claim=>claim.mainsnak?.datavalue?.value).find(value=>inRegion(value) && /(?:\/Q2$|^earth$)/u.test(value.globe || ''));
      // A page's primary coordinate can reflect a move that the Wikidata item
      // has not incorporated. The page must link to this exact entity ID.
      const coord=wikiTitle?.point || wdCoord;
      if (!coord) continue;
      const cn=[...labels(entity,'zh-hans'),...labels(entity,'zh'),safeText(entity.sitelinks?.zhwiki?.title)].find(value=>chinese.test(value));
      if (!cn) continue;
      const allNames=['ko','zh-hans','zh','en'].flatMap(lang=>labels(entity,lang));
      allNames.push(safeText(entity.sitelinks?.kowiki?.title),safeText(entity.sitelinks?.zhwiki?.title),hits.get(entity.id) || '');
      const keys=allNames.map(normalizeSearch).filter(Boolean);
      const exact=keys.includes(termKey)||keys.includes(inputKey);
      // Fuzzy full-text wiki matches (people, mentions, unrelated sites) cannot
      // silently become the destination. Keep only name matches, not snippets.
      const related=termKey.length>=3 && keys.some(key=>key.startsWith(termKey));
      if (!exact && !related) continue;
      const canonical=knownNameFor(cn,tripPlaces) || (exact ? known : null);
      const ko=canonical?.ko || labels(entity,'ko').find(value=>korean.test(value)) || (wikiTitle?.language==='ko' && korean.test(wikiTitle.title) ? wikiTitle.title : '') || safeText(entity.sitelinks?.kowiki?.title);
      const safeKo=korean.test(ko || '') ? ko : '';
      found.push({id:`search-wikidata-${entity.id}`,entityId:entity.id,name:safeKo || cn,koName:safeKo,cn,
        lng:coord.longitude,lat:coord.latitude,category:'landmark',area:'상하이·우전 검색권역 · Wikidata',
        description:'다국어 장소 자료에서 중국어 이름과 좌표를 확인한 장소예요. 건물·권역의 대표 좌표이며 실제 입구는 별도로 확인해 주세요.',
        tips:['같은 이름의 장소와 지점이 있을 수 있어요. 중국어 원명과 위치를 함께 확인하세요.'],
        source:`https://www.wikidata.org/wiki/${entity.id}`,coordinateSource:wikiTitle?.point ? `https://${wikiTitle.language}.wikipedia.org/wiki/${encodeURIComponent(wikiTitle.title)}` : `https://www.wikidata.org/wiki/${entity.id}`,nameSource:canonical?'dictionary':'wikidata',nameSourceUrl:canonical?.source || `https://www.wikidata.org/wiki/${entity.id}`,
        originalName:cn,searchQuery:cn,recommended:false,approximate:true,nameTranslated:false,
        translationStatus:safeKo?'verified':'unavailable',kind:'entity',matchType:exact?'exact':'prefix'});
    }
    found.sort((a,b)=>(a.matchType==='exact'?0:1)-(b.matchType==='exact'?0:1));
    if (signal?.aborted || controller.signal.aborted) throw abortError();
    if (cache && found.length) {
      lookupCache.set(cacheKey,{at:Date.now(),value:found});
      if (lookupCache.size>100) lookupCache.delete(lookupCache.keys().next().value);
    }
    return found.map(item=>({...item}));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort',abort);
  }
}

/** Legacy string contract; now resolves known names/entities, never translation. */
export async function translateSearchQuery(query,options={}) {
  if (options.signal?.aborted) throw abortError();
  const plan=resolveKnownQuery(query,tripPlaces);
  if (!plan.needsTranslation) return plan.query;
  const found=await lookupPlaceEntities(query,options);
  const exact=found.filter(place=>place.matchType==='exact');
  if (exact.length!==1) throw new Error(exact.length>1?'place-name-ambiguous':'place-name-unresolved');
  return exact[0].cn;
}

// Optional explanatory text ONLY. Never read by queryIdentity, search-language,
// koName, name, cn, searchQuery or navigation. It is not a verified place name.
async function referenceTranslation(cn,{signal,fetchImpl=fetch,timeoutMs=4500,cache=true}={}) {
  if (!chinese.test(cn) || !safeText(cn)) return '';
  if (signal?.aborted) throw abortError();
  if (cache && referenceCache.has(cn)) return referenceCache.get(cn);
  const controller=new AbortController();
  const abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,Math.min(4500,Math.max(1,timeoutMs)));
  try {
    const params=new URLSearchParams({q:cn,langpair:'zh-CN|ko'});
    const response=await fetchImpl(`https://api.mymemory.translated.net/get?${params}`,{signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
    if (!response.ok) return '';
    const data=await response.json();
    if (data.quotaFinished || Number(data.responseStatus)!==200) return '';
    const text=safeText(data.responseData?.translatedText);
    if (!text || !korean.test(text) || signal?.aborted || controller.signal.aborted) return '';
    if (cache) {referenceCache.set(cn,text);if(referenceCache.size>100)referenceCache.delete(referenceCache.keys().next().value);}
    return text;
  } catch(error) {if(signal?.aborted)throw error;return '';}
  finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}

/** Original Chinese remains authoritative; Korean is a sourced label or absent. */
export async function translatePlaceName(place,options={}) {
  if (options.signal?.aborted) throw abortError();
  const original=safeText(place.originalName || place.cn || place.name);
  const cn=safeText(place.cn || original);
  const known=knownNameFor(cn,tripPlaces);
  const base={cn,searchQuery:cn,originalName:original,nameTranslated:false,displayTranslation:''};
  if (known) return {...base,name:known.ko,koName:known.ko,nameSource:'dictionary',nameSourceUrl:known.source,translationStatus:'verified'};
  if (place.koName && korean.test(place.koName) && !place.nameTranslated) return {...base,name:place.koName,koName:place.koName,nameSource:place.nameSource || 'map',translationStatus:'verified'};
  if (chinese.test(cn)) {
    try {
      const candidates=await lookupPlaceEntities(cn,options);
      const matched=candidates.filter(item=>item.matchType==='exact' && item.koName && distance(item,place)<=0.8);
      if (matched.length===1) return {...base,name:matched[0].koName,koName:matched[0].koName,nameSource:'wikidata',nameSourceUrl:matched[0].source,translationStatus:'verified'};
    } catch(error) { if (options.signal?.aborted) throw error; }
  }
  const displayTranslation=options.referenceTranslation===false ? '' : await referenceTranslation(cn,options);
  return {...base,name:cn || original,koName:'',nameSource:'original',translationStatus:'unavailable',displayTranslation,displayTranslationSource:displayTranslation?'MyMemory':'',displayTranslationLabel:displayTranslation?'한국어 참고 번역 · 장소 이름 아님':''};
}
