kinvey-prom
===========

Kinvey Prometheus agent.


TODO
----

- checkpoint metrics into a local journal (to back up the in-memory copy).
  Load journal on start, empty when scraped.
- report metrics with a configurable separation gap to not split clusters of points
