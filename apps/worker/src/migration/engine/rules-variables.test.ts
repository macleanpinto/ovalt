import { describe, it, expect } from 'vitest';
import type { CanonicalVariable } from '../types.js';
import {
  applyVariableRules,
  applyVariableRuleset,
  aggregateVariableStats
} from './rules-variables.js';

describe('Variable Migration Rules', () => {
  describe('Data Layer Variables', () => {
    it('should migrate data layer variables automatically', () => {
      const variable: CanonicalVariable = {
        variableId: 'var1',
        name: 'User ID',
        type: 'v',
        parameters: { name: 'userId' },
        rawParameterKeys: ['name']
      };

      const mapping = applyVariableRules(variable);

      expect(mapping.canAutoMigrate).toBe(true);
      expect(mapping.serverVariableType).toBe('eventData');
      expect(mapping.provisional).toBe(false);
      expect(mapping.category).toBe('data-layer');
      expect(mapping.serverRecommendation).toContain('Event Data');
      expect(mapping.serverRecommendation).toContain('userId');
    });
  });

  describe('Constants', () => {
    it('should migrate constant variables automatically', () => {
      const variable: CanonicalVariable = {
        variableId: 'var2',
        name: 'Measurement ID',
        type: 'c',
        parameters: { value: 'G-ABC123' },
        rawParameterKeys: ['value']
      };

      const mapping = applyVariableRules(variable);

      expect(mapping.canAutoMigrate).toBe(true);
      expect(mapping.serverVariableType).toBe('c');
      expect(mapping.provisional).toBe(false);
      expect(mapping.category).toBe('constant');
      expect(mapping.serverRecommendation).toContain('G-ABC123');
    });
  });

  describe('Cookies', () => {
    it('should migrate first-party cookie variables', () => {
      const variable: CanonicalVariable = {
        variableId: 'var3',
        name: 'Session Cookie',
        type: '1p',
        parameters: { name: '_ga' },
        rawParameterKeys: ['name']
      };

      const mapping = applyVariableRules(variable);

      expect(mapping.canAutoMigrate).toBe(true);
      expect(mapping.serverVariableType).toBe('r');
      expect(mapping.provisional).toBe(false);
      expect(mapping.category).toBe('cookie');
      expect(mapping.serverRecommendation).toContain('_ga');
    });
  });

  describe('Lookup Tables', () => {
    it('should migrate lookup table variables automatically', () => {
      const variable: CanonicalVariable = {
        variableId: 'var4',
        name: 'Event Name Lookup',
        type: 'smm',
        parameters: {},
        rawParameterKeys: []
      };

      const mapping = applyVariableRules(variable);
      expect(mapping.canAutoMigrate).toBe(true);
      expect(mapping.provisional).toBe(false);
    });
  });

  describe('Client-Only Variables', () => {
    it('should identify JavaScript variables as client-only', () => {
      const variable: CanonicalVariable = {
        variableId: 'var8',
        name: 'Custom JS',
        type: 'jsm',
        parameters: {},
        rawParameterKeys: []
      };

      const mapping = applyVariableRules(variable);

      expect(mapping.canAutoMigrate).toBe(false);
      expect(mapping.serverVariableType).toBe(null);
      expect(mapping.category).toBe('client-only');
      expect(mapping.provisional).toBe(true);
      expect(mapping.manualActions[0]).toContain('CRITICAL');
    });

    it('should identify auto-event variables as client-only', () => {
      const variable: CanonicalVariable = {
        variableId: 'var9',
        name: 'Click Text',
        type: 'aev',
        parameters: {},
        rawParameterKeys: []
      };

      const mapping = applyVariableRules(variable);
      expect(mapping.canAutoMigrate).toBe(false);
      expect(mapping.category).toBe('client-only');
      expect(mapping.manualActions.some(a => a.includes('CRITICAL'))).toBe(true);
    });
  });

  describe('Manual Rewrite Required', () => {
    it('should flag custom JavaScript variables for manual rewrite', () => {
      const variable: CanonicalVariable = {
        variableId: 'var10',
        name: 'Custom Logic',
        type: 'j',
        parameters: {},
        rawParameterKeys: []
      };

      const mapping = applyVariableRules(variable);
      expect(mapping.serverVariableType).toBe('j');
      expect(mapping.provisional).toBe(true);
      expect(mapping.manualActions.some(a => a.includes('sandboxed'))).toBe(true);
    });

    it('should flag URL variables for manual configuration', () => {
      const variable: CanonicalVariable = {
        variableId: 'var11',
        name: 'Page URL',
        type: 'u',
        parameters: {},
        rawParameterKeys: []
      };

      const mapping = applyVariableRules(variable);
      expect(mapping.provisional).toBe(true);
      expect(mapping.manualActions.some(a => a.includes('page_location'))).toBe(true);
    });
  });

  describe('applyVariableRuleset', () => {
    it('should process multiple variables', () => {
      const variables: CanonicalVariable[] = [
        { variableId: 'var1', name: 'User ID', type: 'v', parameters: { name: 'userId' }, rawParameterKeys: ['name'] },
        { variableId: 'var2', name: 'Measurement ID', type: 'c', parameters: { value: 'G-ABC123' }, rawParameterKeys: ['value'] },
        { variableId: 'var3', name: 'Click Element', type: 'aev', parameters: {}, rawParameterKeys: [] }
      ];

      const mappings = applyVariableRuleset(variables);
      expect(mappings).toHaveLength(3);
      expect(mappings[0].canAutoMigrate).toBe(true);
      expect(mappings[1].canAutoMigrate).toBe(true);
      expect(mappings[2].canAutoMigrate).toBe(false);
    });
  });

  describe('aggregateVariableStats', () => {
    it('should calculate bucket counts and provisional flag', () => {
      const mappings = [
        { clientVariableId: 'var1', clientVariableName: 'User ID', clientVariableType: 'v', category: 'data-layer' as const, serverRecommendation: '', canAutoMigrate: true, serverVariableType: 'eventData', provisional: false, manualActions: [] },
        { clientVariableId: 'var2', clientVariableName: 'Measurement ID', clientVariableType: 'c', category: 'constant' as const, serverRecommendation: '', canAutoMigrate: true, serverVariableType: 'c', provisional: false, manualActions: [] },
        { clientVariableId: 'var3', clientVariableName: 'Custom JS', clientVariableType: 'j', category: 'custom' as const, serverRecommendation: '', canAutoMigrate: false, serverVariableType: 'j', provisional: true, manualActions: [] },
        { clientVariableId: 'var4', clientVariableName: 'Click Element', clientVariableType: 'aev', category: 'client-only' as const, serverRecommendation: '', canAutoMigrate: false, serverVariableType: null, provisional: true, manualActions: [] }
      ];

      const stats = aggregateVariableStats(mappings);
      expect(stats.autoMigratable).toBe(2);
      expect(stats.manualRequired).toBe(1);
      expect(stats.clientOnly).toBe(1);
      expect(stats.provisional).toBe(true);
    });

    it('should handle empty variable list', () => {
      const stats = aggregateVariableStats([]);
      expect(stats.provisional).toBe(false);
      expect(stats.autoMigratable).toBe(0);
      expect(stats.manualRequired).toBe(0);
      expect(stats.clientOnly).toBe(0);
    });
  });
});
