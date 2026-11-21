import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { useToast } from '../../components/ux/Toast';
import type { MohYaTidak, SeverityLevel } from '../../types';
import {
  Search,
  User,
  ShieldCheck,
  Activity,
  MapPin,
  Building2,
  Calendar,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
  FilePlus2,
} from 'lucide-react';
import { haversineDistance, geocodeAddress } from '../../services/routingService';
import { resolveUserFacilityContext } from '../../services/dataService';
import { normalizeNric } from '../../utils/malaysianNric';
import ReferralRouteMap from '../../components/ui/ReferralRouteMap';

const SCAN_TYPES = ['X-Ray', 'Ultrasound', 'CT', 'MRI'] as const;
type ScanTypeOption = (typeof SCAN_TYPES)[number];

const PRIORITY_OPTIONS = [
  { label: 'Emergency', severity: 'Critical' as SeverityLevel },
  { label: 'Urgent', severity: 'Severe' as SeverityLevel },
  { label: 'Routine', severity: 'Moderate' as SeverityLevel },
] as const;

export default function NewCaseRegistration() {
  const { currentUser } = useAuth();
  const { clinics, patients, addCase, addAuditLog } = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const patientIdFromUrl = searchParams.get('patientId') || '';

  // 1. Patient selection
  const [patientSearch, setPatientSearch] = useState('');
  const [patientId, setPatientId] = useState(patientIdFromUrl);

  // 2. Safety checklist (PER.SS-RA301)
  const [isPregnant, setIsPregnant] = useState<MohYaTidak>('No');
  const [hasAllergies, setHasAllergies] = useState<MohYaTidak>('No');
  const [hasAsthma, setHasAsthma] = useState<MohYaTidak>('No');
  const [mobilityStatus, setMobilityStatus] = useState<'Ambulatory' | 'Wheelchair' | 'Stretcher / Bedbound'>('Ambulatory');

  // 3. Scan details
  const [scanType, setScanType] = useState<ScanTypeOption>('X-Ray');
  const [bodyPart, setBodyPart] = useState('');
  const [priority, setPriority] = useState<'Emergency' | 'Urgent' | 'Routine'>('Routine');
  const [clinicalNotes, setClinicalNotes] = useState('');

  // 4. Facility picker & appointment date
  const [facilitySearch, setFacilitySearch] = useState('');
  const [selectedFacilityId, setSelectedFacilityId] = useState('');
  const [isManualFacility, setIsManualFacility] = useState(false);
  const [appointmentDate, setAppointmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);
  const [geocodedPatientCoords, setGeocodedPatientCoords] = useState<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    if (patientIdFromUrl) {
      setPatientId(patientIdFromUrl);
    }
  }, [patientIdFromUrl]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === patientId) || null,
    [patients, patientId]
  );

  // Sync patient safety defaults when a patient is selected
  useEffect(() => {
    if (selectedPatient) {
      setHasAsthma(selectedPatient.hasAsthma || 'No');
      setHasAllergies(selectedPatient.previousContrastReaction || 'No');
      if (selectedPatient.gender === 'Male') {
        setIsPregnant('No');
      }
    }
  }, [selectedPatient?.id]);

  // Filter patients by IC or name (only when searching)
  const filteredPatients = useMemo(() => {
    const q = patientSearch.toLowerCase().trim();
    const normQ = normalizeNric(patientSearch);
    if (!q) return [];
    return patients
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.mrn.toLowerCase().includes(q) ||
          p.nric.includes(q) ||
          (normQ.length > 0 && normalizeNric(p.nric).includes(normQ))
      )
      .slice(0, 8);
  }, [patients, patientSearch]);

  // Real road distance & driving time from OSRM (falls back to straight-line if offline)
  const [roadMetrics, setRoadMetrics] = useState<Record<string, { distanceKm: number; durationMin: number }>>({});

  // Deduplicate active clinics by normalized name AND nearby coordinates (within 0.5 km)
  const uniqueActiveClinics = useMemo(() => {
    const seenNames = new Set<string>();
    const keptCoords: { lat: number; lon: number }[] = [];

    return clinics.filter((c) => {
      if (c.status && c.status !== 'active') return false;
      const normalizedWords = (c.name || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(Boolean)
        .sort()
        .join(' ');
      if (!normalizedWords || seenNames.has(normalizedWords)) return false;

      if (c.latitude && c.longitude) {
        const isDuplicateLocation = keptCoords.some(
          (coord) => haversineDistance(coord.lat, coord.lon, c.latitude, c.longitude) < 0.5
        );
        if (isDuplicateLocation) return false;
        keptCoords.push({ lat: c.latitude, lon: c.longitude });
      }

      seenNames.add(normalizedWords);
      return true;
    });
  }, [clinics]);

  // Resolve patient coordinates (use saved lat/lon or geocode patient address once)
  useEffect(() => {
    let active = true;
    if (!selectedPatient) {
      setGeocodedPatientCoords(null);
      return;
    }
    if (selectedPatient.latitude && selectedPatient.longitude) {
      setGeocodedPatientCoords({ lat: selectedPatient.latitude, lon: selectedPatient.longitude });
      return;
    }
    if (selectedPatient.address) {
      geocodeAddress(selectedPatient.address)
        .then((geo) => {
          if (active && geo) {
            setGeocodedPatientCoords({ lat: geo.lat, lon: geo.lon });
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [selectedPatient?.id, selectedPatient?.latitude, selectedPatient?.longitude, selectedPatient?.address]);

  const refLat = geocodedPatientCoords?.lat || selectedPatient?.latitude || 3.14;
  const refLon = geocodedPatientCoords?.lon || selectedPatient?.longitude || 101.68;

  useEffect(() => {
    const clinicsWithCoords = uniqueActiveClinics.filter((c) => c.latitude && c.longitude);
    if (clinicsWithCoords.length === 0) return;

    const controller = new AbortController();
    const coordPairs = [
      `${refLon},${refLat}`,
      ...clinicsWithCoords.map((c) => `${c.longitude},${c.latitude}`),
    ].join(';');

    fetch(
      `https://router.project-osrm.org/table/v1/driving/${coordPairs}?sources=0&annotations=distance,duration`,
      { signal: controller.signal }
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data || data.code !== 'Ok' || !data.distances?.[0] || !data.durations?.[0]) return;
        const next: Record<string, { distanceKm: number; durationMin: number }> = {};
        clinicsWithCoords.forEach((clinic, idx) => {
          const distMeters = data.distances[0][idx + 1];
          const durSeconds = data.durations[0][idx + 1];
          if (typeof distMeters === 'number' && typeof durSeconds === 'number') {
            next[clinic.id] = {
              distanceKm: Math.round((distMeters / 1000) * 10) / 10,
              durationMin: Math.max(1, Math.round(durSeconds / 60)),
            };
          }
        });
        setRoadMetrics(next);
      })
      .catch(() => {
        // Offline or rate-limited: straight-line fallback will be used
      });

    return () => controller.abort();
  }, [uniqueActiveClinics, refLat, refLon]);

  const rankedFacilities = useMemo(() => {
    return uniqueActiveClinics
      .map((clinic) => {
        const supportsScan =
          !clinic.supportedModalities ||
          clinic.supportedModalities.length === 0 ||
          clinic.supportedModalities.includes(scanType);
        const machineState = clinic.machineStatus?.[scanType] || 'Active';
        const isAvailable = supportsScan && machineState !== 'Maintenance';
        const road = roadMetrics[clinic.id];
        const distanceKm = road
          ? road.distanceKm
          : clinic.latitude && clinic.longitude
          ? Math.round(haversineDistance(refLat, refLon, clinic.latitude, clinic.longitude) * 10) / 10
          : null;
        const durationMin = road ? road.durationMin : null;
        return {
          clinic,
          supportsScan,
          machineState,
          isAvailable,
          distanceKm,
          durationMin,
        };
      })
      .sort((a, b) => {
        if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
        if (a.distanceKm !== null && b.distanceKm !== null) return a.distanceKm - b.distanceKm;
        return 0;
      });
  }, [uniqueActiveClinics, roadMetrics, refLat, refLon, scanType]);

  // Auto-select nearest Active facility when scan type or patient changes
  useEffect(() => {
    if (!isManualFacility) {
      const firstAvailable = rankedFacilities.find((f) => f.isAvailable);
      if (firstAvailable) {
        setSelectedFacilityId(firstAvailable.clinic.id);
      } else {
        setSelectedFacilityId('');
      }
    }
  }, [rankedFacilities, isManualFacility]);

  const selectedFacility = useMemo(
    () => rankedFacilities.find((f) => f.clinic.id === selectedFacilityId) || null,
    [rankedFacilities, selectedFacilityId]
  );

  // Patient origin for route display on Google Maps
  const patientOrigin = useMemo(() => {
    if (!selectedPatient) return '';
    if (selectedPatient.latitude && selectedPatient.longitude) {
      return `${selectedPatient.latitude},${selectedPatient.longitude}`;
    }
    return selectedPatient.address?.trim() || '';
  }, [selectedPatient]);

  const facilityDestination = useMemo(() => {
    if (!selectedFacility) return '';
    if (selectedFacility.clinic.latitude && selectedFacility.clinic.longitude) {
      return `${selectedFacility.clinic.latitude},${selectedFacility.clinic.longitude}`;
    }
    return selectedFacility.clinic.address?.trim() || selectedFacility.clinic.name;
  }, [selectedFacility]);

  const mapEmbedUrl = useMemo(() => {
    if (!facilityDestination) return '';
    if (patientOrigin) {
      return `https://maps.google.com/maps?saddr=${encodeURIComponent(patientOrigin)}&daddr=${encodeURIComponent(facilityDestination)}&output=embed`;
    }
    return `https://maps.google.com/maps?q=${encodeURIComponent(facilityDestination)}&z=14&output=embed`;
  }, [patientOrigin, facilityDestination]);

  const externalMapsUrl = useMemo(() => {
    if (!facilityDestination) return '';
    if (patientOrigin) {
      return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(patientOrigin)}&destination=${encodeURIComponent(facilityDestination)}`;
    }
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(facilityDestination)}`;
  }, [patientOrigin, facilityDestination]);

  const isFormValid =
    Boolean(selectedPatient) &&
    Boolean(bodyPart.trim()) &&
    Boolean(clinicalNotes.trim()) &&
    Boolean(selectedFacilityId) &&
    Boolean(selectedFacility?.isAvailable) &&
    Boolean(appointmentDate);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !selectedPatient || !selectedFacility || !isFormValid) return;

    setSubmitting(true);
    const caseNumber = `CASE-${new Date().getFullYear()}-${String(Math.floor(1000 + Math.random() * 9000))}`;
    const mappedSeverity = PRIORITY_OPTIONS.find((p) => p.label === priority)?.severity || 'Moderate';
    const userFacContext = resolveUserFacilityContext(currentUser, clinics);
    const targetClinic = selectedFacility.clinic;

    try {
      await addCase({
        caseNumber,
        patientId: selectedPatient.id,
        patientName: selectedPatient.name,
        registeredById: currentUser.id,
        registeredByName: currentUser.name,
        registeredByRole: currentUser.role,
        initialMoId: currentUser.id,
        initialMoName: currentUser.name,
        originatingCenterId: userFacContext.healthcareCenterId,
        originatingCenterName: userFacContext.healthcareCenterName,
        clinicId: targetClinic.id,
        clinicName: targetClinic.name,
        scanType: `${scanType} (${bodyPart.trim()})`,
        modality: scanType,
        indication: clinicalNotes.trim(),
        bodyRegion: bodyPart.trim(),
        severity: mappedSeverity,
        notes: clinicalNotes.trim(),
        status: 'SCHEDULED',
        createdAt: new Date().toISOString(),
        scheduledAt: `${appointmentDate}T09:00:00`,
        officeTarikhAppointment: appointmentDate,
        isPregnant,
        hasAsthma,
        previousContrastReaction: hasAllergies,
        hasMobileDevice: mobilityStatus === 'Ambulatory' ? 'No' : 'Yes',
        officeNoPemeriksaan: caseNumber,
      });

      await addAuditLog({
        userId: currentUser.id,
        userName: currentUser.name,
        userRole: currentUser.role,
        action: 'CASE_CREATED',
        target: `cases/${caseNumber}`,
        details: `Submitted ${scanType} referral ${caseNumber} for ${selectedPatient.name} at ${targetClinic.name}`,
        timestamp: new Date().toISOString(),
      });

      toast.success(`Referral ${caseNumber} scheduled at ${targetClinic.name}`);
      navigate('/cases');
    } catch {
      toast.error('Failed to submit referral. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Patient, Safety Checklist, Scan Request */}
      <div className="lg:col-span-6 card space-y-6">
        {/* Patient */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-[#0F4C42]" />
            <h2 className="text-sm font-bold text-surface-900">Patient</h2>
          </div>

          {selectedPatient ? (
            <div className="p-3.5 rounded-lg bg-[#EFF6F3] border border-[#BFD8D0] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#0F4C42]">{selectedPatient.name}</p>
                <p className="text-xs text-[#45645E]">
                  IC: {selectedPatient.nric} · {selectedPatient.gender} · {selectedPatient.phone}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPatientId('')}
                className="text-xs font-semibold text-[#0F4C42] hover:underline self-start sm:self-center"
              >
                Change Patient
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search className="w-4 h-4 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  placeholder="Search patient by IC number (e.g. 900101-10-1234) or full name..."
                  className="input-field pl-10"
                />
              </div>

              {patientSearch.trim().length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto">
                  {filteredPatients.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPatientId(p.id);
                        setPatientSearch('');
                      }}
                      className="text-left p-3 rounded-lg border border-surface-200 hover:border-emerald-300 hover:bg-[#F3F8F6] transition-colors"
                    >
                      <p className="text-xs font-semibold text-surface-900 truncate">{p.name}</p>
                      <p className="text-[11px] text-surface-500 font-mono">{p.nric}</p>
                    </button>
                  ))}
                  {filteredPatients.length === 0 && (
                    <div className="col-span-2 py-3 text-center space-y-2">
                      <p className="text-xs text-surface-500">No matching patient found.</p>
                      <Link to="/patients/register" className="btn-secondary text-xs inline-flex">
                        Register New Patient
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Safety Checklist */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[#0F4C42]" />
            <h2 className="text-sm font-bold text-surface-900">Safety Checklist</h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {selectedPatient?.gender !== 'Male' && (
              <div>
                <label className="block text-xs font-semibold text-surface-700 mb-1">Pregnancy</label>
                <select
                  value={isPregnant}
                  onChange={(e) => setIsPregnant(e.target.value as MohYaTidak)}
                  className="select-field text-xs"
                >
                  <option value="No">No</option>
                  <option value="Yes">Yes</option>
                  <option value="Unsure">Unsure</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-surface-700 mb-1">Allergies / Contrast Reaction</label>
              <select
                value={hasAllergies}
                onChange={(e) => setHasAllergies(e.target.value as MohYaTidak)}
                className="select-field text-xs"
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
                <option value="Unsure">Unsure</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-surface-700 mb-1">Asthma</label>
              <select
                value={hasAsthma}
                onChange={(e) => setHasAsthma(e.target.value as MohYaTidak)}
                className="select-field text-xs"
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
                <option value="Unsure">Unsure</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-surface-700 mb-1">Mobility</label>
              <select
                value={mobilityStatus}
                onChange={(e) => setMobilityStatus(e.target.value as any)}
                className="select-field text-xs"
              >
                <option value="Ambulatory">Ambulatory (Walking)</option>
                <option value="Wheelchair">Wheelchair</option>
                <option value="Stretcher / Bedbound">Stretcher / Bedbound</option>
              </select>
            </div>
          </div>
        </div>

        {/* Scan Request & Clinical Notes */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#0F4C42]" />
            <h2 className="text-sm font-bold text-surface-900">Scan Request &amp; Clinical Notes</h2>
          </div>

          <div>
            <label className="block text-xs font-semibold text-surface-700 mb-1.5">Scan Type *</label>
            <div className="grid grid-cols-4 gap-2">
              {SCAN_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setScanType(type);
                    setIsManualFacility(false);
                  }}
                  className={`py-2 px-2 rounded-lg text-xs font-semibold border transition-colors ${
                    scanType === type
                      ? 'bg-[#0F4C42] text-white border-[#0F4C42]'
                      : 'bg-white text-surface-700 border-surface-300 hover:bg-surface-50'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-surface-700 mb-1">Body Part *</label>
              <input
                type="text"
                required
                value={bodyPart}
                onChange={(e) => setBodyPart(e.target.value)}
                placeholder="e.g. Chest PA, Right Knee, Abdomen"
                className="input-field text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-surface-700 mb-1">Priority *</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'Emergency' | 'Urgent' | 'Routine')}
                className="select-field text-xs"
              >
                {PRIORITY_OPTIONS.map((opt) => (
                  <option key={opt.label} value={opt.label}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-surface-700 mb-1">Doctor's Clinical Notes *</label>
            <textarea
              required
              rows={3}
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              placeholder="Enter symptoms, clinical history, and reason for scan..."
              className="w-full rounded-lg border border-surface-300 bg-white px-3.5 py-2.5 text-xs leading-relaxed text-surface-900 placeholder:text-surface-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/15 resize-y"
            />
          </div>
        </div>
      </div>

      {/* Right Column: Facility Picker, Interactive Route Map, Appointment Date & Submit */}
      <div className="lg:col-span-6 card space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#0F4C42]" />
            <h2 className="text-sm font-bold text-surface-900">
              Facility ({scanType})
            </h2>
          </div>
          {externalMapsUrl && (
            <a
              href={externalMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F4C42] hover:underline"
            >
              <span>Open in Google Maps</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>

        {/* Searchable Facility Selector (scales cleanly to many hospitals/clinics) */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-surface-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={facilitySearch}
            onChange={(e) => setFacilitySearch(e.target.value)}
            placeholder="Search hospital or clinic by name or area..."
            className="input-field pl-9 text-xs"
          />
        </div>

        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
          {rankedFacilities
            .filter(({ clinic }) => {
              const q = facilitySearch.toLowerCase().trim();
              if (!q) return true;
              return (
                clinic.name.toLowerCase().includes(q) ||
                (clinic.address || '').toLowerCase().includes(q)
              );
            })
            .map(({ clinic, isAvailable, machineState, supportsScan, distanceKm, durationMin }) => {
              const isSelected = clinic.id === selectedFacilityId;
              return (
                <button
                  key={clinic.id}
                  type="button"
                  disabled={!isAvailable}
                  onClick={() => {
                    setSelectedFacilityId(clinic.id);
                    setIsManualFacility(true);
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    !isAvailable
                      ? 'bg-surface-50 border-surface-200 opacity-60 cursor-not-allowed'
                      : isSelected
                      ? 'bg-[#EFF6F3] border-emerald-300'
                      : 'bg-white border-surface-200 hover:bg-surface-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="w-3.5 h-3.5 text-[#0F4C42] shrink-0" />
                      <span className="text-xs font-semibold text-surface-900 truncate">{clinic.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {distanceKm !== null && (
                        <span className="text-[11px] font-medium text-[#0F4C42]">
                          {distanceKm} km{durationMin ? ` (${durationMin} min)` : ''}
                        </span>
                      )}
                      {isAvailable ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 text-[10px] font-semibold">
                          <CheckCircle2 className="w-3 h-3" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 text-[10px] font-semibold">
                          <AlertTriangle className="w-3 h-3" />
                          {!supportsScan ? `No ${scanType}` : machineState}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[11px] text-surface-500 mt-0.5 truncate pl-5">{clinic.address}</p>
                </button>
              );
            })}
        </div>

        {/* Larger Interactive Google Map with Patient Pin, Facility Pins & Driving Route */}
        <ReferralRouteMap
          patientCoords={geocodedPatientCoords}
          patientLabel={selectedPatient ? `${selectedPatient.name} (${selectedPatient.address || 'Home'})` : 'Patient Location'}
          facilities={rankedFacilities}
          selectedFacilityId={selectedFacilityId}
          onSelectFacility={(id) => {
            setSelectedFacilityId(id);
            setIsManualFacility(true);
          }}
          heightClass="h-[340px]"
        />

        <div>
          <label className="block text-xs font-semibold text-surface-700 mb-1 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-[#0F4C42]" />
            <span>Appointment Date *</span>
          </label>
          <input
            type="date"
            required
            value={appointmentDate}
            onChange={(e) => setAppointmentDate(e.target.value)}
            className="input-field text-xs"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Link to="/cases" className="btn-secondary text-sm">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={!isFormValid || submitting}
            className="btn-primary text-sm inline-flex items-center gap-2 disabled:opacity-50"
          >
            <FilePlus2 className="w-4 h-4" />
            <span>{submitting ? 'Submitting...' : 'Submit Referral'}</span>
          </button>
        </div>
      </div>
    </form>
  );
}
