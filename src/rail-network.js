export const project=([lon,lat])=>({x:(lon-49.12)*111320*Math.cos(55.79*Math.PI/180),z:-(lat-55.79)*111320});
export function createRailNetwork(features){
 const nodes=[],bins=new Map();
 function node(p){const bx=Math.round(p.x/8),bz=Math.round(p.z/8);for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){const list=bins.get(`${bx+dx},${bz+dz}`)||[];for(const i of list)if(Math.hypot(nodes[i].x-p.x,nodes[i].z-p.z)<7)return i;}
  const id=nodes.length;nodes.push({...p,edges:new Map()});const key=`${bx},${bz}`;if(!bins.has(key))bins.set(key,[]);bins.get(key).push(id);return id;
 }
 const lines=[];
 for(const f of features.filter(f=>f.properties.subclass==='tram'&&f.properties.layer==='transportation')){
  for(const coords of f.geometry.type==='LineString'?[f.geometry.coordinates]:f.geometry.coordinates){const points=coords.map(project);lines.push(points);let previous=null;for(const p of points){const id=node(p);if(previous!==null&&previous!==id){const d=Math.hypot(nodes[id].x-nodes[previous].x,nodes[id].z-nodes[previous].z);nodes[id].edges.set(previous,d);nodes[previous].edges.set(id,d);}previous=id;}}
 }
 // Vector tiles include buffered line ends: an end can fall inside the next
 // tile's segment rather than on its vertex. Join those overlapping segments.
 const edges=[];nodes.forEach((a,i)=>{for(const j of a.edges.keys())if(j>i)edges.push([i,j]);});
 for(let k=0;k<nodes.length;k++){const p=nodes[k];for(const [i,j] of edges){if(k===i||k===j)continue;const a=nodes[i],b=nodes[j],dx=b.x-a.x,dz=b.z-a.z,len2=dx*dx+dz*dz;const t=((p.x-a.x)*dx+(p.z-a.z)*dz)/len2;if(t<=0||t>=1)continue;const gap=Math.hypot(p.x-a.x-t*dx,p.z-a.z-t*dz);if(gap<4){for(const id of [i,j]){const d=Math.hypot(p.x-nodes[id].x,p.z-nodes[id].z);p.edges.set(id,d);nodes[id].edges.set(k,d);}}}}
 // Tile-edge quantisation can leave tiny gaps; connect only nearby rail vertices.
 for(let i=0;i<nodes.length;i++){const a=nodes[i];if(a.edges.size>1)continue;let best=-1,dist=28;for(let j=0;j<nodes.length;j++){if(i===j||a.edges.has(j))continue;const d=Math.hypot(a.x-nodes[j].x,a.z-nodes[j].z);if(d<dist){best=j;dist=d;}}if(best>=0){a.edges.set(best,dist);nodes[best].edges.set(i,dist);}}
 function nearest(p){let best=0,distance=Infinity;nodes.forEach((n,i)=>{const d=Math.hypot(n.x-p.x,n.z-p.z);if(d<distance){distance=d;best=i;}});return best;}
 function between(start,end){const from=nearest(start),to=nearest(end),distance=new Float64Array(nodes.length).fill(Infinity),previous=new Int32Array(nodes.length).fill(-1),visited=new Set();distance[from]=0;
  while(true){let current=-1,best=Infinity;for(let i=0;i<nodes.length;i++)if(!visited.has(i)&&distance[i]<best){current=i;best=distance[i];}if(current===-1)throw Error('Между остановками нет связного пути в загруженных данных');if(current===to)break;visited.add(current);for(const [next,length] of nodes[current].edges){if(best+length<distance[next]){distance[next]=best+length;previous[next]=current;}}}
  const path=[];for(let at=to;at!==-1;at=previous[at])path.unshift({x:nodes[at].x,z:nodes[at].z});return path;
 }
 return {nodes,lines,nearest,between,path(stops,locations){const result=[];for(let i=1;i<stops.length;i++){const part=between(locations[stops[i-1]],locations[stops[i]]);result.push(...(i===1?part:part.slice(1)));}return result;}};
}
