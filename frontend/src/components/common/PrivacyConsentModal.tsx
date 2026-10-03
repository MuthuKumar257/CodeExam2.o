import React from 'react';
import { ShieldCheck, Eye, Video, FileText, Lock, X, CheckCircle2 } from 'lucide-react';

interface PrivacyConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept?: () => void;
}

export const PrivacyConsentModal: React.FC<PrivacyConsentModalProps> = ({
  isOpen,
  onClose,
  onAccept,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl text-slate-200 p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Proctoring Privacy & Candidate Consent Policy</h2>
              <p className="text-xs text-slate-400">CodeExam Security & Transparency Commitment</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="space-y-4 text-xs leading-relaxed text-slate-300">
          <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-800/40 text-indigo-300 space-y-1">
            <div className="font-semibold text-sm flex items-center gap-1.5 text-indigo-200">
              <Lock className="w-4 h-4 text-indigo-400" />
              Privacy Principle & Non-Biometric Assurance
            </div>
            <p className="text-[11px] text-indigo-300/90">
              CodeExam performs strictly browser-level spatial frame monitoring (e.g., face presence count and frame departure). We DO NOT perform facial recognition, biometric classification, or store sensitive identity telemetry.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2">
              <div className="font-semibold text-white flex items-center gap-2">
                <Video className="w-4 h-4 text-indigo-400" />
                Camera & Audio Processing
              </div>
              <ul className="space-y-1 text-slate-400">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  Used only during active test session.
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  WebRTC stream processed locally in browser memory.
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  Raw video footage is never stored unless explicitly required by institution policy.
                </li>
              </ul>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-800/50 border border-slate-700/60 space-y-2">
              <div className="font-semibold text-white flex items-center gap-2">
                <Eye className="w-4 h-4 text-amber-400" />
                Browser Event Signals Logged
              </div>
              <ul className="space-y-1 text-slate-400">
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  Tab switches and window focus losses.
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  Fullscreen exits and copy/paste attempts.
                </li>
                <li className="flex items-start gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  WebSocket connection drops.
                </li>
              </ul>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-800/30 border border-slate-800 space-y-2">
            <div className="font-semibold text-slate-200 flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" />
              Retention & Candidate Rights
            </div>
            <p className="text-slate-400 text-[11px]">
              - Data Retention: Proctoring logs are automatically purged after 30 days or institution term end.<br />
              - Manual Faculty Review: All risk indicators are non-binding; only authorized faculty can review flag timeline before taking administrative action.<br />
              - Dispute Right: Candidates may request a human faculty appeal for any flagged session.
            </p>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-end space-x-3 border-t border-slate-800 pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition"
          >
            Close
          </button>
          {onAccept && (
            <button
              onClick={() => {
                onAccept();
                onClose();
              }}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition"
            >
              I Understand & Consent
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
