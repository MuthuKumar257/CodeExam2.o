import React, { useState } from 'react';
import {
  X,
  Code2,
  CheckCircle2,
  Eye,
  EyeOff,
  Clock,
  Layers,
  Sparkles,
  BookOpen,
  Copy,
  Check,
  Edit3,
  HelpCircle,
  FileCode,
  Tag,
  ShieldCheck,
  ArrowRight,
  Terminal,
} from 'lucide-react';
import { Question } from '../../types';

interface QuestionDetailModalProps {
  question: Question | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (question: Question) => void;
}

export const QuestionDetailModal: React.FC<QuestionDetailModalProps> = ({
  question,
  isOpen,
  onClose,
  onEdit,
}) => {
  const [copiedIndex, setCopiedIndex] = useState<string | null>(null);

  if (!isOpen || !question) return null;

  const handleCopy = (text: string, indexKey: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(indexKey);
    setTimeout(() => {
      setCopiedIndex(null);
    }, 2000);
  };

  const isMcq = question.type === 'MCQ';
  const sampleCases = question.sampleTestCases || (question.testCases || []).filter((tc) => tc.isPublic).map((tc) => ({
    input: tc.input,
    output: tc.expectedOutput,
    explanation: tc.explanation,
  }));

  const hiddenCases = question.hiddenTestCases || (question.testCases || []).filter((tc) => !tc.isPublic).map((tc) => ({
    input: tc.input,
    output: tc.expectedOutput,
  }));

  const totalHiddenCount = hiddenCases.length;
  const ptsPerHidden =
    question.pointsPerHiddenTestCase ||
    (totalHiddenCount > 0 ? Math.round(question.points / totalHiddenCount) : 10);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-slate-950/90 flex items-start justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="p-2.5 bg-indigo-600/20 border border-indigo-500/30 rounded-xl text-indigo-400 shrink-0 mt-0.5">
              {isMcq ? <HelpCircle className="w-6 h-6" /> : <Code2 className="w-6 h-6" />}
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded border ${
                    question.difficulty === 'EASY'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : question.difficulty === 'MEDIUM'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                  }`}
                >
                  {question.difficulty || 'MEDIUM'}
                </span>

                <span className="text-[10px] font-mono uppercase bg-indigo-500/10 text-indigo-400 font-bold px-2.5 py-0.5 rounded border border-indigo-500/20">
                  {question.type || 'CODING'}
                </span>

                <span className="text-[10px] font-mono bg-cyan-500/10 text-cyan-400 font-bold px-2 py-0.5 rounded border border-cyan-500/20">
                  {question.inputsCount || 2} Inputs / TC
                </span>

                {question.scope && (
                  <span className="text-[10px] font-mono bg-purple-500/10 text-purple-300 font-semibold px-2 py-0.5 rounded border border-purple-500/20">
                    {question.scope}
                  </span>
                )}
              </div>

              <h2 className="text-base sm:text-lg font-bold text-white leading-snug">
                {question.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onEdit(question);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-semibold transition cursor-pointer"
                title="Edit this Question"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
              title="Close Details"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 text-slate-200">
          {/* Key Metrics / Marks Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Points</span>
              <span className="text-base font-bold text-emerald-400 font-mono">{question.points || 0} pts</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Public Testcases</span>
              <span className="text-base font-bold text-blue-400 font-mono">{sampleCases.length} Cases</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Hidden Testcases</span>
              <span className="text-base font-bold text-purple-400 font-mono">{totalHiddenCount} Cases</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
              <span className="text-[10px] uppercase font-bold text-slate-500 block">Hidden TC Value</span>
              <span className="text-base font-bold text-amber-400 font-mono">{ptsPerHidden} pts each</span>
            </div>
          </div>

          {/* Problem Statement */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-indigo-400" />
              Problem Description
            </h3>
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 whitespace-pre-wrap font-sans leading-relaxed">
              {question.problemStatement}
            </div>
          </div>

          {/* Input / Output Formats & Constraints */}
          {(question.inputFormat || question.outputFormat || question.constraints) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {question.inputFormat && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Input Format</span>
                  <p className="text-xs text-slate-300 font-mono whitespace-pre-wrap">{question.inputFormat}</p>
                </div>
              )}

              {question.outputFormat && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-500 block">Output Format</span>
                  <p className="text-xs text-slate-300 font-mono whitespace-pre-wrap">{question.outputFormat}</p>
                </div>
              )}

              {question.constraints && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1 sm:col-span-2">
                  <span className="text-[10px] uppercase font-bold text-amber-400/80 block">Constraints & Range</span>
                  <p className="text-xs text-slate-300 font-mono whitespace-pre-wrap">{question.constraints}</p>
                </div>
              )}
            </div>
          )}

          {/* MCQ Options If MCQ */}
          {isMcq && question.mcqOptions && question.mcqOptions.length > 0 && (
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
                Multiple Choice Options
              </h3>

              <div className="space-y-2">
                {question.mcqOptions.map((opt, idx) => (
                  <div
                    key={opt.id || idx}
                    className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition ${
                      opt.isCorrect
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <span
                        className={`w-6 h-6 rounded-lg flex items-center justify-center font-bold text-xs ${
                          opt.isCorrect
                            ? 'bg-emerald-500/30 text-emerald-300 font-mono'
                            : 'bg-slate-800 text-slate-400 font-mono'
                        }`}
                      >
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="font-medium">{opt.text}</span>
                    </div>

                    {opt.isCorrect && (
                      <span className="px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Correct Choice
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {question.mcqExplanation && (
                <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs text-slate-400 leading-relaxed">
                  <strong className="text-slate-300">Explanation: </strong> {question.mcqExplanation}
                </div>
              )}
            </div>
          )}

          {/* Public / Sample Test Cases */}
          {!isMcq && sampleCases.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-blue-400" />
                Public Sample Test Cases ({sampleCases.length})
              </h3>

              <div className="space-y-3">
                {sampleCases.map((tc, idx) => (
                  <div key={idx} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-300 font-mono flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded bg-blue-500/20 text-blue-400 text-[10px] flex items-center justify-center font-bold">
                          #{idx + 1}
                        </span>
                        Sample Test Case {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(`Input:\n${tc.input}\n\nExpected Output:\n${tc.output}`, `sample-${idx}`)}
                        className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1 hover:bg-slate-800 px-2 py-1 rounded transition cursor-pointer"
                      >
                        {copiedIndex === `sample-${idx}` ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span className="text-emerald-400">Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy IO</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Input Data:</span>
                        <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-xs font-mono text-cyan-300 overflow-x-auto whitespace-pre-wrap">
                          {tc.input}
                        </pre>
                      </div>

                      <div className="space-y-1">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Expected Output:</span>
                        <pre className="p-2.5 rounded-lg bg-slate-900 border border-slate-800/80 text-xs font-mono text-emerald-300 overflow-x-auto whitespace-pre-wrap">
                          {tc.output}
                        </pre>
                      </div>
                    </div>

                    {tc.explanation && (
                      <div className="text-[11px] text-slate-400 bg-slate-900/40 p-2.5 rounded-lg border border-slate-800/60">
                        <strong className="text-slate-300">Explanation: </strong> {tc.explanation}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hidden Test Cases (Faculty/Admin View) */}
          {!isMcq && hiddenCases.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <EyeOff className="w-3.5 h-3.5 text-purple-400" />
                  Hidden Evaluation Test Cases ({hiddenCases.length})
                </h3>
                <span className="text-[10px] text-purple-400 font-mono font-semibold bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  {ptsPerHidden} pts awarded per passed hidden TC
                </span>
              </div>

              <div className="space-y-2">
                {hiddenCases.map((tc, idx) => (
                  <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800/90 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-slate-400 font-semibold flex items-center gap-1.5 text-[11px]">
                        <span className="w-4 h-4 rounded bg-purple-500/20 text-purple-400 text-[10px] flex items-center justify-center font-bold">
                          {idx + 1}
                        </span>
                        Hidden Case {idx + 1} ({ptsPerHidden} pts)
                      </span>
                      <button
                        type="button"
                        onClick={() => handleCopy(`Input:\n${tc.input}\n\nExpected Output:\n${tc.output}`, `hidden-${idx}`)}
                        className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-1 hover:bg-slate-900 px-1.5 py-0.5 rounded transition cursor-pointer"
                      >
                        {copiedIndex === `hidden-${idx}` ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                        <span>Copy</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                      <div className="bg-slate-900/80 p-2 rounded border border-slate-800/60 font-mono text-slate-300 truncate">
                        <span className="text-[10px] text-slate-500 uppercase block font-sans">Input:</span>
                        {tc.input}
                      </div>
                      <div className="bg-slate-900/80 p-2 rounded border border-slate-800/60 font-mono text-emerald-400 truncate">
                        <span className="text-[10px] text-slate-500 uppercase block font-sans">Output:</span>
                        {tc.output}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Starter Code (If enabled) */}
          {question.starterCode && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-cyan-400" />
                Starter Code / Solution Template
              </h3>
              <pre className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-cyan-300 overflow-x-auto whitespace-pre-wrap">
                {question.starterCode}
              </pre>
            </div>
          )}

          {/* Tags */}
          {question.tags && question.tags.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/60">
              <Tag className="w-3.5 h-3.5 text-slate-500 mr-1" />
              {question.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 border border-slate-700/60 text-[10px] font-mono"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between">
          <div className="text-xs text-slate-500 font-mono">
            ID: {question.id}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-bold transition cursor-pointer"
          >
            Close Details
          </button>
        </div>
      </div>
    </div>
  );
};
