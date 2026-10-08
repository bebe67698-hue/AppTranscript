const { test } = require('node:test');
const assert = require('node:assert/strict');
const { checkCourse } = require('../matching.js');

const pairs = [{ code: 'CS101', year: '2565', target: 'IT101 การเขียนโปรแกรมเบื้องต้น' }];
const course = { code: 'CS101', name: 'Programming', credits: 3, grade: 'C' };
test('C and all higher supported grades qualify for an exact code and year', () => {
  for (const grade of ['C', 'C+', 'B', 'B+', 'A', 'A+']) {
    assert.equal(checkCourse({ ...course, grade }, '2565', pairs).status, 'eligible');
  }
});
test('grades below C fail even with a matching pair', () => {
  for (const grade of ['D+', 'D', 'F']) assert.equal(checkCourse({ ...course, grade }, '2565', pairs).status, 'ineligible');
});
test('same code in a different curriculum year must not match', () => {
  assert.equal(checkCourse(course, '2567', pairs).status, 'unknown');
});
test('same name and credits cannot replace a missing code mapping', () => {
  assert.equal(checkCourse({ ...course, code: 'CS999' }, '2565', pairs).status, 'unknown');
});
test('unsupported grades and invalid course data are rejected before matching', () => {
  for (const grade of ['P', 'S', 'I', '', '4']) assert.throws(() => checkCourse({ ...course, grade }, '2565', pairs));
  for (const credits of [0, -1, NaN, Infinity, '']) assert.throws(() => checkCourse({ ...course, credits }, '2565', pairs));
  assert.throws(() => checkCourse({ ...course, code: '' }, '2565', pairs));
  assert.throws(() => checkCourse({ ...course, name: ' ' }, '2565', pairs));
});
test('trimmed case-insensitive codes match without fuzzy matching', () => {
  assert.equal(checkCourse({ ...course, code: ' cs101 ' }, '2565', pairs).status, 'eligible');
  assert.equal(checkCourse({ ...course, code: 'CS-101' }, '2565', pairs).status, 'unknown');
});
