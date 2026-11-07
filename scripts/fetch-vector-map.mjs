import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader as Pbf } from 'pbf';
import {writeFile,mkdir} from 'node:fs/promises';
const tilejson=await (await fetch('https://tiles.openfreemap.org/planet')).json();
const xt=(lon,z)=>Math.floor((lon+180)/360*2**z);
const yt=(lat,z)=>Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*2**z);
const features=[],seen=new Set();
async function tile(x,y,z,layers){const url=tilejson.tiles[0].replace('{x}',x).replace('{y}',y).replace('{z}',z);const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`Tile ${z}/${x}/${y}: ${r.status}`);const data=new VectorTile(new Pbf(new Uint8Array(await r.arrayBuffer())));for(const name of layers){const layer=data.layers[name];if(!layer)continue;for(let i=0;i<layer.length;i++){const f=layer.feature(i),p=f.properties;
 if(layers.length<=2&&name==='transportation'&&p.class!=='rail'&&p.class!=='transit'&&!['primary','secondary','tertiary'].includes(p.class))continue;
 if(layers.length<=2&&name==='poi'&&p.subclass!=='tram_stop')continue;
 if(z===12&&name==='transportation_name'&&p.class!=='rail'&&p.class!=='transit')continue;
 const key=`${z}:${name}:${f.id}:${JSON.stringify(f.loadGeometry())}`;if(seen.has(key))continue;seen.add(key);const geo=f.toGeoJSON(x,y,z);geo.properties={...p,layer:name};features.push(geo);
}}
}
async function region(z,bbox,layers){const tasks=[];for(let x=xt(bbox[0],z);x<=xt(bbox[2],z);x++)for(let y=yt(bbox[3],z);y<=yt(bbox[1],z);y++)tasks.push([x,y]);for(let i=0;i<tasks.length;i+=8){await Promise.all(tasks.slice(i,i+8).map(([x,y])=>tile(x,y,z,layers)));console.log('tiles',Math.min(i+8,tasks.length),'/',tasks.length);}}
await region(14,[49.075,55.765,49.155,55.815],['transportation','water','landcover','poi']);
await region(14,[48.95,55.69,49.31,55.92],['transportation','poi']);
await region(14,[48.95,55.69,49.31,55.92],['building']);
await mkdir('public/data',{recursive:true});await writeFile('public/data/kazan-map.geojson',JSON.stringify({type:'FeatureCollection',source:'OpenFreeMap / OpenMapTiles / OpenStreetMap',downloaded:new Date().toISOString(),features}));
console.log('saved',features.length,'features');console.log('rail classes',Object.entries(features.filter(f=>f.properties.layer==='transportation').reduce((acc,f)=>{const k=f.properties.class+'/'+f.properties.subclass;acc[k]=(acc[k]||0)+1;return acc;},{})));
