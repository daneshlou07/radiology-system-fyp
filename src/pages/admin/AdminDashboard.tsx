import React, { useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import StatsCard from '../../components/ui/StatsCard';
import { Building2, CheckCircle2, Wrench, Users } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { Clinic } from '../../types';
import { sanitizeUserRole } from '../../services/dataService';

const CORE_MODALITIES = ['X-Ray', 'Ultrasound', 'CT', 'MRI'] as const;
const CORE_ROLES = new Set(['Medical Officer', 'Radiographer', 'Radiologist', 'Administrator']);

function deduplicateClinics(clinics: Clinic[]): Clinic[] {
  const seenCoords = new Set<string>();
  const result: Clinic[] = [];
  const hasTanjongKarang = clinics.some((c) => c.name.toLowerCase().includes('tanjong karang'));

  for (const c of clinics) {
    const lower = (c.name || '').toLowerCase();
    if (hasTanjongKarang && lower.includes('tanjong karong')) continue;

    const coordKey =
      typeof c.latitude === 'number' && typeof c.longitude === 'number'
        ? `${c.latitude.toFixed(3)},${c.longitude.toFixed(3)}`
        : c.id;
    if (seenCoords.has(coordKey)) continue;
    seenCoords.add(coordKey);
    result.push(c);
  }
  return result;
}

function resolveOrgType(clinic: Clinic): string {
  if (clinic.organizationType) return clinic.organizationType;
  const lower = (clinic.name || '').toLowerCase();
  if (lower.includes('kpj') || lower.includes('sunway') || lower.includes('private')) return 'Private Hospital';
  if (lower.includes('hospital')) return 'Public Hospital';
  return 'Klinik Kesihatan';
}

export default function AdminDashboard() {
  const { currentUser } = useAuth();
  const { clinics, users } = useData();
  const navigate = useNavigate();

  const uniqueClinics = useMemo(() => deduplicateClinics(clinics), [clinics]);
  const activeClinics = useMemo(
    () => uniqueClinics.filter((c) => c.status === 'active'),
    [uniqueClinics]
  );

  const machineStats = useMemo(() => {
    let active = 0;
    let maintenance = 0;
    activeClinics.forEach((clinic) => {
      CORE_MODALITIES.forEach((mod) => {
        const status = clinic.machineStatus?.[mod] || 'Active';
        if (status === 'Maintenance') maintenance += 1;
        else active += 1;
      });
    });
    return { active, maintenance };
  }, [activeClinics]);

  const staffCount = useMemo(() => {
    return users.filter((u) => {
      if (u.email === 'daneshlou05@gmail.com' || u.id === 'admin-master') return false;
      const role = sanitizeUserRole(u).role;
      return CORE_ROLES.has(role);
    }).length;
  }, [users]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Welcome, {currentUser?.name?.split(' ')[0]}</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to="/clinics">
          <StatsCard title="Clinics" value={activeClinics.length} icon={<Building2 className="w-5 h-5" />} color="navy" />
        </Link>
        <Link to="/clinics">
          <StatsCard title="Active Machines" value={machineStats.active} icon={<CheckCircle2 className="w-5 h-5" />} color="emerald" />
        </Link>
        <Link to="/clinics">
          <StatsCard title="Under Maintenance" value={machineStats.maintenance} icon={<Wrench className="w-5 h-5" />} color="amber" />
        </Link>
        <Link to="/users">
          <StatsCard title="Staff Users" value={staffCount} icon={<Users className="w-5 h-5" />} color="purple" />
        </Link>
      </div>

      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200">
          <h2 className="section-title">Facility Machine Status</h2>
          <Link to="/clinics" className="text-xs font-medium text-teal-700 hover:text-teal-900">
            Manage Clinics
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="table-header">Healthcare Center</th>
                <th className="table-header">Type</th>
                {CORE_MODALITIES.map((mod) => (
                  <th key={mod} className="table-header text-center">{mod}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200">
              {uniqueClinics.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-surface-400 text-sm">
                    No clinics registered yet.
                  </td>
                </tr>
              ) : (
                uniqueClinics.map((clinic) => (
                  <tr
                    key={clinic.id}
                    onClick={() => navigate('/clinics')}
                    className="hover:bg-surface-100 transition-colors cursor-pointer"
                  >
                    <td className="table-cell font-semibold text-surface-800 text-xs">
                      {clinic.name}
                    </td>
                    <td className="table-cell text-xs text-surface-600">
                      {resolveOrgType(clinic)}
                    </td>
                    {CORE_MODALITIES.map((mod) => {
                      const status = clinic.machineStatus?.[mod] || 'Active';
                      const isMaint = status === 'Maintenance';
                      return (
                        <td key={mod} className="table-cell text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold border ${
                              isMaint
                                ? 'bg-amber-50 text-amber-800 border-amber-300'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}
                          >
                            {status}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
