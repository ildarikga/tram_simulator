import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {approachSignal} from './traffic-signals.js';

// Reverse the selected trace and place the opposing track on its right.
// Mitered corners keep neighbouring segments connected without large spikes.
export function opposingTrack(points,offset=4){
 const reversed=points.filter((p,i)=>!i||Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z)>.01).map(p=>({...p})).reverse();
 return reversed.map((p,i)=>{
  const a=reversed[Math.max(0,i-1)],b=reversed[Math.min(reversed.length-1,i+1)];
  const normal=(a,b)=>{const length=Math.hypot(b.x-a.x,b.z-a.z);return length?{x:-(b.z-a.z)/length,z:(b.x-a.x)/length}:null;};
  const incoming=normal(a,p),outgoing=normal(p,b),n=incoming||outgoing;
  if(!n)return p;
  let nx=(incoming?.x??n.x)+(outgoing?.x??n.x),nz=(incoming?.z??n.z)+(outgoing?.z??n.z),length=Math.hypot(nx,nz);
  if(length<.1){nx=n.x;nz=n.z;length=1;}
  nx/=length;nz/=length;
  const scale=offset/Math.max(.5,nx*n.x+nz*n.z);
  return {x:p.x+nx*scale,z:p.z+nz*scale};
 });
}

// Doors stay shut on background trams: merge their static parts per material.
// Vehicles of the same type share these geometries, rather than hundreds of
// individual meshes per tram.
function tramTemplate(spec,makeTram){
 const source=makeTram(spec),parts=new Map(),group=new T.Group();source.updateMatrixWorld(true);
 source.traverse(mesh=>{if(!mesh.isMesh)return;if(!parts.has(mesh.material))parts.set(mesh.material,[]);parts.get(mesh.material).push(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));});
 for(const [material,geometries] of parts){const mesh=new T.Mesh(mergeGeometries(geometries),material);group.add(mesh);geometries.forEach(g=>g.dispose());}
 source.traverse(mesh=>mesh.geometry?.dispose());group.userData.frontOffset=source.userData.frontOffset;
 return {group,ownedMaterials:source.ownedMaterials||[]};
}

export function createOncomingTrams(points,{specs,makeTram,createRouteControl,count}={}){
 const group=new T.Group();group.name='Встречные трамваи';
 const path=opposingTrack(points),segments=[],vehicles=[],templates=new Map();let length=0;
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],size=Math.hypot(b.x-a.x,b.z-a.z);if(size<.01)continue;
  segments.push({a,b,length:size,start:length});length+=size;
 }
 const amount=length<60?0:Math.min(Math.floor(length/60),count??Math.min(24,Math.max(2,Math.ceil(length/350))));
 for(let i=0;i<amount;i++){
  const spec=specs[i%specs.length];if(!templates.has(spec.id))templates.set(spec.id,tramTemplate(spec,makeTram));
  const model=templates.get(spec.id).group.clone();model.name=`Встречный ${spec.name}`;group.add(model);
  vehicles.push({model,distance:(i+.5)*length/amount,speed:0,maxSpeed:9+i%4,half:model.userData.frontOffset||12,control:createRouteControl?.(path)});
 }
 function place(v){
  const segment=segments.find(s=>v.distance<=s.start+s.length)||segments.at(-1);
  const t=Math.min(1,Math.max(0,(v.distance-segment.start)/segment.length));
  v.model.position.set(segment.a.x+(segment.b.x-segment.a.x)*t,.25,segment.a.z+(segment.b.z-segment.a.z)*t);
  v.model.rotation.y=Math.atan2(segment.b.x-segment.a.x,segment.b.z-segment.a.z);
 }
 vehicles.forEach(place);
 function update(dt,time=0){
  dt=Math.max(0,Math.min(dt,.1));if(!dt)return;
  const ordered=[...vehicles].sort((a,b)=>b.distance-a.distance),moves=[];
  for(let i=0;i<ordered.length;i++){
   const v=ordered[i],leader=ordered[i-1];
   const gap=Math.min(v.control?.limit(v.distance,v.half,time).distance??Infinity,leader?Math.max(0,leader.distance-v.distance-leader.half-v.half-6):Infinity);
   const move=approachSignal(v.speed,gap,dt,{maxSpeed:v.maxSpeed,acceleration:.95,deceleration:2.3});moves.push({v,move});
  }
  for(const {v,move} of moves){
   const previous=v.distance;v.distance=Math.min(length,v.distance+move.travel);v.speed=move.speed;
   v.control?.advance(previous,v.distance,v.half,time);
   // Reappear at the far terminus only when there is room to enter the track.
   if(v.distance>=length){
    v.speed=0;
    if(!vehicles.some(other=>other!==v&&other.distance<other.half+v.half+12)){v.control?.reset();v.distance=0;}
   }
   place(v);
  }
 }
 function dispose(){
  vehicles.forEach(v=>v.control?.reset());
  for(const {group,ownedMaterials} of templates.values()){group.traverse(mesh=>mesh.geometry?.dispose());ownedMaterials.forEach(m=>m.dispose());}
  group.clear();
 }
 return {group,update,dispose,get count(){return vehicles.length;}};
}
