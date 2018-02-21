/**
 * kinvey prometheus push gateway
 * Push metrics to the push gateway, let prometheus scrape the gateway.
 *
 * 2018-02-20 - AR.
 */

'use strict';

const util = require('util');
const QFputs = require('qfputs');

module.exports = Gateway;

function Gateway( config ) {
    if (!config.journalFilename) throw new Error('config.journalFilename required');

    this.metricLineFormat = /^(([^\s\{]+)({.*})?)\s+([0-9.]+|NaN)(\s+([0-9]+))?$/;
    this.samples = new Array();

    this.journalFilename = config.journalFilename;
    this.labels = config.labels || "";

    // convert a labels hash into a labels substring to prepend
    if (typeof this.labels !== 'string') {
        var key, labelsString = "";
        for (key in this.labels) labelsString += key + '="' + this.labels[key] + '",';
        this.labels = labelsString;
    }

    this.journal = new QFputs(this.journalFilename);
}

Gateway.trace = function trace( ...argv ) {
    console.log("%s -- %s", new Date().toISOString(), util.format.apply(util, argv));
}


Gateway.prototype.readRequestBody = function readRequestBody( req, callback ) {
    var chunks = new Array();
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
        callback(null, chunks.length > 1 ? Buffer.concat(chunks) : chunks.length == 1 ? chunks[0] : new Buffer(""));
    })
}

Gateway.prototype.uploadMetrics = function uploadMetrics( contents, callback ) {
    const timestamp = new Date().getTime();
    var lines, i, line, parsed, metric;

    // TODO: checkpoint metrics to a journal to not lose samples
    // TODO: on startup, read existing journal into memory

    var badLines = new Array();
    var goodLines = new Array();

    lines = contents.split('\n');
    this.parseMetricsLines(lines, badLines, goodLines, this.samples);

    if (badLines.length > 0) {
        this.trace("unable to parse metric lines:\n%s", badLines.join('\n'));
    }

    if (goodLines.length > 0) {
        this.journal.fputs(goodLines.join('\n'));
    }

    this.journal.fflush((err) => {
        callback(err);
    })
}

Gateway.prototype.parseMetricsLines = function parseMetricsLines( lines, badLines, goodLines, samples ) {
    const timestamp = new Date().getTime();
    var i, line, sample, parsed;

    for (i=0; i<lines.length; i++) {
        line = lines[i].trim();
        if (!line) continue;

        if (line[0] === '#') {
            // reject TYPE annotations unless type is gauge
            if (line.indexOf('TYPE') == 2 && line.indexOf('gauge') < 0) badLines.push(line);
            continue;
        }

        // TODO: move parsing out-of-band to not delay the upload
        // TODO: console.log and skip stale metrics (backfilled metrics), prometheus does not handle them right
        // TODO: accept non-numeric timestamps (ie, iso datetime strings)
        parsed = this.metricLineFormat.exec(line);

        if (!parsed) {
            badLines.push(line);
            continue;
        }

        sample = {
            id: parsed[1],
            name: parsed[2],
            value: parsed[4],
            ts: parsed[6] || timestamp,
            labels: parsed[3],
            // TODO: merge in configured labels
        };
        this.samples.push(sample);
console.log("AR: sample", sample);

        if (parsed[6]) goodLines.push(line);
        else goodLines.push(line + ' ' + timestamp);
    }
}

Gateway.prototype.reportMetrics = function reportMetrics( ) {
    var samples = this.samples;
    var i, k, lines;

    samples.sort((a, b) => (a.ts < b.ts ? -1 : 1));

    // TODO: skip too-old metrics (report to process output), it confuses prometheus
    // TODO: hold "too new" samples for the next scrape (ie samples that are from the next cluster)
    // TODO: report metrics with a lag, to not split clusters of measurements
    samples = samples.splice(0);

    var id, map = {}, averages = new Array();
    samples.forEach((metric) => {
        id = metric.id;
        if (!map[id]) averages.push(map[id] = { id: id, value: 0, ts: 0, count: 0 });
        map[id].count += 1;
        map[id].value += +metric.value;
        map[id].ts    += +metric.ts;
    })

    var lines = new Array();
    averages.forEach((metric) => {
        metric.value /= metric.count;
        metric.ts    /= metric.count;
        lines.push(util.format('%s %s %s', metric.id, metric.value, metric.ts));
    })

    return lines;
}

Gateway.prototype.trace = Gateway.trace;
