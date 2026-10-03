import React from 'react';
import { Assessment, CandidateSession, Classroom, Question, Result, Submission, User } from '../../types';
import { ReportsPage } from '../faculty/ReportsPage';
import { RestartTestOptions } from '../common/RestartTestModal';

interface AdminClassReportsProps {
  classes: Classroom[];
  assessments: Assessment[];
  sessions: CandidateSession[];
  submissions: Submission[];
  questions?: Question[];
  results?: Result[];
  users: User[];
  currentUser?: User;
  onUpdateAssessment?: (assessment: Assessment) => Promise<void> | void;
  onRestartTest?: (
    assessmentId: string,
    candidateId: string,
    sessionId?: string,
    options?: RestartTestOptions
  ) => Promise<void> | void;
}

export const AdminClassReports: React.FC<AdminClassReportsProps> = ({
  classes = [],
  assessments = [],
  sessions = [],
  submissions = [],
  questions = [],
  results = [],
  users = [],
  currentUser = { id: 'admin', name: 'Admin', role: 'ADMIN', email: 'admin@codeguard.edu', createdAt: '' },
  onUpdateAssessment,
  onRestartTest,
}) => {
  return (
    <ReportsPage
      assessments={assessments}
      sessions={sessions}
      submissions={submissions}
      questions={questions}
      results={results}
      classes={classes}
      users={users}
      currentUser={currentUser}
      onUpdateAssessment={onUpdateAssessment}
      onRestartTest={onRestartTest}
    />
  );
};
