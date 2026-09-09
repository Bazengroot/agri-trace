/**
 * Scoring Engine Service
 * Implements configurable scoring with weighted categories and risk level calculation
 */

import { supabase } from '../../lib/supabase';

export interface ScoringConfig {
  // Score values for different response types
  passValue: number;
  partialValue: number;
  failValue: number;
  naExcluded: boolean; // Whether N/A responses are excluded from calculation

  // Risk level thresholds
  excellentMin: number;
  goodMin: number;
  needsImprovementMin: number;
  // Below needsImprovementMin = Critical
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  passValue: 100,
  partialValue: 50,
  failValue: 0,
  naExcluded: true,
  excellentMin: 95,
  goodMin: 85,
  needsImprovementMin: 70,
};

export type RiskLevel = 'excellent' | 'good' | 'needs_improvement' | 'critical';

/**
 * Calculate risk level based on score
 */
export function calculateRiskLevel(
  score: number,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): RiskLevel {
  if (score >= config.excellentMin) return 'excellent';
  if (score >= config.goodMin) return 'good';
  if (score >= config.needsImprovementMin) return 'needs_improvement';
  return 'critical';
}

/**
 * Calculate score for a single question response
 */
export function calculateQuestionScore(
  responseType: string,
  responseValue: any,
  maxScore: number,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): number | null {
  // Handle N/A responses
  if (responseValue === 'na' || responseValue === null || responseValue === undefined) {
    return config.naExcluded ? null : 0;
  }

  // Handle different response types
  switch (responseType) {
    case 'yes_no':
    case 'pass_fail':
      // Pass = maxScore, Fail = 0
      return responseValue === 'yes' || responseValue === 'pass' ? maxScore : 0;

    case 'numeric':
    case 'percentage':
      // Numeric value as percentage of maxScore
      const numericValue = parseFloat(responseValue);
      if (isNaN(numericValue)) return 0;
      return (numericValue / 100) * maxScore;

    case 'rating':
      // Rating scale (e.g., 1-5)
      const rating = parseInt(responseValue);
      if (isNaN(rating)) return 0;
      return (rating / 5) * maxScore;

    case 'multiple_choice':
      // Multiple choice with partial credit
      if (typeof responseValue === 'object' && responseValue.partial) {
        return config.partialValue / 100 * maxScore;
      }
      return responseValue === 'pass' ? maxScore : 0;

    case 'text':
      // Text responses don't have automatic scoring
      return null;

    default:
      return null;
  }
}

/**
 * Calculate category score with weighting
 */
export async function calculateCategoryScore(
  auditId: string,
  categoryId: string,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): Promise<{
  score: number | null;
  maxScore: number;
  earnedScore: number;
  questionCount: number;
  answeredCount: number;
}> {
  // Get all questions in the category
  const { data: questions } = await (supabase.from('audit_questions') as any)
    .select('id, response_type, max_score, weight')
    .eq('category_id', categoryId);

  if (!questions || questions.length === 0) {
    return {
      score: null,
      maxScore: 0,
      earnedScore: 0,
      questionCount: 0,
      answeredCount: 0,
    };
  }

  // Get responses for these questions
  const questionIds = questions.map((q: any) => q.id);
  const { data: responses } = await (supabase.from('audit_responses') as any)
    .select('question_id, response, score')
    .eq('audit_id', auditId)
    .in('question_id', questionIds);

  const responseMap = new Map<string, { response: any; score: number | null }>(
    (responses || []).map((r: any) => [r.question_id, { response: r.response, score: r.score }])
  );

  let totalMaxScore = 0;
  let totalEarnedScore = 0;
  let answeredCount = 0;

  for (const question of questions) {
    const response = responseMap.get(question.id);
    const maxScore = question.max_score * question.weight;
    totalMaxScore += maxScore;

    if (response) {
      answeredCount++;
      const score = response.score ?? calculateQuestionScore(
        question.response_type,
        response.response,
        question.max_score,
        config
      );

      if (score !== null) {
        totalEarnedScore += score * question.weight;
      }
    }
  }

  const score = totalMaxScore > 0 ? (totalEarnedScore / totalMaxScore) * 100 : null;

  return {
    score: score !== null ? Math.round(score * 100) / 100 : null,
    maxScore: totalMaxScore,
    earnedScore: totalEarnedScore,
    questionCount: questions.length,
    answeredCount,
  };
}

/**
 * Calculate overall audit score with category weights
 */
export async function calculateAuditScoreWithWeights(
  auditId: string,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG
): Promise<{
  overallScore: number | null;
  riskLevel: RiskLevel;
  categoryScores: Array<{
    categoryId: string;
    categoryName: string;
    weight: number;
    score: number | null;
  }>;
  summary: {
    totalQuestions: number;
    answeredQuestions: number;
    totalMaxScore: number;
    totalEarnedScore: number;
  };
}> {
  // Get audit template
  const { data: auditData } = await (supabase.from('audits') as any)
    .select('template_id')
    .eq('id', auditId)
    .single();

  if (!auditData) {
    throw new Error('Audit not found');
  }

  // Get categories with weights
  const { data: categories } = await (supabase.from('audit_categories') as any)
    .select('id, name, weight')
    .eq('template_id', auditData.template_id);

  if (!categories || categories.length === 0) {
    return {
      overallScore: null,
      riskLevel: 'critical',
      categoryScores: [],
      summary: {
        totalQuestions: 0,
        answeredQuestions: 0,
        totalMaxScore: 0,
        totalEarnedScore: 0,
      },
    };
  }

  // Calculate score for each category
  const categoryScores = await Promise.all(
    categories.map(async (cat: any) => {
      const catScore = await calculateCategoryScore(auditId, cat.id, config);
      return {
        categoryId: cat.id,
        categoryName: cat.name,
        weight: cat.weight,
        score: catScore.score,
        maxScore: catScore.maxScore,
        earnedScore: catScore.earnedScore,
        questionCount: catScore.questionCount,
        answeredCount: catScore.answeredCount,
      };
    })
  );

  // Calculate weighted overall score
  let weightedSum = 0;
  let totalWeight = 0;
  let totalQuestions = 0;
  let answeredQuestions = 0;
  let totalMaxScore = 0;
  let totalEarnedScore = 0;

  for (const cat of categoryScores) {
    if (cat.score !== null) {
      weightedSum += cat.score * cat.weight;
      totalWeight += cat.weight;
    }
    totalQuestions += cat.questionCount;
    answeredQuestions += cat.answeredCount;
    totalMaxScore += cat.maxScore;
    totalEarnedScore += cat.earnedScore;
  }

  const overallScore = totalWeight > 0 ? weightedSum / totalWeight : null;
  const riskLevel = overallScore !== null ? calculateRiskLevel(overallScore, config) : 'critical';

  return {
    overallScore: overallScore !== null ? Math.round(overallScore * 100) / 100 : null,
    riskLevel,
    categoryScores: categoryScores.map((c) => ({
      categoryId: c.categoryId,
      categoryName: c.categoryName,
      weight: c.weight,
      score: c.score,
    })),
    summary: {
      totalQuestions,
      answeredQuestions,
      totalMaxScore,
      totalEarnedScore,
    },
  };
}

/**
 * Get scoring configuration from database or use defaults
 */
export async function getScoringConfig(organizationId?: string): Promise<ScoringConfig> {
  if (!organizationId) {
    return DEFAULT_SCORING_CONFIG;
  }

  // Try to get config from organization settings
  const { data } = await (supabase.from('organizations') as any)
    .select('scoring_config')
    .eq('id', organizationId)
    .single();

  if (data?.scoring_config) {
    return { ...DEFAULT_SCORING_CONFIG, ...data.scoring_config };
  }

  return DEFAULT_SCORING_CONFIG;
}

/**
 * Save scoring configuration for an organization
 */
export async function saveScoringConfig(
  organizationId: string,
  config: ScoringConfig
): Promise<void> {
  const { error } = await (supabase.from('organizations') as any)
    .update({ scoring_config: config })
    .eq('id', organizationId);

  if (error) {
    throw new Error(`Failed to save scoring config: ${error.message}`);
  }
}
