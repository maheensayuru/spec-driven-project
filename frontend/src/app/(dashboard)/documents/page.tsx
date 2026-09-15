'use client';

import React, { Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '../../../components/SessionProvider';
import { DocumentDropzone } from '../../../components/ingestion/DocumentDropzone';
import { ExtractionReviewer } from '../../../components/verification/ExtractionReviewer';
import { getStagedExtraction, ApiError } from '../../../lib/api';
import type { ExtractionStagingDetail } from '@renewalradar/shared';
import { RefreshCw, FileText, ArrowLeft } from 'lucide-react';

function LoadingPage() {
  return (
    <div className="empty-state" role="status">
      <div className="mx-auto mb-4 h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#173e48]" />
      Loading document workspace…
    </div>
  );
}

export default function DocumentsPage() {
  return (
    <Suspense fallback={<LoadingPage />}>
      <DocumentsContent />
    </Suspense>
  );
}

function DocumentsContent() {
  const { session } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const urlDocumentId = searchParams.get('documentId');
  const urlStagingId = searchParams.get('stagingId');

  const [activeDocumentId, setActiveDocumentId] = useState<string | null>(urlDocumentId);
  const [activeStagingId, setActiveStagingId] = useState<string | null>(urlStagingId);
  const [stagingData, setStagingData] = useState<ExtractionStagingDetail | null>(null);
  const [isLoadingStaging, setIsLoadingStaging] = useState<boolean>(Boolean(urlStagingId));
  const [stagingError, setStagingError] = useState<string | null>(null);

  const isViewer = session?.role === 'viewer';

  // Sync state when URL searchParams change
  useEffect(() => {
    setActiveDocumentId(urlDocumentId);
    setActiveStagingId(urlStagingId);
  }, [urlDocumentId, urlStagingId]);

  // Load staging details whenever activeStagingId is set
  const loadStaging = useCallback(async (stagingId: string) => {
    setIsLoadingStaging(true);
    setStagingError(null);

    try {
      const data = await getStagedExtraction(stagingId);
      setStagingData(data);
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError && err.status === 404
          ? 'The requested document staging record was not found or has expired.'
          : err instanceof Error
            ? err.message
            : 'Failed to load extraction review details.';
      setStagingError(msg);
    } finally {
      setIsLoadingStaging(false);
    }
  }, []);

  useEffect(() => {
    if (activeStagingId) {
      void loadStaging(activeStagingId);
    } else {
      setStagingData(null);
      setIsLoadingStaging(false);
      setStagingError(null);
    }
  }, [activeStagingId, loadStaging]);

  const updateUrlParams = useCallback(
    (params: { documentId?: string | null; stagingId?: string | null }) => {
      const current = new URLSearchParams(searchParams.toString());
      if (params.documentId) current.set('documentId', params.documentId);
      else if (params.documentId === null) current.delete('documentId');

      if (params.stagingId) current.set('stagingId', params.stagingId);
      else if (params.stagingId === null) current.delete('stagingId');

      const qs = current.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  const handleDocumentCreated = (docId: string) => {
    setActiveDocumentId(docId);
    updateUrlParams({ documentId: docId });
  };

  const handleUploadSuccess = (result: { documentId: string; stagingId: string }) => {
    setActiveDocumentId(result.documentId);
    setActiveStagingId(result.stagingId);
    updateUrlParams({ documentId: result.documentId, stagingId: result.stagingId });
  };

  const handleReset = () => {
    setActiveDocumentId(null);
    setActiveStagingId(null);
    setStagingData(null);
    setStagingError(null);
    router.replace(pathname);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="page-header">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="page-title">Document Ingestion</h1>
            {stagingData && (
              <button
                type="button"
                onClick={handleReset}
                className="btn btn-secondary !min-h-[32px] !py-1 !px-2.5 text-xs text-slate-600"
              >
                <ArrowLeft size={13} aria-hidden="true" />
                Upload another
              </button>
            )}
          </div>
          <p className="page-description">
            Upload vendor contracts, service agreements, and subscription orders to automatically
            extract obligations, renewal deadlines, and financial commitments.
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      {isLoadingStaging ? (
        <div className="surface empty-state" role="status">
          <RefreshCw
            size={24}
            className="mx-auto mb-3 animate-spin text-[#173e48]"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-slate-700">
            Loading document extraction for review…
          </p>
        </div>
      ) : stagingError ? (
        <div className="surface border-red-200 bg-[#fffbfb] p-6 text-center" role="alert">
          <FileText size={32} className="mx-auto text-red-500 mb-2" aria-hidden="true" />
          <h3 className="text-base font-semibold text-red-900">Unable to Load Extraction</h3>
          <p className="mt-1 text-sm text-red-700 max-w-md mx-auto">{stagingError}</p>
          <div className="mt-4 flex justify-center gap-3">
            {activeStagingId && (
              <button
                type="button"
                onClick={() => void loadStaging(activeStagingId)}
                className="btn btn-primary !min-h-[36px] text-xs"
              >
                <RefreshCw size={13} aria-hidden="true" />
                Retry
              </button>
            )}
            <button
              type="button"
              onClick={handleReset}
              className="btn btn-secondary !min-h-[36px] text-xs"
            >
              Back to upload
            </button>
          </div>
        </div>
      ) : stagingData ? (
        <ExtractionReviewer staging={stagingData} readOnly={isViewer} onReset={handleReset} />
      ) : (
        <div className="max-w-3xl">
          <DocumentDropzone
            onSuccess={handleUploadSuccess}
            onDocumentCreated={handleDocumentCreated}
            readOnly={isViewer}
            initialDocumentId={activeDocumentId}
          />
        </div>
      )}
    </div>
  );
}
