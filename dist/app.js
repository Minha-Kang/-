import {findLocalPlaces,resolveKnownQuery} from './search-language.js';
import {lookupPlaceEntities,translatePlaceName} from './search-translation.js';
import {createBottomSheet} from './bottom-sheet.js';
import {transitJourneyHTML} from './transit-view.js';
import {installContextPlaces,contextNameInfo} from './context-places.js';
import {places,days,checklist} from './data.js';
import {CAFE_BRANDS,findCafeBrand} from './cafe-brands.js';
import {getRoute,amapRouteUrl,amapSearchUrl,appleMapsUrl,haversine} from './routing.js';

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'?u.href:'#';}catch{return '#';}};
const read=(key,fallback)=>{try{const value=JSON.parse(localStorage.getItem(key));return Array.isArray(fallback)?(Array.isArray(value)?value:fallback):(value??fallback);}catch{return fallback;}};
const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{toast('이 브라우저에서는 저장할 수 없어요. 일반 Safari에서 다시 열어주세요.');}};
const categories={all:{label:'전체',icon:'✦'},landmark:{label:'명소',icon:'⌂'},food:{label:'맛집',icon:'♨'},cafe:{label:'카페',icon:'☕'},shopping:{label:'쇼핑',icon:'▧'},hotel:{label:'숙소',icon:'⌑'},transport:{label:'교통',icon:'✈'}};
const bigIcons={landmark:'🏛',food:'🥢',cafe:'☕',shopping:'🛍',hotel:'🛏',transport:'✈'};
const state={day:1,view:'itinerary',category:'all',cafeBrand:null,selected:null,saved:new Set(read('shanghai-saved',[])),checks:new Set(read('shanghai-checks',[])),custom:read('shanghai-custom',[]).filter(p=>Number.isFinite(p.lng)&&Number.isFinite(p.lat)),mode:'taxi',is3D:false,mapReady:false,gps:null,pinning:false,collapsed:false};
// Retire old, unverified machine translations without losing saved locations.
for(const p of state.custom){if(p.nameTranslated&&!p.nameSource){p.name=p.originalName||p.cn||p.name;p.cn=p.originalName||p.cn;p.searchQuery=p.cn;p.koName='';p.nameTranslated=false;p.translationStatus='unavailable';}}
// Update labels on previously opened nearby pins too; keep their original
// identity, full branch query, coordinates and saved IDs untouched.
for(const p of state.custom.filter(p=>p.contextPlace)){
 const names=contextNameInfo({name:p.originalName||p.cn,'name:ko':!p.nameTranslated?p.koName:''});
 if(!names)continue;
 p.name=names.kind==='reading'?`${names.korean} · 독음`:names.korean||names.original;
 p.koName=names.kind==='known'?names.korean:'';p.displayChinese=names.chinese;
 p.nameTranslated=names.kind==='reading';p.nameSource=names.kind==='reading'?'automatic-reading':names.kind==='known'?'map-dictionary':'original';
 p.translationStatus=names.kind==='reading'?'reading':names.kind==='known'?'verified':'unavailable';
}
let searchPlaces=[];
let bottomSheet,contextPlaces;
let contextVisible=read('shanghai-context-labels',true)!==false;
let map,markers=[],gpsMarker,searchAbort,routeAbort,lastFocused,activePanel,toastTimer,routeVersion=0;
const allPlaces=()=>[...places,...state.custom,...searchPlaces.filter(p=>!state.custom.some(c=>c.id===p.id))];
const placeById=id=>allPlaces().find(p=>p.id===id);
const day=()=>days.find(d=>Number(d.id)===state.day)||days[0];
const dayPlaces=()=>day().stops.map(s=>placeById(s.placeId)).filter(Boolean);
const isMobile=()=>matchMedia('(max-width:700px)').matches;
const category=p=>categories[p.category]||categories.landmark;

function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5200);}
function counts(){$('#savedCount').textContent=state.saved.size;$('#checkCount').textContent=`${state.checks.size}/${checklist.length}`;}
function renderDayTabs(){$('#dayTabs').innerHTML=days.map(d=>`<button data-day="${d.id}" class="${Number(d.id)===state.day?'active':''}" aria-pressed="${Number(d.id)===state.day}">DAY ${d.id}<span>${['첫 만남','골목 산책','수향마을','아쉬운 안녕'][Number(d.id)-1]}</span></button>`).join('');}
function renderFilters(){$('#filters').innerHTML=Object.entries(categories).filter(([k])=>!['hotel','transport'].includes(k)).map(([k,c])=>`<button data-category="${k}" class="${state.category===k?'active':''}" aria-pressed="${state.category===k}"><span>${c.icon}</span>${c.label}</button>`).join('');}
const selectedCafeBrand=()=>CAFE_BRANDS.find(brand=>brand.id===state.cafeBrand);
const matchesCafeBrand=p=>p.category==='cafe'&&(p.brandId===state.cafeBrand||findCafeBrand(p.cn||p.name)?.id===state.cafeBrand);
function cafeExplorerHTML(){
 if(state.view!=='discover'||!['all','cafe'].includes(state.category))return '';
 const brand=selectedCafeBrand();
 return `<section class="cafe-explorer" aria-label="카페와 티 브랜드"><div class="cafe-explorer-heading"><div><div class="eyebrow">COFFEE & TEA</div><h3>여행 중, 한 잔의 여유</h3></div><button data-cafe-all aria-pressed="${!brand}">모두 보기</button></div><div class="cafe-brand-strip" aria-label="브랜드 선택">${CAFE_BRANDS.map(b=>`<button class="cafe-brand ${b.id===brand?.id?'active':''}" data-cafe-brand="${esc(b.id)}" aria-pressed="${b.id===brand?.id}"><strong>${esc(b.ko)}</strong><span lang="zh-Hans">${esc(b.cn)}</span></button>`).join('')}</div><p class="cafe-brand-note">${esc(brand?brand.tagline:'헤이티·차지부터 커피까지, 브랜드를 골라 지점을 찾아보세요.')}</p>${brand?`<button class="cafe-more" data-cafe-search="${esc(brand.id)}">⌕ ${esc(brand.ko)} 다른 지점 찾기 <span>↗</span></button>`:''}</section>`;
}
function itineraryStopHTML(s,i){
 const p=placeById(s.placeId),number=`<span class="stop-number">${String(i+1).padStart(2,'0')}</span>`;
 if(!p){
  if(!s.unlocated)return '';
  return `<div class="stop stop-event">${number}<article class="stop-card"><div class="stop-time">${esc(s.time)} <span class="category-dot"></span> ${esc(s.category==='transport'?'교통':'일정')}</div><div class="stop-title">${esc(s.title)}</div><div class="stop-cn">${esc(s.cn)}</div><div class="stop-note">${esc(s.note)}</div>${s.locationNote?`<span class="event-location-note">${esc(s.locationNote)}</span>`:''}</article></div>`;
 }
 return `<div class="stop ${state.selected===p.id?'active':''}" data-stop="${esc(p.id)}">${number}<button class="stop-card" data-place="${esc(p.id)}"><div class="stop-time">${esc(s.time)} <span class="category-dot"></span> ${category(p).label}</div><div class="stop-title">${esc(p.name)}</div><div class="stop-cn">${esc(p.cn)}</div>${s.note?`<div class="stop-note">${esc(s.note)}</div>`:''}<span class="stop-arrow">↗</span></button></div>`;
}
function renderSidebar(){
 counts();renderDayTabs();renderFilters();
 $$('.view-tabs button').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);b.setAttribute('aria-pressed',String(b.dataset.view===state.view));});
 $('#dayTabs').hidden=state.view!=='itinerary';
 if(state.view==='itinerary'){
  const d=day();$('#sidebarContent').innerHTML=`<div class="day-summary"><div><h2>${esc(d.title)}</h2><p>${esc(d.subtitle)}</p></div><span>${d.stops.length} 일정</span></div><div class="timeline">${d.stops.map(itineraryStopHTML).join('')}</div>${state.day===4?'<div class="warning-note">17:45 국제선 출발: 공항 14:45 도착을 목표로 여유를 잡아보세요. 정대광장 → 티엔즈팡은 강을 건너며, 마트 일정은 조정이 필요해요. 항공사 체크인 마감도 확인하세요.</div>':''}<p class="route-caveat">변경된 여행 계획을 담았어요. 항공편은 각 공항 현지시간, 그 외 일정은 중국 현지시간이에요. 식당 지점·영업시간은 방문 전 확인해주세요.</p>`;
 }else{
  const brand=state.view==='discover'?selectedCafeBrand():null;
  const ps=allPlaces().filter(p=>state.view==='saved'?state.saved.has(p.id):brand?matchesCafeBrand(p):p.recommended).filter(p=>state.category==='all'||p.category===state.category);
  $('#sidebarContent').innerHTML=`${cafeExplorerHTML()}<div class="day-summary"><div><h2>${state.view==='saved'?'다시 꺼내 볼 장소':brand?esc(brand.ko)+' 들르기':'여행 사이, 작은 발견'}</h2><p>${state.view==='saved'?'마음에 든 곳을 이 기기에 모아두었어요':brand?'장소를 누르면 지도·저장·길찾기로 연결돼요':'일정 근처에 함께 들러볼 만한 곳'}</p></div><span>${ps.length} PLACES</span></div>${ps.map(p=>`<button class="discover-card" data-place="${esc(p.id)}"><span class="discover-icon">${bigIcons[p.category]||'📍'}</span><div><strong>${esc(p.name)}</strong><p>${esc(p.area)} · ${category(p).label}<br>${esc(p.cn)}</p></div><b>↗</b></button>`).join('')||`<div class="empty-state">${brand?'이 브랜드는 위의 지점 찾기로 검색해보세요.':state.view==='saved'?'아직 모아둔 장소가 없어요.<br>장소 정보에서 ♡를 눌러 저장해보세요.':'다른 분류도 둘러보세요.'}</div>`}`;
 }
 updateMarkers();updateDayLine();
}

async function initMap(){
 try{
  if(!window.maplibregl)throw Error('map library');
  const style=await fetch('./map-style.json').then(r=>{if(!r.ok)throw Error();return r.json();});
  for(const layer of style.layers){
   if(layer.id==='water'&&layer.paint)layer.paint['fill-color']='#c5dcd6';
   if(layer.id==='background')layer.paint['background-color']='#f3f2ea';
   if(layer.id==='park'&&layer.paint)layer.paint['fill-color']='#dfe8d5';
   if(layer.id==='building')layer.paint['fill-color']='#e2e4d8';
  }
  map=new maplibregl.Map({container:'map',style,center:[121.4868,31.2408],zoom:13.3,pitch:0,attributionControl:{compact:true},maxPitch:65,minZoom:3});
  map.on('load',()=>{
   state.mapReady=true;
   const firstSymbol=map.getStyle().layers.find(l=>l.type==='symbol')?.id;
   map.addLayer({id:'trip-buildings',source:'openmaptiles','source-layer':'building',type:'fill-extrusion',minzoom:13.8,layout:{visibility:state.is3D?'visible':'none'},paint:{'fill-extrusion-color':'#c4d2bc','fill-extrusion-height':['coalesce',['get','render_height'],8],'fill-extrusion-base':['coalesce',['get','render_min_height'],0],'fill-extrusion-opacity':.88}},firstSymbol);
   for(const id of ['day-line','route-line']){map.addSource(id,{type:'geojson',data:{type:'FeatureCollection',features:[]}});map.addLayer({id,type:'line',source:id,layout:{'line-cap':'round','line-join':'round'},paint:id==='day-line'?{'line-color':'#b78569','line-width':2,'line-opacity':.65,'line-dasharray':[2,3]}:{'line-color':'#e16d47','line-width':5,'line-opacity':.95}},firstSymbol);}
   contextPlaces=installContextPlaces(map,{enabled:contextVisible,isBlocked:()=>state.pinning||!!activePanel,getObstacles:markerObstacles,onPlace:p=>{const existing=state.custom.find(x=>x.id===p.id);if(existing){Object.assign(existing,p);write('shanghai-custom',state.custom);}else if(!allPlaces().some(x=>x.id===p.id))searchPlaces.push(p);showPlace(p.id);}});
   map.on('zoomend',updateMapDetail);
   $('#mapStatus').textContent='상하이 여행 지도';updateMarkers();updateDayLine();updateMapDetail();if(isMobile())map.easeTo({padding:mapPadding(),duration:0});if(state.is3D)set3D(true);
  });
  map.on('error',e=>{if(e.error?.message?.includes('fetch')||e.error?.status){$('#mapStatus').textContent='지도 연결이 불안정해요 · 재접속 필요';}});
  map.on('click',e=>{if(!state.pinning)return;const p={id:`custom-${Date.now()}`,name:'내가 고른 장소',cn:'地图选点',category:'landmark',lng:e.lngLat.lng,lat:e.lngLat.lat,area:'직접 선택',description:'지도에서 직접 고른 위치예요. 장소 이름을 바꾸고 출발지나 도착지로 사용할 수 있어요.',tips:[],recommended:false,approximate:false,source:'',searchQuery:''};state.custom.push(p);write('shanghai-custom',state.custom);setPinning(false);showPlace(p.id);});
 }catch(e){$('#mapStatus').textContent='지도를 불러오지 못했어요';const el=document.createElement('div');el.className='map-error';el.innerHTML='지도 연결을 확인해주세요.<br>일정과 장소 정보는 계속 볼 수 있어요.<br><button id="retryMap">다시 불러오기</button>';$('#mapStage').append(el);$('#retryMap').onclick=()=>location.reload();}
}
function markerObstacles(){const canvas=map.getCanvas().getBoundingClientRect();return markers.map(m=>m.getElement()).filter(el=>el.getClientRects().length).map(el=>{const r=el.getBoundingClientRect();return {left:r.left-canvas.left-8,top:r.top-canvas.top-5,right:r.right-canvas.left+8,bottom:r.bottom-canvas.top+8};});}
function updateMapDetail(){
 const detailed=state.mapReady&&map.getZoom()>=14.5;
 $('#mapStage').classList.toggle('map-overview',!detailed);
 $('#contextToggle').classList.toggle('active',contextVisible);
 $('#contextToggle').setAttribute('aria-pressed',String(contextVisible));
 contextPlaces?.refresh();
}
function mapPadding(){return isMobile()?{top:154,bottom:Math.min((bottomSheet?.height??(state.collapsed?0:innerHeight*.47))+25,Math.max(0,innerHeight-235)),left:45,right:105}:{top:innerHeight<650?155:175,bottom:innerHeight<650?65:150,left:70,right:100};}
function updateDayLine(){if(!state.mapReady)return;const ps=dayPlaces();map.getSource('day-line').setData({type:'FeatureCollection',features:ps.length>1&&state.view==='itinerary'?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:ps.map(p=>[p.lng,p.lat])}}]:[]});}
function visiblePlaces(){
 let ps=state.view==='saved'?allPlaces().filter(p=>state.saved.has(p.id)):state.view==='discover'&&state.cafeBrand?allPlaces().filter(matchesCafeBrand):state.category!=='all'?allPlaces():state.view==='discover'?allPlaces().filter(p=>p.recommended):[...dayPlaces(),...places.filter(p=>p.recommended||['pearl','lujiazui','waibaidu'].includes(p.id)),...state.custom];
 ps=[...new Map(ps.map(p=>[p.id,p])).values()].filter(p=>state.category==='all'||p.category===state.category);
 const selected=placeById(state.selected);if(selected&&!ps.some(p=>p.id===selected.id))ps.push(selected);return ps;
}
function updateMarkers(){if(!state.mapReady)return;markers.forEach(m=>m.remove());markers=[];const stops=day().stops;
 $('#mapStage').classList.toggle('cafe-browse',state.category==='cafe');
 visiblePlaces().forEach(p=>{const index=stops.findIndex(s=>s.placeId===p.id);const button=document.createElement('button');button.className=`place-marker ${index>=0&&state.view==='itinerary'?'day-marker':''} ${p.recommended?'recommend-marker':''} ${state.selected===p.id?'selected':''}`;button.classList.toggle('far-marker',haversine(p,{lng:121.49,lat:31.23})>15);button.setAttribute('aria-label',`${p.name}${p.approximate?' · 대략 위치':''} 정보 보기`);button.innerHTML=`<span class="marker-bubble">${index>=0&&state.view==='itinerary'?index+1:category(p).icon}</span><span class="marker-label"><span>${esc(p.name)}${p.approximate?' ≈':''}</span>${p.cn&&p.cn!==p.name?`<span class="marker-cn" lang="zh-Hans">${esc(p.displayChinese||p.cn)}</span>`:''}</span>`;button.onclick=e=>{e.stopPropagation();showPlace(p.id);};markers.push(new maplibregl.Marker({element:button,anchor:'bottom'}).setLngLat([p.lng,p.lat]).addTo(map));});
 contextPlaces?.refresh();
}
function focusPlace(p,zoom=15){if(!state.mapReady)return;map.flyTo({center:[p.lng,p.lat],zoom:Math.max(map.getZoom(),zoom),padding:mapPadding(),duration:850,essential:false});}
// MapLibre 5 adds fitBounds padding to the persistent camera padding. Keep
// sheet clearance in the camera once, or a half-open sheet can prevent fitting.
function fitBoundsInView(bounds,{maxZoom=14,duration=900}={}){map.stop();map.setPadding(mapPadding());map.fitBounds(bounds,{padding:0,maxZoom,duration});}
function fitPlaces(includeFar=true){if(!state.mapReady){toast('지도가 준비되면 다시 눌러주세요.');return;}let ps=state.view==='itinerary'?dayPlaces():visiblePlaces();if(!includeFar)ps=ps.filter(p=>haversine(p,{lng:121.49,lat:31.23})<15);if(!ps.length)return;const bounds=new maplibregl.LngLatBounds();ps.forEach(p=>bounds.extend([p.lng,p.lat]));fitBoundsInView(bounds);}
function set3D(on){state.is3D=on;$('#twoD').classList.toggle('active',!on);$('#threeD').classList.toggle('active',on);$('#twoD').setAttribute('aria-pressed',String(!on));$('#threeD').setAttribute('aria-pressed',String(on));if(!state.mapReady){toast('지도를 불러오는 중이에요.');return;}map.setLayoutProperty('trip-buildings','visibility',on?'visible':'none');map.easeTo({pitch:on?58:0,bearing:on?-18:0,zoom:on?Math.max(map.getZoom(),15.3):map.getZoom(),padding:mapPadding(),duration:800});$('#mapStatus').textContent=on?'3D 건물 · 높이 데이터가 있는 곳':'2D 지도';}
function setPinning(on){state.pinning=on;$('#pinBtn').classList.toggle('active',on);$('#pinBtn').setAttribute('aria-pressed',String(on));if(map)map.getCanvas().style.cursor=on?'crosshair':'';if(on){closePanels();toast('지도에서 원하는 위치를 눌러주세요. 깃발 버튼을 다시 누르면 취소돼요.');}}

function showPanel(selector){const opening=!activePanel;if(opening&&document.activeElement!==document.body)lastFocused=document.activeElement;closePanels(false);activePanel=$(selector);activePanel.hidden=false;$('#backdrop').hidden=false;$('.app').inert=true;requestAnimationFrame(()=>activePanel?.querySelector('button,input,select,a')?.focus({preventScroll:true}));}
function closePanels(restore=true){if(activePanel)activePanel.hidden=true;$$('.detail-panel,.route-panel,.utility-panel').forEach(p=>p.hidden=true);$('#backdrop').hidden=true;$('.app').inert=false;activePanel=null;if(restore){const target=lastFocused?.isConnected&&lastFocused.getClientRects().length?lastFocused:$('#routeBtn');target.focus({preventScroll:true});}}
function showPlace(id){
 const p=placeById(id);if(!p)return;if(id.startsWith('search-')&&!state.custom.some(x=>x.id===id)){state.custom.push(p);write('shanghai-custom',state.custom);}if(!activePanel)lastFocused=document.activeElement;state.selected=id;$('#searchResults').hidden=true;if(isMobile()&&bottomSheet?.height>innerHeight*.65)bottomSheet.setSnap(1);renderSidebar();focusPlace(p);
 const saved=state.saved.has(id);$('#detailPanel').innerHTML=`<div class="panel-heading"><div class="eyebrow">${esc(p.area||'SHANGHAI')} / ${category(p).label}</div><button class="icon-btn close-panel" aria-label="닫기">×</button></div><div class="detail-illustration" data-cn="${esc(p.cn)}"><span>${bigIcons[p.category]||'📍'}</span></div><div class="detail-area"><span>${category(p).icon} ${p.recommended?'함께 가볼 만한 곳':'우리의 여행 장소'}</span><span>${Number(p.lat).toFixed(4)}° N</span></div><h2 style="margin:9px 0 0;font-size:24px;letter-spacing:-.8px">${esc(p.name)}</h2><p class="detail-cn">${esc(p.displayChinese||p.cn)}${p.displayTranslation?`<br>${esc(p.displayTranslation)}<br><small>한국어 참고 번역 · 장소명과 다를 수 있어요.</small>`:''}${p.nameTranslated?'<br><small>한국어 이름은 참고 표기예요. 중국어 원명도 함께 확인해주세요.</small>':''}</p>${p.approximate?'<div class="warning-note">≈ 대략 위치 · 지점 또는 입구 확인 필요<br>주소·지점과 실제 입구를 확인한 후 출발해주세요.</div>':''}<p class="detail-description">${esc(p.description)}</p>${p.tips?.length?`<div class="detail-tips">${p.tips.map(t=>`<p>↗ ${esc(t)}</p>`).join('')}</div>`:''}${p.id.startsWith('custom-')?`<label class="route-caveat">장소 이름<input class="custom-name" id="customName" value="${esc(p.name)}" maxlength="60"></label><button class="source-link" id="renamePlace">이름 저장</button>`:''}<div class="detail-actions"><button class="primary-btn" id="goToPlace">여기로 가기 <span>↗</span></button><button class="save-btn ${saved?'active':''}" id="savePlace" aria-label="${saved?'저장 취소':'장소 저장'}" aria-pressed="${saved}">${saved?'♥':'♡'}</button></div><div class="sub-actions"><button id="startHere">여기서 출발</button><a href="${esc(amapSearchUrl(p.searchQuery||p.cn||p.name))}" target="_blank" rel="noopener">고덕에서 확인 ↗</a><button id="copyName">원문 이름 복사</button></div>${p.source?`<a class="source-link" href="${esc(safeUrl(p.source))}" target="_blank" rel="noopener">장소 참고 자료 ↗</a>`:''}`;
 showPanel('#detailPanel');$('#goToPlace').onclick=()=>openRoute({destination:id});$('#startHere').onclick=()=>openRoute({origin:id});$('#savePlace').onclick=()=>{if(state.saved.has(id))state.saved.delete(id);else state.saved.add(id);write('shanghai-saved',[...state.saved]);showPlace(id);};$('#copyName').onclick=async()=>{try{await navigator.clipboard.writeText(p.searchQuery||p.cn||p.name);toast('원문 이름을 복사했어요.');}catch{toast(p.searchQuery||p.cn||p.name);}};if($('#renamePlace'))$('#renamePlace').onclick=()=>{p.name=$('#customName').value.trim()||p.name;write('shanghai-custom',state.custom);showPlace(id);toast('장소 이름을 저장했어요.');};
}
function routeOptions(selected,origin){const today=[...new Set(day().stops.map(s=>s.placeId))];return `${origin?'<option value="gps">◎ 내 현재 위치 · GPS</option>':''}<optgroup label="DAY ${state.day} 일정">${today.map(id=>{const p=placeById(id);return p?`<option value="${esc(id)}">${esc(p.name)}${p.approximate?' ≈':''}</option>`:'';}).join('')}</optgroup><optgroup label="모든 장소 · 직접 추가한 장소">${allPlaces().filter(p=>!today.includes(p.id)).map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${p.approximate?' ≈':''}</option>`).join('')}</optgroup>`;}
function openRoute({origin,destination}={}){const previousOrigin=$('#originSelect').value,previousDestination=$('#destinationSelect').value;$('#originSelect').innerHTML=routeOptions(origin,true);$('#destinationSelect').innerHTML=routeOptions(destination,false);$('#originSelect').value=origin||previousOrigin||places.find(p=>p.category==='hotel')?.id||dayPlaces()[0]?.id||'gps';$('#destinationSelect').value=destination||previousDestination||state.selected||dayPlaces()[1]?.id||dayPlaces()[0]?.id;clearRouteResult();showPanel('#routePanel');}
function clearRouteResult(){routeVersion++;routeAbort?.abort();$('#calculateRoute').disabled=false;$('#calculateRoute').innerHTML='경로 알아보기 <span>↗</span>';$('#routeResult').innerHTML='<p class="route-empty">현재 위치 또는 일정 속 장소를 출발지로 선택하세요.<br>GPS 출발 경로 조회 시 좌표가 경로 서비스로 전달돼요.</p>';if(state.mapReady)map.getSource('route-line').setData({type:'FeatureCollection',features:[]});}
function gps(){return new Promise((resolve,reject)=>{
 if(!isSecureContext){reject(Error('현재 위치는 HTTPS 연결이나 localhost에서 사용할 수 있어요.'));return;}
 if(!navigator.geolocation){reject(Error('이 브라우저는 GPS를 지원하지 않아요. 장소를 직접 선택해주세요.'));return;}
 navigator.geolocation.getCurrentPosition(pos=>{const p={id:'gps',name:'내 현재 위치',cn:'我的位置',lng:pos.coords.longitude,lat:pos.coords.latitude,accuracy:pos.coords.accuracy,timestamp:pos.timestamp};state.gps=p;resolve(p);},error=>reject(Error(error.code===1?'위치 권한이 꺼져 있어요. 아이폰 설정에서 Safari 위치 접근을 허용하거나 출발지를 직접 선택해주세요.':error.code===3?'위치를 찾는 데 시간이 걸려요. 다시 시도하거나 출발지를 직접 선택해주세요.':'현재 위치를 찾을 수 없어요. 출발지를 직접 선택해주세요.')),{enableHighAccuracy:true,timeout:15000,maximumAge:30000});
 });}
function showGPS(p){if(!state.mapReady)return;if(gpsMarker)gpsMarker.remove();const el=document.createElement('div');el.className='gps-marker';el.title=`내 위치 · 정확도 약 ${Math.round(p.accuracy)}m`;gpsMarker=new maplibregl.Marker({element:el}).setLngLat([p.lng,p.lat]).addTo(map);}
async function locate(){const button=$('#locateBtn');button.classList.add('loading');try{const p=await gps();showGPS(p);focusPlace(p,15);toast(`현재 위치를 표시했어요 · 정확도 약 ${Math.round(p.accuracy)}m${haversine(p,{lng:121.49,lat:31.23})>300?' · 상하이 밖에 있어요':''}`);}catch(e){toast(e.message);}finally{button.classList.remove('loading');}}
async function calculateRoute(){
 clearRouteResult();const version=routeVersion;const originId=$('#originSelect').value,destinationId=$('#destinationSelect').value,mode=state.mode;const btn=$('#calculateRoute');btn.disabled=true;btn.innerHTML='<span class="loading" style="font-size:12px">이동 방법을 확인하고 있어요…</span>';let origin=placeById(originId),destination=placeById(destinationId);
 try{
  if(originId==='gps'){origin=await gps();showGPS(origin);}if(version!==routeVersion)return;if(!origin||!destination)throw Error('출발지와 도착지를 선택해주세요.');
  if(origin.id===destination.id||haversine(origin,destination)<.015)throw Error('출발지와 다른 도착지를 선택해주세요.');
  routeAbort=new AbortController();const result=await getRoute(origin,destination,mode,{signal:routeAbort.signal});if(version!==routeVersion)return;
  const transit=result.transit,unsupported=mode==='transit'&&transit?.available===false;
  const time=unsupported?'지하철 연결을 찾지 못했어요':result.durationRangeMin?`${Math.round(result.durationRangeMin[0])}–${Math.round(result.durationRangeMin[1])}분`:`약 ${Math.max(1,Math.round(result.durationMin))}분`;
  const approx=origin.approximate||destination.approximate;
  const distance=Number.isFinite(result.distanceKm)?`<small>${result.distanceKm.toFixed(1)} km${result.distanceKind==='estimate'?' 추정':''}</small>`:'';
  const fare=result.fare?`<p>${mode==='taxi'?'🚕':'🚇'} 약 ¥${Math.round(result.fare.min)}–${Math.round(result.fare.max)} <span class="text-muted">/ ${mode==='taxi'?'차량 1대':'1인'} · 예상</span></p>`:transit?.available?'<p class="transit-fare">운임은 역 발권기에서 확인해주세요.</p>':'';
  const links=`<a class="external-route ${transit?.available?'secondary':''}" href="${esc(amapRouteUrl(origin,destination,mode))}" target="_blank" rel="noopener">${mode==='transit'?'고덕에서 전체 교통편·운행 확인':'고덕에서 실제 길안내 열기'} ↗</a><a class="external-route secondary" href="${esc(appleMapsUrl(origin,destination,mode))}" target="_blank" rel="noopener">Apple 지도에서 열기 ↗</a>`;
  $('#routeResult').innerHTML=`<div class="route-summary"><span class="route-badge">${esc(result.sourceLabel)}</span><h3${unsupported?' style="font-size:21px"':''}>${time}${unsupported?'':distance}</h3>${fare}</div>${transitJourneyHTML(transit)}${unsupported?`<div class="warning-note">${esc(transit.reason||transit.coverageNote||'이 구간은 현재 지하철 데이터로 연결할 수 없어요. 버스·도시 간 교통은 아래에서 확인해주세요.')}</div>`:''}${approx?'<p class="route-caveat">≈ 출발·도착지가 대략 위치예요. 실제 지점과 입구까지의 거리는 달라질 수 있어요.</p>':''}${unsupported?'':`<p class="route-caveat">${esc(result.note)}</p>`}${result.fareNote&&!result.note?.includes(result.fareNote)?`<p class="route-caveat">${esc(result.fareNote)}</p>`:''}${result.geometry&&state.mapReady?'<button class="route-map-link" id="viewRouteMap">지도에서 이동 경로 보기 ↗</button>':''}${!transit?.available&&result.steps?.length?`<ol class="route-steps">${result.steps.map(s=>`<li>${esc(s.instruction)}${s.distanceM?`<small>${s.distanceM>=1000?(s.distanceM/1000).toFixed(1)+' km':Math.round(s.distanceM)+' m'}</small>`:''}</li>`).join('')}</ol>`:''}${transit?.available?`<details class="route-external-options"><summary>다른 지도에서 운행 정보 확인</summary>${links}</details>`:links}${result.sourceUrl?`<a class="source-link" href="${esc(safeUrl(result.sourceUrl))}" target="_blank" rel="noopener">경로 데이터 안내 ↗</a>`:''}`;
  requestAnimationFrame(()=>{if(version===routeVersion&&activePanel?.id==='routePanel'&&isMobile())$('#routePanel').scrollTo({top:Math.max(0,$('#routeResult').offsetTop-80),behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth'});});
  if(state.mapReady){map.getSource('route-line').setData({type:'FeatureCollection',features:result.geometry?[{type:'Feature',properties:{},geometry:result.geometry}]:[]});if(result.geometry){const bounds=new maplibregl.LngLatBounds();result.geometry.coordinates.forEach(c=>bounds.extend(c));const fit=()=>fitBoundsInView(bounds,{maxZoom:16,duration:800});$('#viewRouteMap').onclick=()=>{closePanels();fit();$('#mapStatus').textContent=`${mode==='taxi'?'차량':mode==='transit'?'지하철':'도보'} 조회 경로 · ${time}`;};}}
 }catch(e){if(e.name!=='AbortError'&&version===routeVersion)$('#routeResult').innerHTML=`<div class="warning-note">${esc(e.message||'경로를 확인하지 못했어요. 다시 시도해주세요.')}</div>`;}
 finally{if(version===routeVersion){btn.disabled=false;btn.innerHTML='다시 조회하기 <span>↗</span>';}}
}

function searchMatches(q){return findLocalPlaces(q,[...places,...state.custom]);}
function resultHTML(ps){return ps.map(p=>{
 const title=p.koName||p.name,subtitle=p.cn&&p.cn!==title?p.cn:'';
 return `<button class="search-result" data-place="${esc(p.id)}"><span>${category(p).icon}</span><div><strong>${esc(title)}</strong>${subtitle?`<small>${esc(subtitle)}</small>`:''}${p.id.startsWith('search-')&&p.area?`<small>${esc(p.area)}</small>`:''}${p.displayTranslation?`<small class="search-reference-translation">${esc(p.displayTranslation)}</small><small class="translation-label">한국어 참고 번역 · 고유명사 확인 필요</small>`:''}${p.translationStatus==='pending'?'<small>한국어 명칭 확인 중…</small>':(p.translationStatus==='unavailable'||p.translationStatus==='failed')&&!p.displayTranslation?'<small>한국어 명칭 미등록 · 원문 표시</small>':p.nameSource==='wikidata'?'<small>다국어 장소명 · 자료의 대표 위치</small>':''}${p.approximate?'<small class="search-location-note">≈ 대략 위치 · 지점·입구 확인</small>':''}</div></button>`;
 }).join('');}

function searchLanguageHTML(plan){
 if(plan.needsTranslation)return `<div class="search-guide"><strong>한국어 장소명을 확인할게요</strong>찾기를 누르면 실제 지명과 위치가 연결된 장소를 찾아요.<small>같은 이름이 여러 곳이면 후보에서 선택해주세요.</small></div>`;
 return `<div class="search-guide"><strong>${plan.kind==='entity'?'실제 장소와 연결한 중국어 이름':plan.kind==='manual'?'직접 수정한 검색어':plan.changed?'한국어 이름을 중국어로 연결했어요':'지도에 전달할 검색어'}</strong><div class="search-query-edit"><input id="translatedQuery" aria-label="지도에 전달할 검색어 수정" maxlength="120" value="${esc(plan.query)}"><button type="button" data-search-edit>수정해서 검색</button></div><small>장소를 선택하기 전 지점과 주소를 확인해주세요.</small></div>`;
}
function searchExternalHTML(plan){
 if(plan.needsTranslation)return '<button class="result-external" type="button" data-search-submit>실제 장소 이름 찾기 ↗</button>';
 return `<a class="result-external" href="${esc(amapSearchUrl(plan.query))}" target="_blank" rel="noopener">고덕지도에서 “${esc(plan.query)}” 찾기 ↗</a>`;
}
function searchTopHTML(local,plan){return `${searchLanguageHTML(plan)}${searchExternalHTML(plan)}<div id="searchLocal"><div class="search-section">여행 장소 · ${local.length}개</div>${resultHTML(local)}</div>`;}
function showLocalResults(){
 const q=$('#searchInput').value.trim();searchAbort?.abort();searchAbort=null;
 if(!q){$('#searchResults').hidden=true;return;}
 const plan=resolveKnownQuery(q,allPlaces());const local=searchMatches(q);
 $('#searchResults').innerHTML=`${searchTopHTML(local,plan)}<div class="search-section">${local.length?'장소를 눌러 지도와 길찾기로 연결하세요.':'일정 밖 장소도 찾기로 검색할 수 있어요.'}</div>`;
 $('#searchResults').hidden=false;
}
async function localizeResults(ps,controller,current,onUpdate){
 const bilingual=p=>/[가-힣]/.test(p.koName||p.name)&&/[\u3400-\u9fff]/.test(p.cn);
 ps.filter(p=>bilingual(p)&&p.translationStatus==='pending').forEach(p=>p.translationStatus='ready');
 let next=0;const pending=ps.filter(p=>!bilingual(p)&&p.id.startsWith('search-'));
 pending.forEach(p=>p.translationStatus='pending');
 async function worker(){while(next<pending.length&&current()&&!controller.signal.aborted){const p=pending[next++];try{const names=await translatePlaceName(p,{signal:controller.signal});if(!current())return;Object.assign(p,names);}catch{if(!current())return;p.translationStatus='unavailable';}onUpdate();}}
 await Promise.all([worker(),worker()]);
 if(current())onUpdate();
 if(current()&&controller.signal.aborted){pending.filter(p=>p.translationStatus==='pending').forEach(p=>p.translationStatus='failed');onUpdate();}
 if(current()&&pending.some(p=>state.custom.includes(p)))write('shanghai-custom',state.custom);
}
async function runSearch(e,editedQuery){
 e?.preventDefault();if(searchComposing)return;
 const q=$('#searchInput').value.trim();if(!q)return;if(isMobile())bottomSheet?.setSnap(0);
 const edited=typeof editedQuery==='string'?editedQuery.trim():'';if(typeof editedQuery==='string'&&!edited){toast('검색할 장소 이름이나 주소를 입력해주세요.');return;}
 searchAbort?.abort();const controller=new AbortController();searchAbort=controller;
 let plan=resolveKnownQuery(edited||q,allPlaces());if(edited&&!plan.needsTranslation)plan={...plan,kind:'manual'};
 const local=searchMatches(edited||q),current=()=>controller===searchAbort;
 let entityError=false;
 const entitiesPromise=lookupPlaceEntities(edited||q,{signal:controller.signal}).catch(()=>{entityError=true;return [];});
 $('#searchResults').hidden=false;
 $('#searchResults').innerHTML=`${resultHTML(local)}<div class="search-section loading">${plan.needsTranslation?'한국어 이름과 실제 장소를 대조하는 중…':'상하이 주변에서 검색 중…'}</div>`;
 if(plan.needsTranslation){
  const candidates=await entitiesPromise;if(!current())return;
  if(candidates.length!==1||candidates[0]?.matchType!=='exact'){
   searchPlaces=candidates;
   $('#searchResults').innerHTML=`<div class="search-guide"><strong>${candidates.length?'이 이름으로 찾은 장소를 골라주세요':entityError?'장소명 확인 서비스에 연결하지 못했어요':'이 한국어 이름과 일치하는 장소를 확인하지 못했어요'}</strong>${candidates.length?'중국어 원명과 자료의 대표 위치를 찾았어요. 아래 장소를 누르면 지도와 길찾기로 연결돼요.':'이름을 줄이거나 중국어·영문 상호 또는 주소로 다시 검색해주세요. 확인되지 않은 이름은 임의로 번역하지 않아요.'}<div class="search-query-edit"><input id="translatedQuery" aria-label="지도에 전달할 검색어 수정" maxlength="120" placeholder="중국어·영문 이름 또는 주소"><button type="button" data-search-edit>수정해서 검색</button></div></div><div class="search-section">여행 장소 · ${local.length}개</div>${resultHTML(local)}<div class="search-section">장소 후보 · ${candidates.length}개</div>${resultHTML(candidates)}`;return;
  }
  plan={query:candidates[0].cn,changed:true,needsTranslation:false,kind:'entity'};
 }
 $('#searchResults').innerHTML=`${searchTopHTML(local,plan)}<div id="searchRemote"><div class="search-section loading">지도에서도 위치를 찾는 중…</div></div>`;
 localizeResults(local,controller,current,()=>{const el=$('#searchLocal');if(current()&&el)el.innerHTML=`<div class="search-section">여행 장소 · ${local.length}개</div>${resultHTML(local)}`;});
 const timer=setTimeout(()=>controller.abort(),18000);
 let found=[];
 const remote=$('#searchRemote');
 const renderRemote=(loading=false)=>{if(current()&&remote?.isConnected)remote.innerHTML=`<div class="search-section">지도 검색 · ${found.length}개 · 한국어 / 중국어${loading?' · 검색 중…':''}</div>${resultHTML(found)}${!found.length&&!loading?'<div class="search-section">이 지도에서 찾지 못했어요. 위의 중국어 원명으로 고덕지도에서 지점을 확인할 수 있어요.</div>':''}`;};
 try{
  const mapQuery=plan.query.replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g,'$1');
  const fetchPlaces=async query=>{const params=new URLSearchParams({q:query,limit:'7',lon:'121.48',lat:'31.23',bbox:'120.1,30.3,122.2,32.1'});const r=await fetch(`https://photon.komoot.io/api/?${params}`,{signal:controller.signal});if(!r.ok)throw Error();return r.json();};
  const entityTask=entitiesPromise.then(entities=>{if(!current())return;found=entities.filter(p=>!local.some(other=>other.id===p.id||(other.cn===p.cn&&haversine(other,p)<.15)));searchPlaces=found;renderRemote(true);});
  let photonFailed=false;
  const photonTask=(async()=>{try{let data=await fetchPlaces(mapQuery);if(!(data.features||[]).length&&mapQuery!==plan.query)data=await fetchPlaces(plan.query);return (data.features||[]).filter(f=>f.geometry?.type==='Point'&&f.properties?.name&&Number.isFinite(f.geometry.coordinates?.[0])&&Number.isFinite(f.geometry.coordinates?.[1])).map(f=>({id:`search-${f.properties.osm_type||''}-${f.properties.osm_id||f.geometry.coordinates.join('-')}`,name:f.properties['name:ko']||f.properties.name,koName:f.properties['name:ko']||'',cn:f.properties['name:zh']||f.properties.name,originalName:f.properties.name,translationStatus:'pending',category:({cafe:'cafe',restaurant:'food',fast_food:'food',bakery:'cafe',hotel:'hotel',supermarket:'shopping',mall:'shopping',bus_stop:'transport',station:'transport',stop:'transport',subway_entrance:'transport'}[f.properties.osm_value]||'landmark'),lng:f.geometry.coordinates[0],lat:f.geometry.coordinates[1],area:[f.properties.city||f.properties.district||f.properties.state,f.properties.street,f.properties.housenumber].filter(Boolean).join(' '),description:'지도 검색으로 찾은 장소예요. 같은 이름의 지점이 있을 수 있으니 주소를 확인해주세요.',tips:['검색 데이터는 OpenStreetMap 기반이며 실제 입구와 다를 수 있어요.'],recommended:false,approximate:true,source:'https://www.openstreetmap.org',searchQuery:f.properties['name:zh']||f.properties.name}));}catch{photonFailed=true;return [];}})();
  const [,photon]=await Promise.all([entityTask,photonTask]);
  if(!current())return;clearTimeout(timer);
  const entityPlaces=found;const mapped=photon.map(p=>{const named=entityPlaces.find(entity=>entity.cn===p.cn&&entity.koName&&haversine(entity,p)<=.8);return named&&!p.koName?{...p,name:named.koName,koName:named.koName,nameSource:'wikidata-name',translationStatus:'verified'}:p;});
  found=[...mapped,...entityPlaces.filter(entity=>!mapped.some(p=>p.cn===entity.cn&&haversine(entity,p)<=.8))].filter(p=>!local.some(other=>other.id===p.id||(other.cn===p.cn&&haversine(other,p)<.15))).filter((p,i,ps)=>ps.findIndex(other=>other.id===p.id||(other.cn===p.cn&&haversine(other,p)<.15))===i);
  searchPlaces=found;renderRemote();
  if(photonFailed&&!found.length&&remote?.isConnected)remote.innerHTML='<div class="search-section">지도 검색 연결이 지연되고 있어요. 여행 장소를 고르거나 위의 중국어 검색어로 고덕지도를 열어보세요.</div>';
  await localizeResults(found,controller,current,()=>renderRemote());
 }catch{if(current()&&remote?.isConnected)remote.innerHTML=`${resultHTML(found)}<div class="search-section">추가 위치 확인이 지연되고 있어요. 잠시 후 다시 검색해주세요.</div>`;}
 finally{clearTimeout(timer);}
}

let searchComposing=false;
$('#searchInput').addEventListener('focus',()=>{if(isMobile())bottomSheet?.setSnap(0);if($('#searchInput').value.trim())showLocalResults();});
document.addEventListener('input',e=>{if(e.target.id==='translatedQuery'){searchAbort?.abort();searchAbort=null;const remote=$('#searchRemote');if(remote)remote.innerHTML='<div class="search-section">수정해서 검색을 누르면 새 검색어로 찾아요.</div>';}});
function showChecklist(){
 $('#utilityPanel').innerHTML=`<div class="panel-heading"><div><div class="eyebrow">BEFORE WE GO</div><h2>가벼운 마음으로, 출발.</h2></div><button class="icon-btn close-panel" aria-label="닫기">×</button></div><p class="route-caveat">준비한 항목을 체크해요. 이 기기의 브라우저에 저장돼요.</p>${checklist.map(c=>`<label class="check-item ${state.checks.has(c.id)?'checked':''}"><input type="checkbox" data-check="${esc(c.id)}" ${state.checks.has(c.id)?'checked':''}><span><strong>${esc(c.label)}</strong><p>${esc(c.detail)}</p></span></label>`).join('')}<a class="external-route secondary" href="https://www.singlewindow.sh.cn/hj/" target="_blank" rel="noopener">입국신고 안내 사이트 열기 ↗</a><p class="route-caveat">입국신고 방법과 적용 대상은 출발 전 공식 안내에서 다시 확인해주세요.</p>`;showPanel('#utilityPanel');
}
function showInfo(){
 $('#utilityPanel').innerHTML=`<div class="panel-heading"><div><div class="eyebrow">YOUR LITTLE TRAVEL COMPANION</div><h2>상하이를 걷는 방법.</h2></div><button class="icon-btn close-panel" aria-label="닫기">×</button></div><button class="primary-btn" id="infoChecklist">출발 전 체크리스트 <span>↗</span></button><div class="info-section"><h3>아이폰 홈 화면에 두기</h3><p>Safari에서 이 페이지를 열고 공유 버튼 → ‘홈 화면에 추가’를 선택해요. 지도와 경로를 조회하려면 인터넷 연결이 필요해요.</p><h3>일정 창 높이 조절</h3><p>모바일에서는 창 위쪽 손잡이를 위로 끌면 넓게, 아래로 끌면 작게 볼 수 있어요. 아래 끝까지 내리면 숨겨지고 ‘일정 펼치기’로 다시 열어요. 손잡이를 눌러도 절반 보기와 넓게 보기를 바꿀 수 있어요. 목록 안에서는 일정만 스크롤돼요.</p><h3>지도와 장소</h3><p>DAY 1–4로 일정을 바꾸고 필터로 명소·맛집·카페를 골라보세요. 3D를 누르면 확대된 지도에 건물이 나타나요. 높이는 지도에 등록된 데이터 기준이며 모든 건물을 재현하지는 않아요. 점선은 방문 순서, 주황색 실선은 조회한 이동 경로예요.</p><h3>주변 가게와 건물 이름</h3><p>지도 위 주변 이름을 켜면 유명 건물과 프랜차이즈가 보이고, 확대할수록 카페·식당·상점 이름이 나타나요. 이름을 누르면 장소 정보와 길찾기를 열 수 있어요. 지도에 등록된 곳만 표시되며 실제 입구·영업 여부는 현장에서 확인해주세요. 한국어와 중국어 이름을 두 줄로 함께 표시해요. 통용 한국어 이름이 없는 한자 상호는 중국어 발음을 자동으로 한글 표기하고 독음이라고 표시해요. 독음은 공식 명칭이 아니며 중국어 원명과 좌표는 그대로 유지돼요. 중국어 이름이 등록되지 않은 장소는 원문을 함께 보여줘요.</p><h3>어디에서든 출발</h3><p>◎ 버튼으로 현재 위치를 한 번 확인해요. 길찾기에서 ‘내 현재 위치’를 선택하면 GPS를 다시 확인하고 목적지까지 경로를 조회해요. 앱이 계속 위치를 추적하지 않으며 GPS 좌표를 이 기기에 저장하지 않아요. 경로 조회·외부 지도 열기를 선택하면 해당 서비스로 좌표가 전달돼요.</p><h3>한국어로 장소 찾기</h3><p>한국어 별칭을 중국어 원명으로 연결하고, 일정 밖의 이름은 Wikidata·Wikipedia의 다국어 장소명과 좌표를 확인해 찾아요. 주가각·디즈니랜드·스타벅스처럼 한국어로 입력할 수 있어요. 이름이 여러 장소에 해당하면 후보를 골라주세요. 확인된 한국어 이름과 중국어 원명을 함께 표시하며, 한국어 명칭이 없는 지점은 중국어 원명을 유지하고 참고 번역을 별도로 표시해요. 이 참고 번역은 장소의 통용 이름과 다를 수 있으며 검색어로 사용하지 않아요. 확인되지 않은 고유명사는 일반 문장처럼 자동 번역하지 않아요. 이름 확인을 위해 입력한 검색어가 Wikimedia에, 위치 검색어가 Photon에 전달돼요. 한국어 참고 번역에는 중국어 원명이 MyMemory에 전달돼요. 중국어·영문 이름과 주소를 직접 입력할 수도 있어요.</p><h3>원하는 장소 직접 추가</h3><p>장소 이름·주소를 검색하거나 ⚑ 버튼을 누른 뒤 지도를 터치해요. 장소 정보의 ‘여기서 출발’, ‘여기로 가기’로 자유롭게 연결할 수 있어요. 검색 장소와 저장 목록, 체크리스트는 현재 브라우저에 보관돼요.</p><h3>길찾기 정보의 범위</h3><p>차량·도보는 OpenStreetMap 기반 경로를 조회해요. 시간에 실시간 교통이 반영되지 않으며 택시요금은 추정이에요. 대중교통은 공개 지하철 노선도에서 승차·환승·하차역을 계산해 이 화면에 보여줘요. 도보·승차·환승·대기는 예상 시간이며 운행 여부·막차·출입구·버스·실시간 배차는 반영하지 않아요. 운임은 현장에서 확인해주세요. 지하철로 연결되지 않는 구간은 외부 지도에서 다른 교통편을 확인할 수 있어요.</p><h3>중국에서 사용할 때</h3><p>중국 현지 네트워크에서는 해외 지도·검색 서비스가 느리거나 연결되지 않을 수 있어요. 고덕지도 앱을 미리 설치해두세요. ≈ 표시는 지점이나 정확한 위치를 확인해야 하는 장소예요. 숙소는 제공된 주소를 기준으로 기록했어요.</p><h3>일정 메모</h3><p>여행 날짜가 정해지지 않아 DAY 기준으로 담았어요. 항공편은 각 공항 현지시간, 나머지 일정은 중국 현지시간(한국보다 1시간 느림)이에요. 와이탄 점등·입장·식당 영업시간은 현장에서 달라질 수 있어요.</p><h3>지도와 데이터 출처</h3><p><a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · <a href="https://maplibre.org" target="_blank" rel="noopener">MapLibre</a> · <a href="https://github.com/komoot/photon" target="_blank" rel="noopener">Photon 검색</a> · <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata 장소명</a> · <a href="https://mymemory.translated.net/doc/spec.php" target="_blank" rel="noopener">MyMemory 참고 번역</a> · <a href="https://routing.openstreetmap.de/about.html" target="_blank" rel="noopener">FOSSGIS 경로</a>. 장소별 참고 링크는 각 카드에 있어요.</p></div>`;showPanel('#utilityPanel');$('#infoChecklist').onclick=showChecklist;
}

document.addEventListener('click',e=>{
 const cafe=e.target.closest('[data-cafe-brand]');if(cafe){state.cafeBrand=cafe.dataset.cafeBrand;state.category='cafe';state.selected=null;renderSidebar();if(allPlaces().some(matchesCafeBrand))fitPlaces();return;}
 if(e.target.closest('[data-cafe-all]')){state.cafeBrand=null;state.category='cafe';state.selected=null;renderSidebar();fitPlaces();return;}
 const cafeSearch=e.target.closest('[data-cafe-search]');if(cafeSearch){const brand=CAFE_BRANDS.find(b=>b.id===cafeSearch.dataset.cafeSearch);if(brand){$('#searchInput').value=brand.cn;runSearch(e);}return;}
 if(e.target.closest('[data-search-submit]')){runSearch(e);return;}
 if(e.target.closest('[data-search-edit]')){runSearch(e,$('#translatedQuery')?.value);return;}
 const p=e.target.closest('[data-place]');if(p){showPlace(p.dataset.place);return;}
 if(e.target.closest('.close-panel')){closePanels();return;}
 const d=e.target.closest('[data-day]');if(d){state.day=Number(d.dataset.day);state.selected=null;clearRouteResult();renderSidebar();$('#sidebarContent').scrollTop=0;fitPlaces(state.day===3);return;}
 const v=e.target.closest('[data-view]');if(v){state.view=v.dataset.view;state.selected=null;if(state.view==='itinerary'&&state.category==='cafe'){state.category='all';state.cafeBrand=null;}renderSidebar();$('#sidebarContent').scrollTop=0;return;}
 const c=e.target.closest('[data-category]');if(c){state.category=c.dataset.category;state.cafeBrand=null;if(state.category==='cafe'&&state.view==='itinerary')state.view='discover';renderSidebar();return;}
 const mode=e.target.closest('[data-mode]');if(mode){state.mode=mode.dataset.mode;$('#routeModeNote').hidden=state.mode!=='transit';$$('[data-mode]').forEach(b=>{b.classList.toggle('active',b===mode);b.setAttribute('aria-pressed',String(b===mode));});clearRouteResult();return;}
 if(!e.target.closest('.search-results,.search-box'))$('#searchResults').hidden=true;
});
document.addEventListener('change',e=>{if(e.target.matches('[data-check]')){const id=e.target.dataset.check;if(e.target.checked)state.checks.add(id);else state.checks.delete(id);write('shanghai-checks',[...state.checks]);e.target.closest('.check-item').classList.toggle('checked',e.target.checked);counts();}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePanels();setPinning(false);$('#searchResults').hidden=true;}if(e.key==='Tab'&&activePanel){const f=[...activePanel.querySelectorAll('button:not(:disabled),input,select,a[href]')].filter(el=>!el.hidden);if(!f.length)return;if(e.shiftKey&&document.activeElement===f[0]){e.preventDefault();f.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===f.at(-1)){e.preventDefault();f[0].focus();}}});
$('#backdrop').onclick=()=>closePanels();$('#routeBtn').onclick=()=>openRoute();$('#infoBtn').onclick=showInfo;$('#checklistBtn').onclick=showChecklist;$('#locateBtn').onclick=locate;$('#pinBtn').onclick=()=>setPinning(!state.pinning);$('#twoD').onclick=()=>set3D(false);$('#threeD').onclick=()=>set3D(true);$('#zoomIn').onclick=()=>map?.zoomIn();$('#zoomOut').onclick=()=>map?.zoomOut();$('#fitMap').onclick=()=>fitPlaces();$('#searchInput').oninput=showLocalResults;$('#searchForm').onsubmit=runSearch;$('#searchInput').addEventListener('compositionstart',()=>{searchComposing=true;});$('#searchInput').addEventListener('compositionend',()=>{searchComposing=false;showLocalResults();});document.addEventListener('keydown',e=>{if(e.target.id==='translatedQuery'&&e.key==='Enter'&&!e.isComposing)runSearch(e,e.target.value);});$('#calculateRoute').onclick=calculateRoute;$('#originSelect').onchange=clearRouteResult;$('#destinationSelect').onchange=clearRouteResult;
$('#swapRoute').onclick=()=>{const a=$('#originSelect').value,b=$('#destinationSelect').value;if(a==='gps'){toast('GPS 위치는 출발지로 사용할 수 있어요. 출발 장소를 먼저 선택해주세요.');return;}$('#originSelect').value=b;$('#destinationSelect').value=a;clearRouteResult();};
$('#routeSearchBtn').onclick=()=>{closePanels();$('#searchInput').focus();toast('검색한 장소 카드에서 출발 또는 도착으로 지정하세요.');};$('#routePinBtn').onclick=()=>setPinning(true);
$('#contextToggle').onclick=()=>{contextVisible=!contextVisible;write('shanghai-context-labels',contextVisible);contextPlaces?.setVisible(contextVisible);updateMapDetail();};
bottomSheet=createBottomSheet({app:$('.app'),sheet:$('#sidebar'),handle:$('#sheetGrab'),toggle:$('#mobileToggle'),stage:$('#mapStage'),content:$('#sidebarContent'),onSnap:({height,hidden,duration})=>{state.collapsed=hidden;if(state.mapReady){const padding=mapPadding();if(isMobile())padding.bottom=Math.min(height+25,Math.max(0,innerHeight-235));map.resize();map.easeTo({padding,duration});}}});
renderSidebar();updateMapDetail();initMap();
