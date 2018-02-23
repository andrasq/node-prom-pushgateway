/**
 * forkable app.createService()
 */

'use strict';

const app = require('./app');

// wait for the parent process to hand us our config then run the service
process.on('message', (msg) => {
    if (!msg || !msg.n) return;
    if (msg.n === 'createServer') {
        try {
            app.createServer(msg.m, (err, info) => {
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
console.log("AR: parent DISCONNECT");
    process.kill(0, 'SIGHUP');
})
