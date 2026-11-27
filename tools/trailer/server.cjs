// Demo server for the trailer: serves the real built client + a scripted demo room.
const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'../../dist/client');
const stage=path.join(__dirname,'stage.html');
const P=[['Pineapple on pizza?','🍍 Belongs there','🚫 Crime'],['Cereal first or milk first?','🥣 Cereal first','🥛 Milk first'],['Is a hot dog a sandwich?','🌭 Yes','🙅 No'],['Socks in bed?','🧦 Always','🦶 Never'],['Dark mode or light mode?','🌚 Dark','🌞 Light']];
const crowd=[71,83,26,38,88];
let S;
function reset(){S={day:7,answers:[null,null,null,null,null],summary:null,next:false,stats:{streak:4,bestStreak:6,played:6,totalScore:2650}};}
reset();
const prompts=()=>P.map(([q,a,b],i)=>({id:'c'+i,q,a,b,...(i===1?{author:'breakfast_lawyer',source:'community'}:{}),...(i===2?{source:'mod'}:{})}));
const verdict={day:7,players:24,divisive:3,lopsided:4,top:[{username:'mindmeld',score:552},{username:'u_read_me',score:531},{username:'vibe_oracle',score:509}],prompts:P.map(([q,a,b],i)=>({q,a,b,pctA:[70,82,27,46,88][i],total:24}))};
const json=(res,b)=>{const s=JSON.stringify(b);res.writeHead(200,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(s)});res.end(s);};
http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',()=>{
 const u=req.url.split('?')[0];
 if(u==='/mock/reset'){reset();return json(res,{});}
 if(u==='/mock/nextday'){S={day:8,answers:[null,null,null,null,null],summary:null,next:true,stats:{streak:5,bestStreak:6,played:7,totalScore:3170}};return json(res,{});}
 if(u==='/api/state')return json(res,{day:S.day,isToday:true,subreddit:'YourSubreddit',username:'you',snoovatar:null,prompts:prompts(),answers:S.answers,summary:S.summary,stats:S.stats,playersToday:S.next?9:23,closed:null,
   yesterday:S.next?{verdict,me:{score:534,rank:2,title:'Room Reader',titleEmoji:'🧠',delta:2}}:null});
 if(u==='/api/answer'){const {index,pick,guess}=JSON.parse(body);const act=crowd[index];const pts=Math.max(0,Math.round(100-2*Math.abs(guess-act)))*(index===4?2:1);
   S.answers[index]={pick,guess,actualPctA:act,scoredPctA:act,total:24,points:pts};
   if(S.answers.every(Boolean)){const sc=S.answers.reduce((s,a)=>s+a.points,0);S.stats.streak=5;
     S.summary={score:sc,title:sc>=540?'Mind Reader':'Room Reader',titleEmoji:sc>=540?'🔮':'🧠',grid:S.answers.map((a,i)=>{const p=a.points/(i===4?2:1);return p>=94?'🎯':p>=75?'🟩':p>=45?'🟨':'🟥'}).join(''),rank:2,players:24,contrarianCount:1,final:false,provisionalScore:sc};}
   return json(res,{reveal:S.answers[index],summary:S.summary,stats:S.stats});}
 if(u==='/api/leaderboard')return json(res,{day:[['mindmeld',552],['you',0],['vibe_oracle',509],['crowdwhisperer',488],['nope_nancy',471]].map(([n,s],i)=>({rank:i+1,username:n,score:n==='you'&&S.summary?S.summary.score:s})),allTime:[],contrarians:[{rank:1,username:'hot_take_hal',score:19},{rank:2,username:'nope_nancy',score:14},{rank:3,username:'you',score:9},{rank:4,username:'mindmeld',score:4}],me:{dayRank:2,allTimeRank:3,contraRank:3}});
 if(u==='/api/suggestions')return json(res,{items:[{id:'x1',q:'Is cereal a soup?',a:'🥣 Soup',b:'🙅 Not soup',author:'breakfast_lawyer',votes:11}],remainingToday:3});
 if(u.startsWith('/api/'))return json(res,{ok:true,message:'Done!'});
 const f=u==='/stage.html'?stage:path.join(root,u==='/'?'game.html':u); if(!fs.existsSync(f)){res.writeHead(404);return res.end();}
 const t={'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'}[path.extname(f)]||'application/octet-stream';
 res.writeHead(200,{'Content-Type':t});fs.createReadStream(f).pipe(res);
});}).listen(5190,()=>console.log('trailer server up'));
