/**
 * forkable app.createService()
 */

'use strict';

const pkg = require('../package');
const app = require('./app');
const Gateway = require('./gateway');

module.exports = {
};

// if invoked directly, wait for the parent process to hand us our config and start the service
const scriptPath = require.resolve(__filename);
if (process.argv[1] === scriptPath) {

    process.on('message', (msg) => {
        if (!msg || !msg.n) return;
        if (msg.n === 'createServer') {
            try {
                app.createServer(msg.m, (err, info) => {
                    if (err) return process.send({ n: 'error', m: err });
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
}
