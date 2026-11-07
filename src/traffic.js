import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {project} from './rail-network.js';
import {createTramPriority} from './tram-priority.js';
import {createSignalNetwork,createSignalLayer,createRouteSignalControl,signalColor,approachSignal} from './traffic-signals.js';

export const roadWidths={motorway:17,trunk:14,primary:12,secondary:10,tertiary:8,minor:6,service:4,path:2};

// Connect shared road vertices, but never invent connections across a crossing.
export function createRoadGraph(features){
 const nodes=new Map(),edges=[],seen=new Set();
 function node(p,level){const key=`${Math.round(p.x*2)},${Math.round(p.z*2)},${level}`;if(!nodes.has(key))nodes.set(key,{...p,level,out:[]});return nodes.get(key);}
 for(const {properties:p,geometry:g} of features){
  if(p.layer!=='transportation'||!['motorway','trunk','primary','secondary','tertiary','minor'].includes(p.class)||p.subclass==='tram'||p.brunnel==='tunnel')continue;
  if(!['LineString','MultiLineString'].includes(g.type))continue;
  const level=`${p.brunnel||'ground'}:${p.layer_int||0}`;
  const oneWay=[1,'1','yes',true].includes(p.oneway)?1:[-1,'-1'].includes(p.oneway)?-1:0;
  for(const line of g.type==='LineString'?[g.coordinates]:g.coordinates){
   for(let i=1;i<line.length;i++){
    const a=node(project(line[i-1]),level),b=node(project(line[i]),level),length=Math.hypot(b.x-a.x,b.z-a.z);
    if(length<.5)continue;
    const key=[`${a.x},${a.z}`,`${b.x},${b.z}`].sort().join('|')+level;
    if(seen.has(key))continue;seen.add(key);
    const add=(from,to)=>{const edge={from,to,length,width:roadWidths[p.class],speed:p.class==='minor'?7:12};from.out.push(edge);edges.push(edge);};
    if(oneWay!==-1)add(a,b);if(oneWay!==1)add(b,a);
   }
  }
 }
 return edges;
}

const types=[
 {name:'sedan',width:1.8,length:4.5,height:1.45},
 {name:'hatchback',width:1.75,length:3.7,height:1.55},
 {name:'suv',width:1.95,length:4.8,height:1.85},
 {name:'bus',width:2.5,length:10.8,height:3.15},
 {name:'truck',width:2.45,length:8.4,height:3.4},
];

function vehicleGeometry(spec){
 const parts={paint:[],glass:[],dark:[],head:[],tail:[],trim:[]};
 const {width:w,length:l,height:h,name}=spec;
 const box=(part,x,y,z,px,py,pz)=>parts[part].push(new T.BoxGeometry(x,y,z).translate(px,py,pz));
 const bus=name==='bus',truck=name==='truck',large=bus||truck;
 box('dark',w*.87,.24,l*.91,0,.48,0);
 if(bus){
  box('paint',w,h-.65,l,0,(h+.65)/2,0);
  for(const side of [-1,1])for(let z=-l/2+.9;z<l/2-.5;z+=1.25)box('glass',.025,1.05,1.06,side*(w/2+.015),2.12,z);
  box('glass',w-.2,1.15,.035,0,2.12,l/2+.025);
  box('trim',w-.12,.12,l-.2,0,h+.05,0);
  // Two glazed passenger doors on the driver's right (local -X).
  for(const z of [l*.32,-l*.23]){box('dark',.04,2.15,1.12,-w/2-.04,1.65,z);box('glass',.05,1.45,.92,-w/2-.065,1.9,z);}
 }else if(truck){
  box('paint',w,2.35,2.25,0,1.85,l/2-1.125);
  box('glass',w-.25,.85,.04,0,2.35,l/2+.025);
  for(const side of [-1,1])box('glass',.035,.85,1.35,side*(w/2+.02),2.35,l/2-1.1);
  box('trim',w,h-.8,l-2.6,0,(h+.8)/2,-1.3);
  box('paint',w+.06,.16,l-2.5,0,.9,-1.3);
 }else{
  box('paint',w,.65,l,0,.82,0);
  const cabinLength=l*(name==='sedan'?.51:.65),cabinZ=name==='sedan'?-.1:-.22;
  box('glass',w*.87,h-1.02,cabinLength,0,(h+1.02)/2,cabinZ);
  box('paint',w*.91,.12,cabinLength+.08,0,h,cabinZ);
  for(const side of [-1,1])box('paint',.055,h-1.02,.13,side*w*.44,(h+1.02)/2,cabinZ);
 }
 const radius=large?.48:.32,axles=truck?[-l*.34,-l*.19,l*.33]:[-l*.32,l*.32];
 for(const z of axles)for(const side of [-1,1]){
  const wheel=new T.CylinderGeometry(radius,radius,.22,10);wheel.rotateZ(Math.PI/2);wheel.translate(side*w/2,radius+.13,z);parts.dark.push(wheel);
 }
 for(const side of [-1,1]){
  box('head',w*.23,.19,.045,side*w*.31,large?1.04:.8,l/2+.03);
  box('tail',w*.21,.19,.045,side*w*.32,large?1.04:.8,-l/2-.03);
 }
 return Object.entries(parts).filter(([,p])=>p.length).map(([part,p])=>{const geometry=mergeGeometries(p);p.forEach(g=>g.dispose());return {part,geometry};});
}

export function createTraffic(features,{count=6000,random=Math.random,initialTime=0}={}){
 const edges=createRoadGraph(features),group=new T.Group();group.name='Дорожный трафик';
 const railLines=features.filter(f=>f.properties.subclass==='tram'&&f.properties.layer==='transportation').flatMap(f=>(f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates).map(line=>line.map(project)));
 const signalNetwork=createSignalNetwork(edges,features),signalLayer=createSignalLayer(signalNetwork.signals,railLines);group.add(signalLayer.group);let time=initialTime;
 const vehicles=[],batches=[],cumulative=[];let total=0;
 for(const edge of edges){total+=edge.length;cumulative.push(total);}
 const pickEdge=()=>{const target=random()*total;let lo=0,hi=edges.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(cumulative[mid]<target)lo=mid+1;else hi=mid;}return edges[lo];};
 const palette=['#f1eee3','#353b43','#aab6be','#ce3e34','#2b70aa','#dfb931','#40846a','#763f59','#e67d37','#687b99'];
 const materials={paint:new T.MeshStandardMaterial({roughness:.42,metalness:.25}),glass:new T.MeshStandardMaterial({color:'#203e50',roughness:.25,metalness:.35}),dark:new T.MeshStandardMaterial({color:'#202329'}),trim:new T.MeshStandardMaterial({color:'#e0dfd4'}),head:new T.MeshStandardMaterial({color:'#fff4bf',emissive:'#ffe6a1',emissiveIntensity:.8}),tail:new T.MeshStandardMaterial({color:'#b52324',emissive:'#d81818',emissiveIntensity:.6})};
 if(edges.length){
  for(let i=0;i<count;i++){
   const r=random(),type=i<5?i:r<.33?0:r<.61?1:r<.82?2:r<.91?3:4;
   const edge=pickEdge(),speed=(.75+random()*.4)*(type>=3?.8:1);vehicles.push({type,edge,distance:random()*edge.length,speed,velocity:edge.speed*speed,planned:[],committed:new Map(),color:new T.Color(palette[Math.floor(random()*palette.length)])});
  }
 }
 for(let type=0;type<types.length;type++){
  const members=vehicles.filter(v=>v.type===type);if(!members.length)continue;
  const meshes=vehicleGeometry(types[type]).map(({part,geometry})=>{
   const mesh=new T.InstancedMesh(geometry,materials[part],members.length);mesh.name=`traffic-${types[type].name}-${part}`;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
   // The vehicles travel outside their initial bounds; avoid stale instance bounds.
   mesh.frustumCulled=false;
   if(part==='paint')members.forEach((v,i)=>mesh.setColorAt(i,v.color));
   group.add(mesh);return mesh;
  });
  batches.push({meshes,members});
 }
 const transform=new T.Object3D();
 function footprint(v,edge=v.edge,distance=v.distance){
  const spec=types[v.type],dx=(edge.to.x-edge.from.x)/edge.length,dz=(edge.to.z-edge.from.z)/edge.length;
  const lane=Math.min(edge.width/4,edge.width/2-spec.width/2-.15);
  return {id:v,speed:v.velocity,x:edge.from.x+dx*distance-dz*lane,z:edge.from.z+dz*distance+dx*lane,dx,dz,halfLength:spec.length/2,halfWidth:spec.width/2};
 }
 let carBodies=[];
 const priority=createTramPriority(()=>carBodies);
 function carPath(v){
  let offset=0;const result=[];
  for(const edge of [v.edge,...v.planned]){
   const at=result.length?0:v.distance,travel=Math.min(edge.length-at,65-offset);
   result.push({...footprint(v,edge,at),offset,travel});offset+=travel;if(offset>=65)break;
  }
  return result;
 }
 function plan(v){
  let ahead=v.edge.length-v.distance,edge=v.edge;
  for(const e of v.planned){ahead+=e.length;edge=e;}
  while(ahead<160&&v.planned.length<100){
   const choices=edge.to.out.filter(e=>e.to!==edge.from);
   const next=choices.length?choices[Math.floor(random()*choices.length)]:edge.to.out[0];
   if(!next)break;v.planned.push(next);ahead+=next.length;edge=next;
  }
 }
 function eventsAhead(v){
  const result=[],previousBySignal=new Map();let start=-v.distance;
  for(const edge of [v.edge,...v.planned]){
   for(const e of edge.signals){
    const at=start+e.at,previous=previousBySignal.get(e.signal);
    // Incoming and outgoing edges can both reference the same junction.
    // A turn obeys the entry phase, not the red phase of the cross street.
    // Keep a later visit after leaving the junction as a separate event.
    if(previous&&at-previous.at<e.signal.radius*2)continue;
    const event={...e,at};result.push(event);previousBySignal.set(e.signal,event);
   }
   start+=edge.length;
  }
  return result;
 }
 function update(dt){
  dt=Math.max(0,Math.min(dt,.1));time+=dt;signalLayer.update(time);
  if(dt>0){
   const lanes=new Map();
   for(const v of vehicles){plan(v);if(!lanes.has(v.edge))lanes.set(v.edge,[]);lanes.get(v.edge).push(v);}
   for(const lane of lanes.values())lane.sort((a,b)=>a.distance-b.distance);
   const moves=new Map();
   for(const v of vehicles){
    const half=types[v.type].length/2,events=eventsAhead(v);let gap=Infinity;
    const crossing=priority.carGap(footprint(v),carPath(v));
    for(const e of events){
     if(e.at < -e.signal.radius-half||v.committed.has(e.signal))continue;
     const stop=e.at-e.signal.radius-half-1;
     if(stop<-.05){v.committed.set(e.signal,e.at+e.signal.radius+half);e.signal.occupants.set(v,e.axis);continue;}
     if(!crossing.clearing&&signalColor(e.signal,e.axis,time)!=='green')gap=Math.min(gap,Math.max(0,stop));
    }
    // Queue behind a vehicle on this lane or on the planned continuation.
    let start=-v.distance;
    for(const edge of [v.edge,...v.planned]){
     const lane=lanes.get(edge)||[];
     let lo=0,hi=lane.length;
     while(lo<hi){const mid=(lo+hi)>>1;if(start+lane[mid].distance<=.01)lo=mid+1;else hi=mid;}
     const leader=lane[lo];
     if(leader&&leader!==v){gap=Math.min(gap,Math.max(0,start+leader.distance-half-types[leader.type].length/2-2));break;}
     start+=edge.length;
    }
    gap=Math.min(gap,crossing.gap);
    const move=approachSignal(v.velocity,gap,dt,{maxSpeed:v.edge.speed*v.speed,acceleration:1.6,deceleration:3});
    moves.set(v,move);
    for(const e of events){const stop=e.at-e.signal.radius-half-1;if(stop>=-.05&&move.travel>stop&&signalColor(e.signal,e.axis,time)==='green'){v.committed.set(e.signal,e.at+e.signal.radius+half);e.signal.occupants.set(v,e.axis);}}
   }
   for(const v of vehicles){
    const move=moves.get(v);v.velocity=move.speed;v.distance+=move.travel;
    for(const [signal,remaining] of v.committed){if(remaining<=move.travel){v.committed.delete(signal);signal.occupants.delete(v);}else v.committed.set(signal,remaining-move.travel);}
    while(v.distance>v.edge.length){
     v.distance-=v.edge.length;
     const next=v.planned.shift();v.edge=next||pickEdge();if(!next){v.distance=0;for(const signal of v.committed.keys())signal.occupants.delete(v);v.committed.clear();}
    }
   }
  }
  carBodies=vehicles.map(v=>footprint(v));
  for(const {members,meshes} of batches){
   members.forEach((v,i)=>{
    const e=v.edge,dx=(e.to.x-e.from.x)/e.length,dz=(e.to.z-e.from.z)/e.length;
    const lane=Math.min(e.width/4,e.width/2-types[v.type].width/2-.15);
    transform.position.set(e.from.x+dx*v.distance-dz*lane,.14,e.from.z+dz*v.distance+dx*lane);
    transform.rotation.y=Math.atan2(dx,dz);transform.updateMatrix();
    for(const mesh of meshes)mesh.setMatrixAt(i,transform.matrix);
   });
   for(const mesh of meshes)mesh.instanceMatrix.needsUpdate=true;
  }
 }
 function dispose(){signalLayer.dispose();for(const {meshes} of batches)for(const mesh of meshes){mesh.geometry.dispose();mesh.dispose();}Object.values(materials).forEach(m=>m.dispose());group.clear();}
 update(0);
 return {group,update,dispose,createRouteControl(points){return priority.wrap(points,createRouteSignalControl(points,signalNetwork));},get time(){return time;},get signalCount(){return signalNetwork.signals.length;},get count(){return vehicles.length;}};
}
