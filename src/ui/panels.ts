import { t, number } from '../core/i18n';
import { E, T, MODES, D } from '../sim/config';
import { reserved, unlocked } from '../sim/commands';
import { headway } from '../sim/demand';
import { eventConfig } from '../sim/events';
import type { Mode, World } from '../sim/types';
export function routesPanel(w: World, mode: Mode): string {
  const event=eventConfig(w);
  return `<div class="section-heading"><h2>${t('routes')}</h2><span>${w.routes.length}</span></div>
    <label>${t('transport')}<select id="route-mode">${MODES.map(m=>`<option value="${m}" ${m===mode?'selected':''} ${!unlocked(w,m)?'disabled':''}>${t(m)} · ${t('reserve',{count:reserved(w,m)})}</option>`).join('')}</select></label>
    <p class="transport-hint">${t('routeTransportHint')}</p><button class="primary wide" data-action="build">＋ ${t('buildRoute')}</button>`+w.routes.map(r=>`<article class="route-card">
    <h3><i style="background:${D.colors[(r.id-1)%D.colors.length]}"></i>${t('route',{id:r.id})} · ${t(r.mode)} <button data-focus="${r.id}">${t('showLine')}</button></h3>
    <p>${r.stops.map(id=>t(w.districts[id].name)).join(' → ')}</p>
    <small>${t('vehicles',{count:r.vehicles})} · ${t('passengers',{count:number(r.served)})}<br>${t('routeHeadway',{count:number(headway(w,r))})}</small>
    ${!r.vehicles?`<p class="warning">${t('routePaused')}</p>`:''}${event?.id==='repair'&&r.stops.includes(event.district)?`<p class="warning">${t('routeBlocked')}</p>`:''}
    <div class="route-actions"><button data-release="${r.id}" aria-label="${t('release')}" ${r.vehicles===0?'disabled':''}>−</button><strong>${r.vehicles}</strong><button data-assign="${r.id}" aria-label="${t('assign')}" ${reserved(w,r.mode)<1?'disabled':''}>＋</button><button data-extend="${r.id}">${t('extend')}</button><button data-edit="${r.id}">${t('edit')}</button><button data-remove="${r.id}" class="muted">${t('remove')}</button></div>${['marshrutka','bus'].includes(r.mode)?['marshrutka','bus'].filter(m=>m!==r.mode&&reserved(w,m as Mode)>0).map(m=>`<button class="wide" data-change-mode="${r.id}:${m}">${t('changeRouteMode',{mode:t(m)})}</button><small>${t('changeRouteModeHint')}</small>`).join(''):''}</article>`).join('');
}
export function fleetPanel(w: World): string {
  return `<h2>${t('fleet')} · ${w.fleet}</h2>`+MODES.map(mode=>{
    const c=T[mode],available=unlocked(w,mode);
    return `<article class="route-card"><h3>${t(mode)} · ${w.fleets[mode]}</h3><p>${t('capacity',{count:c.capacity})} · ${t('reserve',{count:reserved(w,mode)})}<br>${t('operatingCost',{cost:number(c.activeCostPerHour)})}<br>${t('wear',{count:number(w.wear[mode])})}${c.infrastructurePerUnit?`<br>${t('infrastructure',{cost:number(c.infrastructurePerUnit)})}`:''}</p>
    ${available?'':`<p>${t('locked',{population:number(c.unlockPopulation),served:number(c.unlockServed)})}</p>`}
    <button data-buy="${mode}" class="primary wide" ${!available||w.money<c.price?'disabled':''}>${t('buy',{cost:number(c.price)})}</button>
    ${reserved(w,mode)>0?`<button class="wide" data-plan="${mode}">${t('planWithMode',{mode:t(mode)})}</button>`:''}
    ${w.fleets[mode]?`<button class="wide" data-service="${mode}" ${w.wear[mode]===0?'disabled':''}>${t('service',{cost:number(w.fleets[mode]*c.serviceCost)})}</button>`:''}</article>`;
  }).join('');
}
export function financePanel(w: World): string {
  return `<h2>${t('finance')}</h2><strong>${number(w.money)} ₽</strong><p>${t('fare',{cost:w.fare})}</p><form id="fare-form"><label for="fare-input">${t('fareLabel')}</label><div class="fare-row"><input id="fare-input" type="number" min="${E.fareMin}" max="${E.fareMax}" step="1" value="${w.fare}" required><button class="primary">${t('fareSave')}</button></div></form>
    <p>${t('fareHint',{min:E.fareMin,max:E.fareMax})}</p><p>${t('debt',{cost:number(w.debt)})}<br>${t('loanTerms',{rate:E.loanDailyInterest*100})}</p><div class="route-actions"><button data-action="loan" ${w.debt>=E.loanMax?'disabled':''}>${t('takeLoan',{cost:number(E.loanAmount)})}</button><button data-action="repay" ${!w.debt?'disabled':''}>${t('repayLoan',{cost:number(E.loanAmount)})}</button></div>
    <h3>${t('financeTotal')}</h3><article class="finance-row">${t('income')}<strong>${number(w.income)} ₽</strong></article><article class="finance-row">${t('expenses')}<strong>${number(w.expenses)} ₽</strong></article>`+
    Object.entries(w.ledger).map(([key,value])=>`<div class="ledger-row"><span>${t(key)}</span><b>${number(value)} ₽</b></div>`).join('');
}
