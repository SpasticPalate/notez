#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { NotezClient } from './client.js';
import { createNotezServer } from './server.js';

// Read configuration from environment
const NOTEZ_URL = process.env.NOTEZ_URL;
const NOTEZ_API_TOKEN = process.env.NOTEZ_API_TOKEN;

if (!NOTEZ_URL) {
  console.error('Error: NOTEZ_URL environment variable is required');
  console.error('Example: NOTEZ_URL=https://notez.example.com');
  process.exit(1);
}

if (!NOTEZ_API_TOKEN) {
  console.error('Error: NOTEZ_API_TOKEN environment variable is required');
  console.error('Create a token via: curl -X POST $NOTEZ_URL/api/tokens -H "Authorization: Bearer <jwt>"');
  process.exit(1);
}

// Create client and server
const client = new NotezClient(NOTEZ_URL, NOTEZ_API_TOKEN);
const server = createNotezServer(client);

// Connect via stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Notez MCP server running on stdio');
