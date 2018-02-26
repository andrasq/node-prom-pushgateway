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
