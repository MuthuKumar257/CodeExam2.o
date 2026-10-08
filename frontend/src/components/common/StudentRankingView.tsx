import React, { useState, useMemo } from 'react';
import { UserAvatar } from './UserAvatar';
import {
  Trophy,
  Award,
  Medal,
  Search,
  GraduationCap,
  Building2,
  CheckCircle2,
  Sparkles,
  BarChart3,
  FileCode2,
  TrendingUp,
  Filter,
  Users,
  Eye,
  X,
  RotateCcw,
  FilterX,
} from 'lucide-react';
import { Assessment, CandidateSession, Classroom, Question, Result, Submission, User } from '../../types';
import { isStudentAssignedToClass, isStudentUser } from '../../utils/classUtils';
import {
  getCandidateAliases,
  getCandidateSessionMetrics,
  isCandidateSessionCompleted,
} from '../../utils/submissionUtils';

export interface StudentRankingViewProps {
  users: User[];
  classes?: Classroom[];
  assessments?: Assessment[];
  sessions?: CandidateSession[];
  submissions?: Submission[];
  questions?: Question[];
  results?: Result[];
  defaultClassId?: string;
  showTitleHeader?: boolean;
  onInspectCandidate?: (sessionId: string) => void;
}

export interface StudentRankData {
  rank: number;
  student: User;
  registerNumber: string;
  department: string;
  assignedClasses: Classroom[];
  assessmentsAttempted: number;
  assessmentsCompleted: number;
  totalScore: number;
  totalPossibleScore: number;
  percentageScore: number;
  warningsCount: number;
  testCasesPassed?: number;
  totalTestCases?: number;
  performanceTier: 'EXCELLENT' | 'GOOD' | 'NEEDS_IMPROVEMENT' | 'NOT_ATTEMPTED';
}

export const StudentRankingView: React.FC<StudentRankingViewProps> = ({
  users = [],
  classes = [],
  assessments = [],
  sessions = [],
  submissions = [],
  questions = [],
  results = [],
  defaultClassId = 'ALL',
  showTitleHeader = true,
  onInspectCandidate,
}) => {
  const [selectedClassId, setSelectedClassId] = useState<string>(defaultClassId);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Extract candidate students (both from users and synthesized from sessions so none are missed)
  const candidateStudents = useMemo(() => {
    const fromUsers = users.filter(isStudentUser);
    const existingIds = new Set(fromUsers.map((u) => u.id));
    const existingEmails = new Set(
      fromUsers.map((u) => u.email?.toLowerCase()).filter(Boolean)
    );

    const synthesized: User[] = [];
    sessions.forEach((s) => {
      const cId = s.candidateId || (s as any).studentId;
      const cEmail = s.candidateEmail?.toLowerCase();
      if ((cId && !existingIds.has(cId)) && (!cEmail || !existingEmails.has(cEmail))) {
        const syntheticUser: User = {
          id: cId || `student-${s.id}`,
          name: s.candidateName || 'Candidate',
          email: s.candidateEmail || 'student@example.com',
          role: 'CANDIDATE',
          institutionId: s.institutionId || 'inst-1',
          registerNumber: s.candidateRegisterNo || (s as any).registerNo || 'N/A',
          registerNo: s.candidateRegisterNo || (s as any).registerNo || 'N/A',
          department: (s as any).department || 'Computer Science & Engineering',
          createdAt: s.startedAt || new Date().toISOString(),
        };
        synthesized.push(syntheticUser);
        if (cId) existingIds.add(cId);
        if (cEmail) existingEmails.add(cEmail);
      }
    });

    return [...fromUsers, ...synthesized];
  }, [users, sessions]);

  // Calculate real student rankings using centralized getCandidateSessionMetrics
  const rankedStudents = useMemo(() => {
    // 1. Filter students by class if specified
    const targetStudents = candidateStudents.filter((student) => {
      if (selectedClassId === 'ALL') return true;
      const classObj = classes.find((c) => c.id === selectedClassId);
      if (!classObj) return true;
      return isStudentAssignedToClass(classObj, student);
    });

    // 2. Compute stats for each student
    const studentStats: StudentRankData[] = targetStudents.map((student) => {
      // Find candidate's aliases (id, email, register numbers)
      const candidateAliases = getCandidateAliases(student.id);
      if (student.email) candidateAliases.push(student.email.toLowerCase());
      if (student.registerNumber) candidateAliases.push(student.registerNumber.toLowerCase());
      if (student.registerNo) candidateAliases.push(student.registerNo.toLowerCase());

      const studentSessions = sessions.filter((s) => {
        const sessAliases = getCandidateAliases(s);
        return candidateAliases.some((alias) => sessAliases.includes(alias));
      });

      const completedSessions = studentSessions.filter(isCandidateSessionCompleted);

      // Unique assessments attempted
      const attemptedAsmIds = new Set(studentSessions.map((s) => s.assessmentId));

      let sumEarnedScore = 0;
      let sumPossibleScore = 0;
      let totalWarnings = 0;
      let totalPassedTC = 0;
      let totalTC = 0;

      let validAttemptedCount = 0;
      let validCompletedCount = 0;

      // Group scores by assessment using latest attempt per assessment (considering marks even if test is not submitted)
      attemptedAsmIds.forEach((asmId) => {
        const asm = assessments.find((a) => a.id === asmId);
        // Requirement 1: If a test is deleted, its score must be removed from ranking calculations.
        if (!asm || (asm as any).isDeleted || asm.status === 'ARCHIVED' || (asm.status as any) === 'deleted' || (asm as any).deletedAt) {
          return;
        }

        const asmSessions = studentSessions.filter((s) => s.assessmentId === asmId);
        const sortedSessions = [...asmSessions].sort(
          (a, b) =>
            new Date(b.completedAt || b.updatedAt || b.startedAt || 0).getTime() -
            new Date(a.completedAt || a.updatedAt || a.startedAt || 0).getTime()
        );
        const latestSession = sortedSessions[0];
        if (latestSession) {
          validAttemptedCount++;
          if (isCandidateSessionCompleted(latestSession)) {
            validCompletedCount++;
          }
          const resolvedQuestions =
            asm?.questions && asm.questions.length > 0
              ? asm.questions
              : (asm as any)?.questionIds
              ? (asm as any).questionIds
                  .map((qid: string) => questions.find((q) => q.id === qid))
                  .filter(Boolean)
              : questions;

          const metrics = getCandidateSessionMetrics(
            latestSession,
            submissions,
            asm,
            resolvedQuestions,
            results
          );

          sumEarnedScore += metrics.score;
          sumPossibleScore += metrics.maxScore;
          totalWarnings +=
            latestSession.warningsCount ??
            (latestSession.flags?.length || latestSession.proctoringEvents?.length || 0);
          totalPassedTC += metrics.passedTC;
          totalTC += metrics.totalTC;
        }
      });

      const percentage =
        sumPossibleScore > 0
          ? Math.min(100, Math.round((sumEarnedScore / sumPossibleScore) * 100))
          : 0;

      // Assigned classes
      const studentAssignedClasses = classes.filter((c) =>
        isStudentAssignedToClass(c, student)
      );

      // Performance tier
      let performanceTier: StudentRankData['performanceTier'] = 'NOT_ATTEMPTED';
      if (validCompletedCount > 0) {
        if (percentage >= 80) performanceTier = 'EXCELLENT';
        else if (percentage >= 50) performanceTier = 'GOOD';
        else performanceTier = 'NEEDS_IMPROVEMENT';
      }

      return {
        rank: 0, // set after sorting
        student,
        registerNumber: student.registerNumber || student.registerNo || 'N/A',
        department: student.department || 'Computer Science & Engineering',
        assignedClasses: studentAssignedClasses,
        assessmentsAttempted: validAttemptedCount,
        assessmentsCompleted: validCompletedCount,
        totalScore: sumEarnedScore,
        totalPossibleScore: sumPossibleScore,
        percentageScore: percentage,
        warningsCount: totalWarnings,
        testCasesPassed: totalPassedTC,
        totalTestCases: totalTC,
        performanceTier,
      };
    });

    // 3. Sort students by performance
    studentStats.sort((a, b) => {
      // Primary: Percentage Score (descending)
      if (b.percentageScore !== a.percentageScore) {
        return b.percentageScore - a.percentageScore;
      }
      // Secondary: Total Score (descending)
      if (b.totalScore !== a.totalScore) {
        return b.totalScore - a.totalScore;
      }
      // Tertiary: Completed Assessments (descending)
      if (b.assessmentsCompleted !== a.assessmentsCompleted) {
        return b.assessmentsCompleted - a.assessmentsCompleted;
      }
      // Quaternary: Fewest Warnings (ascending)
      if (a.warningsCount !== b.warningsCount) {
        return a.warningsCount - b.warningsCount;
      }
      // Name (ascending)
      return a.student.name.localeCompare(b.student.name);
    });

    // Assign rank numbers
    return studentStats.map((item, idx) => ({ ...item, rank: idx + 1 }));
  }, [
    candidateStudents,
    selectedClassId,
    classes,
    sessions,
    assessments,
    submissions,
    questions,
    results,
  ]);

  // Search filter
  const filteredRankedStudents = useMemo(() => {
    if (!searchQuery.trim()) return rankedStudents;
    const q = searchQuery.toLowerCase().trim();
    return rankedStudents.filter((item) => {
      const matchName = (item.student.name || '').toLowerCase().includes(q);
      const matchEmail = (item.student.email || '').toLowerCase().includes(q);
      const matchReg = (item.registerNumber || '').toLowerCase().includes(q);
      const matchDept = (item.department || '').toLowerCase().includes(q);
      const matchClass = item.assignedClasses.some((c) => (c.name || '').toLowerCase().includes(q));
      return matchName || matchEmail || matchReg || matchDept || matchClass;
    });
  }, [rankedStudents, searchQuery]);

  const top3Podium = useMemo(() => {
    return rankedStudents.filter((s) => s.assessmentsCompleted > 0 || s.totalScore > 0).slice(0, 3);
  }, [rankedStudents]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setSelectedClassId('ALL');
  };

  const hasActiveFilters = searchQuery.trim() !== '' || selectedClassId !== 'ALL';

  return (
    <div className="space-y-6">
      {showTitleHeader && (
        <div className="flex flex-col md:flex-row md:items-end justify-between pb-6 border-b border-white/10 gap-4">
          <div>
            <span className="label-mono block mb-1">Leaderboards & Performance Analytics</span>
            <h1 className="font-display text-4xl font-extrabold text-white tracking-tight leading-none mb-2">
              Student Rankings
            </h1>
            <p className="text-zinc-400 text-sm">
              Live student rankings calculated directly from candidate assessment submissions, scores, and proctoring integrity.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 bg-[#141417] px-3 py-1.5 rounded border border-white/10">
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
              <span className="text-xs font-semibold text-zinc-300">Filter Class:</span>
              <select
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                className="bg-[#141417] border border-white/10 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold cursor-pointer"
              >
                <option value="ALL">Overall Ranking (All Classes)</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-bold transition cursor-pointer"
                title="Clear search query and class filter"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear Filters</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Class Selector Bar if header hidden */}
      {!showTitleHeader && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900 p-4 rounded-xl border border-slate-800">
          <div className="flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-white">Student Rankings</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Select Scope:</span>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-3 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 font-bold"
            >
              <option value="ALL">Overall Student Ranking</option>
              {classes.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Top 3 Podium Cards */}
      {top3Podium.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {top3Podium.map((item) => {
            const isFirst = item.rank === 1;
            const isSecond = item.rank === 2;
            const isThird = item.rank === 3;

            return (
              <div
                key={item.student.id}
                className={`p-5 rounded-2xl border transition shadow-xl relative overflow-hidden flex flex-col justify-between ${
                  isFirst
                    ? 'bg-gradient-to-b from-amber-950/40 via-slate-900 to-slate-900 border-amber-500/50 shadow-amber-500/10'
                    : isSecond
                    ? 'bg-gradient-to-b from-slate-800/50 via-slate-900 to-slate-900 border-slate-400/40'
                    : 'bg-gradient-to-b from-orange-950/30 via-slate-900 to-slate-900 border-orange-500/40'
                }`}
              >
                {/* Top Badge */}
                <div className="flex items-center justify-between">
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow ${
                      isFirst
                        ? 'bg-amber-500 text-slate-950'
                        : isSecond
                        ? 'bg-slate-300 text-slate-950'
                        : 'bg-amber-700 text-white'
                    }`}
                  >
                    {isFirst && <Trophy className="w-3.5 h-3.5" />}
                    {isSecond && <Medal className="w-3.5 h-3.5" />}
                    {isThird && <Award className="w-3.5 h-3.5" />}
                    <span>Rank #{item.rank}</span>
                  </div>

                  <span className="text-[10px] font-mono font-bold text-slate-400">
                    Reg: {item.registerNumber}
                  </span>
                </div>

                <div className="my-4 flex items-center space-x-3">
                  <UserAvatar
                    name={item.student.name}
                    avatarUrl={item.student.avatar || (item.student as any).profilePicUrl || (item.student as any).photoUrl}
                    sizeClassName="w-10 h-10"
                    textClassName="text-sm"
                  />
                  <div className="space-y-0.5 overflow-hidden">
                    <h3 className="text-base font-extrabold text-white flex items-center gap-1.5 truncate">
                      {item.student.name}
                      {isFirst && <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />}
                    </h3>
                    <p className="text-xs text-slate-400 truncate">{item.student.email}</p>
                    <p className="text-[11px] text-indigo-400 font-medium truncate">
                      {item.assignedClasses.map((c) => c.name).join(', ') || item.department}
                    </p>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800/80 grid grid-cols-3 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">
                      Total Score
                    </span>
                    <span className="text-base font-bold text-white font-mono">
                      {item.totalScore}
                      <span className="text-xs text-slate-500 font-normal">
                        {' '}/ {item.totalPossibleScore > 0 ? item.totalPossibleScore : (item.assessmentsCompleted > 0 ? 100 : '-')} pts
                      </span>
                    </span>
                  </div>

                  <div className="text-center">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">
                      Warnings
                    </span>
                    <span
                      className={`text-base font-bold font-mono ${
                        item.warningsCount >= 3
                          ? 'text-rose-400'
                          : item.warningsCount > 0
                          ? 'text-amber-400'
                          : 'text-slate-200'
                      }`}
                    >
                      {item.warningsCount}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block uppercase font-bold tracking-wider">
                      Percentage
                    </span>
                    <span
                      className={`text-lg font-bold font-mono ${
                        isFirst
                          ? 'text-amber-400'
                          : isSecond
                          ? 'text-slate-200'
                          : 'text-amber-500'
                      }`}
                    >
                      {item.percentageScore}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Main Table Container */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl space-y-4 p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold text-white">
              Student Rankings ({filteredRankedStudents.length} Candidates)
            </h3>
          </div>

          <div className="flex items-center gap-2 max-w-sm w-full">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search candidate or reg no..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white p-0.5 rounded transition cursor-pointer"
                  title="Clear search input"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold bg-rose-500/15 text-rose-300 hover:bg-rose-500/25 border border-rose-500/30 transition shrink-0 cursor-pointer"
                title="Clear all active search and class filters"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}
          </div>
        </div>

        {filteredRankedStudents.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
            <Users className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs font-semibold text-slate-400">
              No students found for the selected scope or search query
            </p>
            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer shadow-lg"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset & Clear Filters</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 uppercase text-[11px] font-mono">
                <tr>
                  <th className="p-3.5">Rank</th>
                  <th className="p-3.5">Student Name</th>
                  <th className="p-3.5">Register No</th>
                  <th className="p-3.5">Assigned Class</th>
                  <th className="p-3.5 text-center">Tests Done</th>
                  <th className="p-3.5 text-center">No. of Warnings</th>
                  <th className="p-3.5 text-right">Marks / Points</th>
                  <th className="p-3.5 text-right">Percentage</th>
                  <th className="p-3.5 text-center">Status</th>
                  {onInspectCandidate && <th className="p-3.5 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {filteredRankedStudents.map((item) => {
                  const isTop3 = item.rank <= 3;
                  return (
                    <tr
                      key={item.student.id}
                      className={`hover:bg-slate-800/40 transition ${
                        isTop3 ? 'bg-indigo-950/10' : ''
                      }`}
                    >
                      {/* Rank Number */}
                      <td className="p-3.5 font-mono">
                        {item.rank === 1 ? (
                          <span className="w-7 h-7 rounded-full bg-amber-500 text-slate-950 font-extrabold text-xs flex items-center justify-center shadow">
                            🥇 1
                          </span>
                        ) : item.rank === 2 ? (
                          <span className="w-7 h-7 rounded-full bg-slate-300 text-slate-950 font-extrabold text-xs flex items-center justify-center shadow">
                            🥈 2
                          </span>
                        ) : item.rank === 3 ? (
                          <span className="w-7 h-7 rounded-full bg-amber-700 text-white font-extrabold text-xs flex items-center justify-center shadow">
                            🥉 3
                          </span>
                        ) : (
                          <span className="text-slate-400 font-bold text-xs px-2 py-1 rounded bg-slate-950 border border-slate-800">
                            #{item.rank}
                          </span>
                        )}
                      </td>

                      {/* Student Name */}
                      <td className="p-3.5 font-bold text-white">
                        <div className="flex items-center space-x-2.5">
                          <UserAvatar
                            name={item.student.name}
                            avatarUrl={item.student.avatar || (item.student as any).profilePicUrl || (item.student as any).photoUrl}
                            sizeClassName="w-8 h-8"
                            textClassName="text-xs"
                          />
                          <div>
                            <div className="font-bold text-white">{item.student.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {item.student.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Register Number */}
                      <td className="p-3.5 font-mono text-indigo-400 font-semibold">
                        {item.registerNumber}
                      </td>

                      {/* Assigned Class */}
                      <td className="p-3.5">
                        <div className="flex flex-wrap gap-1">
                          {item.assignedClasses.length > 0 ? (
                            item.assignedClasses.map((c) => (
                              <span
                                key={c.id}
                                className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700"
                              >
                                {c.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-slate-500 text-[10px] italic">
                              {item.department}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Tests Done */}
                      <td className="p-3.5 text-center font-mono">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-white font-bold">
                          {item.assessmentsCompleted}
                        </span>
                      </td>

                      {/* No. of Warnings */}
                      <td className="p-3.5 text-center font-mono">
                        <span
                          className={`inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-bold font-mono border ${
                            item.warningsCount >= 3
                              ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                              : item.warningsCount > 0
                              ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                              : 'bg-slate-950 text-slate-300 border-slate-800'
                          }`}
                        >
                          {item.warningsCount}
                        </span>
                      </td>

                      {/* Marks Score */}
                      <td className="p-3.5 text-right font-mono text-white">
                        <span className="font-bold text-white">{item.totalScore}</span>
                        <span className="text-slate-400 font-normal">
                          {' '}/ {item.totalPossibleScore > 0 ? item.totalPossibleScore : (item.assessmentsCompleted > 0 ? 100 : '-')} pts
                        </span>
                      </td>

                      {/* Percentage */}
                      <td className="p-3.5 text-right font-mono font-bold">
                        <span
                          className={
                            item.percentageScore >= 80
                              ? 'text-emerald-400'
                              : item.percentageScore >= 50
                              ? 'text-indigo-400'
                              : item.percentageScore > 0
                              ? 'text-amber-400'
                              : 'text-slate-500'
                          }
                        >
                          {item.percentageScore}%
                        </span>
                      </td>

                      {/* Status Badge */}
                      <td className="p-3.5 text-center">
                        {item.performanceTier === 'EXCELLENT' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            🌟 Top Performer
                          </span>
                        )}
                        {item.performanceTier === 'GOOD' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                            👍 Proficient
                          </span>
                        )}
                        {item.performanceTier === 'NEEDS_IMPROVEMENT' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            ⚠️ Needs Focus
                          </span>
                        )}
                        {item.performanceTier === 'NOT_ATTEMPTED' && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-500 border border-slate-700/60">
                            Not Attempted
                          </span>
                        )}
                      </td>

                      {/* Inspect Action */}
                      {onInspectCandidate && (() => {
                        const candidateAliases = getCandidateAliases(item.student.id);
                        if (item.student.email) candidateAliases.push(item.student.email.toLowerCase());
                        if (item.student.registerNumber) candidateAliases.push(item.student.registerNumber.toLowerCase());
                        if (item.student.registerNo) candidateAliases.push(item.student.registerNo.toLowerCase());

                        const matchingSessions = sessions.filter((s) => {
                          if (s.candidateId === item.student.id) return true;
                          if (item.student.email && s.candidateEmail && s.candidateEmail.toLowerCase() === item.student.email.toLowerCase()) return true;
                          if (item.student.registerNumber && s.candidateRegisterNo && s.candidateRegisterNo.toLowerCase() === item.student.registerNumber.toLowerCase()) return true;
                          const sessAliases = getCandidateAliases(s);
                          return candidateAliases.some((alias) => sessAliases.includes(alias));
                        });

                        const studentSess = matchingSessions.sort(
                          (a, b) =>
                            new Date(b.completedAt || b.updatedAt || b.startedAt || 0).getTime() -
                            new Date(a.completedAt || a.updatedAt || a.startedAt || 0).getTime()
                        )[0];

                        return (
                          <td className="p-3.5 text-center">
                            {studentSess ? (
                              <button
                                onClick={() => onInspectCandidate(studentSess.id)}
                                className="px-2.5 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[11px] font-semibold transition flex items-center gap-1 mx-auto cursor-pointer shadow-sm active:scale-95"
                                title="Inspect Candidate Proctoring, Video & Submissions"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Inspect</span>
                              </button>
                            ) : (
                              <span className="text-[10px] text-slate-500 italic">No Session</span>
                            )}
                          </td>
                        );
                      })()}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
