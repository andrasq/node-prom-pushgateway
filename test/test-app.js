'use strict';

const events = require('events');
const util = require('util');
const http = require('http');
const app = require('../lib/app');

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
            const err = new app.HttpError(404, 'zilch');
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
                t.deepEqual(body, new Buffer(0));
                t.done();
            })
            this.req.emit('end');
        },

        'should return chunk': function(t) {
            app.readRequest(this.req, function(err, body) {
                t.deepEqual(body, new Buffer('test'));
                t.done();
            })
            this.req.emit('data', new Buffer('test'));
            this.req.emit('end');
        },

        'should combine chunks': function(t) {
            app.readRequest(this.req, function(err, body) {
                t.deepEqual(body, new Buffer('hello world.'));
                t.done();
            })
            this.req.emit('data', new Buffer('hello '));
            this.req.emit('data', new Buffer('world.'));
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
            const spy = t.stubOnce(http, 'createServer', function(onRequest) { return new MockServer(onRequest) });
            t.expect(5);
            const server = app.createServer({ port: 12345 }, function(err, info) {
                t.equal(info.port, 12345);
                t.equal(info.pid, process.pid);
            })
            t.ok(spy.called);
            t.ok(server instanceof MockServer);
            t.deepEqual(server.calls, [ ['listen', 12345] ]);
            t.done();
        },

        'should process requests': function(t) {
            t.stubOnce(http, 'createServer', function(onRequest) { return new MockServer(onRequest) });
            const server = app.createServer({ port: 12345 });
            var req = new MockReq('/healthcheck');
            var res = new MockRes();
            server.onRequest(req, res);
            req.end();
            t.deepEqual(res.calls[0], ['writeHead', 200, undefined]);
            t.deepEqual(res.calls[1], ['end', 'OK\n']);
            t.done();
        },

        'should catch and return process exception': function(t) {
            t.stubOnce(http, 'createServer', function(onRequest) { return new MockServer(onRequest) });
            const server = app.createServer({ port: 12345 });
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
            app.processRequest(this.req, this.res, '/healthcheck', this.gateway);
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
            const postData = JSON.stringify({ timestamp: 2000000001, proto_version: 1, data: [ { name: 'foo', value: 1 } ] });
            app.processRequest(this.req, this.res, postData, this.gateway);
            t.deepEqual(this.gateway.calls, [ ['ingestMetricsStackdriver', postData] ]);
            t.deepEqual(this.res.calls[0], ['writeHead', 200, undefined]);
            t.deepEqual(this.res.calls[1], ['end', 'Published']);
            t.done();
        },

        'POST /v1/custom should call /push/stackdriver': function(t) {
            this.req.url = '/v1/custom';
            this.req.method = 'POST';
            const spy = t.spy(app, 'processRequest');
            app.processRequest(this.req, this.res, '{}', this.gateway);
            t.equal(spy.callCount, 2);
            t.deepEqual(spy.args[0], [this.req, this.res, '{}', this.gateway]);
            t.deepEqual(spy.args[1], [this.req, this.res, '{}', this.gateway]);
            t.equal(this.req.url, '/push/stackdriver');
            t.done();
        },

        'should throw 404 HttpError if call not routed': function(t) {
            this.req.url = '/notRouted';
            const self = this;
            t.throws(function(){ app.processRequest(self.req, self.res, "body", self.gateway) }, /not routed/);
            t.throws(function(){ app.processRequest(self.req, self.res, "body", self.gateway) }, app.HttpError);
            t.done();
        },
    },
}

function MockServer( onRequest ) {
    const self = this;
    this.onRequest = onRequest;
    this.calls = [];
    this.listen = function(port, cb) { self.calls.push(['listen', port]); cb(); };
}

function MockReq( url ) {
    const self = this;

    events.EventEmitter.call(this);
    this.method = 'GET';
    this.url = url || '/';

    this.end = function(data) { if (data) self.emit('data', data); self.emit('end') };
}
util.inherits(MockReq, events.EventEmitter);

function MockRes( ) {
    const self = this;
    this.calls = [];

    this.writeHead = function(code, headers) { self.calls.push(['writeHead', code, headers]) };
    this.write = function(chunk) { self.calls.push(['write', chunk]) };
    this.end = function(body) { self.calls.push(['end', body]) };
}

function MockGateway( ) {
    const self = this;
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
