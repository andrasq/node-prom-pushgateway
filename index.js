'use strict';

const pkg = require('./package');
const config = require('config');
const Gateway = require('./lib/gateway');

const qerror = require('qerror');
qerror.handler = (err, callback) => {
    callback();
}

require('./lib/app').createServer(config, (err, info) => {
    Gateway.trace('%s: Listening on %d', pkg.name, config.server.port);
})
