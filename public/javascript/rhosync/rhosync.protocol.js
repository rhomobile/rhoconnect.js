(function($) {

    var api = RhoSync.api;

    function _setCookie(name, value, days, path, domain, secure) {
        if (days) {
            var expDate = new Date();
            expDate.setTime(expDate.getTime() + (days * 24 * 60 * 60 * 1000));
        }
        document.cookie = name + "=" + encodeURIComponent( value ) +
            ((days) ? "; expires=" + expDate.toGMTString() : "") +
            ((path) ? "; path=" + path : "") +
            ((domain) ? "; domain=" + domain : "") +
            ((secure) ? "; secure" : "");
    }

    function _getCookie(name) {
        var cookies = document.cookie.split(';');
        for (var i = 0; i < cookies.length; i++) {
            var cookie = cookies[i].split('=');
            var cName = cookie[0].replace(/^\s+|\s+$/g, ''); // trim side spaces
            if (cName == name) {
                return (1 < cookie.length) ? cookie[1].replace(/^\s+|\s+$/g, '') : ''; // trim side spaces
            }
        }
        return null;
    }

    function _deleteCookie(name, path, domain) {
        if (_getCookie(name)) {
            document.cookie = name + "=" +
                ((path) ? "; path=" + path : "") +
                ((domain) ? "; domain=" + domain : "") +
                "; expires=Thu, 01-Jan-1970 00:00:01 GMT";
        }
    }

    function _net_call(url, data, method /*='post'*/, contentType /*='application/json'*/) {
        return $.Deferred(function(dfr){
            $.ajax({
                url: url,
                type: method || 'post',
                contentType: contentType || 'application/json',
                processData: false,
                 data: $.toJSON(data),
                dataType: 'json'
            }).done(function(data, status, xhr){
                api.internal.notify(api.events.GENERIC_NOTIFICATION, status, data, xhr);
                dfr.resolve(status, data, xhr);
            }).fail(function(xhr, status, error){
                api.internal.notify(api.events.GENERIC_NOTIFICATION, status, error, xhr);
                dfr.reject(status, error, xhr);
            });
        }).promise();
    }

    function login(login, password) {
        return _net_call(api.config.syncServer+'/clientlogin', {login:login, password:password, rememberme: 1});
    }

    /*
    function isLoggedIn() {
        return _getCookie(SESSION_COOKIE) ? true : false;
    }

    function logout() {
        _deleteCookie(SESSION_COOKIE);
    }
    */

    var clientCreate = function() {
        var dfr = $.Deferred();
        return _net_call(api.config.syncServer+'/clientcreate', "", "get", "text/plain");
    };

    api.protocol = {
        login: login,
        clientCreate: clientCreate
    };

})(jQuery);


