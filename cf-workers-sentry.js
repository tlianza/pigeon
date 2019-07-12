import PigeonBackend from './pigeon-backend'
import { getCurrentHub, initAndBind, BaseClient } from '@sentry/core';
import { Request } from '@sentry/types';

export const SDK_NAME = 'cf-workers';
export const SDK_VERSION = '0.0.1';


export function init(options){
    initAndBind(PigeonClient, options);
}

/**
 * A promise that resolves when all current events have been sent.
 * If you provide a timeout and the queue takes longer to drain the promise returns false.
 *
 * @param timeout Maximum time in ms the client should wait.
 */
export function flush(timeout) {
    const client = getCurrentHub().getClient();
    if (client) {
        return client.flush(timeout);
    }
    return Promise.reject(false);
}

/**
 * A promise that resolves when all current events have been sent.
 * If you provide a timeout and the queue takes longer to drain the promise returns false.
 *
 * @param timeout Maximum time in ms the client should wait.
 */
export function close(timeout) {
    const client = getCurrentHub().getClient();
    if (client) {
        return client.close(timeout);
    }
    return Promise.reject(false);
}

class PigeonClient extends BaseClient {
    constructor(options) {
        super(PigeonBackend, {...options, transportOptions:{sdk_name:SDK_NAME, sdk_version:SDK_VERSION, workers_event:options.event}});
    }

    /**
     * @param workersRequest
     * @return Request
     */
    static toSentryRequest(workersRequest) {
        return workersRequest && workersRequest.url ? {
            method: workersRequest.method,
            url: workersRequest.url,
            query_string: workersRequest.query,
            headers: Array.from(workersRequest.headers.entries()),
            data: workersRequest.body
        } : undefined;
    }

    /**
     * @inheritDoc
     */
    _prepareEvent(event, scope, hint) {
        event.platform = event.platform || 'cf-workers';
        event.request = PigeonClient.toSentryRequest(this._options.event.request); //request is typically passed in init for workers
        event.sdk = {
            ...event.sdk,
            name: SDK_NAME,
            packages: [
                ...((event.sdk && event.sdk.packages) || [])
            ],
            version: SDK_VERSION,
        };

        return super._prepareEvent(event, scope, hint);
    }
}

