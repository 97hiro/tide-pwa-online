// ==================== ports-data.js ====================
// 漁港・釣りスポットデータ、基準港調和定数、アメダス・予報マッピング
// =====================================================

// 基準港の調和定数 (振幅cm, 位相°)
// 分潮: M2, S2, K1, O1, N2, SA, K2, P1
const REF_PORTS = {
  osaka: {
    lat: 34.6500, lon: 135.4290,
    M2: [38.0, 225], S2: [16.5, 260], K1: [22.5, 190], O1: [17.0, 170],
    N2: [8.0, 210], SA: [8.5, 75], K2: [4.5, 260], P1: [7.5, 188]
  },
  wakayama: {
    lat: 34.2200, lon: 135.1580,
    M2: [40.5, 230], S2: [17.5, 268], K1: [23.0, 192], O1: [17.5, 172],
    N2: [8.5, 215], SA: [8.0, 72], K2: [4.8, 268], P1: [7.6, 190]
  },
  kainan: {
    lat: 34.1530, lon: 135.2030,
    M2: [42.0, 233], S2: [18.0, 272], K1: [23.2, 193], O1: [17.8, 173],
    N2: [8.8, 218], SA: [7.8, 70], K2: [4.9, 272], P1: [7.7, 191]
  },
  yuasa: {
    lat: 34.0320, lon: 135.1780,
    M2: [44.0, 238], S2: [19.0, 278], K1: [23.5, 195], O1: [18.0, 175],
    N2: [9.2, 222], SA: [7.5, 68], K2: [5.2, 278], P1: [7.8, 193]
  },
  gobo: {
    lat: 33.8610, lon: 135.1660,
    M2: [46.5, 245], S2: [20.0, 285], K1: [24.0, 198], O1: [18.5, 178],
    N2: [9.8, 228], SA: [7.2, 65], K2: [5.5, 285], P1: [8.0, 196]
  },
  tanabe: {
    lat: 33.7260, lon: 135.3770,
    M2: [50.0, 250], S2: [21.5, 292], K1: [24.5, 200], O1: [19.0, 180],
    N2: [10.5, 232], SA: [7.0, 62], K2: [5.8, 292], P1: [8.1, 198]
  },
  shirahama: {
    lat: 33.6830, lon: 135.3440,
    M2: [52.0, 252], S2: [22.0, 295], K1: [24.8, 201], O1: [19.2, 181],
    N2: [10.8, 234], SA: [6.8, 60], K2: [6.0, 295], P1: [8.2, 199]
  },
  kushimoto: {
    lat: 33.4730, lon: 135.7720,
    M2: [55.0, 260], S2: [23.0, 305], K1: [25.0, 205], O1: [19.5, 185],
    N2: [11.5, 240], SA: [6.5, 55], K2: [6.3, 305], P1: [8.3, 203]
  },
  katsuura: {
    lat: 33.6310, lon: 135.9430,
    M2: [52.5, 255], S2: [22.0, 300], K1: [24.5, 203], O1: [19.0, 183],
    N2: [11.0, 237], SA: [6.3, 52], K2: [6.0, 300], P1: [8.1, 201]
  },
  shingu: {
    lat: 33.7270, lon: 136.0050,
    M2: [50.0, 252], S2: [21.0, 296], K1: [24.0, 202], O1: [18.5, 182],
    N2: [10.5, 234], SA: [6.0, 50], K2: [5.7, 296], P1: [7.9, 200]
  },
  maizuru: {
    lat: 35.4730, lon: 135.3870,
    M2: [12.0, 90], S2: [4.5, 130], K1: [10.5, 290], O1: [8.0, 270],
    N2: [2.5, 75], SA: [9.0, 85], K2: [1.2, 130], P1: [3.5, 288]
  },
  miyazu: {
    lat: 35.5340, lon: 135.1950,
    M2: [11.5, 88], S2: [4.2, 128], K1: [10.2, 288], O1: [7.8, 268],
    N2: [2.4, 73], SA: [9.2, 83], K2: [1.1, 128], P1: [3.4, 286]
  },
  tango: {
    lat: 35.7460, lon: 135.0400,
    M2: [10.5, 85], S2: [3.8, 125], K1: [9.8, 285], O1: [7.5, 265],
    N2: [2.2, 70], SA: [9.5, 80], K2: [1.0, 125], P1: [3.2, 283]
  }
};

// 全釣りスポットデータ
// [name, city, prefKey, lat, lon, ref1, ref2, weight, forecastArea, forecastSub, facing, shelter, type, toilet, parking, hasBanInfo]
// type: 'port'=漁港, 'rock'=地磯, 'surf'=サーフ, 'river'=河口, 'pier'=波止, 'park'=釣り公園
// prefKey: 'wakayama'|'osaka'|'kyoto'|'hyogo'
// facing: 港の開口方向 (0=北,90=東,180=南,270=西)
// shelter: 遮蔽度 (0.0=外洋露出, 1.0=完全湾奥)
// toilet: true=あり, false=なし, null/undefined=不明
// parking: true=あり, false=なし, null/undefined=不明
// hasBanInfo: true=釣り禁止情報あり
const PORTS = [
  // ==================== 和歌山県 ====================
  // --- 和歌山市 --- (紀伊水道西岸)
  ["田ノ浦漁港","和歌山市","wakayama",34.1834,135.1527,"wakayama",null,1,"300000","300010",270,0.4,"port",true,true],
  ["雑賀崎漁港","和歌山市","wakayama",34.186,135.138,"wakayama",null,1,"300000","300010",250,0.3,"port",true,true],
  ["和歌浦漁港","和歌山市","wakayama",34.1863,135.1639,"wakayama",null,1,"300000","300010",315,0.6,"port",true,true],
  // --- 海南市 ---
  ["塩津漁港","海南市","wakayama",34.1356,135.169,"kainan",null,1,"300000","300010",270,0.5,"port",true,true],
  ["戸坂漁港","海南市","wakayama",34.1364,135.1586,"kainan",null,1,"300000","300010",260,0.4,"port",true,true],
  // --- 有田市 ---
  ["初島漁港","有田市","wakayama",34.0975,135.1064,"kainan","yuasa",0.5,"300000","300010",270,0.3,"port",true,true],
  ["矢櫃漁港","有田市","wakayama",34.0687,135.0909,"kainan","yuasa",0.55,"300000","300010",260,0.4,"port",true,true],
  ["逢井漁港","有田市","wakayama",34.0713,135.0959,"kainan","yuasa",0.6,"300000","300010",265,0.35,"port",true,true],
  ["千田漁港","有田市","wakayama",34.0639,135.1356,"kainan","yuasa",0.6,"300000","300010",280,0.5,"port",true,true],
  ["箕島漁港","有田市","wakayama",34.0763,135.0189,"kainan","yuasa",0.45,"300000","300010",300,0.6,"port",true,true],
  // --- 湯浅町 ---
  ["田村漁港","湯浅町","wakayama",34.0536,135.1471,"yuasa",null,1,"300000","300010",270,0.5,"port",true,true],
  ["栖原漁港","湯浅町","wakayama",34.041,135.1618,"yuasa",null,1,"300000","300010",260,0.45,"port",true,true],
  // --- 広川町 ---
  ["唐尾漁港","広川町","wakayama",34.0072,135.145,"yuasa","gobo",0.8,"300000","300010",265,0.4,"port",true,true],
  ["鈴子漁港","広川町","wakayama",34.0234,135.1302,"yuasa","gobo",0.75,"300000","300010",245,0.35,"port"],
  // --- 由良町 --- (紀伊水道南部、外洋へ移行)
  ["三尾川漁港","由良町","wakayama",33.9446,135.1126,"yuasa","gobo",0.6,"300000","300010",260,0.35,"port",null,true],
  ["戸津井漁港","由良町","wakayama",33.9892,135.0921,"yuasa","gobo",0.55,"300000","300010",255,0.3,"port",true,true],
  ["小引漁港","由良町","wakayama",33.9821,135.0897,"yuasa","gobo",0.5,"300000","300010",250,0.25,"port",true,true],
  ["大引漁港","由良町","wakayama",33.9686,135.0841,"yuasa","gobo",0.45,"300000","300010",240,0.2,"port",true,true],
  ["衣奈漁港","由良町","wakayama",33.9896,135.1075,"yuasa","gobo",0.4,"300000","300010",235,0.25,"port",true,true],
  // --- 日高町 ---
  ["小浦漁港","日高町","wakayama",33.9261,135.0744,"gobo",null,1,"300000","300010",260,0.3,"port",true,true],
  ["津久野漁港","日高町","wakayama",33.924,135.079,"gobo",null,1,"300000","300010",255,0.25,"port"],
  ["比井漁港","日高町","wakayama",33.9179,135.0816,"gobo",null,1,"300000","300010",250,0.35,"port",true,true],
  ["産湯漁港","日高町","wakayama",33.9118,135.0815,"gobo",null,1,"300000","300010",260,0.3,"port",true,true],
  ["田杭漁港","日高町","wakayama",33.8947,135.0643,"gobo",null,1,"300000","300010",265,0.3,"port",true],
  ["阿尾漁港","日高町","wakayama",33.9046,135.0761,"gobo",null,1,"300000","300010",270,0.35,"port",true,true],
  // --- 美浜町 ---
  ["三尾漁港","美浜町","wakayama",33.8879,135.0827,"gobo",null,1,"300000","300010",235,0.3,"port",true,true],
  ["本ノ脇漁港","美浜町","wakayama",33.875,135.135,"gobo",null,1,"300000","300010",260,0.35,"port"],
  // --- 御坊市 ---
  ["祓井戸漁港","御坊市","wakayama",33.8514,135.1657,"gobo",null,1,"300000","300010",265,0.45,"port",true,true],
  ["野島漁港","御坊市","wakayama",33.8431,135.1684,"gobo",null,1,"300000","300010",240,0.3,"port"],
  ["加尾漁港","御坊市","wakayama",33.8386,135.1741,"gobo",null,1,"300000","300010",260,0.35,"port",true,true],
  ["上野漁港","御坊市","wakayama",33.8258,135.1836,"gobo",null,1,"300000","300010",270,0.4,"port",true,true],
  ["下楠井漁港","御坊市","wakayama",33.8159,135.1944,"gobo",null,1,"300000","300010",265,0.35,"port",true,true],
  ["塩屋漁港","御坊市","wakayama",33.863,135.1567,"gobo",null,1,"300000","300010",250,0.3,"port",true,true],
  // --- 印南町 --- (南向きへ変わり始め)
  ["津井漁港","印南町","wakayama",33.8117,135.2051,"gobo","tanabe",0.75,"300000","300010",250,0.3,"port",true,true],
  ["印南漁港","印南町","wakayama",33.812,135.2164,"gobo","tanabe",0.7,"300000","300010",225,0.45,"port",true,true],
  ["切目漁港","印南町","wakayama",33.7807,135.2392,"gobo","tanabe",0.65,"300000","300010",210,0.35,"port",true],
  ["島田漁港","印南町","wakayama",33.8125,135.0784,"gobo","tanabe",0.6,"300000","300010",200,0.3,"port",false,false],
  // --- みなべ町 ---
  ["岩代漁港","みなべ町","wakayama",33.7782,135.2819,"gobo","tanabe",0.45,"300000","300020",195,0.35,"port",true,true],
  ["大目津漁港","みなべ町","wakayama",33.9004,135.2731,"gobo","tanabe",0.4,"300000","300020",200,0.3,"port"],
  ["南部漁港","みなべ町","wakayama",33.7491,135.3184,"gobo","tanabe",0.35,"300000","300020",220,0.5,"port"],
  ["堺漁港","みなべ町","wakayama",33.7435,135.3328,"gobo","tanabe",0.3,"300000","300020",195,0.45,"port",true,true],
  // --- 田辺市 --- (田辺湾)
  ["芳養漁港","田辺市","wakayama",33.7423,135.3535,"tanabe",null,1,"300000","300020",195,0.5,"port",true,true],
  ["目良漁港","田辺市","wakayama",33.7321,135.3534,"tanabe",null,1,"300000","300020",190,0.6,"port"],
  ["田辺漁港","田辺市","wakayama",33.728,135.37,"tanabe",null,1,"300000","300020",185,0.7,"port"],
  ["内の浦漁港","田辺市","wakayama",33.6943,135.387,"tanabe",null,1,"300000","300020",210,0.55,"port"],
  // --- 白浜町 --- (外洋側)
  ["堅田漁港","白浜町","wakayama",33.6836,135.3742,"tanabe","shirahama",0.6,"300000","300020",195,0.4,"port",true],
  ["綱不知漁港","白浜町","wakayama",33.6868,135.3568,"tanabe","shirahama",0.5,"300000","300020",200,0.35,"port"],
  ["江津良漁港","白浜町","wakayama",33.5858,135.3335,"shirahama",null,1,"300000","300020",190,0.25,"port",true],
  ["瀬戸漁港","白浜町","wakayama",33.8867,135.0243,"shirahama",null,1,"300000","300020",225,0.3,"port",true,true],
  ["湯崎漁港","白浜町","wakayama",33.6767,135.3386,"shirahama",null,1,"300000","300020",200,0.2,"port",true,true],
  ["鴨居漁港","白浜町","wakayama",33.678,135.35,"shirahama",null,1,"300000","300020",185,0.35,"port"],
  ["安久川漁港","白浜町","wakayama",33.6174,135.3241,"shirahama",null,1,"300000","300020",195,0.3,"port"],
  ["中漁港","白浜町","wakayama",33.66,135.37,"shirahama",null,1,"300000","300020",200,0.3,"port"],
  ["袋漁港","白浜町","wakayama",33.6284,135.397,"shirahama","kushimoto",0.85,"300000","300020",190,0.35,"port",true,true],
  ["朝来帰漁港","白浜町","wakayama",33.6086,135.3914,"shirahama","kushimoto",0.8,"300000","300020",170,0.25,"port",false,true],
  ["市江漁港","白浜町","wakayama",33.5862,135.4031,"shirahama","kushimoto",0.7,"300000","300020",185,0.2,"port",true,true],
  ["笠甫漁港","白浜町","wakayama",33.5795,135.4175,"shirahama","kushimoto",0.6,"300000","300020",190,0.2,"port",false],
  ["伊古木漁港","白浜町","wakayama",33.5519,135.459,"shirahama","kushimoto",0.5,"300000","300020",195,0.15,"port"],
  // --- すさみ町 --- (外洋)
  ["口和深漁港","すさみ町","wakayama",33.5231,135.575,"shirahama","kushimoto",0.4,"300000","300020",180,0.25,"port",true,true],
  ["周参見漁港","すさみ町","wakayama",33.5489,135.4548,"shirahama","kushimoto",0.38,"300000","300020",185,0.4,"port"],
  ["見老津漁港","すさみ町","wakayama",33.5107,135.5774,"shirahama","kushimoto",0.3,"300000","300020",175,0.2,"port",null,true],
  ["江須ノ川漁港","すさみ町","wakayama",33.5065,135.5898,"shirahama","kushimoto",0.25,"300000","300020",180,0.2,"port"],
  ["江住漁港","すさみ町","wakayama",33.5086,135.6078,"shirahama","kushimoto",0.2,"300000","300020",165,0.25,"port",true,true],
  ["里野漁港","すさみ町","wakayama",33.5489,135.4198,"shirahama","kushimoto",0.18,"300000","300020",160,0.2,"port",true,false],
  // --- 串本町 (西側 — 南向き) ---
  ["舟波漁港","串本町","wakayama",33.4973,135.5902,"kushimoto",null,1,"300000","300020",175,0.2,"port"],
  ["安指漁港","串本町","wakayama",33.4903,135.6734,"kushimoto",null,1,"300000","300020",180,0.25,"port",true,true],
  ["田子漁港","串本町","wakayama",33.482,135.67,"kushimoto",null,1,"300000","300020",185,0.3,"port",true,true],
  ["江田漁港","串本町","wakayama",33.4924,135.6677,"kushimoto",null,1,"300000","300020",180,0.2,"port"],
  ["野凪漁港","串本町","wakayama",33.4801,135.7567,"kushimoto",null,1,"300000","300020",175,0.15,"port"],
  ["田並漁港","串本町","wakayama",33.4865,135.7088,"kushimoto",null,1,"300000","300020",180,0.3,"port",true,true],
  ["須賀漁港","串本町","wakayama",33.4728,135.7625,"kushimoto",null,1,"300000","300020",185,0.25,"port",true,false],
  // --- 串本町 (先端 — 南→東へ変化) ---
  ["菖蒲谷漁港","串本町","wakayama",33.4979,135.6708,"kushimoto",null,1,"300000","300020",170,0.2,"port"],
  ["黒島漁港","串本町","wakayama",33.4822,135.7625,"kushimoto",null,1,"300000","300020",155,0.2,"port",true,true],
  ["船瀬漁港","串本町","wakayama",33.4653,135.7559,"kushimoto",null,1,"300000","300020",135,0.3,"port",true,true],
  ["串本漁港","串本町","wakayama",33.4674,135.7834,"kushimoto",null,1,"300000","300020",120,0.5,"port",true,true],
  ["出雲漁港","串本町","wakayama",33.4748,135.7796,"kushimoto",null,1,"300000","300020",100,0.35,"port"],
  ["橋杭漁港","串本町","wakayama",33.4753,135.7625,"kushimoto",null,1,"300000","300020",95,0.2,"port"],
  ["大島漁港","串本町","wakayama",33.471,135.7848,"kushimoto",null,1,"300000","300020",180,0.3,"port"],
  ["動鳴気漁港","串本町","wakayama",33.4801,135.7632,"kushimoto",null,1,"300000","300020",100,0.15,"port",true,true],
  ["樫野漁港","串本町","wakayama",33.4719,135.8492,"kushimoto","katsuura",0.85,"300000","300020",90,0.1,"port"],
  ["有田漁港","串本町","wakayama",33.4839,135.7363,"kushimoto",null,1,"300000","300020",115,0.3,"port",true,true],
  // --- 串本町 (東側 — 東向き) ---
  ["阿野木漁港","串本町","wakayama",33.4748,135.7949,"kushimoto","katsuura",0.8,"300000","300020",85,0.25,"port",true,true],
  ["須江漁港","串本町","wakayama",33.4788,135.7625,"kushimoto","katsuura",0.75,"300000","300020",70,0.4,"port",null,true],
  ["白野漁港","串本町","wakayama",33.4553,135.8226,"kushimoto","katsuura",0.7,"300000","300020",60,0.3,"port"],
  ["姫漁港","串本町","wakayama",33.52,135.84,"kushimoto","katsuura",0.6,"300000","300020",75,0.35,"port",true,true],
  ["伊串漁港","串本町","wakayama",33.5024,135.8075,"kushimoto","katsuura",0.5,"300000","300020",70,0.3,"port",false],
  ["津荷漁港","串本町","wakayama",33.5168,135.8432,"kushimoto","katsuura",0.4,"300000","300020",80,0.25,"port",true],
  ["下田原漁港","串本町","wakayama",33.5323,135.8738,"kushimoto","katsuura",0.3,"300000","300020",85,0.3,"port"],
  // --- 那智勝浦町 ---
  ["小金島漁港","那智勝浦町","wakayama",33.58,135.89,"katsuura",null,1,"300000","300020",95,0.25,"port",true,true],
  ["勝浦漁港","那智勝浦町","wakayama",33.631,135.943,"katsuura",null,1,"300000","300020",170,0.7,"port",true,true],
  ["那智漁港","那智勝浦町","wakayama",33.6447,135.9414,"katsuura","shingu",0.7,"300000","300020",100,0.4,"port",true,true],
  ["宇久井漁港","那智勝浦町","wakayama",33.6612,135.9767,"katsuura","shingu",0.6,"300000","300020",110,0.45,"port",true,true],
  // --- 太地町 ---
  ["太地漁港","太地町","wakayama",33.592,135.943,"katsuura",null,1,"300000","300020",105,0.6,"port",true,true],
  // --- 新宮市 ---
  ["三輪崎漁港","新宮市","wakayama",33.6834,135.989,"shingu",null,1,"300000","300020",95,0.3,"port",true,true],

  // --- 和歌山 新規: 地磯 ---
  ["番所庭園","和歌山市","wakayama",34.1907,135.1385,"wakayama",null,1,null,null,225,0.15,"rock",true,true],
  ["加太磯","和歌山市","wakayama",34.2854,134.9982,"wakayama",null,1,null,null,240,0.1,"rock"],
  ["天神崎","田辺市","wakayama",33.7262,135.3569,"tanabe",null,1,null,null,210,0.1,"rock",true,true],
  ["三段壁","白浜町","wakayama",33.6315,135.3952,"shirahama",null,1,null,null,225,0.05,"rock",true,true],
  ["日ノ御埼","日高町","wakayama",33.882,135.0598,"gobo",null,1,null,null,225,0.05,"rock",true,true],
  ["潮岬","串本町","wakayama",33.4332,135.7274,"kushimoto",null,1,null,null,180,0.05,"rock",true,true],
  ["双子島","串本町","wakayama",33.4765,135.7577,"kushimoto",null,1,null,null,180,0.1,"rock",false],
  ["橋杭岩","串本町","wakayama",33.4881,135.7607,"kushimoto",null,1,null,null,95,0.05,"rock",true,true],
  ["黒島磯","すさみ町","wakayama",33.5438,135.4256,"kushimoto",null,1,null,null,180,0.05,"rock"],
  ["地ノ島","有田市","wakayama",34.1056,135.0933,"yuasa",null,1,null,null,240,0.1,"rock",true,true],

  // --- 和歌山 新規: サーフ ---
  ["磯ノ浦","和歌山市","wakayama",34.2584,135.093,"wakayama",null,1,null,null,270,0.05,"surf",true,true],
  ["片男波","和歌山市","wakayama",34.1755,135.176,"wakayama",null,1,null,null,225,0.1,"surf",true,true],
  ["浪早ビーチ","和歌山市","wakayama",34.1878,135.1498,"wakayama",null,1,null,null,250,0.15,"surf",true,true],
  ["煙樹ヶ浜","美浜町","wakayama",33.889,135.135,"gobo",null,1,null,null,240,0.05,"surf",true,true],
  ["切目浜","印南町","wakayama",33.7962,135.235,"gobo",null,1,null,null,225,0.05,"surf",true,true],
  ["千里浜","みなべ町","wakayama",33.7701,135.2956,"tanabe",null,1,null,null,210,0.05,"surf",true,true],
  ["白良浜","白浜町","wakayama",33.6817,135.2744,"shirahama",null,1,null,null,200,0.15,"surf",true,true],
  ["臨海浦","白浜町","wakayama",33.6939,135.3317,"shirahama",null,1,null,null,210,0.1,"surf",true,true],

  // --- 和歌山 新規: 河口 ---
  ["紀の川河口","和歌山市","wakayama",34.232,135.128,"wakayama",null,1,null,null,270,0.3,"river",true,true],
  ["有田川河口","有田市","wakayama",34.0794,135.0911,"yuasa",null,1,null,null,270,0.3,"river",false,true],
  ["日高川河口","御坊市","wakayama",33.8761,135.1532,"gobo",null,1,null,null,240,0.3,"river",true,true],
  ["富田川河口","白浜町","wakayama",33.638,135.3945,"shirahama",null,1,null,null,195,0.3,"river",true,true],
  ["日置川河口","白浜町","wakayama",33.5644,135.4482,"shirahama",null,1,null,null,195,0.3,"river",true,true],
  ["古座川河口","串本町","wakayama",33.4822,135.7625,"kushimoto",null,1,null,null,90,0.35,"river",true,true],
  ["太田川河口","白浜町","wakayama",33.5765,135.926,"shirahama",null,1,null,null,195,0.3,"river",true,true],

  // --- 和歌山 新規: 波止 ---
  ["加太大波止","和歌山市","wakayama",34.2774,135.0696,"wakayama",null,1,null,null,225,0.35,"pier",true,true],
  ["青岸","和歌山市","wakayama",34.217,135.1255,"wakayama",null,1,null,null,270,0.4,"pier",true,false],
  ["小浦一文字","日高町","wakayama",33.9382,135.0471,"gobo",null,1,null,null,240,0.2,"pier",true],
  ["下津大波止","海南市","wakayama",34.1513,135.1631,"kainan",null,1,null,null,270,0.35,"pier"],
  ["海南赤灯台","海南市","wakayama",34.1144,135.1399,"kainan",null,1,null,null,270,0.3,"pier"],
  ["田辺新大波止","田辺市","wakayama",33.722,135.3604,"tanabe",null,1,null,null,195,0.45,"pier"],
  ["勝浦新大波止","那智勝浦町","wakayama",33.6332,135.9432,"katsuura",null,1,null,null,170,0.5,"pier"],

  // --- 和歌山 新規: 釣り公園 ---
  ["マリーナシティ海釣り公園","海南市","wakayama",34.1512,135.1792,"kainan",null,1,null,null,260,0.45,"park",true,true,false],
  ["由良海つり公園","由良町","wakayama",33.958,135.113,"yuasa",null,1,null,null,230,0.4,"park",true,true],
  ["下津ピアーランド","海南市","wakayama",34.1383,135.144,"kainan",null,1,null,null,260,0.4,"park",null,true],
  ["和歌山北港魚つり公園","和歌山市","wakayama",34.2303,135.1047,"wakayama",null,1,null,null,270,0.45,"park",true],

  // ==================== 大阪府 ==================== (大阪湾西向き、南へ行くほど開放的)
  ["大阪港","大阪市","osaka",34.6536,135.4319,"osaka",null,1,"270000","270000",200,0.9,"port",true],
  ["堺泉北港","堺市〜泉大津市","osaka",34.5941,135.3967,"osaka",null,1,"270000","270000",240,0.85,"port"],
  ["堺出島漁港","堺市","osaka",34.5757,135.4578,"osaka",null,1,"270000","270000",230,0.8,"port",null,true],
  ["石津漁港","堺市","osaka",34.5553,135.4259,"osaka",null,1,"270000","270000",240,0.8,"port"],
  ["高石漁港","高石市","osaka",34.5299,135.4308,"osaka",null,1,"270000","270000",255,0.75,"port",true,true],
  ["忠岡港","忠岡町","osaka",34.489,135.3963,"osaka",null,1,"270000","270000",265,0.75,"port",true,false], // 要確認: 座標
  ["泉大津港","泉大津市","osaka",34.5061,135.3984,"osaka",null,1,"270000","270000",265,0.7,"port",true,true], // 要確認: 座標
  ["岸和田漁港","岸和田市","osaka",34.4662,135.3698,"osaka",null,1,"270000","270000",270,0.65,"port",false], // 要確認: 座標
  ["貝塚港","貝塚市","osaka",34.4501,135.3379,"osaka",null,1,"270000","270000",270,0.6,"port",false,true,false], // 要確認: 座標
  ["佐野漁港","泉佐野市","osaka",34.412,135.322,"osaka","wakayama",0.8,"270000","270000",275,0.55,"port",null,true], // 要確認: 座標
  ["田尻漁港","田尻町","osaka",34.4003,135.2887,"osaka","wakayama",0.75,"270000","270000",275,0.5,"port",true,true], // 要確認: 座標
  ["岡田漁港","泉南市","osaka",34.3896,135.2739,"osaka","wakayama",0.7,"270000","270000",280,0.45,"port",true,true],
  ["樽井漁港","泉南市","osaka",34.378,135.248,"osaka","wakayama",0.65,"270000","270000",285,0.4,"port",true,false,false],
  ["西鳥取漁港","阪南市","osaka",34.3551,135.2295,"osaka","wakayama",0.6,"270000","270000",290,0.4,"port",false,true],
  ["下荘漁港","阪南市","osaka",34.3437,135.2073,"osaka","wakayama",0.55,"270000","270000",295,0.35,"port",true,true,false],
  ["淡輪漁港","岬町","osaka",34.328,135.17,"osaka","wakayama",0.5,"270000","270000",310,0.35,"port",true,true],
  ["深日漁港","岬町","osaka",34.3197,135.1419,"osaka","wakayama",0.4,"270000","270000",169,0.3,"port",true,true],
  ["小島漁港","岬町","osaka",34.31,135.13,"osaka","wakayama",0.35,"270000","270000",315,0.25,"port",true,true,false],

  // --- 大阪 新規: 波止 ---
  ["かもめ大橋","大阪市","osaka",34.6118,135.4213,"osaka",null,1,null,null,195,0.5,"pier",false,false,false], // 要確認: 座標
  ["シーサイドコスモ","大阪市","osaka",34.6386,135.4027,"osaka",null,1,null,null,185,0.55,"pier",true,true,false],
  ["舞洲","大阪市","osaka",34.663,135.401,"osaka",null,1,null,null,175,0.5,"pier",true,true,false], // 要確認: 座標
  ["汐見埠頭","泉大津市","osaka",34.505,135.375,"osaka",null,1,null,null,240,0.6,"pier",false,true,false],
  ["貝塚人工島","貝塚市","osaka",34.4557,135.3321,"osaka",null,1,null,null,270,0.28,"pier",false,true,false],
  ["岸和田一文字","岸和田市","osaka",34.4863,135.3651,"osaka",null,1,null,null,270,0.25,"pier",true],
  ["忠岡一文字","忠岡町","osaka",34.4931,135.3696,"osaka",null,1,null,null,260,0.25,"pier"],
  ["助松埠頭","泉大津市","osaka",34.5112,135.3812,"osaka",null,1,null,null,260,0.55,"pier",false,true,false],
  ["大浜埠頭","堺市","osaka",34.568,135.455,"osaka",null,1,null,null,225,0.6,"pier",true,true,false],
  ["夢洲","大阪市","osaka",34.6529,135.3905,"osaka",null,1,null,null,200,0.5,"pier",null,true,false], // 要確認: 座標
  ["咲洲","大阪市","osaka",34.63,135.42,"osaka",null,1,null,null,190,0.55,"pier",null,true],
  ["泉佐野食品コンビナート","泉佐野市","osaka",34.4311,135.3231,"osaka",null,1,null,null,280,0.5,"pier",true,true,false],
  ["りんくう公園","泉佐野市","osaka",34.4144,135.2937,"osaka",null,1,null,null,285,0.4,"pier",true,true,false],
  ["岬公園","岬町","osaka",34.3321,135.1644,"osaka",null,1,null,null,225,0.35,"pier",true],
  ["多奈川護岸","岬町","osaka",34.3175,135.0801,"osaka",null,1,null,null,215,0.3,"pier"],
  ["平林貯木場","大阪市","osaka",34.6164,135.4561,"osaka",null,1,null,null,195,0.6,"pier",null,null,true],
  ["泉佐野旧港","泉佐野市","osaka",34.4144,135.2994,"osaka",null,1,null,null,275,0.55,"pier"],
  ["岸和田旧港","岸和田市","osaka",34.46,135.3717,"osaka",null,1,null,null,270,0.55,"pier"], // 要確認: 座標
  ["大阪北港","大阪市","osaka",34.6678,135.4079,"osaka",null,1,null,null,175,0.55,"pier",true,true], // 要確認: 座標
  // --- 大阪 新規: 釣り公園 ---
  ["大阪南港魚つり園","大阪市","osaka",34.6112,135.3934,"osaka",null,1,null,null,195,0.5,"park",true,true,false],
  ["とっとパーク小島","岬町","osaka",34.3164,135.0986,"osaka",null,1,null,null,215,0.35,"park",true,true,false],

  // --- 大阪 新規: 河口 ---
  ["淀川河口","大阪市","osaka",34.6875,135.4184,"osaka",null,1,null,null,170,0.35,"river",true,true],
  ["大和川河口","堺市","osaka",34.595,135.468,"osaka",null,1,null,null,220,0.3,"river",null,true],
  ["石津川河口","堺市","osaka",34.5252,135.4708,"osaka",null,1,null,null,230,0.3,"river"],
  ["大津川河口","泉大津市","osaka",34.5015,135.3777,"osaka",null,1,null,null,260,0.3,"river",true,false,false],
  ["近木川河口","貝塚市","osaka",34.447,135.3014,"osaka",null,1,null,null,270,0.3,"river"],
  ["男里川河口","泉南市","osaka",34.3674,135.2513,"osaka",null,1,null,null,280,0.3,"river"],
  ["樫井川河口","泉佐野市","osaka",34.3827,135.2324,"osaka",null,1,null,null,275,0.3,"river",true,true],

  // --- 大阪 新規: サーフ ---
  ["りんくうビーチ","田尻町","osaka",34.3825,135.2645,"osaka",null,1,null,null,280,0.1,"surf",true,true],
  ["二色の浜","貝塚市","osaka",34.4335,135.3397,"osaka",null,1,null,null,270,0.1,"surf",true,true], // 要確認: 座標
  ["淡輪ビーチ","岬町","osaka",34.3367,135.1882,"osaka",null,1,null,null,310,0.1,"surf"], // 要確認: 座標
  ["箱作ビーチ","阪南市","osaka",34.3413,135.2008,"osaka",null,1,null,null,300,0.1,"surf"], // 要確認: 座標
  ["泉南マーブルビーチ","泉南市","osaka",34.3845,135.2505,"osaka",null,1,null,null,285,0.1,"surf",true,true],
  // --- 大阪 新規: スクレイピング追加 ---
  ["南港大橋下","","osaka",34.6670632,135.5333073,"osaka",null,1,null,null,185,0.4,"port",false,false,false],
  ["常吉大橋下","","osaka",34.7368501,135.560202,"osaka",null,1,null,null,281,0,"pier",false,false,false],
  ["夢舞大橋下","","osaka",34.6611385,135.3995733,"osaka",null,1,null,null,11,0.44,"pier",true,true,false],
  ["海とのふれあい広場","","osaka",34.601918,135.4283902,"osaka",null,1,null,null,180,0.63,"pier",true,true,false],
  ["花市場前","","osaka",34.6867167,135.1945794,"osaka",null,1,null,null,247,0.08,"pier",true,true,false],
  ["なぎさ公園","","osaka",34.5100034,135.4049064,"osaka",null,1,null,null,301,0.4,"park",true,true,false],
  ["大津川尻","","osaka",34.2677167,135.310292,"osaka",null,1,null,null,318,0.3,"river",false,false,false],
  ["大津川水銀灯","","osaka",34.51,135.405,"osaka",null,1,null,null,301,0,"pier",false,false,false],
  ["ホクシン前","","osaka",34.490243,135.3703426,"osaka",null,1,null,null,68,0.75,"pier",false,false,false],
  ["阪南港木材整理場","","osaka",34.4833037,135.3725774,"osaka",null,1,null,null,135,0.88,"port",false,false,true],
  ["深日港","","osaka",34.3206,135.1384,"osaka",null,1,null,null,169,0.4,"port",true,true,false],
  ["みさき公園裏","","osaka",34.3324717,135.1654553,"osaka",null,1,null,null,135,0.5,"park",true,false,false],
  ["泉大津人工島","","osaka",34.4958,135.3712,"osaka",null,1,null,null,301,0,"pier",true,true,false],
  ["泉佐野・前島（旧フェリー乗り場）","","osaka",34.4130619,135.3040581,"osaka",null,1,null,null,313,0.17,"pier",false,false,false],
  ["海釣ポート田尻","","osaka",34.4003049,135.2887368,"osaka",null,1,null,null,101,0.56,"pier",true,true,false],
  ["尾崎漁港","","osaka",34.3622095,135.2429496,"osaka",null,1,null,null,326,0.4,"port",true,true,false],
  ["観音崎・谷川港","","osaka",34.315,135.135,"osaka",null,1,null,null,340,0.4,"port",true,true,false],
  ["汐見公園","","osaka",34.509345,135.382281,"osaka",null,1,null,null,301,0.4,"park",true,false,false],
  ["せんなん里海公園","","osaka",34.3393218,135.2080013,"osaka",null,1,null,null,158,0.4,"park",true,true,false],


  // ==================== 京都府 ==================== (日本海側)
  // --- 舞鶴市 --- (舞鶴湾)
  ["水ヶ浦漁港","舞鶴市","kyoto",35.5622,135.4684,"maizuru",null,1,"260000","260020",350,0.3,"port",null,true],
  ["成生漁港","舞鶴市","kyoto",35.5791,135.4482,"maizuru",null,1,"260000","260020",10,0.25,"port",true,true],
  ["瀬崎漁港","舞鶴市","kyoto",35.535,135.4,"maizuru",null,1,"260000","260020",330,0.3,"port",false],
  ["西大浦漁港","舞鶴市","kyoto",35.5207,135.3465,"maizuru","miyazu",0.8,"260000","260020",345,0.35,"port",true,true],
  ["神崎漁港","舞鶴市","kyoto",35.5,135.35,"maizuru","miyazu",0.7,"260000","260020",350,0.4,"port",true,true],
  ["田井漁港","舞鶴市","kyoto",35.5854,135.242,"maizuru",null,1,"260000","260020",0,0.55,"port",true,true],
  ["野原漁港","舞鶴市","kyoto",35.5704,135.4275,"maizuru",null,1,"260000","260020",5,0.5,"port",true,true],
  ["竜宮浜漁港","舞鶴市","kyoto",35.5619,135.3995,"maizuru",null,1,"260000","260020",355,0.3,"port",null,true],
  ["舞鶴漁港","舞鶴市","kyoto",35.504,135.2639,"maizuru",null,1,"260000","260020",180,0.85,"port"],
  ["舞鶴港","舞鶴市","kyoto",35.504,135.2639,"maizuru",null,1,"260000","260020",180,0.85,"port"],
  // --- 宮津市 --- (宮津湾・天橋立)
  ["由良漁港","宮津市","kyoto",35.6613,135.1231,"miyazu",null,1,"260000","260020",350,0.35,"port",true,true],
  ["島陰漁港","宮津市","kyoto",35.5751,135.2512,"miyazu",null,1,"260000","260020",320,0.35,"port",true,true],
  ["田井漁港","宮津市","kyoto",35.5854,135.242,"miyazu",null,1,"260000","260020",330,0.4,"port",true,true],
  ["溝尻漁港","宮津市","kyoto",35.6038,135.232,"miyazu",null,1,"260000","260020",350,0.45,"port",true,true],
  ["栗田漁港","宮津市","kyoto",35.5521,135.2205,"miyazu",null,1,"260000","260020",345,0.5,"port",true,true],
  ["養老漁港","宮津市","kyoto",35.6613,135.2631,"miyazu",null,1,"260000","260020",0,0.55,"port",null,true],
  ["宮津港","宮津市","kyoto",35.5469,135.2,"miyazu",null,1,"260000","260020",80,0.7,"port",true,true],
  // --- 伊根町 ---
  ["泊漁港","伊根町","kyoto",35.7069,135.2786,"miyazu","tango",0.5,"260000","260020",45,0.3,"port",true,true],
  ["伊根漁港","伊根町","kyoto",35.7036,135.2826,"miyazu","tango",0.5,"260000","260020",80,0.65,"port",true,true],
  ["新井漁港","伊根町","kyoto",35.6932,135.3031,"miyazu","tango",0.45,"260000","260020",355,0.3,"port",true],
  ["浦島漁港","伊根町","kyoto",35.7335,135.2735,"miyazu","tango",0.4,"260000","260020",350,0.25,"port",true,true],
  ["本庄漁港","伊根町","kyoto",35.7524,135.2513,"miyazu","tango",0.35,"260000","260020",345,0.3,"port",true,true],
  // --- 京丹後市 --- (日本海外洋)
  ["袖志漁港","京丹後市","kyoto",35.7647,135.1974,"tango",null,1,"260000","260020",10,0.2,"port",null,true],
  ["竹野漁港","京丹後市","kyoto",35.745,135.1086,"tango",null,1,"260000","260020",350,0.25,"port",true,true],
  ["小間漁港","京丹後市","kyoto",35.7368,135.0848,"tango",null,1,"260000","260020",0,0.2,"port",true,true],
  ["砂方漁港","京丹後市","kyoto",35.7217,135.0803,"tango",null,1,"260000","260020",330,0.2,"port"],
  ["三津漁港","京丹後市","kyoto",35.72,135.065,"tango",null,1,"260000","260020",320,0.25,"port",true,true],
  ["遊漁港","京丹後市","kyoto",35.7023,135.0402,"tango",null,1,"260000","260020",315,0.2,"port"],
  ["磯漁港","京丹後市","kyoto",35.713,135.05,"tango",null,1,"260000","260020",310,0.15,"port"],
  ["浜詰漁港","京丹後市","kyoto",35.6724,134.9639,"tango",null,1,"260000","260020",315,0.15,"port",true,true],
  ["蒲井漁港","京丹後市","kyoto",35.69,134.99,"tango",null,1,"260000","260020",320,0.2,"port",true,true],
  ["旭漁港","京丹後市","kyoto",35.735,135.035,"tango",null,1,"260000","260020",340,0.25,"port",true,true],
  ["間人漁港","京丹後市","kyoto",35.726,135.076,"tango",null,1,"260000","260020",350,0.35,"port",true,true],
  ["浅茂川漁港","京丹後市","kyoto",35.7212,135.0612,"tango",null,1,"260000","260020",325,0.3,"port",true,true],
  ["中浜漁港","京丹後市","kyoto",35.72,135.09,"tango",null,1,"260000","260020",315,0.2,"port",true,true],

  // --- 京都 新規: 地磯 ---
  ["経ヶ岬","京丹後市","kyoto",35.7218,135.0782,"tango",null,1,null,null,0,0.05,"rock"],
  ["城島","宮津市","kyoto",35.6214,135.2077,"miyazu",null,1,null,null,350,0.1,"rock"],
  ["栗田半島","宮津市","kyoto",35.5612,135.232,"miyazu",null,1,null,null,350,0.1,"rock"],

  // --- 京都 新規: サーフ ---
  ["琴引浜","京丹後市","kyoto",35.7031,135.0302,"tango",null,1,null,null,315,0.05,"surf",true,true],
  ["八丁浜","京丹後市","kyoto",35.7123,135.0708,"tango",null,1,null,null,330,0.1,"surf",true,true],
  ["小天橋","京丹後市","kyoto",35.6724,134.9838,"tango",null,1,null,null,320,0.05,"surf",true,true],
  ["天橋立","宮津市","kyoto",35.5612,135.1612,"miyazu",null,1,null,null,340,0.2,"surf",true,true],

  // --- 京都 新規: 釣り公園 ---
  ["舞鶴親海公園","舞鶴市","kyoto",35.485,135.375,"maizuru",null,1,null,null,180,0.5,"park",true,true],

  // --- 京都 新規: 河口 ---
  ["由良川河口","舞鶴市","kyoto",35.505,135.23,"maizuru",null,1,null,null,0,0.3,"river"],
  ["久美浜湾","京丹後市","kyoto",35.63,134.905,"tango",null,1,null,null,330,0.35,"river",true,true],

  // --- 京都 新規: 漁港 ---
  ["大丹生漁港","舞鶴市","kyoto",35.536,135.3943,"maizuru",null,1,null,null,345,0.35,"port",true,true],
  ["白杉漁港","舞鶴市","kyoto",35.504,135.334,"maizuru",null,1,null,null,350,0.4,"port",true,true],

  // ==================== 兵庫県 ==================== (瀬戸内海側 + 日本海側)
  // --- 阪神間 (尼崎・西宮・芦屋) ---
  ["武庫川尻一文字","尼崎市","hyogo",34.697,135.3658,"osaka",null,1,null,null,190,0.3,"pier"],
  ["尼崎市立魚つり公園","尼崎市","hyogo",34.6812,135.38,"osaka",null,1,null,null,180,0.45,"park",true,true],
  ["鳴尾浜","西宮市","hyogo",34.6926,135.3542,"osaka",null,1,null,null,190,0.5,"pier",true,true,false],
  ["西宮ケーソン","西宮市","hyogo",34.718,135.335,"osaka",null,1,null,null,190,0.35,"pier",true,true,true],
  ["南芦屋浜","芦屋市","hyogo",34.7112,135.3117,"osaka",null,1,null,null,190,0.4,"pier",true,true,true],
  ["西宮浜","西宮市","hyogo",34.7088,135.3415,"osaka",null,1,null,null,190,0.45,"pier",true,true],
  ["甲子園浜","西宮市","hyogo",34.7072,135.3552,"osaka",null,1,null,null,190,0.15,"surf",true,true],

  // --- 神戸市 ---
  ["神戸空港親水護岸","神戸市","hyogo",34.6316,135.2239,"osaka",null,1,null,null,180,0.4,"pier",true,true,false],
  ["ポートアイランド北公園","神戸市","hyogo",34.6768,135.2043,"osaka",null,1,null,null,180,0.5,"pier",true,true,false],
  ["HAT神戸","神戸市","hyogo",34.6267,134.994,"osaka",null,1,null,null,180,0.55,"pier",true],
  ["兵庫突堤","神戸市","hyogo",34.6532,135.1481,"osaka",null,1,null,null,200,0.5,"pier",null,null,true],
  ["和田防","神戸市","hyogo",34.6933,135.1785,"osaka",null,1,null,null,200,0.3,"pier",true,true],
  ["ポートアイランド西公園","神戸市","hyogo",34.6686,135.1933,"osaka",null,1,null,null,210,0.45,"pier"],
  ["六甲アイランド","神戸市","hyogo",34.6877,135.2701,"osaka",null,1,null,null,180,0.5,"pier",true,false],
  ["神戸港","神戸市","hyogo",34.66,135.1681,"osaka",null,1,null,null,190,0.7,"port",true,true],
  ["須磨海岸","神戸市","hyogo",34.6374,135.0846,"osaka",null,1,null,null,200,0.1,"surf",true,true],
  ["須磨浦海釣り公園","神戸市","hyogo",34.6374,135.1021,"osaka",null,1,null,null,210,0.4,"park"],
  ["平磯海づり公園","神戸市","hyogo",34.6264,135.0661,"osaka",null,1,null,null,200,0.4,"park",true,true],
  ["塩屋漁港","神戸市","hyogo",34.636,135.105,"osaka",null,1,null,null,210,0.5,"port",true,true],
  ["垂水漁港","神戸市","hyogo",34.631,135.052,"osaka",null,1,null,null,205,0.55,"port",true,true,true],
  ["長田港","神戸市","hyogo",34.6478,135.0787,"osaka",null,1,null,null,200,0.55,"pier",null,true],

  // --- 明石 ---
  ["アジュール舞子","神戸市","hyogo",34.6338,135.0366,"osaka",null,1,null,null,200,0.3,"pier",true,true,true],
  ["明石港","明石市","hyogo",34.643,134.987,"osaka",null,1,null,null,200,0.55,"port",true,true],
  ["林崎漁港","明石市","hyogo",34.6457,134.9666,"osaka",null,1,null,null,200,0.5,"port",true,true,true],
  ["藤江漁港","明石市","hyogo",34.6583,134.9503,"osaka",null,1,null,null,200,0.5,"port",true,true],
  ["江井ヶ島漁港","明石市","hyogo",34.6754,134.9069,"osaka",null,1,null,null,200,0.45,"port",true,true],
  ["大蔵海岸","明石市","hyogo",34.6421,135.0154,"osaka",null,1,null,null,200,0.1,"surf",true,true,true],
  ["明石新浜漁港","明石市","hyogo",34.643,134.988,"osaka",null,1,null,null,200,0.5,"port"],
  ["東二見人工島","明石市","hyogo",34.668,134.892,"osaka",null,1,null,null,195,0.4,"pier",true,true],
  ["二見港","明石市","hyogo",34.6567,134.9,"osaka",null,1,null,null,195,0.5,"port",true],

  // --- 加古川・高砂 ---
  ["加古川河口","加古川市","hyogo",34.721,134.815,"osaka",null,1,null,null,195,0.3,"river",null,true],
  ["加古川尻","加古川市","hyogo",34.7063,134.809,"osaka",null,1,null,null,195,0.35,"pier"],
  ["高砂港","高砂市","hyogo",34.7278,134.7989,"osaka",null,1,null,null,190,0.55,"port",true,true],
  ["高砂西港","高砂市","hyogo",34.7406,134.7504,"osaka",null,1,null,null,190,0.5,"pier",true],
  ["伊保港","高砂市","hyogo",34.7406,134.7951,"osaka",null,1,null,null,195,0.5,"port",true,true],
  ["別府港","加古川市","hyogo",34.722,134.835,"osaka",null,1,null,null,195,0.5,"port",true,true],
  ["播磨新島","播磨町","hyogo",34.697,134.8383,"osaka",null,1,null,null,195,0.4,"pier",true,true],

  // --- 姫路・たつの・相生・赤穂 ---
  ["姫路港","姫路市","hyogo",34.778,134.655,"osaka",null,1,null,null,185,0.6,"port",true,true],
  ["飾磨港","姫路市","hyogo",34.7933,134.6567,"osaka",null,1,null,null,185,0.55,"port",true,true],
  ["的形漁港","姫路市","hyogo",34.7287,134.6167,"osaka",null,1,null,null,190,0.5,"port"],
  ["大塩漁港","姫路市","hyogo",34.764,134.733,"osaka",null,1,null,null,190,0.5,"port",true,true],
  ["網干港","姫路市","hyogo",34.793,134.639,"osaka",null,1,null,null,185,0.55,"port",true,true],
  ["白浜海水浴場","姫路市","hyogo",34.7287,134.616,"osaka",null,1,null,null,185,0.1,"surf",true,true],
  ["室津漁港","たつの市","hyogo",34.521,134.8758,"osaka",null,1,null,null,185,0.55,"port",true,true,true],
  ["相生港","相生市","hyogo",34.7977,134.4747,"osaka",null,1,null,null,180,0.6,"port",true,true],
  ["赤穂港","赤穂市","hyogo",34.744,134.387,"osaka",null,1,null,null,180,0.5,"port",true,true,true],
  ["御崎","赤穂市","hyogo",34.7331,134.3983,"osaka",null,1,null,null,180,0.15,"rock",true,true],
  ["坂越漁港","赤穂市","hyogo",34.7522,134.4143,"osaka",null,1,null,null,180,0.55,"port",true,true],
  ["唐船サンビーチ","赤穂市","hyogo",34.7294,134.395,"osaka",null,1,null,null,180,0.1,"surf",true,true],
  ["丸山漁港","赤穂市","hyogo",34.2936,134.6587,"osaka",null,1,null,null,180,0.5,"port",true,true,true],
  ["福浦漁港","赤穂市","hyogo",34.7438,134.3753,"osaka",null,1,null,null,180,0.45,"port",true,true,true],

  // --- 淡路島 ---
  ["岩屋漁港","淡路市","hyogo",34.5905,135.0191,"osaka",null,1,null,null,30,0.5,"port",true,true,true],
  ["淡路島翼港","淡路市","hyogo",34.558,135.0132,"osaka",null,1,null,null,90,0.45,"pier"],
  ["浦漁港","淡路市","hyogo",34.5412,134.9945,"osaka",null,1,null,null,0,0.5,"port",true,true,false],
  ["富島漁港","淡路市","hyogo",34.534,134.906,"osaka",null,1,null,null,330,0.45,"port",false],
  ["郡家漁港","淡路市","hyogo",34.4912,134.8189,"osaka",null,1,null,null,300,0.5,"port",true,true],
  ["佐野漁港","淡路市","hyogo",34.4605,134.9354,"osaka",null,1,null,null,270,0.45,"port",true,true,true],
  ["室津漁港","淡路市","hyogo",34.521,134.8758,"osaka",null,1,null,null,280,0.5,"port",true,true,true],
  ["育波漁港","淡路市","hyogo",34.5303,134.8885,"osaka",null,1,null,null,285,0.45,"port",true,true],
  ["仮屋漁港","淡路市","hyogo",34.528,135.015,"osaka",null,1,null,null,30,0.55,"port",true,true,true],
  ["志筑漁港","淡路市","hyogo",34.4634,134.9016,"osaka",null,1,null,null,275,0.5,"port"],
  ["洲本港","洲本市","hyogo",34.347,134.897,"osaka",null,1,null,null,90,0.6,"port",true,true],
  ["炬口漁港","洲本市","hyogo",34.358,134.895,"osaka",null,1,null,null,150,0.5,"port",true,true],
  ["由良漁港","洲本市","hyogo",34.2869,134.9446,"osaka",null,1,null,null,150,0.45,"port",true,true],
  ["津名港","淡路市","hyogo",34.4586,134.931,"osaka",null,1,null,null,270,0.55,"port",true,true],
  ["塩田漁港","南あわじ市","hyogo",34.4186,134.9011,"osaka",null,1,null,null,200,0.5,"port",true,true],
  ["福良漁港","南あわじ市","hyogo",34.2527,134.716,"osaka",null,1,null,null,210,0.6,"port",true,true],
  ["丸山漁港","南あわじ市","hyogo",34.2936,134.6587,"osaka",null,1,null,null,220,0.5,"port",true,true,true],
  ["沼島漁港","南あわじ市","hyogo",34.2435,134.7449,"osaka",null,1,null,null,180,0.45,"port",null,true],
  ["阿万漁港","南あわじ市","hyogo",34.2143,134.7237,"osaka",null,1,null,null,195,0.5,"port"],

  // --- 但馬 (日本海側) ---
  ["津居山漁港","豊岡市","hyogo",35.6478,134.8212,"tango",null,1,null,null,10,0.5,"port"],
  ["竹野漁港","豊岡市","hyogo",35.653,134.757,"tango",null,1,null,null,350,0.45,"port",true,true],
  ["気比漁港","豊岡市","hyogo",35.6449,134.5638,"tango",null,1,null,null,20,0.5,"port"],
  ["竹野浜","豊岡市","hyogo",35.6613,134.7507,"tango",null,1,null,null,350,0.1,"surf",true,true],
  ["柴山漁港","香美町","hyogo",35.6552,134.661,"tango",null,1,null,null,340,0.5,"port",null,true],
  ["香住漁港","香美町","hyogo",35.638,134.635,"tango",null,1,null,null,350,0.55,"port"],
  ["佐津漁港","香美町","hyogo",35.6442,134.6712,"tango",null,1,null,null,345,0.5,"port"],
  ["浜坂漁港","新温泉町","hyogo",35.628,134.451,"tango",null,1,null,null,340,0.5,"port",true,true],
  ["諸寄漁港","新温泉町","hyogo",35.633,134.467,"tango",null,1,null,null,335,0.55,"port",true,true],
  ["居組漁港","新温泉町","hyogo",35.62,134.416,"tango",null,1,null,null,330,0.5,"port",true,true],
  ["三尾漁港","香美町","hyogo",35.6577,134.5041,"tango",null,1,null,null,340,0.45,"port",true,true],
  ["鎧漁港","香美町","hyogo",35.6534,134.5752,"tango",null,1,null,null,350,0.45,"port",true,true],
  ["余部漁港","香美町","hyogo",35.6519,134.558,"tango",null,1,null,null,340,0.45,"port",true,true],
  ["田結漁港","豊岡市","hyogo",35.6449,134.8439,"tango",null,1,null,null,30,0.5,"port",false,true]
];

// NOWPHAS観測点マッピング（基準港→最寄りNOWPHAS地点名）
const NOWPHAS_MAP = {
  osaka: '神戸',
  wakayama: '和歌山',
  kainan: '和歌山',
  yuasa: '由良',
  gobo: '由良',
  tanabe: '白浜',
  shirahama: '白浜',
  kushimoto: '潮岬',
  katsuura: '潮岬',
  shingu: '潮岬',
  maizuru: '舞鶴',
  miyazu: '舞鶴',
  tango: '舞鶴'
};

// 県名表示用
const PREF_NAMES = {
  wakayama: '和歌山県',
  osaka: '大阪府',
  kyoto: '京都府',
  hyogo: '兵庫県'
};

// スポット種別アイコン
const TYPE_ICONS = {
  port: '', rock: '\u{1FAA8}', surf: '\u{1F3D6}\uFE0F', river: '\u{1F30A}', pier: '\u{1F531}', park: '\u{1F3A3}'
};
