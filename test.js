import * as Pigeon from './index.js'
import { Severity } from '@sentry/types';
var assert = require('chai').assert;

const DSN = 'https://TEST:DSN@sentry.io/VAL';

describe('init', function() {
    it('Should accept an empty DSN and consider itself disabled', function() {
        Pigeon.init('');
    });
    it('Should correctly parse a real DSN', function() {
        Pigeon.init({dsn: DSN});
    });
});

describe('captureMessage', function() {
    before(function() {
        Pigeon.init({dsn: DSN});
    });
    it('Should be able to send a test message', function() {
        let result = Pigeon.captureMessage("Test Message");
        assert.notEqual(result, null);
    });
});

describe('captureException', function() {
    before(function() {
        Pigeon.init({dsn: DSN});
    });
    it('Should be able to send a test exception', async function() {
        let result = Pigeon.captureException(new Error("TEST Error"));
        assert.notEqual(result, null);
    });
});

describe('addBreadcrumb', function() {
    before(function() {
        Pigeon.init({dsn: DSN});
    });
    it('Should be able to add a breadcrumb to the context', async function() {
        Pigeon.addBreadcrumb({
            category: 'method',
            message: 'Method "testmethod" was called',
            level: Severity.Info
        });
    });
});
