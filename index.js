'use strict';

const path = require('path');

module.exports = {
    createServer: function createServer( config, callback ) {
        const journalFilename = config.journalFilename || config.logDir && config.journalName && (config.logDir + '/' + config.journalName) || null;
        const options = {
            port: config.port || 9091,
            journalFilename: journalFilename,
            labels: config.labels || {},
        };
        require('./lib/app').createServer(options, (err, info) => {
            callback(err, info);
        })
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
    qerror.handler = (err, callback) => {
        Gateway.trace('%s: Exiting on %s', pkg.name, err);
        callback();
    }

    module.exports.createServer(config, (err, info) => {
        Gateway.trace('%s: Listening on %d.', pkg.name, info.port);
        process.kill(0, 'SIGHUP');
    })
}
