/**
 * Code Analysis & Generation Tools for Nova Chat
 * Provides code review, complexity analysis, refactoring suggestions, and more
 */

export type CodeIssue = {
  line: number;
  column?: number;
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  rule?: string;
  fix?: string;
};

export type CodeMetrics = {
  linesOfCode: number;
  blankLines: number;
  commentLines: number;
  complexity: number;
  maintainabilityIndex: number;
  functions: { name: string; line: number; complexity: number; params: number }[];
  imports: string[];
  exports: string[];
};

export type RefactorSuggestion = {
  type: 'extract_function' | 'rename_variable' | 'simplify_condition' | 'reduce_nesting' | 'use_early_return' | 'split_file' | 'add_types' | 'optimize_loop' | 'error_handling' | 'dead_code';
  title: string;
  description: string;
  line?: number;
  original?: string;
  suggested?: string;
  impact: 'high' | 'medium' | 'low';
};

export type CodeExplanation = {
  summary: string;
  purpose: string;
  keyConcepts: string[];
  dependencies: string[];
  complexity: 'simple' | 'moderate' | 'complex' | 'very_complex';
  lineByLine?: { line: number; explanation: string }[];
};

/** Analyze code metrics */
export function analyzeMetrics(code: string, language: string = 'typescript'): CodeMetrics {
  const lines = code.split('\n');
  const linesOfCode = lines.length;
  const blankLines = lines.filter(l => l.trim() === '').length;
  const commentPatterns: Record<string, RegExp[]> = {
    typescript: [/\/\/.*$/, /\/\*[\s\S]*?\*\//],
    javascript: [/\/\/.*$/, /\/\*[\s\S]*?\*\//],
    python: [/#.*$/, /'''[\s\S]*?'''/, /"""[\s\S]*?"""/],
    java: [/\/\/.*$/, /\/\*[\s\S]*?\*\//],
    go: [/\/\/.*$/, /\/\*[\s\S]*?\*\//],
    rust: [/\/\/.*$/],
  };
  const patterns = commentPatterns[language] || commentPatterns.typescript;
  const commentLines = lines.filter(l => patterns.some(p => p.test(l.trim()))).length;
  // Detect functions
  const funcPatterns: Record<string, RegExp> = {
    typescript: /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/g,
    javascript: /(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(/g,
    python: /def\s+(\w+)\s*\(/g,
    java: /(?:public|private|protected)?\s*(?:static\s+)?(?:\w+\s+)+(\w+)\s*\(/g,
    go: /func\s+(?:\(\w+\s+\*?\w+\)\s+)?(\w+)\s*\(/g,
    rust: /fn\s+(\w+)\s*\(/g,
  };
  const funcPattern = funcPatterns[language] || funcPatterns.typescript;
  const functions: CodeMetrics['functions'] = [];
  let match;
  const funcRegex = new RegExp(funcPattern.source, funcPattern.flags);
  while ((match = funcRegex.exec(code)) !== null) {
    const name = match[1] || match[2];
    if (name) {
      const lineNum = code.substring(0, match.index).split('\n').length;
      const params = (match[0].match(/,/g) || []).length + 1;
      functions.push({ name, line: lineNum, complexity: 0, params });
    }
  }
  // Detect imports
  const importPatterns: Record<string, RegExp> = {
    typescript: /^import\s+.+from\s+['"]([^'"]+)['"]/gm,
    javascript: /^import\s+.+from\s+['"]([^'"]+)['"]/gm,
    python: /^(?:from\s+(\S+)\s+import|import\s+(\S+))/gm,
    java: /^import\s+(.+);/gm,
    go: /^import\s+(?:\(\n?([\s\S]*?)\n?\)|(\S+))/gm,
    rust: /^use\s+(.+);/gm,
  };
  const importPattern = importPatterns[language] || importPatterns.typescript;
  const imports: string[] = [];
  const importRegex = new RegExp(importPattern.source, importPattern.flags);
  while ((match = importRegex.exec(code)) !== null) {
    imports.push((match[1] || match[2] || match[0]).trim());
  }
  // Detect exports
  const exportRegex = /export\s+(?:default\s+)?(?:function|const|let|var|class|interface|type)\s+(\w+)/g;
  const exports: string[] = [];
  while ((match = exportRegex.exec(code)) !== null) {
    exports.push(match[1]);
  }
  // Cyclomatic complexity estimation
  const complexityKeywords = /\b(if|else|for|while|do|case|catch|\?|&&|\|\|)\b/g;
  const complexityMatches = code.match(complexityKeywords);
  const complexity = complexityMatches ? complexityMatches.length : 0;
  // Maintainability index (simplified)
  const mi = Math.max(0, Math.min(100, 171 - 5.2 * Math.log(linesOfCode) - 0.23 * complexity - 16.2 * Math.log(1 + commentLines)));
  return { linesOfCode, blankLines, commentLines, complexity, maintainabilityIndex: Math.round(mi), functions, imports, exports };
}

/** Detect common code issues */
export function detectIssues(code: string, language: string = 'typescript'): CodeIssue[] {
  const issues: CodeIssue[] = [];
  const lines = code.split('\n');
  lines.forEach((line, i) => {
    const trimmed = line.trim();
    // Console.log statements
    if (/console\.(log|debug|info|warn|error)\s*\(/.test(trimmed)) {
      issues.push({ line: i + 1, severity: 'warning', message: 'Console statement found in production code', rule: 'no-console', fix: 'Remove or replace with proper logging' });
    }
    // TODO comments
    if (/\/\/\s*TODO/i.test(trimmed) || /#\s*TODO/i.test(trimmed)) {
      issues.push({ line: i + 1, severity: 'info', message: 'TODO comment found', rule: 'todo-comment' });
    }
    // Any type usage (TypeScript)
    if (language === 'typescript' && /:\s*any\b/.test(trimmed)) {
      issues.push({ line: i + 1, severity: 'warning', message: 'Avoid using `any` type', rule: 'no-any', fix: 'Replace with a specific type' });
    }
    // Empty catch blocks
    if (/catch\s*\(\w*\)\s*\{\s*\}/.test(trimmed) || /catch\s*\{\s*\}/.test(trimmed)) {
      issues.push({ line: i + 1, severity: 'error', message: 'Empty catch block - errors are silently swallowed', rule: 'no-empty-catch', fix: 'Add error handling or re-throw' });
    }
    // Nested ternaries
    if ((trimmed.match(/\?/g) || []).length > 1) {
      issues.push({ line: i + 1, severity: 'warning', message: 'Nested ternary operator detected - reduce readability', rule: 'no-nested-ternary', fix: 'Use if/else or extract to a function' });
    }
    // Magic numbers
    if (/[^.\d](\d{2,})[^.\d,;)}\]]/.test(trimmed) && !/^(?:const|let|var)\s+\w+\s*=\s*\d/.test(trimmed) && !/\d{4}-\d{2}-\d{2}/.test(trimmed)) {
      issues.push({ line: i + 1, severity: 'hint', message: 'Magic number detected - consider extracting to a named constant', rule: 'no-magic-numbers' });
    }
    // Deep nesting
    const indent = line.match(/^\s*/)?.[0].length || 0;
    if (indent > 24) {
      issues.push({ line: i + 1, severity: 'warning', message: `Deep nesting detected (${Math.floor(indent / 2)} levels) - consider extracting`, rule: 'max-depth' });
    }
    // Long lines
    if (trimmed.length > 120) {
      issues.push({ line: i + 1, severity: 'info', message: `Line is ${trimmed.length} characters long (max 120)`, rule: 'max-line-length' });
    }
    // Unused variables (heuristic)
    if (/^(?:const|let|var)\s+(\w+)\s*=/.test(trimmed)) {
      const varMatch = trimmed.match(/^(?:const|let|var)\s+(\w+)/);
      if (varMatch) {
        const varName = varMatch[1];
        const count = code.split(varName).length - 1;
        if (count <= 1) {
          issues.push({ line: i + 1, severity: 'warning', message: `Variable '${varName}' appears to be unused`, rule: 'no-unused-vars' });
        }
      }
    }
    // == instead of ===
    if (language === 'typescript' && /[^!=]==[^=]/.test(trimmed) && !/===/.test(trimmed)) {
      issues.push({ line: i + 1, severity: 'warning', message: 'Use === instead of ==', rule: 'eqeqeq', fix: 'Replace == with ===' });
    }
  });
  return issues;
}

/** Generate refactoring suggestions */
export function suggestRefactors(code: string, language: string = 'typescript'): RefactorSuggestion[] {
  const suggestions: RefactorSuggestion[] = [];
  const lines = code.split('\n');
  const metrics = analyzeMetrics(code, language);
  // Suggest extracting long functions
  for (const func of metrics.functions) {
    if (func.complexity > 10 || func.params > 5) {
      suggestions.push({
        type: 'extract_function',
        title: `Extract '${func.name}' into smaller functions`,
        description: `This function has high complexity or too many parameters. Breaking it into smaller, focused functions will improve readability and testability.`,
        line: func.line,
        impact: 'high',
      });
    }
  }
  // Check for deeply nested code
  lines.forEach((line, i) => {
    const indent = line.match(/^\s*/)?.[0].length || 0;
    if (indent > 20) {
      suggestions.push({
        type: 'reduce_nesting',
        title: 'Reduce nesting level',
        description: `Code at line ${i + 1} is deeply nested. Consider using early returns, guard clauses, or extracting to a function.`,
        line: i + 1,
        impact: 'medium',
      });
    }
  });
  // Suggest type annotations
  if (language === 'typescript') {
    const untypedFunctions = code.match(/(?:function\s+\w+|const\s+\w+\s*=\s*(?:async\s*)?\()[^)]*\)(?!\s*:)/g);
    if (untypedFunctions) {
      suggestions.push({
        type: 'add_types',
        title: 'Add return type annotations',
        description: `${untypedFunctions.length} function(s) may be missing explicit return type annotations. Adding types improves documentation and catches errors.`,
        impact: 'medium',
      });
    }
  }
  // Check file length
  if (metrics.linesOfCode > 300) {
    suggestions.push({
      type: 'split_file',
      title: 'Consider splitting this file',
      description: `This file has ${metrics.linesOfCode} lines. Consider splitting into modules based on responsibility.`,
      impact: 'medium',
    });
  }
  // Check for missing error handling
  const tryCatchCount = (code.match(/try\s*{/g) || []).length;
  const asyncAwaitCount = (code.match(/await\s+/g) || []).length;
  if (asyncAwaitCount > 0 && tryCatchCount === 0) {
    suggestions.push({
      type: 'error_handling',
      title: 'Add error handling for async operations',
      description: `${asyncAwaitCount} await(s) found but no try/catch blocks. Unhandled promise rejections may crash the application.`,
      impact: 'high',
    });
  }
  // Simplify complex conditions
  const complexConditions = code.match(/if\s*\([^)]{100,}\)/g);
  if (complexConditions) {
    suggestions.push({
      type: 'simplify_condition',
      title: 'Simplify complex conditions',
      description: `${complexConditions.length} complex condition(s) found. Extract to well-named boolean variables or functions.`,
      impact: 'medium',
    });
  }
  return suggestions;
}

/** Convert code between languages (basic patterns) */
export type ConversionResult = {
  original: string;
  converted: string;
  fromLanguage: string;
  toLanguage: string;
  notes: string[];
};

export function convertCode(code: string, fromLang: string, toLang: string): ConversionResult {
  const notes: string[] = [];
  let converted = code;
  // JS/TS to Python
  if ((fromLang === 'typescript' || fromLang === 'javascript') && toLang === 'python') {
    converted = converted
      .replace(/\/\/\s*(.+)/g, '# $1')
      .replace(/const\s+(\w+)\s*=/g, '$1 =')
      .replace(/let\s+(\w+)\s*=/g, '$1 =')
      .replace(/function\s+(\w+)\s*\(([^)]*)\)\s*{/g, 'def $1($2):')
      .replace(/if\s*\((.+)\)\s*{/g, 'if $1:')
      .replace(/console\.log\((.+)\)/g, 'print($1)')
      .replace(/===/g, '==')
      .replace(/!==/g, '!=')
      .replace(/true/g, 'True')
      .replace(/false/g, 'False')
      .replace(/null|undefined/g, 'None')
      .replace(/\.length/g, 'len()')
      .replace(/\{\s*\}/g, 'pass')
      .replace(/\}/g, '')
      .replace(/;\s*$/gm, '');
    notes.push('Basic pattern conversion. Manual review required for production use.');
    notes.push('Type annotations, async/await, and class syntax need manual conversion.');
  }
  // Python to JS/TS
  else if (fromLang === 'python' && (toLang === 'typescript' || toLang === 'javascript')) {
    converted = converted
      .replace(/#\s*(.+)/g, '// $1')
      .replace(/def\s+(\w+)\s*\(([^)]*)\):/g, 'function $1($2) {')
      .replace(/elif\s+(.+):/g, '} else if ($1) {')
      .replace(/else:/g, '} else {')
      .replace(/if\s+(.+):/g, 'if ($1) {')
      .replace(/print\((.+)\)/g, 'console.log($1)')
      .replace(/==/g, '===')
      .replace(/!=/g, '!==')
      .replace(/True/g, 'true')
      .replace(/False/g, 'false')
      .replace(/None/g, 'null')
      .replace(/len\((\w+)\)/g, '$1.length')
      .replace(/pass/g, '{}');
    notes.push('Basic pattern conversion. Manual review required for production use.');
    notes.push('Python-specific features (decorators, generators, list comprehensions) need manual conversion.');
  }
  else {
    notes.push('Direct conversion not supported between these languages. Use LLM-assisted conversion instead.');
  }
  return { original: code, converted, fromLanguage: fromLang, toLanguage: toLang, notes };
}

/** Generate code documentation */
export function generateDocumentation(code: string, language: string = 'typescript'): string {
  const metrics = analyzeMetrics(code, language);
  const issues = detectIssues(code, language);
  let doc = `# Code Analysis Report\n\n`;
  doc += `## Metrics\n\n`;
  doc += `| Metric | Value |\n|---|---|\n`;
  doc += `| Lines of Code | ${metrics.linesOfCode} |\n`;
  doc += `| Blank Lines | ${metrics.blankLines} |\n`;
  doc += `| Comment Lines | ${metrics.commentLines} |\n`;
  doc += `| Cyclomatic Complexity | ${metrics.complexity} |\n`;
  doc += `| Maintainability Index | ${metrics.maintainabilityIndex}/100 |\n`;
  doc += `| Functions | ${metrics.functions.length} |\n`;
  doc += `| Imports | ${metrics.imports.length} |\n`;
  doc += `| Exports | ${metrics.exports.length} |\n\n`;
  if (metrics.functions.length > 0) {
    doc += `## Functions\n\n`;
    doc += `| Name | Line | Parameters |\n|---|---|---|\n`;
    for (const func of metrics.functions) {
      doc += `| \`${func.name}\` | ${func.line} | ${func.params} |\n`;
    }
    doc += '\n';
  }
  if (issues.length > 0) {
    doc += `## Issues (${issues.length})\n\n`;
    for (const issue of issues.slice(0, 20)) {
      const icon = issue.severity === 'error' ? '❌' : issue.severity === 'warning' ? '⚠️' : '💡';
      doc += `- ${icon} Line ${issue.line}: ${issue.message} (${issue.rule})\n`;
    }
    doc += '\n';
  }
  const refactors = suggestRefactors(code, language);
  if (refactors.length > 0) {
    doc += `## Refactoring Suggestions\n\n`;
    for (const r of refactors) {
      const impactIcon = r.impact === 'high' ? '🔴' : r.impact === 'medium' ? '🟡' : '🟢';
      doc += `### ${impactIcon} ${r.title}\n${r.description}\n\n`;
    }
  }
  return doc;
}

/** Generate unit test stubs */
export function generateTestStubs(code: string, language: string = 'typescript'): string {
  const metrics = analyzeMetrics(code, language);
  if (metrics.functions.length === 0) return 'No functions found to generate tests for.';
  const testFrameworks: Record<string, { import: string; assert: string; describe: string; it: string }> = {
    typescript: { import: "import { describe, it, expect } from 'vitest';", assert: 'expect', describe: 'describe', it: 'it' },
    javascript: { import: "import { describe, it, expect } from 'vitest';", assert: 'expect', describe: 'describe', it: 'it' },
    python: { import: 'import pytest', assert: 'assert', describe: 'class', it: 'def test' },
    java: { import: 'import org.junit.jupiter.api.*;', assert: 'assertEquals', describe: '@Nested', it: '@Test' },
    go: { import: 'import "testing"', assert: 'assert', describe: 'func Test', it: 't.Run' },
  };
  const fw = testFrameworks[language] || testFrameworks.typescript;
  let output = `${fw.import}\n\n`;
  for (const func of metrics.functions) {
    if (language === 'python') {
      output += `${fw.it}_{func.name}():\n    # Arrange\n    # Act\n    result = ${func.name}()\n    # Assert\n    ${fw.assert} result is not None\n\n`;
    } else if (language === 'go') {
      output += `${fw.describe}${func.name.charAt(0).toUpperCase() + func.name.slice(1)}(t *testing.T) {\n\t${fw.it}("should work correctly", func(t *testing.T) {\n\t\t// Arrange\n\t\t// Act\n\t\t// Assert\n\t\t${fw.assert}(true)\n\t})\n}\n\n`;
    } else {
      output += `${fw.describe}('${func.name}', () => {\n\t${fw.it}('should work correctly', () => {\n\t\t// Arrange\n\t\t// Act\n\t\t// Assert\n\t\t${fw.assert}(true).toBe(true);\n\t});\n\n\t${fw.it}('should handle edge cases', () => {\n\t\t// Arrange\n\t\t// Act\n\t\t// Assert\n\t\t${fw.assert}(true).toBeDefined();\n\t});\n});\n\n`;
    }
  }
  return output;
}

/** Regex helper for common code patterns */
export function regexHelper(input: string): { pattern: string; description: string; test: boolean; matches: string[] } {
  const commonPatterns: { pattern: string; description: string }[] = [
    { pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$', description: 'Email address' },
    { pattern: '^(https?:\\/\\/)?([\\da-z\\.-]+)\\.([a-z\\.]{2,6})([\\/\\w \\-]*)*\\/?$', description: 'URL' },
    { pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Date (YYYY-MM-DD)' },
    { pattern: '^\\+?[1-9]\\d{1,14}$', description: 'Phone number (E.164)' },
    { pattern: '^#[0-9a-fA-F]{3,8}$', description: 'Hex color' },
    { pattern: '^(\\d{1,3}\\.){3}\\d{1,3}$', description: 'IPv4 address' },
    { pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', description: 'UUID' },
  ];
  for (const cp of commonPatterns) {
    const regex = new RegExp(cp.pattern);
    const test = regex.test(input);
    if (test) {
      const matches = input.match(regex) || [];
      return { pattern: cp.pattern, description: cp.description, test: true, matches };
    }
  }
  return { pattern: '', description: 'No common pattern matched', test: false, matches: [] };
}