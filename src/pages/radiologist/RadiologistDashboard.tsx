import React, { useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import StatsCard from '../../components/ui/StatsCard';
import StatusBadge from '../../components/ui/StatusBadge';
import SeverityBadge from '../../components/ui/SeverityBadge';
import { Eye, Clock, CheckCircle } from 'lucide-react';
import type { Case } from '../../types';

const PENDING_REVIEW_STATUSES = new Set([
  'SCANNED',
  'IMAGES_AVAILABLE',
  'EXTERNAL_IMAGES_AVAILABLE',
]);

const UNDER_REVIEW_STATUSES = new Set([
  'RADIOLOGIST_REVIEW',
  'MO_REVIEW',
  'REPORTED',
]);

const COMPLETED_STATUSES = new Set([
  'COMPLETED',
  'FINALIZED',
  'REPORT_SUBMITTED',
]);

function priorityRank(c: Case): number {
  if (c.severity === 'Critical') return 0;
  if (c.severity === 'Severe') return 1;
  return 2;
}

export default function RadiologistDashboard() {
  const { currentUser } = useAuth();
  const { cases, reports } = useData();
  const navigate = useNavigate();

  const reportedCaseIds = useMemo(
    () => new Set(reports.filter((r) => r.status === 'final' || r.status === 'Verified / Signed Off').map((r) => r.caseId)),
    [reports]
  );

  const pendingReview = useMemo(() => {
    return cases
      .filter((c) => PENDING_REVIEW_STATUSES.has(c.status) && !reportedCaseIds.has(c.id))
      .sort((a, b) => {
        const pDiff = priorityRank(a) - priorityRank(b);
        if (pDiff !== 0) return pDiff;
        return (b.scannedAt || b.createdAt).localeCompare(a.scannedAt || a.createdAt);
      });
  }, [cases, reportedCaseIds]);

  const underReview = useMemo(() => {
    return cases
      .filter((c) => UNDER_REVIEW_STATUSES.has(c.status) && !reportedCaseIds.has(c.id))
      .sort((a, b) => {
        const pDiff = priorityRank(a) - priorityRank(b);
        if (pDiff !== 0) return pDiff;
        return (b.scannedAt || b.createdAt).localeCompare(a.scannedAt || a.createdAt);
      });
  }, [cases, reportedCaseIds]);

  const completed = useMemo(
    () => cases.filter((c) => COMPLETED_STATUSES.has(c.status) || reportedCaseIds.has(c.id)),
    [cases, reportedCaseIds]
  );

  const actionQueue = useMemo(() => [...underReview, ...pendingReview], [underReview, pendingReview]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Welcome, {currentUser?.name || 'Doctor'}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard title="Pending Review" value={pendingReview.length} icon={<Eye className="w-5 h-5" />} color="navy" />
        <StatsCard title="Under Review" value={underReview.length} icon={<Clock className="w-5 h-5" />} color="amber" />
        <StatsCard title="Completed" value={completed.length} icon={<CheckCircle className="w-5 h-5" />} color="emerald" />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Pending Review</h2>
          <Link to="/review-queue" className="text-sm text-navy-600 hover:text-navy-700 font-medium">
            Open Review &amp; Report
          </Link>
        </div>

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
              {actionQueue.slice(0, 8).map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/review-queue?caseId=${c.id}`)}
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

        {actionQueue.length === 0 && (
          <p className="text-surface-400 text-sm text-center py-8">No scanned cases waiting for review.</p>
        )}
      </div>
    </div>
  );
}
