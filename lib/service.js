'use strict';

const pkg = require('../package');
const child_process = require('child_process');
const Gateway = require('./gateway');


/*
 * if loaded as a module, export createServer and forkServer
 */
const serviceModule = module.exports = {
    createServer: createServer,
    forkServer: forkServer,

    _buildServerOptions: _buildServerOptions,
}


// create a server listening for /push and /metrics requests
function createServer( config, callback ) {
    const options = serviceModule._buildServerOptions(config);

    const Gateway = require('./gateway');
    if (options.verbose) Gateway.trace('%s: Starting, pid #%d.', pkg.name, process.pid);

    const server = require('./app').createServer(options, (err, info) => {
        if (options.verbose) Gateway.trace('%s: Listening on %d, pid #%d.', pkg.name, options.port, process.pid);
        if (callback) callback(err, info);
    })

    return server;
}

// fork a child process and have it become the server
function forkServer( config, callback ) {
    callback = callback || function(){};
    const options = serviceModule._buildServerOptions(config);
    try {
        var worker = child_process.fork(__dirname + '/service-worker.js');
        worker.send({ n: 'createServer', m: options });
    } catch (err) {
        return callback(err);
    }

    worker.once('message', (msg) => {
console.log("AR: child message", msg);
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
