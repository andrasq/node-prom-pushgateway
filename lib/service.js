/**
 * forkable createService() called from ../index.js
 * Accepts the service config via an IPC message, and replies once listening.
 */

'use strict';

const pkg = require('../package');
const main = require('../');
const Gateway = require('./gateway');

// how long to wait after the parent dies before exiting
const DISCONNECT_TIMEOUT = 10000;

process.on('message', (msg) => {
    if (!msg || !msg.n) return;
    if (msg.n === 'createServer') {
        try {
            main.createServer(msg.m, (err, info) => {
                if (err) return process.send({ n: 'error', m: { message: err.message, stack: err.stack } });
                // cannot return objects to parent process, only return minimal info
                process.send({ n: 'ready', m: { pid: info.pid, port: info.port } });
            })
        } catch (err) {
            process.send({ n: 'error', m: { message: err.message, stack: err.stack } });
            setTimeout(() => process.exit, 10);
        }
    }
})

process.on('disconnect', () => {
// TODO: should checkpoint stats to journal upon receipt, and exit without delay when parent dies
// This would not interfere with a restart

    Gateway.trace('%s: parent exited, pid #%d quitting in %d seconds', pkg.name, process.pid, DISCONNECT_TIMEOUT/1000);
    // if the parent process dies, exit after 12 seconds
    setTimeout(() => {
        Gateway.trace('%s: pid #%d exiting', pkg.name, process.pid);
        process.kill(0, 'SIGHUP');
    }, DISCONNECT_TIMEOUT);
})
