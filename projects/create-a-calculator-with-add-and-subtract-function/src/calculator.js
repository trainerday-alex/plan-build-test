const { isValidNumber } = require('./utils/validation');

function add(a, b) {
  if (!isValidNumber(a) || !isValidNumber(b)) {
    throw new Error('Invalid input: both arguments must be valid numbers');
  }
  return Number(a) + Number(b);
}

function subtract(a, b) {
  if (!isValidNumber(a) || !isValidNumber(b)) {
    throw new Error('Invalid input: both arguments must be valid numbers');
  }
  return Number(a) - Number(b);
}

module.exports = { add, subtract };