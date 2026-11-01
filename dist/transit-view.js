const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const station = value => typeof value === 'string' ? esc(value) : value ? `${esc(value.ko || value.name || value.cn)}${value.ko && value.cn ? `<small>${esc(value.cn)}</small>` : ''}` : '';
const color = value => /^#[\da-f]{3,8}$/i.test(value || '') ? value : '#396c59';
const ink = value => {let hex=color(value).slice(1);if(hex.length===3)hex=[...hex].map(c=>c+c).join('');const [r,g,b]=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));return r*.299+g*.587+b*.114>155?'#193d29':'#ffffff';};
const inlineStation = value => typeof value === 'string' ? value : value ? `${value.ko || value.cn}${value.ko && value.cn ? `(${value.cn})` : ''}` : '';

export function transitJourneyHTML(transit) {
  if (!transit?.available) return '';
  const lines = (transit.lines || []).map(line => `<span class="metro-chip" style="--metro-color:${color(line.color)};--metro-ink:${ink(line.color)}">${esc(line.name || `${line.id}호선`)}</span>`).join('<span class="metro-arrow" aria-hidden="true">→</span>');
  return `<section class="transit-journey" aria-label="지하철 이용 순서">
    <div class="transit-heading"><h3>이렇게 이동하세요</h3><span>${transit.transferCount ? `환승 ${Number(transit.transferCount)}회` : '환승 없이'}</span></div>
    <div class="metro-line-list">${lines}</div>
    <p class="transit-timing">${Number(transit.stationCount) || 0}개 역 구간 · 도보·역 진출입 약 ${Math.ceil(transit.walkDurationMin || 0)}분<br>열차 대기 약 ${Math.ceil(transit.waitDurationMin || 0)}분 가정 · 실제 배차 아님</p>
    ${transit.shortWalkRecommendation ? `<p class="route-caveat">${esc(transit.shortWalkRecommendation)}</p>` : ''}
    <ol class="transit-segments">${(transit.segments || []).map(segment => {
      const ride = segment.type === 'ride', transfer = segment.type === 'transfer';
      return `<li class="transit-segment ${ride ? 'is-ride' : transfer ? 'is-transfer' : 'is-walk'}" style="--metro-color:${color(segment.line?.color)};--metro-ink:${ink(segment.line?.color)}">
        <span class="transit-node" aria-hidden="true">${ride ? 'M' : transfer ? '⇄' : '↗'}</span>
        <div class="transit-segment-body"><div class="transit-segment-top"><strong>${ride ? esc(segment.line?.name || '지하철') : transfer ? '환승' : '도보 연결'}</strong><span>약 ${Math.max(1, Math.ceil(segment.durationMin || 0))}분</span></div>
        ${ride && segment.fromStation && segment.toStation ? `<div class="transit-stations"><div>${station(segment.fromStation)}</div><span aria-hidden="true">↓</span><div>${station(segment.toStation)}</div></div>` : ''}
        <p>${esc(ride && segment.direction ? `${inlineStation(segment.direction)} 방면 · ${segment.stationCount ?? Math.max(0,(segment.stationNames?.length || 1)-1)}개 역 이동 후 하차` : segment.instruction)}</p>
        ${segment.note ? `<p class="transit-segment-note">${esc(segment.note)}</p>` : ''}
        ${!ride && segment.distanceM ? `<small class="transit-walk-distance">도보 약 ${segment.distanceM>=1000?(segment.distanceM/1000).toFixed(1)+' km':Math.round(segment.distanceM)+' m'}</small>` : ''}
        ${ride && segment.stationNames?.length ? `<details class="transit-stops"><summary>승차역부터 하차역까지 보기</summary><ol>${segment.stationNames.map(name => `<li>${station(name)}</li>`).join('')}</ol></details>` : ''}
        </div></li>`;
    }).join('')}</ol>
    <div class="transit-data-note"><strong>노선도 기반 계산 · 실시간 아님</strong><p>도보·승차·대기·환승 시간은 예상값이에요. 배차, 운행 중단, 막차와 역 출입구는 반영하지 않아요.</p>${transit.coverageNote ? `<p>${esc(transit.coverageNote)}</p>` : ''}${transit.dataDate ? `<p>노선 자료 확인일 ${esc(transit.dataDate)}</p>` : ''}<p><a href="./metro-data.json" target="_blank" rel="noopener">노선 데이터</a> · <a href="./metro-data-license.txt" target="_blank" rel="noopener">출처·이용 조건</a></p></div>
  </section>`;
}
