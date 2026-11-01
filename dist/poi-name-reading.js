// Approximate Mandarin pronunciation in Hangul, never an asserted Korean name.
// The original Chinese name must remain the source for search and directions.
// NIKL: Chinese pronunciation table and foreign-word spelling rules, §3.7:
// https://www.korean.go.kr/kornorms/m/m_regltn.do?regltn_code=0003
// pinyin-pro performs phrase-aware polyphone selection; local proper names can
// still have exceptional readings. Callers must show the returned reading label.
import {pinyin} from './vendor/pinyin-pro-3.29.5.js';

const HAN=/\p{Script=Han}/u;
const HAN_RUN=/\p{Script=Han}+/gu;
const CACHE_LIMIT=4096;
const cache=new Map();

// Each final begins with a silent-onset syllable. Combining a Mandarin initial
// replaces only that first Hangul onset, preserving additional syllables.
const initials={b:7,p:17,m:6,f:17,d:3,t:16,n:2,l:5,g:0,k:15,h:18,j:12,q:14,x:9,zh:12,ch:14,sh:9,r:5,z:13,c:14,s:10};
const finals={a:'아',o:'오',e:'어',ê:'에',i:'이',u:'우',ü:'위',ai:'아이',ei:'에이',ao:'아오',ou:'어우',an:'안',en:'언',ang:'앙',eng:'엉',er:'얼',ia:'야',io:'요',ie:'예',iai:'야이',iao:'야오',iu:'유',ian:'옌',in:'인',iang:'양',ing:'잉',ua:'와',uo:'워',uai:'와이',ui:'우이',uan:'완',un:'운',uang:'왕',ong:'웅','üe':'웨','üan':'위안','ün':'윈',iong:'융'};
const zeroInitial={yi:'이',ya:'야',yo:'요',ye:'예',yai:'야이',yao:'야오',you:'유',yan:'옌',yin:'인',yang:'양',ying:'잉',yong:'융',yu:'위',yue:'웨',yuan:'위안',yun:'윈',wu:'우',wa:'와',wo:'워',wai:'와이',wei:'웨이',wan:'완',wen:'원',wang:'왕',weng:'웡'};
const standalone={zhi:'즈',chi:'츠',shi:'스',ri:'르',zi:'쯔',ci:'츠',si:'쓰',m:'음',n:'은',ng:'응',hm:'흠',hng:'흥'};
// Shanghai's local readings are exceptions to the generic phrase dictionary.
// City's official romanizations: Minhang, Xinzhuang.
// https://english.shanghai.gov.cn/en-AdministrativeDistricts/20231216/5552bf8628204eccbacafd610e49cc9a.html
// https://www.shanghai.gov.cn/minhang/index.html
const localPhrases={'闵行':['min','hang'],'閔行':['min','hang'],'莘庄':['xin','zhuang'],'莘莊':['xin','zhuang']};

function syllableToHangul(value) {
  // toneType:'none' normally removes tones; numeric suffixes are also harmless.
  const syllable=value.toLowerCase().replace(/u:/gu,'ü').replace(/v/gu,'ü').replace(/[0-5]$/u,'');
  if(standalone[syllable])return standalone[syllable];
  if(zeroInitial[syllable])return zeroInitial[syllable];
  if(finals[syllable])return finals[syllable];
  const initial=syllable.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcs])/u)?.[0];
  if(!initial || initials[initial]===undefined)return null;
  let final=syllable.slice(initial.length);
  // Pinyin omits the umlaut after j/q/x; n/l keep it (lü, nü).
  if(['j','q','x'].includes(initial) && final.startsWith('u'))final='ü'+final.slice(1);
  const result=finals[final];
  if(!result)return null;
  // The spelling rules simplify ya/ye/yo/yu following ㅈ/ㅉ/ㅊ.
  const first=result.codePointAt(0),vowel=Math.floor((first-0xac00)%588/28);
  const simpleVowel=[12,13,14].includes(initials[initial])?({2:0,7:5,12:8,17:13})[vowel]:undefined;
  return String.fromCodePoint(first+(initials[initial]-11)*588+(simpleVowel===undefined?0:(simpleVowel-vowel)*28))+result.slice(1);
}

/** Synchronous, offline display-only fallback.
 * Returns {ko, kind:'reading', label:'한글 독음(자동)'} or null.
 * Latin letters, numbers, punctuation, and unknown characters are preserved.
 * Prefer a verified Korean name over this approximation; never feed this
 * generated reading back into an authoritative name, dictionary, or query.
 */
export function readChineseName(name) {
  if(typeof name!=='string' || !name.trim() || !HAN.test(name) || name.length>512)return null;
  if(cache.has(name))return cache.get(name);
  let converted=0;
  const reading=name.replace(HAN_RUN,run=>{
    const characters=[...run];
    const syllables=pinyin(run,{type:'array',toneType:'none',nonZh:'consecutive'});
    // Protect the original text if a future library release changes alignment.
    if(syllables.length!==characters.length)return run;
    for(let index=0;index<characters.length-1;index++){
      const local=localPhrases[characters[index]+characters[index+1]];
      if(local){syllables[index]=local[0];syllables[index+1]=local[1];}
    }
    return syllables.map((syllable,index)=>{
      const result=syllableToHangul(syllable);
      if(result){converted++;return result;}
      return characters[index];
    }).join('');
  });
  const result=converted?Object.freeze({ko:reading,kind:'reading',label:'한글 독음(자동)'}):null;
  if(cache.size>=CACHE_LIMIT)cache.delete(cache.keys().next().value);
  cache.set(name,result);
  return result;
}
