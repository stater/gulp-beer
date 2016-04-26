'use strict';

// Global Modules
require('cb-jsfix');
require('cb-loggy');
require('jsmicro-typeof');

const cwd = process.cwd();

// Scoped Modules
const path = require('path'),
      gulp = require('gulp'),
      glob = require('glob');

// Loading gulp plugins.
const pluginLoader = require('gulp-load-plugins');

// Creating logger.
const logger = new Loggy({ signs : true, print : process.argv.indexOf('--verbose') > -1 ? true : false });
const color  = logger.color;

// Creating Constructor.
class GulpTea {
    constructor ( config ) {
        // Set the environment path.
        this.env_prop = 'GULP_ENV';
        this.cwd      = cwd;

        // Creating configs, tasks, and task initializers holder.
        this.configs = {};
        this.plugins = {};
        this.tasks   = {};
        this.inits   = {};

        this.logger = logger;
        this.color  = color;
        this.gulp   = gulp;

        // Apply initial configs.
        this.configure(config);
    }

    /**
     * Configuration Setter.
     *
     * @param {string,object} config - String configuration file path, or configuration object.
     * @returns {GulpTea}
     */
    configure ( config ) {
        let self = this,
            conf = this.configs;

        // Find the config files if the given config is a string.
        if ( isString(config) ) {
            glob.sync(config).forEach(taskPath => {
                logger.info(`Importing configuration: ${color.magenta(taskPath)}...`);

                try {
                    // Load the config files.
                    let loader = require(path.join(cwd, taskPath));

                    // Call the factory if the load returning a function.
                    if ( isFunction(loader) ) {
                        let configs = loader.call(self, self);

                        if ( isObject(configs) ) {
                            configs.$each(( name, cfg ) => {
                                logger.log(` -  Registering configuration: ${color.yellow(name)}`);

                                conf[ name ] = cfg;
                            });
                        }
                    }
                    // Apply the configs if the
                    else if ( isObject(loader) ) {
                        loader.$each(( name, cfg ) => {
                            logger.log(` -  Registering configuration: ${color.yellow(name)}`);

                            conf[ name ] = cfg;
                        });
                    }
                }
                catch ( error ) {
                    logger.error(error);
                }

                logger.success(`Configuration ${color.magenta(taskPath)} successfully imported.\r\n`);
            });
        }
        // Apply the configs if the given config is an object.
        else if ( isObject(config) ) {
            config.$each(( key, value ) => {
                conf[ key ] = value;

                logger.success(`Configuration ${color.magenta(key)} successfully imported.\r\n`);
            });
        }

        return this;
    }

    /**
     * Task Importer
     * @param {string,object} tasks - String task files (glob), or object contains tasks.
     * @returns {GulpTea}
     */
    load ( tasks ) {
        let self = this,
            conf = this.configs;

        if ( isString(tasks) ) {
            glob.sync(tasks).forEach(taskPath => {
                logger.info(`Importing task: ${color.magenta(taskPath)}...`);

                try {
                    let taskList = require(path.join(cwd, taskPath));

                    if ( isObject(taskList) ) {
                        importTasks(taskList, taskPath);
                    }
                }
                catch ( error ) {
                    logger.error(error);
                }

                logger.success(`Task ${color.magenta(taskPath)} successfully imported.\r\n`);
            });
        }
        else if ( isObject(tasks) ) {
            logger.info(`Importing task...`);

            importTasks(tasks);

            logger.success(`Task successfully imported.\r\n`);
        }

        function importTasks ( taskList, taskPath ) {
            taskList.$each(( name, task ) => {
                if ( name === 'init' ) {
                    logger.log(` -  Registering Initializer: ${color.yellow(task.name || taskPath)}`);

                    self.inits[ task.name || taskPath ] = task;
                }
                else {
                    if ( 'function' === typeOf(task) ) {
                        logger.log(` -  Registering Shared Task: ${color.yellow(name)}`);

                        self.tasks[ name ] = task;
                    }
                    else {
                        logger.log(` -  Registering configuration: ${color.yellow(name)}`);

                        conf[ name ] = task;
                    }
                }

            });
        }

        // Parse the source files
        Object.keys(conf)
            .forEach(name => {
                let config = conf[ name ];

                Object.keys(config).forEach(group => {
                    let cfg = config[ group ];

                    if ( 'object' === typeOf(cfg) && cfg.src ) {
                        logger.info(`Getting the source files of: ${color.magenta(`${name}:${group}`)}`);

                        self.parseSources(cfg);

                        logger.success(`Source files of ${color.magenta(`${name}:${group}`)} successfully collected.\r\n`);
                    }
                });
            });

        return this;
    }

    /**
     * Gulp Plugin Loader (gulp-load-plugins)
     *
     * @param {object} [options] - Plugin loader options.
     * @returns {GulpTea}
     */
    loadPlugins ( options ) {
        let plugins = pluginLoader(options);

        if ( isObject(plugins) ) {
            logger.info('Registering plugins...');

            plugins.$each(( name, plugin ) => {
                logger.log(` -  Plugin ${color.magenta(name)} registerd.`);

                this.plugins[ name ] = plugin;
            });

            logger.success('Registering plugins completed.\r\n');
        }

        return this;
    }

    /**
     * Task Initializer
     *
     * @param {string,array} [tasks] - Task to be initialized.
     * @returns {GulpTea}
     */
    init ( tasks ) {
        if ( isString(tasks) ) {
            let task = this.inits[ tasks ];

            if ( isFunction(task) ) {
                task.call(this, this);

                logger.log(` -  Task initializer ${color.magenta(tasks)} initialized.`);
            }
        }
        else if ( isArray(tasks) ) {
            logger.info('Initializing tasks...');

            tasks.$each(name => {
                this.init(name);
            });

            logger.success(`Tasks initialized.\r\n`);
        }
        else {
            logger.info('Initializing tasks...');

            this.inits.$each(name => {
                this.init(name);
            });

            logger.success(`Tasks initialized.\r\n`);
        }

        return this;
    }

    // Source files getter.
    parseSources ( source, done ) {
        let self = this;

        let src = source.src,
            des = source.des;

        if ( 'array' === typeOf(src) ) {
            source.files = [];

            src.forEach(srcPattern => {
                self.getSourceFiles(srcPattern).forEach(filePath => {
                    source.files.push(filePath);
                });
            });
        }

        if ( 'string' === typeOf(des) ) {
            source.des = self.parseDestinations(des);
        }

        if ( 'function' === typeOf(source.des.map) ) {
            let map = self.runTask(source.des.map, [ source ]);

            if ( map && 'function' === typeof map.then ) {
                map.then(result => {
                    if ( 'function' === typeof done ) {
                        done(result);
                    }
                });
            }
            else {
                if ( 'function' === typeof done ) {
                    done(map);
                }
            }
        }

        return this;
    }

    // File Getters.
    getSourceFiles ( pattern ) {
        let self = this,
            conf = this.configs;

        let files = [];

        if ( /^\#/.test(pattern) ) {
            let filter = pattern.replace('#', '').split(':');
            let reader = self.plugins[ filter[ 0 ] ];

            if ( reader ) {
                files = reader().map(filePath => {
                    return filePath.replace(cwd, '').replace(/^\//, '');
                });

                if ( filter[ 1 ] ) {
                    let regexp = new RegExp(`\\.${filter[ 1 ]}$`);

                    files = files.filter(filePath => {
                        return regexp.test(filePath);
                    });
                }
            }
        }
        else if ( /^\@/.test(pattern) ) {
            let filter = pattern.replace('@', '').split(':');
            let reader = self.tasks[ filter[ 0 ] ];

            if ( reader ) {
                files = self.runTask(reader).map(filePath => {
                    return filePath.replace(cwd, '').replace(/^\//, '');
                });

                if ( filter[ 1 ] ) {
                    let regexp = new RegExp(`\\.${filter[ 1 ]}$`);

                    files = files.filter(filePath => {
                        return regexp.test(filePath);
                    });
                }
            }
        }
        else if ( /^\!/.test(pattern) ) {
            files = glob.sync(pattern);
        }
        else {
            files = glob.sync(path.join(conf.paths.src, pattern));
        }

        logger.log(` -  Collected ${color.red(files.length)} files from ${color.yellow(pattern)}`);

        return files;
    }

    // Get destination file and mapper.
    parseDestinations ( pattern ) {
        let self = this,
            conf = this.configs;

        if ( /@/.test(pattern) ) {
            let split = pattern.split('@');

            let out = path.join(conf.paths.des, split[ 0 ].replace('$VERSION$', new Date().getTime()));
            let map = self.tasks[ split[ 1 ] ];

            return { out, map }
        }
        else {
            return pattern;
        }
    }

    /**
     * Environment Based Configurator
     *
     * @param {object} options - Object to create configuration from.
     * @returns {*}
     */
    byenv ( options ) {
        let conf = this.configs;

        // Initialize environment if not initialized.
        if ( !conf.environment ) {
            conf.environment = process.env[ this.env_prop ] || 'development';
        }

        // Return the configuration object based on environment name from the given options.
        if ( isObject(options) ) {
            return options[ conf.environment ] || {};
        }

        return {};
    }

    /**
     * Task Runner
     * Apply GulpTea to tasks
     *
     * @param {func} task - Function to apply.
     * @param {array} [args] - Array arguments list.
     * @param {func} [callback] - Function callback for gulp task.
     * @returns {*}
     */
    runTask ( task, args, callback ) {
        if ( isString(task) ) {
            let handler = this.tasks[ task ];

            if ( isFunction(handler) ) {
                return this.runTask(handler, args);
            }
            else {
                return gulp.start(task, args, callback);
            }
        }
        else if ( isFunction(task) ) {
            return task.apply(this, args);
        }

        return this;
    }

    /**
     * Array Iterator.
     *
     * @param obj
     * @param fn
     * @returns {Promise}
     */
    iterate ( obj, fn ) {
        return new Promise(( resolve, reject ) => {
            if ( 'array' !== typeOf(obj) ) {
                reject(new Error('This iterator only can iterate an array.'));
            }

            // Create current position.
            let cursor = 0;

            // Proceed the iterator.
            next();

            // Next item caller.
            function next () {
                if ( cursor < obj.length ) {
                    // Get the current item.
                    let item = obj[ cursor ];

                    // Set the next item index.
                    cursor += 1;

                    // Call the iterator handler if the given handler is a function.
                    if ( 'function' === typeof fn ) {
                        fn(item, (cursor - 1), next, stop);
                    }
                }
                else {
                    // Resolve the promise when iteration complete.
                    resolve(obj);
                }
            }

            // Stop the iterator.
            function stop ( error ) {
                // Reject the promise if the iteration stopped.
                reject(error);
            }
        });
    }

    getEventTask ( pattern, event ) {
        let self = this;

        let taskEvent = {
            when : 'all',
            name : pattern,
            task : null,
            file : null
        }

        let eventMatched;

        if ( isString(pattern) ) {
            pattern = pattern.replace('%FILE%', event.path);

            let part = pattern.split(':');

            if ( part[ 1 ] ) {
                taskEvent.file = part[ 1 ];
            }

            let expectedEvent = part[ 0 ].match(/\{[a-zA-Z\d\|\s]+\}/g);

            if ( expectedEvent ) {
                taskEvent.when = expectedEvent[ 0 ].replace(/[\{\}\s]+/g, '').replace(/[\|]+/g, ', ');

                eventMatched = true;

                expectedEvent = expectedEvent[ 0 ].replace(/[\{\}\s]+/g, '').split('|');

                if ( expectedEvent.indexOf(event.type) > -1 ) {
                    eventMatched = 'match';
                }
            }

            let task = part[ 0 ].replace(/\{[a-zA-Z\d\|\s]+\}/g, '');

            taskEvent.name = task;

            taskEvent.task = self.tasks[ task ];

            if ( !isFunction(taskEvent.task) ) {
                taskEvent.task = function ( callback ) {
                    gulp.start(task, callback);
                }
            }

            if ( eventMatched && eventMatched !== 'match' ) {
                taskEvent.task = null;
            }
        }

        return taskEvent;
    }
}

module.exports = GulpTea;
