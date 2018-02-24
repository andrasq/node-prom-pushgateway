/**
 * forkable createService() called from ../index.js
 * Accepts the service config via an IPC message, and replies once listening.
 */

'use strict';

const main = require('../');

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
    process.kill(0, 'SIGHUP');
})
