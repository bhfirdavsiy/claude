import {loadJson,qs} from './common.js';
Promise.all([loadJson('data/curriculum.json'),loadJson('data/practices.json'),loadJson('data/elements.json'),loadJson('data/summary.json')]).then(([t,p,e,s])=>{
  qs('#statTheory').textContent=t.length;qs('#statPractice').textContent=p.length;qs('#statElements').textContent=e.length;qs('#statTypes').textContent=s.practiceTypes.length;
  const grades=qs('#gradeCoverage');
  grades.innerHTML=s.gradeCoverage.map(g=>`<div class="col-lg col-sm-6 mt-30"><div class="kl-stat"><div class="icon"><i class="bi bi-bar-chart"></i></div><strong>${Math.round(g.coverage*100)}%</strong><span>${g.grade}: ${g.available} mavjud, ${g.partial} qisman, ${g.newNeeded} yangi kerak</span></div></div>`).join('');
}).catch(console.error);
