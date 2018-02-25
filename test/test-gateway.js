'use strict';

const Gateway = require('../lib/gateway');

module.exports = {
    beforeEach: function(done) {
        this.gw = new Gateway({});
        done();
    },

    'constructor': {
        'should set metricLineFormat': function(t) {
            t.ok(new Gateway({}).metricLineFormat instanceof RegExp);
            t.done();
        },

        'should convert labels hash to labels prefix': function(t) {
            var i, gw, tests = [
                [ '', '' ],
                [ 'a="one"', 'a="one",' ],
                [ 'a="one",b="two"', 'a="one",b="two",' ],
                [ {a: 'one', b: 'two'}, 'a="one",b="two",' ],
            ];
            for (i=0; i<tests.length; i++) {
                gw = new Gateway({ labels: tests[i][0] });
                t.equal(gw.labels, tests[i][1]);
            }
            t.done();
        },
    },

    'trace should write to stdout': function(t) {
        var output;
        t.stubOnce(process.stdout, 'write', function(data) { output = data });
        this.gw.trace('struct is', {a:1, b:2});
        t.contains(output, 'struct is { a: 1, b: 2 }\n');
        t.done();
    },

    'ingestMetrics': {
        'should parse metrics lines': function(t) {
            const self = this;
            const spy = t.spyOnce(this.gw, 'parseMetricsLines');
            this.gw.ingestMetrics('metric1 1\nmetric2 2\n', function(err, ret) {
                t.ok(spy.called);
                t.deepEqual(spy.args[0][0], ['metric1 1', 'metric2 2', '']);
                t.deepEqual(spy.args[0][1], []);
                t.deepEqual(spy.args[0][2].length, 2);
                t.deepEqual(spy.args[0][3], self.gw.samples);
                t.done();
            })
        },

        'should upload zero': function(t) {
            const self = this;
            const spyParse = t.spyOnce(this.gw, 'parseMetricsLines');
            const contents = '\n\n';
            this.gw.ingestMetrics(contents, function(err) {
                // spyParse is called with (contents, badLines, goodLines, samples)
                // goodLines and badLines are populated by parseMetricsLines
                t.deepEqual(spyParse.args[0], [['', '', ''], [], [], self.gw.samples]);
                t.done();
            })
        },

        'should separate good lines and bad lines and complain about bad lines': function(t) {
            const spyParse = t.spyOnce(this.gw, 'parseMetricsLines');
            const spyWrite = t.stubOnce(process.stdout, 'write');
            const contents =
                'metric1\n' +
                '1234\n' +
                '# TYPE gauge\n' +
                '# TYPE counter\n' +
                'metric2 2\n' +
                '# comment\n' +
                '';
            this.gw.ingestMetrics(contents, function(err) {
                t.ok(spyWrite.called);
                t.contains(spyWrite.args[0][0], 'unable to parse');
                t.contains(spyWrite.args[0][0], '\nmetric1\n');
                t.contains(spyWrite.args[0][0], '\n1234\n');
                t.notContains(spyWrite.args[0][0], '\n# TYPE\n');
                t.contains(spyWrite.args[0][0], '\n# TYPE counter\n');
                // spyParse is called with (contents, badLines, goodLines, samples)
                // goodLines and badLines are populated by parseMetricsLines
                t.deepEqual(spyParse.args[0][1], ['metric1', '1234', '# TYPE counter']);
                t.equal(spyParse.args[0][2].length, 1);
                t.ok(spyParse.args[0][2][0].match(/^metric2 2 \d+$/));
                t.done();
            })
        },
    },

    'ingestMetricsStackdriver': {
        'should throw on wrong protocol': function(t) {
            const gw = this.gw;
            const metrics = {
                timestamp: 2000000001,
                proto_version: 2,
                data: [
                    { name: 'metric1', value: 1, collected_at: 1234 },
                ]
            };
            t.throws(function(){ gw.ingestMetricsStackdriver(JSON.stringify(metrics), function(){}) }, /unsupported.* proto_version/);
            t.done();
        },

        'should convert and ingest metrics, retaining instance name': function(t) {
            const gw = this.gw;
            const metrics = {
                timestamp: 2111111111,
                proto_version: 1,
                data: [
                    { name: 'metric1', value: 1.5, collected_at: 1234, instance: 'i-000123' },
                    { name: 'metric2', value: 2.5, collected_at: 1235 },
                    { name: 'metric3', value: NaN },
                ]
            };
            gw.ingestMetricsStackdriver(JSON.stringify(metrics), function(err) {
                t.equal(gw.samples.length, 3);
                t.deepEqual(gw.samples[0], { id: 'metric1{instance="i-000123"}', name: 'metric1', value: '1.5', ts: '1234000', labels: 'instance="i-000123"' });
                t.deepEqual(gw.samples[1], { id: 'metric2', name: 'metric2', value: '2.5', ts: '1235000', labels: '' });
                t.deepEqual(gw.samples[2], { id: 'metric3', name: 'metric3', value: 'NaN', ts: '2111111111000', labels: '' });
                t.done();
            })
        },
    },

    'parseMetricsLines': {
        beforeEach: function(done) {
            this.lines = (
                'metric1 1 2111111111000\n' +
                '# TYPE counter\n' +
                'metric2 2 2111111112000\n' +
                '# comment\n' +
                'bad_metric\n' +
                '# TYPE gauge\n' +
                'metric3 3\n' +
                '').split('\n');
            this.badLines = [];
            this.goodLines = [];
            this.samples = [];
            done();
        },

        'should retain existing timestamp': function(t) {
            this.gw.parseMetricsLines(this.lines, this.badLines, this.goodLines, this.samples);
            t.contains(this.samples, { name: 'metric1', value: '1', ts: '2111111111000' });
            t.contains(this.samples, { name: 'metric2', value: '2', ts: '2111111112000' });
            t.done();
        },

        'should parse lines into samples': function(t) {
            const lines = ['metric1_name 1.25 2000000001000', 'metric2_name{a="one",b="two",} 2.5'];
            const now = Date.now();
            this.gw.parseMetricsLines(lines, this.badLines, this.goodLines, this.samples);
            t.equal(this.samples.length, 2);
            t.contains(this.samples[0], { name: 'metric1_name', value: '1.25', ts: '2000000001000', id: 'metric1_name' });
            t.contains(this.samples[1], { name: 'metric2_name', value: '2.5', id: 'metric2_name{a="one",b="two",}', labels: 'a="one",b="two",' });
            t.ok(this.samples[1].ts >= now);
            t.done();
        },

        'should assign timestamp if not present': function(t) {
            const lines = [ 'metric1 1', 'metric2 2' ];
            const now = Date.now();
            this.gw.parseMetricsLines(lines, this.badLines, this.goodLines, this.samples);
            t.equal(this.samples.length, 2);
            t.ok(this.samples[0].ts >= now);
            t.ok(this.samples[1].ts >= now);
            t.done();
        },

        'should separate bad lines': function(t) {
            this.gw.parseMetricsLines(this.lines, this.badLines, this.goodLines, this.samples);
            t.contains(this.badLines, '# TYPE counter');
            t.contains(this.badLines, 'bad_metric');
            t.done();
        },

        'should separate and timestamp good metrics lines': function(t) {
            this.gw.parseMetricsLines(this.lines, this.badLines, this.goodLines, this.samples);
            t.equal(this.goodLines.length, 3);
            t.equal(this.goodLines[0], 'metric1 1 2111111111000');
            t.equal(this.goodLines[1], 'metric2 2 2111111112000');
            t.ok(/^metric3 3 \d+$/.test(this.goodLines[2]));
            t.done();
        },
    },

    'reportMetrics': {
        beforeEach: function(done) {
            this.metrics =
                '# comment\n' +
                'metric1 1   1500000002000\n' +
                'metric2 2   1500000002000\n' +
                'metric1 1.2 1500000001000\n' +
                'metric2 3   1500000003000\n' +
                'metric3 3' +
                '';
            done();
        },

        'should sort samples into by time asc': function(t) {
            const gw = this.gw;
            const metrics =
                'm1 1 2\n' +
                'm2 2 1\n' +
                'm3 3 4\n' +
                'm4 4 3\n' +
                '';
            gw.ingestMetrics(metrics, function(err) {
                t.ifError(err);
                const report = gw.reportMetrics();
                t.deepEqual(report, ['m2 2 1', 'm1 1 2', 'm4 4 3',  'm3 3 4']);
                t.done();
            })
        },

        'should consume samples from samples array': function(t) {
            const gw = this.gw;
            gw.ingestMetrics(this.metrics, function(err) {
                t.ifError();
                const lenPre = gw.samples.length;
                const report = gw.reportMetrics();
                const lenPost = gw.samples.length;
                t.equal(lenPre, 5);
                t.ok(lenPre > lenPost, "should have fewer samples");
                t.done();
            })
        },

        'should average samples with the same id': function(t) {
            const gw = this.gw;
            gw.ingestMetrics(this.metrics, function(err) {
                t.ifError();
                const report = gw.reportMetrics();
                t.contains(report, 'metric1 1.1 1500000002000');
                t.contains(report, 'metric2 2.5 1500000003000');
                t.done();
            })
        },

        'should report metrics with most recent timestamp': function(t) {
            const start = Date.now();
            const gw = this.gw;
            gw.ingestMetrics(this.metrics, function(err) {
                t.ifError();
                const report = gw.reportMetrics();
                t.contains(report, 'metric1 1.1 1500000002000');
                t.contains(report, 'metric2 2.5 1500000003000');
                t.ok('metric3 3 ' + start <= report[2] && report[2] <= 'metric3 3 ' + Date.now());
                t.done();
            })
        },

        'should report previous values': function(t) {
            const gw = this.gw;
            gw.ingestMetrics('metric1 1 1500000001000\n', function(err) {
                t.ifError(err);
                const report1 = gw.reportMetrics();
                gw.ingestMetrics('metric2 2 1500000002000\n', function(err) {
                    t.ifError(err);
                    const report2 = gw.reportMetrics();
                    t.equal(report1.length, 1);
                    t.contains(report1[0], 'metric1 1');
                    t.equal(report2.length, 2);
                    t.contains(report2[0], 'metric1 1');
                    t.contains(report2[1], 'metric2 2');
                    t.done();
                })
            })
        },

        'should attach configured labels to metrics': function(t) {
t.skip();
        },
    },
}
