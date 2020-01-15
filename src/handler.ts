// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { JupyterFrontEnd } from '@jupyterlab/application';

import { IClientSession, Toolbar, ToolbarButton } from '@jupyterlab/apputils';

import { ConsolePanel } from '@jupyterlab/console';

import { DocumentWidget } from '@jupyterlab/docregistry';

import { FileEditor } from '@jupyterlab/fileeditor';

import { NotebookPanel } from '@jupyterlab/notebook';

import { Session } from '@jupyterlab/services';

import { DebuggerModel } from './model';

import { DebugSession } from './session';

import { IDebugger } from './tokens';

import { ConsoleHandler } from './handlers/console';

import { FileHandler } from './handlers/file';

import { NotebookHandler } from './handlers/notebook';

/**
 * Add a button to the widget toolbar to enable and disable debugging.
 * @param widget The widget to add the debug toolbar button to.
 */
function updateToolbar(
  widget: DebuggerHandler.SessionWidget[DebuggerHandler.SessionType],
  onClick: () => void
) {
  const button = new ToolbarButton({
    className: 'jp-DebuggerSwitchButton',
    iconClassName: 'jp-ToggleSwitch',
    onClick,
    tooltip: 'Enable / Disable Debugger'
  });

  const getToolbar = (): Toolbar => {
    if (!(widget instanceof ConsolePanel)) {
      return widget.toolbar;
    }
    const toolbar = widget.widgets.find(w => w instanceof Toolbar) as Toolbar;
    return toolbar ?? new Toolbar();
  };

  const toolbar = getToolbar();
  const itemAdded = toolbar.addItem('debugger-button', button);
  if (itemAdded && widget instanceof ConsolePanel) {
    widget.insertWidget(0, toolbar);
  }
  return button;
}

/**
 * A handler for debugging a widget.
 */
export class DebuggerHandler {
  /**
   * Instantiate a new DebuggerHandler.
   * @param type The type of the debug handler.
   */
  constructor(options: DebuggerHandler.IOptions) {
    this._type = options.type;
    this._shell = options.shell;
    this._service = options.service;
  }

  /**
   * Dispose all the handlers.
   * @param debug The debug service.
   */
  disposeAll(debug: IDebugger) {
    const handlerIds = Object.keys(this._handlers);
    if (handlerIds.length === 0) {
      return;
    }
    debug.session.dispose();
    debug.session = null;
    handlerIds.forEach(id => {
      this._handlers[id].dispose();
    });
    this._handlers = {};
  }

  /**
   * Update a debug handler for the given widget, and
   * handle kernel changed events.
   * @param debug The debug service.
   * @param widget The widget to update.
   */
  async update(
    widget: DebuggerHandler.SessionWidget[DebuggerHandler.SessionType],
    client: IClientSession | Session.ISession
  ): Promise<void> {
    const updateHandler = async () => {
      return this._update(widget, client);
    };

    // setup handler when the kernel changes
    const kernelChangedHandler = this._kernelChangedHandlers[client.path];
    if (kernelChangedHandler) {
      client.kernelChanged.disconnect(kernelChangedHandler);
    }
    client.kernelChanged.connect(updateHandler);
    this._kernelChangedHandlers[client.path] = updateHandler;

    // setup handler when the status of the kernel changes (restart)
    // TODO: is there a better way to handle restarts?
    let restarted = false;
    const statusChanged = async () => {
      // wait for the first `idle` status after a restart
      if (restarted && client.status === 'idle') {
        restarted = false;
        return updateHandler();
      }
      // handle `starting`, `restarting` and `autorestarting`
      if (client.status.endsWith('starting')) {
        restarted = true;
      }
    };

    const statusChangedHandler = this._statusChangedHandlers[client.path];
    if (statusChangedHandler) {
      client.statusChanged.disconnect(statusChangedHandler);
    }
    client.statusChanged.connect(statusChanged);
    this._statusChangedHandlers[client.path] = statusChanged;

    return updateHandler();
  }

  /**
   * Update a debug handler for the given widget.
   * @param debug The debug service.
   * @param widget The widget to update.
   */
  private async _update(
    widget: DebuggerHandler.SessionWidget[DebuggerHandler.SessionType],
    client: IClientSession | Session.ISession
  ): Promise<void> {
    if (!this._service.model) {
      return;
    }

    const hasFocus = () => {
      return this._shell.currentWidget && this._shell.currentWidget === widget;
    };

    const updateAttribute = () => {
      if (!this._handlers[widget.id]) {
        widget.node.removeAttribute('data-jp-debugger');
        return;
      }
      widget.node.setAttribute('data-jp-debugger', 'true');
    };

    const createHandler = async () => {
      if (this._handlers[widget.id]) {
        return;
      }

      switch (this._type) {
        case 'notebook':
          this._handlers[widget.id] = new NotebookHandler({
            debuggerService: this._service,
            widget: widget as NotebookPanel
          });
          break;
        case 'console':
          this._handlers[widget.id] = new ConsoleHandler({
            debuggerService: this._service,
            widget: widget as ConsolePanel
          });
          break;
        case 'file':
          this._handlers[widget.id] = new FileHandler({
            debuggerService: this._service,
            widget: widget as DocumentWidget<FileEditor>
          });
          break;
        default:
          throw Error(`No handler for the type ${this._type}`);
      }
      updateAttribute();
    };

    const removeHandlers = () => {
      const handler = this._handlers[widget.id];
      if (!handler) {
        return;
      }
      handler.dispose();
      delete this._handlers[widget.id];
      delete this._kernelChangedHandlers[widget.id];
      delete this._statusChangedHandlers[widget.id];

      // clear the model if the handler being removed corresponds
      // to the current active debug session
      if (this._service.session?.client?.path === client.path) {
        const model = this._service.model as DebuggerModel;
        model.clear();
      }

      updateAttribute();
    };

    const addToolbarButton = () => {
      const button = this._buttons[widget.id];
      if (button) {
        return;
      }
      const newButton = updateToolbar(widget, toggleDebugging);
      this._buttons[widget.id] = newButton;
    };

    const removeToolbarButton = () => {
      const button = this._buttons[widget.id];
      if (!button) {
        return;
      }
      button.parent = null;
      button.dispose();
      delete this._buttons[widget.id];
    };

    const toggleDebugging = async () => {
      // bail if the widget doesn't have focus
      if (!hasFocus()) {
        return;
      }

      if (this._service.isStarted) {
        await this._service.stop();
        removeHandlers();
      } else {
        await this._service.restoreState(true);
        await createHandler();
      }
    };

    const debuggingEnabled = await this._service.isAvailable(client);
    if (!debuggingEnabled) {
      removeHandlers();
      removeToolbarButton();
      return;
    }

    // update the active debug session
    if (!this._service.session) {
      this._service.session = new DebugSession({ client: client });
    } else {
      this._service.session.client = client;
    }

    await this._service.restoreState(false);
    addToolbarButton();

    // check the state of the debug session
    if (!this._service.isStarted) {
      removeHandlers();
      return;
    }

    // if the debugger is started but there is no handler, create a new one
    await createHandler();

    // listen to the disposed signals
    widget.disposed.connect(removeHandlers);
    this._service.model.disposed.connect(removeHandlers);
  }

  private _type: DebuggerHandler.SessionType;
  private _shell: JupyterFrontEnd.IShell;
  private _service: IDebugger;
  private _handlers: {
    [id: string]: DebuggerHandler.SessionHandler[DebuggerHandler.SessionType];
  } = {};
  private _kernelChangedHandlers: { [id: string]: () => void } = {};
  private _statusChangedHandlers: { [id: string]: () => void } = {};
  private _buttons: { [id: string]: ToolbarButton } = {};
}

/**
 * A namespace for DebuggerHandler `statics`
 */
export namespace DebuggerHandler {
  /**
   * Instantiation options for a DebuggerHandler.
   */
  export interface IOptions {
    /**
     * The type of session.
     */
    type: SessionType;

    /**
     * The application shell.
     */
    shell: JupyterFrontEnd.IShell;

    /**
     * The debugger service.
     */
    service: IDebugger;
  }

  /**
   * The types of sessions that can be debugged.
   */
  export type SessionType = keyof SessionHandler;

  /**
   * The types of handlers.
   */
  export type SessionHandler = {
    notebook: NotebookHandler;
    console: ConsoleHandler;
    file: FileHandler;
  };

  /**
   * The types of widgets that can be debugged.
   */
  export type SessionWidget = {
    notebook: NotebookPanel;
    console: ConsolePanel;
    file: DocumentWidget;
  };
}
