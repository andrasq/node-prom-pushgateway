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

var util = require('util');
var sprintf = require('util').format;
var Gateway = require('./gateway');

var fromBuf = eval('parseFloat(process.versions.node) > 6 ? Buffer.from : Buffer');

var appModule = module.exports = {
    createServer: createServer,

    HttpError: HttpError,
    readRequest: readRequest,
    sendResponse: sendResponse,
    processRequest: processRequest,
}


/*
to send promClient default metrics:

var promClient = require('prom-client');
promClient.collectDefaultMetrics();

res.end(promClient.register.metrics());
*/


function HttpError( code, debugMessage ) {
    Error.call(this);
    this.message = debugMessage
    this.statusCode = code;
    this.debugMessage = debugMessage;
}
util.inherits(HttpError, Error);


function createServer( config, callback ) {
    if (!config.port && !config.anyPort) throw new Error('config.port required');

    var gateway = config.gateway || new Gateway(config);
    var server = require('http').createServer(function(req, res) {
        appModule.readRequest(req, function(err, body) {
            req.body = body;
            try {
                appModule.processRequest(req, res, String(body), gateway);
            }
            catch (err) {
                appModule.sendResponse(res, err);
            }
        })
    })
    server.options = config;
    server.gateway = gateway;

    var port = config.port || 0;
    var listenTimeout = config.listenTimeout || 0;
    function onListening() {
        port = port || server.address && server.address().port;
        if (callback) callback(null, { pid: process.pid, port: port, server: server, gateway: gateway });
    }
    if (!callback) {
        // do not retry without a callback, cannot test; succeed or throw
        server.listen(port, onListening);
        return server;
    }

    function tryListen() {
        server.listen(port, onListening);
    }
    server.on('error', function(err) {
        // if unable to connect, wait up to listenTimeout ms for the socket to be available
        server.removeListener('listening', onListening);
        if (err.message.indexOf('EADDRINUSE') >= 0 && listenTimeout >= 0) {
            if (config.anyPort) {
                port = 0;
                // keep trying every other ms until success or timeout
                // node-v0.9 and under do not pause at all on setTimeout of 1 ms
                listenTimeout -= 2;
                return setTimeout(tryListen, 2);
            }
            listenTimeout -= 50;
            return setTimeout(tryListen, 50);
        }
        callback(err);
    })
    tryListen();

    return server;
}

function readRequest( req, callback ) {
    var chunks = new Array();
    // TODO: reject payload greater than some max size
    req.on('data', function(chunk) {
        chunks.push(chunk);
    })
    req.on('end', function() {
        // TODO: decode url params
        // TODO: decode path params
        // TODO: set req.body and req.params
        callback(null, chunks.length > 1 ? Buffer.concat(chunks) : chunks.length == 1 ? chunks[0] : fromBuf(""));
    })
}

function sendResponse( res, statusCode, body, headers ) {
    if (res.headersSent) return;
    if (typeof body !== 'string' && !Buffer.isBuffer(body)) body = JSON.stringify(body);
    if (statusCode instanceof Error) {
        res.writeHead(statusCode.statusCode || 500);
        res.end(statusCode.debugMessage || statusCode.message);
    } else {
        res.writeHead(statusCode, headers);
        res.end(body);
    }
}

function processRequest( req, res, body, gateway ) {
    switch (true) {
    case req.url == '/' && req.method == 'GET':
    case req.url == '/healthcheck' && req.method == 'GET':
        appModule.sendResponse(res, 200, 'OK\n');
        break;

    case req.url === '/metrics' && req.method === 'GET':
        var reportLines = gateway.reportMetrics();
        var response = reportLines.join('\n') + '\n';
        appModule.sendResponse(res, 200, response, {'Content-Type': 'text/plain'});
        break;

    case req.url === '/push' && req.method === 'POST':
        gateway.ingestMetrics(body, function(err) {
            // TODO: return error if any lines were not accepted
            appModule.sendResponse(res, 200, 'OK\n');
        })
        break;

    case req.url === '/push/stackdriver' && req.method === 'POST':
    case req.url === '/v1/custom' && req.method === 'POST':
        gateway.ingestMetricsStackdriver(body, function(err) {
            // TODO: return error if any lines were not accepted
            appModule.sendResponse(res, 200, 'Published');
        })
        break;

    // tester routes
    case req.url === '/test/exception' && req.method === 'GET':
        throw new Error('test exception');

    default:
        throw new HttpError(404, sprintf('not routed: %s %s\n', req.method, req.url));
    }
}
