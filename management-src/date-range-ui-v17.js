/* PAKKOM_DATE_RANGE_V17: one inclusive range for all financial views. */
const rangeDatesV17=[...new Set(DATA.daily.map(r=>r.iso))].sort();
const rangeFirstV17=rangeDatesV17[0],rangeLastV17=rangeDatesV17.at(-1);
function rangeDateLabelV17(value){return String(value).split('-').reverse().join('.')}
function rangeLabelV17(from=state.from,to=state.to){return rangeDateLabelV17(from)+' — '+rangeDateLabelV17(to)}
function rangeControlsV17(){return SIGNAL_SITE_MODE_V11==='owner'?{from:'dateFrom',to:'dateTo',preset:'fWeek'}:{from:'baseFrom',to:'baseTo',preset:'fBase'}}
function rangeErrorV17(from,to){
 const valid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
 if(!valid(from)||!valid(to))return 'Укажите обе даты полностью.';
 if(from>to)return 'Дата «С» должна быть не позже даты «По». Показатели пока относятся к прежнему диапазону.';
 if(from<rangeFirstV17||to>rangeLastV17)return 'Данные доступны с '+rangeDateLabelV17(rangeFirstV17)+' по '+rangeDateLabelV17(rangeLastV17)+'. Выберите даты внутри этого диапазона.';
 return '';
}
function syncRangeV17(){
 const ids=rangeControlsV17();
 $(ids.from).value=state.from;$(ids.to).value=state.to;
 $(ids.preset).value=SIGNAL_SITE_MODE_V11==='owner'?state.week:state.base;
 $('rangeSummaryV17').textContent='Показано: '+rangeLabelV17()+' включительно · Данные доступны: '+rangeLabelV17(rangeFirstV17,rangeLastV17);
 $('rangeErrorV17').textContent='';$('rangeErrorV17').hidden=true;
 $(ids.from).setAttribute('aria-invalid','false');$(ids.to).setAttribute('aria-invalid','false');
}
function setRangeV17(from,to,preset='custom',render=true){
 const error=rangeErrorV17(from,to),ids=rangeControlsV17();
 if(error){$('rangeErrorV17').textContent=error;$('rangeErrorV17').hidden=false;$(ids.from).setAttribute('aria-invalid','true');$(ids.to).setAttribute('aria-invalid','true');return false}
 state.from=from;state.to=to;state.expanded=null;
 if(SIGNAL_SITE_MODE_V11==='owner')state.week=preset;else state.base=preset;
 syncRangeV17();if(render)renderAll();return true;
}
function pickRangePresetV17(preset,render=true){
 if(preset==='custom')return setRangeV17(state.from,state.to,'custom',render);
 let from=rangeFirstV17,to=rangeLastV17;
 if(preset==='sep'||(preset==='all'&&SIGNAL_SITE_MODE_V11==='owner'))from=rangeLastV17>='2026-09-01'?['2026-09-01',rangeFirstV17].sort().at(-1):rangeFirstV17;
 else if(preset==='month')from=[rangeLastV17.slice(0,7)+'-01',rangeFirstV17].sort().at(-1);
 else if(preset==='last7')from=[new Date(Date.parse(rangeLastV17+'T00:00:00Z')-6*86400000).toISOString().slice(0,10),rangeFirstV17].sort().at(-1);
 else{const week=DATA.weeks.find(w=>w.key===preset);if(week){from=[week.start,rangeFirstV17].sort().at(-1);to=[week.end,rangeLastV17].sort()[0]}}
 return setRangeV17(from,to,preset,render);
}
function applyRangeInputsV17(){const ids=rangeControlsV17();return setRangeV17($(ids.from).value,$(ids.to).value)}
function initRangeV17(defaultPreset){
 const owner=SIGNAL_SITE_MODE_V11==='owner',ids=rangeControlsV17();
 $(ids.preset).innerHTML=(owner?'<option value="all">С 01.09.2026</option><option value="history">Вся история</option>':'<option value="all">Вся история</option><option value="sep">С 01.09.2026</option>')+'<option value="month">С начала месяца</option><option value="last7">Последние 7 дней</option><option value="custom">Свои даты</option>'+DATA.weeks.map(w=>'<option value="'+w.key+'">'+rangeLabelV17(w.start,w.end)+'</option>').join('');
 for(const id of [ids.from,ids.to]){$(id).min=rangeFirstV17;$(id).max=rangeLastV17;$(id).onchange=applyRangeInputsV17;$(id).onkeydown=e=>{if(e.key==='Enter')applyRangeInputsV17()}}
 $(ids.preset).onchange=e=>pickRangePresetV17(e.target.value);
 $('applyRangeV17').onclick=applyRangeInputsV17;
 $('monthRangeV17').onclick=()=>pickRangePresetV17('month');
 $('last7RangeV17').onclick=()=>pickRangePresetV17('last7');
 $('allRangeV17').onclick=()=>pickRangePresetV17(owner?'history':'all');
 pickRangePresetV17(defaultPreset,false);
}
