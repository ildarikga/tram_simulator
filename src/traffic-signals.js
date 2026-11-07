import * as T from 'three';
import {project} from './rail-network.js';
import {railClearance,placeBesideRails} from './clearance.js';

export const signalTiming={green:24,yellow:3,clearance:3};
export const intersectionRadius=10;
const cross=(ax,az,bx,bz)=>ax*bz-az*bx;

// Opposite approaches share a phase. Yellow and the clearance interval
// prohibit entry; the other direction stays red throughout the transition.
export function signalColor(signal,axis,time){
 const {green,yellow,clearance}=signalTiming,half=green+yellow+clearance;
 const t=((time+signal.offset)%(2*half)+2*half)%(2*half);
 if(Math.floor(t/half)!==axis)return 'red';
 if(signal.occupants&&[...signal.occupants].some(([vehicle,occupiedAxis])=>occupiedAxis!==axis&&![...(signal.deadlockVehicles?.values()||[])].some(exemption=>exemption.axis===axis&&exemption.vehicles.has(vehicle))))return 'red';
 const phase=t%half;return phase<green?'green':phase<green+yellow?'yellow':'red';
}
export function signalAxis(signal,dx,dz){return Math.abs(dx*signal.dx+dz*signal.dz)>=Math.SQRT1_2?0:1;}

export function createSignalNetwork(edges,features=[]){
 const signals=[],bins=new Map(),cell=32;
 function nearby(x,z){const found=[];const bx=Math.floor(x/cell),bz=Math.floor(z/cell);for(let i=-1;i<=1;i++)for(let j=-1;j<=1;j++)found.push(...(bins.get(`${bx+i},${bz+j}`)||[]));return found;}
 function add(x,z,dx,dz,width){
  const existing=nearby(x,z).find(s=>Math.hypot(s.x-x,s.z-z)<18);if(existing)return existing;
  const length=Math.hypot(dx,dz),s={id:signals.length,x,z,dx:dx/length,dz:dz/length,radius:Math.max(intersectionRadius,width/2+3),offset:(signals.length*7)%60,occupants:new Map()};signals.push(s);
  const key=`${Math.floor(x/cell)},${Math.floor(z/cell)}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(s);return s;
 }
 const adjacency=new Map();
 for(const edge of edges){for(const n of [edge.from,edge.to])if(!adjacency.has(n))adjacency.set(n,new Set());adjacency.get(edge.from).add(edge.to);adjacency.get(edge.to).add(edge.from);edge.signals=[];}
 for(const [node,neighbors] of adjacency){
  if(neighbors.size<3||node.level?.startsWith('bridge'))continue;
  const next=[...neighbors][0],dx=next.x-node.x,dz=next.z-node.z,length=Math.hypot(dx,dz);
  // Ignore forks of parallel lanes: there must be a crossing direction.
  if([...neighbors].some(n=>Math.abs(cross(dx/length,dz/length,(n.x-node.x)/Math.hypot(n.x-node.x,n.z-node.z),(n.z-node.z)/Math.hypot(n.x-node.x,n.z-node.z)))>.55))add(node.x,node.z,dx,dz,12);
 }
 // Find rail/road crossings too: rails often cross the middle of a road edge.
 // Spatial buckets avoid comparing every rail segment to the entire city.
 const roadBins=new Map(),grid=100;
 const keys=(a,b)=>{const result=[];for(let x=Math.floor(Math.min(a.x,b.x)/grid);x<=Math.floor(Math.max(a.x,b.x)/grid);x++)for(let z=Math.floor(Math.min(a.z,b.z)/grid);z<=Math.floor(Math.max(a.z,b.z)/grid);z++)result.push(`${x},${z}`);return result;};
 for(const edge of edges){if(edge.from.level?.startsWith('bridge'))continue;for(const key of keys(edge.from,edge.to)){if(!roadBins.has(key))roadBins.set(key,[]);roadBins.get(key).push(edge);}}
 for(const {properties:p,geometry:g} of features){
  if(p.layer!=='transportation'||p.subclass!=='tram'||p.brunnel||!['LineString','MultiLineString'].includes(g.type))continue;
  for(const line of g.type==='LineString'?[g.coordinates]:g.coordinates){const points=line.map(project);for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],rx=b.x-a.x,rz=b.z-a.z;
   const candidates=new Set(keys(a,b).flatMap(k=>roadBins.get(k)||[]));
   for(const e of candidates){const sx=e.to.x-e.from.x,sz=e.to.z-e.from.z,den=cross(rx,rz,sx,sz);if(Math.abs(den)<.001||Math.abs(den)/Math.hypot(rx,rz)/e.length<.55)continue;
    const qx=e.from.x-a.x,qz=e.from.z-a.z,t=cross(qx,qz,sx,sz)/den,u=cross(qx,qz,rx,rz)/den;
    if(t>=0&&t<=1&&u>=0&&u<=1)add(a.x+t*rx,a.z+t*rz,sx,sz,e.width);
   }
  }}
 }
 function eventsForSegment(a,b){
  const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(!length)return [];
  const candidates=new Set();
  for(let d=0;d<=length+cell;d+=cell){const t=Math.min(1,d/length);for(const s of nearby(a.x+dx*t,a.z+dz*t))candidates.add(s);}
  const events=[];
  for(const signal of candidates){const at=((signal.x-a.x)*dx+(signal.z-a.z)*dz)/length;
   const lateral=Math.abs(cross(signal.x-a.x,signal.z-a.z,dx/length,dz/length));
   if(at>=0&&at<=length+.01&&lateral<signal.radius)events.push({signal,at:Math.min(length,at),axis:signalAxis(signal,dx/length,dz/length)});
  }
  return events.sort((a,b)=>a.at-b.at);
 }
 for(const e of edges)if(!e.from.level?.startsWith('bridge'))e.signals=eventsForSegment(e.from,e.to);
 return {signals,eventsForSegment};
}

// Route controls retain a commitment until the rear has cleared the junction.
// This also handles a long tram spanning several short polyline segments.
export function createRouteSignalControl(points,network){
 const events=[];let start=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];
  for(const e of network.eventsForSegment(a,b)){
   const at=start+e.at;
   if(!events.some(previous=>previous.signal===e.signal&&Math.abs(previous.at-at)<e.signal.radius*2))events.push({...e,at});
  }
  start+=Math.hypot(b.x-a.x,b.z-a.z);
 }
 const passed=new Set();let lastDistance=0;
 function reset(){for(const e of events){e.signal.occupants?.delete(e);e.signal.deadlockVehicles?.delete(e);}passed.clear();lastDistance=0;}
 function commit(e){passed.add(e);e.signal.occupants?.set(e,e.axis);}
 return {events,reset,setDeadlockVehicles(vehicles,distance,until){
  for(const e of events){
   e.signal.deadlockVehicles?.delete(e);
   if(!vehicles.length||e.at+e.signal.radius<distance||e.at-e.signal.radius>until)continue;
   if(!e.signal.deadlockVehicles)e.signal.deadlockVehicles=new Map();
   e.signal.deadlockVehicles.set(e,{axis:e.axis,vehicles:new Set(vehicles)});
  }
 },limit(distance,halfLength,time){
  if(distance<lastDistance-.01)reset();lastDistance=distance;
  for(const e of events){
   const stop=e.at-e.signal.radius-halfLength-1;
   if(distance>e.at+e.signal.radius+halfLength){e.signal.occupants?.delete(e);continue;}
   if(passed.has(e))continue;
   // A route may start inside an intersection; finish that manoeuvre.
   if(distance>stop+.05){commit(e);continue;}
   const color=signalColor(e.signal,e.axis,time);
   if(color==='green')continue;
   return {distance:Math.max(0,stop-distance),color,event:e};
  }
  return {distance:Infinity,color:'green'};
 },advance(from,to,halfLength,time){
  for(const e of events){const stop=e.at-e.signal.radius-halfLength-1;if(from<=stop+.05&&to>stop&&signalColor(e.signal,e.axis,time)==='green')commit(e);}
 }};
}

export function approachSignal(speed,gap,dt,{acceleration=1.2,deceleration=2.7,maxSpeed=16.67}={}){
 const safe=Number.isFinite(gap)?Math.sqrt(2*deceleration*Math.max(0,gap)):maxSpeed;
 const next=speed>safe?Math.max(safe,speed-deceleration*dt):Math.min(safe,maxSpeed,speed+acceleration*dt);
 const travel=Math.min(Math.max(0,gap),next*dt);
 return {speed:travel<next*dt||gap<.01?0:next,travel};
}

export function createSignalLayer(signals,railLines=[]){
 const clear=railClearance(railLines);
 const group=new T.Group();group.name='Светофоры перекрёстков';
 const count=signals.length*4;
 const housing=new T.InstancedMesh(new T.BoxGeometry(.65,1.95,.48),new T.MeshStandardMaterial({color:'#202a27'}),count);
 const poles=new T.InstancedMesh(new T.CylinderGeometry(.09,.12,3.9,6),new T.MeshStandardMaterial({color:'#626d68'}),count);
 const lamps=new T.InstancedMesh(new T.SphereGeometry(.21,8,6),new T.MeshBasicMaterial({color:'white'}),count*3);
 group.add(housing,poles,lamps);const obj=new T.Object3D(),color=new T.Color();
 const colors={red:'#ff3830',yellow:'#ffcd26',green:'#35ff78'},dark='#19221e';
 for(const s of signals)for(let direction=0;direction<4;direction++){
  const angle=Math.atan2(s.dx,s.dz)+direction*Math.PI/2,dx=Math.sin(angle),dz=Math.cos(angle),index=s.id*4+direction;
  // Put each head beyond the junction, facing its approach. It remains
  // visible from the tram cab when the front is waiting at the stop line.
  const placement=placeBesideRails({x:s.x+dx*(s.radius+1)-dz*7,z:s.z+dz*(s.radius+1)+dx*7},angle,clear);
  const {x,z}=placement||{x:0,z:0};obj.scale.setScalar(placement?1:0);
  obj.rotation.set(0,angle,0);obj.position.set(x,4.6,z);obj.updateMatrix();housing.setMatrixAt(index,obj.matrix);
  obj.position.y=2;obj.updateMatrix();poles.setMatrixAt(index,obj.matrix);
  for(let j=0;j<3;j++){obj.position.set(x-dx*.3,5.2-j*.6,z-dz*.3);obj.updateMatrix();lamps.setMatrixAt(index*3+j,obj.matrix);}
 }
 for(const m of [housing,poles,lamps])m.computeBoundingSphere();
 let last=-1;
 function update(time){if(Math.floor(time*5)===last)return;last=Math.floor(time*5);
  for(const s of signals)for(let direction=0;direction<4;direction++){
   const active=signalColor(s,direction%2,time);
   ['red','yellow','green'].forEach((name,j)=>lamps.setColorAt((s.id*4+direction)*3+j,color.set(active===name?colors[name]:dark)));
  }
  if(lamps.instanceColor)lamps.instanceColor.needsUpdate=true;
 }
 update(0);
 return {group,update,dispose(){for(const m of [housing,poles,lamps]){m.geometry.dispose();m.material.dispose();m.dispose();}group.clear();}};
}
