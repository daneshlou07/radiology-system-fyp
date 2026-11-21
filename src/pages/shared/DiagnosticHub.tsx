import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../components/ux/Toast';
import type { Case, Report } from '../../types';
import StatusBadge from '../../components/ui/StatusBadge';
import SeverityBadge from '../../components/ui/SeverityBadge';
import PacsImageViewer from '../../components/ui/PacsImageViewer';
import { loadImages } from '../../services/imageStorage';
import { getDemoScanImage, urlToDataUrl } from '../../utils/demoScanFallback';
import { generateAiReportDraft } from '../../services/aiReportingCopilot';
import { analyzeImageWithVisionAi } from '../../services/visionAiAnalyzer';
import { generateReportToken } from '../../utils/reportToken';
import { Search, Lock } from 'lucide-react';

interface DiagnosticHubProps {
  initialTab?: 'queue' | 'reporting' | 'archive' | 'reports' | 'escalated';
}

const REVIEWABLE_STATUSES = new Set([
  'SCANNED',
  'IMAGES_AVAILABLE',
  'EXTERNAL_IMAGES_AVAILABLE',
  'RADIOLOGIST_REVIEW',
  'MO_REVIEW',
  'REPORTED',
]);

const MODALITY_FILTERS = ['All', 'X-Ray', 'Ultrasound', 'CT', 'MRI'] as const;

function priorityRank(c: Case): number {
  if (c.severity === 'Critical') return 0;
  if (c.severity === 'Severe') return 1;
  return 2;
}

function escapeHtml(text: string): string {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default function DiagnosticHub({ initialTab = 'queue' }: DiagnosticHubProps) {
  const { currentUser } = useAuth();
  const { cases, patients, reports, addReport, editCase, addAuditLog } = useData();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdFromUrl = searchParams.get('caseId') || '';

  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>(() =>
    initialTab === 'archive' || initialTab === 'reports' ? 'completed' : 'pending'
  );

  const [modalityFilter, setModalityFilter] = useState<(typeof MODALITY_FILTERS)[number]>('All');
  const [queueSearch, setQueueSearch] = useState('');
  const [archiveSearch, setArchiveSearch] = useState('');

  // Open case ID (null = show queue table, string = show 50/50 split view)
  const [selectedCaseId, setSelectedCaseId] = useState<string>(caseIdFromUrl);

  // Report editor state
  const [findings, setFindings] = useState('');
  const [impression, setImpression] = useState('');
  const [recommendation, setRecommendation] = useState('');
  const [isCriticalFinding, setIsCriticalFinding] = useState(false);
  const [criticalFindingNote, setCriticalFindingNote] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [signingOff, setSigningOff] = useState(false);

  useEffect(() => {
    if (caseIdFromUrl) {
      setSelectedCaseId(caseIdFromUrl);
    }
  }, [caseIdFromUrl]);

  const finalizedReportByCaseId = useMemo(() => {
    const map = new Map<string, Report>();
    reports.forEach((r) => {
      if (r.status === 'final' || r.status === 'Verified / Signed Off') {
        map.set(r.caseId, r);
      }
    });
    return map;
  }, [reports]);

  const reviewQueue = useMemo(() => {
    const q = queueSearch.toLowerCase().trim();
    return cases
      .filter((c) => {
        if (!REVIEWABLE_STATUSES.has(c.status)) return false;
        if (finalizedReportByCaseId.has(c.id)) return false;
        if (modalityFilter !== 'All') {
          const modText = `${c.modality || ''} ${c.scanType || ''}`.toLowerCase();
          if (!modText.includes(modalityFilter.toLowerCase())) return false;
        }
        if (!q) return true;
        return (
          c.caseNumber.toLowerCase().includes(q) ||
          c.patientName.toLowerCase().includes(q) ||
          (c.scanType || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const pDiff = priorityRank(a) - priorityRank(b);
        if (pDiff !== 0) return pDiff;
        return (b.scannedAt || b.createdAt).localeCompare(a.scannedAt || a.createdAt);
      });
  }, [cases, finalizedReportByCaseId, modalityFilter, queueSearch]);

  const completedReports = useMemo(() => {
    const q = archiveSearch.toLowerCase().trim();
    return [...reports]
      .filter((r) => {
        if (!q) return true;
        return (
          r.caseNumber.toLowerCase().includes(q) ||
          r.patientName.toLowerCase().includes(q) ||
          (r.radiologistName || '').toLowerCase().includes(q) ||
          (r.findings || '').toLowerCase().includes(q) ||
          (r.impression || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (b.signedAt || b.createdAt).localeCompare(a.signedAt || a.createdAt));
  }, [reports, archiveSearch]);

  const selectedCase = useMemo(
    () => (selectedCaseId ? cases.find((c) => c.id === selectedCaseId) || null : null),
    [cases, selectedCaseId]
  );

  const selectedPatient = useMemo(
    () => (selectedCase ? patients.find((p) => p.id === selectedCase.patientId) || null : null),
    [patients, selectedCase]
  );

  const existingReport = useMemo(
    () => (selectedCase ? finalizedReportByCaseId.get(selectedCase.id) || null : null),
    [selectedCase, finalizedReportByCaseId]
  );

  const isCaseFinalized = Boolean(
    selectedCase &&
      (selectedCase.status === 'COMPLETED' ||
        selectedCase.status === 'FINALIZED' ||
        selectedCase.status === 'REPORT_SUBMITTED' ||
        existingReport)
  );

  // Pre-fill form & set Scanned -> Under Review when opened by Radiologist
  useEffect(() => {
    if (!selectedCase) return;

    if (existingReport) {
      setFindings(existingReport.findings || '');
      setImpression(existingReport.impression || '');
      setRecommendation(existingReport.suggestions || '');
      setIsCriticalFinding(Boolean(existingReport.isCriticalFinding));
      setCriticalFindingNote(existingReport.criticalFindingNote || '');
    } else {
      setFindings(selectedCase.preliminaryFindings || '');
      setImpression(selectedCase.preliminaryImpression || '');
      setRecommendation(selectedCase.preliminarySuggestions || '');
      setIsCriticalFinding(Boolean(selectedCase.isCriticalFinding));
      setCriticalFindingNote(selectedCase.criticalFindingNote || '');
    }

    if (
      currentUser?.role === 'Radiologist' &&
      (selectedCase.status === 'SCANNED' ||
        selectedCase.status === 'IMAGES_AVAILABLE' ||
        selectedCase.status === 'EXTERNAL_IMAGES_AVAILABLE')
    ) {
      editCase(selectedCase.id, { status: 'RADIOLOGIST_REVIEW' }).catch(() => {});
    }
  }, [selectedCase?.id, existingReport]);

  const openCase = (caseId: string) => {
    setSelectedCaseId(caseId);
    setSearchParams({ caseId });
  };

  const closeCase = () => {
    setSelectedCaseId('');
    setSearchParams({});
  };

  const handleGenerateDraft = async () => {
    if (!selectedCase) return;
    setIsAnalyzing(true);
    try {
      let imageDataUrl: string | null = null;
      if (selectedCase.images && selectedCase.images.length > 0) {
        const urls = await loadImages(selectedCase.images);
        if (urls.length > 0) imageDataUrl = urls[0];
      }

      if (!imageDataUrl) {
        const fallbackUrl = getDemoScanImage(selectedCase);
        if (fallbackUrl) {
          imageDataUrl = await urlToDataUrl(fallbackUrl);
        }
      }

      if (imageDataUrl) {
        const result = await analyzeImageWithVisionAi(imageDataUrl, selectedCase, selectedPatient || undefined);
        setFindings(result.findings);
        setImpression(result.impression);
        if (result.suggestions) setRecommendation(result.suggestions);
        if (result.isCritical) {
          setIsCriticalFinding(true);
          if (result.criticalReason) setCriticalFindingNote(result.criticalReason);
        }
        toast.success('Draft observations generated.');
        return;
      }

      const draft = generateAiReportDraft(selectedCase, selectedPatient || undefined);
      setFindings(draft.findings);
      setImpression(draft.impression);
      if (draft.suggestions) setRecommendation(draft.suggestions);
      toast.success('Draft observations generated.');
    } catch {
      toast.error('Failed to generate draft. Please enter findings manually.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!currentUser || !selectedCase || isCaseFinalized) return;
    setSavingDraft(true);
    try {
      await editCase(selectedCase.id, {
        status: 'RADIOLOGIST_REVIEW',
        preliminaryFindings: findings.trim() || undefined,
        preliminaryImpression: impression.trim() || undefined,
        preliminarySuggestions: recommendation.trim() || undefined,
        isCriticalFinding,
        criticalFindingNote: isCriticalFinding ? criticalFindingNote.trim() : undefined,
      });
      toast.success(`Draft saved for ${selectedCase.caseNumber}.`);
    } catch {
      toast.error('Failed to save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSignOff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedCase || isCaseFinalized) return;

    if (!findings.trim() || !impression.trim()) {
      toast.error('Please fill in both Findings and Impression before signing off.');
      return;
    }

    setSigningOff(true);
    try {
      const reportToken = generateReportToken(selectedCase.id);
      const signedAt = new Date().toISOString();

      await addReport({
        caseId: selectedCase.id,
        caseNumber: selectedCase.caseNumber,
        patientName: selectedCase.patientName,
        radiologistId: currentUser.id,
        radiologistName: currentUser.name,
        signedByRole: currentUser.role,
        findings: findings.trim(),
        impression: impression.trim(),
        suggestions: recommendation.trim() || undefined,
        isCriticalFinding,
        criticalFindingNote: isCriticalFinding ? criticalFindingNote.trim() : undefined,
        imageKeys: selectedCase.images,
        status: 'final',
        createdAt: signedAt,
        signedAt,
        reportToken,
      });

      await editCase(selectedCase.id, {
        status: 'COMPLETED',
        radiologistId: currentUser.id,
        radiologistName: currentUser.name,
        finalizedAt: signedAt,
        isCriticalFinding,
        criticalFindingNote: isCriticalFinding ? criticalFindingNote.trim() : undefined,
      });

      await addAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'REPORT_SIGNED_OFF',
        target: `cases/${selectedCase.caseNumber}`,
        details: `Radiologist ${currentUser.name} signed off final report for ${selectedCase.caseNumber}`,
        timestamp: signedAt,
      });

      toast.success(`Report completed for ${selectedCase.caseNumber}.`);
      closeCase();
    } catch {
      toast.error('Failed to sign off report. Please try again.');
    } finally {
      setSigningOff(false);
    }
  };

  const handlePrintReport = (report: Report) => {
    const win = window.open('', '_blank', 'width=850,height=950');
    if (!win) return;
    win.document.write(`<!DOCTYPE html>
      <html>
        <head>
          <title>Radiology Report - ${escapeHtml(report.caseNumber)}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 36px; color: #111827; line-height: 1.5; }
            h1 { font-size: 20px; margin-bottom: 4px; color: #0F4C42; }
            .meta { font-size: 13px; color: #4B5563; margin-bottom: 24px; border-bottom: 1px solid #E5E7EB; padding-bottom: 12px; }
            .section { margin-bottom: 18px; }
            .label { font-size: 12px; font-weight: bold; text-transform: uppercase; color: #374151; margin-bottom: 4px; }
            .box { white-space: pre-line; font-size: 14px; background: #F9FAFB; border: 1px solid #E5E7EB; border-radius: 6px; padding: 12px; }
            .footer { margin-top: 32px; font-size: 12px; color: #4B5563; border-top: 1px solid #E5E7EB; padding-top: 12px; }
          </style>
        </head>
        <body>
          <h1>HealthGrid IQ Radiology Report</h1>
          <div class="meta">
            <strong>Case:</strong> ${escapeHtml(report.caseNumber)} &nbsp;&nbsp;
            <strong>Patient:</strong> ${escapeHtml(report.patientName)} &nbsp;&nbsp;
            <strong>Signed:</strong> ${escapeHtml(report.signedAt ? new Date(report.signedAt).toLocaleString() : 'Completed')}
          </div>
          <div class="section">
            <div class="label">Findings</div>
            <div class="box">${escapeHtml(report.findings)}</div>
          </div>
          <div class="section">
            <div class="label">Impression</div>
            <div class="box">${escapeHtml(report.impression)}</div>
          </div>
          ${
            report.suggestions
              ? `<div class="section"><div class="label">Recommendation</div><div class="box">${escapeHtml(report.suggestions)}</div></div>`
              : ''
          }
          <div class="footer">
            Signed off by: <strong>${escapeHtml(report.radiologistName)}</strong>
          </div>
        </body>
      </html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  // =========================================================================
  // VIEW A: FULL-WIDTH 50/50 SPLIT REPORTING WORKSPACE
  // =========================================================================
  if (selectedCase) {
    return (
      <div className="space-y-4">
        {/* Compact Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-surface-200 rounded-lg px-4 py-3">
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={closeCase}
              className="px-3 py-1.5 rounded-md border border-surface-300 bg-white text-xs font-medium text-surface-700 hover:bg-surface-50"
            >
              Back to Queue
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-semibold text-[#0F4C42]">{selectedCase.caseNumber}</span>
                <span className="text-sm font-semibold text-surface-900">{selectedCase.patientName}</span>
                <SeverityBadge severity={selectedCase.severity} />
                <StatusBadge status={selectedCase.status} />
              </div>
              <p className="text-xs text-surface-500 mt-0.5 truncate">
                {selectedCase.scanType}
                {selectedCase.clinicName ? `, ${selectedCase.clinicName}` : ''}
                {selectedPatient?.nric ? `, IC ${selectedPatient.nric}` : ''}
              </p>
            </div>
          </div>

          {!isCaseFinalized ? (
            <button
              type="button"
              onClick={handleGenerateDraft}
              disabled={isAnalyzing}
              className="px-3.5 py-2 rounded-md border border-emerald-300 bg-[#EFF6F3] text-[#0F4C42] hover:bg-[#D8E8E2] disabled:opacity-50 text-xs font-semibold"
            >
              {isAnalyzing ? 'Generating Draft...' : 'Generate Draft Observations'}
            </button>
          ) : (
            existingReport && (
              <button
                type="button"
                onClick={() => handlePrintReport(existingReport)}
                className="px-3.5 py-2 rounded-md border border-surface-300 bg-white text-xs font-semibold text-surface-700 hover:bg-surface-50"
              >
                Print Report
              </button>
            )
          )}
        </div>

        {/* 50/50 Split: Left = Scan Image + Notes, Right = Report Editor */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {/* Left Half: Image Viewer + Notes */}
          <div className="space-y-4">
            <PacsImageViewer imageKeys={selectedCase.images} caseItem={selectedCase} heightClass="h-[460px]" />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-lg bg-white border border-surface-200">
                <p className="font-semibold text-surface-800 mb-1">Doctor's Clinical Notes</p>
                <p className="text-surface-600 whitespace-pre-line">
                  {selectedCase.indication || selectedCase.notes || 'No clinical notes recorded.'}
                </p>
              </div>
              <div className="p-3.5 rounded-lg bg-white border border-surface-200">
                <p className="font-semibold text-surface-800 mb-1">Radiographer's Scan Notes</p>
                <p className="text-surface-600 whitespace-pre-line">
                  {selectedCase.radiographerFindings || 'No scan notes recorded.'}
                </p>
              </div>
            </div>
          </div>

          {/* Right Half: Report Editor */}
          <form onSubmit={handleSignOff} className="bg-white border border-surface-200 rounded-lg p-5 space-y-4">
            {isCaseFinalized && (
              <div className="p-3 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-700 shrink-0" />
                <span>
                  Signed off by <strong>{existingReport?.radiologistName || selectedCase.radiologistName}</strong>. Completed reports are locked.
                </span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-surface-800 mb-1.5">Findings *</label>
              <textarea
                required
                disabled={isCaseFinalized}
                rows={7}
                value={findings}
                onChange={(e) => setFindings(e.target.value)}
                placeholder="Enter radiological findings..."
                className="w-full rounded-lg border border-surface-300 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-surface-900 placeholder:text-surface-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/15 resize-y disabled:bg-surface-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-surface-800 mb-1.5">Impression *</label>
              <textarea
                required
                disabled={isCaseFinalized}
                rows={4}
                value={impression}
                onChange={(e) => setImpression(e.target.value)}
                placeholder="Enter summary impression..."
                className="w-full rounded-lg border border-surface-300 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-surface-900 placeholder:text-surface-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/15 resize-y disabled:bg-surface-50"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-surface-800 mb-1.5">Recommendation</label>
              <textarea
                disabled={isCaseFinalized}
                rows={3}
                value={recommendation}
                onChange={(e) => setRecommendation(e.target.value)}
                placeholder="Optional follow-up or clinical recommendation..."
                className="w-full rounded-lg border border-surface-300 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-surface-900 placeholder:text-surface-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/15 resize-y disabled:bg-surface-50"
              />
            </div>

            {!isCaseFinalized && (
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium text-surface-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isCriticalFinding}
                    onChange={(e) => setIsCriticalFinding(e.target.checked)}
                    className="rounded border-surface-300 text-red-600 focus:ring-red-500"
                  />
                  <span>Flag as Critical Finding</span>
                </label>
                {isCriticalFinding && (
                  <input
                    type="text"
                    value={criticalFindingNote}
                    onChange={(e) => setCriticalFindingNote(e.target.value)}
                    placeholder="Describe urgent finding for attending Medical Officer..."
                    className="input-field text-xs"
                  />
                )}
              </div>
            )}

            {!isCaseFinalized && (
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={savingDraft || signingOff}
                  onClick={handleSaveDraft}
                  className="px-4 py-2 rounded-md border border-surface-300 bg-white text-xs font-semibold text-surface-700 hover:bg-surface-50 disabled:opacity-50"
                >
                  {savingDraft ? 'Saving...' : 'Save Draft'}
                </button>
                <button
                  type="submit"
                  disabled={signingOff || savingDraft || !findings.trim() || !impression.trim()}
                  className="px-4 py-2 rounded-md bg-[#0F4C42] hover:bg-[#0B3831] text-white text-xs font-semibold disabled:opacity-50"
                >
                  {signingOff ? 'Signing Off...' : 'Sign Off & Complete'}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW B: CLEAN QUEUE & ARCHIVE TABLES
  // =========================================================================
  return (
    <div className="space-y-4">
      {/* Top Toolbar: Tabs + Filter + Search */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors ${
              activeTab === 'pending'
                ? 'bg-[#0F4C42] text-white'
                : 'bg-white border border-surface-200 text-surface-700 hover:bg-surface-50'
            }`}
          >
            Pending Review ({reviewQueue.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`px-3.5 py-2 rounded-md text-xs font-semibold transition-colors ${
              activeTab === 'completed'
                ? 'bg-[#0F4C42] text-white'
                : 'bg-white border border-surface-200 text-surface-700 hover:bg-surface-50'
            }`}
          >
            Completed Reports ({completedReports.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {activeTab === 'pending' && (
            <div className="flex items-center gap-1">
              {MODALITY_FILTERS.map((mod) => (
                <button
                  key={mod}
                  type="button"
                  onClick={() => setModalityFilter(mod)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    modalityFilter === mod
                      ? 'bg-[#EFF6F3] border-emerald-300 text-[#0F4C42] font-semibold'
                      : 'bg-white border-surface-200 text-surface-600 hover:bg-surface-50'
                  }`}
                >
                  {mod}
                </button>
              ))}
            </div>
          )}

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={activeTab === 'pending' ? queueSearch : archiveSearch}
              onChange={(e) =>
                activeTab === 'pending' ? setQueueSearch(e.target.value) : setArchiveSearch(e.target.value)
              }
              placeholder={activeTab === 'pending' ? 'Search pending cases...' : 'Search completed reports...'}
              className="input-field pl-9 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Pending Review Table */}
      {activeTab === 'pending' && (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="table-header">Case #</th>
                  <th className="table-header">Patient</th>
                  <th className="table-header">Scan Type</th>
                  <th className="table-header">Facility</th>
                  <th className="table-header">Priority</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Scanned Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {reviewQueue.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => openCase(c.id)}
                    className="cursor-pointer hover:bg-surface-100/70 transition-colors"
                  >
                    <td className="table-cell font-mono text-xs font-medium text-navy-700">{c.caseNumber}</td>
                    <td className="table-cell font-medium text-surface-900">{c.patientName}</td>
                    <td className="table-cell text-xs text-surface-700">{c.scanType}</td>
                    <td className="table-cell text-xs text-surface-500">{c.clinicName || '—'}</td>
                    <td className="table-cell"><SeverityBadge severity={c.severity} /></td>
                    <td className="table-cell"><StatusBadge status={c.status} /></td>
                    <td className="table-cell text-xs text-surface-500">
                      {new Date(c.scannedAt || c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {reviewQueue.length === 0 && (
            <p className="text-center py-12 text-sm text-surface-400">No scanned cases waiting for review.</p>
          )}
        </div>
      )}

      {/* Completed Reports Table */}
      {activeTab === 'completed' && (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="table-header">Case #</th>
                  <th className="table-header">Patient</th>
                  <th className="table-header">Signed By</th>
                  <th className="table-header">Impression</th>
                  <th className="table-header">Signed Date</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-200">
                {completedReports.map((r) => (
                  <tr key={r.id} className="hover:bg-surface-100/70 transition-colors">
                    <td className="table-cell font-mono text-xs font-medium text-navy-700">{r.caseNumber}</td>
                    <td className="table-cell font-medium text-surface-900">{r.patientName}</td>
                    <td className="table-cell text-xs text-surface-600">{r.radiologistName}</td>
                    <td className="table-cell text-xs text-surface-600 max-w-xs truncate" title={r.impression}>
                      {r.impression}
                    </td>
                    <td className="table-cell text-xs text-surface-500">
                      {r.signedAt ? new Date(r.signedAt).toLocaleDateString() : 'Completed'}
                    </td>
                    <td className="table-cell text-right whitespace-nowrap space-x-2">
                      <button
                        type="button"
                        onClick={() => handlePrintReport(r)}
                        className="px-2.5 py-1 rounded border border-surface-300 bg-white text-xs font-medium text-surface-700 hover:bg-surface-50"
                      >
                        Print
                      </button>
                      <Link
                        to={`/case/${r.caseId}`}
                        className="px-2.5 py-1 rounded bg-[#EFF6F3] text-[#0F4C42] text-xs font-semibold hover:bg-[#D8E8E2]"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {completedReports.length === 0 && (
            <p className="text-center py-12 text-sm text-surface-400">No completed reports found.</p>
          )}
        </div>
      )}
    </div>
  );
}
