'use strict';

const Path = require('path');
const app = require('../lib/app');

module.exports = {
    afterEach: function(done) {
        unrequire('../lib/service.js');
        process.removeAllListeners('message');
        process.removeAllListeners('disconnect');
        done();
    },

    'script should start the service and listen': function(t) {
        var message;
        const spySend = t.stubOnce(process, 'send', function(m) { message = m });
        const spyCreate = t.stubOnce(app, 'createServer', function(config, cb) { return cb(null, { port: 13337, pid: 123456 }) });

        unrequire('../lib/service.js');
        require('../lib/service.js');
        // FIXME: require.resolve('../lib/service.js') here throws "cannot find module"
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
        const spySend = t.stub(process, 'send', function(m) { message = m });
        const spyCreate = t.stubOnce(app, 'createServer', function(config, cb) { return cb(null, { port: 13337, pid: 123456 }) });

        unrequire('../lib/service.js');
        require('../lib/service.js');
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
        const error = new Error('createServer error');
        const spySend = t.stubOnce(process, 'send', function(m) { message = m });
        const spyCreate = t.stubOnce(app, 'createServer', function(config, cb) { return cb(error) });

        unrequire('../lib/service.js');
        require('../lib/service.js');
        process.emit('message', { n: 'createServer', m: { port: 13337 } });

        setTimeout(function() {
            t.deepEqual(message, { n: 'error', m: { message: error.message, stack: error.stack } });
            t.done();
        }, 20);
    },

    'script should return error if createServer throws': function(t) {
        var message;
        const error = new Error('createServer exception');
        const spySend = t.stubOnce(process, 'send', function(m) { message = m });
        const spyCreate = t.stubOnce(app, 'createServer', function(config, cb) { throw error });

        unrequire('../lib/service.js');
        require('../lib/service.js');
        process.emit('message', { n: 'createServer', m: { port: 13337 } });

        setTimeout(function() {
            t.deepEqual(message, { n: 'error', m: { message: error.message, stack: error.stack } });
            t.done();
        }, 20);
    },

    'script should kill self on disconnect': function(t) {
        const spyKill = t.stubOnce(process, 'kill');
        const spyCreate = t.stubOnce(app, 'createServer', function(config, cb) { return cb(null, { port: 13337, pid: 123456 }) });

        unrequire('../lib/service.js');
        require('../lib/service.js');

        process.emit('disconnect');
        setTimeout(function() {
            t.ok(spyKill.called);
            t.done();
        }, 5);
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
