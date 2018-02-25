'use strict';

const net = require('net');
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
    },
}
