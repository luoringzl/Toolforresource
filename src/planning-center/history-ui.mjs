const esc=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

function actionLabel(action){return ({commit:'执行',undo:'撤销',redo:'重做'}[action]||action||'操作');}
function actionClass(action){return ['undo','redo'].includes(action)?action:'commit';}

export function renderHistoryButtons(status={}){
  const undo=status.nextUndo;
  const redo=status.nextRedo;
  return `<button class="planning-btn history-btn" id="planning-undo" ${status.canUndo?'':'disabled'} title="${undo?`撤销：${esc(undo.label)}`:'没有可撤销操作'}">↶ <span>撤销</span></button><button class="planning-btn history-btn" id="planning-redo" ${status.canRedo?'':'disabled'} title="${redo?`重做：${esc(redo.label)}`:'没有可重做操作'}">↷ <span>重做</span></button><button class="planning-btn history-btn" id="planning-audit-toggle">≡ <span>操作审计</span></button>`;
}

export function renderAuditTrail(items=[]){
  if(!items.length)return '<div class="history-empty">还没有新的事务审计记录。</div>';
  return `<div class="history-list">${items.map(item=>`<article class="history-item ${actionClass(item.action)}"><i>${esc(actionLabel(item.action))}</i><div><strong>${esc(item.label||item.text||'数据变更')}</strong><span>${esc(item.actor||'本地用户')} · ${esc(item.createdAt||'')}</span><small>${esc(item.text||'')} · ${Number(item.commandCount||0)} 条命令</small></div><b>${esc((item.commandTypes||[]).join(' / '))}</b></article>`).join('')}</div>`;
}

export function renderAuditDrawer(items=[],{open=false}={}){
  return `<aside class="history-drawer ${open?'open':''}" id="planning-audit-drawer" aria-hidden="${open?'false':'true'}"><header><div><strong>操作审计</strong><span>持久记录 · 不保存数据库快照</span></div><button class="planning-btn small" id="planning-audit-close">关闭</button></header>${renderAuditTrail(items)}</aside><div class="history-backdrop ${open?'open':''}" id="planning-audit-backdrop"></div>`;
}
