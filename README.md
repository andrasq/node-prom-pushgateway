prom-pushgateway
=============================
[![Build Status](https://api.travis-ci.org/andrasq/node-prom-pushgateway.svg?branch=master)](https://travis-ci.org/andrasq/node-prom-pushgateway?branch=master)
[![Coverage Status](https://codecov.io/github/andrasq/node-prom-pushgateway/coverage.svg?branch=master)](https://codecov.io/github/andrasq/node-prom-pushgateway?branch=master)


Embeddable aggregating Prometheus push gateway.

`prom-pushgateway` is a low overhead nodejs module that can be included in other apps
to expose a Promptheus compatible metrics endpoint, or can run standalone to provide
an independent, Prometheus scrapable metrics push service.

Accepts stats from an app and presents them to be scraped by Prometheus.  Same-named
stats are subsampled (averaged), which allows stats to be gathered more frequently
than the scrape interval, and simplifies stats reporting from multi-threaded apps.

All metrics values are treated as untyped, unconstrained numbers, ie gauges.


Overview
--------

The gateway forks itself into a separate process and listens for requests.

    const gw = require('prom-pushgateway');
    const worker = gw.forkServer({ port: 9091 }, (err, info) => {
        // => { pid: 12345, port: 9091 }
    })


Api
---

### gw.createServer( config, [callback] )

Create a pushgateway http server listening on `config.port`, and return the server.

With a callback tries for up to `listenTimeout` ms to acquire and listen on the socket
and returns any error or the port and process id of the server to its callback.

Without a callback it does not retry, it throws a listen error if the port is not
available, or emits an `'error'` event on the server if there is a listener for it.

### gw.forkServer( config, [callback] )

Run `createServer` in a child process, and return its port and pid back to the parent.
This decouples the gateway from the event loop of the application.  The worker will
exit soon after the parent exits.  On error the worker is killed.

Internally `createServer` is called with a callback; if `forkServer` is called with a
callback, errors and port/pid are returned to the caller, without a callback errors
are rethrown.


Config
------

- `port` - port to listen on, default 9091 (same as prometheus-pushgateway)
- `labels` - hash of labels to add to reported metrics, default `{}` none (TBD)
- `verbose` - whether to log service start/stop messages, default false.
- `listenTimeout` - how long to retry to listen() on the configured socket

Other config settings are ignored.


Http Api
--------

The gateway listens on the configured port (default 9091) for http requests.

### GET /healthcheck

Returns 200 OK status code and "OK" body, just to confirm that the service is up.

### POST /push

Push prometheus-pushgateway format stats to the gateway to be scraped by Prometheus.
The stats are cached until collected by a call to /metrics.

    $ curl --data-binary @- << EOF http://localhots:9091/push
    metric1 11.5
    metric2{host="host-name"} 12.5
    EOF

    $ curl http://localhost:9091/metrics
    metric1 11.5 1519998877123
    metric2{host="host-name"} 2.5 1519998877123

### POST /push/stackdriver
### POST /v1/custom

Push legacy-Stackdriver format stats to the gateway to be scraped by Prometheus.

    $ curl --data-binary @- << EOF http://localhost:9091/push/stackdriver
    { "timestamp":1519534800,
      "proto_version":1,
      "data":[
        {"name":"metric1","value":1.5,"collected_at":1519534800,"instance":"i-001234"},
        {"name":"metric2","value":2.5,"collected_at":1519534800}
      ]
    }
    EOF
    // => Published

    $ curl http://localhost:9091/metrics
    metric1{instance="i-001234"} 1.5 1519534800000
    metric2 2.5 1519534800000

### GET /metrics

Endpoint used by Prometheus to scrape stats.  The cached stats are aggregated when reported
(averaged, with the most recent timestamp).  Each call to /metrics will report all known metrics,
whether or not new samples have been pushed since the last call.  If no new samples arrived, the
last reported values are sent again.

    $ curl -v http://localhost:9091/metrics
    < HTTP/1.1 200 OK
    < Content-Type: text/plain
    < Date: Sat, 24 Feb 2018 19:28:16 GMT
    < Connection: keep-alive
    < Transfer-Encoding: chunked
    <
    metric1 11.5 1519500493638
    metric2 12.5 1519500493638


Change Log
----------

- 0.6.0 - `config.labels` support, rename to prom-pushgateway, /v1/custom endpoint
- 0.5.2 - 100% test coverage
- 0.5.0 - fully working


Related Work
------------

- [prometheus](https://github.com/prometheus) - Prometheus monitoring
- [prometheus-pushgateway](https://github.com/prometheus/pushgateway) - prometheus-pushgateway
  scrapable metrics cache


Todo
----

- checkpoint metrics into a local journal (to back up the in-memory copy).
  Load journal on start, empty when scraped.
- report metrics with a configurable separation gap to not split clusters of points
- cache aggregates, not samples
