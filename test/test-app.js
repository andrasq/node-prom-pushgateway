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

var events = require('events');
var util = require('util');
var http = require('http');
var app = require('../lib/app');

var allocBuf = eval('parseFloat(process.versions.node) > 6 ? Buffer.allocUnsafe : Buffer');
var fromBuf = eval('parseFloat(process.versions.node) > 6 ? Buffer.from : Buffer');

module.exports = {
    'app': {
        'should export createServer': function(t) {
            t.equal(typeof app.createServer, 'function');
            t.done();
        },
    },

    'HttpError': {
        'should be instanceof Error': function(t) {
            t.ok(new app.HttpError() instanceof Error);
            t.done();
        },

        'should set statusCode and debugMessage': function(t) {
            var err = new app.HttpError(404, 'zilch');
            t.equal(err.statusCode, 404);
            t.equal(err.debugMessage, 'zilch');
            t.done();
        },
    },

    'readRequest': {
        beforeEach: function(done) {
            this.req = new MockReq();
            done();
        },

        'should return empty buffer': function(t) {
            app.readRequest(this.req, function(err, body) {
                t.ok(Buffer.isBuffer(body));
                t.deepEqual(body, allocBuf(0));
                t.done();
            })
            this.req.emit('end');
        },

        'should return chunk': function(t) {
            app.readRequest(this.req, function(err, body) {
                t.deepEqual(body, fromBuf('test'));
                t.done();
            })
            this.req.emit('data', fromBuf('test'));
            this.req.emit('end');
        },

        'should combine chunks': function(t) {
            app.readRequest(this.req, function(err, body) {
                t.deepEqual(body, fromBuf('hello world.'));
                t.done();
            })
            this.req.emit('data', fromBuf('hello '));
            this.req.emit('data', fromBuf('world.'));
            this.req.end();
        },
    },

    'sendResponse': {
        beforeEach: function(done) {
            this.res = new MockRes();
            done();
        },

        'should do nothing if headers already sent': function(t) {
            this.res.headersSent = true;
            app.sendResponse(this.res, 200, 'test');
            t.equal(this.res.calls.length, 0);
            t.done();
        },

        'should set http status code and write body': function(t) {
            app.sendResponse(this.res, 200, 'body contents');
            t.equal(this.res.calls.length, 2);
            t.deepEqual(this.res.calls[0], ['writeHead', 200, undefined]);
            t.deepEqual(this.res.calls[1], ['end', 'body contents']);
            t.done();
        },

        'should send an http error response': function(t) {
            app.sendResponse(this.res, new app.HttpError(456, 'test error'));
            t.deepEqual(this.res.calls, [ ['writeHead', 456, undefined], ['end', 'test error'] ]);
            t.done();
        },

        'should send an internal error response': function(t) {
            app.sendResponse(this.res, new Error('oops'));
            t.deepEqual(this.res.calls, [ ['writeHead', 500, undefined], ['end', 'oops'] ]);
            t.done();
        }
    },

    'createServer': {
        'should require port': function(t) {
            t.throws(function(){ app.createServer({}, function(){}) }, /port required/);
            t.done();
        },

        'should http.createServer and listen on port': function(t) {
            var spy = t.stubOnce(http, 'createServer', function(onRequest) { return new MockServer(onRequest) });
            t.expect(5);
            var server = app.createServer({ port: 12345 }, function(err, info) {
                t.equal(info.port, 12345);
                t.equal(info.pid, process.pid);
            })
            t.ok(spy.called);
            t.ok(server instanceof MockServer);
            t.deepEqual(server.calls, [ ['listen', 12345] ]);
            t.done();
        },

        'should retry listen until listening': function(t) {
            var server = new MockServer();
            var startTime = Date.now();
            var spyListen = t.stub(server, 'listen', function(port, cb){
                if (Date.now() < startTime + 200) return server.emit('error', new Error('listen EADDRINUSE'));
                server.emit('listening');
                cb();
            })
            t.stubOnce(http, 'createServer', function(onRequest) { return server });
            app.createServer({ port: 13337, listenTimeout: 300 }, function(err) {
                t.ifError(err);
                t.ok(spyListen.callCount > 3);
                t.ok(Date.now() >= startTime + 200);
                t.done();
            })
        },

        'should return listen error if listen retry times out': function(t) {
            var server = new MockServer();
            server.listen = function() { server.emit('error', new Error('listen EADDRINUSE')) };
            t.stubOnce(http, 'createServer', function() { return server });
            app.createServer({ port: 13337, listenTimeout: 205 }, function(err) {
                t.ok(err);
                t.contains(err.message, 'EADDRINUSE');
                t.done();
            })
        },

        'should listen on any an available port if config.anyPort': function(t) {
            var server = app.createServer({ anyPort: true }, function(err, info) {
                server.close();
                t.ifError(err);
                t.ok(info.port > 0);
                t.ok(info.port != 13337);
                t.done();
            })
        },

        'should return error if config.anyPort finds no ports': function(t) {
            var server = new MockServer();
            server.listen = function() { server.emit('error', new Error('listen EADDRINUSE')) };
            t.stubOnce(http, 'createServer', function() { return server });
            var spy = t.spy(server, 'listen');

            var startTime = Date.now();
            app.createServer({ port: 13337, listenTimeout: 20, anyPort: true }, function(err, info) {
                var finishTime = Date.now();
                // TODO: node-v0.8 does not honor the timeout
                t.ok(finishTime >= startTime + 20);
                t.ok(err);
                t.contains(err.message, 'EADDRINUSE');
                t.equal(spy.args[0][0], 13337);
                t.equal(spy.args[1][0], 0);
                t.equal(spy.args[2][0], 0);
                t.equal(spy.args[3][0], 0);
                t.equal(spy.args[spy.args.length - 1][0], 0);
                t.done();
            })
        },

        'should throw listen error without callback if cannot listen': function(t) {
            var server = new MockServer();
            server.listen = function() { server.emit('error', new Error('listen EADDRINUSE')) };
            t.stubOnce(http, 'createServer', function(onRequest) { return server });
            t.throws(function(){ app.createServer({ port: 13337, listenTimeout: 100 }) }, /EADDRINUSE/);
            t.done();
        },

        'should call processRequest on on http request': function(t) {
            t.stubOnce(http, 'createServer', function(onRequest) { return new MockServer(onRequest) });
            var server = app.createServer({ port: 12345 });
            var spy = t.spyOnce(app, 'processRequest');
            var req = new MockReq('/healthcheck');
            var res = new MockRes();
            server.onRequest(req, res);
            req.end('test body');
            t.equal(spy.args[0][0], req);
            t.equal(spy.args[0][1], res);
            t.equal(spy.args[0][2], 'test body');
            t.equal(spy.args[0][3], server.gateway);
            t.done();
        },

        'should process requests': function(t) {
            t.stubOnce(http, 'createServer', function(onRequest) { return new MockServer(onRequest) });
            var server = app.createServer({ port: 12345 });
            var req = new MockReq('/healthcheck');
            var res = new MockRes();
            server.onRequest(req, res);
            req.end();
            t.deepEqual(res.calls[0], ['writeHead', 200, undefined]);
            t.deepEqual(res.calls[1], ['end', 'OK\n']);
            t.done();
        },

        'should process requests with the configured gateway': function(t) {
            t.stubOnce(http, 'createServer', function(onRequest) { return new MockServer(onRequest) });
            var gw = {};
            var server = app.createServer({ port: 12345, gateway: gw });
            var spy = t.spyOnce(app, 'processRequest');
            var req = new MockReq('/healthcheck');
            var res = new MockRes();
            server.onRequest(req, res);
            req.end();
            t.equal(spy.args[0][3], gw);
            t.done();
        },

        'should catch and return process exception': function(t) {
            t.stubOnce(http, 'createServer', function(onRequest) { return new MockServer(onRequest) });
            var server = app.createServer({ port: 12345 });
            var req = new MockReq('/test/exception'), res = new MockRes();
            server.onRequest(req, res);
            req.end();
            t.deepEqual(res.calls[0], ['writeHead', 500, undefined]);
            t.contains(res.calls[1][1], 'test exception');
            t.done();
        },
    },

    'processRequest': {
        beforeEach: function(done) {
            this.req = new MockReq('/');
            this.res = new MockRes();
            this.gateway = new MockGateway();
            done();
        },

        'GET /healthcheck should return 200 OK': function(t) {
            this.req.url = '/healthcheck';
            this.req.method = 'GET';
            app.processRequest(this.req, this.res, '', this.gateway);
            t.deepEqual(this.res.calls, [ ['writeHead', 200, undefined], ['end', 'OK\n'] ]);
            t.done();
        },

        'GET / should return 200 OK': function(t) {
            this.req.url = '/';
            this.req.method = 'GET';
            app.processRequest(this.req, this.res, '', this.gateway);
            t.deepEqual(this.res.calls, [ ['writeHead', 200, undefined], ['end', 'OK\n'] ]);
            t.done();
        },

        'GET /metrics should call gateway.reportMetrics': function(t) {
            this.req.url = '/metrics';
            this.req.method = 'GET';
            app.processRequest(this.req, this.res, '', this.gateway);
            t.deepEqual(this.gateway.calls, [ ['reportMetrics'] ]);
            t.done();
        },

        'POST /push should call gateway.ingestMetrics': function(t) {
            this.req.url = '/push';
            this.req.method = 'POST';
            app.processRequest(this.req, this.res, 'metric1 1\nmetric2 2\n', this.gateway);
            t.deepEqual(this.gateway.calls, [ ['ingestMetrics', 'metric1 1\nmetric2 2\n'] ]);
            t.done();
        },

        'POST /push/stackdriver should call gateway.ingestMetricsStackdriver': function(t) {
            this.req.url = '/push/stackdriver';
            this.req.method = 'POST';
            var postData = JSON.stringify({ timestamp: 2000000001, proto_version: 1, data: [ { name: 'foo', value: 1 } ] });
            app.processRequest(this.req, this.res, postData, this.gateway);
            t.deepEqual(this.gateway.calls, [ ['ingestMetricsStackdriver', postData] ]);
            t.deepEqual(this.res.calls[0], ['writeHead', 200, undefined]);
            t.deepEqual(this.res.calls[1], ['end', 'Published']);
            t.done();
        },

        'POST /v1/custom should call gateway.ingestMetricsStackdriver': function(t) {
            this.req.url = '/v1/custom';
            this.req.method = 'POST';
            var spy = t.spyOnce(this.gateway, 'ingestMetricsStackdriver');
            app.processRequest(this.req, this.res, '{body contents}', this.gateway);
            t.ok(spy.called);
            t.equal(spy.args[0][0], '{body contents}');
            t.done();
        },

        'should throw 404 HttpError if call not routed': function(t) {
            this.req.url = '/notRouted';
            var self = this;
            t.throws(function(){ app.processRequest(self.req, self.res, "body", self.gateway) }, /not routed/);
            t.throws(function(){ app.processRequest(self.req, self.res, "body", self.gateway) }, app.HttpError);
            t.done();
        },
    },
}

function MockServer( onRequest ) {
    var self = this;
    events.EventEmitter.call(this);

    this.onRequest = onRequest;
    this.calls = [];
    this.listen = function(port, cb) { self.calls.push(['listen', port]); cb(); };
}
util.inherits(MockServer, events.EventEmitter);

function MockReq( url ) {
    var self = this;
    events.EventEmitter.call(this);

    this.method = 'GET';
    this.url = url || '/';

    this.end = function(data) { if (data) self.emit('data', data); self.emit('end') };
}
util.inherits(MockReq, events.EventEmitter);

function MockRes( ) {
    var self = this;
    this.calls = [];

    this.writeHead = function(code, headers) { self.calls.push(['writeHead', code, headers]) };
    this.write = function(chunk) { self.calls.push(['write', chunk]) };
    this.end = function(body) { self.calls.push(['end', body]) };
}

function MockGateway( ) {
    var self = this;
    this.calls = [];

    this.reportMetrics = function() {
        this.calls.push(['reportMetrics']);
        return [ "metric1 1 2111111111", "metric2 2 2111111111" ];
    }
    this.ingestMetrics = function(body, cb) {
        this.calls.push(['ingestMetrics', body]);
        cb();
    }
    this.ingestMetricsStackdriver = function(body, cb) {
        this.calls.push(['ingestMetricsStackdriver', body]);
        cb();
    }
}
