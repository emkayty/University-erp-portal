/**
 * Feature flag registry.
 * These are the default values stored in InstitutionSettings.featureFlags JSONB.
 * All flags default to FALSE — they must be explicitly enabled by super_admin.
 */
export const DEFAULT_FEATURE_FLAGS = {
  // Module toggles
  module_lms:       false, // Learning Management System
  module_health:    false, // Health/Clinic module
  module_transport: false, // Transport & Logistics
  module_research:  false, // Research & Grants
  module_alumni:    false, // Alumni & Endowment

  // Workflow variants
  dean_approval_required: false, // Dean must approve results before Registrar
  tsa_mode:               false, // Treasury Single Account payment routing
  nysc_exemption_mode:    false, // Masters/PhD exemption letter instead of call-up
  ccmas_strict_mode:      true,  // NUC 70/30 curriculum enforcement (on by default)
  ferpa_us_mode:          false, // FERPA compliance features for US-affiliated institutions

  // Experimental / Phase 3
  enable_phase3_microservices: false,
  enable_unitime_scheduling:   false,
  enable_opensearch:           false,
} as const;

export type FeatureFlags = typeof DEFAULT_FEATURE_FLAGS;
export type FeatureFlagKey = keyof FeatureFlags;

export const FEATURE_FLAG_KEYS = Object.keys(DEFAULT_FEATURE_FLAGS) as FeatureFlagKey[];
