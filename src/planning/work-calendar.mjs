import { planningSettingsFromDatabase } from '../schema/migrations.mjs';
import { localDateKey } from '../utils/date.mjs';

export const DEFAULT_WORKING_DAYS=Object.freeze([1,2,3,4,5]);

export function parseCalendarDate(value){
  const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match)return null;
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const date=new Date(year,month-1,day);
  if(Number.isNaN(date.getTime())||date.getFullYear()!==year||date.getMonth()!==month-1||date.getDate()!==day)return null;
  return date;
}

export function normalizeCalendarDates(values=[]){
  return [...new Set((Array.isArray(values)?values:[]).map(value=>String(value||'').trim()).filter(value=>parseCalendarDate(value)))].sort();
}

export function createWorkCalendar({workingDays=DEFAULT_WORKING_DAYS,nonWorkingDates=[],workingDateOverrides=[]}={}){
  const weekdays=[...new Set((workingDays||DEFAULT_WORKING_DAYS).map(Number).filter(day=>day>=0&&day<=6))].sort((a,b)=>a-b);
  return {
    workingDays:weekdays.length?weekdays:[...DEFAULT_WORKING_DAYS],
    nonWorkingDates:normalizeCalendarDates(nonWorkingDates),
    workingDateOverrides:normalizeCalendarDates(workingDateOverrides)
  };
}

export function workCalendarFromDatabase(db={}){
  const settings=planningSettingsFromDatabase(db);
  return createWorkCalendar(settings);
}

export function workDateStatus(dateKey,calendar={}){
  const date=parseCalendarDate(dateKey);
  if(!date)return {date:String(dateKey||''),working:false,weekday:-1,source:'invalid',label:'无效日期'};
  const normalized=createWorkCalendar(calendar);
  const key=localDateKey(date);
  const weekday=date.getDay();
  if(normalized.workingDateOverrides.includes(key))return {date:key,working:true,weekday,source:'working-override',label:'特殊工作日'};
  if(normalized.nonWorkingDates.includes(key))return {date:key,working:false,weekday,source:'non-working-override',label:'公司休息日'};
  const working=normalized.workingDays.includes(weekday);
  return {date:key,working,weekday,source:'weekly',label:working?'常规工作日':'常规休息日'};
}

export function isWorkingDate(dateKey,calendar={}){
  return workDateStatus(dateKey,calendar).working;
}

export function nextWorkingDate(dateKey,calendar={}, {includeCurrent=true,maxScanDays=3660}={}){
  const start=parseCalendarDate(dateKey);
  if(!start)return '';
  const date=new Date(start);
  for(let offset=includeCurrent?0:1;offset<=maxScanDays;offset++){
    if(offset>0||!includeCurrent)date.setDate(start.getDate()+offset);
    const key=localDateKey(date);
    if(isWorkingDate(key,calendar))return key;
  }
  return '';
}

export function addWorkingDaysKey(dateKey,days,calendar={}){
  const start=parseCalendarDate(dateKey);
  if(!start)return '';
  const amount=Number(days||0);
  if(amount===0)return isWorkingDate(dateKey,calendar)?dateKey:nextWorkingDate(dateKey,calendar);
  const direction=amount>0?1:-1;
  let remaining=Math.abs(Math.trunc(amount));
  const date=new Date(start);
  let guard=0;
  while(remaining>0&&guard<10000){
    date.setDate(date.getDate()+direction);
    const key=localDateKey(date);
    if(isWorkingDate(key,calendar))remaining-=1;
    guard+=1;
  }
  return remaining===0?localDateKey(date):'';
}

export function countWorkingDates(startDate,endDate,calendar={},{inclusive=true}={}){
  const start=parseCalendarDate(startDate),end=parseCalendarDate(endDate);
  if(!start||!end||end<start)return 0;
  let count=0;
  const cursor=new Date(start);
  while(cursor<=end){
    const key=localDateKey(cursor);
    if(isWorkingDate(key,calendar))count+=1;
    cursor.setDate(cursor.getDate()+1);
  }
  if(!inclusive&&count>0&&isWorkingDate(endDate,calendar))count-=1;
  return count;
}
