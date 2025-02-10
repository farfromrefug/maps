import React from 'react'
import { createRoot } from 'react-dom/client'

import { createStore, applyMiddleware } from 'redux'
import { composeWithDevTools } from 'redux-devtools-extension'
import { Provider } from 'react-redux'
import thunk from 'redux-thunk'

import reducer from './reducers'
import App from './App'
import './index.css' // postCSS import of CSS module

const middleware = [thunk]

const store = createStore(
  reducer,
  composeWithDevTools(applyMiddleware(...middleware))
)
const root = createRoot(document.getElementById('valhalla-app-root'))
root.render(
  <Provider store={store}>
    {' '}
    <App />
  </Provider>
)
