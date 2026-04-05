import { describe, it, expect } from 'vitest';
import {
  // Tag mappings
  CLIENT_TO_SERVER_TAG_TYPE,
  getMigrationRecommendation,
  isAutomaticMigration,
  requiresTemplate,
  isCustomTemplate,
  getTagTypeMapping,
  ALL_TAG_TYPE_MAPPINGS,

  // Trigger mappings
  CLIENT_TO_SERVER_TRIGGER_TYPE,
  getTriggerMigrationStrategy,
  canAutoMigrateTrigger,
  getTriggerTypeMapping,

  // Variable mappings
  CLIENT_TO_SERVER_VARIABLE_TYPE,
  getVariableMigrationStrategy,
  canAutoMigrateVariable,
  getVariableTypeMapping,

  // General
  getMappingCoverage
} from './index.js';

describe('GTM Tag Type Mappings', () => {
  describe('Google Analytics & Google Tag', () => {
    it('should map Google tag to server GA4', () => {
      expect(CLIENT_TO_SERVER_TAG_TYPE['googtag']).toBe('sgtmgaaw');
      expect(isAutomaticMigration('googtag')).toBe(true);
    });

    it('should map GA4 Event to server GA4', () => {
      expect(CLIENT_TO_SERVER_TAG_TYPE['gaawe']).toBe('sgtmgaaw');
      expect(isAutomaticMigration('gaawe')).toBe(true);
    });

    it('should map GA4 Config to server GA4', () => {
      expect(CLIENT_TO_SERVER_TAG_TYPE['gaawc']).toBe('sgtmgaaw');
    });

    it('should mark Universal Analytics as non-migratable', () => {
      expect(CLIENT_TO_SERVER_TAG_TYPE['ua']).toBe(null);
      expect(isAutomaticMigration('ua')).toBe(false);
    });
  });

  describe('Google Ads', () => {
    it('should map Google Ads Conversion to server Ads', () => {
      expect(CLIENT_TO_SERVER_TAG_TYPE['awct']).toBe('sgtmgads');
      expect(isAutomaticMigration('awct')).toBe(true);
    });

    it('should map Remarketing to server Ads', () => {
      expect(CLIENT_TO_SERVER_TAG_TYPE['sp']).toBe('sgtmgads');
    });

    it('should map Floodlight tags to server Floodlight', () => {
      expect(CLIENT_TO_SERVER_TAG_TYPE['fls']).toBe('sgtmflood');
      expect(CLIENT_TO_SERVER_TAG_TYPE['flc']).toBe('sgtmflood');
    });
  });

  describe('Social Media Platforms', () => {
    it('should identify Meta Pixel as requiring template', () => {
      expect(CLIENT_TO_SERVER_TAG_TYPE['facebook_pixel']).toBe(null);
      expect(requiresTemplate('facebook_pixel')).toBe(true);
    });

    it('should identify TikTok as requiring template', () => {
      expect(requiresTemplate('tiktok_pixel')).toBe(true);
    });

    it('should identify Snapchat as requiring template', () => {
      expect(requiresTemplate('snapchat_pixel')).toBe(true);
    });

    it('should identify LinkedIn as requiring template', () => {
      expect(requiresTemplate('linkedin_insight')).toBe(true);
    });

    it('should identify Twitter/X as requiring template', () => {
      expect(requiresTemplate('twitter_uwt')).toBe(true);
    });

    it('should identify Pinterest as requiring template', () => {
      expect(requiresTemplate('pinterest_tag')).toBe(true);
    });

    it('should identify Reddit as requiring template', () => {
      expect(requiresTemplate('reddit_pixel')).toBe(true);
    });
  });

  describe('Custom Tags', () => {
    it('should identify Custom HTML as manual-only', () => {
      expect(CLIENT_TO_SERVER_TAG_TYPE['html']).toBe(null);
      const recommendation = getMigrationRecommendation('html');
      expect(recommendation.canMigrate).toBe(false);
      expect(recommendation.complexity).toBe('manual-only');
    });

    it('should map Custom Image automatically', () => {
      expect(CLIENT_TO_SERVER_TAG_TYPE['img']).toBe('img');
      expect(isAutomaticMigration('img')).toBe(true);
    });

    it('should identify custom templates (cvt_*) correctly', () => {
      expect(isCustomTemplate('cvt_temp_abc123')).toBe(true);
      expect(isCustomTemplate('gaawe')).toBe(false);
    });

    it('should provide recommendation for custom templates', () => {
      const recommendation = getMigrationRecommendation('cvt_custom_template');
      expect(recommendation.canMigrate).toBe(false);
      expect(recommendation.complexity).toBe('manual-only');
      expect(recommendation.recommendation).toContain('Custom template');
    });
  });

  describe('getMigrationRecommendation', () => {
    it('should provide detailed recommendation for automatic migration', () => {
      const recommendation = getMigrationRecommendation('gaawe');
      expect(recommendation.canMigrate).toBe(true);
      expect(recommendation.serverType).toBe('sgtmgaaw');
      expect(recommendation.complexity).toBe('automatic');
      expect(recommendation.evidenceRef).toContain('https://');
    });

    it('should provide recommendation for template-required tags', () => {
      const recommendation = getMigrationRecommendation('facebook_pixel');
      expect(recommendation.canMigrate).toBe(true);
      expect(recommendation.complexity).toBe('template-required');
      expect(recommendation.recommendation).toContain('template');
    });

    it('should provide recommendation for unknown types', () => {
      const recommendation = getMigrationRecommendation('unknown_type_xyz');
      expect(recommendation.canMigrate).toBe(false);
      expect(recommendation.complexity).toBe('unknown');
      expect(recommendation.recommendation).toContain('Unknown tag type');
    });
  });

  describe('Tag Mapping Coverage', () => {
    it('should have mappings for all major tag providers', () => {
      const mappings = ALL_TAG_TYPE_MAPPINGS;

      // Check we have Google tags
      expect(mappings.some(m => m.provider === 'Google')).toBe(true);

      // Check we have social media tags
      expect(mappings.some(m => m.provider === 'Meta')).toBe(true);
      expect(mappings.some(m => m.provider === 'TikTok')).toBe(true);
      expect(mappings.some(m => m.provider === 'Snapchat')).toBe(true);

      // Check we have analytics platforms
      expect(mappings.some(m => m.name.includes('Mixpanel'))).toBe(true);
      expect(mappings.some(m => m.name.includes('Amplitude'))).toBe(true);
    });

    it('should have evidence URLs for all mappings', () => {
      const mappings = ALL_TAG_TYPE_MAPPINGS;
      for (const mapping of mappings) {
        expect(mapping.evidenceRef).toBeTruthy();
        expect(mapping.evidenceRef).toMatch(/^https?:\/\//);
      }
    });
  });
});

describe('GTM Trigger Type Mappings', () => {
  describe('Pageview Triggers', () => {
    it('should map pageview triggers to server pageview', () => {
      expect(CLIENT_TO_SERVER_TRIGGER_TYPE['PAGEVIEW']).toBe('serverPageview');
      expect(CLIENT_TO_SERVER_TRIGGER_TYPE['pageview']).toBe('serverPageview');
      expect(canAutoMigrateTrigger('PAGEVIEW')).toBe(true);
    });

    it('should not auto-migrate DOM Ready', () => {
      expect(CLIENT_TO_SERVER_TRIGGER_TYPE['DOM_READY']).toBe(null);
      expect(canAutoMigrateTrigger('DOM_READY')).toBe(false);
    });
  });

  describe('Custom Event Triggers', () => {
    it('should map custom event triggers directly', () => {
      expect(CLIENT_TO_SERVER_TRIGGER_TYPE['CUSTOM_EVENT']).toBe('customEvent');
      expect(CLIENT_TO_SERVER_TRIGGER_TYPE['customEvent']).toBe('customEvent');
      expect(canAutoMigrateTrigger('CUSTOM_EVENT')).toBe(true);
    });
  });

  describe('Client-Only Triggers', () => {
    it('should identify click triggers as client-only (proxy via custom event)', () => {
      expect(CLIENT_TO_SERVER_TRIGGER_TYPE['CLICK']).toBe('customEvent');
      const strategy = getTriggerMigrationStrategy('CLICK');
      expect(strategy.strategy).toBe('via-custom-event');
    });

    it('should identify form submission as client-only (proxy via custom event)', () => {
      expect(CLIENT_TO_SERVER_TRIGGER_TYPE['FORM_SUBMISSION']).toBe('customEvent');
      const strategy = getTriggerMigrationStrategy('FORM_SUBMISSION');
      expect(strategy.strategy).toBe('via-custom-event');
    });

    it('should identify scroll depth as client-only', () => {
      expect(CLIENT_TO_SERVER_TRIGGER_TYPE['SCROLL_DEPTH']).toBe(null);
      const strategy = getTriggerMigrationStrategy('SCROLL_DEPTH');
      expect(strategy.strategy).toBe('client-only');
    });

    it('should identify video triggers as client-only', () => {
      expect(CLIENT_TO_SERVER_TRIGGER_TYPE['YOUTUBE_VIDEO']).toBe(null);
    });
  });

  describe('getTriggerMigrationStrategy', () => {
    it('should provide automatic migration strategy', () => {
      const strategy = getTriggerMigrationStrategy('PAGEVIEW');
      expect(strategy.canMigrate).toBe(true);
      expect(strategy.serverType).toBe('serverPageview');
      expect(strategy.strategy).toBe('automatic');
    });

    it('should provide custom-event proxy strategy', () => {
      const strategy = getTriggerMigrationStrategy('CLICK');
      expect(strategy.canMigrate).toBe(true);
      expect(strategy.serverType).toBe('customEvent');
      expect(strategy.strategy).toBe('via-custom-event');
      expect(strategy.recommendation).toContain('dataLayer');
    });

    it('should provide client-only strategy', () => {
      const strategy = getTriggerMigrationStrategy('SCROLL_DEPTH');
      expect(strategy.canMigrate).toBe(false);
      expect(strategy.strategy).toBe('client-only');
    });
  });
});

describe('GTM Variable Type Mappings', () => {
  describe('Data Layer Variables', () => {
    it('should map data layer variables to Event Data', () => {
      expect(CLIENT_TO_SERVER_VARIABLE_TYPE['v']).toBe('eventData');
      expect(CLIENT_TO_SERVER_VARIABLE_TYPE['dataLayer']).toBe('eventData');
      expect(canAutoMigrateVariable('v')).toBe(true);
    });
  });

  describe('Constants and Lookup Tables', () => {
    it('should map constants directly', () => {
      expect(CLIENT_TO_SERVER_VARIABLE_TYPE['c']).toBe('c');
      expect(canAutoMigrateVariable('c')).toBe(true);
    });

    it('should map lookup tables directly', () => {
      expect(CLIENT_TO_SERVER_VARIABLE_TYPE['smm']).toBe('smm');
      expect(canAutoMigrateVariable('smm')).toBe(true);
    });

    it('should map regex tables directly', () => {
      expect(CLIENT_TO_SERVER_VARIABLE_TYPE['re']).toBe('re');
      expect(canAutoMigrateVariable('re')).toBe(true);
    });
  });

  describe('Cookies', () => {
    it('should map first-party cookies to request cookies', () => {
      expect(CLIENT_TO_SERVER_VARIABLE_TYPE['1p']).toBe('r');
      expect(canAutoMigrateVariable('1p')).toBe(true);
    });
  });

  describe('Client-Only Variables', () => {
    it('should identify JavaScript variables as client-only', () => {
      expect(CLIENT_TO_SERVER_VARIABLE_TYPE['jsm']).toBe(null);
      expect(canAutoMigrateVariable('jsm')).toBe(false);
    });

    it('should identify auto-event variables as client-only', () => {
      expect(CLIENT_TO_SERVER_VARIABLE_TYPE['aev']).toBe(null);
    });

    it('should identify video variables as client-only', () => {
      expect(CLIENT_TO_SERVER_VARIABLE_TYPE['ytv']).toBe(null);
    });
  });

  describe('Container Variables', () => {
    it('should map container variables directly', () => {
      expect(CLIENT_TO_SERVER_VARIABLE_TYPE['ctid']).toBe('ctid');
      expect(CLIENT_TO_SERVER_VARIABLE_TYPE['ctv']).toBe('ctv');
      expect(CLIENT_TO_SERVER_VARIABLE_TYPE['e']).toBe('e');
      expect(CLIENT_TO_SERVER_VARIABLE_TYPE['d']).toBe('d');
    });
  });

  describe('getVariableMigrationStrategy', () => {
    it('should provide automatic migration strategy', () => {
      const strategy = getVariableMigrationStrategy('v');
      expect(strategy.canMigrate).toBe(true);
      expect(strategy.serverType).toBe('eventData');
      expect(strategy.strategy).toBe('automatic');
    });

    it('should provide manual-rewrite strategy', () => {
      const strategy = getVariableMigrationStrategy('j');
      expect(strategy.serverType).toBe('j');
      expect(strategy.recommendation).toContain('sandboxed');
    });

    it('should provide client-only strategy', () => {
      const strategy = getVariableMigrationStrategy('jsm');
      expect(strategy.canMigrate).toBe(false);
      expect(strategy.strategy).toBe('client-only');
    });
  });
});

describe('Mapping Coverage Statistics', () => {
  it('should provide comprehensive coverage statistics', () => {
    const coverage = getMappingCoverage();

    expect(coverage.tags).toBeDefined();
    expect(coverage.tags.total).toBeGreaterThan(20); // We have 25+ tag types
    expect(coverage.tags.automatic).toBeGreaterThan(5);

    expect(coverage.triggers).toBeDefined();
    expect(coverage.triggers.total).toBeGreaterThan(15);

    expect(coverage.variables).toBeDefined();
    expect(coverage.variables.total).toBeGreaterThan(15); // We have 20+ variable types

    expect(coverage.summary).toBeDefined();
    expect(coverage.summary.totalMappings).toBeGreaterThan(50); // Total across all categories
  });

  it('should have automatic migrations available', () => {
    const coverage = getMappingCoverage();
    expect(coverage.summary.automaticMigrations).toBeGreaterThan(20);
  });

  it('should categorize manual work requirements', () => {
    const coverage = getMappingCoverage();
    expect(coverage.summary.requiresManualWork).toBeGreaterThan(0);
    expect(coverage.tags.templateRequired).toBeGreaterThan(0);
    expect(coverage.tags.manualOnly).toBeGreaterThan(0);
  });
});

describe('Edge Cases', () => {
  it('should handle unknown tag types gracefully', () => {
    const recommendation = getMigrationRecommendation('totally_unknown_type_12345');
    expect(recommendation.canMigrate).toBe(false);
    expect(recommendation.complexity).toBe('unknown');
  });

  it('should handle unknown trigger types gracefully', () => {
    const strategy = getTriggerMigrationStrategy('unknown_trigger');
    expect(strategy.canMigrate).toBe(false);
  });

  it('should handle unknown variable types gracefully', () => {
    const strategy = getVariableMigrationStrategy('unknown_var');
    expect(strategy.canMigrate).toBe(false);
  });

  it('should handle case-sensitive type lookups', () => {
    // Some GTM types are uppercase, some lowercase
    expect(CLIENT_TO_SERVER_TRIGGER_TYPE['PAGEVIEW']).toBeDefined();
    expect(CLIENT_TO_SERVER_TRIGGER_TYPE['pageview']).toBeDefined();
    expect(CLIENT_TO_SERVER_TRIGGER_TYPE['CUSTOM_EVENT']).toBeDefined();
    expect(CLIENT_TO_SERVER_TRIGGER_TYPE['customEvent']).toBeDefined();
  });
});
