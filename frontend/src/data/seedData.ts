import {
  Assessment,
  AuditLog,
  CandidateSession,
  Classroom,
  Department,
  Institution,
  Question,
  Submission,
  User,
} from '../types';

export const INITIAL_INSTITUTIONS: Institution[] = [];

export const DEMO_USERS: User[] = [
  {
    id: 'usr-admin-cse-drngpit',
    name: 'CSE Administrator',
    email: 'cse.admin@drngpit.ac.in',
    role: 'ADMIN',
    institutionId: 'inst-01',
    institutionName: 'Dr. N.G.P. Institute of Technology',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    createdAt: '2026-01-01T00:00:00Z',
  },
];

export const INITIAL_QUESTIONS: Question[] = [];

export const INITIAL_ASSESSMENTS: Assessment[] = [];

export const INITIAL_SESSIONS: CandidateSession[] = [];

export const INITIAL_SUBMISSIONS: Submission[] = [];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [];

export const INITIAL_DEPARTMENTS: Department[] = [];

export const INITIAL_CLASSES: Classroom[] = [];
