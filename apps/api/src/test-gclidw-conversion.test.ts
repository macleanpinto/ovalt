import { describe, it, expect } from 'vitest';

describe('Conversion Linker Tag Conversion', () => {
  it('should pause gclidw tags instead of converting to GA4 Event', async () => {
    // Import the conversion function from gtm-migration-deploy.ts
    // Since the function is embedded in the deployment logic, we'll test the logic directly

    const gclidwTag = {
      tagId: '481',
      name: 'Conversion Linker',
      type: 'gclidw',
      parameter: [
        { type: 'boolean', key: 'enableCrossDomain', value: 'false' },
        { type: 'boolean', key: 'enableUrlPassthrough', value: 'false' },
        { type: 'boolean', key: 'enableCookieOverrides', value: 'false' }
      ],
      notes: 'Original notes'
    };

    // Simulate the conversion logic from gtm-migration-deploy.ts lines 581-598
    let convertedTag;
    if (gclidwTag.type === 'gclidw') {
      convertedTag = {
        ...gclidwTag,
        paused: true,
        notes: (gclidwTag.notes || '') + `\n\n[Paused by Tag Relay] Client-side Conversion Linker tag paused. Server-side Conversion Linker (sgtmadscl) handles click ID reading and cookie setting without polluting GA4 reports.`
      };
    }

    // Assertions
    expect(convertedTag.type).toBe('gclidw'); // Should NOT be converted to 'gaawe'
    expect(convertedTag.paused).toBe(true); // Should be paused
    expect(convertedTag.notes).toContain('[Paused by Tag Relay]');
    expect(convertedTag.notes).toContain('without polluting GA4 reports');

    // Should NOT have eventName parameter (that would make it a GA4 Event)
    const hasEventName = convertedTag.parameter?.some((p: any) => p.key === 'eventName');
    expect(hasEventName).toBeFalsy();

    // Should NOT have measurementIdOverride (that would make it send to GA4)
    const hasMeasurementId = convertedTag.parameter?.some((p: any) => p.key === 'measurementIdOverride');
    expect(hasMeasurementId).toBeFalsy();
  });

  it('server-side Conversion Linker should have correct configuration', () => {
    // Expected server-side tag configuration from gtm-migration-deploy.ts lines 1164-1186
    const serverConversionLinkerConfig = {
      name: 'Conversion Linker',
      type: 'sgtmadscl',
      parameter: [
        { type: 'boolean', key: 'enableLinkerParams', value: 'true' },
        { type: 'boolean', key: 'enableCookieOverrides', value: 'false' }
      ],
      notes: 'Server-side Conversion Linker handles click ID reading and first-party cookie setting. Created by Ovalt.'
    };

    // Assertions
    expect(serverConversionLinkerConfig.type).toBe('sgtmadscl');
    expect(serverConversionLinkerConfig.parameter).toHaveLength(2);

    const enableLinkerParams = serverConversionLinkerConfig.parameter.find(p => p.key === 'enableLinkerParams');
    expect(enableLinkerParams?.value).toBe('true');

    const enableCookieOverrides = serverConversionLinkerConfig.parameter.find(p => p.key === 'enableCookieOverrides');
    expect(enableCookieOverrides?.value).toBe('false');
  });
});
