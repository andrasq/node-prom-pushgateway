'use strict';

const express = require('express');
const Gateway = require('./gateway');

module.exports = {
    createServer: createServer,
}


/*
to send promClient default metrics:

const promClient = require('prom-client');
promClient.collectDefaultMetrics();

res.end(promClient.register.metrics());
*/

function createServer( config, callback ) {
    const gateway = new Gateway(config);
    const app = express();
    const server = require('http').createServer(app);
    app.set('server', server);

    // middleware to efficiently gather up the request body
    app.use((req, res, next) => {
        gateway.readRequestBody(req, (err, body) => {
            req._body = String(body);
            next();
        })
    })

    app.get('/healthcheck', (req, res, next) => {
        res.status(200);
        res.send("OK");
        next(false);
    })

    app.post('/push', (req, res, next) => {
        gateway.uploadMetrics(req._body, (err) => {
            if (!err) res.end("OK");
            next(err || false);
        })
    })

    // the expected prometheus scraper endpoint
    app.get('/metrics', (req, res, next) => {
        const reportLines = gateway.reportMetrics();
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.write(reportLines.join('\n') + '\n');
        res.end();
        next(false);
    })

    server.listen(config.server.port, () => {
        callback(null, { server: server, app: app, gateway: gateway });
    });
}
