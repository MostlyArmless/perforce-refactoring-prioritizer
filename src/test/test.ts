// Test framework dependencies
// const should = require('chai').should();
const expect = require('chai').expect;
// const assert = require('chai').assert;
import * as chai from 'chai';
chai.use(require('chai-as-promised')); // Extension that defines the "eventually" keyword
chai.use(require('chai-string')); // Extension that provides the "string should contain" functionality

describe('Test suite', () => {
    let m_testSuiteVariable = null;

    before(() => {
        // Set up tests
        m_testSuiteVariable = 1;
    });

    it('should have the correct value', () => {
        // Test
        expect(m_testSuiteVariable).to.equal(1);
    });

    after(() => {
        // Tear down tests
        m_testSuiteVariable = null;
    });
});