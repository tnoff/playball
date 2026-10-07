/**
 * Minimal React renderer for blessed, adapted from react-blessed (MIT,
 * Yomguithereal/react-blessed). react-blessed is unmaintained and pinned to
 * React 17; this keeps the same host behavior on the React 19 reconciler.
 */
import React from 'react';
import Reconciler from 'react-reconciler';
import { ConcurrentRoot, DefaultEventPriority, NoEventPriority } from 'react-reconciler/constants.js';
import blessed from 'blessed';
import debounce from 'lodash/debounce.js';
import omit from 'lodash/omit.js';

import eventListener from './events.js';
import update from './update.js';
import solveClass from './solveClass.js';

const emptyObject = {};
const BLESSED_PREFIX = 'blessed-';

let screenRef = null;
let currentUpdatePriority = NoEventPriority;

const hostProps = (props) => omit(solveClass(props), 'children');

const destroyInstance = (parent, child) => {
  parent.remove(child);
  child.off('event', child._eventListener);
  child.forDescendants((el) => {
    el.off('event', child._eventListener);
  });
  child.destroy();
};

const hostConfig = {
  supportsMutation: true,
  supportsPersistence: false,
  supportsHydration: false,
  isPrimaryRenderer: true,

  getRootHostContext: () => emptyObject,
  getChildHostContext: () => emptyObject,
  getPublicInstance: (instance) => instance,

  createInstance(type, props) {
    const appliedProps = hostProps(props);
    if (type.startsWith(BLESSED_PREFIX)) {
      type = type.slice(BLESSED_PREFIX.length);
    }
    const instance = blessed[type]({ ...appliedProps, screen: screenRef });
    instance.props = props;
    instance._eventListener = (...args) => eventListener(instance, ...args);
    instance.on('event', instance._eventListener);
    return instance;
  },

  createTextInstance: (text) => blessed.text({ content: text, screen: screenRef }),

  appendInitialChild: (parent, child) => parent.append(child),

  finalizeInitialChildren(instance, type, props) {
    const appliedProps = hostProps(props);
    update(instance, appliedProps);
    instance.props = props;
    return false;
  },

  shouldSetTextContent: () => false,

  prepareForCommit: () => null,
  resetAfterCommit() {},
  preparePortalMount() {},

  commitUpdate(instance, type, oldProps, newProps) {
    const appliedProps = hostProps(newProps);
    instance._updating = true;
    update(instance, appliedProps);
    // update event handler pointers
    instance.props = newProps;
    instance._updating = false;
    instance.screen.debouncedRender();
  },

  commitTextUpdate(textInstance, oldText, newText) {
    textInstance.setContent(newText);
    textInstance.screen.debouncedRender();
  },

  appendChild: (parent, child) => parent.append(child),
  appendChildToContainer: (parent, child) => parent.append(child),
  // Everything is absolutely positioned, so insertBefore ~= append.
  insertBefore: (parent, child) => parent.append(child),
  insertInContainerBefore: (parent, child) => parent.append(child),
  removeChild: destroyInstance,
  removeChildFromContainer: destroyInstance,

  resetTextContent: (instance) => instance.setContent(''),
  clearContainer: (container) => container.render(),

  hideInstance() {},
  unhideInstance() {},
  hideTextInstance() {},
  unhideTextInstance() {},

  scheduleTimeout: setTimeout,
  cancelTimeout: clearTimeout,
  noTimeout: -1,
  supportsMicrotasks: true,
  scheduleMicrotask: queueMicrotask,

  getInstanceFromNode: () => null,
  getInstanceFromScope: () => null,
  prepareScopeUpdate() {},
  beforeActiveInstanceBlur() {},
  afterActiveInstanceBlur() {},
  detachDeletedInstance() {},

  // Priorities / transitions: no DOM events, so everything is default priority.
  setCurrentUpdatePriority: (priority) => { currentUpdatePriority = priority; },
  getCurrentUpdatePriority: () => currentUpdatePriority,
  resolveUpdatePriority: () => currentUpdatePriority === NoEventPriority
    ? DefaultEventPriority
    : currentUpdatePriority,
  shouldAttemptEagerTransition: () => false,
  trackSchedulerEvent() {},
  resolveEventType: () => null,
  resolveEventTimeStamp: () => -1.1,
  requestPostPaintCallback() {},
  NotPendingTransition: null,
  HostTransitionContext: React.createContext(null),
  resetFormInstance() {},

  // No suspensey commits.
  maySuspendCommit: () => false,
  preloadInstance: () => true,
  startSuspendingCommit() {},
  suspendInstance() {},
  waitForCommitToBeReady: () => null,
};

const reconciler = Reconciler(hostConfig);
const roots = new Map();

const reportError = (error) => {
  // Match blessed apps' behavior: surface it through the process error path
  // (main.js logs uncaughtException) instead of swallowing it.
  setTimeout(() => { throw error; });
};

export function render(element, screen, callback) {
  screenRef = screen;

  let root = roots.get(screen);
  if (!root) {
    root = reconciler.createContainer(
      screen,
      ConcurrentRoot,
      null,
      false,
      null,
      '',
      reportError,
      reportError,
      reportError,
      null
    );
    roots.set(screen, root);

    screen.once('destroy', () => {
      reconciler.updateContainer(null, root, null, null);
      roots.delete(screen);
    });
  }

  // render at most every 16ms
  screen.debouncedRender = debounce(() => screen.render(), 16);
  reconciler.updateContainer(element, root, null, callback);
  screen.debouncedRender();
  return reconciler.getPublicRootInstance(root);
}
