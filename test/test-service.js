'use strict';

const net = require('net');
const events = require('events');
const child_process = require('child_process');
const app = require('../lib/app');
const serv = require('../lib/service');

module.exports = {
    'should export expected functions': function(t) {
        t.equal(typeof serv.createServer, 'function');
        t.equal(typeof serv.forkServer, 'function');
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
}
