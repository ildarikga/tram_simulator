import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createRailNetwork,project} from './rail-network.js';

// Positions identify polygons, not the IDs of aggregated vector-tile features.
// Reference-backed traits and estimated dimensions are documented separately.
export const stationLandmarks=[
 {id:'kazan-station',name:'Вокзал Казань',point:[49.10015,55.78822],style:'station',colour:'#a34f38',height:10.5,
  source:'https://kazan.dzvr.ru/',confirmed:['красный кирпич','светлый декор','арочные проёмы','ступенчатый силуэт'],estimated:['размеры','количество проёмов','детали крыши']},
 {id:'volga-hotel',name:'Гостиница «Волга»',point:[49.0973,55.79328],style:'hotel',colour:'#a8bec5',
  source:'https://volga-hotel.ru/',confirmed:['адрес и расположение'],estimated:['цвет','сетка окон','вход','декор']},
];

export function stationPilotPath(features,network=createRailNetwork(features)){
 if(!network.nodes.length)return [];
 const stop=features.find(f=>f.properties.subclass==='tram_stop'&&f.properties.name==='Железнодорожный вокзал');
 const path=network.between(project(stop?.geometry.coordinates||[49.1007,55.7874]),project([49.095,55.817]));
 const result=[path[0]];let length=0;
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],segment=Math.hypot(b.x-a.x,b.z-a.z);
  if(length+segment>=800){const t=(800-length)/segment;result.push({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});break;}
  result.push(b);length+=segment;
 }
 return result;
}

function contains(ring,p){
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a.x>p.x)!==(b.x>p.x)&&p.z<(b.z-a.z)*(p.x-a.x)/(b.x-a.x)+a.z)inside=!inside;
 }
 return inside;
}
function distanceToPath(p,path){
 let best=Infinity;
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],dx=b.x-a.x,dz=b.z-a.z;
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz||1)));
  best=Math.min(best,Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz));
 }
 return best;
}
export function buildingKey(coords){
 // Stable under ring rotation and reversal; independent of tile order and IDs.
 return coords[0].slice(0,-1).map(c=>c.map(n=>n.toFixed(7)).join(',')).sort().join(';');
}
function seedOf(text){let seed=2166136261;for(const c of text)seed=Math.imul(seed^c.charCodeAt(0),16777619);return seed>>>0;}
function colour(value,fallback){return new T.Color(typeof value==='string'&&/^(#[\da-f]{3,8}|[a-z]+)$/i.test(value)?value:fallback);}
function brickTexture(){
 const pixels=new Uint8Array(128*128*4);
 for(let y=0;y<128;y++)for(let x=0;x<128;x++){
  const row=Math.floor(y/16),joint=y%16===0||(x+(row%2)*32)%64===0;
  const shade=joint?235:185+((x*13+y*17)%27),i=(y*128+x)*4;
  pixels[i]=pixels[i+1]=pixels[i+2]=shade;pixels[i+3]=255;
 }
 const texture=new T.DataTexture(pixels,128,128);texture.wrapS=texture.wrapT=T.RepeatWrapping;
 texture.colorSpace=T.SRGBColorSpace;texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;texture.needsUpdate=true;return texture;
}

// Vertex-coloured batches keep the number of draw calls independent of windows.
class Surfaces{
 constructor(){this.positions=[];this.colours=[];}
 quad(points,value){const c=colour(value,'#ffffff');for(const i of [0,1,2,0,2,3]){this.positions.push(...points[i]);this.colours.push(c.r,c.g,c.b);}}
 rect(edge,s,y,w,h,value,offset=.045){
  const {a,ux,uz,nx,nz}=edge,x=a.x+ux*s+nx*offset,z=a.z+uz*s+nz*offset;
  this.quad([[x-ux*w/2,y-h/2,z-uz*w/2],[x+ux*w/2,y-h/2,z+uz*w/2],[x+ux*w/2,y+h/2,z+uz*w/2],[x-ux*w/2,y+h/2,z-uz*w/2]],value);
 }
 box(edge,s,y,w,h,depth,value){
  const {a,ux,uz,nx,nz}=edge;const pts=[];
  for(const [u,v,n] of [[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]])
   pts.push([a.x+ux*(s+u*w/2)+nx*(.025+n*depth),y+v*h/2,a.z+uz*(s+u*w/2)+nz*(.025+n*depth)]);
  for(const face of [[4,5,6,7],[0,4,7,3],[5,1,2,6],[3,7,6,2],[0,1,5,4]])this.quad(face.map(i=>pts[i]),value);
 }
 arch(edge,s,bottom,w,h,value,offset){
  const radius=w/2,shoulder=bottom+h-radius;
  this.rect(edge,s,(bottom+shoulder)/2,w,shoulder-bottom,value,offset);
  const {a,ux,uz,nx,nz}=edge;
  const point=(x,y)=>[a.x+ux*(s+x)+nx*offset,y,a.z+uz*(s+x)+nz*offset];
  const center=point(0,shoulder);
  for(let i=0;i<12;i++){
   const t=i*Math.PI/12,u=(i+1)*Math.PI/12;
   this.quad([center,point(Math.cos(t)*radius,shoulder+Math.sin(t)*radius),point(Math.cos(u)*radius,shoulder+Math.sin(u)*radius),center],value);
  }
 }
 geometry(withUV=false){
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(this.positions,3));g.setAttribute('color',new T.Float32BufferAttribute(this.colours,3));g.computeVertexNormals();
  if(withUV){
   const uv=[];
   for(let i=0;i<this.positions.length;i+=18){
    const x=this.positions[i],y=this.positions[i+1],z=this.positions[i+2],dx=this.positions[i+3]-x,dz=this.positions[i+5]-z,length=Math.hypot(dx,dz)||1;
    for(let j=0;j<18;j+=3)uv.push(((this.positions[i+j]-x)*dx+(this.positions[i+j+2]-z)*dz)/length,this.positions[i+j+1]-y);
   }
   g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  }
  return g;
 }
}

export function createBuildingMaterials(){
 const wallMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.87,side:T.DoubleSide});
 const trimMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.72,side:T.DoubleSide});
 const glassMaterial=new T.MeshStandardMaterial({vertexColors:true,roughness:.3,metalness:.25,side:T.DoubleSide});
 const brickMaterial=new T.MeshStandardMaterial({vertexColors:true,map:brickTexture(),roughness:.92,side:T.DoubleSide});
 return [wallMaterial,trimMaterial,glassMaterial,brickMaterial];
}
export function createStationDistrict(path){return createBuildingDistrict(path);}

export function createBuildingDistrict(path,{includeBodies=true,select,distanceAt,simplified=false,materials=createBuildingMaterials()}={}){
 const group=new T.Group();group.name=includeBodies?'Маршрут 5 · вокзальный квартал':'Фасады вдоль маршрутов';
 const tiles=new Map(),seen=new Set(),records=[];
 const [wallMaterial,trimMaterial,glassMaterial,brickMaterial]=materials;group.ownedMaterials=materials;
 let windowCount=0,doorCount=0;
 const minX=Math.min(...path.map(p=>p.x))-200,maxX=Math.max(...path.map(p=>p.x))+200;
 const minZ=Math.min(...path.map(p=>p.z))-260,maxZ=Math.max(...path.map(p=>p.z))+200;
 function tileAt(center){
  const key=`${Math.floor(center.x/180)}:${Math.floor(center.z/180)}`;
  if(!tiles.has(key))tiles.set(key,{center:{x:(Math.floor(center.x/180)+.5)*180,z:(Math.floor(center.z/180)+.5)*180},bodies:[],walls:new Surfaces(),bricks:new Surfaces(),solids:new T.Group(),trim:new Surfaces(),glass:new Surfaces(),extra:new T.Group()});
  return tiles.get(key);
 }
 function add(coords,p){
  const ring=coords[0].slice(0,-1).map(project);
  if(ring.length<3||!(select?select(coords):ring.some(v=>v.x>=minX&&v.x<=maxX&&v.z>=minZ&&v.z<=maxZ)))return false;
  const landmark=stationLandmarks.find(l=>contains(ring,project(l.point))&&!coords.slice(1).some(h=>contains(h.map(project),project(l.point))));
  const edges=[];let area=0;
  for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];area+=a.x*b.z-b.x*a.z;}
  let distance=Infinity;
  for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<.05)continue;
   const ux=(b.x-a.x)/length,uz=(b.z-a.z)/length,sign=area>0?1:-1;
   const edge={a,ux,uz,nx:uz*sign,nz:-ux*sign,length};
   const middle={x:(a.x+b.x)/2,z:(a.z+b.z)/2};
   edge.distance=distanceAt?distanceAt(middle):distanceToPath(middle,path);
   distance=Math.min(distance,edge.distance,distanceToPath(a,path));edges.push(edge);
  }
  if(!select&&!landmark&&distance>140)return false;
  const key=buildingKey(coords),base=Math.max(0,Number(p.render_min_height)||0);
  const top=Math.max(base+.5,landmark?.height||Number(p.render_height)||9),height=top-base;
  const dedupKey=`${key}/${base}/${top}`;if(seen.has(dedupKey))return true;seen.add(dedupKey);
  const seed=seedOf(key),style=landmark?.style||(Math.abs(area)<16?'utility':height>=14?'panel':seed%3===0?'brick':'plaster');
  const wall=colour(landmark?.colour||p.colour,['#d4c3aa','#cab6a4','#c2c6bb','#d9cdbb'][seed%4]);
  const center={x:ring.reduce((s,v)=>s+v.x,0)/ring.length,z:ring.reduce((s,v)=>s+v.z,0)/ring.length};
  const tile=tileAt(center),trim=tile.trim,glass=tile.glass;
  const shape=new T.Shape(ring.map(v=>new T.Vector2(v.x,-v.z)));
  for(const hole of coords.slice(1))shape.holes.push(new T.Path(hole.map(c=>{const v=project(c);return new T.Vector2(v.x,-v.z);}))); 
  const body=includeBodies?new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}):new T.ShapeGeometry(shape);
  body.rotateX(-Math.PI/2);body.translate(0,includeBodies?base:top+.015,0);
  const roof=colour(style==='station'?'#616c70':'#788080','#788080');
  const colors=[];for(let i=0;i<body.attributes.position.count;i++){const c=body.attributes.normal.getY(i)>.5?roof:wall;colors.push(c.r,c.g,c.b);}
  body.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  if(includeBodies&&(style==='station'||style==='brick')){
   const mesh=new T.Mesh(body,[wallMaterial,brickMaterial]);mesh.castShadow=true;mesh.receiveShadow=true;tile.solids.add(mesh);
  }else{body.deleteAttribute('uv');tile.bodies.push(body.index?body.toNonIndexed():body);}
  const floors=style==='utility'?1:Math.max(1,Math.floor(height/(style==='station'?4.8:3.15))),floorHeight=height/floors;
  const entrance=edges.filter(e=>e.length>=(style==='utility'?1.2:3.2)).sort((a,b)=>(a.distance+20/a.length)-(b.distance+20/b.length))[0];
  const record={key,landmark:landmark?.id||null,style,base,top,windows:0,doors:0,source:landmark?.source||'OpenStreetMap; фасад процедурный',estimated:landmark?.estimated||['фасад','этажность по высоте'],center};
  for(const edge of edges){
   const {length}=edge;
   if(!includeBodies)(style==='brick'?tile.bricks:tile.walls).rect(edge,length/2,base+height/2,length,height,`#${wall.getHexString()}`,.015);
   trim.rect(edge,length/2,base+.35,length,.7,'#777b75');
   trim.box(edge,length/2,top-.15,length,.3,.2,'#d9d5c8');
   if(style==='station'){
    trim.box(edge,length/2,base+height*.49,length,.17,.19,'#dccdb0');
    trim.rect(edge,.22,base+height/2,.24,height-.5,'#cdbb9d',.055);
    for(let s=.6;s<length-.3;s+=1.2){trim.rect(edge,s,top-.72,.24,.42,'#e5d6b9',.06);}
   }
   if(style==='panel')for(let floor=1;floor<floors;floor++)trim.rect(edge,length/2,base+floor*floorHeight,length,.06,'#a1a69f');
   if(length<(style==='utility'?1.2:2.4)||style==='utility'&&edge!==entrance)continue;
   const columns=Math.max(1,Math.floor((length-1)/(style==='station'?3.8:3.2))),spacing=(length-.8)/columns;
   const doorColumn=Math.floor(columns/2);
   for(let col=0;col<columns;col++){
    const s=.4+spacing*(col+.5),width=Math.min(style==='station'?1.65:1.5,spacing*.62);
    if(style==='panel')trim.rect(edge,s-spacing/2,base+height/2,.045,height-.8,'#a6aba5');
    for(let floor=0;floor<floors;floor++){
     if(base<.1&&edge===entrance&&floor===0&&col===doorColumn){
      const doorHeight=Math.min(2.65,height-.35);
      trim.rect(edge,s,doorHeight/2+.08,width+.38,doorHeight+.16,'#ded6c3',.06);
      glass.rect(edge,s,doorHeight/2+.05,width,doorHeight,style==='station'?'#714c2e':'#30454b',.08);
      trim.rect(edge,s,doorHeight/2+.05,.065,doorHeight,'#b2a78e',.09);
      trim.box(edge,s,doorHeight+.22,width+.65,.13,.65,'#6c787b');
      record.doors++;doorCount++;continue;
     }
     const h=Math.min(style==='station'?2.5:1.65,floorHeight*.62),y=base+floor*floorHeight+floorHeight*.53;
     const shade=['#3b5662','#4c6871','#607c82','#354b55'][(seed+floor*7+col*3)%4];
     if(style==='station'){
      trim.arch(edge,s,y-h/2-.12,width+.32,h+.24,'#e6d4b5',.055);
      glass.arch(edge,s,y-h/2,width,h,shade,.07);
     }else{
      trim.rect(edge,s,y,width+.22,h+.22,'#e4e2d6',.055);
      glass.rect(edge,s,y,width,h,shade,.07);
     }
     trim.rect(edge,s,y,.055,h,'#d9d6c4',.085);
     if(!simplified){
      trim.rect(edge,s,y+.3*h,width,.045,'#d9d6c4',.086);
      trim.box(edge,s,y-h/2-.08,width+.32,.1,.22,'#c5c8c1');
     }
     if(style==='panel'&&floor>0&&col%4===seed%4&&edge.distance>14){
      trim.box(edge,s,y-h/2-.2,width+.7,.13,.9,'#b7b7a9');
      trim.box(edge,s,y-h/2+.3,width+.7,.65,.9,'#b4bdb4');
      glass.rect(edge,s,y-h/2+.3,width+.4,.38,'#637f86',.94);
     }
     record.windows++;windowCount++;
    }
   }
  }
  if(style==='station'){
   const extra=addStationRoof(tile,edges,top,wall,materials);
   record.doors+=extra.doors;doorCount+=extra.doors;record.windows+=extra.windows;windowCount+=extra.windows;
  }
  if(landmark&&entrance&&style!=='station')addSign(tile.extra,entrance,'ВОЛГА',Math.max(3,top-1),materials);
  records.push(record);return true;
 }
 function finish(){
  for(const tile of tiles.values()){
   const chunk=new T.Group();chunk.name=group.name+' · участок';
   const body=tile.bodies.length?mergeGeometries(tile.bodies):null;tile.bodies.forEach(g=>g.dispose());
   if(body){const mesh=new T.Mesh(body,wallMaterial);mesh.castShadow=true;mesh.receiveShadow=true;chunk.add(mesh);}
   const details=new T.Group();
   for(const [surfaces,material] of [[tile.walls,wallMaterial],[tile.bricks,brickMaterial],[tile.trim,trimMaterial],[tile.glass,glassMaterial]])if(surfaces.positions.length){const mesh=new T.Mesh(surfaces.geometry(surfaces===tile.bricks),material);mesh.receiveShadow=true;mesh.castShadow=surfaces===tile.walls||surfaces===tile.bricks;details.add(mesh);}
   details.add(tile.extra);
   const lod=new T.LOD();
   chunk.add(tile.solids);
   lod.position.set(tile.center.x,0,tile.center.z);details.position.copy(lod.position).multiplyScalar(-1);
   lod.addLevel(details,0);lod.addLevel(new T.Group(),1200);chunk.add(lod);group.add(chunk);
  }
  group.userData.stationDistrict={length:800,buildings:records.length,windows:windowCount,doors:doorCount,records,path};
  return group;
 }
 return {add,finish};
}

function addStationRoof(tile,edges,top,wall,materials){
 let doors=0,windows=0;
 // The longest wall is the uninterrupted rear wall of the supplied footprint.
 const rear=edges.reduce((a,b)=>a.length>b.length?a:b),{a,ux,uz,nx,nz,length}=rear;
 const brick=new T.MeshStandardMaterial({color:wall,roughness:.85});
 const stone=new T.MeshStandardMaterial({color:'#e2d4b9',roughness:.8});
 const metal=new T.MeshStandardMaterial({color:'#798489',roughness:.55,metalness:.35});materials.push(brick,stone,metal);
 function box(s,y,w,h,d,material){const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);mesh.rotation.y=-Math.atan2(uz,ux);mesh.position.set(a.x+ux*s-nx*8,y,a.z+uz*s-nz*8);mesh.castShadow=true;tile.extra.add(mesh);return mesh;}
 function facadeAt(s){
  let best=null,depth=-Infinity;
  for(const edge of edges){
   if(edge.nx*(-nx)+edge.nz*(-nz)<.6)continue;
   const start=(edge.a.x-a.x)*ux+(edge.a.z-a.z)*uz,span=(edge.ux*ux+edge.uz*uz)*edge.length;
   const t=(s-start)/span;if(t<0||t>1)continue;
   const p={x:edge.a.x+edge.ux*edge.length*t,z:edge.a.z+edge.uz*edge.length*t};
   const d=-(p.x-a.x)*nx-(p.z-a.z)*nz;if(d>depth){depth=d;best={a:p,ux,uz,nx:-nx,nz:-nz};}
  }
  return best;
 }
 for(const t of [.46,.5,.54]){
  const front=facadeAt(length*t);if(!front)continue;
  tile.trim.arch(front,0,.1,2.45,4,'#d9c7a8',.065);
  tile.glass.arch(front,0,.12,2.1,3.7,'#735331',.085);
  tile.trim.rect(front,0,1.5,.09,2.8,'#c6a574',.11);
  tile.trim.box(front,0,.1,2.7,.2,.5,'#8f9088');
  doors++;
 }
 for(const [t,text] of [[.3,'ВОКЗАЛ'],[.7,'STATION']]){
  const front=facadeAt(length*t);if(!front)continue;
  front.a.x-=ux*6;front.a.z-=uz*6;front.length=12;addSign(tile.extra,front,text,top+1,materials);
 }
 for(const t of [.17,.5,.83]){
  const central=t===.5,w=central?13:12,h=central?7:4;
  box(length*t,top+h/2,w,h,12,brick);
  box(length*t,top+.4,w+5,.8,12,brick);
  box(length*t,top+.9,w+5.7,.2,12.4,stone);
  box(length*t,top+h-.2,w+.8,.4,12.6,stone);
  box(length*t,top+h+.55,w-2,1.1,10,metal);
  const front={a:{x:a.x-nx*14.1,z:a.z-nz*14.1},ux,uz,nx:-nx,nz:-nz};
  for(const offset of [-3.2,0,3.2]){
   tile.trim.arch(front,length*t+offset,top+.8,1.25,2.4,'#e2d4b9',.05);
   tile.glass.arch(front,length*t+offset,top+.95,.95,2.1,'#435a65',.07);
   windows++;
  }
  const dome=new T.Mesh(new T.SphereGeometry(central?2.6:1.4,12,8,0,Math.PI*2,0,Math.PI/2),metal);
  dome.position.set(a.x+ux*length*t-nx*8,top+h+1.1,a.z+uz*length*t-nz*8);tile.extra.add(dome);
  if(central){
   const spire=new T.Mesh(new T.ConeGeometry(.2,4,8),metal);spire.position.copy(dome.position).add(new T.Vector3(0,4.6,0));tile.extra.add(spire);
   if(typeof document!=='undefined'){
    const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');
    ctx.fillStyle='#eee4ca';ctx.beginPath();ctx.arc(64,64,60,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#3b4848';ctx.lineWidth=5;ctx.stroke();
    for(let i=0;i<12;i++){const angle=i*Math.PI/6;ctx.beginPath();ctx.moveTo(64+Math.sin(angle)*47,64-Math.cos(angle)*47);ctx.lineTo(64+Math.sin(angle)*54,64-Math.cos(angle)*54);ctx.stroke();}
    ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(40,49);ctx.lineTo(64,64);ctx.lineTo(64,25);ctx.stroke();
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
    const material=new T.MeshBasicMaterial({map:texture,transparent:true,side:T.DoubleSide});materials.push(material);
    const clock=new T.Mesh(new T.PlaneGeometry(2,2),material);clock.position.set(front.a.x+ux*length*t-nx*.12,top+4.7,front.a.z+uz*length*t-nz*.12);clock.rotation.y=Math.atan2(-nx,-nz);tile.extra.add(clock);
   }
  }
 }
 return {doors,windows};
}
function addSign(group,edge,text,y,materials){
 if(typeof document==='undefined')return;
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=96;const ctx=canvas.getContext('2d');
 ctx.clearRect(0,0,512,96);ctx.font='bold 66px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=text==='ВОЛГА'?'#244b68':'#c44831';ctx.fillText(text,256,48);
 const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
 const material=new T.MeshBasicMaterial({map:texture,transparent:true,side:T.DoubleSide,depthWrite:false});materials.push(material);
 const mesh=new T.Mesh(new T.PlaneGeometry(Math.min(12,edge.length*.8),2.25),material);
 mesh.position.set(edge.a.x+edge.ux*edge.length/2+edge.nx*.1,y,edge.a.z+edge.uz*edge.length/2+edge.nz*.1);mesh.rotation.y=Math.atan2(edge.nx,edge.nz);group.add(mesh);
}
