import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  FileText,
  Download,
  AlertTriangle,
  CheckCircle,
  XCircle,
  X,
  Loader2,
  Users,
  GraduationCap,
  Sparkles,
  Check,
} from 'lucide-react';
import { User, Classroom } from '../../types';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  type: 'FACULTY' | 'STUDENT';
  existingUsers: User[];
  classes: Classroom[];
  onAddUser: (userData: Partial<User>) => Promise<void>;
  onSuccess: (count: number) => void;
}

interface ParsedRecord {
  id: string;
  name: string;
  email: string;
  identifier: string; // registerNumber or employeeId
  department: string;
  section?: string;
  isValid: boolean;
  validationError?: string;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({
  isOpen,
  onClose,
  type,
  existingUsers,
  classes,
  onAddUser,
  onSuccess,
}) => {
  const [pastedText, setPastedText] = useState('');
  const [parsedRecords, setParsedRecords] = useState<ParsedRecord[]>([]);
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isStudent = type === 'STUDENT';
  const roleLabel = isStudent ? 'Students' : 'Faculty Members';

  // Sample CSV Templates
  const studentSampleCsv = `Name, Email, Register Number, Department
John Doe, john.doe@university.edu, REG2024001, Computer Science & Engineering
Alice Smith, alice.smith@university.edu, REG2024002, Information Technology
Michael Brown, michael.b@university.edu, REG2024003, Electronics & Communication`;

  const facultySampleCsv = `Name, Email, Employee ID, Department
Dr. Alan Turing, alan.turing@university.edu, EMP-101, Computer Science & Engineering
Prof. Grace Hopper, grace.hopper@university.edu, EMP-102, Information Technology
Dr. John von Neumann, neumann@university.edu, EMP-103, Electronics & Communication`;

  const sampleContent = isStudent ? studentSampleCsv : facultySampleCsv;

  const handleDownloadTemplate = () => {
    const studentData = [
      { Name: 'John Doe', Email: 'john.doe@university.edu', 'Register Number': 'REG2024001', Department: 'Computer Science & Engineering' },
      { Name: 'Alice Smith', Email: 'alice.smith@university.edu', 'Register Number': 'REG2024002', Department: 'Information Technology' },
      { Name: 'Michael Brown', Email: 'michael.b@university.edu', 'Register Number': 'REG2024003', Department: 'Electronics & Communication' },
    ];
    const facultyData = [
      { Name: 'Dr. Alan Turing', Email: 'alan.turing@university.edu', 'Employee ID': 'EMP-101', Department: 'Computer Science & Engineering' },
      { Name: 'Prof. Grace Hopper', Email: 'grace.hopper@university.edu', 'Employee ID': 'EMP-102', Department: 'Information Technology' },
      { Name: 'Dr. John von Neumann', Email: 'neumann@university.edu', 'Employee ID': 'EMP-103', Department: 'Electronics & Communication' },
    ];

    const data = isStudent ? studentData : facultyData;
    const worksheet = XLSX.utils.json_to_sheet(data);
    worksheet['!cols'] = [
      { wch: 22 },
      { wch: 30 },
      { wch: 20 },
      { wch: 32 },
      { wch: 15 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `${type} Template`);
    XLSX.writeFile(workbook, `${type.toLowerCase()}_import_template.xlsx`);
  };

  const parseCsvContent = (content: string) => {
    setErrorMsg(null);
    if (!content.trim()) {
      setParsedRecords([]);
      return;
    }

    const lines = content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length === 0) {
      setParsedRecords([]);
      return;
    }

    // Determine delimiter (comma vs tab)
    const firstLine = lines[0];
    const delimiter = firstLine.includes('\t') ? '\t' : ',';

    // Check if first line is a header
    const lowerFirstLine = firstLine.toLowerCase();
    const isHeader =
      lowerFirstLine.includes('name') ||
      lowerFirstLine.includes('email') ||
      lowerFirstLine.includes('register') ||
      lowerFirstLine.includes('employee');

    const dataLines = isHeader ? lines.slice(1) : lines;

    const existingEmails = new Set(existingUsers.map((u) => u.email.toLowerCase()));
    const seenEmailsInBatch = new Set<string>();

    const records: ParsedRecord[] = [];

    dataLines.forEach((line, index) => {
      // Split line respecting basic quotes
      const rawCols = line.split(delimiter).map((col) => col.replace(/^["']|["']$/g, '').trim());

      if (rawCols.length < 2) return; // Skip invalid lines

      const name = rawCols[0] || '';
      const email = rawCols[1] || '';
      const identifier = rawCols[2] || ''; // Reg No or Emp ID
      const department = rawCols[3] || 'Computer Science & Engineering';

      let isValid = true;
      let validationError: string | undefined;

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

      if (!name) {
        isValid = false;
        validationError = 'Missing name';
      } else if (!email) {
        isValid = false;
        validationError = 'Missing email';
      } else if (!emailRegex.test(email)) {
        isValid = false;
        validationError = 'Invalid email format';
      } else if (existingEmails.has(email.toLowerCase())) {
        isValid = false;
        validationError = 'Email already registered';
      } else if (seenEmailsInBatch.has(email.toLowerCase())) {
        isValid = false;
        validationError = 'Duplicate email in file';
      } else {
        seenEmailsInBatch.add(email.toLowerCase());
      }

      records.push({
        id: `row-${index}-${Date.now()}`,
        name,
        email,
        identifier,
        department,
        isValid,
        validationError,
      });
    });

    setParsedRecords(records);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const isBinary = !file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.txt') && !file.name.toLowerCase().endsWith('.tsv');
    const reader = new FileReader();

    reader.onload = (event) => {
      if (isBinary) {
        try {
          const buffer = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const csvText = XLSX.utils.sheet_to_csv(firstSheet);
          setPastedText(csvText);
          parseCsvContent(csvText);
        } catch {
          setErrorMsg('Failed to parse Excel file.');
        }
      } else {
        const text = event.target?.result as string;
        setPastedText(text);
        parseCsvContent(text);
      }
    };

    if (isBinary) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const text = e.target.value;
    setPastedText(text);
    setFileName(null);
    parseCsvContent(text);
  };

  const handleStartImport = async () => {
    const validRecords = parsedRecords.filter((r) => r.isValid);
    if (validRecords.length === 0) {
      setErrorMsg('No valid records to import. Please fix validation errors.');
      return;
    }

    setIsImporting(true);
    setErrorMsg(null);
    setImportProgress({ current: 0, total: validRecords.length });

    let importedCount = 0;
    const defaultPassword = isStudent ? 'Student@123' : 'Faculty@123';

    for (let i = 0; i < validRecords.length; i++) {
      const rec = validRecords[i];
      try {
        const userData: Partial<User> = {
          name: rec.name.trim(),
          email: rec.email.trim().toLowerCase(),
          role: isStudent ? 'CANDIDATE' : 'FACULTY',
          department: rec.department || 'Computer Science & Engineering',
          password: defaultPassword,
          classIds: selectedClassIds,
          status: 'ACTIVE',
        };

        if (isStudent) {
          userData.registerNumber = rec.identifier;
          userData.registerNo = rec.identifier;
        } else {
          userData.employeeId = rec.identifier;
        }

        await onAddUser(userData);
        importedCount++;
        setImportProgress({ current: importedCount, total: validRecords.length });
      } catch (err: any) {
        console.error(`Failed to import record ${rec.email}:`, err);
      }
    }

    setIsImporting(false);
    onSuccess(importedCount);
    onClose();
  };

  const validCount = parsedRecords.filter((r) => r.isValid).length;
  const invalidCount = parsedRecords.filter((r) => !r.isValid).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full my-8 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-indigo-600/20 border border-indigo-500/30 rounded-xl text-indigo-400">
              {isStudent ? <GraduationCap className="w-5 h-5" /> : <Users className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                Bulk Import {roleLabel}
                <span className="text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full font-mono font-semibold">
                  CSV / TSV
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Upload a CSV file or paste tabular data to batch-register {roleLabel.toLowerCase()}.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isImporting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Quick Guidance & Sample Download */}
          <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-2.5 text-slate-300">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Expected columns:{' '}
                <strong className="text-white">
                  {isStudent ? 'Name, Email, Register No, Department' : 'Name, Email, Employee ID, Department'}
                </strong>
              </span>
            </div>
            <button
              onClick={handleDownloadTemplate}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white font-semibold transition border border-slate-700/80 shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>Download Excel Template</span>
            </button>
          </div>

          {/* Upload Dropzone or Paste Option */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* File Upload Box */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-800 hover:border-indigo-500/50 bg-slate-950/40 hover:bg-slate-950 rounded-xl p-4 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-2 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.txt,.tsv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-full group-hover:scale-110 transition duration-150">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="font-semibold text-slate-200">
                  {fileName ? fileName : 'Click to upload CSV/TSV File'}
                </p>
                <p className="text-[11px] text-slate-500">Supports .csv, .tsv, .txt files up to 5MB</p>
              </div>
            </div>

            {/* Paste Text Area */}
            <div className="space-y-1">
              <label className="block font-semibold text-slate-300">Or Paste CSV / Tabular Text:</label>
              <textarea
                rows={4}
                value={pastedText}
                onChange={handleTextChange}
                placeholder={`John Doe, john@university.edu, ${isStudent ? 'REG101, Computer Science & Engineering' : 'EMP501, Computer Science & Engineering'}`}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white font-mono focus:outline-none focus:border-indigo-500 placeholder-slate-600 resize-none"
              />
            </div>
          </div>

          {/* Classroom Selection (Optional) */}
          {classes.length > 0 && (
            <div className="space-y-2">
              <label className="block font-semibold text-slate-300">
                Automatically Assign Imported {roleLabel} to Classrooms (Optional):
              </label>
              <div className="max-h-24 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                {classes.map((cls) => (
                  <label
                    key={cls.id}
                    className="flex items-center space-x-2 text-slate-300 cursor-pointer p-1.5 rounded hover:bg-slate-900 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={selectedClassIds.includes(cls.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedClassIds([...selectedClassIds, cls.id]);
                        } else {
                          setSelectedClassIds(selectedClassIds.filter((id) => id !== cls.id));
                        }
                      }}
                      className="rounded text-indigo-600"
                    />
                    <span className="truncate">{cls.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Validation Feedback & Records Preview */}
          {parsedRecords.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="font-bold text-white text-sm">Parsed Preview ({parsedRecords.length})</span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
                    {validCount} Valid
                  </span>
                  {invalidCount > 0 && (
                    <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-semibold">
                      {invalidCount} Invalid / Duplicates
                    </span>
                  )}
                </div>
                <button
                  onClick={() => {
                    setParsedRecords([]);
                    setPastedText('');
                    setFileName(null);
                  }}
                  className="text-slate-400 hover:text-rose-400 text-xs transition"
                >
                  Clear All
                </button>
              </div>

              {/* Table Preview */}
              <div className="max-h-48 overflow-y-auto border border-slate-800 rounded-xl bg-slate-950">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Name</th>
                      <th className="p-2.5">Email</th>
                      <th className="p-2.5">{isStudent ? 'Register No' : 'Employee ID'}</th>
                      <th className="p-2.5">Department</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {parsedRecords.map((rec) => (
                      <tr key={rec.id} className={rec.isValid ? 'hover:bg-slate-900/40' : 'bg-rose-500/5'}>
                        <td className="p-2.5">
                          {rec.isValid ? (
                            <span className="inline-flex items-center text-emerald-400 font-semibold gap-1">
                              <CheckCircle className="w-3.5 h-3.5" /> Valid
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center text-rose-400 font-semibold gap-1"
                              title={rec.validationError}
                            >
                              <XCircle className="w-3.5 h-3.5" /> {rec.validationError || 'Invalid'}
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 font-medium text-white">{rec.name || 'N/A'}</td>
                        <td className="p-2.5 font-mono text-slate-300">{rec.email || 'N/A'}</td>
                        <td className="p-2.5 font-mono text-indigo-400 font-semibold">{rec.identifier || 'N/A'}</td>
                        <td className="p-2.5">{rec.department}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 font-medium">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Import Progress Bar */}
          {isImporting && (
            <div className="space-y-2 bg-indigo-950/40 border border-indigo-800/40 p-3.5 rounded-xl">
              <div className="flex items-center justify-between text-indigo-300 font-semibold">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  Importing records...
                </span>
                <span>
                  {importProgress.current} / {importProgress.total}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-200"
                  style={{
                    width: `${importProgress.total > 0 ? (importProgress.current / importProgress.total) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950/50">
          <p className="text-[11px] text-slate-500">
            Default credentials for imported accounts: <strong className="text-slate-300">{isStudent ? 'Student@123' : 'Faculty@123'}</strong>
          </p>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isImporting}
              className="px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 transition disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleStartImport}
              disabled={isImporting || validCount === 0}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-md shadow-indigo-600/20 disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
            >
              {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              <span>Import {validCount > 0 ? `${validCount} ${roleLabel}` : roleLabel}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
