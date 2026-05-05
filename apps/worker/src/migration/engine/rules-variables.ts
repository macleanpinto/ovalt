/**
 * Variable migration rules
 * Maps client-side variables to server-side equivalents
 */

import type { CanonicalVariable, VariableMappingRecord } from "../types.js";

// Inline variable type mapping - duplicated from gtm-mappings to avoid cross-package import
const CLIENT_TO_SERVER_VARIABLE_TYPE: Record<string, string | null> = {
  'v': 'eventData',
  'dataLayer': 'eventData',
  'c': 'c',
  'jsm': null,
  'j': 'j',
  '1p': 'r',
  'f': 'remoteAddress',
  'u': 'requestUrl',
  'aev': null,
  'vis': null,
  'ytv': null,
  'smm': 'smm',
  're': 're',
  'r': 'r',
  'ctid': 'ctid',
  'ctv': 'ctv',
  'e': 'e',
  'd': 'd',
  'gas': null
};

function getVariableMigrationStrategy(clientType: string): {
  canMigrate: boolean;
  serverType: string | null;
  strategy: 'automatic' | 'manual-rewrite' | 'client-only';
  recommendation: string;
} {
  const serverType = CLIENT_TO_SERVER_VARIABLE_TYPE[clientType];

  // Automatic migration
  if (serverType && ['v', 'dataLayer', 'c', 'smm', 're', '1p', 'r', 'ctid', 'ctv', 'e', 'd'].includes(clientType)) {
    return {
      canMigrate: true,
      serverType,
      strategy: 'automatic',
      recommendation: `Automatically migrates to server-side type "${serverType}".`
    };
  }

  // Manual rewrite needed
  if (serverType && ['j', 'u', 'f'].includes(clientType)) {
    return {
      canMigrate: true,
      serverType,
      strategy: 'manual-rewrite',
      recommendation: `Can migrate to "${serverType}" but requires manual configuration.`
    };
  }

  // Client-only
  return {
    canMigrate: false,
    serverType: null,
    strategy: 'client-only',
    recommendation: 'This variable is client-side only and cannot be migrated to server-side.'
  };
}

function getVariableTypeMapping(varType: string): { serverType: string | null } | null {
  return { serverType: CLIENT_TO_SERVER_VARIABLE_TYPE[varType] || null };
}

/**
 * Categorize variable based on type
 */
function categorizeVariable(varType: string): VariableMappingRecord["category"] {
  const mapping = getVariableTypeMapping(varType);
  if (!mapping) return "custom";

  // Categorize based on variable type
  if (varType === "v" || varType === "dataLayer") return "data-layer";
  if (varType === "c") return "constant";
  if (varType === "smm" || varType === "re") return "lookup";
  if (varType === "1p" || varType === "r") return "cookie";
  if (varType === "ctid" || varType === "ctv" || varType === "e" || varType === "d") return "container";
  if (mapping.serverType === null) return "client-only";

  return "custom";
}

/**
 * Generate manual actions for variable migration
 */
function generateVariableManualActions(
  variable: CanonicalVariable,
  strategy: ReturnType<typeof getVariableMigrationStrategy>
): string[] {
  const actions: string[] = [];

  if (strategy.strategy === "client-only") {
    actions.push(
      `[CRITICAL] Variable "${variable.name}" is client-side only and cannot be migrated. ${strategy.recommendation}`
    );
    return actions;
  }

  if (strategy.strategy === "manual-rewrite") {
    actions.push(
      `[HIGH] Variable "${variable.name}" requires manual configuration on server-side. ${strategy.recommendation}`
    );
  }

  // Special cases
  if (variable.type === "j" || variable.type === "jsm") {
    actions.push(
      `[HIGH] Custom JavaScript in "${variable.name}" must be rewritten using sandboxed server-side APIs (no DOM/window access).`
    );
  }

  if (variable.type === "u") {
    actions.push(
      `[MEDIUM] URL variable "${variable.name}" should be replaced with Event Data variable reading page_location or use Request URL variable.`
    );
  }

  if (variable.type === "aev") {
    actions.push(
      `[HIGH] Auto-event variable "${variable.name}" is client-side only. Send required values as event parameters to server.`
    );
  }

  return actions;
}

/**
 * Apply variable migration rules to a single variable
 */
export function applyVariableRules(variable: CanonicalVariable): VariableMappingRecord {
  const strategy = getVariableMigrationStrategy(variable.type);
  const category = categorizeVariable(variable.type);
  const manualActions = generateVariableManualActions(variable, strategy);

  let serverRecommendation = strategy.recommendation;

  // Add specific configuration hints based on variable type
  if (variable.type === "v" || variable.type === "dataLayer") {
    const dataLayerKey = variable.parameters["name"] || "(not configured)";
    serverRecommendation += `\n\nConfiguration: Create Event Data variable with key path "${dataLayerKey}".`;
  }

  if (variable.type === "c") {
    const constantValue = variable.parameters["value"] || "(not set)";
    serverRecommendation += `\n\nConfiguration: Set constant value to "${constantValue}".`;
  }

  if (variable.type === "1p") {
    const cookieName = variable.parameters["name"] || "(not configured)";
    serverRecommendation += `\n\nConfiguration: Create HTTP Request Cookie variable reading cookie "${cookieName}".`;
  }

  return {
    clientVariableId: variable.variableId,
    clientVariableName: variable.name,
    clientVariableType: variable.type,
    category,
    serverRecommendation,
    canAutoMigrate: strategy.strategy === "automatic",
    serverVariableType: strategy.serverType,
    provisional: strategy.strategy !== "automatic",
    manualActions
  };
}

/**
 * Apply variable rules to all variables
 */
export function applyVariableRuleset(variables: CanonicalVariable[]): VariableMappingRecord[] {
  return variables.map(variable => applyVariableRules(variable));
}

/**
 * Aggregate variable migration stats.
 */
export function aggregateVariableStats(mappings: VariableMappingRecord[]): {
  provisional: boolean;
  autoMigratable: number;
  manualRequired: number;
  clientOnly: number;
} {
  if (mappings.length === 0) {
    return { provisional: false, autoMigratable: 0, manualRequired: 0, clientOnly: 0 };
  }

  let autoMigratable = 0;
  let manualRequired = 0;
  let clientOnly = 0;

  for (const m of mappings) {
    if (m.canAutoMigrate) {
      autoMigratable++;
    } else if (m.serverVariableType !== null) {
      manualRequired++;
    } else {
      clientOnly++;
    }
  }

  const provisional = mappings.some(m => m.provisional);

  return { provisional, autoMigratable, manualRequired, clientOnly };
}
