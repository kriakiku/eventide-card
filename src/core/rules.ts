import type { CompiledRule, CompiledRules, Rule, RuleError, RuleResult } from './types.ts'

const FIELDS = ['icon', 'color', 'calendar'] as const

function compileOne(rule: Rule, index: number): CompiledRule | RuleError {
  const match: unknown = (rule as Partial<Rule> | null)?.match
  if (typeof match !== 'string') {
    return { index, match: String(match), message: 'match must be a string' }
  }
  try {
    const { match: _match, ...fields } = rule
    return { ...fields, pattern: new RegExp(match, 'iu') }
  } catch (error) {
    return { index, match, message: error instanceof Error ? error.message : String(error) }
  }
}

export function compileRules(rules: readonly Rule[]): CompiledRules {
  const compiled: CompiledRules = { rules: [], errors: [] }
  rules.forEach((rule, index) => {
    const result = compileOne(rule, index)
    if ('pattern' in result) compiled.rules.push(result)
    else compiled.errors.push(result)
  })
  return compiled
}

export function applyRules(compiled: CompiledRules, summary: string): RuleResult {
  const result: RuleResult = {}
  for (const rule of compiled.rules) {
    if (!rule.pattern.test(summary)) continue
    for (const field of FIELDS) {
      const value = rule[field]
      if (result[field] === undefined && typeof value === 'string' && value !== '') {
        result[field] = value
      }
    }
  }
  return result
}
