/**
 * Variable Deployment Helper
 * Utilities for deploying variables to server-side GTM containers
 */

import { CLIENT_TO_SERVER_VARIABLE_TYPE } from './variable-type-mappings.js';

/**
 * Build server variable configuration from client variable
 * Applies type mapping and copies relevant properties
 */
export function buildServerVariableFromClient(clientVariable: Record<string, any>): {
  canDeploy: boolean;
  serverType: string | null;
  config: Record<string, any> | null;
  reason?: string;
} {
  const clientType = clientVariable.type;
  const serverType = CLIENT_TO_SERVER_VARIABLE_TYPE[clientType];

  if (!serverType) {
    return {
      canDeploy: false,
      serverType: null,
      config: null,
      reason: `Variable type "${clientType}" has no server-side equivalent`
    };
  }

  // Build base config
  const config: Record<string, any> = {
    name: clientVariable.name || 'Unnamed Variable',
    type: serverType
  };

  // Copy parameters based on variable type
  if (clientVariable.parameter && Array.isArray(clientVariable.parameter)) {
    // For most variable types, we can copy parameters directly
    config.parameter = clientVariable.parameter;

    // Special handling for specific types
    if (serverType === 'eventData' && clientType === 'v') {
      // Data Layer Variable → Event Data
      // Extract the data layer key name
      const nameParam = clientVariable.parameter.find((p: any) => p.key === 'name');
      if (nameParam?.value) {
        config.parameter = [
          {
            type: 'template',
            key: 'keyPath',
            value: nameParam.value
          }
        ];
      }
    } else if (serverType === 'r' && clientType === '1p') {
      // First-Party Cookie → HTTP Request Cookie
      // Map cookie name parameter
      const nameParam = clientVariable.parameter.find((p: any) => p.key === 'name');
      if (nameParam?.value) {
        config.parameter = [
          {
            type: 'template',
            key: 'cookieName',
            value: nameParam.value
          }
        ];
      }
    }
  }

  // Copy format value if present
  if (clientVariable.formatValue !== undefined) {
    config.formatValue = clientVariable.formatValue;
  }

  // Copy notes if present
  if (clientVariable.notes) {
    config.notes = `Migrated from client variable: ${clientVariable.name}\n\n${clientVariable.notes}`;
  } else {
    config.notes = `Migrated from client variable: ${clientVariable.name}`;
  }

  // Copy enabling/disabling triggers if present
  if (clientVariable.enablingTriggerId && Array.isArray(clientVariable.enablingTriggerId)) {
    config.enablingTriggerId = clientVariable.enablingTriggerId;
  }
  if (clientVariable.disablingTriggerId && Array.isArray(clientVariable.disablingTriggerId)) {
    config.disablingTriggerId = clientVariable.disablingTriggerId;
  }

  return {
    canDeploy: true,
    serverType,
    config
  };
}

/**
 * Determine deployment order for variables
 * Some variables may depend on others
 */
export function sortVariablesByDependency(variables: Array<Record<string, any>>): Array<Record<string, any>> {
  // For now, use a simple ordering:
  // 1. Constants (no dependencies)
  // 2. Data Layer / Event Data variables (no dependencies)
  // 3. Lookup tables (may reference other variables)
  // 4. Everything else

  const priority = (v: Record<string, any>): number => {
    const type = v.type;
    if (type === 'c') return 0; // Constants first
    if (type === 'v' || type === 'dataLayer') return 1; // Data Layer
    if (type === '1p' || type === 'r') return 2; // Cookies
    if (type === 'smm' || type === 're') return 3; // Lookup/regex tables
    if (type === 'ctid' || type === 'ctv' || type === 'e' || type === 'd') return 4; // Container vars
    return 5; // Everything else
  };

  return [...variables].sort((a, b) => priority(a) - priority(b));
}
