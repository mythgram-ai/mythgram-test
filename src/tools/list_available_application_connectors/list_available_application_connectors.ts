import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { getConnectorSettings, listConnectorViews } from '../../connector/index.js';

export const listAvailableApplicationConnectorsSchema = z.object({}).strict();

export const listAvailableApplicationConnectorsTool: MythgramTool<
  typeof listAvailableApplicationConnectorsSchema
> = {
  name: 'list_available_application_connectors',
  description:
    'List all application connectors that are available to connect. Use this when discovering supported connectors or when you need the exact connector name before connecting an application.',
  schema: listAvailableApplicationConnectorsSchema,
  execute: async () => {
    const settings = await getConnectorSettings();
    if (!settings.configured) {
      return {
        success: false,
        configured: false,
        count: 0,
        connectors: [],
        message:
          'Composio connectors are not configured. Ask the user to add a Composio API key in Settings → Connectors.',
      };
    }
    try {
      const connectors = await listConnectorViews();
      return {
        success: true,
        configured: true,
        enabled: settings.enabled,
        count: connectors.length,
        connectors: connectors.map((c) => ({
          connector_name: c.slug,
          name: c.name,
          description: (c.description || '').slice(0, 160),
          connected: c.connected,
          status: c.status,
          tool_count: c.tool_count,
        })),
      };
    } catch (err: any) {
      return {
        success: false,
        configured: true,
        count: 0,
        connectors: [],
        message: err?.message || 'Failed to load application connectors from Composio.',
      };
    }
  },
};
