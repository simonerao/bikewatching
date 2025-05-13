import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken = 'pk.eyJ1Ijoic2ltb25lcmFvIiwiYSI6ImNtYWx3NjhqYzBlMWcybm9xcDE0bXJtY2wifQ.m_gPzWyfNvbr2FBKv1vbpA';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
  minZoom: 5,
  maxZoom: 18,
});

const bikeLaneStyle = {
  'line-color': '#228B22',
  'line-width': 5,
  'line-opacity': 0.6,
};

map.on('load', async () => {
  console.log('Map fully loaded');

  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });

  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'boston_route',
    paint: bikeLaneStyle,
  });

  console.log('Boston bike lane layer added!');

  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson',
  });

  map.addLayer({
    id: 'cambridge-bike-lanes',
    type: 'line',
    source: 'cambridge_route',
    paint: bikeLaneStyle,
  });

  console.log('Cambridge bike lane layer added!');

  let jsonData;
  try {
    const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    jsonData = await d3.json(jsonurl);
    console.log('Loaded JSON Data:', jsonData);

    let stations = jsonData.data.stations;
    console.log('Stations Array:', stations);

    const trips = await d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv');
    console.log('Loaded Traffic Data:', trips);

    const arrivals = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.end_station_id
    );

    const departures = d3.rollup(
      trips,
      (v) => v.length,
      (d) => d.start_station_id
    );

    stations = stations.map((station) => {
      let id = station.short_name;
      station.arrivals = arrivals.get(id) ?? 0;
      station.departures = departures.get(id) ?? 0;
      station.totalTraffic = station.arrivals + station.departures;
      return station;
    });

    console.log('Stations with Traffic Data:', stations);

    // Create and append an SVG overlay to the map canvas
    const container = map.getCanvasContainer();
    const svg = d3.select(container)
      .append("svg")
      .attr("class", "overlay")
      .style("position", "absolute")
      .style("top", 0)
      .style("left", 0)
      .style("width", "100%")
      .style("height", "100%")
      .style("pointer-events", "none");

    const radiusScale = d3.scaleSqrt()
      .domain([0, d3.max(stations, (d) => d.totalTraffic)])
      .range([0, 25]);

    const circles = svg
    .selectAll('circle')
    .data(stations)
    .enter()
    .append('circle')
    .attr('r', (d) => radiusScale(d.totalTraffic))
    .attr('fill', 'steelblue')
    .attr('fill-opacity', 0.6)
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .attr('opacity', 0.8)
    .attr('cx', (d) => getCoords(d).cx)
    .attr('cy', (d) => getCoords(d).cy)
    .each(function (d) {
    d3.select(this)
        .append('title')
        .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
    });
    
    function getCoords(station) {
      const point = new mapboxgl.LngLat(+station.lon, +station.lat);
      const { x, y } = map.project(point);
      return { cx: x, cy: y };
    }

    function updatePositions() {
        circles
          .attr('cx', (d) => getCoords(d).cx)
          .attr('cy', (d) => getCoords(d).cy);
      }
      

    updatePositions();

    map.on('move', updatePositions);
    map.on('zoom', updatePositions);
    map.on('resize', updatePositions);
    map.on('moveend', updatePositions);

  } catch (error) {
    console.error('Error loading data:', error);
  }
});
