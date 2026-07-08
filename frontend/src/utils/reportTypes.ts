/**
 * Scanner Result Detail - Type Definitions
 * 
 * RawScanResult: Exact shape of the API payload (only fields that exist)
 * ReportViewModel: Normalized UI model derived from RawScanResult
 * 
 * Primary source: raw.scoring_v2 (ScoringEngine output)
 * Fallback: legacy fields only if scoring_v2 is missing
 */

// =============================================================================
// RAW API TYPES - Exact shape of what the backend returns
// =============================================================================

/** Raw metadata from Chrome Web Store */
export interface RawMetadata {
  title?: string;
  user_count?: number;
  rating?: number;
  ratings_count?: number;
  last_updated?: string;
  version?: string;
  size?: string;
  developer_name?: string;
  developer_email?: string;
  developer_website?: string;
  privacy_policy?: string;
  follows_best_practices?: boolean;
  is_featured?: boolean;
  category?: string;
}

/** Raw manifest data */
export interface RawManifest {
  name?: string;
  version?: string;
  manifest_version?: number;
  description?: string;
  permissions?: string[];
  host_permissions?: string[];
  optional_permissions?: string[];
  content_scripts?: Array<{
    matches?: string[];
    js?: string[];
    css?: string[];
  }>;
  background?: {
    type?: string;
    service_worker?: string;
  };
  content_security_policy?: string | null;
  update_url?: string;
}

/** Raw permissions analysis */
export interface RawPermissionsAnalysis {
  permissions_analysis?: string;
  permissions_details?: Record<string, {
    permission_name?: string;
    justification_reasoning?: string;
    is_reasonable?: boolean;
    risk_level?: string;
  }>;
  host_permissions_analysis?: string;
  screenshot_capture_analysis?: {
    detected?: boolean;
    detection_method?: string;
    evidence?: Array<{
      file?: string;
      library?: string;
      source?: string;
    }>;
    risk_score?: number;
    description?: string;
  };
}

/** Raw SAST finding */
export interface RawSASTFinding {
  check_id?: string;
  path?: string;
  start?: { line?: number; col?: number };
  end?: { line?: number; col?: number };
  extra?: {
    severity?: string;
    message?: string;
    metadata?: {
      category?: string;
      mitre?: string[];
      owasp?: string[];
    };
    lines?: string;
  };
}

/** Raw SAST results */
export interface RawSASTResults {
  sast_analysis?: string;
  sast_findings?: Record<string, RawSASTFinding[]>;
}

/** Raw VirusTotal file result */
export interface RawVTFileResult {
  file_name?: string;
  file_path?: string;
  priority_file?: boolean;
  hashes?: {
    sha256?: string;
    sha1?: string;
    md5?: string;
  };
  virustotal?: {
    found?: boolean;
    message?: string;
    sha256?: string;
    detection_stats?: {
      malicious?: number;
      suspicious?: number;
      undetected?: number;
      harmless?: number;
      total_engines?: number;
    };
    reputation?: number;
    times_submitted?: number;
    first_submission_date?: string;
    last_analysis_date?: string;
    type_description?: string;
    tags?: string[];
    malware_families?: string[];
  };
}

/** Raw VirusTotal analysis */
export interface RawVirusTotalAnalysis {
  enabled?: boolean;
  files_analyzed?: number;
  files_with_detections?: number;
  total_malicious?: number;
  total_suspicious?: number;
  file_results?: RawVTFileResult[];
  summary?: {
    threat_level?: string;
    detected_families?: string[];
    recommendation?: string;
  };
}

/** Raw entropy file result */
export interface RawEntropyFileResult {
  file_name?: string;
  file_path?: string;
  file_size_bytes?: number;
  entropy?: {
    byte_entropy?: number;
    char_entropy?: number;
    risk_level?: string;
  };
  obfuscation_patterns?: Array<{
    pattern_name?: string;
    description?: string;
    risk?: string;
    match_count?: number;
    sample_match?: string;
  }>;
  pattern_count?: number;
  high_risk_pattern_count?: number;
  overall_risk?: string;
  is_likely_obfuscated?: boolean;
}

/** Raw entropy analysis */
export interface RawEntropyAnalysis {
  files_analyzed?: number;
  files_skipped?: number;
  obfuscated_files?: number;
  suspicious_files?: number;
  file_results?: RawEntropyFileResult[];
  summary?: {
    overall_risk?: string;
    obfuscation_detected?: boolean;
    high_entropy_files?: string[];
    pattern_summary?: Record<string, {
      description?: string;
      risk?: string;
      total_occurrences?: number;
      files_affected?: number;
    }>;
    recommendation?: string;
  };
}

/** Raw summary */
export interface RawSummary {
  summary?: string;
  overall_risk_level?: string;
  key_findings?: string[];
  recommendations?: string[];
}

/** Raw evidence item from signal pack */
export interface RawEvidenceItem {
  evidence_id?: string;
  file_path?: string;
  file_hash?: string;
  line_start?: number | null;
  line_end?: number | null;
  snippet?: string;
  provenance?: string;
  version?: number;
  created_at?: string;
  tool_name?: string;
  raw_data?: unknown;
}

/** Raw factor from scoring v2 layer */
export interface RawFactorScore {
  name?: string;
  severity?: number;
  confidence?: number;
  weight?: number;
  contribution?: number;
  risk_level?: string;
  evidence_ids?: string[];
  details?: Record<string, unknown>;
  flags?: string[];
}

/** Raw layer score from scoring v2 */
export interface RawLayerScore {
  layer_name?: string;
  score?: number;
  risk?: number;
  risk_level?: string;
  confidence?: number;
  factors?: RawFactorScore[];
}

/** Raw scoring v2 payload (ScoringEngine output) */
export interface RawScoringV2 {
  scoring_version?: string;
  weights_version?: string;
  security_score?: number;
  privacy_score?: number;
  governance_score?: number;
  overall_score?: number;
  overall_confidence?: number;
  /** Scoring-layer decision (engine scoring rungs only) — secondary/detail.
   *  The authoritative cross-system verdict is raw.governance_verdict. */
  decision?: string; // "ALLOW" | "BLOCK" | "NEEDS_REVIEW"
  decision_reasons?: string[];
  reasons?: string[];
  insufficient_data?: boolean;
  decision_authority?: string;
  hard_gates_triggered?: string[];
  risk_level?: string;
  explanation?: string | {
    summary?: string;
    security_summary?: string;
    privacy_summary?: string;
    governance_summary?: string;
  };
  security_layer?: RawLayerScore;
  privacy_layer?: RawLayerScore;
  governance_layer?: RawLayerScore;
  gate_results?: Array<{
    gate_id?: string;
    decision?: string;
    triggered?: boolean;
    confidence?: number;
    reasons?: string[];
  }>;
}

/** Raw governance bundle decision */
export interface RawGovernanceDecision {
  /** Authoritative final verdict from the single Decision Authority (preferred). */
  final_verdict?: string;
  final_authority?: string;
  final_reasons?: string[];
  insufficient_data?: boolean;
  /** Legacy rules-engine verdict — secondary/detail only; must NOT override final_verdict. */
  verdict?: string;
  rationale?: string;
  action_required?: string;
  triggered_rules?: string[];
  block_rules?: string[];
  review_rules?: string[];
}

/** Raw governance bundle */
export interface RawGovernanceBundle {
  signal_pack?: {
    evidence?: Record<string, RawEvidenceItem>;
  };
  scoring_v2?: RawScoringV2;
  security_scorecard?: Record<string, unknown>;
  governance_scorecard?: Record<string, unknown>;
  facts?: {
    scan_id?: string;
    extension_id?: string;
    manifest?: RawManifest;
    security_findings?: {
      permission_findings?: Array<{
        permission_name?: string;
        is_reasonable?: boolean;
        justification_reasoning?: string;
      }>;
      dangerous_permissions?: string[];
      sast_findings?: Array<{
        file_path?: string;
        finding_type?: string;
        severity?: string;
        description?: string;
        line_number?: number;
        code_snippet?: string;
      }>;
      sast_risk_level?: string;
      virustotal_findings?: Array<{
        file_name?: string;
        file_path?: string;
        sha256?: string;
        detection_stats?: {
          malicious?: number;
          suspicious?: number;
        };
        threat_level?: string;
        malware_families?: string[];
      }>;
      virustotal_threat_level?: string;
      virustotal_malicious_count?: number;
    };
    metadata?: RawMetadata;
  };
  evidence_index?: {
    scan_id?: string;
    evidence?: Record<string, RawEvidenceItem>;
  };
  signals?: {
    scan_id?: string;
    signals?: Array<{
      signal_id?: string;
      type?: string;
      confidence?: number;
      evidence_refs?: string[];
      description?: string;
      severity?: string;
    }>;
  };
  store_listing?: {
    extraction?: {
      status?: string;
      reason?: string;
      extracted_at?: string;
    };
    declared_data_categories?: string[];
    declared_purposes?: string[];
    declared_third_parties?: string[];
    privacy_policy_url?: string | null;
    privacy_policy_hash?: string;
  };
  context?: {
    regions_in_scope?: string[];
    rulepacks?: string[];
    domain_categories?: string[];
    cross_border_risk?: boolean;
  };
  rule_results?: {
    scan_id?: string;
    rule_results?: Array<{
      rule_id?: string;
      rulepack?: string;
      verdict?: string;
      confidence?: number;
      evidence_refs?: string[];
      citations?: string[];
      explanation?: string;
      recommended_action?: string;
      triggered_at?: string;
    }>;
  };
  report?: {
    scan_id?: string;
    extension_id?: string;
    extension_name?: string;
    created_at?: string;
    decision?: RawGovernanceDecision;
    rule_results?: Array<{
      rule_id?: string;
      verdict?: string;
    }>;
  };
  decision?: RawGovernanceDecision;
}

/**
 * RawScanResult - The complete API payload shape
 * Only includes fields that actually exist in the backend response
 */
export interface RawScanResult {
  // Core identifiers
  extension_id?: string;
  extension_name?: string;
  url?: string;
  timestamp?: string;
  status?: string;

  // Extension metadata
  metadata?: RawMetadata;
  manifest?: RawManifest;

  // Publisher & Disclosures (Chrome Web Store listing; not manifest)
  publisher_disclosures?: {
    trader_status?: 'TRADER' | 'NON_TRADER' | 'UNKNOWN';
    developer_website_url?: string | null;
    support_email?: string | null;
    privacy_policy_url?: string | null;
    user_count?: number | null;
    rating_value?: number | null;
    rating_count?: number | null;
    last_updated_iso?: string | null;
  };

  // Analysis results
  permissions_analysis?: RawPermissionsAnalysis;
  sast_results?: RawSASTResults;
  webstore_analysis?: {
    webstore_analysis?: string;
  };
  virustotal_analysis?: RawVirusTotalAnalysis;
  entropy_analysis?: RawEntropyAnalysis;
  summary?: RawSummary;

  // Extracted files
  extracted_path?: string;
  extracted_files?: string[];

  // Scoring - Legacy (backward compatibility)
  overall_security_score?: number;
  total_findings?: number;
  risk_distribution?: {
    high?: number;
    medium?: number;
    low?: number;
  };
  overall_risk?: string;
  total_risk_score?: number;

  // Scoring - V2 (primary source)
  security_score?: number;
  privacy_score?: number;
  governance_score?: number;
  overall_confidence?: number;
  /** Scoring-layer decision — secondary/detail. Authoritative verdict is governance_verdict. */
  decision_v2?: string;
  decision_reasons_v2?: string[];
  insufficient_data?: boolean;
  decision_authority?: string;
  scoring_v2?: RawScoringV2;

  // Governance (Pipeline B)
  /** Authoritative final verdict (single Decision Authority). Prefer this. */
  governance_verdict?: string;
  final_verdict?: string;
  governance_bundle?: RawGovernanceBundle;
  governance_report?: {
    scan_id?: string;
    extension_id?: string;
    extension_name?: string;
    decision?: RawGovernanceDecision;
    rule_results?: Array<{
      rule_id?: string;
      verdict?: string;
    }>;
  };
  governance_error?: string | null;

  // UI-friendly report view model (backend-computed)
  report_view_model?: RawReportViewModel;
}

// =============================================================================
// REPORT VIEW MODEL - Normalized UI Model
// =============================================================================

/** Band classification for scores */
export type ScoreBand = 'GOOD' | 'WARN' | 'BAD' | 'NA';

/** Decision type */
export type Decision = 'ALLOW' | 'WARN' | 'BLOCK' | null;

/** Finding severity */
export type FindingSeverity = 'high' | 'medium' | 'low';

/** Score with band and confidence */
export interface ScoreVM {
  score: number | null;
  band: ScoreBand;
  confidence: number | null;
}

/** Scores section of the view model */
export interface ScoresVM {
  security: ScoreVM;
  privacy: ScoreVM;
  governance: ScoreVM;
  overall: ScoreVM;
  /** Final cross-system verdict (prefers governance_verdict/final_verdict). */
  decision: Decision;
  reasons: string[];
  /** True when analysis coverage was too low to clear the extension as safe. */
  insufficientData?: boolean;
  /** Which rung of the Decision Authority produced the verdict (detail). */
  decisionAuthority?: string | null;
}

/** Factor view model */
export interface FactorVM {
  name: string;
  severity: number;
  confidence: number;
  weight?: number;
  riskContribution?: number;
  evidenceIds: string[];
  details?: Record<string, unknown>;
}

/** Factors by layer */
export interface FactorsByLayerVM {
  security: FactorVM[];
  privacy: FactorVM[];
  governance: FactorVM[];
}

/** Key finding */
export interface KeyFindingVM {
  title: string;
  severity: FindingSeverity;
  layer: 'security' | 'privacy' | 'governance';
  summary: string;
  evidenceIds: string[];
  /**
   * Optional, additive structured reference letting a user verify WHY this
   * finding exists. Backward-compatible: absent on legacy payloads / findings
   * with no derivable evidence. Never fabricated — `available: false` marks a
   * summary-only finding. Ordering/severity are unaffected by this field.
   */
  evidence?: KeyFindingEvidence;
}

/**
 * Structured, verifiable reference for a Key Finding. All fields except `kind`
 * and `available` are optional and only present when the source payload carried
 * them (no invented evidence). `label` is a short one-line reference for compact
 * display; the type-specific fields back it.
 */
export interface KeyFindingEvidence {
  kind: 'sast' | 'governance' | 'manifest' | 'virustotal' | 'coverage' | 'summary';
  available: boolean;
  label?: string;
  // SAST / code
  filePath?: string;
  lineStart?: number | null;
  lineEnd?: number | null;
  snippet?: string;
  evidenceIds?: string[];
  /** File path the existing FileViewerModal / GET /api/scan/file endpoint can open. */
  sourceViewerPath?: string;
  // governance rulepack
  rulepack?: string;
  ruleId?: string;
  finalReason?: string;
  actionRequired?: string;
  // manifest / permission
  permission?: string;
  hostPermission?: string;
  manifestField?: string;
  explanation?: string;
  // virustotal
  hash?: string;
  malicious?: number;
  suspicious?: number;
  harmless?: number;
  undetected?: number;
  coverageState?: string;
  // coverage-cap
  analyzer?: string;
  reason?: string;
  confidence?: number | null;
}

/** Permissions view model */
export interface PermissionsVM {
  apiPermissions?: string[];
  hostPermissions?: string[];
  highRiskPermissions?: string[];
  unreasonablePermissions?: string[];
  broadHostPatterns?: string[];
}

/** Evidence item */
export interface EvidenceItemVM {
  toolName?: string;
  filePath?: string;
  lineStart?: number | null;
  lineEnd?: number | null;
  snippet?: string;
  timestamp?: string;
  rawData?: unknown;
}

// =============================================================================
// CONSUMER INSIGHTS - UI-friendly aggregation from report_view_model
// =============================================================================

export type ConsumerInsightValue = "YES" | "NO" | "UNKNOWN";
export type ConsumerInsightSeverity = "LOW" | "MEDIUM" | "HIGH";

export type ConsumerSafetyLabelRow = {
  id: string;
  title: string;
  value: ConsumerInsightValue;
  severity: ConsumerInsightSeverity;
  why?: string;
  evidence_ids?: string[];
};

export type ConsumerScenario = {
  id: string;
  title: string;
  severity: ConsumerInsightSeverity;
  summary: string;
  why?: string;
  mitigations?: string[];
  evidence_ids?: string[];
};

export type ConsumerTopDriver = {
  layer: string; // "security" | "privacy" | "governance" (allow string for forward compat)
  name: string;
  contribution: number;
  severity?: number;    // 0-1
  confidence?: number;  // 0-1
  evidence_ids?: string[];
};

export type ConsumerInsights = {
  safety_label: ConsumerSafetyLabelRow[];
  scenarios: ConsumerScenario[];
  top_drivers: ConsumerTopDriver[];
};

/** Raw report_view_model (only fields used by frontend) */
export interface RawReportViewModel {
  consumer_insights?: ConsumerInsights;
}

/** Meta information. Use getExtensionIconUrl(meta.extensionId) for icon display. */
export interface MetaVM {
  extensionId: string;
  name: string;
  version?: string;
  updatedAt?: string;
  users?: number;
  rating?: number;
  ratingCount?: number;
  storeUrl?: string;
  scanTimestamp?: string;
}

/** Publisher & Disclosures from Chrome Web Store listing (not manifest). All nullable. */
export interface PublisherDisclosuresVM {
  trader_status: 'TRADER' | 'NON_TRADER' | 'UNKNOWN';
  developer_website_url?: string | null;
  support_email?: string | null;
  privacy_policy_url?: string | null;
  user_count?: number | null;
  rating_value?: number | null;
  rating_count?: number | null;
  last_updated_iso?: string | null;
}

/**
 * ReportViewModel - Normalized UI model
 * All fields are derived from RawScanResult, never invented
 */
export interface ReportViewModel {
  meta: MetaVM;
  scores: ScoresVM;
  factorsByLayer: FactorsByLayerVM;
  keyFindings: KeyFindingVM[];
  permissions: PermissionsVM;
  evidenceIndex: Record<string, EvidenceItemVM>;
  consumerInsights?: ConsumerInsights;
  publisherDisclosures?: PublisherDisclosuresVM;
}

