const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const CANDIDATES = ['storm', 'orange', 'veil', 'green', 'red', 'debris'];
const VISIBLE_BODIES = ['reach', 'orange', 'veil', 'green', 'red', 'debris'];
const placeMeta = {reach:['Reach',0,0,'home'],storm:['Storm Zone',0,0,'storm'],orange:['Orange Planet',0,0,'orange'],veil:['the Veil',0,0,'veil'],green:['Green Planet',0,0,'green'],red:['Red Planet',0,0,'red'],debris:['Debris Belt',0,0,'debris']};
let playerId=localStorage.getItem('luke-player-id'), currentState=null, selections=[], selectionMode=null, lastStage=null, polling=false, cardRenderKey='';
let orbitModel=null, currentChartHour=0, whatIfSelecting=false, whatIfState=null, whatIfPlayerId=null;
const compactWorkspace=window.matchMedia('(max-width: 980px)');
let workspaceView=localStorage.getItem('luke-workspace-view')||'intel';
let lastPrimaryView=['intel','mission'].includes(workspaceView)?workspaceView:'intel';
function sync3DMap(){if(window.starMap3D){window.starMap3D.setInteractionMode({game:!!selectionMode,whatIf:whatIfSelecting});window.starMap3D.setSelections(selections);window.starMap3D.setHour(currentChartHour);window.starMap3D.setWhatIfRing(whatIfState,currentChartHour);}}
function handleMapSelection(id){if(whatIfSelecting)createWhatIfRing(id);else selectPlace(id);}
window.addEventListener('star-map-select',event=>handleMapSelection(event.detail.id));
window.addEventListener('star-map-3d-ready',sync3DMap);
function escapeHtml(text=''){return text.replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function formatText(text=''){return escapeHtml(text).replace(/\*([^*]+)\*/g,'<em>$1</em>').replace(/\n/g,'<br>');}
function showToast(message,error=false){const el=$('#toast');el.textContent=message;el.classList.toggle('error',error);el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2400);}
function clock(value){return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(Math.floor(value%60)).padStart(2,'0')}`;}
async function request(path,options={}){const response=await fetch(path,{headers:{'Content-Type':'application/json',...(options.headers||{})},...options});if(!response.ok){const body=await response.json().catch(()=>({detail:response.statusText}));throw new Error(body.detail||response.statusText);}return response.json();}

async function loadLobby(room=''){
  try{const lobby=await request('/api/lobby'+(room?`?room=${encodeURIComponent(room)}`:''));$('#room-input').value=lobby.room_code;$('#roster-options').innerHTML=lobby.teams.map(team=>`<section><div class="roster-option-head"><b>${team.id}</b><span>${team.condition}</span></div>${team.members.map(member=>`<button data-name="${escapeHtml(member.name)}" ${member.joined?'disabled':''}><i></i><span>${escapeHtml(member.name)}</span><small>${member.joined?'JOINED':'AVAILABLE'}</small></button>`).join('')}</section>`).join('');$$('[data-name]').forEach(button=>button.onclick=()=>join(button.dataset.name,lobby.room_code,false));$('#roster-picker').hidden=false;$('#join-error').textContent='';}
  catch(error){$('#join-error').textContent=error.message;$('#roster-picker').hidden=true;}
}
async function join(name,room,spectator){try{const result=await request('/api/join',{method:'POST',body:JSON.stringify({room_code:room,name,spectator})});playerId=result.player_id;localStorage.setItem('luke-player-id',playerId);whatIfPlayerId=null;loadWhatIfState();await pollState();}catch(error){showToast(error.message,true);}}
$('#room-form').onsubmit=event=>{event.preventDefault();loadLobby($('#room-input').value.trim().toUpperCase());};
$('#spectator-form').onsubmit=event=>{event.preventDefault();join($('#spectator-name').value.trim(),$('#room-input').value.trim().toUpperCase(),true);};

function buildMap(){
  const {centerX,centerY,scaleX,scaleZ}=orbitModel.svg;
  $('#map-orbits').innerHTML=['red','green','orange'].map(id=>{const body=orbitModel.bodies[id],radius=Math.hypot(body.x,body.z);return `<ellipse cx="${centerX}" cy="${centerY}" rx="${(radius*scaleX).toFixed(1)}" ry="${(radius*scaleZ).toFixed(1)}"/>`;}).join('');
  let dots='';for(let i=0;i<44;i++){const t=i/43,angle=Math.PI*(.12+t*.76),radius=42+(i%4-2)*3;dots+=`<circle cx="${(Math.cos(angle)*radius).toFixed(1)}" cy="${(Math.sin(angle)*radius*.48).toFixed(1)}" r="${2+(i*7)%5}"/>`;}$('.debris-dots').innerHTML=dots;
  $('#map-places').innerHTML=VISIBLE_BODIES.map(id=>{const body=orbitModel.bodies[id],name=body.name,kind=placeMeta[id][3];if(id==='debris')return `<g class="place place-debris" data-place="${id}"><circle class="hit" r="48"/><text y="44">${name}</text><g class="selection-marks"></g></g>`;if(id==='veil')return `<g class="place place-veil" data-place="${id}"><circle class="hit" r="56"/><circle class="node" r="8"/><text y="-58">${name}</text><g class="selection-marks"></g></g>`;const radius=id==='orange'?36:id==='reach'?23:25;return `<g class="place place-${kind}" data-place="${id}"><circle class="halo" r="${radius+14}"/><circle class="node" r="${radius}"/><text y="${-radius-17}">${name}</text><g class="selection-marks"></g></g>`;}).join('');
  $$('.place').forEach(el=>el.addEventListener('click',()=>handleMapSelection(el.dataset.place)));
  updateChartVisuals();
}

function hourLabel(hour){return Number.isInteger(hour)?String(hour):hour.toFixed(1);}
function updateFallbackPositions(){
  if(!orbitModel)return;
  VISIBLE_BODIES.forEach(id=>{const el=$(`.place[data-place="${id}"]`);if(!el)return;const point=orbitModel.toSvg(orbitModel.positionAt(id,currentChartHour));el.setAttribute('transform',`translate(${point.x.toFixed(2)} ${point.y.toFixed(2)})`);});
  const veil=orbitModel.toSvg(orbitModel.positionAt('veil',currentChartHour));$('#map-veil-cloud').setAttribute('transform',`translate(${veil.x.toFixed(2)} ${veil.y.toFixed(2)})`);
  const debris=orbitModel.toSvg(orbitModel.positionAt('debris',currentChartHour));$('.debris-dots').setAttribute('transform',`translate(${debris.x.toFixed(2)} ${debris.y.toFixed(2)})`);
  const reach=orbitModel.toSvg(orbitModel.positionAt('reach',currentChartHour)),orange=orbitModel.toSvg(orbitModel.positionAt('orange',currentChartHour));
  const controlX=(reach.x+orange.x)/2,controlY=(reach.y+orange.y)/2-18;$('#map-planned-route').setAttribute('d',`M${reach.x.toFixed(1)} ${reach.y.toFixed(1)} Q${controlX.toFixed(1)} ${controlY.toFixed(1)} ${orange.x.toFixed(1)} ${orange.y.toFixed(1)}`);
  const ship=$('#map-ship');ship.hidden=currentChartHour!==0;ship.setAttribute('transform',`translate(${reach.x.toFixed(2)} ${reach.y.toFixed(2)})`);
}

function updateWhatIfVisuals(){
  if(!orbitModel)return;
  const ring=$('#what-if-ring-svg'),reset=$('#what-if-reset'),status=$('#what-if-status');
  const visible=whatIfState&&currentChartHour>=whatIfState.startHour;
  if(visible){const center=orbitModel.toSvg(whatIfState),radius=orbitModel.ship_speed*(currentChartHour-whatIfState.startHour);ring.hidden=false;ring.setAttribute('cx',center.x);ring.setAttribute('cy',center.y);ring.setAttribute('rx',radius*orbitModel.svg.scaleX);ring.setAttribute('ry',radius*orbitModel.svg.scaleZ);status.textContent=`From ${orbitModel.bodies[whatIfState.bodyId].name} at Hour ${hourLabel(whatIfState.startHour)} · range ${hourLabel(radius)} units`;}
  else{ring.hidden=true;if(whatIfState)status.textContent=`Range begins at Hour ${hourLabel(whatIfState.startHour)}. Move the timeline forward.`;else status.textContent=whatIfSelecting?'Select a body on the chart.':'Choose a start point to test travel range.';}
  reset.hidden=!whatIfState;
  window.starMap3D?.setWhatIfRing(whatIfState,currentChartHour);
}

function updateChartVisuals(){
  $('#chart-timeline').value=String(currentChartHour);$('#timeline-current').textContent=`Hour ${hourLabel(currentChartHour)}`;$('#chart-hour-heading').textContent=`HOUR ${hourLabel(currentChartHour)}`;
  updateFallbackPositions();updateWhatIfVisuals();window.starMap3D?.setHour(currentChartHour);
}

function setChartHour(value){currentChartHour=Math.max(0,Math.min(48,Number(value)||0));updateChartVisuals();}

function whatIfKey(){return playerId?`luke-what-if-${playerId}`:null;}
function loadWhatIfState(){
  if(whatIfPlayerId===playerId)return;whatIfPlayerId=playerId;whatIfSelecting=false;whatIfState=null;
  const key=whatIfKey();if(key){try{const saved=JSON.parse(localStorage.getItem(key));if(saved&&VISIBLE_BODIES.includes(saved.bodyId)&&Number.isFinite(saved.startHour)&&Number.isFinite(saved.x)&&Number.isFinite(saved.z))whatIfState=saved;}catch(_error){localStorage.removeItem(key);}}
  $('#what-if-start').classList.remove('active');$('#what-if-start').setAttribute('aria-pressed','false');updateWhatIfVisuals();sync3DMap();
}
function setWhatIfSelecting(value){whatIfSelecting=!!value;$('#what-if-start').classList.toggle('active',whatIfSelecting);$('#what-if-start').setAttribute('aria-pressed',String(whatIfSelecting));updateWhatIfVisuals();sync3DMap();}
function createWhatIfRing(bodyId){
  if(!orbitModel||!VISIBLE_BODIES.includes(bodyId))return;const position=orbitModel.positionAt(bodyId,currentChartHour);whatIfState={bodyId,startHour:currentChartHour,x:position.x,z:position.z};const key=whatIfKey();if(key)localStorage.setItem(key,JSON.stringify(whatIfState));setWhatIfSelecting(false);updateWhatIfVisuals();showToast(`Travel range starts at ${orbitModel.bodies[bodyId].name}, Hour ${hourLabel(currentChartHour)}.`);
}
function resetWhatIf(){const key=whatIfKey();if(key)localStorage.removeItem(key);whatIfState=null;setWhatIfSelecting(false);updateWhatIfVisuals();}
function selectPlace(id){if(!selectionMode||!CANDIDATES.includes(id))return;const max=selectionMode==='drop'?2:3;if(selectionMode==='drop'){if(selections.includes(id))selections=selections.filter(item=>item!==id);else if(selections.length<max)selections.push(id);else showToast('Choose only 2 drop sites.',true);}else if(selections.length<max)selections.push(id);else showToast('You have already placed 3 stars.',true);renderSelections();}
function removeSelection(id){const index=selections.lastIndexOf(id);if(index>=0)selections.splice(index,1);renderSelections();}
function renderSelections(){
  $$('.place').forEach(el=>{const count=selections.filter(id=>id===el.dataset.place).length;el.classList.toggle('selected',count>0);const marks=$('.selection-marks',el);marks.innerHTML=count?`<g class="selection-badge"><circle cx="34" cy="-34" r="16"/><text x="34" y="-29">${count}</text></g>`:'';});
  const max=selectionMode==='drop'?2:3;$('#selection-counter').hidden=!selectionMode;$('#selection-counter span').textContent=selectionMode==='drop'?'DROP SITES':'STARS PLACED';$('#selection-counter b').textContent=`${selections.length} / ${max}`;$('#submit-action').disabled=selections.length!==max;$('#submit-action').textContent=selectionMode==='drop'?'Confirm drop sites':'Submit stars';$('#map-help').innerHTML=selections.length?selections.map(id=>`<button data-remove="${id}">− ${placeMeta[id][0]}</button>`).join(''):(selectionMode==='drop'?'Tap a 3D location to choose a drop site.':'Tap a 3D location to place a star.');$$('[data-remove]').forEach(button=>button.onclick=()=>removeSelection(button.dataset.remove));sync3DMap();
}
$('#submit-action').onclick=async()=>{try{if(selectionMode==='drop')await request(`/api/drop?player=${playerId}`,{method:'POST',body:JSON.stringify({places:selections})});else await request(`/api/stars/${selectionMode}?player=${playerId}`,{method:'POST',body:JSON.stringify({stars:selections})});showToast(selectionMode==='drop'?'Drop sites confirmed.':'Stars submitted.');await pollState();}catch(error){showToast(error.message,true);}};

function renderCards(state){const key=JSON.stringify([state.team.id,state.player.seat,state.cards.map(card=>[card.id,card.role,card.text])]);if(key===cardRenderKey)return;cardRenderKey=key;if(!state.cards.length){$('#cards').innerHTML='<div class="locked-state"><span>◇</span><p>Your private dossier remains sealed until mission start.</p></div>';return;}const clues=state.cards.map(card=>`<section class="packet-clue"><div class="packet-clue-meta"><span>${card.id}</span><b>${escapeHtml(card.role)}</b></div><p>${formatText(card.text)}</p></section>`).join('');$('#cards').innerHTML=`<article class="dossier private-packet"><header><span>DOSSIER ${state.team.id}-${state.player.seat||'—'}</span><b>PRIVATE INTELLIGENCE</b></header><div class="dossier-rule"></div>${clues}<footer>FIXED ASSIGNMENT · ${state.team.id} / SEAT ${state.player.seat||'—'}</footer></article>`;}
function renderTeam(state){$('#team-name').textContent=state.team.id==='OBS'?'Spectator':`Team ${state.team.id}`;const badge=$('#condition-badge');badge.textContent=state.team.condition;badge.className='condition-badge '+state.team.condition.toLowerCase().replaceAll(' ','-').replace('+','plus');$('#teammates').innerHTML=state.team.members.length?state.team.members.map(member=>`<div class="teammate ${state.active_seat===member.seat?'speaking':''}"><i class="${member.joined?'online':''}"></i><span>${escapeHtml(member.name)}</span><small>${member.joined?(member.late?'LATE':member.seat?`SEAT ${member.seat}`:'JOINED'):'WAITING'}</small></div>`).join(''):'<p class="muted">Observing mission.</p>';}
function renderStage(state){
  $('#stage-label').textContent=`${state.stage.id} · ${state.stage.name.toUpperCase()}`;$('#stage-index').textContent=state.stage.id==='S0'?'00':state.stage.id.slice(1).padStart(2,'0');$('#stage-name').textContent=state.stage.name.toUpperCase();$('#instruction-text').textContent=state.stage.id==='S0'?'Waiting for the mission to begin.':state.stage.instruction;$('#countdown').textContent=state.stage.id==='S0'?'--:--':clock(state.clock.remaining);document.body.classList.toggle('paused',state.clock.paused);
  const details={S0:`Room code ${state.room_code}. Stay on this screen.`,S1:'Read carefully. Every clue may matter.',S2:'Silent round. Your choice stays private.',S3:'Follow the seat order shown below.',S4:'The message arrived for every team at the same time.',S5:'Connect the evidence on your team board.',S6:'This submission replaces your first impression.',S7:'Both squads will search only where they land.',S8:'The reconstruction is playing on the projector.',S9:'Use the questions on the main screen.'};$('#instruction-detail').textContent=details[state.stage.id]||'';
  $('#briefing').hidden=state.stage.id!=='S1';if(state.briefing)$('#briefing').innerHTML=`<span class="data-label">MISSION BRIEFING</span><div>${formatText(state.briefing)}</div>`;
  selectionMode=null;const round=state.stage.id==='S2'?1:state.stage.id==='S6'?2:null;if(round&&!state.player.spectator){selectionMode=round;if(lastStage!==state.stage.id)selections=state.submissions[String(round)]?[...state.submissions[String(round)]]:[];}if(state.stage.id==='S7'&&state.drop.commander){selectionMode='drop';if(lastStage!==state.stage.id)selections=[...state.drop.choices];}
  $('#tab-mission').classList.toggle('needs-attention',!!selectionMode);
  $('#map-actions').hidden=!selectionMode;renderSelections();$$('.place').forEach(el=>el.classList.toggle('interactive',!!selectionMode&&CANDIDATES.includes(el.dataset.place)));
  $('#share-order').hidden=state.stage.id!=='S3';if(state.stage.id==='S3')$('#share-order').innerHTML=`<span class="data-label">READ-ALOUD ORDER</span><div>${state.team.members.filter(m=>m.joined).map(m=>`<span class="${state.active_seat===m.seat?'active':''}"><b>${m.seat}</b>${escapeHtml(m.name)}</span>`).join('')}</div>`;
  $('#team-result').hidden=!state.team_result;if(state.team_result)$('#team-result').innerHTML=`<span class="data-label">YOUR TEAM'S RESULT</span><strong>${state.team_result.success?'RESCUE SUCCESSFUL':'SEARCH INCOMPLETE'}</strong><p>Drops: ${state.team_result.drops.map(id=>placeMeta[id]?.[0]||id).join(' · ')}</p>`;
}
function renderComms(state){$('#mission-log').innerHTML=state.logs.map(entry=>`<article class="log-entry ${entry.kind==='new-message'&&lastStage&&lastStage!==state.stage.id?'fresh':''}"><time>${entry.released_at?`T+${entry.released_at}:00`:'SYS'}</time><p>${escapeHtml(entry.text)}</p></article>`).join('');const boardOpen=['S3','S4','S5','S6','S7'].includes(state.stage.id)&&state.team.id!=='OBS';$('#board-panel').hidden=!boardOpen;$('#board-feed').innerHTML=state.board.length?state.board.slice().reverse().map(post=>`<article><header><b>${escapeHtml(post.author)}</b><time>${post.minute.toFixed(1)}m</time></header><p>${escapeHtml(post.text)}</p></article>`).join(''):'<p class="empty-feed">No findings shared yet.</p>';$('#assistant-panel').hidden=!state.assistant_enabled;if(state.assistant_enabled){const messages=state.assistant_messages||[];$('#assistant-feed').innerHTML=messages.length?messages.map(m=>`<article class="${m.role}"><span>${m.role==='user'?'YOU':'ASSISTANT'}</span><p>${escapeHtml(m.text)}</p>${m.role==='assistant'?`<small>${m.latency_ms} ms</small>`:''}</article>`).join(''):'<p>Ask about your cards or what to ask your teammates.</p>';$('#assistant-feed').scrollTop=$('#assistant-feed').scrollHeight;}}
$('#board-form').onsubmit=async event=>{event.preventDefault();const input=$('#board-input');if(!input.value.trim())return;try{await request(`/api/board?player=${playerId}`,{method:'POST',body:JSON.stringify({text:input.value.trim()})});input.value='';await pollState();}catch(error){showToast(error.message,true)}};
$('#assistant-form').onsubmit=async event=>{event.preventDefault();const input=$('#assistant-input'),button=$('#assistant-form button');if(!input.value.trim())return;const text=input.value.trim();input.value='';button.disabled=true;button.textContent='…';try{await request(`/api/assistant?player=${playerId}`,{method:'POST',body:JSON.stringify({text})});await pollState();}catch(error){showToast(error.message,true)}finally{button.disabled=false;button.textContent='Send';}};
function render(state){currentState=state;$('#join-view').hidden=true;$('#game-view').hidden=false;loadWhatIfState();renderTeam(state);renderCards(state);renderStage(state);renderComms(state);lastStage=state.stage.id;}
async function pollState(){if(!playerId||polling)return;polling=true;try{render(await request(`/api/state?player=${playerId}`));}catch(error){if(error.message==='Player not found'){localStorage.removeItem('luke-player-id');playerId=null;whatIfPlayerId=null;whatIfState=null;$('#join-view').hidden=false;$('#game-view').hidden=true;loadLobby();}else showToast(error.message,true);}finally{polling=false;}}
function setWorkspaceView(requested,remember=true){
  let view=['intel','mission','comms'].includes(requested)?requested:'intel';
  if(view==='comms'&&!compactWorkspace.matches)view=lastPrimaryView;
  if(view==='intel'||view==='mission')lastPrimaryView=view;
  workspaceView=view;
  document.body.dataset.workspaceView=view;
  $$('.workspace-tabs button').forEach(button=>{const selected=button.dataset.tab===view;button.classList.toggle('active',selected);button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;});
  const intel=$('[data-panel="intel"]'),mission=$('[data-panel="mission"]'),comms=$('[data-panel="comms"]');
  intel.hidden=view!=='intel';intel.classList.toggle('active',view==='intel');
  mission.hidden=view!=='mission';mission.classList.toggle('active',view==='mission');
  comms.classList.toggle('active',view==='comms');
  if(remember)localStorage.setItem('luke-workspace-view',view);
  if(view==='mission')requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
}
$$('.workspace-tabs button').forEach(button=>{button.onclick=()=>setWorkspaceView(button.dataset.tab);button.onkeydown=event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();const tabs=$$('.workspace-tabs button').filter(item=>getComputedStyle(item).display!=='none');const index=tabs.indexOf(button);const direction=event.key==='ArrowRight'?1:-1;tabs[(index+direction+tabs.length)%tabs.length].click();};});
compactWorkspace.addEventListener('change',()=>setWorkspaceView(workspaceView,false));
$('#chart-timeline').addEventListener('input',event=>setChartHour(event.target.value));
$('#what-if-start').addEventListener('click',()=>setWhatIfSelecting(!whatIfSelecting));
$('#what-if-reset').addEventListener('click',resetWhatIf);
async function initializeOrbitChart(){try{orbitModel=await window.orbitModelReady;buildMap();loadWhatIfState();setChartHour(0);sync3DMap();}catch(error){console.error('Navigation timeline unavailable.',error);showToast('Navigation timeline unavailable.',true);}}
setWorkspaceView(workspaceView,false);initializeOrbitChart();if(playerId)pollState();else loadLobby(new URLSearchParams(location.search).get('room')||'');setInterval(pollState,2000);
