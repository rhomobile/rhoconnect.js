(function($) {

    function publicInterface() {
        return {
            errors: RhoSync.errors,
            deferredMapOn: _deferredMapOn,
            passRejectTo: _passRejectTo,
            notify: _notify
        };
    }

    var rho = RhoSync.rho;

    function _notify(type /*, arg1, arg2, ... argN*/) {
        $(window).trigger(jQuery.Event(type), $.makeArray(arguments).slice(1));
        // fire exact notifications here
    }

    function _passRejectTo(dfr, doReport) {
        return function() {
            if (doReport) {
                //TODO: some log output
            }
            dfr.reject(arguments);
        };
    }

    function _deferredMapOn(obj) {
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
