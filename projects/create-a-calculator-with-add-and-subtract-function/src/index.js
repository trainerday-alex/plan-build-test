const { add, subtract } = require('./calculator');

const calculator = {
  add,
  subtract
};

// CLI usage example
if (require.main === module) {
  try {
    console.log('Calculator Examples:');
    console.log(`5 + 3 = ${add(5, 3)}`);
    console.log(`10 - 4 = ${subtract(10, 4)}`);
    console.log(`7.5 + 2.3 = ${add(7.5, 2.3)}`);
    console.log(`-5 - (-3) = ${subtract(-5, -3)}`);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

module.exports = calculator;