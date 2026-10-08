import { Classroom, User } from '../types';

export function isStudentUser(user: User | null | undefined): boolean {
  const role = String(user?.role || '').trim().toUpperCase();
  return role === 'CANDIDATE' || role === 'STUDENT';
}

export function isStudentAssignedToClass(cls: Classroom, stu: User): boolean {
  if (!cls || !stu) return false;
  const cStudentIds = (cls.studentIds || []).map((id) => String(id).trim().toLowerCase());
  const sClassIds = (stu.classIds || []).map((id) => String(id).trim().toLowerCase());
  const clsIdLower = String(cls.id || '').trim().toLowerCase();
  const clsNameLower = String(cls.name || (cls as any).className || '').trim().toLowerCase();

  // 1. Direct Class ID or Class Name in Student's classIds
  if (sClassIds.includes(clsIdLower) || (clsNameLower && sClassIds.includes(clsNameLower))) return true;

  // 2. Direct Student ID / UID / RegNo / Email / Name in Classroom's studentIds
  if (stu.id && cStudentIds.includes(String(stu.id).trim().toLowerCase())) return true;
  if (stu.uid && cStudentIds.includes(String(stu.uid).trim().toLowerCase())) return true;
  if (stu.registerNumber && cStudentIds.includes(String(stu.registerNumber).trim().toLowerCase())) return true;
  if (stu.registerNo && cStudentIds.includes(String(stu.registerNo).trim().toLowerCase())) return true;
  if (stu.email && cStudentIds.includes(String(stu.email).trim().toLowerCase())) return true;

  // 3. Match by student className or classroom property if stored on user
  const stuClassName = String((stu as any).className || (stu as any).classroom || (stu as any).class || '').trim().toLowerCase();
  if (stuClassName && (stuClassName === clsIdLower || stuClassName === clsNameLower)) return true;

  // 4. Department intelligent match:
  if (clsNameLower && stu.department) {
    const deptLower = stu.department.trim().toLowerCase();
    if (deptLower && (clsNameLower.includes(deptLower) || (deptLower.includes('computer') && clsNameLower.includes('cse')))) {
      return true;
    }
  }

  return false;
}

export function isFacultyAssignedToClass(cls: Classroom, fac: User): boolean {
  if (!cls || !fac) return false;
  const cStaffIds = (cls.staffIds || []).map((id) => String(id).trim().toLowerCase());
  const cFacultyIds = (cls.facultyIds || []).map((id) => String(id).trim().toLowerCase());
  const allStaffIds = [...cStaffIds, ...cFacultyIds];
  const fClassIds = (fac.classIds || []).map((id) => String(id).trim().toLowerCase());
  const clsIdLower = String(cls.id || '').trim().toLowerCase();
  const clsNameLower = String(cls.name || (cls as any).className || '').trim().toLowerCase();

  if (fac.id && allStaffIds.includes(String(fac.id).trim().toLowerCase())) return true;
  if (fac.uid && allStaffIds.includes(String(fac.uid).trim().toLowerCase())) return true;
  if (fac.email && allStaffIds.includes(String(fac.email).trim().toLowerCase())) return true;
  if (fClassIds.includes(clsIdLower) || (clsNameLower && fClassIds.includes(clsNameLower))) return true;

  return false;
}

export function syncStudentsToClassroom(cls: Classroom, allUsers: User[]): { updatedClass: Classroom; updatedUsers: User[] } {
  if (!cls) return { updatedClass: cls, updatedUsers: [] };

  const matchedStudents = allUsers.filter(
    (u) => isStudentUser(u) && isStudentAssignedToClass(cls, u)
  );

  const matchedIds = matchedStudents.map((s) => s.id);
  const existingIds = (cls.studentIds || []).map((id) => String(id).trim());

  // Deduplicate merged IDs
  const combinedIds = Array.from(new Set([...existingIds, ...matchedIds]));

  const updatedClass: Classroom = {
    ...cls,
    studentIds: combinedIds,
    updatedAt: new Date().toISOString(),
  };

  const updatedUsers: User[] = [];
  for (const stu of matchedStudents) {
    const currentClassIds = (stu.classIds || []).map((id) => String(id).trim());
    if (!currentClassIds.includes(cls.id)) {
      updatedUsers.push({
        ...stu,
        classIds: [cls.id],
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return { updatedClass, updatedUsers };
}
