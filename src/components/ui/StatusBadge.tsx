import React from 'react';
import type { CaseStatus, PatientRequestStatus, ReportStatus } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface Props {
  status: CaseStatus | PatientRequestStatus | ReportStatus | string;
  timestamp?: string;
  showTimeInline?: boolean;
}

function formatTime(isoString?: string): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function StatusBadge({ status, timestamp, showTimeInline = false }: Props) {
  const { language } = useLanguage();
  const isMs = language === 'ms';

  const formatStatusLabel = (st: string): string => {
    const mapEn: Record<string, string> = {
      'CASE_CREATED': 'Scheduled',
      'CREATED': 'Scheduled',
      'Pending': 'Pending',
      'SCHEDULING': 'Scheduled',
      'RADIOGRAPHER_ASSIGNED': 'Scheduled',
      'READY_FOR_SCAN': 'Scheduled',
      'SCHEDULED': 'Scheduled',
      'SCANNING': 'Scanned',
      'IMAGES_AVAILABLE': 'Scanned',
      'SCANNED': 'Scanned',
      'RADIOLOGIST_REVIEW': 'Under Review',
      'MO_REVIEW': 'Under Review',
      'REPORTED': 'Under Review',
      'REPORT_SUBMITTED': 'Completed',
      'COMPLETED': 'Completed',
      'FINALIZED': 'Completed',
      'MACHINE_UNAVAILABLE': 'Maintenance',
      'EXTERNAL_REFERRAL_PENDING': 'Scheduled',
      'BEMZ_REVIEW': 'Under Review',
      'FACILITY_SELECTED': 'Scheduled',
      'EXTERNAL_RADIOGRAPHER_ASSIGNED': 'Scheduled',
      'PRIVATE_HOSPITAL_ADMIN_REVIEW': 'Under Review',
      'EXTERNAL_SCANNING': 'Scanned',
      'EXTERNAL_IMAGES_AVAILABLE': 'Scanned',
      'NO_SHOW': 'No Show',
      'CANCELLED': 'Cancelled',
      'IN_PROGRESS': 'Under Review',
    };
    const mapMs: Record<string, string> = {
      'CASE_CREATED': 'Dijadualkan',
      'CREATED': 'Dijadualkan',
      'Pending': 'Belum Selesai',
      'SCHEDULING': 'Dijadualkan',
      'RADIOGRAPHER_ASSIGNED': 'Dijadualkan',
      'READY_FOR_SCAN': 'Dijadualkan',
      'SCHEDULED': 'Dijadualkan',
      'SCANNING': 'Diimbas',
      'IMAGES_AVAILABLE': 'Diimbas',
      'SCANNED': 'Diimbas',
      'RADIOLOGIST_REVIEW': 'Dalam Semakan',
      'MO_REVIEW': 'Dalam Semakan',
      'REPORTED': 'Dalam Semakan',
      'REPORT_SUBMITTED': 'Selesai',
      'COMPLETED': 'Selesai',
      'FINALIZED': 'Selesai',
      'MACHINE_UNAVAILABLE': 'Penyelenggaraan',
      'EXTERNAL_REFERRAL_PENDING': 'Dijadualkan',
      'BEMZ_REVIEW': 'Dalam Semakan',
      'FACILITY_SELECTED': 'Dijadualkan',
      'EXTERNAL_RADIOGRAPHER_ASSIGNED': 'Dijadualkan',
      'PRIVATE_HOSPITAL_ADMIN_REVIEW': 'Dalam Semakan',
      'EXTERNAL_SCANNING': 'Diimbas',
      'EXTERNAL_IMAGES_AVAILABLE': 'Diimbas',
      'NO_SHOW': 'Tidak Hadir',
      'CANCELLED': 'Dibatalkan',
      'IN_PROGRESS': 'Dalam Semakan',
    };

    if (isMs) return mapMs[st] || st;
    return mapEn[st] || st;
  };

  const getClass = () => {
    switch (status) {
      case 'CASE_CREATED':
      case 'CREATED':
      case 'Pending':
      case 'draft':
        return 'bg-slate-100 text-slate-700 font-medium border border-slate-200';
      case 'SCHEDULING':
      case 'RADIOGRAPHER_ASSIGNED':
      case 'READY_FOR_SCAN':
      case 'SCHEDULED':
      case 'SCANNING':
      case 'EXTERNAL_SCANNING':
      case 'In Progress':
      case 'IN_PROGRESS':
        return 'bg-blue-50 text-blue-700 font-semibold border border-blue-200';
      case 'IMAGES_AVAILABLE':
      case 'SCANNED':
      case 'EXTERNAL_IMAGES_AVAILABLE':
        return 'bg-indigo-50 text-indigo-700 font-semibold border border-indigo-200';
      case 'RADIOLOGIST_REVIEW':
      case 'MO_REVIEW':
      case 'REPORTED':
        return 'bg-purple-50 text-purple-700 font-semibold border border-purple-200';
      case 'MACHINE_UNAVAILABLE':
      case 'EXTERNAL_REFERRAL_PENDING':
        return 'bg-red-50 text-red-700 font-semibold border border-red-200';
      case 'BEMZ_REVIEW':
      case 'FACILITY_SELECTED':
      case 'PRIVATE_HOSPITAL_ADMIN_REVIEW':
        return 'bg-amber-50 text-amber-700 font-semibold border border-amber-200';
      case 'EXTERNAL_RADIOGRAPHER_ASSIGNED':
        return 'bg-teal-50 text-teal-700 font-semibold border border-teal-200';
      case 'REPORT_SUBMITTED':
      case 'COMPLETED':
      case 'FINALIZED':
      case 'Approved':
      case 'final':
      case 'Verified / Signed Off':
        return 'bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200';
      case 'NO_SHOW':
      case 'CANCELLED':
      case 'Rejected':
        return 'bg-slate-100 text-slate-500 font-medium border border-slate-200';
      default:
        return 'bg-slate-100 text-slate-600 font-medium border border-slate-200';
    }
  };

  const formattedTime = formatTime(timestamp);

  return (
    <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs ${getClass()}`}>
      <span>{formatStatusLabel(status)}</span>
      {showTimeInline && formattedTime && (
        <span className="opacity-75 font-mono text-[10px] pl-1.5 ml-1 border-l border-current/20">
          {formattedTime}
        </span>
      )}
    </span>
  );
}
