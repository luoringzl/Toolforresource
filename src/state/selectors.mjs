import {
  ACTIVE_PROJECT_STATUSES,
  comparePeopleDirectory,
  compareProjects,
  dashboardMetrics,
  isPersonSchedulable,
  needAllocated,
  personAvailable,
  personRemainingCapacity,
  projectHealth,
  projectRequiresStaffing,
  projectRoleCoverage,
  projectStaffingWarnings
} from '../core.mjs';

export function selectDashboardModel(db) {
  const activeProjects=(db.projects||[])
    .filter(project=>ACTIVE_PROJECT_STATUSES.includes(project.status))
    .sort(compareProjects);
  const riskyProjects=activeProjects.filter(project=>
    ['risk','overdue'].includes(projectHealth(project).key) ||
    projectStaffingWarnings(db,project).some(warning=>warning.critical)
  );
  const availablePeople=(db.people||[])
    .filter(person=>isPersonSchedulable(person) && personAvailable(db,person)>0)
    .sort((a,b)=>personAvailable(db,b)-personAvailable(db,a)||comparePeopleDirectory(a,b));
  const gapProjects=(db.projects||[])
    .filter(projectRequiresStaffing)
    .map(project=>({
      project,
      missing:projectRoleCoverage(db,project.id).filter(role=>role.required&&!role.covered)
    }))
    .filter(item=>item.missing.length);
  const openNeeds=(db.staffingNeeds||[]).filter(need=>{
    const project=(db.projects||[]).find(item=>item.id===need.projectId);
    return projectRequiresStaffing(project) && needAllocated(db,need)<Number(need.requiredCapacity||0);
  });
  return {
    metrics:dashboardMetrics(db),
    activeProjects,
    riskyProjects,
    availablePeople,
    gapProjects,
    openNeeds
  };
}

export function selectScheduleModel(db) {
  const needs=(db.staffingNeeds||[]).filter(need=>{
    const project=(db.projects||[]).find(item=>item.id===need.projectId);
    return projectRequiresStaffing(project) && needAllocated(db,need)<Number(need.requiredCapacity||0);
  });
  const candidates=(db.people||[])
    .filter(isPersonSchedulable)
    .sort((a,b)=>personAvailable(db,b)-personAvailable(db,a)||comparePeopleDirectory(a,b));
  const projectGaps=(db.projects||[])
    .filter(projectRequiresStaffing)
    .map(project=>{
      const missing=projectRoleCoverage(db,project.id).filter(role=>role.required&&!role.covered);
      const critical=missing.some(role=>(project.status==='资产制作中'&&role.key==='asset')||(project.status==='视频制作中'&&role.key==='video'));
      return {project,missing,critical};
    })
    .filter(item=>item.missing.length)
    .sort((a,b)=>Number(b.critical)-Number(a.critical)||compareProjects(a.project,b.project));
  return {needs,candidates,projectGaps};
}

export function selectPeopleMetrics(db) {
  const people=db.people||[];
  return {
    total:people.length,
    available:people.filter(person=>person.employmentStatus==='在岗'&&personRemainingCapacity(db,person)>0).length,
    overloaded:people.filter(person=>personRemainingCapacity(db,person)<0).length,
    inactive:people.filter(person=>person.employmentStatus!=='在岗').length
  };
}
