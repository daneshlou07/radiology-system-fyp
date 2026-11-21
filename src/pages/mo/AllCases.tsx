import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import StatusBadge from '../../components/ui/StatusBadge';
import SeverityBadge from '../../components/ui/SeverityBadge';
import TabFilter from '../../components/ui/TabFilter';
import BulkActionBar from '../../components/ui/BulkActionBar';
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { getCaseIndication } from '../../utils/caseDisplay';
import { exportToCSV } from '../../utils/exportUtils';
import { useToast } from '../../components/ux/Toast';

const STATUS_GROUPS: Record<string, string[] | null> = {
  'All Cases': null,
  Scheduled: ['CREATED', 'CASE_CREATED', 'SCHEDULING', 'RADIOGRAPHER_ASSIGNED', 'READY_FOR_SCAN', 'SCHEDULED'],
  Scanned: ['SCANNING', 'IMAGES_AVAILABLE', 'SCANNED'],
  'Under Review': ['RADIOLOGIST_REVIEW', 'MO_REVIEW', 'REPORTED'],
  Completed: ['REPORT_SUBMITTED', 'COMPLETED', 'FINALIZED'],
};

const TABS = [
  'All Cases',
  'Scheduled',
  'Scanned',
  'Under Review',
  'Completed',
];

function getInitials(name: string): string {
  if (!name) return 'PT';

  const parts = name.trim().split(' ');

  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }

  return (
    parts[0][0] + parts[parts.length - 1][0]
  ).toUpperCase();
}

function getAvatarColor(name: string): string {
  const colors = [
    'bg-surface-100 text-surface-700 border-surface-300',
    'bg-emerald-50 text-emerald-700 border-emerald-200',
    'bg-blue-50 text-blue-700 border-blue-200',
    'bg-teal-50 text-teal-700 border-teal-200',
  ];

  let charSum = 0;

  for (let i = 0; i < name.length; i++) {
    charSum += name.charCodeAt(i);
  }

  return colors[charSum % colors.length];
}

export default function AllCases() {
  const { currentUser } = useAuth();
  const { cases, getScopedCases } = useData();
  const navigate = useNavigate();
  const rawScoped = getScopedCases ? getScopedCases() : cases;
  const scopedCases = currentUser?.id?.startsWith('quick-') ? cases : rawScoped;
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('All Cases');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const filtered = scopedCases.filter((c) => {
    const allowedStatuses = STATUS_GROUPS[activeTab];

    const statusMatch =
      allowedStatuses === null ||
      allowedStatuses.includes(c.status);

    const searchLower = search.toLowerCase().trim();

    const searchMatch =
      !searchLower ||
      c.caseNumber.toLowerCase().includes(searchLower) ||
      c.patientName.toLowerCase().includes(searchLower) ||
      getCaseIndication(c).toLowerCase().includes(searchLower) ||
      (c.bodyRegion || '').toLowerCase().includes(searchLower) ||
      (c.scanType || '').toLowerCase().includes(searchLower);

    return statusMatch && searchMatch;
  });

  const counts: Record<string, number> = {};

  TABS.forEach((tab) => {
    const statuses = STATUS_GROUPS[tab];

    counts[tab] =
      statuses === null
        ? scopedCases.length
        : scopedCases.filter((c) => statuses.includes(c.status)).length;
  });

  const totalItems = filtered.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;

  const paginatedCases = filtered.slice(
    startIndex,
    startIndex + pageSize
  );

  const isAllSelected =
    paginatedCases.length > 0 &&
    paginatedCases.every((c) => selectedIds.includes(c.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds((prev) =>
        prev.filter(
          (id) =>
            !paginatedCases.some((c) => c.id === id)
        )
      );
    } else {
      const pageIds = paginatedCases.map((c) => c.id);

      setSelectedIds((prev) =>
        Array.from(new Set([...prev, ...pageIds]))
      );
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((item) => item !== id)
        : [...prev, id]
    );
  };

  const handleBulkExport = () => {
    const selectedCases = cases.filter((c) =>
      selectedIds.includes(c.id)
    );

    exportToCSV(
      selectedCases,
      `Cases_Export_${new Date()
        .toISOString()
        .slice(0, 10)}.csv`
    );

    toast.success(
      `Exported ${selectedCases.length} cases to CSV`
    );
  };

  return (
    <div className="space-y-6">
      {/* Queue Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <TabFilter
          tabs={TABS}
          active={activeTab}
          onChange={(tab) => {
            setActiveTab(tab);
            setCurrentPage(1);
          }}
          counts={counts}
        />

        <div className="relative w-full lg:w-72">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-500"
            aria-hidden="true"
          />

          <input
            type="text"
            placeholder="Search cases..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            aria-label="Search cases"
            className="input-field pl-10 pr-10"
          />

          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCurrentPage(1);
              }}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 transition-colors hover:text-surface-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Cases Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th scope="col" className="table-header">
                  Case #
                </th>

                <th scope="col" className="table-header">
                  Patient
                </th>

                <th scope="col" className="table-header">
                  Indication
                </th>

                <th scope="col" className="table-header">
                  Modality
                </th>

                <th scope="col" className="table-header">
                  Severity
                </th>

                <th scope="col" className="table-header">
                  Status
                </th>

                <th scope="col" className="table-header">
                  Date
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-surface-200">
              {paginatedCases.map((c) => {
                const indication = getCaseIndication(c);

                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/case/${c.id}`)}
                    className="cursor-pointer transition-colors hover:bg-surface-100/70"
                  >
                    {/* Case Number */}
                    <td className="table-cell-dense whitespace-nowrap">
                      <Link
                        to={`/case/${c.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="font-medium text-navy-600 transition-colors hover:text-navy-700 hover:underline"
                      >
                        {c.caseNumber}
                      </Link>
                    </td>

                    {/* Patient */}
                    <td className="table-cell-dense whitespace-nowrap">
                      <Link
                        to={`/patient/${c.patientId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="block truncate font-medium text-surface-900 transition-colors hover:text-navy-600 hover:underline"
                      >
                        {c.patientName}
                      </Link>
                    </td>

                    {/* Indication */}
                    <td className="table-cell-dense max-w-[200px]">
                      <div
                        className="truncate font-normal text-surface-700"
                        title={indication}
                      >
                        {indication || '—'}
                      </div>
                    </td>

                    {/* Modality */}
                    <td className="table-cell-dense">
                      <span className="text-[12px] font-medium text-surface-700">
                        {c.scanType}
                      </span>
                    </td>

                    {/* Severity */}
                    <td className="table-cell-dense whitespace-nowrap">
                      <SeverityBadge severity={c.severity} />
                    </td>

                    {/* Status */}
                    <td className="table-cell-dense whitespace-nowrap">
                      <StatusBadge
                        status={c.status}
                        timestamp={
                          c.finalizedAt ||
                          c.scannedAt ||
                          c.scheduledAt ||
                          c.createdAt
                        }
                      />
                    </td>

                    {/* Date */}
                    <td className="table-cell-dense whitespace-nowrap">
                      <div className="font-normal text-surface-800">
                        {new Date(
                          c.createdAt
                        ).toLocaleDateString([], {
                          month: 'short',
                          day: '2-digit',
                          year: 'numeric',
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Empty State */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-surface-100">
              <FileText
                className="h-5 w-5 text-surface-500"
                aria-hidden="true"
              />
            </div>

            <p className="text-[14px] font-medium leading-5 text-surface-800">
              No matching referral cases found
            </p>

            <p className="mt-1 text-[12px] font-normal leading-4 text-surface-500">
              Try adjusting your active filter or search keywords.
            </p>

            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setCurrentPage(1);
                }}
                className="mt-3 text-[12px] font-medium text-navy-600 underline hover:text-navy-800"
              >
                Clear Search Filter
              </button>
            )}
          </div>
        )}

        {/* Pagination */}
        {filtered.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-surface-200 bg-surface-50 px-4 py-3 text-[12px] text-surface-600 sm:flex-row sm:items-center sm:justify-between">
            <div>
              Showing{' '}
              <span className="font-medium text-surface-800">
                {startIndex + 1}
              </span>{' '}
              to{' '}
              <span className="font-medium text-surface-800">
                {Math.min(
                  startIndex + pageSize,
                  totalItems
                )}
              </span>{' '}
              of{' '}
              <span className="font-medium text-surface-800">
                {totalItems}
              </span>{' '}
              cases
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-surface-500">
                  Rows per page:
                </span>

                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="h-8 rounded-lg border border-surface-300 bg-white px-2 text-[12px] text-surface-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/15"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={currentPage === 1}
                  onClick={() =>
                    setCurrentPage((page) =>
                      Math.max(page - 1, 1)
                    )
                  }
                  aria-label="Previous page"
                  className="pagination-button"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                <span className="min-w-[48px] text-center font-medium text-surface-700">
                  {currentPage} / {totalPages}
                </span>

                <button
                  type="button"
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setCurrentPage((page) =>
                      Math.min(page + 1, totalPages)
                    )
                  }
                  aria-label="Next page"
                  className="pagination-button"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bulk Actions */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        onClear={() => setSelectedIds([])}
        onBulkExport={handleBulkExport}
      />
    </div>
  );
}