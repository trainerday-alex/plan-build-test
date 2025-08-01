function isValidNumber(value) {
  if (value === null || value === undefined || value === '') {
    return false;
  }
  
  const num = Number(value);
  return !isNaN(num) && isFinite(num);
}

module.exports = { isValidNumber };