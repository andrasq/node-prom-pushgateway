'use strict';

const path = require('path');
const child_process = require('child_process');

const serviceScriptFilename = __dirname + '/lib/service.js';

module.exports = {
    createServer: function createServer( config, callback ) {
        const options = buildServerOptions(config);
        require('./lib/app').createServer(options, (err, info) => {
            callback(err, info);
        })
    },

    forkServer: function forkServer( config, callback ) {
        const options = buildServerOptions(config);
        var worker;
        try {
            worker = child_process.fork(serviceScriptFilename);
            worker.send({ n: 'createServer', m: options });
        } catch (err) {
            return callback(err);
        }
        worker.on('message', (msg) => {
            if (!msg || !msg.n) return;
            if (msg.n === 'error') callback(msg.m);
            if (msg.n === 'ready') callback(null, msg.m);
        })
        return worker;
    },
};


// if invoked standalone, start the service
const sourceFilename = require.resolve(__filename);
if (sourceFilename === process.argv[1] || path.dirname(sourceFilename) === process.argv[1]) {
    const pkg = require('./package');
    const config = require('config');

    const Gateway = require('./lib/gateway');
    Gateway.trace('%s: Starting.', pkg.name);

    const qerror = require('qerror');
    qerror.alert = false;
    qerror.handler = (err, callback) => {
        Gateway.trace('%s: Exiting on %s', pkg.name, err);
        callback();
    }

    module.exports.createServer(config, (err, info) => {
        Gateway.trace('%s: Listening on %d.', pkg.name, info.port);
        process.kill(0, 'SIGHUP');
    })
}

function buildServerOptions( config ) {
    const journalFilename = config.journalFilename || config.logDir && config.journalName && (config.logDir + '/' + config.journalName) || null;
    var options = {
        port: config.port || 9091,
        journalFilename: journalFilename,
        labels: config.labels || {},
    };
    return options;
}

function sendTo( target, name, message ) {
    if (target && target.send) {
        try {
            target.send({ n: name, m: message });
        } catch (err) {
        }
    }
}
