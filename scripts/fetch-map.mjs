import { mkdir, writeFile } from 'node:fs/promises';
const query='[out:json][timeout:120];(way[railway=tram](55.65,48.8,55.95,49.4);relation[route=tram](55.65,48.8,55.95,49.4);way[building](55.778,49.085,55.805,49.135);way[highway~"^(primary|secondary|tertiary|residential|unclassified|pedestrian)$"](55.75,49.02,55.87,49.25);way[natural=water](55.75,49.02,55.87,49.25););out geom;';
const endpoints=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter'];
await mkdir('public/data',{recursive:true});
for(const endpoint of endpoints){
 try{console.log('Fetching Kazan:',endpoint);const response=await fetch(endpoint,{method:'POST',body:new URLSearchParams({data:query}),signal:AbortSignal.timeout(150000)});if(!response.ok)throw Error(`HTTP ${response.status}`);const data=await response.json();if(!data.elements?.length)throw Error('Empty dataset');await writeFile('public/data/kazan-osm.json',JSON.stringify(data));console.log('Saved',data.elements.length,'OSM elements');process.exit(0);}catch(e){console.error(e.message);}
}
process.exitCode=1;
