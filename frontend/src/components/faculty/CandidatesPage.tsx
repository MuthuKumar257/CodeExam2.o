import React, { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { GraduationCap, Mail, Plus, Search, UserPlus, CheckCircle2, FileSpreadsheet, Upload, AlertCircle, Trash2, HelpCircle, Download, Key, Loader2, Edit3, RefreshCw } from 'lucide-react';
import { Classroom, User } from '../../types';
import { saveUserToFirestore, saveClassToFirestore } from '../../services/firebase';
import { isStudentAssignedToClass, isStudentUser, syncStudentsToClassroom } from '../../utils/classUtils';

interface CandidatesPageProps {
  selectedClass: Classroom | null;
  classes?: Classroom[];
  users: User[];
  onAddStudent: (classId: string, studentData: { name: string; email: string; registerNo?: string }) => Promise<void>;
  onRemoveStudents: (classId: string, studentIds: string[]) => Promise<void>;
  onResetStudentPassword?: (studentId: string) => Promise<string>;
  onDeleteStudentUser?: (studentId: string) => Promise<void>;
  onUpdateUser?: (updatedUser: User) => Promise<void> | void;
  onUpdateClass?: (updatedClass: Classroom) => Promise<void> | void;
}

type ModalTab = 'SINGLE' | 'BULK';

interface ParsedStudent {
  name: string;
  email: string;
  registerNo?: string;
  isValid: boolean;
  errorMsg?: string;
}

export const CandidatesPage: React.FC<CandidatesPageProps> = ({
  selectedClass,
  classes = [],
  users,
  onAddStudent,
  onRemoveStudents,
  onResetStudentPassword,
  onDeleteStudentUser,
  onUpdateUser,
  onUpdateClass,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [activeTab, setActiveTab] = useState<ModalTab>('SINGLE');
  const [isSyncing, setIsSyncing] = useState(false);

  // Single Student state
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [newStudentRegisterNo, setNewStudentRegisterNo] = useState('');

  // Bulk Student states
  const [bulkText, setBulkText] = useState('');
  const [bulkStudents, setBulkStudents] = useState<ParsedStudent[]>([]);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number } | null>(null);

  // Edit Student state
  const [editingStudent, setEditingStudent] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRegNo, setEditRegNo] = useState('');
  const [editDept, setEditDept] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(null);
  const [resettingStudentId, setResettingStudentId] = useState<string | null>(null);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [successMsg, setSuccessMsg] = useState('');
  const [actionBannerMsg, setActionBannerMsg] = useState('');
  const [actionErrorMsg, setActionErrorMsg] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleOpenEditStudent = (student: User) => {
    setEditingStudent(student);
    setEditName(student.name || '');
    setEditEmail(student.email || '');
    setEditRegNo(student.registerNumber || student.registerNo || '');
    setEditDept(student.department || '');
  };

  const handleSaveEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent || !editName.trim() || !editEmail.trim()) return;

    setIsSavingEdit(true);
    setActionErrorMsg('');
    try {
      const updatedUser: User = {
        ...editingStudent,
        name: editName.trim(),
        email: editEmail.trim(),
        registerNumber: editRegNo.trim().toUpperCase(),
        registerNo: editRegNo.trim().toUpperCase(),
        department: editDept.trim(),
      };

      await saveUserToFirestore(updatedUser);
      if (onUpdateUser) {
        await onUpdateUser(updatedUser);
      }

      setActionBannerMsg(`Student details for "${updatedUser.name}" updated successfully.`);
      setTimeout(() => setActionBannerMsg(''), 4000);
      setEditingStudent(null);
    } catch (err: any) {
      setActionErrorMsg(err?.message || 'Failed to update student details.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Clear selections when class changes
  React.useEffect(() => {
    setSelectedStudentIds([]);
  }, [selectedClass?.id]);

  const handleResetStudentPassword = async (student: User) => {
    if (window.confirm(`Reset password for student "${student.name}" (${student.email}) to default "Student@123"?`)) {
      try {
        setResettingStudentId(student.id);
        setActionErrorMsg('');
        if (onResetStudentPassword) {
          await onResetStudentPassword(student.id);
        } else {
          await saveUserToFirestore({ ...student, password: 'Student@123' });
        }
        setActionBannerMsg(`Password for "${student.name}" reset to default "Student@123".`);
        setTimeout(() => setActionBannerMsg(''), 4000);
      } catch (err) {
        setActionErrorMsg(err instanceof Error ? err.message : 'Failed to reset student password.');
      } finally {
        setResettingStudentId(null);
      }
    }
  };

  const handleDeleteStudentClick = async (student: User) => {
    if (window.confirm("Are you sure you want to delete this item? This action cannot be undone.")) {
      setDeletingStudentId(student.id);
      setActionErrorMsg('');
      try {
        if (onDeleteStudentUser) {
          await onDeleteStudentUser(student.id);
        } else {
          throw new Error('Student deletion is unavailable.');
        }
        setActionBannerMsg(`Student "${student.name}" deleted successfully.`);
        setTimeout(() => setActionBannerMsg(''), 4000);
      } catch (err: any) {
        setActionErrorMsg(err?.message || 'Failed to delete student.');
      } finally {
        setDeletingStudentId(null);
      }
    }
  };

  const handleBulkRemove = async () => {
    if (selectedStudentIds.length === 0 || !selectedClass) return;
    if (!window.confirm(`Are you sure you want to remove the ${selectedStudentIds.length} selected student(s) from this classroom?`)) {
      return;
    }
    
    setIsRemoving(true);
    try {
      await onRemoveStudents(selectedClass.id, selectedStudentIds);
      setSelectedStudentIds([]);
    } catch (e) {
      console.error('Failed to remove students:', e);
    } finally {
      setIsRemoving(false);
    }
  };

  const handleDownloadTemplate = () => {
    const studentData = [
      { 'Full Name': 'Alex Rivera', 'Register Number': 'REG2026001', 'Email Address': 'student1@example.com' },
      { 'Full Name': 'Brian Chen', 'Register Number': 'REG2026002', 'Email Address': 'student2@example.com' },
      { 'Full Name': 'Clara Oswald', 'Register Number': 'REG2026003', 'Email Address': 'student3@example.com' },
    ];
    const worksheet = XLSX.utils.json_to_sheet(studentData);
    worksheet['!cols'] = [
      { wch: 22 },
      { wch: 20 },
      { wch: 30 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Student Template');
    XLSX.writeFile(workbook, 'student_import_template.xlsx');
  };

  if (!selectedClass) {
    return (
      <div className="p-6 text-center">
        <div className="max-w-md mx-auto bg-slate-900 border border-slate-800 p-8 rounded-2xl space-y-4">
          <GraduationCap className="w-12 h-12 text-slate-500 mx-auto" />
          <h3 className="text-base font-bold text-white">No Classroom Selected</h3>
          <p className="text-xs text-slate-400">
            Please select an assigned classroom from the top filter bar to manage student rosters and register candidates.
          </p>
        </div>
      </div>
    );
  }

  // Find users belonging to this class
  const classStudents = users.filter(
    (u) => isStudentUser(u) && isStudentAssignedToClass(selectedClass, u)
  );

  // Auto sync roster whenever selectedClass or users list changes
  const lastAutoSyncedKey = useRef<string>('');
  useEffect(() => {
    if (!selectedClass || !users || users.length === 0) return;

    const currentKey = `${selectedClass.id}_${(selectedClass.studentIds || []).length}_${users.length}`;
    if (lastAutoSyncedKey.current === currentKey) return;

    let isMounted = true;
    const performAutoSync = async () => {
      try {
        const { updatedClass, updatedUsers } = syncStudentsToClassroom(selectedClass, users);

        let didUpdate = false;
        if (updatedClass.studentIds.length !== (selectedClass.studentIds || []).length) {
          didUpdate = true;
          await saveClassToFirestore(updatedClass);
          if (onUpdateClass && isMounted) {
            await onUpdateClass(updatedClass);
          }
        }

        for (const u of updatedUsers) {
          didUpdate = true;
          await saveUserToFirestore(u);
          if (onUpdateUser && isMounted) {
            await onUpdateUser(u);
          }
        }

        if (isMounted) {
          lastAutoSyncedKey.current = currentKey;
        }
      } catch (err) {
        console.warn('[CandidatesPage] Background auto-sync error:', err);
      }
    };

    performAutoSync();

    return () => {
      isMounted = false;
    };
  }, [selectedClass, users, onUpdateClass, onUpdateUser]);

  const filteredStudents = classStudents.filter(
    (student) =>
      (student.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (student.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (student.registerNo && String(student.registerNo).toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const parseTextRows = (text: string) => {
    const lines = text.split(/\r?\n/);
    const parsed: ParsedStudent[] = [];
    const existingEmails = new Set(students.map((s) => (s.email || '').toLowerCase().trim()));
    const seenEmailsInBatch = new Set<string>();

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      // Detect separator: Tab (Excel paste), Comma, or Semicolon
      let parts: string[] = [];
      if (trimmed.includes('\t')) {
        parts = trimmed.split('\t');
      } else if (trimmed.includes(';')) {
        parts = trimmed.split(';');
      } else {
        parts = trimmed.split(',');
      }

      const cleanParts = parts.map((p) => p.trim().replace(/^["']|["']$/g, ''));
      if (cleanParts.length === 0) return;

      let name = '';
      let email = '';
      let regNo = '';

      // Intelligent mapping based on parts presence
      if (cleanParts.length >= 3) {
        // Assume format: Name, Email, RegisterNo OR RegisterNo, Name, Email
        if (cleanParts[1].includes('@')) {
          name = cleanParts[0];
          email = cleanParts[1];
          regNo = cleanParts[2];
        } else if (cleanParts[2].includes('@')) {
          name = cleanParts[0];
          regNo = cleanParts[1];
          email = cleanParts[2];
        } else {
          name = cleanParts[0];
          email = cleanParts[2];
          regNo = cleanParts[1];
        }
      } else if (cleanParts.length === 2) {
        // Name, Email
        if (cleanParts[1].includes('@')) {
          name = cleanParts[0];
          email = cleanParts[1];
        } else if (cleanParts[0].includes('@')) {
          email = cleanParts[0];
          name = cleanParts[1];
        }
      } else {
        // Just raw line
        if (cleanParts[0].includes('@')) {
          email = cleanParts[0];
          name = cleanParts[0].split('@')[0];
        }
      }

      // Validations
      const cleanEmail = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const isValidEmail = emailRegex.test(cleanEmail);
      const isDuplicateInFile = cleanEmail ? seenEmailsInBatch.has(cleanEmail) : false;
      const isAlreadyInRoster = cleanEmail ? existingEmails.has(cleanEmail) : false;

      let isValid = isValidEmail && name.length > 0 && !isDuplicateInFile && !isAlreadyInRoster;
      let errorMsg: string | undefined;

      if (!cleanEmail) errorMsg = 'Missing Email Address';
      else if (!isValidEmail) errorMsg = 'Invalid Email Format';
      else if (isDuplicateInFile) errorMsg = 'Duplicate email in file';
      else if (isAlreadyInRoster) errorMsg = 'Email already in roster';
      else if (!name) errorMsg = 'Missing Name';
      else seenEmailsInBatch.add(cleanEmail);

      parsed.push({
        name: name || (cleanEmail ? cleanEmail.split('@')[0] : 'Unknown Student'),
        email: cleanEmail,
        registerNo: regNo || undefined,
        isValid,
        errorMsg,
      });
    });

    setBulkStudents(parsed);
  };

  const handleTextPasteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setBulkText(value);
    parseTextRows(value);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isBinary = !file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.txt');
    const reader = new FileReader();

    reader.onload = (event) => {
      if (isBinary) {
        try {
          const buffer = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const csvText = XLSX.utils.sheet_to_csv(firstSheet);
          setBulkText(csvText);
          parseTextRows(csvText);
        } catch {
          setBulkText('');
        }
      } else {
        const text = event.target?.result as string;
        setBulkText(text);
        parseTextRows(text);
      }
    };

    if (isBinary) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName || !newStudentEmail) return;
    setIsSubmitting(true);
    setSuccessMsg('');

    try {
      await onAddStudent(selectedClass.id, {
        name: newStudentName.trim(),
        email: newStudentEmail.trim().toLowerCase(),
        registerNo: newStudentRegisterNo ? newStudentRegisterNo.toUpperCase().trim() : undefined,
      });
      setSuccessMsg('Student successfully registered and added to this classroom!');
      setNewStudentName('');
      setNewStudentEmail('');
      setNewStudentRegisterNo('');
      setTimeout(() => {
        setSuccessMsg('');
        setShowAddModal(false);
      }, 1500);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkSubmit = async () => {
    const validStudents = bulkStudents.filter((s) => s.isValid);
    if (validStudents.length === 0) return;

    setIsSubmitting(true);
    setSuccessMsg('');
    setImportProgress({ current: 0, total: validStudents.length });

    try {
      for (let i = 0; i < validStudents.length; i++) {
        const student = validStudents[i];
        await onAddStudent(selectedClass.id, {
          name: student.name.trim(),
          email: student.email.trim().toLowerCase(),
          registerNo: student.registerNo ? student.registerNo.toUpperCase().trim() : undefined,
        });
        setImportProgress({ current: i + 1, total: validStudents.length });
      }

      setSuccessMsg(`Successfully imported and enrolled ${validStudents.length} students!`);
      setBulkText('');
      setBulkStudents([]);
      setTimeout(() => {
        setSuccessMsg('');
        setShowAddModal(false);
        setImportProgress(null);
      }, 2000);
    } catch (err) {
      console.error('Bulk import error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between pb-6 border-b border-white/10 gap-4">
        <div>
          <span className="label-mono block mb-1">Student Roster & Credentials</span>
          <h1 className="font-display text-4xl font-extrabold text-white tracking-tight leading-none mb-2">
            Classroom Roster: {selectedClass.name}
          </h1>
          <p className="text-zinc-400 text-sm">
            Enroll students, view the classroom roster, and manage candidate credentials.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <div
            className="flex items-center space-x-2 px-3.5 py-2.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold text-xs shadow-sm"
            title="Auto Sync is active: Candidate rosters are continuously matched and synchronized"
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Auto Sync Active</span>
          </div>

          <button
            onClick={() => {
              setShowAddModal(true);
              setActiveTab('SINGLE');
              setBulkStudents([]);
              setBulkText('');
              setSuccessMsg('');
            }}
            className="flex items-center space-x-2 px-4 py-2.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Enroll New Student</span>
          </button>
        </div>
      </div>

      {/* Search and List */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
        {actionBannerMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 font-medium animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{actionBannerMsg}</span>
          </div>
        )}
        {actionErrorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 font-medium animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{actionErrorMsg}</span>
          </div>
        )}

        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search student roster by name, email, or register number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* Bulk Selection Action Bar */}
        {selectedStudentIds.length > 0 && (
          <div className="flex items-center justify-between p-3 px-4 bg-rose-500/10 border border-rose-500/20 rounded-xl animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2 text-xs font-semibold text-rose-400">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
              <span>{selectedStudentIds.length} candidate student(s) selected for removal</span>
            </div>
            <button
              type="button"
              disabled={isRemoving}
              onClick={handleBulkRemove}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold text-xs transition cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isRemoving ? 'Removing...' : 'Remove From Class'}</span>
            </button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 font-semibold border-b border-slate-800 font-mono">
              <tr>
                <th className="p-3.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={filteredStudents.length > 0 && filteredStudents.every((s) => selectedStudentIds.includes(s.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const allIds = Array.from(new Set([...selectedStudentIds, ...filteredStudents.map((s) => s.id)]));
                        setSelectedStudentIds(allIds);
                      } else {
                        const filteredIds = filteredStudents.map((s) => s.id);
                        setSelectedStudentIds(selectedStudentIds.filter((id) => !filteredIds.includes(id)));
                      }
                    }}
                    className="w-4 h-4 text-indigo-600 bg-slate-950 border-slate-800 rounded focus:ring-indigo-500 focus:ring-offset-slate-900 focus:ring-2 cursor-pointer"
                  />
                </th>
                <th className="p-3.5">Student Name</th>
                <th className="p-3.5">Register No.</th>
                <th className="p-3.5">Email Address</th>
                <th className="p-3.5">Status</th>
                <th className="p-3.5">Enrolled On</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-300">
              {filteredStudents.map((student) => {
                const isSelected = selectedStudentIds.includes(student.id);
                return (
                  <tr key={student.id} className={`hover:bg-slate-800/20 transition-colors ${isSelected ? 'bg-indigo-500/5' : ''}`}>
                    <td className="p-3.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {
                          if (isSelected) {
                            setSelectedStudentIds(selectedStudentIds.filter((id) => id !== student.id));
                          } else {
                            setSelectedStudentIds([...selectedStudentIds, student.id]);
                          }
                        }}
                        className="w-4 h-4 text-indigo-600 bg-slate-950 border-slate-800 rounded focus:ring-indigo-500 focus:ring-offset-slate-900 focus:ring-2 cursor-pointer"
                      />
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center space-x-3">
                        <div className="w-7 h-7 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center font-bold text-indigo-400 text-[10px]">
                          {student.name.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="font-semibold text-white">{student.name}</span>
                      </div>
                    </td>
                    <td className="p-3.5 font-mono text-indigo-400 font-bold uppercase text-xs">
                      {student.registerNo || (
                        <span className="text-slate-600 italic text-[11px] font-normal">N/A</span>
                      )}
                    </td>
                    <td className="p-3.5 font-mono text-slate-400">{student.email}</td>
                    <td className="p-3.5">
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        <span className="w-1 h-1 rounded-full bg-emerald-400"></span>
                        <span>ENROLLED</span>
                      </span>
                    </td>
                    <td className="p-3.5 text-slate-400 font-mono text-[11px]">
                      {student.createdAt ? new Date(student.createdAt).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="p-3.5 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditStudent(student)}
                          className="text-slate-500 hover:text-indigo-400 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
                          title="Edit Student Details"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResetStudentPassword(student)}
                          disabled={resettingStudentId === student.id || deletingStudentId === student.id}
                          className="text-slate-500 hover:text-amber-400 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
                          title="Reset Password to default Student@123"
                        >
                          {resettingStudentId === student.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteStudentClick(student)}
                          disabled={deletingStudentId === student.id || resettingStudentId === student.id}
                          className="text-slate-500 hover:text-rose-400 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer disabled:opacity-50"
                          title="Delete Student from Classroom & Database"
                        >
                          {deletingStudentId === student.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredStudents.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-xs text-slate-500 italic">
                    No enrolled students found matching the criteria. Click "Enroll New Student" to add students.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add & Import Student modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full shadow-2xl relative my-8 flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                <span>Enroll Student Into {selectedClass.name}</span>
              </h3>

              {/* Tab Toggles */}
              {!isSubmitting && !successMsg && (
                <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800/80 mt-4 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setActiveTab('SINGLE')}
                    className={`flex-1 py-2 rounded-md text-center transition cursor-pointer ${
                      activeTab === 'SINGLE'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Single Student
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('BULK')}
                    className={`flex-1 py-2 rounded-md text-center transition cursor-pointer ${
                      activeTab === 'BULK'
                        ? 'bg-indigo-600 text-white shadow'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Bulk Excel / CSV Import
                  </button>
                </div>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-4 flex-1">
              {successMsg ? (
                <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-center space-y-3">
                  <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
                  <p className="font-bold text-sm">{successMsg}</p>
                </div>
              ) : importProgress ? (
                <div className="p-6 space-y-4 text-center">
                  <div className="relative w-20 h-20 mx-auto">
                    <svg className="w-full h-full rotate-270">
                      <circle cx="40" cy="40" r="34" className="stroke-slate-800 fill-none" strokeWidth="6" />
                      <circle
                        cx="40"
                        cy="40"
                        r="34"
                        className="stroke-indigo-500 fill-none transition-all duration-300"
                        strokeWidth="6"
                        strokeDasharray={2 * Math.PI * 34}
                        strokeDashoffset={2 * Math.PI * 34 * (1 - importProgress.current / importProgress.total)}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center font-mono font-bold text-xs text-indigo-400">
                      {Math.round((importProgress.current / importProgress.total) * 100)}%
                    </div>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">Importing Roster Candidates...</h4>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Enrolling {importProgress.current} of {importProgress.total} students into class roster.
                    </p>
                  </div>
                </div>
              ) : activeTab === 'SINGLE' ? (
                <form onSubmit={handleSingleSubmit} className="space-y-4 text-xs">
                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Student Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g., Alex Rivera"
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Register Number (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g., REG2026001"
                      value={newStudentRegisterNo}
                      onChange={(e) => setNewStudentRegisterNo(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs font-mono uppercase"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-400 mb-1 font-medium">Email Address</label>
                    <input
                      type="email"
                      required
                      placeholder="e.g., student@university.edu"
                      value={newStudentEmail}
                      onChange={(e) => setNewStudentEmail(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs font-mono"
                    />
                  </div>

                  <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 flex items-center space-x-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{isSubmitting ? 'Registering...' : 'Enroll Candidate'}</span>
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4 text-xs">
                  {/* CSV / Paste Input instructions */}
                  <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
                      <h4 className="text-white font-bold flex items-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                        Spreadsheet Excel / CSV Format Guide
                      </h4>
                      <button
                        type="button"
                        onClick={handleDownloadTemplate}
                        className="flex items-center gap-1 text-[10px] font-bold text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 px-2 py-1 rounded transition cursor-pointer self-start sm:self-auto"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download CSV/Excel Template</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed mt-1">
                      Format your Excel or Google Sheet as shown below, export to <strong>CSV</strong> or simply <strong>copy the grid cells (Ctrl+C)</strong> and paste them in the text area:
                    </p>
                    <div className="bg-slate-900 border border-slate-800 rounded p-2.5 font-mono text-[10px] text-emerald-400 mt-2">
                      Full Name, Register Number, Email Address<br />
                      Alex Rivera, REG2026001, alex.r@university.edu<br />
                      Brian Chen, REG2026002, brian.c@university.edu
                    </div>
                  </div>

                  {/* Excel file uploader and text paste toggle */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {/* File Upload Zone */}
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 bg-slate-950 p-4 rounded-xl text-center cursor-pointer flex flex-col items-center justify-center space-y-2 transition"
                    >
                      <Upload className="w-6 h-6 text-indigo-400" />
                      <span className="text-slate-300 font-bold block text-[11px]">Upload Excel File (.xlsx) or CSV</span>
                      <span className="text-[10px] text-slate-500 block">Drag & drop or browse .xlsx, .xls, .csv</span>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </div>

                    {/* Pasting Box instructions */}
                    <div className="flex flex-col justify-between p-3.5 bg-slate-950 border border-slate-800 rounded-xl">
                      <div className="space-y-1">
                        <span className="text-white font-bold block text-[11px]">Direct Grid Paste Buffer</span>
                        <p className="text-[10px] text-slate-500 leading-normal">
                          Select the student range in Microsoft Excel, copy it, and paste it directly into the text field below.
                        </p>
                      </div>
                      <span className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded font-bold self-start mt-2">
                        Tab & Comma Delimiters Allowed
                      </span>
                    </div>
                  </div>

                  {/* Textarea for Paste / View */}
                  <div className="space-y-1">
                    <label className="block text-slate-400 mb-1 font-medium">Paste Spreadsheet Data Here</label>
                    <textarea
                      rows={4}
                      value={bulkText}
                      onChange={handleTextPasteChange}
                      placeholder="e.g. Alex Rivera, REG2026001, alex@univ.edu&#10;Brian Chen, REG2026002, brian@univ.edu"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs font-mono"
                    />
                  </div>

                  {/* Live parsed preview grid */}
                  {bulkStudents.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="font-bold">Live Grid Parse Preview ({bulkStudents.filter(s => s.isValid).length} Valid Students parsed)</span>
                        <button
                          type="button"
                          onClick={() => {
                            setBulkStudents([]);
                            setBulkText('');
                          }}
                          className="text-rose-400 hover:text-rose-300 flex items-center gap-1 font-bold"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Clear Preview</span>
                        </button>
                      </div>

                      <div className="border border-slate-800 rounded-xl overflow-hidden max-h-[180px] overflow-y-auto bg-slate-950">
                        <table className="w-full text-left text-[11px] text-slate-300">
                          <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 font-semibold sticky top-0">
                            <tr>
                              <th className="p-2.5">Name</th>
                              <th className="p-2.5">Register No.</th>
                              <th className="p-2.5">Email Address</th>
                              <th className="p-2.5 text-right">Parsed Checks</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-900/60 font-mono">
                            {bulkStudents.map((student, idx) => (
                              <tr key={idx} className={student.isValid ? 'hover:bg-slate-900/40' : 'bg-rose-950/15 text-rose-300'}>
                                <td className="p-2.5 font-sans font-medium">{student.name}</td>
                                <td className="p-2.5 font-bold uppercase text-indigo-400">{student.registerNo || 'N/A'}</td>
                                <td className="p-2.5 text-slate-400">{student.email || 'None'}</td>
                                <td className="p-2.5 text-right font-sans font-bold">
                                  {student.isValid ? (
                                    <span className="text-emerald-400">● Valid Record</span>
                                  ) : (
                                    <span className="text-rose-400 flex items-center justify-end gap-1 text-[10px]">
                                      <AlertCircle className="w-3 h-3" />
                                      {student.errorMsg}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Submission triggers */}
                  <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowAddModal(false)}
                      className="px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      disabled={bulkStudents.filter((s) => s.isValid).length === 0 || isSubmitting}
                      onClick={handleBulkSubmit}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 flex items-center space-x-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>
                        {isSubmitting
                          ? 'Importing...'
                          : `Bulk Enroll ${bulkStudents.filter((s) => s.isValid).length} Candidates`}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Student Details Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveEditStudent}
            className="bg-slate-900 border border-slate-800 p-6 rounded-2xl max-w-md w-full space-y-4 shadow-2xl animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-indigo-400" />
                <span>Edit Student Profile</span>
              </h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="text-slate-400 hover:text-white text-sm font-bold"
              >
                &times;
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Full Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Email Address</label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Register / Roll No</label>
                <input
                  type="text"
                  placeholder="e.g., REG2026101"
                  value={editRegNo}
                  onChange={(e) => setEditRegNo(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-medium">Department</label>
                <input
                  type="text"
                  placeholder="e.g., Computer Science & Engineering"
                  value={editDept}
                  onChange={(e) => setEditDept(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSavingEdit}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
              >
                {isSavingEdit ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Changes</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
