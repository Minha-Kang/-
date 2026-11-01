// A small, inspectable Korean search dictionary. It does not invent translations
// or claim that a category word identifies a particular restaurant or branch.
import {CAFE_BRANDS,findCafeBrand} from './cafe-brands.js';
export function normalizeSearch(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

const hangul = /[가-힣ㄱ-ㅎㅏ-ㅣ\u1100-\u11ff\ua960-\ua97f\ud7b0-\ud7ff]/u;
const tourismSource = 'https://korean.shanghai.gov.cn/ko-CityWalk/20260602/97fa64e5ddb54d5fa22e8268d3a097cc.html';
const museumSource = 'https://korean.shanghai.gov.cn/ko-EditorsPick-travelinshanghai/20260709/c2478cac5fd24888af830202a0bb7e8b.html';
const nightMuseumSource = 'https://korean.shanghai.gov.cn/ko-Nightlife/20241204/7ec83a15292e4ad1b9adfbc6acf3f9b4.html';
const nameRecord = (ko, cn, variants, source = tourismSource, type = 'place') => ({ko, cn, aliases:[ko,...variants],source,type});

// Verified search names, not additional map pins or invented branch locations.
// Korean/Chinese names were checked against the linked city/venue sources.
export const SEARCH_NAME_CATALOG = [
  nameRecord('주가각', '朱家角古镇', ['주자자오','주자각','주가각수향마을','주가각고진','주자자오고진','주자자오수향마을','朱家角','朱家角古镇','朱家角古鎮','朱家角古镇旅游区','Zhujiajiao'], 'https://korean.shanghai.gov.cn/ko-NewsAndHighlights-2026ShanghaiSummer/20260910/821523afc0ef4777b434e6de7db4ecfa.html'),
  nameRecord('상하이 디즈니랜드', '上海迪士尼乐园', ['디즈니랜드','상하이디즈니랜드','상해디즈니랜드','Shanghai Disneyland','上海迪士尼樂園'], 'https://www.shanghaidisneyresort.com/zh-cn/?located=true'),
  nameRecord('훙차오 국제공항', '上海虹桥国际机场', ['홍차오공항','훙차오공항','홍교공항','훙차오국제공항','홍차오국제공항','Hongqiao Airport','虹桥机场','上海虹橋國際機場'], 'https://korean.shanghai.gov.cn/ko-Transportation/20240328/9b7b55a9c7844df898f9d4fcac427f4f.html'),
  nameRecord('상하이 타워', '上海中心大厦', ['상하이타워','상해타워','상하이센터','상하이중심','상하이중심대하','Shanghai Tower','上海中心'], 'https://www.shanghaitower.com/ProjectIntroduction.html'),
  nameRecord('징안사', '静安寺', ['정안사','징안쓰','징안스','Jingan Temple','Jing an Temple','靜安寺'], 'https://korean.shanghai.gov.cn/ko-OfficialServicesHubs/20260810/78ea07d1867f425496d95a77cd5f93d1.html'),
  nameRecord('상하이 박물관', '上海博物馆', ['상하이박물관','상해박물관','Shanghai Museum','上海博物館'], museumSource),
  nameRecord('상하이 박물관 동관', '上海博物馆东馆', ['상하이박물관동관','상하이박물관동쪽','上海博物館東館'], tourismSource),
  nameRecord('상하이 자연사박물관', '上海自然博物馆', ['상하이자연박물관','상하이자연사박물관','자연사박물관','Shanghai Natural History Museum','上海自然博物館'], 'https://english.shanghai.gov.cn/en-ArtExhibitions/20250520/b2214297418f47f08e5a8198de10aad9.html'),
  nameRecord('상하이 과학기술관', '上海科技馆', ['상하이과학기술관','상하이과학관','Shanghai Science and Technology Museum','上海科技館']),
  nameRecord('상하이 천문관', '上海天文馆', ['상하이천문관','상하이천문박물관','Shanghai Astronomy Museum','上海天文館'], museumSource),
  nameRecord('세기공원', '世纪公园', ['센추리공원','상하이센추리파크','Century Park','世紀公園']),
  nameRecord('진마오 타워', '金茂大厦', ['진마오타워','진마오빌딩','금무대하','Jin Mao Tower','金茂大廈'], museumSource),
  nameRecord('상하이 해양수족관', '上海海洋水族馆', ['상하이해양수족관','상하이아쿠아리움','Shanghai Ocean Aquarium','上海海洋水族館'], museumSource),
  nameRecord('상하이 야생동물원', '上海野生动物园', ['상하이야생동물원','Shanghai Wild Animal Park','上海野生動物園'], museumSource),
  nameRecord('상하이 동물원', '上海动物园', ['상하이동물원','Shanghai Zoo','上海動物園'], museumSource),
  nameRecord('푸둥 미술관', '浦东美术馆', ['푸동미술관','푸둥미술관','Museum of Art Pudong','浦東美術館'], nightMuseumSource),
  nameRecord('웨스트번드 미술관', '西岸美术馆', ['웨스트번드미술관','시안미술관','West Bund Museum','西岸美術館'], nightMuseumSource),
  nameRecord('롱 미술관 서안관', '龙美术馆西岸馆', ['롱뮤지엄','롱미술관','룽미술관','Long Museum West Bund','龍美術館西岸館'], nightMuseumSource),
  nameRecord('하오 미술관', '昊美术馆', ['하오미술관','하우미술관','HOW Art Museum','昊美術館'], nightMuseumSource),
  nameRecord('오로라 박물관', '震旦博物馆', ['오로라박물관','진단박물관','Aurora Museum','震旦博物館'], nightMuseumSource),
  nameRecord('중화예술궁', '中华艺术宫', ['중화예술궁','상하이미술관','China Art Museum','中華藝術宮'], 'https://korean.shanghai.gov.cn/ko-EditorsPick-travelinshanghai/20260701/fd431832889c49ffa533d115094939fc.html'),
  nameRecord('고의원', '古猗园', ['고의원','구이위안','Guyi Garden','古猗園']),
  nameRecord('난샹 옛 거리', '南翔老街', ['난샹옛거리','난샹고진','난샹라오제']),
  nameRecord('상하이 자동차 박물관', '上海汽车博物馆', ['상하이자동차박물관','Shanghai Auto Museum','上海汽車博物館']),
  nameRecord('상하이 인터내셔널 서킷', '上海国际赛车场', ['상하이서킷','상하이인터내셔널서킷','Shanghai International Circuit','上海國際賽車場']),
  nameRecord('펑징고진', '枫泾古镇', ['펑징고진','펑징수향마을','Fengjing','楓涇古鎮']),
  nameRecord('광푸린 문화유적지', '广富林文化遗址', ['광푸린','광부림','광푸린문화유적지','Guangfulin','廣富林文化遺址']),
  nameRecord('상하이 천산 식물원', '上海辰山植物园', ['천산식물원','상하이천산식물원','Shanghai Chenshan Botanical Garden','上海辰山植物園']),
  nameRecord('상하이 해피밸리', '上海欢乐谷', ['상하이해피밸리','해피밸리','Shanghai Happy Valley','上海歡樂谷']),
  nameRecord('상하이 우정박물관', '上海邮政博物馆', ['상하이우정박물관','우정박물관','Shanghai Postal Museum','上海郵政博物館']),
  nameRecord('자푸로대교', '乍浦路桥', ['자푸로대교','자푸루차오','자푸루교','乍浦路橋']),
  nameRecord('와이탄위안', '外滩源', ['와이탄위안','록번드','락번드','Rockbund','外灘源']),
  nameRecord('하이디라오', '海底捞', ['하이디라오','하이디라오훠궈','Haidilao','海底撈'], 'https://korean.shanghai.gov.cn/ko-EditorsPick-travelinshanghai/20250108/22c25803a06340e39d9cc4f6ae60b4f4.html', 'brand'),
  nameRecord('헤이티', '喜茶', ['헤이티','희차','시차','HEYTEA'], 'https://korean.shanghai.gov.cn/ko-EditorsPick-travelinshanghai/20260408/ae2a202f98244793aa359790831833ca.html', 'brand'),
  nameRecord('라이라이샤오룽', '莱莱小笼', ['라이라이샤오룽','라이라이샤오롱','라이라이소롱','萊萊小籠'], 'https://korean.shanghai.gov.cn/ko-EditorsPick-travelinshanghai/20260408/ae2a202f98244793aa359790831833ca.html', 'brand'),
  nameRecord('스타벅스', '星巴克', ['스타벅스','스벅','Starbucks'], 'https://www.shanghaitower.com/MALL.html', 'brand'),
  nameRecord('스타벅스 리저브 로스터리', '星巴克臻选上海烘焙工坊', ['스타벅스로스터리','스타벅스리저브로스터리','스타벅스리저브상하이로스터리','상하이스타벅스로스터리','상하이스타벅스리저브','Starbucks Reserve Roastery Shanghai','星巴克臻選上海烘焙工坊'], 'https://korean.shanghai.gov.cn/ko-Cafes/20241105/28a6d9c5a1a84beda039bbe3be4129bb.html'),
  nameRecord('매너 커피', 'Manner咖啡', ['매너커피','매너카페','Manner Coffee'], 'https://www.shanghaitower.com/MALL.html', 'brand'),
  nameRecord('엠스탠드', 'M Stand', ['엠스탠드','엠스탠드커피','M Stand Coffee'], 'https://www.shanghaitower.com/MALL.html', 'brand'),
  nameRecord('바왕차지', '霸王茶姬', ['바왕차지','패왕차희','차지','CHAGEE'], 'https://h5-cn.chagee.com/agreement?type=0', 'brand'),
];

// One cafe registry powers discovery, Korean search, and nearby map labels.
for(const brand of CAFE_BRANDS){
  const existing=SEARCH_NAME_CATALOG.find(record=>record.type==='brand'&&record.cn===brand.cn);
  if(existing){existing.aliases=[...new Set([...existing.aliases,brand.ko,...brand.aliases])];existing.brandId=brand.id;existing.ko=brand.ko;}
  else SEARCH_NAME_CATALOG.push({...brand,type:'brand',brandId:brand.id,aliases:[brand.ko,...brand.aliases]});
}

/** Exact known name only. A similarly named branch is never silently renamed. */
export function knownNameFor(query, places = []) {
  const key = normalizeSearch(query);
  if (!key) return null;
  for (const p of places) {
    if (p.nameTranslated || p.translationStatus === 'unavailable' || !p.cn || !hangul.test(p.koName || p.name || '')) continue;
    if ([p.cn,p.name,p.koName,...(aliases[p.id] || []),...(p.aliases || [])].some(value => normalizeSearch(value) === key)) {
      return {ko:p.koName || p.name,cn:p.cn,aliases:aliases[p.id] || [],source:p.source || '',type:'place'};
    }
  }
  return SEARCH_NAME_CATALOG.find(record => [record.cn,...record.aliases].some(value => normalizeSearch(value) === key)) || null;
}

const aliases = {
  pvg: ['푸동공항', '푸둥공항', '푸둥국제공항', '푸동국제공항', 'pudong airport', 'pvg'],
  longyang: ['룽양루역', '롱양루역', 'longyang road station'],
  nanjing: ['난징동루', '난징동로', '남경동로', 'nanjing east road'],
  riverfish: ['강변성외', '장볜청와이', 'jiangbian chengwai'],
  stay: ['우리숙소', '가일공우', '가일공우2동', '자르공위'],
  bund: ['와이탄', '외탄', '번드', '황푸강산책로', 'the bund'],
  pearl: ['동방명주', '동방명주탑', '오리엔탈펄', 'oriental pearl'],
  northbund: ['북와이탄', '북외탄', '노스번드', '북와이탄공원', '계란포토존', '달걀포토존', 'north bund'],
  'hotel-indigo': ['호텔인디고', '인디고호텔', '상하이인디고호텔', '호텔인디고상하이온더번드', '상하이와이탄인디고호텔', 'Hotel Indigo Shanghai on the Bund'],
  lamb: ['헌지우이치엔', '헌지우이첸', '헨지우이첸', 'long time ago'],
  jiajia: ['지아지아탕바오', '가가탕포', '가가탕바오', '쟈쟈탕바오', 'jia jia tang bao'],
  'jiajia-huanyu': ['지아지아탕바오환위후이', '가가탕포환위후이', '가가탕포중해환우회', '중하이환위후이점'],
  'yuyuan-metro': ['예원역', '위위안역', '유원역', 'yuyuan station'],
  jiaotong: ['자오퉁대학역', '교통대학역', '상하이교통대학역', 'jiaotong university station'],
  wukang: ['우캉맨션', '우캉빌딩', '무강대루', 'wukang building', 'wukang mansion'],
  'wukang-road': ['우캉루', '우캉로드', '무강로', 'wukang road'],
  yongfu: ['용푸루', '융푸루', 'yongfu road'],
  anfu: ['안푸루', '안푸로드', 'anfu road'],
  grandma: ['외파가', '와이포지아', '그랜마스홈', 'grandmas home'],
  'korean-gov': ['임시정부', '임시정부청사', '대한민국임시정부', '상해임시정부', '상하이임시정부'],
  xintiandi: ['신천지', '신톈디', '신티엔디', 'xintiandi'],
  yuyuan: ['예원', '위위안', '유원', '예원상가', '예원야경', 'yu garden', 'yuyuan'],
  jingyun: ['경운화', '징윈화', '징윈화카오야', 'Jing Yun Hua'],
  xiaoqiu: ['춈미', '샤오추자창차이'],
  'new-world-city': ['신세계백화점', '신세계성', '신세계성백화점', '상하이신세계백화점', 'New World City'],
  zhujiajiao: ['주가각', '주자자오', '주자각', '주가각수향마을', '주가각고진', '주자자오고진', '朱家角', 'Zhujiajiao'],
  panlong: ['판롱티엔디', '판룽티엔디', '판롱톈디', '판룽톈디', '판롱천지', '판롱신천지', '蟠龙新天地', 'Panlong Tiandi'],
  'grand-central': ['그랜드센트럴호텔', '그랜드센트럴', '상하이그랜드센트럴호텔', 'grand central hotel'],
  wuzhen: ['우전', '우쩐', '우전수향마을', 'wuzhen'],
  'wuzhen-food': ['우전서책먹거리골목', '우전서책먹거리', '서책먹거리골목'],
  hotpot: ['주광옥', '주광옥훠궈', '주광위', 'zhuguangyu'],
  'dim-sum': ['점도덕', '점도덕정대점', '디앤두더', 'diandude'],
  holiland: ['홀리랜드', '하오리라이', 'holiland'],
  tianzifang: ['티엔즈팡', '톈즈팡', '텐즈팡', '전자방', 'tianzifang'],
  'rt-mart': ['따룬파', '다룬파', '대윤발', '알티마트', 'rt mart'],
  'peoples-square': ['인민광장', '런민광장', 'peoples square'],
  lilian: ['릴리안', '릴리안베이커리', 'lilian bakery', 'lillian bakery'],
  yunhe: ['운허면관', '윈허면관', 'yun he'],
  'arabica-wukang': ['아라비카우캉루', '응커피우캉루', 'arabica wukang'],
  'arabica-rockbund': ['아라비카록번드', '아라비카락번드', '응커피와이탄', 'arabica rockbund'],
  huxinting: ['호심정', '호심정찻집', '후신팅', 'huxinting'],
  nanxiang: ['난샹만두', '남상만두', '난샹만터우', 'nanxiang'],
  dahuchun: ['다후춘', '다후천', 'dahuchun'],
  lujiazui: ['루자쭈이', '루자쭈에이', '루지아주이', 'lujiazui'],
  waibaidu: ['와이바이두교', '외백도교', 'waibaidu bridge'],
  xujiahui: ['쉬자후이', '서가회', 'xujiahui'],
};

// Regions remain regions when combined with an amenity, rather than becoming a
// particular observation platform, shopping building, or station.
const regions = [
  ['上海', ['상하이', '상해'], []],
  ['浦东', ['푸동', '푸둥'], []],
  ['黄浦', ['황푸'], []],
  ['虹口', ['훙커우', '홍커우'], []],
  ['徐汇', ['쉬후이', '서회'], []],
  ['浙江', ['저장성'], []],
  ['南京东路', aliases.nanjing, ['nanjing']],
  ['外滩', ['와이탄', '외탄', '번드', 'the bund'], ['bund', 'arabica-rockbund']],
  ['北外滩', ['북와이탄', '북외탄', '노스번드', 'north bund'], ['northbund']],
  ['豫园', ['예원', '위위안', '유원', 'yuyuan'], ['yuyuan', 'yuyuan-metro', 'huxinting', 'nanxiang', 'stay']],
  ['新天地', aliases.xintiandi, ['xintiandi', 'korean-gov']],
  ['乌镇', ['우전', '우쩐', 'wuzhen'], ['wuzhen', 'wuzhen-food']],
  ['朱家角古镇', ['주가각', '주자자오', '주자각', 'Zhujiajiao'], ['zhujiajiao']],
  ['蟠龙天地', aliases.panlong, ['panlong']],
  ['武康路', aliases['wukang-road'], ['wukang-road', 'wukang', 'arabica-wukang']],
  ['永福路', aliases.yongfu, ['yongfu']],
  ['安福路', aliases.anfu, ['anfu']],
  ['陆家嘴', aliases.lujiazui, ['lujiazui', 'pearl', 'dim-sum', 'holiland']],
  ['人民广场', aliases['peoples-square'], ['peoples-square', 'lilian', 'jiajia', 'new-world-city', 'jingyun']],
  ['徐家汇', aliases.xujiahui, ['xujiahui', 'grandma']],
  ['龙阳路', ['룽양루', '롱양루'], ['longyang']],
  ['正大广场', ['정대광장', '정따광장'], ['dim-sum', 'holiland']],
  ['法租界', ['프랑스조계지', '프랑스거리'], ['wukang', 'wukang-road', 'yongfu', 'anfu', 'arabica-wukang']],
];

// An ids list restricts a narrow menu/amenity to data that actually mentions it.
// Do not search descriptions/tips: they also contain negative menu warnings.
const categories = [
  ['咖啡厅', ['카페', '커피', '커피숍'], 'cafe'],
  ['餐厅', ['식당', '음식점', '맛집', '음식'], 'food'],
  ['面包店', ['빵집', '베이커리'], 'cafe', ['lilian', 'holiland']],
  ['茶馆', ['찻집', '차집', '티하우스'], 'cafe', ['huxinting']],
  ['甜品', ['디저트', '간식'], null, ['lilian', 'holiland', 'wuzhen-food']],
  ['便利店', ['편의점'], null, []],
  ['超市', ['마트', '슈퍼마켓', '슈퍼'], 'shopping', ['rt-mart']],
  ['商场', ['쇼핑몰', '백화점'], 'shopping', ['new-world-city']],
  ['购物', ['쇼핑', '쇼핑거리'], 'shopping'],
  ['药店', ['약국'], null, []],
  ['公共厕所', ['화장실', '공중화장실'], null, []],
  ['酒店', ['호텔', '숙소'], 'hotel'],
  ['地铁站', ['지하철역', '지하철'], 'transport', ['longyang', 'yuyuan-metro', 'jiaotong']],
  ['机场', ['공항'], 'transport', ['pvg']],
  ['上海 机场', ['상하이공항', '상해공항'], 'transport', ['pvg']],
  ['磁悬浮', ['마그레브', '자기부상열차'], 'transport', ['longyang', 'pvg']],
  ['景点', ['명소', '관광지', '랜드마크'], 'landmark'],
  ['博物馆', ['박물관'], null, []],
  ['美术馆', ['미술관'], null, []],
  ['公园', ['공원'], null, []],
  ['蛋挞', ['에그타르트', '에그타트'], null, ['lilian']],
  ['毛巾卷', ['수건케이크'], null, ['holiland']],
  ['蟹粉面', ['게살국수', '게살면', '게살누들'], null, ['yunhe']],
  ['小笼包', ['샤오롱바오', '소룡포'], null, ['jiajia', 'jiajia-huanyu', 'nanxiang']],
  ['汤包', ['탕바오'], null, ['jiajia', 'jiajia-huanyu', 'nanxiang']],
  ['生煎包', ['성젠바오', '셩젠바오', '생전포'], null, ['dahuchun']],
  ['火锅', ['훠궈', '훠거'], null, ['hotpot']],
  ['羊肉串', ['양꼬치'], null, ['lamb']],
  ['红烧肉', ['홍소육'], null, ['xiaoqiu']],
  ['烤鸭', ['베이징덕', '북경오리'], null, ['jingyun']],
  ['广式点心', ['딤섬'], null, ['dim-sum']],
  ['烤鱼', ['생선구이'], null, ['riverfish']],
  ['清蒸鱼', ['생선찜'], null, []],
];

function dictionary(places) {
  const entries = [];
  const add = (entry, priority) => {
    for (const alias of [...entry.aliases, entry.zh]) {
      const key = normalizeSearch(alias);
      if (key) entries.push({ ...entry, key, priority });
    }
  };
  for (const p of places) {
    const names = [!p.nameTranslated && p.name, ...(aliases[p.id] || []), ...(p.aliases || [])].filter(Boolean);
    if (p.cn && !hangul.test(p.cn)) add({ type: 'place', aliases: names, zh: p.cn, ids: [p.id] }, 10);
  }
  add({ type: 'place', aliases: aliases.jiajia, zh: '佳家汤包', ids: ['jiajia', 'jiajia-huanyu'] }, 20);
  add({ type: 'place', aliases: ['아라비카', '응커피', '%커피', 'arabica'], zh: '% Arabica', ids: ['arabica-wukang', 'arabica-rockbund'] }, 20);
  for (const record of SEARCH_NAME_CATALOG) {
    const ids = places.filter(p => record.brandId ? p.brandId===record.brandId || findCafeBrand(p.cn)?.id===record.brandId : [record.cn,...record.aliases].some(name => normalizeSearch(name) === normalizeSearch(p.cn))).map(p => p.id);
    add({ type:'place',aliases:record.aliases,zh:record.cn,ids },25);
  }
  for (const [zh, names, ids] of regions) add({ type: 'region', aliases: names, zh, ids }, 30);
  for (const [zh, names, category, ids] of categories) add({ type: 'category', aliases: names, zh, category, ids }, 40);
  add({ type: 'modifier', aliases: ['근처', '주변', '가까운'], zh: '附近' }, 50);
  const unique = new Map();
  for (const entry of entries.sort((a, b) => b.priority - a.priority)) if (!unique.has(entry.key)) unique.set(entry.key, entry);
  return [...unique.values()].sort((a, b) => b.key.length - a.key.length);
}

// Only segment an entire word/phrase if every part is known. Thus unknown
// proper names such as "우전이네" are never changed into "乌镇이네".
function segment(text, entries) {
  const key = normalizeSearch(text);
  if (!key || key.length > 400) return null;
  const paths = new Map([[key.length, []]]);
  for (let i = key.length - 1; i >= 0; i--) {
    for (const entry of entries) {
      if (key.startsWith(entry.key, i) && paths.has(i + entry.key.length)) {
        paths.set(i, [entry, ...paths.get(i + entry.key.length)]);
        break;
      }
    }
  }
  return paths.get(0) || null;
}

function parse(query, places) {
  const entries = dictionary(places);
  const complete = segment(query, entries);
  if (complete) return complete.map(entry => ({ entry, text: entry.zh }));
  const words = String(query).trim().split(/\s+/u);
  const result = [];
  for (let i = 0; i < words.length;) {
    let matched = false;
    for (let end = Math.min(words.length, i + 7); end > i; end--) {
      const parts = segment(words.slice(i, end).join(' '), entries);
      if (!parts) continue;
      result.push(...parts.map(entry => ({ entry, text: entry.zh })));
      i = end; matched = true; break;
    }
    if (!matched) result.push({ text: words[i++] });
  }
  return result;
}

export function resolveKnownQuery(query, places = []) {
  const original = String(query ?? '').trim();
  if (!hangul.test(original)) return { query: original, changed: false, needsTranslation: false, kind: 'original', terms: [] };
  const parts = parse(original, places);
  const converted = parts.map(part => part.text).join(' ');
  const changed = parts.some(part => part.entry) && converted !== original;
  return {
    query: changed ? converted : original,
    changed,
    needsTranslation: hangul.test(changed ? converted : original),
    kind: changed ? 'dictionary' : 'original',
    terms: parts.filter(part => part.entry).map(part => part.text),
  };
}

function namesFor(place) {
  const shared = place.id.startsWith('jiajia') ? aliases.jiajia
    : place.id.startsWith('arabica-') ? ['아라비카', '응커피', '%커피', 'arabica'] : [];
  return [!place.nameTranslated && place.name, place.cn, ...(aliases[place.id] || []), ...shared, ...(place.aliases || [])].filter(Boolean).map(normalizeSearch);
}

function near(a, b) {
  if (![a.lng, a.lat, b.lng, b.lat].every(Number.isFinite)) return false;
  const x = (a.lng - b.lng) * Math.cos((a.lat + b.lat) * Math.PI / 360);
  return Math.hypot(x, a.lat - b.lat) * 111.2 <= 1.5;
}

export function findLocalPlaces(query, places = []) {
  const key = normalizeSearch(query);
  if (!key) return [];
  const parts = parse(query, places);
  const filters = parts.filter(part => part.entry && part.entry.type !== 'modifier').map(part => part.entry);
  const unknown = parts.filter(part => !part.entry).map(part => normalizeSearch(part.text)).filter(Boolean);
  const categoryFilters = filters.filter(entry => entry.type === 'category');
  return places.map((p, index) => {
    const names = namesFor(p);
    const haystack = [...names, normalizeSearch(p.area), normalizeSearch(p.searchQuery)].join('|');
    if (!unknown.every(term => haystack.includes(term))) return null;
    for (const entry of filters) {
      if (entry.type === 'category') {
        if (entry.ids ? !entry.ids.includes(p.id) : p.category !== entry.category) return null;
      } else if (entry.type === 'region') {
        if (entry.zh === '上海') continue; // This is already a Shanghai trip catalog.
        if (!entry.ids.includes(p.id) && ![...entry.aliases, entry.zh].some(term => haystack.includes(normalizeSearch(term)))) return null;
      } else if (!entry.ids.includes(p.id)) {
        // A named anchor + category ("우캉맨션 카페") can suggest already
        // catalogued places within 1.5 km, never invent a nearby business.
        if (!categoryFilters.length || !places.some(anchor => entry.ids.includes(anchor.id) && near(anchor, p))) return null;
      }
    }
    let score = names.some(name => name === key) ? 1000
      : names.some(name => name.startsWith(key)) ? 800
      : names.some(name => name.includes(key)) ? 650
      : haystack.includes(key) ? 450 : 300;
    if (!filters.length && !haystack.includes(key)) return null;
    if (filters.some(entry => entry.ids?.includes(p.id))) score += 20;
    return { place: p, score, index };
  }).filter(Boolean).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 12).map(item => item.place);
}
