import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getAudit, startAudit, submitAudit } from '../services/audit';
import { getAuditResponses, saveResponse, getResponseProgress } from '../services/audit';
import { uploadQueue, type QueuedUpload } from '../services/audit';
import { 
  Camera, 
  Upload, 
  CheckCircle, 
  AlertCircle, 
  Loader, 
  ChevronLeft, 
  ChevronRight,
  Save,
  Send,
  X,
  Image as ImageIcon,
  FileText
} from 'lucide-react';

interface AuditExecutionProps {
  // Props can be added here if needed
}

export const AuditExecution: React.FC<AuditExecutionProps> = () => {
  const { auditId } = useParams<{ auditId: string }>();
  const navigate = useNavigate();
  
  const [audit, setAudit] = useState<any>(null);
  const [questions, setQuestions] = useState<any[]>([]);
  const [responses, setResponses] = useState<Map<string, any>>(new Map());
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [progress, setProgress] = useState({ answered: 0, total: 0, percentage: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadQueueState, setUploadQueueState] = useState(uploadQueue.getState());
  const [showUploadPanel, setShowUploadPanel] = useState(false);

  // Load audit data
  useEffect(() => {
    if (auditId) {
      loadAudit();
    }
  }, [auditId]);

  // Subscribe to upload queue
  useEffect(() => {
    const unsubscribe = uploadQueue.subscribe((state) => {
      setUploadQueueState(state);
    });
    return unsubscribe;
  }, []);

  // Auto-save responses
  useEffect(() => {
    const timer = setTimeout(() => {
      if (auditId && responses.size > 0) {
        autoSaveResponses();
      }
    }, 2000); // Auto-save after 2 seconds of inactivity

    return () => clearTimeout(timer);
  }, [responses]);

  const loadAudit = async () => {
    try {
      if (!auditId) return;

      // Load audit details
      const auditData = await getAudit(auditId);
      if (!auditData) return;
      
      setAudit(auditData);

      // Load questions from template
      const { data: templateData } = await supabase
        .from('audit_templates')
        .select(`
          *,
          categories:audit_categories(
            *,
            questions:audit_questions(*)
          )
        `)
        .eq('id', auditData.template_id)
        .single();

      if (templateData) {
        const allQuestions = (templateData as any).categories.flatMap((cat: any) => 
          cat.questions.map((q: any) => ({ ...q, category: cat.name }))
        );
        setQuestions(allQuestions);
      }

      // Load existing responses
      const existingResponses = await getAuditResponses(auditId);
      const responseMap = new Map();
      existingResponses.forEach((r: any) => {
        responseMap.set(r.question_id, r);
      });
      setResponses(responseMap);

      // Get progress
      const progressData = await getResponseProgress(auditId);
      setProgress({
        answered: progressData.answeredQuestions,
        total: progressData.totalQuestions,
        percentage: progressData.progress
      });

      // Start audit if it's in draft status
      if (auditData.status === 'draft') {
        await startAudit(auditId);
      }
    } catch (error) {
      console.error('Error loading audit:', error);
    }
  };

  const autoSaveResponses = async () => {
    if (!auditId) return;
    
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Save all responses to queue
      for (const [questionId, response] of responses.entries()) {
        await saveResponse(
          auditId,
          questionId,
          response.response_value,
          response.score,
          response.comment,
          user.id
        );
      }
    } catch (error) {
      console.error('Error auto-saving responses:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResponseChange = (questionId: string, value: any, score?: number) => {
    setResponses((prev) => {
      const newMap = new Map(prev);
      newMap.set(questionId, {
        ...newMap.get(questionId),
        response_value: value,
        score: score,
      });
      return newMap;
    });
  };

  const handleCommentChange = (questionId: string, comment: string) => {
    setResponses((prev) => {
      const newMap = new Map(prev);
      newMap.set(questionId, {
        ...newMap.get(questionId),
        comment,
      });
      return newMap;
    });
  };

  const handleFileUpload = async (questionId: string, files: FileList | null) => {
    if (!files || !auditId || !audit) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Add files to upload queue
    Array.from(files).forEach((file) => {
      uploadQueue.addUpload(
        file,
        auditId,
        audit.organization_id,
        audit.farm_id,
        questionId
      );
    });

    setShowUploadPanel(true);
  };

  const handleSubmit = async () => {
    if (!auditId) return;

    const confirmed = window.confirm(
      'Are you sure you want to submit this audit? You will not be able to modify responses after submission.'
    );

    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      // Save all responses first
      await autoSaveResponses();

      // Submit audit
      await submitAudit(auditId);

      // Navigate to audit detail
      navigate(`/audits/${auditId}`);
    } catch (error) {
      console.error('Error submitting audit:', error);
      alert('Error submitting audit. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentQuestion = questions[currentQuestionIndex];
  const currentResponse = currentQuestion ? responses.get(currentQuestion.id) : null;
  const uploadStats = uploadQueue.getStats();

  if (!audit || questions.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center text-gray-600 hover:text-gray-900"
            >
              <ChevronLeft className="w-5 h-5" />
              <span className="ml-1">Back</span>
            </button>
            <div className="flex items-center gap-2">
              {isSaving && (
                <div className="flex items-center text-sm text-gray-500">
                  <Loader className="w-4 h-4 animate-spin mr-1" />
                  Saving...
                </div>
              )}
              <button
                onClick={() => setShowUploadPanel(!showUploadPanel)}
                className="relative p-2 text-gray-600 hover:text-gray-900"
              >
                <Upload className="w-5 h-5" />
                {uploadStats.uploading > 0 && (
                  <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                    {uploadStats.uploading}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mb-2">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium text-gray-700">
                {audit.audit_number}
              </span>
              <span className="text-gray-500">
                {progress.answered} / {progress.total} ({progress.percentage}%)
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Upload Panel */}
      {showUploadPanel && (
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-900">Upload Queue</h3>
            <button
              onClick={() => setShowUploadPanel(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {uploadQueueState.uploads.length === 0 ? (
            <p className="text-sm text-gray-500">No uploads in queue</p>
          ) : (
            <div className="space-y-2">
              {uploadQueueState.uploads.map((upload) => (
                <div key={upload.id} className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {upload.file.name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{(upload.file.size / 1024).toFixed(1)} KB</span>
                      {upload.status === 'uploading' && (
                        <span>{upload.progress.percentage}%</span>
                      )}
                    </div>
                    {upload.status === 'uploading' && (
                      <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                        <div
                          className="bg-blue-600 h-1 rounded-full transition-all"
                          style={{ width: `${upload.progress.percentage}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div>
                    {upload.status === 'pending' && (
                      <Loader className="w-4 h-4 animate-spin text-gray-400" />
                    )}
                    {upload.status === 'uploading' && (
                      <Loader className="w-4 h-4 animate-spin text-blue-600" />
                    )}
                    {upload.status === 'success' && (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    )}
                    {upload.status === 'error' && (
                      <button
                        onClick={() => uploadQueue.retryUpload(upload.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <AlertCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}

              {uploadStats.error > 0 && (
                <button
                  onClick={() => uploadQueue.retryAll()}
                  className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  Retry All Failed ({uploadStats.error})
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Question Content */}
      <div className="px-4 py-6">
        {currentQuestion && (
          <div className="bg-white rounded-lg shadow-sm p-4">
            {/* Category Badge */}
            <div className="mb-3">
              <span className="inline-block px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                {currentQuestion.category}
              </span>
              {currentQuestion.mandatory && (
                <span className="inline-block px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded ml-2">
                  Required
                </span>
              )}
            </div>

            {/* Question */}
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {currentQuestion.question}
            </h2>

            {/* Question Description */}
            {currentQuestion.description && (
              <p className="text-sm text-gray-600 mb-4">
                {currentQuestion.description}
              </p>
            )}

            {/* Response Input */}
            <div className="space-y-4">
              {currentQuestion.response_type === 'yes_no' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleResponseChange(currentQuestion.id, 'yes', 100)}
                    className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                      currentResponse?.response_value === 'yes'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => handleResponseChange(currentQuestion.id, 'no', 0)}
                    className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                      currentResponse?.response_value === 'no'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    No
                  </button>
                  <button
                    onClick={() => handleResponseChange(currentQuestion.id, 'na', undefined)}
                    className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                      currentResponse?.response_value === 'na'
                        ? 'bg-gray-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    N/A
                  </button>
                </div>
              )}

              {currentQuestion.response_type === 'pass_fail' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleResponseChange(currentQuestion.id, 'pass', 100)}
                    className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                      currentResponse?.response_value === 'pass'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Pass
                  </button>
                  <button
                    onClick={() => handleResponseChange(currentQuestion.id, 'fail', 0)}
                    className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
                      currentResponse?.response_value === 'fail'
                        ? 'bg-red-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Fail
                  </button>
                </div>
              )}

              {currentQuestion.response_type === 'numeric' && (
                <input
                  type="number"
                  value={currentResponse?.response_value || ''}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    const score = (value / currentQuestion.max_score) * 100;
                    handleResponseChange(currentQuestion.id, value, score);
                  }}
                  placeholder="Enter value"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              )}

              {currentQuestion.response_type === 'percentage' && (
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={currentResponse?.response_value || ''}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value);
                    handleResponseChange(currentQuestion.id, value, value);
                  }}
                  placeholder="Enter percentage (0-100)"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              )}

              {currentQuestion.response_type === 'text' && (
                <textarea
                  value={currentResponse?.response_value || ''}
                  onChange={(e) => handleResponseChange(currentQuestion.id, e.target.value, undefined)}
                  placeholder="Enter your response"
                  rows={4}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              )}

              {/* Comment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Comments (Optional)
                </label>
                <textarea
                  value={currentResponse?.comment || ''}
                  onChange={(e) => handleCommentChange(currentQuestion.id, e.target.value)}
                  placeholder="Add any additional notes or observations"
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>

              {/* Evidence Upload */}
              {currentQuestion.evidence_required && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Evidence <span className="text-red-600">*</span>
                  </label>
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/jpg,image/png,image/webp,application/pdf"
                    onChange={(e) => handleFileUpload(currentQuestion.id, e.target.files)}
                    className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Supported: JPG, PNG, WEBP, PDF (Max 20MB)
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setCurrentQuestionIndex(Math.max(0, currentQuestionIndex - 1))}
            disabled={currentQuestionIndex === 0}
            className="flex items-center px-4 py-2 text-gray-700 bg-gray-100 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200"
          >
            <ChevronLeft className="w-5 h-5 mr-1" />
            Previous
          </button>

          <span className="text-sm text-gray-500">
            {currentQuestionIndex + 1} / {questions.length}
          </span>

          {currentQuestionIndex < questions.length - 1 ? (
            <button
              onClick={() => setCurrentQuestionIndex(Math.min(questions.length - 1, currentQuestionIndex + 1))}
              className="flex items-center px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Next
              <ChevronRight className="w-5 h-5 ml-1" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || progress.percentage < 100}
              className="flex items-center px-4 py-2 text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader className="w-5 h-5 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <Send className="w-5 h-5 mr-2" />
                  Submit Audit
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditExecution;
