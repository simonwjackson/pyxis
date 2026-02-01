/**
 * Babel Plugin for Orchestra Source Location Injection
 *
 * Adds data-source="file:line:column" attributes to JSX elements.
 * This enables the Orchestra widget to show exact source locations
 * when users select elements on the page.
 */

import type { PluginObj, NodePath, types as t } from '@babel/core';

export type OrchestraSourcePluginOptions = {
  /** Project root directory for computing relative paths */
  root: string;
};

/**
 * Babel plugin that injects data-source attributes on JSX elements.
 *
 * Transforms:
 *   <Button onClick={...}>Click me</Button>
 *
 * Into:
 *   <Button data-source="src/components/Button.tsx:42:5" onClick={...}>Click me</Button>
 */
export default function orchestraSourceBabelPlugin(
  { types: t }: { types: typeof import('@babel/core').types },
  options: OrchestraSourcePluginOptions
): PluginObj {
  const { root } = options;

  return {
    name: 'orchestra-source',
    visitor: {
      JSXOpeningElement(path: NodePath<t.JSXOpeningElement>, state: { filename?: string }) {
        const { node } = path;
        const { loc } = node;

        // Skip if no location info
        if (!loc || !state.filename) return;

        // Skip if data-source already exists (don't override)
        const hasDataSource = node.attributes.some(
          (attr) =>
            t.isJSXAttribute(attr) &&
            t.isJSXIdentifier(attr.name) &&
            attr.name.name === 'data-source'
        );
        if (hasDataSource) return;

        // Compute relative path from project root
        let relativePath = state.filename;
        if (relativePath.startsWith(root)) {
          relativePath = relativePath.slice(root.length);
          if (relativePath.startsWith('/')) {
            relativePath = relativePath.slice(1);
          }
        }

        // Build data-source value: "path:line:column"
        const line = loc.start.line;
        const column = loc.start.column + 1; // 1-indexed for consistency with editors
        const sourceValue = `${relativePath}:${line}:${column}`;

        // Create the data-source attribute
        const dataSourceAttr = t.jsxAttribute(
          t.jsxIdentifier('data-source'),
          t.stringLiteral(sourceValue)
        );

        // Add to the beginning of attributes
        node.attributes.unshift(dataSourceAttr);
      },
    },
  };
}
