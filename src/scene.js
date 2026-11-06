import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { routePoints, locations } from './data.js';
import { createStopLayer } from './stops.js';

const material=(color)=>new T.MeshStandardMaterial({color,roughness:.78});
const mat = { cream:material('#f2e8d1'), glass:material('#294951'), roof:material('#707b77'), dark:material('#273d3b'), rail:material('#8b928b'), white:material('#fff2d5'), green:material('#477c60') };
function box(parent,w,h,d,x,y,z,m){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function cylinder(parent,r1,r2,h,x,y,z,m,n=12){const mesh=new T.Mesh(new T.CylinderGeometry(r1,r2,h,n),m);mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;}
export function makeTram(spec){
 const g=new T.Group();const paint=material(spec.color);g.name=spec.name;
 for(let s=0;s<spec.sections;s++){
  const z=(s-(spec.sections-1)/2)*(spec.length+.7),l=spec.length;
  // Forward is local +Z, so the driver's right side is local -X.
  const doorCount=Math.round(spec.doors/spec.sections);
  const doorCenters=Array.from({length:doorCount},(_,d)=>z-l/2+1.6+d*(l-3)/Math.max(1,doorCount-1));
  box(g,3.2,.28,l,0,.85,z,paint);
  box(g,.14,2.5,l,1.56,2,z,paint);box(g,.16,1.2,l,1.57,2.35,z,mat.cream);
  let edge=z-l/2;
  for(const end of [...doorCenters.map(d=>d-.62),z+l/2]){
   if(end>edge){box(g,.14,2.5,end-edge,-1.56,2,(edge+end)/2,paint);box(g,.16,1.2,end-edge,-1.57,2.35,(edge+end)/2,mat.cream);}
   edge=end+1.24;
  }
  box(g,3.2,.45,l,0,3.17,z,paint);
  box(g,3.1,.35,l+.1,0,3.43,z,mat.roof);
  for(let side of [-1,1]){
   for(let j=0;j<Math.floor(l/1.7);j++) {const wz=z-l/2+1.1+j*1.7;if(side===-1&&doorCenters.some(d=>Math.abs(d-wz)<1.25))continue;box(g,.04,.93,1.25,side*1.65,2.48,wz,mat.glass);}
   if(side===-1)for(const dz of doorCenters){
    // Two leaves slide apart along the body; the opening has no solid wall.
    for(const direction of [-1,1]){
     const closedZ=dz+direction*.295;
     const door=box(g,.09,2.05,.57,-1.7,1.85,closedZ,paint);
     door.name='Правая раздвижная дверь';door.userData={door:true,closedZ,direction};
     box(door,.025,1.18,.43,-.058,.28,0,mat.glass);
     box(door,.025,.17,.07,-.07,-.37,-direction*.18,mat.cream);
    }
    box(g,.22,.1,1.24,-1.68,.84,dz,mat.dark);
   }
   for(let wz of [-l*.3,l*.3]){const wheel=cylinder(g,.48,.48,.25,side*1.48,.65,z+wz,mat.dark);wheel.rotation.z=Math.PI/2;}
  }
  for(let end of [-1,1]) {box(g,3.2,1.3,.15,0,1.4,z+end*l/2,paint);box(g,2.7,.96,.04,0,2.5,z+end*(l/2+.04),mat.glass);for(let x of [-1,1]) box(g,.4,.25,.08,x,1.4,z+end*(l/2+.12),mat.white);}
  if(s<spec.sections-1)box(g,2.8,2.6,.65,0,2,z+l/2+.35,mat.dark);
 }
 const p=new T.Group();p.position.y=3.65;g.add(p);
 for(let side of [-1,1]){const arm=box(p,.08,1.7,.09,side*.38,.7,0,mat.dark);arm.rotation.z=side*.5;}
 box(p,1.7,.09,.16,0,1.48,0,mat.dark);
 g.userData.frontOffset=(spec.length*spec.sections+(spec.sections-1)*.7)/2+.3;
 return g;
}
export function animateTramDoors(tram,open,dt){
 const target=open?1:0,previous=tram.userData.doorOpen||0;
 const amount=previous+Math.sign(target-previous)*Math.min(Math.abs(target-previous),dt*1.8);
 tram.userData.doorOpen=amount;
 tram.traverse(o=>{if(o.userData.door){o.position.z=o.userData.closedZ+o.userData.direction*.62*amount;o.position.x=-1.7-.12*amount;}});
}
export function createWorld(container,onError){
 const scene=new T.Scene();scene.background=new T.Color('#d5e2db');scene.fog=new T.Fog('#d5e2db',370,850);
 let renderer;
 try{renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true,logarithmicDepthBuffer:true});}catch(error){onError(error);return null;}
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
 renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;container.append(renderer.domElement);
 const camera=new T.PerspectiveCamera(42,1,.1,1600);camera.position.set(240,220,310);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,0,10);controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2-.08;controls.minDistance=12;controls.maxDistance=650;
 scene.add(new T.HemisphereLight('#fff9e9','#66745e',2.7));
 const sun=new T.DirectionalLight('#ffedcb',3.3);sun.position.set(-130,240,120);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-230,right:230,top:230,bottom:-230,far:650});sun.shadow.bias=-.001;scene.add(sun);
 let city=new T.Group();city.name='Стилизованная Казань';scene.add(city);
 box(city,650,1,650,0,-.65,0,material('#b4c1a4'));
 box(city,650,.15,100,0,-.05,-220,material('#7faeb0'));
 // Boulevards, sidewalks, double rails and overhead poles.
 for(let pos=-120;pos<=120;pos+=60)for(let axis=0;axis<2;axis++){
  const street=new T.Group();if(axis)street.rotation.y=Math.PI/2;street.position.x=axis?0:pos;street.position.z=axis?pos:0;city.add(street);
  box(street,19,.15,310,0,.02,0,material('#9d9f92'));
  for(let side of [-1,1]){box(street,2.8,.25,310,side*11,.08,0,mat.cream);for(let offset of [-.8,.8])box(street,.12,.12,310,side*2+offset,.18,0,mat.rail);}
  for(let z=-145;z<155;z+=30){cylinder(street,.12,.17,8,9,4,z,mat.dark);box(street,9,.08,.08,4.5,7.8,z,mat.dark);}
 }
 // Deterministic neighbourhoods: no random layout changes on reload.
 let seed=42;const rnd=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 const colors=['#e8d7b7','#c8b29b','#e7ded0','#b7c3b8','#d6ad90'];
 for(let x=-90;x<=90;x+=60)for(let z=-90;z<=90;z+=60){
  if((x===-30&&z===-90)||(x===90&&z===-30))continue;
  for(let dx of [-12,12])for(let dz of [-12,12]){
   const h=8+Math.floor(rnd()*5)*3,bx=x+dx,bz=z+dz;
   box(city,18,h,19,bx,h/2,bz,material(colors[Math.floor(rnd()*colors.length)]));box(city,19,.7,20,bx,h+.35,bz,mat.roof);
   for(let floor=0;floor<h/3-1;floor++)for(let w=-1;w<=1;w++){
    box(city,2,1.4,.06,bx+w*4,3+floor*3,bz+9.53,mat.glass);
    box(city,.06,1.4,2,bx+9.03,3+floor*3,bz+w*4,mat.glass);
   }
  }
 }
 function tree(x,z){cylinder(city,.3,.45,3,x,1.5,z,material('#786a50'));const crown=new T.Mesh(new T.IcosahedronGeometry(3.3,1),material(rnd()>.5?'#63875e':'#799561'));crown.position.set(x,5,z);crown.castShadow=true;city.add(crown);}
 for(let i=0;i<95;i++){const x=-150+rnd()*300,z=-150+rnd()*300;if(Math.abs(x%60)>16&&Math.abs(z%60)>16)tree(x,z);}
 // A small architectural interpretation of the Kremlin and Kul Sharif.
 const kremlin=new T.Group();kremlin.position.set(-30,0,-90);city.add(kremlin);
 box(kremlin,35,1,35,0,.6,0,mat.cream);box(kremlin,17,12,17,0,6,0,mat.white);
 const blue=material('#448e9c');const dome=new T.Mesh(new T.SphereGeometry(6,20,12,0,Math.PI*2,0,Math.PI/2),blue);dome.position.y=14;kremlin.add(dome);cylinder(kremlin,5.8,5.8,3,0,12.8,0,mat.white);
 for(let x of [-12,12])for(let z of [-12,12]){cylinder(kremlin,.9,1.3,23,x,11.5,z,mat.white);cylinder(kremlin,0,1.5,5,x,25,z,blue);}
 for(let z of [-19,19])box(kremlin,43,4,1.5,0,2,z,mat.white);
 for(let x of [-20,20]){box(kremlin,1.5,4,39,x,2,0,mat.white);cylinder(kremlin,0,3,6,x,10,19,material('#8b6348'));box(kremlin,5,7,5,x,5.5,19,mat.white);}
 for(let x=72;x<110;x+=9)for(let z=-46;z<-14;z+=9)tree(x,z);
 let stopLayer=createStopLayer(locations.map(s=>({...s,angle:0})));city.add(stopLayer.group);
 let tram=null, routeGroup=new T.Group(), segments=[],totalLength=0, mode='orbit',importedCity=null;scene.add(routeGroup);
 let activePoints=[],routeBounds=null,frameTime=performance.now();
 function setTram(spec){if(tram){scene.remove(tram);dispose(tram);}tram=makeTram(spec);scene.add(tram);}
 function dispose(group){group.traverse(o=>{o.geometry?.dispose();if(o.isSprite){o.material.map?.dispose();o.material.dispose();}if(o.isLine2)o.material.dispose();});}
 function fitRoute(){if(!routeBounds)return;const center=routeBounds.getCenter(new T.Vector3()),radius=Math.max(35,routeBounds.getSize(new T.Vector3()).length()/2);const fov=Math.min(camera.fov*Math.PI/180,2*Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect));const distance=radius/Math.sin(fov/2)*1.22;controls.target.copy(center);camera.position.copy(center).add(new T.Vector3(.48,.9,.75).normalize().multiplyScalar(distance));}
 function setRoute(stops){scene.remove(routeGroup);dispose(routeGroup);routeGroup=new T.Group();scene.add(routeGroup);const points=routePoints(stops);segments=[];totalLength=0;
  activePoints=points;routeBounds=new T.Box3().setFromPoints(points.map(p=>new T.Vector3(p.x,0,p.z)));
  for(let i=1;i<points.length;i++){const a=new T.Vector3(points[i-1].x,.25,points[i-1].z),b=new T.Vector3(points[i].x,.25,points[i].z),length=a.distanceTo(b);segments.push({a,b,length,start:totalLength});totalLength+=length;
  }
  const positions=points.flatMap(p=>[p.x,.6,p.z]);
  for(const [width,color,order] of [[9,'#fff9de',80],[5,'#258966',81]]){const geometry=new LineGeometry();geometry.setPositions(positions);const line=new Line2(geometry,new LineMaterial({color,linewidth:width,depthTest:false,depthWrite:false,transparent:true,opacity:.96}));line.renderOrder=order;line.frustumCulled=false;routeGroup.add(line);}
  stopLayer.setRoute(points);if(mode==='orbit')fitRoute();
 }
 function update(distance,doors){if(!tram||!segments.length)return;const now=performance.now(),dt=Math.min(.1,(now-frameTime)/1000);frameTime=now;const d=Math.min(totalLength,Math.max(0,distance));const seg=segments.find(s=>d<=s.start+s.length)||segments.at(-1);tram.position.copy(seg.a).lerp(seg.b,(d-seg.start)/seg.length);tram.rotation.y=Math.atan2(seg.b.x-seg.a.x,seg.b.z-seg.a.z);
  animateTramDoors(tram,doors,dt);
  if(mode==='follow'){const offset=new T.Vector3(-20,14,-27).applyAxisAngle(new T.Vector3(0,1,0),tram.rotation.y);camera.position.lerp(tram.position.clone().add(offset),1-Math.exp(-dt*7));controls.target.lerp(tram.position.clone().add(new T.Vector3(0,2,0)),1-Math.exp(-dt*10));}
  if(mode==='cab'){const front=tram.userData.frontOffset||12;camera.position.copy(tram.position).add(new T.Vector3(0,2.8,front).applyAxisAngle(new T.Vector3(0,1,0),tram.rotation.y));controls.target.copy(tram.position).add(new T.Vector3(0,2.6,front+30).applyAxisAngle(new T.Vector3(0,1,0),tram.rotation.y));}
  for(const line of routeGroup.children){line.material.depthTest=mode!=='orbit';line.material.opacity=mode==='orbit'?.96:.7;}
  if(mode==='orbit')controls.update();else camera.lookAt(controls.target);stopLayer.update(camera,container.clientWidth,container.clientHeight,mode);renderer.render(scene,camera);
 }
 const resize=()=>{const {width,height}=container.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();};new ResizeObserver(resize).observe(container);resize();
 let geographic=false,geoCenter=new T.Vector3();
 return {setTram,setRoute,update,get length(){return totalLength;},get routeStops(){return stopLayer.routeStops;},setStops(stops){city.remove(stopLayer.group);dispose(stopLayer.group);stopLayer=createStopLayer(stops);city.add(stopLayer.group);stopLayer.setRoute(activePoints);},setGeography(group,center){scene.remove(city);dispose(city);city=group;scene.add(city);geographic=true;geoCenter.set(center.x,0,center.z);scene.fog.near=8000;scene.fog.far=28000;camera.near=10;camera.far=40000;camera.updateProjectionMatrix();controls.minDistance=80;controls.maxDistance=40000;controls.target.copy(geoCenter);camera.position.copy(geoCenter).add(new T.Vector3(1900,2200,2300));sun.castShadow=false;renderer.toneMappingExposure=.95;},setCamera(value){mode=value;controls.enabled=value==='orbit';if(geographic){camera.near=value==='orbit'?10:.1;camera.far=value==='orbit'?40000:8000;camera.updateProjectionMatrix();}if(value==='orbit')fitRoute();},setNight(night){scene.background.set(night?'#1c3444':'#d5e2db');scene.fog.color.copy(scene.background);sun.intensity=night?.35:3.3;renderer.toneMappingExposure=night?.7:geographic?.95:1.25;},
  async importModel(file,type){const url=URL.createObjectURL(file);try{const result=await new GLTFLoader().loadAsync(url);const obj=result.scene;const bounds=new T.Box3().setFromObject(obj),size=bounds.getSize(new T.Vector3());const max=Math.max(size.x,size.y,size.z);if(!max)throw Error('Модель пустая');obj.scale.setScalar((type==='tram'?20:310)/max);const normalized=new T.Box3().setFromObject(obj);const center=normalized.getCenter(new T.Vector3());obj.position.set(-center.x,-normalized.min.y,-center.z);const wrapper=new T.Group();wrapper.add(obj);if(type==='tram'){scene.remove(tram);dispose(tram);tram=wrapper;scene.add(tram);}else{if(importedCity){scene.remove(importedCity);dispose(importedCity);}city.visible=false;importedCity=wrapper;scene.add(wrapper);}}finally{URL.revokeObjectURL(url);}},
  async exportModel(type){const data=await new GLTFExporter().parseAsync(type==='tram'?tram:city,{binary:true,onlyVisible:true});const url=URL.createObjectURL(new Blob([data],{type:'model/gltf-binary'}));const a=document.createElement('a');a.href=url;a.download=type==='tram'?'kazan-tram.glb':'kazan-stylized.glb';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 };
}
