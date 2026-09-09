/**
 * Audit Response Service
 * Handles checklist execution, response saving, and auto-save functionality
 */

import { supabase } from '../../lib/supabase';
import type { AuditResponse, InsertAuditResponse, UpdateAuditResponse } from '../../types/database';

export interface AuditResponseFilters {
  audit_id?: string;
  question_id?: string;
  answered_by?: string;
}

/**
 * List audit responses with filtering
 */
export async function listAuditResponses(
  filters: AuditResponseFilters = {}
): Promise<AuditResponse[]> {
  const { audit_id, question_id, answered_by } = filters;

  let query = supabase
    .from('audit_responses')
    .select(`
      *,
      question:audit_questions(id, question, category_id),
      answered_by_user:profiles!answered_by(id, full_name, email)
    `);

  if (audit_id) {
    query = query.eq('audit_id', audit_id);
  }
  if (question_id) {
    query = query.eq('question_id', question_id);
  }
  if (answered_by) {
    query = query.eq('answered_by', answered_by);
  }

  query = query.order('answered_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list audit responses: ${error.message}`);
  }

  return (data || []) as any;
}

/**
 * Get responses for a specific audit
 */
export async function getAuditResponses(auditId: string): Promise<AuditResponse[]> {
  const { data, error } = await supabase
    .from('audit_responses')
    .select(`
      *,
      question:audit_questions(id, question, category_id, response_type, scoring_type, max_score, weight)
    `)
    .eq('audit_id', auditId)
    .order('answered_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get audit responses: ${error.message}`);
  }

  return (data || []) as any;
}

/**
 * Save or update a single response (upsert)
 */
export async function saveResponse(
  auditId: string,
  questionId: string,
  response: any,
  score: number | null,
  comment: string | null,
  answeredBy: string
): Promise<AuditResponse> {
  // Check if response already exists
  const { data: existingData } = await (supabase.from('audit_responses') as any)
    .select('id')
    .eq('audit_id', auditId)
    .eq('question_id', questionId)
    .single();

  const existing = existingData as { id: string } | null;

  if (existing) {
    // Update existing response
    const { data, error } = await (supabase.from('audit_responses') as any)
      .update({
        response,
        score,
        comment,
        answered_by: answeredBy,
        answered_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update response: ${error.message}`);
    }

    return data as AuditResponse;
  } else {
    // Insert new response
    const insertData: InsertAuditResponse = {
      audit_id: auditId,
      question_id: questionId,
      response,
      score,
      comment,
      answered_by: answeredBy,
    };

    const { data, error } = await (supabase.from('audit_responses') as any)
      .insert(insertData)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save response: ${error.message}`);
    }

    return data as AuditResponse;
  }
}

/**
 * Bulk save responses (for auto-save)
 */
export async function bulkSaveResponses(
  responses: Array<{
    audit_id: string;
    question_id: string;
    response: any;
    score: number | null;
    comment: string | null;
    answered_by: string;
  }>
): Promise<void> {
  if (responses.length === 0) return;

  // Use upsert for each response
  const operations = responses.map(async (r) => {
    await saveResponse(
      r.audit_id,
      r.question_id,
      r.response,
      r.score,
      r.comment,
      r.answered_by
    );
  });

  await Promise.all(operations);
}

/**
 * Delete a response
 */
export async function deleteResponse(id: string): Promise<void> {
  const { error } = await supabase
    .from('audit_responses')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete response: ${error.message}`);
  }
}

/**
 * Get response progress for an audit
 */
export async function getResponseProgress(auditId: string): Promise<{
  totalQuestions: number;
  answeredQuestions: number;
  progress: number;
}> {
  // Get total questions from template
  const { data: auditData, error: auditError } = await (supabase.from('audits') as any)
    .select('template_id')
    .eq('id', auditId)
    .single();

  if (auditError || !auditData) {
    throw new Error('Audit not found');
  }

  const audit = auditData as { template_id: string };

  // Count total questions
  const { data: categoriesData } = await (supabase.from('audit_categories') as any)
    .select('id')
    .eq('template_id', audit.template_id);

  const categoryIds = (categoriesData || []).map((c: any) => c.id);

  const { count: totalQuestions, error: countError } = await supabase
    .from('audit_questions')
    .select('*', { count: 'exact', head: true })
    .in('category_id', categoryIds);

  if (countError) {
    throw new Error(`Failed to count questions: ${countError.message}`);
  }

  // Count answered questions
  const { count: answeredQuestions, error: answeredError } = await supabase
    .from('audit_responses')
    .select('*', { count: 'exact', head: true })
    .eq('audit_id', auditId);

  if (answeredError) {
    throw new Error(`Failed to count responses: ${answeredError.message}`);
  }

  const total = totalQuestions || 0;
  const answered = answeredQuestions || 0;
  const progress = total > 0 ? (answered / total) * 100 : 0;

  return {
    totalQuestions: total,
    answeredQuestions: answered,
    progress: Math.round(progress * 100) / 100,
  };
}

/**
 * Get unanswered questions for an audit
 */
export async function getUnansweredQuestions(auditId: string): Promise<any[]> {
  // Get all questions for the audit's template
  const { data: auditData } = await (supabase.from('audits') as any)
    .select('template_id')
    .eq('id', auditId)
    .single();

  if (!auditData) {
    throw new Error('Audit not found');
  }

  const audit = auditData as { template_id: string };

  // Get all question IDs for the template
  const { data: categoryIds } = await (supabase.from('audit_categories') as any)
    .select('id')
    .eq('template_id', audit.template_id);

  const categoryIdsList = (categoryIds || []).map((c: any) => c.id);

  const { data: allQuestions } = await (supabase.from('audit_questions') as any)
    .select('id, question, category_id, mandatory, evidence_required')
    .in('category_id', categoryIdsList);

  // Get answered question IDs
  const { data: responses } = await (supabase.from('audit_responses') as any)
    .select('question_id')
    .eq('audit_id', auditId);

  const answeredIds = new Set((responses || []).map((r: any) => r.question_id));

  // Filter unanswered questions
  const unanswered = (allQuestions || []).filter((q: any) => !answeredIds.has(q.id));

  return unanswered;
}

/**
 * Validate audit completion
 */
export async function validateAuditCompletion(auditId: string): Promise<{
  valid: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // Check for unanswered mandatory questions
  const unanswered = await getUnansweredQuestions(auditId);
  const mandatoryUnanswered = unanswered.filter((q) => q.mandatory);

  if (mandatoryUnanswered.length > 0) {
    errors.push(
      `${mandatoryUnanswered.length} mandatory question(s) remain unanswered`
    );
  }

  // Check for missing evidence on questions that require it
  const { data: responses } = await (supabase.from('audit_responses') as any)
    .select('question_id')
    .eq('audit_id', auditId);

  const answeredQuestionIds = (responses || []).map((r: any) => r.question_id);

  if (answeredQuestionIds.length > 0) {
    const { data: questionsWithEvidence } = await (supabase.from('audit_questions') as any)
      .select('id, question')
      .in('id', answeredQuestionIds)
      .eq('evidence_required', true);

    // Check if evidence exists for these questions
    for (const q of (questionsWithEvidence || []) as Array<{ id: string; question: string }>) {
      const { count } = await supabase
        .from('evidence')
        .select('*', { count: 'exact', head: true })
        .eq('audit_id', auditId)
        .eq('question_id', q.id);

      if (!count || count === 0) {
        errors.push(`Question "${q.question}" requires evidence but none was provided`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
