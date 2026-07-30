import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { getRequestAnalysisProvider } from "@/lib/ai/request-analysis-provider";
import {
  createPublicSupabaseCallLogger,
  createSupabaseCallLogger,
} from "@/lib/assistant/supabase-grounded-answer";

export function createSupabaseRequestAnalysisDependencies(
  supabase: SupabaseClient,
) {
  return {
    provider: getRequestAnalysisProvider(),
    callLogger: createSupabaseCallLogger(supabase),
  };
}

export function createPublicSupabaseRequestAnalysisDependencies(
  supabase: SupabaseClient,
  assistantPublicId: string,
) {
  return {
    provider: getRequestAnalysisProvider(),
    callLogger: createPublicSupabaseCallLogger(
      supabase,
      assistantPublicId,
    ),
  };
}
