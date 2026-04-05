/**
 * GTM Mappings - Comprehensive Type Registry
 *
 * Central registry for all GTM client-to-server type mappings.
 * This module provides type-based (not name-based) mappings for:
 * - Tags (client tag types → server tag types)
 * - Triggers (client trigger types → server trigger types)
 * - Variables (client variable types → server variable types)
 *
 * Usage:
 *   import { CLIENT_TO_SERVER_TAG_TYPE, getMigrationRecommendation } from './gtm-mappings';
 *   const serverType = CLIENT_TO_SERVER_TAG_TYPE['gaawe'];
 *   const recommendation = getMigrationRecommendation('gaawe');
 */

// Re-export everything from tag mappings
export {
  // Types
  type TagTypeMapping,

  // Grouped mappings
  GOOGLE_ANALYTICS_MAPPINGS,
  GOOGLE_ADS_MAPPINGS,
  META_MAPPINGS,
  TIKTOK_MAPPINGS,
  SNAPCHAT_MAPPINGS,
  LINKEDIN_MAPPINGS,
  TWITTER_MAPPINGS,
  PINTEREST_MAPPINGS,
  REDDIT_MAPPINGS,
  MICROSOFT_MAPPINGS,
  ANALYTICS_PLATFORMS_MAPPINGS,
  CUSTOM_TAGS_MAPPINGS,

  // Master registry
  ALL_TAG_TYPE_MAPPINGS,
  CLIENT_TO_SERVER_TAG_TYPE,

  // Helper functions
  getTagTypeMapping,
  isAutomaticMigration,
  requiresTemplate,
  isCustomTemplate,
  getMigrationRecommendation
} from './tag-type-mappings.js';

// Re-export everything from trigger mappings
export {
  // Types
  type TriggerTypeMapping,

  // Mappings
  TRIGGER_TYPE_MAPPINGS,
  SERVER_ONLY_TRIGGERS,
  CLIENT_TO_SERVER_TRIGGER_TYPE,

  // Helper functions
  getTriggerTypeMapping,
  canAutoMigrateTrigger,
  getTriggerMigrationStrategy,
  buildServerTriggerConfig
} from './trigger-type-mappings.js';

// Re-export everything from variable mappings
export {
  // Types
  type VariableTypeMapping,

  // Mappings
  VARIABLE_TYPE_MAPPINGS,
  SERVER_ONLY_VARIABLES,
  BUILTIN_VARIABLE_MAPPINGS,
  CLIENT_TO_SERVER_VARIABLE_TYPE,

  // Helper functions
  getVariableTypeMapping,
  canAutoMigrateVariable,
  getVariableMigrationStrategy,
  buildServerVariableConfig
} from './variable-type-mappings.js';

// Import the constants at module level for use in getMappingCoverage
import { ALL_TAG_TYPE_MAPPINGS } from './tag-type-mappings.js';
import { TRIGGER_TYPE_MAPPINGS } from './trigger-type-mappings.js';
import { VARIABLE_TYPE_MAPPINGS } from './variable-type-mappings.js';

/**
 * Get comprehensive migration report for a tag, trigger, or variable
 */
export function getComprehensiveMigrationInfo(entityType: 'tag' | 'trigger' | 'variable', clientType: string) {
  if (entityType === 'tag') {
    const { getMigrationRecommendation } = require('./tag-type-mappings.js');
    return getMigrationRecommendation(clientType);
  }
  if (entityType === 'trigger') {
    const { getTriggerMigrationStrategy } = require('./trigger-type-mappings.js');
    return getTriggerMigrationStrategy(clientType);
  }
  if (entityType === 'variable') {
    const { getVariableMigrationStrategy } = require('./variable-type-mappings.js');
    return getVariableMigrationStrategy(clientType);
  }
  throw new Error(`Unknown entity type: ${entityType}`);
}

/**
 * Statistics about mapping coverage
 */
export function getMappingCoverage() {
  const tagStats = {
    total: ALL_TAG_TYPE_MAPPINGS.length,
    automatic: ALL_TAG_TYPE_MAPPINGS.filter((m: any) => m.complexity === 'automatic').length,
    templateRequired: ALL_TAG_TYPE_MAPPINGS.filter((m: any) => m.complexity === 'template-required').length,
    manualOnly: ALL_TAG_TYPE_MAPPINGS.filter((m: any) => m.complexity === 'manual-only').length
  };

  const triggerStats = {
    total: TRIGGER_TYPE_MAPPINGS.length,
    canAutoMigrate: TRIGGER_TYPE_MAPPINGS.filter((m: any) => m.canAutoMigrate).length,
    requiresClientProxy: TRIGGER_TYPE_MAPPINGS.filter((m: any) => !m.canAutoMigrate && m.serverType === 'customEvent').length,
    clientOnly: TRIGGER_TYPE_MAPPINGS.filter((m: any) => m.serverType === null).length
  };

  const variableStats = {
    total: VARIABLE_TYPE_MAPPINGS.length,
    canAutoMigrate: VARIABLE_TYPE_MAPPINGS.filter((m: any) => m.canAutoMigrate).length,
    requiresRewrite: VARIABLE_TYPE_MAPPINGS.filter((m: any) => !m.canAutoMigrate && m.serverType !== null).length,
    clientOnly: VARIABLE_TYPE_MAPPINGS.filter((m: any) => m.serverType === null).length
  };

  return {
    tags: tagStats,
    triggers: triggerStats,
    variables: variableStats,
    summary: {
      totalMappings: tagStats.total + triggerStats.total + variableStats.total,
      automaticMigrations: tagStats.automatic + triggerStats.canAutoMigrate + variableStats.canAutoMigrate,
      requiresManualWork: tagStats.templateRequired + tagStats.manualOnly + triggerStats.clientOnly + variableStats.clientOnly
    }
  };
}
