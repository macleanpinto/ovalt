/**
 * GA4 Event Tag Template for GTM Server-Side
 *
 * This template sends events to Google Analytics 4 via the Measurement Protocol.
 * Based on official GA4 server-side template patterns.
 */

export const GA4_EVENT_TEMPLATE = {
  // Template metadata
  info: {
    displayName: 'Tag Relay - GA4 Event',
    description: 'Send events to Google Analytics 4 from server-side GTM',
    version: '1.0.0',
    categories: ['ANALYTICS', 'TAG_MANAGEMENT'],
    type: 'TAG'
  },

  // Template parameters (user inputs)
  containerContexts: [
    'SERVER'  // Only available in server-side containers
  ],

  // User-configurable fields
  parameters: [
    {
      name: 'measurementId',
      displayName: 'Measurement ID',
      type: 'TEXT',
      valueValidators: [{
        type: 'REGEX',
        args: ['^G-[A-Z0-9]+$']
      }],
      help: 'Your GA4 Measurement ID (e.g., G-XXXXXXXXXX)',
      isRequired: true
    },
    {
      name: 'apiSecret',
      displayName: 'API Secret',
      type: 'TEXT',
      help: 'GA4 Measurement Protocol API Secret (from GA4 Admin > Data Streams > Measurement Protocol API secrets)',
      isRequired: true
    },
    {
      name: 'eventName',
      displayName: 'Event Name',
      type: 'TEXT',
      defaultValue: '{{Event Name}}',
      help: 'Name of the event to send (e.g., page_view, purchase)',
      isRequired: true
    },
    {
      name: 'clientId',
      displayName: 'Client ID',
      type: 'TEXT',
      defaultValue: '{{Client ID}}',
      help: 'Unique client identifier',
      isRequired: true
    },
    {
      name: 'userId',
      displayName: 'User ID',
      type: 'TEXT',
      defaultValue: '{{User ID}}',
      help: 'Optional user identifier for cross-device tracking',
      isRequired: false
    },
    {
      name: 'eventParameters',
      displayName: 'Event Parameters',
      type: 'SIMPLE_TABLE',
      newRowButtonText: 'Add Parameter',
      newRowTitle: 'New Parameter',
      columns: [
        {
          name: 'name',
          displayName: 'Parameter Name',
          type: 'TEXT',
          isRequired: true
        },
        {
          name: 'value',
          displayName: 'Parameter Value',
          type: 'TEXT',
          isRequired: true
        }
      ]
    },
    {
      name: 'userProperties',
      displayName: 'User Properties',
      type: 'SIMPLE_TABLE',
      newRowButtonText: 'Add Property',
      newRowTitle: 'New Property',
      columns: [
        {
          name: 'name',
          displayName: 'Property Name',
          type: 'TEXT',
          isRequired: true
        },
        {
          name: 'value',
          displayName: 'Property Value',
          type: 'TEXT',
          isRequired: true
        }
      ]
    },
    {
      name: 'debugMode',
      displayName: 'Enable Debug Mode',
      type: 'CHECKBOX',
      defaultValue: false,
      help: 'Send events to GA4 DebugView'
    }
  ],

  // Template code (GTM Sandboxed JavaScript)
  code: `
const sendHttpRequest = require('sendHttpRequest');
const JSON = require('JSON');
const getEventData = require('getEventData');
const makeInteger = require('makeInteger');
const makeString = require('makeString');
const getTimestampMillis = require('getTimestampMillis');
const logToConsole = require('logToConsole');
const getRequestHeader = require('getRequestHeader');

// Get template data
const measurementId = data.measurementId;
const apiSecret = data.apiSecret;
const eventName = data.eventName;
const clientId = data.clientId;
const userId = data.userId;
const debugMode = data.debugMode;

// Build GA4 Measurement Protocol endpoint
const endpoint = debugMode
  ? 'https://www.google-analytics.com/debug/mp/collect'
  : 'https://www.google-analytics.com/mp/collect';

const url = endpoint + '?measurement_id=' + measurementId + '&api_secret=' + apiSecret;

// Build event parameters
const eventParams = {};
if (data.eventParameters) {
  data.eventParameters.forEach(function(param) {
    eventParams[param.name] = param.value;
  });
}

// Add automatic parameters
const eventData = getEventData();
if (eventData.page_location) {
  eventParams.page_location = eventData.page_location;
}
if (eventData.page_title) {
  eventParams.page_title = eventData.page_title;
}

// Build user properties
const userProps = {};
if (data.userProperties) {
  data.userProperties.forEach(function(prop) {
    userProps[prop.name] = { value: prop.value };
  });
}

// Get IP address for anonymization
const ipAddress = getRequestHeader('x-forwarded-for') || getRequestHeader('x-real-ip');

// Build GA4 payload
const payload = {
  client_id: clientId,
  events: [{
    name: eventName,
    params: eventParams
  }],
  timestamp_micros: getTimestampMillis() * 1000
};

// Add optional fields
if (userId) {
  payload.user_id = userId;
}

if (Object.keys(userProps).length > 0) {
  payload.user_properties = userProps;
}

// Add IP override for server-side attribution
if (ipAddress) {
  payload.user_properties = payload.user_properties || {};
  payload.user_properties.ip_override = { value: ipAddress };
}

// Send to GA4
const requestOptions = {
  headers: {
    'Content-Type': 'application/json'
  },
  method: 'POST',
  timeout: 5000
};

logToConsole('Sending GA4 event:', JSON.stringify(payload));

sendHttpRequest(url, requestOptions, JSON.stringify(payload)).then(function(response) {
  if (response.statusCode >= 200 && response.statusCode < 300) {
    logToConsole('GA4 event sent successfully');
    data.gtmOnSuccess();
  } else {
    logToConsole('GA4 event failed:', response.statusCode, response.body);
    data.gtmOnFailure();
  }
});
  `.trim(),

  // Permissions required by the template
  permissions: [
    {
      instance: {
        key: {
          publicId: 'send_http',
          versionId: '1'
        },
        param: [{
          key: 'allowedUrls',
          value: {
            type: 1,
            string: 'specific'
          }
        }, {
          key: 'urls',
          value: {
            type: 2,
            listItem: [
              { type: 1, string: 'https://www.google-analytics.com/' }
            ]
          }
        }]
      }
    },
    {
      instance: {
        key: {
          publicId: 'read_event_data',
          versionId: '1'
        },
        param: [{
          key: 'eventDataAccess',
          value: {
            type: 1,
            string: 'any'
          }
        }]
      }
    },
    {
      instance: {
        key: {
          publicId: 'read_request',
          versionId: '1'
        },
        param: [{
          key: 'headerAccess',
          value: {
            type: 1,
            string: 'any'
          }
        }]
      }
    },
    {
      instance: {
        key: {
          publicId: 'logging',
          versionId: '1'
        },
        param: [{
          key: 'environments',
          value: {
            type: 1,
            string: 'all'
          }
        }]
      }
    }
  ]
};
