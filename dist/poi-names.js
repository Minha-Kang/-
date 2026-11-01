// Korean display names only: never replace a POI's original name, coordinates,
// search query, branch identity, or navigation destination with these labels.
// Reviewed 2026-10-31. Aliases are exact spelling variants, not branch matches.
// Building/river/pier labels without an established Korean name are concise
// Korean renderings of the observed Chinese label, not official Korean names.
// In particular, the pier labels below do not identify the booked cruise pier.

// Primary sources for Bund building identities:
// https://fgj.sh.gov.cn/yxlsjz/20210922/8f72fa07617c4828a25ef948cd1c5da7.html
// https://fgj.sh.gov.cn/yxlsjzcs/20200331/2447d47b3e2947bfba7c64ed04a758a7.html
// https://www.meet-in-shanghai.net/kr/guide/we-will-teach-you-how-to-enter-the-centennial-building-of-the-bunt-with-a-handle-there-are-many-places-where-you-can-visit-for-free-498144/
// Landmark names and Korean visitor terminology:
// https://korean.shanghai.gov.cn/ko-EditorsPick-travelinshanghai/20260709/c2478cac5fd24888af830202a0bb7e8b.html
// https://www.shanghaitower.com/ProjectIntroduction.html
// https://www.swfc-shanghai.com/
// https://all.accor.com/hotel/A5G7/index.ko.shtml
// https://www.shanghai.gov.cn/gwk/search/content/cf46474f-4259-4087-ada5-105e2ec94971
// Korean brand names / official brands (no branch or opening-hour claims):
// https://krei.re.kr/attach/pdf/C2023_47-4.pdf
// https://dream.kotra.or.kr/kotranews/cms/news/actionKotraBoardDetail.do?CONTENTS_NO=1&MENU_ID=180&SITE_NO=3&bbsGbn=243&bbsSn=243&pNttSn=206214
// https://www.family.com.tw/Marketing/ko
// https://www.lawson.co.jp/service/others/in/lang/kr.html
// https://www.pizzahut.com.cn/
// https://chagee.co.kr/kr/ko
// https://korean.shanghai.gov.cn/ko-EditorsPick-travelinshanghai/20260408/ae2a202f98244793aa359790831833ca.html

export const POI_NAMES = [
  { cn: '横滨正金银行大楼', ko: '요코하마 정금은행 빌딩', aliases: ['横濱正金銀行大樓'] },
  { cn: '台湾银行大楼', ko: '타이완은행 빌딩', aliases: ['臺灣銀行大樓', '台灣銀行大樓'] },
  { cn: '扬子大楼', ko: '양쯔 빌딩', aliases: ['揚子大樓', '扬子保险大楼', '揚子保險大樓'] },
  { cn: '中国银行大楼', ko: '중국은행 빌딩', aliases: ['中國銀行大樓', '上海中国银行大楼'] },
  { cn: '汇丰银行大楼', ko: 'HSBC 은행 빌딩', aliases: ['滙豐銀行大樓', '匯豐銀行大樓'] },
  { cn: '江海关大楼', ko: '상하이 세관 빌딩', aliases: ['江海關大樓', '上海海关大楼'] },
  { cn: '亚洲大楼', ko: '아시아 빌딩', aliases: ['亞洲大樓'] },
  { cn: '外滩信号台', ko: '와이탄 신호탑', aliases: ['外灘信號台', '外滩气象信号台'] },
  { cn: '和平饭店', ko: '페어몬트 피스 호텔', aliases: ['和平飯店', '上海和平饭店', 'Fairmont Peace Hotel'] },
  { cn: '上海中心大厦', ko: '상하이 타워', aliases: ['上海中心大廈', 'Shanghai Tower'] },
  { cn: '金茂大厦', ko: '진마오 타워', aliases: ['金茂大廈', 'Jin Mao Tower'] },
  { cn: '上海环球金融中心', ko: '상하이 세계금융센터', aliases: ['上海環球金融中心', 'Shanghai World Financial Center'] },
  { cn: '东方明珠广播电视塔', ko: '동방명주', aliases: ['東方明珠廣播電視塔', '东方明珠', '東方明珠'] },
  { cn: '中山东一路渡口', ko: '중산둥이루 나루터', aliases: ['中山東一路渡口'] },
  { cn: '中山东一路码头', ko: '중산둥이루 부두', aliases: ['中山東一路碼頭'] },
  { cn: '浦西(外滩)', ko: '푸시(와이탄)', aliases: ['浦西（外滩）', '浦西(外灘)', '浦西（外灘）'] },
  { cn: '黄浦江', ko: '황푸강', aliases: ['黃浦江', 'Huangpu River'] },
  { cn: '苏州河', ko: '쑤저우허', aliases: ['蘇州河', 'Suzhou Creek'] },

  { cn: '星巴克', ko: '스타벅스', aliases: ['星巴克咖啡', 'Starbucks'] },
  { cn: '麦当劳', ko: '맥도날드', aliases: ['麥當勞', "McDonald's"] },
  { cn: '麦咖啡', ko: '맥카페', aliases: ['麥咖啡', 'McCafé', 'McCafe'] },
  { cn: '肯德基', ko: 'KFC · 케이에프씨', aliases: ['KFC'] },
  { cn: '必胜客', ko: '피자헛', aliases: ['必勝客', 'Pizza Hut'] },
  { cn: '全家', ko: '패밀리마트', aliases: ['全家便利店', '全家便利商店', 'FamilyMart'] },
  { cn: '罗森', ko: '로손', aliases: ['羅森', '罗森便利店', 'Lawson'] },
  { cn: '瑞幸咖啡', ko: '루이싱 커피', aliases: ['瑞幸', 'Luckin Coffee'] },
  { cn: 'Manner咖啡', ko: '매너 커피', aliases: ['Manner Coffee', 'MANNER'] },
  { cn: '喜茶', ko: '헤이티', aliases: ['HEYTEA'] },
  { cn: '霸王茶姬', ko: '차지 · 바왕차지', aliases: ['CHAGEE'] },
  { cn: '蜜雪冰城', ko: '미쉐빙청', aliases: ['MIXUE'] },
  { cn: '茶百道', ko: '차백도', aliases: ['CHABAIDAO'] },
  { cn: 'CoCo都可', ko: '코코', aliases: ['都可', 'COCO都可'] },
  { cn: '海底捞', ko: '하이디라오', aliases: ['海底撈', '海底捞火锅', 'Haidilao'] },
  { cn: '小龙坎', ko: '샤오룽칸', aliases: ['小龍坎', '小龙坎火锅'] },
  { cn: '莱莱小笼', ko: '라이라이샤오룽', aliases: ['萊萊小籠'] },
];
