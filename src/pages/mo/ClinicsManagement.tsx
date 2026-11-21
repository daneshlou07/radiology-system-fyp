import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../components/ux/Toast';
import type { Clinic, HealthcareOrganizationType } from '../../types';
import Modal from '../../components/ui/Modal';
import { PredictiveAddressInput } from '../../components/ui/PredictiveAddressInput';
import { saveClinic } from '../../services/dataService';
import {
  MapPin,
  Phone,
  Mail,
  Plus,
  Edit2,
  Trash2,
  ShieldCheck,
  ShieldOff,
  Search,
  AlertTriangle,
  ClipboardPaste,
  ExternalLink,
  Printer,
  Building2,
  Building,
  Layers,
} from 'lucide-react';

const MODALITIES = ['X-Ray', 'Ultrasound', 'CT', 'MRI'];

const ORGANIZATION_TYPES: HealthcareOrganizationType[] = [
  'Klinik Kesihatan',
  'Public Hospital',
  'Private Hospital',
];

function deduplicateClinics(list: Clinic[]): Clinic[] {
  const seenCoords = new Set<string>();
  const result: Clinic[] = [];
  const hasTanjongKarang = list.some((c) => c.name.toLowerCase().includes('tanjong karang'));

  for (const c of list) {
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

/**
 * Robust Google Maps & standard coordinate parser.
 * Preserves the EXACT full-precision strings as copied from Google Maps.
 */
function parseCoordinatePair(raw: string): { latStr: string; lonStr: string; lat: number; lon: number } | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // 1. Google Maps URL pattern: /@3.425957,101.178600, or ?q=3.425957,101.178600 or &ll=3.425957,101.178600
  const urlMatch = trimmed.match(/[@?&](?:q=|ll=)?(-?\d+\.\d+)[,\s]+(-?\d+\.\d+)/);
  if (urlMatch) {
    const lat = parseFloat(urlMatch[1]);
    const lon = parseFloat(urlMatch[2]);
    if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { latStr: urlMatch[1], lonStr: urlMatch[2], lat, lon };
    }
  }

  // 2. Comma/space/tab separated coordinates: e.g. "3.425956609242111, 101.17859962394074"
  const pairMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)[,\s\t]+(-?\d+(?:\.\d+)?)$/);
  if (pairMatch) {
    const lat = parseFloat(pairMatch[1]);
    const lon = parseFloat(pairMatch[2]);
    if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { latStr: pairMatch[1], lonStr: pairMatch[2], lat, lon };
    }
  }

  return null;
}

export default function ClinicsManagement() {
  const { currentUser } = useAuth();
  const { clinics, setClinics, softDelete, addAuditLog } = useData();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [selectedOrgType, setSelectedOrgType] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Clinic | null>(null);
  const [deletingClinic, setDeletingClinic] = useState<Clinic | null>(null);
  const [rawCoordinates, setRawCoordinates] = useState('');
  const [form, setForm] = useState<{
    name: string;
    organizationType: HealthcareOrganizationType;
    address: string;
    phone: string;
    fax: string;
    email: string;
    latitude: string;
    longitude: string;
    modalities: string[];
    machineStatus: Record<string, 'Active' | 'Maintenance'>;
    operatingHours: string;
  }>({
    name: '',
    organizationType: 'Klinik Kesihatan',
    address: '',
    phone: '',
    fax: '',
    email: '',
    latitude: '',
    longitude: '',
    modalities: [...MODALITIES],
    machineStatus: { 'X-Ray': 'Active', Ultrasound: 'Active', CT: 'Active', MRI: 'Active' },
    operatingHours: '08:00 - 17:00',
  });

  const uniqueClinics = useMemo(() => deduplicateClinics(clinics), [clinics]);

  const filtered = useMemo(() => {
    return uniqueClinics.filter((c) => {
      const matchesSearch =
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.address.toLowerCase().includes(search.toLowerCase()) ||
        (c.organizationType && c.organizationType.toLowerCase().includes(search.toLowerCase()));

      if (!matchesSearch) return false;

      if (selectedOrgType !== 'all') {
        const cOrgType = c.organizationType || (
          c.name.toLowerCase().includes('kpj') || c.name.toLowerCase().includes('sunway') || c.name.toLowerCase().includes('private')
            ? 'Private Hospital'
            : c.name.toLowerCase().includes('hospital')
            ? 'Public Hospital'
            : 'Klinik Kesihatan'
        );
        if (cOrgType !== selectedOrgType) return false;
      }

      return true;
    });
  }, [uniqueClinics, search, selectedOrgType]);

  const openCreate = () => {
    setEditing(null);
    setRawCoordinates('');
    setForm({
      name: '',
      organizationType: 'Klinik Kesihatan',
      address: '',
      phone: '',
      fax: '',
      email: '',
      latitude: '',
      longitude: '',
      modalities: [...MODALITIES],
      machineStatus: { 'X-Ray': 'Active', Ultrasound: 'Active', CT: 'Active', MRI: 'Active' },
      operatingHours: '08:00 - 17:00',
    });
    setShowModal(true);
  };

  const openEdit = (clinic: Clinic) => {
    setEditing(clinic);
    const coords = clinic.latitude && clinic.longitude ? `${clinic.latitude}, ${clinic.longitude}` : '';
    setRawCoordinates(coords);
    const initialMachines: Record<string, 'Active' | 'Maintenance'> = {};
    MODALITIES.forEach((m) => {
      initialMachines[m] = clinic.machineStatus?.[m] || 'Active';
    });
    setForm({
      name: clinic.name,
      organizationType: clinic.organizationType || (
        clinic.name.toLowerCase().includes('kpj') || clinic.name.toLowerCase().includes('sunway')
          ? 'Private Hospital'
          : clinic.name.toLowerCase().includes('hospital')
          ? 'Public Hospital'
          : 'Klinik Kesihatan'
      ),
      address: clinic.address,
      phone: clinic.phone,
      fax: clinic.fax || '',
      email: clinic.email || '',
      latitude: String(clinic.latitude),
      longitude: String(clinic.longitude),
      modalities: [...MODALITIES],
      machineStatus: initialMachines,
      operatingHours: clinic.operatingHours || '08:00 - 17:00',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!currentUser) return;

    if (editing) {
      const updated: Clinic = {
        ...editing,
        name: form.name,
        organizationType: form.organizationType,
        address: form.address,
        phone: form.phone,
        fax: form.fax || undefined,
        email: form.email || undefined,
        operatingHours: form.operatingHours,
        supportedModalities: form.modalities,
        machineStatus: form.machineStatus,
        latitude: parseFloat(form.latitude) || editing.latitude,
        longitude: parseFloat(form.longitude) || editing.longitude,
      };

      setClinics((prev) => prev.map((c) => c.id === editing.id ? updated : c));
      await saveClinic(updated);
      await addAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CLINIC_UPDATED',
        target: `clinics/${editing.id}`,
        details: `Updated healthcare center: ${form.name} (${form.organizationType})`,
        timestamp: new Date().toISOString(),
      });
      toast.success(`${form.name} updated successfully`);
    } else {
      const newClinic: Clinic = {
        id: `clinic-${Date.now()}`,
        organizationId: form.organizationType === 'Klinik Kesihatan'
          ? 'org-moh-selangor'
          : (form.organizationType === 'Public Hospital' ? 'org-moh-tertiary' : 'org-private-group'),
        organizationType: form.organizationType,
        name: form.name,
        address: form.address,
        phone: form.phone,
        fax: form.fax || undefined,
        email: form.email || undefined,
        operatingHours: form.operatingHours,
        supportedModalities: form.modalities.length ? form.modalities : ['X-Ray', 'Ultrasound'],
        machineStatus: Object.keys(form.machineStatus).length > 0 ? form.machineStatus : { 'X-Ray': 'Active', Ultrasound: 'Active' },
        latitude: parseFloat(form.latitude) || 3.0,
        longitude: parseFloat(form.longitude) || 101.5,
        status: 'active',
      };

      setClinics((prev) => [...prev, newClinic]);
      await saveClinic(newClinic);
      await addAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CLINIC_CREATED',
        target: `clinics/${newClinic.id}`,
        details: `Created new ${form.organizationType}: ${form.name}`,
        timestamp: new Date().toISOString(),
      });
      toast.success(`New ${form.organizationType} "${form.name}" created`);
    }

    setShowModal(false);
  };

  const toggleStatus = async (clinic: Clinic) => {
    if (!currentUser) return;
    const newStatus = clinic.status === 'active' ? 'inactive' : 'active';
    const updated: Clinic = { ...clinic, status: newStatus };
    setClinics((prev) => prev.map((c) => c.id === clinic.id ? updated : c));
    await saveClinic(updated);
    await addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: newStatus === 'active' ? 'CLINIC_ACTIVATED' : 'CLINIC_DEACTIVATED',
      target: `clinics/${clinic.id}`,
      details: `${newStatus === 'active' ? 'Activated' : 'Deactivated'} healthcare center: ${clinic.name}`,
      timestamp: new Date().toISOString(),
    });
    toast.info(`${clinic.name} ${newStatus}`);
  };

  const confirmDeleteClinic = async (clinic: Clinic) => {
    if (!currentUser) return;
    softDelete('clinic', clinic.id, currentUser.name);
    await addAuditLog({
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role,
      action: 'CLINIC_DELETED',
      target: `clinics/${clinic.id}`,
      details: `Moved to trash: ${clinic.name}`,
      timestamp: new Date().toISOString(),
    });
    toast.success(`${clinic.name} removed`);
  };

  const toggleModality = (mod: string) => {
    setForm((f) => {
      const exists = f.modalities.includes(mod);
      const nextModalities = exists ? f.modalities.filter((m) => m !== mod) : [...f.modalities, mod];
      const nextMachineStatus = { ...f.machineStatus };
      if (!exists && !nextMachineStatus[mod]) {
        nextMachineStatus[mod] = 'Active';
      }
      return {
        ...f,
        modalities: nextModalities,
        machineStatus: nextMachineStatus,
      };
    });
  };

  const toggleMachineStatus = async (clinic: Clinic, mod: string) => {
    const current = clinic.machineStatus?.[mod] || 'Active';
    const next: 'Active' | 'Maintenance' = current === 'Active' ? 'Maintenance' : 'Active';
    const updated: Clinic = {
      ...clinic,
      supportedModalities: [...MODALITIES],
      machineStatus: {
        ...(clinic.machineStatus || {}),
        [mod]: next,
      },
    };
    setClinics((prev) => prev.map((c) => (c.id === clinic.id ? updated : c)));
    await saveClinic(updated);
    toast.info(`${clinic.name}: ${mod} set to ${next}`);
  };

  return (
    <div className="space-y-6">
      {/* Filter, Search & Add Bar */}
      <div className="card p-3.5 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            type="text"
            placeholder="Search healthcare centers, address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-9 text-xs"
          />
        </div>

        {/* Organization Type Filters & Add Button */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedOrgType('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              selectedOrgType === 'all'
                ? 'bg-[#0F4C42] text-white'
                : 'text-surface-600 hover:bg-surface-100'
            }`}
          >
            All ({uniqueClinics.length})
          </button>
          {ORGANIZATION_TYPES.map((org) => {
            const count = uniqueClinics.filter((c) => {
              const cOrg = c.organizationType || (
                c.name.toLowerCase().includes('kpj') || c.name.toLowerCase().includes('sunway')
                  ? 'Private Hospital'
                  : c.name.toLowerCase().includes('hospital')
                  ? 'Public Hospital'
                  : 'Klinik Kesihatan'
              );
              return cOrg === org;
            }).length;

            return (
              <button
                key={org}
                type="button"
                onClick={() => setSelectedOrgType(selectedOrgType === org ? 'all' : org)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  selectedOrgType === org
                    ? org === 'Klinik Kesihatan'
                      ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300'
                      : org === 'Public Hospital'
                      ? 'bg-teal-100 text-teal-900 ring-1 ring-teal-300'
                      : 'bg-rose-100 text-rose-900 ring-1 ring-rose-300'
                    : 'text-surface-600 hover:bg-surface-100'
                }`}
              >
                {org} ({count})
              </button>
            );
          })}
          <button onClick={openCreate} className="btn-primary text-xs flex items-center gap-1.5 ml-1">
            <Plus className="w-4 h-4" /> Add Center
          </button>
        </div>
      </div>

      {/* Grid of Healthcare Centers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.map((clinic) => {
          const resolvedOrgType = clinic.organizationType || (
            clinic.name.toLowerCase().includes('kpj') || clinic.name.toLowerCase().includes('sunway')
              ? 'Private Hospital'
              : clinic.name.toLowerCase().includes('hospital')
              ? 'Public Hospital'
              : 'Klinik Kesihatan'
          );

          return (
            <div key={clinic.id} className="card flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs">
              <div>
                {/* Header: Title & Status */}
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <h3 className="text-sm font-bold text-navy-800 leading-tight">{clinic.name}</h3>
                  <span className={clinic.status === 'active' ? 'badge-success shrink-0 text-[10px]' : 'badge-error shrink-0 text-[10px]'}>
                    {clinic.status}
                  </span>
                </div>

                {/* Details */}
                <div className="space-y-1.5 text-xs text-surface-600">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
                    <span>Type: {resolvedOrgType}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-surface-400 mt-0.5 flex-shrink-0" />
                    <span className="line-clamp-2">{clinic.address}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
                    <span>Tel: {clinic.phone}</span>
                  </div>
                  {clinic.fax && (
                    <div className="flex items-center gap-2">
                      <Printer className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
                      <span>Faks: {clinic.fax}</span>
                    </div>
                  )}
                  {clinic.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-surface-400 flex-shrink-0" />
                      <span className="truncate">{clinic.email}</span>
                    </div>
                  )}
                  <div className="text-[10px] text-surface-400 pt-1 font-mono">
                    Lat: {clinic.latitude?.toFixed ? clinic.latitude.toFixed(4) : clinic.latitude}, Lon: {clinic.longitude?.toFixed ? clinic.longitude.toFixed(4) : clinic.longitude}
                  </div>
                  <div className="pt-2 flex flex-wrap gap-1.5">
                    {MODALITIES.map((mod) => {
                      const mStatus = clinic.machineStatus?.[mod] || 'Active';
                      const isMaint = mStatus === 'Maintenance';
                      return (
                        <button
                          key={mod}
                          type="button"
                          onClick={() => toggleMachineStatus(clinic, mod)}
                          title={`Click to toggle ${mod} between Active and Maintenance`}
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors cursor-pointer ${
                            isMaint
                              ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                              : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          {mod}: {mStatus}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-surface-200">
                <button
                  type="button"
                  onClick={() => openEdit(clinic)}
                  className="p-1.5 text-surface-400 hover:text-navy-600 hover:bg-navy-50 rounded transition-colors"
                  title="Edit Healthcare Center"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => toggleStatus(clinic)}
                  className="p-1.5 text-surface-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                  title={clinic.status === 'active' ? 'Deactivate Center' : 'Activate Center'}
                >
                  {clinic.status === 'active' ? <ShieldOff className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => setDeletingClinic(clinic)}
                  className="p-1.5 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                  title="Delete Center"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-12 text-surface-400 text-sm card">
          No healthcare centers found matching the criteria.
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Edit Healthcare Center' : 'Add Healthcare Center'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Name */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-surface-700 mb-1">Healthcare Center Name *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input-field"
                placeholder="e.g. Hospital Tanjong Karang, Klinik Kesihatan Ijok"
              />
            </div>

            {/* Organization Type */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-surface-700 mb-1">Organization Type *</label>
              <select
                value={form.organizationType}
                onChange={(e) => setForm({ ...form, organizationType: e.target.value as HealthcareOrganizationType })}
                className="select-field"
              >
                {ORGANIZATION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-surface-500 mt-1">
                Specifies whether this facility is a primary clinic (Klinik Kesihatan), government hospital (Public Hospital), or private medical centre (Private Hospital).
              </p>
            </div>

            {/* Address */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-surface-700 mb-1">Address *</label>
              <PredictiveAddressInput
                required
                value={form.address}
                onChange={(addressValue, details) => {
                  setForm((prev) => ({
                    ...prev,
                    address: addressValue,
                    latitude: details?.lat ? String(details.lat) : prev.latitude,
                    longitude: details?.lon ? String(details.lon) : prev.longitude,
                  }));
                  if (details?.lat && details?.lon) {
                    setRawCoordinates(`${details.lat}, ${details.lon}`);
                  }
                }}
              />
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Phone *</label>
              <input
                required
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input-field"
                placeholder="e.g., 03-32791167"
              />
            </div>

            {/* Fax */}
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Fax</label>
              <input
                value={form.fax}
                onChange={(e) => setForm({ ...form, fax: e.target.value })}
                className="input-field"
                placeholder="e.g., 03-32891167 (Optional)"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="input-field"
                placeholder="center@moh.gov.my (Optional)"
              />
            </div>

            {/* Operating Hours */}
            <div>
              <label className="block text-sm font-medium text-surface-700 mb-1">Operating Hours</label>
              <input
                value={form.operatingHours}
                onChange={(e) => setForm({ ...form, operatingHours: e.target.value })}
                className="input-field"
                placeholder="08:00 – 17:00"
              />
            </div>

            {/* GPS Coordinates */}
            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-surface-700">
                  GPS Coordinates
                </label>
                {form.latitude && form.longitude && !isNaN(parseFloat(form.latitude)) && !isNaN(parseFloat(form.longitude)) ? (
                  <a
                    href={`https://www.google.com/maps?q=${form.latitude},${form.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] text-teal-700 hover:text-teal-900 flex items-center gap-0.5 font-semibold hover:underline"
                    title="View pin on Google Maps"
                  >
                    <span>View Map</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        if (navigator?.clipboard?.readText) {
                          const text = await navigator.clipboard.readText();
                          const parsed = parseCoordinatePair(text);
                          if (parsed) {
                            setRawCoordinates(`${parsed.latStr}, ${parsed.lonStr}`);
                            setForm((prev) => ({
                              ...prev,
                              latitude: parsed.latStr,
                              longitude: parsed.lonStr,
                            }));
                            toast.success(`Coordinates pasted: ${parsed.latStr}, ${parsed.lonStr}`);
                          } else {
                            toast.error('Clipboard text is not a valid coordinate pair.');
                          }
                        }
                      } catch {
                        toast.info('Paste coordinates directly into the box.');
                      }
                    }}
                    className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 flex items-center gap-1 hover:underline"
                    title="Paste Google Maps coordinates from clipboard"
                  >
                    <ClipboardPaste className="w-3 h-3 text-teal-600" />
                    Paste Pin
                  </button>
                )}
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={rawCoordinates}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRawCoordinates(val);
                    const parsed = parseCoordinatePair(val);
                    if (parsed) {
                      setForm((prev) => ({
                        ...prev,
                        latitude: parsed.latStr,
                        longitude: parsed.lonStr,
                      }));
                    } else if (val.trim() === '') {
                      setForm((prev) => ({ ...prev, latitude: '', longitude: '' }));
                    }
                  }}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData('text');
                    const parsed = parseCoordinatePair(text);
                    if (parsed) {
                      e.preventDefault();
                      setRawCoordinates(`${parsed.latStr}, ${parsed.lonStr}`);
                      setForm((prev) => ({
                        ...prev,
                        latitude: parsed.latStr,
                        longitude: parsed.lonStr,
                      }));
                      toast.success(`Coordinates saved: ${parsed.latStr}, ${parsed.lonStr}`);
                    }
                  }}
                  className="input-field font-mono text-sm pr-8"
                  placeholder="e.g., 3.425957, 101.178600"
                />
                <MapPin className="w-4 h-4 text-surface-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Modalities & Machine Status */}
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-2">Imaging Modalities & Machine Status</label>
            <div className="flex flex-wrap gap-2">
              {MODALITIES.map((mod) => {
                const selected = form.modalities.includes(mod);
                const mStatus = form.machineStatus[mod] || 'Active';
                return (
                  <div key={mod} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleModality(mod)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        selected
                          ? 'bg-navy-50 border-navy-300 text-navy-700 font-semibold'
                          : 'bg-white border-surface-300 text-surface-600 hover:border-surface-400'
                      }`}
                    >
                      {mod}
                    </button>
                    {selected && (
                      <button
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            machineStatus: {
                              ...f.machineStatus,
                              [mod]: mStatus === 'Active' ? 'Maintenance' : 'Active',
                            },
                          }))
                        }
                        className={`px-2 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                          mStatus === 'Maintenance'
                            ? 'bg-amber-50 border-amber-300 text-amber-800'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        }`}
                      >
                        {mStatus}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            <button type="button" onClick={handleSave} disabled={!form.name || !form.address || !form.phone} className="btn-primary disabled:opacity-50">
              {editing ? 'Save Changes' : 'Create Center'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deletingClinic} onClose={() => setDeletingClinic(null)} title="Delete Healthcare Center">
        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3 text-red-700 text-xs">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800">Confirm Deletion</p>
              <p className="mt-0.5">Are you sure you want to delete <strong>{deletingClinic?.name}</strong>?</p>
            </div>
          </div>
          <p className="text-xs text-surface-600">
            This healthcare center will be removed from the active clinic list.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setDeletingClinic(null)} className="btn-secondary text-xs">Cancel</button>
            <button
              type="button"
              onClick={() => {
                if (deletingClinic) {
                  confirmDeleteClinic(deletingClinic);
                  setDeletingClinic(null);
                }
              }}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-medium transition-colors"
            >
              Delete Center
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
