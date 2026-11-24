const THREE = window.__KROVOTKINSKAYA_THREE__;
if (!THREE) throw new Error('Three.js не загрузился: отсутствует игровой движок.');

/* КРОВОТКИНСКАЯ — a procedural browser-based 3D horror game. */
const $ = (id) => document.getElementById(id);
const canvas = $('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.7));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, .1, 260);
camera.rotation.order = 'YXZ';
scene.add(camera);
const world = new THREE.Group();
scene.add(world);
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const v3 = (x=0,y=0,z=0) => new THREE.Vector3(x,y,z);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const rand = (a,b) => a+Math.random()*(b-a);
const mat = (color, roughness=.85, metalness=0, extra={}) => new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});
const M = {
  concrete:mat('#62656a'), dark:mat('#17191d'), black:mat('#090b0e'), stone:mat('#c4c3bd'), stone2:mat('#8c8d8e'), gold:mat('#bca36a',.4,.55), glass:mat('#283b42',.22,.35,{transparent:true,opacity:.72}), warm:mat('#d9a15d',.45,0,{emissive:'#6a3515',emissiveIntensity:.7}), red:mat('#8c2732',.6,.1), green:mat('#a5d28d',.4,.1,{emissive:'#4b9c50',emissiveIntensity:1.3}), alien:mat('#7d8b85',.68,.05), alienDark:mat('#303d3e',.35,.1), glowGreen:mat('#b5ff9e',.25,.1,{emissive:'#46d66b',emissiveIntensity:2.4}), glowRed:mat('#ff5c4f',.25,.1,{emissive:'#d62326',emissiveIntensity:2.2}), blue:mat('#80c9d6',.25,.1,{emissive:'#246979',emissiveIntensity:1.4}), white:mat('#d9d8d0')
};
let phase='intro', paused=false, pauseFrom='church', quality='high';
let yaw=0, pitch=0, player=v3(0,1.65,8), velocity=v3(), health=100, selectedSlot=1;
let inventory={lighter:false,blood:false,water:false,portal:false,carbine:false,keys:false};
let objective='', currentInteract=null, toastTimer=0, dialogueLines=[], dialogueIndex=0, dialogueDone=null;
let interactables=[], colliders=[], enemies=[], projectiles=[], particles=[], flightEnemies=[], flightShots=[], animatedObjects=[];
let introTime=0, sceneTime=0, portalMesh=null, ufo=null, ufoGlow=null, deadAlien=null, friendAlien=null, candleLight=null, candleFlame=null;
let flightScore=0, flightGoal=5, flightTime=0, boostUntil=0, playerDamageCooldown=0, waveSpawned=false;
let bloodPoured=false, waterPoured=false, bookRead=false, fireHeld=false, fireHeldRMB=false, fireCooldown=0, cockpitDialogueStarted=false, lighterGlow=null, flightPulseMeshes=[], transitioning=false;
let weaponRig=null, lighterRig=null, portalRig=null, muzzleFlash=null, lighterSpot=null, weaponRecoil=0, weaponIdle=0, pickupPulse=0, equipPulse=0, portalKick=0, flightAimX=0, flightAimY=0, flightTrailClock=0, pulseLights=[], audioCtx=null, masterGain=null, ambience=null, ambienceOsc=[];
const keys=Object.create(null);
const tmpDir=v3(), tmpRight=v3(), tmpMove=v3();

function makeNoiseTexture(base, accent, size=512, count=3800){
  const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false});
  ctx.fillStyle=base;ctx.fillRect(0,0,size,size);
  // Layered, low-contrast mineral noise: large stains, fine grit, hairline wear and seams.
  for(let i=0;i<count;i++){
    const a=rand(.018,.13);ctx.globalAlpha=a;ctx.fillStyle=Math.random()>.56?accent:'#171719';
    const w=rand(.6,Math.max(2,size*.035)),h=rand(.6,Math.max(2,size*.018));ctx.fillRect(rand(0,size),rand(0,size),w,h);
  }
  ctx.globalAlpha=.12;ctx.strokeStyle=accent;ctx.lineWidth=1;
  for(let i=0;i<22;i++){const x=rand(0,size),y=rand(0,size);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+rand(-45,45),y+rand(8,70));ctx.stroke();}
  ctx.globalAlpha=.08;for(let i=0;i<10;i++){const x=rand(0,size),y=rand(0,size);ctx.fillStyle='#000';ctx.beginPath();ctx.ellipse(x,y,rand(10,45),rand(5,24),rand(0,Math.PI),0,Math.PI*2);ctx.fill();}
  ctx.globalAlpha=1;const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;t.needsUpdate=true;return t;
}
function makeSurfaceTexture(kind,base,accent,size=512){
  const c=document.createElement('canvas');c.width=c.height=size;const ctx=c.getContext('2d',{alpha:false});ctx.fillStyle=base;ctx.fillRect(0,0,size,size);
  if(kind==='brick'){
    const bw=104,bh=52;for(let row=-1;row<size/bh+1;row++){const shift=row%2?bw/2:0;for(let col=-1;col<size/bw+1;col++){const x=col*bw+shift,y=row*bh;const v=Math.floor(rand(-13,14));ctx.fillStyle=`rgb(${clamp(98+v,0,255)},${clamp(66+v,0,255)},${clamp(55+v,0,255)})`;ctx.fillRect(x+3,y+3,bw-6,bh-6);ctx.globalAlpha=.16;ctx.fillStyle=accent;ctx.fillRect(x+4,y+4,bw-8,3);ctx.globalAlpha=1;ctx.fillStyle='#292421';ctx.fillRect(x+1,y+bh-3,bw-2,2);}}
  }else if(kind==='stone'){
    const tw=128,th=86;for(let row=0;row<size/th+1;row++){for(let col=0;col<size/tw+1;col++){const x=col*tw+(row%2?tw/2:0),y=row*th,v=Math.floor(rand(-16,17));ctx.fillStyle=`rgb(${clamp(160+v,0,255)},${clamp(155+v,0,255)},${clamp(143+v,0,255)})`;ctx.fillRect(x+2,y+2,tw-4,th-4);ctx.globalAlpha=.12;ctx.fillStyle='#fff';ctx.fillRect(x+4,y+4,tw-8,3);ctx.globalAlpha=1;ctx.fillStyle='#68645d';ctx.fillRect(x+1,y+th-3,tw-2,2);}}
  }else if(kind==='paving'){
    const tile=128;for(let y=0;y<size;y+=tile)for(let x=0;x<size;x+=tile){const v=Math.floor(rand(-10,11));ctx.fillStyle=`rgb(${clamp(76+v,0,255)},${clamp(77+v,0,255)},${clamp(78+v,0,255)})`;ctx.fillRect(x+3,y+3,tile-6,tile-6);ctx.fillStyle='#24272a';ctx.fillRect(x+1,y+tile-4,tile-2,3);ctx.fillRect(x+tile-4,y+1,3,tile-2);ctx.globalAlpha=.12;ctx.strokeStyle='#c4c0b5';ctx.beginPath();ctx.moveTo(x+14,y+22);ctx.lineTo(x+tile-18,y+tile-24);ctx.stroke();ctx.globalAlpha=1;}
  }else if(kind==='wood'){
    for(let x=0;x<size;x+=128){ctx.fillStyle=x%256?'#48332b':'#3c2a23';ctx.fillRect(x,0,124,size);ctx.strokeStyle='#8b6048';ctx.globalAlpha=.2;for(let i=0;i<12;i++){const xx=x+rand(8,116);ctx.beginPath();ctx.moveTo(xx,0);ctx.bezierCurveTo(xx+rand(-12,12),120,xx+rand(-12,12),340,xx+rand(-6,6),size);ctx.stroke();}ctx.globalAlpha=1;ctx.fillStyle='#241b18';ctx.fillRect(x+124,0,4,size);}
  }
  // Fine mineral grain, edge wear and small stains bind the authored pattern together.
  for(let i=0;i<size*10;i++){ctx.globalAlpha=rand(.025,.12);ctx.fillStyle=Math.random()>.55?accent:'#171819';ctx.fillRect(rand(0,size),rand(0,size),rand(.5,3.5),rand(.5,2.5));}
  ctx.globalAlpha=1;const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;t.needsUpdate=true;return t;
}
const brickTex=makeSurfaceTexture('brick','#62483f','#bd8d76');
const concreteTex=makeNoiseTexture('#55585a','#96938c',512,7200);
const pavingTex=makeSurfaceTexture('paving','#45464a','#a7a297');
const stoneTex=makeSurfaceTexture('stone','#a29d90','#e0d9c9');
const asphaltTex=makeNoiseTexture('#292d31','#55595c',512,8200);
const woodTex=makeSurfaceTexture('wood','#382a25','#a07b5f');
brickTex.repeat.set(2.6,2.6);concreteTex.repeat.set(3.5,3.5);pavingTex.repeat.set(5,5);stoneTex.repeat.set(2.7,2.7);asphaltTex.repeat.set(8,8);woodTex.repeat.set(2,2);
function addMesh(parent, geo, material, pos, rot=null, scale=null, cast=true, receive=true){const o=new THREE.Mesh(geo,material);o.position.copy(pos);if(rot)o.rotation.set(rot.x,rot.y,rot.z);if(scale)o.scale.copy(scale);o.castShadow=cast;o.receiveShadow=receive;parent.add(o);return o;}
function box(parent,w,h,d,material,x,y,z,opts={}){return addMesh(parent,new THREE.BoxGeometry(w,h,d),material,v3(x,y,z),opts.rot||null,opts.scale||null,opts.cast!==false,opts.receive!==false)}
function sphere(parent,r,material,x,y,z,sx=1,sy=1,sz=1){return addMesh(parent,new THREE.SphereGeometry(r,24,16),material,v3(x,y,z),null,v3(sx,sy,sz))}
function cylinder(parent,rt,rb,h,material,x,y,z,segments=24){return addMesh(parent,new THREE.CylinderGeometry(rt,rb,h,segments),material,v3(x,y,z))}
function torus(parent,r,t,material,x,y,z,rx=0,ry=0,rz=0){return addMesh(parent,new THREE.TorusGeometry(r,t,10,56),material,v3(x,y,z),v3(rx,ry,rz))}
function addLight(parent,color,intensity,distance,x,y,z,decay=2){const l=new THREE.PointLight(color,intensity,distance,decay);l.position.set(x,y,z);parent.add(l);return l;}
function setObjective(text){objective=text;$('objective-text').textContent=text;}
function transitionTo(action){if(transitioning)return;transitioning=true;const cover=$('scene-fade');cover.classList.add('show');setTimeout(()=>{action();setTimeout(()=>{cover.classList.remove('show');transitioning=false;},180);},430);}
function setChapter(chapter,location){$('chapter-name').textContent=chapter;$('location-name').textContent=location;}
function showToast(text,duration=2600){$('toast').textContent=text;$('toast').classList.add('visible');toastTimer=duration;}
function updateHealth(){ $('health-fill').style.width=`${health}%`; $('health-value').textContent=`${Math.ceil(health)} / 100`; }
function updateSlots(){
  const owned={1:inventory.lighter,2:inventory.carbine,3:inventory.portal};
  const slots=[...document.querySelectorAll('.slot')];let firstOwned=0;
  for(const slot of slots){const n=Number(slot.dataset.slot),has=!!owned[n];slot.classList.toggle('hidden',!has);slot.style.display=has?'flex':'none';slot.setAttribute('aria-hidden',String(!has));if(has&&!firstOwned)firstOwned=n;}
  if(!owned[selectedSlot])selectedSlot=firstOwned||0;
  slots.forEach(slot=>slot.classList.toggle('active',Number(slot.dataset.slot)===selectedSlot&&!!owned[Number(slot.dataset.slot)]));
  $('inventory').classList.toggle('hidden',!firstOwned);
  if(weaponRig)weaponRig.visible=(phase==='basement'||phase==='garden')&&inventory.carbine&&selectedSlot===2;
  if(lighterRig)lighterRig.visible=(phase==='church'||phase==='basement')&&inventory.lighter&&selectedSlot===1;
  if(portalRig)portalRig.visible=(phase==='church'||phase==='basement'||phase==='garden')&&inventory.portal&&selectedSlot===3;
}
function setPhase(next){phase=next;sceneTime=0;interactables=[];colliders=[];enemies=[];projectiles=[];particles=[];flightEnemies=[];flightShots=[];animatedObjects=[];currentInteract=null;}
function clearWorld(){while(world.children.length){const child=world.children[0];world.remove(child);child.traverse?.(o=>{if(o.geometry)o.geometry.dispose();if(o.material){if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});}candleLight=null;candleFlame=null;portalMesh=null;pulseLights=[];}
function baseScene(color,fogColor,fogDensity){
  for(const child of [...scene.children])if(child.isLight)scene.remove(child);
  scene.background=new THREE.Color(color);scene.fog=new THREE.FogExp2(fogColor,fogDensity);
  const hemi=new THREE.HemisphereLight(0xb9c7d8,0x28252a,.88);scene.add(hemi);
  const moon=new THREE.DirectionalLight(0xa9bfd4,.72);moon.position.set(-18,28,14);moon.castShadow=true;moon.shadow.mapSize.set(1536,1536);moon.shadow.camera.left=-42;moon.shadow.camera.right=42;moon.shadow.camera.top=42;moon.shadow.camera.bottom=-42;moon.shadow.bias=-.00025;scene.add(moon);
  const fill=new THREE.AmbientLight(0x85909b,.24);scene.add(fill);
}
function plane(parent,w,d,material,x=0,y=0,z=0){const p=addMesh(parent,new THREE.PlaneGeometry(w,d),material,v3(x,y,z),v3(-Math.PI/2,0,0),null,false,true);return p;}
function addInteract(mesh,name,action,range=2.25,kind='object'){const entry={mesh,name,action,range,kind,position:mesh.getWorldPosition(v3()),enabled:true};interactables.push(entry);return entry;}
function registerAnimated(object,type='pickup',amplitude=.08,speed=1){object.userData.animBaseY=object.position.y;object.userData.animBaseRot=object.rotation.y;animatedObjects.push({object,type,amplitude,speed,phase:rand(0,Math.PI*2)});return object;}
function collectPickup(object,color=0xc9efc8){
  const entry=interactables.find(item=>item.mesh===object);if(entry)entry.enabled=false;
  object.userData.collecting=true;animatedObjects.push({object,type:'collect',elapsed:0,duration:.28,startScale:object.scale.clone(),color});
  spawnImpact(object.getWorldPosition(v3()),color);pickupPulse=.28;playSfx('pickup');
}
function playPourEffect(color){
  if(!deadAlien)return;const forward=camera.getWorldDirection(v3());const start=camera.position.clone().add(forward.multiplyScalar(.48)).add(v3(.16,-.1,0));const end=deadAlien.position.clone().add(v3(0,1.2,0));const mid=start.clone().lerp(end,.48).add(v3(0,.95,.15));const curve=new THREE.QuadraticBezierCurve3(start,mid,end);const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:.72});const stream=addMesh(world,new THREE.TubeGeometry(curve,18,.025,7,false),material,v3(0,0,0),null,null,false,false);stream.userData.life=.55;stream.userData.disposeMaterial=true;particles.push(stream);for(let i=0;i<9;i++){const p=sphere(world,.035,mat(color,.18,0,{emissive:color,emissiveIntensity:1.7,transparent:true,opacity:1}),start.x,start.y,start.z,.8,1.2,.8);p.userData.disposeMaterial=true;p.userData.life=rand(.24,.5);p.userData.velocity=end.clone().sub(start).normalize().multiplyScalar(rand(3,6)).add(v3(rand(-.7,.7),rand(-.2,.6),rand(-.7,.7)));particles.push(p);}spawnImpact(end,color);
}
function addCollider(x,z,w,d){colliders.push({x,z,w,d});}
function blocked(x,z){for(const c of colliders){if(Math.abs(x-c.x)<c.w/2+.35&&Math.abs(z-c.z)<c.d/2+.35)return true;}return false;}
function movePlayer(dt){const speed=(keys.ShiftLeft||keys.ShiftRight)?6.8:4.25;tmpDir.set(-Math.sin(yaw),0,-Math.cos(yaw));tmpRight.set(Math.cos(yaw),0,-Math.sin(yaw));tmpMove.set(0,0,0);if(keys.KeyW||keys.ArrowUp)tmpMove.add(tmpDir);if(keys.KeyS||keys.ArrowDown)tmpMove.sub(tmpDir);if(keys.KeyD||keys.ArrowRight)tmpMove.add(tmpRight);if(keys.KeyA||keys.ArrowLeft)tmpMove.sub(tmpRight);if(tmpMove.lengthSq()>0){tmpMove.normalize().multiplyScalar(speed*dt);let nx=player.x+tmpMove.x,nz=player.z+tmpMove.z;if(phase==='garden'){nx=clamp(nx,-26,26);nz=clamp(nz,-29,29);}else if(phase==='basement'){nx=clamp(nx,-7.2,7.2);nz=clamp(nz,-11.8,11.8);}else{nx=clamp(nx,-8.2,8.2);nz=clamp(nz,-14.2,14.2);}if(!blocked(nx,player.z))player.x=nx;if(!blocked(player.x,nz))player.z=nz;}player.y=1.65;}
function setCameraFPS(dt=0){camera.position.set(player.x,player.y,player.z);const kick=(phase==='garden'||phase==='basement')?weaponRecoil*.055:0;camera.rotation.set(pitch+kick,yaw,0,'YXZ');}
function addFloor(w,d,colorOrMat=mat('#303136'),x=0,z=0){const m=typeof colorOrMat==='string'?mat(colorOrMat):colorOrMat;return plane(world,w,d,m,x,0,z);}
function addWall(w,h,d,material,x,y,z){const o=box(world,w,h,d,material,x,y,z);addCollider(x,z,w,d);return o;}
function addArch(parent,x,y,z,r,material){const geo=new THREE.TorusGeometry(r,.16,10,32,Math.PI);const o=addMesh(parent,geo,material,v3(x,y,z),v3(0,0,Math.PI));return o;}

// -------------------- INTRO / EXTERIOR --------------------
function buildCathedral(parent,x,z,scale=1){
  const g=new THREE.Group();g.position.set(x,0,z);g.scale.setScalar(scale);parent.add(g);
  const stone=mat('#c3c2bd'), trim=mat('#e0ddd5'), shadow=mat('#757a81'), gold=mat('#9b8358',.42,.55), door=mat('#272a30');
  box(g,13,8.2,8,stone,0,4.1,0);box(g,14,.35,8.8,trim,0,8.15,0);box(g,9,1.5,8.5,trim,0,8.9,0);
  // Facade pilasters, deep portals and circular windows.
  for(let x1 of [-5.2,-2.8,0,2.8,5.2]){box(g,.42,7.2,.56,trim,x1,4.1,4.15);box(g,.7,.35,.75,trim,x1,7.75,4.15);box(g,.7,.35,.75,trim,x1,.55,4.15);}
  for(let x1 of [-4.3,-1.8,1.8,4.3]){const w=sphere(g,.55,shadow,x1,5.7,4.18,1,1,.12);sphere(g,.35,mat('#393e47'),x1,5.7,4.28,1,1,.08);}
  // Main arched entrance.
  box(g,2.6,4.4,.25,door,0,2.2,4.24);addArch(g,0,4.35,4.25,1.3,trim);box(g,2.9,.18,.5,gold,0,4.2,4.36);
  for(let s of [-1,1]){box(g,.35,3.8,.45,trim,s*1.55,2,4.2);cylinder(g,.22,.22,.35,trim,s*1.55,4,4.2);}
  // Central drum and dome.
  cylinder(g,2.65,2.9,2.2,trim,0,10,0,40);for(let i=0;i<16;i++){let a=i*Math.PI/8;const c=box(g,.18,1.55,.35,trim,Math.sin(a)*2.52,10.05,Math.cos(a)*2.52);c.rotation.y=a;}
  const dome=addMesh(g,new THREE.SphereGeometry(2.8,32,20,0,Math.PI*2,0,Math.PI/2),mat('#aaa79d'),v3(0,11.2,0),null,v3(1,1.1,1));
  torus(g,2.65,.1,gold,0,10.65,0);
  cylinder(g,.09,.09,2.2,gold,0,14.1,0,12);sphere(g,.12,gold,0,15.2,0,.65,1,.65);
  // Smaller corner domes and bell towers.
  for(const [sx,sz] of [[-5.1,2.7],[5.1,2.7],[-5.1,-2.7],[5.1,-2.7]]){
    cylinder(g,.92,1.12,1.45,trim,sx,9.2,sz,24);const d=addMesh(g,new THREE.SphereGeometry(1.05,24,16,0,Math.PI*2,0,Math.PI/2),mat('#a8a398'),v3(sx,10.05,sz),null,v3(1,1,1));cylinder(g,.045,.045,1.2,gold,sx,11.1,sz,8);
  }
  // Side windows / stone bands.
  for(let side of [-1,1])for(let z1 of [-2.5,0,2.5]){box(g,.2,4.4,.85,trim,side*6.57,4.2,z1);box(g,.22,2.1,.62,shadow,side*6.69,4.7,z1);}
  return g;
}
function buildIntro(){clearWorld();setPhase('intro');baseScene('#7d8794','#8d97a5',.012);scene.fog.color.set('#8e98a8');scene.fog.density=.012;
  const ground=mat('#555b64');plane(world,180,180,ground,0,-.25,-5);
  // River and embankment.
  const river=mat('#202a35',.18,.5);plane(world,180,34,river,0,-.15,24);
  for(let i=0;i<70;i++){const l=box(world,rand(.15,.8),.018,rand(.4,1.5),mat('#73818a',.3,.2,{transparent:true,opacity:.25}),rand(-42,42),-.04,rand(10,39));l.rotation.y=rand(0,Math.PI);}
  box(world,100,1.4,1.4,mat('#666b70'),0,.35,6);box(world,100,.2,1.8,mat('#85878a'),0,1.1,6);
  // Cathedral is the main distant silhouette.
  const cathedral=buildCathedral(world,-9,-7,.96);cathedral.rotation.y=-.18;
  // Winter trees on the river bank.
  for(let i=0;i<26;i++){let x=rand(-33,33),z=rand(-3,4);if(x>-18&&x<3)continue;const trunk=cylinder(world,.08,.16,2.8,mat('#292b30'),x,1.4,z,7);for(let j=0;j<5;j++){const branch=cylinder(world,.025,.08,rand(1.5,2.5),mat('#303238'),x+rand(-.7,.7),rand(2.2,3.6),z+rand(-.7,.7),6);branch.rotation.z=rand(-.8,.8);}}
  // Steel pedestrian bridge across the frame.
  const bridge=new THREE.Group();bridge.position.set(10,0,-1);bridge.rotation.y=-.12;world.add(bridge);
  box(bridge,28,.38,2.8,mat('#25292e',.45,.65),0,5.4,0);box(bridge,28,.14,2.9,mat('#b6a06a',.4,.5,{emissive:'#735d32',emissiveIntensity:.65}),0,5.65,0);
  for(let x=-13;x<=13;x+=1.15){box(bridge,.07,1.45,.07,mat('#25292d',.55,.6),x,6.25,-1.27);box(bridge,.07,1.45,.07,mat('#25292d',.55,.6),x,6.25,1.27);}
  for(let x=-14;x<=14;x+=2.3){box(bridge,.09,.16,3,mat('#b9a16a',.35,.45,{emissive:'#8c6e37',emissiveIntensity:.9}),x,6.95,0);}
  const archCurve=new THREE.QuadraticBezierCurve3(v3(-14,0,0),v3(0,3.3,0),v3(14,0,0));
  for(const side of [-1,1]){const path=archCurve.getPoints(56).map(p=>v3(p.x,p.y+5.4,side*1.08));const curve=new THREE.CatmullRomCurve3(path);addMesh(bridge,new THREE.TubeGeometry(curve,64,.105,10,false),mat('#3a4245',.34,.72),v3(0,0,0));}
  // Repeated hangers and diagonal web members make the illuminated bridge read as steelwork, not a flat slab.
  for(let x=-13;x<=13;x+=1.05){const rise=3.3*(1-(x/14)**2),height=Math.max(.12,rise);for(const side of [-1,1]){box(bridge,.055,height,.055,mat('#353c40',.4,.72),x,5.4+height/2,side*1.08);if(Math.abs(x)<12){const next=x+1.05,nextRise=3.3*(1-(next/14)**2);const brace=box(bridge,.045,Math.hypot(1.05,nextRise-rise),.045,mat('#343b3f',.4,.72),(x+next)/2,5.4+(rise+nextRise)/2,side*1.08);brace.rotation.z=Math.atan2(nextRise-rise,1.05);}}}
  for(let x=-13;x<=13;x+=2.2){const cross=box(bridge,.06,.06,2.2,mat('#4a5051',.38,.68),x,5.18,0);}
  // Fine bridge lamps.
  for(let x=-12;x<=12;x+=4){cylinder(bridge,.045,.065,2.2,mat('#25292e'),x,7.1,0,8);sphere(bridge,.14,mat('#e2bd76',.25,0,{emissive:'#ffce75',emissiveIntensity:2}),x,8.25,0,.8,1,.8);addLight(bridge,0xffc56e,.7,8,x,8.1,0);}
  // Distant city silhouettes.
  for(let i=0;i<22;i++){let x=rand(-48,48),z=rand(-30,-20),h=rand(5,15);box(world,rand(3,7),h,rand(3,5),mat(i%3?'#69717c':'#545d67'),x,h/2,z);}
  // The incoming saucer, suspended in the haze.
  const saucer=createUFO();saucer.position.set(12,18,-20);saucer.scale.setScalar(.85);world.add(saucer);saucer.userData.intro=true;
  // Weather particles.
  for(let i=0;i<210;i++){const p=sphere(world,.025,mat('#cfd4dd',.4,0,{transparent:true,opacity:rand(.15,.55)}),rand(-42,42),rand(0,25),rand(-20,34));p.userData.fall=rand(2,7);particles.push(p);}
  camera.position.set(2,5.1,33);camera.lookAt(-5,8,-6);camera.rotation.order='YXZ';
  introTime=0;
  $('intro-copy').classList.add('hidden');$('intro-copy').classList.add('active');$('hud').classList.add('hidden');$('ending-screen').classList.add('hidden');
}
function createLightning(){const pts=[];let x=-7,y=20,z=-6;pts.push(v3(x,y,z));for(let i=0;i<10;i++){x+=rand(-1.1,1.1);y-=rand(1,2.6);z+=rand(-.5,.5);pts.push(v3(x,y,z));}const geo=new THREE.BufferGeometry().setFromPoints(pts);const bolt=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xbaff8b,transparent:true,opacity:1}));world.add(bolt);const flash=addLight(world,0x8bff80,24,40,-8,8,-5);const pulse=addLight(world,0xff4440,5,18,-8,8,-5);setTimeout(()=>{world.remove(bolt);world.remove(flash);world.remove(pulse);},520);for(let i=0;i<18;i++){const p=sphere(world,rand(.05,.16),i%2?M.glowGreen:M.glowRed,-8+rand(-2,2),rand(7,14),-5+rand(-2,2));p.userData.life=rand(.25,.6);particles.push(p);}}

// -------------------- CHURCH INTERIOR --------------------
function makeStainedGlassTexture(seed=0){
  const c=document.createElement('canvas');c.width=256;c.height=512;const ctx=c.getContext('2d');
  ctx.fillStyle='#17191e';ctx.fillRect(0,0,256,512);
  const cols=['#526c75','#7f4b50','#a17c48','#53695f','#a6a092'];
  for(let y=0;y<8;y++)for(let x=0;x<4;x++){const pad=7;ctx.fillStyle=cols[(x+y+seed)%cols.length];ctx.globalAlpha=.72;ctx.fillRect(x*64+pad,y*64+pad,50,50);ctx.globalAlpha=.2;ctx.fillStyle='#eff0df';ctx.fillRect(x*64+pad+4,y*64+pad+4,5,42);}
  ctx.globalAlpha=1;ctx.strokeStyle='#26282a';ctx.lineWidth=10;ctx.strokeRect(4,4,248,504);ctx.lineWidth=5;for(let x=64;x<256;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,512);ctx.stroke();}for(let y=64;y<512;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(256,y);ctx.stroke();}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
function addChurchWindow(x,z,side,index){
  const frame=mat('#4d443b',.65,.12),glass=new THREE.MeshStandardMaterial({map:makeStainedGlassTexture(index),emissive:'#24333c',emissiveIntensity:.42,roughness:.32,side:THREE.DoubleSide});
  box(world,.22,3.65,1.72,frame,x,5.1,z);
  const pane=addMesh(world,new THREE.PlaneGeometry(1.42,3.28),glass,v3(x+(side<0?.13:-.13),5.1,z),v3(0,side<0?Math.PI/2:-Math.PI/2,0),null,false,true);
  box(world,.28,3.85,.12,mat('#8c806d'),x,5.1,z);box(world,.32,.12,1.85,mat('#8c806d'),x,3.24,z);box(world,.32,.12,1.85,mat('#8c806d'),x,6.96,z);
}
function addNaveArch(z){
  const pts=[v3(-8.2,7.2,z),v3(-7.4,8.3,z),v3(-5.8,9.15,z),v3(-3.5,9.75,z),v3(0,9.95,z),v3(3.5,9.75,z),v3(5.8,9.15,z),v3(7.4,8.3,z),v3(8.2,7.2,z)];
  const curve=new THREE.CatmullRomCurve3(pts);addMesh(world,new THREE.TubeGeometry(curve,48,.16,10,false),mat('#77756f',.72),v3(0,0,0));
}
function buildChurch(){
  clearWorld();setPhase('church');baseScene('#20242b','#20242a',.012);scene.add(new THREE.AmbientLight(0x73808e,.25));
  const floorMat=mat('#504c47',.94,0,{map:pavingTex,bumpMap:pavingTex,bumpScale:.075}),wallMat=mat('#a7a194',.94,0,{map:stoneTex,bumpMap:stoneTex,bumpScale:.055}),trim=mat('#d1c8b6',.78,0,{map:stoneTex}),wood=mat('#382a26',.8,0,{map:woodTex,bumpMap:woodTex,bumpScale:.08}),dark=mat('#17191c',.94);
  plane(world,18,30,floorMat,0,0,0);box(world,18,.42,30,dark,0,-.24,0);
  // Tall plaster nave, pilasters and a shallow barrel vault.
  addWall(18,9.2,.55,wallMat,0,4.6,-15);addWall(18,9.2,.55,wallMat,0,4.6,15);addWall(.55,9.2,30,wallMat,-9,4.6,0);addWall(.55,9.2,30,wallMat,9,4.6,0);
  box(world,17.5,.35,29,mat('#5c5b58'),0,9.05,0);
  for(let z=-12;z<=12;z+=4){
    for(const x of [-7.9,7.9]){
      cylinder(world,.46,.55,7.6,trim,x,3.85,z,20);for(let y=.5;y<7.5;y+=1.35)torus(world,.48,.035,mat('#8c8679'),x,y,z,Math.PI/2,0,0);
      box(world,1.1,.42,1.1,trim,x,7.85,z);box(world,1.35,.18,1.35,mat('#817b70'),x,8.12,z);
    }
    addNaveArch(z);
  }
  // Inlaid floor runner and alternating stone slabs.
  box(world,3.4,.025,24,mat('#59423a',.9,0,{map:woodTex}),0,.025,0);
  for(let z=-13;z<=13;z+=2){for(let x=-7;x<=7;x+=2){box(world,1.88,.018,1.88,mat((Math.abs(x/2+z/2)%2)?'#817c72':'#66645e',.95,0,{map:pavingTex}),x,.012,z);}}
  // Stained-glass clerestory windows, visible as cool colour bands through the nave.
  let winIndex=0;for(const side of [-1,1])for(let z=-10;z<=10;z+=5){addChurchWindow(side*8.68,z,side,winIndex++);}
  // Orthodox icon wall and sanctuary: layered timber, gilded borders and candle rows.
  box(world,11,5.5,.65,wood,0,2.75,-13.7);box(world,11,.2,.78,M.gold,0,5.55,-13.67);
  for(let x=-4.7;x<=4.7;x+=1.55){box(world,1.27,3.8,.12,mat('#4c3931'),x,2.8,-13.3);box(world,1.12,3.55,.035,mat('#8a7354',.75,.1),x,2.8,-13.2);box(world,.06,3.55,.05,M.gold,x-.61,2.8,-13.14);box(world,.06,3.55,.05,M.gold,x+.61,2.8,-13.14);sphere(world,.24,M.gold,x,4.65,-13.12,.8,1.2,.12);}
  box(world,.12,3.9,.17,M.gold,0,7.7,-13.1);box(world,2.1,.12,.16,M.gold,0,8.4,-13.1);sphere(world,.2,M.gold,0,9.05,-13.1,.8,1.1,.8);
  // Carved pews with end caps and kneelers.
  for(let z=-7;z<=7;z+=3.5)for(const x of [-5.2,5.2]){
    box(world,3.15,.42,.68,wood,x,.82,z);box(world,3.2,.16,.74,mat('#5b4034',.72,0,{map:woodTex}),x,1.12,z+.05);box(world,3.1,.16,.3,wood,x,1.52,z-.24);
    for(const dx of [-1.35,1.35]){box(world,.18,1.35,.72,wood,x+dx,.72,z);sphere(world,.12,M.gold,x+dx,.95,z+.39,.8,1,.4);}
    addCollider(x,z,3.2,.8);
  }
  // Hanging iron chandeliers with warm bulbs illuminate just their pools of space.
  for(const z of [-6,2,10]){const ring=torus(world,1.18,.07,mat('#655747',.45,.58),0,7.3,z);cylinder(world,.045,.045,2.4,mat('#403a33'),0,8.55,z,8);for(let i=0;i<8;i++){const a=i*Math.PI/4;const bulb=sphere(world,.09,M.warm,Math.cos(a)*1.03,7.3,z+Math.sin(a)*1.03,.9,1.1,.9);addLight(world,0xffc17a,.48,6,bulb.position.x,bulb.position.y,z+bulb.position.z);}}
  // Lectern, candle, lighter and the alien-script book are physical readable props.
  const lectern=box(world,1.25,1.2,1.05,mat('#645d53',.9,0,{map:stoneTex}),1.2,.6,-6.8);box(world,1.48,.15,1.25,trim,1.2,1.28,-6.8);cylinder(world,.075,.085,.42,mat('#d8c8a9'),.9,1.56,-6.8,14);
  candleFlame=sphere(world,.065,mat('#ffe9b5',.18,0,{emissive:'#ffb84d',emissiveIntensity:4}),.9,1.83,-6.8,.7,1.8,.7);candleLight=addLight(world,0xffb96d,2.25,11,.9,1.95,-6.8);candleLight.userData.flicker=true;
  const lighter=new THREE.Group();lighter.position.set(1.55,1.41,-6.76);box(lighter,.22,.34,.1,mat('#9ea2a2',.24,.78),0,.15,0);box(lighter,.2,.09,.12,mat('#c6b98d',.28,.7),0,.35,0);box(lighter,.08,.03,.13,mat('#33383a',.3,.5),0,.4,-.005);sphere(lighter,.028,M.glowRed,0,.23,.057,.8,.8,.3);world.add(lighter);registerAnimated(lighter,'pickup',.035,1.6);
  addInteract(lighter,'ЗАБРАТЬ ЗАЖИГАЛКУ',()=>{if(!inventory.lighter){inventory.lighter=true;collectPickup(lighter,0xffd18b);equipPulse=.42;showToast('ЗАЖИГАЛКА ДОБАВЛЕНА В ИНВЕНТАРЬ');selectedSlot=1;updateSlots();setObjective('Прочитать книгу на аналое.');}else showToast('ЗАЖИГАЛКА УЖЕ У ВАС');},2.5,'pickup');
  const book=new THREE.Group();book.position.set(.45,1.41,-6.82);box(book,.78,.12,.62,mat('#322826',.76,0,{map:woodTex}),0,0,0);box(book,.035,.13,.6,mat('#bba77a'),-.37,.01,0);box(book,.66,.008,.5,mat('#bcb39b'),.02,.067,0);for(let i=0;i<6;i++)box(book,.36,.006,.012,mat('#514a3e'),.02,.074,-.19+i*.075);registerAnimated(book,'book',.012,.8);world.add(book);
  const rune=torus(world,.7,.05,M.glowGreen,0,.22,-11.9,Math.PI/2,0,0);rune.visible=false;
  addInteract(book,'ПРОЧИТАТЬ КНИГУ',()=>{if(!bookRead){bookRead=true;rune.visible=true;hatchGlow.intensity=1.4;hatchInteract.enabled=true;showToast('ЗНАКИ НЕ ПОХОЖИ НИ НА ОДИН ЧЕЛОВЕЧЕСКИЙ АЛФАВИТ');setObjective('Свеча зажгла метку у входа в подвал.');playSfx('pickup');}else showToast('СИМВОЛЫ МЕНЯЮТСЯ, ПОКА ТЫ НА НИХ СМОТРИШЬ.');},2.5,'book');
  // Concealed trapdoor is not interactable until the book has been examined.
  const hatch=box(world,2.45,.18,2.25,wood,0,.08,-12);hatch.rotation.y=.04;const hatchGlow=addLight(world,0x9effa1,0,5,0,.6,-12);
  for(let i=0;i<8;i++){const step=box(world,2.1,.18,.52,mat('#3a3834'),0,.14+i*.08,-10.2-i*.43);step.rotation.x=-.03;}
  const hatchInteract=addInteract(hatch,'СПУСТИТЬСЯ В ПОДВАЛ',()=>{if(!bookRead){showToast('СНАЧАЛА ПРОЧИТАЙ КНИГУ.');return;}transitionTo(()=>{buildBasement();showToast('НИЖНИЙ УРОВЕНЬ / СЕКТОР −01');});},2.8,'door');hatchInteract.enabled=false;
  for(let i=0;i<52;i++){const p=sphere(world,rand(.009,.02),mat('#ead4ad',.3,0,{transparent:true,opacity:.26}),rand(-4,4),rand(.5,7),rand(-11,-4));p.userData.dust=true;particles.push(p);}
  // A cool shaft through the entry and warm candlelight create readable contrast, not crushed blacks.
  const entryFill=addLight(world,0x829bb8,1.05,20,0,6,10);const altarFill=addLight(world,0xffd19a,.58,15,0,4,-11);const sideFill=addLight(world,0x8c9aa8,.42,12,-7,5,-1);
  // Dust-lit shafts from high stained glass; subtle volumetric geometry keeps the nave readable.
  for(const side of [-1,1])for(const z of [-8,2,10]){const beamMat=new THREE.MeshBasicMaterial({color:side<0?0x9cb7d0:0xc6a68a,transparent:true,opacity:.035,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});const beam=addMesh(world,new THREE.ConeGeometry(2.35,7.2,18,1,true),beamMat,v3(side*7.5,4.25,z),null,null,false,false);beam.quaternion.setFromUnitVectors(v3(0,1,0),v3(-side*.58,-.78,.08).normalize());}
  for(const side of [-1,1])for(const z of [-10,0,10])addLight(world,side<0?0x8bb6cf:0xd5a07b,.34,8,side*7.6,5.1,z);
  player.set(0,1.65,10.3);yaw=0;pitch=0;setCameraFPS();setChapter('ГЛАВА 01 / ХРАМ','ХРАМ ХРИСТА СПАСИТЕЛЯ');setObjective('Осмотреть церковь. Найти зажигалку и прочитать книгу.');
  $('hud').classList.remove('hidden');$('intro-copy').classList.add('hidden');$('flight-hud').classList.add('hidden');$('shift-prompt').classList.add('hidden');$('crosshair').classList.remove('hidden');updateSlots();
  if(!inventory.lighter)selectedSlot=0;
}

function buildBasement(){clearWorld();setPhase('basement');baseScene('#171a1d','#17191c',.014);scene.add(new THREE.AmbientLight(0x727b83,.28));
  const concrete=mat('#696762',.96,0,{map:concreteTex,bumpMap:concreteTex,bumpScale:.07}), floor=mat('#343638',.94,0,{map:pavingTex,bumpMap:pavingTex,bumpScale:.06}), metal=mat('#454b4f',.5,.58), brick=mat('#57443d',.96,0,{map:brickTex,bumpMap:brickTex,bumpScale:.07});
  plane(world,16,26,floor,0,0,0);box(world,16,.5,26,concrete,0,-.28,0);box(world,16,.5,26,concrete,0,5.1,0);
  addWall(16,5,.5,brick,0,2.5,-13);addWall(16,5,.5,concrete,0,2.5,13);addWall(.5,5,26,brick,-8,2.5,0);addWall(.5,5,26,concrete,8,2.5,0);
  // Exposed brick, service conduits and old municipal infrastructure.
  for(let side of [-1,1]){
    const pipe=cylinder(world,.12,.12,22,metal,side*6.9,4.4,0,12);pipe.rotation.x=Math.PI/2;
    const thin=cylinder(world,.045,.045,22,mat('#74716a',.5,.6),side*6.45,4.75,0,8);thin.rotation.x=Math.PI/2;
    for(let z=-8;z<=8;z+=4){box(world,.4,.2,.5,metal,side*6.9,3.9,z);box(world,.16,.18,.18,mat('#7b7060'),side*6.45,4.75,z);}
    for(let z=-10;z<=10;z+=5){box(world,.38,4.8,.38,brick,side*7.65,2.4,z);box(world,.5,.18,.5,metal,side*7.65,4.85,z);}
  }
  // Floor drains, cable trays, warning labels and a low service bench.
  for(let z=-10;z<=10;z+=5){box(world,2.4,.025,.72,mat('#1d2224',.4,.7),0,.018,z);for(let i=-5;i<=5;i++)box(world,.035,.028,.68,metal,i*.2,.04,z);}
  box(world,2.6,.08,.75,metal,-5.3,.08,5.8);for(let i=0;i<7;i++)box(world,.08,.6,.08,mat('#514b40'),-6.4+i*.36,.38,5.8);
  const controlPanel=box(world,.95,1.25,.12,mat('#343b3c',.48,.4),7.55,2.1,-8);box(world,.7,.7,.035,mat('#192322',.35,.2,{emissive:'#102520',emissiveIntensity:.3}),7.48,2.2,-7.91);for(let i=0;i<4;i++)sphere(world,.06,i%2?M.glowRed:M.glowGreen,7.2+i*.19,2.28,-7.86,.8,.8,.4);
  const warning=makeWallText('SECTOR 09  /  KEEP OUT','#d1b37b');addMesh(world,new THREE.PlaneGeometry(1.8,.45),new THREE.MeshBasicMaterial({map:warning,transparent:true}),v3(7.72,3.25,-8),v3(0,-Math.PI/2,0));
  for(let z=-9;z<=9;z+=6){box(world,.35,.12,.35,metal,0,4.65,z);const lamp=sphere(world,.1,mat('#c49b67',.3,0,{emissive:'#bd7136',emissiveIntensity:1.5}),0,4.5,z);addLight(world,0xff9c54,.55,6,0,4.3,z);box(world,12,.035,.12,mat('#8b8576'),0,.02,z);}
  // Stairwell at the back.
  for(let i=0;i<9;i++){const step=box(world,3,.2,.55,mat('#343536'),0,.15+i*.22,-10+i*.7);}
  box(world,3,.35,1.4,mat('#252629'),0,2.15,-4.1);
  // Dead alien on the examination slab: strange, but not graphic.
  box(world,3.2,.65,2.3,metal,0,.65,-3.6);box(world,3.4,.12,2.5,mat('#686a66'),0,1.03,-3.6);addCollider(0,-3.6,3.2,2.3);
  deadAlien=createAlien(v3(0,1.12,-3.6),false,true);world.add(deadAlien);addInteract(deadAlien,'ИСПОЛЬЗОВАТЬ СОБРАННЫЕ СОСТАВЫ',performRitual,3.0,'ritual');
  // Blood chalice and vial of holy water.
  const chalice=new THREE.Group();chalice.position.set(-4,0,1);world.add(chalice);cylinder(chalice,.14,.23,.34,M.gold,0,.28,0,16);cylinder(chalice,.055,.1,.22,M.gold,0,.06,0,16);cylinder(chalice,.23,.23,.055,M.gold,0,.48,0,20);cylinder(chalice,.18,.18,.02,mat('#4d131c',.25,0,{emissive:'#31050a',emissiveIntensity:.3}),0,.47,0,20);
  registerAnimated(chalice,'pickup',.08,1.1);addInteract(chalice,'ВЗЯТЬ ЧАШУ С КРОВЬЮ',()=>{if(!inventory.blood){inventory.blood=true;collectPickup(chalice,0xb9434d);showToast('ЧАША С КРОВЬЮ ДОБАВЛЕНА');setObjective('Найти святую воду.');updateSlots();}else showToast('ЧАША УЖЕ У ВАС');},2.5,'pickup');
  const bottle=new THREE.Group();bottle.position.set(4,0,1);world.add(bottle);cylinder(bottle,.18,.22,.62,mat('#8a9a9a',.2,.1,{transparent:true,opacity:.72}),0,.34,0,20);cylinder(bottle,.08,.08,.17,M.gold,0,.73,0,16);cylinder(bottle,.12,.12,.04,mat('#d7d0b6'),0,.83,0,16);sphere(bottle,.14,M.blue,0,.25,0,1,.5,1);
  registerAnimated(bottle,'pickup',.07,1.35);addInteract(bottle,'ЗАБРАТЬ СВЯТУЮ ВОДУ',()=>{if(!inventory.water){inventory.water=true;collectPickup(bottle,0x9ddbe4);showToast('СВЯТАЯ ВОДА ДОБАВЛЕНА');setObjective('Вернуться к существу и использовать предметы по порядку.');updateSlots();}else showToast('ВОДА УЖЕ У ВАС');},2.5,'pickup');
  // A hand-painted clue on a wall.
  const sigil=torus(world,.75,.055,M.glowGreen,-5,2.1,-12,0,0,0);sigil.rotation.y=Math.PI/2;
  const runeText=makeWallText('S A  /  09  /  N', '#b1c69a');const sign=addMesh(world,new THREE.PlaneGeometry(2.8,.55),new THREE.MeshBasicMaterial({map:runeText,transparent:true,opacity:.85}),v3(-7.73,2.7,-8),v3(0,Math.PI/2,0));
  for(let x=-6;x<=6;x+=2){box(world,.1,4.6,.1,metal,x,2.3,-12.55);box(world,.12,.08,25,metal,x,4.85,0);}
  const backFill=addLight(world,0x80919b,.48,17,0,3,-10);const slabFill=addLight(world,0x9cb7a6,.42,8,0,3,-3.6);
  player.set(0,1.65,9.5);yaw=0;pitch=0;setCameraFPS();bloodPoured=false;waterPoured=false;setChapter('ГЛАВА 01 / НИЖНИЙ УРОВЕНЬ','ПОДВАЛ');setObjective('Найти чашу с кровью и святую воду.');
}
function makeWallText(text,color='#d8d2c1'){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.clearRect(0,0,512,128);ctx.fillStyle=color;ctx.font='24px monospace';ctx.textAlign='center';ctx.fillText(text,256,70);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}

// -------------------- ALIEN CHARACTER / STORY --------------------
function createAlien(position,hostile=false,lying=false){
  const root=new THREE.Group();root.position.copy(position);root.userData.isAlien=true;root.userData.hostile=hostile;
  const skin=hostile?mat('#59635f',.58,.08):mat('#9ba89d',.7,.02),shadow=mat('#222a2a',.48,.18),shell=mat(hostile?'#303a3b':'#59645d',.34,.48),eye=hostile?mat('#ff625d',.18,.05,{emissive:'#fa292c',emissiveIntensity:3.8}):mat('#c8f5b7',.2,0,{emissive:'#7dda72',emissiveIntensity:2.5}),bone=mat('#a6a99a',.78,.02);
  const torso=new THREE.Group();torso.position.y=1.05;root.add(torso);root.userData.torso=torso;
  sphere(torso,.49,skin,0,.05,0,.88,1.36,.66);sphere(torso,.46,shell,0,.18,-.12,.92,1.1,.74);
  // Layered rib plates and an unmistakable narrow, hunched silhouette.
  for(let i=0;i<4;i++){const rib=torus(torso,.31+i*.045,.045,shadow,0,.02-i*.18,.22,Math.PI/2,0,0);rib.scale.set(1,.72,1);}
  const headPivot=new THREE.Group();headPivot.position.set(0,.92,-.05);torso.add(headPivot);root.userData.headPivot=headPivot;
  sphere(headPivot,.41,skin,0,.12,0,1.12,.92,.83);sphere(headPivot,.34,shell,0,.22,-.09,1.05,.82,.84);
  sphere(headPivot,.155,eye,-.19,.13,.32,1,.92,.55);sphere(headPivot,.155,eye,.19,.13,.32,1,.92,.55);
  for(const side of [-1,1]){const horn=cylinder(headPivot,.025,.095,.48,shell,side*.26,.57,-.05,8);horn.rotation.z=side*.45;const cheek=sphere(headPivot,.12,shadow,side*.31,-.1,.22,1.3,.7,.55);}
  const jaw=box(headPivot,.43,.12,.32,shadow,0,-.2,.28);root.userData.jaw=jaw;
  const arms=[],legs=[];
  for(const side of [-1,1]){
    const arm=new THREE.Group();arm.position.set(side*.49,.58,0);torso.add(arm);arms.push(arm);
    cylinder(arm,.13,.19,.82,skin,side*.09,-.37,.02,12).rotation.z=-side*.1;
    sphere(arm,.19,shadow,side*.18,-.79,.09,1.1,.78,.9);
    for(let f=0;f<3;f++){const claw=cylinder(arm,.022,.045,.32,bone,side*(.16+(f-1)*.08),-1.02,.2,6);claw.rotation.x=-.5;claw.rotation.z=-side*.18;}
    const leg=new THREE.Group();leg.position.set(side*.2,-.65,0);torso.add(leg);legs.push(leg);
    cylinder(leg,.13,.18,.78,skin,0,-.35,0,12);sphere(leg,.2,shadow,0,-.76,.13,1.2,.42,1.6);
  }
  root.userData.arms=arms;root.userData.leftArm=arms[0];root.userData.rightArm=arms[1];root.userData.legs=legs;root.userData.animClock=rand(0,5);
  // A segmented dorsal ridge catches edge light when the creature turns.
  for(let i=0;i<5;i++){const spike=cylinder(root,.025,.12,.38,shell,0,1.25+i*.22,-.42,7);spike.rotation.x=-.38;spike.rotation.z=(i-2)*.1;}
  if(hostile){const shroud=sphere(root,.61,shadow,0,1.43,-.18,1.14,1.25,.72);shroud.position.y=1.43;root.scale.setScalar(1.04);root.userData.eyeGlow=eye;}
  else{const medallion=torus(root,.19,.035,M.gold,0,1.13,.48,Math.PI/2,0,0);}
  if(lying){root.rotation.z=Math.PI/2;root.rotation.y=-.25;root.position.y=.38;root.userData.lying=true;}
  return root;
}
function animateAlien(root,dt,speed=0,moving=false){
  if(!root?.userData?.torso)return;const data=root.userData;data.animClock=(data.animClock||0)+dt;const t=data.animClock;
  const gait=moving?Math.min(1,speed/3.5):0;data.torso.position.y=1.05+Math.sin(t*(moving?10:1.8))*(moving?.055:.018);data.torso.rotation.z=Math.sin(t*5)*.025*gait;data.torso.rotation.x=moving?-.08:Math.sin(t*1.6)*.025;
  const hit=data.hitFlash>0;data.hitFlash=Math.max(0,(data.hitFlash||0)-dt);data.arms?.forEach((arm,i)=>{const side=i===0?-1:1;arm.rotation.x=Math.sin(t*9+i*Math.PI)*.72*gait+(moving?-.2:Math.sin(t*1.3+i)*.07)+(hit?(i===0?-.52:.42):0);arm.rotation.z=side*(.08+Math.sin(t*4+i)*.06);});
  if(data.aiming&&data.rightArm){data.rightArm.rotation.x=THREE.MathUtils.damp(data.rightArm.rotation.x,-1.32,8,dt);data.rightArm.rotation.z=THREE.MathUtils.damp(data.rightArm.rotation.z,.2,8,dt);}
  data.legs?.forEach((leg,i)=>{leg.rotation.x=Math.sin(t*9+i*Math.PI)*.78*gait;});
  if(data.headPivot){data.headPivot.rotation.y=Math.sin(t*.75)*.18;data.headPivot.rotation.x=Math.sin(t*1.15)*.07+(moving?-.08:0);}
  if(data.jaw)data.jaw.rotation.x=.08+Math.sin(t*2.7)*.06;
}

function performRitual(){if(!deadAlien)return;if(!inventory.blood&&!bloodPoured){showToast('СНАЧАЛА НУЖНА ЧАША С КРОВЬЮ.');return;}if(inventory.blood&&!bloodPoured){inventory.blood=false;bloodPoured=true;playPourEffect(0x9b2838);showToast('КРОВЬ ПРОЛИТА НА СУЩЕСТВО. ТЕПЕРЬ — СВЯТАЯ ВОДА.');setObjective('Полить существо святой водой.');return;}if(!inventory.water&&!waterPoured){showToast('ТЕПЕРЬ НУЖНА СВЯТАЯ ВОДА.');return;}if(inventory.water&&!waterPoured){inventory.water=false;waterPoured=true;playPourEffect(0x91e2eb);showToast('СВЯТАЯ ВОДА КАСАЕТСЯ КОЖИ.');setTimeout(triggerResurrection,650);}}
function triggerResurrection(){if(!bloodPoured||!waterPoured)return;
  if(deadAlien){deadAlien.visible=false;world.remove(deadAlien);deadAlien=null;interactables=interactables.filter(i=>i.kind!=='ritual');}friendAlien=createAlien(v3(0,0,-3.5),false,false);friendAlien.scale.setScalar(.93);world.add(friendAlien);friendAlien.position.set(0,0,-3.5);
  const aura=sphere(world,.9,M.glowGreen,0,1,-3.5,1,.1,1);aura.material.transparent=true;aura.material.opacity=.24;setTimeout(()=>world.remove(aura),1400);
  showToast('СУЩЕСТВО ВЕРНУЛОСЬ К ЖИЗНИ',3000);beginDialogue('СУЩЕСТВО',[
    'Не двигайся. Ты вернул меня — значит, ещё не всё потеряно.',
    'Вторжение началось здесь. Через эту церковь. Они открыли проход под куполом.',
    'Я был единственным, кто отказался служить им. Поэтому меня и оставили здесь.',
    'Я должен остаться. Но тебе понадобится кое-что получше свечи.',
    'Съешь таблетку. Не задавай вопросов. Она просто позволит увидеть выход.'
  ],()=>{
    showToast('НЕИЗВЕСТНАЯ ТАБЛЕТКА: ПРИНЯТА',2400);
    setTimeout(()=>{inventory.portal=true;inventory.carbine=true;selectedSlot=2;equipPulse=.82;updateSlots();createPortalAt(v3(0,1.9,-12.1));setObjective('Создать проход и войти в портал.');showToast('ПОЛУЧЕНО: ЭНЕРГЕТИЧЕСКИЙ АВТОМАТ · ПОРТАЛЬНОЕ УСТРОЙСТВО',3600);},500);
  });
}
function beginDialogue(speaker,lines,onDone){dialogueLines=lines;dialogueIndex=0;dialogueDone=onDone;$('dialogue-speaker').textContent=speaker;$('dialogue-text').textContent=lines[0];$('dialogue').classList.remove('hidden');}
function advanceDialogue(){if($('dialogue').classList.contains('hidden'))return;dialogueIndex++;if(dialogueIndex>=dialogueLines.length){$('dialogue').classList.add('hidden');const cb=dialogueDone;dialogueDone=null;if(cb)cb();}else $('dialogue-text').textContent=dialogueLines[dialogueIndex];}
function createPortalAt(pos){if(portalMesh)world.remove(portalMesh);const g=new THREE.Group();g.position.copy(pos);g.rotation.y=Math.PI;world.add(g);const outer=torus(g,1.13,.085,mat('#5f8e9b',.25,.25,{emissive:'#2c8398',emissiveIntensity:2}),0,0,0,0,0,0);outer.rotation.y=0;torus(g,.92,.035,mat('#d8a78b',.2,.2,{emissive:'#ac5539',emissiveIntensity:2}),0,0,0);const disc=sphere(g,.86,mat('#1a343d',.3,.1,{emissive:'#142c39',emissiveIntensity:.7,transparent:true,opacity:.84}),0,0,-.06,1,1,.08);for(let i=0;i<8;i++){let a=i*Math.PI/4;const p=sphere(g,.075,i%2?M.glowGreen:M.glowRed,Math.cos(a)*1.18,Math.sin(a)*1.18,0);}
  addLight(g,0x4fc5b4,2.5,9,0,0,1);portalMesh=g;registerAnimated(g,'portal',.025,.7);
  const trigger=box(world,.2,.2,.2,mat('#000000',1,0,{transparent:true,opacity:0}),pos.x,pos.y,pos.z);trigger.visible=true;
  addInteract(trigger,'ВОЙТИ В ПОРТАЛ',()=>transitionTo(buildGarden),2.7,'portal');
}

// -------------------- GARDEN QUARTERS --------------------
function makeResidentialBuilding(x,z,w,d,h,style=0){
  const group=new THREE.Group();group.position.set(x,0,z);world.add(group);addCollider(x,z,w,d);
  const facade=style===0?mat('#805b4d',.92,0,{map:brickTex,bumpMap:brickTex,bumpScale:.07}):style===1?mat('#b7b4aa',.92,0,{map:stoneTex,bumpMap:stoneTex,bumpScale:.045}):mat('#647a78',.62,.12,{map:concreteTex,bumpMap:concreteTex,bumpScale:.035});
  const trim=mat('#b9b5ab',.76,.14),dark=mat('#20272a',.38,.35),glassCold=mat('#31464d',.2,.42,{emissive:'#102329',emissiveIntensity:.3}),glassWarm=mat('#b09266',.25,.18,{emissive:'#9d6731',emissiveIntensity:.48}),balcony=mat('#444b4b',.52,.48);
  box(group,w,h,d,facade,0,h/2,0);
  // Deeply recessed windows are assembled floor by floor on all exposed faces.
  const floors=Math.floor((h-2)/2.5),colsFront=Math.max(2,Math.floor(w/2.0)),colsSide=Math.max(2,Math.floor(d/2.0));
  for(let floor=0;floor<floors;floor++){
    const y=1.65+floor*2.42;
    box(group,w+.14,.12,d+.14,trim,0,y-.86,0);
    for(let c=0;c<colsFront;c++){
      const xx=-w/2+(c+.5)*w/colsFront;
      for(const face of [-1,1]){
        const zz=face*(d/2+.075);box(group,1.06,1.42,.09,dark,xx,y,zz);
        box(group,.9,1.23,.055,(Math.random()>.68)?glassWarm:glassCold,xx,y,zz+face*.055);
        box(group,.055,1.46,.13,trim,xx-.56,y,zz);box(group,.055,1.46,.13,trim,xx+.56,y,zz);
        box(group,1.16,.055,.13,trim,xx,y-.76,zz);box(group,1.16,.055,.13,trim,xx,y+.76,zz);
        if((c+floor+style)%3===0){box(group,1.24,.12,.8,balcony,xx,y-.78,face*(d/2+.42));box(group,1.18,.55,.06,balcony,xx,y-.48,face*(d/2+.78));for(let k=-2;k<=2;k++){box(group,.035,.52,.045,trim,xx+k*.25,y-.48,face*(d/2+.78));}}
      }
    }
    for(let c=0;c<colsSide;c++){
      const zz=-d/2+(c+.5)*d/colsSide;
      for(const face of [-1,1]){
        const xx=face*(w/2+.075);box(group,.09,1.42,1.02,dark,xx,y,zz);box(group,.055,1.23,.87,(Math.random()>.72)?glassWarm:glassCold,xx+face*.055,y,zz);
        box(group,.13,1.46,.055,trim,xx,y,zz-.54);box(group,.13,1.46,.055,trim,xx,y,zz+.54);
      }
    }
  }
  // Vertical piers, corner joints, roof parapet and machine housings.
  for(const xx of [-w/2+.18,w/2-.18])box(group,.18,h+.25,d+.2,trim,xx,h/2,0);
  for(const zz of [-d/2-.08,d/2+.08])box(group,w+.2,.16,.16,trim,0,h-.12,zz);
  box(group,w+.35,.45,d+.35,mat('#454b4b',.7,.28),0,h+.18,0);
  for(let i=-1;i<=1;i++)box(group,.52,.8,.56,mat('#626866',.62,.32),i*w*.22,h+.78,0);
  // Distinctive ground-floor lobby with deep canopy, columns and warm interior panels.
  box(group,w+.4,.28,d+.6,mat('#33383a',.48,.28),0,2.35,d/2+.22);
  for(let c=0;c<Math.max(2,Math.floor(w/2.4));c++){const xx=-w/2+(c+.5)*w/Math.max(2,Math.floor(w/2.4));box(group,1.45,1.95,.12,dark,xx,1.15,d/2+.08);box(group,1.28,1.7,.055,glassWarm,xx,1.15,d/2+.16);}
  for(let side of [-1,1]){box(group,.18,2.5,d+.3,trim,side*(w/2+.08),1.25,0);}
  return group;
}

function createUFO(){
  const g=new THREE.Group();const hull=mat('#252d33',.28,.76),rim=mat('#8a9695',.24,.72),glass=mat('#5c7d7d',.16,.4,{transparent:true,opacity:.88}),lights=mat('#d9f0c5',.17,.1,{emissive:'#9bff81',emissiveIntensity:2.7}),dark=mat('#11191d',.32,.65);
  const disk=addMesh(g,new THREE.CylinderGeometry(2.75,3.55,.58,72),hull,v3(0,0,0));disk.scale.z=.78;
  torus(g,2.88,.16,rim,0,-.23,0).scale.z=.78;torus(g,2.52,.055,dark,0,-.32,0).scale.z=.78;
  const dome=addMesh(g,new THREE.SphereGeometry(1.56,48,28,0,Math.PI*2,0,Math.PI/2),glass,v3(0,.23,0));dome.scale.set(1,.78,.84);
  torus(g,1.5,.045,rim,0,.2,0);
  cylinder(g,.14,.38,.48,hull,0,.35,0,32);
  for(let i=0;i<24;i++){const a=i*Math.PI/12;const x=Math.cos(a)*2.87,z=Math.sin(a)*2.22;sphere(g,.095,lights,x,-.13,z,.9,.8,.9);}
  for(let i=0;i<8;i++){const a=i*Math.PI/4;const pod=new THREE.Group();pod.position.set(Math.cos(a)*2.25,-.08,Math.sin(a)*1.72);g.add(pod);sphere(pod,.21,dark,0,0,0,1,.75,1);sphere(pod,.11,lights,0,-.03,.05,.9,.9,.9);}
  // Twin forward emitters are visible from the chase camera and flash on every shot.
  for(const side of [-1,1]){const cannon=addMesh(g,new THREE.CylinderGeometry(.11,.16,.72,16),dark,v3(side*.62,-.22,-2.55),v3(Math.PI/2,0,0));cannon.rotation.x=Math.PI/2;torus(g,.13,.028,rim,side*.62,-.22,-2.88,Math.PI/2,0,0);sphere(g,.075,lights,side*.62,-.22,-2.92,.8,.8,.45);}
  const muzzleGlow=addLight(g,0xff6258,0,7,0,-.22,-3.0);const muzzleCore=sphere(g,.14,mat('#ffd5c8',.14,0,{emissive:'#ff6a59',emissiveIntensity:3}),0,-.22,-2.96,1,1,.65);muzzleCore.visible=false;
  const top=sphere(g,.18,lights,0,1.05,0,1,.55,1);
  const thrusters=[];for(let i=0;i<4;i++){const a=i*Math.PI/2;const t=new THREE.Group();t.position.set(Math.cos(a)*1.85,-.47,Math.sin(a)*1.46);g.add(t);const plume=addMesh(t,new THREE.ConeGeometry(.22,.95,16),mat('#a7ffd3',.2,.05,{emissive:'#45e7a4',emissiveIntensity:2.2,transparent:true,opacity:.56}),v3(0,-.55,0),v3(Math.PI,0,0));const core=sphere(t,.12,lights,0,-.1,0,1,1.4,1);thrusters.push({group:t,plume,core});}
  const underGlow=addLight(g,0x6df4c8,3.5,13,0,-.75,0);const cockpitGlow=addLight(g,0x8dded1,.9,5,0,.45,0);
  g.userData.hull=disk;g.userData.thrusters=thrusters;g.userData.underGlow=underGlow;g.userData.velocity=v3();g.userData.boost=0;g.userData.flightAnim=rand(0,4);g.userData.acceleration=0;g.userData.muzzleGlow=muzzleGlow;g.userData.muzzleCore=muzzleCore;g.userData.shotFlash=0;
  return g;
}

function buildGarden(){
  clearWorld();setPhase('garden');flightScore=0;playerDamageCooldown=0;waveSpawned=false;baseScene('#68727d','#68727d',.0039);scene.background.set('#707c89');scene.fog=new THREE.FogExp2('#7b858a',.0038);
  scene.add(new THREE.HemisphereLight(0xd4d8d8,0x38302a,.96));const duskSun=new THREE.DirectionalLight(0xffc48d,1.12);duskSun.position.set(-32,18,27);duskSun.castShadow=false;scene.add(duskSun);scene.add(new THREE.AmbientLight(0x9aa5ad,.18));
  const pavement=mat('#55585a',.95,0,{map:asphaltTex,bumpMap:asphaltTex,bumpScale:.08}),stone=mat('#aaa79f',.92,0,{map:stoneTex,bumpMap:stoneTex,bumpScale:.045}),edge=mat('#777873',.78,.08),water=mat('#182a30',.12,.58,{transparent:true,opacity:.94});
  plane(world,115,115,pavement,0,0,0);
  // Large linear reflecting pool, raised stone edge, stepped walkways and planted banks.
  box(world,31,.66,11,edge,0,-.28,-5.8);box(world,29,.22,9.5,mat('#363b3c'),0,-.03,-5.8);plane(world,22.7,8.7,water,0,.105,-5.8);addCollider(0,-5.8,22.7,8.7);
  for(const side of [-1,1]){box(world,31,.32,.55,stone,0,.12,-5.8+side*5.25);box(world,.55,.32,10.5,stone,side*15.15,.12,-5.8);}
  // Fine pool coping joints and underwater reflection strips.
  for(let x=-14;x<=14;x+=2){box(world,.035,.035,10,mat('#c6c1b4'),x,.3,-5.8);}
  for(let x=-13;x<=13;x+=1.3){const ripple=torus(world,rand(.18,.42),.012,mat('#8ca5a4',.2,.25,{transparent:true,opacity:.22}),x,.13,-5.8+rand(-3.6,3.6),Math.PI/2,0,0);ripple.userData.waterRipple=true;animatedObjects.push({object:ripple,type:'ripple',amplitude:.05,speed:rand(.45,.9),phase:rand(0,6)});}
  // Distinctive high-rise façades frame the courtyard; no repeated blank cubes.
  makeResidentialBuilding(-19,-14,10,9,23,1);makeResidentialBuilding(-7,-23,9,8,19,0);makeResidentialBuilding(7,-23,10,8,21,2);makeResidentialBuilding(20,-14,10,9,25,2);
  makeResidentialBuilding(-20,12,9,10,19,0);makeResidentialBuilding(20,12,10,9,21,1);makeResidentialBuilding(-6,25,10,8,16,0);makeResidentialBuilding(8,25,10,8,18,2);
  // Podium bridges and terraces connect the lower levels like a private residential quarter.
  for(const side of [-1,1]){const x=side*15.2;box(world,4.4,.3,22,mat('#656862',.8,.12),x,3.2,0);for(let z=-9;z<=9;z+=2.2){box(world,.08,.95,.08,mat('#30383a',.45,.35),x-2,3.7,z);box(world,.08,.95,.08,mat('#30383a',.45,.35),x+2,3.7,z);}box(world,4.25,.12,22,mat('#9d9a8e'),x,4.18,0);}
  // Ground-floor cafés, lobbies, warm interior pools and signage.
  const shopMat=mat('#c19a6e',.25,0,{emissive:'#8b5428',emissiveIntensity:.65});
  for(const [x,z,w] of [[-19,-8,7],[-7,-17,6],[7,-17,6],[20,-8,7],[-20,17,6],[20,17,7]]){
    box(world,w,2.8,.32,mat('#292e31',.55,.22),x,1.4,z);for(let i=-1;i<=1;i++){box(world,1.05,1.85,.08,darkWindowMaterial(),x+i*1.65,1.35,z-.2);box(world,.08,2.1,.1,trimFacade(),x+i*1.65-.55,1.35,z-.27);}
    box(world,w+.3,.12,.8,mat('#3b4141'),x,2.85,z-.2);box(world,w*.55,.055,.06,shopMat,x,3.04,z-.55);
  }
  // Trees, clipped hedges, grasses and raised planters.
  for(const [x,z] of [[-13,-13],[13,-13],[-13,12],[13,12],[-23,1],[23,1]]){
    box(world,3.5,.45,3,mat('#454946'),x,.3,z);box(world,3.2,.2,2.7,mat('#77776f'),x,.58,z);
    cylinder(world,.17,.25,2.8,mat('#493a31'),x,2,z,10);
    for(let i=0;i<5;i++)sphere(world,1.1,mat(i%2?'#34443c':'#3d4b40'),x+rand(-.8,.8),3.25+rand(-.35,.8),z+rand(-.8,.8),1.2,1,1.05);
    for(let i=0;i<8;i++){const bush=sphere(world,.34,mat('#4b5d4b'),x+rand(-1.35,1.35),.82,z+rand(-1,1),1.4,.65,1);}
  }
  // Benches, bicycle stands, bollards, tactile paving and drains add scale.
  for(const [x,z] of [[-11,-1],[11,-1],[-11,10],[11,10]]){box(world,2.4,.18,.65,mat('#383e3e'),x,.7,z);box(world,2.4,.08,.58,woodTexMaterial(),x,.82,z);for(let dx of [-1,1])box(world,.12,.68,.15,mat('#666b69'),x+dx,.34,z);addCollider(x,z,2.4,.7);}
  for(let x=-12;x<=12;x+=3){cylinder(world,.055,.08,.86,mat('#242b2e',.38,.55),x,.43,12,10);sphere(world,.11,mat('#e0bc7e',.18,0,{emissive:'#e7ad66',emissiveIntensity:2}),x,.9,12);}
  for(let z=15;z<=25;z+=2.5)for(let x=-10;x<=10;x+=2.5)box(world,2.25,.025,2.25,mat('#656765',.96,0,{map:pavingTex}),x,.02,z);
  for(const [x,z] of [[-7,14],[7,14],[-7,-16],[7,-16]]){box(world,1.5,.06,2.5,mat('#33383a'),x,.12,z);for(let i=0;i<7;i++){const grass=box(world,.035,rand(.18,.55),.035,mat('#566a54'),x+rand(-.65,.65),.35,z+rand(-1,1));grass.rotation.z=rand(-.2,.2);}}
  // Alien growths have invaded the paving and façades, catching the green-red electrical light.
  for(let i=0;i<13;i++){const x=rand(-13,13),z=rand(-16,13);if(Math.abs(x)<6&&z>-13&&z<-1)continue;const root=new THREE.Group();root.position.set(x,0,z);world.add(root);for(let j=0;j<4;j++){const stalk=cylinder(root,.045,.16,rand(2.5,5.5),mat('#293a3a',.35,.3,{emissive:'#0b302d',emissiveIntensity:.55}),rand(-.3,.3),rand(1.2,2.8),rand(-.3,.3),8);stalk.rotation.z=rand(-.3,.3);sphere(root,.12,M.glowRed,stalk.position.x,stalk.position.y+stalk.geometry.parameters.height*.45,stalk.position.z,.8,1,.8);}}
  // The Pandora case, only revealed once the hostile wave has actually been defeated.
  const chest=new THREE.Group();chest.position.set(0,0,-16.5);world.add(chest);box(chest,1.9,.95,1.32,mat('#352a26',.46,.36,{map:woodTex,bumpMap:woodTex,bumpScale:.05}),0,.55,0);const lid=box(chest,1.98,.22,1.4,mat('#514036',.43,.48),0,1.12,0);lid.userData.chestLid=true;box(chest,1.85,.08,1.3,M.gold,0,1.0,0);box(chest,.22,.42,.17,mat('#c9ae67',.24,.74),0,.7,.75);sphere(chest,.12,M.glowGreen,0,.76,.87,.7,1,.35);chest.visible=false;
  addInteract(chest,'ОТКРЫТЬ ЯЩИК ПАНДОРЫ',()=>{if(flightScore<flightGoal){showToast('ЗАМОК НЕ ОТКРЫВАЕТСЯ. ОПАСНОСТЬ ЕЩЁ РЯДОМ.');return;}if(!inventory.keys){inventory.keys=true;ufo.visible=true;showToast('ВНУТРИ — КЛЮЧИ ОТ ЛЕТАЮЩЕЙ ТАРЕЛКИ');setObjective('Добраться до тарелки и активировать её.');lid.rotation.x=-.72;lid.position.y=1.34;addLight(chest,0xbaff8b,2.4,7,0,1.6,0);playSfx('pickup');}else showToast('ЯЩИК ПУСТ.');},2.8,'chest');
  const ship=createUFO();ship.position.set(0,.35,-27);ship.scale.setScalar(1.32);world.add(ship);ship.visible=false;ufo=ship;
  const shipTrigger=box(world,.35,.35,.35,mat('#000000',1,0,{transparent:true,opacity:0}),0,1,-27);shipTrigger.visible=true;
  addInteract(shipTrigger,'СЕСТЬ В ЛЕТАЮЩУЮ ТАРЕЛКУ',()=>{if(!inventory.keys){showToast('ТАРЕЛКА ЗАПЕРТА. НУЖНЫ КЛЮЧИ.');return;}transitionTo(startFlight);},3.6,'ship');
  // Warm poles and window light establish dusk. Alien glow is a selective accent, not the only light.
  for(const [x,z] of [[-12,7],[12,7],[-14,-9],[14,-9],[-23,2],[23,2]]){cylinder(world,.07,.1,4.4,mat('#252a2c',.45,.55),x,2.2,z,10);const bulb=sphere(world,.13,mat('#f0c78c',.2,0,{emissive:'#dfa66a',emissiveIntensity:2.2}),x,4.35,z);addLight(world,0xffc58b,.82,13,x,4.2,z);}
  const skyFill=addLight(world,0xa6bacb,.72,65,-8,18,18);const courtyardFill=addLight(world,0xffbd80,.3,25,0,6,0);
  spawnGardenWave();player.set(0,1.65,19);yaw=0;pitch=0;setCameraFPS();setChapter('ГЛАВА 02 / САДОВЫЕ КВАРТАЛЫ','САДОВЫЕ КВАРТАЛЫ');setObjective('Отбиться от пришельцев.');selectedSlot=2;updateSlots();$('flight-hud').classList.add('hidden');$('shift-prompt').classList.add('hidden');$('flight-reticle').classList.add('hidden');$('crosshair').classList.remove('hidden');
}
function darkWindowMaterial(){return mat('#1d292e',.28,.35,{emissive:'#19282b',emissiveIntensity:.45});}
function trimFacade(){return mat('#b8b4aa',.7,.18);}
function woodTexMaterial(){return mat('#574638',.82,0,{map:woodTex,bumpMap:woodTex,bumpScale:.05});}

function spawnGardenWave(){
  const spots=[[-24,-1],[23,-2],[-22,-22],[22,-23],[-5,-28],[8,27],[-25,15],[25,15]];
  spots.forEach((p,i)=>{const e=createAlien(v3(p[0],0,p[1]),true,false);e.scale.setScalar(rand(.92,1.16));world.add(e);enemies.push({mesh:e,hp:3,speed:rand(4.5,5.25),attack:rand(.2,1.2),phase:rand(0,5),windup:0,stagger:0});});waveSpawned=true;
}

// -------------------- FLIGHT / FINAL INTERIOR --------------------
function createFlightEnemy(){const root=createAlien(v3(rand(-20,20),rand(5,16),rand(-36,-22)),true,false);root.scale.setScalar(rand(.56,.74));world.add(root);return {mesh:root,hp:2,speed:rand(4.2,5.8),attack:0,phase:rand(0,6)};}
function startFlight(){
  clearWorld();flightPulseMeshes=[];fireHeld=false;fireHeldRMB=false;fireCooldown=0;flightAimX=0;flightAimY=0;flightTrailClock=0;setPhase('flight');baseScene('#131b24','#202a31',.0025);scene.background.set('#27313a');scene.add(new THREE.HemisphereLight(0x9fb5c9,0x151b21,.95));
  plane(world,180,180,mat('#303a3d',.92,0,{map:asphaltTex}),0,-3,0);
  // A broad roofscape under the vehicle, with varied blocks and lit windows in the haze.
  for(let i=0;i<92;i++){
    const x=rand(-78,78),z=rand(-78,78),w=rand(5,13),d=rand(5,13),h=rand(7,27);const shell=mat(i%4===0?'#626967':i%3===0?'#4b555b':'#3d454a',.9,0,{map:i%3===0?brickTex:concreteTex});
    const b=box(world,w,h,d,shell,x,h/2-3,z);box(world,w+.12,.3,d+.12,mat('#6d706b'),x,h-2.8,z);
    for(let yy=2;yy<h-2;yy+=2.6)for(let xx=-w/2+1;xx<w/2-1;xx+=2.2){if(Math.random()>.28){const win=box(world,.82,1.12,.05,Math.random()>.76?mat('#c09b6e',.28,0,{emissive:'#ad753c',emissiveIntensity:.55}):mat('#233239',.3,.22),x+xx,yy-2,z-d/2-.04);}}
    if(i%5===0){cylinder(world,.16,.16,2.5,mat('#252c30'),x, h-1.4,z,8);}
  }
  // A distant dome and a broken ring of green-red signal lights anchor the flight back toward the church.
  const landmark=buildCathedral(world,-15,-55,.34);landmark.rotation.y=-.18;
  for(let i=0;i<18;i++){const p=sphere(world,.14,i%2?M.glowGreen:M.glowRed,rand(-70,70),rand(5,24),rand(-75,-35),1,1,1);p.userData.dust=true;particles.push(p);}
  ufo=createUFO();ufo.position.set(0,9,12);ufo.scale.setScalar(1.3);world.add(ufo);
  for(let i=0;i<8;i++)flightEnemies.push(createFlightEnemy());
  flightScore=0;flightTime=0;boostUntil=0;player.set(0,1.65,0);camera.position.set(0,15,29);camera.lookAt(0,9,0);yaw=0;pitch=0;
  $('flight-hud').classList.remove('hidden');$('shift-prompt').classList.add('hidden');$('flight-reticle').classList.remove('hidden');$('crosshair').classList.add('hidden');setChapter('ГЛАВА 03 / ВОЗДУШНЫЙ КОРИДОР','НАД МОСКВОЙ');setObjective('Удержаться в воздухе и уничтожить 5 преследователей.');$('hud').classList.remove('hidden');
}

function createCockpit(){cockpitDialogueStarted=false;clearWorld();setPhase('cockpit');baseScene('#101216','#090b0e',.012);scene.add(new THREE.AmbientLight(0x78828b,.25));
  const hull=mat('#34393b',.42,.55), inner=mat('#171c20',.8,.2), glass=mat('#66858a',.15,.3,{transparent:true,opacity:.22}), panel=mat('#24292d',.4,.4);
  // Compact circular cabin shell and front viewport.
  cylinder(world,6,6.5,13,hull,0,0,0,48).rotation.x=Math.PI/2;
  const floor=box(world,10,.35,13,inner,0,-1.1,0);box(world,10,.35,13,inner,0,4.7,0);
  for(let side of [-1,1]){box(world,.45,5.6,13,hull,side*5,1.75,0);for(let z=-5;z<=5;z+=2.5){box(world,.35,.3,.5,panel,side*4.7,2,z);}}
  // Forward window shows the church dome through the mist.
  box(world,8.5,4.6,.2,glass,0,1.9,-6.15);box(world,8.9,.25,.3,hull,0,4.25,-6.2);box(world,8.9,.25,.3,hull,0,-.4,-6.2);box(world,.25,4.8,.3,hull,-4.35,1.9,-6.2);box(world,.25,4.8,.3,hull,4.35,1.9,-6.2);
  // Distant glowing cathedral silhouette.
  const distant=buildCathedral(world,0,-25,.35);distant.position.y=-2.5;
  for(let x=-3;x<=3;x+=1.5){box(world,1,.35,1,panel,x,-.65,-3.8);sphere(world,.08,x===0?M.glowRed:M.glowGreen,x,-.42,-3.8);}
  const chair=box(world,2.3,2.3,2.5,mat('#292a2b'),0,0,1.2);box(world,2.6,.3,1.1,hull,0,1,2.2);
  friendAlien=createAlien(v3(0,0,4.1),false,false);friendAlien.scale.setScalar(.95);friendAlien.rotation.y=Math.PI;world.add(friendAlien);const sidearm=new THREE.Group();box(sidearm,.16,.18,.48,mat('#1c2427',.32,.6),0,0,0);box(sidearm,.09,.08,.22,mat('#758783',.28,.5),0,.12,.22);box(sidearm,.1,.22,.14,mat('#242b2f',.45,.55),0,-.16,-.04);sphere(sidearm,.055,M.glowRed,0,.02,.255,.75,.75,.55);sidearm.position.set(.18,-.82,.25);sidearm.visible=false;friendAlien.userData.rightArm.add(sidearm);friendAlien.userData.sidearm=sidearm;friendAlien.userData.aiming=false;
  camera.position.set(0,1.65,-1.7);yaw=0;pitch=0;camera.rotation.set(0,0,0,'YXZ');
  setChapter('ГЛАВА 04 / ВОЗВРАЩЕНИЕ','НАД ХРАМОМ');setObjective('Обернуться.');$('flight-hud').classList.add('hidden');$('shift-prompt').classList.add('hidden');$('crosshair').classList.add('hidden');$('flight-reticle').classList.add('hidden');
  sceneTime=0;
}
function startFinalDialogue(){beginDialogue('ВЫ',['Откуда ты?'],()=>{beginDialogue('СУЩЕСТВО',[
  'Из прошлого.',
  'Ты думал, что я остался в церкви? Я остался в той версии, которую ты помнишь.',
  'А теперь попробуй вспомнить, кто из нас первым открыл дверь.'
],()=>{showToast('ОН ПОДНИМАЕТ ОРУЖИЕ. СЕЙЧАС.');if(friendAlien?.userData.sidearm)friendAlien.userData.sidearm.visible=true;if(friendAlien)friendAlien.userData.aiming=true;setTimeout(()=>{beginDialogue('СУЩЕСТВО',['Ты всё равно не успеешь.'],()=>{setObjective('Опередить его. Нажать E.');});},600);});});}
function endCycle(){if(phase!=='cockpit')return;$('dialogue').classList.add('hidden');showToast('СИНХРОНИЗАЦИЯ НАРУШЕНА',900);const flash=$('damage-flash');flash.style.opacity='.9';setTimeout(()=>{flash.style.opacity='0';$('hud').classList.add('hidden');$('ending-screen').classList.remove('hidden');if(document.pointerLockElement)document.exitPointerLock();phase='ending';paused=false;let cycles=1;try{cycles=Number(localStorage.getItem('krovotkinskaya_cycles')||0)+1;localStorage.setItem('krovotkinskaya_cycles',String(cycles));}catch{}$('ending-code').textContent=`CYCLE ${String(cycles).padStart(3,'0')} · TERMINATED / RESTARTING`;},350);}

// -------------------- INPUT / INTERACTION --------------------
function interact(){if(!$('dialogue').classList.contains('hidden')){advanceDialogue();return;}if(!currentInteract){return;}const item=currentInteract;if(item.mesh.visible===false&&item.kind!=='portal')return;item.action();}
function findInteraction(){
  let best=null,bestD=Infinity;const forward=camera.getWorldDirection(v3());
  for(const it of interactables){if(!it.mesh.visible||it.enabled===false)continue;const p=it.mesh.getWorldPosition(v3());const to=p.clone().sub(camera.position);const d=to.length();if(d>it.range||d<.1)continue;const facing=forward.dot(to.normalize());if(facing<.48)continue;if(d<bestD){best=it;bestD=d;}}
  currentInteract=best;$('interact-prompt').classList.toggle('hidden',!best||phase==='intro'||phase==='flight'||phase==='cockpit');if(best)$('interact-label').textContent=best.name;
}

function tryResurrectionInteraction(){if(phase==='basement'&&deadAlien){const d=deadAlien.position.distanceTo(player);if(d<3){performRitual();return true;}}return false;}
function shootEnergy(){
  if((phase!=='garden'&&phase!=='basement')||!inventory.carbine||selectedSlot!==2)return;
  const dir=camera.getWorldDirection(v3());const start=camera.position.clone().add(dir.clone().multiplyScalar(.78));
  const bolt=sphere(world,.085,M.glowGreen,start.x,start.y,start.z,.8,.8,2.4);bolt.userData.velocity=dir.multiplyScalar(52);bolt.userData.life=1.8;bolt.userData.kind='player';projectiles.push(bolt);
  weaponRecoil=Math.min(.24,weaponRecoil+.12);playSfx('shoot');if(weaponRig?.userData.flash){weaponRig.userData.flash.visible=true;}if(muzzleFlash)muzzleFlash.intensity=8;
}

function updateBasementCombat(dt){
  fireCooldown=Math.max(0,fireCooldown-dt);if(fireHeld&&fireCooldown<=0){shootEnergy();fireCooldown=.105;}
  for(let i=projectiles.length-1;i>=0;i--){const bolt=projectiles[i];bolt.position.addScaledVector(bolt.userData.velocity,dt);bolt.userData.life-=dt;if(bolt.userData.life<=0){world.remove(bolt);bolt.geometry?.dispose();projectiles.splice(i,1);}}
}
function fireFlightShot(){
  if(phase!=='flight'||!ufo)return;
  raycaster.setFromCamera(new THREE.Vector2(flightAimX,flightAimY),camera);
  const origin=ufo.localToWorld(v3(0,-.2,-3.05));ufo.userData.shotFlash=.12;if(ufo.userData.muzzleGlow)ufo.userData.muzzleGlow.intensity=7;if(ufo.userData.muzzleCore)ufo.userData.muzzleCore.visible=true;const aimPoint=raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(110));
  const dir=aimPoint.sub(origin).normalize();const bolt=sphere(world,.14,M.glowRed,origin.x,origin.y,origin.z,.8,.8,2.4);bolt.userData.velocity=dir.multiplyScalar(64);bolt.userData.life=2.4;flightShots.push(bolt);playSfx('shoot');
}

function flightAimPoint(){raycaster.setFromCamera(new THREE.Vector2(flightAimX,flightAimY),camera);return raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(110));}

function createWeaponView(){
  if(weaponRig)camera.remove(weaponRig);weaponRig=new THREE.Group();weaponRig.position.set(.36,-.32,-.68);weaponRig.rotation.set(-.03,-.05,0);
  const steel=mat('#242c30',.32,.72),edge=mat('#66716e',.28,.72),polymer=mat('#252a2c',.7,.08),glow=mat('#9effa2',.2,.08,{emissive:'#52f878',emissiveIntensity:2.2});
  box(weaponRig,.22,.2,.82,polymer,0,0,0);box(weaponRig,.15,.13,.58,steel,0,.11,-.03);box(weaponRig,.12,.14,.4,edge,0,.15,-.2);
  cylinder(weaponRig,.045,.07,.66,steel,0,.015,-.56,16).rotation.x=Math.PI/2; cylinder(weaponRig,.075,.095,.18,edge,0,.015,-.88,16).rotation.x=Math.PI/2;
  box(weaponRig,.11,.24,.18,polymer,0,-.2,.18,{rot:v3(-.22,0,0)});box(weaponRig,.18,.06,.22,edge,0,.2,.04);
  box(weaponRig,.1,.08,.21,steel,0,.24,-.27);box(weaponRig,.04,.12,.055,edge,0,.3,-.28);
  box(weaponRig,.08,.1,.35,polymer,.17,-.12,.2,{rot:v3(.18,0,-.1)});
  cylinder(weaponRig,.105,.14,.54,mat('#333a3c',.82,.02),.16,-.28,.22,12).rotation.x=-.34;sphere(weaponRig,.12,mat('#505a59',.75,.05),.13,-.47,-.01,1,.8,1.15);
  const core=sphere(weaponRig,.055,glow,0,.09,-.3,.85,.72,1.8);const sideStrip=box(weaponRig,.025,.055,.32,glow,.119,.03,-.12);
  muzzleFlash=new THREE.PointLight(0x8bff9c,0,6);muzzleFlash.position.set(0,.02,-1.02);weaponRig.add(muzzleFlash);
  const flash=sphere(weaponRig,.09,mat('#d7ffce',.12,0,{emissive:'#a4ff9b',emissiveIntensity:4}),0,.02,-1.02,1,1,2);flash.visible=false;weaponRig.userData.flash=flash;weaponRig.userData.core=core;camera.add(weaponRig);
  if(lighterRig)camera.remove(lighterRig);lighterRig=new THREE.Group();lighterRig.position.set(.38,-.31,-.58);lighterRig.rotation.set(.04,-.14,-.08);
  cylinder(lighterRig,.11,.14,.4,mat('#333a3c',.82,.02),0,-.25,.12,12).rotation.x=-.35;sphere(lighterRig,.12,mat('#505a59',.75,.05),0,-.42,-.02,1,.8,1.1);box(lighterRig,.12,.22,.055,mat('#adb1ad',.22,.76),0,0,0);box(lighterRig,.12,.05,.065,mat('#c8bb8c',.25,.7),0,.13,0);sphere(lighterRig,.024,M.glowRed,0,.06,.033,.8,.8,.4);
  const spark=sphere(lighterRig,.035,mat('#ffd99a',.2,0,{emissive:'#ff9c42',emissiveIntensity:3}),0,.19,0,.7,1.5,.7);spark.visible=false;lighterRig.userData.spark=spark;camera.add(lighterRig);
  if(!lighterGlow){lighterGlow=new THREE.PointLight(0xffb86c,0,8,2);camera.add(lighterGlow);lighterGlow.position.set(.04,-.12,-.22);lighterSpot=new THREE.SpotLight(0xffd39a,0,12,Math.PI/7,0.58,1.4);lighterSpot.position.set(.04,-.13,-.2);const target=new THREE.Object3D();target.position.set(.02,-.18,-7.2);camera.add(target);lighterSpot.target=target;camera.add(lighterSpot);}
  if(portalRig)camera.remove(portalRig);portalRig=new THREE.Group();portalRig.position.set(.37,-.34,-.72);portalRig.rotation.set(-.08,-.12,-.08);
  const portalSteel=mat('#273238',.3,.72),portalEdge=mat('#82918e',.25,.72),portalDark=mat('#121a1d',.48,.38),portalGlow=mat('#9ef7c5',.18,.1,{emissive:'#49d9a1',emissiveIntensity:2.6});
  box(portalRig,.2,.22,.75,portalDark,0,0,0);box(portalRig,.27,.12,.48,portalSteel,0,.12,-.08);box(portalRig,.13,.25,.3,portalDark,0,-.19,.12,{rot:v3(-.2,0,0)});
  const ring=torus(portalRig,.22,.052,portalEdge,0,.05,-.43,Math.PI/2,0,0);portalRig.userData.ring=ring;const portalCore=sphere(portalRig,.135,portalGlow,0,.05,-.43,.65,.65,.32);portalRig.userData.core=portalCore;
  for(let k=0;k<3;k++)box(portalRig,.045,.28,.07,portalEdge,(k-1)*.12,.01,.19);
  portalRig.userData.kick=0;camera.add(portalRig);portalRig.visible=false;
}

function updateGarden(dt){
  movePlayer(dt);setCameraFPS();if(lighterRig)lighterRig.visible=false;if(weaponRig)weaponRig.visible=!!inventory.carbine&&selectedSlot===2;if(lighterGlow)lighterGlow.intensity=0;
  fireCooldown=Math.max(0,fireCooldown-dt);if(fireHeld&&fireCooldown<=0){shootEnergy();fireCooldown=.105;}
  for(const e of enemies){
    const mesh=e.mesh;if(!mesh.visible||mesh.userData.dying)continue;e.attack=Math.max(0,e.attack-dt);e.stagger=Math.max(0,e.stagger-dt);
    const target=v3(player.x,0,player.z),delta=target.sub(mesh.position);const dist=delta.length();
    if(dist>1.45){
      delta.normalize();let step=delta.clone();const nx=mesh.position.x+step.x*e.speed*dt,nz=mesh.position.z+step.z*e.speed*dt;
      if(blocked(nx,nz)){const candidates=[v3(-delta.z,0,delta.x),v3(delta.z,0,-delta.x),v3(delta.x-delta.z,0,delta.z+delta.x),v3(-delta.x-delta.z,0,delta.z-delta.x)];const free=candidates.find(v=>{v.normalize();return !blocked(mesh.position.x+v.x*e.speed*dt*1.4,mesh.position.z+v.z*e.speed*dt*1.4);});if(free)step.copy(free).normalize();else step.multiplyScalar(-1);}
      if(!e.stagger)mesh.position.addScaledVector(step,e.speed*dt*(e.stagger?0:.92));mesh.rotation.y=Math.atan2(delta.x,delta.z);animateAlien(mesh,dt,e.speed,true);
    }else{
      animateAlien(mesh,dt,0,false);if(e.attack<=0&&!e.winding){e.attack=1.55;e.windup=.4;e.winding=true;mesh.userData.attackPulse=.4;}
      if(e.winding){e.windup-=dt;mesh.position.addScaledVector(delta.clone().normalize(),dt*1.6);if(mesh.userData.torso)mesh.userData.torso.rotation.x=-.3;if(mesh.userData.arms){mesh.userData.arms[0].rotation.x=-1.28;mesh.userData.arms[1].rotation.x=-.92;}if(mesh.userData.jaw)mesh.userData.jaw.rotation.x=-.42;if(e.windup<=0){e.winding=false;if(playerDamageCooldown<=0){health=Math.max(0,health-13);updateHealth();$('damage-flash').style.opacity='.58';camera.rotation.x+=.035;camera.rotation.z+=rand(-.025,.025);setTimeout(()=>$('damage-flash').style.opacity='0',160);playSfx('hit');playerDamageCooldown=.82;}e.attack=1.12;}}
    }
    mesh.position.y=Math.sin(sceneTime*4+e.phase)*.045;
  }
  playerDamageCooldown=Math.max(0,playerDamageCooldown-dt);
  for(let i=projectiles.length-1;i>=0;i--){const b=projectiles[i];const previous=b.position.clone();b.position.addScaledVector(b.userData.velocity,dt);b.userData.life-=dt;let hit=false;
    for(const e of enemies){if(!e.mesh.visible||e.mesh.userData.dying)continue;const target=e.mesh.position.clone().add(v3(0,1.25,0));const point=new THREE.Vector3();new THREE.Line3(previous,b.position).closestPointToPoint(target,true,point);if(point.distanceTo(target)<.92){e.hp--;e.stagger=.22;e.mesh.userData.hitFlash=.22;hit=true;spawnImpact(b.position.clone(),0x9dff9e);if(e.hp<=0){destroyEnemy(e,0x9dff9e);flightScore++;showToast('ЦЕЛЬ УСТРАНЕНА',700);playSfx('enemyDown');}else{showToast('ПОПАДАНИЕ',450);}
      break;}}
    if(hit||b.userData.life<=0){world.remove(b);projectiles.splice(i,1);}
  }
  const alive=enemies.filter(e=>e.mesh.visible).length;
  if(flightScore>=flightGoal){const chest=interactables.find(i=>i.kind==='chest');if(chest)chest.mesh.visible=true;setObjective('Найти ящик Пандоры.');}
  if(health<=0){health=100;updateHealth();buildGarden();showToast('СИСТЕМА ВОССТАНОВЛЕНА. ПОПРОБУЙ ЕЩЁ РАЗ.');}
}

function spawnImpact(pos,color){for(let i=0;i<7;i++){const p=sphere(world,.045,mat(color,.25,0,{emissive:color,emissiveIntensity:1.5,transparent:true,opacity:1}),pos.x,pos.y,pos.z);p.userData.disposeMaterial=true;p.userData.life=rand(.18,.42);p.userData.velocity=v3(rand(-2.5,2.5),rand(-.2,2.4),rand(-2.5,2.5));particles.push(p);}}
function destroyEnemy(enemy,color=0xa4ffbc){if(!enemy?.mesh||enemy.mesh.userData.dying)return;const mesh=enemy.mesh;mesh.userData.dying=true;animatedObjects.push({object:mesh,type:'enemyDeath',elapsed:0,duration:.42,startScale:mesh.scale.clone()});spawnImpact(mesh.position.clone().add(v3(0,1.1,0)),color);}

// -------------------- FLIGHT UPDATE --------------------
function performUltraStrike(){
  if(phase!=='flight'||performance.now()<boostUntil)return;boostUntil=performance.now()+4600;ufo.userData.boost=1.35;
  const ring=torus(world,1.1,.14,mat('#9effc2',.2,.15,{emissive:'#5cff9b',emissiveIntensity:2.6,transparent:true,opacity:.95}),ufo.position.x,ufo.position.y,ufo.position.z,Math.PI/2,0,0);ring.userData.pulseLife=.95;flightPulseMeshes.push(ring);
  const shock=addLight(world,0x9effc2,7,22,ufo.position.x,ufo.position.y,ufo.position.z);shock.userData.lightPulse=.6;pulseLights.push(shock);
  for(const e of flightEnemies){if(e.mesh.visible&&!e.mesh.userData.dying&&e.mesh.position.distanceTo(ufo.position)<13){destroyEnemy(e,0xa4ffbc);flightScore=Math.min(flightGoal,flightScore+1);}}
  playSfx('boost');showToast('УЛЬТРАУДАР',1100);
}

function updateFlight(dt){
  flightTime+=dt;fireCooldown=Math.max(0,fireCooldown-dt);if(fireHeldRMB&&fireCooldown<=0){fireFlightShot();fireCooldown=.13;}
  if(weaponRig)weaponRig.visible=false;if(lighterRig)lighterRig.visible=false;if(portalRig)portalRig.visible=false;if(lighterGlow)lighterGlow.intensity=0;if(lighterSpot)lighterSpot.intensity=0;
  const boosting=!!(keys.ShiftLeft||keys.ShiftRight)&&flightScore<flightGoal;
  if(ufo.userData.boost>0)ufo.userData.boost=Math.max(0,ufo.userData.boost-dt);
  for(let i=flightPulseMeshes.length-1;i>=0;i--){const ring=flightPulseMeshes[i];ring.userData.pulseLife-=dt;const k=1+(0.95-ring.userData.pulseLife)*6.5;ring.scale.setScalar(k);ring.material.opacity=Math.max(0,ring.userData.pulseLife);if(ring.userData.pulseLife<=0){world.remove(ring);flightPulseMeshes.splice(i,1);}}
  const input=v3((keys.KeyD?1:0)-(keys.KeyA?1:0),(keys.Space?1:0)-(keys.ControlLeft||keys.ControlRight?1:0),(keys.KeyS?1:0)-(keys.KeyW?1:0));if(input.lengthSq()>0)input.normalize();
  const maxSpeed=boosting?29:15.5;const targetVelocity=input.multiplyScalar(maxSpeed);const accel=boosting?7.2:3.8;ufo.userData.velocity.lerp(targetVelocity,1-Math.exp(-accel*dt));
  ufo.position.addScaledVector(ufo.userData.velocity,dt);ufo.position.x=clamp(ufo.position.x,-43,43);ufo.position.y=clamp(ufo.position.y,3,28);ufo.position.z=clamp(ufo.position.z,-42,40);
  const speed=ufo.userData.velocity.length();const speedN=clamp(speed/30,0,1);ufo.rotation.z=THREE.MathUtils.damp(ufo.rotation.z,-ufo.userData.velocity.x*.018,4.5,dt);ufo.rotation.x=THREE.MathUtils.damp(ufo.rotation.x,ufo.userData.velocity.z*.014,4.5,dt);ufo.rotation.y=THREE.MathUtils.damp(ufo.rotation.y,-ufo.userData.velocity.x*.015,3.2,dt);
  ufo.userData.flightAnim+=dt*(boosting?14:6);ufo.userData.thrusters.forEach((thruster,i)=>{const pulse=.85+Math.sin(ufo.userData.flightAnim+i*1.7)*.14;thruster.plume.scale.set(1,boosting?1.85*pulse:1.05*pulse,1);thruster.core.scale.y=boosting?1.65:1;});ufo.userData.underGlow.intensity=3+speedN*5;ufo.userData.hull.material.emissive.setHex(boosting?0x123c37:0x000000);ufo.userData.hull.material.emissiveIntensity=boosting?1.15:0;
  // A soft chase camera lags behind acceleration and banks into turns.
  const camTarget=ufo.position.clone().add(v3(-ufo.userData.velocity.x*.32,7.2,15.8));camera.position.lerp(camTarget,1-Math.exp(-3.2*dt));
  const aimTarget=ufo.position.clone().add(v3(flightAimX*22,flightAimY*17,-28));camera.lookAt(aimTarget);camera.fov=THREE.MathUtils.damp(camera.fov,boosting?82:76,3.2,dt);camera.updateProjectionMatrix();
  flightTrailClock-=dt;if(speed>7&&flightTrailClock<=0){flightTrailClock=boosting?.035:.075;const trail=sphere(world,.08,mat('#8dffd0',.2,0,{emissive:'#4be9ae',emissiveIntensity:1.5,transparent:true,opacity:.55}),ufo.position.x,ufo.position.y-.7,ufo.position.z+1.8,.85,1.4,2.8);trail.userData.life=.35;trail.userData.velocity=v3(rand(-.3,.3),-.4,2.5);particles.push(trail);}
  for(const e of flightEnemies){if(!e.mesh.visible||e.mesh.userData.dying)continue;const d=new THREE.Vector3().subVectors(ufo.position,e.mesh.position);const dist=d.length();if(dist>1.8){d.normalize();const orbit=v3(-d.z,Math.sin(flightTime+e.phase)*.15,d.x);e.mesh.position.addScaledVector(d,e.speed*dt);e.mesh.position.addScaledVector(orbit,Math.sin(flightTime*1.4+e.phase)*dt*1.2);}e.mesh.position.y+=Math.sin(flightTime*3+e.phase)*dt*.65;e.mesh.lookAt(ufo.position);animateAlien(e.mesh,dt,e.speed,true);}
  for(let i=flightShots.length-1;i>=0;i--){const b=flightShots[i],previous=b.position.clone();b.position.addScaledVector(b.userData.velocity,dt);b.userData.life-=dt;let hit=false;
    for(const e of flightEnemies){if(e.mesh.visible&&!e.mesh.userData.dying){const center=e.mesh.position.clone().add(v3(0,1.25,0)),point=new THREE.Vector3();new THREE.Line3(previous,b.position).closestPointToPoint(center,true,point);if(point.distanceTo(center)<.95){e.hp--;hit=true;spawnImpact(b.position.clone(),0xff9275);if(e.hp<=0){destroyEnemy(e,0xff9275);flightScore++;playSfx('enemyDown');}else showToast('ПОПАДАНИЕ',350);break;}}}
    if(hit||b.userData.life<=0){world.remove(b);flightShots.splice(i,1);}
  }
  $('flight-heading').textContent=`КУРС ${String(Math.round((ufo.rotation.y*180/Math.PI+360)%360)).padStart(3,'0')}°`;
  $('flight-boost').textContent=boosting?'ТУРБО / АКТИВНО':performance.now()<boostUntil?'УЛЬТРА / КД':'F / УДАР ГОТОВ';$('flight-score').textContent=`${Math.min(flightScore,flightGoal)} / ${flightGoal}`;
  const active=flightEnemies.filter(e=>e.mesh.visible&&!e.mesh.userData.dying).length;if(active<5&&flightScore<flightGoal&&Math.random()<dt*.85)flightEnemies.push(createFlightEnemy());
  const reticle=$('flight-reticle');reticle.style.left=`${(50+flightAimX*35).toFixed(2)}%`;reticle.style.top=`${(50-flightAimY*30).toFixed(2)}%`;reticle.classList.toggle('boosting',boosting);
  if(flightScore>=flightGoal){$('shift-prompt').classList.remove('hidden');setObjective('Нажать SHIFT, чтобы пройти сквозь пространство.');}
}

// -------------------- AUDIO --------------------
function initAudio(){if(audioCtx)return;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;audioCtx=new AC();masterGain=audioCtx.createGain();masterGain.gain.value=Number($('volume-slider').value)/100;masterGain.connect(audioCtx.destination);ambience=audioCtx.createGain();ambience.gain.value=.12;ambience.connect(masterGain);for(let i=0;i<3;i++){const osc=audioCtx.createOscillator();const gain=audioCtx.createGain();osc.type=i===1?'triangle':'sine';osc.frequency.value=[48,73,96][i];gain.gain.value=[.32,.12,.055][i];osc.connect(gain);gain.connect(ambience);osc.start();ambienceOsc.push({osc,gain});}}
function playSfx(type){if(!audioCtx||!masterGain)return;if(audioCtx.state==='suspended')audioCtx.resume();const now=audioCtx.currentTime;const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();osc.connect(gain);gain.connect(masterGain);if(type==='shoot'){osc.type='sawtooth';osc.frequency.setValueAtTime(330,now);osc.frequency.exponentialRampToValueAtTime(58,now+.13);gain.gain.setValueAtTime(.16,now);gain.gain.exponentialRampToValueAtTime(.001,now+.18);osc.start(now);osc.stop(now+.19);}else if(type==='hit'){osc.type='triangle';osc.frequency.setValueAtTime(90,now);osc.frequency.exponentialRampToValueAtTime(35,now+.2);gain.gain.setValueAtTime(.18,now);gain.gain.exponentialRampToValueAtTime(.001,now+.22);osc.start(now);osc.stop(now+.23);}else if(type==='boost'){osc.type='sawtooth';osc.frequency.setValueAtTime(100,now);osc.frequency.exponentialRampToValueAtTime(680,now+.32);gain.gain.setValueAtTime(.14,now);gain.gain.exponentialRampToValueAtTime(.001,now+.38);osc.start(now);osc.stop(now+.4);}else{osc.type='sine';osc.frequency.setValueAtTime(180,now);osc.frequency.exponentialRampToValueAtTime(550,now+.16);gain.gain.setValueAtTime(.1,now);gain.gain.exponentialRampToValueAtTime(.001,now+.22);osc.start(now);osc.stop(now+.23);}}

// -------------------- UI / STATE --------------------
function openPause(){if(paused||phase==='intro'||phase==='ending')return;paused=true;fireHeld=false;fireHeldRMB=false;if(ambience)ambience.gain.value=0;pauseFrom=phase;$('pause-screen').classList.remove('hidden');if(document.pointerLockElement)document.exitPointerLock();}
function closePause(){paused=false;if(ambience)ambience.gain.value=.12;$('pause-screen').classList.add('hidden');if(phase!=='intro'&&phase!=='ending')canvas.requestPointerLock?.();}
function resetGame(){inventory={lighter:false,blood:false,water:false,portal:false,carbine:false,keys:false};health=100;updateHealth();flightScore=0;selectedSlot=1;cockpitDialogueStarted=false;bloodPoured=false;waterPoured=false;bookRead=false;fireHeld=false;fireHeldRMB=false;introTime=0;flightAimX=0;flightAimY=0;paused=false;buildIntro();updateSlots();$('ending-screen').classList.add('hidden');$('pause-screen').classList.add('hidden');$('hud').classList.add('hidden');$('flight-hud').classList.add('hidden');$('flight-reticle').classList.add('hidden');$('crosshair').classList.remove('hidden');$('intro-copy').classList.add('hidden');}
function handleKeyDown(e){keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.repeat)return;
  if(e.code==='Escape'){if(paused)closePause();else openPause();return;}
  if(e.code==='KeyE'){if(phase==='cockpit'&&sceneTime>2.2&&$('dialogue').classList.contains('hidden')){endCycle();return;}if(phase==='basement'&&tryResurrectionInteraction())return;interact();return;}
  if(e.code==='Enter'&&!$('dialogue').classList.contains('hidden')){advanceDialogue();return;}
  if(e.code==='Digit1'&&inventory.lighter){selectedSlot=1;updateSlots();}if(e.code==='Digit2'&&inventory.carbine){selectedSlot=2;updateSlots();}if(e.code==='Digit3'&&inventory.portal){selectedSlot=3;updateSlots();}
  if((e.code==='ShiftLeft'||e.code==='ShiftRight')&&phase==='flight'&&flightScore>=flightGoal){transitionTo(()=>{createCockpit();playSfx('boost');$('flight-reticle').classList.add('hidden');});return;}if(e.code==='KeyF'&&phase==='flight'){performUltraStrike();}
}
function handleKeyUp(e){keys[e.code]=false;}
function handleMouseMove(e){if(document.pointerLockElement!==canvas||paused)return;if(phase==='intro')return;if(phase==='flight'){flightAimX=clamp(flightAimX+e.movementX/Math.max(480,innerWidth)*1.65,-.72,.72);flightAimY=clamp(flightAimY-e.movementY/Math.max(360,innerHeight)*1.65,-.62,.62);return;}const sens=.00215;yaw-=e.movementX*sens;pitch-=e.movementY*sens;pitch=clamp(pitch,-1.42,1.42);}
function handleMouseDown(e){if(phase==='intro'||phase==='ending')return;if(paused)return;if(e.button===0&&(phase==='garden'||phase==='basement')&&inventory.carbine&&selectedSlot===2){fireHeld=true;shootEnergy();fireCooldown=.105;}if(e.button===2){e.preventDefault();if(phase==='flight'){fireHeldRMB=true;fireFlightShot();fireCooldown=.16;}else if(phase==='church'&&inventory.portal&&selectedSlot===3){if(!portalMesh){createPortalAt(v3(0,1.9,-12.1));portalKick=.22;if(portalRig)portalRig.userData.kick=.22;showToast('ПОРТАЛ СТАБИЛИЗИРОВАН');}else showToast('ПОРТАЛ УЖЕ СТАБИЛИЗИРОВАН');}else if(phase==='garden'&&selectedSlot===3)showToast('ПОРТАЛЬНОЕ УСТРОЙСТВО НЕ ОТВЕЧАЕТ');}}
window.addEventListener('mouseup',e=>{if(e.button===0)fireHeld=false;if(e.button===2)fireHeldRMB=false;});
canvas.addEventListener('mousedown',handleMouseDown);canvas.addEventListener('contextmenu',e=>e.preventDefault());
window.addEventListener('keydown',handleKeyDown);window.addEventListener('keyup',handleKeyUp);window.addEventListener('mousemove',handleMouseMove);
$('start-button').addEventListener('click',()=>{initAudio();audioCtx?.resume();$('intro-copy').classList.add('hidden');buildChurch();createWeaponView();canvas.requestPointerLock?.();});
$('pause-button').addEventListener('click',openPause);$('resume-button').addEventListener('click',closePause);$('restart-button').addEventListener('click',()=>{resetGame();closePause();});$('loop-button').addEventListener('click',()=>{resetGame();});
$('volume-slider').addEventListener('input',e=>{const n=Number(e.target.value);$('volume-value').textContent=`${n}%`;if(masterGain)masterGain.gain.value=n/100;try{localStorage.setItem('krovotkinskaya_volume',String(n));}catch{}});
$('quality-select').addEventListener('change',e=>{quality=e.target.value;const ratios={high:1.7,medium:1.25,low:.9};renderer.setPixelRatio(Math.min(devicePixelRatio||1,ratios[quality]));renderer.shadowMap.enabled=quality!=='low';renderer.setSize(innerWidth,innerHeight);try{localStorage.setItem('krovotkinskaya_quality',quality);}catch{}});
$('inventory').addEventListener('click',e=>{const slot=e.target.closest('.slot');if(!slot)return;const n=Number(slot.dataset.slot);if((n===1&&inventory.lighter)||(n===2&&inventory.carbine)||(n===3&&inventory.portal)){selectedSlot=n;updateSlots();}});
document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==canvas&&!paused&&phase!=='intro'&&phase!=='ending'&&!$('pause-screen').classList.contains('hidden'))return;if(document.pointerLockElement!==canvas&&!paused&&phase!=='intro'&&phase!=='ending'){openPause();}});

// -------------------- FRAME LOOP --------------------
function updateParticles(dt){for(let i=particles.length-1;i>=0;i--){const p=particles[i];if(p.userData.life!==undefined){p.userData.life-=dt;if(p.userData.velocity)p.position.addScaledVector(p.userData.velocity,dt);p.material.opacity=p.userData.life>0?Math.min(1,p.userData.life*3):0;if(p.userData.life<=0){world.remove(p);p.geometry?.dispose();if(p.userData.disposeMaterial)p.material?.dispose();particles.splice(i,1);}}else if(p.userData.fall){p.position.y-=p.userData.fall*dt;if(p.position.y<0)p.position.y=22;}else if(p.userData.dust){p.position.y+=Math.sin(sceneTime*1.4+p.position.x)*dt*.035;p.position.x+=Math.sin(sceneTime*.7+p.position.z)*dt*.02;}}}
function updateInteractions(){if(['church','basement','garden'].includes(phase)&&!paused){findInteraction();}else{$('interact-prompt').classList.add('hidden');}}
function updateIntro(dt){introTime+=dt;sceneTime+=dt;camera.position.x=THREE.MathUtils.damp(camera.position.x,1.8,0.14,dt);camera.position.y=THREE.MathUtils.damp(camera.position.y,5.1,0.14,dt);camera.lookAt(-5,8,-6);const saucer=world.children.find(o=>o.userData.intro);if(saucer){saucer.position.x=12-introTime*.42;saucer.position.y=18+Math.sin(introTime*1.2)*.3;if(introTime>2.8&&introTime<3.2&&!saucer.userData.struck){saucer.userData.struck=true;createLightning();}if(introTime>5){saucer.position.y=17;}}
  if(introTime>7.2&&$('intro-copy').classList.contains('hidden')){$('intro-copy').classList.remove('hidden');}
}
function animateProps(dt){
  weaponIdle+=dt;weaponRecoil=Math.max(0,weaponRecoil-dt*.9);pickupPulse=Math.max(0,pickupPulse-dt);equipPulse=Math.max(0,equipPulse-dt);
  for(let i=animatedObjects.length-1;i>=0;i--){const item=animatedObjects[i],o=item.object;if(!o.visible)continue;const t=sceneTime*(item.speed||1)+(item.phase||0);if(item.type==='collect'){item.elapsed+=dt;const k=Math.max(0,1-item.elapsed/item.duration);o.scale.copy(item.startScale).multiplyScalar(k);o.rotation.y+=dt*12;o.position.y+=dt*.8;if(item.elapsed>=item.duration){o.visible=false;world.remove(o);animatedObjects.splice(i,1);}continue;}if(item.type==='enemyDeath'){item.elapsed+=dt;const k=Math.max(0,1-item.elapsed/item.duration);o.scale.copy(item.startScale).multiplyScalar(k);o.rotation.y+=dt*5;o.position.y-=dt*.28;if(item.elapsed>=item.duration){o.visible=false;world.remove(o);animatedObjects.splice(i,1);}continue;}if(item.type==='pickup'){o.position.y=o.userData.animBaseY+Math.sin(t)*item.amplitude;o.rotation.y=o.userData.animBaseRot+Math.sin(t*.55)*.18;}else if(item.type==='book'){o.rotation.z=Math.sin(t)*.012;o.rotation.y=o.userData.animBaseRot+Math.sin(t*.45)*.035;}else if(item.type==='ripple'){o.scale.setScalar(1+Math.sin(t)*.12);o.material.opacity=.12+Math.sin(t)*.08;}else if(item.type==='portal'){o.rotation.z=sceneTime*.35;o.position.y=item.amplitude*Math.sin(t);}}
  if(candleFlame){const flick=.82+Math.sin(sceneTime*17)*.11+Math.sin(sceneTime*31)*.06;candleFlame.scale.set(.7*flick,1.7*flick,.7*flick);candleFlame.rotation.z=Math.sin(sceneTime*12)*.08;}
  if(candleLight)candleLight.intensity=1.8+Math.sin(sceneTime*18)*.22+Math.sin(sceneTime*29)*.13;
  if(weaponRig){weaponRig.visible=(phase==='garden'||phase==='basement')&&!!inventory.carbine&&selectedSlot===2;weaponRig.position.y=-.32+Math.sin(weaponIdle*7)*.006-weaponRecoil*.72+equipPulse*.46;weaponRig.position.x=.36+Math.sin(weaponIdle*3.5)*.008;weaponRig.rotation.x=-.03+weaponRecoil*1.1;if(weaponRig.userData.flash&&weaponRecoil<.03)weaponRig.userData.flash.visible=false;if(muzzleFlash)muzzleFlash.intensity=weaponRecoil>.02?6:0;}
  $('crosshair').classList.toggle('firing',weaponRecoil>.025&&(phase==='garden'||phase==='basement'));
  if(lighterRig){lighterRig.visible=(phase==='church'||phase==='basement')&&!!inventory.lighter&&selectedSlot===1;lighterRig.rotation.z=-.08+Math.sin(weaponIdle*2)*.025;lighterRig.position.y=-.31+Math.sin(weaponIdle*2.2)*.009+equipPulse*.42;if(lighterRig.userData.spark)lighterRig.userData.spark.visible=lighterRig.visible&&Math.sin(sceneTime*13)>0.94;}
  if(lighterGlow)lighterGlow.intensity=(inventory.lighter&&selectedSlot===1&&(phase==='church'||phase==='basement'))?2.05:0;if(lighterSpot)lighterSpot.intensity=(inventory.lighter&&selectedSlot===1&&(phase==='church'||phase==='basement'))?3.2:0;
  if(portalRig){portalRig.visible=(phase==='church'||phase==='basement'||phase==='garden')&&inventory.portal&&selectedSlot===3;const portalOnline=phase==='church'||phase==='basement';portalRig.userData.core.material.emissive.setHex(portalOnline?0x49d9a1:0x812e36);portalRig.userData.kick=Math.max(0,portalRig.userData.kick-dt*1.8);portalRig.position.y=-.34+Math.sin(weaponIdle*2.4)*.012-portalRig.userData.kick*.24+equipPulse*.4;portalRig.rotation.x=-.08+Math.sin(weaponIdle*2.8)*.018+portalRig.userData.kick*.55;portalRig.userData.ring.rotation.z+=dt*2.8;portalRig.userData.core.material.emissiveIntensity=portalOnline?2.2+Math.sin(sceneTime*9)*.7:.35+Math.sin(sceneTime*5)*.25;}if(pickupPulse>0&&phase!=='flight'){camera.fov=THREE.MathUtils.damp(camera.fov,76-pickupPulse*5,12,dt);camera.updateProjectionMatrix();}else if(phase!=='flight')camera.fov=THREE.MathUtils.damp(camera.fov,76,4,dt);
  if(friendAlien&&friendAlien.parent===world)animateAlien(friendAlien,dt,.15,false);if(ufo&&phase==='garden'){ufo.position.y=.35+Math.sin(sceneTime*1.5)*.1;ufo.rotation.y=Math.sin(sceneTime*.5)*.025;}if(ufo?.userData?.muzzleGlow){ufo.userData.shotFlash=Math.max(0,ufo.userData.shotFlash-dt);ufo.userData.muzzleGlow.intensity=ufo.userData.shotFlash*58;if(ufo.userData.muzzleCore)ufo.userData.muzzleCore.visible=ufo.userData.shotFlash>0;}
  for(let i=pulseLights.length-1;i>=0;i--){const light=pulseLights[i];light.userData.lightPulse-=dt;light.intensity=Math.max(0,light.userData.lightPulse*12);if(light.userData.lightPulse<=0){world.remove(light);pulseLights.splice(i,1);}}
}
function update(dt){sceneTime+=dt;animateProps(dt);
  if(phase==='intro'){updateIntro(dt);updateParticles(dt);return;}if(paused)return;
  if(phase==='church'||phase==='basement'){movePlayer(dt);setCameraFPS();if(phase==='basement')updateBasementCombat(dt);if(phase==='church'&&weaponRig)weaponRig.visible=false;}
  if(phase==='garden')updateGarden(dt);
  if(phase==='flight')updateFlight(dt);
  if(phase==='cockpit'){
    if(sceneTime<3.2){yaw=THREE.MathUtils.damp(yaw,Math.PI,1.25,dt);camera.rotation.set(pitch,yaw,0,'YXZ');}
    if(sceneTime>3.2&&!cockpitDialogueStarted){cockpitDialogueStarted=true;startFinalDialogue();}
  }
  if(toastTimer>0){toastTimer-=dt*1000;if(toastTimer<=0)$('toast').classList.remove('visible');}
  updateParticles(dt);updateInteractions();
}

function animate(){requestAnimationFrame(animate);const dt=Math.min(clock.getDelta(),.04);update(dt);renderer.render(scene,camera);}
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(devicePixelRatio||1,quality==='low'?.9:quality==='medium'?1.25:1.7));});

// Initial boot.
try{const savedVolume=Number(localStorage.getItem('krovotkinskaya_volume')??65);$('volume-slider').value=String(clamp(savedVolume,0,100));$('volume-value').textContent=`${clamp(savedVolume,0,100)}%`;quality=localStorage.getItem('krovotkinskaya_quality')||'high';if(!['high','medium','low'].includes(quality))quality='high';$('quality-select').value=quality;const ratios={high:1.7,medium:1.25,low:.9};renderer.setPixelRatio(Math.min(devicePixelRatio||1,ratios[quality]));renderer.shadowMap.enabled=quality!=='low';}catch{}
buildIntro();$('loading-cover').classList.add('done');setTimeout(()=>$('loading-cover').remove(),850);animate();
