'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.bufferDrainEvent = exports.unpipeWritableEvent = exports.pipeWritableEvent = exports.finishWritableEvent = exports.drainWritableEvent = exports.timeoutEvent = exports.disconnectedEvent = exports.connectedEvent = exports.logEvent = exports.errorEvent = exports.default = undefined;

var _setImmediate2 = require('babel-runtime/core-js/set-immediate');

var _setImmediate3 = _interopRequireDefault(_setImmediate2);

var _slicedToArray2 = require('babel-runtime/helpers/slicedToArray');

var _slicedToArray3 = _interopRequireDefault(_slicedToArray2);

var _defineProperty = require('babel-runtime/core-js/object/define-property');

var _defineProperty2 = _interopRequireDefault(_defineProperty);

var _getIterator2 = require('babel-runtime/core-js/get-iterator');

var _getIterator3 = _interopRequireDefault(_getIterator2);

var _typeof2 = require('babel-runtime/helpers/typeof');

var _typeof3 = _interopRequireDefault(_typeof2);

var _getPrototypeOf = require('babel-runtime/core-js/object/get-prototype-of');

var _getPrototypeOf2 = _interopRequireDefault(_getPrototypeOf);

var _classCallCheck2 = require('babel-runtime/helpers/classCallCheck');

var _classCallCheck3 = _interopRequireDefault(_classCallCheck2);

var _createClass2 = require('babel-runtime/helpers/createClass');

var _createClass3 = _interopRequireDefault(_createClass2);

var _possibleConstructorReturn2 = require('babel-runtime/helpers/possibleConstructorReturn');

var _possibleConstructorReturn3 = _interopRequireDefault(_possibleConstructorReturn2);

var _inherits2 = require('babel-runtime/helpers/inherits');

var _inherits3 = _interopRequireDefault(_inherits2);

var _lodash = require('lodash');

var _lodash2 = _interopRequireDefault(_lodash);

var _semver = require('semver');

var _semver2 = _interopRequireDefault(_semver);

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

var _stream = require('stream');

var _codependency = require('codependency');

var _codependency2 = _interopRequireDefault(_codependency);

var _defaults = require('./defaults');

var defaults = _interopRequireWildcard(_defaults);

var _levels = require('./levels');

var levelUtil = _interopRequireWildcard(_levels);

var _text = require('./text');

var _text2 = _interopRequireDefault(_text);

var _serialize = require('./serialize');

var _serialize2 = _interopRequireDefault(_serialize);

var _error = require('./error');

var _ringbuffer = require('./ringbuffer');

var _ringbuffer2 = _interopRequireDefault(_ringbuffer);

var _bunyanstream = require('./bunyanstream');

var _bunyanstream2 = _interopRequireDefault(_bunyanstream);

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var tokenPattern = /[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}/;

var errorEvent = 'error';
var logEvent = 'log';
var connectedEvent = 'connected';
var disconnectedEvent = 'disconnected';
var timeoutEvent = 'timed out';
var drainWritableEvent = 'drain';
var finishWritableEvent = 'finish';
var pipeWritableEvent = 'pipe';
var unpipeWritableEvent = 'unpipe';
var bufferDrainEvent = 'buffer drain';

var getConsoleMethod = function getConsoleMethod(lvl) {
  if (lvl > 3) {
    return 'error';
  } else if (lvl === 3) {
    return 'warn';
  }
  return 'log';
};

var getSafeProp = function getSafeProp(log, prop) {
  var safeProp = prop;
  while (safeProp in log) {
    safeProp = '_' + safeProp;
  }
  return safeProp;
};

var requirePeer = _codependency2.default.register(module);

var Logger = function (_Writable) {
  (0, _inherits3.default)(Logger, _Writable);

  function Logger(opts) {
    (0, _classCallCheck3.default)(this, Logger);

    var _this = (0, _possibleConstructorReturn3.default)(this, (Logger.__proto__ || (0, _getPrototypeOf2.default)(Logger)).call(this, {
      objectMode: true
    }));

    if (_lodash2.default.isUndefined(opts)) {
      throw new _error.BadOptionsError(opts, _text2.default.noOptions());
    }

    if (!_lodash2.default.isObject(opts)) {
      throw new _error.BadOptionsError(opts, _text2.default.optionsNotObj(typeof opts === 'undefined' ? 'undefined' : (0, _typeof3.default)(opts)));
    }

    if (_lodash2.default.isUndefined(opts.token)) {
      throw new _error.BadOptionsError(opts, _text2.default.noToken());
    }

    if (!_lodash2.default.isString(opts.token) || !tokenPattern.test(opts.token)) {
      throw new _error.BadOptionsError(opts, _text2.default.invalidToken(opts.token));
    }

    if (_lodash2.default.isUndefined(opts.writer)) {
      throw new _error.BadOptionsError(opts, _text2.default.noWriter());
    }

    if (!_lodash2.default.isFunction(opts.writer)) {
      throw new _error.BadOptionsError(opts, _text2.default.invalidWriter(opts.writer));
    }

    _this.levels = levelUtil.normalize(opts);

    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      var _loop = function _loop() {
        var lvlName = _step.value;

        if (lvlName in _this) {
          throw new _error.BadOptionsError(opts, _text2.default.levelConflict(lvlName));
        }

        (0, _defineProperty2.default)(_this, lvlName, {
          enumerable: true,
          writable: false,
          value: function value() {
            this.log.apply(this, [lvlName].concat(Array.prototype.slice.call(arguments)));
          }
        });
      };

      for (var _iterator = (0, _getIterator3.default)(_this.levels), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        _loop();
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }

    _this.debugEnabled = opts.debug === undefined ? defaults.debug : opts.debug;
    _this.json = opts.json;
    _this.flatten = opts.flatten;
    _this.flattenArrays = 'flattenArrays' in opts ? opts.flattenArrays : opts.flatten;
    _this.console = opts.console;
    _this.withLevel = 'withLevel' in opts ? opts.withLevel : true;
    _this.withStack = opts.withStack;
    _this.withHostname = opts.withHostname || false;
    _this.timestamp = opts.timestamp || false;

    _this.bufferSize = opts.bufferSize || defaults.bufferSize;
    _this.minLevel = opts.minLevel;
    _this.replacer = opts.replacer;
    _this.token = opts.token;
    _this.endpoint = 'https://webhook.logentries.com/noformat/logs/' + _this.token;

    _this.writer = opts.writer;

    if (!_this.debugEnabled) {
      _this.debugLogger = {
        log: function log() {}
      };
    } else {
      _this.debugLogger = opts.debugLogger && opts.debugLogger.log ? opts.debugLogger : defaults.debugLogger;
    }

    _this.ringBuffer = new _ringbuffer2.default(_this.bufferSize);

    _this.ringBuffer.on('buffer shift', function () {
      _this.debugLogger.log('Buffer is full, will be shifting records until buffer is drained.');
    });

    _this.on(bufferDrainEvent, function () {
      _this.debugLogger.log('RingBuffer drained.');
      _this.drained = true;
    });
    return _this;
  }

  (0, _createClass3.default)(Logger, [{
    key: '_write',
    value: function _write(ch, enc, cb) {
      var _this2 = this;

      this.drained = false;
      try {
        var record = this.ringBuffer.read();
        if (record) {
          var promise = this.writer(this.endpoint, record);
          if (this.ringBuffer.isEmpty()) {
            promise = promise.then(function () {
              process.nextTick(function () {
                _this2.emit(bufferDrainEvent);

                _this2.emit('connection drain');
              });
            });
          }
          promise.catch(function (err) {
            _this2.emit(errorEvent, err);
            _this2.debugLogger.log('Error: ' + err);
          }).then(function () {
            return cb();
          });
        } else {
          this.debugLogger.log('This should not happen. Read from ringBuffer returned null.');
          cb();
        }
      } catch (err) {
        this.emit(errorEvent, err);
        this.debugLogger.log('Error: ' + err);
        cb();
      }
    }
  }, {
    key: 'setDefaultEncoding',
    value: function setDefaultEncoding() {}
  }, {
    key: 'log',
    value: function log(lvl, _log) {
      var modifiedLevel = lvl;
      var modifiedLog = _log;

      if (modifiedLog === undefined) {
        modifiedLog = modifiedLevel;
        modifiedLevel = null;
      }

      var lvlName = void 0;

      if (modifiedLevel || modifiedLevel === 0) {
        var _toLevel = this.toLevel(modifiedLevel);

        var _toLevel2 = (0, _slicedToArray3.default)(_toLevel, 2);

        modifiedLevel = _toLevel2[0];
        lvlName = _toLevel2[1];

        if (!modifiedLevel && modifiedLevel !== 0) {
          this.emit(errorEvent, new _error.LogentriesError(_text2.default.unknownLevel(modifiedLevel)));
          return;
        }

        if (modifiedLevel < this.minLevel) {
          return;
        }
      }

      if (_lodash2.default.isArray(modifiedLog)) {
        if (modifiedLog.length) {
          var _iteratorNormalCompletion2 = true;
          var _didIteratorError2 = false;
          var _iteratorError2 = undefined;

          try {
            for (var _iterator2 = (0, _getIterator3.default)(modifiedLog), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
              var $modifiedLog = _step2.value;
              this.log(modifiedLevel, $modifiedLog);
            }
          } catch (err) {
            _didIteratorError2 = true;
            _iteratorError2 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion2 && _iterator2.return) {
                _iterator2.return();
              }
            } finally {
              if (_didIteratorError2) {
                throw _iteratorError2;
              }
            }
          }
        } else {
          this.emit(errorEvent, new _error.LogentriesError(_text2.default.noLogMessage()));
        }
        return;
      }

      if (_lodash2.default.isObject(modifiedLog)) {
        var safeTime = void 0;
        var safeLevel = void 0;
        var safeHost = void 0;

        if (this.timestamp) {
          safeTime = getSafeProp(modifiedLog, 'time');
          modifiedLog[safeTime] = new Date();
        }

        if (this.withLevel && lvlName) {
          safeLevel = getSafeProp(modifiedLog, 'level');
          modifiedLog[safeLevel] = lvlName;
        }

        if (this.withHostname) {
          safeHost = getSafeProp(modifiedLog, 'host');
          modifiedLog[safeHost] = _os2.default.hostname();
        }

        modifiedLog = this._serialize(modifiedLog);

        if (!modifiedLog) {
          this.emit(errorEvent, new _error.LogentriesError(_text2.default.serializedEmpty()));
          return;
        }

        if (this.console) {
          console[getConsoleMethod(modifiedLevel)](JSON.parse(modifiedLog));
        }

        if (safeTime) delete modifiedLog[safeTime];
        if (safeLevel) delete modifiedLog[safeLevel];
        if (safeHost) delete modifiedLog[safeHost];
      } else {
        if (_lodash2.default.isEmpty(modifiedLog)) {
          this.emit(errorEvent, new _error.LogentriesError(_text2.default.noLogMessage()));
          return;
        }

        modifiedLog = [modifiedLog.toString()];

        if (this.withLevel && lvlName) {
          modifiedLog.unshift(lvlName);
        }

        if (this.withHostname) {
          modifiedLog.unshift(_os2.default.hostname());
        }

        if (this.timestamp) {
          modifiedLog.unshift(new Date().toISOString());
        }

        modifiedLog = modifiedLog.join(' ');

        if (this.console) {
          console[getConsoleMethod(modifiedLevel)](modifiedLog);
        }
      }

      this.emit(logEvent, modifiedLog);

      if (this.ringBuffer.write(Buffer.from(modifiedLog.toString()))) {
        this.write();
      }
    }
  }, {
    key: 'toLevel',
    value: function toLevel(val) {
      var num = void 0;

      if (levelUtil.isNumberValid(val)) {
        num = parseInt(val, 10);
      } else {
        num = this.levels.indexOf(val);
      }

      var name = this.levels[num];

      return name ? [num, name] : [];
    }
  }, {
    key: 'level',
    value: function level(name) {
      console.warn(_text2.default.deprecatedLevelMethod());
      if (~this.levels.indexOf(name)) this.minLevel = name;
    }
  }, {
    key: 'debugEnabled',
    get: function get() {
      return this._debugEnabled;
    },
    set: function set(val) {
      this._debugEnabled = !!val;
    }
  }, {
    key: 'debugLogger',
    get: function get() {
      return this._debugLogger;
    },
    set: function set(func) {
      this._debugLogger = func;
    }
  }, {
    key: 'ringBuffer',
    get: function get() {
      return this._ringBuffer;
    },
    set: function set(obj) {
      this._ringBuffer = obj;
    }
  }, {
    key: 'token',
    get: function get() {
      return this._token;
    },
    set: function set(val) {
      this._token = val;
    }
  }, {
    key: 'bufferSize',
    get: function get() {
      return this._bufferSize;
    },
    set: function set(val) {
      this._bufferSize = val;
    }
  }, {
    key: 'console',
    get: function get() {
      return this._console;
    },
    set: function set(val) {
      this._console = !!val;
    }
  }, {
    key: 'serialize',
    get: function get() {
      return this._serialize;
    },
    set: function set(func) {
      this._serialize = func;
    }
  }, {
    key: 'flatten',
    get: function get() {
      return this._flatten;
    },
    set: function set(val) {
      this._flatten = !!val;
      this.serialize = (0, _serialize2.default)(this);
    }
  }, {
    key: 'flattenArrays',
    get: function get() {
      return this._flattenArrays;
    },
    set: function set(val) {
      this._flattenArrays = !!val;
      this.serialize = (0, _serialize2.default)(this);
    }
  }, {
    key: 'json',
    get: function get() {
      return this._json;
    },
    set: function set(val) {
      this._json = val;
    }
  }, {
    key: 'minLevel',
    get: function get() {
      return this._minLevel;
    },
    set: function set(val) {
      var _toLevel3 = this.toLevel(val),
          _toLevel4 = (0, _slicedToArray3.default)(_toLevel3, 1),
          num = _toLevel4[0];

      this._minLevel = _lodash2.default.isNumber(num) ? num : 0;
    }
  }, {
    key: 'replacer',
    get: function get() {
      return this._replacer;
    },
    set: function set(val) {
      this._replacer = _lodash2.default.isFunction(val) ? val : undefined;
      this.serialize = (0, _serialize2.default)(this);
    }
  }, {
    key: 'timestamp',
    get: function get() {
      return this._timestamp;
    },
    set: function set(val) {
      this._timestamp = !!val;
    }
  }, {
    key: 'withHostname',
    get: function get() {
      return this._withHostname;
    },
    set: function set(val) {
      this._withHostname = val;
    }
  }, {
    key: 'withLevel',
    get: function get() {
      return this._withLevel;
    },
    set: function set(val) {
      this._withLevel = !!val;
    }
  }, {
    key: 'withStack',
    get: function get() {
      return this._withStack;
    },
    set: function set(val) {
      this._withStack = !!val;
      this.serialize = (0, _serialize2.default)(this);
    }
  }, {
    key: 'levels',
    get: function get() {
      return this._levels && this._levels.slice();
    },
    set: function set(val) {
      this._levels = val;
    }
  }], [{
    key: 'winston',
    value: function winston() {
      console.warn(_text2.default.deprecatedWinstonMethod());
    }
  }, {
    key: 'provisionWinston',
    value: function provisionWinston(winston) {
      if (winston.transports.Logentries) return;

      var Transport = winston.Transport;

      var LogentriesTransport = function (_Transport) {
        (0, _inherits3.default)(LogentriesTransport, _Transport);

        function LogentriesTransport(opts) {
          (0, _classCallCheck3.default)(this, LogentriesTransport);

          var _this3 = (0, _possibleConstructorReturn3.default)(this, (LogentriesTransport.__proto__ || (0, _getPrototypeOf2.default)(LogentriesTransport)).call(this, opts));

          _this3.json = opts.json;
          _this3.name = 'logentries';

          var transportOpts = _lodash2.default.clone(opts || {});

          transportOpts.minLevel = transportOpts.minLevel || transportOpts.level || _this3.tempLevel || 0;

          transportOpts.levels = transportOpts.levels || winston.levels;
          if (_semver2.default.satisfies(winston.version, '>=2.0.0')) {
            var levels = transportOpts.levels;
            var values = _lodash2.default.values(levels).reverse();
            transportOpts.levels = {};
            _lodash2.default.keys(levels).forEach(function (k, i) {
              transportOpts.levels[k] = values[i];
            });
          }

          _this3.tempLevel = null;
          _this3.logger = new Logger(transportOpts);
          _this3.logger.on('error', function (err) {
            return _this3.emit(err);
          });
          return _this3;
        }

        (0, _createClass3.default)(LogentriesTransport, [{
          key: 'log',
          value: function log(lvl, msg, meta, cb) {
            if (this.json) {
              var message = {
                message: msg
              };
              if (!_lodash2.default.isEmpty(meta)) {
                if (_lodash2.default.isObject(meta)) {
                  _lodash2.default.defaults(message, meta);
                } else {
                  message.meta = meta;
                }
              }

              this.logger.log(lvl, message);
            } else {
              var _message = msg;
              if (!_lodash2.default.isEmpty(meta) || _lodash2.default.isError(meta)) {
                if (_lodash2.default.isString(_message)) {
                  _message += ' ' + this.logger.serialize(meta);
                } else if (_lodash2.default.isObject(_message)) {
                  _message[getSafeProp(_message, 'meta')] = meta;
                }
              }

              this.logger.log(lvl, _message);
            }

            (0, _setImmediate3.default)(cb.bind(null, null, true));
          }
        }, {
          key: 'tempLevel',
          get: function get() {
            return this._tempLevel;
          },
          set: function set(val) {
            this._tempLevel = val;
          }
        }, {
          key: 'logger',
          get: function get() {
            return this._logger;
          },
          set: function set(obj) {
            this._logger = obj;
          }
        }, {
          key: 'level',
          get: function get() {
            var _logger$toLevel = this.logger.toLevel(this.logger.minLevel),
                _logger$toLevel2 = (0, _slicedToArray3.default)(_logger$toLevel, 2),
                lvlName = _logger$toLevel2[1];

            return lvlName;
          },
          set: function set(val) {
            if (!this.logger) {
              this.tempLevel = val;
            } else {
              this.logger.minLevel = val;
            }
          }
        }, {
          key: 'levels',
          get: function get() {
            return this.logger.levels.reduce(function (acc, lvlName, lvlNum) {
              var newAcc = acc;
              newAcc[lvlName] = lvlNum;
              return newAcc;
            }, {});
          }
        }]);
        return LogentriesTransport;
      }(Transport);

      winston.transports.Logentries = LogentriesTransport;
    }
  }, {
    key: 'bunyanStream',
    value: function bunyanStream(opts) {
      var stream = new _bunyanstream2.default(opts);

      var _stream$logger$toLeve = stream.logger.toLevel(stream.logger.minLevel),
          _stream$logger$toLeve2 = (0, _slicedToArray3.default)(_stream$logger$toLeve, 2),
          level = _stream$logger$toLeve2[1];

      var type = 'raw';
      var name = 'logentries';

      stream.logger.minLevel = 0;

      return { level: level, name: name, stream: stream, type: type };
    }
  }]);
  return Logger;
}(_stream.Writable);

var winston = requirePeer('winston', { optional: true });

if (winston) Logger.provisionWinston(winston);

var winston1 = requirePeer('winston1', { optional: true });
var winston2 = requirePeer('winston2x', { optional: true });

if (winston1) Logger.provisionWinston(winston1);
if (winston2) Logger.provisionWinston(winston2);

exports.default = Logger;
exports.errorEvent = errorEvent;
exports.logEvent = logEvent;
exports.connectedEvent = connectedEvent;
exports.disconnectedEvent = disconnectedEvent;
exports.timeoutEvent = timeoutEvent;
exports.drainWritableEvent = drainWritableEvent;
exports.finishWritableEvent = finishWritableEvent;
exports.pipeWritableEvent = pipeWritableEvent;
exports.unpipeWritableEvent = unpipeWritableEvent;
exports.bufferDrainEvent = bufferDrainEvent;
module.exports = exports['default'];
//# sourceMappingURL=logger.js.map
