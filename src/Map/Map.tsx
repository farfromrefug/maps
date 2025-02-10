import React from 'react'
import { createRoot } from 'react-dom/client'
import { connect } from 'react-redux'
// import L from 'leaflet'
// import * as $ from 'jquery'
import 'jquery-ui-bundle'
import 'jquery-ui-bundle/jquery-ui.css'

import maplibregl, { LngLatBounds } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import '@fortawesome/fontawesome-free/css/fontawesome.min.css'
import FontawesomeMarker from 'mapbox-gl-fontawesome-markers'
// import 'leaflet-easybutton'
// import 'leaflet-easybutton/src/easy-button.css'
// import 'leaflet.photon'
// import 'leaflet.photon/leaflet.photon.css'

// import '@geoman-io/leaflet-geoman-free'
// import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
// import 'leaflet.heightgraph'
// import 'leaflet.heightgraph/dist/L.Control.Heightgraph.min.css'

import PropTypes from 'prop-types'
import axios from 'axios'

import * as R from 'ramda'
// import ExtraMarkers from './extraMarkers'
import { Button, Label, Icon, Popup } from 'semantic-ui-react'
import { ToastContainer } from 'react-toastify'
import { CopyToClipboard } from 'react-copy-to-clipboard'
import {
  fetchReverseGeocode,
  updateInclineDeclineTotal,
} from 'actions/directionsActions'
import { fetchReverseGeocodeIso } from 'actions/isochronesActions'
import { updateSettings } from 'actions/commonActions'
import {
  VALHALLA_OSM_URL,
  buildHeightRequest,
  buildLocateRequest,
} from 'utils/valhalla'
import { VECTOR_TILE_URL, styles } from 'utils/map'
import { buildHeightgraphData } from 'utils/heightgraph'
import formatDuration from 'utils/date_time'
import './Map.css'
import { Feature, FeatureCollection, LineString } from 'geojson'
// const OSMTiles = L.tileLayer(process.env.REACT_APP_TILE_SERVER_URL, {
//   attribution:
//     '<a href="https://map.project-osrm.org/about.html" target="_blank">About this service and privacy policy</a> | &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
// })

// let dpi = 96
Object.defineProperty(window, 'devicePixelRatio', {
  get: function () {
    return 300 / 96
  },
})

const convertDDToDMS = (decimalDegrees) =>
  [
    0 | decimalDegrees,
    '° ',
    0 |
      (((decimalDegrees =
        (decimalDegrees < 0 ? -decimalDegrees : decimalDegrees) + 1e-4) %
        1) *
        60),
    "' ",
    0 | (((decimalDegrees * 60) % 1) * 60),
    '"',
  ].join('')

// for this app we create two leaflet layer groups to control, one for the isochrone centers and one for the isochrone contours
// const isoCenterLayer = L.featureGroup()
// const isoPolygonLayer = L.featureGroup()
// const isoLocationsLayer = L.featureGroup()
// const routeMarkersLayer = L.featureGroup()
// const routeLineStringLayer = L.featureGroup()
// const highlightRouteSegmentlayer = L.featureGroup()
// const highlightRouteIndexLayer = L.featureGroup()
// const excludePolygonsLayer = L.featureGroup()

const centerCoords = process.env.REACT_APP_CENTER_COORDS.split(',')
let center: [number, number] = [
  parseFloat(centerCoords[1]),
  parseFloat(centerCoords[0]),
]
let zoom_initial = 10
let ignoreNextMove = false

function updateMapLocationFromUrl(
  url = window.location.href,
  map?: maplibregl.Map
) {
  const urlLocMatch = url && url.match(/#map=([\d.]+)\/([\d.]+)\/([\d.]+)/)
  if (urlLocMatch) {
    center = [urlLocMatch[3], urlLocMatch[2]].map(parseFloat) as [
      number,
      number
    ]
    zoom_initial = parseFloat(urlLocMatch[1])
    if (map) {
      ignoreNextMove = true
      map.setCenter(center)
      map.setZoom(zoom_initial)
      // map.setView(new L.LatLng(...center), zoom_initial)
    }
    return true
  }
}
if (!updateMapLocationFromUrl() && localStorage.getItem('last_center')) {
  const last_center = JSON.parse(localStorage.getItem('last_center'))
  center = last_center.center
  zoom_initial = last_center.zoom_level
}

const maxBoundsString = process.env.REACT_APP_MAX_BOUNDS?.split(',')
const maxBounds = maxBoundsString
  ? [
      //south west corner
      [parseFloat(maxBoundsString[0]), parseFloat(maxBoundsString[1])],
      //north east corner
      [parseFloat(maxBoundsString[2]), parseFloat(maxBoundsString[3])],
    ]
  : undefined

// a leaflet map consumes parameters, I'd say they are quite self-explanatory
// const mapParams = {
//   center,
//   maxBounds,
//   maxBoundsViscosity: 1.0,
//   zoomControl: false,
//   zoomSnap: 0.1,
//   zoom: zoom_initial,
//   maxZoom: 18,
//   minZoom: 2,
//   worldCopyJump: true,
//   attributionControl: false,
//   layers: [
//     isoCenterLayer,
//     routeMarkersLayer,
//     isoPolygonLayer,
//     isoLocationsLayer,
//     routeLineStringLayer,
//     highlightRouteSegmentlayer,
//     highlightRouteIndexLayer,
//     excludePolygonsLayer,
//   ],
// }

const routeObjects = {
  [VALHALLA_OSM_URL]: {
    color: '#0066ff',
    alternativeColor: '#66a3ff',
    name: 'OSM',
  },
}

// this you have seen before, we define a react component
class Map extends React.Component<
  {
    dispatch
    directions
    profile
    activeTab
    activeDataset
    showRestrictions
    coordinates
    showDirectionsPanel
    showSettings
  },
  {
    heightPayload?
    elevation?
    currentStyle?
    isLocateLoading?: boolean
    isHeightLoading?: boolean
    hasCopied?: boolean
    locate?: any[]
    showInfoPopup?
    latLng?: maplibregl.LngLat
  }
> {
  static propTypes = {
    dispatch: PropTypes.func.isRequired,
    directions: PropTypes.object,
    // isochrones: PropTypes.object,
    profile: PropTypes.string,
    activeTab: PropTypes.number,
    activeDataset: PropTypes.string,
    showRestrictions: PropTypes.object,
    coordinates: PropTypes.array,
    showDirectionsPanel: PropTypes.bool,
    showSettings: PropTypes.bool,
  }
  map: maplibregl.Map
  mapPopup: maplibregl.Popup
  routeLineStringPopup: maplibregl.Popup
  constructor(props) {
    super(props)
    this.state = {
      currentStyle: localStorage.getItem('last_style')
        ? localStorage.getItem('last_style')
        : styles[0],
      // showPopup: false,
      isLocateLoading: false,
      isHeightLoading: false,
      locate: [],
    }
  }

  createMapGeoJSONSource(sourceId, type, layout, paint?) {
    const source = this.map.getSource(sourceId)
    if (!source) {
      this.map.addSource(sourceId, {
        type: 'geojson',
        data: {
          type: 'FeatureCollection',
          features: [],
        },
      })
      // Add a symbol layer
      this.map.addLayer(
        {
          id: sourceId,
          type: type,
          source: sourceId,
          layout: layout,
          ...(paint ? { paint } : {}),
        },
        'cablecar'
      )
    } else {
      this.clearSource(sourceId)
    }
  }

  // and once the component has mounted we add everything to it
  waypointMarkers: maplibregl.Marker[] = []
  componentDidMount() {
    this.waypointMarkers.forEach((m) => m.remove())
    // our map!
    //const { dispatch } = this.props
    const map = (this.map = new maplibregl.Map({
      container: 'map',
      style: `${VECTOR_TILE_URL}/styles/${this.state.currentStyle}/style.json`,
      center,
      zoom: zoom_initial,
      maxPitch: 85,
      canvasContextAttributes: {
        preserveDrawingBuffer: true,
      },
    }))

    this.routeLineStringPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnClick: false,
    })
    map.on('mouseenter', 'routeLineString', (e) => {
      // Change the cursor style as a UI indicator.
      map.getCanvas().style.cursor = 'pointer'
      const feature = e.features[0] as Feature<LineString>
      // const coordinates = feature.geometry.coordinates.slice()
      const summary = JSON.parse(feature.properties.summary)
      // Ensure that if the map is zoomed out such that multiple
      // copies of the feature are visible, the popup appears
      // over the copy being pointed to.
      // while (Math.abs(e.lngLat.lng - coordinates[0]) > 180) {
      //   coordinates[0] += e.lngLat.lng > coordinates[0] ? 360 : -360
      // }

      // Populate the popup and set its coordinates
      // based on the feature found.
      this.routeLineStringPopup
        .setLngLat(e.lngLat)
        .setHTML(this.getRouteToolTip(summary, VALHALLA_OSM_URL))
        .addTo(map)
    })

    map.on('mouseleave', 'routeLineString', () => {
      map.getCanvas().style.cursor = ''
      this.routeLineStringPopup.remove()
    })
    // this.map = L.map('map', mapParams)

    let ignoreNextChange = false
    const locationHashChanged = (e) => {
      if (ignoreNextChange) {
        ignoreNextChange = false
        return
      }
      updateMapLocationFromUrl(e.newURL, this.map)
    }

    window.onhashchange = locationHashChanged

    // const ButtonControl = L.Control.extend({
    //   options: {
    //     position: 'topleft',
    //   },

    //   onAdd: function (map) {
    //     const container = L.DomUtil.create('input', 'leaflet-touch leaflet-bar')
    //     container.type = 'button'
    //     container.title = this.options.title
    //     container.value = this.options.title

    //     container.style.backgroundColor = 'white'
    //     //container.style.backgroundImage = "url(https://t1.gstatic.com/images?q=tbn:ANd9GcR6FCUMW5bPn8C4PbKak2BJQQsmC-K9-mbYBeFZm1ZM2w2GRy40Ew)";
    //     container.style.padding = '10px'
    //     // container.style.borderRadius = '6px'
    //     // container.style.border = '2px solid rgba(0,0,0,0.2)'

    //     container.onclick = (e) => {
    //       e.preventDefault()
    //       e.stopPropagation()
    //       this.options.onClick(e)
    //       return false
    //     }

    //     return container
    //   },
    // })
    // L.control
    //   .photon({
    //     limit: 40,
    //     feedbackEmail: null,
    //     includePosition: false,
    //     // onSelected: (geojson) => {
    //     //   console.debug(geojson)
    //     // },
    //     position: 'topright',
    //     placeholder: 'search …',
    //   })
    //   .addTo(this.map)
    // let currentStyle = styles[0]
    // if (localStorage.getItem('last_style')) {
    //   currentStyle = localStorage.getItem('last_style')
    // }

    // const planetiler = L.maplibreGL({
    //   preserveDrawingBuffer: true,
    //   style: `${VECTOR_TILE_URL}/styles/${this.state.currentStyle}/style.json`,
    // }).addTo(this.map)
    // const maplibreMap = (this.maplibreMap = planetiler.getMaplibreMap())
    this.map.once('data', (e) => {
      if (e.dataType === 'style') {
        this.map.setTerrain(null)
        try {
          if (this.map.getSource('hillshading')) {
            this.map.setLayoutProperty(
              'hillshading',
              'visibility',
              localStorage.getItem('hillshading_visibility') ?? 'none'
            )
          }
        } catch (error) {}

        if (this.map.getSource('routes')) {
          this.map.addLayer(
            {
              id: 'cycling_routes',
              type: 'line',
              source: 'routes',
              'source-layer': 'route',
              minzoom: 3,
              layout: {
                'line-join': 'round',
                visibility: 'visible',
              },
              paint: {
                'line-color': 'blue',
                'line-width': {
                  base: 1.2,
                  stops: [
                    [14, 2],
                    [15, 2.5],
                    [17, 2.6],
                    [18, 3],
                  ],
                } as any,
                'line-dasharray': [3, 2],
                'line-opacity': 0.6,
              },
              metadata: {},
              filter: [
                'all',
                ['==', '$type', 'LineString'],
                ['in', 'class', 'bicycle'],
              ],
            },
            'cablecar'
          )
        }

        if (this.map.getSource('contours')) {
          const visibility = (localStorage.getItem('contours_visibility') ??
            'none') as 'none' | 'visible'

          this.map.addLayer(
            {
              id: 'contour_label',
              type: 'symbol',
              metadata: {},
              source: 'contours',
              'source-layer': 'contour',
              filter: [
                'all',
                ['==', '$type', 'LineString'],
                ['in', 'div', 10, 5],
                ['>', 'ele', 0],
              ],
              layout: {
                visibility: visibility,
                'symbol-avoid-edges': true,
                'symbol-placement': 'line',
                'text-allow-overlap': false,
                'text-field': '{ele} m',
                'text-font': ['Noto Sans Regular'],
                'text-ignore-placement': false,
                'text-padding': 10,
                'text-rotation-alignment': 'map',
                'text-size': {
                  base: 1,
                  stops: [
                    [15, 9.5],
                    [20, 12],
                  ],
                } as any,
              },
              paint: {
                'text-color': 'hsl(0, 0%, 37%)',
                'text-halo-color': 'hsla(0, 0%, 100%, 0.5)',
                'text-halo-width': 1.5,
              },
            },
            'waterway_tunnel'
          )
          this.map.addLayer(
            {
              id: 'contour_index',
              type: 'line',
              source: 'contours',
              'source-layer': 'contour',
              filter: ['all', ['>', 'ele', 0], ['in', 'div', 10, 5]],
              layout: {
                visibility: visibility,
              },
              paint: {
                'line-color': 'hsl(0, 1%, 58%)',
                'line-opacity': 0.4,
                'line-width': 1.1,
              },
            },
            'waterway_tunnel'
          )
          this.map.addLayer(
            {
              id: 'contour',
              type: 'line',
              source: 'contours',
              'source-layer': 'contour',
              filter: ['all', ['!in', 'div', 10, 5], ['>', 'ele', 0]],
              layout: {
                visibility: visibility,
              },
              paint: {
                'line-color': 'hsl(0, 1%, 58%)',
                'line-opacity': 0.3,
                'line-width': 0.6,
              },
            },
            'waterway_tunnel'
          )
        }

        // this.createMapGeoJSONSource('highlightRouteIndex', 'symbol', {
        //   'icon-image': 'custom-marker',
        //   // get the year from the source's "year" property
        //   'text-field': ['get', 'year'],
        //   'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
        //   'text-offset': [0, 1.25],
        //   'text-anchor': 'top',
        // })
        this.createMapGeoJSONSource(
          'routeLineString',
          'line',
          {
            'line-join': 'round',
            'line-cap': 'round',
          },
          {
            'line-color': ['coalesce', ['get', 'lineColor'], '#ff0000'],
            'line-width': ['coalesce', ['get', 'lineWidth'], 8],
          }
        )
        this.createMapGeoJSONSource(
          'highlightRouteIndex',
          'line',
          {
            'line-join': 'round',
            'line-cap': 'round',
          },
          {
            'line-color': ['coalesce', ['get', 'lineColor'], '#ff0000'],
            'line-width': ['coalesce', ['get', 'lineWidth'], 8],
          }
        )
      }
    })
    // we create a leaflet pane which will hold all isochrone polygons with a given opacity
    // const isochronesPane = this.map.createPane('isochronesPane')
    // isochronesPane.style.opacity = 0.9

    // our basemap and add it to the map
    // const baseMaps = {
    //   Planetiler: planetiler,
    //   OpenStreetMap: OSMTiles,
    // }

    // const overlayMaps = {
    //   Waypoints: routeMarkersLayer,
    //   'Isochrone Center': isoCenterLayer,
    //   Routes: routeLineStringLayer,
    //   Isochrones: isoPolygonLayer,
    //   'Isochrones (locations)': isoLocationsLayer,
    // }

    // const maplibreStyles = styles.reduce((acc, curr) => {
    //   acc[curr] = {
    //     img: `${VECTOR_TILE_URL}/styles/${curr}/13/4226/2940.png`,
    //   }
    //   return acc
    // }, {})
    class LayersControl {
      _container
      _inputs
      _ctrls
      _map: maplibregl.Map
      constructor(ctrls) {
        // This div will hold all the checkboxes and their labels
        this._container = document.createElement('div')
        this._container.classList.add(
          // Built-in classes for consistency
          'maplibregl-ctrl',
          'maplibregl-ctrl-group',
          // Custom class, see later
          'layers-control'
        )
        // Might be cleaner to deep copy these instead
        this._ctrls = ctrls
        // Direct access to the input elements so I can decide which should be
        // checked when adding the control to the map.
        this._inputs = []
        // Create the checkboxes and add them to the container
        for (const key of Object.keys(this._ctrls)) {
          const labeled_checkbox = this._createLabeledCheckbox(key)
          this._container.appendChild(labeled_checkbox)
        }
      }

      // Creates one checkbox and its label
      _createLabeledCheckbox(key) {
        const label = document.createElement('label')
        label.classList.add('layer-control')
        const text = document.createTextNode(key)
        const input = document.createElement('input')
        this._inputs.push(input)
        input.type = 'checkbox'
        input.id = key
        // `=>` function syntax keeps `this` to the LayersControl object
        // When changed, toggle all the layers associated with the checkbox via
        // `this._ctrls`.
        input.addEventListener('change', () => {
          const visibility = input.checked ? 'visible' : 'none'
          for (const layer of this._ctrls[input.id]) {
            map.setLayoutProperty(layer, 'visibility', visibility)
          }
        })
        label.appendChild(input)
        label.appendChild(text)
        return label
      }

      onAdd(map) {
        this._map = map
        // For every checkbox, find out if all its associated layers are visible.
        // Check the box if so.
        for (const input of this._inputs) {
          // List of all layer ids associated with this checkbox
          const layers = this._ctrls[input.id]
          // Check whether every layer is currently visible
          let is_visible = true
          for (const layername of layers) {
            is_visible =
              is_visible &&
              this._map.getLayoutProperty(layername, 'visibility') !== 'none'
          }
          input.checked = is_visible
        }
        return this._container
      }

      onRemove(map) {
        // Not sure why we have to do this ourselves since we are not the ones
        // adding us to the map.
        // Copied from their example so keeping it in.
        this._container.parentNode.removeChild(this._container)
        // This might be to help garbage collection? Also from their example.
        // Or perhaps to ensure calls to this object do not change the map still
        // after removal.
        this._map = undefined
      }
    }

    class ButtonControl {
      _className
      _title
      _eventHandler
      _btn
      _container
      _map: maplibregl.Map
      constructor({ className = '', title = '', eventHandler }) {
        this._className = className
        this._title = title
        this._eventHandler = eventHandler
      }

      onAdd(map) {
        this._map = map
        this._btn = document.createElement('button')
        this._btn.className = 'maplibregl-ctrl-icon' + ' ' + this._className
        this._btn.type = 'button'
        this._btn.title = this._title
        this._btn.onclick = this._eventHandler

        this._container = document.createElement('div')
        this._container.className = 'maplibregl-ctrl-group maplibregl-ctrl'
        this._container.appendChild(this._btn)

        return this._container
      }

      onRemove() {
        this._container.parentNode.removeChild(this._container)
        this._map = undefined
      }
    }
    this.map.addControl(
      new ButtonControl({
        className: 'maplibregl-button-openosm',
        title: 'open OSM',
        eventHandler: this.handleOpenOSM,
      }),
      'bottom-right'
    )
    // this.map.addControl(
    //   new LayersControl({
    //     routes: ['routeLineString'],
    //     highlight: ['highlightRouteIndex'],
    //     labelcheckboxwithmultiplelayers: ['layerid2', 'layerid3', 'layerid4'],
    //   }),
    //   'bottom-right'
    // )
    this.map.addControl(new maplibregl.NavigationControl())

    // new ButtonControl({
    //   position: 'bottomright',
    //   title: 'open OSM',
    //   onClick: this.handleOpenOSM,
    // }).addTo(this.map)

    // new MaplibreStyleSwitcher({
    //   position: 'bottomright',
    //   basemaps: maplibreStyles,
    //   initialBasemap: currentStyle,
    // }).addTo(this.map)

    // this.layerControl = L.control
    //   .layers(baseMaps, overlayMaps, { position: 'bottomright' })
    //   .addTo(this.map)

    this.map.addControl(
      new ButtonControl({
        className: 'maplibregl-button-print',
        title: 'PRINT',
        eventHandler: (e) => {
          const image = this.map.getCanvas().toDataURL('image/jpeg', 0.9)
          const a = document.createElement('a')
          a.href = image.replace('image/jpeg', 'image/octet-stream')
          a.download = 'map_export.jpg'
          a.click()
        },
      }),
      'top-right'
    )

    // new ButtonControl({
    //   position: 'topright',
    //   title: 'PRINT',
    //   onClick: (e) => {
    //     const image = planetiler.getCanvas().toDataURL('image/jpeg', 0.9)
    //     const a = document.createElement('a')
    //     a.href = image.replace('image/jpeg', 'image/octet-stream')
    //     a.download = 'map_export.jpg'
    //     a.click()
    //   },
    // }).addTo(this.map)

    this.map.addControl(
      new ButtonControl({
        className: 'maplibregl-button-hillshading',
        title: 'hillshading',
        eventHandler: (btn, map) => {
          const source = this.map.getSource('hillshading')
          if (source) {
            const visibility = this.map.getLayoutProperty(
              'hillshading',
              'visibility'
            )
            const newVisibility = visibility === 'none' ? 'visible' : 'none'
            localStorage.setItem('hillshading_visibility', newVisibility)
            this.map.setLayoutProperty(
              'hillshading',
              'visibility',
              newVisibility
            )
          }
        },
      })
    )
    this.map.addControl(
      new ButtonControl({
        className: 'maplibregl-button-contours',
        title: 'hillshading',
        eventHandler: (btn, map) => {
          const source = this.map.getSource('contours')
          if (source) {
            const visibility = this.map.getLayoutProperty(
              'contour_label',
              'visibility'
            )
            const newVisibility = visibility === 'none' ? 'visible' : 'none'
            localStorage.setItem('contours_visibility', newVisibility)
            this.map.setLayoutProperty(
              'contour_label',
              'visibility',
              newVisibility
            )
            this.map.setLayoutProperty(
              'contour_index',
              'visibility',
              newVisibility
            )
            this.map.setLayoutProperty('contour', 'visibility', newVisibility)
          }
        },
      })
    )
    this.map.addControl(
      new maplibregl.TerrainControl({
        source: 'hillshading',
        exaggeration: 1,
      }),
      'top-right'
    )

    // we do want a zoom control
    // L.control
    //   .zoom({
    //     position: 'topright',
    //   })
    //   .addTo(this.map)

    // L.easyButton(
    //   '<i><svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.186 18.196a.2.2 0 00.17.304h16.837a.2.2 0 00.184-.28L15.192 6.435a.2.2 0 00-.369.006L12.58 12.05a.2.2 0 00.029.198l1.677 2.135a1 1 0 11-1.572 1.236L8.418 10.15a.2.2 0 00-.328.02l-4.904 8.025z" fill="#000"/></svg></i>',
    //   (btn, map) => {
    //     const visibility = maplibreMap.getLayoutProperty(
    //       'hillshading',
    //       'visibility'
    //     )
    //     maplibreMap.setLayoutProperty(
    //       'hillshading',
    //       'visibility',
    //       visibility === 'none' ? 'visible' : 'none'
    //     )
    //   },
    //   {
    //     position: 'topright',
    //   }
    // ).addTo(this.map)
    // L.easyButton(
    //   '<i><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>video-3d</title><path d="M5,7H9A2,2 0 0,1 11,9V15A2,2 0 0,1 9,17H5V15H9V13H6V11H9V9H5V7M13,7H16A3,3 0 0,1 19,10V14A3,3 0 0,1 16,17H13V7M16,15A1,1 0 0,0 17,14V10A1,1 0 0,0 16,9H15V15H16Z" /></svg></i>',
    //   (btn, map) => {
    //     if (maplibreMap.getTerrain()) {
    //       maplibreMap.setTerrain(null)
    //     } else {
    //       maplibreMap.setTerrain()
    //     }
    //   },
    //   {
    //     position: 'topright',
    //   }
    // ).addTo(this.map)

    this.map.on('click', (e) => {
      const placeholder = document.createElement('div')
      const root = createRoot(placeholder)
      root.render(this.MapPopup(this.state.showInfoPopup))
      this.setState({
        // showPopup: true,
        showInfoPopup: true,
        latLng: e.lngLat,
      })
      if (!this.mapPopup) {
        this.mapPopup = new maplibregl.Popup()
          .setDOMContent(placeholder as any)
          .setLngLat(e.lngLat)
          .addTo(this.map)
      } else {
        this.closeMapPopup()
      }
    })
    // const popup = L.popup({ className: 'valhalla-popup' })

    // this.map.on('popupclose', (event) => {
    //   this.setState({ hasCopied: false, locate: [] })
    // })

    // this.map.on('contextmenu', (event) => {
    //   popup.setLatLng(event.latlng).openOn(this.map)
    //   this.setState({
    //     // showPopup: true,
    //     showInfoPopup: true,
    //     latLng: event.latlng,
    //   })
    //   popup.update()
    // })

    this.map.on('moveend', () => {
      const last_coords = this.map.getCenter()
      const zoom_level = this.map.getZoom()
      const last_center = JSON.stringify({
        center: [last_coords.lng, last_coords.lat],
        zoom_level: zoom_level,
      })
      localStorage.setItem('last_center', last_center)
      if (!ignoreNextMove) {
        if (window.history.state) {
          window.history.replaceState(
            { currentReplaced: window.history.state.currentReplaced },
            null,
            window.history.state.currentReplaced +
              `/#map=${zoom_level}/${last_coords.lat.toFixed(
                3
              )}/${last_coords.lng.toFixed(3)}`
          )
        } else {
          ignoreNextChange = true
          window.location.href =
            window.location.protocol +
            '//' +
            window.location.host +
            `/#map=${zoom_level}/${last_coords.lat.toFixed(
              3
            )}/${last_coords.lng.toFixed(3)}`
        }
      }
      ignoreNextMove = false
    })
  }

  shouldComponentUpdate(nextProps, nextState) {
    if (
      // we want to make sure only the addresses are compared

      !R.equals(
        this.props.directions.selectedAddresses,
        nextProps.directions.selectedAddresses
        // ) ||
        // !R.equals(
        //   this.props.isochrones.selectedAddress,
        //   nextProps.isochrones.selectedAddress
      )
    ) {
      return true
    }

    // if (this.state.showPopup || nextState.showPopup) {
    //   return true
    // }

    if (this.props.directions.successful !== nextProps.directions.successful) {
      return true
    }

    // if (this.props.isochrones.successful !== nextProps.isochrones.successful) {
    //   return true
    // }

    if (
      !R.equals(this.props.directions.results, nextProps.directions.results)
    ) {
      return true
    }

    if (
      !R.equals(
        this.props.directions.highlightSegment,
        nextProps.directions.highlightSegment
      )
    ) {
      return true
    }

    if (
      !R.equals(this.props.directions.zoomObj, nextProps.directions.zoomObj)
    ) {
      return true
    }

    // if (
    //   !R.equals(this.props.isochrones.results, nextProps.isochrones.results)
    // ) {
    //   return true
    // }

    if (!R.equals(this.props.showRestrictions, nextProps.showRestrictions)) {
      return true
    }

    if (!R.equals(this.props.coordinates, nextProps.coordinates)) {
      return true
    }

    if (this.props.activeDataset !== nextProps.activeDataset) {
      return true
    }

    return false
  }

  componentDidUpdate = (prevProps, prevState) => {
    this.addWaypoints()
    // this.addIsoCenter()
    // this.addIsochrones()

    if (!R.equals(this.props.coordinates, prevProps.coordinates)) {
      this.zoomToCoordinates()
    }
    if (
      prevProps.directions.zoomObj.timeNow <
      this.props.directions.zoomObj.timeNow
    ) {
      this.zoomTo(
        this.props.directions.zoomObj.routeIndex,
        this.props.directions.zoomObj.index
      )
    }

    this.addRoutes()
    this.handleHighlightSegment()

    const { directions /* , isochrones */ } = this.props

    if (!directions.successful) {
      this.clearSource('routeLineString')
      // routeLineStringLayer.clearLayers()
    }
    // if (!isochrones.successful) {
    //   isoPolygonLayer.clearLayers()
    //   isoLocationsLayer.clearLayers()
    // }
  }

  zoomToCoordinates = () => {
    const { coordinates, showDirectionsPanel, showSettings } = this.props
    const maxZoom = coordinates.length === 1 ? 11 : 18
    const bounds = new LngLatBounds()
    coordinates.forEach((coordinate) => bounds.extend(coordinate))
    this.map.fitBounds(bounds, {
      maxDuration: 500,
      padding: {
        top: screen.width < 550 ? 50 : showDirectionsPanel ? 420 : 50,
        left: 50,
        right: 50,
        bottom: screen.width < 550 ? 50 : showSettings ? 420 : 50,
      },
      maxZoom,
    })
  }

  zoomTo = (routeIndex, idx) => {
    const { results } = this.props.directions
    let coords
    if (routeIndex == 0) {
      coords = results[VALHALLA_OSM_URL].data.decodedGeometry
    } else {
      coords =
        results[VALHALLA_OSM_URL].data.alternates[routeIndex - 1]
          .decodedGeometry
    }
    console.log('zoomTo', routeIndex, idx, coords[idx])
    // const coords = results[VALHALLA_OSM_URL].data.decodedGeometry

    // this.map.setCenter(coords[idx])
    this.map.flyTo({
      center: coords[idx],
      zoom: 17,
    })

    // const highlightMarker = ExtraMarkers.icon({
    //   icon: 'fa-coffee',
    //   markerColor: 'blue',
    //   shape: 'circle',
    //   prefix: 'fa',
    //   iconColor: 'white',
    // })

    // this.addFeatureToSource('highlightRouteIndex', {
    //   type:'Feature',
    //   geometry: {
    //     type: "Point",
    // coordinates: coords[idx]
    //   }, properties:{

    //   }
    // })

    const marker = new FontawesomeMarker({
      icon: 'fa-coffee',
      iconColor: 'white',
      color: 'blue',
    })
      .setLngLat(coords[idx])
      .addTo(this.map)
    // L.marker(coords[idx], {
    //   icon: highlightMarker,
    //   pmIgnore: true,
    // }).addTo(highlightRouteIndexLayer)

    setTimeout(() => {
      // this.clearSource('highlightRouteIndex')
      marker.remove()
      // highlightRouteIndexLayer.clearLayers()
    }, 1000)
  }

  // getIsoTooltip = (contour, area, provider) => {
  //   return `
  //   <div class="ui list">
  //       <div class="item">
  //       <div class="header">
  //           Isochrone Summary
  //       </div>
  //       </div>
  //       <div class="item">
  //         <i class="time icon"></i>
  //         <div class="content">
  //           ${contour} mins
  //         </div>
  //       </div>
  //       <div class="item">
  //         <i class="arrows alternate icon"></i>
  //         <div class="content">
  //           ${area} km2
  //         </div>
  //       </div>
  //     </div>
  //   `
  // }

  // getIsoLocationTooltip = () => {
  //   return `
  //   <div class="ui list">
  //       <div class="item">
  //         Snapped location
  //       </div>
  //     </div>
  //   `
  // }

  async clearSource(sourceId) {
    const source = this.map.getSource(sourceId) as maplibregl.GeoJSONSource
    source?.setData({
      type: 'FeatureCollection',
      features: [],
    })
  }
  async addFeatureToSource(sourceId, ...features: Feature[]) {
    const source = this.map.getSource(sourceId) as maplibregl.GeoJSONSource
    // if (source) {
    const data = (await source.getData()) as FeatureCollection
    source.setData({
      ...data,
      features: [...data.features, ...features],
    })
    // }
  }
  async setFeatureToSource(sourceId, ...features: Feature[]) {
    const source = this.map.getSource(sourceId) as maplibregl.GeoJSONSource
    if (source) {
      const data = (await source.getData()) as FeatureCollection
      source.setData({
        ...data,
        features: features,
      })
    }
  }
  async updateFeatureCollection(sourceId, featureId, updatedFeature) {
    const source = this.map.getSource(sourceId) as maplibregl.GeoJSONSource
    const data = (await source.getData()) as FeatureCollection
    const featureIndex = data.features.findIndex((f) => f.id === featureId)
    if (featureIndex !== -1) {
      data.features[featureIndex] = {
        ...data.features[featureIndex],
        ...updatedFeature,
      }
      source.setData(data)
    }
  }

  handleHighlightSegment = () => {
    const { highlightSegment, results } = this.props.directions

    const { startIndex, endIndex, routeIndex } = highlightSegment
    console.log('handleHighlightSegment', routeIndex, startIndex, endIndex)
    let coords
    if (routeIndex == 0) {
      coords = results[VALHALLA_OSM_URL].data.decodedGeometry
    } else {
      coords =
        results[VALHALLA_OSM_URL].data.alternates[routeIndex - 1]
          .decodedGeometry
    }
    if (startIndex > -1 && endIndex > -1) {
      this.setFeatureToSource('highlightRouteIndex', {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: coords.slice(startIndex, endIndex + 1),
        },
        properties: {
          lineColor: 'yellow',
          lineWidth: 4,
        },
      })
      // L.polyline(coords.slice(startIndex, endIndex + 1), {
      //   color: 'yellow',
      //   weight: 4,
      //   opacity: 1,
      //   pmIgnore: true,
      // }).addTo(highlightRouteSegmentlayer)
    } else {
      this.clearSource('highlightRouteIndex')
      // highlightRouteSegmentlayer.clearLayers()
    }
  }

  handleCopy = () => {
    this.setState({ hasCopied: true })
    setTimeout(() => {
      this.setState({ hasCopied: false })
    }, 1000)
  }

  // addIsochrones = () => {
  //   const { results } = this.props.isochrones
  //   isoPolygonLayer.clearLayers()
  //   isoLocationsLayer.clearLayers()

  //   for (const provider of [VALHALLA_OSM_URL]) {
  //     if (
  //       Object.keys(results[provider].data).length > 0 &&
  //       results[provider].show
  //     ) {
  //       for (const feature of results[provider].data.features) {
  //         const coords_reversed = []
  //         for (const latLng of feature.geometry.coordinates) {
  //           coords_reversed.push([latLng[1], latLng[0]])
  //         }
  //         if (['Polygon', 'MultiPolygon'].includes(feature.geometry.type)) {
  //           L.geoJSON(feature, {
  //             style: (feat) => ({
  //               ...feat.properties,
  //               color: '#fff',
  //               opacity: 1,
  //             }),
  //           })
  //             .bindTooltip(
  //               this.getIsoTooltip(
  //                 feature.properties.contour,
  //                 feature.properties.area.toFixed(2),
  //                 provider
  //               ),
  //               {
  //                 permanent: false,
  //                 sticky: true,
  //               }
  //             )
  //             .addTo(isoPolygonLayer)
  //         } else {
  //           // locations

  //           if (feature.properties.type === 'input') {
  //             return
  //           }
  //           L.geoJSON(feature, {
  //             pointToLayer: (feat, ll) => {
  //               return L.circleMarker(ll, {
  //                 radius: 6,
  //                 color: '#000',
  //                 fillColor: '#fff',
  //                 fill: true,
  //                 fillOpacity: 1,
  //               }).bindTooltip(this.getIsoLocationTooltip(), {
  //                 permanent: false,
  //                 sticky: true,
  //               })
  //             },
  //           }).addTo(isoLocationsLayer)
  //         }
  //       }
  //     }
  //   }
  // }

  getRouteToolTip = (summary, provider) => {
    return `
    <div class="ui list">
        <div class="item">
          <div class="header">
              Route Summary
          </div>
        </div>
        <div class="item">
          <i class="arrows alternate horizontal icon"></i>
          <div class="content">
            ${summary.length.toFixed(summary.length > 1000 ? 0 : 1)} km
          </div>
        </div>
        <div class="item">
          <i class="time icon"></i>
          <div class="content">
            ${formatDuration(summary.time)}
          </div>
        </div>
      </div>
    `
  }

  addRoutes = () => {
    const { results } = this.props.directions
    // routeLineStringLayer.clearLayers()
    if (Object.keys(results[VALHALLA_OSM_URL].data).length > 0) {
      const response = results[VALHALLA_OSM_URL].data
      const routes = [response].concat(response.alternates || [])
      // show alternates if they exist on the respsonse
      // if (response.alternates) {
      const nbRoutes = routes.length
      const features: Feature[] = []
      for (let i = 0; i < nbRoutes; i++) {
        const alternate = routes[i]
        const coords = alternate.decodedGeometry
        const summary = alternate.trip.summary
        const shouldShow = results[VALHALLA_OSM_URL].show[i]

        if (!shouldShow) {
          continue
        }
        features.push(
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: coords,
            },
            properties: {
              lineColor: '#FFF',
              summary,
              lineWidth: 9,
            },
          },
          {
            type: 'Feature',
            geometry: {
              type: 'LineString',
              coordinates: coords,
            },
            properties: {
              lineColor: routeObjects[VALHALLA_OSM_URL].color,
              lineWidth: 5,
              summary,
            },
          }
        )
      }
      this.setFeatureToSource('routeLineString', ...features)
    } else {
      this.clearSource('routeLineString')
    }
  }
  closeMapPopup() {
    if (this.mapPopup) {
      this.setState({ hasCopied: false, locate: [] })
      this.mapPopup.remove()
      this.mapPopup = null
    }
  }
  handleAddWaypoint = (data, e) => {
    this.closeMapPopup()
    this.routeLineStringPopup?.remove()
    this.updateWaypointPosition({
      latLng: this.state.latLng,
      index: e.index,
    })
  }

  handleAddIsoWaypoint = (data, e) => {
    this.routeLineStringPopup?.remove()
    const { latLng } = this.state
    this.updateIsoPosition(latLng)
  }

  // updateExcludePolygons() {
  // const excludePolygons = []
  // excludePolygonsLayer.eachLayer((layer) => {
  //   const lngLatArray = []
  //   for (const coords of layer._latlngs[0]) {
  //     lngLatArray.push([coords.lng, coords.lat])
  //   }
  //   excludePolygons.push(lngLatArray)
  // })
  // const { dispatch } = this.props
  // const name = 'exclude_polygons'
  // const value = excludePolygons
  // dispatch(
  //   updateSettings({
  //     name,
  //     value,
  //   })
  // )
  // }

  updateWaypointPosition(object) {
    const { dispatch } = this.props
    dispatch(fetchReverseGeocode(object))
  }

  updateIsoPosition(coord) {
    const { dispatch } = this.props
    dispatch(fetchReverseGeocodeIso(coord.lng, coord.lat))
  }

  // addIsoCenter = () => {
  //   isoCenterLayer.clearLayers()
  //   const { geocodeResults } = this.props.isochrones
  //   for (const address of geocodeResults) {
  //     if (address.selected) {
  //       const isoMarker = ExtraMarkers.icon({
  //         icon: 'fa-number',
  //         markerColor: 'purple',
  //         shape: 'star',
  //         prefix: 'fa',
  //         number: '1',
  //       })

  //       L.marker([address.displaylnglat[1], address.displaylnglat[0]], {
  //         icon: isoMarker,
  //         draggable: true,
  //         pmIgnore: true,
  //       })
  //         .addTo(isoCenterLayer)
  //         .bindTooltip(address.title, { permanent: false })
  //         //.openTooltip()
  //         .on('dragend', (e) => {
  //           this.updateIsoPosition(e.target.getLatLng())
  //         })
  //     }
  //   }
  // }

  getLocate(latlng) {
    const { profile } = this.props
    this.setState({ isLocateLoading: true })
    axios
      .post(VALHALLA_OSM_URL + '/locate', buildLocateRequest(latlng, profile), {
        headers: {
          'Content-Type': 'application/json',
        },
      })
      .then(({ data }) => {
        this.setState({ locate: data, isLocateLoading: false })
      })
      .catch(({ response }) => {
        console.log(response)
      })
  }

  getHeightData = () => {
    const { results } = this.props.directions
    const { dispatch } = this.props

    const heightPayload = buildHeightRequest(
      results[VALHALLA_OSM_URL].data.decodedGeometry
    )

    if (!R.equals(this.state.heightPayload, heightPayload)) {
      // this.hg._removeChart()
      this.setState({ isHeightLoading: true, heightPayload })
      axios
        .post(VALHALLA_OSM_URL + '/height', heightPayload, {
          headers: {
            'Content-Type': 'application/json',
          },
        })
        .then(({ data }) => {
          this.setState({ isHeightLoading: false })
          // lets build geojson object with steepness for the height graph
          const reversedGeometry = JSON.parse(
            JSON.stringify(results[VALHALLA_OSM_URL].data.decodedGeometry)
          ).map((pair) => {
            return [...pair.reverse()]
          })
          const heightData = buildHeightgraphData(
            reversedGeometry,
            data.range_height
          )
          const { inclineTotal, declineTotal } = heightData[0].properties
          dispatch(
            updateInclineDeclineTotal({
              inclineTotal,
              declineTotal,
            })
          )

          // this.hg.addData(heightData)
        })
        .catch(({ response }) => {
          console.log(response)
        })
    }
  }

  getHeight(latLng) {
    this.setState({ isHeightLoading: true })
    axios
      .post(
        VALHALLA_OSM_URL + '/height',
        buildHeightRequest([[latLng.lat, latLng.lng]]),
        {
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
      .then(({ data }) => {
        if ('height' in data) {
          this.setState({
            elevation: data.height[0] + ' m',
            isHeightLoading: false,
          })
        }
      })
      .catch(({ response }) => {
        console.log(response)
      })
  }

  addWaypoints() {
    this.waypointMarkers.forEach((m) => m.remove())
    this.waypointMarkers = []
    // this.clearSource('routeMarkers')
    // routeMarkersLayer.clearLayers()
    const { waypoints } = this.props.directions
    let index = 0
    for (const waypoint of waypoints) {
      for (const address of waypoint.geocodeResults) {
        if (address.selected) {
          const wpMarker = new FontawesomeMarker({
            icon: 'fa-coffee',
            iconColor: 'white',
            color: 'green',
            draggable: true,
            number: (index + 1).toString(),
          })
          this.waypointMarkers.push(wpMarker)
          wpMarker
            .setLngLat(address.displaylnglat)
            .addTo(this.map)
            .on('dragend', (e) => {
              this.updateWaypointPosition({
                latLng: e.target.getLatLng(),
                index: e.target.options.index,
                fromDrag: true,
              })
            })
          // .on('click', (e) => {

          // })
          // const wpMarker = ExtraMarkers.icon({
          //   icon: 'fa-number',
          //   markerColor: 'green',
          //   //shape: 'star',
          //   prefix: 'fa',
          //   number: (index + 1).toString(),
          // })

          // L.marker([address.displaylnglat[1], address.displaylnglat[0]], {
          //   icon: wpMarker,
          //   draggable: true,
          //   index: index,
          //   pmIgnore: true,
          // })
          //   .addTo(routeMarkersLayer)
          // .bindTooltip(address.title, {
          //   permanent: false,
          // })
          // //.openTooltip()
          // .on('dragend', (e) => {
          //   this.updateWaypointPosition({
          //     latLng: e.target.getLatLng(),
          //     index: e.target.options.index,
          //     fromDrag: true,
          //   })
          // })
        }
      }
      index += 1
    }
  }

  handleOpenOSM = () => {
    const { map } = this
    const { lat, lng } = map.getCenter()
    const zoom = map.getZoom()
    const osmURL = `https://www.openstreetmap.org/#map=${zoom}/${lat}/${lng}`
    window.open(osmURL, '_blank')
  }
  MapPopup(isInfo: boolean) {
    const { activeTab } = this.props
    return (
      <React.Fragment>
        {isInfo ? (
          <React.Fragment>
            <div className="mt1 flex">
              <Button.Group size="small" labeled vertical icon>
                <Button
                  icon="flag"
                  content="Directions from here"
                  index={0}
                  onClick={this.handleAddWaypoint}
                />
                <Button
                  icon="map marker alternate"
                  content="Add as via point"
                  index={1}
                  onClick={this.handleAddWaypoint}
                />
                <Button
                  icon="flag checkered"
                  content="Directions to here"
                  index={-1}
                  onClick={this.handleAddWaypoint}
                />
              </Button.Group>
            </div>
            <div className="mt1 flex">
              <Button.Group basic size="tiny">
                <Popup
                  size="tiny"
                  content="Longitude, Latitude"
                  trigger={
                    <Button
                      compact
                      content={
                        this.state.latLng.lng.toFixed(6) +
                        ', ' +
                        this.state.latLng.lat.toFixed(6)
                      }
                    />
                  }
                />
                <CopyToClipboard
                  text={
                    this.state.latLng.lng.toFixed(6) +
                    ',' +
                    this.state.latLng.lat.toFixed(6)
                  }
                  onCopy={this.handleCopy}
                >
                  <Button compact icon="copy" />
                </CopyToClipboard>
              </Button.Group>
            </div>

            <div className="mt1 flex">
              <Button.Group basic size="tiny">
                <Popup
                  size="tiny"
                  content="Latitude, Longitude"
                  trigger={
                    <Button
                      compact
                      content={
                        convertDDToDMS(this.state.latLng.lat) +
                        ' N ' +
                        convertDDToDMS(this.state.latLng.lng) +
                        ' E'
                      }
                    />
                  }
                />
                <CopyToClipboard
                  text={
                    convertDDToDMS(this.state.latLng.lat) +
                    ' N ' +
                    convertDDToDMS(this.state.latLng.lng) +
                    ' E'
                  }
                  onCopy={this.handleCopy}
                >
                  <Button compact icon="copy" />
                </CopyToClipboard>
              </Button.Group>
            </div>

            <div className="mt1">
              <Button.Group basic size="tiny">
                <Popup
                  size="tiny"
                  content="Calls Valhalla's Locate API"
                  trigger={
                    <Button
                      onClick={() => this.getLocate(this.state.latLng)}
                      compact
                      loading={this.state.isLocateLoading}
                      icon="cogs"
                      content="Locate Point"
                    />
                  }
                />
                <CopyToClipboard
                  text={JSON.stringify(this.state.locate)}
                  onCopy={this.handleCopy}
                >
                  <Button
                    disabled={this.state.locate.length === 0}
                    compact
                    icon="copy"
                  />
                </CopyToClipboard>
              </Button.Group>
            </div>
            <div className="mt1">
              <Button.Group basic size="tiny">
                <Popup
                  size="tiny"
                  content="Copies a Valhalla location object to clipboard which you can use for your API requests"
                  trigger={
                    <Button
                      compact
                      icon="map marker alternate"
                      content="Valhalla Location JSON"
                    />
                  }
                />
                <CopyToClipboard
                  text={`{
                      "lon": ${this.state.latLng.lng.toFixed(6)},
                      "lat": ${this.state.latLng.lat.toFixed(6)}
                    }`}
                  onCopy={this.handleCopy}
                >
                  <Button compact icon="copy" />
                </CopyToClipboard>
              </Button.Group>
            </div>
            <div className="mt1 flex justify-between">
              <Popup
                size="tiny"
                content="Elevation at this point"
                trigger={
                  <Button
                    basic
                    onClick={() => this.getHeight(this.state.latLng)}
                    compact
                    size="tiny"
                    loading={this.state.isHeightLoading}
                    icon="resize vertical"
                    content={this.state.elevation ?? 'get height'}
                  />
                }
              />

              <div>
                {this.state.hasCopied && (
                  <Label size="mini" basic color="green">
                    <Icon name="checkmark" /> copied
                  </Label>
                )}
              </div>
            </div>
          </React.Fragment>
        ) : activeTab === 0 ? (
          <React.Fragment>
            <Button.Group size="small" basic vertical>
              <Button compact index={0} onClick={this.handleAddWaypoint}>
                Directions from here
              </Button>
              <Button compact index={1} onClick={this.handleAddWaypoint}>
                Add as via point
              </Button>
              <Button compact index={-1} onClick={this.handleAddWaypoint}>
                Directions to here
              </Button>
            </Button.Group>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <Button.Group size="small" basic vertical>
              <Button index={0} onClick={this.handleAddIsoWaypoint}>
                Set center here
              </Button>
            </Button.Group>
          </React.Fragment>
        )}
      </React.Fragment>
    )
  }
  render() {
    return (
      <React.Fragment>
        <div>
          <ToastContainer
            position="bottom-center"
            autoClose={5000}
            limit={1}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
          />
          <div id="map" className="map-style"></div>

          <form
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              width: 200,
              zIndex: 1000,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            <select
              defaultValue={this.state.currentStyle}
              onChange={(event) => {
                const currentStyle = event.target.value
                this.setState({ currentStyle: currentStyle })
                localStorage.setItem('last_style', currentStyle)
                this.map.setStyle(
                  `${VECTOR_TILE_URL}/styles/${currentStyle}/style.json`
                )
              }}
            >
              {styles.map((style) => (
                <option key={style} value={style}>
                  {style}
                </option>
              ))}
            </select>
          </form>
        </div>
      </React.Fragment>
    )
  }
}

const mapStateToProps = (state) => {
  const { directions, isochrones, common } = state
  const {
    activeTab,
    profile,
    showRestrictions,
    activeDataset,
    coordinates,
    showDirectionsPanel,
    showSettings,
  } = common
  return {
    directions,
    isochrones,
    profile,
    coordinates,
    activeTab,
    activeDataset,
    showRestrictions,
    showDirectionsPanel,
    showSettings,
  }
}

export default connect(mapStateToProps)(Map)
