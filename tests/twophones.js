// Two phones (two different people) open at once, both editing and receiving each other's changes live,
// against a fake server that behaves like the real one (tests/fakeserver.js).
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');
const {install}=require('./fakeserver');
const fixture=fs.readFileSync(path.join(__dirname,'fixture.json'),'utf8');
const APP='file://'+path.resolve(__dirname,'..','index.html');
let fails=0;const ok=(n,c,x)=>{console.log((c?'PASS ':'FAIL ')+n+(x&&!c?'  → '+x:''));if(!c)fails++};
const phone=(tag,uid)=>`window.__uid='${uid}';(()=>{const P='${tag}:';const g=Storage.prototype.getItem,s=Storage.prototype.setItem,r=Storage.prototype.removeItem;const m=k=>String(k).startsWith('mn_')?P+k:k;
 Storage.prototype.getItem=function(k){return g.call(this,m(k))};Storage.prototype.setItem=function(k,v){return s.call(this,m(k),v)};Storage.prototype.removeItem=function(k){return r.call(this,m(k))};})()`;
(async()=>{const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844}});await install(ctx);await ctx.route(/fonts\./,r=>r.abort());
 const errs=[];const open=async(tag,uid)=>{const pg=await ctx.newPage();pg.on('pageerror',e=>errs.push(tag+' '+e.message));await pg.addInitScript(phone(tag,uid));await pg.goto(APP);await pg.waitForTimeout(700);
  await pg.selectOption('#sbyear','1983');await pg.check('#sage');await pg.click('#sgoogle');await pg.waitForTimeout(700);return pg};
 const A=await open('A','u1');await A.click('#pnew');await A.waitForTimeout(600);const code=await A.evaluate(()=>FB_CODE);await A.click('#pcont');await A.waitForTimeout(500);
 await A.fill('#gp1','abcdefgh');await A.fill('#gp2','abcdefgh');await A.click('#ggo');await A.waitForTimeout(3000);
 await A.evaluate(fx=>{const d=JSON.parse(fx);S=Object.assign(blank(),d);S.roles={his:UID};localStorage.setItem('mn_me','his');norm();applyDeck();save()},fixture);await A.waitForTimeout(2500);
 const B=await open('B','u2');await B.fill('#pcode',code);await B.click('#pjoin');await B.waitForTimeout(1200);await B.fill('#gp1','abcdefgh');await B.click('#ggo');await B.waitForTimeout(3500);
 await B.evaluate(()=>{localStorage.setItem('mn_me','her');S.roles=Object.assign({},S.roles,{her:UID});save()});await B.waitForTimeout(2500);
 ok('both phones in the same space, as him and her',await A.evaluate(()=>me())==='his'&&await B.evaluate(()=>me()==='her'&&sharedOn&&S.notes.length>0));
 // both edit at once, several rounds, while changes cross in both directions
 for(let r=0;r<5;r++){
  await Promise.all([
   A.evaluate(r=>{S.notes.unshift({id:Date.now()+r,from:'his',to:'her',text:'A note '+r,date:new Date().toISOString()});prof('his').acc['r'+r]='A accel '+r;save()},r),
   B.evaluate(r=>{(S.wish=S.wish||[]).unshift({id:Date.now()+500+r,from:'her',name:'B wish '+r});(S.dates=S.dates||[]).unshift({id:Date.now()+900+r,k:'ily',md:'04-0'+(r+1),t:'B date '+r});prof('her').brk['r'+r]='B brake '+r;(S.mems=S.mems||[]).unshift({id:Date.now()+700+r,from:'her',title:'B memory '+r,what:'x',sides:{}});save()},r)]);
  await Promise.all([A.waitForTimeout(100+r*170),B.waitForTimeout(260)]);
 }
 // she types on screen while he keeps saving
 await B.evaluate(()=>{tabNow='rom';romSub='prof';profWho='her';render()});await B.waitForTimeout(300);
 const fid=await B.evaluate(()=>{const e=document.querySelector('textarea[id^="acc_her_"]');return e&&e.id});
 if(fid){const typing=B.locator('#'+fid).type('B typed on screen',{delay:40});for(let i=0;i<4;i++){await A.evaluate(i=>{S.notes.unshift({id:Date.now()+50+i,from:'his',to:'her',text:'A during typing '+i,date:new Date().toISOString()});save()},i);await A.waitForTimeout(250)}await typing}
 await A.waitForTimeout(6000);
 const want=['A note 0','A note 4','A accel 0','A accel 4','B wish 0','B wish 4','B date 0','B date 4','B brake 0','B brake 4','B memory 0','B memory 4','A during typing 0','A during typing 3','B typed on screen'];
 const check=async(pg,label)=>{const t=await pg.evaluate(()=>JSON.stringify(S));const miss=want.filter(w=>!t.includes(w));ok(label,!miss.length,miss.join(', '))};
 await check(A,'his phone has every edit from both phones');await check(B,'her phone has every edit from both phones');
 await A.reload();await B.reload();await A.waitForTimeout(4500);
 await check(A,'his phone after reopening');await check(B,'her phone after reopening');
 if(process.env.DBG)for(const [n,pg] of [['A',A],['B',B]])console.log(n,'LOG',await pg.evaluate(()=>localStorage.getItem('mn_dlog')));
 ok('no script errors',!errs.length,errs.slice(0,3).join(' | '));
 await b.close();console.log(fails?`\n${fails} FAILED`:'\nTwo-phone tests passed');process.exit(fails?1:0)})().catch(e=>{console.error(e);process.exit(1)});
