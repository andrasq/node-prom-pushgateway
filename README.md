kinvey-prometheus-pushgateway
=============================
[![Build Status](https://api.travis-ci.org/andrasq/node-kinvey-prometheus-pushgateway.svg?branch=master)](https://travis-ci.org/andrasq/node-kinvey-prometheus-pushgateway?branch=master)
[![Coverage Status](https://codecov.io/github/andrasq/node-kinvey-prometheus-pushgateway/coverage.svg?branch=master)](https://codecov.io/github/andrasq/node-kinvey-prometheus-pushgateway?branch=master)


Embeddable aggregating Prometheus push gateway.

Accepts stats from an app and presents them to be scraped by Prometheus.  Same-named
stats are subsampled (averaged), which allows stats to be gathered more frequently
than the scrape interval, and simplifies stats reporting from multi-threaded apps.

All metrics values are treated as untyped, unconstrained numbers, ie gauges.


Overview
--------

The gateway forks itself into a separate process and listens for requests.

    const gw = require('kinvey-prometheus-pushgateway');
    gw.forkServer({ port: 9091 }, (err, info) => {
        // => { pid: 12345, port: 9091 }
    })

Api
---

### gw.createServer( config, [callback] )

Create a pushgateway server listening on `config.port`, and return its port and
process id to the `callback`.

### gw.forkServer( config, [callback] )

Run `createServer` in a child process, and return its port and pid back to the parent.
This decouples the gateway from the event loop of the application.  The child will
exit soon after the parent exits.

Config
------

- `port` - port to listen on, default 9091 (same as prometheus-pushgateway)
- `labels` - hash of labels to add to reported metrics, default `{}` none (TBD)
- `verbose` - whether to log service start/stop messages, default false.

Other config settings are ignored.


Http Api
--------

The gateway listens on the configured port (default 9091) for http requests.

### GET /healthcheck

Returns 200 OK status code and "OK" body, just confirm that the service is up.

### POST /push

Push prometheus-pushgateway style stats to the gateway to be scrapable by Prometheus.
The stats are cached until collected by calling /metrics.

    curl --data-binary @- << EOF http://localhots:9091/push
    metric1 11.5
    metric2{host="host-name"} 12.5
    EOF

### POST /push/stackdriver

Push legacy Stackdriver-style stats to the gateway to be scraped by Prometheus.

    curl --data-binary @- << EOF http://localhost:9091/push/stackdriver
    { "timestamp":1519534800,
      "proto_version":1,
      "data":[
        {"name":"metric1","value":1.5,"collected_at":1519534800,"instance":"i-001234"},
        {"name":"metric2","value":2.5,"collected_at":1519534800}
      ]
    }
    EOF
    // => Published

    curl http://localhost:9091/metrics
    metric1{instance="i-001234"} 1.5 1519534800000
    metric2 2.5 1519534800000

### GET /metrics

Endpoint used by Prometheus to scrape stats.

    curl -v http://localhost:9091/metrics
    < HTTP/1.1 200 OK
    < Content-Type: text/plain
    < Date: Sat, 24 Feb 2018 19:28:16 GMT
    < Connection: keep-alive
    < Transfer-Encoding: chunked
    <
    metric1 11.5 1519500493638
    metric2 12.5 1519500493638


Todo
----

- checkpoint metrics into a local journal (to back up the in-memory copy).
  Load journal on start, empty when scraped.
- report metrics with a configurable separation gap to not split clusters of points
- implement `config.labels` support
