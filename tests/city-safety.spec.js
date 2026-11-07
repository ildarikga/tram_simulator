import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {extractStops,nearestOnPath} from '../src/stops.js';
import {createTraffic} from '../src/traffic.js';
import {createSignalLayer} from '../src/traffic-signals.js';
import {buildGeographicCity} from '../src/osm-city.js';
import * as T from 'three';

test('a shelter clears every neighbouring track, not only its nearest rail',()=>{
 const lines=[0,-4.5].map(x=>[{x,z:-100},{x,z:100}]);
 const stops=extractStops([{properties:{subclass:'tram_stop',name:'Тест'},geometry:{type:'Point',coordinates:[49.12,55.79]}}],{lines});
 for(const line of lines)expect(nearestOnPath(stops[0],line).distance).toBeGreaterThan(3.6);
});

test('building footprints cover the outskirts of the supplied city map',()=>{
 const data=JSON.parse(readFileSync('public/data/kazan-map.geojson','utf8'));
 const buildings=data.features.filter(f=>f.properties.layer==='building');
 for(const [lon,lat] of [[49.097,55.8607],[49.217,55.759],[49.181,55.727]]){
  const points=buildings.flatMap(f=>f.geometry.type==='Polygon'?f.geometry.coordinates[0]:f.geometry.coordinates.flatMap(p=>p[0]));
  expect(points.some(([x,y])=>Math.abs(x-lon)<.015&&Math.abs(y-lat)<.01)).toBe(true);
  const sample=buildings.find(f=>{const [x,y]=f.geometry.type==='Polygon'?f.geometry.coordinates[0][0]:f.geometry.coordinates[0][0][0];return Math.abs(x-lon)<.015&&Math.abs(y-lat)<.01;});
  const city=buildGeographicCity({features:[sample]});
  expect(city.buildings).toBeGreaterThan(0);
  const mesh=city.group.children.find(m=>m.material.vertexColors);mesh.geometry.computeBoundingBox();
  expect(mesh.geometry.boundingBox.max.y-mesh.geometry.boundingBox.min.y).toBeGreaterThanOrEqual(3);
  city.group.traverse(m=>{m.geometry?.dispose();m.material?.dispose();});
 }
});

test('signal housings are moved clear of a rail running through their default positions',()=>{
 const line=[{x:-7,z:-100},{x:-7,z:100}];
 const layer=createSignalLayer([{id:0,x:0,z:0,dx:0,dz:1,radius:10,offset:0}],[line]);
 const housing=layer.group.children[0],matrix=new T.Matrix4();
 for(let i=0;i<housing.count;i++){
  housing.getMatrixAt(i,matrix);const scale=new T.Vector3().setFromMatrixScale(matrix);
  expect(scale.x).toBeGreaterThan(0);
  expect(nearestOnPath({x:matrix.elements[12],z:matrix.elements[14]},line).distance).toBeGreaterThan(6.5);
 }
 layer.dispose();
});

const road={properties:{layer:'transportation',class:'primary',oneway:1},geometry:{type:'LineString',coordinates:[[49.117,55.79],[49.123,55.79]]}};
const position=traffic=>{const matrix=new T.Matrix4();traffic.group.children.find(m=>m.name==='traffic-sedan-paint').getMatrixAt(0,matrix);return {x:matrix.elements[12],z:matrix.elements[14]};};
test('cars yield to a tram even without a signal at the crossing',()=>{
 const traffic=createTraffic([road],{count:1,random:()=>0});
 const control=traffic.createRouteControl([{x:0,z:100},{x:0,z:-100}]);
 control.limit(100,12,0);
 for(let i=0;i<400;i++)traffic.update(.1);
 expect(position(traffic).x).toBeLessThan(-4);
 control.reset();
 for(let i=0;i<100;i++)traffic.update(.1);
 expect(position(traffic).x).toBeGreaterThan(5);
 traffic.dispose();
});
test('a tram waits for a car already crossing and resumes after it clears',()=>{
 let calls=0;const traffic=createTraffic([road],{count:1,random:()=>calls++===3?.5:0});
 const control=traffic.createRouteControl([{x:0,z:100},{x:0,z:-100}]);
 const gap=control.limit(70,12,0).distance;
 expect(gap).toBeLessThan(20);
 expect(gap).toBeGreaterThan(0);
 for(let i=0;i<100;i++)traffic.update(.1);
 expect(position(traffic).x).toBeGreaterThan(5);
 expect(control.limit(70,12,traffic.time).distance).toBe(Infinity);
 traffic.dispose();
});
