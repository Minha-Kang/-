// Shared display/search names for cafe and tea chains. A brand match supplies
// no branch address, coordinates, opening status, price or recommendation.
// Sources identify the brands; Korean spellings also include common search
// variants. Preserve the complete original POI name when matching a branch.
const brand=(id,ko,cn,aliases,tagline,source)=>Object.freeze({id,ko,cn,aliases:Object.freeze([...new Set([ko,cn,...aliases])]),tagline,source});

export const CAFE_BRANDS=Object.freeze([
  brand('heytea','헤이티','喜茶',
    ['헤이 티','희차','시차','HEYTEA','Hey Tea','喜茶GO'],
    '티 · 과일티','https://www.heytea.com/'),
  brand('chagee','차지 · 바왕차지','霸王茶姬',
    ['차지','차기','차게','차게이','바왕차지','바왕차기','패왕차희','CHAGEE','Ba Wang Cha Ji','Bawangchaji'],
    '찻잎 밀크티','https://www.chagee.com/'),
  brand('luckin','루이싱 커피','瑞幸咖啡',
    ['루이싱','루이싱커피','루이신','뤼싱커피','럭킨','럭킨커피','Luckin','Luckin Coffee','瑞幸'],
    '커피 · 라테','https://www.lkcoffee.com/'),
  brand('manner','매너 커피','Manner咖啡',
    ['매너','매너커피','매너카페','MANNER','Manner Coffee'],
    '커피 · 라테','https://www.shanghaitower.com/MALL.html'),
  brand('mstand','엠스탠드','M Stand',
    ['엠스탠드커피','엠스텐드','MStand','M Stand Coffee'],
    '커피 · 디저트','https://www.mstand.cn/ProductInfoCategory?categoryId=577765'),
  brand('naixue','나이쉐','奈雪的茶',
    ['나이슈에','나이쉐더차','나이슈에더차','나유키','나이유키','奈雪','奈雪の茶','Naixue','Nayuki','Naisnow'],
    '과일티 · 베이커리','https://www.naixue.com/'),
  brand('mixue','미쉐빙청','蜜雪冰城',
    ['미쉐','미슈에','미슈에빙청','믹슈','밀설빙성','Mixue','Mixue Ice Cream & Tea'],
    '레모네이드 · 아이스크림','https://www.mxbc.com/'),
  brand('chabaidao','차백도','茶百道',
    ['차바이다오','차바이따오','차판다','ChaPanda','Chabaidao','Cha Bai Dao'],
    '밀크티 · 과일티','https://www.chabaidao.com/home/one/index/id/1.html'),
  brand('coco','코코','CoCo都可',
    ['코코버블티','코코밀크티','코코도우커','코코두커','都可','CoCo','CoCo Tea','CoCo Bubble Tea','CoCo Fresh Tea & Juice','都可茶饮','都可茶飲'],
    '버블티 · 과일티','https://www.coco-tea.com.cn/'),
  brand('starbucks','스타벅스','星巴克',
    ['스벅','Starbucks','Starbucks Coffee','星巴克咖啡'],
    '커피 · 라테','https://www.starbucks.com.cn/'),
]);

const normalize=value=>value.normalize('NFKC').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu,'');
const escapeRegex=value=>value.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
const latinOnly=/^[a-z][a-z\s&.-]*$/iu;
const han=/[\u3400-\u9fff]/u;
const hangul=/[가-힣]/u;
const ambiguousLatin=new Set(['coco','manner']);
const matchers=CAFE_BRANDS.map(record=>({record,exact:new Set(record.aliases.map(normalize)),parts:record.aliases.map(alias=>{
  const value=alias.normalize('NFKC').toLocaleLowerCase();
  if(latinOnly.test(value)){
    // Bare CoCo and Manner can also be unrelated names (Coco Chanel, The Manner).
    // Recognize those short forms only as exact brand tags or an explicit branch
    // such as CoCo(南京东路店); full tea/coffee names use normal token boundaries.
    if(ambiguousLatin.has(value))return {kind:'ambiguous',pattern:new RegExp(`^${escapeRegex(value)}\\s*(?=[(（]|[\\u3400-\\u9fff])`,'iu')};
    return {kind:'latin',pattern:new RegExp(`(^|[^a-z0-9])${value.split(/\s+/u).map(escapeRegex).join('\\s*')}(?=$|[^a-z0-9])`,'iu')};
  }
  // Korean two-letter nicknames are useful exact queries, but too short for
  // arbitrary substring matching. Chinese registered names can precede 店.
  if(value==='都可')return {kind:'ambiguous',pattern:/^都可\s*(?=[(（])/u};
  if(han.test(value))return {kind:'text',value:normalize(value)};
  if(hangul.test(value)&&normalize(value).length>=3)return {kind:'text',value:normalize(value)};
  return null;
}).filter(Boolean)}));

/** Return chain metadata for an exact alias or a recognizable branch name.
 * This does not resolve a branch or authorize replacing its original name. */
export function findCafeBrand(name) {
  if(typeof name!=='string'||!name.trim())return null;
  const original=name.normalize('NFKC').toLocaleLowerCase().trim();
  const compact=normalize(original);
  const exact=matchers.find(({exact})=>exact.has(compact));
  if(exact)return exact.record;
  return matchers.find(({parts})=>parts.some(part=>part.kind==='text'?compact.includes(part.value):part.pattern.test(original)))?.record || null;
}
