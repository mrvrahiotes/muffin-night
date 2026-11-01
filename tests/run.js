// Muffin Night data-safety tests. Run before every release: `node tests/run.js`
// Uses a fake Firebase (tests/fakefb.js) and made-up sample data (tests/fixture.json).
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const fake=fs.readFileSync(path.join(__dirname,'fakefb.js'),'utf8');
const fixture=fs.readFileSync(path.join(__dirname,'fixture.json'),'utf8');
const APP='file://'+path.resolve(__dirname,'..','index.html');
let fails=0;const ok=(name,cond,extra)=>{console.log((cond?'PASS ':'FAIL ')+name+(extra&&!cond?'  → '+extra:''));if(!cond)fails++};
// differences that matter: something present before is missing or changed after (added empty containers are fine)
const emptyish=v=>v===undefined||v===null||v===''||(Array.isArray(v)&&!v.length)||(v&&typeof v==='object'&&!Object.keys(v).length);
function lost(a,b,p='',out=[]){if(JSON.stringify(a)===JSON.stringify(b))return out;
 if(Array.isArray(a)&&a.length&&a.every(x=>x&&x.id!=null)){const ids=new Set((Array.isArray(b)?b:[]).map(x=>x&&x.id));a.forEach(x=>{if(!ids.has(x.id))out.push(p+'#'+x.id)});return out}
 if(a&&b&&typeof a==='object'&&typeof b==='object'&&!Array.isArray(a)&&!Array.isArray(b)){Object.keys(a).forEach(k=>lost(a[k],b[k],p+'.'+k,out));return out}
 if(emptyish(a))return out;out.push(p);return out}
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});
 await ctx.route(/gstatic\.com\/firebasejs/,r=>r.fulfill({status:200,contentType:'text/javascript',body:r.request().url().includes('app-compat')?fake:''}));
 await ctx.route(/fonts\./,r=>r.abort());
 const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));
 const wait=ms=>p.waitForTimeout(ms);
 await p.goto(APP);await p.evaluate(()=>localStorage.clear());await p.reload();await wait(600);
 await p.selectOption('#sbyear','1983');await p.check('#sage');await p.click('#sgoogle');await wait(600);await p.click('#pnew');await wait(500);await p.click('#pcont');await wait(500);
 await p.fill('#gp1','abcdefgh');await p.fill('#gp2','abcdefgh');await p.click('#ggo');await wait(3000);
 ok('app opens and signs in',await p.evaluate(()=>typeof sharedOn!=='undefined'&&sharedOn===true));
 await p.evaluate(fx=>{S=Object.assign(blank(),JSON.parse(fx));S.roles={his:UID};localStorage.setItem('mn_me','his');norm();applyDeck();save()},fixture);await wait(2500);
 const snap=()=>p.evaluate(()=>{const c=JSON.parse(JSON.stringify(S));delete c.seenTabs;delete c.journey;delete c.rev;delete c.s2h;return c});
 const base=await snap();
 // typed after load: survey topic, daily question, note
 await p.evaluate(()=>{svWho='his';svTheme(THEMES[0].id,'yes');svWho=null;const x=dqToday();x.his={a:'Sample daily answer',ts:Date.now()};S.notes.unshift({id:Date.now(),from:'his',to:'her',text:'Sample new note',date:new Date().toISOString()});save()});await wait(2000);
 const base2=await snap();
 for(let i=1;i<=3;i++){await p.reload();await wait(3500);const L=lost(base2,await snap());ok('reload '+i+': nothing lost',!L.length,L.slice(0,5).join(', '))}
 // a phone on the old version: data in state2, blank legacy copy on the phone
 await p.evaluate(()=>{const st=JSON.parse(localStorage.getItem('fakefs'));const k3=Object.keys(st).find(k=>k.endsWith('/data/state3'));st[k3.replace('state3','state2')]=st[k3];delete st[k3];localStorage.setItem('fakefs',JSON.stringify(st));localStorage.removeItem('mn_state3');localStorage.removeItem('mn_last3');localStorage.setItem('mn_state',JSON.stringify(blank()))});
 await p.reload();await wait(3500);{const L=lost(base2,await snap());ok('update from old version with a blank phone copy: nothing lost',!L.length,L.slice(0,5).join(', '))}
 ok('new save location written after update',await p.evaluate(()=>Object.keys(JSON.parse(localStorage.getItem('fakefs'))).some(k=>k.endsWith('/data/state3'))));
 // something typed on the old version is kept after updating
 await p.evaluate(()=>{const st=JSON.parse(localStorage.getItem('fakefs'));const k3=Object.keys(st).find(k=>k.endsWith('/data/state3'));st[k3.replace('state3','state2')]=st[k3];delete st[k3];localStorage.setItem('fakefs',JSON.stringify(st));const L=JSON.parse(localStorage.getItem('mn_state3'));L.notes=[{id:999,from:'his',to:'her',text:'typed on old version',date:new Date().toISOString()}].concat(L.notes||[]);localStorage.setItem('mn_state',JSON.stringify(L));localStorage.removeItem('mn_state3');localStorage.removeItem('mn_last3')});
 await p.reload();await wait(3500);ok('note typed on old version kept',await p.evaluate(()=>JSON.stringify(S.notes).includes('typed on old version')));
 // an old version still open somewhere keeps saving to the old location: 5.3+ picks it up
 await p.evaluate(()=>{const st=JSON.parse(localStorage.getItem('fakefs'));const k3=Object.keys(st).find(k=>k.endsWith('/data/state3'));st[k3.replace('state3','state2')]=st[k3];localStorage.setItem('fakefs',JSON.stringify(st))});
 await p.evaluate(async()=>{const r=DB.doc('couple/state2');const d=(await r.get()).data();d.prof=d.prof||{};d.prof.his=d.prof.his||{acc:{},brk:{}};d.prof.his.acc=Object.assign({},d.prof.his.acc,{oldver:'Typed on an old copy'});d.wish=[{id:777,from:'his',name:'Old copy wish'}].concat(d.wish||[]);await r.set(d)});
 await p.reload();await wait(3500);
 ok('entries saved by an old copy still open are picked up',await p.evaluate(()=>JSON.stringify(S.prof).includes('Typed on an old copy')&&JSON.stringify(S.wish).includes('Old copy wish')));
 // typing in profile fields saves without tapping Save
 await p.evaluate(()=>{tabNow='rom';romSub='prof';profWho='his';render()});await wait(300);
 const fid=await p.evaluate(()=>{const e=document.querySelector('textarea[id^="brk_his_"]');return e&&e.id});
 if(fid){await p.locator('#'+fid).fill('');await p.locator('#'+fid).type('Sample typed brake',{delay:10});await wait(1500);await p.reload();await wait(3500);}
 ok('typing in a profile field saves on its own',!!fid&&await p.evaluate(()=>JSON.stringify(S.prof).includes('Sample typed brake')),fid||'no field');
 // a stale phone copy that is much emptier must not delete server data
 const base3=await snap();
 await p.evaluate(()=>{const L=blank();localStorage.setItem('mn_state3',JSON.stringify(L))});await p.reload();await wait(3500);
 {const L=lost(base3,await snap());ok('emptier phone copy does not delete anything',!L.length,L.slice(0,5).join(', '))}
 // survey guard: a sync carrying an emptied survey keeps the full one
 ok('emptied survey cannot overwrite a full one',await p.evaluate(()=>{const srv=JSON.parse(JSON.stringify(S));const cur=JSON.parse(JSON.stringify(S));cur.survey.her=bSv();const m=guardSv(applyDiff(JSON.parse(JSON.stringify(srv)),srv,cur),srv);return svCount(m.survey.her)>=svCount(srv.survey.her)*0.9}));
 // private dream comes back on a new phone
 await p.evaluate(()=>savePrivate([{id:5,from:'his',date:new Date().toISOString(),text:'Sample private dream',tags:[],priv:true}]));await wait(800);
 await p.evaluate(()=>localStorage.removeItem('mn_pdreams'));await p.reload();await wait(4000);
 ok('private dream restored on a new phone',await p.evaluate(()=>JSON.stringify(myPrivate()).includes('Sample private dream')));
 // daily backup restores what went missing
 await wait(1500);
 const rb=await p.evaluate(async()=>{await dayBackup();const n=S.notes.length,w=(S.wish||[]).length,d=(S.dates||[]).length;S.notes=[];S.wish=[];S.dates=[];save();await new Promise(r=>setTimeout(r,1200));await restoreMissing();return [n,S.notes.length,w,(S.wish||[]).length,d,(S.dates||[]).length]});
 ok('daily backup brings back notes, wish list and dates',rb[1]===rb[0]&&rb[3]===rb[2]&&rb[5]===rb[4],JSON.stringify(rb));
 // both phones edit at the same moment from the same starting point: nobody's edit is lost
 const two=await p.evaluate(()=>{const c=x=>JSON.parse(JSON.stringify(x));const srv0=c(S);
  const A=c(srv0),B=c(srv0);
  A.notes.unshift({id:111,from:'his',to:'her',text:'Phone A note',date:new Date().toISOString()});A.wish=A.wish||[];A.wish.unshift({id:112,from:'his',name:'Phone A wish'});A.survey.his.t[THEMES[1].id]='yes';
  B.notes.unshift({id:221,from:'her',to:'his',text:'Phone B note',date:new Date().toISOString()});B.dates=B.dates||[];B.dates.unshift({id:222,k:'ily',md:'03-04',t:'Phone B date'});B.survey.her.t[THEMES[2].id]='try';B.dq=B.dq||{};B.dq['2099-1-1']={her:{a:'Phone B daily'}};
  const afterA=guardSv(fillEA(applyDiff(c(srv0),srv0,A),A),srv0);           // A saves first
  const afterB=guardSv(fillEA(applyDiff(c(afterA),srv0,B),B),afterA);       // B saves, not having seen A yet
  const onA=guardSv(fillEA(applyDiff(c(afterB),afterA,A),A),afterB);        // A's phone receives B's save
  const t=JSON.stringify(afterB),u=JSON.stringify(onA);
  return ['Phone A note','Phone A wish','Phone B note','Phone B date','Phone B daily'].filter(x=>!t.includes(x)||!u.includes(x)).concat(afterB.survey.his.t[THEMES[1].id]!=='yes'?['A survey']:[],afterB.survey.her.t[THEMES[2].id]!=='try'?['B survey']:[])});
 ok('both phones editing at once: every edit kept',!two.length,two.join(', '));
 // odd or damaged data can't freeze the app
 const hang=await Promise.race([p.evaluate(()=>{const old=JSON.parse(JSON.stringify(S));S.dates=[{id:1,rule:'rule:x'},{id:2,md:'garbage'},{id:3}];try{tabNow='home';render()}catch(e){}S=old;render();return 'ok'}),new Promise(r=>setTimeout(()=>r('frozen'),8000))]);
 ok('damaged dates do not freeze the app',hang==='ok');
 // the server copy loses several entries at once: this phone puts them back, and a single delete still works
 const g=await p.evaluate(async()=>{const r=docRef;const d=(await r.get()).data();const n0=S.notes.length;d.notes=d.notes.slice(5);d.prof={};await r.set(d);
  await new Promise(x=>setTimeout(x,300));return n0});
 await p.reload();await wait(3500);
 ok('server losing several notes and a profile: phone restores them',await p.evaluate(n0=>S.notes.length>=n0&&leafN(S.prof)>0,g));
 const one=await p.evaluate(async()=>{const n=S.notes.length;S.notes=S.notes.slice(1);save();await new Promise(x=>setTimeout(x,1500));return [n,S.notes.length]});
 await p.reload();await wait(3500);
 ok('deleting one note still works',await p.evaluate(one=>S.notes.length===one[0]-1,one));
 // every main screen draws without an error
 const bad=await p.evaluate(()=>{const out=[];TABS.forEach(([t])=>{try{tabNow=t;render()}catch(e){out.push(t+': '+e.message)}});tabNow='home';render();return out});
 ok('every screen draws',!bad.length,bad.join('; '));
 ok('no script errors',!errs.length,errs.slice(0,3).join(' | '));
 await b.close();console.log(fails?`\n${fails} FAILED`:'\nAll data-safety tests passed');process.exit(fails?1:0)})().catch(e=>{console.error(e);process.exit(1)});
