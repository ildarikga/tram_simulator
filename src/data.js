export const trams = [
  { id: 'retro', name: 'Ретро', subtitle: 'История на рельсах', color: '#ae4238', doors: 2, sections: 1, length: 11, era: 'Ретро', capacity: 56 },
  { id: 'classic', name: 'Классический', subtitle: 'Две двери · один вагон', color: '#538b78', doors: 2, sections: 1, length: 14, era: 'Классика', capacity: 100 },
  { id: 'long', name: 'Сочленённый', subtitle: 'Длинный · три секции', color: '#b95144', doors: 6, sections: 3, length: 9, era: 'Городской', capacity: 210 },
  { id: 'compact', name: 'Компактный', subtitle: 'Четыре двери · один вагон', color: '#d47645', doors: 4, sections: 1, length: 13, era: 'Городской', capacity: 110 },
  { id: 'yellow', name: 'Жёлтый экспресс', subtitle: 'Длинный · три секции', color: '#dfb83e', doors: 6, sections: 3, length: 9, era: 'Современный', capacity: 220 },
  { id: 'blue', name: 'Новый синий', subtitle: 'Твой трамвай · две секции', color: '#397db8', doors: 4, sections: 2, length: 10, era: 'Современный', capacity: 160 },
];
export const locations = [
 { name:'Вокзал', x:-120,z:120 }, { name:'Сенная площадь',x:-60,z:120 }, { name:'Озеро Кабан',x:60,z:120 },
 { name:'Улица Баумана',x:0,z:60 }, { name:'Площадь Тукая',x:60,z:60 }, { name:'Университет',x:120,z:0 },
 { name:'Кремль',x:-60,z:-60 }, { name:'Набережная',x:0,z:-120 }, { name:'Парк',x:120,z:-60 }, { name:'Депо',x:-120,z:0 },
];
export const routes = [
 ['1',[0,1,3,6,9]], ['2',[9,6,7,8,5]], ['3',[0,9,6,3,4]], ['4',[1,2,4,5,8]], ['5',[0,1,2,5,8,7,6,9]],
 ['5А',[0,1,4,5,8,7,6,9]], ['6',[9,3,4,5]], ['7',[0,1,3,7,8]], ['8',[2,4,3,6,7]],
].map(([number,stops])=>({ number,stops,name:`${locations[stops[0]].name} — ${locations[stops.at(-1)].name}` }));
// Every route uses the same street grid, including routes made by the player.
let geographicNetwork=null;
export function setGeographicNetwork(network){geographicNetwork=network;}
export function routePoints(stops) {
 if(stops.length&&typeof stops[0]==='object')return stops;
 if(geographicNetwork)return geographicNetwork.path(stops,locations);
 const points = [];
 const add=(x,z)=>{if(!points.length||points.at(-1).x!==x||points.at(-1).z!==z) points.push({x,z});};
 for(let i=0;i<stops.length;i++) {
  const to=locations[stops[i]];
  if(!i) {add(to.x,to.z);continue;}
  let {x,z}=points.at(-1);
  while(x!==to.x){x+=Math.sign(to.x-x)*60;add(x,z);}
  while(z!==to.z){z+=Math.sign(to.z-z)*60;add(x,z);}
 }
 return points;
}
