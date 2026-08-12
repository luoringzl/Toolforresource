import { buildCapacityCalendar, buildPersonCapacitySeries, capacityConflicts, dailyTeamCapacity, firstDateWithCapacity } from './capacity-calendar.mjs';
import { localDateKey } from '../utils/date.mjs';

function summarizeSeries(series){
  if(!series.length)return {days:0,averageAvailable:0,minAvailable:0,maxAvailable:0,overloadedDays:0,fullyBookedDays:0};
  const available=series.map(day=>day.available);
  return {
    days:series.length,
    averageAvailable:Math.round(available.reduce((sum,value)=>sum+value,0)/series.length),
    minAvailable:Math.min(...available),
    maxAvailable:Math.max(...available),
    overloadedDays:series.filter(day=>day.overloaded).length,
    fullyBookedDays:series.filter(day=>day.available<=0).length
  };
}

export function forecastPersonCapacity(db,personId,{startDate=localDateKey(new Date()),horizons=[30,60,90],requiredCapacity=20,consecutiveDays=1}={}){
  const person=(db.people||[]).find(item=>item.id===personId);
  if(!person)return null;
  const maxDays=Math.max(...horizons,1);
  const series=buildPersonCapacitySeries(db,person,{startDate,days:maxDays});
  const windows=Object.fromEntries(horizons.map(days=>{
    const slice=series.slice(0,days);
    return [days,{...summarizeSeries(slice),firstDateWithCapacity:firstDateWithCapacity(slice,requiredCapacity,{consecutiveDays})}];
  }));
  return {person,series,windows};
}

export function forecastTeamCapacity(db,{startDate=localDateKey(new Date()),horizons=[30,60,90]}={}){
  const maxDays=Math.max(...horizons,1);
  const calendar=buildCapacityCalendar(db,{startDate,days:maxDays});
  const teamSeries=dailyTeamCapacity(db,{startDate,days:maxDays});
  const windows=Object.fromEntries(horizons.map(days=>{
    const slice=teamSeries.slice(0,days);
    const totalCapacity=slice.reduce((sum,row)=>sum+row.capacity,0);
    const totalUsage=slice.reduce((sum,row)=>sum+row.usage,0);
    return [days,{
      days:slice.length,
      utilization:totalCapacity?Math.round(totalUsage/totalCapacity*100):0,
      averageAvailable:slice.length?Math.round(slice.reduce((sum,row)=>sum+row.available,0)/slice.length):0,
      peakUsage:slice.length?Math.max(...slice.map(row=>row.usage)):0,
      overloadedDays:slice.filter(row=>row.overloadedPeople>0).length
    }];
  }));
  return {calendar,teamSeries,conflicts:capacityConflicts(calendar),windows};
}

export function rankFutureCapacityCandidates(db,{startDate=localDateKey(new Date()),days=30,requiredCapacity=20,consecutiveDays=1}={}){
  return (db.people||[]).map(person=>{
    const series=buildPersonCapacitySeries(db,person,{startDate,days});
    const firstAvailableDate=firstDateWithCapacity(series,requiredCapacity,{consecutiveDays});
    const summary=summarizeSeries(series);
    return {person,firstAvailableDate,...summary};
  }).filter(item=>item.person.employmentStatus==='在岗')
    .sort((a,b)=>{
      if(Boolean(a.firstAvailableDate)!==Boolean(b.firstAvailableDate))return a.firstAvailableDate?-1:1;
      const dateCompare=String(a.firstAvailableDate||'9999-12-31').localeCompare(String(b.firstAvailableDate||'9999-12-31'));
      if(dateCompare)return dateCompare;
      return b.averageAvailable-a.averageAvailable||String(a.person.name||'').localeCompare(String(b.person.name||''),'zh-CN');
    });
}
