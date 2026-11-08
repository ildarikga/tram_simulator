import * as T from 'three';
import {project} from './rail-network.js';
import {buildingKey,createBuildingDistrict,createBuildingMaterials} from './station-buildings.js';

const CELL=256,TILE=180,CORRIDOR=140,LOAD_DISTANCE=560,RELEASE_DISTANCE=950,MAX_CHUNKS=24,MAX_BYTES=96*1024*1024;
const cellKey=(x,z)=>`${x}:${z}`;
const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
function pointDistance(p,a,b){
 const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
 return Math.hypot(p.x-a.x-dx*t,p.z-a.z-dz*t);
}
function segmentDistance(a,b,c,d){
 if(Math.max(a.x,b.x)>=Math.min(c.x,d.x)&&Math.max(c.x,d.x)>=Math.min(a.x,b.x)&&Math.max(a.z,b.z)>=Math.min(c.z,d.z)&&Math.max(c.z,d.z)>=Math.min(a.z,b.z)&&cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0)return 0;
 return Math.min(pointDistance(a,c,d),pointDistance(b,c,d),pointDistance(c,a,b),pointDistance(d,a,b));
}

// Each rail segment is indexed with a corridor buffer. Registration is independent
// of the selected route, so custom routes on the same graph get the same facades.
export function createRailCorridor(lines){
 const bins=new Map();
 for(const line of lines)for(let i=1;i<line.length;i++){
  const segment=[line[i-1],line[i]],minX=Math.min(...segment.map(p=>p.x)),maxX=Math.max(...segment.map(p=>p.x)),minZ=Math.min(...segment.map(p=>p.z)),maxZ=Math.max(...segment.map(p=>p.z));
  for(let x=Math.floor((minX-CORRIDOR)/CELL);x<=Math.floor((maxX+CORRIDOR)/CELL);x++)for(let z=Math.floor((minZ-CORRIDOR)/CELL);z<=Math.floor((maxZ+CORRIDOR)/CELL);z++){
   const key=cellKey(x,z);if(!bins.has(key))bins.set(key,[]);bins.get(key).push(segment);
  }
 }
 function distanceAt(p){
  let distance=Infinity;for(const [a,b] of bins.get(cellKey(Math.floor(p.x/CELL),Math.floor(p.z/CELL)))||[])distance=Math.min(distance,pointDistance(p,a,b));return distance;
 }
 function includes(ring){
  const minX=Math.floor(Math.min(...ring.map(p=>p.x))/CELL),maxX=Math.floor(Math.max(...ring.map(p=>p.x))/CELL),minZ=Math.floor(Math.min(...ring.map(p=>p.z))/CELL),maxZ=Math.floor(Math.max(...ring.map(p=>p.z))/CELL);
  const candidates=new Set();
  for(let x=minX;x<=maxX;x++)for(let z=minZ;z<=maxZ;z++)for(const segment of bins.get(cellKey(x,z))||[])candidates.add(segment);
  for(const [a,b] of candidates)for(let i=0;i<ring.length;i++)if(segmentDistance(a,b,ring[i],ring[(i+1)%ring.length])<=CORRIDOR)return true;
  return false;
 }
 return {includes,distanceAt};
}

function releaseGeometry(group){group.traverse(o=>o.geometry?.dispose());group.removeFromParent();}
function geometryBytes(group){let bytes=0;group.traverse(o=>{if(o.geometry){for(const a of Object.values(o.geometry.attributes))bytes+=a.array.byteLength;bytes+=o.geometry.index?.array.byteLength||0;}});return bytes;}

export function createRouteBuildings(lines,{excluded=new Set()}={}){
 const group=new T.Group();group.name='Фасады всех трамвайных маршрутов';
 const corridor=createRailCorridor(lines),tiles=new Map(),seen=new Set(),cache=new Map(),materials=createBuildingMaterials();
 const stats={buildings:0,chunks:0,loadedChunks:0,loadedBuildings:0,windows:0,doors:0,geometryBytes:0,pendingChunks:0};
 group.userData.routeBuildings=stats;group.ownedMaterials=materials;
 let pending=null,budgetOrigin=null;const budgetSkipped=new Set();
 function register(coords,properties){
  if([true,1,'true'].includes(properties.hide_3d))return false;
  const ring=coords[0].slice(0,-1).map(project);if(ring.length<3||!corridor.includes(ring))return false;
  const key=buildingKey(coords);if(excluded.has(key))return false;
  const identity=`${key}/${Number(properties.render_min_height)||0}/${Number(properties.render_height)||9}`;if(seen.has(identity))return false;seen.add(identity);
  const center={x:ring.reduce((s,p)=>s+p.x,0)/ring.length,z:ring.reduce((s,p)=>s+p.z,0)/ring.length};
  const x=Math.floor(center.x/TILE),z=Math.floor(center.z/TILE),tileKey=cellKey(x,z);
  if(!tiles.has(tileKey))tiles.set(tileKey,{key:tileKey,center:{x:(x+.5)*TILE,z:(z+.5)*TILE},radius:TILE*.71,buildings:[]});
  const tile=tiles.get(tileKey);tile.buildings.push({coords,properties,key,center});
  for(const p of ring)tile.radius=Math.max(tile.radius,Math.hypot(p.x-tile.center.x,p.z-tile.center.z));
  stats.buildings++;stats.chunks=tiles.size;return true;
 }
 function distanceToTile(tile,p){return Math.max(0,Math.hypot(p.x-tile.center.x,p.z-tile.center.z)-tile.radius);}
 function refreshStats(){
  stats.loadedChunks=cache.size;stats.loadedBuildings=stats.windows=stats.doors=stats.geometryBytes=0;
  for(const entry of cache.values()){stats.loadedBuildings+=entry.stats.buildings;stats.windows+=entry.stats.windows;stats.doors+=entry.stats.doors;stats.geometryBytes+=entry.bytes;}
 }
 function evict(key){const entry=cache.get(key);releaseGeometry(entry.group);cache.delete(key);}
 function update(camera,{budgetMs=4,maxBuildings=6}={}){
  const position=camera.position,nearGround=position.y<200;
  if(!budgetOrigin||Math.hypot(position.x-budgetOrigin.x,position.z-budgetOrigin.z)>90){budgetSkipped.clear();budgetOrigin={x:position.x,z:position.z};}
  group.visible=nearGround;
  for(const [key,entry] of cache)if(distanceToTile(entry.tile,position)>RELEASE_DISTANCE)evict(key);
  if(!nearGround){pending=null;stats.pendingChunks=0;refreshStats();return;}
  const wanted=[...tiles.values()].map(tile=>({tile,distance:distanceToTile(tile,position)})).filter(e=>e.distance<=LOAD_DISTANCE).sort((a,b)=>a.distance-b.distance).slice(0,MAX_CHUNKS).filter(e=>!budgetSkipped.has(e.tile.key));
  const wantedKeys=new Set(wanted.map(e=>e.tile.key));
  if(pending&&!wantedKeys.has(pending.tile.key))pending=null;
  for(const [key,entry] of cache)entry.group.visible=wantedKeys.has(key);
  stats.pendingChunks=wanted.filter(e=>!cache.has(e.tile.key)).length;
  const start=performance.now();let built=0;
  while(built<maxBuildings&&performance.now()-start<budgetMs){
   if(!pending){
    const next=wanted.find(e=>!cache.has(e.tile.key));if(!next)break;
    pending={tile:next.tile,index:0,builder:createBuildingDistrict([],{includeBodies:false,select:()=>true,distanceAt:corridor.distanceAt,simplified:true,materials})};
   }
   const building=pending.tile.buildings[pending.index++];pending.builder.add(building.coords,building.properties);built++;
   if(pending.index===pending.tile.buildings.length){
    const detail=pending.builder.finish(),detailStats=detail.userData.stationDistrict;
    delete detail.userData.stationDistrict;detail.userData.routeBuildingChunk={buildings:detailStats.buildings,windows:detailStats.windows};
    group.add(detail);cache.set(pending.tile.key,{tile:pending.tile,group:detail,stats:detailStats,bytes:geometryBytes(detail)});pending=null;
   }
  }
  refreshStats();
  // Keep the nearest chunks when a dense district exceeds the cache budget.
  const farthest=[...cache.entries()].sort((a,b)=>distanceToTile(b[1].tile,position)-distanceToTile(a[1].tile,position));
  while(cache.size>MAX_CHUNKS||stats.geometryBytes>MAX_BYTES&&cache.size>1){const key=farthest.shift()[0];if(stats.geometryBytes>MAX_BYTES)budgetSkipped.add(key);evict(key);refreshStats();}
 }
 function dispose(){for(const key of [...cache.keys()])evict(key);pending=null;refreshStats();}
 return {group,materials,stats,register,update,dispose,get tiles(){return [...tiles.values()];}};
}
