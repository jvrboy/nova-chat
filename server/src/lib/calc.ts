// A small, safe arithmetic expression evaluator. No eval(), no Function() —
// pure tokenizer + recursive-descent parser supporting + - * / % ^ () and unary minus.

type Token = { type: 'num' | 'op' | 'lparen' | 'rparen'; value: string }

function tokenize(expr: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < expr.length) {
    const ch = expr[i]
    if (/\s/.test(ch)) { i++; continue }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < expr.length && /[0-9.]/.test(expr[j])) j++
      tokens.push({ type: 'num', value: expr.slice(i, j) })
      i = j
      continue
    }
    if ('+-*/%^'.includes(ch)) { tokens.push({ type: 'op', value: ch }); i++; continue }
    if (ch === '(') { tokens.push({ type: 'lparen', value: ch }); i++; continue }
    if (ch === ')') { tokens.push({ type: 'rparen', value: ch }); i++; continue }
    throw new Error(`Unexpected character in expression: "${ch}"`)
  }
  return tokens
}

export function evaluateExpression(expr: string): number {
  if (expr.length > 200) throw new Error('Expression too long.')
  const tokens = tokenize(expr)
  let pos = 0

  const peek = () => tokens[pos]
  const consume = () => tokens[pos++]

  function parseExpression(): number {
    let value = parseTerm()
    while (peek() && peek().type === 'op' && (peek().value === '+' || peek().value === '-')) {
      const op = consume().value
      const rhs = parseTerm()
      value = op === '+' ? value + rhs : value - rhs
    }
    return value
  }

  function parseTerm(): number {
    let value = parseFactor()
    while (peek() && peek().type === 'op' && (peek().value === '*' || peek().value === '/' || peek().value === '%')) {
      const op = consume().value
      const rhs = parseFactor()
      if (op === '*') value *= rhs
      else if (op === '/') {
        if (rhs === 0) throw new Error('Division by zero.')
        value /= rhs
      } else value %= rhs
    }
    return value
  }

  function parseFactor(): number {
    let value = parseUnary()
    while (peek() && peek().type === 'op' && peek().value === '^') {
      consume()
      const rhs = parseUnary()
      value = Math.pow(value, rhs)
    }
    return value
  }

  function parseUnary(): number {
    if (peek() && peek().type === 'op' && peek().value === '-') {
      consume()
      return -parseUnary()
    }
    if (peek() && peek().type === 'op' && peek().value === '+') {
      consume()
      return parseUnary()
    }
    return parsePrimary()
  }

  function parsePrimary(): number {
    const token = peek()
    if (!token) throw new Error('Unexpected end of expression.')
    if (token.type === 'num') { consume(); return Number(token.value) }
    if (token.type === 'lparen') {
      consume()
      const value = parseExpression()
      if (!peek() || peek().type !== 'rparen') throw new Error('Missing closing parenthesis.')
      consume()
      return value
    }
    throw new Error(`Unexpected token: "${token.value}"`)
  }

  const result = parseExpression()
  if (pos !== tokens.length) throw new Error('Unexpected trailing input in expression.')
  if (!Number.isFinite(result)) throw new Error('Result is not a finite number.')
  return result
}
