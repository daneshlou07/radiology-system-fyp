import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import StatsCard from '../../components/ui/StatsCard';
import StatusBadge from '../../components/ui/StatusBadge';
import SeverityBadge from '../../components/ui/SeverityBadge';
import { FolderOpen, CheckCircle, Eye, Calendar } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DepartmentDashboard() {
  const { currentUser } = useAuth();
  const { cases, getScopedCases } = useData();
  const rawScoped = getScopedCases ? getScopedCases() : cases;
  const scopedCases = currentUser?.id?.startsWith('quick-') ? cases : rawScoped;

  const scheduled = scopedCases.filter((c) => !c.status || c.status === 'CREATED' || c.status === 'CASE_CREATED' || c.status === 'SCHEDULED' || c.status === 'SCHEDULING' || c.status === 'RADIOGRAPHER_ASSIGNED' || c.status === 'READY_FOR_SCAN');
  const scanned = scopedCases.filter((c) => c.status === 'SCANNING' || c.status === 'IMAGES_AVAILABLE' || c.status === 'SCANNED');
  const underReview = scopedCases.filter((c) => (c.status === 'RADIOLOGIST_REVIEW' || c.status === 'MO_REVIEW' || c.status === 'REPORTED') && !c.finalizedAt);
  const completed = scopedCases.filter((c) => c.status === 'FINALIZED' || c.status === 'COMPLETED' || c.status === 'REPORT_SUBMITTED' || Boolean(c.finalizedAt));
  const recentCases = [...scopedCases].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Welcome, {currentUser?.name || 'Doctor'}</h1>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard title="Scheduled" value={scheduled.length} icon={<Calendar className="w-5 h-5" />} color="navy" />
        <StatsCard title="Scanned" value={scanned.length} icon={<FolderOpen className="w-5 h-5" />} color="amber" />
        <StatsCard title="Under Review" value={underReview.length} icon={<Eye className="w-5 h-5" />} color="purple" />
        <StatsCard title="Completed" value={completed.length} icon={<CheckCircle className="w-5 h-5" />} color="emerald" />
      </div>

      {/* Recent Cases */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="section-title">Recent Cases</h2>
          <Link to="/cases" className="text-sm text-navy-600 hover:text-navy-700 font-medium">View all &rarr;</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="table-header">Case #</th>
                <th className="table-header">Patient</th>
                <th className="table-header">Clinic</th>
                <th className="table-header">Modality</th>
                <th className="table-header">Severity</th>
                <th className="table-header">Status</th>
                <th className="table-header">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {recentCases.map((c) => (
                <tr key={c.id} className="hover:bg-surface-100 transition-colors">
                  <td className="table-cell"><Link to={`/case/${c.id}`} className="font-mono text-navy-600 font-medium text-xs hover:underline">{c.caseNumber}</Link></td>
                  <td className="table-cell font-medium text-surface-800">{c.patientName}</td>
                  <td className="table-cell text-xs text-surface-500">{c.clinicName || 'Pending'}</td>
                  <td className="table-cell text-surface-600 text-xs">{c.scanType}</td>
                  <td className="table-cell"><SeverityBadge severity={c.severity} /></td>
                  <td className="table-cell"><StatusBadge status={c.status} /></td>
                  <td className="table-cell text-surface-500 text-xs">{new Date(c.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {recentCases.length === 0 && <div className="text-center py-10 text-surface-400 text-sm">No cases yet.</div>}
      </div>
    </div>
  );
}
