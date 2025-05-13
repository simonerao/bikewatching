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

let departuresByMinute = Array.from({ length: 1440 }, () => []);
let arrivalsByMinute = Array.from({ length: 1440 }, () => []);

let stations = [];
let baseStations = [];
let radiusScale;

map.on('load', async () => {
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

  const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
  const jsonData = await d3.json(jsonurl);
  baseStations = jsonData.data.stations.map(d => ({ ...d }));
  stations = computeStationTraffic(baseStations);

  const trips = await d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv', d => {
    d.started_at = new Date(d.started_at);
    d.ended_at = new Date(d.ended_at);
    const startMin = minutesSinceMidnight(d.started_at);
    const endMin = minutesSinceMidnight(d.ended_at);
    departuresByMinute[startMin].push(d);
    arrivalsByMinute[endMin].push(d);
    return d;
  });

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

  radiusScale = d3.scaleSqrt()
    .domain([0, d3.max(stations, d => d.totalTraffic)])
    .range([0, 25]);

let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);


  const circles = svg.selectAll('circle')
    .data(stations, d => d.short_name)
    .enter()
    .append('circle')
    .attr('r', d => radiusScale(d.totalTraffic))
    .attr('fill', 'steelblue')
    .attr('fill-opacity', 0.6)
    .attr('stroke', 'white')
    .attr('stroke-width', 1)
    .attr('opacity', 0.8)
    .attr('cx', d => getCoords(d).cx)
    .attr('cy', d => getCoords(d).cy)
    .append('title')
    .text(d => `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);

  function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y };
  }

  function updatePositions() {
    svg.selectAll('circle')
      .attr('cx', d => getCoords(d).cx)
      .attr('cy', d => getCoords(d).cy);
  }

  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', updatePositions);
  map.on('moveend', updatePositions);

  const timeSlider = document.getElementById('time-slider');
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  function updateTimeDisplay() {
    const timeFilter = Number(timeSlider.value);
    if (timeFilter === -1) {
      selectedTime.textContent = '';
      anyTimeLabel.style.display = 'block';
    } else {
      selectedTime.textContent = formatTime(timeFilter);
      anyTimeLabel.style.display = 'none';
    }
    updateScatterPlot(timeFilter);
  }

  timeSlider.addEventListener('input', updateTimeDisplay);
  updateTimeDisplay();

  function updateScatterPlot(timeFilter) {
    const filteredStations = computeStationTraffic(baseStations, timeFilter);
    const maxTraffic = d3.max(filteredStations, d => d.totalTraffic);
    radiusScale.range(timeFilter === -1 ? [0, 25] : [3, 50]).domain([0, maxTraffic]);
  
    const circles = svg.selectAll('circle')
      .data(filteredStations, d => d.short_name);
  
    circles.join(
      enter => enter.append('circle')
        .attr('r', d => radiusScale(d.totalTraffic))
        .attr('fill', 'steelblue')  // We'll replace this line to dynamically set the color
        .attr('fill-opacity', 0.6)
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('opacity', 0.8)
        .attr('cx', d => getCoords(d).cx)
        .attr('cy', d => getCoords(d).cy)
        .call(enter => enter.append('title')
          .text(d => `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`)),
  
      update => update
        .attr('r', d => radiusScale(d.totalTraffic))
        .attr('cx', d => getCoords(d).cx)
        .attr('cy', d => getCoords(d).cy)
        .select('title')
        .text(d => `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`)
    );
  
    // Apply the CSS custom property for departure ratio to control the color
    circles.style('--departure-ratio', (d) => 
      stationFlow(d.departures / d.totalTraffic)
    );
  
    updatePositions();
  }
  
});

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function filterByMinute(tripsByMinute, minute) {
  if (minute === -1) return tripsByMinute.flat();
  let min = (minute - 60 + 1440) % 1440;
  let max = (minute + 60) % 1440;
  if (min > max) {
    return tripsByMinute.slice(min).concat(tripsByMinute.slice(0, max)).flat();
  } else {
    return tripsByMinute.slice(min, max).flat();
  }
}

function computeStationTraffic(stationList, timeFilter = -1) {
  const dep = d3.rollup(
    filterByMinute(departuresByMinute, timeFilter),
    v => v.length,
    d => d.start_station_id
  );
  const arr = d3.rollup(
    filterByMinute(arrivalsByMinute, timeFilter),
    v => v.length,
    d => d.end_station_id
  );

  return stationList.map(station => {
    const id = station.short_name;
    return {
      ...station,
      departures: dep.get(id) ?? 0,
      arrivals: arr.get(id) ?? 0,
      totalTraffic: (dep.get(id) ?? 0) + (arr.get(id) ?? 0)
    };
  });
}

function formatTime(minutes) {
  const date = new Date(0, 0, 0, 0, minutes);
  return date.toLocaleString('en-US', { timeStyle: 'short' });
}
