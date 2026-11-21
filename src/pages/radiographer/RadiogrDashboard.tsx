import React, { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import StatsCard from '../../components/ui/StatsCard';
import StatusBadge from '../../components/ui/StatusBadge';
import SeverityBadge from '../../components/ui/SeverityBadge';
import { Calendar, CheckCircle, AlertTriangle } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { Case } from '../../types';

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

function priorityRank(c: Case): number {
  if (c.severity === 'Critical') return 0;
  if (c.severity === 'Severe') return 1;
  return 2;
}

export default function RadiogrDashboard() {
  const { currentUser } = useAuth();
  const { cases } = useData();
  const navigate = useNavigate();

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

  const scheduled = useMemo(() => {
    return facilityCases
      .filter((c) => !c.status || SCHEDULED_STATUSES.has(c.status))
      .sort((a, b) => {
        const pDiff = priorityRank(a) - priorityRank(b);
        if (pDiff !== 0) return pDiff;
        return b.createdAt.localeCompare(a.createdAt);
      });
  }, [facilityCases]);

  const scanned = useMemo(
    () => facilityCases.filter((c) => SCANNED_STATUSES.has(c.status)),
    [facilityCases]
  );

  const urgentCount = useMemo(
    () => scheduled.filter((c) => c.severity === 'Critical' || c.severity === 'Severe').length,
    [scheduled]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Welcome, {currentUser?.name?.split(' ')[0]}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard title="Scheduled" value={scheduled.length} icon={<Calendar className="w-5 h-5" />} color="navy" />
        <StatsCard title="Scanned" value={scanned.length} icon={<CheckCircle className="w-5 h-5" />} color="emerald" />
        <StatsCard title="Emergency / Urgent" value={urgentCount} icon={<AlertTriangle className="w-5 h-5" />} color="amber" />
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Scheduled Scan Queue</h2>
          <Link to="/scan-queue" className="text-sm text-navy-600 hover:text-navy-700 font-medium">
            Open Scan &amp; Upload
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
                <th className="table-header">Appointment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {scheduled.slice(0, 8).map((c) => (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/scan-queue?caseId=${c.id}`)}
                  className="cursor-pointer hover:bg-surface-100/70 transition-colors"
                >
                  <td className="table-cell font-mono text-xs font-medium text-navy-700">{c.caseNumber}</td>
                  <td className="table-cell font-medium text-surface-900">{c.patientName}</td>
                  <td className="table-cell text-xs text-surface-700">{c.scanType}</td>
                  <td className="table-cell text-xs text-surface-500">{c.clinicName || '—'}</td>
                  <td className="table-cell"><SeverityBadge severity={c.severity} /></td>
                  <td className="table-cell"><StatusBadge status={c.status} /></td>
                  <td className="table-cell text-xs text-surface-500">
                    {c.officeTarikhAppointment || new Date(c.scheduledAt || c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {scheduled.length === 0 && (
          <p className="text-surface-400 text-sm text-center py-8">No scheduled scans waiting.</p>
        )}
      </div>
    </div>
  );
}
