import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateCalculation,formatCalculation} from '../quick-calculator.js';

const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-10,`${actual} != ${expected}`);

test('arithmetic uses precedence, parentheses and left-associative division/subtraction',()=>{
  assert.equal(evaluateCalculation('2 + 3 * 4'),14);
  assert.equal(evaluateCalculation('(2 + 3) * 4'),20);
  assert.equal(evaluateCalculation('24 / 3 / 2'),4);
  assert.equal(evaluateCalculation('10 - 3 - 2'),5);
  assert.equal(evaluateCalculation('100 / (2 + 3)'),20);
});

test('decimal amounts and unary signs work with keyboard and visible math symbols',()=>{
  near(evaluateCalculation('.5 + 1.25'),1.75);
  near(evaluateCalculation('12. × 0.5 ÷ 3'),2);
  assert.equal(evaluateCalculation('−(2 + 3) × -2'),10);
  assert.equal(evaluateCalculation('2*-3 + +4'),-2);
  assert.equal(evaluateCalculation('--2'),2);
  assert.equal(evaluateCalculation('1e3 + 2E-1'),1000.2);
  assert.equal(evaluateCalculation('\t 2\n + 3 '),5);
  assert.equal(evaluateCalculation('-0'),0);
});

test('percent means postfix division by100 without changing earlier terms',()=>{
  assert.equal(evaluateCalculation('200 * 10%'),20);
  near(evaluateCalculation('200 + 10%'),200.1);
  assert.equal(evaluateCalculation('(20 + 30)% * 200'),100);
  assert.equal(evaluateCalculation('-50%'),-0.5);
});

test('incomplete expressions, unsupported notation and code are rejected without executing anything',()=>{
  for(const source of ['', ' ', '1+', '(2+3', '2+3)', '()', '1..2', '1 2', '2(3)', '2**3', '1e', 'Math.random()', 'globalThis.x=1', 'alert(1)', '1;2', 'NaN', 'Infinity']) {
    assert.throws(()=>evaluateCalculation(source),Error,source);
  }
  assert.throws(()=>evaluateCalculation(null),/Enter/);
  assert.throws(()=>evaluateCalculation(2),/Enter/);
});

test('division by zero is unavailable rather than a misleading finite result',()=>{
  for(const source of ['1/0', '1/-0', '1/(2-2)', '0/0'])assert.throws(()=>evaluateCalculation(source),/zero/);
});

test('length and recursion bounds permit normal calculations and reject oversized input',()=>{
  assert.equal(evaluateCalculation('('.repeat(20)+'1'+')'.repeat(20)),1);
  assert.throws(()=>evaluateCalculation('('.repeat(21)+'1'+')'.repeat(21)),/20 nested/);
  assert.equal(evaluateCalculation('-'.repeat(20)+'1'),1);
  assert.throws(()=>evaluateCalculation('-'.repeat(21)+'1'),/20 nested/);
  assert.throws(()=>evaluateCalculation('1'.repeat(121)),/120 characters/);
  assert.equal(evaluateCalculation('1'+' '.repeat(119)),1);
});

test('formatting keeps twelve significant digits, trims floating noise and stays compact',()=>{
  assert.equal(formatCalculation(evaluateCalculation('0.1+0.2')),'0.3');
  assert.equal(formatCalculation(1/3),'0.333333333333');
  assert.equal(formatCalculation(-0),'0');
  assert.equal(formatCalculation(1200),'1200');
  assert.equal(formatCalculation(1e12),'1e+12');
  assert.equal(formatCalculation(1.23456789012345e20),'1.23456789012e+20');
  assert.equal(formatCalculation(1e-8),'1e-8');
  assert.throws(()=>evaluateCalculation('9e999'),/too large/);
  assert.throws(()=>evaluateCalculation('1e308*2'),/too large/);
  assert.equal(evaluateCalculation(formatCalculation(1e12)),1e12);
  assert.throws(()=>formatCalculation(Infinity),/too large/);
  assert.throws(()=>formatCalculation(NaN),/too large/);
  assert.throws(()=>formatCalculation('2'),/numeric/);
});
