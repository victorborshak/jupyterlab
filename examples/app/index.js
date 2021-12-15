// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.
import React, { useEffect, useRef } from 'react';
// import ReactDOM from 'react-dom';
import ReactWebComponent from 'react-web-component';
import { JupyterLab } from '@jupyterlab/application';

// The webpack public path needs to be set before loading the CSS assets.
import { PageConfig } from '@jupyterlab/coreutils';
// eslint-disable-next-line
__webpack_public_path__ = PageConfig.getOption('fullStaticUrl') + '/';

// Load the CSS assets
const styles = import('./build/style.js');

// These extension and mimeExtension imports should match the list of extensions in package.json. They are listed
// separately in package.json so the webpack config Build.ensureAssets step can copy
// extension assets to the build directory. These import statements assume
// the JupyterLab plugins are the default export from each package.
const extensions = [
  import('@jupyterlab/application-extension'),
  import('@jupyterlab/apputils-extension'),
  import('@jupyterlab/celltags-extension'),
  import('@jupyterlab/codemirror-extension'),
  import('@jupyterlab/completer-extension'),
  import('@jupyterlab/console-extension'),
  import('@jupyterlab/csvviewer-extension'),
  import('@jupyterlab/docmanager-extension'),
  import('@jupyterlab/filebrowser-extension'),
  import('@jupyterlab/fileeditor-extension'),
  import('@jupyterlab/help-extension'),
  import('@jupyterlab/imageviewer-extension'),
  import('@jupyterlab/inspector-extension'),
  import('@jupyterlab/launcher-extension'),
  import('@jupyterlab/mainmenu-extension'),
  import('@jupyterlab/markdownviewer-extension'),
  import('@jupyterlab/mathjax2-extension'),
  import('@jupyterlab/notebook-extension'),
  import('@jupyterlab/rendermime-extension'),
  import('@jupyterlab/running-extension'),
  import('@jupyterlab/settingeditor-extension'),
  import('@jupyterlab/shortcuts-extension'),
  import('@jupyterlab/terminal-extension'),
  import('@jupyterlab/theme-dark-extension'),
  import('@jupyterlab/theme-light-extension'),
  import('@jupyterlab/toc-extension'),
  import('@jupyterlab/tooltip-extension'),
  import('@jupyterlab/translation-extension'),
  import('@jupyterlab/ui-components-extension')
];

const mimeExtensions = [
  import('@jupyterlab/json-extension'),
  import('@jupyterlab/pdf-extension')
];

export const JupyterLabComp = () => {
  const rootRef = useRef(null);

  const bootsrapApp = async rootElement => {
    await styles;
    // Initialize JupyterLab with the mime extensions and application extensions.
    const lab = new JupyterLab({
      mimeExtensions: await Promise.all(mimeExtensions),
      rootElement
    });
    lab.registerPluginModules(await Promise.all(extensions));
    /* eslint-disable no-console */
    console.log('Starting app');

    setTimeout(async () => {
      await lab.start();
      console.log('App started, waiting for restore');
      await lab.restored;
      console.log('Example started!');
    }, 1000);
  };

  useEffect(() => {
    if (rootRef.current) {
      console.log('root element', rootRef.current);
      bootsrapApp(rootRef.current);
    }
  }, [rootRef.current]);

  return (
    <div ref={rootRef} id="jupyter-lab">
      Initializing JupyterLab...
    </div>
  );
};

ReactWebComponent.create(<JupyterLabComp />, 'jupyter-lab', true);
// setTimeout(() => {
//   ReactDOM.render(<JupyterLabComp />, document.getElementById('app-id'));
// }, 500);
