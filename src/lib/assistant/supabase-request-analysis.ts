import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getRequestAnalysisProvider } from "@/lib/ai/request-analysis-provider";
import {
  type AiCallAuditContext,
  createPublicSupabaseCallLogger,
  createSupabaseCallLogger,
} from "@/lib/assistant/supabase-grounded-answer";

export function createSupabaseRequestAnalysisDependencies(
  supabase: SupabaseClient,
  auditContext?: AiCallAuditContext,
) {
  return {
    provider: getRequestAnalysisProvider(),
    callLogger: createSupabaseCallLogger(supabase, auditContext),
  };
}

export function createPublicSupabaseRequestAnalysisDependencies(
  supabase: SupabaseClient,
  assistantPublicId: string,
  auditContext?: AiCallAuditContext,
) {
  return {
    provider: getRequestAnalysisProvider(),
    callLogger: createPublicSupabaseCallLogger(
      supabase,
      assistantPublicId,
      auditContext,
    ),
  };
}
