import React from 'react'
import PropTypes from 'prop-types'
import { connect } from 'react-redux'
import { Segment, Button, Icon } from 'semantic-ui-react'
import togpx from 'togpx'
import jsonFormat from 'json-format'

import { makeRequest } from 'actions/directionsActions'
import { downloadFile } from 'actions/commonActions'
import Summary from './Summary'
import Maneuvers from './Maneuvers'
import { VALHALLA_OSM_URL } from 'utils/valhalla'
import { jsonConfig } from 'Controls/settings-options'

class OutputControl extends React.Component {
  static propTypes = {
    dispatch: PropTypes.func.isRequired,
    profile: PropTypes.string,
    activeTab: PropTypes.number,
    successful: PropTypes.bool,
    results: PropTypes.object,
  }

  constructor(props) {
    super(props)

    const { results } = this.props
    const { data } = results[VALHALLA_OSM_URL]

    let alternates = []

    if (data.alternates) {
      alternates = data.alternates.map((_, i) => i)
    }

    this.state = {
      showResults: {
        '-1': false,
        ...alternates.reduce((acc, v) => ({ ...acc, [v]: false }), {}),
      },
    }
    this.showManeuvers = this.showManeuvers.bind(this)
  }

  // necessary to calculate new routes the tab was changed from isochrone tab
  // need to do this every time, because "profile" is global (otherwise we would
  // calculate new when the profile was changed while being on the iso tab)
  shouldComponentUpdate(nextProps, nextState, nextContext) {
    if (nextProps.activeTab === 0 && this.props.activeTab === 1) {
      nextProps.dispatch(makeRequest())
    }
    return true
  }

  showManeuvers(idx) {
    this.setState({
      showResults: {
        ...this.state.showResults,
        [idx]: !this.state.showResults[idx],
      },
    })
  }

  dateNow() {
    let dtNow = new Date()
    dtNow =
      [dtNow.getMonth() + 1, dtNow.getDate(), dtNow.getFullYear()].join('/') +
      '_' +
      [dtNow.getHours(), dtNow.getMinutes(), dtNow.getSeconds()].join(':')
    return dtNow
  }

  getGeometry(routeIndex) {
    const { results } = this.props
    let coords
    if (routeIndex == 0) {
      coords = results[VALHALLA_OSM_URL].data.decodedGeometry
    } else {
      coords =
        results[VALHALLA_OSM_URL].data.alternates[routeIndex - 1]
          .decodedGeometry
    }
    return coords
  }
  exportToJson = (e) => {
    const { results } = this.props
    const { data } = results[VALHALLA_OSM_URL]
    const formattedData = jsonFormat(data, jsonConfig)
    e.preventDefault()
    downloadFile({
      data: formattedData,
      fileName: 'valhalla-directions_' + this.dateNow() + '.json',
      fileType: 'text/json',
    })
  }

  exportToGeoJson = (routeIndex, e) => {
    const coordinates = this.getGeometry(routeIndex)
    const formattedData = {
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates,
      },
    }
    e.preventDefault()
    downloadFile({
      data: JSON.stringify(formattedData),
      fileName: 'valhalla-directions_' + this.dateNow() + '.geojson',
      fileType: 'text/json',
    })
  }
  exportToGPX = (routeIndex, e) => {
    const coordinates = this.getGeometry(routeIndex)
    const formattedData = togpx({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates,
      },
    })
    e.preventDefault()
    downloadFile({
      data: formattedData,
      fileName: 'valhalla-directions_' + this.dateNow() + '.gpx',
      fileType: 'text/json',
    })
  }

  render() {
    const { results, successful } = this.props

    const data = results[VALHALLA_OSM_URL].data
    const routes = [data].concat(data.alternates || [])
    // if (data.alternates) {
    return routes.map((route, i) => {
      if (!route.trip) {
        return ''
      }
      const legs = route.trip.legs
      return (
        <Segment
          key={`route_${i + 1}`}
          style={{
            margin: '0 1rem 10px',
            display: successful ? 'block' : 'none',
          }}
        >
          <div className={'flex-column'}>
            <Summary
              header={`Route ${i}`}
              idx={i}
              summary={route.trip.summary}
            />
            <div className={'flex justify-between'}>
              <Button
                size="mini"
                toggle
                active={this.state.showResults[i]}
                onClick={() => this.showManeuvers(i)}
              >
                {this.state.showResults[i]
                  ? 'Hide Maneuvers'
                  : 'Show Maneuvers'}
              </Button>
              <div className={'flex'}>
                <div
                  className={'flex pointer'}
                  style={{ alignSelf: 'center' }}
                  onClick={(e) => this.exportToJson(e)}
                >
                  <Icon circular name={'download'} />
                  <div className={'pa1 b f6'}>{'JSON'}</div>
                </div>
                <div
                  className={'ml2 flex pointer'}
                  style={{ alignSelf: 'center' }}
                  onClick={(e) => this.exportToGeoJson(i, e)}
                >
                  <Icon circular name={'download'} />
                  <div className={'pa1 b f6'}>{'GeoJSON'}</div>
                </div>
                <div
                  className={'ml2 flex pointer'}
                  style={{ alignSelf: 'center' }}
                  onClick={(e) => this.exportToGPX(i, e)}
                >
                  <Icon circular name={'download'} />
                  <div className={'pa1 b f6'}>{'GPX'}</div>
                </div>
              </div>
            </div>

            {this.state.showResults[i] ? (
              <div className={'flex-column'}>
                <Maneuvers legs={legs} idx={i} />
              </div>
            ) : null}
          </div>
        </Segment>
      )
    })
  }
}

const mapStateToProps = (state) => {
  const { profile, activeTab } = state.common
  const { successful, results } = state.directions
  return {
    profile,
    activeTab,
    successful,
    results,
  }
}

export default connect(mapStateToProps)(OutputControl)
