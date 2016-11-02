let _matcher;
let _level = 0;
let _id = 0;
let _handlers = {};
let _delegatorInstances = {};

function _addEvent (delegator, type, callback) {
    // blur and focus do not bubble up but if you use event capturing
    // then you will get them
  let useCapture = type === 'blur' || type === 'focus';
  delegator.element.addEventListener(type, callback, useCapture);
}

function _cancel (e) {
  e.preventDefault();
  e.stopPropagation();
}

/**
 * returns function to use for determining if an element
 * matches a query selector
 *
 * @returns {Function}
 */
function _getMatcher (element) {
  if (_matcher) {
    return _matcher;
  }

  if (element.matches) {
    _matcher = element.matches;
    return _matcher;
  }

  if (element.webkitMatchesSelector) {
    _matcher = element.webkitMatchesSelector;
    return _matcher;
  }

  if (element.mozMatchesSelector) {
    _matcher = element.mozMatchesSelector;
    return _matcher;
  }

  if (element.msMatchesSelector) {
    _matcher = element.msMatchesSelector;
    return _matcher;
  }

  if (element.oMatchesSelector) {
    _matcher = element.oMatchesSelector;
    return _matcher;
  }

    // if it doesn't match a native browser method
    // fall back to the delegator function
  _matcher = EventDelegator.matchesSelector;
  return _matcher;
}

/**
 * determines if the specified element matches a given selector
 *
 * @param {Node} element - the element to compare against the selector
 * @param {string} selector
 * @param {Node} boundElement - the element the listener was attached to
 * @returns {void|Node}
 */
function _matchesSelector (element, selector, boundElement) {
    // no selector means this event was bound directly to this element
  if (selector === '_root') {
    return boundElement;
  }

    // if we have moved up to the element you bound the event to
    // then we have come too far
  if (element === boundElement) {
    return;
  }

    // if this is a match then we are done!
  if (_getMatcher(element).call(element, selector)) {
    return element;
  }

    // if this element did not match but has a parent we should try
    // going up the tree to see if any of the parent elements match
    // for example if you are looking for a click on an <a> tag but there
    // is a <span> inside of the a tag that it is the target,
    // it should still work
  if (element.parentNode) {
    _level++;
    return _matchesSelector(element.parentNode, selector, boundElement);
  }
}

function _addHandler (delegator, event, selector, callback) {
  if (!_handlers[delegator.id]) {
    _handlers[delegator.id] = {};
  }

  if (!_handlers[delegator.id][event]) {
    _handlers[delegator.id][event] = {};
  }

  if (!_handlers[delegator.id][event][selector]) {
    _handlers[delegator.id][event][selector] = [];
  }

  _handlers[delegator.id][event][selector].push(callback);
}

function _removeHandler (delegator, event, selector, callback) {
    // if there are no events tied to this element at all
    // then don't do anything
  if (!_handlers[delegator.id]) {
    return;
  }

    // if there is no event type specified then remove all events
    // example: EventDelegator(element).off()
  if (!event) {
    for (let type in _handlers[delegator.id]) {
      if (_handlers[delegator.id].hasOwnProperty(type)) {
        _handlers[delegator.id][type] = {};
      }
    }
    return;
  }

    // if no callback or selector is specified remove all events of this type
    // example: EventDelegator(element).off('click')
  if (!callback && !selector) {
    _handlers[delegator.id][event] = {};
    return;
  }

    // if a selector is specified but no callback remove all events
    // for this selector
    // example: EventDelegator(element).off('click', '.sub-element')
  if (!callback) {
    delete _handlers[delegator.id][event][selector];
    return;
  }

    // if we have specified an event type, selector, and callback then we
    // need to make sure there are callbacks tied to this selector to
    // begin with.  if there aren't then we can stop here
  if (!_handlers[delegator.id][event][selector]) {
    return;
  }

    // if there are then loop through all the callbacks and if we find
    // one that matches remove it from the array
  for (let i = 0; i < _handlers[delegator.id][event][selector].length; i++) {
    if (_handlers[delegator.id][event][selector][i] === callback) {
      _handlers[delegator.id][event][selector].splice(i, 1);
      break;
    }
  }
}

function _handleEvent (id, e, type) {
  if (!_handlers[id][type]) {
    return;
  }

  let target = e.target || e.srcElement;
  let selector;
  let match;
  let matches = {};
  let i = 0;
  let j = 0;

    // find all events that match
  _level = 0;
  for (selector in _handlers[id][type]) {
    if (_handlers[id][type].hasOwnProperty(selector)) {
      match = _matchesSelector(target, selector, _delegatorInstances[id].element);

      if (match && EventDelegator.matchesEvent(type, _delegatorInstances[id].element, match, selector === '_root', e)) {
        _level++;
        _handlers[id][type][selector].match = match;
        matches[_level] = _handlers[id][type][selector];
      }
    }
  }

    // stopPropagation() fails to set cancelBubble to true in Webkit
    // @see http://code.google.com/p/chromium/issues/detail?id=162270
  e.stopPropagation = function () {
    e.cancelBubble = true;
  };

  for (i = 0; i <= _level; i++) {
    if (matches[i]) {
      for (j = 0; j < matches[i].length; j++) {
        if (matches[i][j].call(matches[i].match, e) === false) {
          EventDelegator.cancel(e);
          return;
        }

        if (e.cancelBubble) {
          return;
        }
      }
    }
  }
}

let id = 0;
function nextId () {
  return id++;
}

/**
 * binds the specified events to the element
 *
 * @param {string|Array} events
 * @param {string} selector
 * @param {Function} callback
 * @param {boolean=} remove
 * @returns {Object}
 */
function _bind (events, selector, callback, remove) {
    // fail silently if you pass null or undefined as an alement
    // in the EventDelegator constructor
  if (!this.element) {
    return;
  }

  if (!(events instanceof Array)) {
    events = [events];
  }

  if (!callback && typeof (selector) === 'function') {
    callback = selector;
    selector = '_root';
  }

  if (selector instanceof window.HTMLElement) {
    let id;
    if (selector.hasAttribute('xin-event-id')) {
      id = selector.getAttribute('xin-event-id');
    } else {
      id = nextId();
      selector.setAttribute('xin-event-id', id);
    }
    selector = `[xin-event-id="${id}"]`;
  }

  let id = this.id;
  let i;

  function _getGlobalCallback (type) {
    return function (e) {
      _handleEvent(id, e, type);
    };
  }

  for (i = 0; i < events.length; i++) {
    if (remove) {
      _removeHandler(this, events[i], selector, callback);
      continue;
    }

    if (!_handlers[id] || !_handlers[id][events[i]]) {
      EventDelegator.addEvent(this, events[i], _getGlobalCallback(events[i]));
    }

    _addHandler(this, events[i], selector, callback);
  }

  return this;
}

/**
 * EventDelegator object constructor
 *
 * @param {Node} element
 */
function EventDelegator (element, id) {
    // called as function
  if (!(this instanceof EventDelegator)) {
        // only keep one EventDelegator instance per node to make sure that
        // we don't create a ton of new objects if you want to delegate
        // multiple events from the same node
        //
        // for example: EventDelegator(document).on(...
    for (let key in _delegatorInstances) {
      if (_delegatorInstances[key].element === element) {
        return _delegatorInstances[key];
      }
    }

    _id++;
    _delegatorInstances[_id] = new EventDelegator(element, _id);

    return _delegatorInstances[_id];
  }

  this.element = element;
  this.id = id;
}

/**
 * adds an event
 *
 * @param {string|Array} events
 * @param {string} selector
 * @param {Function} callback
 * @returns {Object}
 */
EventDelegator.prototype.on = function (events, selector, callback) {
  return _bind.call(this, events, selector, callback);
};

/**
 * removes an event
 *
 * @param {string|Array} events
 * @param {string} selector
 * @param {Function} callback
 * @returns {Object}
 */
EventDelegator.prototype.off = function (events, selector, callback) {
  return _bind.call(this, events, selector, callback, true);
};

EventDelegator.matchesSelector = function () {};
EventDelegator.cancel = _cancel;
EventDelegator.addEvent = _addEvent;
EventDelegator.matchesEvent = function () {
  return true;
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = EventDelegator;
}

export default EventDelegator;
