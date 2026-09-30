// Pilot acceptance (P1.3) — the ONE canonical status of a pilot LearningUnit. It is pure: it combines
// machine checks (computed by `npm run pilot:status`) with human decisions (content approvals, assessment
// reviews, the pilot sign-off register). It never produces approval by itself.
//
//   technical (machine only):  TECHNICAL_PASS | TECHNICAL_FAIL
//   status:
//     PILOT_BLOCKED           — at least one check FAILs (machine inconsistency, stale approval, …)
//     CONTENT_REVIEW_PENDING  — no failure, but at least one HUMAN check is pending (review not done yet)
//     SIGNOFF_PENDING         — every mandatory check passes, the pilot owner has not signed off this basis
//     PILOT_READY             — every mandatory check passes AND a person signed off the CURRENT basis
//
// Machine checks alone can never produce PILOT_READY (ADR-P1-004 §2): the last step is a human sign-off
// pinned to a hash of the evaluated checks, so any later change voids it.

                                                                  
                                                                             
                                        
                                                              
                                                                                                 
/** Result of the pilot gate: PENDING (human work outstanding) is not a CI failure; FAIL is. */
                                              

                             
            
                           
                 
                       
                
 

export const PILOT_DIMENSIONS                          =['technical','content','assessment','mastery','ux'];

                                     
                        
                    
                     
                                   
                  
                                                                                 
                   
                  
 

                                                                       

/** Machine checks never report PENDING (a machine either verifies or fails); only human checks wait. */
export function assertCheckShape(check           )     {
  if(check.kind==='machine'&&check.verdict==='PENDING') throw new Error(`PILOT_MACHINE_CHECK_PENDING:${check.id}`);
}

export function dimensionVerdict(checks                      ,dimension               )             {
  const mine=checks.filter(c=>c.dimension===dimension).map(c=>c.verdict);
  if(mine.includes('FAIL')) return 'FAIL';
  if(mine.includes('PENDING')) return 'PENDING';
  if(mine.includes('PASS')) return 'PASS';
  return 'NOT_APPLICABLE';
}

/** Deterministic, order-independent basis a sign-off is pinned to. The caller hashes it. */
export function pilotBasis(learningUnitId       ,checks                      )       {
  const rows=[...checks].sort((a,b)=>a.id.localeCompare(b.id)).map(c=>`${c.id}=${c.verdict}`);
  return `${learningUnitId}\n${rows.join('\n')}`;
}

                                  
                            
                     
                                                 
                       
                    
                        
 

export function derivePilotStatus(checks                      ,signoff             )                {
  for(const c of checks) assertCheckShape(c);
  const dimensions=Object.fromEntries(PILOT_DIMENSIONS.map(d=>[d,dimensionVerdict(checks,d)]))                                       ;
  const technical                =checks.some(c=>c.kind==='machine'&&c.verdict==='FAIL')?'TECHNICAL_FAIL':'TECHNICAL_PASS';
  const blockers=checks.filter(c=>c.verdict==='FAIL').map(c=>`${c.id}: ${c.detail}`);
  // a stale or invalid sign-off is a governance inconsistency, not "pending"
  if(signoff==='STALE') blockers.push('signoff: the sign-off was given for an earlier basis (checks changed since) — re-review');
  if(signoff==='INVALID') blockers.push('signoff: invalid sign-off record');
  const pendingHuman=checks.filter(c=>c.verdict==='PENDING').map(c=>`${c.id}: ${c.detail}`);
  // a person said no: that is human work outstanding (not a CI failure), and never READY
  if(signoff==='REJECTED') pendingHuman.push('signoff: the pilot owner rejected this basis');
  let status            ;
  if(blockers.length) status='PILOT_BLOCKED';
  else if(pendingHuman.length) status='CONTENT_REVIEW_PENDING';
  else if(signoff==='CURRENT') status='PILOT_READY';
  else status='SIGNOFF_PENDING';
  return {technical,status,dimensions,signoff,blockers,pendingHuman};
}

export function pilotGate(statuses                       )          {
  if(statuses.includes('PILOT_BLOCKED')) return 'FAIL';
  return statuses.length>0&&statuses.every(s=>s==='PILOT_READY')?'PASS':'PENDING';
}
