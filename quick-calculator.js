// A small arithmetic grammar; expressions are never executed as JavaScript.
// Percent is a postfix division by 100: 200 * 10% = 20, 200 + 10% = 200.1.
const MAX_LENGTH = 120;
const MAX_DEPTH = 20;

const checked = value => {
  if (!Number.isFinite(value)) throw new Error('That result is too large.');
  return Object.is(value, -0) ? 0 : value;
};

export function evaluateCalculation(expression) {
  if (typeof expression !== 'string' || !expression.trim()) throw new Error('Enter a calculation.');
  if (expression.length > MAX_LENGTH) throw new Error('Keep the calculation within 120 characters.');
  const source = expression.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  let position = 0;
  const skip = () => { while (/\s/.test(source[position] || '') && position < source.length) position++; };
  const peek = () => { skip(); return source[position]; };
  const depthCheck = depth => { if (depth > MAX_DEPTH) throw new Error('Use no more than 20 nested brackets or signs.'); };

  function primary(depth) {
    depthCheck(depth);
    if (peek() === '(') {
      position++;
      const value = sum(depth + 1);
      if (peek() !== ')') throw new Error('Close every opening bracket.');
      position++;
      return value;
    }
    skip();
    const match = source.slice(position).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (!match) throw new Error('Use numbers, +, −, ×, ÷, %, and brackets.');
    position += match[0].length;
    return checked(Number(match[0]));
  }

  function unary(depth) {
    depthCheck(depth);
    const sign = peek();
    if (sign === '+' || sign === '-') {
      position++;
      const value = unary(depth + 1);
      return checked(sign === '-' ? -value : value);
    }
    let value = primary(depth);
    while (peek() === '%') {
      position++;
      value = checked(value / 100);
    }
    return value;
  }

  function product(depth) {
    let value = unary(depth);
    for (let operator = peek(); operator === '*' || operator === '/'; operator = peek()) {
      position++;
      const next = unary(depth);
      if (operator === '/' && next === 0) throw new Error('Cannot divide by zero.');
      value = checked(operator === '*' ? value * next : value / next);
    }
    return value;
  }

  function sum(depth) {
    let value = product(depth);
    for (let operator = peek(); operator === '+' || operator === '-'; operator = peek()) {
      position++;
      const next = product(depth);
      value = checked(operator === '+' ? value + next : value - next);
    }
    return value;
  }

  const result = sum(0);
  if (peek() !== undefined) throw new Error('Check the calculation and its brackets.');
  return checked(result);
}

export function formatCalculation(value) {
  if (typeof value !== 'number') throw new Error('Enter a numeric result.');
  const result = checked(value);
  if (result === 0) return '0';
  const rounded = Number(result.toPrecision(12));
  if (Math.abs(rounded) >= 1e12 || Math.abs(rounded) < 1e-6) {
    return rounded.toExponential(11).replace(/\.?0+e/, 'e');
  }
  return String(rounded);
}
