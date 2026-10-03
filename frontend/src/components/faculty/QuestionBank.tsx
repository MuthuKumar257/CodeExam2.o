import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  HelpCircle,
  Plus,
  Search,
  Code,
  Trash2,
  Edit3,
  Award,
  Layers,
  CheckCircle2,
  AlertCircle,
  Hash,
  Eye,
  EyeOff,
  Sparkles,
  Info,
  ArrowRight,
  Loader2,
  Upload,
  Download,
  FileSpreadsheet,
} from 'lucide-react';
import { Question, QuestionDifficulty, TestCase } from '../../types';
import { QuestionDetailModal } from '../common/QuestionDetailModal';

interface QuestionBankProps {
  questions: Question[];
  onAddQuestion: (q: Question) => void;
  onUpdateQuestion?: (q: Question) => void;
  onDeleteQuestion?: (id: string) => void;
}

interface TestCaseDraft {
  id: string;
  inputs: string[]; // Separate input box for each input in a testcase
  expectedOutput: string;
  explanation?: string;
}

export const QuestionBank: React.FC<QuestionBankProps> = ({
  questions,
  onAddQuestion,
  onUpdateQuestion,
  onDeleteQuestion,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [showConfirmSaveModal, setShowConfirmSaveModal] = useState(false);
  const [pendingQuestionObj, setPendingQuestionObj] = useState<Question | null>(null);

  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [selectedQuestionForDetail, setSelectedQuestionForDetail] = useState<Question | null>(null);
  const [deletingQuestionId, setDeletingQuestionId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const questionFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDeleteQuestionClick = async (q: Question) => {
    if (!onDeleteQuestion) return;
    if (window.confirm("Are you sure you want to delete this item? This action cannot be undone.")) {
      setDeletingQuestionId(q.id);
      setDeleteMessage(null);
      setDeleteError(null);
      try {
        await onDeleteQuestion(q.id);
        setDeleteMessage(`Question "${q.title}" deleted successfully.`);
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : 'Failed to delete question.');
      } finally {
        setDeletingQuestionId(null);
      }
    }
  };

  const parseCsvRows = (content: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < content.length; index += 1) {
      const char = content[index];
      if (char === '"') {
        if (quoted && content[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === ',' && !quoted) {
        row.push(cell.trim());
        cell = '';
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && content[index + 1] === '\n') index += 1;
        row.push(cell.trim());
        if (row.some((value) => value)) rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += char;
      }
    }
    row.push(cell.trim());
    if (row.some((value) => value)) rows.push(row);
    return rows;
  };

  const parseTestCases = (raw: string, isPublic: boolean): TestCase[] => {
    if (!raw.trim()) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((testCase, index) => ({
          id: `${isPublic ? 'pub' : 'hid'}-import-${Date.now()}-${index}`,
          input: String(testCase.input ?? testCase.inputs ?? ''),
          expectedOutput: String(testCase.expectedOutput ?? testCase.output ?? ''),
          isPublic,
          explanation: testCase.explanation || 'Imported test case',
        }));
      }
    } catch {
      // Fall through to the compact input=>output format.
    }
    return raw.split('||').flatMap((entry, index) => {
      const separator = entry.indexOf('=>');
      if (separator < 0) return [];
      return [{
        id: `${isPublic ? 'pub' : 'hid'}-import-${Date.now()}-${index}`,
        input: entry.slice(0, separator).trim(),
        expectedOutput: entry.slice(separator + 2).trim(),
        isPublic,
        explanation: 'Imported test case',
      }];
    });
  };

  const downloadImportTemplate = () => {
    const templateData = [
      {
        title: 'Largest Number',
        problemStatement: 'Given N numbers, print the largest.',
        inputFormat: 'N followed by space-separated integers',
        outputFormat: 'Largest integer',
        constraints: '1 <= N <= 100000',
        difficulty: 'EASY',
        tags: 'Array|Algorithms',
        points: 20,
        inputsCount: 1,
        pointsPerHiddenTestCase: 10,
        publicTestCases: '[{"input":"5\\n1 8 3 2 4","expectedOutput":"8"}]',
        hiddenTestCases: '[{"input":"3\\n-1 -4 -2","expectedOutput":"-1"}]',
        explanation: 'Compare all values',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    worksheet['!cols'] = [
      { wch: 20 },
      { wch: 40 },
      { wch: 30 },
      { wch: 20 },
      { wch: 20 },
      { wch: 12 },
      { wch: 20 },
      { wch: 10 },
      { wch: 12 },
      { wch: 24 },
      { wch: 40 },
      { wch: 40 },
      { wch: 25 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Question Template');
    XLSX.writeFile(workbook, 'question_bank_import_template.xlsx');
  };

  const handleQuestionCsvImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImportMessage(null);
    setImportError(null);
    setIsImporting(true);

    const isBinary = !file.name.toLowerCase().endsWith('.csv');
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        let rows: string[][] = [];

        if (isBinary) {
          const buffer = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const rawRows = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1, defval: '' });
          rows = rawRows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : []));
        } else {
          const content = String(e.target?.result || '');
          try {
            const workbook = XLSX.read(content, { type: 'string' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rawRows = XLSX.utils.sheet_to_json<string[]>(firstSheet, { header: 1, defval: '' });
            rows = rawRows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '')) : []));
          } catch {
            rows = parseCsvRows(content);
          }
        }

        rows = rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));

        if (rows.length < 2) throw new Error('Template file must include a header row and at least one question row.');
        const headers = rows[0].map((header) => header.toLowerCase().replace(/[^a-z0-9]/g, ''));
        const value = (row: string[], name: string) => {
          const idx = headers.indexOf(name);
          return idx >= 0 && row[idx] ? String(row[idx]).trim() : '';
        };

        const importedQuestions: Question[] = [];
        rows.slice(1).forEach((row, rowIndex) => {
          const titleValue = value(row, 'title');
          const problemValue = value(row, 'problemstatement');
          if (!titleValue || !problemValue) throw new Error(`Row ${rowIndex + 2} needs title and problemStatement.`);
          const difficultyValue = value(row, 'difficulty').toUpperCase();
          const difficultyValueSafe = ['EASY', 'MEDIUM', 'HARD'].includes(difficultyValue) ? (difficultyValue as QuestionDifficulty) : 'EASY';
          const publicTestCases = parseTestCases(value(row, 'publictestcases'), true);
          const hiddenTestCases = parseTestCases(value(row, 'hiddentestcases'), false);
          const testCases = [...publicTestCases, ...hiddenTestCases];
          importedQuestions.push({
            id: `q-${Date.now()}-${rowIndex}`,
            type: 'CODING',
            title: titleValue,
            problemStatement: problemValue,
            inputFormat: value(row, 'inputformat'),
            outputFormat: value(row, 'outputformat'),
            constraints: value(row, 'constraints'),
            explanation: value(row, 'explanation'),
            difficulty: difficultyValueSafe,
            tags: value(row, 'tags').split('|').map((tag) => tag.trim()).filter(Boolean),
            points: Math.max(1, Number(value(row, 'points')) || 10),
            inputsCount: Math.max(1, Number(value(row, 'inputscount')) || 1),
            pointsPerHiddenTestCase: Math.max(1, Number(value(row, 'pointsperhiddentestcase')) || 10),
            sampleTestCases: publicTestCases.map((testCase) => ({ input: testCase.input, output: testCase.expectedOutput, explanation: testCase.explanation })),
            hiddenTestCases: hiddenTestCases.map((testCase) => ({ input: testCase.input, output: testCase.expectedOutput, explanation: testCase.explanation })),
            testCases,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        });
        for (const question of importedQuestions) await onAddQuestion(question);
        setImportMessage(`${importedQuestions.length} question${importedQuestions.length === 1 ? '' : 's'} imported successfully.`);
      } catch (error) {
        setImportError(error instanceof Error ? error.message : 'Failed to import questions.');
      } finally {
        setIsImporting(false);
      }
    };
    reader.onerror = () => {
      setImportError('Could not read the selected file.');
      setIsImporting(false);
    };

    if (isBinary) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
  };
  const [difficultyFilter, setDifficultyFilter] = useState<string>('ALL');

  // Form states
  const [title, setTitle] = useState('');
  const [problemStatement, setProblemStatement] = useState('');
  const [inputFormat, setInputFormat] = useState('');
  const [outputFormat, setOutputFormat] = useState('');
  const [constraints, setConstraints] = useState('');
  const [explanation, setExplanation] = useState('');
  const [enableStarterCode, setEnableStarterCode] = useState(false);
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>('EASY');
  const [inputsCount, setInputsCount] = useState<number>(2);
  const [pointsPerHiddenTestCase, setPointsPerHiddenTestCase] = useState<number>(10);
  const [tags, setTags] = useState('');

  // Helper to parse raw string into inputs array of target length
  const parseInputs = (rawInput: string, targetCount: number): string[] => {
    if (!rawInput) return Array(targetCount).fill('');
    try {
      const parsed = JSON.parse(rawInput);
      if (Array.isArray(parsed)) {
        const arr = parsed.map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item)));
        while (arr.length < targetCount) arr.push('');
        return arr.slice(0, targetCount);
      } else if (typeof parsed === 'object' && parsed !== null) {
        const arr = Object.values(parsed).map((val) => (typeof val === 'object' ? JSON.stringify(val) : String(val)));
        while (arr.length < targetCount) arr.push('');
        return arr.slice(0, targetCount);
      }
    } catch {}

    const lines = rawInput.split('\n').map((s) => s.trim()).filter(Boolean);
    if (lines.length === targetCount) return lines;

    const commas = rawInput.split(',').map((s) => s.trim()).filter(Boolean);
    if (commas.length === targetCount) return commas;

    const res = [rawInput];
    while (res.length < targetCount) res.push('');
    return res.slice(0, targetCount);
  };

  // Helper to construct a single input string from inputs array
  const formatInputsToString = (inputs: string[]): string => {
    const clean = inputs.map((i) => i.trim());
    if (clean.length === 1) return clean[0] || '';
    return clean.join(', ');
  };

  // Public Test Cases (Up to 5)
  const [publicTCs, setPublicTCs] = useState<TestCaseDraft[]>([
    {
      id: 'pub-1',
      inputs: [''],
      expectedOutput: '',
      explanation: '',
    },
  ]);

  // Hidden Test Cases (Up to 9)
  const [hiddenTCs, setHiddenTCs] = useState<TestCaseDraft[]>([
    {
      id: 'hid-1',
      inputs: [''],
      expectedOutput: '',
      explanation: '',
    },
  ]);

  // Error validation state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active tab in Modal (General info vs Public Test cases vs Hidden Test cases)
  const [activeFormTab, setActiveFormTab] = useState<'GENERAL' | 'PUBLIC_TC' | 'HIDDEN_TC'>('GENERAL');

  // Handle changing inputsCount dynamically
  const handleInputsCountChange = (newCount: number) => {
    const validCount = Math.max(1, Math.min(10, newCount));
    setInputsCount(validCount);

    setPublicTCs((prev) =>
      prev.map((tc) => {
        const arr = [...tc.inputs];
        while (arr.length < validCount) arr.push('');
        return { ...tc, inputs: arr.slice(0, validCount) };
      })
    );

    setHiddenTCs((prev) =>
      prev.map((tc) => {
        const arr = [...tc.inputs];
        while (arr.length < validCount) arr.push('');
        return { ...tc, inputs: arr.slice(0, validCount) };
      })
    );
  };

  // Open modal for Creating New Question
  const handleOpenCreateModal = () => {
    setEditingQuestionId(null);
    setTitle('');
    setProblemStatement('');
    setInputFormat('');
    setOutputFormat('');
    setConstraints('');
    setExplanation('');
    setEnableStarterCode(false);
    setDifficulty('EASY');
    setInputsCount(1);
    setPointsPerHiddenTestCase(10);
    setTags('');
    setPublicTCs([
      {
        id: `pub-${Date.now()}-1`,
        inputs: [''],
        expectedOutput: '',
        explanation: '',
      },
    ]);
    setHiddenTCs([
      {
        id: `hid-${Date.now()}-1`,
        inputs: [''],
        expectedOutput: '',
        explanation: '',
      },
    ]);
    setErrorMessage(null);
    setActiveFormTab('GENERAL');
    setShowModal(true);
    setShowConfirmSaveModal(false);
    setPendingQuestionObj(null);
  };

  // Open modal for Editing Existing Question
  const handleOpenEditModal = (q: Question) => {
    const count = q.inputsCount || 1;
    setEditingQuestionId(q.id);
    setTitle(q.title);
    setProblemStatement(q.problemStatement);
    setInputFormat(q.inputFormat || '');
    setOutputFormat(q.outputFormat || '');
    setConstraints(q.constraints || '');
    setExplanation(q.explanation || '');
    setEnableStarterCode(q.enableStarterCode || false);
    setDifficulty(q.difficulty);
    setInputsCount(count);
    setPointsPerHiddenTestCase(q.pointsPerHiddenTestCase || 10);
    setTags(q.tags.join(', '));

    // Split testcases into public and hidden
    const existingPubs = (q.testCases || [])
      .filter((tc) => tc.isPublic)
      .map((tc) => ({
        id: tc.id,
        inputs: parseInputs(tc.input, count),
        expectedOutput: tc.expectedOutput,
        explanation: tc.explanation,
      }));
    const existingHids = (q.testCases || [])
      .filter((tc) => !tc.isPublic)
      .map((tc) => ({
        id: tc.id,
        inputs: parseInputs(tc.input, count),
        expectedOutput: tc.expectedOutput,
        explanation: tc.explanation,
      }));

    // Ensure at least 1 compulsory public testcase
    if (existingPubs.length === 0) {
      existingPubs.push({
        id: `pub-${Date.now()}-1`,
        inputs: Array(count).fill(''),
        expectedOutput: '',
        explanation: '',
      });
    }
    // Ensure at least 1 compulsory hidden testcase
    if (existingHids.length === 0) {
      existingHids.push({
        id: `hid-${Date.now()}-1`,
        inputs: Array(count).fill(''),
        expectedOutput: '',
        explanation: '',
      });
    }

    setPublicTCs(existingPubs.slice(0, 5));
    setHiddenTCs(existingHids.slice(0, 9));
    setErrorMessage(null);
    setActiveFormTab('GENERAL');
    setShowModal(true);
    setShowConfirmSaveModal(false);
    setPendingQuestionObj(null);
  };

  // Add Public Test Case (Max 5)
  const handleAddPublicTC = () => {
    if (publicTCs.length >= 5) return;
    setPublicTCs([
      ...publicTCs,
      {
        id: `pub-${Date.now()}-${publicTCs.length + 1}`,
        inputs: Array(inputsCount).fill(''),
        expectedOutput: '',
        explanation: '',
      },
    ]);
  };

  // Remove Public Test Case (Cannot remove #1)
  const handleRemovePublicTC = (index: number) => {
    if (index === 0) return; // Compulsory
    setPublicTCs(publicTCs.filter((_, i) => i !== index));
  };

  // Update Public Test Case Specific Input Field
  const handleUpdatePublicTCInput = (tcIndex: number, inputIndex: number, value: string) => {
    setPublicTCs((prev) =>
      prev.map((tc, i) => {
        if (i !== tcIndex) return tc;
        const newInputs = [...tc.inputs];
        newInputs[inputIndex] = value;
        return { ...tc, inputs: newInputs };
      })
    );
  };

  // Update Public Test Case General Field
  const handleUpdatePublicTCField = (index: number, field: 'expectedOutput' | 'explanation', value: string) => {
    setPublicTCs((prev) =>
      prev.map((tc, i) => (i === index ? { ...tc, [field]: value } : tc))
    );
  };

  // Add Hidden Test Case (Max 9)
  const handleAddHiddenTC = () => {
    if (hiddenTCs.length >= 9) return;
    setHiddenTCs([
      ...hiddenTCs,
      {
        id: `hid-${Date.now()}-${hiddenTCs.length + 1}`,
        inputs: Array(inputsCount).fill(''),
        expectedOutput: '',
        explanation: '',
      },
    ]);
  };

  // Remove Hidden Test Case (Cannot remove #1)
  const handleRemoveHiddenTC = (index: number) => {
    if (index === 0) return; // Compulsory
    setHiddenTCs(hiddenTCs.filter((_, i) => i !== index));
  };

  // Update Hidden Test Case Specific Input Field
  const handleUpdateHiddenTCInput = (tcIndex: number, inputIndex: number, value: string) => {
    setHiddenTCs((prev) =>
      prev.map((tc, i) => {
        if (i !== tcIndex) return tc;
        const newInputs = [...tc.inputs];
        newInputs[inputIndex] = value;
        return { ...tc, inputs: newInputs };
      })
    );
  };

  // Update Hidden Test Case General Field
  const handleUpdateHiddenTCField = (index: number, field: 'expectedOutput' | 'explanation', value: string) => {
    setHiddenTCs((prev) =>
      prev.map((tc, i) => (i === index ? { ...tc, [field]: value } : tc))
    );
  };

  // Form Submit Handler -> Triggers Confirmation Modal
  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!title.trim()) {
      setErrorMessage('Question Title is required.');
      setActiveFormTab('GENERAL');
      return;
    }

    if (!problemStatement.trim()) {
      setErrorMessage('Problem Statement is required.');
      setActiveFormTab('GENERAL');
      return;
    }

    // Compulsory Public Test Case #1 Validation
    const compPub = publicTCs[0];
    const hasCompPubInput = compPub && compPub.inputs.some((i) => i.trim() !== '');
    if (!compPub || !hasCompPubInput || !compPub.expectedOutput.trim()) {
      setErrorMessage('Compulsory Public Test Case #1 requires at least 1 input value and an Expected Output.');
      setActiveFormTab('PUBLIC_TC');
      return;
    }

    // Compulsory Hidden Test Case #1 Validation
    const compHid = hiddenTCs[0];
    const hasCompHidInput = compHid && compHid.inputs.some((i) => i.trim() !== '');
    if (!compHid || !hasCompHidInput || !compHid.expectedOutput.trim()) {
      setErrorMessage('Compulsory Hidden Test Case #1 requires at least 1 input value and an Expected Output.');
      setActiveFormTab('HIDDEN_TC');
      return;
    }

    // Filter valid test cases
    const validPublicTCs = publicTCs.filter(
      (tc) => tc.inputs.some((i) => i.trim() !== '') && tc.expectedOutput.trim() !== ''
    );
    const validHiddenTCs = hiddenTCs.filter(
      (tc) => tc.inputs.some((i) => i.trim() !== '') && tc.expectedOutput.trim() !== ''
    );

    const computedTotalPoints = validHiddenTCs.length * pointsPerHiddenTestCase;

    // Combine test cases
    const compiledTestCases: TestCase[] = [
      ...validPublicTCs.map((tc) => ({
        id: tc.id,
        input: formatInputsToString(tc.inputs),
        expectedOutput: tc.expectedOutput.trim(),
        isPublic: true,
        explanation: tc.explanation,
      })),
      ...validHiddenTCs.map((tc) => ({
        id: tc.id,
        input: formatInputsToString(tc.inputs),
        expectedOutput: tc.expectedOutput.trim(),
        isPublic: false,
        explanation: tc.explanation,
      })),
    ];

    const sampleTestCases = validPublicTCs.map((tc) => ({
      input: formatInputsToString(tc.inputs),
      output: tc.expectedOutput.trim(),
      explanation: tc.explanation,
    }));

    const hiddenTestCasesList = validHiddenTCs.map((tc) => ({
      input: formatInputsToString(tc.inputs),
      output: tc.expectedOutput.trim(),
    }));

    const questionObj: Question = {
      id: editingQuestionId || `q-${Date.now()}`,
      type: 'CODING',
      title: title.trim(),
      problemStatement: problemStatement.trim(),
      inputFormat: inputFormat.trim(),
      outputFormat: outputFormat.trim(),
      constraints: constraints.trim(),
      explanation: explanation.trim(),
      sampleTestCases,
      hiddenTestCases: hiddenTestCasesList,
      enableStarterCode,
      difficulty,
      inputsCount,
      pointsPerHiddenTestCase,
      points: computedTotalPoints,
      tags: tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      testCases: compiledTestCases,
    };

    setPendingQuestionObj(questionObj);
    setShowConfirmSaveModal(true);
  };

  // Execute actual save after confirmation
  const handleConfirmSaveQuestion = () => {
    if (!pendingQuestionObj) return;

    if (editingQuestionId) {
      if (onUpdateQuestion) {
        onUpdateQuestion(pendingQuestionObj);
      } else {
        onAddQuestion(pendingQuestionObj);
      }
    } else {
      onAddQuestion(pendingQuestionObj);
    }

    setShowConfirmSaveModal(false);
    setShowModal(false);
    setPendingQuestionObj(null);
  };

  // Filtered questions
  const filteredQuestions = questions.filter((q) => {
    const tags = Array.isArray(q?.tags)
      ? q.tags
      : typeof q?.tags === 'string'
      ? q.tags.split('|').map((tag) => tag.trim()).filter(Boolean)
      : [];
    const matchesSearch =
      (q?.title || '').toLowerCase().includes(search.toLowerCase()) ||
      tags.some((t) => (t || '').toLowerCase().includes(search.toLowerCase()));
    const matchesDiff = difficultyFilter === 'ALL' || q.difficulty === difficultyFilter;
    return matchesSearch && matchesDiff;
  });

  // Calculate live total points preview for the form
  const validHiddenCountPreview = hiddenTCs.filter(
    (tc) => tc.inputs.some((i) => i.trim() !== '') && tc.expectedOutput.trim() !== ''
  ).length;
  const liveTotalPoints = validHiddenCountPreview * pointsPerHiddenTestCase;

  return (
    <div className="p-6 space-y-6">
      {deleteMessage && <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs">{deleteMessage}</div>}
      {deleteError && <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">{deleteError}</div>}
      {importMessage && <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs">{importMessage}</div>}
      {importError && <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">{importError}</div>}
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-end justify-between pb-6 border-b border-white/10 gap-4">
        <div>
          <span className="label-mono block mb-1">Universal Question Repository</span>
          <h1 className="font-display text-4xl font-extrabold text-white tracking-tight leading-none mb-2">
            Question Bank
          </h1>
          <p className="text-zinc-400 text-sm">
            Questions are common for all classes and universally accessible across all assessments.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Difficulty Filter */}
          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 text-xs text-slate-300 rounded-xl px-3 py-2 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Difficulties</option>
            <option value="EASY">Easy</option>
            <option value="MEDIUM">Medium</option>
            <option value="HARD">Hard</option>
          </select>

          {/* Search bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search title or tag..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500 w-52"
            />
          </div>

          <button
            type="button"
            onClick={downloadImportTemplate}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition cursor-pointer"
            title="Download Excel import template"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Excel Template</span>
          </button>

          <input
            ref={questionFileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
            onChange={handleQuestionCsvImport}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => questionFileInputRef.current?.click()}
            disabled={isImporting}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs border border-slate-700 transition cursor-pointer disabled:opacity-50"
            title="Import questions from Excel or CSV"
          >
            {isImporting ? <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" /> : <Upload className="w-4 h-4 text-indigo-400" />}
            <span>{isImporting ? 'Importing...' : 'Import Excel / CSV'}</span>
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Coding Question</span>
          </button>
        </div>
      </div>

      {/* Questions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredQuestions.map((q) => {
          const publicCount = (q.testCases || []).filter((tc) => tc.isPublic).length;
          const hiddenCount = (q.testCases || []).filter((tc) => !tc.isPublic).length;
          const ptsPerHidden =
            q.pointsPerHiddenTestCase || (hiddenCount > 0 ? Math.round(q.points / hiddenCount) : 10);

          return (
            <div
              key={q.id}
              onClick={() => setSelectedQuestionForDetail(q)}
              className="bg-slate-900 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900/90 p-5 rounded-2xl space-y-4 transition shadow-lg relative group cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded border ${
                        q.difficulty === 'EASY'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : q.difficulty === 'MEDIUM'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}
                    >
                      {q.difficulty}
                    </span>
                    <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-400 font-bold px-2 py-0.5 rounded border border-indigo-500/20">
                      {q.inputsCount || 2} Inputs/Testcase
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-white group-hover:text-indigo-200 transition leading-snug">
                    {q?.title || 'Untitled Question'}
                  </h3>
                </div>

                {/* Score badge */}
                <div className="text-right shrink-0">
                  <div className="text-sm font-black font-mono text-emerald-400">{q.points} Pts</div>
                  <div className="text-[10px] text-slate-400 font-mono">{ptsPerHidden} pts / hidden TC</div>
                </div>
              </div>

              <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed font-sans">
                {q.problemStatement}
              </p>

              {/* Testcases Statistics & Tags */}
              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                    <Eye className="w-3 h-3" />
                    {publicCount} Public TCs
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                    <EyeOff className="w-3 h-3" />
                    {hiddenCount} Hidden TCs
                  </span>
                </div>

                <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    onClick={() => setSelectedQuestionForDetail(q)}
                    className="p-1.5 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/20 transition cursor-pointer"
                    title="View Full Question Details"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleOpenEditModal(q)}
                    className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                    title="Edit Question"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-indigo-400" />
                  </button>

                  {onDeleteQuestion && (
                    <button
                      type="button"
                      onClick={() => handleDeleteQuestionClick(q)}
                      disabled={deletingQuestionId === q.id}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer disabled:opacity-50"
                      title="Delete Question"
                    >
                      {deletingQuestionId === q.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-400" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1">
                {(Array.isArray(q.tags)
                  ? q.tags
                  : typeof q.tags === 'string'
                  ? q.tags.split('|').map((tag) => tag.trim()).filter(Boolean)
                  : []
                ).map((tag) => (
                  <span key={tag} className="text-[10px] bg-slate-950 text-slate-400 px-2 py-0.5 rounded font-mono">
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          );
        })}

        {filteredQuestions.length === 0 && (
          <div className="col-span-full p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400 space-y-2">
            <Code className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs font-semibold text-slate-300">No coding questions found matching criteria.</p>
            <button onClick={handleOpenCreateModal} className="text-xs text-indigo-400 hover:underline font-bold">
              + Add a new question to repo
            </button>
          </div>
        )}
      </div>

      {/* CREATE / EDIT QUESTION MODAL */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <form
            onSubmit={handleSubmitForm}
            className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full my-8 space-y-5 text-xs shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            {/* Modal Header */}
            <div className="p-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-indigo-600/20 text-indigo-400 rounded-xl">
                  <Code className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {editingQuestionId ? 'Edit Repository Question' : 'Create Repository Coding Question'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Define test suite with separate parameter inputs, up to 5 Public and 9 Hidden Test Cases
                  </p>
                </div>
              </div>

              {/* Form Navigation Tabs */}
              <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveFormTab('GENERAL')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer ${
                    activeFormTab === 'GENERAL'
                      ? 'bg-indigo-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  General Info
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFormTab('PUBLIC_TC')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 ${
                    activeFormTab === 'PUBLIC_TC'
                      ? 'bg-blue-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>Public TCs</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-blue-900/60 text-blue-200 text-[10px]">
                    {publicTCs.length}/5
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveFormTab('HIDDEN_TC')}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition cursor-pointer flex items-center gap-1.5 ${
                    activeFormTab === 'HIDDEN_TC'
                      ? 'bg-purple-600 text-white shadow'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>Hidden TCs</span>
                  <span className="px-1.5 py-0.2 rounded-full bg-purple-900/60 text-purple-200 text-[10px]">
                    {hiddenTCs.length}/9
                  </span>
                </button>
              </div>
            </div>

            {/* Error Message Banner */}
            {errorMessage && (
              <div className="mx-6 mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center space-x-2 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Modal Scrollable Content */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* TAB 1: GENERAL INFO */}
              {activeFormTab === 'GENERAL' && (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-slate-300 font-bold flex items-center justify-between">
                      <span>Question Title *</span>
                      <span className="text-[10px] text-slate-500">Descriptive problem name</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Find First and Last Position of Element in Sorted Array"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-white focus:outline-none focus:border-indigo-500 text-xs font-semibold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-slate-300 font-bold">Problem Statement *</label>
                    <textarea
                      rows={3}
                      required
                      placeholder="Provide detailed problem description..."
                      value={problemStatement}
                      onChange={(e) => setProblemStatement(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white focus:outline-none focus:border-indigo-500 text-xs leading-relaxed"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-slate-300 font-bold">Input Format</label>
                      <textarea
                        rows={2}
                        placeholder="e.g. First line contains N, second line contains N integers."
                        value={inputFormat}
                        onChange={(e) => setInputFormat(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-300 font-bold">Output Format</label>
                      <textarea
                        rows={2}
                        placeholder="e.g. Print the largest element in the array."
                        value={outputFormat}
                        onChange={(e) => setOutputFormat(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-slate-300 font-bold">Constraints</label>
                      <textarea
                        rows={2}
                        placeholder="e.g. 1 ≤ N ≤ 100000"
                        value={constraints}
                        onChange={(e) => setConstraints(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-slate-300 font-bold">Explanation</label>
                      <textarea
                        rows={2}
                        placeholder="e.g. Find and print the maximum integer among the given N elements."
                        value={explanation}
                        onChange={(e) => setExplanation(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white focus:outline-none focus:border-indigo-500 text-xs"
                      />
                    </div>
                  </div>

                  {/* Starter Code Option */}
                  <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="font-bold text-white block text-xs">Enable Starter Code Template</span>
                      <span className="text-[10px] text-slate-400">Default behavior is EMPTY editor. Check this only if you want to pre-fill boilerplate code.</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={enableStarterCode}
                      onChange={(e) => setEnableStarterCode(e.target.checked)}
                      className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    {/* Difficulty */}
                    <div className="space-y-1">
                      <label className="text-slate-300 font-bold">Difficulty *</label>
                      <select
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value as QuestionDifficulty)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 font-bold text-xs"
                      >
                        <option value="EASY">EASY</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HARD">HARD</option>
                      </select>
                    </div>

                    {/* No. of inputs per testcase */}
                    <div className="space-y-1">
                      <label className="text-slate-300 font-bold flex items-center justify-between">
                        <span>No. of Inputs / Testcase *</span>
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={inputsCount}
                          onChange={(e) => handleInputsCountChange(Number(e.target.value))}
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-indigo-500 text-xs font-bold"
                        />
                      </div>
                      <span className="text-[10px] text-slate-500">Generates {inputsCount} separate input box(es)</span>
                    </div>

                    {/* Points per hidden testcase passed */}
                    <div className="space-y-1">
                      <label className="text-slate-300 font-bold flex items-center justify-between">
                        <span>Pts per Hidden Testcase *</span>
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={pointsPerHiddenTestCase}
                        onChange={(e) => setPointsPerHiddenTestCase(Math.max(1, Number(e.target.value)))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono focus:outline-none focus:border-emerald-500 text-xs font-black"
                      />
                      <span className="text-[10px] text-slate-500">Awarded per hidden TC passed</span>
                    </div>
                  </div>

                  {/* Calculated Points Banner */}
                  <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs">
                    <div className="flex items-center space-x-2 text-emerald-300">
                      <Award className="w-4 h-4 text-emerald-400 shrink-0" />
                      <div>
                        <span className="font-bold">Total Calculated Score: </span>
                        <span className="font-mono text-emerald-200">
                          {validHiddenCountPreview} valid hidden testcases × {pointsPerHiddenTestCase} pts
                        </span>
                      </div>
                    </div>
                    <div className="text-base font-black font-mono text-emerald-400">
                      = {liveTotalPoints} Points
                    </div>
                  </div>

                  {/* Tags */}
                  <div className="space-y-1">
                    <label className="text-slate-300 font-bold">Tags (comma separated)</label>
                    <input
                      type="text"
                      placeholder="e.g. Array, Algorithms, Hash Table"
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-indigo-500 text-xs"
                    />
                  </div>
                </div>
              )}

              {/* TAB 2: PUBLIC TEST CASES (Up to 5) */}
              {activeFormTab === 'PUBLIC_TC' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-blue-950/40 border border-blue-500/30 p-3.5 rounded-xl">
                    <div className="flex items-center space-x-2 text-blue-300">
                      <Eye className="w-4 h-4 text-blue-400 shrink-0" />
                      <div>
                        <h4 className="font-bold text-white text-xs">Public Test Cases (Up to 5)</h4>
                        <p className="text-[11px] text-slate-400">
                          1 compulsory public testcase required. Each testcase has {inputsCount} separate input box(es).
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddPublicTC}
                      disabled={publicTCs.length >= 5}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold text-xs flex items-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Public TC ({publicTCs.length}/5)</span>
                    </button>
                  </div>

                  {/* Public Testcases List */}
                  <div className="space-y-4">
                    {publicTCs.map((tc, index) => {
                      const isCompulsory = index === 0;

                      return (
                        <div
                          key={tc.id || index}
                          className={`p-4 rounded-xl border space-y-3 text-xs transition ${
                            isCompulsory
                              ? 'bg-slate-950 border-blue-500/50'
                              : 'bg-slate-950/80 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-bold text-blue-400 text-xs">
                                Public Testcase #{index + 1}
                              </span>
                              {isCompulsory ? (
                                <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold text-[10px] uppercase">
                                  1 Compulsory Required
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                                  Optional
                                </span>
                              )}
                            </div>

                            {!isCompulsory && (
                              <button
                                type="button"
                                onClick={() => handleRemovePublicTC(index)}
                                className="text-rose-400 hover:text-rose-300 p-1 hover:bg-rose-500/10 rounded transition cursor-pointer"
                                title="Remove Optional Public Test Case"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Separate Input Box for each parameter in testcase */}
                          <div className="space-y-1.5 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                            <label className="text-slate-300 font-bold text-[11px] flex items-center justify-between">
                              <span>Separate Input Parameters ({inputsCount} Boxes)</span>
                              <span className="text-[10px] text-indigo-400 font-mono">
                                {inputsCount} input box(es) per testcase
                              </span>
                            </label>

                            <div
                              className={`grid gap-2.5 ${
                                inputsCount === 1
                                  ? 'grid-cols-1'
                                  : inputsCount === 2
                                  ? 'grid-cols-1 sm:grid-cols-2'
                                  : 'grid-cols-1 sm:grid-cols-3'
                              }`}
                            >
                              {Array.from({ length: inputsCount }).map((_, inputIdx) => (
                                <div key={inputIdx} className="space-y-1">
                                  <span className="text-[10px] font-mono font-bold text-indigo-300 flex items-center justify-between">
                                    <span>Input #{inputIdx + 1}</span>
                                    {isCompulsory && inputIdx === 0 && (
                                      <span className="text-rose-400">*</span>
                                    )}
                                  </span>
                                  <input
                                    type="text"
                                    required={isCompulsory && inputIdx === 0}
                                    placeholder={`e.g. ${
                                      inputIdx === 0 ? '[2, 7, 11, 15]' : '9'
                                    }`}
                                    value={tc.inputs[inputIdx] || ''}
                                    onChange={(e) =>
                                      handleUpdatePublicTCInput(index, inputIdx, e.target.value)
                                    }
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-blue-500 text-xs"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Expected Return Output */}
                          <div className="space-y-1">
                            <label className="text-slate-400 font-medium text-[11px]">
                              Expected Output {isCompulsory && '*'}
                            </label>
                            <input
                              type="text"
                              required={isCompulsory}
                              placeholder="Expected return output (e.g. [0, 1])"
                              value={tc.expectedOutput}
                              onChange={(e) =>
                                handleUpdatePublicTCField(index, 'expectedOutput', e.target.value)
                              }
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono focus:outline-none focus:border-emerald-500 text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-slate-500 text-[10px]">Explanation / Note (Optional)</label>
                            <input
                              type="text"
                              placeholder="Brief hint or note explaining output..."
                              value={tc.explanation || ''}
                              onChange={(e) =>
                                handleUpdatePublicTCField(index, 'explanation', e.target.value)
                              }
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300 text-xs focus:outline-none"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: HIDDEN TEST CASES (Up to 9) */}
              {activeFormTab === 'HIDDEN_TC' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between bg-purple-950/40 border border-purple-500/30 p-3.5 rounded-xl">
                    <div className="flex items-center space-x-2 text-purple-300">
                      <EyeOff className="w-4 h-4 text-purple-400 shrink-0" />
                      <div>
                        <h4 className="font-bold text-white text-xs">Hidden Test Cases (Up to 9)</h4>
                        <p className="text-[11px] text-slate-400">
                          1 compulsory hidden testcase required. Each testcase has {inputsCount} separate input box(es).
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddHiddenTC}
                      disabled={hiddenTCs.length >= 9}
                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-xs flex items-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Hidden TC ({hiddenTCs.length}/9)</span>
                    </button>
                  </div>

                  {/* Hidden Testcases List */}
                  <div className="space-y-4">
                    {hiddenTCs.map((tc, index) => {
                      const isCompulsory = index === 0;

                      return (
                        <div
                          key={tc.id || index}
                          className={`p-4 rounded-xl border space-y-3 text-xs transition ${
                            isCompulsory
                              ? 'bg-slate-950 border-purple-500/50'
                              : 'bg-slate-950/80 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                            <div className="flex items-center space-x-2">
                              <span className="font-mono font-bold text-purple-400 text-xs">
                                Hidden Testcase #{index + 1}
                              </span>
                              {isCompulsory ? (
                                <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold text-[10px] uppercase">
                                  1 Compulsory Required
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">
                                  Optional
                                </span>
                              )}
                              <span className="text-[10px] text-emerald-400 font-mono font-bold">
                                +{pointsPerHiddenTestCase} Pts on Pass
                              </span>
                            </div>

                            {!isCompulsory && (
                              <button
                                type="button"
                                onClick={() => handleRemoveHiddenTC(index)}
                                className="text-rose-400 hover:text-rose-300 p-1 hover:bg-rose-500/10 rounded transition cursor-pointer"
                                title="Remove Optional Hidden Test Case"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Separate Input Box for each parameter in hidden testcase */}
                          <div className="space-y-1.5 bg-slate-900/60 p-3 rounded-xl border border-slate-800">
                            <label className="text-slate-300 font-bold text-[11px] flex items-center justify-between">
                              <span>Separate Input Parameters ({inputsCount} Boxes)</span>
                              <span className="text-[10px] text-purple-400 font-mono">
                                {inputsCount} input box(es) per testcase
                              </span>
                            </label>

                            <div
                              className={`grid gap-2.5 ${
                                inputsCount === 1
                                  ? 'grid-cols-1'
                                  : inputsCount === 2
                                  ? 'grid-cols-1 sm:grid-cols-2'
                                  : 'grid-cols-1 sm:grid-cols-3'
                              }`}
                            >
                              {Array.from({ length: inputsCount }).map((_, inputIdx) => (
                                <div key={inputIdx} className="space-y-1">
                                  <span className="text-[10px] font-mono font-bold text-purple-300 flex items-center justify-between">
                                    <span>Input #{inputIdx + 1}</span>
                                    {isCompulsory && inputIdx === 0 && (
                                      <span className="text-rose-400">*</span>
                                    )}
                                  </span>
                                  <input
                                    type="text"
                                    required={isCompulsory && inputIdx === 0}
                                    placeholder={`e.g. ${
                                      inputIdx === 0 ? '[3, 3]' : '6'
                                    }`}
                                    value={tc.inputs[inputIdx] || ''}
                                    onChange={(e) =>
                                      handleUpdateHiddenTCInput(index, inputIdx, e.target.value)
                                    }
                                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono focus:outline-none focus:border-purple-500 text-xs"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Expected Return Output */}
                          <div className="space-y-1">
                            <label className="text-slate-400 font-medium text-[11px]">
                              Expected Output {isCompulsory && '*'}
                            </label>
                            <input
                              type="text"
                              required={isCompulsory}
                              placeholder="Expected return output (e.g. [0, 1])"
                              value={tc.expectedOutput}
                              onChange={(e) =>
                                handleUpdateHiddenTCField(index, 'expectedOutput', e.target.value)
                              }
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-emerald-400 font-mono focus:outline-none focus:border-emerald-500 text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-slate-500 text-[10px]">Hidden Evaluation Note (Optional)</label>
                            <input
                              type="text"
                              placeholder="e.g. Tests edge cases, duplicates or extreme bounds..."
                              value={tc.explanation || ''}
                              onChange={(e) =>
                                handleUpdateHiddenTCField(index, 'explanation', e.target.value)
                              }
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-300 text-xs focus:outline-none"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Bottom Controls */}
            <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-400 flex items-center space-x-2">
                <Info className="w-4 h-4 text-indigo-400" />
                <span>
                  <strong>Score:</strong> {validHiddenCountPreview} Hidden TCs × {pointsPerHiddenTestCase} pts ={' '}
                  <strong className="text-emerald-400 font-mono">{liveTotalPoints} Pts</strong>
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl text-xs bg-slate-800 text-slate-300 hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20 transition cursor-pointer flex items-center gap-1.5"
                >
                  <span>{editingQuestionId ? 'Review & Update' : 'Review & Save Question'}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* CONFIRMATION DIALOG MODAL (Before saving question) */}
      {showConfirmSaveModal && pendingQuestionObj && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl">
            {/* Header */}
            <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
              <div className="p-2.5 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Confirm Question Details & Total Marks</h3>
                <p className="text-xs text-slate-400">
                  Please review the question parameters and calculated total score before saving to repository.
                </p>
              </div>
            </div>

            {/* Details Box */}
            <div className="space-y-4 bg-slate-950 p-4.5 rounded-xl border border-slate-800 text-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[10px] uppercase font-mono font-bold px-2.5 py-0.5 rounded border ${
                        pendingQuestionObj.difficulty === 'EASY'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : pendingQuestionObj.difficulty === 'MEDIUM'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}
                    >
                      {pendingQuestionObj.difficulty} Difficulty
                    </span>
                    <span className="text-[10px] font-mono bg-indigo-500/10 text-indigo-400 font-bold px-2 py-0.5 rounded border border-indigo-500/20">
                      {pendingQuestionObj.inputsCount || 2} Parameter Inputs / TC
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-white leading-snug">{pendingQuestionObj?.title || 'Untitled Question'}</h4>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] text-slate-400 font-mono">Calculated Score</span>
                  <div className="text-lg font-black font-mono text-emerald-400">
                    {pendingQuestionObj.points} Marks
                  </div>
                </div>
              </div>

              {/* Problem Statement Preview */}
              <div className="p-3 bg-slate-900 rounded-xl text-slate-300 font-sans leading-relaxed max-h-24 overflow-y-auto border border-slate-800">
                <strong className="text-slate-400 block text-[10px] uppercase font-mono mb-1">
                  Problem Statement
                </strong>
                {pendingQuestionObj.problemStatement}
              </div>

              {/* Key Parameters */}
              <div className="grid grid-cols-2 gap-3 text-slate-300">
                <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-mono">Input Parameters Box:</span>
                  <div className="font-bold text-white text-xs mt-0.5">
                    {pendingQuestionObj.inputsCount} Separate Inputs per Test Case
                  </div>
                </div>
                <div className="p-2.5 bg-slate-900 rounded-lg border border-slate-800">
                  <span className="text-[10px] text-slate-400 font-mono">Marks per Hidden Case:</span>
                  <div className="font-bold text-emerald-400 font-mono text-xs mt-0.5">
                    {pendingQuestionObj.pointsPerHiddenTestCase} Points
                  </div>
                </div>
              </div>

              {/* Test Cases Count Breakdown */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-blue-950/30 border border-blue-500/30 rounded-xl">
                  <div className="flex items-center gap-1.5 text-blue-300 font-bold">
                    <Eye className="w-3.5 h-3.5 text-blue-400" />
                    <span>
                      {(pendingQuestionObj.testCases || []).filter((tc) => tc.isPublic).length} Public Test Cases
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">Visible to candidates for practice</p>
                </div>

                <div className="p-3 bg-purple-950/30 border border-purple-500/30 rounded-xl">
                  <div className="flex items-center gap-1.5 text-purple-300 font-bold">
                    <EyeOff className="w-3.5 h-3.5 text-purple-400" />
                    <span>
                      {(pendingQuestionObj.testCases || []).filter((tc) => !tc.isPublic).length} Hidden Test Cases
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-0.5">Evaluated for candidate scoring</p>
                </div>
              </div>

              {/* Prominent Marks Calculation Banner */}
              <div className="p-4 bg-emerald-950/50 border border-emerald-500/40 rounded-xl flex items-center justify-between text-emerald-300">
                <div className="flex items-center space-x-2.5">
                  <Award className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-bold text-white text-xs">Total Calculated Marks</div>
                    <div className="text-[11px] font-mono text-emerald-300">
                      {(pendingQuestionObj.testCases || []).filter((tc) => !tc.isPublic).length} Hidden TCs ×{' '}
                      {pendingQuestionObj.pointsPerHiddenTestCase} Pts each
                    </div>
                  </div>
                </div>
                <div className="text-xl font-black font-mono text-emerald-400">
                  {pendingQuestionObj.points} Marks
                </div>
              </div>
            </div>

            {/* Confirmation Actions */}
            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmSaveModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                Back to Edit
              </button>
              <button
                type="button"
                onClick={handleConfirmSaveQuestion}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30 transition cursor-pointer flex items-center space-x-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Save Question</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUESTION DETAIL INSPECTOR MODAL */}
      <QuestionDetailModal
        question={selectedQuestionForDetail}
        isOpen={Boolean(selectedQuestionForDetail)}
        onClose={() => setSelectedQuestionForDetail(null)}
        onEdit={(q) => {
          setSelectedQuestionForDetail(null);
          handleOpenEditModal(q);
        }}
      />
    </div>
  );
};
