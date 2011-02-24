(function($) {
    RhoSync = function(cfg) {

        const SESSION_COOKIE = 'rhosync_session';
        const NOTIFY_GENERIC = 'rhoSyncNotifyGeneric';

        var defaults = {
			syncserver: "",
			pollinterval: 20
		};

		var config = $.extend({}, defaults, cfg);

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

        function _notifyHandler(status, data, xhr) {
            $(window).trigger(jQuery.Event(NOTIFY_GENERIC), [{status: status, data: data}]);
            // fire exact notifications here
        }

        function _net_call(url,data) {
            var dfr = $.Deferred();
		    $.ajax({
		    	url: url,
                type: 'post',
                contentType: 'application/json',
                processData: false,
		     	data: $.toJSON(data),
                dataType: 'json'
		    }).done(function(data, status, xhr){
                _notifyHandler(status, data, xhr);
                dfr.resolve(status, data, xhr);
            }).fail(function(xhr, status, error){
                _notifyHandler(status, error, xhr);
                dfr.reject(status, error, xhr);
            });
            return dfr.promise();
		}
			
        function login(login, password) {
            var dfr = $.Deferred();
            _net_call(config.syncserver+'/clientlogin', {login:login, password:password, rememberme: 1}
            ).done(function(status, data, xhr) {
                dfr.resolve(data, xhr.responseText);
            }).fail(function(status, error, xhr) {
                dfr.reject(error, xhr.responseText);
            });
            return dfr.promise();
        }
				
        function isLoggedIn() {
            return _getCookie(SESSION_COOKIE) ? true : false;
        }

        function logout() {
            _deleteCookie(SESSION_COOKIE);
        }

		return {
			api: {
                events: {
                    NOTIFY_GENERIC: NOTIFY_GENERIC
                },
                login: login,
                isLoggedIn: isLoggedIn,
                logout: logout
			},
			rhoconfig: config
		}
	}
})(jQuery);
