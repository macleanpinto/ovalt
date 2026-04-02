/**
 * GTM Template Manager
 * Handles creation and management of custom GTM templates via API
 */

import { google } from 'googleapis';
import { GA4_EVENT_TEMPLATE } from './ga4-event.js';

const tagmanager = google.tagmanager('v2');

export interface GTMTemplate {
  info: {
    displayName: string;
    description: string;
    version: string;
    categories: string[];
    type: string;
  };
  containerContexts: string[];
  parameters: any[];
  code: string;
  permissions: any[];
}

export interface TemplateDeployResult {
  templateId: string;
  templatePath: string;
  fingerprint?: string;
  name: string;
  status: 'created' | 'exists' | 'error';
  error?: string;
}

/**
 * Convert our template format to GTM API .tpl format
 */
function convertToGTMFormat(template: GTMTemplate) {
  // GTM expects a .tpl file format with section markers
  // Each section header must be on its own line with no trailing characters
  const infoJson = JSON.stringify({
    type: template.info.type,
    id: 'cvt_temp_public_id',
    version: 1,
    securityGroups: [],
    displayName: template.info.displayName,
    brand: {
      id: 'brand_dummy',
      displayName: ''
    },
    description: template.info.description,
    containerContexts: template.containerContexts,
    categories: template.info.categories
  }, null, 2);

  const parametersJson = JSON.stringify(template.parameters, null, 2);
  const permissionsJson = JSON.stringify(template.permissions, null, 2);

  const tplContent = [
    '___TERMS_OF_SERVICE___',
    '',
    'By creating or modifying this file you agree to Google Tag Manager\'s Community',
    'Template Gallery Developer Terms of Service available at',
    'https://developers.google.com/tag-manager/gallery-tos',
    '',
    '___INFO___',
    '',
    infoJson,
    '',
    '___TEMPLATE_PARAMETERS___',
    '',
    parametersJson,
    '',
    '___SANDBOXED_JS_FOR_SERVER_SIDE___',
    '',
    template.code,
    '',
    '___SERVER_PERMISSIONS___',
    '',
    permissionsJson,
    '',
    '___TESTS___',
    '',
    '[]',
    '',
    '___NOTES___',
    '',
    'Created by Tag Relay',
    ''
  ].join('\n');

  return {
    name: template.info.displayName,
    templateData: tplContent
  };
}

/**
 * Check if a template already exists in the workspace
 */
export async function templateExists(
  auth: any,
  workspacePath: string,
  templateName: string
): Promise<string | null> {
  try {
    const response = await tagmanager.accounts.containers.workspaces.templates.list({
      auth,
      parent: workspacePath
    });

    const templates = response.data.template || [];
    const existing = templates.find((t: any) => t.name === templateName);

    return existing ? (existing.path ?? null) : null;
  } catch (error) {
    console.error('Error checking template existence:', error);
    return null;
  }
}

/**
 * Create a custom template in GTM workspace
 */
export async function createTemplate(
  auth: any,
  workspacePath: string,
  template: GTMTemplate
): Promise<TemplateDeployResult> {
  try {
    // Check if template already exists
    const existingPath = await templateExists(auth, workspacePath, template.info.displayName);

    if (existingPath) {
      // Template already exists, return existing info
      return {
        templateId: existingPath.split('/').pop() || '',
        templatePath: existingPath,
        fingerprint: undefined,
        name: template.info.displayName,
        status: 'exists'
      };
    }

    // Create new template
    const templateData = convertToGTMFormat(template);

    const response = await tagmanager.accounts.containers.workspaces.templates.create({
      auth,
      parent: workspacePath,
      requestBody: {
        name: template.info.displayName,
        templateData: templateData.templateData
      }
    });

    return {
      templateId: response.data.templateId ?? '',
      templatePath: response.data.path ?? '',
      fingerprint: response.data.fingerprint ?? undefined,
      name: template.info.displayName,
      status: 'created'
    };
  } catch (error: any) {
    return {
      templateId: '',
      templatePath: '',
      name: template.info.displayName,
      status: 'error',
      error: error.message || 'Unknown error creating template'
    };
  }
}

/**
 * Deploy all required templates for a migration
 */
export async function deployRequiredTemplates(
  auth: any,
  workspacePath: string,
  tagTypes: string[]
): Promise<TemplateDeployResult[]> {
  const results: TemplateDeployResult[] = [];
  const uniqueTypes = [...new Set(tagTypes)];

  for (const tagType of uniqueTypes) {
    // Map tag types to templates
    if (tagType.toLowerCase().includes('ga4') || tagType.toLowerCase().includes('google analytics')) {
      const result = await createTemplate(auth, workspacePath, GA4_EVENT_TEMPLATE);
      results.push(result);
    }
    // Add more template types as we build them:
    // - Meta CAPI
    // - Google Ads
    // - etc.
  }

  return results;
}

/**
 * Get template fingerprint for tag creation
 * Tags reference custom templates by their fingerprint, not ID
 */
export async function getTemplateFingerprint(
  auth: any,
  workspacePath: string,
  templateName: string
): Promise<string | null> {
  try {
    const response = await tagmanager.accounts.containers.workspaces.templates.list({
      auth,
      parent: workspacePath
    });

    const templates = response.data.template || [];
    const template = templates.find((t: any) => t.name === templateName);

    return template?.fingerprint || null;
  } catch (error) {
    console.error('Error getting template fingerprint:', error);
    return null;
  }
}

export const AVAILABLE_TEMPLATES = {
  GA4_EVENT: GA4_EVENT_TEMPLATE
  // Add more as we build them:
  // META_CAPI: META_CAPI_TEMPLATE,
  // GOOGLE_ADS: GOOGLE_ADS_TEMPLATE,
};
