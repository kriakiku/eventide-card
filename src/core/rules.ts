import type { CompiledRule, CompiledRules, Rule, RuleError, RuleResult } from './types.ts'

const FIELDS = ['icon', 'color', 'calendar'] as const

const escapeForPattern = (value: string) => value.replaceAll(/[\\^$.*+?()[\]{}|/]/g, '\\$&')

function compileOne(rule: Rule, index: number): CompiledRule | RuleError {
  const { match: rawMatch, exact, ...fields }: Rule = rule ?? {}
  const match: unknown = rawMatch
  if (typeof exact === 'string' && exact !== '') {
    return { ...fields, pattern: new RegExp(`^${escapeForPattern(exact)}$`, 'u') }
  }
  if (typeof match !== 'string' || match === '') {
    return { index, match: String(match), message: 'match or exact must be a string' }
  }
  try {
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
    const found = rule.pattern.exec(summary)
    if (!found) continue
    for (const field of FIELDS) {
      const value = rule[field]
      if (result[field] === undefined && typeof value === 'string' && value !== '') {
        result[field] = value
      }
    }
    if (result.title === undefined && typeof rule.title === 'string' && rule.title !== '') {
      result.title = rule.title.replaceAll(
        /\$(\d)/g,
        (_, group: string) => found[Number(group)] ?? '',
      )
    }
  }
  return result
}
