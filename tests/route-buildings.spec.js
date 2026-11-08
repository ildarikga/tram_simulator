import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {PerspectiveCamera} from 'three';
import {createRailNetwork,project} from '../src/rail-network.js';
import {createRailCorridor,createRouteBuildings} from '../src/route-buildings.js';

test('rail corridor includes long crossing walls and rejects buildings beyond 140 metres',()=>{
 const corridor=createRailCorridor([[{x:0,z:-1000},{x:0,z:1000}]]);
 expect(corridor.includes([{x:139,z:0},{x:160,z:0},{x:160,z:20},{x:139,z:20}])).toBe(true);
 expect(corridor.includes([{x:141,z:0},{x:160,z:0},{x:160,z:20},{x:141,z:20}])).toBe(false);
 expect(corridor.includes([{x:-500,z:-10},{x:500,z:-10},{x:500,z:10},{x:-500,z:10}])).toBe(true);
});

test('all tram districts have registered facades without allocating windows at startup',()=>{
 const data=JSON.parse(readFileSync('public/data/kazan-map.geojson','utf8')),network=createRailNetwork(data.features),layer=createRouteBuildings(network.lines);
 for(const f of data.features.filter(f=>f.properties.layer==='building'))for(const poly of f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates)layer.register(poly,f.properties);
 expect(layer.stats.buildings).toBeGreaterThan(5000);expect(layer.stats.chunks).toBeGreaterThan(500);
 expect(layer.stats.loadedChunks).toBe(0);expect(layer.group.children).toHaveLength(0);
 for(const coords of [[49.097,55.8607],[49.026,55.888],[49.187,55.8275],[49.217,55.759],[49.181,55.727],[49.1022,55.765],[49.1265,55.7445]]){
  const point=network.nodes[network.nearest(project(coords))];
  expect(layer.tiles.some(tile=>Math.hypot(tile.center.x-point.x,tile.center.z-point.z)<450)).toBe(true);
 }
 const camera=new PerspectiveCamera();const first=project([49.097,55.8607]);camera.position.set(first.x,3,first.z);
 for(let i=0;i<20;i++)layer.update(camera,{budgetMs:Infinity,maxBuildings:1000});
 expect(layer.stats.loadedBuildings).toBeGreaterThan(0);expect(layer.stats.windows).toBeGreaterThan(0);
 expect(layer.stats.loadedChunks).toBeLessThanOrEqual(24);expect(layer.stats.geometryBytes).toBeLessThanOrEqual(96*1024*1024);
 const snapshot={buildings:layer.stats.loadedBuildings,windows:layer.stats.windows,doors:layer.stats.doors};
 let geometries=0,disposed=0;
 layer.group.updateMatrixWorld(true);
 layer.group.traverse(object=>{if(object.geometry){geometries++;object.geometry.addEventListener('dispose',()=>disposed++);for(const attr of Object.values(object.geometry.attributes))expect(attr.array.every(Number.isFinite)).toBe(true);}});
 camera.position.set(40000,3,40000);layer.update(camera);
 expect(layer.stats.loadedChunks).toBe(0);expect(layer.stats.geometryBytes).toBe(0);expect(disposed).toBe(geometries);
 camera.position.set(first.x,3,first.z);for(let i=0;i<20;i++)layer.update(camera,{budgetMs:Infinity,maxBuildings:1000});
 expect({buildings:layer.stats.loadedBuildings,windows:layer.stats.windows,doors:layer.stats.doors}).toEqual(snapshot);
 camera.position.y=1000;layer.update(camera);expect(layer.group.visible).toBe(false);
 layer.dispose();for(const material of layer.materials){material.map?.dispose();material.dispose();}
});
