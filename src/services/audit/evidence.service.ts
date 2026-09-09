/**
 * Evidence Service
 * Handles file uploads, storage management, and evidence lifecycle
 */

import { supabase } from '../../lib/supabase';
import type { Evidence, InsertEvidence } from '../../types/database';

export interface EvidenceFilters {
  audit_id?: string;
  finding_id?: string;
  question_id?: string;
  uploaded_by?: string;
  file_type?: string;
}

export interface UploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResult {
  success: boolean;
  evidence?: Evidence;
  error?: string;
}

// Allowed file types and their MIME types
export const ALLOWED_FILE_TYPES = {
  image: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'],
  document: ['application/pdf'],
} as const;

export const ALLOWED_EXTENSIONS = {
  image: ['.jpg', '.jpeg', '.png', '.webp'],
  document: ['.pdf'],
} as const;

// File size limits (in bytes)
export const FILE_SIZE_LIMITS = {
  image: 10 * 1024 * 1024, // 10 MB
  document: 20 * 1024 * 1024, // 20 MB
} as const;

/**
 * Validate file before upload
 */
export function validateFile(
  file: File
): { valid: boolean; error?: string; category?: 'image' | 'document' } {
  // Check file size
  const maxImageSize = FILE_SIZE_LIMITS.image;
  const maxDocSize = FILE_SIZE_LIMITS.document;

  if (file.size > maxDocSize) {
    return {
      valid: false,
      error: `File size exceeds maximum limit of ${maxDocSize / 1024 / 1024} MB`,
    };
  }

  // Check MIME type
  const mimeType = file.type;
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();

  // Check if image
  if (ALLOWED_FILE_TYPES.image.includes(mimeType as any)) {
    if (file.size > maxImageSize) {
      return {
        valid: false,
        error: `Image size exceeds maximum limit of ${maxImageSize / 1024 / 1024} MB`,
      };
    }
    if (!ALLOWED_EXTENSIONS.image.includes(extension as any)) {
      return {
        valid: false,
        error: `Invalid image extension. Allowed: ${ALLOWED_EXTENSIONS.image.join(', ')}`,
      };
    }
    return { valid: true, category: 'image' };
  }

  // Check if document
  if (ALLOWED_FILE_TYPES.document.includes(mimeType as any)) {
    if (!ALLOWED_EXTENSIONS.document.includes(extension as any)) {
      return {
        valid: false,
        error: `Invalid document extension. Allowed: ${ALLOWED_EXTENSIONS.document.join(', ')}`,
      };
    }
    return { valid: true, category: 'document' };
  }

  return {
    valid: false,
    error: `Unsupported file type. Allowed: images (JPG, PNG, WEBP) and documents (PDF)`,
  };
}

/**
 * Generate storage path for evidence
 */
export function generateStoragePath(
  organizationId: string,
  farmId: string,
  auditId: string,
  fileName: string
): string {
  const timestamp = Date.now();
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
  return `${organizationId}/${farmId}/${auditId}/evidence/${timestamp}_${sanitizedFileName}`;
}

/**
 * Optimize image before upload (client-side)
 */
export async function optimizeImage(
  file: File,
  maxWidth: number = 1920,
  quality: number = 0.85
): Promise<File> {
  // Only optimize if file is large enough to benefit
  if (file.size < 500 * 1024) {
    return file; // Skip optimization for small files
  }

  return new Promise((resolve) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      // Calculate new dimensions
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;

      // Draw image
      ctx?.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const optimizedFile = new File([blob], file.name, {
              type: file.type,
              lastModified: Date.now(),
            });
            resolve(optimizedFile);
          } else {
            resolve(file); // Fallback to original
          }
        },
        file.type,
        quality
      );
    };

    img.onerror = () => {
      resolve(file); // Fallback to original on error
    };

    img.src = URL.createObjectURL(file);
  });
}

/**
 * Upload evidence file to Supabase Storage
 */
export async function uploadEvidence(
  file: File,
  auditId: string,
  organizationId: string,
  farmId: string,
  questionId?: string,
  findingId?: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  try {
    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: 'Not authenticated' };
    }

    // Optimize image if applicable
    let fileToUpload = file;
    if (validation.category === 'image') {
      fileToUpload = await optimizeImage(file);
    }

    // Generate storage path
    const storagePath = generateStoragePath(
      organizationId,
      farmId,
      auditId,
      file.name
    );

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from('audit-evidence')
      .upload(storagePath, fileToUpload, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });

    if (uploadError) {
      return { success: false, error: `Upload failed: ${uploadError.message}` };
    }

    // Create evidence record in database
    const evidenceData: InsertEvidence = {
      audit_id: auditId,
      response_id: questionId || null,
      finding_id: findingId || null,
      file_name: file.name,
      file_path: storagePath,
      file_type: validation.category === 'image' ? 'photo' : 'pdf',
      file_size: file.size,
      uploaded_by: user.id,
    };

    const { data: evidence, error: dbError } = await (
      supabase.from('evidence') as any
    )
      .insert(evidenceData)
      .select()
      .single();

    if (dbError) {
      // Try to delete the uploaded file if DB insert fails
      await supabase.storage.from('audit-evidence').remove([storagePath]);
      return { success: false, error: `Database error: ${dbError.message}` };
    }

    return { success: true, evidence: evidence as Evidence };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    };
  }
}

/**
 * List evidence for an audit
 */
export async function listEvidence(
  filters: EvidenceFilters = {}
): Promise<Evidence[]> {
  const { audit_id, finding_id, question_id, uploaded_by, file_type } = filters;

  let query = supabase
    .from('evidence')
    .select(`
      *,
      uploader:profiles!uploaded_by(id, full_name, email)
    `);

  if (audit_id) {
    query = query.eq('audit_id', audit_id);
  }
  if (finding_id) {
    query = query.eq('finding_id', finding_id);
  }
  if (question_id) {
    query = query.eq('question_id', question_id);
  }
  if (uploaded_by) {
    query = query.eq('uploaded_by', uploaded_by);
  }
  if (file_type) {
    query = query.eq('file_type', file_type);
  }

  query = query.order('uploaded_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list evidence: ${error.message}`);
  }

  return (data || []) as any;
}

/**
 * Get evidence by ID
 */
export async function getEvidence(id: string): Promise<Evidence & { audit?: any; uploader?: any } | null> {
  const { data, error } = await supabase
    .from('evidence')
    .select(`
      *,
      uploader:profiles!uploaded_by(id, full_name, email),
      audit:audits(id, audit_number, status, organization_id, farm_id)
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get evidence: ${error.message}`);
  }

  return data as any;
}

/**
 * Get public URL for evidence file
 */
export async function getEvidenceUrl(filePath: string): Promise<string | null> {
  const { data } = supabase.storage.from('audit-evidence').getPublicUrl(filePath);

  return data?.publicUrl || null;
}

/**
 * Delete evidence (only before audit submission)
 */
export async function deleteEvidence(id: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Get evidence details
    const evidence = await getEvidence(id);
    if (!evidence) {
      return { success: false, error: 'Evidence not found' };
    }

    // Check if audit is finalized
    if (evidence.audit) {
      const finalizedStatuses = ['submitted', 'under_review', 'approved', 'closed'];
      if (finalizedStatuses.includes(evidence.audit.status)) {
        return {
          success: false,
          error: 'Cannot delete evidence from finalized audit',
        };
      }
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('audit-evidence')
      .remove([evidence.file_path]);

    if (storageError) {
      console.warn('Failed to delete file from storage:', storageError.message);
    }

    // Delete from database
    const { error: dbError } = await supabase.from('evidence').delete().eq('id', id);

    if (dbError) {
      return { success: false, error: `Database error: ${dbError.message}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Delete failed',
    };
  }
}

/**
 * Check if evidence can be modified
 */
export async function canModifyEvidence(evidenceId: string): Promise<{
  canModify: boolean;
  reason?: string;
}> {
  const evidence = await getEvidence(evidenceId);
  if (!evidence) {
    return { canModify: false, reason: 'Evidence not found' };
  }

  // Check audit status
  if (evidence.audit) {
    const finalizedStatuses = ['submitted', 'under_review', 'approved', 'closed'];
    if (finalizedStatuses.includes(evidence.audit.status)) {
      return {
        canModify: false,
        reason: 'Audit has been finalized and evidence is immutable',
      };
    }
  }

  // Check if current user uploaded it
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user && evidence.uploaded_by !== user.id) {
    // Check if user is admin
    const {  profile } = await (supabase.from('profiles') as any)
      .select('role')
      .eq('id', user.id)
      .single();

    if (!profile || !['super_admin', 'audit_admin'].includes(profile.role)) {
      return {
        canModify: false,
        reason: 'You can only modify evidence you uploaded',
      };
    }
  }

  return { canModify: true };
}

/**
 * Get evidence statistics for an audit
 */
export async function getEvidenceStats(auditId: string): Promise<{
  total: number;
  byType: Record<string, number>;
  totalSize: number;
}> {
  const { data, error } = await (supabase.from('evidence') as any)
    .select('file_type, file_size')
    .eq('audit_id', auditId);

  if (error) {
    throw new Error(`Failed to get evidence stats: ${error.message}`);
  }

  const evidence = (data || []) as Array<{ file_type: string; file_size: number }>;

  const byType: Record<string, number> = {};
  let totalSize = 0;

  evidence.forEach((e) => {
    byType[e.file_type] = (byType[e.file_type] || 0) + 1;
    totalSize += e.file_size;
  });

  return {
    total: evidence.length,
    byType,
    totalSize,
  };
}
