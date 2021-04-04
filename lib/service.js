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

var Gateway = require('./gateway');


/*
 * if loaded as a module, export createServer and forkServer
 */
var serviceModule = module.exports = {
    createServer: createServer,
    forkServer: forkServer,
    createGateway: createGateway,

    _buildServerOptions: _buildServerOptions,
}


// create a server listening for /push and /metrics requests
function createServer( config, callback ) {
    var options = serviceModule._buildServerOptions(config);

    var pkg = require('../package');
    if (options.verbose) Gateway.trace('%s: Starting, pid #%d.', pkg.name, process.pid);

    var server = require('./app').createServer(options, function(err, info) {
        if (options.verbose) err
            ? Gateway.trace('%s: Could not listen, pid #%d:', pkg.name, process.pid, err.message)
            : Gateway.trace('%s: Listening on %d, pid #%d.', pkg.name, options.port, process.pid);
        if (callback) callback(err, info);
    })

    return server;
}

// fork a child process and have it become the server
function forkServer( config, callback ) {
    var child_process = require('child_process');
    var options = serviceModule._buildServerOptions(config);
    try {
        var worker = child_process.fork(__dirname + '/service-worker.js');
        worker.send({ n: 'createServer', m: options });
    } catch (err) {
        if (callback) return callback(err);
        else throw err;
    }

    var cbOnce = function(e, m) { if (callback) callback(e, m); callback = null };
    worker.on('message', function onMessage(msg) {
        if (!msg || !msg.n) return;
        if (msg.n === 'error') { _tryKill(worker.pid); cbOnce(msg.m); }
        if (msg.n === 'ready') cbOnce(null, msg.m);
    })

    return worker;
}

function createGateway( config ) {
    var options = serviceModule._buildServerOptions(config);
    return new Gateway(options);
}

function _buildServerOptions( config ) {
    config = config || {};
    var options = {
        // server options
        port: config.port,
        verbose: config.verbose,
        listenTimeout: config.listenTimeout,
        gateway: config.gateway,
        anyPort: config.anyPort,

        // gateway options
        journalFilename: config.journalFilename
            || config.logDir && config.journalName && (config.logDir + '/' + config.journalName)
            || null,
        labels: config.labels || {},
        readPromMetrics: config.readPromMetrics,
        maxMetricAgeMs: config.maxMetricAgeMs,
        omitTimestamps: config.omitTimestamps,
    };
    if (!config.port && !config.anyPort) options.port = 9091;
    return options;
}

function _tryKill( pid ) {
    // test pid, node v0.10 kills self if pid is undefined
    try { pid && process.kill(pid) }
    catch (err) { }
}
