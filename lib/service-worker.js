/**
 * Copyright (C) 2018 Kinvey, Inc.
 *
 *    Licensed under the Apache License, Version 2.0 (the "License");
 *    you may not use this file except in compliance with the License.
 *    You may obtain a copy of the License at
 *
 *        http://www.apache.org/licenses/LICENSE-2.0
 *
 *    Unless required by applicable law or agreed to in writing, software
 *    distributed under the License is distributed on an "AS IS" BASIS,
 *    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *    See the License for the specific language governing permissions and
 *    limitations under the License.
 */

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
                const timer = setTimeout(() => {
                    Gateway.trace('%s: pid #%d exiting', pkg.name, process.pid);
                    process.kill(0, 'SIGHUP');
                }, timeout);
                process.on('ignore_disconnect', () => {
                    clearTimeout(timer);
                })
            })

        } catch (err) {
            process.send({ n: 'error', m: { message: err.message, stack: err.stack } });
            setTimeout(() => process.exit, 10);
        }
    }
})
