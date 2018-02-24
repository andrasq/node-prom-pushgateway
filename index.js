'use strict';

module.exports = require('./lib/service');


if (process.argv[1] === __filename || process.argv[1] === __dirname) {
    // if run directly, eg `node .`, become the service
    try { var config = require('config'); }
    catch (err) { var config = { port: 9091, verbose: true } }
    module.exports.createServer(config);
}
else {
    // if loaded as part of another script, eg `require()`, just export the functions
}
