'use strict';

const path = require('path');
const child_process = require('child_process');

const pushGateway = new PushGateway();
module.exports = pushGateway;


function PushGateway( ) {
}

PushGateway.prototype.createServer = function createServer( config, callback ) {
    const options = this._buildServerOptions(config);
    require('./lib/app').createServer(options, (err, info) => {
        callback(err, info);
    })
}

PushGateway.prototype.forkServer = function forkServer( config, callback ) {
    const options = this._buildServerOptions(config);
    var worker;

    try {
        worker = child_process.fork(__dirname + '/lib/service.js');
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
}

// run this process as a standalone server
PushGateway.prototype.runServer = function runServer( callback ) {
    const pkg = require('./package');
    const config = require('config');

    const Gateway = require('./lib/gateway');
    Gateway.trace('%s: Starting.', pkg.name);

    const qerror = require('qerror');
    qerror.alert = false;
    qerror.handler = (err, callback) => {
        const stacktrace = err && !/^SIG/.test(err.message) && err.stack || '';
        Gateway.trace('%s: Exiting on %s', pkg.name, err, "\n", process.memoryUsage(), stacktrace);
        callback();
    }

    this.createServer(config, (err, info) => {
        Gateway.trace('%s: Listening on %d.', pkg.name, info.port);
        if (callback) callback(err, info);
    })
}

PushGateway.prototype._buildServerOptions = function _buildServerOptions( config ) {
    var options = {
        port: config.port || 9091,
        journalFilename: config.journalFilename
            || config.logDir && config.journalName && (config.logDir + '/' + config.journalName)
            || null,
        labels: config.labels || {},
    };
    return options;
}

PushGateway.prototype = PushGateway.prototype;


const scriptPath = require.resolve(__filename);
if (process.argv[1] === scriptPath || process.argv[1] === path.dirname(scriptPath)) {
    // if loaded directly, start the service
    pushGateway.runServer();
}
else {
    // if loaded as part of another script, just export the singleton
}
