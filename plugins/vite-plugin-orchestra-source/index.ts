/**
 * Vite Plugin for Orchestra
 *
 * Provides two features for development:
 * 1. Injects `data-source` attributes on JSX elements for source location tracking
 * 2. Injects the Orchestra widget script for in-page AI assistance
 *
 * Usage:
 *   import orchestraSource from 'vite-plugin-orchestra-source';
 *   import react from '@vitejs/plugin-react';
 *
 *   export default defineConfig({
 *     plugins: [
 *       orchestraSource(),  // Must come before react()
 *       react(),
 *     ],
 *   });
 *
 * Only active in development mode. Production builds are unaffected.
 */

import { loadEnv, type Plugin, type ResolvedConfig, type HtmlTagDescriptor } from 'vite';
import path from 'path';

export type OrchestraSourceOptions = {
  /**
   * Custom project root. Defaults to Vite's resolved root.
   */
  root?: string;

  /**
   * File extensions to process. Defaults to ['.tsx', '.jsx'].
   */
  include?: string[];

  /**
   * Patterns to exclude. Defaults to ['node_modules'].
   */
  exclude?: string[];

  /**
   * Orchestra server URL for widget injection.
   * Defaults to VITE_ORCHESTRA_URL env var, then 'http://localhost:3847'.
   */
  serverUrl?: string;

  /**
   * Disable widget injection (only inject data-source attributes).
   * Defaults to false.
   */
  disableWidget?: boolean;
};

/**
 * Vite plugin that injects data-source attributes on JSX elements.
 *
 * This plugin modifies the Babel config used by @vitejs/plugin-react
 * to include our custom Babel plugin. It only runs in development mode.
 */
export default function orchestraSource(options: OrchestraSourceOptions = {}): Plugin {
  let config: ResolvedConfig;
  let root: string;
  let serverUrl: string;

  return {
    name: 'vite-plugin-orchestra-source',
    enforce: 'pre',

    configResolved(resolvedConfig) {
      config = resolvedConfig;
      root = options.root ?? config.root;

      // Load env vars from .env files (Vite doesn't expose these to process.env automatically)
      const env = loadEnv(config.mode, config.root, 'VITE_');

      // Resolve server URL: option > env var > default
      serverUrl =
        options.serverUrl ??
        env.VITE_ORCHESTRA_URL ??
        'http://localhost:3847';

      if (config.mode !== 'production') {
        console.log(`[orchestra-source] Widget will load from: ${serverUrl}`);
      }
    },

    // Inject Orchestra widget script into HTML
    transformIndexHtml(html) {
      // Only inject in development mode
      if (config.mode === 'production') {
        return html;
      }

      // Skip if widget is disabled
      if (options.disableWidget) {
        return html;
      }

      const tags: HtmlTagDescriptor[] = [
        {
          tag: 'script',
          // Inject project root global before widget.js loads
          children: `window.__ORCHESTRA_PROJECT_ROOT__ = ${JSON.stringify(root)};`,
          injectTo: 'head',
        },
        {
          tag: 'script',
          attrs: {
            src: `${serverUrl}/widget.js`,
            defer: true,
          },
          injectTo: 'body',
        },
      ];

      return { html, tags };
    },

    // Transform hook for direct JSX processing (backup approach)
    // This runs before other plugins and can inject attributes
    transform(code, id) {
      // Only process in development
      if (config.mode === 'production') {
        return;
      }

      // Only process JSX/TSX files
      const include = options.include ?? ['.tsx', '.jsx'];
      const exclude = options.exclude ?? ['node_modules'];

      if (!include.some((ext) => id.endsWith(ext))) {
        return;
      }

      if (exclude.some((pattern) => id.includes(pattern))) {
        return;
      }

      // For JSX transform, we use a simple regex-based approach
      // that injects data-source on opening tags. This is less robust
      // than Babel but works without requiring @babel/core as a runtime dep.

      // Match JSX opening tags: <ComponentName or <div etc
      // We need to be careful not to match:
      // - Self-closing tags that already have data-source
      // - Fragment syntax <>
      // - Closing tags </

      const relativePath = path.relative(root, id);

      // Simple line-by-line processing for accurate line numbers
      const lines = code.split('\n');
      const processedLines: string[] = [];

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const line = lines[lineIdx];
        const lineNum = lineIdx + 1;

        // Find JSX opening tags on this line
        // Pattern: < followed by uppercase letter or lowercase HTML tag
        // Exclude: </, <>, <!--, expressions like < in conditions
        const tagPattern = /<([A-Z][A-Za-z0-9]*|[a-z][a-z0-9-]*)\s/g;
        let match;
        let processedLine = '';
        let lastIdx = 0;

        while ((match = tagPattern.exec(line)) !== null) {
          const tagName = match[1];

          // Skip React.Fragment - only accepts key and children props
          if (tagName === 'Fragment') {
            continue;
          }

          const tagStart = match.index;
          const afterTag = tagStart + match[0].length;

          // Check if this is a TypeScript generic, not JSX
          // Generics are preceded by identifiers/keywords like: functionName<, Type<, extends<
          // JSX is preceded by: return<, (<, {<, ><, or start of expression
          const beforeTag = line.slice(0, tagStart);
          const beforeTrimmed = beforeTag.trimEnd();

          // If preceded by an identifier character, it's likely a generic
          if (beforeTrimmed.length > 0) {
            const lastChar = beforeTrimmed[beforeTrimmed.length - 1];
            // Generics follow identifiers: func<T>, Type<T>, etc.
            // JSX follows: return <, ( <, { <, > <, = <, : <
            if (/[a-zA-Z0-9_]/.test(lastChar)) {
              continue; // Skip - this is a TypeScript generic
            }
          }

          // Also check if rest of line looks like a generic (has | or & for union/intersection)
          const restOfLine = line.slice(afterTag);
          const restTrimmed = restOfLine.trimStart();
          if (/^[|&,>]/.test(restTrimmed) || /^extends\b/.test(restTrimmed)) {
            continue; // Skip - this is a TypeScript generic type
          }

          // Check if already has data-source
          if (restTrimmed.startsWith('data-source=')) {
            continue;
          }

          // Calculate column (1-indexed)
          const column = tagStart + 2; // +1 for 1-index, +1 for after '<'

          // Build the data-source attribute
          const dataSource = `data-source="${relativePath}:${lineNum}:${column}" `;

          // Insert after the tag name and space
          processedLine += line.slice(lastIdx, afterTag) + dataSource;
          lastIdx = afterTag;
        }

        processedLine += line.slice(lastIdx);
        processedLines.push(processedLine);
      }

      const transformed = processedLines.join('\n');

      if (transformed !== code) {
        return {
          code: transformed,
          map: null, // Source maps would need proper handling for production use
        };
      }

      return;
    },
  };
}

/**
 * Get the Babel plugin configuration for use with @vitejs/plugin-react.
 *
 * Usage:
 *   import react from '@vitejs/plugin-react';
 *   import { getBabelPlugin } from 'vite-plugin-orchestra-source';
 *
 *   export default defineConfig({
 *     plugins: [
 *       react({
 *         babel: {
 *           plugins: [
 *             getBabelPlugin({ root: process.cwd() }),
 *           ],
 *         },
 *       }),
 *     ],
 *   });
 */
export function getBabelPlugin(options: { root: string }): [string, { root: string }] {
  return [
    // Path to our Babel plugin - users need to resolve this themselves
    // or use the direct import approach shown in the plugin file
    require.resolve('./babel-plugin'),
    options,
  ];
}

// Re-export the Babel plugin for direct use
export { default as babelPlugin } from './babel-plugin';
