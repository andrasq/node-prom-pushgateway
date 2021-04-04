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

const net = require('net');
const events = require('events');
const child_process = require('child_process');
const app = require('../lib/app');
const serv = require('../lib/service');
const Gateway = require('../lib/gateway');

module.exports = {
    'should export expected functions': function(t) {
        t.equal(typeof serv.createServer, 'function');
        t.equal(typeof serv.forkServer, 'function');
        t.equal(typeof serv.createGateway, 'function');
        t.done();
    },

    'createServer': {
        'should listen on configured port': function(t) {
            const server = serv.createServer({ port: 13337 }, function(err, info) {
                t.ifError(err);
                t.equal(info.pid, process.pid);
                t.equal(info.port, 13337);
                // connect must not throw
                const sock = new net.Socket();
                sock.connect(13337, function() {
                    sock.end();
                    server.close(function(){
                        t.done();
                    });
                })
            })
        },

        'should createServer without a callback': function(t) {
            const spy = t.stubOnce(app, 'createServer', function(opts, cb) { cb(null, { port: opts.port, pid: 12345 }) });
            const server = serv.createServer({ port: 13338 });
            t.ok(spy.called);
            t.contains(spy.args[0][0], { port: 13338, labels: {} });
            t.done();
        },

        'should expose gateway': function(t) {
            const server = serv.createServer({ port: 13337 }, function(err) {
                t.ifError(err);
                server.close();
                t.ok(server.gateway instanceof Gateway);
                t.done();
            })
        },

        'should pass valid options to server and gateway': function(t) {
            const options = {
                port: 0,
                verbose: 10,
                journalFilename: 'TBD',
                labels: { a: 11 },
                listenTimeout: 12,
                readPromMetrics: function() { return '' },
                gateway: null,
                anyPort: true,
                maxMetricAgeMs: 12,
                omitTimestamps: 23,
            };
            const server = serv.createServer(options, function(err, info) {
                t.ifError(err);
                server.close();

                t.deepEqual(server.options, options);

                t.equal(server.gateway.journalFilename, 'TBD');
                t.equal(server.gateway.labels, 'a="11",');
                t.equal(server.gateway.maxMetricAgeMs, 12);
                t.equal(server.gateway.omitTimestamps, 23);
                t.equal(server.gateway.readPromMetrics, options.readPromMetrics);
                t.done();
            })
        },

        'should use provided gateway': function(t) {
            const gw = {};
            const server = serv.createServer({ port: 13337, gateway: gw }, function(err) {
                t.ifError(err);
                server.close();
                t.equal(server.gateway, gw);
                t.done();
            })
        },

        'should assemble and pass journalFilename': function(t) {
            const spy = t.stub(app, 'createServer', function(){});
            serv.createServer({ port: 123, journalFilename: '/logs/test-metrics.jrn' });
            serv.createServer({ port: 1234, logDir: '.', journalName: 'test-metrics.jrn' });
            t.ok(spy.called);
            spy.restore();
            t.contains(spy.args[0][0], { port: 123, journalFilename: '/logs/test-metrics.jrn' });
            t.contains(spy.args[1][0], { port: 1234, journalFilename: './test-metrics.jrn' });
            t.done();
        },

        'verbose mode should write startup message': function(t) {
            var output = "";
            t.stubOnce(app, 'createServer', function(opts, cb) { cb(null, { port: opts.port, pid: 12345 }) });
            const spy = t.stub(process.stdout, 'write', function(chunk) { output += chunk });
            const server = serv.createServer({ port: 9091, verbose: true }, function(err, info) {
                spy.restore();
                t.ifError(err);
                t.contains(output, 'Starting');
                t.contains(output, 'Listening');
                t.done();
            })
        },

        'verbose mode should write startup error': function(t) {
            var output = "";
            t.stubOnce(app, 'createServer', function(opts, cb) { cb(new Error('listen EADDRINUSE')) });
            const spy = t.stub(process.stdout, 'write', function(chunk) { output += chunk });
            const server = serv.createServer({ port: 9091, verbose: true }, function(err, info) {
                spy.restore();
                t.ok(err);
                t.contains(output, 'Starting');
                t.contains(output, 'Could not listen');
                t.done();
            })
        },
    },

    'forkServer': {
        'should fork a worker process': function(t) {
            const proc = { send: function(){}, on: function(){} };
            const spy = t.stubOnce(child_process, 'fork', function(){ return proc });
            serv.forkServer({});
            t.ok(spy.called);
            t.equal(spy.args[0][0], require.resolve('../lib/service-worker.js'));
            t.done();
        },

        'should send the worker a start message': function(t) {
            const ee = new events.EventEmitter();
            t.stubOnce(child_process, 'fork', function(){ return ee });
            const spy = t.stub(ee, 'send', function(){ ee.emit('message', { n: 'ready', m: {pid: 11111, port: 123} }) });
            serv.forkServer({ port: 123, verbose: 2 });
            t.ok(spy.called);
            t.equal(spy.args[0][0].n, 'createServer');
            t.contains(spy.args[0][0].m, { port: 123, verbose: 2 });
            t.done();
        },

        'should return child worker': function(t) {
            const proc = { send: function(){}, on: function(){} };
            t.stubOnce(child_process, 'fork', function(){ return proc });
            t.equal(serv.forkServer({}), proc);
            t.done();
        },

        'should pass worker info to callback': function(t) {
            serv.forkServer({ port: 13337, verbose: false }, function(err, info) {
                t.ifError();
                t.ok(info.pid > 0);
                t.equal(info.port, 13337);
                process.kill(info.pid);
                t.done();
            })
        },

        'errors': {
            'should throw on fork error without callback': function(t) {
                const err = new Error('fork error');
                t.stubOnce(child_process, 'fork', function(){ throw err });
                t.throws(function(){ serv.forkServer({}) }, /fork error/);
                t.done();
            },

            'should return fork error to callback': function(t) {
                const err = new Error('fork error');
                t.stubOnce(child_process, 'fork', function(){ throw err });
                serv.forkServer({}, function(err2, info) {
                    t.ok(err2);
                    t.equal(err2, err);
                    t.done();
                })
            },

            'should wait for worker ready and ignore irrelevant and duplicate messages': function(t) {
                const ee = new events.EventEmitter();
                t.stub(ee, 'send');
                setTimeout(function() { ee.emit('message') }, 5);
                setTimeout(function() { ee.emit('message', { x: 1 }) }, 10);
                setTimeout(function() { ee.emit('message', { n: 'other', m: 'other' }) }, 15);
                setTimeout(function() { ee.emit('message', { n: 'ready', m: { pid: 12345, port: 4444 } }) }, 20);
                setTimeout(function() { ee.emit('message', { n: 'ready', m: { pid: 23456, port: 5555 } }) }, 20);
                setTimeout(function() { ee.emit('message', { n: 'error', m: { worker: 'error' } }) }, 20);
                t.stubOnce(child_process, 'fork', function(){ return ee });
                serv.forkServer({}, function(err, ret) {
                    t.ifError(err);
                    t.deepEqual(ret, { pid: 12345, port: 4444 });
                    setTimeout(function(){ t.done() }, 5);
                })
            },

            'should return on worker startup error': function(t) {
                const ee = new events.EventEmitter();
                ee.send = function(m) { setTimeout(function(){ ee.emit('message', { n: 'error', m: { worker: 'error' } }) }, 10) };
                t.stubOnce(child_process, 'fork', function(){ return ee });
                serv.forkServer({}, function(err, ret) {
                    t.deepEqual(err, { worker: 'error' });
                    t.done();
                })
            },
        },
    },

    'createGateway': {
        'should create a Gateway': function(t) {
            t.ok(serv.createGateway() instanceof Gateway);
            t.done();
        },
    },
}
