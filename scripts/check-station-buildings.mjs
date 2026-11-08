import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {Vector3} from 'three';
import {createStationDistrict,stationPilotPath,buildingKey} from '../src/station-buildings.js';

const data=JSON.parse(await readFile(new URL('../public/data/kazan-map.geojson',import.meta.url),'utf8'));
const path=stationPilotPath(data.features);
const length=path.slice(1).reduce((s,p,i)=>s+Math.hypot(p.x-path[i].x,p.z-path[i].z),0);
assert.ok(Math.abs(length-800)<.01,'Пилот должен покрывать 800 м рельсового графа');
const district=createStationDistrict(path);
for(const f of data.features){
 if(f.properties.layer!=='building'||f.properties.hide_3d)continue;
 for(const poly of f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates)district.add(poly,f.properties);
}
const group=district.finish(),stats=group.userData.stationDistrict;
assert.ok(stats.buildings>50,'В пилот должны попасть отдельные полигоны домов, а не агрегаты тайлов');
assert.ok(stats.windows>1000);
assert.equal(stats.records.filter(r=>r.landmark==='kazan-station').length,1);
assert.equal(stats.records.filter(r=>r.landmark==='volga-hotel').length,1);
assert.equal(new Set(stats.records.map(r=>`${r.key}/${r.base}/${r.top}`)).size,stats.buildings);
for(const r of stats.records){assert.ok(r.top>r.base);assert.ok(r.windows>0||r.style==='utility'&&r.doors>0);if(r.base>0)assert.equal(r.doors,0,'Входы не должны висеть над землёй');}
let triangles=0;
group.updateMatrixWorld(true);
group.traverse(object=>{
 if(object.geometry){
  const g=object.geometry;for(const attr of Object.values(g.attributes))assert.ok(attr.array.every(Number.isFinite),'Геометрия должна содержать конечные координаты');
  triangles+=(g.index?.count||g.attributes.position.count)/3;
 }
 if(object.isLOD){
  const p=object.getWorldPosition(new Vector3());assert.ok(Math.abs(p.x)>500,'LOD должен измерять расстояние от квартала, а не от центра Казани');
 }
});
const ring=[[49,55],[49.01,55],[49.01,55.01],[49,55.01],[49,55]],rotated=[...ring.slice(1,-1),ring[0],ring[1]];
assert.equal(buildingKey([ring]),buildingKey([rotated]));
assert.equal(buildingKey([ring]),buildingKey([[...ring].reverse()]));
console.log(`Вокзальный квартал: ${stats.buildings} объёмов, ${stats.windows} окон, ${stats.doors} входов, ${Math.round(triangles)} треугольников. Проверки пройдены.`);
