// A fake Firebase whose database lives in Node, shared by every page: saves are truly atomic,
// transactions retry on conflict, and every listener (including the writer's) gets live updates,
// like the real Firestore. Each page signs in as its own user (window.__uid).
const browserSide=`(()=>{const C=x=>x==null?x:JSON.parse(JSON.stringify(x));
const mk=r=>({exists:!!(r&&r.exists),data:()=>r&&r.exists?C(r.data):undefined,metadata:{hasPendingWrites:false}});
const FV={arrayUnion:(...a)=>({__au:a}),arrayRemove:(...a)=>({__ar:a}),serverTimestamp:()=>({__ts:1}),increment:n=>({__inc:n})};
const L={};window.__fsNotify=(p,r)=>{(L[p]||[]).forEach(fn=>{try{fn(mk(r))}catch(e){}})};
const ref=p=>({__p:p,get:async()=>mk(await window.__fs('get',p)),set:async(v,o)=>{await window.__fs('set',p,C(v),!!(o&&o.merge))},
 update:async v=>{const ok=await window.__fs('update',p,C(v));if(!ok)throw new Error('not-found')},delete:async()=>{await window.__fs('delete',p)},
 onSnapshot:(fn,err)=>{(L[p]=L[p]||[]).push(fn);window.__fs('get',p).then(r=>fn(mk(r)));return ()=>{L[p]=L[p].filter(x=>x!==fn)}}});
let n=0;const fs={doc:ref,
 collection:c=>({doc:()=>({id:'cid'+(Date.now()%100000)+(n++)}),get:async()=>{const L2=await window.__fs('list',c);return {docs:L2.map(([k,d])=>({id:k.split('/').pop(),ref:ref(k),data:()=>C(d)}))}}}),
 batch:()=>{const ops=[];return {set:(r,v,o)=>ops.push([r.__p,C(v),!!(o&&o.merge)]),delete:r=>ops.push([r.__p,null,false]),commit:async()=>{await window.__fs('batch',ops)}}},
 runTransaction:async fn=>{for(let i=0;i<30;i++){const reads={},writes=[];const t={get:async r=>{const x=await window.__fs('get',r.__p);reads[r.__p]=x.ver;return mk(x)},set:(r,v)=>{writes.push([r.__p,C(v)])}};
  const res=await fn(t);if(await window.__fs('commit',reads,writes))return res;await new Promise(x=>setTimeout(x,10+Math.random()*60))}throw new Error('aborted')}};
const UK='fakeuser_'+(window.__uid||'u1');const AU=()=>JSON.parse(localStorage.getItem(UK)||'null');
const auth={currentUser:AU(),onAuthStateChanged:fn=>{setTimeout(()=>fn(AU()),10);window.__authfn=fn},
 signInWithPopup:async()=>{const u={uid:window.__uid||'u1',email:(window.__uid||'u1')+'@x.com',delete:async()=>{localStorage.removeItem(UK)},getIdToken:async()=>'t'};localStorage.setItem(UK,JSON.stringify(u));window.__authfn&&window.__authfn(u)},
 isSignInWithEmailLink:()=>false,signOut:async()=>localStorage.removeItem(UK)};
window.firebase={initializeApp:()=>{},auth:Object.assign(()=>auth,{GoogleAuthProvider:function(){}}),firestore:Object.assign(()=>fs,{FieldValue:FV})};})()`;
function apply(old,v){const o=Object.assign({},old||{});for(const k in v){const x=v[k];if(x&&x.__au)o[k]=[...new Set([...(o[k]||[]),...x.__au])];else if(x&&x.__ar)o[k]=(o[k]||[]).filter(y=>!x.__ar.includes(y));else if(x&&x.__ts)o[k]=Date.now();else if(x&&x.__inc!==undefined)o[k]=(o[k]||0)+x.__inc;else o[k]=x}return o}
async function install(ctx){const db=new Map();const pages=new Set();let ver=0;
 const notify=p=>{const d=db.get(p);const r=d?{exists:true,data:d.data,ver:d.ver}:{exists:false,ver:0};for(const pg of pages){setTimeout(()=>pg.evaluate(([p,r])=>window.__fsNotify&&window.__fsNotify(p,r),[p,r]).catch(()=>{}),Math.random()*300)}};
 const put=(p,data)=>{if(data===null)db.delete(p);else db.set(p,{data,ver:++ver});notify(p)};
 await ctx.exposeBinding('__fs',(src,op,a,b,c)=>{pages.add(src.page);
  if(op==='get'){const d=db.get(a);return d?{exists:true,data:d.data,ver:d.ver}:{exists:false,ver:0}}
  if(op==='set'){put(a,c?apply(db.get(a)&&db.get(a).data,b):apply({},b));return true}
  if(op==='update'){if(!db.has(a))return false;put(a,apply(db.get(a).data,b));return true}
  if(op==='delete'){put(a,null);return true}
  if(op==='list'){return [...db.entries()].filter(([k])=>k.startsWith(a+'/')&&k.split('/').length===a.split('/').length+1).map(([k,d])=>[k,d.data])}
  if(op==='batch'){for(const [p,v,m] of a)put(p,v===null?null:(m?apply(db.get(p)&&db.get(p).data,v):apply({},v)));return true}
  if(op==='commit'){for(const p in a){const d=db.get(p);if((d?d.ver:0)!==a[p])return false}for(const [p,v] of b)put(p,apply({},v));return true}});
 await ctx.route(/gstatic\.com\/firebasejs/,r=>r.fulfill({status:200,contentType:'text/javascript',body:r.request().url().includes('app-compat')?browserSide:''}));
 return db}
module.exports={install};
