import metroData from './metro-data.js';

export const METRO_DATA_META = metroData.meta;
export const metroStations = metroData.stations;
const stations = new Map(metroData.stations.map(s => [s.id, s]));
const lines = new Map(metroData.lines.map(l => [l.id, l]));
const patterns = new Map(metroData.patterns.map(p => [p.id, p]));
const byStation = new Map();
const nodes = new Map();
const externalTransfers = new Set(['上海火车站', '南京西路', '长清路']);
const WALK_KMH = 4.5;
const MAX_STATION_KM = 3;
const MAX_WALK_M = 4200;

function km(a,b) {
  const r=Math.PI/180;
  const h=Math.sin((a.lat-b.lat)*r/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin((a.lng-b.lng)*r/2)**2;
  return 6371.0088*2*Math.asin(Math.min(1,Math.sqrt(h)));
}
function label(s) { return s.ko ? `${s.ko}(${s.cn})` : s.cn; }
function pub(s) { return { id:s.id, cn:s.cn, ko:s.ko, lng:s.lng, lat:s.lat }; }
function check(signal) { if(signal?.aborted) throw signal.reason || new DOMException('Aborted','AbortError'); }
function waitFor(lineId) { return lineId==='maglev'?10:lineId==='16'||lineId==='17'?5:3; }
function travel(a,b,lineId) {
  const distanceM=km(a,b)*1.1*1000;
  // This is a transparent travel-time model, not an operator timetable.
  const speed=lineId==='16'?60:lineId==='17'?50:lineId==='2'?45:40;
  const durationMin=lineId==='maglev'?9:Math.max(1.2,distanceM/1000/speed*60+.45);
  return { distanceM, durationMin };
}

for(const p of metroData.patterns) {
  p.stations.forEach((stationId,index)=>{
    const id=`${p.id}:${index}`;
    nodes.set(id,{id,stationId,patternId:p.id,index,edges:[]});
    if(!byStation.has(stationId))byStation.set(stationId,[]);
    byStation.get(stationId).push(id);
  });
  for(let i=0;i<p.stations.length-1;i++) {
    const costs=travel(stations.get(p.stations[i]),stations.get(p.stations[i+1]),p.lineId);
    nodes.get(`${p.id}:${i}`).edges.push({to:`${p.id}:${i+1}`,type:'ride',...costs});
  }
  if(p.circular)nodes.get(`${p.id}:${p.stations.length-1}`).edges.push({to:`${p.id}:0`,type:'continuation',durationMin:0,distanceM:0});
}
for(const [stationId,ids] of byStation) {
  for(const fromId of ids)for(const toId of ids) {
    const from=nodes.get(fromId),to=nodes.get(toId);
    if(from.patternId===to.patternId)continue;
    const fromLine=patterns.get(from.patternId).lineId,toLine=patterns.get(to.patternId).lineId;
    const isExternal=externalTransfers.has(stations.get(stationId).cn);
    const transferMin=isExternal?10:fromLine===toLine?4:6;
    nodes.get(fromId).edges.push({to:toId,type:'transfer',durationMin:transferMin+waitFor(toLine),transferMin,waitMin:waitFor(toLine),distanceM:0,external:isExternal});
  }
}

// Binary min-heap keeps multi-source Dijkstra responsive on mobile Safari.
class Heap {
  list=[];
  push(item){let i=this.list.length;this.list.push(item);while(i){const p=(i-1)>>1;if(this.list[p].cost<=item.cost)break;this.list[i]=this.list[p];i=p;}this.list[i]=item;}
  pop(){const top=this.list[0],last=this.list.pop();if(this.list.length){let i=0;while(i*2+1<this.list.length){let child=i*2+1;if(child+1<this.list.length&&this.list[child+1].cost<this.list[child].cost)child++;if(this.list[child].cost>=last.cost)break;this.list[i]=this.list[child];i=child;}this.list[i]=last;}return top;}
  get length(){return this.list.length;}
}

function nearest(value) {
  return metroData.stations.map(s=>({station:s,directKm:km(value,s)})).filter(x=>x.directKm<=MAX_STATION_KM&&!crossesRiver(value,x.station)).sort((a,b)=>a.directKm-b.directKm).slice(0,6);
}

function segmentsIntersect(a,b,c,d) {
  const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
  const x1=cross(a,b,c),x2=cross(a,b,d),x3=cross(c,d,a),x4=cross(c,d,b);
  return x1*x2<0&&x3*x4<0;
}
export function crossesRiver(a,b) {
  return (metroData.barriers||[]).some(barrier=>barrier.coordinates.slice(1).some((point,i)=>segmentsIntersect([a.lng,a.lat],[b.lng,b.lat],barrier.coordinates[i],point)));
}

function unavailable(reason, extra={}) {
  return {
    distanceKm:null,durationMin:null,durationRangeMin:null,geometry:null,steps:[],fare:null,
    sourceLabel:'연결 가능한 지하철 경로가 없어요',estimated:true,distanceKind:'unavailable',
    sourceUrl:metroData.meta.sourceUrl,
    note:reason,
    transit:{available:false,offline:true,routeKind:'metro',reason,coverageNote:metroData.meta.coverage,dataDate:metroData.meta.dataDate,...extra},
  };
}

async function accessCandidates(value, candidates, reverse, accessRouter, signal) {
  let verified=null;
  if(accessRouter) {
    try { verified=await accessRouter(value,candidates.map(x=>x.station),{reverse,signal}); }
    catch(e){check(signal);}
  }
  return candidates.map((candidate,i)=>{
    const actual=verified?.[i];
    if(actual&&actual.valid===false)return null;
    // Conservatively disallow cross-river station access even for matrices:
    // OSRM tables do not disclose ferry steps. Metro rides cross the river.
    if(crossesRiver(value,candidate.station))return null;
    const distanceM=actual?.verified?actual.distanceM:Math.max(50,candidate.directKm*1350);
    const durationMin=actual?.verified?actual.durationMin:distanceM/1000/WALK_KMH*60;
    if(!Number.isFinite(distanceM)||!Number.isFinite(durationMin)||distanceM>MAX_WALK_M)return null;
    return {...candidate,distanceM,durationMin,verified:!!actual?.verified};
  }).filter(Boolean);
}

function shortest(origins,destinations) {
  const heap=new Heap(),dist=new Map(),prev=new Map(),initial=new Map();
  const dests=new Map(destinations.map(x=>[x.station.id,x]));
  for(const access of origins)for(const id of byStation.get(access.station.id)||[]) {
    const lineId=patterns.get(nodes.get(id).patternId).lineId;
    const cost=access.durationMin+4+waitFor(lineId);
    if(cost<(dist.get(id)??Infinity)){dist.set(id,cost);initial.set(id,access);heap.push({id,cost});}
  }
  let best=null;
  while(heap.length) {
    const current=heap.pop();
    if(current.cost!==dist.get(current.id))continue;
    if(best&&current.cost>best.cost)break;
    const node=nodes.get(current.id),exit=dests.get(node.stationId);
    if(exit) {
      const cost=current.cost+exit.durationMin+3;
      if(!best||cost<best.cost)best={id:current.id,cost,exit};
    }
    for(const edge of node.edges){
      // Prefer avoiding an extra train change when the time difference is small.
      // This is only a ranking penalty; it is NOT added to the displayed ETA.
      const cost=current.cost+edge.durationMin+(edge.type==='transfer'?4:0);
      if(cost<(dist.get(edge.to)??Infinity)){dist.set(edge.to,cost);prev.set(edge.to,{from:current.id,edge});heap.push({id:edge.to,cost});}
    }
  }
  if(!best)return null;
  const path=[];let at=best.id;
  while(prev.has(at)){const p=prev.get(at);path.unshift({from:p.from,to:at,...p.edge});at=p.from;}
  return {...best,path,start:at,origin:initial.get(at)};
}

function buildSegments(result,origin,destination) {
  const first=nodes.get(result.start),firstPattern=patterns.get(first.patternId);
  const startStation=stations.get(first.stationId),lastStation=result.exit.station;
  const entryWalk=result.origin;
  const segments=[{
    type:'walk',instruction:`${label(startStation)}역으로 이동 · 역 진입·보안검색 약 4분 포함`,durationMin:entryWalk.durationMin+4,distanceM:Math.round(entryWalk.distanceM),fromStation:null,toStation:pub(startStation),estimated:true,verifiedWalking:entryWalk.verified,
    note:entryWalk.verified?'OSM 보행 경로망으로 계산한 역 중심 부근까지의 예상 이동이에요. 실제 출입구·계단·최종 구간은 확인하세요.':'역 중심까지 직선거리×1.35로 산정한 도보 추정이에요. 실제 보행 경로·출입구 안내가 아니에요.',
  }];
  let active=null;
  function finishRide(){
    if(!active)return;
    active.stationCount=active.stationNames.length-1;
    active.instruction=`${label(active.fromStation)}에서 ${active.line.name} ${label(active.direction)} 방면 승차 → ${active.stationCount}개 역 이동 → ${label(active.toStation)} 하차`;
    segments.push(active);active=null;
  }
  for(const edge of result.path) {
    const from=nodes.get(edge.from),to=nodes.get(edge.to);
    const p=patterns.get(from.patternId);
    if(edge.type==='continuation')continue;
    if(edge.type==='ride') {
      if(active&&active.patternId!==p.id)finishRide();
      if(!active)active={type:'ride',patternId:p.id,line:lines.get(p.lineId),fromStation:pub(stations.get(from.stationId)),toStation:pub(stations.get(to.stationId)),direction:{...p.direction},stationNames:[pub(stations.get(from.stationId))],durationMin:0,distanceM:0,estimated:true,note:'실제 역 정차 순서에 기반한 노선이에요. 승차시간은 거리·평균속도 모델 추정이며 열차 행선지를 확인하세요.'};
      active.toStation=pub(stations.get(to.stationId));
      active.stationNames.push(active.toStation);active.durationMin+=edge.durationMin;active.distanceM+=edge.distanceM;
    } else if(edge.type==='transfer') {
      finishRide();
      const st=stations.get(from.stationId),targetLine=lines.get(patterns.get(to.patternId).lineId);
      const sameLine=patterns.get(from.patternId).lineId===targetLine.id;
      segments.push({type:'transfer',instruction:`${label(st)}역에서 ${targetLine.name}${sameLine?' 열차 변경':'으로 환승'} · 이동·대기 예상`,durationMin:edge.durationMin,distanceM:0,fromStation:pub(st),toStation:pub(st),line:targetLine,transferDurationMin:edge.transferMin,waitDurationMin:edge.waitMin,estimated:true,note:edge.external?'개찰구 밖 이동이 필요할 수 있어요. 연결 통로와 승차권·환승요금 조건을 현장에서 확인하세요.':'환승 통로·계단·개찰구와 열차 행선지는 현장에서 확인하세요. 배차 대기는 가정값이에요.'});
    }
  }
  finishRide();
  segments.push({type:'walk',instruction:`${label(lastStation)}역에서 목적지로 이동 · 출구 이동 약 3분 포함`,durationMin:result.exit.durationMin+3,distanceM:Math.round(result.exit.distanceM),fromStation:pub(lastStation),toStation:null,estimated:true,verifiedWalking:result.exit.verified,note:result.exit.verified?'OSM 보행 경로망 기준 예상이에요. 실제 출입구와 목적지 입구는 확인하세요.':'역 중심부터 직선거리×1.35로 산정한 도보 추정이에요. 실제 보행 경로·출입구 안내가 아니에요.'});
  return {segments,initialWait:waitFor(firstPattern.lineId)};
}

/** Route on actual, directed station topology. No fabricated railway geometry. */
export async function getMetroRoute(origin,destination,{signal,accessRouter}={}) {
  check(signal);
  if(km(origin,destination)>300)return unavailable('상하이에서 너무 멀리 떨어져 있어요. 상하이 일정 속 장소를 출발지로 선택하세요.');
  const nearbyOrigin=nearest(origin),nearbyDestination=nearest(destination);
  if(!nearbyOrigin.length||!nearbyDestination.length)return unavailable('출발지 또는 도착지에서 3km 이내에 이 앱이 지원하는 지하철역이 없어요. 우전 등 시외 지역은 버스·철도·투어 이동을 별도로 확인하세요.');
  const [access,egress]=await Promise.all([
    accessCandidates(origin,nearbyOrigin,false,accessRouter,signal),
    accessCandidates(destination,nearbyDestination,true,accessRouter,signal),
  ]);
  check(signal);
  if(!access.length||!egress.length)return unavailable('역까지 연결할 수 있는 짧은 보행 경로를 확인하지 못했어요. 다른 출발지·도착지를 선택하거나 전체 대중교통을 확인하세요.');
  const result=shortest(access,egress);
  if(!result)return unavailable('지원 노선 안에서 두 지점을 연결하는 지하철 경로를 찾지 못했어요.');
  const {segments,initialWait}=buildSegments(result,origin,destination);
  const rides=segments.filter(s=>s.type==='ride');
  if(!rides.length)return unavailable('두 지점은 같은 역 주변의 도보권이에요. 도보 모드에서 실제 길을 확인하는 편이 좋아요.',{shortWalkRecommendation:'가까운 구간이에요. 도보 경로와 비교해 보세요.'});
  const transfers=segments.filter(s=>s.type==='transfer');
  const walkDurationMin=segments.filter(s=>s.type==='walk').reduce((sum,s)=>sum+s.durationMin,0);
  const rideDurationMin=rides.reduce((sum,s)=>sum+s.durationMin,0);
  const waitDurationMin=initialWait+transfers.reduce((sum,s)=>sum+s.waitDurationMin,0);
  const transferDurationMin=transfers.reduce((sum,s)=>sum+s.transferDurationMin,0);
  const durationMin=Math.round(walkDurationMin+rideDurationMin+waitDurationMin+transferDurationMin);
  const distanceKm=segments.reduce((sum,s)=>sum+s.distanceM,0)/1000;
  const hasMaglev=rides.some(s=>s.line.id==='maglev');
  const accessVerified=segments.filter(s=>s.type==='walk').every(s=>s.verifiedWalking);
  const note=`역·노선 연결은 공개된 실제 정차 순서로 계산했어요. 승차·환승·대기 시간과 역 사이 거리는 모델 추정이며 실시간 운행·첫차·막차·배차·출입구·혼잡은 반영하지 않아요.${hasMaglev?' 마그레브는 별도 승차권·운임이며 운행시간을 확인해야 해요.':''}${!accessVerified?' 역 접근 도보 중 일부는 직선거리 기반 추정이에요.':''}`;
  return {
    distanceKm,durationMin,durationRangeMin:[Math.max(1,Math.floor(rideDurationMin*.85+walkDurationMin*.85+transferDurationMin*.8)),Math.ceil(rideDurationMin*1.2+walkDurationMin*1.3+transferDurationMin*1.4+waitDurationMin*2)],geometry:null,
    steps:segments.map(s=>({instruction:s.instruction,distanceM:Math.round(s.distanceM),durationMin:Math.round(s.durationMin),type:s.type})),
    sourceLabel:'실제 지하철 노선 연결 · 시간은 추정',sourceUrl:metroData.meta.sourceUrl,estimated:true,distanceKind:'estimate',note,fare:null,fareNote:'지하철·마그레브 요금은 승차권 구매 시 확인하세요.',
    transit:{available:true,offline:true,routeKind:'metro',transferCount:transfers.length,stationCount:rides.reduce((sum,s)=>sum+s.stationCount,0),walkDurationMin:Math.round(walkDurationMin),rideDurationMin:Math.round(rideDurationMin),waitDurationMin:Math.round(waitDurationMin),transferDurationMin:Math.round(transferDurationMin),initialWaitDurationMin:initialWait,lines:[...new Map(rides.map(s=>[s.line.id,s.line])).values()],segments,coverageNote:metroData.meta.coverage,dataDate:metroData.meta.dataDate,accessVerified,licenseUrl:metroData.meta.licenseUrl,databaseUrl:'./metro-data.json',shortWalkRecommendation:km(origin,destination)<1.5&&!crossesRiver(origin,destination)?'가까운 구간이에요. 도보 모드의 실제 경로·시간과 비교해 보세요.':''},
  };
}
