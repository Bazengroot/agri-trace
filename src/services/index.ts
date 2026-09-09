/**
 * Service Layer - Supabase Implementation
 *
 * All services use Supabase for data access.
 * No localStorage usage for business-critical data.
 */

// Authentication
export * from './auth.service';

// Master Data
export * from './master-data';

// Audit Management
export {
  // Audit service
  listAudits,
  getAudit,
  generateAuditNumber,
  createAudit,
  updateAudit,
  scheduleAudit,
  assignAuditor,
  startAudit,
  submitAudit,
  startReview,
  approveAudit,
  closeAudit,
  cancelAudit,
  calculateAuditScore,
  getAuditsByFarm,
  getAuditsByAuditor,
  getAuditStats,
  // Audit response service
  listAuditResponses,
  getAuditResponses,
  saveResponse,
  bulkSaveResponses,
  deleteResponse,
  getResponseProgress,
  getUnansweredQuestions,
  validateAuditCompletion,
  // Scoring service
  calculateRiskLevel,
  calculateQuestionScore,
  calculateCategoryScore,
  calculateAuditScoreWithWeights,
  getScoringConfig,
  saveScoringConfig,
  // Evidence service
  validateFile,
  optimizeImage,
  generateStoragePath,
  uploadEvidence,
  listEvidence,
  getEvidence,
  getEvidenceUrl,
  deleteEvidence,
  canModifyEvidence,
  getEvidenceStats,
  // Upload queue
  uploadQueue,
} from './audit';

// Findings & Corrective Actions
export * from './finding';

// Notifications
export * from './notifications';

// Audit Trail
export * from './audit-trail';

// Approval Workflow
export {
  submitForReview,
  reviewAudit,
  reviseAudit,
  closeAudit as closeAuditWorkflow,
  canModifyAudit,
  canModifyResponses,
  canModifyEvidence as canModifyEvidenceWorkflow,
  getApprovalHistory,
} from './approval';

// Dashboard
export * from './dashboard';

// Reporting
export * from './reporting';
