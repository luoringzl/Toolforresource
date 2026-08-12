import { personUsage } from '../core.mjs';

function pushMap(map,key,value){
  if(!map.has(key))map.set(key,[]);
  map.get(key).push(value);
}

export function buildDatabaseIndexes(db,today){
  const peopleById=new Map((db.people||[]).map(person=>[person.id,person]));
  const projectsById=new Map((db.projects||[]).map(project=>[project.id,project]));
  const assignmentsByPersonId=new Map();
  const assignmentsByProjectId=new Map();
  for(const assignment of db.assignments||[]){
    pushMap(assignmentsByPersonId,assignment.personId,assignment);
    pushMap(assignmentsByProjectId,assignment.projectId,assignment);
  }
  const needsByProjectId=new Map();
  for(const need of db.staffingNeeds||[])pushMap(needsByProjectId,need.projectId,need);
  const usageByPersonId=new Map((db.people||[]).map(person=>[person.id,personUsage(db,person.id,today)]));
  return {peopleById,projectsById,assignmentsByPersonId,assignmentsByProjectId,needsByProjectId,usageByPersonId};
}
