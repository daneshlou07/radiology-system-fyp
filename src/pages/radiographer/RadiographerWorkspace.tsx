import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../components/ux/Toast';
import StatusBadge from '../../components/ui/StatusBadge';
import SeverityBadge from '../../components/ui/SeverityBadge';
import { saveImage, loadImages } from '../../services/imageStorage';
import type { Case } from '../../types';
import {
  Search,
  Upload,
  CheckCircle2,
  UserCheck,
  UserX,
  X,
  Calendar,
  Building2,
  ShieldAlert,
  ShieldCheck,
  FileText,
  ZoomIn,
} from 'lucide-react';

interface RadiographerWorkspaceProps {
  initialTab?: 'queue' | 'upload' | 'schedule';
}

const SCHEDULED_STATUSES = new Set([
  'CREATED',
  'CASE_CREATED',
  'SCHEDULING',
  'RADIOGRAPHER_ASSIGNED',
  'READY_FOR_SCAN',
  'SCHEDULED',
]);

const SCANNED_STATUSES = new Set([
  'SCANNING',
  'IMAGES_AVAILABLE',
  'SCANNED',
  'RADIOLOGIST_REVIEW',
  'MO_REVIEW',
  'REPORTED',
  'REPORT_SUBMITTED',
  'COMPLETED',
  'FINALIZED',
]);

const MODALITY_FILTERS = ['All', 'X-Ray', 'Ultrasound', 'CT', 'MRI'] as const;
const VIEW_OPTIONS = ['PA', 'AP', 'Lateral', 'Oblique', 'Other'] as const;

function priorityRank(c: Case): number {
  if (c.severity === 'Critical') return 0;
  if (c.severity === 'Severe') return 1;
  return 2;
}

export default function RadiographerWorkspace(_props: RadiographerWorkspaceProps) {
  const { currentUser } = useAuth();
  const { cases, patients, editCase, addAuditLog } = useData();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const caseIdFromUrl = searchParams.get('caseId') || '';

  const [queueFilter, setQueueFilter] = useState<'scheduled' | 'scanned'>('scheduled');
  const [modalityFilter, setModalityFilter] = useState<(typeof MODALITY_FILTERS)[number]>('All');
  const [search, setSearch] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState<string>(caseIdFromUrl);

  // Right-panel workflow state
  const [checkedIn, setCheckedIn] = useState(false);
  const [selectedViews, setSelectedViews] = useState<string[]>([]);
  const [kvp, setKvp] = useState('');
  const [mas, setMas] = useState('');
  const [repeats, setRepeats] = useState('0');
  const [scanNotes, setScanNotes] = useState('');
  const [pendingPreviews, setPendingPreviews] = useState<{ name: string; dataUrl: string; view: string }[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const facilityCases = useMemo(() => {
    if (!currentUser) return [];
    const centerId = currentUser.healthcareCenterId || currentUser.deploymentLocationId;
    if (currentUser.id.startsWith('quick-') || !centerId) {
      return cases;
    }
    return cases.filter(
      (c) =>
        c.clinicId === centerId ||
        c.originatingCenterId === centerId ||
        c.externalFacilityId === centerId ||
        c.radiographerId === currentUser.id
    );
  }, [cases, currentUser]);

  const scheduledCases = useMemo(() => {
    return facilityCases
      .filter((c) => !c.status || SCHEDULED_STATUSES.has(c.status))
      .sort((a, b) => {
        const pDiff = priorityRank(a) - priorityRank(b);
        if (pDiff !== 0) return pDiff;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [facilityCases]);

  const scannedCases = useMemo(() => {
    return facilityCases
      .filter((c) => SCANNED_STATUSES.has(c.status))
      .sort((a, b) => (b.scannedAt || b.createdAt).localeCompare(a.scannedAt || a.createdAt));
  }, [facilityCases]);

  const displayedCases = useMemo(() => {
    const list = queueFilter === 'scheduled' ? scheduledCases : scannedCases;
    const q = search.toLowerCase().trim();
    return list.filter((c) => {
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
    });
  }, [queueFilter, modalityFilter, scheduledCases, scannedCases, search]);

  // Sync URL param or default to first case in current list
  useEffect(() => {
    if (caseIdFromUrl) {
      setSelectedCaseId(caseIdFromUrl);
      const found = facilityCases.find((c) => c.id === caseIdFromUrl);
      if (found && SCANNED_STATUSES.has(found.status)) {
        setQueueFilter('scanned');
      }
      return;
    }
    if (!selectedCaseId && displayedCases.length > 0) {
      setSelectedCaseId(displayedCases[0].id);
    }
  }, [caseIdFromUrl, displayedCases, selectedCaseId, facilityCases]);

  const selectedCase = useMemo(
    () => facilityCases.find((c) => c.id === selectedCaseId) || null,
    [facilityCases, selectedCaseId]
  );

  const selectedPatient = useMemo(
    () => (selectedCase ? patients.find((p) => p.id === selectedCase.patientId) || null : null),
    [patients, selectedCase]
  );

  // Reset form state when switching cases
  useEffect(() => {
    if (!selectedCase) {
      setCheckedIn(false);
      setSelectedViews([]);
      setKvp('');
      setMas('');
      setRepeats('0');
      setScanNotes('');
      setPendingPreviews([]);
      setExistingImages([]);
      return;
    }
    setCheckedIn(SCANNED_STATUSES.has(selectedCase.status));
    setSelectedViews([]);
    setKvp('');
    setMas('');
    setRepeats('0');
    setScanNotes(selectedCase.radiographerFindings || '');
    setPendingPreviews([]);

    if (selectedCase.images && selectedCase.images.length > 0) {
      loadImages(selectedCase.images)
        .then((imgs) => setExistingImages(imgs))
        .catch(() => setExistingImages([]));
    } else {
      setExistingImages([]);
    }
  }, [selectedCase?.id]);

  const handleSelectCase = (c: Case) => {
    setSelectedCaseId(c.id);
    setSearchParams({ caseId: c.id });
  };

  const processFiles = (files: FileList | File[]) => {
    Array.from(files).forEach((file) => {
      if (!file.type.match(/^image\/(jpeg|png)$/)) {
        toast.error(`${file.name} is not a JPEG or PNG image.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setPendingPreviews((prev) => [
            ...prev,
            { name: file.name, dataUrl: reader.result as string, view: selectedViews[0] || 'PA' },
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  };

  const toggleView = (view: string) => {
    setSelectedViews((prev) => (prev.includes(view) ? prev.filter((v) => v !== view) : [...prev, view]));
  };

  const handleMarkNoShow = async () => {
    if (!currentUser || !selectedCase) return;
    setSubmitting(true);
    try {
      await editCase(selectedCase.id, {
        status: 'NO_SHOW',
        radiographerId: currentUser.id,
        radiographerName: currentUser.name,
      });
      await addAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'PATIENT_NO_SHOW',
        target: `cases/${selectedCase.caseNumber}`,
        details: `Marked ${selectedCase.patientName} (${selectedCase.caseNumber}) as No Show`,
        timestamp: new Date().toISOString(),
      });
      toast.info(`${selectedCase.caseNumber} marked as No Show.`);
      const nextCase = scheduledCases.find((c) => c.id !== selectedCase.id);
      if (nextCase) {
        handleSelectCase(nextCase);
      } else {
        setSelectedCaseId('');
      }
    } catch {
      toast.error('Failed to update case status.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCompleteScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedCase) return;

    if (!checkedIn) {
      toast.error('Please check in the patient before completing the scan.');
      return;
    }
    if (pendingPreviews.length === 0 && existingImages.length === 0) {
      toast.error('Please upload at least one JPEG or PNG scan image.');
      return;
    }

    setSubmitting(true);
    try {
      const savedKeys: string[] = [...(selectedCase.images || [])];
      for (const item of pendingPreviews) {
        const key = await saveImage(item.dataUrl);
        savedKeys.push(key);
      }

      const techSummaryParts: string[] = [];
      if (selectedViews.length > 0) techSummaryParts.push(`Views: ${selectedViews.join(', ')}`);
      if (kvp.trim()) techSummaryParts.push(`kVp: ${kvp.trim()}`);
      if (mas.trim()) techSummaryParts.push(`mAs: ${mas.trim()}`);
      if (repeats && repeats !== '0') techSummaryParts.push(`Repeats: ${repeats}`);

      const combinedNotes = [
        techSummaryParts.length > 0 ? `[Technical] ${techSummaryParts.join(' · ')}` : '',
        scanNotes.trim(),
      ]
        .filter(Boolean)
        .join('\n');

      await editCase(selectedCase.id, {
        status: 'SCANNED',
        images: savedKeys,
        radiographerFindings: combinedNotes || undefined,
        radiographerId: currentUser.id,
        radiographerName: currentUser.name,
        scannedAt: new Date().toISOString(),
      });

      await addAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'SCAN_UPLOADED',
        target: `cases/${selectedCase.caseNumber}`,
        details: `Uploaded ${pendingPreviews.length} scan image(s) for ${selectedCase.patientName} (${selectedCase.caseNumber})`,
        timestamp: new Date().toISOString(),
      });

      toast.success(`Scan uploaded for ${selectedCase.caseNumber}. Status is now Scanned.`);
      setPendingPreviews([]);

      const nextCase = scheduledCases.find((c) => c.id !== selectedCase.id);
      if (nextCase) {
        handleSelectCase(nextCase);
      }
    } catch {
      toast.error('Failed to upload scan. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const isAlreadyScanned = selectedCase ? SCANNED_STATUSES.has(selectedCase.status) : false;
  const isMalePatient = selectedPatient?.gender === 'Male';
  const showExposureFields = Boolean(
    selectedCase &&
      `${selectedCase.modality || ''} ${selectedCase.scanType || ''}`.toLowerCase().match(/x-ray|ct|radiograph/)
  );

  // Safety flags for highlighting alerts
  const safetyFlags = useMemo(() => {
    if (!selectedCase) return [];
    const isAlertValue = (v: string) => ['yes', 'ya', 'unsure', 'tidak pasti'].includes(v.toLowerCase());
    const flags: { label: string; value: string; alert: boolean }[] = [];
    if (!isMalePatient) {
      const val = String(selectedCase.isPregnant || 'No');
      flags.push({ label: 'Pregnancy', value: val, alert: isAlertValue(val) });
    }
    const allergyVal = String(selectedCase.previousContrastReaction || 'No');
    flags.push({ label: 'Allergies', value: allergyVal, alert: isAlertValue(allergyVal) });
    const asthmaVal = String(selectedCase.hasAsthma || 'No');
    flags.push({ label: 'Asthma', value: asthmaVal, alert: isAlertValue(asthmaVal) });
    return flags;
  }, [selectedCase, isMalePatient]);

  const hasSafetyAlert = safetyFlags.some((f) => f.alert);

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Priority Queue & Modality Filter */}
        <div className="lg:col-span-5 card space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setQueueFilter('scheduled')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                queueFilter === 'scheduled'
                  ? 'bg-[#0F4C42] text-white'
                  : 'bg-surface-100 text-surface-700 hover:bg-surface-200'
              }`}
            >
              Scheduled ({scheduledCases.length})
            </button>
            <button
              type="button"
              onClick={() => setQueueFilter('scanned')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-colors ${
                queueFilter === 'scanned'
                  ? 'bg-[#0F4C42] text-white'
                  : 'bg-surface-100 text-surface-700 hover:bg-surface-200'
              }`}
            >
              Scanned ({scannedCases.length})
            </button>
          </div>

          {/* Modality Room Filter */}
          <div className="flex flex-wrap gap-1.5">
            {MODALITY_FILTERS.map((mod) => (
              <button
                key={mod}
                type="button"
                onClick={() => setModalityFilter(mod)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium border transition-colors ${
                  modalityFilter === mod
                    ? 'bg-[#EFF6F3] border-emerald-300 text-[#0F4C42] font-semibold'
                    : 'bg-white border-surface-200 text-surface-600 hover:bg-surface-50'
                }`}
              >
                {mod}
              </button>
            ))}
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by case #, patient, or scan..."
              className="input-field pl-9 text-xs"
            />
          </div>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {displayedCases.length === 0 ? (
              <p className="text-xs text-surface-400 text-center py-10">
                No {queueFilter} cases found.
              </p>
            ) : (
              displayedCases.map((c) => {
                const isSelected = c.id === selectedCaseId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectCase(c)}
                    className={`w-full text-left p-3 rounded-lg border transition-colors space-y-1.5 ${
                      isSelected
                        ? 'bg-[#EFF6F3] border-emerald-300'
                        : 'bg-white border-surface-200 hover:border-emerald-200 hover:bg-surface-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-navy-700">{c.caseNumber}</span>
                      <SeverityBadge severity={c.severity} />
                    </div>
                    <p className="text-xs font-semibold text-surface-900 truncate">{c.patientName}</p>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-surface-500">
                      <span className="truncate">{c.scanType}</span>
                      <StatusBadge status={c.status} />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Referral Summary, Check-in, Technical Factors, Scan Notes & Image Upload */}
        <div className="lg:col-span-7 card">
          {!selectedCase ? (
            <div className="text-center py-16 text-surface-400 text-sm">
              Select a scheduled case from the left to check in the patient and upload scan images.
            </div>
          ) : (
            <form onSubmit={handleCompleteScan} className="space-y-5">
              {/* Case Header */}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#0F4C42]">{selectedCase.caseNumber}</span>
                    <SeverityBadge severity={selectedCase.severity} />
                    <StatusBadge status={selectedCase.status} />
                  </div>
                  <h2 className="text-lg font-bold text-surface-900 mt-1">{selectedCase.patientName}</h2>
                  <p className="text-xs text-surface-500">
                    {selectedPatient?.nric ? `IC: ${selectedPatient.nric}` : ''}
                    {selectedPatient?.gender ? ` · ${selectedPatient.gender}` : ''}
                    {selectedPatient?.phone ? ` · ${selectedPatient.phone}` : ''}
                  </p>
                </div>
              </div>

              {/* Referral Summary & Safety Alert */}
              <div
                className={`p-4 rounded-lg border space-y-3 text-xs ${
                  hasSafetyAlert
                    ? 'bg-amber-50/70 border-amber-300'
                    : 'bg-surface-50 border-surface-200'
                }`}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-[#0F4C42] shrink-0" />
                    <span className="font-semibold text-surface-800">{selectedCase.scanType}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-[#0F4C42] shrink-0" />
                    <span className="text-surface-700 truncate">{selectedCase.clinicName || 'Assigned Facility'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-[#0F4C42] shrink-0" />
                    <span className="text-surface-700">
                      Appointment: {selectedCase.officeTarikhAppointment || new Date(selectedCase.scheduledAt || selectedCase.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {hasSafetyAlert ? (
                      <ShieldAlert className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    ) : (
                      <ShieldCheck className="w-3.5 h-3.5 text-[#0F4C42] shrink-0" />
                    )}
                    {safetyFlags.map((f) => (
                      <span
                        key={f.label}
                        className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                          f.alert
                            ? 'bg-red-100 text-red-800 font-bold'
                            : 'text-surface-700'
                        }`}
                      >
                        {f.label}: {f.value}
                      </span>
                    ))}
                  </div>
                </div>

                {(selectedCase.indication || selectedCase.notes) && (
                  <div className="pt-2 border-t border-surface-200/80">
                    <p className="font-semibold text-surface-700 mb-0.5">Doctor's Clinical Notes</p>
                    <p className="text-surface-600 whitespace-pre-line">{selectedCase.indication || selectedCase.notes}</p>
                  </div>
                )}
              </div>

              {/* 1. Patient Check-in & No Show */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-lg border border-surface-200 bg-white">
                <div className="flex items-center gap-2.5">
                  <UserCheck className={`w-4 h-4 ${checkedIn ? 'text-emerald-600' : 'text-surface-400'}`} />
                  <span className="text-xs font-semibold text-surface-800">Patient Arrival &amp; ID Check</span>
                </div>
                <div className="flex items-center gap-2">
                  {!isAlreadyScanned && !checkedIn && (
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={handleMarkNoShow}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 text-red-700 hover:bg-red-50 transition-colors"
                    >
                      <UserX className="w-3.5 h-3.5" />
                      <span>No Show</span>
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isAlreadyScanned}
                    onClick={() => setCheckedIn((v) => !v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      checkedIn
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-white border-surface-300 text-surface-700 hover:bg-surface-50'
                    }`}
                  >
                    {checkedIn ? 'Checked In' : 'Mark Checked In'}
                  </button>
                </div>
              </div>

              {/* 2. Technical Record (Views, Exposure, Repeats) */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                <div className={showExposureFields ? 'sm:col-span-6' : 'sm:col-span-9'}>
                  <label className="block text-xs font-semibold text-surface-700 mb-1.5">Views Taken</label>
                  <div className="flex flex-wrap gap-1.5">
                    {VIEW_OPTIONS.map((view) => (
                      <button
                        key={view}
                        type="button"
                        onClick={() => toggleView(view)}
                        className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                          selectedViews.includes(view)
                            ? 'bg-[#0F4C42] text-white border-[#0F4C42]'
                            : 'bg-white text-surface-700 border-surface-300 hover:bg-surface-50'
                        }`}
                      >
                        {view}
                      </button>
                    ))}
                  </div>
                </div>

                {showExposureFields && (
                  <>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-surface-700 mb-1.5">kVp</label>
                      <input
                        type="text"
                        value={kvp}
                        onChange={(e) => setKvp(e.target.value)}
                        placeholder="e.g. 70"
                        className="input-field text-xs py-1.5"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-surface-700 mb-1.5">mAs</label>
                      <input
                        type="text"
                        value={mas}
                        onChange={(e) => setMas(e.target.value)}
                        placeholder="e.g. 8"
                        className="input-field text-xs py-1.5"
                      />
                    </div>
                  </>
                )}

                <div className={showExposureFields ? 'sm:col-span-2' : 'sm:col-span-3'}>
                  <label className="block text-xs font-semibold text-surface-700 mb-1.5">Repeats</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={repeats}
                    onChange={(e) => setRepeats(e.target.value)}
                    className="input-field text-xs py-1.5"
                  />
                </div>
              </div>

              {/* 3. Scan Notes */}
              <div>
                <label className="block text-xs font-semibold text-surface-700 mb-1.5">
                  Scan Notes
                </label>
                <textarea
                  rows={2}
                  value={scanNotes}
                  onChange={(e) => setScanNotes(e.target.value)}
                  placeholder="Write positioning notes, patient cooperation, or technical observations..."
                  className="w-full rounded-lg border border-surface-300 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-surface-900 placeholder:text-surface-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/15 resize-y"
                />
              </div>

              {/* 4. Drag-and-Drop Scan Image Upload */}
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-surface-700">
                  Scan Image (JPEG or PNG) *
                </label>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full py-6 px-4 rounded-lg border-2 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center gap-1.5 text-xs ${
                    isDragging
                      ? 'border-emerald-400 bg-[#EFF6F3] text-[#0F4C42]'
                      : 'border-surface-300 hover:border-emerald-300 bg-surface-50 hover:bg-[#F3F8F6] text-surface-600'
                  }`}
                >
                  <Upload className="w-5 h-5 text-[#0F4C42]" />
                  <span className="font-semibold text-surface-800">
                    Drag &amp; drop JPEG or PNG scan images here, or click to browse
                  </span>
                </div>

                {(existingImages.length > 0 || pendingPreviews.length > 0) && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {existingImages.map((src, idx) => (
                      <div key={`existing-${idx}`} className="group relative rounded-lg overflow-hidden border border-surface-200 bg-black/5 aspect-square">
                        <img
                          src={src}
                          alt={`Uploaded scan ${idx + 1}`}
                          onClick={() => setLightboxSrc(src)}
                          className="w-full h-full object-cover cursor-pointer"
                        />
                        <button
                          type="button"
                          onClick={() => setLightboxSrc(src)}
                          className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="Preview image"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                        <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px]">
                          Saved
                        </span>
                      </div>
                    ))}
                    {pendingPreviews.map((item, idx) => (
                      <div key={`pending-${idx}`} className="group relative rounded-lg overflow-hidden border border-[#0F4C42]/40 bg-black/5 flex flex-col">
                        <div className="relative aspect-square overflow-hidden">
                          <img
                            src={item.dataUrl}
                            alt={item.name}
                            onClick={() => setLightboxSrc(item.dataUrl)}
                            className="w-full h-full object-cover cursor-pointer"
                          />
                          <button
                            type="button"
                            onClick={() => setPendingPreviews((prev) => prev.filter((_, i) => i !== idx))}
                            className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white hover:bg-red-600"
                            aria-label="Remove image"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <select
                          value={item.view}
                          onChange={(e) => {
                            const val = e.target.value;
                            setPendingPreviews((prev) =>
                              prev.map((p, i) => (i === idx ? { ...p, view: val } : p))
                            );
                          }}
                          className="w-full text-[11px] bg-white border-t border-surface-200 px-2 py-1 text-surface-700 focus:outline-none"
                        >
                          {VIEW_OPTIONS.map((v) => (
                            <option key={v} value={v}>
                              View: {v}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting || !checkedIn || (pendingPreviews.length === 0 && existingImages.length === 0)}
                  className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-50"
                >
                  {submitting ? (
                    <span>Uploading...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isAlreadyScanned ? 'Save Additional Scans' : 'Complete Scan & Mark Scanned'}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Full-size Image Preview Lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightboxSrc(null)}
              className="absolute -top-3 -right-3 p-1.5 rounded-full bg-white text-surface-900 shadow-md hover:bg-surface-100"
              aria-label="Close preview"
            >
              <X className="w-4 h-4" />
            </button>
            <img
              src={lightboxSrc}
              alt="Scan preview"
              className="max-w-full max-h-[85vh] rounded-lg object-contain bg-black"
            />
          </div>
        </div>
      )}
    </>
  );
}
