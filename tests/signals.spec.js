import {test,expect} from '@playwright/test';
import * as T from 'three';
import {project} from '../src/rail-network.js';
import {createTraffic,createRoadGraph} from '../src/traffic.js';
import {signalColor,signalTiming,createSignalNetwork,createRouteSignalControl,approachSignal} from '../src/traffic-signals.js';

const center=[49.12,55.79];
const horizontal=[[49.117,55.79],center,[49.123,55.79]];
const vertical=[[49.12,55.788],center,[49.12,55.792]];
const road=coordinates=>({properties:{layer:'transportation',class:'primary'},geometry:{type:'LineString',coordinates}});
const features=[road(horizontal),road(vertical)];

test('crossing directions have complementary phases and a safe changeover',()=>{
 const signal={offset:0};
 expect([signalColor(signal,0,0),signalColor(signal,1,0)]).toEqual(['green','red']);
 expect([signalColor(signal,0,24),signalColor(signal,1,24)]).toEqual(['yellow','red']);
 expect([signalColor(signal,0,27),signalColor(signal,1,27)]).toEqual(['red','red']);
 expect([signalColor(signal,0,30),signalColor(signal,1,30)]).toEqual(['red','green']);
 expect([signalColor(signal,0,54),signalColor(signal,1,54)]).toEqual(['red','yellow']);
 for(let time=0;time<180;time+=.1)expect([signalColor(signal,0,time),signalColor(signal,1,time)].filter(c=>c==='green').length).toBeLessThanOrEqual(1);
 expect(signalTiming.clearance).toBeGreaterThan(0);
});

test('tram slows, waits on red and yellow, resumes on green and clears the intersection',()=>{
 const network=createSignalNetwork(createRoadGraph(features)),signal=network.signals[0];
 expect(network.signals).toHaveLength(1);
 const control=createRouteSignalControl(horizontal.map(project),network),half=15;
 const event=control.events[0],stop=event.at-signal.radius-half-1;
 const redTime=event.axis===0?30:0,greenTime=event.axis===0?0:30,yellowTime=greenTime+24;
 expect(control.limit(0,half,redTime).distance).toBeCloseTo(stop);
 expect(control.limit(stop,half,redTime).distance).toBe(0);
 expect(control.limit(stop,half,yellowTime).distance).toBe(0);
 expect(control.limit(stop,half,greenTime).distance).toBe(Infinity);
 let distance=0,speed=14;
 for(let i=0;i<600;i++){
  const gap=control.limit(distance,half,redTime).distance;
  const move=approachSignal(speed,gap,.1);speed=move.speed;distance+=move.travel;
  expect(distance).toBeLessThanOrEqual(stop+.0001);
 }
 expect(distance).toBeCloseTo(stop);expect(speed).toBe(0);
 const depart=approachSignal(0,control.limit(distance,half,greenTime).distance,.1);
 expect(depart.speed).toBeGreaterThan(0);
 control.advance(stop,stop+.5,half,greenTime);
 expect(control.limit(stop+.5,half,yellowTime).distance).toBe(Infinity);
 // An entered tram holds the crossing until its rear has passed.
 expect(signalColor(signal,1-event.axis,redTime)).toBe('red');
 control.limit(event.at+signal.radius+half+1,half,redTime);
 expect(signalColor(signal,1-event.axis,redTime)).toBe('green');
 control.reset();expect(control.limit(stop,half,redTime).distance).toBe(0);
});

test('a crossing in the middle of a road is shared by road and tram controls',()=>{
 const crossing=[road([horizontal[0],horizontal[2]]),{properties:{layer:'transportation',subclass:'tram'},geometry:{type:'LineString',coordinates:[vertical[0],vertical[2]]}}];
 const edges=createRoadGraph(crossing),network=createSignalNetwork(edges,crossing);
 expect(network.signals).toHaveLength(1);
 const car=edges[0].signals[0],tram=createRouteSignalControl(vertical.map(project),network).events[0];
 expect(car.signal).toBe(tram.signal);expect(car.axis).not.toBe(tram.axis);
});

test('cars wait before the stop line and move again on the next green',()=>{
 const traffic=createTraffic(features,{count:1,random:()=>0,initialTime:30});
 const body=traffic.group.children.find(m=>m.name==='traffic-sedan-paint');
 const position=()=>{const m=new T.Matrix4();body.getMatrixAt(0,m);return new T.Vector3().setFromMatrixPosition(m);};
 const start=position();
 for(let i=0;i<240;i++)traffic.update(.1);
 const stopped=position();
 expect(stopped.x).toBeCloseTo(-13.25,1);expect(stopped.x).toBeGreaterThan(start.x);
 traffic.update(0);expect(position().x).toBe(stopped.x);
 for(let i=0;i<10;i++)traffic.update(.1);
 expect(position().x).toBeCloseTo(stopped.x,4);
 for(let i=0;i<120;i++)traffic.update(.1);
 expect(position().x).toBeGreaterThan(stopped.x+10);
 traffic.dispose();
});

test('a vehicle already in the junction completes its manoeuvre after a phase change',()=>{
 const network=createSignalNetwork(createRoadGraph(features));
 const control=createRouteSignalControl(horizontal.map(project),network),event=control.events[0],half=6;
 const stop=event.at-event.signal.radius-half-1;
 const green=event.axis===0?23.9:53.9,red=event.axis===0?30:60;
 control.advance(stop,stop+1,half,green);
 expect(control.limit(stop+1,half,red).distance).toBe(Infinity);
 expect(control.limit(event.at,half,red).distance).toBe(Infinity);
 control.reset();expect(event.signal.occupants.size).toBe(0);
});

test('cars form a queue behind the stop line without overtaking the leader',()=>{
 const values=[0,0,.2,0,0,0,0,.3,0,0];let index=0;
 const traffic=createTraffic(features,{count:2,random:()=>values[index++]??0,initialTime:30});
 for(let i=0;i<240;i++)traffic.update(.1);
 const getX=name=>{const mesh=traffic.group.children.find(m=>m.name===name),matrix=new T.Matrix4();mesh.getMatrixAt(0,matrix);return matrix.elements[12];};
 const follower=getX('traffic-sedan-paint'),leader=getX('traffic-hatchback-paint');
 expect(leader).toBeCloseTo(-12.85,1);
 expect(leader-follower).toBeGreaterThanOrEqual(6.09);
 expect(leader-follower).toBeLessThan(6.3);
 traffic.dispose();
});

test('a turning car departs on its approach green even when the exit direction is red',()=>{
 let calls=0;
 const traffic=createTraffic(features,{count:1,initialTime:30,random:()=>calls++<5?0:.5});
 const body=traffic.group.children.find(m=>m.name==='traffic-sedan-paint');
 const position=()=>{const matrix=new T.Matrix4();body.getMatrixAt(0,matrix);return new T.Vector3().setFromMatrixPosition(matrix);};
 for(let i=0;i<240;i++)traffic.update(.1);
 const waiting=position();expect(waiting.x).toBeCloseTo(-13.25,1);
 for(let i=0;i<130;i++)traffic.update(.1);
 expect(position().distanceTo(waiting)).toBeGreaterThan(10);
 traffic.dispose();
});

test('the entire turning queue restarts after its approach changes to green',()=>{
 const spawn=[0,0,0,0,0,0,0,0,.15,0];let calls=0;
 const traffic=createTraffic(features,{count:2,initialTime:30,random:()=>spawn[calls++]??.5});
 const positions=()=>traffic.group.children.filter(m=>m.name.endsWith('-paint')).map(mesh=>{const matrix=new T.Matrix4();mesh.getMatrixAt(0,matrix);return new T.Vector3().setFromMatrixPosition(matrix);});
 for(let i=0;i<240;i++)traffic.update(.1);
 const waiting=positions();expect(waiting[1].x).toBeCloseTo(-12.85,1);
 expect(waiting[1].x-waiting[0].x).toBeGreaterThanOrEqual(6.09);
 for(let i=0;i<130;i++)traffic.update(.1);
 positions().forEach((position,i)=>expect(position.distanceTo(waiting[i])).toBeGreaterThan(10));
 traffic.dispose();
});
