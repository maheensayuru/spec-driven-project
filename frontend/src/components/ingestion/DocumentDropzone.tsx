'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  UploadCloud,
  FileText,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  X,
  Lock,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import type { SupportedDocumentMimeType, DocumentStatusResponse } from '@renewalradar/shared';
import {
  requestUploadUrl,
  uploadFileWithProgress,
  finalizeDocument,
  getDocumentStatus,
  ApiError,
} from '../../lib/api';

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MiB (26,214,400 bytes)

const ALLOWED_MIME_TYPES: Record<string, SupportedDocumentMimeType> = {
  'application/pdf': 'application/pdf',
  'image/png': 'image/png',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/tiff': 'image/tiff',
  'image/tif': 'image/tiff',
};

function resolveMimeType(file: File): SupportedDocumentMimeType | null {
  if (file.type && ALLOWED_MIME_TYPES[file.type.toLowerCase()]) {
    return ALLOWED_MIME_TYPES[file.type.toLowerCase()];
  }
  const ext = file.name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'tif':
    case 'tiff':
      return 'image/tiff';
    default:
      return null;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export type FailureCategory =
  'oversize' | 'type' | 'network' | 'server' | 'scanner' | 'ocr' | 'unknown';

export interface DocumentDropzoneProps {
  onSuccess: (result: { documentId: string; stagingId: string }) => void;
  onDocumentCreated?: (documentId: string) => void;
  readOnly?: boolean;
  initialDocumentId?: string | null;
}

type DropzoneState =
  | { stage: 'idle' }
  | { stage: 'requesting_url'; file: File; mimeType: SupportedDocumentMimeType }
  | {
      stage: 'uploading';
      file: File;
      mimeType: SupportedDocumentMimeType;
      documentId: string;
      progress: number;
      loadedBytes: number;
      totalBytes: number;
    }
  | { stage: 'finalizing'; file: File; documentId: string }
  | {
      stage: 'processing';
      documentId: string;
      filename?: string;
      statusText: string;
      file?: File;
    }
  | {
      stage: 'error';
      category: FailureCategory;
      title: string;
      message: string;
      file?: File;
      documentId?: string;
    };

export function DocumentDropzone({
  onSuccess,
  onDocumentCreated,
  readOnly = false,
  initialDocumentId,
}: DocumentDropzoneProps) {
  const [state, setState] = useState<DropzoneState>({ stage: 'idle' });
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const pollingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isCancelledRef = useRef(false);

  const cleanup = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const pollDocumentStatus = useCallback(
    async (documentId: string, retainedFile?: File) => {
      if (isCancelledRef.current) return;

      try {
        const doc: DocumentStatusResponse = await getDocumentStatus(documentId);
        if (isCancelledRef.current) return;

        if (doc.processingStatus === 'pending_review' && doc.stagingId) {
          setState({ stage: 'idle' });
          onSuccess({ documentId: doc.documentId, stagingId: doc.stagingId });
          return;
        }

        if (doc.processingStatus === 'blocked' || doc.securityStatus === 'blocked') {
          setState({
            stage: 'error',
            category: 'scanner',
            title: 'Security Scan Failed',
            message:
              doc.failureReason ||
              'This document was flagged by security scanning and cannot be processed.',
            file: retainedFile,
            documentId,
          });
          return;
        }

        if (doc.processingStatus === 'extraction_failed') {
          setState({
            stage: 'error',
            category: 'ocr',
            title: 'Text Extraction Failed',
            message:
              doc.failureReason ||
              'Unable to extract obligation clauses or renewal dates from this document. Please ensure the document is clear and legible.',
            file: retainedFile,
            documentId,
          });
          return;
        }

        if (doc.processingStatus === 'rejected') {
          setState({
            stage: 'error',
            category: 'server',
            title: 'Document Rejected',
            message: doc.failureReason || 'Document processing was rejected.',
            file: retainedFile,
            documentId,
          });
          return;
        }

        let statusText = 'Processing document…';
        if (doc.processingStatus === 'scan_pending' || doc.securityStatus === 'scan_pending') {
          statusText = 'Scanning file for security threats…';
        } else if (doc.processingStatus === 'clean' || doc.processingStatus === 'processing') {
          statusText = 'Extracting contract details, dates, and amounts via AI…';
        }

        setState({
          stage: 'processing',
          documentId,
          filename: doc.originalFilename || retainedFile?.name,
          statusText,
          file: retainedFile,
        });

        pollingTimeoutRef.current = setTimeout(() => {
          void pollDocumentStatus(documentId, retainedFile);
        }, 1500);
      } catch (err: unknown) {
        if (isCancelledRef.current) return;
        const msg = err instanceof Error ? err.message : 'Failed to query document status.';
        setState({
          stage: 'error',
          category: err instanceof ApiError && err.status >= 500 ? 'server' : 'network',
          title: 'Status Polling Failed',
          message: msg,
          file: retainedFile,
          documentId,
        });
      }
    },
    [onSuccess],
  );

  useEffect(() => {
    if (initialDocumentId && state.stage === 'idle') {
      isCancelledRef.current = false;
      setState({
        stage: 'processing',
        documentId: initialDocumentId,
        statusText: 'Resuming document processing status…',
      });
      void pollDocumentStatus(initialDocumentId);
    }
  }, [initialDocumentId, pollDocumentStatus, state.stage]);

  const startUploadPipeline = async (file: File) => {
    cleanup();
    isCancelledRef.current = false;

    // Client-side file size validation
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setState({
        stage: 'error',
        category: 'oversize',
        title: 'File Exceeds Size Limit',
        message: `The selected file is ${formatBytes(file.size)}, which exceeds the maximum allowed limit of 25 MiB. Please upload a smaller document.`,
        file,
      });
      return;
    }

    // Client-side MIME type validation
    const mimeType = resolveMimeType(file);
    if (!mimeType) {
      const ext = file.name.split('.').pop() || 'unknown';
      setState({
        stage: 'error',
        category: 'type',
        title: 'Unsupported File Type',
        message: `File type ".${ext}" (${file.type || 'unknown MIME'}) is not supported. Please upload a PDF, PNG, JPG, or TIFF document.`,
        file,
      });
      return;
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Step 1: Request presigned upload URL
      setState({ stage: 'requesting_url', file, mimeType });
      const presign = await requestUploadUrl(
        {
          filename: file.name,
          fileSizeBytes: file.size,
          mimeType,
        },
        abortController.signal,
      );

      if (isCancelledRef.current) return;
      onDocumentCreated?.(presign.documentId);

      // Step 2: PUT file directly to presigned URL with real XHR progress
      setState({
        stage: 'uploading',
        file,
        mimeType,
        documentId: presign.documentId,
        progress: 0,
        loadedBytes: 0,
        totalBytes: file.size,
      });

      await uploadFileWithProgress(presign.uploadUrl, file, {
        mimeType,
        signal: abortController.signal,
        onProgress: (percent, loaded, total) => {
          if (!isCancelledRef.current) {
            setState({
              stage: 'uploading',
              file,
              mimeType,
              documentId: presign.documentId,
              progress: percent,
              loadedBytes: loaded,
              totalBytes: total,
            });
          }
        },
      });

      if (isCancelledRef.current) return;

      // Step 3: Finalize document upload
      setState({ stage: 'finalizing', file, documentId: presign.documentId });
      await finalizeDocument(presign.documentId, abortController.signal);

      if (isCancelledRef.current) return;

      // Step 4: Poll status until pending_review
      setState({
        stage: 'processing',
        documentId: presign.documentId,
        filename: file.name,
        statusText: 'Document uploaded. Enqueued for security scan…',
        file,
      });

      void pollDocumentStatus(presign.documentId, file);
    } catch (err: unknown) {
      if (isCancelledRef.current) return;

      if (err instanceof Error && err.message === 'Upload cancelled') {
        setState({ stage: 'idle' });
        return;
      }

      let category: FailureCategory = 'unknown';
      let title = 'Upload Error';
      const msg =
        err instanceof Error ? err.message : 'An unexpected error occurred during upload.';

      if (err instanceof ApiError) {
        if (err.status === 400 && msg.toLowerCase().includes('size')) {
          category = 'oversize';
          title = 'File Exceeds Limit';
        } else if (err.status === 400 && msg.toLowerCase().includes('mime')) {
          category = 'type';
          title = 'Unsupported Format';
        } else if (err.status >= 500) {
          category = 'server';
          title = 'Server Processing Error';
        } else {
          category = 'server';
          title = 'Request Rejected';
        }
      } else if (
        msg.toLowerCase().includes('network') ||
        msg.toLowerCase().includes('failed to fetch')
      ) {
        category = 'network';
        title = 'Network Connection Error';
      }

      setState({
        stage: 'error',
        category,
        title,
        message: msg,
        file,
      });
    }
  };

  const handleCancel = () => {
    isCancelledRef.current = true;
    cleanup();
    setState({ stage: 'idle' });
  };

  const handleRetry = () => {
    if (state.stage === 'error') {
      if (state.file) {
        void startUploadPipeline(state.file);
      } else if (state.documentId) {
        isCancelledRef.current = false;
        void pollDocumentStatus(state.documentId);
      } else {
        setState({ stage: 'idle' });
      }
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (readOnly) return;
    if (state.stage !== 'idle' && state.stage !== 'error') return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        void startUploadPipeline(droppedFile);
      }
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile) {
        void startUploadPipeline(selectedFile);
      }
      e.target.value = '';
    }
  };

  // Viewer read-only state presentation
  if (readOnly) {
    return (
      <div
        className="surface border-dashed border-slate-300 p-8 text-center"
        role="region"
        aria-label="Document upload restricted"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500">
          <Lock size={22} aria-hidden="true" />
        </div>
        <h3 className="mt-3 text-base font-semibold text-slate-800">Upload Restricted (Viewer)</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 leading-relaxed">
          Your account has viewer permissions. Viewers can inspect extracted documents and confirmed
          obligations, but cannot upload new contract files or trigger extractions.
        </p>
      </div>
    );
  }

  // Active upload / processing state
  if (
    state.stage === 'requesting_url' ||
    state.stage === 'uploading' ||
    state.stage === 'finalizing' ||
    state.stage === 'processing'
  ) {
    const isUploading = state.stage === 'uploading';
    const percent = isUploading ? state.progress : 100;
    const filename = state.stage === 'processing' ? state.filename || 'Document' : state.file.name;

    let headline = 'Preparing document upload…';
    if (state.stage === 'uploading') headline = `Uploading ${filename}…`;
    else if (state.stage === 'finalizing') headline = 'Verifying upload integrity…';
    else if (state.stage === 'processing') headline = state.statusText;

    return (
      <div
        className="surface p-6 sm:p-8"
        role="status"
        aria-live="polite"
        aria-label="Document upload and processing in progress"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#e7f0f2] text-[#173e48]">
              <FileText size={20} aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900 truncate max-w-[280px] sm:max-w-md">
                {filename}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{headline}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            className="btn btn-secondary !min-h-[32px] !py-1 !px-3 text-xs"
            aria-label="Cancel processing"
          >
            <X size={14} aria-hidden="true" />
            Cancel
          </button>
        </div>

        {/* Progress bar */}
        <div className="mt-5">
          <div className="flex justify-between text-xs font-medium text-slate-600 mb-1.5">
            <span>
              {isUploading
                ? `${formatBytes(state.loadedBytes)} of ${formatBytes(state.totalBytes)}`
                : state.stage === 'processing'
                  ? 'Security scan & OCR extraction'
                  : 'Finalizing storage'}
            </span>
            <span>{isUploading ? `${percent}%` : ''}</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full transition-all duration-200 ${
                state.stage === 'processing' ? 'bg-[#173e48] animate-pulse w-full' : 'bg-[#173e48]'
              }`}
              style={{ width: state.stage === 'processing' ? '100%' : `${percent}%` }}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <RefreshCw size={13} className="animate-spin text-slate-400" aria-hidden="true" />
          <span>Please keep this window open while we process your document.</span>
        </div>
      </div>
    );
  }

  // Error state
  if (state.stage === 'error') {
    const isScanner = state.category === 'scanner';
    const isOcr = state.category === 'ocr';

    return (
      <div
        className="surface border-red-200 bg-[#fffbfb] p-6 sm:p-8"
        role="alert"
        aria-label={state.title}
      >
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700">
            {isScanner ? (
              <ShieldAlert size={22} aria-hidden="true" />
            ) : isOcr ? (
              <AlertTriangle size={22} aria-hidden="true" />
            ) : (
              <AlertCircle size={22} aria-hidden="true" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-900">{state.title}</h3>
            <p className="mt-1 text-sm text-red-700 leading-relaxed">{state.message}</p>

            {state.file && (
              <p className="mt-2 text-xs text-slate-500">
                File: <span className="font-medium text-slate-700">{state.file.name}</span> (
                {formatBytes(state.file.size)})
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleRetry}
                className="btn btn-primary !min-h-[36px] text-xs"
              >
                <RefreshCw size={13} aria-hidden="true" />
                Retry upload
              </button>
              <button
                type="button"
                onClick={() => setState({ stage: 'idle' })}
                className="btn btn-secondary !min-h-[36px] text-xs"
              >
                Choose different file
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Idle state with drag/drop and picker
  return (
    <div role="region" aria-label="Document upload area" className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        id="document-upload-input"
        className="sr-only"
        accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,application/pdf,image/png,image/jpeg,image/tiff"
        onChange={onFileChange}
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragOver(false);
        }}
        onDrop={onDrop}
        className={`group relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center transition-all cursor-pointer ${
          isDragOver
            ? 'border-[#173e48] bg-[#f0f5f6] ring-4 ring-[#173e48]/10'
            : 'border-slate-300 bg-white hover:border-[#173e48] hover:bg-slate-50/70'
        }`}
      >
        <div
          className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
            isDragOver
              ? 'bg-[#173e48] text-white'
              : 'bg-[#e7f0f2] text-[#173e48] group-hover:bg-[#173e48] group-hover:text-white'
          }`}
        >
          <UploadCloud size={24} aria-hidden="true" />
        </div>

        <h3 className="mt-3.5 text-base font-semibold text-slate-900">
          Upload renewal contract or document
        </h3>
        <p className="mt-1 text-sm text-slate-500">
          Drag and drop your file here, or{' '}
          <span className="font-semibold text-[#173e48] underline decoration-slate-300 underline-offset-2">
            browse from your computer
          </span>
        </p>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">PDF</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">PNG</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">JPG</span>
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">TIFF</span>
          <span>•</span>
          <span>Max 25 MiB</span>
        </div>
      </div>
    </div>
  );
}
