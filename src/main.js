import React from 'react';
import { Provider } from 'react-redux';
import raf from 'raf';

import screen from './screen.js';
import store from './store/index.js';
import log from './logger.js';

import App from './components/App.js';

export default async function startInterface(options) {
  raf.polyfill();

  process.on('uncaughtException', function(error) {
    log.error('UNCAUGHT EXCEPTION\n' + JSON.stringify(error) + '\n' + error.stack);
  });

  // Imported dynamically so other CLI commands don't pay for (or get held
  // open by) loading the renderer
  const { render } = await import('./renderer/index.js');
  render(
    <Provider store={store}>
      <App replayId={options.replay} defaultDate={options.date} />
    </Provider>, 
    screen()
  );
}
