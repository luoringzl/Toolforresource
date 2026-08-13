const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

function dateLines(values=[]){return (values||[]).join('\n');}
function parseDateLines(value=''){
  return [...new Set(String(value||'').split(/[\s,，;；]+/).map(item=>item.trim()).filter(Boolean))].sort();
}

export function installWorkCalendarFields(form,settings={}){
  if(!form||form.querySelector('[data-work-calendar-card]'))return;
  const actions=form.querySelector('.form-actions');
  if(!actions)return;
  actions.insertAdjacentHTML('beforebegin',`<div class="form-card full work-calendar-card" data-work-calendar-card><h3>公司工作日历例外</h3><label>公司休息日<textarea name="nonWorkingDates" rows="5" placeholder="每行一个日期，例如 2026-10-01">${esc(dateLines(settings.nonWorkingDates))}</textarea><small>正常工作日也会被设为 0 产能。</small></label><label>特殊工作日 / 补班日<textarea name="workingDateOverrides" rows="5" placeholder="每行一个日期，例如 2026-10-10">${esc(dateLines(settings.workingDateOverrides))}</textarea><small>优先级最高，可把周末或休息日恢复为工作日。</small></label><div class="calendar-rule-note"><strong>规则优先级</strong><span>特殊工作日 ＞ 公司休息日 ＞ 每周工作日。日期统一使用 YYYY-MM-DD，可按换行、逗号或空格分隔。</span></div></div>`);
}

export function readWorkCalendarPatch(form){
  return {
    nonWorkingDates:parseDateLines(form?.elements?.nonWorkingDates?.value||''),
    workingDateOverrides:parseDateLines(form?.elements?.workingDateOverrides?.value||'')
  };
}
