/* ═══════════════════════════════════════════════════════
   MediaPlayer — script.js  (Full-featured edition)
   Pure vanilla JS · No dependencies · GitHub Pages ready
   ═══════════════════════════════════════════════════════ */

// ── File type helpers ────────────────────────────────
const AUDIO_EXT = ['.mp3','.ogg','.wav','.flac','.aac','.m4a','.opus','.weba'];
const VIDEO_EXT = ['.mp4','.webm','.mkv','.mov','.ogv'];
function getExt(n){ const m=n.match(/\.[^.]+$/); return m?m[0].toLowerCase():''; }
function isAudio(n){ return AUDIO_EXT.includes(getExt(n)); }
function isVideo(n){ return VIDEO_EXT.includes(getExt(n)); }
function isMedia(n){ return isAudio(n)||isVideo(n); }
function stripExt(n){ return n.replace(/\.[^.]+$/,''); }
function fmtTime(s){ if(!isFinite(s)||isNaN(s))return'0:00'; const m=Math.floor(s/60),sec=Math.floor(s%60); return`${m}:${sec.toString().padStart(2,'0')}`; }
function uid(){ return Math.random().toString(36).slice(2,10); }

// ── DOM refs ─────────────────────────────────────────
const $ = id => document.getElementById(id);
const audioEl   = $('audioEl'),   audioEl2 = $('audioEl2');
const videoEl   = $('videoEl');
const videoWrap = $('videoWrap'), artWrap = $('artWrap');
const vinyl     = $('vinyl'),     vinylLabel = $('vinylLabel');
const trackName = $('trackName'), trackRepo  = $('trackRepo');
const seekBar   = $('seekBar'),   volBar = $('volBar');
const currentTime=$('currentTime'), totalTime=$('totalTime'), volLabel=$('volLabel');
const btnPlay=$('btnPlay'), btnPrev=$('btnPrev'), btnNext=$('btnNext');
const btnStop=$('btnStop'), btnShuffle=$('btnShuffle'), btnRepeat=$('btnRepeat');
const btnMute=$('btnMute'), speedSelect=$('speedSelect');
const btnDownload=$('btnDownload'), audioOnlyBtn=$('audioOnlyBtn');
const trackList=$('trackList'), emptyState=$('emptyState');
const trackCount=$('trackCount'), viewTitle=$('viewTitle');
const searchInput=$('searchInput'), btnShuffleList=$('btnShuffleList');
const plList=$('plList');
const miniPlayer=$('miniPlayer'), miniTitle=$('miniTitle'), miniRepo=$('miniRepo');
const miniPlay=$('miniPlay'), miniPrev=$('miniPrev'), miniNext=$('miniNext'), miniClose=$('miniClose');
const ctxMenu=$('ctxMenu'), ctxPlaylists=$('ctxPlaylists');
const timerEnabled=$('timerEnabled'), timerOptions=$('timerOptions'), timerStatus=$('timerStatus');
const newPlaylistName=$('newPlaylistName'), createPlaylistBtn=$('createPlaylistBtn');
const repoList=$('repoList'), repoInput=$('repoInput'), addRepoBtn=$('addRepoBtn');
const crossfadeSlider=$('crossfadeSlider'), crossfadeVal=$('crossfadeVal');

// ── State ─────────────────────────────────────────────
let allTracks    = [];   // all loaded MediaFile[]
let viewTracks   = [];   // tracks shown in current view
let currentIdx   = -1;   // index in viewTracks
let isPlaying    = false;
let repeatMode   = 'all';
let shuffled     = false;
let shuffleOrder = [];
let audioOnlyMode= false;
let dragSrcIdx   = null;
let searchQuery  = '';
let currentView  = 'all';   // 'all'|'favorites'|'recent'|playlist-id
let ctxTrack     = null;
let miniVisible  = false;
let isCrossfading= false;

// Sleep timer
let sleepTimerMins  = 30;
let sleepTimerEnd   = null;
let sleepTimerInterval = null;
let sleepTimerActive = false;

// ── Persistence keys ──────────────────────────────────
const LS = {
  settings:  'mp-settings',
  playlists: 'mp-playlists',
  favorites: 'mp-favorites',
  recent:    'mp-recent',
  order:     'mp-order',
};

// ── Load / Save helpers ───────────────────────────────
function lsGet(key, def){ try{ const v=localStorage.getItem(key); return v?JSON.parse(v):def; }catch{ return def; } }
function lsSet(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch{} }

// ── Settings ──────────────────────────────────────────
function defaultSettings(){ return { repos: [], theme: 'dark', crossfade: 2 }; }
let settings = { ...defaultSettings(), ...lsGet(LS.settings, {}) };
function saveSettings(){ lsSet(LS.settings, settings); }

// ── Playlists ─────────────────────────────────────────
let playlists = lsGet(LS.playlists, []);
function savePlaylists(){ lsSet(LS.playlists, playlists); }
function getPlaylist(id){ return playlists.find(p=>p.id===id); }

// ── Favorites ─────────────────────────────────────────
let favorites = new Set(lsGet(LS.favorites, []));
function saveFavorites(){ lsSet(LS.favorites, [...favorites]); }
function isFav(t){ return favorites.has(t.key); }
function toggleFav(t){ isFav(t)?favorites.delete(t.key):favorites.add(t.key); saveFavorites(); }

// ── Recently played ───────────────────────────────────
let recentPlayed = lsGet(LS.recent, []); // [{key, name, repo}]
function addRecent(t){ recentPlayed = recentPlayed.filter(r=>r.key!==t.key); recentPlayed.unshift({key:t.key,name:t.name,repo:t.repo}); if(recentPlayed.length>50)recentPlayed.pop(); lsSet(LS.recent,recentPlayed); }

// ── Web Audio API ─────────────────────────────────────
let audioCtx = null, gainNode = null, gainNode2 = null;
let eqFilters = [];
const EQ_PRESETS = {
  flat:       [0,0,0,0,0],
  bass:       [6,4,2,0,0],
  treble:     [0,0,2,4,6],
  vocal:      [-2,0,4,4,2],
  electronic: [4,2,0,2,4],
};
const EQ_FREQS = [60, 250, 1000, 4000, 12000];

function initAudioCtx(){
  if(audioCtx){ audioCtx.resume().catch(()=>{}); return; }
  audioCtx = new (window.AudioContext||window.webkitAudioContext)();
  gainNode  = audioCtx.createGain(); gainNode.gain.value  = 1;
  gainNode2 = audioCtx.createGain(); gainNode2.gain.value = 0;

  // EQ chain
  eqFilters = EQ_FREQS.map((freq,i)=>{
    const f = audioCtx.createBiquadFilter();
    f.type = i===0?'lowshelf': i===EQ_FREQS.length-1?'highshelf':'peaking';
    f.frequency.value = freq;
    f.gain.value = 0;
    return f;
  });
  // Chain: gain → eq → destination
  const chain = [gainNode,...eqFilters];
  chain.reduce((a,b)=>{ a.connect(b); return b; });
  eqFilters[eqFilters.length-1].connect(audioCtx.destination);

  const chain2 = [gainNode2,...eqFilters];
  // gainNode2 also connects through eq → destination (already connected)
  gainNode2.connect(eqFilters[0]);

  // Connect media elements
  try{
    const src1 = audioCtx.createMediaElementSource(audioEl);
    src1.connect(gainNode);
    const src2 = audioCtx.createMediaElementSource(audioEl2);
    src2.connect(gainNode2);
    const srcV = audioCtx.createMediaElementSource(videoEl);
    srcV.connect(gainNode);
  }catch(e){}
}

function applyEqPreset(name){
  const gains = EQ_PRESETS[name]||EQ_PRESETS.flat;
  eqFilters.forEach((f,i)=>{ f.gain.setTargetAtTime(gains[i],audioCtx.currentTime,.05); });
  document.querySelectorAll('.eq-btn').forEach(b=>b.classList.toggle('active',b.dataset.preset===name));
  settings.eq = name; saveSettings();
}

// ── Crossfade ─────────────────────────────────────────
function crossfadeToNext(nextIdx){
  if(!audioCtx||settings.crossfade===0||isCrossfading){ playTrack(nextIdx,true); return; }
  isCrossfading = true;
  const dur = settings.crossfade;
  gainNode.gain.setTargetAtTime(0, audioCtx.currentTime, dur/3);
  const nextTrack = viewTracks[nextIdx];
  if(!nextTrack){ isCrossfading=false; return; }
  audioEl2.src = nextTrack.url;
  audioEl2.load();
  audioEl2.volume = parseFloat(volBar.value);
  gainNode2.gain.setTargetAtTime(1, audioCtx.currentTime, dur/3);
  audioEl2.play().catch(()=>{});
  setTimeout(()=>{
    audioEl.pause();
    // Swap: make audioEl play the new track
    audioEl.src = nextTrack.url;
    audioEl.load();
    audioEl.volume = parseFloat(volBar.value);
    gainNode.gain.setTargetAtTime(1,audioCtx.currentTime,.1);
    gainNode2.gain.setTargetAtTime(0,audioCtx.currentTime,.1);
    audioEl2.pause();
    audioEl.play().catch(()=>{});
    currentIdx = nextIdx;
    updateNowPlaying();
    setPlaying(true);
    isCrossfading = false;
  }, dur*1000);
}

// ── Load tracks from repos ────────────────────────────
async function loadAllTracks(){
  const repos = settings.repos.length ? settings.repos : ['local'];
  const results = await Promise.all(repos.map(r => loadFromRepo(r)));
  allTracks = results.flat();

  // Restore saved order
  const saved = lsGet(LS.order,[]);
  if(saved.length){
    const map = new Map(allTracks.map(t=>[t.key,t]));
    const ordered=[], seen=new Set();
    for(const k of saved){ if(map.has(k)){ ordered.push(map.get(k)); seen.add(k); } }
    for(const t of allTracks){ if(!seen.has(t.key)) ordered.push(t); }
    allTracks = ordered;
  }

  switchView(currentView);
}

async function loadFromRepo(repo){
  if(repo==='local'){
    try{
      const res = await fetch('music/index.json?t='+Date.now());
      if(res.ok){
        const data = await res.json();
        const files = Array.isArray(data)?data:(data.files||[]);
        const media = files.filter(isMedia);
        if(media.length>0) return media.map(f=>makeTrack(f,'music/'+encodeURIComponent(f),'local','this repo'));
      }
    }catch(e){}
    return [];
  }
  // GitHub repo: owner/reponame
  try{
    const base = `https://raw.githubusercontent.com/${repo}/main/music/`;
    const idxUrl = base+'index.json?t='+Date.now();
    const res = await fetch(idxUrl);
    if(res.ok){
      const data = await res.json();
      const files = (Array.isArray(data)?data:(data.files||[])).filter(isMedia);
      return files.map(f=>makeTrack(f, base+encodeURIComponent(f), repo, repo));
    }
  }catch(e){}
  return [];
}

function makeTrack(filename, url, repo, repoLabel){
  return { filename, name:stripExt(filename), url, repo, repoLabel, type:isVideo(filename)?'video':'audio', key:`${repo}::${filename}` };
}

// ── View switching ────────────────────────────────────
function switchView(view){
  currentView = view;
  // Update sidebar highlights
  document.querySelectorAll('.lib-item,.pl-item').forEach(el=>{
    el.classList.toggle('active', el.dataset.view===view);
  });

  if(view==='all'){
    viewTitle.textContent='All Tracks'; viewTracks=[...allTracks];
  } else if(view==='favorites'){
    viewTitle.textContent='Favorites'; viewTracks=allTracks.filter(t=>isFav(t));
  } else if(view==='recent'){
    viewTitle.textContent='Recently Played';
    const keys = recentPlayed.map(r=>r.key);
    viewTracks = keys.map(k=>allTracks.find(t=>t.key===k)).filter(Boolean);
  } else {
    const pl = getPlaylist(view);
    if(pl){ viewTitle.textContent=pl.name; viewTracks=pl.tracks.map(k=>allTracks.find(t=>t.key===k)).filter(Boolean); }
    else { viewTitle.textContent='Playlist'; viewTracks=[]; }
  }
  renderList();
}

function saveOrder(){
  if(currentView==='all') lsSet(LS.order, allTracks.map(t=>t.key));
}

// ── Render playlist ───────────────────────────────────
function renderList(){
  trackCount.textContent = viewTracks.length;
  const q = searchQuery.toLowerCase();
  const filtered = q
    ? viewTracks.map((t,i)=>({t,i})).filter(({t})=>t.name.toLowerCase().includes(q))
    : viewTracks.map((t,i)=>({t,i}));

  Array.from(trackList.querySelectorAll('.track-item')).forEach(el=>el.remove());

  if(filtered.length===0){ emptyState.style.display=''; return; }
  emptyState.style.display='none';

  filtered.forEach(({t,i},pos)=>{
    const li = document.createElement('li');
    li.className='track-item'+(i===currentIdx?' active':'')+(isFav(t)?' favorited':'');
    li.dataset.idx=i;
    li.draggable=!q;

    // Grip
    const grip=document.createElement('span'); grip.className='drag-handle'; grip.textContent='⠿';
    // Num/wave
    const numWrap=document.createElement('span');
    if(i===currentIdx&&isPlaying){
      numWrap.innerHTML=`<span class="wave-bars"><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span><span class="wave-bar"></span></span>`;
    } else { numWrap.className='track-num'; numWrap.textContent=String(pos+1).padStart(2,'0'); }
    // Type icon
    const icon=document.createElement('span'); icon.className='track-type-icon'; icon.textContent=t.type==='video'?'🎬':'🎵';
    // Info
    const info=document.createElement('div'); info.className='track-info';
    info.innerHTML=`<div class="track-info-name">${escHtml(t.name)}</div><div class="track-info-sub">${escHtml(t.repoLabel||'')}</div>`;
    // Fav heart
    const heart=document.createElement('span'); heart.className='fav-icon'; heart.textContent='♥';
    heart.addEventListener('click',e=>{ e.stopPropagation(); toggleFav(t); renderList(); });

    li.append(grip,numWrap,icon,info,heart);
    if(t.type==='video'){ const b=document.createElement('span'); b.className='badge-video'; b.textContent='Video'; li.appendChild(b); }

    // Click
    li.addEventListener('click',()=>playTrack(i,true));
    // Right-click context menu
    li.addEventListener('contextmenu',e=>{ e.preventDefault(); showCtxMenu(e,t,i); });
    // Drag
    if(!q){
      li.addEventListener('dragstart',e=>{ dragSrcIdx=i; li.classList.add('dragging'); e.dataTransfer.effectAllowed='move'; });
      li.addEventListener('dragover', e=>{ e.preventDefault(); li.classList.add('drag-over'); });
      li.addEventListener('dragleave',()=>li.classList.remove('drag-over'));
      li.addEventListener('dragend',  ()=>{ li.classList.remove('dragging'); dragSrcIdx=null; });
      li.addEventListener('drop',e=>{
        e.preventDefault(); li.classList.remove('drag-over');
        if(dragSrcIdx===null||dragSrcIdx===i) return;
        const arr = currentView==='all'?allTracks:viewTracks;
        const moved=arr.splice(dragSrcIdx,1)[0];
        arr.splice(dragSrcIdx<i?i-1:i,0,moved);
        if(currentIdx===dragSrcIdx) currentIdx=arr.indexOf(moved);
        if(currentView==='all') saveOrder();
        renderList();
      });
    }
    trackList.appendChild(li);
  });
}

function escHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Playback ──────────────────────────────────────────
function getMediaEl(){ if(audioOnlyMode||!viewTracks[currentIdx]||viewTracks[currentIdx].type!=='video') return audioEl; return videoEl; }

function playTrack(idx, autoplay=false){
  const track=viewTracks[idx]; if(!track) return;
  audioEl.pause(); videoEl.pause(); audioEl2.pause();
  currentIdx=idx; audioOnlyMode=false;

  const isVid=track.type==='video';
  videoWrap.classList.toggle('hidden',!isVid);
  artWrap.style.display=isVid?'none':'';
  audioOnlyBtn.classList.toggle('hidden',!isVid);
  audioOnlyBtn.classList.remove('active');
  audioOnlyBtn.textContent='🔊 Audio Only';

  const el=isVid?videoEl:audioEl;
  el.src=track.url; el.load();

  updateNowPlaying();
  addRecent(track);

  if(autoplay&&track.url){
    initAudioCtx();
    // Reset gain nodes in case a crossfade was interrupted
    if(gainNode){
      gainNode.gain.cancelScheduledValues(audioCtx.currentTime);
      gainNode.gain.value = 1;
    }
    if(gainNode2){
      gainNode2.gain.cancelScheduledValues(audioCtx.currentTime);
      gainNode2.gain.value = 0;
    }
    isCrossfading = false;
    el.volume = parseFloat(volBar.value);
    el.playbackRate = parseFloat(speedSelect.value);
    el.play().then(()=>{ el.playbackRate=parseFloat(speedSelect.value); setPlaying(true); }).catch(()=>setPlaying(false));
  } else { setPlaying(false); }

  btnDownload.classList.toggle('hidden',!track.url);
  renderList();
  updateMiniPlayer();
}

function updateNowPlaying(){
  const t=viewTracks[currentIdx];
  trackName.textContent=t?t.name:'No track selected';
  trackRepo.textContent=t?(t.repoLabel||''):'';
  document.title=t?`${t.name} — MediaPlayer`:'MediaPlayer';
  miniTitle.textContent=t?t.name:'No track';
  miniRepo.textContent=t?t.repoLabel||'':'';
}

function setPlaying(val){
  isPlaying=val;
  btnPlay.textContent=val?'⏸':'▶';
  miniPlay.textContent=val?'⏸':'▶';
  vinyl.classList.toggle('spinning',val&&viewTracks[currentIdx]?.type!=='video'&&!audioOnlyMode);
}

function getNextIdx(cur){
  if(!viewTracks.length) return 0;
  if(shuffled&&shuffleOrder.length){ const p=shuffleOrder.indexOf(cur); return shuffleOrder[(p+1)%shuffleOrder.length]; }
  return (cur+1)%viewTracks.length;
}
function getPrevIdx(cur){
  if(!viewTracks.length) return 0;
  if(shuffled&&shuffleOrder.length){ const p=shuffleOrder.indexOf(cur); return shuffleOrder[(p-1+shuffleOrder.length)%shuffleOrder.length]; }
  return (cur-1+viewTracks.length)%viewTracks.length;
}

// ── Transport controls ────────────────────────────────
btnPlay.addEventListener('click',()=>{
  if(currentIdx<0){ if(viewTracks.length) playTrack(0,true); return; }
  const el=getMediaEl();
  if(isPlaying){ el.pause(); setPlaying(false); }
  else { initAudioCtx(); el.play().then(()=>setPlaying(true)).catch(()=>{}); }
});
btnPrev.addEventListener('click',()=>{
  if(!viewTracks.length) return;
  const el=getMediaEl(); if(el&&el.currentTime>3){ el.currentTime=0; return; }
  playTrack(currentIdx<0?0:getPrevIdx(currentIdx),true);
});
btnNext.addEventListener('click',()=>{ if(viewTracks.length) playTrack(currentIdx<0?0:getNextIdx(currentIdx),true); });
btnStop.addEventListener('click',()=>{ const el=getMediaEl(); if(!el)return; el.pause(); el.currentTime=0; seekBar.value=0; currentTime.textContent='0:00'; setPlaying(false); });
btnShuffle.addEventListener('click',()=>{
  shuffled=!shuffled; btnShuffle.classList.toggle('active',shuffled);
  shuffleOrder=shuffled?Array.from({length:viewTracks.length},(_,i)=>i).sort(()=>Math.random()-.5):[];
});
btnRepeat.addEventListener('click',()=>{
  repeatMode=repeatMode==='none'?'all':repeatMode==='all'?'one':'none';
  btnRepeat.classList.toggle('active',repeatMode!=='none');
  btnRepeat.textContent=repeatMode==='one'?'🔂':'↺';
});
let prevVol=0.8;
btnMute.addEventListener('click',()=>{
  const v=parseFloat(volBar.value); if(v>0){prevVol=v;volBar.value=0;}else{volBar.value=prevVol;}
  updateVolume();
});
volBar.addEventListener('input',updateVolume);
function updateVolume(){
  const v=parseFloat(volBar.value); audioEl.volume=v; videoEl.volume=v; audioEl2.volume=v;
  volLabel.textContent=Math.round(v*100);
  btnMute.textContent=v===0?'🔇':v<.5?'🔉':'🔊';
  setRangeFill(volBar,v,0,1);
}
seekBar.addEventListener('input',()=>{ const el=getMediaEl(); if(el) el.currentTime=parseFloat(seekBar.value); });
speedSelect.addEventListener('change',()=>{ const r=parseFloat(speedSelect.value); audioEl.playbackRate=r; videoEl.playbackRate=r; audioEl2.playbackRate=r; });

// ── Audio-only toggle for video ───────────────────────
audioOnlyBtn.addEventListener('click',()=>{
  if(!viewTracks[currentIdx]||viewTracks[currentIdx].type!=='video') return;
  audioOnlyMode=!audioOnlyMode;
  audioOnlyBtn.classList.toggle('active',audioOnlyMode);
  audioOnlyBtn.textContent=audioOnlyMode?'🎬 Show Video':'🔊 Audio Only';
  videoWrap.classList.toggle('hidden',audioOnlyMode);
  artWrap.style.display=audioOnlyMode?'':'none';
  vinyl.classList.toggle('spinning',audioOnlyMode&&isPlaying);

  const t=viewTracks[currentIdx];
  const wasTime=videoEl.currentTime, wasPaused=videoEl.paused;
  if(audioOnlyMode){
    videoEl.pause();
    initAudioCtx();
    audioEl.src=t.url; audioEl.currentTime=wasTime; audioEl.volume=parseFloat(volBar.value);
    if(!wasPaused) audioEl.play().catch(()=>{});
  } else {
    audioEl.pause();
    videoEl.src=t.url; videoEl.currentTime=audioEl.currentTime; videoEl.volume=parseFloat(volBar.value);
    if(!wasPaused) videoEl.play().catch(()=>{});
  }
});

// ── Media events ──────────────────────────────────────
function wireEl(el){
  el.addEventListener('canplay',()=>{
    // Re-apply speed and volume after load() resets them
    el.playbackRate = parseFloat(speedSelect.value);
    el.volume       = parseFloat(volBar.value);
    if(audioCtx) audioCtx.resume().catch(()=>{});
  });
  el.addEventListener('timeupdate',()=>{
    if(el!==getMediaEl()) return;
    currentTime.textContent=fmtTime(el.currentTime);
    if(!isNaN(el.duration)&&el.duration>0){ seekBar.value=el.currentTime; setRangeFill(seekBar,el.currentTime,0,el.duration); }
  });
  el.addEventListener('durationchange',()=>{
    if(el!==getMediaEl()) return;
    totalTime.textContent=fmtTime(el.duration); seekBar.max=isFinite(el.duration)?el.duration:100;
  });
  el.addEventListener('play', ()=>{ if(el===getMediaEl()) setPlaying(true); });
  el.addEventListener('pause',()=>{ if(el===getMediaEl()) setPlaying(false); });
  el.addEventListener('ended',()=>{
    if(el!==getMediaEl()) return;
    if(repeatMode==='one'){ el.currentTime=0; el.play(); return; }
    if(repeatMode==='none'&&currentIdx===viewTracks.length-1){ setPlaying(false); return; }
    const ni=getNextIdx(currentIdx);
    if(settings.crossfade>0&&viewTracks[ni]?.type==='audio'&&!audioOnlyMode) crossfadeToNext(ni);
    else playTrack(ni,true);
  });
}
wireEl(audioEl); wireEl(videoEl);

// ── EQ ────────────────────────────────────────────────
document.querySelectorAll('.eq-btn').forEach(b=>{
  b.addEventListener('click',()=>{ initAudioCtx(); applyEqPreset(b.dataset.preset); });
});

// ── Range fill util ───────────────────────────────────
function setRangeFill(input,val,min,max){
  const pct=max>min?((val-min)/(max-min))*100:0;
  input.style.background=`linear-gradient(to right,var(--primary) ${pct}%,var(--border) ${pct}%)`;
}
setRangeFill(volBar,.8,0,1);

// ── Sleep Timer ───────────────────────────────────────
timerEnabled.addEventListener('change',()=>{
  sleepTimerActive=timerEnabled.checked;
  timerOptions.classList.toggle('disabled',!sleepTimerActive);
  if(!sleepTimerActive){ clearSleepTimer(); timerStatus.textContent='Timer is off'; }
  else if(sleepTimerMins>0){ startSleepTimer(sleepTimerMins); }
});
document.querySelectorAll('.timer-btn').forEach(b=>{
  b.addEventListener('click',()=>{
    const mins=parseInt(b.dataset.mins);
    sleepTimerMins=mins;
    document.querySelectorAll('.timer-btn').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    if(sleepTimerActive&&mins>0) startSleepTimer(mins);
  });
});
function startSleepTimer(mins){
  clearSleepTimer();
  sleepTimerEnd=Date.now()+mins*60000;
  updateTimerStatus();
  sleepTimerInterval=setInterval(()=>{
    if(!sleepTimerActive){ clearSleepTimer(); return; }
    const left=sleepTimerEnd-Date.now();
    if(left<=0){ clearSleepTimer(); const el=getMediaEl(); if(el){el.pause();} setPlaying(false); timerStatus.textContent='⏹ Stopped by timer'; return; }
    updateTimerStatus();
  },1000);
}
function clearSleepTimer(){ clearInterval(sleepTimerInterval); sleepTimerInterval=null; sleepTimerEnd=null; }
function updateTimerStatus(){
  if(!sleepTimerEnd){ timerStatus.textContent='Timer is off'; return; }
  const left=Math.max(0,sleepTimerEnd-Date.now());
  const m=Math.floor(left/60000), s=Math.floor((left%60000)/1000);
  timerStatus.textContent=`⏱ Stops in ${m}:${s.toString().padStart(2,'0')}`;
}
$('btnSleepTimer').addEventListener('click',()=>{ openModal('sleepModal'); });

// ── Mini Player ───────────────────────────────────────
function updateMiniPlayer(){ if(miniVisible){ miniTitle.textContent=viewTracks[currentIdx]?.name||'No track'; miniRepo.textContent=viewTracks[currentIdx]?.repoLabel||''; } }
$('btnMiniPlayer').addEventListener('click',()=>{ miniVisible=!miniVisible; miniPlayer.classList.toggle('hidden',!miniVisible); });
miniClose.addEventListener('click',()=>{ miniVisible=false; miniPlayer.classList.add('hidden'); });
miniPlay.addEventListener('click',()=>btnPlay.click());
miniPrev.addEventListener('click',()=>btnPrev.click());
miniNext.addEventListener('click',()=>btnNext.click());

// ── Theme ─────────────────────────────────────────────
function applyTheme(t){ document.documentElement.dataset.theme=t; $('btnTheme').textContent=t==='dark'?'🌙':'☀️'; settings.theme=t; saveSettings(); }
$('btnTheme').addEventListener('click',()=>applyTheme(settings.theme==='dark'?'light':'dark'));

// ── Download ──────────────────────────────────────────
btnDownload.addEventListener('click',()=>{
  const t=viewTracks[currentIdx]; if(!t||!t.url) return;
  const a=document.createElement('a'); a.href=t.url; a.download=t.filename; a.click();
});

// ── Export / Import playlist ──────────────────────────
$('btnExport').addEventListener('click',()=>{
  const data={playlist:viewTracks.map(t=>t.filename),version:2,repos:settings.repos};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='playlist.json'; a.click(); URL.revokeObjectURL(a.href);
});
$('importFile').addEventListener('change',e=>{
  const f=e.target.files[0]; if(!f) return;
  const reader=new FileReader();
  reader.onload=evt=>{
    try{
      const data=JSON.parse(evt.target.result);
      const order=Array.isArray(data)?data:(data.playlist||[]);
      const map=new Map(allTracks.map(t=>[t.filename,t]));
      const ordered=[], seen=new Set();
      for(const fn of order){ const t=map.get(fn); if(t){ordered.push(t);seen.add(fn);} }
      for(const t of allTracks){ if(!seen.has(t.filename)) ordered.push(t); }
      allTracks=ordered; currentIdx=-1;
      saveOrder(); switchView('all');
    }catch{ alert('Invalid playlist file.'); }
  };
  reader.readAsText(f); e.target.value='';
});

// ── Playlist management ───────────────────────────────
function renderPlaylists(){
  plList.innerHTML='';
  playlists.forEach(pl=>{
    const li=document.createElement('li'); li.className='pl-item'+(currentView===pl.id?' active':''); li.dataset.view=pl.id;
    li.innerHTML=`<span class="pl-item-name">${escHtml(pl.name)}</span><button class="pl-item-del" data-id="${pl.id}" title="Delete">✕</button>`;
    li.addEventListener('click',e=>{ if(e.target.dataset.id) return; switchView(pl.id); });
    li.querySelector('.pl-item-del').addEventListener('click',e=>{ e.stopPropagation(); deletePlaylist(pl.id); });
    plList.appendChild(li);
  });
}
function deletePlaylist(id){ playlists=playlists.filter(p=>p.id!==id); savePlaylists(); renderPlaylists(); if(currentView===id) switchView('all'); }

$('btnNewPlaylist').addEventListener('click',()=>{ newPlaylistName.value=''; openModal('newPlaylistModal'); setTimeout(()=>newPlaylistName.focus(),100); });
createPlaylistBtn.addEventListener('click',()=>{
  const name=newPlaylistName.value.trim(); if(!name) return;
  const pl={id:uid(),name,tracks:[]}; playlists.push(pl); savePlaylists(); renderPlaylists(); closeModal('newPlaylistModal');
});
newPlaylistName.addEventListener('keydown',e=>{ if(e.key==='Enter') createPlaylistBtn.click(); });

// ── Sidebar library views ─────────────────────────────
document.querySelectorAll('.lib-item').forEach(el=>{ el.addEventListener('click',()=>switchView(el.dataset.view)); });

// ── Search ────────────────────────────────────────────
searchInput.addEventListener('input',()=>{ searchQuery=searchInput.value; renderList(); });

// ── Shuffle list ──────────────────────────────────────
btnShuffleList.addEventListener('click',()=>{
  viewTracks=viewTracks.sort(()=>Math.random()-.5);
  if(currentView==='all') allTracks=[...viewTracks];
  currentIdx=-1; saveOrder(); renderList();
});

// ── Context menu ──────────────────────────────────────
function showCtxMenu(e,track,idx){
  ctxTrack={track,idx};
  // Populate playlist submenu
  ctxPlaylists.innerHTML='';
  if(playlists.length===0){
    const el=document.createElement('div'); el.className='ctx-submenu-item'; el.textContent='No playlists'; el.style.color='var(--muted)'; ctxPlaylists.appendChild(el);
  } else {
    playlists.forEach(pl=>{
      const el=document.createElement('div'); el.className='ctx-submenu-item'; el.textContent=pl.name;
      el.addEventListener('click',()=>{ addToPlaylist(pl.id,track); hideCtxMenu(); });
      ctxPlaylists.appendChild(el);
    });
  }
  // Show/hide remove option
  const removeItem=ctxMenu.querySelector('[data-action="removePlaylist"]');
  const inPlaylist=currentView!=='all'&&currentView!=='favorites'&&currentView!=='recent';
  removeItem.classList.toggle('hidden',!inPlaylist);

  // Update fav text
  ctxMenu.querySelector('[data-action="favorite"]').textContent=isFav(track)?'♥ Remove from Favorites':'♥ Add to Favorites';

  // Position
  let x=e.clientX, y=e.clientY;
  ctxMenu.classList.remove('hidden');
  const mw=ctxMenu.offsetWidth, mh=ctxMenu.offsetHeight;
  if(x+mw>window.innerWidth) x=window.innerWidth-mw-8;
  if(y+mh>window.innerHeight) y=window.innerHeight-mh-8;
  ctxMenu.style.left=x+'px'; ctxMenu.style.top=y+'px';
}
function hideCtxMenu(){ ctxMenu.classList.add('hidden'); ctxTrack=null; }
document.addEventListener('click',hideCtxMenu);
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ hideCtxMenu(); closeAllModals(); } });

ctxMenu.addEventListener('click',e=>{
  e.stopPropagation();
  const action=e.target.dataset.action; if(!action||!ctxTrack) return;
  const {track,idx}=ctxTrack;
  if(action==='play')           { playTrack(idx,true); }
  if(action==='favorite')       { toggleFav(track); renderList(); }
  if(action==='download')       { if(track.url){const a=document.createElement('a');a.href=track.url;a.download=track.filename;a.click();} }
  if(action==='removePlaylist') { removeFromPlaylist(currentView,track); }
  hideCtxMenu();
});

function addToPlaylist(playlistId, track){
  const pl=getPlaylist(playlistId); if(!pl) return;
  if(!pl.tracks.includes(track.key)) pl.tracks.push(track.key);
  savePlaylists();
}
function removeFromPlaylist(playlistId, track){
  const pl=getPlaylist(playlistId); if(!pl) return;
  pl.tracks=pl.tracks.filter(k=>k!==track.key);
  savePlaylists(); switchView(currentView);
}

// ── Settings ──────────────────────────────────────────
$('btnSettings').addEventListener('click',()=>{ renderSettingsRepos(); openModal('settingsModal'); });
addRepoBtn.addEventListener('click',()=>{
  const v=repoInput.value.trim(); if(!v) return;
  if(!settings.repos.includes(v)){ settings.repos.push(v); saveSettings(); renderSettingsRepos(); loadAllTracks(); }
  repoInput.value='';
});
repoInput.addEventListener('keydown',e=>{ if(e.key==='Enter') addRepoBtn.click(); });
crossfadeSlider.addEventListener('input',()=>{
  settings.crossfade=parseInt(crossfadeSlider.value);
  crossfadeVal.textContent=settings.crossfade+'s';
  saveSettings();
});
function renderSettingsRepos(){
  repoList.innerHTML='';
  if(settings.repos.length===0){ repoList.innerHTML='<div style="font-size:12px;color:var(--muted);padding:4px">No extra repos added — uses local music/ folder</div>'; return; }
  settings.repos.forEach(r=>{
    const el=document.createElement('div'); el.className='repo-tag';
    el.innerHTML=`<span>${escHtml(r)}</span><button class="repo-tag-del" title="Remove">✕</button>`;
    el.querySelector('.repo-tag-del').addEventListener('click',()=>{ settings.repos=settings.repos.filter(x=>x!==r); saveSettings(); renderSettingsRepos(); loadAllTracks(); });
    repoList.appendChild(el);
  });
}

// ── Modal helpers ─────────────────────────────────────
function openModal(id){ $(id).classList.remove('hidden'); }
function closeModal(id){ $(id).classList.add('hidden'); }
function closeAllModals(){ document.querySelectorAll('.modal-overlay').forEach(m=>m.classList.add('hidden')); }
document.querySelectorAll('.modal-close').forEach(btn=>{ btn.addEventListener('click',()=>closeModal(btn.dataset.close)); });
document.querySelectorAll('.modal-overlay').forEach(overlay=>{ overlay.addEventListener('click',e=>{ if(e.target===overlay) overlay.classList.add('hidden'); }); });

// ── Keyboard shortcuts ────────────────────────────────
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT') return;
  if(e.code==='Space'){e.preventDefault();btnPlay.click();}
  if(e.code==='ArrowRight') btnNext.click();
  if(e.code==='ArrowLeft')  btnPrev.click();
  if(e.code==='KeyS')       btnStop.click();
  if(e.code==='KeyM')       btnMute.click();
  if(e.code==='KeyF'&&viewTracks[currentIdx]){ toggleFav(viewTracks[currentIdx]); renderList(); }
});

// ── Init ──────────────────────────────────────────────
applyTheme(settings.theme||'dark');
crossfadeSlider.value=settings.crossfade??2;
crossfadeVal.textContent=(settings.crossfade??2)+'s';
updateVolume();
renderPlaylists();
loadAllTracks();
