function matchesAudience(d,audience){return audience==='all'||d.audience==='shared'||d.audience===audience;}
function audienceRank(d,audience){return audience==='all'?d.recommendationRank:(d.recommendationRanks[audience]??Number.MAX_SAFE_INTEGER);}
function audienceLabel(audience){return {men:'メンズ',women:'レディース',all:'すべて'}[audience];}

function pinSchoolFirst(items){const schoolSlots=items.map((d,i)=>d.cat===8?i:-1).filter(i=>i>=0);const schools=schoolSlots.map(i=>items[i]);schools.sort((a,b)=>Number(!!b.pinnedSchool)-Number(!!a.pinnedSchool));schoolSlots.forEach((slot,i)=>{items[slot]=schools[i]});return items;}

function matchesApparelFilters(d,type,brand){return (!type||d.apparelType===type)&&(!brand||d.brand===brand);}
