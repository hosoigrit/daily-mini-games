import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { log } from 'node:console';
import ts from 'typescript';

const sourceRoot = resolve('src');
const files = readdirSync(sourceRoot, { recursive: true })
  .filter((name) => /\.(ts|tsx)$/.test(name))
  .map((name) => join(sourceRoot, name));
const layers = {
  contracts: new Set(['contracts']),
  domain: new Set(['contracts', 'domain']),
  app: new Set(['contracts', 'domain', 'app']),
  infrastructure: new Set(['contracts', 'infrastructure']),
  presentation: new Set(['contracts', 'app', 'presentation']),
  'main.tsx': new Set(['app', 'infrastructure', 'presentation']),
};
const external = {
  'main.tsx': new Set(['react', 'react-dom/client']),
  presentation: new Set(['react']),
};
const compilerOptions = { moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext };
const graph = new Map();

function layer(path) {
  return relative(sourceRoot, path).split(sep)[0];
}

function checkImport(from, specifier) {
  const fromLayer = layer(from);
  if (!specifier.startsWith('.')) {
    if (!external[fromLayer]?.has(specifier)) throw new Error(`External import: ${relative(sourceRoot, from)} → ${specifier}`);
    return;
  }

  const target = ts.resolveModuleName(specifier, from, compilerOptions, ts.sys).resolvedModule?.resolvedFileName;
  if (!target) {
    if (fromLayer === 'presentation' && specifier.endsWith('.css')
        && existsSync(resolve(from, '..', specifier)) && layer(resolve(from, '..', specifier)) === fromLayer) return;
    throw new Error(`Unresolved import: ${relative(sourceRoot, from)} → ${specifier}`);
  }
  const targetPath = resolve(target);
  const targetRelative = relative(sourceRoot, targetPath);
  if (isAbsolute(targetRelative) || targetRelative.startsWith('..') || !layers[fromLayer]?.has(layer(targetPath))) {
    throw new Error(`Disallowed dependency: ${relative(sourceRoot, from)} → ${targetRelative}`);
  }
  graph.get(from).add(targetPath);
}

for (const file of files) {
  graph.set(file, new Set());
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.ESNext, true);
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      checkImport(file, node.moduleSpecifier.text);
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const [specifier] = node.arguments;
      if (!specifier || !ts.isStringLiteral(specifier)) throw new Error(`Non-static import: ${relative(sourceRoot, file)}`);
      checkImport(file, specifier.text);
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      checkImport(file, node.argument.literal.text);
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)
        && node.moduleReference.expression && ts.isStringLiteral(node.moduleReference.expression)) {
      checkImport(file, node.moduleReference.expression.text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}

const visited = new Set();
function visitFile(file, stack = new Set()) {
  if (stack.has(file)) throw new Error(`Circular dependency: ${[...stack, file].map((path) => relative(sourceRoot, path)).join(' → ')}`);
  if (visited.has(file)) return;
  stack.add(file);
  for (const target of graph.get(file) ?? []) visitFile(target, stack);
  stack.delete(file);
  visited.add(file);
}
for (const file of files) visitFile(file);

const approved = readFileSync('../../handoffs/game-0011/v1.0/approved_v08/interface_contracts.d.ts');
const copied = readFileSync('src/contracts/interface_contracts.d.ts');
if (!copied.equals(approved)) throw new Error('The public contract differs from the approved declaration');
log(`Architecture checks passed for ${files.length} source files. Contract declaration is byte-identical.`);
