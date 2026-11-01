// Surrounding places come from the map's already-loaded vector tiles. Names
// are resolved locally; displaying labels never makes a translation request.
// Schema: https://openmaptiles.org/schema/#poi
// Collision/priority: https://maplibre.org/maplibre-style-spec/layers/#symbol
import {knownNameFor,SEARCH_NAME_CATALOG} from './search-language.js';
import {places as tripPlaces} from './data.js';
import {readChineseName} from './poi-name-reading.js';
import {POI_NAMES} from './poi-names.js';
import {findCafeBrand} from './cafe-brands.js';

export const CONTEXT_LAYER_IDS = ['context-poi-detail','context-poi-nearby','context-poi-main'];
const SOURCE='openmaptiles',SOURCE_LAYER='poi';
const text=value=>typeof value==='string'?value.replace(/[\u0000-\u001f]/gu,' ').trim().slice(0,160):'';
const ko=/[가-힣]/u;
const han=/[\u3400-\u9fff]/u;
const extraNames=new Map(POI_NAMES.flatMap(item=>[item.cn,...(item.aliases||[])].map(name=>[name.toLocaleLowerCase(),item])));
const labelCache=new Map();
const classNames={cafe:'카페',restaurant:'식당',fast_food:'간편식',grocery:'마트',shop:'상점',clothing_store:'옷가게',bakery:'베이커리',ice_cream:'디저트',bar:'바',lodging:'숙소',hotel:'호텔',museum:'박물관',attraction:'명소',park:'공원',art_gallery:'미술관',castle:'유적',town_hall:'관공서',library:'도서관',college:'대학교',school:'학교',railway:'역',bus:'정류장',pharmacy:'약국',hospital:'병원',post:'우체국',bank:'은행'};
const importantClasses=['attraction','museum','castle','park','art_gallery','town_hall','library','college','railway'];
const supportedClasses=Object.keys(classNames);

const brands=[
  ...SEARCH_NAME_CATALOG.filter(record=>record.type==='brand').map(record=>({ko:record.ko,cn:record.cn,cafeId:record.brandId,names:[record.cn,...record.aliases.filter(name=>!ko.test(name))]})),
  {ko:'아라비카',cn:'% Arabica',names:['% Arabica','%Arabica']},
  {ko:'홀리랜드',cn:'好利来',names:['好利来','Holiland']},
  {ko:'따룬파',cn:'大润发',names:['大润发','大潤發','RT-Mart']},
  {ko:'주광옥',cn:'朱光玉火锅馆',names:['朱光玉']},
  {ko:'헌지우이치엔',cn:'很久以前羊肉串',names:['很久以前羊肉串']},
  {ko:'점도덕',cn:'点都德',names:['点都德','點都德']},
];

function brandFor(properties) {
  const values=['name','name:zh-Hans','name:zh','name:en','name_en','brand'].map(key=>text(properties[key]));
  const cafe=values.map(findCafeBrand).find(Boolean);
  if(cafe)return {...cafe,names:[cafe.cn,...cafe.aliases]};
  const value=values.join('|').toLocaleLowerCase();
  return brands.find(brand=>!brand.cafeId&&brand.names.some(name=>value.includes(name.toLocaleLowerCase()))) || null;
}

function categoryFor(properties) {
  if(findCafeBrand(properties['name:zh-Hans']||properties['name:zh']||properties.name||properties.brand||''))return 'cafe';
  const values=[properties.class,properties.subclass];
  if(values.some(value=>['cafe','bakery','ice_cream'].includes(value)))return 'cafe';
  if(values.some(value=>['restaurant','fast_food','bar','pub','food_court'].includes(value)))return 'food';
  if(values.some(value=>['shop','grocery','supermarket','convenience','mall','department_store','clothing_store'].includes(value)))return 'shopping';
  if(values.some(value=>['lodging','hotel','hostel','guest_house','motel'].includes(value)))return 'hotel';
  if(values.some(value=>['railway','station','subway','bus','bus_station','aerodrome'].includes(value)))return 'transport';
  return 'landmark';
}

function stableId(name,lng,lat) {
  let hash=2166136261;
  for(const char of name)hash=Math.imul(hash^char.codePointAt(0),16777619)>>>0;
  return `search-context-${hash.toString(36)}-${lng.toFixed(6)}-${lat.toFixed(6)}`;
}

/** Display only: an automatic reading is never a search alias or an identity. */
export function contextNameInfo(properties={}) {
  const original=['name:zh-Hans','name:zh','name','name:en','name_en'].map(key=>text(properties[key])).find(Boolean);
  if(!original)return null;
  const cacheKey=JSON.stringify([original,properties['name:ko'],properties['name:en'],properties.name_en,properties.brand]);
  if(labelCache.has(cacheKey))return labelCache.get(cacheKey);
  const tagged=text(properties['name:ko']),known=knownNameFor(original,tripPlaces),extra=extraNames.get(original.toLocaleLowerCase()),brand=brandFor(properties);
  const exactBrand=brand?.names.some(name=>name.toLocaleLowerCase()===original.toLocaleLowerCase());
  const chinese=han.test(original)?original:extra?.cn||known?.cn||(exactBrand&&han.test(brand.cn)?brand.cn:original);
  const reading=!ko.test(tagged)&&!known&&!extra&&!brand?readChineseName(original):null;
  const korean=ko.test(tagged)?tagged:extra?.ko||known?.ko||brand?.ko||reading?.ko||'';
  const kind=reading?'reading':korean?'known':'original';
  const first=korean+(kind==='reading'?' · 독음':'');
  const short=value=>value.length>40?`${value.slice(0,39)}…`:value;
  const label=korean&&korean!==chinese?`${short(first)}\n${short(chinese)}`:chinese;
  const result={original,chinese,korean,kind,label,source:extra?.source||known?.source||''};
  if(labelCache.size>=3000)labelCache.delete(labelCache.keys().next().value);
  labelCache.set(cacheKey,result);return result;
}

/** Convert only a real named point from the rendered POI layer, not a click's
 * arbitrary map coordinate. Vector feature IDs are not assumed to be OSM IDs. */
export function contextFeatureToPlace(feature) {
  if(feature?.geometry?.type!=='Point')return null;
  const [lng,lat]=feature.geometry.coordinates || [];
  if(!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>90)return null;
  const properties=feature.properties || {};
  const names=contextNameInfo(properties);if(!names)return null;
  const {original,korean:koreanName,kind}=names;
  // Navigation always keeps the source's full original branch name.
  const cn=original;
  const name=kind==='reading'?`${koreanName} · 독음`:koreanName||original;
  const typeLabel=classNames[properties.subclass] || classNames[properties.class] || '지도 장소';
  return {id:stableId(original,lng,lat),name,koName:kind==='known'?koreanName:'',cn,displayChinese:names.chinese,lng,lat,brandId:findCafeBrand(original)?.id,
    category:categoryFor(properties),area:`주변 ${typeLabel} · 지도 자료`,
    description:'지도에 등록된 주변 장소예요. 지도 표시점은 실제 출입구와 다를 수 있으니 중국어 이름과 위치를 함께 확인해 주세요.',
    tips:[...(kind==='reading'?['한글 독음은 중국어 발음을 자동 표기한 참고 정보예요. 통용 이름과 다를 수 있으며 길찾기는 중국어 원명과 지도 좌표를 사용해요.']:[]),'영업 여부와 출입구는 방문 전에 확인하세요. 주변 장소 표시는 추천·광고가 아닌 지도 자료예요.'],
    originalName:original,searchQuery:original,nameTranslated:kind==='reading',nameSource:kind==='reading'?'automatic-reading':kind==='known'?'map-dictionary':'original',
    translationStatus:kind==='reading'?'reading':koreanName?'verified':'unavailable',recommended:false,approximate:true,contextPlace:true,
    source:`https://www.openstreetmap.org/?mlat=${lat.toFixed(6)}&mlon=${lng.toFixed(6)}#map=19/${lat.toFixed(6)}/${lng.toFixed(6)}`};
}

function firstText(keys) {
  const expression=['case'];
  for(const key of keys)expression.push(['all',['has',key],['!=',['get',key],'']],['to-string',['get',key]]);
  expression.push('');return expression;
}

const nameExpression=firstText(['name:zh-Hans','name:zh','name','name:en','name_en']);
const fullNameExpression=['downcase',['concat',nameExpression,' ',firstText(['name:en','name_en']),' ',firstText(['brand'])]];
function brandTest(brand) {
  return ['any',...brand.names.map(name=>{
    const value=name.toLocaleLowerCase();
    if(brand.cafeId&&['coco','manner','都可'].includes(value))return ['any',...['name:zh-Hans','name:zh','name','name:en','name_en','brand'].map(key=>['==',['downcase',['to-string',['coalesce',['get',key],'']]],value]),['in',`${value}(`,fullNameExpression],['in',`${value}（`,fullNameExpression]];
    return ['in',value,fullNameExpression];
  })];
}
const brandTests=brands.map(brandTest);
const isBrand=['any',...brandTests];
const isCafeBrand=['any',...brands.filter(brand=>brand.cafeId).map(brandTest)];
const rank=['to-number',['get','rank'],100];
const isMain=['any',isBrand,['all',['match',['get','class'],importantClasses,true,false],['<=',rank,8]]];
const namedPoint=['all',['==',['geometry-type'],'Point'],['!=',nameExpression,'']];
const supported=['match',['get','class'],supportedClasses,true,false];

function knownKoreanExpression() {
  const exact=new Map();
  for(const place of tripPlaces)if(place.cn&&ko.test(place.name))exact.set(place.cn.toLocaleLowerCase(),place.name.split('·')[0].trim());
  for(const record of SEARCH_NAME_CATALOG)for(const name of [record.cn,...record.aliases.filter(alias=>!ko.test(alias))])exact.set(name.toLocaleLowerCase(),record.ko);
  for(const record of POI_NAMES)for(const name of [record.cn,...(record.aliases||[])])exact.set(name.toLocaleLowerCase(),record.ko);
  const match=['match',['downcase',nameExpression]];
  for(const [name,koreanName] of exact)match.push(name,koreanName);
  match.push('');
  const expression=['case',['!=',firstText(['name:ko']),''],firstText(['name:ko']),['!=',match,''],match];
  for(let index=0;index<brands.length;index++)expression.push(brandTests[index],brands[index].ko);
  expression.push('');return expression;
}

const koreanExpression=knownKoreanExpression();
const shortName=['case',['>', ['length',nameExpression],34],['concat',['slice',nameExpression,0,33],'…'],nameExpression];
const bilingualName=['case',['all',['!=',koreanExpression,''],['!=',koreanExpression,nameExpression]],['concat',koreanExpression,'\n',shortName],shortName];
// All icon IDs below were verified in the current ofm_f384/ofm.json sprite.
const iconExpression=['case',isCafeBrand,'cafe_11',['match',['get','class'],['cafe','ice_cream'],'cafe_11',['restaurant','fast_food','bar'],'restaurant_11','museum','museum_11','park','park_11','grocery','grocery_11','lodging','lodging_11','pharmacy','pharmacy_11','hospital','hospital_11','railway','railway_11',['shop','clothing_store'],'shop_11','attraction_11']];
const starbucks=brands.findIndex(brand=>brand.cn==='星巴克');
const colorExpression=['case',brandTests[starbucks], '#1d6b50',['match',['get','class'],['cafe','ice_cream'],true,false],'#886341',['match',['get','class'],['restaurant','fast_food','bar'],true,false],'#a65c45',['match',['get','class'],['shop','grocery','clothing_store'],true,false],'#756284','#3d7069'];

/** Pure layer descriptions, also useful for validation without a live map. */
export function contextPlaceLayers() {
  const layout={'visibility':'visible','symbol-placement':'point','symbol-sort-key':['+',rank,['case',isBrand,-100,0]],
    'icon-image':iconExpression,'icon-size':1,'icon-allow-overlap':false,'icon-ignore-placement':false,'icon-optional':true,'icon-padding':2,
    'text-field':bilingualName,'text-font':['Noto Sans Regular'],'text-size':['interpolate',['linear'],['zoom'],13,11.5,16,12.5,19,14],
    'text-anchor':'top','text-offset':[0,.8],'text-max-width':9,'text-line-height':1.2,'text-padding':4,'text-allow-overlap':false,'text-ignore-placement':false,
    'text-pitch-alignment':'viewport','text-rotation-alignment':'viewport'};
  const paint={'text-color':colorExpression,'text-halo-color':'#fffef7','text-halo-width':1.6,'text-halo-blur':.35};
  const layer=(id,minzoom,filter,maxzoom)=>({id,type:'symbol',source:SOURCE,'source-layer':SOURCE_LAYER,minzoom,...(maxzoom?{maxzoom}:{}),filter,layout:structuredClone(layout),paint:structuredClone(paint)});
  // Main names stay visible as detail layers appear. The disjoint filters keep
  // any POI from receiving two labels at the same zoom.
  return [
    layer(CONTEXT_LAYER_IDS[0],16,['all',namedPoint,supported,['!',isMain]]),
    layer(CONTEXT_LAYER_IDS[1],14.3,['all',namedPoint,supported,['!',isMain],['<=',rank,10]],16),
    layer(CONTEXT_LAYER_IDS[2],13,['all',namedPoint,isMain]),
  ];
}

/** Install after map load. Obstacles are DOM pin rectangles in canvas-relative
 * pixels: {left,top,right,bottom}. refresh() after changing trip markers.
 * No source or base style layer is modified. */
export function installContextPlaces(map,{onPlace=()=>{},isBlocked=()=>false,getObstacles=()=>[],enabled=true}={}) {
  const definitions=contextPlaceLayers();
  let visible=Boolean(enabled),destroyed=false,timer=null,blockedGesture=false,lastBlockedKey='',lastLabelsKey='',ownsPointer=false;
  const activeIds=()=>CONTEXT_LAYER_IDS.filter(id=>map.getLayer(id));
  function ensureLayers() {
    if(destroyed || !map.getSource(SOURCE))return;
    for(const definition of definitions)if(!map.getLayer(definition.id))map.addLayer({...definition,layout:{...definition.layout,visibility:visible?'visible':'none'}});
  }
  function restoreCursor() {if(ownsPointer&&map.getCanvas().style.cursor==='pointer')map.getCanvas().style.cursor='';ownsPointer=false;}
  function refreshNow() {
    timer=null;if(destroyed)return;ensureLayers();
    const ids=activeIds();if(!ids.length)return;
    const rectangles=(getObstacles() || []).filter(rect=>[rect.left,rect.top,rect.right,rect.bottom].every(Number.isFinite)).slice(0,80);
    const excluded=new Set();
    if(visible && map.getZoom()>=13) {
      const features=map.querySourceFeatures(SOURCE,{sourceLayer:SOURCE_LAYER,filter:namedPoint});
      const names=new Map(),canvas=map.getCanvas();
      for(const feature of features) {
        if(feature.geometry?.type!=='Point')continue;
        const point=map.project(feature.geometry.coordinates);
        if(point.x < -150 || point.y < -100 || point.x > canvas.clientWidth+150 || point.y > canvas.clientHeight+100)continue;
        const original=['name:zh-Hans','name:zh','name','name:en','name_en'].map(key=>text(feature.properties?.[key])).find(Boolean);
        if(original&&!names.has(original)){
          const info=contextNameInfo(feature.properties);
          if(info)names.set(original,info.label);
        }
        // A compact two-line symbol below the point, including its icon. This
        // conservative box also keeps the edge of text off a large DOM pin.
        if(feature.id!==undefined&&feature.id!==null&&rectangles.some(rect=>point.x+62>rect.left-4&&point.x-62<rect.right+4&&point.y+48>rect.top-4&&point.y-9<rect.bottom+4))excluded.add(String(feature.id));
      }
      const entries=[...names].sort(([a],[b])=>a.localeCompare(b));
      const labelKey=JSON.stringify(entries);
      if(labelKey!==lastLabelsKey){
        lastLabelsKey=labelKey;
        const field=entries.length?['match',nameExpression,...entries.flat(),bilingualName]:bilingualName;
        for(const id of ids)map.setLayoutProperty(id,'text-field',field);
      }
    }
    const blocked=[...excluded].sort();const key=JSON.stringify(blocked);
    if(key===lastBlockedKey)return;
    lastBlockedKey=key;
    for(const definition of definitions)if(map.getLayer(definition.id))map.setFilter(definition.id,blocked.length?['all',definition.filter,['!',['in',['to-string',['id']],['literal',blocked]]]]:definition.filter);
  }
  function refresh() {if(!destroyed){clearTimeout(timer);timer=setTimeout(refreshNow,100);}}
  function beforeGesture() {blockedGesture=Boolean(isBlocked());}
  function click(event) {
    const blocked=blockedGesture || isBlocked();blockedGesture=false;
    if(destroyed||!visible||blocked||event.originalEvent?.defaultPrevented)return;
    const ids=activeIds();if(!ids.length)return;
    const point=event.point;
    const features=map.queryRenderedFeatures([[point.x-5,point.y-5],[point.x+5,point.y+5]],{layers:ids});
    const place=features.map(contextFeatureToPlace).find(Boolean);
    if(place)onPlace(place);
  }
  function mousemove(event) {
    if(destroyed||!visible||isBlocked()){restoreCursor();return;}
    const ids=activeIds();
    if(ids.length && map.queryRenderedFeatures(event.point,{layers:ids}).length){map.getCanvas().style.cursor='pointer';ownsPointer=true;}else restoreCursor();
  }
  function sourceData(event) {if(event.sourceId===SOURCE && event.isSourceLoaded)refresh();}
  function styleLoad() {lastBlockedKey='';lastLabelsKey='';ensureLayers();refresh();}
  map.on('click',click);map.on('mousemove',mousemove);map.on('mousedown',beforeGesture);map.on('touchstart',beforeGesture);
  map.on('moveend',refresh);map.on('resize',refresh);map.on('sourcedata',sourceData);map.on('style.load',styleLoad);
  ensureLayers();refresh();
  return {layerIds:[...CONTEXT_LAYER_IDS],get visible(){return visible;},refresh,
    setVisible(next){visible=Boolean(next);ensureLayers();for(const id of activeIds())map.setLayoutProperty(id,'visibility',visible?'visible':'none');if(!visible)restoreCursor();refresh();},
    destroy(){destroyed=true;clearTimeout(timer);restoreCursor();map.off('click',click);map.off('mousemove',mousemove);map.off('mousedown',beforeGesture);map.off('touchstart',beforeGesture);map.off('moveend',refresh);map.off('resize',refresh);map.off('sourcedata',sourceData);map.off('style.load',styleLoad);for(const id of [...activeIds()].reverse())map.removeLayer(id);},
  };
}
