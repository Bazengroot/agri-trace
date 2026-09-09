/**
 * Audit Template Service
 * Handles CRUD operations for audit templates, categories, and questions
 */

import { supabase } from '../../lib/supabase';
import type {
  AuditTemplate,
  AuditCategory,
  AuditQuestion,
  InsertAuditTemplate,
  UpdateAuditTemplate,
  InsertAuditCategory,
  InsertAuditQuestion,
} from '../../types/database';

// Define missing update types
export type UpdateAuditCategory = Partial<Omit<AuditCategory, 'id' | 'template_id' | 'created_at'>>;
export type UpdateAuditQuestion = Partial<Omit<AuditQuestion, 'id' | 'category_id' | 'created_at'>>;

export interface TemplateFilters {
  organization_id?: string;
  audit_type?: string;
  status?: 'draft' | 'active' | 'archived' | 'deprecated';
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface TemplateListResponse {
  data: AuditTemplate[];
  total: number;
  page: number;
  pageSize: number;
}

// ═══════════════════════════════════════════════════════════════════════
// TEMPLATE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * List audit templates with filtering, search, and pagination
 */
export async function listTemplates(
  filters: TemplateFilters = {}
): Promise<TemplateListResponse> {
  const { organization_id, audit_type, status, search, page = 1, pageSize = 20 } = filters;

  let query = supabase
    .from('audit_templates')
    .select(`
      *,
      creator:profiles!created_by(id, full_name),
      category_count:audit_categories(count)
    `, { count: 'exact' });

  // Apply filters
  if (organization_id) {
    query = query.eq('organization_id', organization_id);
  }
  if (audit_type) {
    query = query.eq('audit_type', audit_type);
  }
  if (status) {
    query = query.eq('status', status);
  }
  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
  }

  // Apply pagination
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to).order('name');

  const { data, error, count } = await query;

  if (error) {
    throw new Error(`Failed to list templates: ${error.message}`);
  }

  return {
    data: data || [],
    total: count || 0,
    page,
    pageSize,
  };
}

/**
 * Get template by ID with full hierarchy
 */
export async function getTemplate(id: string): Promise<AuditTemplate | null> {
  const { data, error } = await supabase
    .from('audit_templates')
    .select(`
      *,
      creator:profiles!created_by(id, full_name),
      categories:audit_categories(
        *,
        questions:audit_questions(*)
      )
    `)
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed to get template: ${error.message}`);
  }

  return data as any;
}

/**
 * Create new audit template
 */
export async function createTemplate(
  template: InsertAuditTemplate
): Promise<AuditTemplate> {
  // Check for duplicate name+version within organization
  const { data: existing } = await supabase
    .from('audit_templates')
    .select('id')
    .eq('organization_id', template.organization_id)
    .eq('name', template.name)
    .eq('version', template.version)
    .single();

  if (existing) {
    throw new Error(
      `Template "${template.name}" version ${template.version} already exists`
    );
  }

  const { data, error } = await (supabase.from('audit_templates') as any)
    .insert(template)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create template: ${error.message}`);
  }

  return data as AuditTemplate;
}

/**
 * Update audit template
 */
export async function updateTemplate(
  id: string,
  updates: UpdateAuditTemplate
): Promise<AuditTemplate> {
  const { data, error } = await (supabase.from('audit_templates') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update template: ${error.message}`);
  }

  return data as AuditTemplate;
}

/**
 * Archive template (soft delete)
 */
export async function archiveTemplate(id: string): Promise<void> {
  // Check if template has associated audits
  const { count } = await supabase
    .from('audits')
    .select('*', { count: 'exact', head: true })
    .eq('template_id', id);

  if (count && count > 0) {
    throw new Error(
      `Cannot archive template with ${count} associated audit(s). Template is in use.`
    );
  }

  const { error } = await (supabase.from('audit_templates') as any)
    .update({ status: 'archived' })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to archive template: ${error.message}`);
  }
}

/**
 * Activate template
 */
export async function activateTemplate(id: string): Promise<void> {
  const { error } = await (supabase.from('audit_templates') as any)
    .update({ status: 'active' })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to activate template: ${error.message}`);
  }
}

/**
 * Duplicate template with all categories and questions
 */
export async function duplicateTemplate(
  id: string,
  newName: string,
  newVersion: string
): Promise<AuditTemplate> {
  // Get original template with hierarchy
  const original = await getTemplate(id);
  if (!original) {
    throw new Error('Template not found');
  }

  // Create new template
  const newTemplate = await createTemplate({
    organization_id: original.organization_id,
    name: newName,
    description: original.description,
    audit_type: original.audit_type,
    version: newVersion,
    status: 'draft',
    created_by: original.created_by,
  });

  // Duplicate categories and questions
  const originalWithHierarchy = original as any;
  if (originalWithHierarchy.categories) {
    for (const category of originalWithHierarchy.categories) {
      const newCategory = await createCategory({
        template_id: newTemplate.id,
        name: category.name,
        description: category.description,
        sequence: category.sequence,
        weight: category.weight,
      });

      if (category.questions) {
        for (const question of category.questions) {
          await createQuestion({
            category_id: newCategory.id,
            question: question.question,
            description: question.description,
            response_type: question.response_type,
            scoring_type: question.scoring_type,
            max_score: question.max_score,
            weight: question.weight,
            mandatory: question.mandatory,
            evidence_required: question.evidence_required,
            sequence: question.sequence,
            active: question.active,
          });
        }
      }
    }
  }

  return newTemplate;
}

// ═══════════════════════════════════════════════════════════════════════
// CATEGORY OPERATIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * List categories for a template
 */
export async function listCategories(templateId: string): Promise<AuditCategory[]> {
  const { data, error } = await supabase
    .from('audit_categories')
    .select('*')
    .eq('template_id', templateId)
    .order('sequence');

  if (error) {
    throw new Error(`Failed to list categories: ${error.message}`);
  }

  return data || [];
}

/**
 * Create new category
 */
export async function createCategory(
  category: InsertAuditCategory
): Promise<AuditCategory> {
  const { data, error } = await (supabase.from('audit_categories') as any)
    .insert(category)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create category: ${error.message}`);
  }

  return data as AuditCategory;
}

/**
 * Update category
 */
export async function updateCategory(
  id: string,
  updates: UpdateAuditCategory
): Promise<AuditCategory> {
  const { data, error } = await (supabase.from('audit_categories') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update category: ${error.message}`);
  }

  return data as AuditCategory;
}

/**
 * Delete category (only if no questions)
 */
export async function deleteCategory(id: string): Promise<void> {
  // Check if category has questions
  const { count } = await supabase
    .from('audit_questions')
    .select('*', { count: 'exact', head: true })
    .eq('category_id', id);

  if (count && count > 0) {
    throw new Error(
      `Cannot delete category with ${count} question(s). Delete questions first.`
    );
  }

  const { error } = await supabase
    .from('audit_categories')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete category: ${error.message}`);
  }
}

/**
 * Reorder categories
 */
export async function reorderCategories(
  categoryOrders: Array<{ id: string; sequence: number }>
): Promise<void> {
  const updates = categoryOrders.map(({ id, sequence }) =>
    (supabase.from('audit_categories') as any).update({ sequence }).eq('id', id)
  );

  const results = await Promise.all(updates);
  const errors = results.filter((r) => r.error);

  if (errors.length > 0) {
    throw new Error(`Failed to reorder categories: ${errors[0].error?.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// QUESTION OPERATIONS
// ═══════════════════════════════════════════════════════════════════════

/**
 * List questions for a category
 */
export async function listQuestions(categoryId: string): Promise<AuditQuestion[]> {
  const { data, error } = await supabase
    .from('audit_questions')
    .select('*')
    .eq('category_id', categoryId)
    .order('sequence');

  if (error) {
    throw new Error(`Failed to list questions: ${error.message}`);
  }

  return data || [];
}

/**
 * Create new question
 */
export async function createQuestion(
  question: InsertAuditQuestion
): Promise<AuditQuestion> {
  const { data, error } = await (supabase.from('audit_questions') as any)
    .insert(question)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to create question: ${error.message}`);
  }

  return data as AuditQuestion;
}

/**
 * Update question
 */
export async function updateQuestion(
  id: string,
  updates: UpdateAuditQuestion
): Promise<AuditQuestion> {
  const { data, error } = await (supabase.from('audit_questions') as any)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update question: ${error.message}`);
  }

  return data as AuditQuestion;
}

/**
 * Delete question (only if not used in audit responses)
 */
export async function deleteQuestion(id: string): Promise<void> {
  // Check if question has been used in audit responses
  const { count } = await supabase
    .from('audit_responses')
    .select('*', { count: 'exact', head: true })
    .eq('question_id', id);

  if (count && count > 0) {
    throw new Error(
      `Cannot delete question that has been used in ${count} audit response(s). Deactivate instead.`
    );
  }

  const { error } = await supabase
    .from('audit_questions')
    .delete()
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to delete question: ${error.message}`);
  }
}

/**
 * Deactivate question (soft delete)
 */
export async function deactivateQuestion(id: string): Promise<void> {
  const { error } = await (supabase.from('audit_questions') as any)
    .update({ active: false })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to deactivate question: ${error.message}`);
  }
}

/**
 * Activate question
 */
export async function activateQuestion(id: string): Promise<void> {
  const { error } = await (supabase.from('audit_questions') as any)
    .update({ active: true })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to activate question: ${error.message}`);
  }
}

/**
 * Reorder questions
 */
export async function reorderQuestions(
  questionOrders: Array<{ id: string; sequence: number }>
): Promise<void> {
  const updates = questionOrders.map(({ id, sequence }) =>
    (supabase.from('audit_questions') as any).update({ sequence }).eq('id', id)
  );

  const results = await Promise.all(updates);
  const errors = results.filter((r) => r.error);

  if (errors.length > 0) {
    throw new Error(`Failed to reorder questions: ${errors[0].error?.message}`);
  }
}

/**
 * Bulk create questions
 */
export async function bulkCreateQuestions(
  questions: InsertAuditQuestion[]
): Promise<AuditQuestion[]> {
  const { data, error } = await (supabase.from('audit_questions') as any)
    .insert(questions)
    .select();

  if (error) {
    throw new Error(`Failed to bulk create questions: ${error.message}`);
  }

  return data as AuditQuestion[];
}

/**
 * Get template statistics
 */
export async function getTemplateStats(templateId: string): Promise<{
  categories: number;
  questions: number;
  activeQuestions: number;
  mandatoryQuestions: number;
  audits: number;
}> {
  const [categoriesResult, questionsResult, auditsResult] = await Promise.all([
    supabase
      .from('audit_categories')
      .select('*', { count: 'exact', head: true })
      .eq('template_id', templateId),
    (supabase.from('audit_questions') as any)
      .select('active, mandatory')
      .in(
        'category_id',
        (
          await (supabase.from('audit_categories') as any)
            .select('id')
            .eq('template_id', templateId)
        ).data?.map((c: any) => c.id) || []
      ),
    supabase
      .from('audits')
      .select('*', { count: 'exact', head: true })
      .eq('template_id', templateId),
  ]);

  const questions = (questionsResult.data || []) as Array<{
    active: boolean;
    mandatory: boolean;
  }>;

  return {
    categories: categoriesResult.count || 0,
    questions: questions.length,
    activeQuestions: questions.filter((q) => q.active).length,
    mandatoryQuestions: questions.filter((q) => q.mandatory).length,
    audits: auditsResult.count || 0,
  };
}
