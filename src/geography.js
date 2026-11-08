import {createTraffic} from './traffic.js';
import {setGeographicNetwork} from './data.js';
import {createRailNetwork,project} from './rail-network.js';
import {extractStops} from './stops.js';
import {stationPilotPath} from './station-buildings.js';
export async function loadGeography(world,ui){
 const response=await fetch(`${import.meta.env.BASE_URL}data/kazan-map.geojson`);
 if(!response.ok)return;
 const data=await response.json();if(!data.features?.length)return;
 const {buildGeographicCity}=await import('./osm-city.js');
 const network=createRailNetwork(data.features);
 const result=buildGeographicCity(data,stationPilotPath(data.features,network),network.lines);
 const anchors=[['Ж/д вокзал',49.1007,55.7874],['Речной порт',49.1022,55.7650],['Улица Глазунова',49.1265,55.7445],['Караваево',49.097,55.8607],['Химическая',49.026,55.888],['Улица Халитова',49.187,55.8275],['9-й микрорайон',49.217,55.759],['Солнечный город',49.181,55.727],['Энергоуниверситет',49.095,55.817],['Проспект Победы',49.220,55.774]];
 const stopNames=['Железнодорожный вокзал','Речной порт','улица Глазунова','жилой массив Караваево','Химическая улица','улица Халитова','9-й микрорайон','жилой массив Солнечный город','Энергетический университет','Проспект Победы'];
 anchors.forEach(([name,lon,lat],i)=>{const mapped=data.features.find(f=>f.properties.subclass==='tram_stop'&&f.properties.name===stopNames[i]);const raw=project(mapped?.geometry.coordinates||[lon,lat]),node=network.nodes[network.nearest(raw)];Object.assign(ui.locations[i],{name,x:node.x,z:node.z});});
 const paths=[[3,8,0,1],[0,1],[0,2],[5,9,6],[0,8,5,9,7,2,0],[0,2,7,9,5,8,0],[3,8,5],[8,5,9,7],[4,3]];
 for(let i=0;i<ui.routes.length;i++){const r=ui.routes[i];r.stops=paths[i];r.name=`${ui.locations[r.stops[0]].name} — ${ui.locations[r.stops.at(-1)].name}`;r.real=true;}
 // Validate before switching away from the fallback scene.
 for(const r of ui.routes)network.path(r.stops,ui.locations);
 setGeographicNetwork(network);world.setGeography(result.group,result.center,createTraffic(data.features));world.setStops(extractStops(data.features,network));ui.setNetwork(network);ui.chooseRoute(ui.routes[1]);
 document.querySelector('#map-label').textContent='Казань · OpenStreetMap';
 document.querySelector('.osm-credit').hidden=false;document.querySelector('.osm-credit').textContent='OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors';
 document.querySelector('#city-info').textContent=`Геометрия OpenStreetMap: ${result.buildings.toLocaleString('ru')} объёмных контуров зданий, ${result.roads.toLocaleString('ru')} участков улиц. Фасады вдоль всех маршрутов: ${(result.group.userData.routeBuildings.buildings+result.group.userData.stationDistrict.buildings).toLocaleString('ru')} объёмов; окна и входы подгружаются рядом с камерой. Вокзал — по фотореференсу; остальные фасады преимущественно процедурные, высоты приблизительные. Рельеф плоский, трассы номеров предварительные.`;
 ui.notify('Карта Казани загружена: настоящие улицы, здания и трамвайные пути');
}
