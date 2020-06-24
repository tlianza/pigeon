const {BaseBackend, getCurrentHub, API} = require("@sentry/core")
const {
    addExceptionTypeValue,
    isError,
    isPlainObject,
    keysToEventMessage,
    normalizeToSize,
    SyncPromise
} = require("@sentry/utils")

const { StackFrame, Status } = require("@sentry/types")
const stacktrace = require('stack-trace')


// Use fetch in dev, not required in prod where workers provides it
// const fetch = require('node-fetch');

class PigeonBackend extends BaseBackend {
    constructor(O) {
        super(O);
        this._setupTransport();
    }

    _setupTransport() {
        if (!this._options.dsn) {
            // We return the noop transport here in case there is no Dsn.
            return super._setupTransport();
        }

        const transportOptions = {
            ...this._options.transportOptions,
            dsn: this._options.dsn,
        };

        if (this._options.transport) {
            return new this._options.transport(transportOptions);
        }

        return new PigeonTransport(transportOptions);
    }

    eventFromMessage(message, level, hint) {
        const event = {
            event_id: hint && hint.event_id,
            level,
            message,
        };

        // if (this._options.attachStacktrace && hint && hint.syntheticException) {
        //     const stacktrace = _computeStackTrace(hint.syntheticException);
        //     const frames = this.prepareFramesForEvent(stacktrace.stack);
        //     event.stacktrace = {
        //         frames,
        //     };
        // }

        return new SyncPromise(resolve => {
            resolve(event);
        });
    }

    /**
     * Note - mostly based on the node backend
     * @inheritDoc
     */
    eventFromException(exception, hint) {
        let ex = exception;
        const mechanism = {
            handled: true,
            type: 'generic',
        };

        if (!isError(exception)) {
            if (isPlainObject(exception)) {
                // This will allow us to group events based on top-level keys
                // which is much better than creating new group when any key/value change
                const keys = Object.keys(exception).sort();
                const message = `Non-Error exception captured with keys: ${keysToEventMessage(keys)}`;

                getCurrentHub().configureScope(scope => {
                    scope.setExtra('__serialized__', normalizeToSize(exception));
                });

                ex = (hint && hint.syntheticException) || new Error(message);
                (ex).message = message;
            } else {
                // This handles when someone does: `throw "something awesome";`
                // We use synthesized Error here so we can extract a (rough) stack trace.
                ex = (hint && hint.syntheticException) || new Error(exception);
            }
            mechanism.synthetic = true;
        }

        return new SyncPromise((resolve, reject) =>
            this.parseError(ex, this._options)
                .then(event => {
                    addExceptionTypeValue(event, undefined, undefined, mechanism);
                    resolve({
                        ...event,
                        event_id: hint && hint.event_id,
                    });
                })
                .catch(reject),
        );
    }

    sendEvent(event) {
        return this._transport.sendEvent(event);
    }

    /**
     * From @sentry/node
     * @param error {ExtendedError}
     * @param options {NodeOptions?}
     * @return SyncPromise
     */
    parseError(error, options) {
        return new SyncPromise(resolve =>
                this.getExceptionFromError(error, options).then((exception) => {
                    resolve({
                        exception: {
                            values: [exception],
                        },
                    });
                }),
        );
    }

    /**
     * From @sentry/node, but using the non-patched stacktrace library
     * @param error {Error}
     * @returns {StackFrame[]}
     */
    extractStackFromError(error) {
        const stack = stacktrace.parse(error);
        if (!stack) {
            return [];
        }
        return stack;
    }

    /**
     * From @sentry/node
     * @param stack {StackFrame[]}
     * @returns {StackFrame[]}
     */
    prepareFramesForEvent(stack) {
        if (!stack || !stack.length) {
            return [];
        }

        let localStack = stack;
        const firstFrameFunction = localStack[0].function || '';

        if (firstFrameFunction.includes('captureMessage') || firstFrameFunction.includes('captureException')) {
            localStack = localStack.slice(1);
        }

        // The frame where the crash happened, should be the last entry in the array
        return localStack.reverse();
    }

    /**
     *
     * @param error {Error}
     * @param options
     * @return SyncPromise
     */
    getExceptionFromError(error, options) {
        const name = error.name || error.constructor.name;
        const stack = this.extractStackFromError(error);
        return new SyncPromise(resolve =>
                this.parseStack(stack, options).then(frames => {
                    const result = {
                        stacktrace: {
                            frames: this.prepareFramesForEvent(frames),
                        },
                        type: name,
                        value: error.message,
                    };
                    resolve(result);
                }),
        );
    }

    /**
     *
     * @param frame {stacktrace.StackFrame}
     * @return {string|*|string}
     */
    getFunction(frame) {
        try {
            return frame.functionName || `${frame.typeName}.${frame.methodName || '<anonymous>'}`;
        } catch (e) {
            // This seems to happen sometimes when using 'use strict',
            // stemming from `getTypeName`.
            // [TypeError: Cannot read property 'constructor' of undefined]
            return '<anonymous>';
        }
    }

    /**
     * From @sentry/node but pulled out a bunch of code related to node_modules
     *
     * @param stack {stacktrace.StackFrame[]}
     * @param options
     * @return SyncPromise
     */
    parseStack(stack, options) {
        const frames = stack.map(frame => {
            const parsedFrame = {
                colno: frame.columnNumber,
                filename: frame.fileName ? 'app:///' + frame.fileName : null,
                function: this.getFunction(frame),
                lineno: frame.lineNumber,
                platform: 'javascript'
            };
            return parsedFrame;
        });

        return SyncPromise.resolve(frames);
    }

}

/**
 * Similar to BaseTransport in @sentry/browser, but didn't want to import that whole
 * module.
 */
class PigeonTransport {

    constructor(options) {
        this.sdk_name = options.sdk_name;
        this.sdk_version = options.sdk_version;
        this.workers_event = options.workers_event;
        this.url = new API(options.dsn).getStoreEndpointWithUrlEncodedAuth();
	this.headers = options.headers || {}
    }

    //sendEvent(event: Event): Promise<Response>;
    sendEvent(event) {
        const defaultOptions = {
            body: JSON.stringify(event),
            method: 'POST',
            headers: {
                "User-Agent": `${this.sdk_name}/${this.sdk_version}`,
		...this.headers,
            }
        };

        const fetchPromise = fetch(this.url, defaultOptions).then(response => ({
                status: Status.fromHttpCode(response.status),
        }));

        this.workers_event.waitUntil(fetchPromise);
        return fetchPromise;
    }


    /**
     * Call this function to wait until all pending requests have been sent.
     * Note, in workers we don't use a buffer so this will always return a promise
     * that resolves to true.
     *
     * @param timeout Number time in ms to wait until the buffer is drained.
     */
    //close(timeout?: number): Promise<boolean>;
    close(timeout) {
        return Promise.resolve(true);
    }
}

module.exports = PigeonBackend
