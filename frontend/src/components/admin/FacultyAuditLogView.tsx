import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  Download,
  Clock,
  Activity,
  Plus,
  CheckCircle2,
  AlertCircle,
  Users,
  Settings,
  BookOpen,
  Building2,
  RefreshCw,
  FileText,
  KeyRound,
  X,
  Globe,
  ArrowUpDown,
  ArrowDown,
  ArrowUp
} from 'lucide-react';
import { AuditLog, User as UserType } from '../../types';

interface FacultyAuditLogViewProps {
  auditLogs: AuditLog[];
  users: UserType[];
  onAddLogEntry?: (entry: Omit<AuditLog, 'id'>) => Promise<void> | void;
}

export const FacultyAuditLogView: React.FC<FacultyAuditLogViewProps> = ({
  auditLogs = [],
  users = [],
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFacultyId, setSelectedFacultyId] = useState<string>('ALL');
  const [selectedActionCategory, setSelectedActionCategory] = useState<string>('ALL');
  const [selectedLogDetail, setSelectedLogDetail] = useState<AuditLog | null>(null);
  const [sortOrder, setSortOrder] = useState<'NEW_TO_OLD' | 'OLD_TO_NEW'>('NEW_TO_OLD');

  // Filter faculty members
  const facultyMembers = useMemo(() => {
    return users.filter(
      (u) => u.role === 'FACULTY' || u.role === 'faculty' || u.role === 'ADMIN' || u.role === 'admin'
    );
  }, [users]);

  // Map actions to human readable categories
  const getActionCategory = (action: string) => {
    const act = (action || '').toUpperCase();
    if (act.includes('ASSESSMENT') || act.includes('TEST') || act.includes('EXAM')) return 'ASSESSMENT';
    if (act.includes('QUESTION') || act.includes('BANK')) return 'QUESTION_BANK';
    if (act.includes('CLASS') || act.includes('ROSTER') || act.includes('DEPT')) return 'ROSTER';
    if (act.includes('SETTING') || act.includes('CONFIG') || act.includes('SECURITY')) return 'SECURITY';
    if (act.includes('USER') || act.includes('FACULTY') || act.includes('REGISTER') || act.includes('PASSWORD')) return 'USER_MGMT';
    return 'SYSTEM';
  };

  // Helper for styling action pills
  const getActionBadge = (action: string) => {
    const act = (action || '').toUpperCase();
    if (act.includes('CREATE') || act.includes('ADD') || act.includes('REGISTER')) {
      return {
        bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        icon: Plus,
        label: action.replace(/_/g, ' '),
      };
    }
    if (act.includes('UPDATE') || act.includes('EDIT') || act.includes('CONFIG')) {
      return {
        bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
        icon: Settings,
        label: action.replace(/_/g, ' '),
      };
    }
    if (act.includes('PASSWORD') || act.includes('SECURITY') || act.includes('KEY')) {
      return {
        bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        icon: KeyRound,
        label: action.replace(/_/g, ' '),
      };
    }
    if (act.includes('DELETE') || act.includes('PURGE') || act.includes('REMOVE')) {
      return {
        bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        icon: AlertCircle,
        label: action.replace(/_/g, ' '),
      };
    }
    return {
      bg: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
      icon: Activity,
      label: action.replace(/_/g, ' '),
    };
  };

  // Filtered and Sorted Audit Logs (Default: Newest to Oldest)
  const filteredLogs = useMemo(() => {
    return auditLogs
      .filter((log) => {
        // 1. Search term match (User Name, Action, Details, IP)
        const term = searchTerm.toLowerCase().trim();
        const matchSearch =
          !term ||
          log.userName?.toLowerCase().includes(term) ||
          log.action?.toLowerCase().includes(term) ||
          log.details?.toLowerCase().includes(term) ||
          log.ipAddress?.toLowerCase().includes(term);

        // 2. Faculty match
        const matchFaculty =
          selectedFacultyId === 'ALL' || log.userId === selectedFacultyId;

        // 3. Action Category match
        const cat = getActionCategory(log.action);
        const matchCategory =
          selectedActionCategory === 'ALL' || cat === selectedActionCategory;

        return matchSearch && matchFaculty && matchCategory;
      })
      .sort((a, b) => {
        const timeA = new Date(a.timestamp || 0).getTime();
        const timeB = new Date(b.timestamp || 0).getTime();
        return sortOrder === 'NEW_TO_OLD' ? timeB - timeA : timeA - timeB;
      });
  }, [auditLogs, searchTerm, selectedFacultyId, selectedActionCategory, sortOrder]);

  // Statistics
  const stats = useMemo(() => {
    const totalLogs = auditLogs.length;
    const uniqueFacultyCount = new Set(auditLogs.map((l) => l.userId)).size;
    const todayLogsCount = auditLogs.filter((l) => {
      const logDate = new Date(l.timestamp).toDateString();
      const todayDate = new Date().toDateString();
      return logDate === todayDate;
    }).length;

    const securityCount = auditLogs.filter(
      (l) => getActionCategory(l.action) === 'SECURITY' || getActionCategory(l.action) === 'USER_MGMT'
    ).length;

    return { totalLogs, uniqueFacultyCount, todayLogsCount, securityCount };
  }, [auditLogs]);

  // Export CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) return;
    const headers = ['Log ID', 'User Name', 'Role', 'Action', 'Details', 'IP Address', 'Timestamp'];
    const rows = filteredLogs.map((l) => [
      `"${l.id}"`,
      `"${l.userName || ''}"`,
      `"${l.userRole || ''}"`,
      `"${l.action || ''}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`,
      `"${l.ipAddress || ''}"`,
      `"${l.timestamp || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `faculty_audit_trail_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between pb-6 border-b border-white/10 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="label-mono">Institutional Security & Governance</span>
            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-bold border border-indigo-500/30">
              FACULTY AUDIT TRAIL
            </span>
          </div>
          <h1 className="font-display text-3xl font-extrabold text-white tracking-tight leading-none mb-2 flex items-center gap-2.5">
            <ShieldCheck className="w-8 h-8 text-indigo-400" />
            Faculty Activity Audit Logs
          </h1>
          <p className="text-zinc-400 text-xs max-w-2xl">
            Real-time, immutable history tracking faculty operations, assessment creation, roster assignments, security modifications, and administrative activity.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={handleExportCSV}
            disabled={filteredLogs.length === 0}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 hover:text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4 text-slate-400" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Total Faculty Log Entries</span>
            <FileText className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-bold text-white font-mono">{stats.totalLogs}</div>
          <div className="text-[10px] text-slate-500">Historical action count</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Active Faculty Logged</span>
            <Users className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-cyan-400 font-mono">{stats.uniqueFacultyCount}</div>
          <div className="text-[10px] text-slate-500">Instructors with audit events</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Today's Activity</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 font-mono">{stats.todayLogsCount}</div>
          <div className="text-[10px] text-slate-500">Recorded in last 24 hrs</div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Security & Config Logs</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 font-mono">{stats.securityCount}</div>
          <div className="text-[10px] text-slate-500">Security & policy updates</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search by faculty name, action name, details or IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>

          {/* Faculty Filter */}
          <div className="md:col-span-4">
            <select
              value={selectedFacultyId}
              onChange={(e) => setSelectedFacultyId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
            >
              <option value="ALL">All Faculty Members ({facultyMembers.length})</option>
              {facultyMembers.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} ({f.email})
                </option>
              ))}
            </select>
          </div>

          {/* Action Category Filter */}
          <div className="md:col-span-3">
            <select
              value={selectedActionCategory}
              onChange={(e) => setSelectedActionCategory(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition"
            >
              <option value="ALL">All Action Types</option>
              <option value="ASSESSMENT">Assessment Operations</option>
              <option value="QUESTION_BANK">Question Bank</option>
              <option value="ROSTER">Classrooms & Roster</option>
              <option value="SECURITY">Security & Config</option>
              <option value="USER_MGMT">Faculty & User Admin</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-2 border-t border-slate-800/80 text-slate-400">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-white">{filteredLogs.length}</strong> of{' '}
              <strong className="text-white">{auditLogs.length}</strong> log entries
            </span>
            {(searchTerm || selectedFacultyId !== 'ALL' || selectedActionCategory !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setSelectedFacultyId('ALL');
                  setSelectedActionCategory('ALL');
                }}
                className="text-indigo-400 hover:text-indigo-300 font-semibold ml-2 underline underline-offset-2"
              >
                Reset Filters
              </button>
            )}
          </div>

          {/* Sort Order Selector */}
          <div className="flex items-center gap-2 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
            <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1">
              <ArrowUpDown className="w-3 h-3 text-indigo-400" /> Sort:
            </span>
            <button
              onClick={() => setSortOrder('NEW_TO_OLD')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                sortOrder === 'NEW_TO_OLD'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Newest to Oldest ↓
            </button>
            <button
              onClick={() => setSortOrder('OLD_TO_NEW')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition ${
                sortOrder === 'OLD_TO_NEW'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Oldest to Newest ↑
            </button>
          </div>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th
                  onClick={() => setSortOrder(sortOrder === 'NEW_TO_OLD' ? 'OLD_TO_NEW' : 'NEW_TO_OLD')}
                  className="py-3 px-4 cursor-pointer hover:text-white transition select-none flex items-center gap-1.5"
                >
                  <span>Timestamp</span>
                  {sortOrder === 'NEW_TO_OLD' ? (
                    <ArrowDown className="w-3.5 h-3.5 text-indigo-400" />
                  ) : (
                    <ArrowUp className="w-3.5 h-3.5 text-indigo-400" />
                  )}
                </th>
                <th className="py-3 px-4">Faculty Member</th>
                <th className="py-3 px-4">Action Event</th>
                <th className="py-3 px-4">Operation Details</th>
                <th className="py-3 px-4">IP Address</th>
                <th className="py-3 px-4 text-right">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {filteredLogs.map((log) => {
                const badge = getActionBadge(log.action);
                const IconComponent = badge.icon;
                const formattedDate = new Date(log.timestamp).toLocaleString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                });

                return (
                  <tr key={log.id} className="hover:bg-slate-800/50 transition duration-150">
                    <td className="py-3.5 px-4 font-mono text-slate-400 text-[11px] whitespace-nowrap">
                      {formattedDate}
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-indigo-400 text-xs shrink-0">
                          {log.userName ? log.userName.charAt(0).toUpperCase() : 'F'}
                        </div>
                        <div>
                          <div className="font-bold text-white leading-tight">{log.userName || 'Faculty User'}</div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1">
                            <span className="text-slate-500">{log.userRole || 'FACULTY'}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border ${badge.bg}`}
                      >
                        <IconComponent className="w-3 h-3 shrink-0" />
                        <span>{badge.label}</span>
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-slate-300 max-w-md truncate">
                      {log.details}
                    </td>

                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      <div className="flex items-center space-x-1.5">
                        <Globe className="w-3 h-3 text-slate-500" />
                        <span>{log.ipAddress || '192.168.1.1'}</span>
                      </div>
                    </td>

                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        onClick={() => setSelectedLogDetail(log)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400 hover:text-indigo-300 font-medium text-[11px] transition"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <ShieldCheck className="w-10 h-10 mx-auto mb-2 text-slate-600 opacity-60" />
                    <p className="text-sm font-semibold text-slate-400">No faculty audit logs found</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Try adjusting search query or reset action filters to view institutional activity.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Log Detail Modal */}
      {selectedLogDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-base font-bold text-white">Audit Log Record Details</h3>
                <p className="text-[11px] text-slate-400 font-mono">ID: {selectedLogDetail.id}</p>
              </div>
              <button
                onClick={() => setSelectedLogDetail(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950 rounded-xl border border-slate-800">
                <div>
                  <div className="text-[10px] text-slate-500 font-semibold">FACULTY MEMBER</div>
                  <div className="font-bold text-white">{selectedLogDetail.userName}</div>
                  <div className="text-[11px] text-slate-400">{selectedLogDetail.userRole}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-semibold">ACTION EVENT</div>
                  <div className="font-bold text-indigo-400">{selectedLogDetail.action}</div>
                  <div className="text-[11px] text-slate-400 font-mono">{selectedLogDetail.ipAddress}</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-500 font-semibold mb-1">OPERATION NARRATIVE</div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-200 leading-relaxed">
                  {selectedLogDetail.details}
                </div>
              </div>

              <div>
                <div className="text-[10px] text-slate-500 font-semibold mb-1">TIMESTAMP (UTC)</div>
                <div className="p-2.5 bg-slate-950 rounded-xl border border-slate-800 text-slate-400 font-mono text-[11px]">
                  {selectedLogDetail.timestamp}
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedLogDetail(null)}
                className="px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
