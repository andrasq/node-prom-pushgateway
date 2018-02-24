'use strict';

const path = require('path');
const child_process = require('child_process');

const pushGateway = module.exports = {
    createServer: createServer,
    forkServer: forkServer,

    _buildServerOptions: _buildServerOptions,
}


// create a server listening for /push and /metrics requests
function createServer( config, callback ) {
    const options = pushGateway._buildServerOptions(config);
    const pkg = require('./package');

    const Gateway = require('./lib/gateway');
    if (options.verbose) Gateway.trace('%s: Starting, pid #%d.', pkg.name, process.pid);

    const server = require('./lib/app').createServer(options, (err, info) => {
        if (options.verbose) Gateway.trace('%s: Listening on %d, pid #%d.', pkg.name, options.port, process.pid);
        if (callback) callback(err, info);
    })

    return server;
}

// fork a child process and have it become the server
function forkServer( config, callback ) {
    callback = callback || function(){};
    const options = pushGateway._buildServerOptions(config);
    try {
        var worker = child_process.fork(__dirname + '/lib/service.js');
        worker.send({ n: 'createServer', m: options });
    } catch (err) {
        return callback(err);
    }

    worker.once('message', (msg) => {
        if (!msg || !msg.n) return;
        if (msg.n === 'error') callback(msg.m);
        if (msg.n === 'ready') callback(null, msg.m);
    })

    // TODO: restart a crashed worker

    return worker;
}

function _buildServerOptions( config ) {
    var options = {
        port: config.port || 9091,
        journalFilename: config.journalFilename
            || config.logDir && config.journalName && (config.logDir + '/' + config.journalName)
            || null,
        labels: config.labels || {},
        verbose: config.verbose,
    };
    return options;
}


if (process.argv[1] === __filename || process.argv[1] === __dirname) {
    // if run directly eg `node .`, become the service
    const config = require('config');
    pushGateway.createServer(config);
}
else {
    // if loaded as part of another script eg `require()`, just export the functions
}
