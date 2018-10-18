/*
  Logentries client that supports POSTing to an HTTP endpoint. The `write`
  method has been modified to use a client-provided low-level `writer` function
  to send HTTP requests (`writer` in the opts object). It must take these
  arguments:
    - the HTTP endpoint to which to log
    - the HTTP request body (as a UTF-8-encoded Buffer)
  It must write the request to the endpoint with 'Content-Type' of
 'application/json', and resolve on response status 204, or reject.

 This is forked from mainline le_node. The essential modifications are in the
 `write` method, with minor modifications elsewhere, and the wholesale removal
 of functionality used to maintain the health of the (former) TCP socket.

 This is implemented as it's own package rather than trying to refactor the
 original `Logger` to serve both purposes to ease the integration of upstream
 updates. If you want to log to a socket, use mainline `le_node`.
*/
import _ from 'lodash';
import semver from 'semver';
import os from 'os';
import { Writable } from 'stream';
import codependency from 'codependency';
import * as defaults from './defaults';
import * as levelUtil from './levels';
import text from './text';
import build from './serialize';
import {
    BadOptionsError,
    LogentriesError
} from './error';
import RingBuffer from './ringbuffer';
import BunyanStream from './bunyanstream';

// patterns
const tokenPattern = /[a-f\d]{8}-([a-f\d]{4}-){3}[a-f\d]{12}/;

// exposed Logger events
const errorEvent = 'error';
const logEvent = 'log';
const connectedEvent = 'connected';
const disconnectedEvent = 'disconnected';
const timeoutEvent = 'timed out';
const drainWritableEvent = 'drain';
const finishWritableEvent = 'finish';
const pipeWritableEvent = 'pipe';
const unpipeWritableEvent = 'unpipe';
const bufferDrainEvent = 'buffer drain';

/**
 * Get console method corresponds to lvl
 *
 * @param lvl
 * @returns {*}
 */
const getConsoleMethod = lvl => {
  if (lvl > 3) {
    return 'error';
  } else if (lvl === 3) {
    return 'warn';
  }
  return 'log';
};

/**
 * Get a new prop name that does not exist in the log.
 *
 * @param log
 * @param prop
 * @returns safeProp
 */
const getSafeProp = (log, prop) => {
  let safeProp = prop;
  while (safeProp in log) {
    safeProp = `_${safeProp}`;
  }
  return safeProp;
};

const requirePeer = codependency.register(module);

/**
 * Logger class that handles parsing of logs and sending logs to Logentries.
 */
class Logger extends Writable {
  constructor(opts) {
    super({
      objectMode: true
    });

    // Sanity checks
    if (_.isUndefined(opts)) {
      throw new BadOptionsError(opts, text.noOptions());
    }

    if (!_.isObject(opts)) {
      throw new BadOptionsError(opts, text.optionsNotObj(typeof opts));
    }

    if (_.isUndefined(opts.token)) {
      throw new BadOptionsError(opts, text.noToken());
    }

    if (!_.isString(opts.token) || !tokenPattern.test(opts.token)) {
      throw new BadOptionsError(opts, text.invalidToken(opts.token));
    }

    if (_.isUndefined(opts.writer)) {
      throw new BadOptionsError(opts, text.noWriter());
    }

    if (!_.isFunction(opts.writer)) {
      throw new BadOptionsError(opts, text.invalidWriter(opts.writer));
    }

    // Log method aliases
    this.levels = levelUtil.normalize(opts);

    for (const lvlName of this.levels) {
      if (lvlName in this) {
        throw new BadOptionsError(opts, text.levelConflict(lvlName));
      }

      Object.defineProperty(this, lvlName, {
        enumerable: true,
        writable: false,
        value() {
          this.log.apply(this, [lvlName, ...arguments]);
        }
      });
    }

    // boolean options
    this.debugEnabled = opts.debug === undefined ? defaults.debug : opts.debug;
    this.json = opts.json;
    this.flatten = opts.flatten;
    this.flattenArrays = 'flattenArrays' in opts ? opts.flattenArrays : opts.flatten;
    this.console = opts.console;
    this.withLevel = 'withLevel' in opts ? opts.withLevel : true;
    this.withStack = opts.withStack;
    this.withHostname = opts.withHostname || false;
    this.timestamp = opts.timestamp || false;

    // string or numeric options
    this.bufferSize = opts.bufferSize || defaults.bufferSize;
    this.minLevel = opts.minLevel;
    this.replacer = opts.replacer;
    this.token = opts.token;
    this.endpoint = `https://webhook.logentries.com/noformat/logs/${this.token}`;

    // low-level writer function
    this.writer = opts.writer;

    if (!this.debugEnabled) {
      // if there is no debug set, empty logger should be used
      this.debugLogger = {
        log: () => {
        }
      };
    } else {
      this.debugLogger =
          (opts.debugLogger && opts.debugLogger.log) ? opts.debugLogger : defaults.debugLogger;
    }

    this.ringBuffer = new RingBuffer(this.bufferSize);

    // RingBuffer emits buffer shift event, meaning we are discarding some data!
    this.ringBuffer.on('buffer shift', () => {
      this.debugLogger.log('Buffer is full, will be shifting records until buffer is drained.');
    });

    this.on(bufferDrainEvent, () => {
      this.debugLogger.log('RingBuffer drained.');
      this.drained = true;
    });
  }

  /**
   * Override Writable _write method.
   * Write POST one log record to the endpoint.
   */
  _write(ch, enc, cb) {
    this.drained = false;
    try {
      const record = this.ringBuffer.read();
      if (record) {
        let promise = this.writer(this.endpoint, record);
        if (this.ringBuffer.isEmpty()) {
          // we are checking the buffer state here just after POSTing
          // to make sure the last event is sent.
          promise = promise
            .then(() => {
              process.nextTick(() => {
                this.emit(bufferDrainEvent);
                // this event is DEPRECATED - will be removed in next major release.
                // new users should use 'buffer drain' event instead.
                this.emit('connection drain');
              });
            });
        }
        promise
          .catch(err => {
            this.emit(errorEvent, err);
            this.debugLogger.log(`Error: ${err}`);
          })
          .then(cb);
      } else {
        this.debugLogger.log('This should not happen. Read from ringBuffer returned null.');
        cb();
      }
    } catch (err) {
      this.emit(errorEvent, err);
      this.debugLogger.log(`Error: ${err}`);
      cb();
    }
  }

  setDefaultEncoding() { /* no. */
  }

  /**
   * Finalize the log and write() to Logger stream
   * @param lvl
   * @param log
   */
  log(lvl, log) {
    let modifiedLevel = lvl;
    let modifiedLog = log;
    // lvl is optional
    if (modifiedLog === undefined) {
      modifiedLog = modifiedLevel;
      modifiedLevel = null;
    }

    let lvlName;

    if (modifiedLevel || modifiedLevel === 0) {
      [modifiedLevel, lvlName] = this.toLevel(modifiedLevel);

      // If lvl is present, it must be recognized
      if (!modifiedLevel && modifiedLevel !== 0) {
        this.emit(errorEvent, new LogentriesError(text.unknownLevel(modifiedLevel)));
        return;
      }

      // If lvl is below minLevel, it is dismissed
      if (modifiedLevel < this.minLevel) {
        return;
      }
    }

    // If log is an array, it is treated as a collection of log events
    if (_.isArray(modifiedLog)) {
      if (modifiedLog.length) {
        for (const $modifiedLog of modifiedLog) this.log(modifiedLevel, $modifiedLog);
      } else {
        this.emit(errorEvent, new LogentriesError(text.noLogMessage()));
      }
      return;
    }

    // If log is an object, it is serialized to string and may be augmented
    // with timestamp and level. For strings, these may be prepended.
    if (_.isObject(modifiedLog)) {
      let safeTime;
      let safeLevel;
      let safeHost;

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
        modifiedLog[safeHost] = os.hostname();
      }

      modifiedLog = this._serialize(modifiedLog);

      if (!modifiedLog) {
        this.emit(errorEvent, new LogentriesError(text.serializedEmpty()));
        return;
      }

      if (this.console) {
        console[getConsoleMethod(modifiedLevel)](JSON.parse(modifiedLog));
      }

      if (safeTime) delete modifiedLog[safeTime];
      if (safeLevel) delete modifiedLog[safeLevel];
      if (safeHost) delete modifiedLog[safeHost];
    } else {
      if (_.isEmpty(modifiedLog)) {
        this.emit(errorEvent, new LogentriesError(text.noLogMessage()));
        return;
      }

      modifiedLog = [modifiedLog.toString()];

      if (this.withLevel && lvlName) {
        modifiedLog.unshift(lvlName);
      }

      if (this.withHostname) {
        modifiedLog.unshift(os.hostname());
      }

      if (this.timestamp) {
        modifiedLog.unshift((new Date()).toISOString());
      }

      modifiedLog = modifiedLog.join(' ');

      if (this.console) {
        console[getConsoleMethod(modifiedLevel)](modifiedLog);
      }
    }

    this.emit(logEvent, modifiedLog);

    // if RingBuffer.write returns false, don't create any other write request for
    // the writable stream to avoid memory leak this means there are already 'bufferSize'
    // of write events in the writable stream and that's what we want.
    if (this.ringBuffer.write(Buffer.from(modifiedLog.toString()))) {
      this.write();
    }
  }

  // Private methods
  toLevel(val) {
    let num;

    if (levelUtil.isNumberValid(val)) {
      num = parseInt(val, 10); // -0
    } else {
      num = this.levels.indexOf(val);
    }

    const name = this.levels[num];

    return name ? [num, name] : [];
  }

  get debugEnabled() {
    return this._debugEnabled;
  }

  set debugEnabled(val) {
    this._debugEnabled = !!val;
  }

  get debugLogger() {
    return this._debugLogger;
  }

  set debugLogger(func) {
    this._debugLogger = func;
  }

  get ringBuffer() {
    return this._ringBuffer;
  }

  set ringBuffer(obj) {
    this._ringBuffer = obj;
  }

  get token() {
    return this._token;
  }

  set token(val) {
    this._token = val;
  }

  get bufferSize() {
    return this._bufferSize;
  }

  set bufferSize(val) {
    this._bufferSize = val;
  }

  get console() {
    return this._console;
  }

  set console(val) {
    this._console = !!val;
  }

  get serialize() {
    return this._serialize;
  }

  set serialize(func) {
    this._serialize = func;
  }

  get flatten() {
    return this._flatten;
  }

  set flatten(val) {
    this._flatten = !!val;
    this.serialize = build(this);
  }

  get flattenArrays() {
    return this._flattenArrays;
  }

  set flattenArrays(val) {
    this._flattenArrays = !!val;
    this.serialize = build(this);
  }

  get json() {
    return this._json;
  }

  set json(val) {
    this._json = val;
  }

  get minLevel() {
    return this._minLevel;
  }

  set minLevel(val) {
    const [num] = this.toLevel(val);

    this._minLevel = _.isNumber(num) ? num : 0;
  }

  get replacer() {
    return this._replacer;
  }

  set replacer(val) {
    this._replacer = _.isFunction(val) ? val : undefined;
    this.serialize = build(this);
  }

  get timestamp() {
    return this._timestamp;
  }

  set timestamp(val) {
    this._timestamp = !!val;
  }

  get withHostname() {
    return this._withHostname;
  }

  set withHostname(val) {
    this._withHostname = val;
  }

  get withLevel() {
    return this._withLevel;
  }

  set withLevel(val) {
    this._withLevel = !!val;
  }

  get withStack() {
    return this._withStack;
  }

  set withStack(val) {
    this._withStack = !!val;
    this.serialize = build(this);
  }

  get levels() {
    return this._levels && this._levels.slice();
  }

  set levels(val) {
    this._levels = val;
  }

  // Deprecated (to support migrants from le_node)
  level(name) {
    console.warn(text.deprecatedLevelMethod());
    if (~this.levels.indexOf(name)) this.minLevel = name;
  }

  // static methods
  static winston() {
    console.warn(text.deprecatedWinstonMethod());
  }

  /**
   * Prepare the winston transport
   * @param winston
   */
  static provisionWinston(winston) {
    if (winston.transports.Logentries) return;

    const Transport = winston.Transport;

    class LogentriesTransport extends Transport {
      constructor(opts) {
        super(opts);
        this.json = opts.json;
        this.name = 'logentries';

        const transportOpts = _.clone(opts || {});

        transportOpts.minLevel =
            transportOpts.minLevel || transportOpts.level || this.tempLevel || 0;

        transportOpts.levels = transportOpts.levels || winston.levels;
        if (semver.satisfies(winston.version, '>=2.0.0')) {
          // Winston and Logengries levels are reversed
          // ('error' level is 0 for Winston and 5 for Logentries)
          // If the user provides custom levels we assue they are
          // using winston standard
          const levels = transportOpts.levels;
          const values = _.values(levels).reverse();
          transportOpts.levels = {};
          _.keys(levels).forEach((k, i) => {
            transportOpts.levels[k] = values[i];
          });
        }

        this.tempLevel = null;
        this.logger = new Logger(transportOpts);
        this.logger.on('error', err => this.emit(err));
      }

      log(lvl, msg, meta, cb) {
        if (this.json) {
          const message = {
            message: msg
          };
          if (!_.isEmpty(meta)) {
            if (_.isObject(meta)) {
              _.defaults(message, meta);
            } else {
              message.meta = meta;
            }
          }

          this.logger.log(lvl, message);
        } else {
          let message = msg;
          if (!_.isEmpty(meta) || _.isError(meta)) {
            if (_.isString(message)) {
              message += ` ${this.logger.serialize(meta)}`;
            } else if (_.isObject(message)) {
              message[getSafeProp(message, 'meta')] = meta;
            }
          }

          this.logger.log(lvl, message);
        }

        setImmediate(cb.bind(null, null, true));
      }

      get tempLevel() {
        return this._tempLevel;
      }

      set tempLevel(val) {
        this._tempLevel = val;
      }

      get logger() {
        return this._logger;
      }

      set logger(obj) {
        this._logger = obj;
      }

      get level() {
        const [, lvlName] =
            this.logger.toLevel(this.logger.minLevel);
        return lvlName;
      }

      set level(val) {
        if (!this.logger) {
          this.tempLevel = val;
        } else {
          this.logger.minLevel = val;
        }
      }

      get levels() {
        return this.logger.levels.reduce((acc, lvlName, lvlNum) => {
          const newAcc = acc;
          newAcc[lvlName] = lvlNum;
          return newAcc;
        }, {});
      }
    }

    /* eslint no-param-reassign: ["error", { "props": false }] */
    winston.transports.Logentries = LogentriesTransport;
  }

  /**
   * Prepare a BunyanStream.
   * @param opts
   * @returns {{level: *, name: string, stream: BunyanStream, type: string}}
   */
  static bunyanStream(opts) {
    const stream = new BunyanStream(opts);
    const [, level] = stream.logger.toLevel(stream.logger.minLevel);
    const type = 'raw';
    const name = 'logentries';

    // Defer to Bunyan’s handling of minLevel
    stream.logger.minLevel = 0;

    return { level, name, stream, type };
  }
}

// provision winston
const winston = requirePeer('winston', { optional: true });

if (winston) Logger.provisionWinston(winston);

// Provision too the winston static versions for testing/development purposes
const winston1 = requirePeer('winston1', { optional: true });
const winston2 = requirePeer('winston2x', { optional: true });

if (winston1) Logger.provisionWinston(winston1);
if (winston2) Logger.provisionWinston(winston2);

export {
    Logger as default,
    errorEvent,
    logEvent,
    connectedEvent,
    disconnectedEvent,
    timeoutEvent,
    drainWritableEvent,
    finishWritableEvent,
    pipeWritableEvent,
    unpipeWritableEvent,
    bufferDrainEvent
};
