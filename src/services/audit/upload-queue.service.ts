/**
 * Upload Queue Service
 * Manages batch uploads with progress tracking and retry logic
 */

import { uploadEvidence, type UploadProgress, type UploadResult } from './evidence.service';

export interface QueuedUpload {
  id: string;
  file: File;
  auditId: string;
  organizationId: string;
  farmId: string;
  questionId?: string;
  findingId?: string;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: UploadProgress;
  result?: UploadResult;
  retryCount: number;
  maxRetries: number;
}

export interface UploadQueueState {
  uploads: QueuedUpload[];
  isProcessing: boolean;
}

type UploadQueueListener = (state: UploadQueueState) => void;

class UploadQueue {
  private uploads: Map<string, QueuedUpload> = new Map();
  private isProcessing = false;
  private listeners: Set<UploadQueueListener> = new Set();

  /**
   * Add file to upload queue
   */
  addUpload(
    file: File,
    auditId: string,
    organizationId: string,
    farmId: string,
    questionId?: string,
    findingId?: string
  ): string {
    const id = `upload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const upload: QueuedUpload = {
      id,
      file,
      auditId,
      organizationId,
      farmId,
      questionId,
      findingId,
      status: 'pending',
      progress: { loaded: 0, total: file.size, percentage: 0 },
      retryCount: 0,
      maxRetries: 3,
    };

    this.uploads.set(id, upload);
    this.notifyListeners();
    this.processQueue();

    return id;
  }

  /**
   * Remove upload from queue
   */
  removeUpload(id: string): void {
    this.uploads.delete(id);
    this.notifyListeners();
  }

  /**
   * Retry failed upload
   */
  retryUpload(id: string): void {
    const upload = this.uploads.get(id);
    if (upload && upload.status === 'error') {
      upload.status = 'pending';
      upload.progress = { loaded: 0, total: upload.file.size, percentage: 0 };
      upload.retryCount = 0;
      upload.result = undefined;
      this.notifyListeners();
      this.processQueue();
    }
  }

  /**
   * Retry all failed uploads
   */
  retryAll(): void {
    let hasRetries = false;
    this.uploads.forEach((upload) => {
      if (upload.status === 'error') {
        upload.status = 'pending';
        upload.progress = { loaded: 0, total: upload.file.size, percentage: 0 };
        upload.retryCount = 0;
        upload.result = undefined;
        hasRetries = true;
      }
    });

    if (hasRetries) {
      this.notifyListeners();
      this.processQueue();
    }
  }

  /**
   * Clear completed uploads
   */
  clearCompleted(): void {
    this.uploads.forEach((upload, id) => {
      if (upload.status === 'success') {
        this.uploads.delete(id);
      }
    });
    this.notifyListeners();
  }

  /**
   * Clear all uploads
   */
  clearAll(): void {
    this.uploads.clear();
    this.notifyListeners();
  }

  /**
   * Get current queue state
   */
  getState(): UploadQueueState {
    return {
      uploads: Array.from(this.uploads.values()),
      isProcessing: this.isProcessing,
    };
  }

  /**
   * Subscribe to queue state changes
   */
  subscribe(listener: UploadQueueListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    const state = this.getState();
    this.listeners.forEach((listener) => listener(state));
  }

  /**
   * Process upload queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;

    while (true) {
      const pendingUpload = Array.from(this.uploads.values()).find(
        (u) => u.status === 'pending'
      );

      if (!pendingUpload) break;

      await this.processUpload(pendingUpload);
    }

    this.isProcessing = false;
    this.notifyListeners();
  }

  /**
   * Process single upload
   */
  private async processUpload(upload: QueuedUpload): Promise<void> {
    upload.status = 'uploading';
    this.notifyListeners();

    try {
      const result = await uploadEvidence(
        upload.file,
        upload.auditId,
        upload.organizationId,
        upload.farmId,
        upload.questionId,
        upload.findingId,
        (progress) => {
          upload.progress = progress;
          this.notifyListeners();
        }
      );

      if (result.success) {
        upload.status = 'success';
        upload.result = result;
        upload.progress = {
          loaded: upload.file.size,
          total: upload.file.size,
          percentage: 100,
        };
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      upload.retryCount++;

      if (upload.retryCount < upload.maxRetries) {
        // Retry after delay
        upload.status = 'pending';
        await new Promise((resolve) => setTimeout(resolve, 1000 * upload.retryCount));
        return this.processUpload(upload);
      } else {
        // Max retries reached
        upload.status = 'error';
        upload.result = {
          success: false,
          error: error instanceof Error ? error.message : 'Upload failed',
        };
      }
    }

    this.notifyListeners();
  }

  /**
   * Get upload statistics
   */
  getStats(): {
    total: number;
    pending: number;
    uploading: number;
    success: number;
    error: number;
    totalSize: number;
    uploadedSize: number;
  } {
    const uploads = Array.from(this.uploads.values());

    return {
      total: uploads.length,
      pending: uploads.filter((u) => u.status === 'pending').length,
      uploading: uploads.filter((u) => u.status === 'uploading').length,
      success: uploads.filter((u) => u.status === 'success').length,
      error: uploads.filter((u) => u.status === 'error').length,
      totalSize: uploads.reduce((sum, u) => sum + u.file.size, 0),
      uploadedSize: uploads.reduce((sum, u) => sum + u.progress.loaded, 0),
    };
  }
}

// Singleton instance
export const uploadQueue = new UploadQueue();
