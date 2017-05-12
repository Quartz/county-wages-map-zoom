// NPM modules
var d3 = require('d3');
var geo = require('d3-geo-projection');
var topojson = require('topojson');
var _ = require('lodash');

// Local modules
var features = require('./detectFeatures')();
var fm = require('./fm');
var utils = require('./utils');
var geomath = require('./geomath');

// Globals
var MOBILE_BREAKPOINT = 600;
var SIMPLE_LABELS = [{
    'lat': 37,
    'lng': -95,
    'label': 'My label',
    'class': ''
}];
var PLAYBACK_SPEED = 250;

var configure = require('./maps/usa-counties.js');

// Global vars
var isMobile = false;
var topoData = {};
var countyData = {};
var identityProjection = null;

// var playbackYear = 1990;
// var isPlaying = false;
// var hasPlayed = false;
// var restarting = false;

/**
 * Initialize the graphic.
 *
 * Fetch data, format data, cache HTML references, etc.
 */
function init() {
    // Used for computing centroids in coordinate space
    identityProjection = d3.geo.path()
        .projection({stream: function(d) { return d; }});

    d3.json('data/geodata.json', function(error, data) {
        // Extract topojson features
        for (var key in data['objects']) {
            topoData[key] = topojson.feature(data, data['objects'][key]);
        }

        d3.csv('data/county_wage_series.csv', function(error, data) {
            _.each(data, function(d) {
                bits = d['area_title'].split(', ');
                d['county'] = bits[0];
                d['state'] = bits[1];

                if (d['county'] == 'District of Columbia') {
                    d['state'] = 'DC';
                }

                countyData[d['area_fips']] = d;
            });

            // d3.select('button.play').on('click', onPlayButtonClicked);

            // render();
            $(window).resize(utils.throttle(onResize, 250));
            $(window).resize();
        });
    });
}

// function onPlayButtonClicked() {
//     d3.event.preventDefault();
//
//     if (playbackYear == 2015) {
//         restarting = true;
//     }
//
//     playbackYear = 1990;
//     isPlaying = true;
//     render();
// }

/**
 * Invoke on resize. By default simply rerenders the graphic.
 */
function onResize() {
    render();
}

/**
 * Figure out the current frame size and render the graphic.
 */
function render() {
    // What kind of map are we making?
    var configuration = configure(320);

    // if (isPlaying) {
    //     // Don't immediately advance if just showing 1990
    //     if (restarting) {
    //         restarting = false;
    //     } else {
    //         playbackYear = playbackYear + 5;
    //
    //         if (playbackYear == 2015) {
    //             isPlaying = false;
    //             hasPlayed = true;
    //         }
    //     }
    // }

    // Render the map!
    renderMap(configuration, {
        container: '#graphic1990',
        width: 320,
        data: topoData,
        playbackYear: 1990
    });

    renderMap(configuration, {
        container: '#graphic2015',
        width: 320,
        data: topoData,
        playbackYear: 2015
    });

    // d3.select('div.year').text(playbackYear);

    // Resize
    fm.resize();

    // if (isPlaying) {
    //     _.delay(render, PLAYBACK_SPEED);
    // }
}

var renderMap = function(typeConfig, instanceConfig) {
    /*
     * Setup
     */
    var selectionElement = null;

    // Calculate actual map dimensions
    var mapWidth = instanceConfig['width'];
    var mapHeight = Math.ceil(instanceConfig['width'] / typeConfig['aspect_ratio']);

    // Clear existing graphic (for redraw)
    var containerElement = d3.select(instanceConfig['container']);
    containerElement.html('');

    /*
     * Create the map projection.
     */
    var centroid = typeConfig['centroid'];
    var mapScale = mapWidth * typeConfig['scale_factor'];

    var projection = typeConfig['projection']
        .scale(mapScale)
        .translate([mapWidth / 2, mapHeight / 2]);

    var path = d3.geo.path()
        .projection(projection)
        .pointRadius(typeConfig['dot_radius'] * mapScale);

    /*
     * Create the root SVG element.
     */
    var chartWrapper = containerElement.append('div')
        .attr('class', 'graphic-wrapper');

    var chartElement = chartWrapper.append('svg')
        .attr('width', mapWidth)
        .attr('height', mapHeight);

    /*
     * Render graticules.
     */
    if (typeConfig['graticules']) {
        var graticule = d3.geo.graticule();

        chartElement.append('g')
            .attr('class', 'graticules')
            .append('path')
                .datum(graticule)
                .attr('d', path);
    }

    /*
     * Render paths.
     */
    var pathsElement = chartElement.append('g')
        .attr('class', 'paths');

    function classifyFeature(d) {
        var c = [];

        if (d['id']) {
            c.push(utils.classify(d['id']));
        }

        for (var property in d['properties']) {
            var value = d['properties'][property];

            c.push(utils.classify(property + '-' + value));
        }

        return c.join(' ');
    }

    function renderPaths(group) {
        pathsElement.append('g')
            .attr('class', group)
            .selectAll('path')
                .data(instanceConfig['data'][group]['features'])
            .enter().append('path')
                .attr('d', path)
                .attr('class', classifyFeature);
    }

    pathsElement.append('g')
        .attr('class', 'counties')
        .selectAll('path')
            .data(instanceConfig['data']['counties']['features'])
        .enter().append('path')
            .attr('d', path)
            .attr('class', function(d) {
                var cls = [];
                var fips = d['id'].replace(/^0+/, '');

                // Wade Hamptok, AK -> Kusilvak
                if (fips == '2158') {
                    fips = '2270';
                // Shannon County, SD -> Oglala Dakota
                } else if (fips == '46102') {
                    fips = '46113';
                }

                if (fips in countyData) {
                    cls.push(utils.classify(countyData[fips]['state']));
                    cls.push('quintile' + countyData[fips][instanceConfig['playbackYear']]);

                } else {
                    cls.push('no-data');
                }

                return cls.join(' ');
            })

    renderPaths('states');

    var selectionElement = pathsElement.append('g')
        .attr('class', 'selection');

    /*
     * Render a scale bar.
     */
    if (typeConfig['scale_bar_distance']) {
        var scaleBarDistance = typeConfig['scale_bar_distance'];
        var scaleBarStart = [10, mapHeight - 35];
        var scaleBarEnd = geomath.calculateScaleBarEndPoint(projection, scaleBarStart, scaleBarDistance);

        chartElement.append('g')
            .attr('class', 'scale-bar')
            .append('line')
            .attr('x1', scaleBarStart[0])
            .attr('y1', scaleBarStart[1])
            .attr('x2', scaleBarEnd[0])
            .attr('y2', scaleBarEnd[1]);

        var label = ' mile';

        if (scaleBarDistance != 1) {
            label += 's';
        }

        d3.select('.scale-bar')
            .append('text')
            .attr('x', scaleBarEnd[0] + 5)
            .attr('y', scaleBarEnd[1])
            .text(scaleBarDistance + label);
    }

    /*
     * Reposition footer.
     */
    d3.selectAll('.footer')
        .style('top', (mapHeight + 50) + 'px')
}

// Bind on-load handler
$(document).ready(function() {
    init();
});
