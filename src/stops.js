import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {project} from './rail-network.js';
import {railClearance,placeBesideRails} from './clearance.js';

export function nearestOnPath(point,points){
 let best={distance:Infinity,along:0,x:point.x,z:point.z,angle:0},along=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(!length)continue;
  const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(length*length)));
  const x=a.x+t*dx,z=a.z+t*dz,distance=Math.hypot(point.x-x,point.z-z);
  if(distance<best.distance)best={distance,along:along+t*length,x,z,angle:Math.atan2(dx,dz)};
  along+=length;
 }
 return best;
}
export function extractStops(features,network){
 const result=[],seen=new Set(),clear=railClearance(network.lines);
 for(const f of features){if(f.properties.subclass!=='tram_stop'||f.geometry.type!=='Point'||!f.properties.name)continue;
  const point=project(f.geometry.coordinates),name=f.properties['name:ru']||f.properties.name;
  const key=`${name}:${Math.round(point.x)}:${Math.round(point.z)}`;if(seen.has(key))continue;seen.add(key);
  let nearest={distance:Infinity};for(const line of network.lines){const candidate=nearestOnPath(point,line);if(candidate.distance<nearest.distance)nearest=candidate;}
  // Orient the open side toward the tracks; keep platforms outside the swept path.
  let angle=nearest.angle||0;const right={x:-Math.cos(angle),z:Math.sin(angle)};
  if((point.x-nearest.x)*right.x+(point.z-nearest.z)*right.z<0)angle+=Math.PI;
  const platform=placeBesideRails(point,angle,clear,{halfLength:5,halfWidth:1.6});
  if(platform)result.push({name,x:platform.x,z:platform.z,angle:platform.angle});
 }
 return result;
}

function textTexture(name,plaque=false){
 const canvas=document.createElement('canvas');canvas.width=640;canvas.height=plaque?150:112;
 const ctx=canvas.getContext('2d');ctx.fillStyle=plaque?'#173f35':'#fffdf0';ctx.beginPath();ctx.roundRect(2,2,636,canvas.height-4,plaque?4:18);ctx.fill();
 if(!plaque){ctx.strokeStyle='#4b826b';ctx.lineWidth=3;ctx.stroke();}
 ctx.textAlign='center';ctx.textBaseline='middle';
 if(plaque){ctx.font='bold 23px "Segoe UI", sans-serif';ctx.fillStyle='#a6d2ba';ctx.fillText('ТРАМВАЙНАЯ ОСТАНОВКА',320,32);}
 let size=plaque?39:40;ctx.font=`600 ${size}px "Segoe UI", sans-serif`;while(ctx.measureText(name).width>594&&size>15){size--;ctx.font=`600 ${size}px "Segoe UI", sans-serif`;}
 ctx.fillStyle=plaque?'#ffffff':'#214e3c';ctx.fillText(name,320,plaque?94:56);
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;return texture;
}
export function createStopLayer(stops){
 const group=new T.Group();group.name='Трамвайные остановки с названиями';
 const steel=new T.MeshStandardMaterial({color:'#344c48',roughness:.65});
 const concrete=new T.MeshStandardMaterial({color:'#c6c4b6'});
 const roof=new T.MeshStandardMaterial({color:'#416653',metalness:.3,roughness:.6});
 const glass=new T.MeshStandardMaterial({color:'#a1c9c1',transparent:true,opacity:.46,roughness:.24,depthWrite:false});
 const wood=new T.MeshStandardMaterial({color:'#a07b51'});
 const paving=new T.MeshStandardMaterial({color:'#d8bd61'});
 const batches=new Map(),records=[];
 function addBox(parent,w,h,d,x,y,z,material){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);parent.add(mesh);return mesh;}
 const dotCanvas=document.createElement('canvas');dotCanvas.width=64;dotCanvas.height=64;const dc=dotCanvas.getContext('2d');dc.fillStyle='#fffdf0';dc.beginPath();dc.arc(32,32,29,0,Math.PI*2);dc.fill();dc.fillStyle='#258966';dc.beginPath();dc.arc(32,32,20,0,Math.PI*2);dc.fill();const dotTexture=new T.CanvasTexture(dotCanvas);
 for(const stop of stops){
  const shelter=new T.Group();shelter.position.set(stop.x,0,stop.z);shelter.rotation.y=stop.angle||0;
  addBox(shelter,3.2,.24,10,0,.23,0,concrete);
  addBox(shelter,.3,.03,9.6,1.25,.365,0,paving);
  addBox(shelter,2.8,.18,6.8,-.1,3.1,0,roof);
  for(const z of [-3,0,3])addBox(shelter,.1,2.65,.1,-1.17,1.74,z,steel);
  for(const z of [-3,3]){addBox(shelter,.1,2.65,.1,1.02,1.74,z,steel);addBox(shelter,2.1,2.3,.04,-.08,1.7,z,glass);}
  addBox(shelter,.04,2.3,5.9,-1.18,1.7,0,glass);
  addBox(shelter,.72,.13,3.9,-.55,.92,0,wood);addBox(shelter,.12,.65,3.9,-.92,1.23,0,wood);
  for(const z of [-1.6,1.6])addBox(shelter,.12,.55,.13,-.6,.58,z,steel);
  addBox(shelter,.1,3.6,.1,.9,2.1,4.2,steel);
  const busSign=addBox(shelter,.1,.85,.72,.9,3.65,4.2,roof);
  addBox(busSign,.025,.48,.42,.064,0,0,paving);
  addBox(shelter,.12,.9,.65,-.92,1.7,2.15,concrete);
  shelter.updateMatrixWorld(true);
  shelter.traverse(mesh=>{if(!mesh.isMesh)return;const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);if(!batches.has(mesh.material))batches.set(mesh.material,[]);batches.get(mesh.material).push(geometry);mesh.geometry.dispose();});
  const sign=new T.Mesh(new T.PlaneGeometry(6.2,.85),new T.MeshBasicMaterial({map:textTexture(stop.name,true),side:T.DoubleSide}));sign.position.set(1.08,3.03,0);sign.rotation.y=Math.PI/2;sign.applyMatrix4(shelter.matrixWorld);sign.name=stop.name;group.add(sign);
  const label=new T.Sprite(new T.SpriteMaterial({map:textTexture(stop.name),depthTest:false,depthWrite:false}));label.position.set(stop.x,5,stop.z);label.renderOrder=101;group.add(label);
  const marker=new T.Sprite(new T.SpriteMaterial({map:dotTexture,depthTest:false,depthWrite:false}));marker.position.set(stop.x,.7,stop.z);marker.renderOrder=100;group.add(marker);
  records.push({...stop,label,marker,active:false,along:0});
 }
 for(const [material,geometries] of batches){const mesh=new T.Mesh(mergeGeometries(geometries),material);mesh.receiveShadow=true;mesh.castShadow=true;group.add(mesh);geometries.forEach(g=>g.dispose());}
 let routeStops=[];
 return {group,get routeStops(){return routeStops;},setRoute(points){
  for(const record of records){const match=nearestOnPath(record,points);record.active=match.distance<38;record.along=match.along;}
  routeStops=[];for(const r of records.filter(r=>r.active).sort((a,b)=>a.along-b.along)){if(!routeStops.some(s=>s.name===r.name&&Math.abs(s.along-r.along)<100))routeStops.push({name:r.name,along:r.along});}
 },update(camera,width,height,mode){
  const occupied=mode==='orbit'?[{left:width-Math.min(280,width*.6),right:width,top:50,bottom:135}]:[{left:0,right:300,top:55,bottom:150}],view=new T.Vector3();const factor=2*Math.tan(camera.fov*Math.PI/360)/Math.max(1,height);
  for(const r of [...records].sort((a,b)=>Number(b.active)-Number(a.active)||a.along-b.along)){
   const distance=camera.position.distanceTo(r.label.position);r.label.visible=false;r.marker.visible=false;
   if(!r.active&&distance>180)continue;
   view.copy(r.label.position).project(camera);if(view.z< -1||view.z>1||Math.abs(view.x)>1||Math.abs(view.y)>1)continue;
   const px=(view.x+1)*width/2,py=(1-view.y)*height/2;
   const labelWidth=Math.min(176,Math.max(100,r.name.length*6.1)),labelHeight=labelWidth*112/640;
   const rect={left:px-labelWidth/2,right:px+labelWidth/2,top:py-labelHeight-12,bottom:py-10};
   const units=distance*factor;
   r.marker.visible=r.active;r.marker.scale.setScalar(units*(mode==='orbit'?12:8));
   if(rect.left<5||rect.right>width-5||rect.top<52||rect.bottom>height-100||occupied.some(b=>rect.left<b.right+5&&rect.right>b.left-5&&rect.top<b.bottom+5&&rect.bottom>b.top-5))continue;
   r.label.visible=true;r.label.scale.set(labelWidth*units,labelHeight*units,1);r.label.center.set(.5,-.25);occupied.push(rect);
  }
 }};
}
