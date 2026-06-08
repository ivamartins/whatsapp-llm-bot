/**
 * Stub for the legacy-erp MCP server.
 *
 * In production this file would import the `@modelcontextprotocol/sdk`,
 * register the tools listed in `mcp/servers/legacy-erp.mcp.json`, and
 * proxy each tool call to the corresponding endpoint in
 * `spec/legacy-erp/openapi.yaml`.
 *
 * This stub does NOT run; it documents the shape of a real
 * implementation so anyone reading the manifest knows the contract.
 *
 *   $ node mcp/servers/legacy-erp.mcp.js
 *
 * For a working reference, see https://github.com/modelcontextprotocol/...
 */

'use strict';

const TOOL_DEFINITIONS = require('./legacy-erp.mcp.json').tools;

function toolNotImplemented() {
  return {
    content: [
      {
        type: 'text',
        text: '[legacy-erp MCP stub] this server is a template; implement tool routing against spec/legacy-erp/openapi.yaml.',
      },
    ],
    isError: true,
  };
}

async function main() {
  // Pseudo-MCP handshake: in a real server you'd use
  //   const { Server } = require('@modelcontextprotocol/sdk/server/stdio');
  //   const server = new Server({ name: 'legacy-erp', version: '1.0.0' }, { capabilities: { tools: {} } });
  //   server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFINITIONS }));
  //   server.setRequestHandler(CallToolRequestSchema, async ({ params }) => toolNotImplemented());
  //   await server.connect(new StdioServerTransport());

  for (const t of TOOL_DEFINITIONS) {
    // eslint-disable-next-line no-console
    console.error(`[legacy-erp] registered tool: ${t.name} (${t.endpoint?.method} ${t.endpoint?.path})`);
  }
  // eslint-disable-next-line no-console
  console.error('[legacy-erp] stub started — replace with real MCP server implementation.');
}

if (require.main === module) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[legacy-erp] fatal:', err);
    process.exit(1);
  });
}

module.exports = { TOOL_DEFINITIONS };
