'use strict';

const util = require('util');
const sprintf = require('util').format;
const Gateway = require('./gateway');

module.exports = {
    createServer: createServer,

    HttpError: HttpError,
    readRequest: readRequest,
    sendResponse: sendResponse,
    processRequest: processRequest,
}


/*
to send promClient default metrics:

const promClient = require('prom-client');
promClient.collectDefaultMetrics();

res.end(promClient.register.metrics());
*/

function HttpError( code, debugMessage ) {
    Error.call(this);
    this.statusCode = code;
    this.debugMessage = debugMessage;
}
util.inherits(HttpError, Error);


function createServer( config, callback ) {
    if (!config.port) throw new Error('config.port required');
    const gateway = new Gateway(config);
    const server = require('http').createServer((req, res) => {
        readRequest(req, (err, body) => {
            try {
                processRequest(req, res, String(body), gateway);
            }
            catch (err) {
                sendResponse(res, err);
            }
        })
    })

    server.listen(config.port, () => {
        callback(null, { pid: process.pid, port: config.port, server: server, gateway: gateway });
    });

    return server;
}

function readRequest( req, callback ) {
    var chunks = new Array();
    req.on('data', (chunk) => {
        chunks.push(chunk);
    })
    req.on('end', () => {
        // TODO: decode url params
        // TODO: decode path params
        // TODO: set req.body and req.params
        callback(null, chunks.length > 1 ? Buffer.concat(chunks) : chunks.length == 1 ? chunks[0] : new Buffer(""));
    })
}

function sendResponse( res, statusCode, body, headers ) {
    if (res.headersSent) return;
    if (typeof body !== 'string' && !Buffer.isBuffer(body)) body = JSON.stringify(body);
    if (statusCode instanceof Error) {
        res.writeHead(statusCode.statusCode || 500);
        res.end(statusCode.debugMessage || statusCode.message);
    } else {
        res.writeHead(statusCode, headers);
        res.end(body);
    }
}

function processRequest( req, res, body, gateway ) {
    switch (true) {
    case req.url == '/healthcheck' && req.method == 'GET':
        sendResponse(res, 200, 'OK\n');
        break;

    case req.url === '/metrics' && req.method === 'GET':
        const reportLines = gateway.reportMetrics();
        const response = reportLines.join('\n') + '\n';
        sendResponse(res, 200, response, {'Content-Type': 'text/plain'});
        break;

    case req.url === '/push' && req.method === 'POST':
        gateway.uploadMetrics(body, (err) => {
            sendResponse(res, 200, 'OK\n');
        })
        break;

    default:
        throw new HttpError(404, sprintf('not routed: %s %s\n', req.method, req.url));
    }
}
