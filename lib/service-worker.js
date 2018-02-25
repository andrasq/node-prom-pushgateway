/**
 * forkable createService() called from ../index.js
 * Accepts the service config via an IPC message, and replies once listening.
 */

'use strict';

const pkg = require('../package');
const child_process = require('child_process');
const Gateway = require('./gateway');
const serviceModule = require('./service');


// how long to wait after the parent dies before exiting
const DISCONNECT_TIMEOUT = 10000;

// process.send not available inside the unit tests
process.send = process.send || function(){};


process.on('message', (msg) => {
    if (!msg || !msg.n) return;
    if (msg.n === 'createServer') {
        try {
            serviceModule.createServer(msg.m, (err, info) => {
                if (err) return process.send({ n: 'error', m: { message: err.message, stack: err.stack } });
                // cannot return objects to parent process, only return minimal info
                process.send({ n: 'ready', m: { pid: info.pid, port: info.port } });
            })

            process.on('disconnect', () => {
// TODO: should checkpoint stats to journal upon receipt, and exit without delay when parent dies
// This would not interfere with a restart

                const timeout = msg.m.timeout || DISCONNECT_TIMEOUT;
                Gateway.trace('%s: parent exited, pid #%d quitting in %d seconds', pkg.name, process.pid, timeout/1000);
                // if the parent process dies, exit after 12 seconds
                setTimeout(() => {
                    Gateway.trace('%s: pid #%d exiting', pkg.name, process.pid);
                    process.kill(0, 'SIGHUP');
                }, timeout);
            })

        } catch (err) {
            process.send({ n: 'error', m: { message: err.message, stack: err.stack } });
            setTimeout(() => process.exit, 10);
        }
    }
})
