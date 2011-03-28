(function($) {

    function publicInterface() {
        return {
            Logger: Logger,
            errors: RhoSync.errors,
            deferredMapOn: deferredMapOn,
            passRejectTo: passRejectTo,
            notify: notify
        };
    }

    var rho = RhoSync.rho;

    function Logger(name) {

        var levels = {
            trace: 0,
            info: 1,
            warning: 2,
            error: 3,
            fatal: 4
        };

        var level = parseLogLevel(rho.config.logLevel);

        this.trace = function(message) {
            var l = levels.trace;
            if (level > l) return;
            withConsole(function(c){
                c.info(buildMsg(l, message))
            });
        };

        this.info = function(message) {
            var l = levels.info;
            if (level > l) return;
            withConsole(function(c){
                c.info(buildMsg(l, message))
            });
        };

        this.warning = function(message) {
            var l = levels.warning;
            if (level > l) return;
            withConsole(function(c){
                c.warn(buildMsg(l, message))
            });
        };

        this.error = function(message) {
            var l = levels.trace;
            if (level > l) return;
            withConsole(function(c){
                c.error(buildMsg(l, message))
            });
        };

        this.fatal = function(message) {
            var l = levels.trace;
            if (level > l) return;
            withConsole(function(c){
                c.error(buildMsg(l, message))
            });
        };

        function parseLogLevel(name) {
            var isValid = ("string" == typeof name && name.toLowerCase() in levels);
            return isValid ? levels[name.toLowerCase()] : levels.warning;
        }

        function withConsole(callback) {
          if (window.console) {
            callback(window.console)
          }
        }

        function buildMsg(severity, text) {
            var date = Date().replace(/\S+\s(.*?)\sGMT\+.*$/, '$1');
            return date +' [' +severity +'] ' +' (' +name +') ' +text;
        }
    }

    function notify(type /*, arg1, arg2, ... argN*/) {
        $(window).trigger(jQuery.Event(type), $.makeArray(arguments).slice(1));
        // fire exact notifications here
    }

    function passRejectTo(dfr, doReport) {
        return function() {
            if (doReport) {
                //TODO: some log output
            }
            dfr.reject(arguments);
        };
    }

    function deferredMapOn(obj) {
        var dfrMap = {}; // to resolve/reject each exact item
        var dfrs = []; // to watch on all of them

        $.each(obj, function(key, value){
            var dfr = new $.Deferred();
            dfrMap[key] = dfr;
            dfrs.push(dfr.promise());
        });

        return {
            resolve: function(name, args) {
                if (dfrMap[name]) dfrMap[name].resolve.apply(dfrMap[name], args);
            },
            reject: function(name, args) {
                if (dfrMap[name]) dfrMap[name].reject.apply(dfrMap[name], args);
            },
            when: function() {
                return $.when(dfrs);
            }
        };
    }

    $.extend(rho, publicInterface());

})(jQuery);
