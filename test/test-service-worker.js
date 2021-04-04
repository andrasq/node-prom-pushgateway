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

var Path = require('path');
var app = require('../lib/app');

module.exports = {
    afterEach: function(done) {
        unrequire('../lib/service.js');
        process.removeAllListeners('message');
        process.removeAllListeners('disconnect');
        done();
    },

    'script should start the service and listen': function(t) {
        var message;
        var spySend = t.stubOnce(process, 'send', function(m) { message = m });
        var spyCreate = t.stubOnce(app, 'createServer', function(config, cb) { return cb(null, { port: 13337, pid: 123456 }) });

        unrequire('../lib/service-worker.js');
        require('../lib/service-worker.js');
        process.emit('message', { n: 'createServer', m: { port: 13337 } });

        setTimeout(function() {
            t.ok(spySend.called);
            t.ok(spyCreate.called);
            t.deepEqual(message, { n: 'ready', m: { pid: 123456, port: 13337 } });
            t.deepEqual(Object.keys(message.m), ['pid', 'port']);
            t.done();
        }, 20);
    },

    'script should ignore irrelevant message': function(t) {
        var message;
        var spySend = t.stub(process, 'send', function(m) { message = m });
        var spyCreate = t.stubOnce(app, 'createServer', function(config, cb) { return cb(null, { port: 13337, pid: 123456 }) });

        unrequire('../lib/service-worker.js');
        require('../lib/service-worker.js');
        process.emit('message');
        process.emit('message', {});
        process.emit('message', { n: 'some other message' });

        setTimeout(function() {
            spySend.restore();
            spyCreate.restore();
            t.ok(!spySend.called);
            t.ok(!spyCreate.called);
            t.done();
        }, 20);
    },

    'script should return createServer error': function(t) {
        var message;
        var error = new Error('createServer error');
        var spySend = t.stubOnce(process, 'send', function(m) { message = m });
        var spyCreate = t.stubOnce(app, 'createServer', function(config, cb) { return cb(error) });

        unrequire('../lib/service-worker.js');
        require('../lib/service-worker.js');
        process.emit('message', { n: 'createServer', m: { port: 13337 } });

        setTimeout(function() {
            t.deepEqual(message, { n: 'error', m: { message: error.message, stack: error.stack } });
            t.done();
        }, 20);
    },

    'script should return error if createServer throws': function(t) {
        var message;
        var error = new Error('createServer exception');
        var spySend = t.stubOnce(process, 'send', function(m) { message = m });
        var spyCreate = t.stubOnce(app, 'createServer', function(config, cb) { throw error });

        unrequire('../lib/service-worker.js');
        require('../lib/service-worker.js');
        process.emit('message', { n: 'createServer', m: { port: 13337 } });

        setTimeout(function() {
            t.deepEqual(message, { n: 'error', m: { message: error.message, stack: error.stack } });
            t.done();
        }, 20);
    },

    'script should kill self on disconnect': function(t) {
        var spyKill = t.stubOnce(process, 'kill');
        var spyCreate = t.stubOnce(app, 'createServer', function(config, cb) { return cb(null, { port: 13337, pid: 123456 }) });

        unrequire('../lib/service-worker.js');
        require('../lib/service-worker.js');

        process.emit('message', { n: 'createServer', m: { timeout: 1 } });
        process.emit('disconnect');
        setTimeout(function() {
            t.ok(spyKill.called);
            t.done();
        }, 5);
    },

    'script should delay exiting on disconnect for a little while': function(t) {
        var clock = t.mockTimers();
        t.stubOnce(app, 'createServer', function(config, cb) { return cb(null, { port: 13337, pid: 123456 }) });

        unrequire('../lib/service-worker.js');
        require('../lib/service-worker.js');

        process.emit('message', { n: 'createServer', m: { } });
        process.emit('disconnect');
        setTimeout(function() {
            // process must not have exited yet
            t.unmockTimers();
            process.emit('ignore_disconnect');
            t.done();
        }, 5000);
        clock.tick(5000);
    },
}

// from qmock:
function unrequire( moduleName ) {
    var pathname;

    // require.resolve throws with "cannot find module", work around with path.resolve
    if (moduleName[0] === '.') pathname = Path.resolve(__dirname + '/' + moduleName);
    else if (moduleName[0] === '/') pathname = Path.resolve(moduleName);
    else pathname = require.resolve(moduleName);

    var ix, mod = require.cache[pathname];
    delete require.cache[pathname];

    while (module.parent) module = module.parent;
    unlinkAll(module.children, mod);

    function unlinkAll( children, mod ) {
        var ix;
        while ((ix = children.indexOf(mod)) >= 0) {
            children.splice(ix, 1);
        }
        if (children._qmock_visited) return;
        children._qmock_visited = true;
        for (var i=0; i<children.length; i++) {
            unlinkAll(children[i].children, mod);
        }
        delete children._qmock_visited;
    }
}
