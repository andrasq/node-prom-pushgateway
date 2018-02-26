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

'use strict';


/*
 * if loaded as a module, export createServer and forkServer
 */
const serviceModule = module.exports = {
    createServer: createServer,
    forkServer: forkServer,

    _buildServerOptions: _buildServerOptions,
}


// create a server listening for /push and /metrics requests
function createServer( config, callback ) {
    const options = serviceModule._buildServerOptions(config);

    const pkg = require('../package');
    const Gateway = require('./gateway');
    if (options.verbose) Gateway.trace('%s: Starting, pid #%d.', pkg.name, process.pid);

    const server = require('./app').createServer(options, (err, info) => {
        if (options.verbose) Gateway.trace('%s: Listening on %d, pid #%d.', pkg.name, options.port, process.pid);
        if (callback) callback(err, info);
    })

    return server;
}

// fork a child process and have it become the server
function forkServer( config, callback ) {
    const child_process = require('child_process');
    const options = serviceModule._buildServerOptions(config);
    try {
        var worker = child_process.fork(__dirname + '/service-worker.js');
        worker.send({ n: 'createServer', m: options });
    } catch (err) {
        if (callback) return callback(err);
        else throw err;
    }

    const cbOnce = function(e, m) { if (callback) callback(e, m); callback = null };
    worker.on('message', function onMessage(msg) {
        if (!msg || !msg.n) return;
        if (msg.n === 'error') { _tryKill(worker.pid); cbOnce(msg.m); }
        if (msg.n === 'ready') cbOnce(null, msg.m);
    })

    return worker;
}

function _buildServerOptions( config ) {
    var options = {
        port: config.port || 9091,
        journalFilename: config.journalFilename
            || config.logDir && config.journalName && (config.logDir + '/' + config.journalName)
            || null,
        labels: config.labels || {},
        verbose: config.verbose,
    };
    return options;
}

function _tryKill( pid ) {
    try { process.kill(pid) }
    catch (err) { }
}
