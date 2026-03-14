// ==================== fish-profiles.js ====================
// 魚種別プロファイル: 黄金条件定義 + カラーテーマ
// =====================================================

const FISH_PROFILES = {
  aji: {
    name: 'アジ', icon: 'img/fish/aji.png', emoji: '🐟',
    tide: { best: ['上げ三分', '下げ七分'], good: ['上げ潮中盤', '下げ潮中盤'], bad: ['潮止まり'] },
    pressure: { best: [1000, 1013], good: [1013, 1020], ok: [995, 1025] },
    wind: { best: [0, 2], good: [2, 4], max: 6 },
    wave: { best: [0, 0.5], good: [0.5, 1.0], max: 1.5 },
    seaTemp: { best: [18, 22], good: [15, 25], min: 12, max: 28 },
    moon: { best: 'new', good: 'crescent' },
    timeOfDay: { best: ['night', 'evening'], good: ['morning'] },
    spotType: { best: ['port', 'pier'], good: ['park'], ok: ['rock'] },
    shelterPref: 'high'
  },
  saba: {
    name: 'サバ', icon: 'img/fish/saba.png', emoji: '🐠',
    tide: { best: ['上げ七分', '下げ三分'], good: ['上げ潮中盤', '下げ潮中盤'], bad: ['潮止まり'] },
    pressure: { best: [1005, 1015], good: [1000, 1020], ok: [995, 1025] },
    wind: { best: [0, 3], good: [3, 5], max: 8 },
    wave: { best: [0.3, 1.0], good: [0, 1.5], max: 2.0 },
    seaTemp: { best: [17, 23], good: [14, 26], min: 12, max: 28 },
    moon: { best: 'any', good: 'any' },
    timeOfDay: { best: ['morning', 'evening'], good: ['daytime'] },
    spotType: { best: ['port', 'pier'], good: ['park', 'rock'], ok: ['surf'] },
    shelterPref: 'medium'
  },
  aori: {
    name: 'アオリイカ', icon: 'img/fish/aori.png', emoji: '🦑',
    tide: { best: ['上げ七分', '下げ三分'], good: ['上げ三分', '下げ七分'], bad: ['潮止まり'] },
    pressure: { best: [1005, 1015], good: [1000, 1020], ok: [995, 1025] },
    wind: { best: [0, 3], good: [3, 5], max: 7 },
    wave: { best: [0.3, 1.0], good: [0, 1.5], max: 2.0 },
    seaTemp: { best: [20, 25], good: [16, 28], min: 15, max: 30 },
    moon: { best: 'full', good: 'half' },
    timeOfDay: { best: ['evening', 'night'], good: ['morning'] },
    spotType: { best: ['rock', 'pier'], good: ['port', 'park'], ok: ['surf'] },
    shelterPref: 'low'
  },
  hirame: {
    name: 'ヒラメ', icon: 'img/fish/hirame.png', emoji: '🐊',
    tide: { best: ['下げ三分', '上げ七分'], good: ['上げ潮中盤', '下げ潮中盤'], bad: ['潮止まり'] },
    pressure: { best: [1008, 1018], good: [1003, 1023], ok: [998, 1028] },
    wind: { best: [1, 4], good: [0, 6], max: 8 },
    wave: { best: [0.5, 1.5], good: [0.3, 2.0], max: 2.5 },
    seaTemp: { best: [15, 20], good: [12, 23], min: 10, max: 25 },
    moon: { best: 'any', good: 'any' },
    timeOfDay: { best: ['morning', 'evening'], good: ['daytime'] },
    spotType: { best: ['surf', 'river'], good: ['port', 'pier'], ok: ['rock'] },
    shelterPref: 'low'
  },
  hata: {
    name: 'ハタ', icon: 'img/fish/hata.png', emoji: '🐡',
    tide: { best: ['上げ七分', '上げ三分'], good: ['下げ三分', '上げ潮中盤'], bad: ['潮止まり'] },
    pressure: { best: [1005, 1018], good: [1000, 1023], ok: [995, 1028] },
    wind: { best: [0, 3], good: [3, 5], max: 7 },
    wave: { best: [0.3, 1.0], good: [0, 1.5], max: 2.0 },
    seaTemp: { best: [22, 28], good: [18, 30], min: 16, max: 32 },
    moon: { best: 'any', good: 'any' },
    timeOfDay: { best: ['morning', 'evening'], good: ['daytime'] },
    spotType: { best: ['rock', 'pier'], good: ['port'], ok: ['park'] },
    shelterPref: 'low'
  },
  gasira: {
    name: 'ガシラ', icon: 'img/fish/gasira.png', emoji: '🦂',
    tide: { best: ['下げ七分', '上げ三分'], good: ['上げ潮中盤', '下げ潮中盤'], bad: [] },
    pressure: { best: [1005, 1020], good: [998, 1025], ok: [990, 1030] },
    wind: { best: [0, 4], good: [4, 7], max: 10 },
    wave: { best: [0, 1.0], good: [1.0, 2.0], max: 2.5 },
    seaTemp: { best: [12, 20], good: [8, 24], min: 5, max: 28 },
    moon: { best: 'new', good: 'crescent' },
    timeOfDay: { best: ['night', 'evening'], good: ['morning'] },
    spotType: { best: ['rock', 'port', 'pier'], good: ['park'], ok: ['river'] },
    shelterPref: 'medium'
  },
  aomono: {
    name: '青物', icon: 'img/fish/aomono.png', emoji: '💪',
    tide: { best: ['上げ七分', '下げ三分'], good: ['上げ潮中盤', '下げ潮中盤'], bad: ['潮止まり'] },
    pressure: { best: [1008, 1018], good: [1003, 1023], ok: [998, 1028] },
    wind: { best: [2, 5], good: [0, 7], max: 10 },
    wave: { best: [0.5, 1.5], good: [0.3, 2.0], max: 3.0 },
    seaTemp: { best: [18, 24], good: [15, 27], min: 13, max: 30 },
    moon: { best: 'any', good: 'any' },
    timeOfDay: { best: ['morning'], good: ['evening', 'daytime'] },
    spotType: { best: ['rock', 'pier'], good: ['surf', 'park'], ok: ['port'] },
    shelterPref: 'low'
  },
  tako: {
    name: 'タコ', icon: 'img/fish/tako.png', emoji: '🐙',
    tide: { best: ['潮止まり'], good: ['上げ三分', '下げ七分'], bad: ['上げ七分', '下げ三分'] },
    pressure: { best: [1008, 1018], good: [1003, 1023], ok: [998, 1028] },
    wind: { best: [0, 2], good: [2, 5], max: 5 },
    wave: { best: [0, 0.5], good: [0.5, 1.0], max: 1.5 },
    seaTemp: { best: [20, 23], good: [18, 24], min: 16, max: 27 },
    moon: { best: 'half', good: 'crescent' },
    timeOfDay: { best: ['morning'], good: ['night', 'evening'] },
    spotType: { best: ['rock', 'pier'], good: ['port'], ok: ['park'] },
    shelterPref: 'medium',
    // タコ特有フラグ
    takoMode: true,
    tidalBonus: { '大潮': -10, '中潮': 0, '小潮': 8, '若潮': 8, '長潮': 5 },
    slackTideBonus: 5,
    rainPenalty: -15,
    lightRainPenalty: -5,
    season: [5, 6, 7, 8, 9, 10],
    peakMonths: [6, 7, 8],
    notes: '底生。真水を嫌う。大雨後は河口付近を避ける。潮止まり前後がチャンス。漁業権に注意。'
  },
  chinu: {
    name: 'チヌ', icon: 'img/fish/chinu.png', emoji: '🐟',
    tide: { best: ['上げ三分', '下げ七分', '潮止まり'], good: ['上げ潮中盤', '下げ潮中盤'], bad: [] },
    pressure: { best: [1005, 1015], good: [1000, 1020], ok: [995, 1025] },
    wind: { best: [2, 5], good: [0, 8], max: 8 },
    wave: { best: [0.3, 1.0], good: [0, 1.5], max: 2.0 },
    seaTemp: { best: [15, 25], good: [12, 28], min: 10, max: 30 },
    moon: { best: 'any', good: 'any' },
    timeOfDay: { best: ['morning', 'evening', 'night'], good: ['daytime'] },
    spotType: { best: ['pier', 'port'], good: ['rock', 'river'], ok: ['park'] },
    shelterPref: 'high',
    // チヌ特有フラグ
    chinuMode: true,
    tidalBonus: { '大潮': 5, '中潮': 5, '小潮': -3, '若潮': -3, '長潮': -5 },
    rainBonus: 8,
    turbidityBonus: 10,
    clearWaterPenalty: -3,
    season: [3, 4, 5, 6, 7, 8, 9, 10, 11],
    peakMonths: [4, 5, 6, 9, 10],
    notes: '濁りと変化を好む。雨後がチャンス。向かい風プラス。堤防際・テトラ・河口が好ポイント。夜釣りも有効。'
  },
  madai: {
    name: 'マダイ', icon: 'img/fish/madai.png', emoji: '🐟',
    tide: { best: ['上げ七分', '下げ三分'], good: ['上げ潮中盤', '下げ潮中盤'], bad: ['潮止まり'] },
    pressure: { best: [1008, 1018], good: [1003, 1023], ok: [998, 1028] },
    wind: { best: [0, 2], good: [2, 5], max: 5 },
    wave: { best: [0.3, 1.0], good: [0, 1.5], max: 2.0 },
    seaTemp: { best: [15, 22], good: [13, 26], min: 11, max: 28 },
    moon: { best: 'full', good: 'half' },
    timeOfDay: { best: ['morning'], good: ['evening', 'daytime'] },
    spotType: { best: ['rock', 'pier'], good: ['port'], ok: ['surf'] },
    shelterPref: 'low',
    // マダイ特有フラグ
    madaiMode: true,
    tidalBonus: { '大潮': 10, '中潮': 7, '小潮': -5, '若潮': -5, '長潮': -8 },
    rainPenalty: -10,
    clearWaterBonus: 5,
    season: [3, 4, 5, 6, 9, 10, 11, 12],
    peakMonths: [4, 5, 10, 11],
    notes: '澄み潮と速い潮流を好む。雨・濁りを嫌う（チヌと正反対）。潮目・カケアガリが好ポイント。朝マズメがゴールデンタイム。'
  }
};

const FISH_COLORS = {
  aji: '#4FC3F7',
  saba: '#29B6F6',
  aori: '#AB47BC',
  hirame: '#FFA726',
  hata: '#EF5350',
  gasira: '#8D6E63',
  aomono: '#66BB6A',
  tako: '#E91E63',
  chinu: '#607D8B',
  madai: '#FF5252'
};

const FISH_IDS = Object.keys(FISH_PROFILES);
