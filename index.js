'use strict';

const path = require('path');
const child_process = require('child_process');

const pushGateway = module.exports = {
    createServer: createServer,
    forkServer: forkServer,
    runServer: runServer,

    _buildServerOptions: _buildServerOptions,
}


// create a server listening for /push and /metrics requests
function createServer( config, callback ) {
    const options = pushGateway._buildServerOptions(config);
    return require('./lib/app').createServer(options, (err, info) => {
        callback(err, info);
    })
}

// fork a child process listening for /push and /metrics requests
function forkServer( config, callback ) {
    const options = pushGateway._buildServerOptions(config);
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

    // TODO: restart a crashed worker

    return worker;
}

// run this process as a standalone push gateway server
function runServer( callback ) {
    const pkg = require('./package');
    const config = require('config');

    const Gateway = require('./lib/gateway');
    Gateway.trace('%s: Starting.', pkg.name);

    const server = pushGateway.createServer(config, (err, info) => {
        Gateway.trace('%s: Listening on %d.', pkg.name, info.port);
        if (callback) callback(err, info);
    })

    return server;
}

function _buildServerOptions( config ) {
    var options = {
        port: config.port || 9091,
        journalFilename: config.journalFilename
            || config.logDir && config.journalName && (config.logDir + '/' + config.journalName)
            || null,
        labels: config.labels || {},
    };
    return options;
}


const scriptPath = require.resolve(__filename);
if (process.argv[1] === scriptPath || process.argv[1] === path.dirname(scriptPath)) {
    // if loaded directly, start the service
    pushGateway.runServer();
}
else {
    // if loaded as part of another script, just export the singleton
}
