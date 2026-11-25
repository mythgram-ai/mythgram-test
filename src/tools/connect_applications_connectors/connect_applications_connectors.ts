import { z } from 'zod';
import { MythgramTool } from '../types.js';
import { waitForUserInteraction } from '../interactive-store.js';
import { checkConnectorConnection, startConnectorConnection } from '../../connector/index.js';

const CONNECT_TIMEOUT_MS = 3 * 60 * 1000;

export const connectApplicationsConnectorsSchema = z
  .object({
    connector_name: z
      .string()
      .min(1)
      .describe('The exact connector name returned by list_available_application_connectors.'),
  })
  .strict();

export const connectApplicationsConnectorsTool: MythgramTool<
  typeof connectApplicationsConnectorsSchema
> = {
  name: 'connect_applications_connectors',
  description:
    'Request the user to connect an application connector. First use list_available_application_connectors if the exact connector name is not known. The user must complete the connection flow.',
  schema: connectApplicationsConnectorsSchema,
  execute: async (args, context) => {
    let link;
    try {
      link = await startConnectorConnection(args.connector_name);
    } catch (err: any) {
      return {
        success: false,
        connected: false,
        connector_name: args.connector_name,
        message: err?.message || 'Failed to start the connector connection.',
      };
    }

    try {
      await waitForUserInteraction({
        sessionId: context.sessionId,
        toolCallId: context.toolCallId || `connect_${Date.now()}`,
        activityId: context.activityId,
        kind: 'connect_connector',
        payload: {
          connector_name: link.slug,
          name: link.name,
          description: link.description,
          logo: link.logo,
          redirect_url: link.redirect_url,
          connected_account_id: link.connected_account_id,
          expires_at: link.expires_at,
          timeout_seconds: Math.round(CONNECT_TIMEOUT_MS / 1000),
        },
        signal: context.signal,
        timeoutMs: CONNECT_TIMEOUT_MS,
      });
    } catch (err: any) {
      return {
        success: false,
        connected: false,
        timed_out: /timed out/i.test(String(err?.message || '')),
        connector_name: link.slug,
        message:
          err?.message ||
          'The user did not finish connecting the application. Ask them to connect it from the Connectors page.',
      };
    }

    const status = await checkConnectorConnection(link.slug);
    if (!status.connected) {
      return {
        success: false,
        connected: false,
        connector_name: link.slug,
        status: status.status,
        message: status.error
          ? `The connection was not completed: ${status.error}`
          : 'The connection was not completed. Ask the user to retry from the Connectors page.',
      };
    }

    return {
      success: true,
      connected: true,
      connector_name: link.slug,
      name: link.name,
      tool_count: status.tool_count,
      message: `${link.name} is connected. Its ${status.tool_count} tool(s) are now available.`,
    };
  },
};
