import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {project} from './rail-network.js';
import {roadWidths} from './traffic.js';
import {buildingKey,createStationDistrict,stationPilotPath} from './station-buildings.js';
import {createRouteBuildings} from './route-buildings.js';
export function buildGeographicCity(data,pilotPath=stationPilotPath(data.features),railLines){
 const group=new T.Group();group.name='Казань — геометрия OpenStreetMap';
 const district=createStationDistrict(pilotPath);
 const excluded=new Set();
 const lines=railLines??data.features.filter(f=>f.properties.layer==='transportation'&&f.properties.subclass==='tram').flatMap(f=>(f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates).map(line=>line.map(project)));
 const routeBuildings=createRouteBuildings(lines,{excluded});
 const batches={building:[],water:[],landcover:[],road:[],tram:[]};let buildings=0,roads=0;
 function polygon(coords,height,base){const shape=new T.Shape(coords[0].map(c=>{const p=project(c);return new T.Vector2(p.x,-p.z);}));for(const hole of coords.slice(1))shape.holes.push(new T.Path(hole.map(c=>{const p=project(c);return new T.Vector2(p.x,-p.z);})));
  const geometry=height?new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false}):new T.ShapeGeometry(shape);geometry.rotateX(-Math.PI/2);geometry.translate(0,base,0);return geometry.index?geometry.toNonIndexed():geometry;
 }
 function strip(coords,width,y,batch){const points=coords.map(project),vertices=[];for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],len=Math.hypot(b.x-a.x,b.z-a.z);if(!len)continue;const dx=-(b.z-a.z)/len*width/2,dz=(b.x-a.x)/len*width/2;vertices.push(a.x+dx,y,a.z+dz,b.x+dx,y,b.z+dz,a.x-dx,y,a.z-dz,a.x-dx,y,a.z-dz,b.x+dx,y,b.z+dz,b.x-dx,y,b.z-dz);}if(vertices.length){const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.computeVertexNormals();batch.push(geometry);}}
 for(const f of data.features){const p=f.properties,g=f.geometry;
  if(p.layer==='building'&&[true,1,'true'].includes(p.hide_3d))continue;
  if(['building','water','landcover'].includes(p.layer)&&['Polygon','MultiPolygon'].includes(g.type)){
   const polys=g.type==='Polygon'?[g.coordinates]:g.coordinates;
   for(const poly of polys){if(poly[0].length<4)continue;try{
    if(p.layer==='building'&&district.add(poly,p)){excluded.add(buildingKey(poly));buildings++;continue;}
    if(p.layer==='building')routeBuildings.register(poly,p);
    const base=p.layer==='building'?Math.max(0,Number(p.render_min_height)||0):p.layer==='water'?.05:.02;
    const height=p.layer==='building'?Math.max(.5,(Number(p.render_height)||9)-base):0;
    const geometry=polygon(poly,height,base);
    if(p.layer==='building'){
     const color=new T.Color(p.colour||['#dad4c2','#e9decb','#c3c8bc','#d9c7b3'][Math.abs(Number(f.id)||buildings)%4]);
     const colors=new Float32Array(geometry.attributes.position.count*3);
     for(let i=0;i<colors.length;i+=3){colors[i]=color.r;colors[i+1]=color.g;colors[i+2]=color.b;}
     geometry.setAttribute('color',new T.BufferAttribute(colors,3));buildings++;
    }
    batches[p.layer].push(geometry);
   }catch{}}
  }else if(p.layer==='transportation'&&['LineString','MultiLineString'].includes(g.type)){
   const lines=g.type==='LineString'?[g.coordinates]:g.coordinates;
   if(p.subclass==='tram'){for(const line of lines)strip(line,4,.25,batches.tram);}
   else if(!['rail','transit','ferry','pier'].includes(p.class)){const width=roadWidths[p.class]||4;for(const line of lines)strip(line,width,.12,batches.road);roads++;}
  }
 }
 const materials={building:new T.MeshStandardMaterial({vertexColors:true,roughness:.9}),water:new T.MeshStandardMaterial({color:'#84b1b1',roughness:.55,side:T.DoubleSide}),landcover:new T.MeshStandardMaterial({color:'#a3b78e',side:T.DoubleSide}),road:new T.MeshStandardMaterial({color:'#bebcaf',side:T.DoubleSide}),tram:new T.MeshStandardMaterial({color:'#63756b',side:T.DoubleSide})};
 for(const [key,geometries] of Object.entries(batches)){if(!geometries.length)continue;const merged=mergeGeometries(geometries);const mesh=new T.Mesh(merged,materials[key]);mesh.receiveShadow=true;group.add(mesh);geometries.forEach(g=>g.dispose());}
 const detailed=district.finish();group.add(detailed);group.userData.stationDistrict=detailed.userData.stationDistrict;
 group.add(routeBuildings.group);group.routeBuildings=routeBuildings;group.userData.routeBuildings=routeBuildings.stats;
 group.ownedMaterials=[...Object.values(materials),...detailed.ownedMaterials,...routeBuildings.materials];
 const ground=new T.Mesh(new T.PlaneGeometry(50000,50000),new T.MeshStandardMaterial({color:'#bdc9aa'}));ground.rotation.x=-Math.PI/2;ground.position.y=-.1;group.add(ground);
 return {group,buildings,roads,center:project([49.112,55.786])};
}
