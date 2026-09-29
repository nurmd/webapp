#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { McpServer } = require('/data/data/com.termux/files/usr/lib/node_modules/@_davideast/stitch-mcp/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/mcp.js');
const { StdioServerTransport } = require('/data/data/com.termux/files/usr/lib/node_modules/@_davideast/stitch-mcp/node_modules/@modelcontextprotocol/sdk/dist/cjs/server/stdio.js');
const { z } = require('/data/data/com.termux/files/usr/lib/node_modules/@_davideast/stitch-mcp/node_modules/zod');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const STITCH_DIR = path.join(REPO_ROOT, 'public/stitch/stitch_vyapar_billing_app_redesign');
const PROJECT_ID = process.env.STITCH_PROJECT_ID || '5973526274439406288';

const server = new McpServer({
  name: 'stitch-mcp-server',
  version: '1.0.0',
});

// Tool 1: Get Project Info
server.tool(
  'stitch_get_project_info',
  'Get details of the currently linked Google Stitch project',
  {},
  async () => {
    let screenCount = 0;
    if (fs.existsSync(STITCH_DIR)) {
      const entries = fs.readdirSync(STITCH_DIR, { withFileTypes: true });
      screenCount = entries.filter((e) => e.isDirectory() && fs.existsSync(path.join(STITCH_DIR, e.name, 'code.html'))).length;
    }

    const info = {
      projectId: PROJECT_ID,
      projectName: 'Vyapar Modern Fintech Redesign',
      stitchUrl: `https://stitch.withgoogle.com/projects/${PROJECT_ID}?pli=1`,
      totalScreens: screenCount,
      localCachePath: STITCH_DIR,
      designSystem: 'Material Design 3 (Tailwind CSS with tactile fintech cards & Plus Jakarta Sans)',
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(info, null, 2) }],
    };
  }
);

// Tool 2: List All Screens
server.tool(
  'stitch_list_screens',
  'List all available UI screens in the Stitch project with their screen IDs, categories, and paths',
  {
    category: z.string().optional().describe('Optional category filter (e.g., "billing", "inventory", "parties", "banking", "settings")'),
  },
  async ({ category }) => {
    if (!fs.existsSync(STITCH_DIR)) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `Stitch directory not found at ${STITCH_DIR}` }) }],
      };
    }

    const entries = fs.readdirSync(STITCH_DIR, { withFileTypes: true });
    let screens = entries
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(STITCH_DIR, e.name, 'code.html')))
      .map((e) => {
        const id = e.name;
        let cat = 'general';
        if (id.includes('invoice') || id.includes('pos') || id.includes('sales') || id.includes('billing')) cat = 'billing';
        else if (id.includes('party') || id.includes('parties') || id.includes('supplier')) cat = 'parties';
        else if (id.includes('inventory') || id.includes('item') || id.includes('stock')) cat = 'inventory';
        else if (id.includes('purchase')) cat = 'purchases';
        else if (id.includes('payment') || id.includes('bank') || id.includes('cash')) cat = 'banking';
        else if (id.includes('report')) cat = 'reports';
        else if (id.includes('setting') || id.includes('security') || id.includes('tax') || id.includes('sync')) cat = 'settings';

        return {
          id,
          title: id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          category: cat,
          hasCodeHtml: true,
          hasScreenPng: fs.existsSync(path.join(STITCH_DIR, id, 'screen.png')),
        };
      });

    if (category) {
      const catLower = category.toLowerCase();
      screens = screens.filter((s) => s.category.includes(catLower) || s.id.includes(catLower));
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ total: screens.length, screens }, null, 2),
        },
      ],
    };
  }
);

// Tool 3: Get Screen Code
server.tool(
  'stitch_get_screen_code',
  'Get the full HTML and CSS code of a specific Stitch screen by its screen ID',
  {
    screenId: z.string().describe('The ID of the screen (e.g., "inventory_stock_simplified", "pos_billing_counter", "sales_hub")'),
  },
  async ({ screenId }) => {
    const codePath = path.join(STITCH_DIR, screenId, 'code.html');
    if (!fs.existsSync(codePath)) {
      return {
        content: [{ type: 'text', text: `Error: Screen '${screenId}' not found at ${codePath}` }],
      };
    }

    const code = fs.readFileSync(codePath, 'utf8');
    return {
      content: [
        {
          type: 'text',
          text: code,
        },
      ],
    };
  }
);

// Tool 4: Get Design Tokens
server.tool(
  'stitch_get_design_tokens',
  'Get the Material Design 3 color palette, typography tokens, and spacing rules from the Stitch project',
  {},
  async () => {
    const designMdPath = path.join(STITCH_DIR, 'vyapar_modern_fintech/DESIGN.md');
    if (fs.existsSync(designMdPath)) {
      const designContent = fs.readFileSync(designMdPath, 'utf8');
      return {
        content: [{ type: 'text', text: designContent }],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            primary: '#000000',
            secondary: '#006c49',
            surface: '#f9f9ff',
            surfaceContainer: '#e7eeff',
            surfaceContainerLowest: '#ffffff',
            error: '#ba1a1a',
            fontPrimary: 'Plus Jakarta Sans',
            fontBody: 'Inter',
          }, null, 2),
        },
      ],
    };
  }
);

// Tool 5: Search Screens
server.tool(
  'stitch_search_screens',
  'Search across all Stitch screens for specific components, keywords, or HTML patterns',
  {
    query: z.string().describe('Search keyword or component name (e.g., "barcode", "discount", "itc", "upi", "qr")'),
  },
  async ({ query }) => {
    if (!fs.existsSync(STITCH_DIR)) {
      return { content: [{ type: 'text', text: 'Stitch directory not found' }] };
    }

    const queryLower = query.toLowerCase();
    const entries = fs.readdirSync(STITCH_DIR, { withFileTypes: true });
    const matches = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const codePath = path.join(STITCH_DIR, entry.name, 'code.html');
      if (!fs.existsSync(codePath)) continue;

      const code = fs.readFileSync(codePath, 'utf8');
      if (entry.name.toLowerCase().includes(queryLower) || code.toLowerCase().includes(queryLower)) {
        matches.push({
          screenId: entry.name,
          title: entry.name.replace(/_/g, ' '),
        });
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ query, matchCount: matches.length, results: matches }, null, 2),
        },
      ],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error('Fatal Stitch MCP error:', err);
  process.exit(1);
});
