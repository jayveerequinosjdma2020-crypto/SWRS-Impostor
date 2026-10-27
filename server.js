// Vocab Impostor — authoritative game server (Node.js + ws)
const http=require('http'),fs=require('fs'),path=require('path'),{WebSocketServer}=require('ws');
const srv=http.createServer((q,s)=>{s.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});s.end(fs.readFileSync(path.join(__dirname,'public','index.html')))});
const wss=new WebSocketServer({server:srv}),rooms={};
const D={see:12e3,clue:15e3,disc:45e3,vote:25e3}; // ms: read word, per-speaker clue, discuss, vote
const TN=['Chili','Mango','Basil','Lime'];
const rnd=n=>Math.floor(Math.random()*n),uid=()=>Math.random().toString(36).slice(2,9);
const shuf=a=>{a=a.slice();for(let i=a.length;i>1;){const j=rnd(i--);[a[i],a[j]]=[a[j],a[i]]}return a};
const pls=(r,f)=>Object.values(r.players).filter(f||(()=>1));
const tx=(w,o)=>w&&w.readyState===1&&w.send(JSON.stringify(o));
const bc=r=>{tx(r.host,view(r,r.host));pls(r).forEach(p=>tx(p.ws,view(r,p.ws)))};

function mk(){let c;do{c=Array.from({length:4},()=>'ABCDEFGHJKMNPQRSTUVWXYZ'[rnd(23)]).join('')}while(rooms[c]);
  return rooms[c]={code:c,key:uid(),host:null,players:{},words:[],cfg:{turns:2},phase:'lobby',n:0,created:Date.now(),
    teams:[0,1,2,3].map(()=>({score:0,hist:[],turns:0}))}}

function view(r,ws){
  const pl=ws&&ws.pid&&r.players[ws.pid],tu=r.turn,inGame=r.phase!=='lobby';
  const o={t:'s',code:r.code,phase:r.phase,cfg:r.cfg,wc:r.words.length,
    teams:r.teams.map((t,i)=>({n:TN[i],s:t.score,p:pls(r,p=>p.team===i).map(p=>({name:p.name,on:!!p.ws}))})),
    rem:r.endsAt?Math.max(0,r.endsAt-Date.now()):0,total:r.dur||0};
  if(pl)o.me={id:pl.id,team:pl.team,name:pl.name};
  if(inGame&&tu){const n=tu.order.length,nm=id=>r.players[id].name;
    o.turn={n:r.n,team:tu.team,order:tu.order.map(id=>({id,name:nm(id)})),sp:r.phase==='clue'?tu.order[tu.ci%n]:null,
      rd:Math.floor(tu.ci/n)+1,sudden:tu.sudden,revote:tu.revote,cand:tu.cand,voted:Object.keys(tu.votes).length};
    if(pl&&pl.team===tu.team&&['see','clue','disc','vote'].includes(r.phase)){
      o.inTeam=true;o.word=pl.id===tu.imp?tu.pair.b:tu.pair.a;o.voted=!!tu.votes[pl.id]}
    if(ws===r.host&&r.peek&&r.phase!=='reveal')o.peek={imp:nm(tu.imp),a:tu.pair.a,b:tu.pair.b};
    if(r.phase==='reveal')o.turn.res=tu.res}
  return o}

function tm(r,ms){clearTimeout(r.t);r.endsAt=Date.now()+ms;r.dur=ms;r.t=setTimeout(()=>adv(r),ms)}

function begin(r){ // start next turn from queue
  const ti=r.q.shift(),T=r.teams[ti];
  const ids=pls(r,p=>p.team===ti).map(p=>p.id),k=T.turns++%ids.length;
  const order=ids.slice(k).concat(ids.slice(0,k)); // speaking order rotates every turn
  let pool=ids.filter(i=>!T.hist.includes(i));if(!pool.length){T.hist=[];pool=ids}
  const imp=pool[rnd(pool.length)];T.hist.push(imp); // everyone is impostor once before repeats
  const pair=r.deck[r.wi++%r.deck.length];r.n++;
  r.turn={team:ti,order,imp,pair,ci:0,votes:{},sudden:r.sudden};r.phase='see';tm(r,D.see)}

function next(r){
  if(!r.q.length){const m=Math.max(...r.active.map(i=>r.teams[i].score)),tied=r.active.filter(i=>r.teams[i].score===m);
    if(tied.length>1){r.q=tied.slice();r.sudden=true}else{r.phase='end';r.endsAt=0;return bc(r)}}
  begin(r);bc(r)}

function tally(r){
  const tu=r.turn,c={};Object.values(tu.votes).forEach(v=>c[v]=(c[v]||0)+1);
  const m=Math.max(0,...Object.values(c)),top=Object.keys(c).filter(k=>c[k]===m);
  if((m===0||top.length>1)&&!tu.revote){tu.revote=true;tu.cand=top.length>1?top:tu.order.slice();tu.votes={};r.phase='vote';return tm(r,D.vote)}
  const ok=top.length===1&&top[0]===tu.imp;if(ok)r.teams[tu.team].score++;
  clearTimeout(r.t);r.endsAt=0;r.phase='reveal';
  tu.res={ok,imp:r.players[tu.imp].name,a:tu.pair.a,b:tu.pair.b,da:tu.pair.da,db:tu.pair.db,
    tally:Object.entries(c).map(([k,v])=>[r.players[k].name,v])}}

function adv(r){
  const tu=r.turn,p=r.phase;if(!tu)return;clearTimeout(r.t);
  if(p==='see'){r.phase='clue';tu.ci=0;tm(r,D.clue)}
  else if(p==='clue'){if(++tu.ci<2*tu.order.length)tm(r,D.clue);else{r.phase='disc';tm(r,D.disc)}}
  else if(p==='disc'){r.phase='vote';tm(r,D.vote)}
  else if(p==='vote')tally(r);
  bc(r)}

function reset(r){clearTimeout(r.t);r.phase='lobby';r.turn=null;r.endsAt=0;r.n=0;r.sudden=false;r.peek=false;
  r.teams.forEach(t=>{t.score=0;t.hist=[];t.turns=0})}

function parse(text){return String(text||'').split('\n').map(l=>l.split('|').map(s=>s.trim())).filter(a=>a[0]&&a[1])
  .map(a=>({a:a[0],b:a[1],da:a[2]||'',db:a[3]||''})).slice(0,60)}

wss.on('connection',ws=>{
  const err=m=>tx(ws,{t:'err',m});
  ws.on('message',raw=>{let m;try{m=JSON.parse(raw)}catch{return}
    let r=ws.room;
    if(m.t==='host'){r=(m.code&&rooms[m.code]&&rooms[m.code].key===m.key)?rooms[m.code]:mk();
      r.host=ws;ws.room=r;ws.isHost=true;tx(ws,{t:'hosted',code:r.code,key:r.key});return bc(r)}
    if(m.t==='join'){r=rooms[String(m.code||'').toUpperCase()];if(!r)return err('Room not found');
      let p=pls(r).find(p=>p.token===m.token&&m.token);
      if(!p){if(r.phase!=='lobby')return err('Game already started');
        const name=String(m.name||'').trim().slice(0,14);if(!name)return err('Enter your name');
        const cnt=[0,1,2,3].map(i=>pls(r,p=>p.team===i).length),ti=cnt.indexOf(Math.min(...cnt));
        if(cnt[ti]>=5)return err('Room is full');
        const id=uid();p=r.players[id]={id,token:m.token,name,team:ti}}
      p.ws=ws;ws.pid=p.id;ws.room=r;return bc(r)}
    if(!r)return;
    if(ws.isHost){
      if(m.t==='words'){r.words=parse(m.text)}
      else if(m.t==='cfg'){r.cfg.turns=Math.min(4,Math.max(1,+m.turns||2))}
      else if(m.t==='start'&&r.phase==='lobby'){
        const active=[0,1,2,3].filter(i=>pls(r,p=>p.team===i).length>=3);
        if(!r.words.length)return err('Add vocabulary pairs first');
        if(!active.length)return err('Each playing team needs at least 3 students');
        r.active=active;r.q=[];for(let k=0;k<r.cfg.turns;k++)active.forEach(i=>r.q.push(i));
        r.deck=shuf(r.words);r.wi=0;r.sudden=false;r.teams.forEach(t=>{t.score=0;t.hist=[];t.turns=0});begin(r)}
      else if(m.t==='skip'&&['see','clue','disc','vote'].includes(r.phase))return adv(r);
      else if(m.t==='next'&&r.phase==='reveal')return next(r);
      else if(m.t==='peek')r.peek=!r.peek;
      else if(m.t==='end'){clearTimeout(r.t);r.phase='end';r.endsAt=0}
      else if(m.t==='restart')reset(r);
      return bc(r)}
    const p=r.players[ws.pid],tu=r.turn;if(!p)return;
    if(m.t==='team'&&r.phase==='lobby'){const i=+m.i;if(i>=0&&i<4&&pls(r,q=>q.team===i).length<5){p.team=i;bc(r)}}
    else if(m.t==='done'&&r.phase==='clue'&&tu.order[tu.ci%tu.order.length]===p.id)adv(r);
    else if(m.t==='vote'&&r.phase==='vote'&&p.team===tu.team&&!tu.votes[p.id]){
      if(m.to===p.id||!(tu.cand||tu.order).includes(m.to))return;
      tu.votes[p.id]=m.to;Object.keys(tu.votes).length>=tu.order.length?adv(r):bc(r)}
  });
  ws.on('close',()=>{const r=ws.room;if(!r)return;if(ws.isHost&&r.host===ws)r.host=null;
    const p=ws.pid&&r.players[ws.pid];if(p&&p.ws===ws)p.ws=null;bc(r)});
});
setInterval(()=>{for(const c in rooms)if(Date.now()-rooms[c].created>8*36e5)delete rooms[c]},6e5);
srv.listen(process.env.PORT||3000,()=>console.log('Vocab Impostor running on port '+(process.env.PORT||3000)));
