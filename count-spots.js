const fs = require('fs');
const src = fs.readFileSync('tide-pwa-online/js/ports-data.js','utf8');
const re = /\["([^"]+)","([^"]*)","(wakayama|hyogo|kyoto)",/g;
let m, counts = {wakayama:0, hyogo:0, kyoto:0};
while((m=re.exec(src))!==null) counts[m[3]]++;
console.log(JSON.stringify(counts));
console.log('total:', counts.wakayama + counts.hyogo + counts.kyoto);
